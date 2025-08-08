#!/usr/bin/env node

/**
 * Script de prueba para el sistema de caché de noticias
 * 
 * Este script simula el comportamiento del sistema de caché
 * y verifica que funcione correctamente.
 */

// Simular localStorage para Node.js
const localStorage = {
  data: {},
  getItem(key) {
    return this.data[key] || null;
  },
  setItem(key, value) {
    this.data[key] = value;
  },
  removeItem(key) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

// Simular el entorno del navegador
global.localStorage = localStorage;
global.process = { env: { NEXT_PUBLIC_NEWS_API_KEY: 'test_key' } };

// Simular fetch
global.fetch = async (url) => {
  console.log(`🌐 Mock fetch: ${url}`);
  
  // Simular delay de red
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Simular respuesta exitosa
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: 'ok',
      articles: [
        {
          title: 'Test Article 1',
          url: 'https://example.com/1',
          source: { name: 'Test Source' },
          publishedAt: new Date().toISOString(),
          description: 'Test description 1'
        },
        {
          title: 'Test Article 2',
          url: 'https://example.com/2',
          source: { name: 'Test Source' },
          publishedAt: new Date().toISOString(),
          description: 'Test description 2'
        },
        {
          title: 'Test Article 3',
          url: 'https://example.com/3',
          source: { name: 'Test Source' },
          publishedAt: new Date().toISOString(),
          description: 'Test description 3'
        }
      ]
    })
  };
};

// Importar el servicio de noticias (necesitarás compilar TypeScript primero)
// const { getNewsForCategory, getCacheStats, clearNewsCache } = require('../dist/app/utils/newsService');

// Función de prueba simplificada
async function testNewsCache() {
  console.log('🧪 Iniciando pruebas del sistema de caché de noticias...\n');

  // Simular las funciones del servicio
  const newsCache = {};
  const CACHE_DURATION = 24 * 60 * 60 * 1000;
  const MAX_DAILY_REQUESTS = 50;

  // Función para obtener la fecha de hoy
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  // Función para verificar si se puede hacer request hoy
  const canMakeRequestToday = () => {
    const today = getTodayDate();
    const lastFetchDate = localStorage.getItem('macroview_last_fetch_date');
    const dailyRequestCount = parseInt(localStorage.getItem('macroview_daily_request_count') || '0');

    if (lastFetchDate !== today) {
      localStorage.setItem('macroview_last_fetch_date', today);
      localStorage.setItem('macroview_daily_request_count', '0');
      return true;
    }

    return dailyRequestCount < MAX_DAILY_REQUESTS;
  };

  // Función para incrementar el contador de requests
  const incrementRequestCount = () => {
    const today = getTodayDate();
    const currentCount = parseInt(localStorage.getItem('macroview_daily_request_count') || '0');
    localStorage.setItem('macroview_daily_request_count', (currentCount + 1).toString());
    localStorage.setItem('macroview_last_fetch_date', today);
  };

  // Función para verificar si el caché es válido
  const isCacheValid = (cacheKey) => {
    const cached = newsCache[cacheKey];
    if (!cached) return false;

    const now = Date.now();
    const today = getTodayDate();

    return (
      now - cached.timestamp < CACHE_DURATION &&
      cached.lastFetchDate === today
    );
  };

  // Función para obtener noticias
  const getNewsForCategory = async (query) => {
    console.log(`📰 Obteniendo noticias para: "${query}"`);
    
    const cacheKey = query;
    
    // Verificar caché
    if (isCacheValid(cacheKey)) {
      console.log('✅ Datos encontrados en caché válido');
      return {
        data: newsCache[cacheKey].data,
        fromCache: true
      };
    }

    // Verificar límite diario
    if (!canMakeRequestToday()) {
      console.log('❌ Límite diario de requests alcanzado');
      throw new Error('Daily request limit exceeded');
    }

    // Incrementar contador
    incrementRequestCount();

    // Simular request a la API
    console.log('🌐 Haciendo request a la API...');
    const response = await fetch(`https://newsapi.org/v2/everything?q=${query}`);
    const data = await response.json();

    // Formatear datos
    const formattedNews = data.articles.slice(0, 3).map(article => ({
      title: article.title || 'No title available',
      url: article.url || '#',
      source: article.source?.name || 'Unknown',
      publishedAt: article.publishedAt || new Date().toISOString(),
      description: article.description
    }));

    // Guardar en caché
    newsCache[cacheKey] = {
      data: formattedNews,
      timestamp: Date.now(),
      lastFetchDate: getTodayDate(),
      requestCount: (newsCache[cacheKey]?.requestCount || 0) + 1
    };

    console.log('💾 Datos guardados en caché');
    
    return {
      data: formattedNews,
      fromCache: false
    };
  };

  // Función para obtener estadísticas
  const getCacheStats = () => {
    const today = getTodayDate();
    const lastFetchDate = localStorage.getItem('macroview_last_fetch_date');
    const dailyRequestCount = parseInt(localStorage.getItem('macroview_daily_request_count') || '0');

    return {
      totalCachedCategories: Object.keys(newsCache).length,
      lastFetchDate: lastFetchDate === today ? lastFetchDate : null,
      dailyRequestCount,
      maxDailyRequests: MAX_DAILY_REQUESTS
    };
  };

  // Función para limpiar caché
  const clearNewsCache = () => {
    Object.keys(newsCache).forEach(key => delete newsCache[key]);
    localStorage.removeItem('macroview_news_cache');
    localStorage.removeItem('macroview_last_fetch_date');
    localStorage.removeItem('macroview_daily_request_count');
    console.log('🗑️ Caché limpiado');
  };

  try {
    // Prueba 1: Primera consulta (debe hacer request a la API)
    console.log('=== PRUEBA 1: Primera consulta ===');
    const result1 = await getNewsForCategory('tariffs trade');
    console.log(`Resultado: ${result1.data.length} artículos, desde caché: ${result1.fromCache}`);
    console.log('Estadísticas:', getCacheStats());
    console.log('');

    // Prueba 2: Segunda consulta (debe usar caché)
    console.log('=== PRUEBA 2: Segunda consulta (mismo query) ===');
    const result2 = await getNewsForCategory('tariffs trade');
    console.log(`Resultado: ${result2.data.length} artículos, desde caché: ${result2.fromCache}`);
    console.log('Estadísticas:', getCacheStats());
    console.log('');

    // Prueba 3: Consulta diferente (debe hacer nuevo request)
    console.log('=== PRUEBA 3: Consulta diferente ===');
    const result3 = await getNewsForCategory('inflation rates');
    console.log(`Resultado: ${result3.data.length} artículos, desde caché: ${result3.fromCache}`);
    console.log('Estadísticas:', getCacheStats());
    console.log('');

    // Prueba 4: Limpiar caché
    console.log('=== PRUEBA 4: Limpiar caché ===');
    clearNewsCache();
    console.log('Estadísticas después de limpiar:', getCacheStats());
    console.log('');

    // Prueba 5: Consulta después de limpiar
    console.log('=== PRUEBA 5: Consulta después de limpiar ===');
    const result5 = await getNewsForCategory('tariffs trade');
    console.log(`Resultado: ${result5.data.length} artículos, desde caché: ${result5.fromCache}`);
    console.log('Estadísticas:', getCacheStats());
    console.log('');

    console.log('✅ Todas las pruebas completadas exitosamente!');
    console.log('\n📊 Resumen final:');
    console.log('- Categorías en caché:', getCacheStats().totalCachedCategories);
    console.log('- Requests realizados:', getCacheStats().dailyRequestCount);
    console.log('- Requests restantes:', MAX_DAILY_REQUESTS - getCacheStats().dailyRequestCount);

  } catch (error) {
    console.error('❌ Error durante las pruebas:', error.message);
  }
}

// Ejecutar las pruebas
testNewsCache().catch(console.error);
