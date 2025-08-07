"use client";

import React, { useMemo, useState } from "react";

import { GeoJSON } from "geojson";

interface CountrySearchProps {
  countries: GeoJSON.Feature[];
  gdpByCountry: Record<string, number>;
  inflationCache: Record<string, number>;
  onCountryClick: (country: GeoJSON.Feature) => void;
}

export function CountrySearch({ countries, gdpByCountry, inflationCache, onCountryClick }: CountrySearchProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const filtered = useMemo(() => {
    if (!query) return [];
    return countries.filter(c => {
      const name = c.properties?.name || c.properties?.NAME || c.id || '';
      return name.toLowerCase().includes(query.toLowerCase());
    });
  }, [query, countries]);

  return (
    <div className="w-full">
      <h3 className="text-xl font-semibold mb-4 text-center text-white">🔍 Search Countries</h3>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          className="w-full pl-12 pr-6 py-4 rounded-xl border border-white/20 bg-white/20 text-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-300"
          placeholder="Search for a country..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Dropdown Card */}
      {query && isFocused && (
        <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-xl shadow-2xl border border-white/20 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-gray-300 text-center">No countries found.</div>
          ) : (
            <ul>
              {filtered.map((c, idx) => {
                const name = c.properties?.name || c.properties?.NAME || c.id || '';
                const gdp = gdpByCountry[name];
                const inflation = inflationCache[name];
                return (
                  <li
                    key={name + idx}
                    className="px-6 py-4 border-b border-white/20 flex justify-between items-center cursor-pointer hover:bg-white/20 transition-all duration-200 last:border-b-0"
                    onClick={() => {
                      onCountryClick(c);
                      setQuery('');
                      setIsFocused(false);
                    }}
                  >
                    <span className="font-medium text-white text-lg">{name}</span>
                    <span className="flex flex-col items-end gap-1">
                      {gdp && <span className="text-green-400 text-sm font-medium">💰 GDP: ${gdp.toLocaleString()}</span>}
                      {inflation !== undefined && <span className="text-yellow-400 text-sm font-medium">📈 Inflation: {inflation.toFixed(2)}%</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
} 