"use client";

import React, { useEffect, useRef, useState } from "react";
import { getCacheStats, getNewsForCategory } from "../utils/newsService";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string;
}

interface NewsCategory {
  name: string;
  query: string;
  icon: string;
  news: NewsItem[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
}

const DEFAULT_CATEGORIES: NewsCategory[] = [
  { name: "Tariffs", query: "tariffs trade import export", icon: "🚢", news: [], loading: true, error: null, fromCache: false },
  { name: "World Economy", query: "world economy gdp economic growth", icon: "🌍", news: [], loading: true, error: null, fromCache: false },
  { name: "Inflation Rates", query: "inflation rates central bank monetary policy", icon: "📈", news: [], loading: true, error: null, fromCache: false }
];

export function NewsSection() {
  const [categories, setCategories] = useState<NewsCategory[]>(DEFAULT_CATEGORIES);

  const [cacheStats, setCacheStats] = useState(getCacheStats());
  const hasFetched = useRef(false);

  // Log cache stats to console
  useEffect(() => {
    console.log('📊 News Cache Stats:', {
      dailyRequestCount: cacheStats.dailyRequestCount,
      maxDailyRequests: cacheStats.maxDailyRequests,
      totalCachedCategories: cacheStats.totalCachedCategories,
      lastFetchDate: cacheStats.lastFetchDate,
      usagePercentage: Math.round((cacheStats.dailyRequestCount / cacheStats.maxDailyRequests) * 100) + '%'
    });
  }, [cacheStats]);

  useEffect(() => {
    // Only run once when component mounts, even in Strict Mode
    if (hasFetched.current) return;
    hasFetched.current = true;

    const fetchNewsForCategory = async (category: NewsCategory) => {
      try {
        const result = await getNewsForCategory(category.query);
        
        setCategories(prev => prev.map(cat => 
          cat.name === category.name 
            ? { 
                ...cat, 
                news: result.data, 
                loading: false, 
                error: result.error || null,
                fromCache: result.fromCache
              }
            : cat
        ));

        // Update cache stats
        setCacheStats(getCacheStats());
      } catch (error) {
        console.error(`Error fetching news for ${category.name}:`, error);
        
        setCategories(prev => prev.map(cat => 
          cat.name === category.name 
            ? { 
                ...cat, 
                loading: false, 
                error: error instanceof Error ? error.message : 'Failed to load news',
                fromCache: false
              }
            : cat
        ));
      }
    };

    // Fetch news for each category sequentially to avoid overwhelming the API
    const fetchAllNews = async () => {
      for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
        await fetchNewsForCategory(DEFAULT_CATEGORIES[i]);
        // Small delay between requests to be respectful to the API
        if (i < DEFAULT_CATEGORIES.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    };

    fetchAllNews();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full">
      <h2 className="text-2xl font-semibold mb-6 text-center text-white">📰 Financial & Business News</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 gap-6">
        {categories.map((category) => (
          <div key={category.name} className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{category.icon}</span>
              <h3 className="text-lg font-semibold text-white">{category.name}</h3>
            </div>
            
            {category.loading && (
              <div className="text-center py-4">
                <div className="text-gray-300 text-sm">Loading...</div>
              </div>
            )}
            
            {category.error && (
              <div className="text-center py-4">
                <div className="text-yellow-400 text-sm">⚠️ {category.error}</div>
              </div>
            )}
            
            {!category.loading && !category.error && category.news.length > 0 && (
              <div className="space-y-3">
                {category.news.map((item, idx) => (
                  <a 
                    key={idx} 
                    href={item.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all duration-200 border border-white/10 hover:border-white/20 group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-blue-300 group-hover:text-blue-200 font-medium text-base leading-tight mb-2 transition-colors duration-200">
                          {item.title}
                        </h4>
                        {item.description && (
                          <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-400 mt-2">
                      <span className="flex items-center gap-1">
                        <span className="text-blue-400">📰</span>
                        {item.source}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-green-400">📅</span>
                        {formatDate(item.publishedAt)}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
            
            {!category.loading && !category.error && category.news.length === 0 && (
              <div className="text-center py-4">
                <div className="text-gray-400 text-sm">No {category.name} news available</div>
                {process.env.NODE_ENV === 'production' && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    Hint: If this persists, verify NEWS_API_KEY is set in Vercel and redeploy.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      

    </div>
  );
} 