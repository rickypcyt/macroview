import type * as GeoJSON from "geojson";
import { handleAPIError, logError, withRetry } from "./errorHandler";
import { getIMF_NGDPDLatestByIso3, getIMF_LPForYearByIso3, getIMF_LPLatestByIso3, getIMF_NGDPDForYearByIso3 } from "./imfApi";

// Types
export type WorldBankCountry = { id: string; name: string };
export type PopulationData = {
  country: string;
  populationCounts: Array<{ year: string; value: string }>;
};

// Cache management
const gdpCache: Record<string, number> = {};
const countryISO3Cache: Record<string, string> = {};
let geojsonCache: { countries: GeoJSON.Feature[]; geojson: GeoJSON.FeatureCollection } | null = null;
let imfCountryLabelToIso3: Record<string, string> | null = null;

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

// Resolve ISO3 using local GeoJSON (no external countries API)
// Helper: robust ISO3 resolver from feature properties
const resolveIso3 = (props: Record<string, unknown>): string => {
  const candidates = ['ISO_A3', 'iso_a3', 'ADM0_A3', 'WB_A3', 'BRK_A3', 'iso3', 'ISO3'];
  for (const key of candidates) {
    const v = props[key];
    if (typeof v === 'string' && v.length >= 3) return v.toUpperCase();
  }
  return '';
};

// Load IMF countries mapping from public JSON and build label->ISO3 map
const loadIMFCountryLabelMap = async (): Promise<Record<string, string>> => {
  if (imfCountryLabelToIso3) return imfCountryLabelToIso3;
  try {
    const response = await withRetry(async () => {
      const res = await fetch('/imf_countries.json');
      if (!res.ok) {
        throw new Response(res.statusText, { status: res.status });
      }
      return res;
    });
    const json = await response.json();
    const map: Record<string, string> = {};
    const countries = json?.countries ?? {};
    for (const iso3 of Object.keys(countries)) {
      const label = countries[iso3]?.label as string | null;
      if (label && typeof label === 'string') {
        map[label.toLowerCase()] = iso3.toUpperCase();
      }
    }
    imfCountryLabelToIso3 = map;
    return map;
  } catch (error) {
    logError(error, 'loadIMFCountryLabelMap');
    imfCountryLabelToIso3 = {};
    return imfCountryLabelToIso3;
  }
};

const findCountryISO3 = async (countryName: string): Promise<string | null> => {
  if (countryISO3Cache[countryName]) return countryISO3Cache[countryName];
  try {
    // 1) Try IMF countries mapping by label first
    const labelMap = await loadIMFCountryLabelMap();
    const isoFromMap = labelMap[countryName.toLowerCase()];
    if (isoFromMap) {
      countryISO3Cache[countryName] = isoFromMap;
      return isoFromMap;
    }

    // 2) Fallback: try GeoJSON feature properties and names
    if (!geojsonCache) {
      geojsonCache = await loadCountriesGeoJSON();
    }
    const features = geojsonCache.countries;
    const lc = countryName.toLowerCase();
    const f = features.find((feat: GeoJSON.Feature) => {
      const props = (feat.properties ?? {}) as Record<string, unknown>;
      const name = (props.name || props.NAME || feat.id || "") as string;
      return typeof name === 'string' && name.toLowerCase() === lc;
    });
    if (!f) return null;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const iso3 = resolveIso3(props);
    if (iso3) {
      countryISO3Cache[countryName] = iso3;
      return countryISO3Cache[countryName];
    }
    return null;
  } catch (error) {
    logError(error, `findCountryISO3:${countryName}`);
    return null;
  }
};

// Load GDP data for a specific country (lazy loading)
// Prefer targetYear (e.g., 2025) to align with population logic; fallback to latest
export const loadCountryGDP = async (
  countryName: string,
  targetYear = 2025
): Promise<number | null> => {
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
    // Find ISO3 code
    const iso3 = await findCountryISO3(countryName);
    if (!iso3) {
      logError(`Country ISO3 not found for: ${countryName}`, 'loadCountryGDP');
      return null;
    }
    // Prefer targetYear (e.g., 2025), fallback to latest
    let result = await getIMF_NGDPDForYearByIso3(iso3, targetYear);
    if (result.value == null) {
      const latest = await getIMF_NGDPDLatestByIso3(iso3);
      result = latest;
    }
    if (result.value != null) {
      gdpCache[countryName] = result.value;
      setGDPInStorage(countryName, result.value);
      return result.value;
    }
    return null;
  } catch (error) {
    const apiError = handleAPIError(error, `imf/datamapper/ngdpd/${countryName}`);
    logError(apiError, `loadCountryGDP:${countryName}`);
    return null;
  }
};

// Load all population data (this can remain as is since it's a single API call)
// IMF-only population for a single country by name; prefer targetYear (e.g., 2025), fallback to latest
export const loadCountryPopulationIMF = async (
  countryName: string,
  targetYear = 2025
): Promise<{ value: number | null; year: string | null }> => {
  if (!countryName) return { value: null, year: null };
  try {
    const iso3 = await findCountryISO3(countryName);
    if (!iso3) return { value: null, year: null };
    let res = await getIMF_LPForYearByIso3(iso3, targetYear);
    if (res.value == null) {
      res = await getIMF_LPLatestByIso3(iso3);
    }
    return res;
  } catch (error) {
    const apiError = handleAPIError(error, `imf/datamapper/lp/${countryName}`);
    logError(apiError, `loadCountryPopulationIMF:${countryName}`);
    return { value: null, year: null };
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
