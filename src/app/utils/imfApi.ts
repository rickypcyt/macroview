import axios from 'axios';

// Lightweight SDMX and IMF DataMapper shapes
type SDMXObs = { ['@TIME_PERIOD']?: string; ['@OBS_VALUE']?: string | number | null };
type SDMXSeries = { Obs?: SDMXObs[] };
type SDMXResponse = { CompactData?: { DataSet?: { Series?: SDMXSeries | SDMXSeries[] } } };
type DMResponse = { data?: Record<string, unknown> };

// Simple in-memory caches
let globalWEO_GDP_Cache: { value: number | null; year: string | null; source: string; timestamp: number } | null = null;
let globalWEO_Inflation_Cache: { value: number | null; year: string | null; source: string; timestamp: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

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

// Fetch WEO global inflation (PCPIPCH) for World aggregate (WLD), annual frequency.
export async function getCachedGlobalWEO_Inflation(): Promise<{ value: number | null; year: string | null; source: string }> {
  const now = Date.now();
  if (globalWEO_Inflation_Cache && (now - globalWEO_Inflation_Cache.timestamp) < CACHE_TTL) {
    const { value, year, source } = globalWEO_Inflation_Cache;
    return { value, year, source };
  }

  try {
    const url = buildSDMXUrl('WEO/A.WLD.PCPIPCH');
    const { data } = await getWithRetry(url, 1);
    const series = data?.CompactData?.DataSet?.Series;
    if (!series) return { value: null, year: null, source: 'IMF World Economic Outlook' };
    const firstSeries = Array.isArray(series) ? series[0] : series;
    const { time, value } = getFirstObs(firstSeries);
    const parsedYear = time ?? null;
    const parsedValue = value != null ? Number(value) : null;
    const result = { value: parsedValue, year: parsedYear, source: 'IMF World Economic Outlook' };
    globalWEO_Inflation_Cache = { ...result, timestamp: now };
    return result;
  } catch (err) {
    console.error('IMF WEO global inflation fetch failed:', err);
    throw err;
  }
}

// Helper: fetch all observations for a given WEO key (e.g., WEO/A.WLD.NGDPD) within a year range
async function getAllObsWithin(path: string, startYear?: number, endYear?: number) {
  const base = buildSDMXUrl(path);
  const withRange = (() => {
    const params: string[] = [];
    if (startYear) params.push(`startPeriod=${startYear}`);
    if (endYear) params.push(`endPeriod=${endYear}`);
    if (!params.length) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${params.join('&')}`;
  })();
  const { data } = await getWithRetry(withRange, 1);
  const sdmx = data as unknown as SDMXResponse;
  const series = sdmx?.CompactData?.DataSet?.Series;
  const firstSeries: SDMXSeries | undefined = Array.isArray(series) ? series[0] : series;
  const obsArr: SDMXObs[] = firstSeries?.Obs ?? [];
  return obsArr
    .map((o) => ({
      year: o?.['@TIME_PERIOD'] ?? null,
      value: o?.['@OBS_VALUE'] != null ? Number(o['@OBS_VALUE']) : null
    }))
    .filter((d): d is { year: string; value: number } => d.year != null && d.value != null) as { year: string; value: number }[];
}

// WEO Global Inflation history (PCPIPCH) for WLD
export async function getGlobalWEOInflationHistory(startYear?: number, endYear?: number): Promise<{ year: string; value: number }[]> {
  try {
    const path = `WEO/A.WLD.PCPIPCH`;
    const rows = await getAllObsWithin(path, startYear, endYear);
    return rows
      .map(r => ({ year: String(r.year), value: Number(r.value) }))
      .sort((a, b) => Number(a.year) - Number(b.year));
  } catch (err) {
    console.error('IMF WEO global inflation history fetch failed:', err);
    throw err;
  }
}

// Get latest Lending Interest Rate (% pa) from IFS for a country as a proxy policy rate
// Series: FILR_PA (Percent per annum)
export async function getIFSInterestRateLatestWithYear(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  // Primary: DataMapper
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (iso3) {
      const dm = await getDM_IFSInterestRateLatestWithYear(iso3);
      if (dm.value != null) return dm;
    }
  } catch {}
  // Fallback: SDMX
  try {
    const url = `${IMF_BASE}/IFS/A.${iso2.toUpperCase()}.FILR_PA`;
    const { data } = await getWithRetry(url, 1);
    const series = data?.CompactData?.DataSet?.Series;
    const firstSeries = Array.isArray(series) ? series[0] : series;
    const { time, value } = getFirstObs(firstSeries);
    const v = value != null ? Number(value) : null;
    if (v != null) return { value: v, year: time ?? null };
  } catch (err) {
    console.error(`IMF IFS interest rate (SDMX fallback) failed for ${iso2}:`, err);
  }
  return { value: null, year: null };
}

// WEO Global Nominal GDP history (NGDPD, billions USD). Convert to absolute USD by * 1e9
export async function getGlobalWEONGDPDHistory(startYear?: number, endYear?: number): Promise<{ year: string; value: number }[]> {
  try {
    const key = `${IMF_BASE}/WEO/A.WLD.NGDPD`;
    const rows = await getAllObsWithin(key, startYear, endYear);
    return rows
      .map(r => ({ year: String(r.year), value: Number(r.value) * 1e9 }))
      .sort((a, b) => Number(a.year) - Number(b.year));
  } catch (err) {
    console.error('IMF WEO global NGDPD history fetch failed:', err);
    throw err;
  }
}

// IMF SDMX base
const IMF_BASE = 'https://dataservices.imf.org/REST/SDMX_JSON.svc/CompactData';
const HTTP_TIMEOUT_MS = 15000; // IMF can be slow; allow more time before fallback
// IMF DataMapper base (simple JSON, no key, ISO3 country codes)
const IMF_DM_BASE = 'https://www.imf.org/external/datamapper/api/v1';

// When running in the browser, go through our Next.js API proxy to avoid CORS
const isBrowser = typeof window !== 'undefined';
function buildSDMXUrl(path: string) {
  // path example: 'WEO/A.WLD.PCPIPCH'
  return isBrowser
    ? `/api/imf/sdmx?path=${encodeURIComponent(path)}`
    : `${IMF_BASE}/${path}`;
}
function buildDMCountriesUrl() {
  return isBrowser ? '/api/imf/countries' : `${IMF_DM_BASE}/countries`;
}
function buildDMIndicatorUrl(indicator: string, countries: string) {
  return isBrowser
    ? `/api/imf/dm/indicator?indicator=${encodeURIComponent(indicator)}&countries=${encodeURIComponent(countries)}`
    : `${IMF_DM_BASE}/${indicator}?countries=${countries}`;
}

async function getWithRetry(url: string, retries = 3) {
  try {
    return await axios.get(url, {
      timeout: HTTP_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
      validateStatus: (s) => s >= 200 && s < 300,
    });
  } catch (err: unknown) {
    const e = err as { code?: unknown; message?: unknown };
    const code = typeof e.code === 'string' ? e.code : undefined;
    const msg = typeof e.message === 'string' ? e.message : undefined;
    const isTimeout = code === 'ECONNABORTED' || (msg ? /timeout/i.test(msg) : false);
    const isNetwork = msg ? /Network Error/i.test(msg) : false;
    if (retries > 0 && (isTimeout || isNetwork)) {
      // exponential backoff with jitter
      const attempt = 4 - retries; // 1..3
      const base = Math.min(200 * Math.pow(2, attempt), 1500);
      const jitter = Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, base + jitter));
      return getWithRetry(url, retries - 1);
    }
    throw err;
  }
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
    const dm = data as unknown as DMResponse;
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

async function getDM_IFSInterestRateLatestWithYear(iso3: string): Promise<{ value: number | null; year: string | null }> {
  return getDMIndicatorLatest('FILR_PA', iso3);
}

// Fetch WEO nominal GDP (NGDPD) for the World aggregate (WLD), annual frequency.
// NGDPD is in billions of USD in WEO; we convert to USD (multiply by 1e9) to match app expectations.
export async function getCachedGlobalWEO_GDP(): Promise<{ value: number | null; year: string | null; source: string }> {
  const now = Date.now();
  if (globalWEO_GDP_Cache && (now - globalWEO_GDP_Cache.timestamp) < CACHE_TTL) {
    const { value, year, source } = globalWEO_GDP_Cache;
    return { value, year, source };
  }

  try {
    // SDMX key pattern for WEO (dataset/key): WEO/A.WLD.NGDPD
    // Note: Some IMF endpoints accept multiple key orderings; this one is widely supported.
    const url = buildSDMXUrl('WEO/A.WLD.NGDPD');
    const { data } = await getWithRetry(url, 1);

    const series = data?.CompactData?.DataSet?.Series;
    if (!series) throw new Error('WEO GDP series not found');

    const firstSeries = Array.isArray(series) ? series[0] : series;
    const { time, value } = getFirstObs(firstSeries);

    const parsedYear = time ?? null;
    const parsedValue = value != null ? value * 1e9 : null; // Convert billions to absolute USD

    const result = { value: parsedValue, year: parsedYear, source: 'IMF World Economic Outlook' };
    globalWEO_GDP_Cache = { ...result, timestamp: now };
    return result;
  } catch (err) {
    console.error('IMF WEO GDP fetch failed:', err);
    // Bubble up to allow caller to fallback
    throw err;
  }
}

// Get latest annual CPI inflation (% change) from IFS (PCPIPCH) for a given ISO2 code (e.g., US, FR, BR)
export async function getIFSInflationLatest(iso2: string): Promise<number | null> {
  if (!iso2 || iso2.length < 2) return null;
  // Primary: DataMapper
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (iso3) {
      const dm = await getDM_IFSInflationLatestWithYear(iso3);
      if (dm.value != null) return dm.value;
    }
  } catch {}
  // Fallback: SDMX
  try {
    const url = buildSDMXUrl(`IFS/A.${iso2.toUpperCase()}.PCPIPCH`);
    const { data } = await getWithRetry(url, 1);
    const series = data?.CompactData?.DataSet?.Series;
    const firstSeries = Array.isArray(series) ? series[0] : series;
    const { value } = getFirstObs(firstSeries);
    if (value != null) return Number(value);
  } catch (err) {
    console.error(`IMF IFS inflation fetch (SDMX fallback) failed for ${iso2}:`, err);
  }
  return null;
}

// Variant returning both value and year for source attribution
export async function getIFSInflationLatestWithYear(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  // Primary: DataMapper
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (iso3) {
      const dm = await getDM_IFSInflationLatestWithYear(iso3);
      if (dm.value != null) return dm;
    }
  } catch {}
  // Fallback: SDMX
  try {
    const url = buildSDMXUrl(`IFS/A.${iso2.toUpperCase()}.PCPIPCH`);
    const { data } = await getWithRetry(url, 1);
    const series = data?.CompactData?.DataSet?.Series;
    const firstSeries = Array.isArray(series) ? series[0] : series;
    const { time, value } = getFirstObs(firstSeries);
    const v = value != null ? Number(value) : null;
    if (v != null) return { value: v, year: time ?? null };
  } catch (err) {
    console.error(`IMF IFS inflation (SDMX fallback) failed for ${iso2}:`, err);
  }
  return { value: null, year: null };
}

// Get latest Real GDP growth from WEO for a country (NGDP_RPCH, percent change)
export async function getWEOGDPGrowthLatest(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  // Primary: DataMapper
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (iso3) {
      const dm = await getDM_WEOGDPGrowthLatest(iso3);
      if (dm.value != null) return dm;
    }
  } catch {}
  // Fallback: SDMX
  try {
    const url = buildSDMXUrl(`WEO/A.${iso2.toUpperCase()}.NGDP_RPCH`);
    const { data } = await getWithRetry(url, 1);
    const series = data?.CompactData?.DataSet?.Series;
    const firstSeries = Array.isArray(series) ? series[0] : series;
    const { time, value } = getFirstObs(firstSeries);
    const v = value != null ? Number(value) : null;
    if (v != null) return { value: v, year: time ?? null };
  } catch (err) {
    console.error(`IMF WEO GDP growth (SDMX fallback) failed for ${iso2}:`, err);
  }
  return { value: null, year: null };
}

// Get latest nominal GDP (NGDPD) in USD from IMF WEO for a given ISO2 code.
// WEO NGDPD is reported in billions of USD; convert to absolute USD by multiplying by 1e9.
export async function getWEONGDPDLatestUSDWithYear(iso2: string): Promise<{ value: number | null; year: string | null }> {
  if (!iso2 || iso2.length < 2) return { value: null, year: null };
  // Primary: DataMapper (ISO3 required)
  try {
    const iso3 = await iso2ToIso3(iso2);
    if (iso3) {
      const dm = await getDMIndicatorLatest('NGDPD', iso3);
      if (dm.value != null) {
        return { value: dm.value * 1e9, year: dm.year };
      }
    }
  } catch {}
  // Fallback: SDMX WEO
  try {
    const url = buildSDMXUrl(`WEO/A.${iso2.toUpperCase()}.NGDPD`);
    const { data } = await getWithRetry(url, 1);
    const series = data?.CompactData?.DataSet?.Series;
    const firstSeries = Array.isArray(series) ? series[0] : series;
    const { time, value } = getFirstObs(firstSeries);
    const v = value != null ? Number(value) * 1e9 : null;
    if (v != null) return { value: v, year: time ?? null };
  } catch (err) {
    console.error(`IMF WEO NGDPD (SDMX fallback) failed for ${iso2}:`, err);
  }
  return { value: null, year: null };
}
