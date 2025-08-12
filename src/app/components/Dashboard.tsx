"use client";

import type * as GeoJSON from "geojson";

import React, { useCallback, useEffect, useState } from "react";
import { getCachedGlobalWEO_GDP, getIMF_Inflation2025WithFallbackByIso2 } from "../utils/imfApi";

import { DataSourcesCard } from "./DataSourcesCard";
import { GlobalStatsSidebar } from "./GlobalStatsSidebar";
import { HistoricalLog } from "./HistoricalLog";
import { NewsSection } from "./NewsSection";
import { SearchCard } from "./SearchCard";
import { SelectedCountryCard } from "./SelectedCountryCard";
import { normalizeCountryName } from "../utils/helpers";

// Inflación cache en memoria
const inflationCache: Record<string, number> = {};
// (Tariff removed per user request)

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
  // World Bank countries cache for faster search + canonical ISO2 mapping
  const [wbCountries, setWbCountries] = useState<GeoJSON.Feature[]>([]);
  const [wbIso2ByName, setWbIso2ByName] = useState<Record<string, string>>({});

  const isValidNum = (v: unknown): v is number => typeof v === 'number' && !isNaN(v);
  // Helper: map countryName -> ISO2 using provided GeoJSON features
  const iso2FromCountries = useCallback((name: string): string | null => {
    const target = normalizeCountryName(name);
    // Prefer World Bank mapping if available
    if (wbIso2ByName[target]) return wbIso2ByName[target];
    for (const f of countries) {
      const n = (f.properties?.name || f.properties?.NAME || f.id || "") as string;
      if (n && normalizeCountryName(n) === target) {
        const iso2 = (f.properties?.ISO_A2 || f.properties?.iso_a2 || f.properties?.iso2 || f.id || "") as string;
        return iso2 ? iso2.toString() : null;
      }
    }
    return null;
  }, [wbIso2ByName, countries]);
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
        // IMF WEO (NGDPD) for WLD aggregate
        const imfRes = await getCachedGlobalWEO_GDP();
        setGlobalGDP({
          value: imfRes.value,
          year: imfRes.year,
          source: imfRes.source,
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

  // Fetch World Bank countries list once for faster search and robust ISO mapping
  useEffect(() => {
    let cancelled = false;
    async function fetchWbCountries() {
      try {
        const res = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400');
        const json = await res.json();
        const items = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
        type WbCountry = { name: string; id: string; iso2Code: string; region?: { id: string; value: string } };
        const byName: Record<string, string> = {};
        const feats: GeoJSON.Feature[] = items.map((c: WbCountry) => {
          const iso2 = (c.iso2Code || c.id || '').toUpperCase();
          const name = c.name;
          const continent = c.region?.value && c.region.value !== 'Aggregates' ? c.region.value : undefined;
          byName[normalizeCountryName(name)] = iso2;
          const feat: GeoJSON.Feature<GeoJSON.Geometry | null, { name: string; NAME: string; continent?: string; iso2: string }> = {
            type: 'Feature',
            id: iso2,
            properties: { name, NAME: name, continent, iso2 },
            geometry: null,
          };
          return feat as GeoJSON.Feature;
        });
        if (!cancelled) {
          setWbCountries(feats);
          setWbIso2ByName(byName);
        }
      } catch (e) {
        console.warn('WB countries fetch failed, falling back to GeoJSON list', e);
      }
    }
    fetchWbCountries();
    return () => { cancelled = true; };
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
  const [selectedCountryLoading, setSelectedCountryLoading] = useState(false);
  const [selectedCountryGDPLoading, setSelectedCountryGDPLoading] = useState<boolean>(false);
  const [selectedCountryInflationLoading, setSelectedCountryInflationLoading] = useState<boolean>(false);

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
  const loadInflationForCountry = useCallback(async (countryName: string) => {
    if (inflationCache[countryName] !== undefined) {
      return inflationCache[countryName];
    }

    try {
      const iso2 = iso2FromCountries(countryName);
      if (!iso2) return null;
      const res = await getIMF_Inflation2025WithFallbackByIso2(iso2);
      if (res.value != null && !isNaN(Number(res.value))) {
        const v = Number(res.value);
        inflationCache[countryName] = v;
        return v;
      }
      return null;
    } catch (error) {
      console.error('Error loading inflation for', countryName, error);
      return null;
    }
  }, [iso2FromCountries]);

  // (Tariff loading removed per user request)

  // Función para cargar datos de un país seleccionado (por nombre normalizado)
  const loadSelectedCountryData = useCallback(async (countryName: string) => {
    if (!countryName) return;

    setSelectedCountryLoading(true);
    // Reset current values
    const inflation: number | null = inflationCache[countryName] ?? null;
    if (!isValidNum(inflation)) {
      const fetched = await loadInflationForCountry(countryName);
      if (isValidNum(fetched)) {
        setSelectedCountryInflation(fetched);
      } else {
        setSelectedCountryInflation(null);
      }
    } else {
      setSelectedCountryInflation(inflation);
    }
    // (Tariff removed)
    setSelectedCountryLoading(false);
  }, [loadInflationForCountry]);

  // Cargar datos cuando cambie el país seleccionado
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

  // Lifecycle: when a country is selected from search, sequence loads (GDP first, then inflation)
  useEffect(() => {
    if (!selectedCountryFromSearch) {
      // Reset states when deselecting
      setSelectedCountryInflation(null);
      setSelectedCountryLoading(false);
      setSelectedCountryGDPLoading(false);
      setSelectedCountryInflationLoading(false);
      return;
    }
    const props = (selectedCountryFromSearch.properties ?? {}) as { name?: unknown; NAME?: unknown };
    const nameKey =
      (typeof props.name === 'string' && props.name) ||
      (typeof props.NAME === 'string' && props.NAME) ||
      (selectedCountryFromSearch.id != null ? String(selectedCountryFromSearch.id) : "");

    let cancelled = false;
    setSelectedCountryLoading(true);
    setSelectedCountryInflation(null);
    setSelectedCountryGDPLoading(true);
    setSelectedCountryInflationLoading(true);

    // GDP first
    const pGDP = loadGDPForCountry(nameKey)
      .catch(() => {})
      .finally(() => { if (!cancelled) setSelectedCountryGDPLoading(false); });

    // Then inflation
    pGDP.then(() => loadInflationForCountry(nameKey))
      .then((v) => { if (!cancelled) setSelectedCountryInflation(v ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSelectedCountryInflationLoading(false); if (!cancelled) setSelectedCountryLoading(false); });

    return () => { cancelled = true; };
  }, [selectedCountryFromSearch, loadGDPForCountry, loadInflationForCountry]);

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col overflow-y-auto bg-black">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-18 lg:px-6">
      {/* Header Card */}
      <div className="w-full sm:pt-10 md:pt-8 lg:pt-8 pb-2 sm:pb-4 md:pb-4 lg:pb-4">
        <div className="w-full">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 lg:p-12 border border-white/20">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-2 sm:mb-3 md:mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              🌐 Global Macroeconomic Overview
            </h1>
            <p className="text-gray-300 text-center text-sm sm:text-base md:text-lg">
              Real-time economic indicators and global financial data
            </p>
          </div>
        </div>
      </div>

      {/* Search Card */}
      <SearchCard
        countries={wbCountries.length ? wbCountries : countries}
        gdpByCountry={gdpByCountry}
        popByCountry={popByCountry}
        inflationCache={inflationCache}
        onCountryClick={setSelectedCountryFromSearch}
        loadGDPForCountry={loadGDPForCountry}
        loadInflationForCountry={loadInflationForCountry}
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
          selectedCountryLoading={selectedCountryLoading}
          selectedCountryGDPLoading={selectedCountryGDPLoading}
          selectedCountryInflationLoading={selectedCountryInflationLoading}
        />
      )}

      {/* Main Dashboard Grid */}
      <div className="w-full pb-8 sm:pb-12 md:pb-14 lg:pb-16">
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
    </div>
  );
}