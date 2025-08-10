"use client";

import type * as GeoJSON from "geojson";

import React, { useMemo, useState } from "react";

import { normalizeCountryName } from "../utils/helpers";

interface CountrySearchProps {
  countries: GeoJSON.Feature[];
  gdpByCountry: Record<string, number>;
  popByCountry: Record<string, number>;
  inflationCache: Record<string, number>;
  tariffCache: Record<string, number>;
  onCountryClick: (country: GeoJSON.Feature) => void;
  loadGDPForCountry: (countryName: string) => Promise<void>;
  loadInflationForCountry?: (countryName: string) => Promise<number | null>;
  loadTariffForCountry?: (countryName: string) => Promise<number | null>;
  // Optional source labels to display in the dropdown
  gdpSourceLabel?: string;
  populationSourceLabel?: string;
}

export function CountrySearch({ countries, gdpByCountry, popByCountry, inflationCache, tariffCache, onCountryClick, loadGDPForCountry, loadInflationForCountry, loadTariffForCountry }: CountrySearchProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const filtered = useMemo(() => {
    if (!query) return [];
    const filteredCountries = countries.filter(c => {
      const name = c.properties?.name || c.properties?.NAME || c.id || '';
      return name.toLowerCase().includes(query.toLowerCase());
    });
    // Reset active index when filtered results change
    setActiveIndex(-1);
    return filteredCountries;
  }, [query, countries]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filtered.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          handleCountryClick(filtered[activeIndex]);
        }
        break;
    }
  };

  const handleMouseEnter = (index: number) => {
    setActiveIndex(index);
  };

  const handleCountryClick = async (country: GeoJSON.Feature) => {
    const countryName = country.properties?.name || country.properties?.NAME || country.id || '';
    
    // Load GDP data if not already loaded
    if (!gdpByCountry[countryName]) {
      await loadGDPForCountry(countryName);
    }
    
    // Load inflation data if not already loaded and function is available
    if (loadInflationForCountry && inflationCache[countryName] === undefined) {
      await loadInflationForCountry(countryName);
    }
    
    // Load tariff data if not already loaded and function is available
    if (loadTariffForCountry && tariffCache[countryName] === undefined) {
      await loadTariffForCountry(countryName);
    }
    
    onCountryClick(country);
    setQuery('');
    setIsFocused(false);
  };

  return (
    <div className="w-full">
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
          onKeyDown={handleKeyDown}
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
                const population = popByCountry[normalizeCountryName(name)];
                return (
                  <li
                    key={name + idx}
                    className={`px-6 py-4 border-b border-white/20 flex justify-between items-center cursor-pointer transition-all duration-200 last:border-b-0 ${
                      activeIndex === idx ? 'bg-white/30' : 'hover:bg-white/20'
                    }`}
                    onClick={() => handleCountryClick(c)}
                    onMouseEnter={() => handleMouseEnter(idx)}
                  >
                    <span className="font-medium text-white text-lg">{name}</span>
                    <span className="flex flex-col items-end gap-1">
                      {population !== undefined && (
                        <span className="text-blue-400 text-sm font-medium"> Population: {population.toLocaleString()}</span>
                      )}
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