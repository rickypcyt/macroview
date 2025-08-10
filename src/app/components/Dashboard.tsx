"use client";

import React, { useEffect, useState } from "react";

import type * as GeoJSON from "geojson";
import { HistoricalLog } from "./HistoricalLog";
import { NewsSection } from "./NewsSection";
import { getCachedGlobalGDP } from "../utils/worldBankApi";
import { getGFS_TradeTaxesProxyLatestPercent } from "../utils/imfApi";
import { normalizeCountryName } from "../utils/helpers";
import { SearchCard } from "./SearchCard";
import { SelectedCountryCard } from "./SelectedCountryCard";
import { GlobalStatsSidebar } from "./GlobalStatsSidebar";
import { DataSourcesCard } from "./DataSourcesCard";

// Inflación cache en memoria
const inflationCache: Record<string, number> = {};
// Tariff cache en memoria
const tariffCache: Record<string, number> = {};
// Track tariff data source by country
const tariffSourceByCountry: Record<string, 'IMF_GFS' | 'WB' | undefined> = {};

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
  const [selectedCountryTariffSource, setSelectedCountryTariffSource] = useState<string | null>(null);

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

  // Función para cargar tarifa de un país (IMF GFS proxy preferido; fallback a World Bank)
  async function loadTariffForCountry(countryName: string) {
    if (tariffCache[countryName] !== undefined) {
      return tariffCache[countryName];
    }

    try {
      // Buscar el país en World Bank para obtener el código (ISO2)
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

      // Prefer: IMF GFS proxy - Taxes on international trade (% of GDP)
      try {
        const imfProxy = await getGFS_TradeTaxesProxyLatestPercent(found.id);
        if (imfProxy && imfProxy.value !== null && !isNaN(imfProxy.value)) {
          tariffCache[countryName] = imfProxy.value;
          tariffSourceByCountry[countryName] = 'IMF_GFS';
          return imfProxy.value;
        }
      } catch (e) {
        console.warn('IMF GFS proxy fetch failed:', e);
      }

      // Fallback: World Bank Applied Average Tariff (%), TM.TAX.MRCH.SM.AR.ZS
      try {
        const tariffResponse = await fetch(
          `https://api.worldbank.org/v2/country/${found.id}/indicator/TM.TAX.MRCH.SM.AR.ZS?format=json&per_page=1`
        );
        const tariffData = await tariffResponse.json();
        if (Array.isArray(tariffData) && Array.isArray(tariffData[1]) && tariffData[1][0] && typeof tariffData[1][0].value === 'number') {
          const tariff = tariffData[1][0].value;
          tariffCache[countryName] = tariff;
          tariffSourceByCountry[countryName] = 'WB';
          return tariff;
        }
      } catch (e) {
        console.warn('WB tariff fetch failed:', e);
      }

      return null;
    } catch (error) {
      console.error('Error loading tariff for', countryName, error);
      return null;
    }
  }

  // Función para cargar datos de un país seleccionado (por nombre normalizado)
  async function loadSelectedCountryData(countryName: string) {
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
    try {
      let tariff = tariffCache[countryName];
      if (tariff === undefined || tariff === null || isNaN(tariff)) {
        tariff = await loadTariffForCountry(countryName);
      }
      if (tariff !== null && tariff !== undefined && !isNaN(tariff)) {
        setSelectedCountryTariff(tariff);
        const src = tariffSourceByCountry[countryName] ?? null;
        setSelectedCountryTariffSource(src);
      } else {
        setSelectedCountryTariff(null);
        setSelectedCountryTariffSource(null);
      }
    } catch (e) {
      console.warn('Tariff load failed for', countryName, e);
      setSelectedCountryTariff(null);
      setSelectedCountryTariffSource(null);
    }
    
    setSelectedCountryLoading(false);
  }

  // Cargar datos cuando cambie el país seleccionado
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedCountryFromSearch) {
      const props = (selectedCountryFromSearch.properties ?? {}) as { name?: unknown; NAME?: unknown };
      const nameKey =
        (typeof props.name === 'string' && props.name) ||
        (typeof props.NAME === 'string' && props.NAME) ||
        (selectedCountryFromSearch.id != null ? String(selectedCountryFromSearch.id) : "");
      if (nameKey) {
        loadSelectedCountryData(nameKey);
      }
    }
  }, [selectedCountryFromSearch]);

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
              🌐 Global macroeconomic overview
            </h1>
            <p className="text-gray-300 text-center text-sm sm:text-base md:text-lg">
              Real-time economic indicators and global financial data
            </p>
          </div>
        </div>
      </div>

      {/* Search Card */}
      <SearchCard
        countries={countries}
        gdpByCountry={gdpByCountry}
        popByCountry={popByCountry}
        inflationCache={inflationCache}
        tariffCache={tariffCache}
        onCountryClick={setSelectedCountryFromSearch}
        loadGDPForCountry={loadGDPForCountry}
        loadInflationForCountry={loadInflationForCountry}
        loadTariffForCountry={loadTariffForCountry}
        gdpSourceLabel="IMF (WEO NGDPD)"
        populationSourceLabel="CountriesNow API"
      />

      {/* Selected Country Info Card */}
      {selectedCountryFromSearch && (
        <SelectedCountryCard
          selectedCountryFromSearch={selectedCountryFromSearch}
          setSelectedCountryFromSearch={setSelectedCountryFromSearch}
          gdpByCountry={gdpByCountry}
          popByCountry={popByCountry}
          selectedCountryInflation={selectedCountryInflation}
          selectedCountryTariff={selectedCountryTariff}
          selectedCountryTariffSource={selectedCountryTariffSource}
          selectedCountryLoading={selectedCountryLoading}
        />
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

            {/* Global Stats Cards - moved to sidebar component */}
            <GlobalStatsSidebar
              globalGDP={globalGDP}
              globalInflationStats={globalInflationStats}
              globalTradeStats={globalTradeStats}
              globalDebtStats={globalDebtStats}
            />
          </div>
          
          {/* Detailed Inflation Statistics removed per user request */}
          
          {/* News Section Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
            <NewsSection />
          </div>

          {/* Data Sources Card */}
          <DataSourcesCard />

        </div>
      </div>
      
      
    </div>
  );
}