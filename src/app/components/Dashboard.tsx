"use client";

import React, { useEffect, useState } from "react";

import { CountrySearch } from "./CountrySearch";
import type * as GeoJSON from "geojson";
import { HistoricalLog } from "./HistoricalLog";
import { NewsSection } from "./NewsSection";
import { getCachedGlobalGDP } from "../utils/worldBankApi";
import { normalizeCountryName } from "../utils/helpers";

// Inflación cache en memoria
const inflationCache: Record<string, number> = {};
// Tariff cache en memoria
const tariffCache: Record<string, number> = {};

function getTariffMapFromStorage(): Record<string, number> | null {
  try {
    const val = localStorage.getItem('tariffByIso3');
    if (val) return JSON.parse(val);
  } catch {}
  return null;
}

interface DashboardProps {
  countries: GeoJSON.Feature[];
  geojson: GeoJSON.FeatureCollection | null;
  popByCountry: Record<string, number>;
  gdpByCountry: Record<string, number>;
  setSelectedCountryFromSearch: (country: GeoJSON.Feature | null) => void;
  selectedCountryFromSearch: GeoJSON.Feature | null;
  loadGDPForCountry: (countryName: string) => Promise<void>;
}

export function Dashboard({ 
  countries, 
  popByCountry, 
  gdpByCountry, 
  setSelectedCountryFromSearch, 
  selectedCountryFromSearch,
  loadGDPForCountry
}: DashboardProps) {
  // Estado para el PIB global
  const [globalGDP, setGlobalGDP] = useState<{
    value: number | null;
    year: string | null;
    source: string;
    loading: boolean;
    error: string | null;
  }>({
    value: null,
    year: null,
    source: '',
    loading: true,
    error: null
  });

  // Obtener el PIB global al montar el componente
  useEffect(() => {
    const fetchGlobalGDP = async () => {
      try {
        setGlobalGDP(prev => ({ ...prev, loading: true, error: null }));
        // World Bank only (cached)
        const wbRes = await getCachedGlobalGDP();
        setGlobalGDP({
          value: wbRes.value,
          year: wbRes.year,
          source: wbRes.source,
          loading: false,
          error: null
        });
      } catch (error) {
        setGlobalGDP(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load global GDP data'
        }));
      }
    };

    fetchGlobalGDP();
  }, []);

  // Estados para datos globales
  const [globalInflationStats, setGlobalInflationStats] = useState<{
    average: number | null;
    highest: { country: string; value: number } | null;
    lowest: { country: string; value: number } | null;
    distributionData: { countryName: string; inflation: number }[];
    loading: boolean;
    error: string | null;
  }>({
    average: null,
    highest: null,
    lowest: null,
    distributionData: [],
    loading: true,
    error: null
  });

  // Estados para país seleccionado
  const [selectedCountryInflation, setSelectedCountryInflation] = useState<number | null>(null);
  const [selectedCountryTariff, setSelectedCountryTariff] = useState<number | null>(null);
  const [selectedCountryLoading, setSelectedCountryLoading] = useState(false);

  // Global trade flows stats
  const [globalTradeStats, setGlobalTradeStats] = useState<{
    loading: boolean;
    value: number | null;
    error: string | null;
    year: string | null;
  }>({
    loading: false,
    value: null,
    error: null,
    year: null
  });

  // Global external debt stats
  const [globalDebtStats, setGlobalDebtStats] = useState<{
    loading: boolean;
    value: number | null;
    error: string | null;
    year: string | null;
  }>({
    loading: false,
    value: null,
    error: null,
    year: null
  });

  // Función para cargar datos de inflación globales (World Bank primero para promedio rápido; distribución en segundo plano)
  async function loadGlobalInflationData() {
    // Paso 1: obtener promedio global rápido desde WLD (World aggregate)
    try {
      const wldRes = await fetch('https://api.worldbank.org/v2/country/WLD/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1');
      const wldJson = await wldRes.json();
      const series = Array.isArray(wldJson) && Array.isArray(wldJson[1]) ? wldJson[1] : [];
      const latest = series && series[0] && typeof series[0].value === 'number' ? series[0] : null;
      const avg = latest ? (latest.value as number) : null;

      setGlobalInflationStats(prev => ({
        ...prev,
        average: avg,
        loading: false,
        error: null
      }));
    } catch (e) {
      console.warn('Fast WB WLD inflation fetch failed:', e);
      setGlobalInflationStats(prev => ({ ...prev, loading: false }));
    }

    // Paso 2 (background): cargar distribución/altos/bajos (puede tardar más)
    try {
      const response = await fetch('https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL.ZG?format=json&per_page=200&date=2022');
      const data = await response.json();

      if (Array.isArray(data) && Array.isArray(data[1])) {
        interface WbIndicatorItem { value: number | null }
        const inflationValues = (data[1] as WbIndicatorItem[])
          .map(item => (item && typeof item.value === 'number') ? item.value : null)
          .filter((v): v is number => v !== null);

        if (inflationValues.length > 0) {
          const highestVal = Math.max(...inflationValues);
          const lowestVal = Math.min(...inflationValues);
          const highest = { country: 'Highest', value: highestVal };
          const lowest = { country: 'Lowest', value: lowestVal };
          const distributionData = inflationValues.slice(0, 100).map((v, idx) => ({ countryName: `#${idx+1}`, inflation: v }));

          setGlobalInflationStats(prev => ({
            ...prev,
            highest,
            lowest,
            distributionData,
          }));
        }
      }
    } catch (error) {
      console.warn('Background WB distribution fetch failed:', error);
    }
  }

  // Función para cargar inflación de un país
  async function loadInflationForCountry(countryName: string) {
    if (inflationCache[countryName] !== undefined) {
      return inflationCache[countryName];
    }

    try {
    // Buscar el país en World Bank
    const response = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=300');
    const data = await response.json();
    
    if (!Array.isArray(data) || !Array.isArray(data[1])) {
      return null;
    }

    type WbCountry = { id?: string; name?: string };
    const wbCountries = data[1] as WbCountry[];
    const found = wbCountries.find(c => c.name && normalizeCountryName(c.name) === normalizeCountryName(countryName));
    if (!found || !found.id) {
      return null;
    }
    // World Bank CPI inflation (FP.CPI.TOTL.ZG)
    try {
      const inflationResponse = await fetch(
        `https://api.worldbank.org/v2/country/${found.id}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1`
      );
      const inflationData = await inflationResponse.json();
      if (Array.isArray(inflationData) && Array.isArray(inflationData[1]) && inflationData[1][0] && typeof inflationData[1][0].value === 'number') {
        const inflation = inflationData[1][0].value;
        inflationCache[countryName] = inflation;
        return inflation;
      }
    } catch (wbErr) {
      console.warn('WB inflation fetch failed:', wbErr);
    }

    return null;
    } catch (error) {
      console.error('Error loading inflation for', countryName, error);
      return null;
    }
  }

  // Función para cargar aranceles de un país
  async function loadTariffForCountry(countryName: string) {
    if (tariffCache[countryName] !== undefined) {
      return tariffCache[countryName];
    }

    try {
      // Buscar el país en World Bank
      const response = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=300');
      const data = await response.json();
      
      if (!Array.isArray(data) || !Array.isArray(data[1])) {
        return null;
      }

      type WbCountry = { id?: string; name?: string };
      const wbCountries = data[1] as WbCountry[];
      let found = wbCountries.find((c) => c.name && c.name.toLowerCase() === countryName.toLowerCase());
      if (!found) {
        // Buscar por nombre normalizado (sin espacios, minúsculas, etc)
        const normalized = countryName.toLowerCase().replace(/[^a-z]/g, "");
        found = wbCountries.find((c) => c.name && c.name.toLowerCase().replace(/[^a-z]/g, "") === normalized);
      }

      if (!found || !found.id) {
        return null;
      }

      // Obtener datos de aranceles (Applied Average Tariff)
      const tariffResponse = await fetch(
        `https://api.worldbank.org/v2/country/${found.id}/indicator/TM.TAX.MRCH.SM.AR.ZS?format=json&per_page=1`
      );
      const tariffData = await tariffResponse.json();
      
      if (Array.isArray(tariffData) && Array.isArray(tariffData[1]) && tariffData[1][0] && typeof tariffData[1][0].value === 'number') {
        const tariff = tariffData[1][0].value;
        tariffCache[countryName] = tariff;
        return tariff;
      }

      return null;
    } catch (error) {
      console.error('Error loading tariff for', countryName, error);
      return null;
    }
  }

  // Función para cargar datos del país seleccionado
  const loadSelectedCountryData = React.useCallback(async (country: GeoJSON.Feature) => {
    const countryName = country.properties?.name || country.properties?.NAME || country.id;
    if (!countryName) return;

    setSelectedCountryLoading(true);
    
    // Cargar inflación
    let inflation = inflationCache[countryName];
    if (inflation === undefined || inflation === null || isNaN(inflation)) {
      inflation = await loadInflationForCountry(countryName);
      if (inflation !== null) {
        setSelectedCountryInflation(inflation);
      } else {
        setSelectedCountryInflation(null);
      }
    } else {
      setSelectedCountryInflation(inflation);
    }
    
    // Cargar tarifa
    const tariffMap = getTariffMapFromStorage();
    if (tariffMap && tariffMap[countryName] !== undefined && tariffMap[countryName] !== null && !isNaN(tariffMap[countryName])) {
      setSelectedCountryTariff(tariffMap[countryName]);
    } else {
      setSelectedCountryTariff(null);
    }
    
    setSelectedCountryLoading(false);
  }, []);

  // Cargar datos cuando cambie el país seleccionado
  useEffect(() => {
    if (selectedCountryFromSearch) {
      loadSelectedCountryData(selectedCountryFromSearch);
    }
  }, [selectedCountryFromSearch, loadSelectedCountryData]);

  // Función para cargar datos de flujos comerciales globales
  async function loadGlobalTradeData() {
    setGlobalTradeStats(prev => ({ ...prev, loading: true }));
    try {
      // Usar World Bank API para datos de comercio (TG.VAL.TOTL.GD.ZS - Trade as % of GDP)
      const response = await fetch('https://api.worldbank.org/v2/country/all/indicator/TG.VAL.TOTL.GD.ZS?format=json&per_page=200&date=2021');
      const data = await response.json();
      
      if (Array.isArray(data) && Array.isArray(data[1])) {
        interface WbIndicatorItem { value: number | null }
        const tradeValues = (data[1] as WbIndicatorItem[])
          .filter((item: WbIndicatorItem) => item.value !== null && !isNaN(item.value as number) && (item.value as number) > 0)
          .map((item: WbIndicatorItem) => item.value as number);
        
        if (tradeValues.length > 0) {
          const average = tradeValues.reduce((sum, val) => sum + val, 0) / tradeValues.length;
          setGlobalTradeStats({
            loading: false,
            value: average,
            error: null,
            year: '2021'
          });
        } else {
          setGlobalTradeStats({
            loading: false,
            value: null,
            error: 'No trade data available',
            year: null
          });
        }
      }
    } catch (error) {
      console.error('Error loading global trade data:', error);
      setGlobalTradeStats({
        loading: false,
        value: null,
        error: 'Failed to load trade data',
        year: null
      });
    }
  }

  // Función para cargar datos de deuda externa global
  async function loadGlobalDebtData() {
    setGlobalDebtStats(prev => ({ ...prev, loading: true }));
    try {
      // Usar World Bank API para datos de deuda externa (DT.DOD.DECT.CD - External debt stocks)
      const response = await fetch('https://api.worldbank.org/v2/country/all/indicator/DT.DOD.DECT.CD?format=json&per_page=200&date=2021');
      const data = await response.json();
      
      if (Array.isArray(data) && Array.isArray(data[1])) {
        interface WbIndicatorItem { value: number | null }
        const debtValues = (data[1] as WbIndicatorItem[])
          .filter((item: WbIndicatorItem) => item.value !== null && !isNaN(item.value as number) && (item.value as number) > 0)
          .map((item: WbIndicatorItem) => item.value as number);
        
        if (debtValues.length > 0) {
          const totalDebt = debtValues.reduce((sum, val) => sum + val, 0);
          setGlobalDebtStats({
            loading: false,
            value: totalDebt,
            error: null,
            year: '2021'
          });
        } else {
          setGlobalDebtStats({
            loading: false,
            value: null,
            error: 'No debt data available',
            year: null
          });
        }
      }
    } catch (error) {
      console.error('Error loading global debt data:', error);
      setGlobalDebtStats({
        loading: false,
        value: null,
        error: 'Failed to load debt data',
        year: null
      });
    }
  }

  // Cargar datos globales cuando los países estén disponibles
  useEffect(() => {
    if (countries.length > 0) {
      loadGlobalInflationData();
      loadGlobalTradeData();
      loadGlobalDebtData();
    }
  }, [countries]);

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col overflow-y-auto bg-black">
      {/* Header Card */}
      <div className="w-full p-4 sm:p-6 md:p-8 lg:p-12 pt-4 sm:pt-6 md:pt-8 lg:pt-8 pb-2 sm:pb-4 md:pb-4 lg:pb-4 px-4 sm:px-6 md:px-12 lg:px-24">
        <div className="w-full">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 lg:p-12 border border-white/20">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-2 sm:mb-3 md:mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              🌐 Global Financial Dashboard
            </h1>
            <p className="text-gray-300 text-center text-sm sm:text-base md:text-lg">
              Real-time economic indicators and global financial data
            </p>
          </div>
        </div>
      </div>

      {/* Search Card */}
      <div className="w-full px-4 sm:px-6 md:px-12 lg:px-24 mb-6 sm:mb-2 md:mb-4 lg:mb-4">
        <div className="w-full">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 lg:p-12 border border-white/20">
            <CountrySearch 
              countries={countries} 
              gdpByCountry={gdpByCountry} 
              popByCountry={popByCountry}
              inflationCache={inflationCache} 
              tariffCache={tariffCache}
              onCountryClick={setSelectedCountryFromSearch}
              loadGDPForCountry={loadGDPForCountry}
              loadInflationForCountry={loadInflationForCountry}
              loadTariffForCountry={loadTariffForCountry}
              gdpSourceLabel="World Bank (NY.GDP.MKTP.CD)"
              populationSourceLabel="CountriesNow API"
            />
          </div>
        </div>
      </div>

      {/* Selected Country Info Card */}
      {selectedCountryFromSearch && (
        <div className="w-full px-4 sm:px-6 md:px-12 lg:px-24 mb-6 sm:mb-8 md:mb-10 lg:mb-12">
          <div className="w-full">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 lg:p-12 border border-white/20">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">
                  {selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id}
                </h2>
                <button
                  className="text-white text-lg sm:text-xl font-bold hover:text-green-400 focus:outline-none transition-colors"
                  onClick={() => setSelectedCountryFromSearch(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
                {/* GDP */}
                <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">💰 GDP (USD)</div>
                  <div className="text-base sm:text-lg md:text-xl font-bold text-green-400">
                    {gdpByCountry[selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id || ''] 
                      ? `$${gdpByCountry[selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id || ''].toLocaleString()}`
                      : <span className="text-gray-400">Not available</span>}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">World Bank - NY.GDP.MKTP.CD</div>
                </div>

                {/* Population */}
                <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">👥 Population</div>
                  <div className="text-base sm:text-lg md:text-xl font-bold text-blue-400">
                    {popByCountry[normalizeCountryName(selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id || '')]
                      ? popByCountry[normalizeCountryName(selectedCountryFromSearch.properties?.name || selectedCountryFromSearch.properties?.NAME || selectedCountryFromSearch.id || '')].toLocaleString()
                      : <span className="text-gray-400">Not available</span>}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">CountriesNow API</div>
                </div>

                {/* Continent */}
                <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">🌍 Continent</div>
                  <div className="text-base sm:text-lg md:text-xl font-bold text-purple-400">
                    {selectedCountryFromSearch.properties?.continent || <span className="text-gray-400">Not available</span>}
                  </div>
                </div>
              </div>

              {/* Additional Info Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Inflation */}
                <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">📈 Inflation (%)</div>
                  <div className="text-base sm:text-lg md:text-xl font-bold text-yellow-400">
                    {selectedCountryLoading ? 'Loading...' :
                     selectedCountryInflation !== null ? 
                       `${selectedCountryInflation.toFixed(2)}%` : 
                       <span className="text-gray-400">Not available</span>}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">IMF IFS - CPI inflation (PCPIPCH); WB fallback when unavailable</div>
                </div>

                {/* Tariff */}
                <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">🏛️ Applied Average Tariff (%)</div>
                  <div className="text-base sm:text-lg md:text-xl font-bold text-blue-400">
                    {selectedCountryLoading ? 'Loading...' :
                     selectedCountryTariff !== null ? 
                       `${selectedCountryTariff.toFixed(2)}%` : 
                       <span className="text-gray-400">Not available</span>}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">World Bank - TM.TAX.MRCH.SM.AR.ZS</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Dashboard Grid */}
      <div className="w-full px-4 sm:px-6 md:px-16 lg:px-24 pb-8 sm:pb-12 md:pb-14 lg:pb-16">
        <div className="w-full space-y-6 sm:space-y-8">
          {/* Chart and Global Stats Layout */}
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 md:gap-8 h-full">
            {/* Historical Chart - Takes remaining space */}
            <div className="flex-1 min-h-[500px] lg:min-h-[600px]">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 border border-white/20 h-full">
                <HistoricalLog />
              </div>
            </div>

            {/* Global Stats Cards - Stack vertically on mobile, 2x2 grid on md, vertical sidebar on lg+ */}
            <div className="w-full lg:w-80 flex flex-col gap-3 sm:gap-6 h-full md:grid md:grid-cols-2 md:gap-4 md:auto-rows-fr lg:flex">
              {/* GDP Card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 flex-1 flex flex-col">
                <div className="text-center">
                  <div className="text-lg sm:text-xl mb-1 sm:mb-2">💰</div>
                  <div className="text-xs sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">
                    Global GDP (USD{globalGDP.year ? `, ${globalGDP.year}` : ''})
                  </div>
                  <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-green-400">
                    {globalGDP.loading 
                      ? 'Loading...' 
                      : globalGDP.error 
                        ? 'Error loading data' 
                        : `$${(globalGDP.value! / 1e12).toFixed(2)}T`
                    }
                  </div>
                  <div className="text-xs text-gray-400 mt-1 sm:mt-2">
                    {globalGDP.source || 'Loading source...'}
                  </div>
                </div>
              </div>

              {/* Inflation Card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 flex-1 flex flex-col">
                <div className="text-center">
                  <div className="text-lg sm:text-xl mb-1 sm:mb-2">📈</div>
                  <div className="text-xs sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Global Inflation (%)</div>
                  <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-yellow-400">
                    {globalInflationStats.loading ? 'Loading...' :
                     globalInflationStats.error ? 'Error' :
                     globalInflationStats.average !== null ? 
                       `${globalInflationStats.average.toFixed(2)}%` : 
                       'Not available'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 sm:mt-2">
                    World Bank - Consumer Price Index (2022)
                  </div>
                  {globalInflationStats.distributionData.length > 0 && (
                    <div className="text-xs text-gray-400 mt-1 sm:mt-2">
                      Based on {globalInflationStats.distributionData.length} countries
                    </div>
                  )}
                  {globalInflationStats.error && (
                    <div className="text-xs text-red-400 mt-1 sm:mt-2">
                      {globalInflationStats.error}
                    </div>
                  )}
                </div>
              </div>

              {/* Trade Flows Card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 flex-1 flex flex-col">
                <div className="text-center">
                  <div className="text-lg sm:text-xl mb-1 sm:mb-2">🌐</div>
                  <div className="text-xs sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Global Trade Flows (%)</div>
                  <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-purple-400">
                    {globalTradeStats.loading ? 'Loading...' :
                     globalTradeStats.error ? 'Error' :
                     globalTradeStats.value !== null ? 
                       `${globalTradeStats.value.toFixed(1)}%` : 
                       'Not available'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 sm:mt-2">
                    World Bank - Trade as % of GDP (2021)
                  </div>
                  {globalTradeStats.error && (
                    <div className="text-xs text-red-400 mt-1 sm:mt-2">
                      {globalTradeStats.error}
                    </div>
                  )}
                </div>
              </div>

              {/* Empty Card for Balance */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 flex-1 flex flex-col">
                <div className="text-center">
                  <div className="text-lg sm:text-xl mb-1 sm:mb-2">🏦</div>
                  <div className="text-xs sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Global External Debt</div>
                  <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-red-400">
                    {globalDebtStats.loading ? 'Loading...' :
                     globalDebtStats.error ? 'Error' :
                     globalDebtStats.value !== null ? 
                       `$${(globalDebtStats.value / 1e12).toFixed(2)}T` : 
                       'Not available'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 sm:mt-2">
                    World Bank - External Debt Stocks (2021)
                  </div>
                  {globalDebtStats.error && (
                    <div className="text-xs text-red-400 mt-1 sm:mt-2">
                      {globalDebtStats.error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Detailed Inflation Statistics removed per user request */}
          
          {/* News Section Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
            <NewsSection />
          </div>

          {/* Data Sources Card - Responsive layout */}
      <div className="w-full ">
        <div className="w-full mx-auto">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <span className="text-2xl">📊</span>
              <h2 className="text-xl font-semibold text-white">Data Sources</h2>
            </div>
            <p className="text-sm text-gray-400 text-center mb-6">Explore our trusted data providers</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* World Bank Card */}
              <a 
                href="https://data.worldbank.org/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-2">🌍</div>
                  <h3 className="font-medium text-gray-200">World Bank</h3>
                  <p className="text-xs text-gray-400 mt-1">Open Data</p>
                </div>
              </a>
              
              {/* IMF Card */}
              <a 
                href="https://www.imf.org/en/Data" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-2">📈</div>
                  <h3 className="font-medium text-gray-200">IMF</h3>
                  <p className="text-xs text-gray-400 mt-1">World Economic Outlook</p>
                </div>
              </a>
              
              {/* NewsAPI Card */}
              <a 
                href="https://newsapi.org/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="text-2xl mb-2">📰</div>
                  <h3 className="font-medium text-gray-200">NewsAPI</h3>
                  <p className="text-xs text-gray-400 mt-1">News Headlines</p>
                </div>
              </a>
            </div>
            
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-400">Data is cached for performance and may be delayed</p>
            </div>
          </div>
        </div>
      </div>

        </div>
      </div>
      
      
    </div>
  );
}