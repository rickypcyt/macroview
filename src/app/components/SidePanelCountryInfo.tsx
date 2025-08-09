"use client";

import type * as GeoJSON from "geojson";
import React from "react";

// Cache en memoria para inflación
const inflationCache: Record<string, number> = {};
// Tarifa cache en memoria (por ISO3)
const tariffByIso3: Record<string, number> = {};

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

interface SidePanelCountryInfoProps {
  country: GeoJSON.Feature;
  onClose: () => void;
  popByCountry: Record<string, number>;
  normalizeCountryName: (name: string) => string;
  gdpByCountry: Record<string, number>;
}

export function SidePanelCountryInfo({ country, onClose, popByCountry, normalizeCountryName, gdpByCountry }: SidePanelCountryInfoProps) {
  const name = country.properties?.name || country.properties?.NAME || country.id || '';
  const gdp = gdpByCountry[name];
  // --- Inflation states ---
  const [apiInflation, setApiInflation] = React.useState<number | null>(null);
  const [inflationYear, setInflationYear] = React.useState<number | null>(null);
  const [loadingInflation, setLoadingInflation] = React.useState(false);
  const [inflationError, setInflationError] = React.useState<string | null>(null);
  // --- Tariff states ---
  const [apiTariff, setApiTariff] = React.useState<number | null>(null);
  const [tariffYear, setTariffYear] = React.useState<number | null>(null);
  const [loadingTariff, setLoadingTariff] = React.useState(false);
  const [tariffError, setTariffError] = React.useState<string | null>(null);
  // --- Population ---
  const pop = popByCountry[normalizeCountryName(name)];
  // --- Tariff ISO3 ---
  const iso3 = country.properties?.ISO_A3 || country.properties?.iso_a3 || country.properties?.iso3;

  // Fetch inflation (igual que CountryInfoPopup)
  React.useEffect(() => {
    setLoadingInflation(true);
    setInflationError(null);
    setApiInflation(null);
    setInflationYear(null);
    const countryName = name;
    const iso2 = country.properties?.ISO_A2 || country.properties?.iso_a2 || country.properties?.iso2 || country.id;
    if (!countryName || typeof countryName !== 'string') {
      setInflationError('Not available');
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
    fetch(`https://api.worldbank.org/v2/country?format=json&per_page=300`)
      .then(res => res.json())
      .then((data) => {
        if (!Array.isArray(data) || !Array.isArray(data[1])) throw new Error('No country found');
        let found = data[1].find((c: { name: string; id: string }) => c.name && c.name.toLowerCase() === countryName.toLowerCase());
        if (!found && iso2 && typeof iso2 === 'string') {
          found = data[1].find((c: { id: string }) => c.id && c.id.toUpperCase() === iso2.toUpperCase());
        }
        if (!found && iso3 && typeof iso3 === 'string') {
          found = data[1].find((c: { id: string }) => c.id && c.id.toUpperCase() === iso3.toUpperCase());
        }
        if (!found || !found.id) throw new Error('No country found');
        const countryId = found.id;
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
              setInflationError('Not available');
              setInflationYear(null);
            }
          });
      })
      .catch(() => {
        setInflationError('Not available');
        setInflationYear(null);
      })
      .finally(() => setLoadingInflation(false));
  }, [country, name, iso3]);

  // Fetch tariff (igual que CountryInfoPopup)
  React.useEffect(() => {
    setLoadingTariff(true);
    setTariffError(null);
    setApiTariff(null);
    setTariffYear(null);
    if (!iso3 || typeof iso3 !== 'string') {
      setTariffError('Not available');
      setLoadingTariff(false);
      setTariffYear(null);
      return;
    }
    if (tariffByIso3[iso3]) {
      setApiTariff(tariffByIso3[iso3]);
      setTariffError(null);
      setLoadingTariff(false);
      setTariffYear(null);
      return;
    }
    const tariffMap = getTariffMapFromStorage();
    if (tariffMap && tariffMap[iso3]) {
      tariffByIso3[iso3] = tariffMap[iso3];
      setApiTariff(tariffMap[iso3]);
      setTariffError(null);
      setLoadingTariff(false);
      setTariffYear(null);
      return;
    }
    fetch('https://api.worldbank.org/v2/country/all/indicator/TM.TAX.MRCH.SM.AR.ZS?format=json&per_page=300&date=2022')
      .then(res => res.json())
      .then((data) => {
        if (!Array.isArray(data) || !Array.isArray(data[1])) throw new Error('No tariff data');
        const map: Record<string, number> = {};
        let year: number | null = null;
        data[1].forEach((item: { countryiso3code: string; value: number; date: string }) => {
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
          setTariffError('Not available');
          setTariffYear(null);
        }
      })
      .catch(() => {
        setTariffError('Not available');
        setTariffYear(null);
      })
      .finally(() => setLoadingTariff(false));
  }, [country, iso3]);

  return (
    <div className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-gray-900/95 shadow-2xl z-[2000] flex flex-col transition-transform duration-300 animate-slide-in">
      <button
        className="absolute top-4 right-4 text-white text-2xl font-bold hover:text-green-400 focus:outline-none"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      <div className="overflow-y-auto p-8 pt-16 h-full">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">{name}</h2>
        <div className="space-y-6">
          {/* GDP */}
          <div className="bg-white/10 rounded p-4 flex flex-col">
            <span className="text-lg text-gray-300 font-semibold mb-1">GDP (USD)</span>
            <span className="text-2xl font-bold text-green-300">
              {gdp ? `$${gdp.toLocaleString()}` : <span className="text-gray-400">Not available</span>}
            </span>
          </div>
          {/* Inflation */}
          <div className="bg-white/10 rounded p-4 flex flex-col">
            <span className="text-lg text-gray-300 font-semibold mb-1">Inflation (%)</span>
            <span className="text-2xl font-bold text-yellow-300">
              {loadingInflation ? <span className="italic text-gray-400">Loading...</span> :
                (typeof apiInflation === 'number' ? `${apiInflation.toFixed(2)}%${inflationYear ? ` (${inflationYear})` : ''}` : <span className="text-gray-400">{inflationError || 'Not available'}</span>)}
            </span>
          </div>
          {/* Tariff */}
          <div className="bg-white/10 rounded p-4 flex flex-col">
            <span className="text-lg text-gray-300 font-semibold mb-1">Tariff (%)</span>
            <span className="text-2xl font-bold text-blue-300">
              {loadingTariff ? <span className="italic text-gray-400">Loading...</span> :
                (typeof apiTariff === 'number' ? `${apiTariff.toFixed(2)}%${tariffYear ? ` (${tariffYear})` : ''}` : <span className="text-gray-400">{tariffError || 'Not available'}</span>)}
            </span>
          </div>
          {/* Population */}
          <div className="bg-white/10 rounded p-4 flex flex-col">
            <span className="text-lg text-gray-300 font-semibold mb-1">Population</span>
            <span className="text-2xl font-bold text-white">
              {pop ? pop.toLocaleString() : <span className="text-gray-400">Not available</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
} 