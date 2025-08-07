"use client";

import React from "react";

interface InflationCountriesListProps {
  inflationData: { countryName: string; inflation: number }[];
  title: string;
  type: 'highest' | 'lowest';
}

export function InflationCountriesList({ inflationData, title, type }: InflationCountriesListProps) {
  if (inflationData.length === 0) return null;

  const sortedData = [...inflationData].sort((a, b) => 
    type === 'highest' ? b.inflation - a.inflation : a.inflation - b.inflation
  ).slice(0, 8); // Reduced to 8 for compact layout

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4 text-center text-white">{title}</h3>
      <div className="space-y-3">
        {sortedData.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all duration-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-400 bg-white/10 px-2 py-1 rounded-full">#{idx + 1}</span>
              <span className="font-medium text-white text-base truncate">{item.countryName}</span>
            </div>
            <span className={`font-bold text-base ${type === 'highest' ? 'text-red-400' : 'text-green-400'}`}>
              {item.inflation.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
} 