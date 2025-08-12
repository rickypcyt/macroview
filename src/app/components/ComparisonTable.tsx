"use client";

import * as XLSX from 'xlsx';

import { getIMF_IFS_PCPIEPCHLatestByIso3UpTo, getIMF_LURLatestByIso3UpTo, getWEOGDPGrowthLatestByIso3UpTo, iso2ToIso3, iso3ToIso2 } from '../utils/imfApi';
import { useEffect, useMemo, useRef, useState } from 'react';

import Fuse from 'fuse.js';
import { Info } from 'lucide-react';
import { toPng } from 'html-to-image';

// import { loadCountryGDP } from '../utils/dataService';

// No props currently required

// Cap IMF "latest" to avoid future projection years
const MAX_IMF_YEAR = 2025;
const STORAGE_KEY = 'comparisonTable.countries';

// Guard long-running network calls so loading state doesn't hang
function withTimeout<T>(promise: Promise<T>, ms = 12000, label = 'request'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// World Bank API typed helpers
type WBRow = { value: number | string | null; date: string };
async function fetchWBLatestNonNullNumber(iso2: string, indicator: string, label: string): Promise<{ value: number | null; year: string | null }> {
  // 1) Try MRV=1 for most recent non-null
  const urlLatest = `https://api.worldbank.org/v2/country/${iso2}/indicator/${indicator}?format=json&MRV=1`;
  const resLatest = await withTimeout(fetch(urlLatest, { cache: 'no-store' }), 12000, `${label} latest`);
  const jsonLatest = await resLatest.json();
  let rows: WBRow[] = Array.isArray(jsonLatest) ? (jsonLatest[1] as WBRow[]) : [];
  if (Array.isArray(rows) && rows.length) {
    const r = rows[0];
    const v = r && r.value != null ? Number(r.value) : null;
    if (!Number.isNaN(v as number) && v != null) {
      return { value: v, year: r.date ? String(r.date) : null };
    }
  }
  // 2) Fallback: fetch a larger window and pick first non-null numeric
  const urlScan = `https://api.worldbank.org/v2/country/${iso2}/indicator/${indicator}?format=json&per_page=200`;
  const resScan = await withTimeout(fetch(urlScan, { cache: 'no-store' }), 12000, `${label} scan`);
  const jsonScan = await resScan.json();
  rows = Array.isArray(jsonScan) ? (jsonScan[1] as WBRow[]) : [];
  if (Array.isArray(rows) && rows.length) {
    const first = rows.find(r => r && r.value != null && !Number.isNaN(Number(r.value)));
    if (first) {
      return { value: Number(first.value), year: first.date ? String(first.date) : null };
    }
  }
  return { value: null, year: null };
}

interface CountryData {
  name: string;
  iso3: string;
  gdpGrowth?: number;
  gdpGrowthYear?: string;
  gdpGrowthSourceLabel?: string;
  inflation?: number;
  inflationYear?: string;
  inflationSourceLabel?: string;
  interestRate?: number;
  interestRateYear?: string;
  interestRateSourceLabel?: string;
  unemployment?: number;
  unemploymentYear?: string;
  unemploymentSourceLabel?: string;
  laborForceParticipation?: number;
  laborForceParticipationYear?: string;
  easeOfDoingBusiness?: number;
  easeOfDoingBusinessYear?: string;
  legalFramework?: string;
  legalFrameworkYear?: string;
  digitalReadiness?: string;
  digitalReadinessYear?: string;
  marketMaturity?: string;
  marketMaturityYear?: string;
}

interface SearchCountry {
  id: string;
  name: string;
  iso3Code: string;
  iso2Code: string | null;
  incomeLevel?: string;
}

type StoredCountry = { iso3: string; name: string };

const INDICATORS = [
  'GDP Growth (annual %, latest)',
  'Inflation (YoY, latest)',
  'Real Interest Rate (%, latest)',
  'Unemployment Rate (%, latest)',
  'Labor Force Participation (%, latest)',
  'Ease of Doing Business (rank, latest)',
  'Legal Framework (Factoring/ABL)',
  'Digital/Fintech Readiness',
  'Market Maturity (Factoring/ABL)'
];

export default function ComparisonTable() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [countries, setCountries] = useState<CountryData[]>([]);
  const [worldBankCountries, setWorldBankCountries] = useState<SearchCountry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [filteredCountries, setFilteredCountries] = useState<SearchCountry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  // Global blocking overlay removed; we use per-country mini loaders
  // Track which countries are currently fetching indicators
  const [loadingCountries, setLoadingCountries] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [sortAZ, setSortAZ] = useState(true);
  const restoredRef = useRef(false);

  // Restore selected countries from localStorage on first mount
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return;
      const list: StoredCountry[] = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      list.forEach((sc) => {
        if (!sc || !sc.iso3 || !sc.name) return;
        const iso2 = iso3ToIso2(sc.iso3);
        const stub: SearchCountry = { id: sc.iso3, name: sc.name, iso3Code: sc.iso3, iso2Code: iso2 ?? null };
        // addCountry handles dedupe and triggers fresh indicator fetches
        addCountry(stub);
      });
    } catch (e) {
      console.error('Failed to restore countries from storage:', e);
    }
    // Mark restoration attempt complete so future changes persist
    restoredRef.current = true;
    // run only once after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Persist minimal list (iso3 + name) whenever countries list changes
  useEffect(() => {
    if (!mounted || !restoredRef.current) return;
    try {
      const minimal: StoredCountry[] = countries.map(c => ({ iso3: c.iso3, name: c.name }));
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
      }
    } catch (e) {
      console.error('Failed to persist countries to storage:', e);
    }
  }, [countries, mounted]);

  // Load countries list from IMF (ISO3-first). Fall back to WB if needed
  useEffect(() => {
    const loadCountries = async () => {
      try {
        // Prefer local IMF countries JSON for deterministic ISO3 list
        try {
          const res = await fetch('/imf_countries.json');
          const json = await res.json();
          if (json && json.countries && typeof json.countries === 'object') {
            const entries = Object.entries(json.countries) as [string, { label: string }][];
            const mapped: SearchCountry[] = entries.map(([iso3, obj]) => ({
              id: iso3,
              name: obj.label,
              iso3Code: iso3,
              iso2Code: iso3ToIso2(iso3)
            }));
            setWorldBankCountries(mapped);
            return;
          }
        } catch (e) {
          console.error('Failed to load /imf_countries.json, falling back to WB API', e);
        }

        // Fallback: WB API (map to include iso3 where possible)
        try {
          const wbResp = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400');
          const wbJson = await wbResp.json();
          if (Array.isArray(wbJson) && Array.isArray(wbJson[1])) {
            type WbApiCountry = { id?: string; name: string; iso2Code: string; incomeLevel?: { value?: string } };
            const filtered = (wbJson[1] as WbApiCountry[])
              .filter((c) => typeof c?.name === 'string' && typeof c?.iso2Code === 'string' && c.iso2Code.length === 2);
            const mapped = await Promise.all(filtered.map(async (c) => {
              const iso3 = await iso2ToIso3(c.iso2Code);
              return {
                id: c.id ?? c.iso2Code,
                name: c.name,
                iso3Code: iso3 || '',
                iso2Code: c.iso2Code,
                incomeLevel: c?.incomeLevel?.value
              } as SearchCountry;
            }));
            const valid = mapped.filter(c => !!c.iso3Code);
            setWorldBankCountries(valid.length ? valid : mapped);
          }
        } catch (wbErr) {
          console.error('WB countries fallback failed:', wbErr);
        }
      } catch (error) {
        console.error('Failed to load countries list:', error);
      }
    };
    loadCountries();
  }, []);

  // Debounce search input for smoother UX
  useEffect(() => {
    const id = setTimeout(() => setDebouncedTerm(searchTerm), 250);
    return () => clearTimeout(id);
  }, [searchTerm]);

  // When results update, highlight the first by default
  useEffect(() => {
    if (filteredCountries.length > 0) {
      setSelectedIndex(0);
    } else {
      setSelectedIndex(-1);
    }
  }, [filteredCountries]);

  // Build Fuse index when countries change
  const fuse = useMemo(() => {
    if (!worldBankCountries || worldBankCountries.length === 0) return null;
    return new Fuse(worldBankCountries, {
      keys: ['name', 'iso3Code', 'iso2Code'],
      threshold: 0.3,
      ignoreLocation: true,
      includeScore: false,
      minMatchCharLength: 2,
      useExtendedSearch: false
    });
  }, [worldBankCountries]);

  // Filter countries based on search term using Fuse.js, with ISO code awareness
  useEffect(() => {
    const term = debouncedTerm.trim();
    if (term === '' || !fuse) {
      setFilteredCountries([]);
      setSelectedIndex(-1);
      return;
    }

    const termUpper = term.toUpperCase();
    // Alias to ISO2 mapping
    const aliasToIso2: Record<string, string> = {
      'UK': 'GB', 'UNITED KINGDOM': 'GB', 'GREAT BRITAIN': 'GB',
      'UAE': 'AE', 'UNITED ARAB EMIRATES': 'AE',
      'SOUTH KOREA': 'KR', 'KOREA': 'KR', 'REPUBLIC OF KOREA': 'KR', 'ROK': 'KR',
      'NORTH KOREA': 'KP',
      'IVORY COAST': 'CI', "COTE D'IVOIRE": 'CI', 'COTE DIVOIRE': 'CI',
      'DRC': 'CD', 'CONGO DR': 'CD', 'DEMOCRATIC REPUBLIC OF THE CONGO': 'CD',
      'REPUBLIC OF THE CONGO': 'CG', 'CONGO-BRAZZAVILLE': 'CG',
      'RUSSIA': 'RU', 'RUSSIAN FEDERATION': 'RU',
      'VIETNAM': 'VN', 'VIET NAM': 'VN',
      'SYRIA': 'SY', 'IRAN': 'IR', 'LAOS': 'LA',
      'BOLIVIA': 'BO', 'VENEZUELA': 'VE', 'TANZANIA': 'TZ',
      'CAPE VERDE': 'CV', 'SWAZILAND': 'SZ', 'ESWATINI': 'SZ',
      'PALESTINE': 'PS', 'BRUNEI': 'BN', 'SLOVAKIA': 'SK',
      'CZECH': 'CZ', 'CZECHIA': 'CZ',
      'MYANMAR': 'MM', 'BURMA': 'MM',
      'MACEDONIA': 'MK', 'NORTH MACEDONIA': 'MK',
      'MOLDOVA': 'MD',
      'HOLLAND': 'NL', 'NETHERLANDS': 'NL', 'KINGDOM OF THE NETHERLANDS': 'NL',
      'TURKEY': 'TR', 'TÜRKIYE': 'TR', 'TURKIYE': 'TR',
      'TIMOR-LESTE': 'TL', 'EAST TIMOR': 'TL',
      'CABO VERDE': 'CV',
      'BELARUS': 'BY', 'BYELORUSSIA': 'BY',
      'UNITED STATES OF AMERICA': 'US', 'UNITED STATES': 'US', 'AMERICA': 'US',
    };
    const aliasIso2 = aliasToIso2[termUpper];
    if (aliasIso2) {
      const results = worldBankCountries.filter(c => c.iso2Code?.toUpperCase() === aliasIso2);
      if (results.length) {
        setFilteredCountries(results.slice(0, 10));
        setSelectedIndex(-1);
        return;
      }
    }
    // Direct ISO matches first
    // 2-letter ISO2 exact
    if (term.length === 2) {
      const results = worldBankCountries.filter(c => c.iso2Code?.toUpperCase() === termUpper);
      if (results.length) {
        setFilteredCountries(results.slice(0, 10));
        setSelectedIndex(-1);
        return;
      }
      // No exact, allow prefix
      const pref = worldBankCountries.filter(c => c.iso2Code?.toUpperCase().startsWith(termUpper)).slice(0, 10);
      if (pref.length) {
        setFilteredCountries(pref);
        setSelectedIndex(-1);
        return;
      }
    }

    // 3-letter common aliases mapping to ISO2 (minimal set for now)
    if (term.length === 3) {
      const iso3ToIso2: Record<string, string> = {
        USA: 'US',
        GBR: 'GB',
        FRA: 'FR',
        DEU: 'DE',
        ITA: 'IT',
        ESP: 'ES',
        CAN: 'CA',
        MEX: 'MX',
        BRA: 'BR',
        CHN: 'CN',
        IND: 'IN',
        JPN: 'JP',
        AUS: 'AU',
        ARE: 'AE', // UAE
        ZAF: 'ZA',
        RUS: 'RU',
      };
      const iso2 = iso3ToIso2[termUpper];
      if (iso2) {
        const results = worldBankCountries.filter(c => c.iso2Code?.toUpperCase() === iso2);
        if (results.length) {
          setFilteredCountries(results);
          setSelectedIndex(-1);
          return;
        }
      }
    }

    // Longer term: combine quick substring-on-name with Fuse fallback
    const termLower = term.toLowerCase();
    const quickNameMatches = worldBankCountries.filter(c => (c.name ?? '').toLowerCase().includes(termLower));
    const fuseResults = fuse.search(term).map(r => r.item);

    const dedup = new Map<string, SearchCountry>();
    [...quickNameMatches, ...fuseResults].forEach(c => { dedup.set(c.iso3Code, c); });
    const results = Array.from(dedup.values()).slice(0, 10);

    setFilteredCountries(results);
    setSelectedIndex(-1); // Reset selection when search changes
  }, [debouncedTerm, fuse, worldBankCountries]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredCountries.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCountries.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCountries.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        {
          const idx = (selectedIndex >= 0 && selectedIndex < filteredCountries.length) ? selectedIndex : (filteredCountries.length > 0 ? 0 : -1);
          if (idx >= 0) {
            addCountry(filteredCountries[idx]);
            setSearchTerm('');
            setSelectedIndex(-1);
            // Keep typing flow: refocus input
            inputRef.current?.focus();
          }
        }
        break;
      case 'Escape':
        setSearchTerm('');
        setSelectedIndex(-1);
        break;
    }
  };

  const addCountry = async (country: SearchCountry) => {
    const iso3 = country.iso3Code;
    if (!iso3) {
      console.warn('No ISO3 mapping for', country.iso2Code, country.name);
      return;
    }
    if (countries.find(c => c.iso3 === iso3)) {
      return; // Country already added
    }
    const baseCountry: CountryData = {
      name: country.name,
      iso3
    };

    // Add immediately so the user sees the column and progressive updates
    setCountries(prev => [...prev, baseCountry]);

    // Mark this country as loading for per-cell skeletons
    setLoadingCountries(prev => (prev.includes(iso3) ? prev : [...prev, iso3]));

    // Helper to patch a single country by iso2
    const patchCountry = (patch: Partial<CountryData>) => {
      setCountries(prev => prev.map(c => c.iso3 === iso3 ? { ...c, ...patch } : c));
    };

    // Run indicator fetches with error isolation
    try {
      const tasks: Promise<void>[] = [];

      // GDP Growth (annual %, latest<=2025) — IMF WEO: NGDP_RPCH (ISO3)
      tasks.push((async () => {
        try {
          const { value, year } = await withTimeout(
            getWEOGDPGrowthLatestByIso3UpTo(iso3, MAX_IMF_YEAR),
            12000,
            `IMF WEO NGDP_RPCH ${iso3}`
          );
          if (value != null && typeof value === 'number') {
            patchCountry({
              gdpGrowth: value,
              gdpGrowthYear: year ?? undefined,
              gdpGrowthSourceLabel: year ? `IMF WEO (NGDP_RPCH, ${year})` : 'IMF WEO (NGDP_RPCH)'
            });
          }
        } catch (error) {
          console.error('Error fetching GDP growth (WEO):', error);
        }
      })());

      // Inflation (YoY, latest<=2025) — IMF IFS: PCPIEPCH (end-of-period, ISO3)
      tasks.push((async () => {
        try {
          const { value, year } = await withTimeout(
            getIMF_IFS_PCPIEPCHLatestByIso3UpTo(iso3, MAX_IMF_YEAR),
            12000,
            `IMF IFS PCPIEPCH ${iso3}`
          );
          if (value != null && typeof value === 'number') {
            patchCountry({
              inflation: value,
              inflationYear: year ?? undefined,
              inflationSourceLabel: year ? `IMF IFS (PCPIEPCH, ${year})` : 'IMF IFS (PCPIEPCH)'
            });
          }
        } catch (error) {
          console.error('Error fetching inflation (IFS):', error);
        }
      })());

      // Real Interest Rate (%, latest) — World Bank: FR.INR.RINR (use ISO2 for WB)
      tasks.push((async () => {
        try {
          const iso2wb = iso3ToIso2(iso3);
          if (!iso2wb) return;
          const { value, year } = await fetchWBLatestNonNullNumber(iso2wb, 'FR.INR.RINR', `WB FR.INR.RINR ${iso2wb}`);
          if (value != null) {
            patchCountry({
              interestRate: value,
              interestRateYear: year ?? undefined,
              interestRateSourceLabel: year ? `World Bank (FR.INR.RINR, ${year})` : 'World Bank (FR.INR.RINR)'
            });
          }
        } catch (error) {
          console.error('Error fetching real interest rate (World Bank):', error);
        }
      })());

      // Unemployment Rate (%, latest<=2025) — IMF DataMapper: LUR (ISO3)
      tasks.push((async () => {
        try {
          const { value, year } = await withTimeout(
            getIMF_LURLatestByIso3UpTo(iso3, MAX_IMF_YEAR),
            12000,
            `IMF DM LUR ${iso3}`
          );
          if (value != null && typeof value === 'number') {
            patchCountry({
              unemployment: value,
              unemploymentYear: year ?? undefined,
              unemploymentSourceLabel: year ? `IMF DataMapper (LUR, ${year})` : 'IMF DataMapper (LUR)'
            });
          }
        } catch (error) {
          console.error('Error fetching unemployment (LUR):', error);
        }
      })());

      // Labor Force Participation (%, latest) — World Bank: SL.TLF.ACTI.ZS (use ISO2 for WB)
      tasks.push((async () => {
        try {
          const iso2wb = iso3ToIso2(iso3);
          if (!iso2wb) return;
          const url = `https://api.worldbank.org/v2/country/${iso2wb}/indicator/SL.TLF.ACTI.ZS?format=json&per_page=1`;
          const res = await withTimeout(fetch(url, { cache: 'no-store' }), 12000, `WB SL.TLF.ACTI.ZS ${iso2wb}`);
          const json = await res.json();
          const dataArr = Array.isArray(json) ? json[1] : null;
          const row = Array.isArray(dataArr) && dataArr.length > 0 ? dataArr[0] : null;
          const value = row && typeof row.value === 'number' ? (row.value as number) : null;
          const year = row && row.date ? String(row.date) : null;
          if (value != null) {
            patchCountry({
              laborForceParticipation: value,
              laborForceParticipationYear: year ?? undefined,
            });
          }
        } catch (error) {
          console.error('Error fetching labor force participation (World Bank):', error);
        }
      })());

      // Ease of Doing Business (rank, latest available) — World Bank: IC.BUS.EASE.RNK (use ISO2 for WB)
      tasks.push((async () => {
        try {
          const iso2wb = iso3ToIso2(iso3);
          if (!iso2wb) return;
          const { value, year } = await fetchWBLatestNonNullNumber(iso2wb, 'IC.BUS.EASE.RNK', `WB IC.BUS.EASE.RNK ${iso2wb}`);
          if (value != null) {
            patchCountry({
              easeOfDoingBusiness: value,
              easeOfDoingBusinessYear: year ?? undefined,
            });
          }
        } catch (error) {
          console.error('Error fetching ease of doing business (World Bank):', error);
        }
      })());

      await Promise.allSettled(tasks);
    } catch (error) {
      console.error('Error adding country:', error);
    } finally {
      // Clear per-country loading flag
      setLoadingCountries(prev => prev.filter(c => c !== iso3));
    }

    setSearchTerm('');
  };

  const removeCountry = (iso3: string) => {
    setCountries(prev => prev.filter(c => c.iso3 !== iso3));
  };

  const getIndicatorValue = (country: CountryData, indicatorIndex: number): string => {
    switch (indicatorIndex) {
      case 0: // GDP Growth
        return country.gdpGrowth ? `${country.gdpGrowth > 0 ? '+' : ''}${country.gdpGrowth.toFixed(1)}%` : 'N/A';
      case 1: // Inflation
        return country.inflation ? `${country.inflation.toFixed(1)}%` : 'N/A';
      case 2: // Interest Rate
        return country.interestRate ? `${country.interestRate.toFixed(2)}%` : 'N/A';
      case 3: // Unemployment
        return country.unemployment ? `${country.unemployment.toFixed(1)}%` : 'N/A';
      case 4: // Labor Force Participation
        return country.laborForceParticipation ? `${country.laborForceParticipation.toFixed(1)}%` : 'N/A';
      case 5: // Ease of Doing Business (rank)
        return country.easeOfDoingBusiness ? `${Math.round(country.easeOfDoingBusiness)}` : 'N/A';
      case 6: // Legal Framework
        return country.legalFramework || 'N/A';
      case 7: // Digital Readiness
        return country.digitalReadiness || 'N/A';
      case 8: // Market Maturity
        return country.marketMaturity || 'N/A';
      default:
        return 'N/A';
    }
  };

  const getIndicatorSource = (country: CountryData, indicatorIndex: number): string | null => {
    switch (indicatorIndex) {
      case 0:
        return country.gdpGrowthSourceLabel ?? (country.gdpGrowthYear ? `IMF WEO (NGDP_RPCH, ${country.gdpGrowthYear})` : null);
      case 1:
        return country.inflationSourceLabel ?? (country.inflationYear ? `IMF IFS (PCPIEPCH, ${country.inflationYear})` : null);
      case 2:
        return country.interestRateSourceLabel ?? (country.interestRateYear ? `World Bank (FR.INR.RINR, ${country.interestRateYear})` : 'World Bank (FR.INR.RINR)');
      case 3:
        return country.unemploymentSourceLabel ?? (country.unemploymentYear ? `IMF DataMapper (LUR, ${country.unemploymentYear})` : 'IMF DataMapper (LUR)');
      case 4:
        return country.laborForceParticipationYear ? `World Bank (SL.TLF.ACTI.ZS, ${country.laborForceParticipationYear})` : 'World Bank (SL.TLF.ACTI.ZS)';
      case 5:
        return country.easeOfDoingBusinessYear ? `World Bank (IC.BUS.EASE.RNK, ${country.easeOfDoingBusinessYear})` : 'World Bank (IC.BUS.EASE.RNK)';
      case 6:
        return 'Source not integrated';
      case 7:
        return 'Source not integrated';
      case 8:
        return 'Source not integrated';
      default:
        return 'Source not integrated';
    }
  };

  const getIndicatorColor = (country: CountryData, indicatorIndex: number): string => {
    const value = getIndicatorValue(country, indicatorIndex);
    if (value === 'N/A') return 'bg-gray-900/50 text-gray-500 border-gray-700';

    switch (indicatorIndex) {
      case 0: // GDP Growth
        const gdpGrowth = parseFloat(value.replace('%', ''));
        return gdpGrowth > 0 ? 'bg-green-900/50 text-green-300 border-green-700' : 'bg-red-900/50 text-red-300 border-red-700';
      case 1: // Inflation
        const inflation = parseFloat(value.replace('%', ''));
        return inflation > 5 ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-green-900/50 text-green-300 border-green-700';
      case 2: // Interest Rate
        return 'bg-blue-900/50 text-blue-300 border-blue-700';
      case 3: // Unemployment
        const unemployment = parseFloat(value.replace('%', ''));
        return unemployment > 8 ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-green-900/50 text-green-300 border-green-700';
      case 4: // Labor Force Participation
        return 'bg-purple-900/50 text-purple-300 border-purple-700';
      case 5: // Ease of Doing Business (rank - lower is better)
        const rank = parseInt(value);
        return rank <= 50 ? 'bg-green-900/50 text-green-300 border-green-700' : 
               rank <= 100 ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' : 
               'bg-red-900/50 text-red-300 border-red-700';
      case 6: // Legal Framework
        return value === 'Advanced' ? 'bg-green-900/50 text-green-300 border-green-700' :
               value === 'Intermediate' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' :
               'bg-red-900/50 text-red-300 border-red-700';
      case 7: // Digital Readiness
        return value === 'High' ? 'bg-green-900/50 text-green-300 border-green-700' :
               value === 'Medium' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' :
               'bg-red-900/50 text-red-300 border-red-700';
      case 8: // Market Maturity
        return value === 'Mature' ? 'bg-green-900/50 text-green-300 border-green-700' :
               value === 'Developing' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' :
               'bg-red-900/50 text-red-300 border-red-700';
      default:
        return 'bg-gray-900/50 text-gray-300 border-gray-700';
    }
  };

  // Loading helpers for per-cell skeletons
  const isCountryLoading = (iso3: string): boolean => loadingCountries.includes(iso3);

  const isIndicatorLoading = (country: CountryData, indicatorIndex: number): boolean => {
    if (!isCountryLoading(country.iso3)) return false;
    switch (indicatorIndex) {
      case 0: return country.gdpGrowth === undefined;
      case 1: return country.inflation === undefined;
      case 2: return country.interestRate === undefined;
      case 3: return country.unemployment === undefined;
      case 4: return country.laborForceParticipation === undefined;
      case 5: return country.easeOfDoingBusiness === undefined;
      case 6: return country.legalFramework === undefined;
      case 7: return country.digitalReadiness === undefined;
      case 8: return country.marketMaturity === undefined;
      default: return false;
    }
  };

  const displayedCountries = useMemo(() => {
    if (!sortAZ) return countries;
    return [...countries].sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, sortAZ]);

  const buildExportMatrix = (): string[][] => {
    const headerRow = ['Indicator', ...displayedCountries.map(c => c.name)];
    const rows: string[][] = [headerRow];
    INDICATORS.forEach((indicator, idx) => {
      const row = [indicator, ...displayedCountries.map(c => getIndicatorValue(c, idx))];
      rows.push(row);
    });
    return rows;
  };

  const toCsv = (matrix: string[][]): string => {
    const escapeCell = (cell: string) => {
      const needsQuoting = /[",\n]/.test(cell);
      const escaped = cell.replace(/"/g, '""');
      return needsQuoting ? `"${escaped}"` : escaped;
    };
    return matrix.map(row => row.map(escapeCell).join(',')).join('\n');
  };

  const toMarkdown = (matrix: string[][]): string => {
    if (matrix.length === 0) return '';
    const header = `| ${matrix[0].join(' | ')} |`;
    const divider = `| ${matrix[0].map(() => '---').join(' | ')} |`;
    const body = matrix.slice(1).map(row => `| ${row.join(' | ')} |`).join('\n');
    return [header, divider, body].join('\n');
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportAs = async (format: 'markdown' | 'csv' | 'image' | 'excel') => {
    const matrix = buildExportMatrix();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (format === 'csv') {
      const csv = toCsv(matrix);
      downloadFile(csv, `comparison-${timestamp}.csv`, 'text/csv;charset=utf-8');
    } else if (format === 'excel') {
      // Build a workbook using SheetJS and trigger download as .xlsx
      try {
        const ws = XLSX.utils.aoa_to_sheet(matrix);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Comparison');
        XLSX.writeFile(wb, `comparison-${timestamp}.xlsx`, { bookType: 'xlsx' });
      } catch (err) {
        console.error('Failed to export Excel, falling back to CSV:', err);
        const csv = toCsv(matrix);
        downloadFile(csv, `comparison-${timestamp}.csv`, 'text/csv;charset=utf-8');
      }
    } else if (format === 'markdown') {
      const md = toMarkdown(matrix);
      downloadFile(md, `comparison-${timestamp}.md`, 'text/markdown;charset=utf-8');
    } else if (format === 'image') {
      // Capture only the on-screen comparison table
      try {
        const target = document.getElementById('comparison-table');
        if (!target) throw new Error('export root not found');
        const dataUrl = await toPng(target, { cacheBust: true, pixelRatio: 2, backgroundColor: '#0b0b0b' });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `comparison-${timestamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        console.warn('Capture image failed, falling back to markdown render:', err);
        // Fallback: render markdown and capture hidden container
        const md = toMarkdown(matrix);
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-10000px';
        container.style.top = '0';
        container.style.width = '800px';
        container.style.background = '#0b0b0b';
        container.style.color = '#ffffff';
        container.style.padding = '16px';
        container.innerHTML = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial;">
            <pre style="white-space: pre-wrap; font-size: 12px; line-height: 1.4;">${md.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
          </div>`;
        document.body.appendChild(container);
        try {
          const dataUrl = await toPng(container, { cacheBust: true, pixelRatio: 2 });
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `comparison-${timestamp}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (err2) {
          console.error('Failed to export image:', err2);
        } finally {
          container.remove();
        }
      }
    }
    setIsExportModalOpen(false);
  };

  const toggleSortAZ = () => setSortAZ(prev => !prev);

  return (
    <div id="comparison-export-root" className="fixed inset-0 w-full h-full flex flex-col overflow-y-auto bg-black">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-20 lg:px-16 xl:px-6 md:pt-10 lg:pt-20 pb-6">
        <div className="w-full">
          {/* Toolbar Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 border border-white/20 mb-6">
            {/* Top bar like navbar */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Left placeholder for future buttons */}
              <div className="hidden sm:block w-24 sm:w-32" />

              {/* Search: left-aligned on mobile, centered on sm+ */}
              <div className="flex-1 flex justify-start sm:justify-center">
                <div className="w-full max-w-lg">
                  <input
                    type="text"
                    placeholder="🔍 Add country to table..."
                    value={searchTerm}
                    ref={inputRef}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSearchTerm(v);
                      // Instant ISO2 prefix preview for snappy UX
                      const t = v.trim();
                      if (t.length > 0 && worldBankCountries.length > 0) {
                        const codePrefix = t.toUpperCase();
                        const instant = worldBankCountries
                          .filter(c => (c.iso3Code?.toUpperCase()?.startsWith(codePrefix) || c.iso2Code?.toUpperCase()?.startsWith(codePrefix)))
                          .slice(0, 10);
                        if (instant.length > 0) {
                          setFilteredCountries(instant);
                          setSelectedIndex(-1);
                        }
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm text-base"
                  />
                </div>
              </div>

              {/* Right actions */}
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={toggleSortAZ}
                  className={`px-3 sm:px-4 py-2 rounded-xl border transition-colors text-sm sm:text-base ${
                    sortAZ
                      ? 'bg-green-500/20 text-green-300 border-green-400/30 hover:bg-green-500/30'
                      : 'bg-white/5 text-white border-white/20 hover:bg-white/10'
                  }`}
                  title="Toggle sort columns A-Z"
                >
                  {sortAZ ? 'A–Z: On' : 'A–Z: Off'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(true)}
                  className="px-3 sm:px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30 hover:bg-blue-500/30 transition-colors text-sm sm:text-base"
                >
                  Export
                </button>
              </div>
            </div>
          </div>

          {/* Search Results Card */}
          {filteredCountries.length > 0 && (
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden pb-5 mb-6">
              <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-white font-semibold text-base sm:text-lg">Search results</h2>
                  <span className="text-sm sm:text-sm text-gray-300">{filteredCountries.length} found</span>
                </div>
                <div className="divide-y divide-white/10 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/5">
                  {filteredCountries.map((country, index) => (
                    <button
                      key={country.id}
                      onClick={() => {
                        addCountry(country);
                        setSearchTerm('');
                        setSelectedIndex(-1);
                        inputRef.current?.focus();
                      }}
                      className={`w-full px-4 sm:px-5 py-3 sm:py-4 text-left transition-colors focus:outline-none focus:bg-white/15 ${
                        index === selectedIndex ? 'bg-blue-600/40 text-white' : 'hover:bg-white/10 text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium truncate text-base">{country.name}</div>
                          <div className="text-sm text-gray-400">{country.iso3Code}{country.iso2Code ? ` • ${country.iso2Code}` : ''}</div>
                        </div>
                        <div className="shrink-0">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">Add</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Export Modal */}
          {isExportModalOpen && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60">
              <div className="w-full max-w-md bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Export table</h3>
                  <button
                    onClick={() => setIsExportModalOpen(false)}
                    className="text-white/80 hover:text-white text-xl leading-none"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-gray-300 mb-4">Choose a format to export the comparison table.</p>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => exportAs('excel')}
                    className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm text-left flex items-center justify-between"
                  >
                    <span>Excel (.xlsx)</span>
                    <span className="text-white/60">Sheet with values</span>
                  </button>
                  <button
                    onClick={() => exportAs('markdown')}
                    className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm text-left flex items-center justify-between"
                  >
                    <span>Markdown (.md)</span>
                    <span className="text-white/60">Copy/paste friendly</span>
                  </button>
                  <button
                    onClick={() => exportAs('csv')}
                    className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm text-left flex items-center justify-between"
                  >
                    <span>CSV (.csv)</span>
                    <span className="text-white/60">Comma-separated</span>
                  </button>
                  <button
                    onClick={() => exportAs('image')}
                    className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm text-left flex items-center justify-between"
                  >
                    <span>Image (.png)</span>
                    <span className="text-white/60">Markdown render capture</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Comparison Table Card */}
          <div id="comparison-table" className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
            <div className="overflow-x-auto">
              {!mounted ? (
                <div className="p-8 text-center text-gray-300">Loading…</div>
              ) : (
              <>
              {/* Header Row */}
              <div className="flex bg-white/5 border-b border-white/20 min-w-max">
                <div className="flex-shrink-0 p-4 font-semibold text-white border-r border-white/20 w-[140px] sm:w-[160px] md:w-[180px] text-center text-sm sm:text-base">
                  Indicators
                </div>
                {displayedCountries.map((country) => (
                  <div key={country.iso3} className="flex-shrink-0 p-4 font-semibold text-white border-r border-white/20 w-[110px] sm:w-[120px] md:w-[130px] lg:w-[140px]">
                    <div className="relative flex items-center justify-center">
                      <span className="truncate text-sm sm:text-base text-center">{country.name}</span>
                      <button
                        onClick={() => removeCountry(country.iso3)}
                        className="absolute right-0 text-gray-400 hover:text-red-400 transition-colors text-base flex-shrink-0"
                        title="Remove country"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

              </div>

              {/* Data Rows */}
              {INDICATORS.map((indicator, index) => (
                <div key={indicator} className={`flex border-b border-white/10 min-w-max ${
                  index % 2 === 0 ? 'bg-white/5' : 'bg-transparent'
                }`}>
                  <div className="flex-shrink-0 p-4 font-medium text-blue-300 border-r border-white/20 w-[140px] sm:w-[160px] md:w-[180px] text-sm sm:text-base relative">
                    <div className="flex items-start">
                      <span className="inline-block w-3 h-3" aria-hidden="true"></span>
                      <span className="flex-1 block text-center text-xs sm:text-sm leading-tight">
                        {indicator.includes(' (') ? (
                          <>
                            <span className="block">{indicator.slice(0, indicator.indexOf(' ('))}</span>
                            <span className="block text-white/80">{indicator.slice(indicator.indexOf(' (') + 1)}</span>
                          </>
                        ) : (
                          indicator
                        )}
                      </span>
                      {index < 5 && (
                        <div className="group relative ml-1">
                          <button
                            type="button"
                            className={`text-gray-400 hover:text-white transition-colors ${index === 1 ? 'mt-1' : ''}`}
                            aria-label={`More info about ${indicator}`}
                          >
                            <Info className="w-3 h-3" />
                          </button>
                          {(index === 0 || index === 1 || index === 2 || index === 3) && (
                            <div className="absolute top-5 left-full ml-2 z-50 w-80 bg-neutral-900/90 backdrop-blur-sm border border-white/30 rounded-lg shadow-2xl p-3 text-sm text-gray-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto text-left">
                              {index === 0 && (
                                <p>
                                  Gross domestic product is the most commonly used single measure of a country&#39;s overall economic activity. It represents the total value at constant prices of final goods and services produced within a country during a specified time period, such as one year.
                                </p>
                              )}
                              {index === 1 && (
                                <p>
                                  The end of period consumer price index (CPI) is a measure of a country&#39;s general level of prices based on the cost of a typical basket of consumer goods and services at the end of a given period. The rate of inflation is the percent change in the end of period CPI.
                                </p>
                              )}
                              {index === 2 && (
                                <p>
                                  An interest rate is the amount charged, expressed as a percentage of the principal over a period of time, by the owners of certain kinds of financial assets for putting the financial assets at the disposal of another institutional unit. The real interest rate is the lending interest rate adjusted for inflation as measured by the GDP deflator. The terms and conditions attached to lending rates differ by country, however, limiting their comparability. This indicator is expressed as a percentage (a÷b)*100.
                                </p>
                              )}
                              {index === 3 && (
                                <p>
                                  The number of unemployed persons as a percentage of the total labor force.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {displayedCountries.map((country) => (
                    <div key={`${country.iso3}-${index}`} className="flex-shrink-0 p-4 text-gray-300 border-r border-white/20 w-[110px] sm:w-[120px] md:w-[130px] lg:w-[140px] flex items-center justify-center">
                      {isIndicatorLoading(country, index) ? (
                        <div className="w-16 h-6 rounded-full bg-white/10 border border-white/20 animate-pulse" />
                      ) : (
                        <span
                          title={getIndicatorSource(country, index) || undefined}
                          className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-base font-medium border ${getIndicatorColor(country, index)}`}
                        >
                          {getIndicatorValue(country, index)}
                        </span>
                      )}
                    </div>
                  ))}

              </div>
              ))}
              </>
              )}
            </div>
          </div>
          {/* Removed global blocking overlay; per-cell loaders give better feedback */}
        </div>
      </div>
    </div>
  );
}
