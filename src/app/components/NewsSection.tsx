"use client";

import React, { useEffect, useState } from "react";



// Cache for news data to avoid unnecessary requests
const newsCache = {
  data: null as {title: string, url: string, source: string, publishedAt: string, description?: string}[] | null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes cache
};

export function NewsSection() {
  const [news, setNews] = useState<{title: string, url: string, source: string, publishedAt: string, description?: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNews = async () => {
      setLoading(true);
      setError(null);
      
      // Check cache first
      const now = Date.now();
      if (newsCache.data && (now - newsCache.timestamp) < newsCache.ttl) {
        setNews(newsCache.data);
        setLoading(false);
        return;
      }

      try {
        const apiKey = process.env.NEXT_PUBLIC_NEWS_API_KEY;
        if (!apiKey) {
          throw new Error('NewsAPI key not configured');
        }

        const response = await fetch(`https://newsapi.org/v2/top-headlines?country=us&category=business&pageSize=6&apiKey=${apiKey}`);
        
        if (!response.ok) {
          throw new Error(`NewsAPI error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.status === 'error') {
          throw new Error(data.message || 'NewsAPI returned an error');
        }

        if (data.articles && Array.isArray(data.articles)) {
          const formattedNews = data.articles.slice(0, 6).map((article: { title?: string; url?: string; source?: { name?: string }; publishedAt?: string; description?: string }) => ({
            title: article.title,
            url: article.url,
            source: article.source?.name || 'Unknown',
            publishedAt: article.publishedAt || new Date().toISOString(),
            description: article.description
          }));

          // Update cache
          newsCache.data = formattedNews;
          newsCache.timestamp = now;
          
          setNews(formattedNews);
          setLoading(false);
        } else {
          throw new Error('Invalid response format from NewsAPI');
        }
      } catch (error) {
        console.error('NewsAPI error:', error);
        setError(error instanceof Error ? error.message : 'Failed to load news');
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6 text-center text-white">📰 Latest Economic News</h2>
      {loading && (
        <div className="text-center py-8">
          <div className="text-gray-300 text-lg">Loading news...</div>
          <div className="mt-4 text-gray-400">Fetching latest economic headlines</div>
        </div>
      )}
      {error && (
        <div className="text-center py-8">
          <div className="text-red-400 text-lg mb-2">⚠️ {error}</div>
          <div className="text-gray-400">Unable to load news at this time</div>
        </div>
      )}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {news.map((item, idx) => (
            <a 
              key={idx} 
              href={item.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all duration-200 border border-white/10 hover:border-white/20 group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-blue-300 group-hover:text-blue-200 font-medium text-base leading-tight mb-2 transition-colors duration-200">
                    {truncateText(item.title, 60)}
                  </h3>
                  {item.description && (
                    <p className="text-gray-400 text-sm leading-relaxed">
                      {truncateText(item.description, 80)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-400">
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
      
      {/* Info about news sources */}
      <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
        <h3 className="text-base font-semibold text-gray-300 mb-2">ℹ️ About the news:</h3>
        <div className="text-sm text-gray-400 space-y-1">
          <p>• Latest economic and financial news from NewsAPI</p>
          <p>• Click any card to read the full article</p>
          <p>• News updates automatically when you refresh the page</p>
          <p>• Cached for 5 minutes to reduce API calls</p>
        </div>
      </div>
    </div>
  );
} 