"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip
} from 'chart.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Info, Search, X } from 'lucide-react';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface HistoricalDataPoint {
  date: string;
  value: number;
  year: string;
}



export function HistoricalLog() {
  const [activeTab, setActiveTab] = useState<'inflation' | 'gdp'>('inflation');
  const [timePeriod, setTimePeriod] = useState<5 | 10 | 15 | 20>(10);

  const [historicalData, setHistoricalData] = useState<{
    inflation: HistoricalDataPoint[];
    gdp: HistoricalDataPoint[];
  }>({
    inflation: [],
    gdp: []
  });
  const [loading, setLoading] = useState(false);

  // Country search & selection state (World Bank countries)
  interface Country {
    id: string; // 3-letter WB country code (e.g., USA)
    name: string;
    iso2Code?: string;
    region?: string;
  }
  const [countries, setCountries] = useState<Country[]>([]);
  const [fetchingCountries, setFetchingCountries] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.toLowerCase();
    return countries
      .filter(c => c.name.toLowerCase().includes(q) || (c.id && c.id.toLowerCase().includes(q)))
      .slice(0, 100);
  }, [countries, countryQuery]);

  const fetchHistoricalData = useCallback(async () => {
    setLoading(true);
    
    try {
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - 24;
      if (selectedCountry) {
        const code = selectedCountry.id;
        const wbUrl = `https://api.worldbank.org/v2/country/${code}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=200&date=${startYear}:${currentYear}`;
        const wbResp = await fetch(wbUrl);
        const wbJson = await wbResp.json();
        if (wbJson && wbJson[1]) {
          const inflationHistory: HistoricalDataPoint[] = wbJson[1]
            .filter((item: { value?: number; date?: string }) => item.value != null && item.date)
            .map((item: { value: number; date: string }) => ({ date: `${item.date}-01-01`, value: item.value, year: item.date }))
            .sort((a: HistoricalDataPoint, b: HistoricalDataPoint) => parseInt(a.year) - parseInt(b.year));
          setHistoricalData(prev => ({ ...prev, inflation: inflationHistory }));
        }
      } else {
        const inflationResponse = await fetch(`https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL.ZG?format=json&per_page=200&date=${startYear}:${currentYear}`);
        const inflationData = await inflationResponse.json();
        if (inflationData && inflationData[1]) {
          const inflationByYear: Record<string, { total: number; count: number }> = {};
          inflationData[1].forEach((item: { value?: number; date?: string }) => {
            if (item.value != null && item.date) {
              const year = item.date;
              if (!inflationByYear[year]) {
                inflationByYear[year] = { total: 0, count: 0 };
              }
              inflationByYear[year].total += item.value as number;
              inflationByYear[year].count += 1;
            }
          });
          const inflationHistory = Object.entries(inflationByYear)
            .map(([year, data]) => ({
              date: `${year}-01-01`,
              value: data.count ? data.total / data.count : 0,
              year
            }))
            .sort((a, b) => parseInt(a.year) - parseInt(b.year));
          setHistoricalData(prev => ({ ...prev, inflation: inflationHistory }));
        }
      }
    } catch {
      console.log('Failed to fetch historical inflation data');
    }
    
    try {
      const currentYear2 = new Date().getFullYear();
      const startYear2 = currentYear2 - 24;
      if (selectedCountry) {
        const code = selectedCountry.id;
        const wbUrl = `https://api.worldbank.org/v2/country/${code}/indicator/NY.GDP.MKTP.CD?format=json&per_page=200&date=${startYear2}:${currentYear2}`;
        const wbResp = await fetch(wbUrl);
        const wbJson = await wbResp.json();
        if (wbJson && wbJson[1]) {
          const gdpHistory: HistoricalDataPoint[] = wbJson[1]
            .filter((item: { value?: number; date?: string }) => item.value != null && item.date)
            .map((item: { value: number; date: string }) => ({ date: `${item.date}-01-01`, value: item.value, year: item.date }))
            .sort((a: HistoricalDataPoint, b: HistoricalDataPoint) => parseInt(a.year) - parseInt(b.year));
          setHistoricalData(prev => ({ ...prev, gdp: gdpHistory }));
        }
      } else {
        const gdpResponse = await fetch(`https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&per_page=200&date=${startYear2}:${currentYear2}`);
        const gdpData = await gdpResponse.json();
        if (gdpData && gdpData[1]) {
          const gdpByYear: Record<string, { total: number; count: number }> = {};
          gdpData[1].forEach((item: { value?: number; date?: string }) => {
            if (item.value != null && item.date) {
              const year = item.date;
              if (!gdpByYear[year]) {
                gdpByYear[year] = { total: 0, count: 0 };
              }
              gdpByYear[year].total += item.value as number;
              gdpByYear[year].count += 1;
            }
          });
          const gdpHistory = Object.entries(gdpByYear)
            .map(([year, data]) => ({
              date: `${year}-01-01`,
              value: data.total,
              year
            }))
            .sort((a, b) => parseInt(a.year) - parseInt(b.year));
          setHistoricalData(prev => ({ ...prev, gdp: gdpHistory }));
        }
      }
    } catch {
      console.log('Failed to fetch historical GDP data');
    }
    finally {
      setLoading(false);
    }
  }, [selectedCountry]);

  useEffect(() => {
    fetchHistoricalData();
  }, [fetchHistoricalData]);

  // Focus input when opening picker and reset highlight
  useEffect(() => {
    if (showCountryPicker) {
      setHighlightedIndex(0);
      // Focus next tick to ensure element is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [showCountryPicker]);

  // Keep highlightedIndex in range when filtering
  useEffect(() => {
    if (highlightedIndex >= filteredCountries.length) {
      setHighlightedIndex(0);
    }
  }, [filteredCountries.length, highlightedIndex]);

  // Fetch World Bank country list for the search picker
  useEffect(() => {
    let cancelled = false;
    const loadCountries = async () => {
      try {
        setFetchingCountries(true);
        const res = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400');
        const data = await res.json();
        if (!cancelled && data && Array.isArray(data) && data[1]) {
          interface WBApiCountry { id: string; name: string; iso2Code: string; region: { id: string; value: string } | null }
          const mapped: Country[] = (data[1] as WBApiCountry[])
            .filter((c: WBApiCountry) => c.region ? c.region.id !== 'NA' : false) // exclude aggregates already handled by 'all'
            .map((c: WBApiCountry) => ({ id: c.id, name: c.name, iso2Code: c.iso2Code, region: c.region ? c.region.value : undefined }));
          setCountries(mapped);
        }
      } catch (e) {
        console.error('Failed to fetch World Bank countries', e);
      } finally {
        if (!cancelled) setFetchingCountries(false);
      }
    };
    loadCountries();
    return () => { cancelled = true; };
  }, []);

  // Removed unused formatDate helper

  const formatGDP = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  };

  const getActiveHistory = () => {
    const data = (() => {
      switch (activeTab) {
        case 'inflation': return historicalData.inflation;
        case 'gdp': return historicalData.gdp;
        default: return [];
      }
    })();
    
    // Filter by time period
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - timePeriod;
    return data.filter((item: HistoricalDataPoint) => parseInt(item.year) >= startYear);
  };

  const getActiveColor = () => {
    switch (activeTab) {
      case 'inflation': return '#fbbf24'; // yellow-400
      case 'gdp': return '#4ade80'; // green-400
      default: return '#ffffff';
    }
  };

  const getActiveLabel = () => {
    const scope = selectedCountry ? `${selectedCountry.name}` : 'Global';
    switch (activeTab) {
      case 'inflation': return `${scope} Inflation Rate (%)`;
      case 'gdp': return `${scope} GDP ($)`;
      default: return '';
    }
  };

  const renderChart = () => {
    const data = getActiveHistory();
    if (data.length === 0) return null;

    const chartData = {
      labels: data.map(d => d.year),
      datasets: [
        {
          label: activeTab === 'gdp'
            ? `${selectedCountry ? selectedCountry.name : 'Global'} GDP`
            : `${selectedCountry ? selectedCountry.name : 'Global'} Inflation`,
          data: data.map(d => d.value),
          borderColor: activeTab === 'gdp' ? '#10B981' : '#F59E0B',
          backgroundColor: activeTab === 'gdp' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
          borderWidth: 3,
          pointBackgroundColor: activeTab === 'gdp' ? '#10B981' : '#F59E0B',
          pointBorderColor: 'white',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          tension: 0.4,
          fill: false,
          yAxisID: 'y'
        }
      ]
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 200, // Animación súper rápida
        easing: 'easeInOutQuart'
      },
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgb(19, 19, 19)',
          titleColor: 'white',
          bodyColor: 'white',
          borderColor: activeTab === 'gdp' ? '#10B981' : '#F59E0B',
          borderWidth: 2,
          cornerRadius: 4,
          displayColors: false,
          padding: 12,
          titleFont: { weight: 'bold' },
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              return activeTab === 'gdp' 
                ? `GDP: ${formatGDP(value)}`
                : `Inflation: ${value.toFixed(2)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Year',
            color: 'rgba(255,255,255,0.8)',
            font: {
              size: 12
            }
          },
          grid: {
            color: 'rgba(255,255,255,0.1)'
          },
          ticks: {
            color: 'rgba(255,255,255,0.6)',
            font: {
              size: 11
            }
          }
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          title: {
            display: true,
            text: activeTab === 'gdp' ? 'GDP (USD)' : 'Inflation (%)',
            color: 'rgba(255,255,255,0.8)',
            font: {
              size: 12
            }
          },
          grid: {
            color: 'rgba(255,255,255,0.1)'
          },
          ticks: {
            color: 'rgba(255,255,255,0.6)',
            font: {
              size: 11
            },
            callback: function(value) {
              if (activeTab === 'gdp') {
                return formatGDP(Number(value));
              }
              return `${value}%`;
            }
          }
        }
      }
    };

    return (
      <div className="h-80 w-full">
        <Line data={chartData} options={options} />
      </div>
    );
  };

  const getChangeIndicator = (current: number, previous: number) => {
    if (!previous || previous === 0) return null;
    const change = current - previous;
    const percentage = (change / previous) * 100;
    return {
      value: change,
      percentage,
      isPositive: change > 0,
      isNegative: change < 0
    };
  };

  const activeHistory = getActiveHistory();
  const activeColor = getActiveColor();

  return (
    <div className="relative">
      {/* Country Search Button (top-left) */}
      <div className="absolute top-0 left-0 z-10">
        <div className="relative">
          <button
            onClick={() => {
              setShowCountryPicker((s) => !s);
              if (!showCountryPicker) {
                setCountryQuery('');
                setHighlightedIndex(0);
              }
            }}
            className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-all duration-200"
            aria-label="Search Country"
          >
            {showCountryPicker ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>

          {/* Country Picker Popover */}
          {showCountryPicker && (
            <div className="absolute top-10 left-0 w-80 bg-neutral-900/95 backdrop-blur-sm border border-white/30 rounded-lg shadow-2xl p-3 text-sm text-gray-100">
              <div className="mb-2">
                <input
                  ref={inputRef}
                  value={countryQuery}
                  onChange={(e) => {
                    setCountryQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedIndex((i) => Math.min(i + 1, Math.max(filteredCountries.length - 1, 0)));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const choice = filteredCountries[highlightedIndex];
                      if (choice) {
                        setSelectedCountry(choice);
                        setShowCountryPicker(false);
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowCountryPicker(false);
                    }
                  }}
                  placeholder="Search country..."
                  className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
              <div className="max-h-60 overflow-auto custom-scrollbar">
                {fetchingCountries ? (
                  <div className="text-gray-400 py-6 text-center">Loading countries...</div>
                ) : (
                  filteredCountries.map((c, idx) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCountry(c);
                        setShowCountryPicker(false);
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`w-full text-left px-3 py-2 rounded-md transition flex items-center justify-between 
                        ${highlightedIndex === idx ? 'bg-white/20' : 'hover:bg-white/10'} 
                        ${selectedCountry?.id === c.id ? 'ring-1 ring-white/20' : ''}`}
                    >
                      <span>{c.name}</span>
                      <span className="text-gray-400 text-xs">{c.id}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                <button
                  className="hover:text-white"
                  onClick={() => { setSelectedCountry(null); setCountryQuery(''); setShowCountryPicker(false); }}
                >
                  Clear selection (Global)
                </button>
                {selectedCountry && <span>Selected: {selectedCountry.name}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Info Icon */}
      <div className="absolute top-0 right-0 z-10">
        <div className="group relative">
          <button className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-gray-300 hover:text-white transition-all duration-200">
            <Info className="w-4 h-4" />
          </button>
          
          {/* Info Tooltip */}
          <div className="absolute top-10 right-0 w-80 bg-neutral-900/90 backdrop-blur-sm border border-white/30 rounded-lg shadow-2xl p-4 text-sm text-gray-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
            <div className="space-y-2">
              <p className="font-medium text-white mb-2">📊 Chart Features:</p>
              <p>• Interactive chart with hover details for each data point</p>
              <p>• Real historical data from World Bank APIs (2004-2024)</p>
              <p>• Global averages for inflation and GDP</p>
              <p>• Summary statistics and period-over-period changes</p>
              <p>• Data is fetched live from official sources</p>
            </div>
          </div>
        </div>
      </div>

      
      {/* Tab Navigation */}
      <div className="flex justify-center mb-6">
        <div className="bg-white/10 rounded-xl p-1 flex">
          <button
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${
              activeTab === 'inflation' 
                ? 'bg-yellow-500 text-black font-bold' 
                : 'text-gray-300 hover:text-white'
            }`}
            onClick={() => setActiveTab('inflation')}
          >
            📈 Inflation
          </button>
          <button
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${
              activeTab === 'gdp' 
                ? 'bg-green-500 text-black font-bold' 
                : 'text-gray-300 hover:text-white'
            }`}
            onClick={() => setActiveTab('gdp')}
          >
            💰 GDP
          </button>

        </div>
      </div>

      {/* Time Period Buttons */}
      <div className="flex justify-center mb-6">
        <div className="bg-white/10 rounded-xl p-1 flex">
          {([5, 10, 15, 20] as const).map((period) => (
            <button
              key={period}
              className={`px-3 py-2 rounded-lg transition-all duration-200 text-sm ${
                timePeriod === period 
                  ? 'bg-white/20 text-white font-bold' 
                  : 'text-gray-300 hover:text-white'
              }`}
              onClick={() => setTimePeriod(period)}
            >
              {period} Years
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="mb-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="text-gray-300 text-lg">Loading historical data...</div>
            <div className="mt-4 text-gray-400">Fetching data from World Bank</div>
          </div>
        ) : activeHistory.length > 0 ? (
          <div>
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-white mb-2">{getActiveLabel()}</h3>
              <p className="text-gray-400 text-sm">Last {timePeriod} years • Hover over points for details</p>
            </div>
            {renderChart()}
            <p className="text-gray-500 text-sm mt-2 text-center">
              Source: {activeTab === 'inflation' ? 'World Bank (FP.CPI.TOTL.ZG)' : 'World Bank (NY.GDP.MKTP.CD)'}
            </p>
            {selectedCountry && (
              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedCountry(null)}
                  className="text-white hover:text-white/90 text-xs sm:text-sm underline underline-offset-2"
                >
                  return to global
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-400 text-lg mb-2">📊 No historical data available</div>
            <div className="text-gray-500 text-sm">
              Unable to fetch historical {activeTab} data from World Bank API
            </div>
          </div>
        )}
      </div>

      {/* Summary Statistics */}
      {activeHistory.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-gray-400 text-sm">Current Value</div>
            <div className={`text-xl font-bold ${activeColor}`}>
              {activeTab === 'gdp' ? formatGDP(activeHistory[activeHistory.length - 1].value) : `${activeHistory[activeHistory.length - 1].value.toFixed(2)}%`}
            </div>
            <div className="text-gray-500 text-sm">{activeHistory[activeHistory.length - 1].year}</div>
          </div>
          
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-gray-400 text-sm">Average</div>
            <div className={`text-xl font-bold ${activeColor}`}>
              {(() => {
                const avg = activeHistory.reduce((sum, item) => sum + item.value, 0) / activeHistory.length;
                return activeTab === 'gdp' ? formatGDP(avg) : `${avg.toFixed(2)}%`;
              })()}
            </div>
            <div className="text-gray-500 text-sm">Last {timePeriod} years</div>
          </div>
          
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="text-gray-400 text-sm">Change</div>
            <div className={`text-xl font-bold ${
              (() => {
                if (activeHistory.length < 2) return 'text-gray-400';
                const change = getChangeIndicator(activeHistory[activeHistory.length - 1].value, activeHistory[0].value);
                return change?.isPositive ? 'text-green-400' : 'text-red-400';
              })()
            }`}>
              {(() => {
                if (activeHistory.length < 2) return 'N/A';
                const change = getChangeIndicator(activeHistory[activeHistory.length - 1].value, activeHistory[0].value);
                if (!change) return 'N/A';
                return `${change.isPositive ? '+' : ''}${change.percentage.toFixed(1)}%`;
              })()}
            </div>
            <div className="text-gray-500 text-sm">vs {activeHistory[0].year}</div>
          </div>
        </div>
      )}

    </div>
  );
} 