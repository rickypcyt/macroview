"use client";

import React from "react";

interface InflationDistributionChartProps {
  inflationData: { countryName: string; inflation: number }[];
}

export function InflationDistributionChart({ inflationData }: InflationDistributionChartProps) {
  if (inflationData.length === 0) return null;

  // Crear rangos de inflación
  const ranges = [
    { min: -10, max: 0, label: 'Deflation', color: 'text-green-400', bgColor: 'bg-green-500/20', icon: '📉' },
    { min: 0, max: 2, label: 'Very Low', color: 'text-blue-400', bgColor: 'bg-blue-500/20', icon: '🟢' },
    { min: 2, max: 5, label: 'Low', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', icon: '🟡' },
    { min: 5, max: 10, label: 'Moderate', color: 'text-orange-400', bgColor: 'bg-orange-500/20', icon: '🟠' },
    { min: 10, max: 50, label: 'High', color: 'text-red-400', bgColor: 'bg-red-500/20', icon: '🔴' },
    { min: 50, max: 1000, label: 'Very High', color: 'text-purple-400', bgColor: 'bg-purple-500/20', icon: '🟣' }
  ];

  const distribution = ranges.map(range => {
    const count = inflationData.filter(item => 
      item.inflation >= range.min && item.inflation < range.max
    ).length;
    const percentage = inflationData.length > 0 ? (count / inflationData.length) * 100 : 0;
    return { ...range, count, percentage };
  });

  return (
    <div>
      <h2 className="text-lg md:text-xl font-semibold mb-4 text-center text-white">📊 Distribution</h2>
      <div className="space-y-3">
        {distribution.map((range, idx) => (
          <div key={idx} className={`text-center p-3 ${range.bgColor} rounded-xl border border-white/10`}>
            <div className="text-sm font-medium text-gray-300 mb-1 flex items-center justify-center gap-2">
              <span>{range.icon}</span>
              {range.label}
            </div>
            <div className={`text-lg font-bold ${range.color}`}>
              {range.count}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {range.percentage.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
      <div className="text-center p-3 bg-white/5 rounded-xl mt-4 border border-white/10">
        <div className="text-sm font-medium text-gray-300 mb-1">📈 Total Countries</div>
        <div className="text-lg font-bold text-white">
          {inflationData.length}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          With inflation data
        </div>
      </div>
    </div>
  );
} 