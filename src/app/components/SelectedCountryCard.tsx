"use client";

import React from "react";
import type * as GeoJSON from "geojson";
import { normalizeCountryName } from "../utils/helpers";

interface SelectedCountryCardProps {
  selectedCountryFromSearch: GeoJSON.Feature;
  setSelectedCountryFromSearch: (country: GeoJSON.Feature | null) => void;
  gdpByCountry: Record<string, number>;
  popByCountry: Record<string, number>;
  selectedCountryInflation: number | null;
  selectedCountryTariff: number | null;
  selectedCountryLoading: boolean;
}

export function SelectedCountryCard({
  selectedCountryFromSearch,
  setSelectedCountryFromSearch,
  gdpByCountry,
  popByCountry,
  selectedCountryInflation,
  selectedCountryTariff,
  selectedCountryLoading,
}: SelectedCountryCardProps) {
  const props = (selectedCountryFromSearch.properties ?? {}) as {
    name?: unknown;
    NAME?: unknown;
    continent?: unknown;
  };
  const nameKey =
    (typeof props.name === 'string' && props.name) ||
    (typeof props.NAME === 'string' && props.NAME) ||
    (selectedCountryFromSearch.id != null ? String(selectedCountryFromSearch.id) : "");

  return (
    <div className="w-full px-4 sm:px-6 md:px-12 lg:px-24 mb-6 sm:mb-8 md:mb-10 lg:mb-12">
      <div className="w-full">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 lg:p-12 border border-white/20">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">
              {nameKey}
            </h2>
            <button
              className="text-white text-lg sm:text-xl font-bold hover:text-green-400 focus:outline-none transition-colors"
              onClick={() => setSelectedCountryFromSearch(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
            {/* GDP */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">💰 GDP (USD)</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-green-400">
                {gdpByCountry[nameKey]
                  ? `$${gdpByCountry[nameKey].toLocaleString()}`
                  : <span className="text-gray-400">Not available</span>}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">IMF WEO - NGDPD (USD)</div>
            </div>

            {/* Population */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">👥 Population</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-blue-400">
                {popByCountry[normalizeCountryName(nameKey)]
                  ? popByCountry[normalizeCountryName(nameKey)].toLocaleString()
                  : <span className="text-gray-400">Not available</span>}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">CountriesNow API</div>
            </div>

            {/* Continent */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">🌍 Continent</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-purple-400">
                {typeof props.continent === 'string' ? props.continent : <span className="text-gray-400">Not available</span>}
              </div>
            </div>
          </div>

          {/* Additional Info Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Inflation */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">📈 Inflation (%)</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-yellow-400">
                {selectedCountryLoading ? 'Loading...' :
                  selectedCountryInflation !== null ? `${selectedCountryInflation.toFixed(2)}%` :
                  <span className="text-gray-400">Not available</span>}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">IMF IFS - CPI inflation (PCPIPCH); WB fallback when unavailable</div>
            </div>

            {/* Tariff */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">🏛️ Applied Average Tariff (%)</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-blue-400">
                {selectedCountryLoading ? 'Loading...' :
                  selectedCountryTariff !== null ? `${selectedCountryTariff.toFixed(2)}%` :
                  <span className="text-gray-400">Not available</span>}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">World Bank - TM.TAX.MRCH.SM.AR.ZS</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
