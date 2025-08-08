import { clearNewsCache, getCacheStats } from './newsService';
import { useCallback, useEffect, useState } from 'react';

interface CacheStats {
  totalCachedCategories: number;
  lastFetchDate: string | null;
  dailyRequestCount: number;
  maxDailyRequests: number;
}

export function useNewsCache() {
  const [stats, setStats] = useState<CacheStats>(getCacheStats());
  const [isClearing, setIsClearing] = useState(false);

  // Update stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getCacheStats());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Manual refresh function
  const refreshStats = useCallback(() => {
    setStats(getCacheStats());
  }, []);

  // Clear cache function
  const clearCache = useCallback(async () => {
    if (confirm("¿Estás seguro de que quieres limpiar el caché de noticias? Esto forzará nuevas consultas a la API.")) {
      setIsClearing(true);
      try {
        clearNewsCache();
        setStats(getCacheStats());
        return true;
      } catch (error) {
        console.error("Error clearing cache:", error);
        return false;
      } finally {
        setIsClearing(false);
      }
    }
    return false;
  }, []);

  // Calculate usage percentage
  const getUsagePercentage = useCallback(() => {
    return Math.round((stats.dailyRequestCount / stats.maxDailyRequests) * 100);
  }, [stats.dailyRequestCount, stats.maxDailyRequests]);

  // Get usage color based on percentage
  const getUsageColor = useCallback(() => {
    const percentage = getUsagePercentage();
    if (percentage >= 80) return "text-red-400";
    if (percentage >= 60) return "text-yellow-400";
    return "text-green-400";
  }, [getUsagePercentage]);

  // Get progress bar color
  const getProgressColor = useCallback(() => {
    const percentage = getUsagePercentage();
    if (percentage >= 80) return "bg-red-500";
    if (percentage >= 60) return "bg-yellow-500";
    return "bg-green-500";
  }, [getUsagePercentage]);

  return {
    stats,
    isClearing,
    refreshStats,
    clearCache,
    getUsagePercentage,
    getUsageColor,
    getProgressColor,
    remainingRequests: Math.max(0, stats.maxDailyRequests - stats.dailyRequestCount),
    isCacheActive: stats.totalCachedCategories > 0
  };
}
