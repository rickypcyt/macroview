import { GeoJSON } from "geojson";
import { APIError, handleAPIError, logError, withRetry } from "./errorHandler";

// Types
export type WorldBankCountry = { id: string; name: string };
export type PopulationData = {
  country: string;
  populationCounts: Array<{ year: string; value: string }>;
};

// Cache management
const gdpCache: Record<string, number> = {};
const countryISOCache: Record<string, string> = {};
let worldBankCountries: WorldBankCountry[] | null = null;

// Storage helpers
export const getGDPFromStorage = (countryName: string): number | null => {
  try {
    const val = localStorage.getItem(`gdpCache:${countryName}`);
    return val ? parseFloat(val) : null;
  } catch (error) {
    logError(error, 'getGDPFromStorage');
    return null;
  }
};

export const setGDPInStorage = (countryName: string, value: number): void => {
  try {
    localStorage.setItem(`gdpCache:${countryName}`, value.toString());
  } catch (error) {
    logError(error, 'setGDPInStorage');
  }
};

// Load World Bank countries list (cached)
const loadWorldBankCountries = async (): Promise<WorldBankCountry[]> => {
  if (worldBankCountries) {
    return worldBankCountries;
  }

  try {
    const response = await withRetry(async () => {
      const res = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=300');
      if (!res.ok) {
        throw new Response(res.statusText, { status: res.status });
      }
      return res;
    });

    const data = await response.json();
    
    if (!Array.isArray(data) || !Array.isArray(data[1])) {
      throw new APIError('Invalid World Bank countries response format', 'worldbank/countries');
    }

    worldBankCountries = data[1];
    return worldBankCountries;
  } catch (error) {
    const apiError = handleAPIError(error, 'worldbank/countries');
    logError(apiError, 'loadWorldBankCountries');
    throw apiError;
  }
};

// Find ISO2 code for a country
const findCountryISO2 = async (countryName: string): Promise<string | null> => {
  if (countryISOCache[countryName]) {
    return countryISOCache[countryName];
  }

  try {
    const countries = await loadWorldBankCountries();
    const found = countries.find(
      (c: WorldBankCountry) => 
        c.name && c.name.toLowerCase() === countryName.toLowerCase()
    );

    if (found?.id) {
      countryISOCache[countryName] = found.id;
      return found.id;
    }

    return null;
  } catch (error) {
    logError(error, `findCountryISO2:${countryName}`);
    return null;
  }
};

// Load GDP data for a specific country (lazy loading)
export const loadCountryGDP = async (countryName: string): Promise<number | null> => {
  if (!countryName || typeof countryName !== 'string') {
    return null;
  }

  // Check memory cache
  if (gdpCache[countryName]) {
    return gdpCache[countryName];
  }

  // Check localStorage
  const localGDP = getGDPFromStorage(countryName);
  if (localGDP) {
    gdpCache[countryName] = localGDP;
    return localGDP;
  }

  try {
    // Find ISO2 code
    const iso2 = await findCountryISO2(countryName);
    if (!iso2) {
      logError(`Country ISO2 not found for: ${countryName}`, 'loadCountryGDP');
      return null;
    }

    // Fetch GDP data
    const response = await withRetry(async () => {
      const res = await fetch(
        `https://api.worldbank.org/v2/country/${iso2}/indicator/NY.GDP.MKTP.CD?format=json&per_page=1`
      );
      if (!res.ok) {
        throw new Response(res.statusText, { status: res.status });
      }
      return res;
    });

    const gdpData = await response.json();
    
    if (
      Array.isArray(gdpData) && 
      Array.isArray(gdpData[1]) && 
      gdpData[1][0] && 
      typeof gdpData[1][0].value === 'number'
    ) {
      const gdp = gdpData[1][0].value;
      gdpCache[countryName] = gdp;
      setGDPInStorage(countryName, gdp);
      return gdp;
    }

    return null;
  } catch (error) {
    const apiError = handleAPIError(error, `worldbank/gdp/${countryName}`);
    logError(apiError, `loadCountryGDP:${countryName}`);
    return null;
  }
};

// Load all population data (this can remain as is since it's a single API call)
export const loadPopulationData = async (): Promise<Record<string, number>> => {
  try {
    const response = await withRetry(async () => {
      const res = await fetch('https://countriesnow.space/api/v0.1/countries/population');
      if (!res.ok) {
        throw new Response(res.statusText, { status: res.status });
      }
      return res;
    });

    const data = await response.json();
    const popMap: Record<string, number> = {};

    if (Array.isArray(data.data)) {
      data.data.forEach((item: PopulationData) => {
        if (item.country && Array.isArray(item.populationCounts) && item.populationCounts.length > 0) {
          // Get the most recent population data
          const mostRecent = item.populationCounts.reduce((a, b) => 
            parseInt(a.year) > parseInt(b.year) ? a : b
          );
          popMap[item.country] = parseInt(mostRecent.value);
        }
      });
    }

    return popMap;
  } catch (error) {
    const apiError = handleAPIError(error, 'countriesnow/population');
    logError(apiError, 'loadPopulationData');
    // Return empty object instead of throwing to allow app to continue
    return {};
  }
};

// Load countries GeoJSON
export const loadCountriesGeoJSON = async (): Promise<{
  countries: GeoJSON.Feature[];
  geojson: GeoJSON.FeatureCollection;
}> => {
  try {
    const response = await withRetry(async () => {
      const res = await fetch('/countries_with_continent.geo.json');
      if (!res.ok) {
        throw new Response(res.statusText, { status: res.status });
      }
      return res;
    });

    const geojson = await response.json();
    
    // Filter out Bermuda
    const filteredFeatures = geojson.features.filter((f: GeoJSON.Feature) => {
      const name = f.properties?.name || f.properties?.NAME || f.id || "";
      const iso2 = f.properties?.ISO_A2 || f.properties?.iso_a2 || f.properties?.iso2 || f.id || "";
      return name.toLowerCase() !== "bermuda" && iso2.toUpperCase() !== "BM";
    });

    return {
      countries: filteredFeatures,
      geojson: { ...geojson, features: filteredFeatures }
    };
  } catch (error) {
    const apiError = handleAPIError(error, 'countries_geojson');
    logError(apiError, 'loadCountriesGeoJSON');
    throw apiError;
  }
};
