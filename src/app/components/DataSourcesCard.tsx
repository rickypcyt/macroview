"use client";

import React from "react";

export function DataSourcesCard() {
  return (
    <div className="w-full ">
      <div className="w-full mx-auto">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <span className="text-2xl">📊</span>
            <h2 className="text-xl font-semibold text-white">Data Sources</h2>
          </div>
          <p className="text-sm text-gray-400 text-center mb-6">Explore our trusted data providers</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* World Bank Card */}
            <a
              href="https://data.worldbank.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="flex flex-col items-center text-center">
                <div className="text-2xl mb-2">🌍</div>
                <h3 className="font-medium text-gray-200">World Bank</h3>
                <p className="text-sm text-gray-400 mt-1">Open Data</p>
              </div>
            </a>

            {/* IMF Card */}
            <a
              href="https://www.imf.org/en/Data"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="flex flex-col items-center text-center">
                <div className="text-2xl mb-2">📈</div>
                <h3 className="font-medium text-gray-200">IMF</h3>
                <p className="text-sm text-gray-400 mt-1">World Economic Outlook</p>
              </div>
            </a>

            {/* NewsAPI Card */}
            <a
              href="https://newsapi.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="flex flex-col items-center text-center">
                <div className="text-2xl mb-2">📰</div>
                <h3 className="font-medium text-gray-200">NewsAPI</h3>
                <p className="text-sm text-gray-400 mt-1">News Headlines</p>
              </div>
            </a>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">Data is cached for performance and may be delayed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
