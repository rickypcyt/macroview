"use client";

import React, { useEffect, useState } from "react";

import { CountrySearch } from "./CountrySearch";
import { GeoJSON } from "geojson";
import { HistoricalLog } from "./HistoricalLog";
import { InflationCountriesList } from "./InflationCountriesList";
import { NewsSection } from "./NewsSection";
import { normalizeCountryName } from "../utils/helpers";

// Inflación cache en memoria
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

function setTariffMapInStorage(map: Record<string, number>) {
  try {
    localStorage.setItem('tariffByIso3', JSON.stringify(map));
  } catch {}
}

function getTariffMapFromStorage(): Record<string, number> | null {
  try {
    const val = localStorage.getItem('tariffByIso3');
    if (val) return JSON.parse(val);
  } catch {}
  return null;
}

type WorldBankCountry = { id: string; name: string };

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

interface DashboardProps {
  countries: GeoJSON.Feature[];
  geojson: GeoJSON.FeatureCollection | null;
  popByCountry: Record<string, number>;
  gdpByCountry: Record<string, number>;
  setSelectedCountryFromSearch: (country: GeoJSON.Feature | null) => void;
  selectedCountryFromSearch: GeoJSON.Feature | null;
}

export function Dashboard({ 
  countries, 
  popByCountry, 
  gdpByCountry, 
  setSelectedCountryFromSearch, 
  selectedCountryFromSearch 
}: DashboardProps) {
  // Nuevo estado para estadísticas de inflación global
  const [globalInflationStats, setGlobalInflationStats] = useState<{
    average: number | null;
    median: number | null;
    highest: { country: string; value: number } | null;
    lowest: { country: string; value: number } | null;
    totalCountries: number;
    loading: boolean;
    distributionData: { countryName: string; inflation: number }[];
    error: string | null;
  }>({
    average: null,
    median: null,
    highest: null,
    lowest: null,
    totalCountries: 0,
    loading: true,
    distributionData: [],
    error: null
  });

  // Nuevo estado para estadísticas de tarifas globales
  const [globalTariffStats, setGlobalTariffStats] = useState<{
    average: number | null;
    median: number | null;
    highest: { country: string; value: number } | null;
    lowest: { country: string; value: number } | null;
    totalCountries: number;
    loading: boolean;
    error: string | null;
  }>({
    average: null,
    median: null,
    highest: null,
    lowest: null,
    totalCountries: 0,
    loading: true,
    error: null
  });

  // Estados para datos del país seleccionado
  const [selectedCountryInflation, setSelectedCountryInflation] = useState<number | null>(null);
  const [selectedCountryTariff, setSelectedCountryTariff] = useState<number | null>(null);
  const [selectedCountryLoading, setSelectedCountryLoading] = useState(false);



  // Nueva función para cargar datos de tarifas globales
  function loadGlobalTariffData() {
    setGlobalTariffStats(prev => ({ ...prev, loading: true, error: null }));
    
    // Fetch global de tarifas del World Bank - Applied Average Tariff Rates (trying different indicator)
    fetch('https://api.worldbank.org/v2/country/all/indicator/TM.TAX.MRCH.SM.AR.ZS?format=json&per_page=300&date=2022')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch tariff data');
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || !Array.isArray(data[1])) {
          throw new Error('Invalid tariff data format');
        }
        
        const validTariffData = data[1].filter((item: { countryiso3code: string; value: number }) => 
          typeof item.countryiso3code === 'string' &&
          typeof item.value === 'number' &&
          item.value > 0
        );
        
        if (validTariffData.length > 0) {
          // Actualizar el cache global
          validTariffData.forEach((item: { countryiso3code: string; value: number }) => {
            tariffByIso3[item.countryiso3code] = item.value;
          });
          setTariffMapInStorage(tariffByIso3);
          
          // Calcular estadísticas
          const values = validTariffData.map((item: { value: number }) => item.value);
          const average = values.reduce((a, b) => a + b, 0) / values.length;
          const sortedValues = [...values].sort((a, b) => a - b);
          const median = sortedValues.length % 2 === 0 
            ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
            : sortedValues[Math.floor(sortedValues.length / 2)];
          
          const highest = validTariffData.reduce((max, current) => 
            current.value > max.value ? current : max
          );
          
          const lowest = validTariffData.reduce((min, current) => 
            current.value < min.value ? current : min
          );
          
          const newStats = {
            average,
            median,
            highest: { country: highest.countryname || highest.countryiso3code, value: highest.value },
            lowest: { country: lowest.countryname || lowest.countryiso3code, value: lowest.value },
            totalCountries: validTariffData.length,
            loading: false,
            error: null
          };
          
          setGlobalTariffStats(newStats);
          

          

        } else {
          setGlobalTariffStats({
            average: null,
            median: null,
            highest: null,
            lowest: null,
            totalCountries: 0,
            loading: false,
            error: 'No tariff data available'
          });
        }
      })
      .catch((error) => {
        setGlobalTariffStats(prev => ({ 
          ...prev, 
          loading: false, 
          error: error.message || 'Failed to load tariff data'
        }));
      });
  }

  // Nueva función para cargar datos de inflación global
  function loadGlobalInflationData(countries: GeoJSON.Feature[]) {
    setGlobalInflationStats(prev => ({ ...prev, loading: true, error: null }));
    
    // Obtener lista de países del World Bank primero
    fetch(`https://api.worldbank.org/v2/country?format=json&per_page=300`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch countries list');
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || !Array.isArray(data[1])) {
          throw new Error('Invalid countries data format');
        }
        
        const worldBankCountries = data[1];
        const inflationPromises: Promise<{ countryName: string; inflation: number | null }>[] = [];
        
        // Crear promesas para obtener inflación de cada país
        countries.forEach((country) => {
          const countryName = country.properties?.name || country.properties?.NAME || country.id;
          if (!countryName || typeof countryName !== 'string') return;
          
          // Verificar cache primero
          if (inflationCache[countryName]) {
            inflationPromises.push(Promise.resolve({ 
              countryName, 
              inflation: inflationCache[countryName] 
            }));
            return;
          }
          
          // Verificar localStorage
          const localInflation = getInflationFromStorage(countryName);
          if (localInflation) {
            inflationCache[countryName] = localInflation;
            inflationPromises.push(Promise.resolve({ 
              countryName, 
              inflation: localInflation 
            }));
            return;
          }
          
          // Buscar país en World Bank
          let found = worldBankCountries.find((c: WorldBankCountry) => 
            c.name && c.name.toLowerCase() === countryName.toLowerCase()
          );
          
          if (!found) {
            // Buscar por alias
            const aliases = WORLD_BANK_NAME_ALIASES[countryName] || [];
            for (const alias of aliases) {
              found = worldBankCountries.find((c: WorldBankCountry) => 
                c.name && c.name.toLowerCase() === alias.toLowerCase()
              );
              if (found) break;
            }
          }
          
          if (!found) {
            // Buscar por código ISO
            const iso2 = country.properties?.ISO_A2 || country.properties?.iso_a2 || country.properties?.iso2;
            if (iso2 && typeof iso2 === 'string') {
              found = worldBankCountries.find((c: WorldBankCountry) => 
                c.id && c.id.toUpperCase() === iso2.toUpperCase()
              );
            }
          }
          
          if (found && found.id) {
            // Fetch inflación
            const promise = fetch(`https://api.worldbank.org/v2/country/${found.id}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1`)
              .then(res => {
                if (!res.ok) throw new Error(`Failed to fetch inflation for ${countryName}`);
                return res.json();
              })
              .then((inflationData) => {
                let inflation = null;
                if (Array.isArray(inflationData) && Array.isArray(inflationData[1]) && inflationData[1][0] && typeof inflationData[1][0].value === 'number') {
                  inflation = inflationData[1][0].value;
                }
                
                if (typeof inflation === 'number') {
                  inflationCache[countryName] = inflation;
                  setInflationInStorage(countryName, inflation);
                }
                
                return { countryName, inflation };
              })
              .catch(() => ({ countryName, inflation: null }));
            
            inflationPromises.push(promise);
          } else {
            inflationPromises.push(Promise.resolve({ countryName, inflation: null }));
          }
        });
        
        // Esperar todas las promesas y calcular estadísticas
        Promise.all(inflationPromises)
          .then((results) => {
            const validInflationData = results.filter(r => r.inflation !== null && typeof r.inflation === 'number');
            const values = validInflationData.map(r => r.inflation as number);
            
            if (values.length > 0) {
              // Calcular estadísticas
              const average = values.reduce((a, b) => a + b, 0) / values.length;
              const sortedValues = [...values].sort((a, b) => a - b);
              const median = sortedValues.length % 2 === 0 
                ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
                : sortedValues[Math.floor(sortedValues.length / 2)];
              
              const highest = validInflationData.reduce((max, current) => 
                (current.inflation as number) > (max.inflation as number) ? current : max
              );
              
              const lowest = validInflationData.reduce((min, current) => 
                (current.inflation as number) < (min.inflation as number) ? current : min
              );
              
              const newStats = {
                average,
                median,
                highest: { country: highest.countryName, value: highest.inflation as number },
                lowest: { country: lowest.countryName, value: lowest.inflation as number },
                totalCountries: validInflationData.length,
                loading: false,
                distributionData: validInflationData.map(r => ({ 
                  countryName: r.countryName, 
                  inflation: r.inflation as number 
                })),
                error: null
              };
              
              setGlobalInflationStats(newStats);
              
              
              

            } else {
              setGlobalInflationStats({
                average: null,
                median: null,
                highest: null,
                lowest: null,
                totalCountries: 0,
                loading: false,
                distributionData: [],
                error: 'No inflation data available'
              });
            }
          })
          .catch((error) => {
            setGlobalInflationStats(prev => ({ 
              ...prev, 
              loading: false, 
              error: error.message || 'Failed to load inflation data'
            }));
          });
      })
      .catch((error) => {
        setGlobalInflationStats(prev => ({ 
          ...prev, 
          loading: false, 
          error: error.message || 'Failed to fetch countries list'
        }));
      });
  }



  // Función para cargar datos del país seleccionado
  function loadSelectedCountryData(country: GeoJSON.Feature) {
    const countryName = country.properties?.name || country.properties?.NAME || country.id;
    const iso3 = country.properties?.ISO_A3 || country.properties?.iso_a3 || country.properties?.iso3;
    
    setSelectedCountryLoading(true);
    setSelectedCountryInflation(null);
    setSelectedCountryTariff(null);

    // Cargar inflación del país
    if (countryName && typeof countryName === 'string') {
      // Verificar cache primero
      if (inflationCache[countryName]) {
        setSelectedCountryInflation(inflationCache[countryName]);
      } else {
        // Verificar localStorage
        const localInflation = getInflationFromStorage(countryName);
        if (localInflation) {
          inflationCache[countryName] = localInflation;
          setSelectedCountryInflation(localInflation);
        } else {
          // Fetch desde API
          fetch(`https://api.worldbank.org/v2/country?format=json&per_page=300`)
            .then(res => res.json())
            .then((data) => {
              if (!Array.isArray(data) || !Array.isArray(data[1])) return;
              let found = data[1].find((c: WorldBankCountry) => 
                c.name && c.name.toLowerCase() === countryName.toLowerCase()
              );
              
              if (!found) {
                // Buscar por alias
                const aliases = WORLD_BANK_NAME_ALIASES[countryName] || [];
                for (const alias of aliases) {
                  found = data[1].find((c: WorldBankCountry) => 
                    c.name && c.name.toLowerCase() === alias.toLowerCase()
                  );
                  if (found) break;
                }
              }
              
              if (found && found.id) {
                return fetch(`https://api.worldbank.org/v2/country/${found.id}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1`)
                  .then(res => res.json())
                  .then((inflationData) => {
                    let inflation = null;
                    if (Array.isArray(inflationData) && Array.isArray(inflationData[1]) && inflationData[1][0] && typeof inflationData[1][0].value === 'number') {
                      inflation = inflationData[1][0].value;
                    }
                    
                    if (typeof inflation === 'number') {
                      inflationCache[countryName] = inflation;
                      setInflationInStorage(countryName, inflation);
                      setSelectedCountryInflation(inflation);
                    }
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
      }
    }

    // Cargar tarifa del país
    if (iso3 && typeof iso3 === 'string') {
      console.log('Loading tariff for ISO3:', iso3); // Debug log
      console.log('Country name:', countryName); // Debug log
      
      // Verificar cache primero
      if (tariffByIso3[iso3]) {
        console.log('Found tariff in cache:', tariffByIso3[iso3]); // Debug log
        setSelectedCountryTariff(tariffByIso3[iso3]);
      } else {
        // Verificar localStorage
        const tariffMap = getTariffMapFromStorage();
        if (tariffMap && tariffMap[iso3]) {
          console.log('Found tariff in localStorage:', tariffMap[iso3]); // Debug log
          tariffByIso3[iso3] = tariffMap[iso3];
          setSelectedCountryTariff(tariffMap[iso3]);
        } else {
          // Fetch desde API
          console.log('Fetching tariff from API for ISO3:', iso3); // Debug log
          fetch('https://api.worldbank.org/v2/country/all/indicator/TM.TAX.MRCH.SM.AR.ZS?format=json&per_page=300&date=2022')
            .then(res => {
              console.log('Tariff API response status:', res.status); // Debug log
              if (!res.ok) throw new Error('Failed to fetch tariff data');
              return res.json();
            })
            .then((data) => {
              console.log('Tariff API data received:', data); // Debug log
              if (!Array.isArray(data) || !Array.isArray(data[1])) {
                console.log('Invalid tariff data format'); // Debug log
                return;
              }
              
              const map: Record<string, number> = {};
              
              // Log all available countries for debugging
              console.log('All available countries in tariff data:');
              data[1].slice(0, 20).forEach((item: { countryname?: string; countryiso3code?: string; value?: number }) => {
                console.log(`- ${item.countryname || 'Unknown'} (${item.countryiso3code || 'N/A'}): ${item.value || 'N/A'}`);
              });
              
              data[1].forEach((item: { countryiso3code: string; value: number; countryname?: string }) => {
                if (typeof item.countryiso3code === 'string' && typeof item.value === 'number') {
                  map[item.countryiso3code] = item.value;
                  if (item.countryiso3code === iso3) {
                    console.log('Found tariff for ISO3:', iso3, 'Value:', item.value, 'Country:', item.countryname); // Debug log
                  }
                }
              });
              
              Object.assign(tariffByIso3, map);
              setTariffMapInStorage(map);
              
              if (map[iso3]) {
                console.log('Setting tariff value:', map[iso3]); // Debug log
                setSelectedCountryTariff(map[iso3]);
              } else {
                console.log('No tariff found for ISO3:', iso3); // Debug log
                console.log('Available ISO3 codes:', Object.keys(map).slice(0, 10)); // Debug log
                
                // Try to find by country name as fallback
                const countryData = data[1].find((item: { countryname?: string; value?: number }) => 
                  item.countryname && item.countryname.toLowerCase().includes(countryName?.toLowerCase() || '')
                );
                if (countryData && countryData.value) {
                  console.log('Found tariff by country name:', countryData.countryname, 'Value:', countryData.value);
                  setSelectedCountryTariff(countryData.value);
                }
              }
            })
            .catch((error) => {
              console.error('Error fetching tariff data:', error); // Debug log
            });
        }
      }
    } else {
      console.log('No ISO3 code available for country:', countryName); // Debug log
    }

    setSelectedCountryLoading(false);
  }

  // Cargar datos del país seleccionado cuando cambie
  useEffect(() => {
    if (selectedCountryFromSearch) {
      loadSelectedCountryData(selectedCountryFromSearch);
    }
  }, [selectedCountryFromSearch]);

  // Cargar datos al montar el componente
  useEffect(() => {
    if (countries.length > 0) {
      loadGlobalInflationData(countries);
      loadGlobalTariffData();
    }
  }, [countries]);

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col overflow-y-auto bg-black">
      {/* Header Card */}
      <div className="w-full p-6 pt-8 px-12">
        <div className="w-full">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20">
            <h1 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              🌐 Global Financial Dashboard
            </h1>
            <p className="text-gray-300 text-center text-lg">
              Real-time economic indicators and global financial data
            </p>
          </div>
        </div>
      </div>

      {/* Search Card */}
      <div className="w-full px-12 mb-6">
        <div className="w-full">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20">
            <CountrySearch 
              countries={countries} 
              gdpByCountry={gdpByCountry} 
              inflationCache={inflationCache} 
              onCountryClick={setSelectedCountryFromSearch} 
            />
          </div>
        </div>
      </div>

      {/* Selected Country Info Card */}
      {selectedCountryFromSearch && (
        <div className="w-full px-12 mb-6">
          <div className="w-full">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-white">
                  {selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id}
                </h2>
                <button
                  className="text-white text-xl font-bold hover:text-green-400 focus:outline-none transition-colors"
                  onClick={() => setSelectedCountryFromSearch(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {/* GDP */}
                <div className="text-center p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-lg text-gray-300 font-semibold mb-2">💰 GDP (USD)</div>
                  <div className="text-xl font-bold text-green-400">
                    {gdpByCountry[selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id || ''] 
                      ? `$${gdpByCountry[selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id || ''].toLocaleString()}`
                      : <span className="text-gray-400">Not available</span>}
                  </div>
                </div>

                {/* Population */}
                <div className="text-center p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-lg text-gray-300 font-semibold mb-2">👥 Population</div>
                  <div className="text-xl font-bold text-blue-400">
                    {popByCountry[normalizeCountryName(selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id || '')]
                      ? popByCountry[normalizeCountryName(selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id || '')].toLocaleString()
                      : <span className="text-gray-400">Not available</span>}
                  </div>
                </div>

                {/* Continent */}
                <div className="text-center p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-lg text-gray-300 font-semibold mb-2">🌍 Continent</div>
                  <div className="text-xl font-bold text-purple-400">
                    {selectedCountryFromSearch.properties?.continent || <span className="text-gray-400">Not available</span>}
                  </div>
                </div>
              </div>

              {/* Additional Info Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Inflation */}
                <div className="text-center p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-lg text-gray-300 font-semibold mb-2">📈 Inflation (%)</div>
                  <div className="text-xl font-bold text-yellow-400">
                    {selectedCountryLoading ? 'Loading...' :
                     selectedCountryInflation !== null ? 
                       `${selectedCountryInflation.toFixed(2)}%` : 
                       <span className="text-gray-400">Not available</span>}
                  </div>
                </div>

                {/* Tariff */}
                <div className="text-center p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-lg text-gray-300 font-semibold mb-2">🏛️ Applied Average Tariff (%)</div>
                  <div className="text-xl font-bold text-blue-400">
                    {selectedCountryLoading ? 'Loading...' :
                     selectedCountryTariff !== null ? 
                       `${selectedCountryTariff.toFixed(2)}%` : 
                       <span className="text-gray-400">Not available</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Dashboard Grid */}
      <div className="w-full px-12 pb-8">
        <div className="w-full space-y-6">
          {/* Financial Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* GDP Card */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
              <div className="text-center">
                <div className="text-2xl mb-2">💰</div>
                <div className="text-lg font-medium text-gray-300 mb-2">Global GDP (USD)</div>
                <div className="text-2xl md:text-3xl font-bold text-green-400">
                  {Object.values(gdpByCountry).length > 0
                    ? `$${(Object.values(gdpByCountry).reduce((a, b) => a + b, 0) / 1e12).toFixed(2)}T`
                    : 'Loading...'}
                </div>
                <div className="text-sm text-gray-400 mt-2">
                  Total economic output
                </div>
              </div>
            </div>

            {/* Inflation Card */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
              <div className="text-center">
                <div className="text-2xl mb-2">📈</div>
                <div className="text-lg font-medium text-gray-300 mb-2">Global Inflation (%)</div>
                <div className="text-2xl md:text-3xl font-bold text-yellow-400">
                  {globalInflationStats.loading ? 'Loading...' :
                   globalInflationStats.error ? 'Error' :
                   globalInflationStats.average !== null ? 
                     `${globalInflationStats.average.toFixed(2)}%` : 
                     'Not available'}
                </div>
                {globalInflationStats.totalCountries > 0 && (
                  <div className="text-sm text-gray-400 mt-2">
                    Based on {globalInflationStats.totalCountries} countries
                  </div>
                )}
                {globalInflationStats.error && (
                  <div className="text-sm text-red-400 mt-2">
                    {globalInflationStats.error}
                  </div>
                )}
              </div>
            </div>

            {/* Tariff Card */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
              <div className="text-center">
                <div className="text-2xl mb-2">🏛️</div>
                <div className="text-lg font-medium text-gray-300 mb-2">Applied Average Tariff (%)</div>
                <div className="text-2xl md:text-3xl font-bold text-blue-400">
                  {globalTariffStats.loading ? 'Loading...' :
                   globalTariffStats.error ? 'Error' :
                   globalTariffStats.average !== null ? 
                     `${globalTariffStats.average.toFixed(2)}%` : 
                     'Not available'}
                </div>
                {globalTariffStats.totalCountries > 0 && (
                  <div className="text-sm text-gray-400 mt-2">
                    Based on {globalTariffStats.totalCountries} countries
                  </div>
                )}
                {globalTariffStats.error && (
                  <div className="text-sm text-red-400 mt-2">
                    {globalTariffStats.error}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Detailed Inflation Statistics - 3 Columns */}
          {!globalInflationStats.loading && globalInflationStats.totalCountries > 0 && !globalInflationStats.error && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Statistics Card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20">
                <h2 className="text-xl md:text-2xl font-semibold mb-4 text-center text-white">📊 Statistics</h2>
                <div className="space-y-3">
                  <div className="text-center p-3 bg-white/5 rounded-xl">
                    <div className="text-base font-medium text-gray-300 mb-1">Average</div>
                    <div className="text-xl font-bold text-yellow-400">
                      {globalInflationStats.average?.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded-xl">
                    <div className="text-base font-medium text-gray-300 mb-1">Median</div>
                    <div className="text-xl font-bold text-yellow-400">
                      {globalInflationStats.median?.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded-xl">
                    <div className="text-base font-medium text-gray-300 mb-1">Highest</div>
                    <div className="text-lg font-bold text-red-400">
                      {globalInflationStats.highest?.value.toFixed(2)}%
                    </div>
                    <div className="text-sm text-gray-300">
                      {globalInflationStats.highest?.country}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded-xl">
                    <div className="text-base font-medium text-gray-300 mb-1">Lowest</div>
                    <div className="text-lg font-bold text-green-400">
                      {globalInflationStats.lowest?.value.toFixed(2)}%
                    </div>
                    <div className="text-sm text-gray-300">
                      {globalInflationStats.lowest?.country}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Highest Inflation Countries */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20">
                <InflationCountriesList 
                  inflationData={globalInflationStats.distributionData} 
                  title="🔥 Highest" 
                  type="highest" 
                />
              </div>

              {/* Lowest Inflation Countries */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20">
                <InflationCountriesList 
                  inflationData={globalInflationStats.distributionData} 
                  title="❄️ Lowest" 
                  type="lowest" 
                />
              </div>
            </div>
          )}
          
          {/* Historical Log Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20">
            <HistoricalLog />
          </div>

          {/* News Section Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/20">
            <NewsSection />
          </div>
        </div>
      </div>
    </div>
  );
} 