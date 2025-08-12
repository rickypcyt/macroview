"use client";

import React, { useState } from "react";

import { useNewsCache } from "../utils/useNewsCache";

export function NewsCacheManager() {
  const [showDetails, setShowDetails] = useState(false);
  const {
    stats,
    isClearing,
    refreshStats,
    clearCache,
    getUsagePercentage,
    getUsageColor,
    getProgressColor,
    remainingRequests,
    isCacheActive
  } = useNewsCache();

  const handleClearCache = async () => {
    const success = await clearCache();
    if (success) {
      setTimeout(() => {
        alert("Caché limpiado exitosamente. Las noticias se actualizarán en la próxima carga.");
      }, 100);
    } else {
      alert("Error al limpiar el caché");
    }
  };

  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">🗂️ Gestión de Caché</h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-blue-300 hover:text-blue-200 transition-colors"
        >
          {showDetails ? "Ocultar" : "Mostrar"} detalles
        </button>
      </div>

      {/* Basic stats always visible */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className={`text-2xl font-bold ${getUsageColor()}`}>
            {stats.dailyRequestCount}
          </div>
          <div className="text-sm text-gray-400">Requests hoy</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-300">
            {stats.totalCachedCategories}
          </div>
          <div className="text-sm text-gray-400">Categorías en caché</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-400 mb-1">
          <span>Uso diario</span>
          <span>{getUsagePercentage()}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${getProgressColor()}`}
            style={{ width: `${Math.min(getUsagePercentage(), 100)}%` }}
          ></div>
        </div>
        <div className="text-sm text-gray-500 mt-1">
          Máximo {stats.maxDailyRequests} requests por día
        </div>
      </div>

      {/* Detailed stats */}
      {showDetails && (
        <div className="space-y-2 mb-4 p-3 bg-white/5 rounded-lg">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Última actualización:</span>
            <span className="text-yellow-300">
              {stats.lastFetchDate || "Nunca"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Requests restantes:</span>
            <span className="text-blue-300">
              {remainingRequests}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Estado del caché:</span>
            <span className="text-green-300">
              {isCacheActive ? "Activo" : "Vacío"}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleClearCache}
          disabled={isClearing}
          className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isClearing ? "Limpiando..." : "Limpiar Caché"}
        </button>
        <button
          onClick={refreshStats}
          className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 rounded-lg text-sm font-medium transition-colors"
        >
          🔄
        </button>
      </div>

      {/* Info */}
      <div className="mt-4 text-sm text-gray-500 space-y-1">
        <p>• El caché se limpia automáticamente cada 24 horas</p>
        <p>• Los datos se almacenan localmente en tu navegador</p>
        <p>• Limpiar el caché forzará nuevas consultas a la API</p>
      </div>
    </div>
  );
}
