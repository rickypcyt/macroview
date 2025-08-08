"use client";

import React from "react";

export function TestNewsSection() {
  return (
    <div className="w-full p-6 bg-red-500/20 border-2 border-red-500 rounded-lg">
      <h2 className="text-2xl font-semibold mb-4 text-center text-white">🧪 Test News Section</h2>
      <div className="text-center">
        <p className="text-white mb-4">This is a test component to verify rendering</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((num) => (
            <div key={num} className="p-4 bg-white/10 rounded-lg border border-white/20">
              <h3 className="text-blue-300 font-medium mb-2">Test News Item {num}</h3>
              <p className="text-gray-400 text-sm">This is a test news item to verify the grid layout is working.</p>
              <div className="flex items-center justify-between text-sm text-gray-400 mt-3">
                <span>📰 Test Source</span>
                <span>📅 Today</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
