"use client";

import React, { useEffect, useState } from "react";



interface HistoricalDataPoint {
  date: string;
  value: number;
  year: string;
}

export function HistoricalLog() {
  const [activeTab, setActiveTab] = useState<'inflation' | 'gdp' | 'tariff'>('inflation');
  const [showAll, setShowAll] = useState(false);
  const [historicalData, setHistoricalData] = useState<{
    inflation: HistoricalDataPoint[];
    gdp: HistoricalDataPoint[];
    tariff: HistoricalDataPoint[];
  }>({
    inflation: [],
    gdp: [],
    tariff: []
  });
  const [loading, setLoading] = useState(false);

  // Fetch historical data from APIs
  const fetchHistoricalData = async () => {
    setLoading(true);
    
    try {
      // Fetch historical inflation data (last 20 years)
      const inflationResponse = await fetch('https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL.ZG?format=json&per_page=200&date=2004:2024');
      const inflationData = await inflationResponse.json();
      
      if (inflationData && inflationData[1]) {
        const inflationByYear: Record<string, { total: number; count: number }> = {};
        
        inflationData[1].forEach((item: { value?: number; date?: string }) => {
          if (item.value && item.date) {
            const year = item.date;
            if (!inflationByYear[year]) {
              inflationByYear[year] = { total: 0, count: 0 };
            }
            inflationByYear[year].total += item.value;
            inflationByYear[year].count += 1;
          }
        });

        const inflationHistory = Object.entries(inflationByYear)
          .map(([year, data]) => ({
            date: `${year}-01-01`,
            value: data.total / data.count,
            year
          }))
          .sort((a, b) => parseInt(b.year) - parseInt(a.year)); // Newest to oldest

        setHistoricalData(prev => ({ ...prev, inflation: inflationHistory }));
      }
    } catch {
      console.log('Failed to fetch historical inflation data');
    }

    try {
      // Fetch historical GDP data (last 20 years)
      const gdpResponse = await fetch('https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&per_page=200&date=2004:2024');
      const gdpData = await gdpResponse.json();
      
      if (gdpData && gdpData[1]) {
        const gdpByYear: Record<string, { total: number; count: number }> = {};
        
        gdpData[1].forEach((item: { value?: number; date?: string }) => {
          if (item.value && item.date) {
            const year = item.date;
            if (!gdpByYear[year]) {
              gdpByYear[year] = { total: 0, count: 0 };
            }
            gdpByYear[year].total += item.value;
            gdpByYear[year].count += 1;
          }
        });

        const gdpHistory = Object.entries(gdpByYear)
          .map(([year, data]) => ({
            date: `${year}-01-01`,
            value: data.total,
            year
          }))
          .sort((a, b) => parseInt(b.year) - parseInt(a.year)); // Newest to oldest

        setHistoricalData(prev => ({ ...prev, gdp: gdpHistory }));
      }
    } catch {
      console.log('Failed to fetch historical GDP data');
    }

    try {
      // Fetch historical tariff data (last 20 years)
      const tariffResponse = await fetch('https://api.worldbank.org/v2/country/all/indicator/TM.TAX.MRCH.SM.AR.ZS?format=json&per_page=200&date=2004:2024');
      const tariffData = await tariffResponse.json();
      
      if (tariffData && tariffData[1]) {
        const tariffByYear: Record<string, { total: number; count: number }> = {};
        
        tariffData[1].forEach((item: { value?: number; date?: string }) => {
          if (item.value && item.date) {
            const year = item.date;
            if (!tariffByYear[year]) {
              tariffByYear[year] = { total: 0, count: 0 };
            }
            tariffByYear[year].total += item.value;
            tariffByYear[year].count += 1;
          }
        });

        const tariffHistory = Object.entries(tariffByYear)
          .map(([year, data]) => ({
            date: `${year}-01-01`,
            value: data.total / data.count,
            year
          }))
          .sort((a, b) => parseInt(b.year) - parseInt(a.year)); // Newest to oldest

        setHistoricalData(prev => ({ ...prev, tariff: tariffHistory }));
      }
    } catch {
      console.log('Failed to fetch historical tariff data');
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchHistoricalData();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short'
    });
  };

  const formatGDP = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
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

  const getActiveHistory = () => {
    switch (activeTab) {
      case 'inflation': return historicalData.inflation;
      case 'gdp': return historicalData.gdp;
      case 'tariff': return historicalData.tariff;
      default: return [];
    }
  };

  const getActiveColor = () => {
    switch (activeTab) {
      case 'inflation': return 'text-yellow-400';
      case 'gdp': return 'text-green-400';
      case 'tariff': return 'text-blue-400';
      default: return 'text-white';
    }
  };

  // Reset showAll when tab changes
  const handleTabChange = (tab: 'inflation' | 'gdp' | 'tariff') => {
    setActiveTab(tab);
    setShowAll(false);
  };

  const activeHistory = getActiveHistory();
  const activeColor = getActiveColor();

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-semibold mb-6 text-center text-white">📜 Historical Changes</h2>
      
      {/* Tab Navigation */}
      <div className="flex justify-center mb-6">
        <div className="bg-white/10 rounded-xl p-1 flex">
          <button
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${
              activeTab === 'inflation' 
                ? 'bg-yellow-500 text-black font-bold' 
                : 'text-gray-300 hover:text-white'
            }`}
            onClick={() => handleTabChange('inflation')}
          >
            📈 Inflation
          </button>
          <button
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${
              activeTab === 'gdp' 
                ? 'bg-green-500 text-black font-bold' 
                : 'text-gray-300 hover:text-white'
            }`}
            onClick={() => handleTabChange('gdp')}
          >
            💰 GDP
          </button>
          <button
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${
              activeTab === 'tariff' 
                ? 'bg-blue-500 text-black font-bold' 
                : 'text-gray-300 hover:text-white'
            }`}
            onClick={() => handleTabChange('tariff')}
          >
            🏛️ Tariff
          </button>
        </div>
      </div>

      {/* Content based on active tab */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="text-gray-300 text-lg">Loading historical data...</div>
            <div className="mt-4 text-gray-400">Fetching data from World Bank APIs</div>
          </div>
        ) : activeHistory.length > 0 ? (
          <div className="space-y-3">
            {(showAll ? activeHistory : activeHistory.slice(0, 3)).map((entry, idx) => {
              const change = idx > 0 ? getChangeIndicator(entry.value, activeHistory[idx - 1].value) : null;
              
              return (
                <div key={entry.date} className="p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all duration-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-medium">{formatDate(entry.date)}</span>
                    <span className={`font-bold ${activeColor}`}>
                      {activeTab === 'gdp' ? formatGDP(entry.value) : `${entry.value.toFixed(2)}%`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-gray-300">
                    <span>Global {activeTab === 'gdp' ? 'GDP' : activeTab === 'inflation' ? 'Inflation' : 'Tariff'}</span>
                    {change && (
                      <span className={`flex items-center gap-1 ${
                        change.isPositive ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {change.isPositive ? '↗' : '↘'} {change.percentage.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            
            {activeHistory.length > 3 && (
              <div className="text-center pt-4">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 text-white font-medium transition-all duration-200 hover:scale-105"
                >
                  {showAll ? 'Show Less' : `Show More (${activeHistory.length - 3} more)`}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-400 text-lg mb-2">📊 No historical data available</div>
            <div className="text-gray-500 text-sm">
              Unable to fetch historical {activeTab} data from World Bank APIs
            </div>
          </div>
        )}
      </div>

      {/* Info about what this shows */}
      <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
        <h3 className="text-base font-semibold text-gray-300 mb-2">ℹ️ What this shows:</h3>
        <div className="text-sm text-gray-400 space-y-1">
          <p>• Real historical data from World Bank APIs (2004-2024)</p>
          <p>• Global averages for inflation, GDP, and tariff rates</p>
          <p>• Year-over-year percentage changes</p>
          <p>• Data is fetched live from official sources</p>
        </div>
      </div>
    </div>
  );
} 