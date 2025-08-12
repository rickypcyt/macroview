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
import React, { useEffect, useState } from "react";

import { Info } from 'lucide-react';
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
  const [sources, setSources] = useState<{ inflation: string | null; gdp: string | null }>({ inflation: null, gdp: null });
  const [loading, setLoading] = useState(false);

  // Fetch historical data from APIs
  const fetchHistoricalData = async () => {
    setLoading(true);
    
    try {
      // World Bank only: historical inflation data (last ~25 years)
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - 24;
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
        setSources(prev => ({ ...prev, inflation: 'World Bank (FP.CPI.TOTL.ZG)' }));
      }
    } catch {
      console.log('Failed to fetch historical inflation data');
    }
    
    try {
      // World Bank only: historical global nominal GDP (NY.GDP.MKTP.CD, USD)
      const currentYear2 = new Date().getFullYear();
      const startYear2 = currentYear2 - 24;
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
        setSources(prev => ({ ...prev, gdp: 'World Bank (NY.GDP.MKTP.CD)' }));
      }
    } catch {
      console.log('Failed to fetch historical GDP data');
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchHistoricalData();
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
    switch (activeTab) {
      case 'inflation': return 'Inflation Rate (%)';
      case 'gdp': return 'Global GDP ($)';
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
          label: activeTab === 'gdp' ? 'Global GDP' : 'Global Inflation',
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
            <div className="mt-4 text-gray-400">Fetching data (IMF first, World Bank fallback)</div>
          </div>
        ) : activeHistory.length > 0 ? (
          <div>
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-white mb-2">{getActiveLabel()}</h3>
              <p className="text-gray-400 text-sm">Last {timePeriod} years • Hover over points for details</p>
            </div>
            {renderChart()}
            <p className="text-gray-500 text-sm mt-2 text-center">
              Source: {activeTab === 'inflation' ? 'World Bank (FP.CPI.TOTL.ZG)' : (sources.gdp ?? 'World Bank (NY.GDP.MKTP.CD)')}
            </p>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-gray-400 text-lg mb-2">📊 No historical data available</div>
            <div className="text-gray-500 text-sm">
              Unable to fetch historical {activeTab} data from IMF or World Bank APIs
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