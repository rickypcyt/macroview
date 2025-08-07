// Helper para formatear números grandes en palabras (inglés)
export function formatLargeNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + ' trillion';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + ' billion';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + ' million';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + ' thousand';
  return num.toString();
}

// Helper para formatear inflación en palabras
export function formatInflationWord(value: number): string {
  if (value < 0) return 'deflation';
  if (value < 2) return 'very low';
  if (value < 5) return 'moderate';
  if (value < 10) return 'high';
  if (value < 50) return 'very high';
  return 'hyperinflation';
}

// Helper para formatear tarifa en palabras
export function formatTariffWord(value: number): string {
  if (value < 1) return 'very low';
  if (value < 5) return 'low';
  if (value < 10) return 'moderate';
  if (value < 20) return 'high';
  return 'very high';
}

export function normalizeCountryName(name: string): string {
  const n = name
    .toLowerCase()
    .replace(/\b(the|of|and)\b/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/\s+/g, "");
  if (["unitedstatesamerica", "unitedstates", "usa"].includes(n)) return "US";
  if (["unitedkingdom", "uk"].includes(n)) return "UK";
  return n;
}

// Helper functions for historical data
export function saveHistoricalData(type: 'inflation' | 'gdp' | 'tariff', data: { average?: number; total?: number; countries: number }) {
  try {
    const key = `historical_${type}`;
    const existing = localStorage.getItem(key);
    const history = existing ? JSON.parse(existing) : [];
    
    const newEntry = {
      date: new Date().toISOString(),
      ...data
    };
    
    // Add new entry and keep only last 10 entries
    const updatedHistory = [newEntry, ...history].slice(0, 10);
    localStorage.setItem(key, JSON.stringify(updatedHistory));
  } catch (error) {
    console.error('Failed to save historical data:', error);
  }
}

export function getHistoricalData(type: 'inflation' | 'gdp' | 'tariff') {
  try {
    const key = `historical_${type}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get historical data:', error);
    return [];
  }
}

// Constantes para continentes
export const CONTINENTS_EN = [
  { name: "NORTH AMERICA", lat: 55, lng: -100 },
  { name: "SOUTH AMERICA", lat: -18, lng: -58 },
  { name: "EUROPE", lat: 54, lng: 20 },
  { name: "AFRICA", lat: 2, lng: 22 },
  { name: "ASIA", lat: 45, lng: 100 },
  { name: "AUSTRALIA", lat: -25, lng: 135 },
  { name: "ANTARCTICA", lat: -82, lng: 0 },
];

export const CONTINENT_LABEL_OFFSETS: Record<string, { y: number; size?: string }> = {
  "NORTH AMERICA": { y: 40 },
  "AFRICA": { y: -30 },
  "ASIA": { y: -30 },
  "AUSTRALIA": { y: 0, size: "text-lg md:text-xl" },
};

export const COUNTRIES_PER_CONTINENT: Record<string, number> = {
  "Europe": 50,
  "Asia": 49,
  "Africa": 54,
  "North America": 23,
  "Oceania": 14,
  "South America": 12,
  "Antarctica": 0,
};

export const CONTINENT_NAME_MAP: Record<string, string> = {
  "EUROPE": "Europe",
  "ASIA": "Asia",
  "AFRICA": "Africa",
  "NORTH AMERICA": "North America",
  "SOUTH AMERICA": "South America",
  "AUSTRALIA": "Oceania",
  "ANTARCTICA": "Antarctica",
};

export const CONTINENT_COLORS: Record<string, string> = {
  "Africa": "#34d399",
  "North America": "#f87171",
  "South America": "#fbbf24",
  "Europe": "#60a5fa",
  "Asia": "#a78bfa",
  "Oceania": "#f472b6",
  "Antarctica": "#a3a3a3",
}; 