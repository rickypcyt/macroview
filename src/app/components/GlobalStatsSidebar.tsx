"use client";

import React from "react";

interface GlobalGDPState {
  value: number | null;
  year: string | null;
  source: string;
  loading: boolean;
  error: string | null;
}

interface GlobalInflationStatsState {
  average: number | null;
  highest: { country: string; value: number } | null;
  lowest: { country: string; value: number } | null;
  distributionData: { countryName: string; inflation: number }[];
  loading: boolean;
  error: string | null;
  year: string | null;
  countryCount: number | null;
}

interface GlobalSimpleStatState {
  loading: boolean;
  value: number | null;
  error: string | null;
  year: string | null;
}

interface GlobalStatsSidebarProps {
  globalGDP: GlobalGDPState;
  globalInflationStats: GlobalInflationStatsState;
  globalTradeStats: GlobalSimpleStatState;
  globalDebtStats: GlobalSimpleStatState;
}

export function GlobalStatsSidebar({
  globalGDP,
  globalInflationStats,
  globalTradeStats,
  globalDebtStats,
}: GlobalStatsSidebarProps) {
  return (
    <div className="w-full lg:w-80 flex flex-col gap-3 sm:gap-6 h-full md:grid md:grid-cols-2 md:gap-4 md:auto-rows-fr lg:flex">
      {/* GDP Card */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 flex-1 flex flex-col">
        <div className="text-center">
          <div className="text-lg sm:text-xl mb-1 sm:mb-2">💰</div>
          <div className="text-sm sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">
            Global GDP (USD{globalGDP.year ? `, ${globalGDP.year}` : ''})
          </div>
          <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-green-400">
            {globalGDP.loading
              ? 'Loading...'
              : globalGDP.error
                ? 'Error loading data'
                : `$${(globalGDP.value! / 1e12).toFixed(2)}T`}
          </div>
          <div className="text-sm text-gray-400 mt-1 sm:mt-2">
            {globalGDP.source || 'Loading source...'}
          </div>
        </div>
      </div>

      {/* Inflation Card */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 flex-1 flex flex-col">
        <div className="text-center">
          <div className="text-lg sm:text-xl mb-1 sm:mb-2">📈</div>
          <div className="text-sm sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Global Inflation (%)</div>
          <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-yellow-400">
            {globalInflationStats.loading ? 'Loading...' :
              globalInflationStats.error ? 'Error' :
                globalInflationStats.average !== null ? `${globalInflationStats.average.toFixed(2)}%` : 'Not available'}
          </div>
          <div className="text-sm text-gray-400 mt-1 sm:mt-2">
            World Bank - Consumer Price Index ({globalInflationStats.year || '...'})
          </div>
          {(globalInflationStats.countryCount ?? globalInflationStats.distributionData.length) > 0 && (
            <div className="text-sm text-gray-400 mt-1 sm:mt-2">
              Based on {globalInflationStats.countryCount ?? globalInflationStats.distributionData.length} countries
            </div>
          )}
          {globalInflationStats.error && (
            <div className="text-sm text-red-400 mt-1 sm:mt-2">
              {globalInflationStats.error}
            </div>
          )}
        </div>
      </div>

      {/* Trade Flows Card */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 flex-1 flex flex-col">
        <div className="text-center">
          <div className="text-lg sm:text-xl mb-1 sm:mb-2">🌐</div>
          <div className="text-sm sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Global Trade Flows (%)</div>
          <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-purple-400">
            {globalTradeStats.loading ? 'Loading...' :
              globalTradeStats.error ? 'Error' :
                globalTradeStats.value !== null ? `${globalTradeStats.value.toFixed(1)}%` : 'Not available'}
          </div>
          <div className="text-sm text-gray-400 mt-1 sm:mt-2">
            World Bank - Trade as % of GDP ({globalTradeStats.year || '...'})
          </div>
          {globalTradeStats.error && (
            <div className="text-sm text-red-400 mt-1 sm:mt-2">
              {globalTradeStats.error}
            </div>
          )}
        </div>
      </div>

      {/* External Debt Card */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 flex-1 flex flex-col">
        <div className="text-center">
          <div className="text-lg sm:text-xl mb-1 sm:mb-2">🏦</div>
          <div className="text-sm sm:text-sm font-medium text-gray-300 mb-1 sm:mb-2">Global External Debt</div>
          <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-red-400">
            {globalDebtStats.loading ? 'Loading...' :
              globalDebtStats.error ? 'Error' :
                globalDebtStats.value !== null ? `$${(globalDebtStats.value / 1e12).toFixed(2)}T` : 'Not available'}
          </div>
          <div className="text-sm text-gray-400 mt-1 sm:mt-2">
            World Bank - External Debt Stocks ({globalDebtStats.year || '...'})
          </div>
          {globalDebtStats.error && (
            <div className="text-sm text-red-400 mt-1 sm:mt-2">
              {globalDebtStats.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
