"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useState } from "react";

import { Dashboard } from "./components/Dashboard";
import { GeoJSON } from "geojson";
import { Globe2D } from "./components/Globe2D";
import { Globe3D } from "./components/Globe3D";
import { normalizeCountryName } from "./utils/helpers";

// GDP cache en memoria
const gdpCache: Record<string, number> = {};

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

type WorldBankCountry = { id: string; name: string };

export default function GlobeComponent() {
  const [countries, setCountries] = useState<GeoJSON.Feature[]>([]);
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [popByCountry, setPopByCountry] = useState<Record<string, number>>({});
  const [gdpByCountry, setGDPByCountry] = useState<Record<string, number>>({});
  // Nuevo estado para el modo de vista
  const [viewMode, setViewMode] = useState<'summary' | '3d' | '2d'>('summary');
  const [selectedCountryFromSearch, setSelectedCountryFromSearch] = useState<GeoJSON.Feature | null>(null);

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
                  if (Array.isArray(gdpData) && Array.isArray(gdpData[1]) && gdpData[1][0] && typeof gdpData[1][0].value === 'number') {
                    gdp = gdpData[1][0].value;
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

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center">
      {/* Navigation Bar */}
      <div className="absolute top-6 right-6 z-[1000]">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-2">
          <div className="flex gap-1">
            <button
              className={`px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
                viewMode === 'summary' 
                  ? 'bg-blue-500 text-white shadow-lg' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
              onClick={() => setViewMode('summary')}
            >
              📊 Summary
            </button>
            <button
              className={`px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
                viewMode === '3d' 
                  ? 'bg-blue-500 text-white shadow-lg' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
              onClick={() => setViewMode('3d')}
            >
              🌍 3D Globe
            </button>
            <button
              className={`px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
                viewMode === '2d' 
                  ? 'bg-blue-500 text-white shadow-lg' 
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
              onClick={() => setViewMode('2d')}
            >
              🗺️ 2D Globe
            </button>
          </div>
        </div>
      </div>
      
      {/* Contenido según el modo */}
      {viewMode === 'summary' && (
        <Dashboard
          countries={countries}
          geojson={geojson}
          popByCountry={popByCountry}
          gdpByCountry={gdpByCountry}
          setSelectedCountryFromSearch={setSelectedCountryFromSearch}
          selectedCountryFromSearch={selectedCountryFromSearch}
        />
      )}
      
      {viewMode === '3d' && (
        <Globe3D
          countries={countries}
          popByCountry={popByCountry}
          normalizeCountryName={normalizeCountryName}
          onContinentClick={() => {}}
          gdpByCountry={gdpByCountry}
        />
      )}
      
      {viewMode === '2d' && geojson && (
        <Globe2D
          geojson={geojson}
          popByCountry={popByCountry}
          normalizeCountryName={normalizeCountryName}
          gdpByCountry={gdpByCountry}
        />
      )}
    </div>
  );
} 