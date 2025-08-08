"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import React from "react";

interface InflationDistributionChartProps {
  inflationData: { countryName: string; inflation: number }[];
}

export function InflationDistributionChart({ inflationData }: InflationDistributionChartProps) {
  if (inflationData.length === 0) return null;

  // Crear rangos de inflación
  const ranges = [
    { min: -10, max: 0, label: 'Deflation', color: '#10b981', bgColor: 'bg-green-500/20', icon: '📉' },
    { min: 0, max: 2, label: 'Very Low', color: '#3b82f6', bgColor: 'bg-blue-500/20', icon: '🟢' },
    { min: 2, max: 5, label: 'Low', color: '#eab308', bgColor: 'bg-yellow-500/20', icon: '🟡' },
    { min: 5, max: 10, label: 'Moderate', color: '#f97316', bgColor: 'bg-orange-500/20', icon: '🟠' },
    { min: 10, max: 50, label: 'High', color: '#ef4444', bgColor: 'bg-red-500/20', icon: '🔴' },
    { min: 50, max: 1000, label: 'Very High', color: '#a855f7', bgColor: 'bg-purple-500/20', icon: '🟣' }
  ];

  const distribution = ranges.map(range => {
    const count = inflationData.filter(item => 
      item.inflation >= range.min && item.inflation < range.max
    ).length;
    const percentage = inflationData.length > 0 ? (count / inflationData.length) * 100 : 0;
    return { 
      ...range, 
      count, 
      percentage,
      name: range.label,
      value: count
    };
  });

  const chartData = distribution.filter(item => item.count > 0);

  interface DistributionDatum {
    min: number;
    max: number;
    label: string;
    color: string;
    bgColor: string;
    icon: string;
    count: number;
    percentage: number;
    name: string;
    value: number;
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: DistributionDatum }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-black/90 backdrop-blur-sm p-3 rounded-lg border border-white/20">
          <p className="text-white font-medium">{data.name}</p>
          <p className="text-gray-300">Countries: {data.count}</p>
          <p className="text-gray-300">Percentage: {data.percentage.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <h2 className="text-xl md:text-2xl font-semibold mb-6 text-center text-white">📊 Inflation Distribution</h2>
      
      {/* Chart */}
      <div className="w-full h-80 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="name" 
              stroke="#9ca3af"
              fontSize={12}
              tick={{ fill: '#9ca3af' }}
            />
            <YAxis 
              stroke="#9ca3af"
              fontSize={12}
              tick={{ fill: '#9ca3af' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {distribution.map((range, idx) => (
          <div key={idx} className={`text-center p-4 ${range.bgColor} rounded-xl border border-white/10`}>
            <div className="text-base font-medium text-gray-300 mb-2 flex items-center justify-center gap-2">
              <span className="text-lg">{range.icon}</span>
              <span className="text-xs md:text-sm">{range.label}</span>
            </div>
            <div className={`text-2xl md:text-3xl font-bold`} style={{ color: range.color }}>
              {range.count}
            </div>
            <div className="text-sm text-gray-400 mt-2">
              {range.percentage.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>

      {/* Total Countries */}
      <div className="text-center p-6 bg-white/5 rounded-xl mt-6 border border-white/10">
        <div className="text-base font-medium text-gray-300 mb-3">📈 Total Countries</div>
        <div className="text-3xl md:text-4xl font-bold text-white">
          {inflationData.length}
        </div>
        <div className="text-sm text-gray-400 mt-3">
          With inflation data
        </div>
      </div>
    </div>
  );
} 