import axios from 'axios';

export interface WorldBankIndicatorData {
  indicator: {
    id: string;
    value: string;
  };
  country: {
    id: string;
    value: string;
  };
  countryiso3code: string;
  date: string;
  value: number | null;
  unit: string;
  obs_status: string;
  decimal: number;
}

export async function fetchGlobalGDP(): Promise<{ value: number | null; year: string; source: string }> {
  try {
    // Obtener el PIB global (código de país 'WLD' para todo el mundo)
    const response = await axios.get(
      'https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.CD?format=json&per_page=1'
    );

    const data = response.data[1] as WorldBankIndicatorData[];
    
    if (!data || data.length === 0) {
      throw new Error('No se encontraron datos de PIB global');
    }

    const latestData = data[0];
    
    return {
      value: latestData.value,
      year: latestData.date,
      source: 'World Bank Open Data',
    };
  } catch (error) {
    console.error('Error al obtener el PIB global:', error);
    return { value: null, year: '2025', source: 'IMF World Economic Outlook (estimado)' };
  }
}

// Cache para el PIB global
let globalGDPCache: {
  value: number | null;
  year: string;
  source: string;
  timestamp: number;
} | null = null;

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas en milisegundos

export async function getCachedGlobalGDP() {
  const now = Date.now();
  
  // Si tenemos datos en caché y no han expirado, los devolvemos
  if (globalGDPCache && now - globalGDPCache.timestamp < CACHE_TTL) {
    return globalGDPCache;
  }

  // Si no hay caché o ha expirado, obtenemos nuevos datos
  const gdpData = await fetchGlobalGDP();
  
  // Actualizamos la caché
  globalGDPCache = {
    ...gdpData,
    timestamp: now,
  };

  return globalGDPCache;
}
