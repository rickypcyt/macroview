"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatInflationWord, formatLargeNumber, formatTariffWord } from "../utils/helpers";

import type * as GeoJSON from "geojson";
// Local type alias used throughout this file when referring to World Bank country metadata
type WorldBankCountry = { id: string; name: string };

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
};

interface CountryInfoPopupProps {
  country: GeoJSON.Feature;
  position: { x: number; y: number };
  onClose: () => void;
  popByCountry: Record<string, number>;
  normalizeCountryName: (name: string) => string;
  gdpByCountry: Record<string, number>;
}

export function CountryInfoPopup({ country, position, onClose, popByCountry, normalizeCountryName, gdpByCountry }: CountryInfoPopupProps) {
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
      // Mapeo especial para nombres de países para la API
      let apiCountryName = countryName;
      if (apiCountryName === "Russian Federation" || apiCountryName === "Russia" || apiCountryName === "russia" || queryValue === "RU") apiCountryName = "russia";
      if (apiCountryName === "Syrian Arab Republic") apiCountryName = "Syria";
      if (apiCountryName === "Viet Nam") apiCountryName = "Vietnam";
      if (apiCountryName === "Korea, Republic of") apiCountryName = "South Korea";
      if (apiCountryName === "Korea, Democratic People's Republic of") apiCountryName = "North Korea";
      // Puedes agregar más casos especiales aquí
      const apiUrl = `/api/population?country=${encodeURIComponent(apiCountryName)}`;
      console.log({
        countryName,
        iso2,
        queryKey,
        queryValue,
        apiCountryName,
        apiUrl,
      });
      fetch(apiUrl)
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
            setApiError("Not found in API");
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
      setGDPError("Not available");
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
              setGDPError("Not found in API");
              setGdpYear(null);
            }
          });
      })
      .catch(() => {
        setGDPError("Not found in API");
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
      setInflationError("Not available");
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
              setInflationError("Not found in API");
              setInflationYear(null);
            }
          });
      })
      .catch(() => {
        setInflationError("Not found in API");
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
      setTariffError("Not available");
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
          setTariffError("Not found in API");
          setTariffYear(null);
        }
      })
      .catch(() => {
        setTariffError("Not found in API");
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