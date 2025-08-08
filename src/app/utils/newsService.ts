interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string;
}

interface NewsArticle {
  title?: string;
  url?: string;
  source?: { name?: string };
  publishedAt?: string;
  description?: string;
}

interface CachedNewsData {
  data: NewsItem[];
  timestamp: number;
  lastFetchDate: string; // YYYY-MM-DD format
  requestCount: number;
}

interface NewsCache {
  [key: string]: CachedNewsData;
}

// Cache storage keys
const NEWS_CACHE_KEY = 'macroview_news_cache';
const LAST_FETCH_DATE_KEY = 'macroview_last_fetch_date';
const DAILY_REQUEST_COUNT_KEY = 'macroview_daily_request_count';

// Cache duration: 24 hours in milliseconds
const CACHE_DURATION = 24 * 60 * 60 * 1000;

// Maximum requests per day per user
const MAX_DAILY_REQUESTS = 50;

// Global cache object
let memoryCache: NewsCache = {};

// Global fetch control
let isFetchingInProgress = false;
let fetchPromise: Promise<void> | null = null;

// Initialize cache from localStorage
const initializeCache = (): void => {
  try {
    const cached = localStorage.getItem(NEWS_CACHE_KEY);
    if (cached) {
      memoryCache = JSON.parse(cached);
    }
  } catch (error) {
    console.warn('Failed to load news cache from localStorage:', error);
    memoryCache = {};
  }
};

// Save cache to localStorage
const saveCache = (): void => {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(memoryCache));
  } catch (error) {
    console.warn('Failed to save news cache to localStorage:', error);
  }
};

// Get today's date in YYYY-MM-DD format
const getTodayDate = (): string => {
  return new Date().toISOString().split('T')[0];
};

// Check if we can make a request today
const canMakeRequestToday = (): boolean => {
  const today = getTodayDate();
  const lastFetchDate = localStorage.getItem(LAST_FETCH_DATE_KEY);
  const dailyRequestCount = parseInt(localStorage.getItem(DAILY_REQUEST_COUNT_KEY) || '0');

  // If it's a new day, reset the counter
  if (lastFetchDate !== today) {
    localStorage.setItem(LAST_FETCH_DATE_KEY, today);
    localStorage.setItem(DAILY_REQUEST_COUNT_KEY, '0');
    return true;
  }

  // Check if we haven't exceeded daily limit
  return dailyRequestCount < MAX_DAILY_REQUESTS;
};

// Increment daily request count
const incrementRequestCount = (): void => {
  const today = getTodayDate();
  const currentCount = parseInt(localStorage.getItem(DAILY_REQUEST_COUNT_KEY) || '0');
  localStorage.setItem(DAILY_REQUEST_COUNT_KEY, (currentCount + 1).toString());
  localStorage.setItem(LAST_FETCH_DATE_KEY, today);
};

// Check if cache is valid (not expired and from today)
const isCacheValid = (cacheKey: string): boolean => {
  const cached = memoryCache[cacheKey];
  if (!cached) return false;

  const now = Date.now();
  const today = getTodayDate();

  // Check if cache is not expired and from today
  return (
    now - cached.timestamp < CACHE_DURATION &&
    cached.lastFetchDate === today
  );
};

// Get cached news for a category
const getCachedNews = (cacheKey: string): NewsItem[] | null => {
  if (isCacheValid(cacheKey)) {
    return memoryCache[cacheKey].data;
  }
  return null;
};

// Set cached news for a category
const setCachedNews = (cacheKey: string, data: NewsItem[]): void => {
  memoryCache[cacheKey] = {
    data,
    timestamp: Date.now(),
    lastFetchDate: getTodayDate(),
    requestCount: (memoryCache[cacheKey]?.requestCount || 0) + 1
  };
  saveCache();
};

// Fetch news from API with proper error handling
const fetchNewsFromAPI = async (query: string): Promise<NewsItem[]> => {
  const apiKey = process.env.NEXT_PUBLIC_NEWS_API_KEY;
  if (!apiKey || apiKey === 'your_news_api_key_here') {
    throw new Error('NewsAPI key not configured');
  }

  // Check if we can make requests today
  if (!canMakeRequestToday()) {
    throw new Error('Daily request limit exceeded. Please try again tomorrow.');
  }

  // Increment request count
  incrementRequestCount();

  const response = await fetch(
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=3&apiKey=${apiKey}`
  );

  if (response.status === 429) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'error') {
    throw new Error(data.message || 'NewsAPI returned an error');
  }

  if (!data.articles || !Array.isArray(data.articles)) {
    throw new Error('Invalid response format from NewsAPI');
  }

  return data.articles.slice(0, 3).map((article: NewsArticle) => ({
    title: article.title || 'No title available',
    url: article.url || '#',
    source: article.source?.name || 'Unknown',
    publishedAt: article.publishedAt || new Date().toISOString(),
    description: article.description
  }));
};

// Main function to get news for a category
export const getNewsForCategory = async (query: string): Promise<{
  data: NewsItem[];
  fromCache: boolean;
  error?: string;
}> => {
  // Initialize cache if needed
  if (Object.keys(memoryCache).length === 0) {
    initializeCache();
  }

  const cacheKey = query;

  // Check if we have valid cached data
  const cachedData = getCachedNews(cacheKey);
  if (cachedData) {
    return {
      data: cachedData,
      fromCache: true
    };
  }

  // If there's already a fetch in progress, wait for it
  if (isFetchingInProgress && fetchPromise) {
    try {
      await fetchPromise;
      const updatedCachedData = getCachedNews(cacheKey);
      if (updatedCachedData) {
        return {
          data: updatedCachedData,
          fromCache: true
        };
      }
    } catch {
      // Continue to try fetching ourselves
    }
  }

  // Start new fetch
  isFetchingInProgress = true;
  fetchPromise = (async () => {
    try {
      const newsData = await fetchNewsFromAPI(query);
      setCachedNews(cacheKey, newsData);
    } finally {
      isFetchingInProgress = false;
      fetchPromise = null;
    }
  })();

  try {
    await fetchPromise;
    const finalCachedData = getCachedNews(cacheKey);
    if (finalCachedData) {
      return {
        data: finalCachedData,
        fromCache: false
      };
    } else {
      throw new Error('Failed to fetch and cache news data');
    }
  } catch (error) {
    // If fetch failed, try to return expired cache data
    const expiredCache = memoryCache[cacheKey];
    if (expiredCache) {
      return {
        data: expiredCache.data,
        fromCache: true,
        error: error instanceof Error ? error.message : 'Using expired cached data'
      };
    }
    
    throw error;
  }
};

// Get cache statistics
export const getCacheStats = (): {
  totalCachedCategories: number;
  lastFetchDate: string | null;
  dailyRequestCount: number;
  maxDailyRequests: number;
} => {
  const today = getTodayDate();
  const lastFetchDate = localStorage.getItem(LAST_FETCH_DATE_KEY);
  const dailyRequestCount = parseInt(localStorage.getItem(DAILY_REQUEST_COUNT_KEY) || '0');

  return {
    totalCachedCategories: Object.keys(memoryCache).length,
    lastFetchDate: lastFetchDate === today ? lastFetchDate : null,
    dailyRequestCount,
    maxDailyRequests: MAX_DAILY_REQUESTS
  };
};

// Clear cache (useful for testing or manual refresh)
export const clearNewsCache = (): void => {
  memoryCache = {};
  localStorage.removeItem(NEWS_CACHE_KEY);
  localStorage.removeItem(LAST_FETCH_DATE_KEY);
  localStorage.removeItem(DAILY_REQUEST_COUNT_KEY);
  isFetchingInProgress = false;
  fetchPromise = null;
};

// Initialize cache on module load
initializeCache();
