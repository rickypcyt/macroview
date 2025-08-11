import axios from 'axios';

// Lightweight SDMX and IMF DataMapper shapes
type SDMXObs = { ['@TIME_PERIOD']?: string; ['@OBS_VALUE']?: string | number | null };
type SDMXSeries = { Obs?: SDMXObs[] };
type SDMXResponse = { CompactData?: { DataSet?: { Series?: SDMXSeries | SDMXSeries[] } } };
type DMResponse = {
  data?: Record<string, unknown>;
  // Some endpoints return a nested shape under `values` like:
  // { values: { INDICATOR: { ISO3: { '1980': number, ... } } } }
  values?: Record<string, Record<string, Record<string, unknown>>>;
};

// Simple in-memory caches
let globalWEO_GDP_Cache: { value: number | null; year: string | null; source: string; timestamp: number } | null = null;
let globalWEO_Inflation_Cache: { value: number | null; year: string | null; source: string; timestamp: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// Lightweight in-flight deduplication and short-lived response cache to avoid repeated GETs
const inFlightRequests: Map<string, Promise<{ data: unknown }>> = new Map();
const RESPONSE_CACHE = new Map<string, { data: unknown; timestamp: number }>();
const RESPONSE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// Long-lived caches for metadata lists
let dmIndicatorsCache: { items: { code: string; label: string }[]; timestamp: number } | null = null;
let dmCountriesCache: { items: { iso3: string; name: string }[]; timestamp: number } | null = null;

// Helper to safely read nested SDMX JSON values
function getFirstObs(series: SDMXSeries | SDMXSeries[] | undefined): { time: string | null; value: number | null } {
  try {
    const s: SDMXSeries | undefined = Array.isArray(series) ? series[0] : series;
    const obs = s?.Obs;
    if (Array.isArray(obs) && obs.length > 0) {
      // Take the first (usually latest) observation
      const { ['@TIME_PERIOD']: time, ['@OBS_VALUE']: val } = obs[0] || {};
      const value = val !== undefined && val !== null ? Number(val) : null;
      return { time: time ?? null, value };
    }
  } catch {}
  return { time: null, value: null };
}

// ===== Nominal GDP (IMF NGDPD, billions USD) helpers =====
// Returns value in absolute USD (convert billions -> * 1e9)
export async function getIMF_NGDPDForYearByIso3(
  iso3: string,
  year: number
): Promise<{ value: number | null; year: string | null }> {
  const r = await getDMIndicatorValueForYear('NGDPD', iso3, year);
  if (r.value == null) return r;
  const usd = Number(r.value) * 1e9;
  return { value: isFinite(usd) ? usd : null, year: r.year };
}

export async function getIMF_NGDPDLatestByIso3(
  iso3: string
): Promise<{ value: number | null; year: string | null }> {
  if (!iso3 || iso3.length < 3) return { value: null, year: null };
  try {
    const url = buildDMIndicatorUrl('NGDPD', iso3.toUpperCase());
    const { data } = await getWithRetry(url, 2);
    const dm = data as Partial<DMResponse> | undefined;
    const block1 = dm?.data?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const block2 = dm?.values?.NGDPD?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const source = block1 || block2;
    if (!source || typeof source !== 'object') return { value: null, year: null };
    const nowYear = new Date().getFullYear();
    const years = Object.keys(source)
      .filter(k => /^\d{4}$/.test(k))
      .map(y => Number(y))
      .filter(y => y <= nowYear)
      .sort((a, b) => a - b);
    if (!years.length) return { value: null, year: null };
    const latestYear = String(years[years.length - 1]);
    const raw = (source as Record<string, unknown>)[latestYear];
    const numBillions = raw != null ? Number(raw) : null;
    const usd = numBillions != null ? Number(numBillions) * 1e9 : null;
    return { value: isFinite(Number(usd)) ? Number(usd) : null, year: latestYear };
  } catch (err) {
    console.error(`IMF DataMapper latest NGDPD fetch failed for ${iso3}:`, err);
    return { value: null, year: null };
  }
}

// Fetch WEO global inflation (PCPIPCH) for World aggregate (WLD), annual frequency.
export async function getCachedGlobalWEO_Inflation(): Promise<{ value: number | null; year: string | null; source: string }> {
  const now = Date.now();
  if (globalWEO_Inflation_Cache && (now - globalWEO_Inflation_Cache.timestamp) < CACHE_TTL) {
    const { value, year, source } = globalWEO_Inflation_Cache;
    return { value, year, source };
  }
  // World Bank global CPI inflation (WLD)
  const wb = await getWorldBankLatest('WLD', 'FP.CPI.TOTL.ZG');
  const result = { value: wb.value, year: wb.year, source: 'World Bank' };
  globalWEO_Inflation_Cache = { ...result, timestamp: now };
  return result;
}

// removed unused helper getAllObsWithin (was used for WEO SDMX range fetches)

// WEO Global Inflation history (PCPIPCH) for WLD
export async function getGlobalWEOInflationHistory(startYear?: number, endYear?: number): Promise<{ year: string; value: number }[]> {
  // Use World Bank global aggregate (WLD) CPI inflation
  const rows = await getWorldBankHistory('WLD', 'FP.CPI.TOTL.ZG', startYear, endYear);
  return rows;
}

// Get latest Lending Interest Rate (% pa) from IFS for a country as a proxy policy rate
// Series: FILR_PA (Percent per annum)
export async function getIFSInterestRateLatestWithYear(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  // Primary: World Bank lending/real interest rates
  try {
    const wb = await getWBLendingOrRealRateLatest(iso2);
    if (wb.value != null) return wb;
  } catch {}
  return { value: null, year: null };
}

// ===== Unemployment Rate (IMF LUR) helpers =====
// Get latest unemployment rate (%) from IMF DataMapper LUR for a given ISO2 code.
// IMF-preferred, no WB fallback here.
export async function getIMF_LURLatestWithYear(iso2: string): Promise<{ value: number | null; year: string | null }> {
  try {
    if (!iso2 || iso2.length < 2) return { value: null, year: null };
    const iso3 = await iso2ToIso3(iso2);
    if (!iso3) return { value: null, year: null };
    return await getDMIndicatorLatest('LUR', iso3);
  } catch (err) {
    console.error(`IMF DataMapper latest LUR fetch failed for ${iso2}:`, err);
    return { value: null, year: null };
  }
}

// IMF-only latest CPI inflation (% change), IFS PCPIPCH, no WB fallback
export async function getIMF_IFS_PCPIPCHLatestWithYear(iso2: string): Promise<{ value: number | null; year: string | null }> {
  try {
    if (!iso2 || iso2.length < 2) return { value: null, year: null };
    const iso3 = await iso2ToIso3(iso2);
    if (!iso3) return { value: null, year: null };
    return await getDM_IFSInflationLatestWithYear(iso3);
  } catch (err) {
    console.error(`IMF DataMapper latest PCPIPCH fetch failed for ${iso2}:`, err);
    return { value: null, year: null };
  }
}

// IMF GFS proxy: Taxes on international trade (as % of GDP)
// Note: This is a proxy for tariff burden using government revenue data. Availability varies.
export async function getGFS_TradeTaxesProxyLatestPercent(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  try {
    // Attempt only a single SDMX GFS series to avoid unnecessary extra GETs.
    // If not available or fails, return null and let caller fallback to WB tariff.
    const url = buildSDMXUrl(`GFS/A.${iso2.toUpperCase()}.TXG_TRADE_GDP_PCT`);
    try {
      const { data } = await getWithRetry(url, 1);
      const series = (data as SDMXResponse)?.CompactData?.DataSet?.Series;
      const firstSeries = Array.isArray(series) ? series[0] : series;
      const { time, value } = getFirstObs(firstSeries);
      if (value != null && !isNaN(Number(value))) {
        return { value: Number(value), year: time ?? null };
      }
    } catch {}
  } catch (err) {
    console.warn(`IMF GFS trade taxes proxy failed for ${iso2}:`, err);
  }
  return { value: null, year: null };
}

// WEO Global Nominal GDP history (NGDPD, billions USD). Convert to absolute USD by * 1e9
export async function getGlobalWEONGDPDHistory(startYear?: number, endYear?: number): Promise<{ year: string; value: number }[]> {
  // Use World Bank global aggregate (WLD) GDP current US$
  const rows = await getWorldBankHistory('WLD', 'NY.GDP.MKTP.CD', startYear, endYear);
  return rows;
}

// IMF SDMX base
const IMF_BASE = 'https://dataservices.imf.org/REST/SDMX_JSON.svc/CompactData';
const HTTP_TIMEOUT_MS = 15000; // IMF can be slow; allow more time before fallback
// IMF DataMapper base (simple JSON, no key, ISO3 country codes)
const IMF_DM_BASE = 'https://www.imf.org/external/datamapper/api/v1';

// When running in the browser, go through our Next.js API proxy to avoid CORS
const isBrowser = typeof window !== 'undefined';
// World Bank base (supports CORS; no proxy needed)
const WB_BASE = 'https://api.worldbank.org/v2';
function buildSDMXUrl(path: string) {
  // path example: 'WEO/A.WLD.PCPIPCH'
  return isBrowser
    ? `/api/imf/sdmx?path=${encodeURIComponent(path)}`
    : `${IMF_BASE}/${path}`;
}
function buildDMCountriesUrl() {
  return isBrowser ? '/api/imf/countries' : `${IMF_DM_BASE}/countries`;
}
function buildDMIndicatorsUrl() {
  return isBrowser ? '/api/imf/indicators' : `${IMF_DM_BASE}/indicators`;
}
function buildDMIndicatorUrl(indicator: string, countries: string) {
  return isBrowser
    ? `/api/imf/dm/indicator?indicator=${encodeURIComponent(indicator)}&countries=${encodeURIComponent(countries)}`
    : `${IMF_DM_BASE}/${indicator}/${countries}`;
}

// World Bank helpers
function buildWBIndicatorUrl(iso2: string, indicator: string, perPage = 70) {
  // Example: https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=70
  const c = iso2.toLowerCase();
  return `${WB_BASE}/country/${encodeURIComponent(c)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=${perPage}`;
}

async function getWorldBankLatest(iso2: string, indicator: string): Promise<{ value: number | null; year: string | null }> {
  try {
    const url = buildWBIndicatorUrl(iso2, indicator);
    const { data } = await getWithRetry(url, 1);
    // WB returns [meta, rows]
    if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) return { value: null, year: null };
    const rows = data[1] as Array<{ value: number | null; date: string | number | null }>;
    for (const row of rows) {
      const v = row?.value;
      const d = row?.date;
      if (v !== null && v !== undefined) {
        const year = typeof d === 'string' ? d : d != null ? String(d) : null;
        const num = Number(v);
        return { value: isFinite(num) ? num : null, year };
      }
    }
    return { value: null, year: null };
  } catch (err) {
    console.warn(`World Bank fetch failed for ${indicator} ${iso2}:`, err);
    return { value: null, year: null };
  }
}

// Generic fetch for a single year's value from DataMapper indicator
async function getDMIndicatorValueForYear(
  indicator: string,
  iso3: string,
  year: number
): Promise<{ value: number | null; year: string | null }> {
  if (!iso3 || iso3.length < 3) return { value: null, year: null };
  try {
    const url = buildDMIndicatorUrl(indicator, iso3.toUpperCase());
    const { data } = await getWithRetry(url, 2);
    const dm = data as Partial<DMResponse> | undefined;
    const y = String(year);
    const block1 = dm?.data?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const block2 = dm?.values?.[indicator]?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const source = block1 || block2;
    if (!source || typeof source !== 'object') return { value: null, year: null };
    const raw = (source as Record<string, unknown>)[y];
    if (raw == null || raw === '') return { value: null, year: null };
    const num = Number(raw);
    return { value: isFinite(num) ? num : null, year: y };
  } catch (err) {
    console.error(`IMF DataMapper year fetch failed for ${indicator} ${iso3} ${year}:`, err);
    return { value: null, year: null };
  }
}

// ===== Population (IMF LP) helpers =====
export async function getIMF_LPForYearByIso3(
  iso3: string,
  year: number
): Promise<{ value: number | null; year: string | null }> {
  return getDMIndicatorValueForYear('LP', iso3, year);
}

export async function getIMF_LPLatestByIso3(
  iso3: string
): Promise<{ value: number | null; year: string | null }> {
  if (!iso3 || iso3.length < 3) return { value: null, year: null };
  try {
    const url = buildDMIndicatorUrl('LP', iso3.toUpperCase());
    const { data } = await getWithRetry(url, 2);
    const dm = data as Partial<DMResponse> | undefined;
    const block1 = dm?.data?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const block2 = dm?.values?.LP?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const source = block1 || block2;
    if (!source || typeof source !== 'object') return { value: null, year: null };
    const years = Object.keys(source).filter(k => /^\d{4}$/.test(k)).sort();
    if (!years.length) return { value: null, year: null };
    const latestYear = years[years.length - 1];
    const raw = (source as Record<string, unknown>)[latestYear];
    const num = raw != null ? Number(raw) : null;
    return { value: isFinite(Number(num)) ? Number(num) : null, year: latestYear };
  } catch (err) {
    console.error(`IMF DataMapper latest LP fetch failed for ${iso3}:`, err);
    return { value: null, year: null };
  }
}

// ===== IMF DataMapper directory endpoints: indicators and countries =====
export async function listIMFIndicators(): Promise<{ code: string; label: string }[]> {
  const now = Date.now();
  if (dmIndicatorsCache && (now - dmIndicatorsCache.timestamp) < CACHE_TTL) {
    return dmIndicatorsCache.items;
  }
  try {
    const url = buildDMIndicatorsUrl();
    const { data } = await getWithRetry(url, 2);
    const dm = data as unknown as DMResponse;
    const obj = dm?.data as Record<string, unknown> | undefined;
    const items = obj
      ? Object.entries(obj).map(([code, label]) => ({ code, label: String(label ?? '') }))
      : [];
    // sort by code for stable order
    items.sort((a, b) => a.code.localeCompare(b.code));
    dmIndicatorsCache = { items, timestamp: now };
    return items;
  } catch (err) {
    console.error('Failed to fetch IMF indicators:', err);
    return [];
  }
}

export async function listIMFCountries(): Promise<{ iso3: string; name: string }[]> {
  const now = Date.now();
  if (dmCountriesCache && (now - dmCountriesCache.timestamp) < CACHE_TTL) {
    return dmCountriesCache.items;
  }
  try {
    const url = buildDMCountriesUrl();
    const { data } = await getWithRetry(url, 2);
    const dm = data as unknown as DMResponse;
    const obj = dm?.data as Record<string, unknown> | undefined;
    const items = obj
      ? Object.entries(obj).map(([iso3, name]) => ({ iso3: iso3.toUpperCase(), name: String(name ?? '') }))
      : [];
    // sort by ISO3 for stable order
    items.sort((a, b) => a.iso3.localeCompare(b.iso3));
    dmCountriesCache = { items, timestamp: now };
    return items;
  } catch (err) {
    console.error('Failed to fetch IMF countries:', err);
    return [];
  }
}

async function getWBLendingOrRealRateLatest(iso2: string): Promise<{ value: number | null; year: string | null }> {
  // Try lending rate first, then real interest rate
  const lend = await getWorldBankLatest(iso2, 'FR.INR.LEND');
  if (lend.value != null) return lend;
  return getWorldBankLatest(iso2, 'FR.INR.RINR');
}

async function getWorldBankHistory(
  isoOrAgg: string,
  indicator: string,
  startYear?: number,
  endYear?: number,
  perPage = 120
): Promise<{ year: string; value: number }[]> {
  try {
    const url = buildWBIndicatorUrl(isoOrAgg, indicator, perPage);
    const { data } = await getWithRetry(url, 1);
    if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) return [];
    const rows = data[1] as Array<{ value: number | null; date: string | number | null }>;
    const parsed = rows
      .map((r) => {
        const y = r?.date != null ? String(r.date) : null;
        const v = r?.value != null ? Number(r.value) : null;
        return y != null && v != null && isFinite(v) ? { year: y, value: v } : null;
      })
      .filter((x): x is { year: string; value: number } => x != null);
    const filtered = parsed.filter((d) => {
      const y = Number(d.year);
      if (startYear && y < startYear) return false;
      if (endYear && y > endYear) return false;
      return true;
    });
    return filtered.sort((a, b) => Number(a.year) - Number(b.year));
  } catch (err) {
    console.warn(`World Bank history fetch failed for ${indicator} ${isoOrAgg}:`, err);
    return [];
  }
}

async function getWithRetry(url: string, retries = 3): Promise<{ data: unknown }> {
  // Response cache short-circuits identical follow-up GETs
  const cached = RESPONSE_CACHE.get(url);
  const now = Date.now();
  if (cached && now - cached.timestamp < RESPONSE_CACHE_TTL) {
    return { data: cached.data };
  }

  // Deduplicate concurrent requests for the same URL
  const existing: Promise<{ data: unknown }> | undefined = inFlightRequests.get(url);
  if (existing) return existing;

  const p: Promise<{ data: unknown }> = (async () => {
    try {
      const resp = await axios.get(url, {
        timeout: HTTP_TIMEOUT_MS,
        validateStatus: (s) => s >= 200 && s < 300
      });
      RESPONSE_CACHE.set(url, { data: resp.data as unknown, timestamp: Date.now() });
      return { data: resp.data as unknown } as { data: unknown };
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const isRetryableHttp = typeof status === 'number' && status >= 500;
      const isTimeout = (err as { code?: string }).code === 'ECONNABORTED';
      const isNetwork = (err as { message?: string }).message?.toLowerCase().includes('network');
      if (retries > 0 && (isTimeout || isNetwork || isRetryableHttp)) {
        // exponential backoff with jitter
        const attempt = 4 - retries; // 1..3
        const base = Math.min(250 * Math.pow(2, attempt), 2000);
        const jitter = Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, base + jitter));
        return getWithRetry(url, retries - 1);
      }
      throw err;
    } finally {
      // Remove from in-flight map regardless of success/failure
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, p);
  return p;
}

// ===== ISO code resolution and IMF DataMapper (ISO3) Helpers =====
const iso3Cache: Record<string, string> = {};
let imfIso3Set: Set<string> | null = null;
async function fetchIMFCountries(): Promise<Set<string>> {
  if (imfIso3Set) return imfIso3Set;
  try {
    const { data } = await getWithRetry(buildDMCountriesUrl(), 2);
    const dm = data as unknown as DMResponse;
    const dataset = dm?.data;
    const entries = dataset ? Object.keys(dataset) : [];
    imfIso3Set = new Set(entries.map(k => k.toUpperCase()));
    return imfIso3Set;
  } catch {
    imfIso3Set = new Set();
    return imfIso3Set;
  }
}

// Static ISO2 -> ISO3 mapping for common countries (extend as needed)
const ISO2_TO_ISO3: Record<string, string> = {
  AD: 'AND', AE: 'ARE', AF: 'AFG', AG: 'ATG', AI: 'AIA', AL: 'ALB', AM: 'ARM', AO: 'AGO', AQ: 'ATA', AR: 'ARG', AS: 'ASM', AT: 'AUT', AU: 'AUS', AW: 'ABW', AX: 'ALA', AZ: 'AZE',
  BA: 'BIH', BB: 'BRB', BD: 'BGD', BE: 'BEL', BF: 'BFA', BG: 'BGR', BH: 'BHR', BI: 'BDI', BJ: 'BEN', BL: 'BLM', BM: 'BMU', BN: 'BRN', BO: 'BOL', BQ: 'BES', BR: 'BRA', BS: 'BHS', BT: 'BTN', BV: 'BVT', BW: 'BWA', BY: 'BLR', BZ: 'BLZ',
  CA: 'CAN', CC: 'CCK', CD: 'COD', CF: 'CAF', CG: 'COG', CH: 'CHE', CI: 'CIV', CK: 'COK', CL: 'CHL', CM: 'CMR', CN: 'CHN', CO: 'COL', CR: 'CRI', CU: 'CUB', CV: 'CPV', CW: 'CUW', CX: 'CXR', CY: 'CYP', CZ: 'CZE',
  DE: 'DEU', DJ: 'DJI', DK: 'DNK', DM: 'DMA', DO: 'DOM', DZ: 'DZA',
  EC: 'ECU', EE: 'EST', EG: 'EGY', EH: 'ESH', ER: 'ERI', ES: 'ESP', ET: 'ETH',
  FI: 'FIN', FJ: 'FJI', FK: 'FLK', FM: 'FSM', FO: 'FRO', FR: 'FRA',
  GA: 'GAB', GB: 'GBR', GD: 'GRD', GE: 'GEO', GF: 'GUF', GG: 'GGY', GH: 'GHA', GI: 'GIB', GL: 'GRL', GM: 'GMB', GN: 'GIN', GP: 'GLP', GQ: 'GNQ', GR: 'GRC', GS: 'SGS', GT: 'GTM', GU: 'GUM', GW: 'GNB', GY: 'GUY',
  HK: 'HKG', HM: 'HMD', HN: 'HND', HR: 'HRV', HT: 'HTI', HU: 'HUN',
  ID: 'IDN', IE: 'IRL', IL: 'ISR', IM: 'IMN', IN: 'IND', IO: 'IOT', IQ: 'IRQ', IR: 'IRN', IS: 'ISL', IT: 'ITA',
  JE: 'JEY', JM: 'JAM', JO: 'JOR', JP: 'JPN',
  KE: 'KEN', KG: 'KGZ', KH: 'KHM', KI: 'KIR', KM: 'COM', KN: 'KNA', KP: 'PRK', KR: 'KOR', KW: 'KWT', KY: 'CYM', KZ: 'KAZ',
  LA: 'LAO', LB: 'LBN', LC: 'LCA', LI: 'LIE', LK: 'LKA', LR: 'LBR', LS: 'LSO', LT: 'LTU', LU: 'LUX', LV: 'LVA', LY: 'LBY',
  MA: 'MAR', MC: 'MCO', MD: 'MDA', ME: 'MNE', MF: 'MAF', MG: 'MDG', MH: 'MHL', MK: 'MKD', ML: 'MLI', MM: 'MMR', MN: 'MNG', MO: 'MAC', MP: 'MNP', MQ: 'MTQ', MR: 'MRT', MS: 'MSR', MT: 'MLT', MU: 'MUS', MV: 'MDV', MW: 'MWI', MX: 'MEX', MY: 'MYS', MZ: 'MOZ',
  NA: 'NAM', NC: 'NCL', NE: 'NER', NF: 'NFK', NG: 'NGA', NI: 'NIC', NL: 'NLD', NO: 'NOR', NP: 'NPL', NR: 'NRU', NU: 'NIU', NZ: 'NZL',
  OM: 'OMN',
  PA: 'PAN', PE: 'PER', PF: 'PYF', PG: 'PNG', PH: 'PHL', PK: 'PAK', PL: 'POL', PM: 'SPM', PN: 'PCN', PR: 'PRI', PS: 'PSE', PT: 'PRT', PW: 'PLW', PY: 'PRY',
  QA: 'QAT',
  RE: 'REU', RO: 'ROU', RS: 'SRB', RU: 'RUS', RW: 'RWA',
  SA: 'SAU', SB: 'SLB', SC: 'SYC', SD: 'SDN', SE: 'SWE', SG: 'SGP', SH: 'SHN', SI: 'SVN', SJ: 'SJM', SK: 'SVK', SL: 'SLE', SM: 'SMR', SN: 'SEN', SO: 'SOM', SR: 'SUR', SS: 'SSD', ST: 'STP', SV: 'SLV', SX: 'SXM', SY: 'SYR', SZ: 'SWZ',
  TC: 'TCA', TD: 'TCD', TF: 'ATF', TG: 'TGO', TH: 'THA', TJ: 'TJK', TK: 'TKL', TL: 'TLS', TM: 'TKM', TN: 'TUN', TO: 'TON', TR: 'TUR', TT: 'TTO', TV: 'TUV', TW: 'TWN', TZ: 'TZA',
  UA: 'UKR', UG: 'UGA', UM: 'UMI', US: 'USA', UY: 'URY', UZ: 'UZB',
  VA: 'VAT', VC: 'VCT', VE: 'VEN', VG: 'VGB', VI: 'VIR', VN: 'VNM', VU: 'VUT',
  WF: 'WLF', WS: 'WSM',
  YE: 'YEM', YT: 'MYT',
  ZA: 'ZAF', ZM: 'ZMB', ZW: 'ZWE'
};

async function iso2ToIso3(iso2: string): Promise<string | null> {
  const key = iso2.toUpperCase();
  if (iso3Cache[key]) return iso3Cache[key];
  const iso3 = ISO2_TO_ISO3[key] || null;
  // Optionally verify against IMF list (non-blocking)
  try {
    const imfSet = await fetchIMFCountries();
    if (iso3 && imfSet.size > 0 && !imfSet.has(iso3)) {
      // If IMF doesn't list it, still return to allow attempt
    }
  } catch {}
  if (iso3) iso3Cache[key] = iso3;
  return iso3;
}

// Generic fetch for a DataMapper indicator returning latest year/value
async function getDMIndicatorLatest(indicator: string, iso3: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso3 || iso3.length < 3) return { value: null, year: null };
  try {
    const url = buildDMIndicatorUrl(indicator, iso3.toUpperCase());
    const { data } = await getWithRetry(url, 2);
    const dm = data as Partial<DMResponse> | undefined;
    const dataset = dm?.data;
    const countryBlock = dataset ? (dataset[iso3.toUpperCase()] as unknown) : undefined;
    if (!countryBlock || typeof countryBlock !== 'object') return { value: null, year: null };
    const years = Object.keys(countryBlock).filter(k => /^\d{4}$/.test(k));
    if (years.length === 0) return { value: null, year: null };
    const latestYear = years.sort().pop() as string;
    const rawVal = (countryBlock as Record<string, unknown>)[latestYear];
    const num = rawVal != null ? Number(rawVal) : null;
    return { value: isFinite(Number(num)) ? Number(num) : null, year: latestYear };
  } catch (err) {
    console.error(`IMF DataMapper fetch failed for ${indicator} ${iso3}:`, err);
    return { value: null, year: null };
  }
}

async function getDM_WEOGDPGrowthLatest(iso3: string): Promise<{ value: number | null; year: string | null }> {
  return getDMIndicatorLatest('NGDP_RPCH', iso3);
}

async function getDM_IFSInflationLatestWithYear(iso3: string): Promise<{ value: number | null; year: string | null }> {
  return getDMIndicatorLatest('PCPIPCH', iso3);
}

// Fetch specific year for an IMF DataMapper indicator
export async function getIMF_PCPIPCHForYearByIso3(
  iso3: string,
  year: number
): Promise<{ value: number | null; year: string | null }> {
  return getDMIndicatorValueForYear('PCPIPCH', iso3, year);
}

// Latest up to a maximum year cap (e.g., 2025), avoiding future projection years
async function getDMIndicatorLatestUpToYear(
  indicator: string,
  iso3: string,
  maxYear: number
): Promise<{ value: number | null; year: string | null }> {
  if (!iso3 || iso3.length < 3) return { value: null, year: null };
  try {
    const url = buildDMIndicatorUrl(indicator, iso3.toUpperCase());
    const { data } = await getWithRetry(url, 2);
    const dm = data as Partial<DMResponse> | undefined;
    const block1 = dm?.data?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const block2 = dm?.values?.[indicator]?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const source = block1 || block2;
    if (!source || typeof source !== 'object') return { value: null, year: null };
    const years = Object.keys(source)
      .filter(k => /^\d{4}$/.test(k))
      .map(y => Number(y))
      .filter(y => y <= maxYear)
      .sort((a, b) => a - b);
    if (!years.length) return { value: null, year: null };
    const y = String(years[years.length - 1]);
    const raw = (source as Record<string, unknown>)[y];
    const num = raw != null ? Number(raw) : null;
    return { value: isFinite(Number(num)) ? Number(num) : null, year: y };
  } catch (err) {
    console.error(`IMF DataMapper latest<=${maxYear} fetch failed for ${indicator} ${iso3}:`, err);
    return { value: null, year: null };
  }
}

export async function getIMF_PCPIPCHLatestUpToYearByIso3(
  iso3: string,
  maxYear: number
): Promise<{ value: number | null; year: string | null }> {
  return getDMIndicatorLatestUpToYear('PCPIPCH', iso3, maxYear);
}

// Convenience: get IMF PCPIPCH for 2025 (preferred), else latest <= 2025, by ISO2 input
export async function getIMF_Inflation2025WithFallbackByIso2(
  iso2: string
): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (!iso3) return { value: null, year: null };
    const preferredYear = 2025;
    const r = await getIMF_PCPIPCHForYearByIso3(iso3, preferredYear);
    if (r.value != null) return r;
    return await getIMF_PCPIPCHLatestUpToYearByIso3(iso3, preferredYear);
  } catch (err) {
    console.error('IMF inflation 2025 fetch failed for', iso2, err);
    return { value: null, year: null };
  }
}


// Generic fetch for a DataMapper indicator returning full history as {year, value}[]
async function getDMIndicatorHistory(indicator: string, iso3: string): Promise<{ year: string; value: number }[]> {
  if (!iso3 || iso3.length < 3) return [];
  try {
    const url = buildDMIndicatorUrl(indicator, iso3.toUpperCase());
    const { data } = await getWithRetry(url, 2);
    const dm = data as Partial<DMResponse> | undefined;
    // Support both shapes:
    // 1) { data: { USA: { '1980': -0.3, ... } } }
    // 2) { values: { NGDP_RPCH: { USA: { '1980': -0.3, ... } } } }
    const obj1 = dm?.data?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const obj2 = dm?.values?.[indicator]?.[iso3.toUpperCase()] as Record<string, unknown> | undefined;
    const series = obj1 || obj2;
    if (!series || typeof series !== 'object') return [];
    const rows = Object.entries(series)
      .filter(([k, v]) => /^\d{4}$/.test(k) && v != null && v !== '')
      .map(([year, val]) => ({ year, value: Number(val) }))
      .filter((d) => isFinite(d.value));
    // sort ascending by year
    rows.sort((a, b) => a.year.localeCompare(b.year));
    return rows;
  } catch (err) {
    console.error(`IMF DataMapper history fetch failed for ${indicator} ${iso3}:`, err);
    return [];
  }
}

// Fetch WEO nominal GDP (NGDPD) for the World aggregate (WLD), annual frequency.
// NGDPD is in billions of USD in WEO; we convert to USD (multiply by 1e9) to match app expectations.
export async function getCachedGlobalWEO_GDP(): Promise<{ value: number | null; year: string | null; source: string }> {
  const now = Date.now();
  if (globalWEO_GDP_Cache && (now - globalWEO_GDP_Cache.timestamp) < CACHE_TTL) {
    const { value, year, source } = globalWEO_GDP_Cache;
    return { value, year, source };
  }

  // World Bank global GDP (WLD, current US$)
  const wb = await getWorldBankLatest('WLD', 'NY.GDP.MKTP.CD');
  const result = { value: wb.value, year: wb.year, source: 'World Bank' };
  globalWEO_GDP_Cache = { ...result, timestamp: now };
  return result;
}

// Get latest annual CPI inflation (% change) from IFS (PCPIPCH) for a given ISO2 code (e.g., US, FR, BR)
export async function getIFSInflationLatest(iso2: string): Promise<number | null> {
  if (!iso2 || iso2.length < 2) return null;
  // Primary: World Bank CPI inflation
  try {
    const wb = await getWorldBankLatest(iso2, 'FP.CPI.TOTL.ZG');
    if (wb.value != null) return wb.value;
  } catch {}
  return null;
}

// Variant returning both value and year for source attribution
export async function getIFSInflationLatestWithYear(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  // Primary: World Bank CPI inflation
  try {
    const wb = await getWorldBankLatest(iso2, 'FP.CPI.TOTL.ZG');
    if (wb.value != null) return wb;
  } catch {}
  return { value: null, year: null };
}

// Get latest Real GDP growth from WEO for a country (NGDP_RPCH, percent change)
export async function getWEOGDPGrowthLatest(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  // Primary: IMF DataMapper (WEO NGDP_RPCH)
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (iso3) {
      const dm = await getDM_WEOGDPGrowthLatest(iso3);
      if (dm.value != null) return dm;
    }
  } catch {}
  // Fallback: World Bank real GDP growth
  try {
    const wb = await getWorldBankLatest(iso2, 'NY.GDP.MKTP.KD.ZG');
    if (wb.value != null) return wb;
  } catch {}
  return { value: null, year: null };
}

// IMF-only latest Real GDP growth (NGDP_RPCH). No WB fallback.
export async function getWEOGDPGrowthLatestIMFOnly(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (!iso3) return { value: null, year: null };
    return await getDM_WEOGDPGrowthLatest(iso3);
  } catch {
    return { value: null, year: null };
  }
}

// WEO Real GDP growth history via IMF DataMapper (NGDP_RPCH)
export async function getWEOGDPGrowthHistory(
  iso2: string,
  startYear?: number,
  endYear?: number
): Promise<{ year: string; value: number }[]> {
  if (!iso2 || iso2.length < 2) return [];
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (!iso3) return [];
    const rows = await getDMIndicatorHistory('NGDP_RPCH', iso3);
    if (!rows.length) return [];
    const s = startYear != null ? String(startYear) : null;
    const e = endYear != null ? String(endYear) : null;
    return rows.filter((r) => (!s || r.year >= s) && (!e || r.year <= e));
  } catch {
    return [];
  }
}

// Get latest nominal GDP (NGDPD) in USD from IMF WEO for a given ISO2 code.
// WEO NGDPD is reported in billions of USD; convert to absolute USD by multiplying by 1e9.
export async function getWEONGDPDLatestUSDWithYear(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  // Primary: World Bank nominal GDP (current US$)
  try {
    const wb = await getWorldBankLatest(iso2, 'NY.GDP.MKTP.CD');
    if (wb.value != null) return wb;
  } catch {}
  return { value: null, year: null };
}
