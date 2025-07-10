"use client";

import "leaflet/dist/leaflet.css";

import { GeoJSON, MapContainer as LeafletMap, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression, LeafletEvent } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";

import GlobeImport from "react-globe.gl";

type WorldBankCountry = { id: string; name: string };
type GlobeLabel = { lat: number; lng: number; text: string; isCountry?: boolean; isContinent?: boolean; bgColor?: string; color?: string; size?: number; };

// --- Modo 2D: Mostrar nombre del país en hover ---

// Popup de país modular

// Cache en memoria para poblaciones obtenidas por API
const populationCache: Record<string, number> = {};
// GDP cache en memoria
const gdpCache: Record<string, number> = {};
// Inflación cache en memoria
const inflationCache: Record<string, number> = {};
// Tarifa cache en memoria (por ISO3)
const tariffByIso3: Record<string, number> = {};
// Helper para cachear en localStorage
function getPopulationFromStorage(countryName: string): number | null {
  try {
    const val = localStorage.getItem(`populationCache:${countryName}`);
    if (val) return parseInt(val);
  } catch {}
  return null;
}
function setPopulationInStorage(countryName: string, value: number) {
  try {
    localStorage.setItem(`populationCache:${countryName}`, value.toString());
  } catch {}
}
// GDP helpers para localStorage
function getGDPFromStorage(countryName: string): number | null {
  try {
    const val = localStorage.getItem(`gdpCache:${countryName}`);
    if (val) return parseFloat(val);
  } catch {}
  return null;
}
function setGDPInStorage(countryName: string, value: number) {
  try {
    localStorage.setItem(`gdpCache:${countryName}`, value.toString());
  } catch {}
}
// Helper para cachear inflación en localStorage
function getInflationFromStorage(countryName: string): number | null {
  try {
    const val = localStorage.getItem(`inflationCache:${countryName}`);
    if (val) return parseFloat(val);
  } catch {}
  return null;
}
function setInflationInStorage(countryName: string, value: number) {
  try {
    localStorage.setItem(`inflationCache:${countryName}`, value.toString());
  } catch {}
}
// Helper para cachear tarifas globales en localStorage
function getTariffMapFromStorage(): Record<string, number> | null {
  try {
    const val = localStorage.getItem('tariffByIso3');
    if (val) return JSON.parse(val);
  } catch {}
  return null;
}
function setTariffMapInStorage(map: Record<string, number>) {
  try {
    localStorage.setItem('tariffByIso3', JSON.stringify(map));
  } catch {}
}

// Helper para formatear números grandes en palabras (inglés)
function formatLargeNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + ' trillion';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + ' billion';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + ' million';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + ' thousand';
  return num.toString();
}

// Helper para formatear inflación en palabras
function formatInflationWord(value: number): string {
  if (value < 0) return 'deflation';
  if (value < 2) return 'very low';
  if (value < 5) return 'moderate';
  if (value < 10) return 'high';
  if (value < 50) return 'very high';
  return 'hyperinflation';
}

// Helper para formatear tarifa en palabras
function formatTariffWord(value: number): string {
  if (value < 1) return 'very low';
  if (value < 5) return 'low';
  if (value < 10) return 'moderate';
  if (value < 20) return 'high';
  return 'very high';
}

// --- Popup modular para país (usable en 2D y 3D) ---

// Mapeo de nombres especiales para World Bank
const WORLD_BANK_NAME_ALIASES: Record<string, string[]> = {
  "United States": ["United States", "United States of America", "USA", "US"],
  "Russia": ["Russian Federation", "Russia"],
  "South Korea": ["Korea, Rep.", "South Korea", "Korea, Republic of"],
  "North Korea": ["Korea, Dem. People's Rep.", "North Korea", "Korea, Democratic People's Republic of"],
  "Iran": ["Iran, Islamic Rep.", "Iran"],
  "Egypt": ["Egypt, Arab Rep.", "Egypt"],
  "Vietnam": ["Viet Nam", "Vietnam"],
  "Syria": ["Syrian Arab Republic", "Syria"],
  "Venezuela": ["Venezuela, RB", "Venezuela"],
  "Gambia": ["Gambia, The", "Gambia"],
  "Bahamas": ["Bahamas, The", "Bahamas"],
  "Yemen": ["Yemen, Rep.", "Yemen"],
  "Congo": ["Congo, Rep.", "Congo"],
  "Congo (Democratic Republic)": ["Congo, Dem. Rep.", "Congo (Democratic Republic)", "Democratic Republic of the Congo"],
  "Lao PDR": ["Lao PDR", "Laos"],
  "Brunei": ["Brunei Darussalam", "Brunei"],
  // Puedes agregar más casos especiales aquí
};

function CountryInfoPopup({ country, position, onClose, popByCountry, normalizeCountryName, gdpByCountry }: { country: GeoJSON.Feature, position: { x: number, y: number }, onClose: () => void, popByCountry: Record<string, number>, normalizeCountryName: (name: string) => string, gdpByCountry: Record<string, number> }) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [apiPopulation, setApiPopulation] = useState<number | null>(null);
  const [populationYear, setPopulationYear] = useState<number | null>(null);
  const [loadingApi, setLoadingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  // GDP states
  const [apiGDP, setApiGDP] = useState<number | null>(null);
  const [gdpYear, setGdpYear] = useState<number | null>(null);
  const [loadingGDP, setLoadingGDP] = useState(false);
  const [gdpError, setGDPError] = useState<string | null>(null);
  // Inflación states
  const [apiInflation, setApiInflation] = useState<number | null>(null);
  const [inflationYear, setInflationYear] = useState<number | null>(null);
  const [loadingInflation, setLoadingInflation] = useState(false);
  const [inflationError, setInflationError] = useState<string | null>(null);
  // Tarifa states
  const [apiTariff, setApiTariff] = useState<number | null>(null);
  const [tariffYear, setTariffYear] = useState<number | null>(null);
  const [loadingTariff, setLoadingTariff] = useState(false);
  const [tariffError, setTariffError] = useState<string | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const countryName = country.properties?.name || country.properties?.NAME || country.id || "";
  const normalized = normalizeCountryName(countryName);
  const population = useMemo(() => {
    if (normalized && popByCountry[normalized]) {
      const popVal = popByCountry[normalized];
      if (typeof popVal === 'object' && popVal !== null && 'value' in popVal) {
        const popObj = popVal as { value: number, year?: number };
        return popObj.value;
      } else {
        return popVal;
      }
    } else if (country.properties?.POP_EST) {
      return country.properties.POP_EST;
    }
    return "Desconocida";
  }, [country, popByCountry, normalized]);

  const populationYearStatic = useMemo(() => {
    if (normalized && popByCountry[normalized]) {
      const popVal = popByCountry[normalized];
      if (typeof popVal === 'object' && popVal !== null && 'year' in popVal && typeof (popVal as { year?: number }).year === 'number') {
        return (popVal as { year: number }).year;
      }
    } else if (country.properties?.POP_YEAR) {
      return country.properties.POP_YEAR;
    }
    return null;
  }, [country, popByCountry, normalized]);

  useEffect(() => {
    if (population === "Desconocida" && countryName) {
      // Buscar ISO2 code
      const iso2 = country.properties?.ISO_A2 || country.properties?.iso_a2 || country.properties?.iso2 || country.id;
      let queryKey: string;
      let queryValue: string;
      if (iso2 && typeof iso2 === 'string' && iso2.length === 2) {
        queryKey = iso2.toUpperCase();
        queryValue = iso2.toUpperCase();
      } else {
        queryKey = normalizeCountryName(countryName);
        queryValue = queryKey;
      }
      // Si ya está en caché en memoria o localStorage, úsala
      if (populationCache[queryKey]) {
        setApiPopulation(populationCache[queryKey]);
        setApiError(null);
        setLoadingApi(false);
        return;
      }
      const localPop = getPopulationFromStorage(queryKey);
      if (localPop) {
        populationCache[queryKey] = localPop;
        setApiPopulation(localPop);
        setApiError(null);
        setLoadingApi(false);
        return;
      }
      setLoadingApi(true);
      setApiError(null);
      const API_NINJAS_KEY = process.env.NEXT_PUBLIC_API_NINJAS_KEY;
      if (!API_NINJAS_KEY) {
        setApiError("API Key no configurada (.env.local)");
        setLoadingApi(false);
        return;
      }
      // Mapeo especial para nombres de países para la API
      let apiCountryName = countryName;
      if (apiCountryName === "Russian Federation" || apiCountryName === "Russia" || apiCountryName === "russia" || queryValue === "RU") apiCountryName = "russia";
      if (apiCountryName === "Syrian Arab Republic") apiCountryName = "Syria";
      if (apiCountryName === "Viet Nam") apiCountryName = "Vietnam";
      if (apiCountryName === "Korea, Republic of") apiCountryName = "South Korea";
      if (apiCountryName === "Korea, Democratic People's Republic of") apiCountryName = "North Korea";
      // Puedes agregar más casos especiales aquí
      const apiUrl = `https://api.api-ninjas.com/v1/population?country=${encodeURIComponent(apiCountryName)}`;
      console.log({
        countryName,
        iso2,
        queryKey,
        queryValue,
        apiCountryName,
        apiUrl,
        API_NINJAS_KEY: API_NINJAS_KEY ? '***' : undefined
      });
      fetch(apiUrl, {
        headers: { 'X-Api-Key': API_NINJAS_KEY }
      })
        .then(res => {
          console.log('API response status:', res.status, res.statusText);
          if (!res.ok) throw new Error("Could not obtain population");
          return res.json();
        })
        .then((data) => {
          console.log('API response data:', data);
          let population = null;
          let year = null;
          if (data && typeof data.population === 'number') {
            population = data.population;
            year = data.year || null;
          } else if (data && Array.isArray(data.historical_population) && data.historical_population.length > 0) {
            // Tomar el valor más reciente
            const mostRecent = data.historical_population[data.historical_population.length - 1];
            population = mostRecent.population;
            year = mostRecent.year || null;
          }
          if (typeof population === 'number') {
            setApiPopulation(population);
            setPopulationYear(year);
            populationCache[queryKey] = population;
            setPopulationInStorage(queryKey, population);
          } else {
            setApiError("No disponible en API externa");
            setPopulationYear(null);
          }
        })
        .catch(() => {
          setPopulationYear(null);
        })
        .finally(() => setLoadingApi(false));
    } else {
      setApiPopulation(null);
      setApiError(null);
      setLoadingApi(false);
      setPopulationYear(null);
    }
  }, [countryName, population, country, normalizeCountryName, popByCountry]);

  // GDP logic
  useEffect(() => {
    // Usar el nombre del país en inglés
    const countryName = country.properties?.name || country.properties?.NAME || country.id;
    const iso2 = country.properties?.ISO_A2 || country.properties?.iso_a2 || country.properties?.iso2 || country.id;
    const iso3 = country.properties?.ISO_A3 || country.properties?.iso_a3 || country.properties?.iso3;
    if (!countryName || typeof countryName !== 'string') {
      setApiGDP(null);
      setGDPError("No disponible");
      setLoadingGDP(false);
      return;
    }
    // Si ya está en cache en memoria o localStorage, úsala
    if (gdpByCountry[countryName]) {
      setApiGDP(gdpByCountry[countryName]);
      setGDPError(null);
      setLoadingGDP(false);
      return;
    }
    if (gdpCache[countryName]) {
      setApiGDP(gdpCache[countryName]);
      setGDPError(null);
      setLoadingGDP(false);
      return;
    }
    const localGDP = getGDPFromStorage(countryName);
    if (localGDP) {
      gdpCache[countryName] = localGDP;
      setApiGDP(localGDP);
      setGDPError(null);
      setLoadingGDP(false);
      return;
    }
    setLoadingGDP(true);
    setGDPError(null);
    // World Bank API (busca por nombre de país)
    fetch(`https://api.worldbank.org/v2/country?format=json&per_page=300`)
      .then(res => res.json())
      .then((data) => {
        if (!Array.isArray(data) || !Array.isArray(data[1])) throw new Error("No se pudo buscar país");
        // Buscar por nombre exacto y luego por alias (case-insensitive)
        let found = data[1].find((c: WorldBankCountry) => c.name && c.name.toLowerCase() === countryName.toLowerCase());
        if (!found) {
          // Buscar por alias si existe (case-insensitive)
          const aliases = WORLD_BANK_NAME_ALIASES[countryName] || [];
          for (const alias of aliases) {
            found = data[1].find((c: WorldBankCountry) => c.name && c.name.toLowerCase() === alias.toLowerCase());
            if (found) break;
          }
        }
        if (!found) {
          // Buscar por nombre normalizado (sin espacios, minúsculas, etc)
          const normalized = countryName.toLowerCase().replace(/[^a-z]/g, "");
          found = data[1].find((c: WorldBankCountry) => c.name && c.name.toLowerCase().replace(/[^a-z]/g, "") === normalized);
        }
        // Buscar por código ISO2 (2 letras)
        if (!found && iso2 && typeof iso2 === 'string') {
          found = data[1].find((c: WorldBankCountry) => c.id && c.id.toUpperCase() === iso2.toUpperCase());
        }
        // Buscar por código ISO3 (3 letras)
        if (!found && iso3 && typeof iso3 === 'string') {
          found = data[1].find((c: WorldBankCountry) => c.id && c.id.toUpperCase() === iso3.toUpperCase());
        }
        // Fallback manual para USA
        if (!found && (countryName.toLowerCase().includes('united states') || (iso2 && iso2.toUpperCase() === 'US'))) {
          found = data[1].find((c: WorldBankCountry) => c.id === 'USA');
        }
        if (!found || !found.id) throw new Error("No se encontró el país en World Bank");
        const countryId = found.id;
        // Ahora sí, fetch GDP
        return fetch(`https://api.worldbank.org/v2/country/${countryId}/indicator/NY.GDP.MKTP.CD?format=json&per_page=1`)
          .then(res2 => res2.json())
          .then((gdpData) => {
            let gdp = null;
            let year = null;
            if (Array.isArray(gdpData) && Array.isArray(gdpData[1]) && gdpData[1][0] && typeof gdpData[1][0].value === 'number') {
              gdp = gdpData[1][0].value;
              year = gdpData[1][0].date ? parseInt(gdpData[1][0].date) : null;
            }
            if (typeof gdp === 'number') {
              setApiGDP(gdp);
              setGdpYear(year);
              gdpCache[countryName] = gdp;
              setGDPInStorage(countryName, gdp);
            } else {
              setGDPError("No disponible en API externa");
              setGdpYear(null);
            }
          });
      })
      .catch(() => {
        setGDPError("No disponible en API externa");
        setGdpYear(null);
      })
      .finally(() => setLoadingGDP(false));
  }, [country, gdpByCountry]);

  // Inflación logic
  useEffect(() => {
    setLoadingInflation(true);
    setInflationError(null);
    setApiInflation(null);
    setInflationYear(null);
    const countryName = country.properties?.name || country.properties?.NAME || country.id;
    const iso2 = country.properties?.ISO_A2 || country.properties?.iso_a2 || country.properties?.iso2 || country.id;
    const iso3 = country.properties?.ISO_A3 || country.properties?.iso_a3 || country.properties?.iso3;
    if (!countryName || typeof countryName !== 'string') {
      setInflationError("No disponible");
      setLoadingInflation(false);
      return;
    }
    if (inflationCache[countryName]) {
      setApiInflation(inflationCache[countryName]);
      setInflationError(null);
      setLoadingInflation(false);
      return;
    }
    const localInflation = getInflationFromStorage(countryName);
    if (localInflation) {
      inflationCache[countryName] = localInflation;
      setApiInflation(localInflation);
      setInflationError(null);
      setLoadingInflation(false);
      return;
    }
    // Buscar el país en World Bank igual que GDP
    fetch(`https://api.worldbank.org/v2/country?format=json&per_page=300`)
      .then(res => res.json())
      .then((data) => {
        if (!Array.isArray(data) || !Array.isArray(data[1])) throw new Error("No se pudo buscar país");
        let found = data[1].find((c: WorldBankCountry) => c.name && c.name.toLowerCase() === countryName.toLowerCase());
        if (!found) {
          const aliases = WORLD_BANK_NAME_ALIASES[countryName] || [];
          for (const alias of aliases) {
            found = data[1].find((c: WorldBankCountry) => c.name && c.name.toLowerCase() === alias.toLowerCase());
            if (found) break;
          }
        }
        if (!found) {
          const normalized = countryName.toLowerCase().replace(/[^a-z]/g, "");
          found = data[1].find((c: WorldBankCountry) => c.name && c.name.toLowerCase().replace(/[^a-z]/g, "") === normalized);
        }
        if (!found && iso2 && typeof iso2 === 'string') {
          found = data[1].find((c: WorldBankCountry) => c.id && c.id.toUpperCase() === iso2.toUpperCase());
        }
        if (!found && iso3 && typeof iso3 === 'string') {
          found = data[1].find((c: WorldBankCountry) => c.id && c.id.toUpperCase() === iso3.toUpperCase());
        }
        if (!found && (countryName.toLowerCase().includes('united states') || (iso2 && iso2.toUpperCase() === 'US'))) {
          found = data[1].find((c: WorldBankCountry) => c.id === 'USA');
        }
        if (!found || !found.id) throw new Error("No se encontró el país en World Bank");
        const countryId = found.id;
        // Ahora sí, fetch inflación
        return fetch(`https://api.worldbank.org/v2/country/${countryId}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1`)
          .then(res2 => res2.json())
          .then((inflationData) => {
            let inflation = null;
            let year = null;
            if (Array.isArray(inflationData) && Array.isArray(inflationData[1]) && inflationData[1][0] && typeof inflationData[1][0].value === 'number') {
              inflation = inflationData[1][0].value;
              year = inflationData[1][0].date ? parseInt(inflationData[1][0].date) : null;
            }
            if (typeof inflation === 'number') {
              setApiInflation(inflation);
              setInflationYear(year);
              inflationCache[countryName] = inflation;
              setInflationInStorage(countryName, inflation);
            } else {
              setInflationError("No disponible en API externa");
              setInflationYear(null);
            }
          });
      })
      .catch(() => {
        setInflationError("No disponible en API externa");
        setInflationYear(null);
      })
      .finally(() => setLoadingInflation(false));
  }, [country]);

  // Tarifa logic
  useEffect(() => {
    setLoadingTariff(true);
    setTariffError(null);
    setApiTariff(null);
    setTariffYear(null);
    const iso3 = country.properties?.ISO_A3 || country.properties?.iso_a3 || country.properties?.iso3;
    if (!iso3 || typeof iso3 !== 'string') {
      setTariffError("No disponible");
      setLoadingTariff(false);
      setTariffYear(null);
      return;
    }
    // Si ya está en cache en memoria
    if (tariffByIso3[iso3]) {
      setApiTariff(tariffByIso3[iso3]);
      setTariffError(null);
      setLoadingTariff(false);
      setTariffYear(null); // No guardamos año en cache local
      return;
    }
    // Si ya está en localStorage
    const tariffMap = getTariffMapFromStorage();
    if (tariffMap && tariffMap[iso3]) {
      tariffByIso3[iso3] = tariffMap[iso3];
      setApiTariff(tariffMap[iso3]);
      setTariffError(null);
      setLoadingTariff(false);
      setTariffYear(null); // No guardamos año en cache local
      return;
    }
    // Fetch global de tarifas
    fetch('https://api.worldbank.org/v2/country/all/indicator/TM.TAX.MRCH.SM.AR.ZS?format=json&per_page=300&date=2022')
      .then(res => res.json())
      .then((data) => {
        if (!Array.isArray(data) || !Array.isArray(data[1])) throw new Error("No se pudo obtener tarifas globales");
        const map: Record<string, number> = {};
        let year: number | null = null;
        data[1].forEach((item: Record<string, unknown>) => {
          if (
            typeof item.countryiso3code === 'string' &&
            typeof item.value === 'number'
          ) {
            map[item.countryiso3code] = item.value;
            if (
              item.countryiso3code === iso3 &&
              typeof item.date === 'string'
            ) {
              year = parseInt(item.date);
            }
          }
        });
        Object.assign(tariffByIso3, map);
        setTariffMapInStorage(map);
        if (map[iso3]) {
          setApiTariff(map[iso3]);
          setTariffError(null);
          setTariffYear(year);
        } else {
          setTariffError("No disponible en API externa");
          setTariffYear(null);
        }
      })
      .catch(() => {
        setTariffError("No disponible en API externa");
        setTariffYear(null);
      })
      .finally(() => setLoadingTariff(false));
  }, [country]);

  return (
    <div
      ref={popupRef}
      className="fixed z-[2100] px-4 py-3 rounded bg-white/95 text-black text-sm font-semibold pointer-events-auto shadow-lg border border-gray-300 min-w-[220px]"
      style={{ left: position.x + 16, top: position.y + 8 }}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-base">{country.properties?.name || "País"}</span>
        <button onClick={onClose} className="ml-2 text-gray-500 hover:text-red-500 font-bold text-lg leading-none">×</button>
      </div>
      <div className="mb-1">
        <span className="text-gray-700">Population:</span> {typeof population === 'number' ?
          <>
            {population.toLocaleString()} {populationYearStatic ? <span className="text-gray-500">({populationYearStatic})</span> : null}
          </> :
          loadingApi ? <span className="italic text-gray-500 ml-2">Cargando...</span> :
          apiPopulation ? <>
            {apiPopulation.toLocaleString()} {populationYear ? <span className="text-gray-500">({populationYear})</span> : null}
          </> :
          apiError ? <span className="text-red-500 ml-2">{apiError}</span> : population}
      </div>
      <div className="mb-1">
        <span className="text-gray-700">GDP (USD):</span> {loadingGDP ? <span className="italic text-gray-500 ml-2">Cargando...</span> :
          (typeof apiGDP === 'number' ?
            <>
              ${apiGDP.toLocaleString()} <span className="text-gray-500">({formatLargeNumber(apiGDP)})</span> {gdpYear ? <span className="text-gray-500">({gdpYear})</span> : null}
            </> :
            gdpError ? <span className="text-red-500 ml-2">{gdpError}</span> :
            gdpByCountry[country.properties?.ISO_A2?.toUpperCase() || country.id] ?
              <>
                ${gdpByCountry[country.properties?.ISO_A2?.toUpperCase() || country.id].toLocaleString()} <span className="text-gray-500">({formatLargeNumber(gdpByCountry[country.properties?.ISO_A2?.toUpperCase() || country.id])})</span> 
              </> :
            "Desconocido")}
      </div>
      <div className="mb-1">
        <span className="text-gray-700">Inflation:</span> {loadingInflation ? <span className="italic text-gray-500 ml-2">Loading...</span> :
          (typeof apiInflation === 'number' ?
            <>
              {apiInflation.toFixed(2)}% <span className="text-gray-500">({formatInflationWord(apiInflation)})</span> {inflationYear && <span className="text-gray-500">({inflationYear})</span>}
            </> :
            inflationError ? <span className="text-red-500 ml-2">{inflationError}</span> :
            "Unknown")}
      </div>
      <div className="mb-1">
        <span className="text-gray-700">Tariff:</span> {loadingTariff ? <span className="italic text-gray-500 ml-2">Loading...</span> :
          (typeof apiTariff === 'number' ?
            <>
              {apiTariff.toFixed(2)}% <span className="text-gray-500">({formatTariffWord(apiTariff)})</span> {tariffYear && <span className="text-gray-500">({tariffYear})</span>}
            </> :
            tariffError ? <span className="text-red-500 ml-2">{tariffError}</span> :
            "Unknown")}
      </div>
      {/* Aquí puedes agregar más info del país */}
    </div>
  );
}

// --- Helpers y lógica compartida para 2D y 3D ---

export const CONTINENTS_EN = [
  { name: "NORTH AMERICA", lat: 55, lng: -100 },
  { name: "SOUTH AMERICA", lat: -18, lng: -58 },
  { name: "EUROPE", lat: 54, lng: 20 },
  { name: "AFRICA", lat: 2, lng: 22 },
  { name: "ASIA", lat: 45, lng: 100 },
  { name: "AUSTRALIA", lat: -25, lng: 135 },
  { name: "ANTARCTICA", lat: -82, lng: 0 },
];

export const CONTINENT_LABEL_OFFSETS: Record<string, { y: number; size?: string }> = {
  "NORTH AMERICA": { y: 40 },
  "AFRICA": { y: -30 },
  "ASIA": { y: -30 },
  "AUSTRALIA": { y: 0, size: "text-lg md:text-xl" },
};

export const COUNTRIES_PER_CONTINENT: Record<string, number> = {
  "Europe": 50,
  "Asia": 49,
  "Africa": 54,
  "North America": 23,
  "Oceania": 14,
  "South America": 12,
  "Antarctica": 0,
};

export const CONTINENT_NAME_MAP: Record<string, string> = {
  "EUROPE": "Europe",
  "ASIA": "Asia",
  "AFRICA": "Africa",
  "NORTH AMERICA": "North America",
  "SOUTH AMERICA": "South America",
  "AUSTRALIA": "Oceania",
  "ANTARCTICA": "Antarctica",
};

export const CONTINENT_COLORS: Record<string, string> = {
  "Africa": "#34d399",
  "North America": "#f87171",
  "South America": "#fbbf24",
  "Europe": "#60a5fa",
  "Asia": "#a78bfa",
  "Oceania": "#f472b6",
  "Antarctica": "#a3a3a3",
};

export function normalizeCountryName(name: string): string {
  const n = name
    .toLowerCase()
    .replace(/\b(the|of|and)\b/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/\s+/g, "");
  if (["unitedstatesamerica", "unitedstates", "usa"].includes(n)) return "US";
  if (["unitedkingdom", "uk"].includes(n)) return "UK";
  return n;
}

function hasCoordinates(geometry: GeoJSON.Geometry): geometry is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

function getCentroid(coords: number[][][] | number[][][][]): [number, number] {
  // Solo soporta MultiPolygon y Polygon
  const all: number[][] = [];
  if (Array.isArray(coords[0][0][0])) {
    // MultiPolygon
    (coords as number[][][][]).forEach((poly) => {
      (poly[0] as number[][]).forEach((c) => all.push(c));
    });
  } else {
    // Polygon
    (coords as number[][][])[0].forEach((c) => all.push(c));
  }
  const lats = all.map((c) => c[1]);
  const lngs = all.map((c) => c[0]);
  return [lats.reduce((a, b) => a + b, 0) / lats.length, lngs.reduce((a, b) => a + b, 0) / lngs.length];
}

// Generador de estrellas (canvas background)
function StarBackground() {
  return (
    <div
      className="fixed inset-0 -z-10"
      style={{
        background: "#000",
        pointerEvents: "none",
      }}
    >
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 200 }).map((_, i) => (
          <circle
            key={i}
            cx={Math.random() * window.innerWidth}
            cy={Math.random() * window.innerHeight}
            r={Math.random() * 1.2 + 0.2}
            fill="#fff"
            opacity={Math.random() * 0.7 + 0.3}
          />
        ))}
      </svg>
    </div>
  );
}

function ContinentStatsModal({ continent, onClose, countriesCount }: { continent: string, onClose: () => void, countriesCount: number }) {
  if (!continent) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] relative text-black">
        <button onClick={onClose} className="absolute top-2 right-3 text-gray-500 hover:text-red-500 text-2xl font-bold">×</button>
        <h2 className="text-xl font-bold mb-2 text-center">{continent}</h2>
        <div className="mb-2"><span className="font-semibold">Number of countries:</span> {countriesCount}</div>
      </div>
    </div>
  );
}

function ContinentLabels2D({ continents, onContinentClick }: { continents: { name: string, lat: number, lng: number }[], onContinentClick: (name: string) => void }) {
  const map = useMap();
  const [positions, setPositions] = useState<{ name: string, x: number, y: number }[]>([]);

  useEffect(() => {
    function updatePositions() {
      const newPositions = continents.map((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng]);
        // Aplica offset si existe
        const offset = CONTINENT_LABEL_OFFSETS[c.name] || { y: 0 };
        return { name: c.name, x: point.x, y: point.y + offset.y };
      });
      setPositions(newPositions);
    }
    updatePositions();
    map.on("move zoom resize", updatePositions);
    return () => {
      map.off("move zoom resize", updatePositions);
    };
  }, [map, continents]);

  return (
    <>
      {positions.map((c) => {
        const offset = CONTINENT_LABEL_OFFSETS[c.name] || {};
        const sizeClass = offset.size || "text-2xl md:text-4xl";
        return (
          <button
            key={c.name}
            className={`pointer-events-auto select-none font-extrabold ${sizeClass} text-white/90 drop-shadow-lg bg-transparent border-none outline-none cursor-pointer hover:scale-105 transition`}
            style={{
              position: "absolute",
              left: c.x,
              top: c.y,
              zIndex: 1000,
              textShadow: "0 2px 8px #000, 0 0 2px #000",
              transform: "translate(-50%, -50%)",
            }}
            onClick={() => onContinentClick(c.name)}
          >
            {c.name.toUpperCase()}
          </button>
        );
      })}
    </>
  );
}

function CountryLabels2D({ geojson, zoom }: { geojson: GeoJSON.FeatureCollection, zoom: number }) {
  const map = useMap();
  const [, setMapUpdate] = useState(0);

  useEffect(() => {
    function update() {
      setMapUpdate((v) => v + 1); // Forzar re-render
    }
    map.on("move", update);
    map.on("zoom", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
    };
  }, [map]);

  if (zoom <= 3.5) return null;
  return (
    <>
      {geojson.features.map((feature: GeoJSON.Feature) => {
        if (!feature.geometry || !hasCoordinates(feature.geometry)) return null;
        const [lat, lng] = getCentroid((feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
        const point = map.latLngToContainerPoint([lat, lng]);
        return (
          <div
            key={feature.properties?.name || feature.id}
            className="absolute pointer-events-none select-none text-xs font-bold text-white bg-black/60 rounded px-2 py-1 shadow"
            style={{
              left: point.x,
              top: point.y,
              transform: "translate(-50%, -50%)",
              zIndex: 1200,
              whiteSpace: "nowrap"
            }}
          >
            {feature.properties?.name}
          </div>
        );
      })}
    </>
  );
}

function MapZoomListener({ setZoom }: { setZoom: (z: number) => void }) {
  useMapEvents({
    zoomend: (e: LeafletEvent) => setZoom(e.target.getZoom()),
    zoomstart: (e: LeafletEvent) => setZoom(e.target.getZoom()),
    moveend: (e: LeafletEvent) => setZoom(e.target.getZoom()),
  });
  return null;
}


function CountryMap2D({ geojson, popByCountry, normalizeCountryName, ContinentLabelsComponent, gdpByCountry }: { geojson: GeoJSON.FeatureCollection, popByCountry: Record<string, number>, normalizeCountryName: (name: string) => string, ContinentLabelsComponent?: React.ComponentType<{ continents: { name: string, lat: number, lng: number }[] }>, gdpByCountry: Record<string, number> }) {
  const [zoom, setZoom] = useState(2);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<GeoJSON.Feature | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);

  const continentColors: Record<string, string> = {
    "Africa": "#34d399",
    "North America": "#f87171",
    "South America": "#fbbf24",
    "Europe": "#60a5fa",
    "Asia": "#a78bfa",
    "Oceania": "#f472b6",
    "Antarctica": "#a3a3a3",
  };

  // Para mantener el borde resaltado si el popup está abierto para ese país
  const highlightedCountry = selectedCountry?.properties?.name || hoveredCountry;

  // Custom onEachFeature to handle hover and click
  function onEachCountry(feature: GeoJSON.Feature, layer: L.Layer) {
    layer.on({
      mouseover: (e: L.LeafletMouseEvent) => {
        setHoveredCountry(feature.properties?.name || feature.id);
        if (e.originalEvent) {
          setHoverPos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        }
        (layer as L.Path).setStyle({ weight: 2, color: "#fff" });
      },
      mouseout: () => {
        setHoveredCountry(null);
        setHoverPos(null);
        // Solo quitar el highlight si no está seleccionado
        if (!selectedCountry || selectedCountry.properties?.name !== feature.properties?.name) {
          (layer as L.Path).setStyle({ weight: 1, color: "#222" });
        }
      },
      click: (e: L.LeafletMouseEvent) => {
        setSelectedCountry(feature);
        if (e.originalEvent) {
          setPopupPos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        }
      },
    });
  }

  // Custom style para resaltar el país hovered o seleccionado
  function countryStyle(feature?: GeoJSON.Feature) {
    if (!feature || !feature.properties) return {};
    const isHighlighted = highlightedCountry === feature.properties.name;
    const continent = feature.properties.continent;
    const fillColor = continentColors[continent] || "#e5e7eb";
    return {
      color: isHighlighted ? "#000" : "#888",
      weight: isHighlighted ? 2.5 : 1,
      fillOpacity: 0.95,
      fillColor,
      dashArray: isHighlighted ? "2 2" : undefined,
    };
  }

  // Mostrar labels centrados solo si el zoom es suficiente
  // const showLabels = zoom > 3.5; // Unused variable - removed

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-black">
      <LeafletMap
        center={[20, 0] as LatLngExpression}
        zoom={2}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]] as LatLngBoundsExpression}
        style={{ width: "100vw", height: "100vh", background: "#000" }}
        scrollWheelZoom={true}
        zoomControl={true}
        attributionControl={false}
      >
        <MapZoomListener setZoom={setZoom} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <GeoJSON
          data={geojson}
          style={countryStyle}
          onEachFeature={onEachCountry}
        />
        {ContinentLabelsComponent ? <ContinentLabelsComponent continents={CONTINENTS_EN} /> : <ContinentLabels2D continents={CONTINENTS_EN} onContinentClick={() => {}} />}
        <CountryLabels2D geojson={geojson} zoom={zoom} />
        {/* Leyenda de colores de continentes */}
        <div className="absolute bottom-4 right-4 bg-white/90 rounded shadow-lg p-3 z-[2000] text-sm flex flex-col gap-2 border border-gray-200">
          <div className="font-bold mb-1 text-gray-700">Continentes</div>
          {Object.entries(continentColors).map(([continent, color]) => (
            <div key={continent} className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded-full border border-gray-400" style={{ background: color }}></span>
              <span className="text-gray-800">{continent}</span>
            </div>
          ))}
        </div>
      </LeafletMap>
      {hoveredCountry && hoverPos && !selectedCountry && (
        <div
          className="fixed z-[2000] px-3 py-1 rounded bg-white/90 text-black text-xs font-bold pointer-events-none shadow"
          style={{ left: hoverPos.x + 12, top: hoverPos.y + 4 }}
        >
          {hoveredCountry}
        </div>
      )}
      {selectedCountry && popupPos && (
        <CountryInfoPopup
          country={selectedCountry}
          position={popupPos}
          onClose={() => setSelectedCountry(null)}
          popByCountry={popByCountry}
          normalizeCountryName={normalizeCountryName}
          gdpByCountry={gdpByCountry}
        />
      )}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 mt-2 z-[1000]">Fuente de países: <a href="https://datahub.io/core/geo-countries" target="_blank" rel="noopener noreferrer" className="underline">datahub.io/core/geo-countries</a></div>
    </div>
  );
}

// --- Globe 3D: selección de país y popup ---

function Globe3D({ countries, popByCountry, normalizeCountryName, onContinentClick, gdpByCountry }: { countries: GeoJSON.Feature[], popByCountry: Record<string, number>, normalizeCountryName: (name: string) => string, onContinentClick: (name: string) => void, gdpByCountry: Record<string, number> }) {
  const [selectedCountry, setSelectedCountry] = useState<GeoJSON.Feature | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [selectedContinent, setSelectedContinent] = useState<string | null>(null);
  // Estado para el nivel de zoom/cámara
  const [cameraDistance, setCameraDistance] = useState(2);

  // Actualiza el nivel de zoom/cámara
  function handleCameraChange() {
    if (globeRef.current && globeRef.current.camera()) {
      setCameraDistance(globeRef.current.camera().position.length());
    }
  }

  // Labels de países solo si el zoom es alto
  const showCountryLabels = cameraDistance < 1.5; // Ajusta este valor según lo que consideres "zoom alto"

  // Labels de países (centroide)
  const countryLabelsData = showCountryLabels
    ? countries.map((c) => {
        if (!c.geometry || !hasCoordinates(c.geometry)) return null;
        // Calcular centroide
        const coords = getCentroid((c.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
        return {
          lat: coords[0],
          lng: coords[1],
          text: c.properties?.name,
          isCountry: true,
        };
      }).filter(Boolean)
    : [];

  // Labels de continentes
  const continentLabelsData = CONTINENTS_EN.map(c => ({
    lat: c.lat,
    lng: c.lng,
    text: c.name,
    isContinent: true,
  }));

  // Unir labels
  const allLabelsData = [...continentLabelsData, ...countryLabelsData];

  // Handler para click en país (solo si no hay labels de países)
  function handlePolygonClick(country: GeoJSON.Feature, event?: MouseEvent) {
    if (showCountryLabels) return;
    setSelectedCountry(country);
    if (event && 'clientX' in event && 'clientY' in event) {
      setPopupPos({ x: event.clientX, y: event.clientY });
    } else if (globeRef.current && country && country.geometry && hasCoordinates(country.geometry)) {
      const centroid = getCentroid((country.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
      const coords = globeRef.current.getScreenCoords(centroid[1], centroid[0]);
      setPopupPos({ x: coords.x, y: coords.y });
    }
  }

  // Handler para hover (opcional, si tienes highlight)
  // Puedes desactivar el highlight si showCountryLabels

  // Colores por continente
  function getPolygonColor(country: GeoJSON.Feature) {
    const continent = country.properties?.continent;
    return CONTINENT_COLORS[continent] || "#e5e7eb";
  }

  // Labels de continentes (usando Globe labelsData)
  // const labelsData = CONTINENTS_EN.map(c => ({
  //   lat: c.lat,
  //   lng: c.lng,
  //   text: c.name,
  //   isContinent: true,
  //   bgColor: "#2229",
  //   color: "#fff",
  //   size: 2.2,
  // })); // Unused variable - removed

  // Handler para click en label de continente
  // function handleLabelClick(label: GlobeLabel, event: L.LeafletMouseEvent) {
  //   if (label.isContinent) {
  //     setSelectedContinent(label.text);
  //     if (onContinentClick) onContinentClick(label.text);
  //   }
  // } // Unused function - removed

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-black">
      <GlobeImport
        ref={globeRef}
        globeImageUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2048' height='1024'%3E%3Crect width='100%25' height='100%25' fill='%232563eb'/%3E%3C/svg%3E"
        backgroundColor="#000"
        polygonsData={countries}
        polygonCapColor={(country) => getPolygonColor(country as GeoJSON.Feature)}
        polygonSideColor={() => "#16a34a"}
        polygonStrokeColor={() => "#166534"}
        polygonLabel={(country) => (country as GeoJSON.Feature).properties?.name}
        polygonsTransitionDuration={0}
        width={typeof window !== 'undefined' ? window.innerWidth : 1920}
        height={typeof window !== 'undefined' ? window.innerHeight : 1080}
        enablePointerInteraction={true}
        atmosphereColor="#1e3a8a"
        atmosphereAltitude={0.01}
        showAtmosphere={false}
        animateIn={false}
        onPolygonClick={(country, event) => handlePolygonClick(country as GeoJSON.Feature, event as MouseEvent)}
        onZoom={handleCameraChange}
        onGlobeReady={handleCameraChange}
        labelsData={allLabelsData as GlobeLabel[]}
        labelLat={(d: object) => (d as GlobeLabel).lat}
        labelLng={(d: object) => (d as GlobeLabel).lng}
        labelText={(d: object) => (d as GlobeLabel).text}
        labelColor={(d: object) => (d as GlobeLabel).isCountry ? "white" : "white"}
        labelSize={(d: object) => (d as GlobeLabel).isCountry ? 1.1 : 2.6}
        labelLabel={(label: object) => `<div style='font-weight:900;font-size:${(label as GlobeLabel).isCountry ? "1.1rem" : "2.2rem"};color:white;text-shadow:0 2px 8px #000,0 0 2px #000;'>${(label as GlobeLabel).text.toUpperCase()}</div>`}
        onLabelClick={(label: object) => {
          const globeLabel = label as GlobeLabel;
          if (globeLabel && globeLabel.text && globeLabel.isContinent) {
            setSelectedContinent(globeLabel.text);
            if (onContinentClick) onContinentClick(globeLabel.text);
          }
        }}
        labelDotRadius={0}
        labelAltitude={0.01}
        labelResolution={2}
        labelsTransitionDuration={0}
      />
      {/* Labels de continentes HTML superpuestos eliminados */}
      {selectedCountry && popupPos && (
        <CountryInfoPopup
          country={selectedCountry}
          position={popupPos}
          onClose={() => setSelectedCountry(null)}
          popByCountry={popByCountry}
          normalizeCountryName={normalizeCountryName}
          gdpByCountry={gdpByCountry}
        />
      )}
      {selectedContinent && selectedContinent !== "ANTARCTICA" && (
        <ContinentStatsModal
          continent={selectedContinent}
          onClose={() => setSelectedContinent(null)}
          countriesCount={COUNTRIES_PER_CONTINENT[CONTINENT_NAME_MAP[selectedContinent]] || 0}
        />
      )}
      {/* Leyenda de colores de continentes */}
      <div className="absolute bottom-4 right-4 bg-white/90 rounded shadow-lg p-3 z-[2000] text-sm flex flex-col gap-2 border border-gray-200">
        <div className="font-bold mb-1 text-gray-700">Continents</div>
        {Object.entries(CONTINENT_COLORS).map(([continent, color]) => (
          <div key={continent} className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded-full border border-gray-400" style={{ background: color }}></span>
            <span className="text-gray-800">{continent}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 mt-2 z-[1000]">Fuente de países: <a href="https://datahub.io/core/geo-countries" target="_blank" rel="noopener noreferrer" className="underline">datahub.io/core/geo-countries</a></div>
    </div>
  );
}

export default function GlobeComponent() {
  const [selectedContinent, setSelectedContinent] = useState<string | null>(null);
  const [countries, setCountries] = useState<GeoJSON.Feature[]>([]);
  // const [labels, setLabels] = useState<GeoJSON.Feature[]>([]); // Unused variable - removed
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [mode2D, setMode2D] = useState(false);
  const [popByCountry, setPopByCountry] = useState<Record<string, number>>({});
  const [gdpByCountry, setGDPByCountry] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch("/countries_with_continent.geo.json")
      .then((res) => res.json())
      .then((geojson) => {
        // Filtrar Bermuda por nombre o código
        const filteredFeatures = geojson.features.filter((f: GeoJSON.Feature) => {
          const name = f.properties?.name || f.properties?.NAME || f.id || "";
          const iso2 = f.properties?.ISO_A2 || f.properties?.iso_a2 || f.properties?.iso2 || f.id || "";
          return name.toLowerCase() !== "bermuda" && iso2.toUpperCase() !== "BM";
        });
        setCountries(filteredFeatures);
        setGeojson({ ...geojson, features: filteredFeatures });
        // setLabels([]); // Unused setter - removed
        // Fetch GDP para todos los países (solo una vez, usando nombre)
        filteredFeatures.forEach((f: GeoJSON.Feature) => {
          const countryName = f.properties?.name || f.properties?.NAME || f.id;
          if (!countryName || typeof countryName !== 'string') return;
          if (gdpCache[countryName]) return;
          const localGDP = getGDPFromStorage(countryName);
          if (localGDP) {
            gdpCache[countryName] = localGDP;
            setGDPByCountry(prev => ({ ...prev, [countryName]: localGDP }));
            return;
          }
          // Buscar el código ISO2 por nombre
          fetch(`https://api.worldbank.org/v2/country?format=json&per_page=300`)
            .then(res => res.json())
            .then((data) => {
              if (!Array.isArray(data) || !Array.isArray(data[1])) return;
              const found = data[1].find((c: WorldBankCountry) => c.name && c.name.toLowerCase() === countryName.toLowerCase());
              if (!found || !found.id) return;
              const iso2 = found.id;
              // Ahora sí, fetch GDP
              return fetch(`https://api.worldbank.org/v2/country/${iso2}/indicator/NY.GDP.MKTP.CD?format=json&per_page=1`)
                .then(res2 => res2.json())
                .then((gdpData) => {
                  let gdp = null;
                  // let year = null; // Unused variable - removed
                  if (Array.isArray(gdpData) && Array.isArray(gdpData[1]) && gdpData[1][0] && typeof gdpData[1][0].value === 'number') {
                    gdp = gdpData[1][0].value;
                    // year = gdpData[1][0].date ? parseInt(gdpData[1][0].date) : null; // Unused variable - removed
                  }
                  if (typeof gdp === 'number') {
                    gdpCache[countryName] = gdp;
                    setGDPInStorage(countryName, gdp);
                    setGDPByCountry(prev => ({ ...prev, [countryName]: gdp }));
                  }
                });
            })
            .catch(() => {});
        });
      });
    // Fetch población de countriesnow.space
    fetch("https://countriesnow.space/api/v0.1/countries/population")
      .then((res) => res.json())
      .then((data) => {
        const popMap: Record<string, number> = {};
        if (Array.isArray(data.data)) {
          data.data.forEach((item: Record<string, unknown>) => {
            if (item.country && Array.isArray(item.populationCounts) && item.populationCounts.length > 0) {
              // Tomar el valor más reciente
              const mostRecent = item.populationCounts.reduce((a: Record<string, unknown>, b: Record<string, unknown>) => (parseInt(a.year as string) > parseInt(b.year as string) ? a : b));
              popMap[normalizeCountryName(item.country as string)] = parseInt(mostRecent.value as string);
            }
          });
        }
        setPopByCountry(popMap);
      });
  }, []);

  // Mantener DRY: helpers y componentes compartidos

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center">
      <StarBackground />
      <button
        className="absolute top-4 right-4 z-[1000] bg-white/90 text-gray-900 px-4 py-2 rounded shadow hover:bg-green-400 transition font-bold"
        onClick={() => setMode2D((v) => !v)}
      >
        {mode2D ? "🌍 Modo 3D" : "🗺️ Modo 2D"}
      </button>
      {mode2D && geojson ? (
        <>
          <CountryMap2D
            geojson={geojson}
            popByCountry={popByCountry}
            normalizeCountryName={normalizeCountryName}
            ContinentLabelsComponent={
              (props: { continents: { name: string, lat: number, lng: number }[] }) => <ContinentLabels2D {...props} onContinentClick={setSelectedContinent} />
            }
            gdpByCountry={gdpByCountry}
          />
          {selectedContinent && selectedContinent !== "ANTARCTICA" && (
            <ContinentStatsModal
              continent={selectedContinent}
              onClose={() => setSelectedContinent(null)}
              countriesCount={COUNTRIES_PER_CONTINENT[CONTINENT_NAME_MAP[selectedContinent]] || 0}
            />
          )}
        </>
      ) : (
        <Globe3D
          countries={countries}
          popByCountry={popByCountry}
          normalizeCountryName={normalizeCountryName}
          onContinentClick={setSelectedContinent}
          gdpByCountry={gdpByCountry}
        />
      )}
    </div>
  );
} 