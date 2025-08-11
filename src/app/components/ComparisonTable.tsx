"use client";

import { useEffect, useMemo, useState } from 'react';

import Fuse from 'fuse.js';
import { toPng } from 'html-to-image';
import { getWEOGDPGrowthLatest, getIFSInterestRateLatestWithYear, getIMF_LURLatestWithYear, getIMF_IFS_PCPIPCHLatestWithYear } from '../utils/imfApi';

// import { loadCountryGDP } from '../utils/dataService';

// No props currently required

interface CountryData {
  name: string;
  iso2: string;
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

interface WorldBankCountry {
  id: string;
  name: string;
  iso2Code: string;
  incomeLevel?: string;
}

const INDICATORS = [
  'GDP Growth (annual %, latest)',
  'Inflation (YoY, latest)',
  'Real Interest Rate (%, latest)',
  'Unemployment Rate (%, latest)',
  'Labor Force Participation (%, latest)',
  'Ease of Doing Business (0–100, latest)',
  'Legal Framework (Factoring/ABL)',
  'Digital/Fintech Readiness',
  'Market Maturity (Factoring/ABL)'
];



export default function ComparisonTable() {
  // Mount flag; do not change hooks order based on it
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [countries, setCountries] = useState<CountryData[]>([]);
  const [worldBankCountries, setWorldBankCountries] = useState<WorldBankCountry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [filteredCountries, setFilteredCountries] = useState<WorldBankCountry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  // Global blocking overlay removed; we use per-country mini loaders
  // Track which countries are currently fetching indicators
  const [loadingCountries, setLoadingCountries] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [sortAZ, setSortAZ] = useState(true);

  // Load countries list: WB first for speed, then replace with IMF when ready
  useEffect(() => {
    const loadCountries = async () => {
      try {
        // 1) Fast WB list immediately
        try {
          const wbResp = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=400');
          const wbJson = await wbResp.json();
          if (Array.isArray(wbJson) && Array.isArray(wbJson[1])) {
            type WbApiCountry = { id?: string; name: string; iso2Code: string; incomeLevel?: { value?: string } };
            const wbCountries = (wbJson[1] as WbApiCountry[])
              .filter((c) => typeof c?.name === 'string' && typeof c?.iso2Code === 'string' && c.iso2Code.length === 2)
              .map((c) => ({ id: c.id ?? c.iso2Code, name: c.name, iso2Code: c.iso2Code, incomeLevel: c?.incomeLevel?.value }));
            setWorldBankCountries(wbCountries);
          }
        } catch (wbErr) {
          console.error('WB countries fallback failed:', wbErr);
        }

        // 2) Then try IMF endpoint and replace when the browser is idle
        const fetchIMFWhenIdle = () => {
          (async () => {
            try {
              const response = await fetch('/api/imf/countries');
              const data = await response.json();
              if (Array.isArray(data)) {
                type ApiCountry = { id?: string; name: string; iso2Code: string; incomeLevel?: string };
                const validCountries = (data as ApiCountry[])
                  .filter((c) => typeof c.name === 'string' && typeof c.iso2Code === 'string' && c.iso2Code.length === 2)
                  .map((c) => ({ id: c.id ?? c.iso2Code, name: c.name, iso2Code: c.iso2Code, incomeLevel: c.incomeLevel }));
                if (validCountries.length > 0) {
                  setWorldBankCountries(validCountries);
                }
              } else if (data && Array.isArray(data.items)) {
                type ApiCountry = { id?: string; name: string; iso2Code: string; incomeLevel?: string };
                const items = data.items as ApiCountry[];
                const validCountries = items
                  .filter((c) => typeof c.name === 'string' && typeof c.iso2Code === 'string' && c.iso2Code.length === 2)
                  .map((c) => ({ id: c.id ?? c.iso2Code, name: c.name, iso2Code: c.iso2Code, incomeLevel: c.incomeLevel }));
                if (validCountries.length > 0) {
                  setWorldBankCountries(validCountries);
                }
              }
            } catch {
              // Ignore; already have WB list
            }
          })();
        };
        if ('requestIdleCallback' in window) {
          const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
          w.requestIdleCallback?.(fetchIMFWhenIdle);
        } else {
          setTimeout(fetchIMFWhenIdle, 0);
        }
      } catch (error) {
        console.error('Error loading IMF countries:', error);
      }
    };

    loadCountries();
  }, []);

  // Debounce search input for smoother UX
  useEffect(() => {
    const id = setTimeout(() => setDebouncedTerm(searchTerm), 250);
    return () => clearTimeout(id);
  }, [searchTerm]);

  // Build Fuse index when countries change
  const fuse = useMemo(() => {
    if (!worldBankCountries || worldBankCountries.length === 0) return null;
    return new Fuse(worldBankCountries, {
      keys: ['name', 'iso2Code'],
      threshold: 0.4,
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
      const results = worldBankCountries.filter(c => c.iso2Code.toUpperCase() === aliasIso2);
      if (results.length) {
        setFilteredCountries(results.slice(0, 10));
        setSelectedIndex(-1);
        return;
      }
    }
    // Direct ISO matches first
    // 2-letter ISO2 exact
    if (term.length === 2) {
      const results = worldBankCountries.filter(c => c.iso2Code.toUpperCase() === termUpper);
      if (results.length) {
        setFilteredCountries(results.slice(0, 10));
        setSelectedIndex(-1);
        return;
      }
      // No exact, allow prefix
      const pref = worldBankCountries.filter(c => c.iso2Code.toUpperCase().startsWith(termUpper)).slice(0, 10);
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
        const results = worldBankCountries.filter(c => c.iso2Code.toUpperCase() === iso2);
        if (results.length) {
          setFilteredCountries(results);
          setSelectedIndex(-1);
          return;
        }
      }
    }

    // Longer term: combine quick substring-on-name with Fuse fallback
    const quickNameMatches = worldBankCountries.filter(c => c.name.toLowerCase().includes(term.toLowerCase()));
    const fuseResults = fuse.search(term).map(r => r.item);

    const dedup = new Map<string, WorldBankCountry>();
    [...quickNameMatches, ...fuseResults].forEach(c => { dedup.set(c.iso2Code, c); });
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
        if (selectedIndex >= 0 && selectedIndex < filteredCountries.length) {
          addCountry(filteredCountries[selectedIndex]);
          setSearchTerm('');
          setSelectedIndex(-1);
        }
        break;
      case 'Escape':
        setSearchTerm('');
        setSelectedIndex(-1);
        break;
    }
  };

  const addCountry = async (country: WorldBankCountry) => {
    if (countries.find(c => c.iso2 === country.iso2Code)) {
      return; // Country already added
    }

    const iso2 = country.iso2Code;
    const baseCountry: CountryData = {
      name: country.name,
      iso2
    };

    // Add immediately so the user sees the column and progressive updates
    setCountries(prev => [...prev, baseCountry]);

    // Mark this country as loading for per-cell skeletons
    setLoadingCountries(prev => (prev.includes(iso2) ? prev : [...prev, iso2]));

    // Helper to patch a single country by iso2
    const patchCountry = (patch: Partial<CountryData>) => {
      setCountries(prev => prev.map(c => c.iso2 === iso2 ? { ...c, ...patch } : c));
    };

    // Optional: UI shows per-cell loaders per indicator

    try {
      // Run all indicator fetches in parallel to reduce latency
      const tasks: Promise<void>[] = [];

      // GDP Growth (annual %, latest) — IMF WEO: NGDP_RPCH
      tasks.push((async () => {
        try {
          const { value, year } = await getWEOGDPGrowthLatest(iso2);
          if (value != null && typeof value === 'number') {
            patchCountry({
              gdpGrowth: value,
              gdpGrowthYear: year ?? undefined,
              gdpGrowthSourceLabel: `IMF WEO (NGDP_RPCH${year ? `, ${year}` : ''})`
            });
          }
        } catch (error) {
          console.error('Error fetching GDP growth (IMF):', error);
        }
      })());

      // Inflation (YoY, latest) — IMF IFS: PCPIPCH (IMF-only)
      tasks.push((async () => {
        try {
          const { value, year } = await getIMF_IFS_PCPIPCHLatestWithYear(iso2);
          if (value != null && typeof value === 'number') {
            patchCountry({
              inflation: value,
              inflationYear: year ?? undefined,
              inflationSourceLabel: `IMF IFS (PCPIPCH${year ? `, ${year}` : ''})`
            });
          }
        } catch (error) {
          console.error('Error fetching inflation (IMF PCPIPCH):', error);
        }
      })());

      // Interest Rate (%, latest) — IMF IFS: FILR_PA (percent per annum)
      tasks.push((async () => {
        try {
          const { value, year } = await getIFSInterestRateLatestWithYear(iso2);
          if (value != null && typeof value === 'number') {
            patchCountry({
              interestRate: value,
              interestRateYear: year ?? undefined,
              interestRateSourceLabel: `IMF IFS (FILR_PA${year ? `, ${year}` : ''})`
            });
          }
        } catch (error) {
          console.error('Error fetching interest rate (IMF):', error);
        }
      })());

      // Unemployment Rate (%, latest) — IMF DataMapper: LUR (no WB fallback)
      tasks.push((async () => {
        try {
          const { value, year } = await getIMF_LURLatestWithYear(iso2);
          if (value != null && typeof value === 'number') {
            patchCountry({
              unemployment: value,
              unemploymentYear: year ?? undefined,
              unemploymentSourceLabel: `IMF DataMapper (LUR${year ? `, ${year}` : ''})`
            });
          }
        } catch (error) {
          console.error('Error fetching unemployment (IMF LUR):', error);
        }
      })());

      // Labor force participation — IMF source not integrated yet (no WB calls)

      // Regulatory Quality / Ease of Doing Business — IMF source not integrated yet (no WB calls)

      // Legal rights index — IMF source not integrated yet (no WB calls)

      // Internet users — IMF source not integrated yet (no WB calls)

      // Domestic credit to private sector — IMF source not integrated yet (no WB calls)

      await Promise.allSettled(tasks);
    } catch (error) {
      console.error('Error adding country:', error);
    } finally {
      // Clear per-country loading flag
      setLoadingCountries(prev => prev.filter(c => c !== iso2));
    }

    setSearchTerm('');
  };

  const removeCountry = (iso2: string) => {
    setCountries(prev => prev.filter(c => c.iso2 !== iso2));
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
      case 5: // Ease of Doing Business
        return country.easeOfDoingBusiness ? `${country.easeOfDoingBusiness}/100` : 'N/A';
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
        return country.inflationSourceLabel ?? (country.inflationYear ? `IMF IFS (PCPIPCH, ${country.inflationYear})` : null);
      case 2:
        return country.interestRateSourceLabel ?? 'Source not integrated';
      case 3:
        return country.unemploymentSourceLabel ?? (country.unemploymentYear ? `IMF DataMapper (LUR, ${country.unemploymentYear})` : null);
      case 4:
        return 'Source not integrated';
      case 5:
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
      case 5: // Ease of Doing Business
        const easeScore = parseInt(value.split('/')[0]);
        return easeScore > 80 ? 'bg-green-900/50 text-green-300 border-green-700' : 
               easeScore > 60 ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700' : 
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
  const isCountryLoading = (iso2: string): boolean => loadingCountries.includes(iso2);

  const isIndicatorLoading = (country: CountryData, indicatorIndex: number): boolean => {
    if (!isCountryLoading(country.iso2)) return false;
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

  const exportAs = async (format: 'markdown' | 'csv' | 'pdf' | 'image') => {
    const matrix = buildExportMatrix();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (format === 'csv') {
      const csv = toCsv(matrix);
      downloadFile(csv, `comparison-${timestamp}.csv`, 'text/csv;charset=utf-8');
    } else if (format === 'markdown') {
      const md = toMarkdown(matrix);
      downloadFile(md, `comparison-${timestamp}.md`, 'text/markdown;charset=utf-8');
    } else if (format === 'pdf') {
      // Lightweight PDF via browser print to PDF (table only)
      const printHtml = `<!doctype html>
        <html>
          <head>
            <meta charset=\"utf-8\" />
            <title>Comparison Export</title>
            <style>
              body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; padding: 24px; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
              th { background: #f5f5f5; text-align: left; }
            </style>
          </head>
          <body>
            <table>
              <thead>
                <tr>${matrix[0].map(h => `<th>${h}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${matrix.slice(1).map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
            <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); }<\/script>
          </body>
        </html>`;
      const win = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=800');
      if (win) {
        win.document.open();
        win.document.write(printHtml);
        win.document.close();
      }
    } else if (format === 'image') {
      // Render markdown then capture OR capture the on-screen table if available
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
      } catch (err) {
        console.error('Failed to export image:', err);
      } finally {
        container.remove();
      }
    }
    setIsExportModalOpen(false);
  };

  const toggleSortAZ = () => setSortAZ(prev => !prev);

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col overflow-y-auto bg-black">
      <div className="w-full px-4 sm:px-6 md:px-12 lg:px-24 pt-5 pb-5">
        <div className="w-full">
          {/* Toolbar Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 border border-white/20 mb-6">
            {/* Top bar like navbar */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Left placeholder for future buttons */}
              <div className="w-24 sm:w-32" />

              {/* Center search */}
              <div className="flex-1 flex justify-center">
                <div className="w-full max-w-lg">
                  <input
                    type="text"
                    placeholder="🔍 Add country to table..."
                    value={searchTerm}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSearchTerm(v);
                      // Instant ISO2 prefix preview for snappy UX
                      const t = v.trim();
                      if (t.length > 0 && worldBankCountries.length > 0) {
                        const iso2Prefix = t.toUpperCase();
                        const instant = worldBankCountries
                          .filter(c => c.iso2Code.toUpperCase().startsWith(iso2Prefix))
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
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden pb-5">
              <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-white font-semibold text-base sm:text-lg">Search results</h2>
                  <span className="text-xs sm:text-sm text-gray-300">{filteredCountries.length} found</span>
                </div>
                <div className="divide-y divide-white/10 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/5">
                  {filteredCountries.map((country, index) => (
                    <button
                      key={country.id}
                      onClick={() => {
                        addCountry(country);
                        setSearchTerm('');
                        setSelectedIndex(-1);
                      }}
                      className={`w-full px-4 sm:px-5 py-3 sm:py-4 text-left transition-colors focus:outline-none focus:bg-white/15 ${
                        index === selectedIndex ? 'bg-blue-600/40 text-white' : 'hover:bg-white/10 text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium truncate text-base">{country.name}</div>
                          <div className="text-sm text-gray-400">{country.iso2Code}</div>
                        </div>
                        <div className="shrink-0">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">Add</span>
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
                    onClick={() => exportAs('markdown')}
                    className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm text-left flex items-center justify-between"
                  >
                    <span>Markdown (.md)</span>
                    <span className="text-white/60">Table</span>
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
                  <button
                    onClick={() => exportAs('pdf')}
                    className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-sm text-left flex items-center justify-between"
                  >
                    <span>PDF (Print)</span>
                    <span className="text-white/60">Opens print dialog</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Comparison Table Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
            <div className="overflow-x-auto">
              {!mounted ? (
                <div className="p-8 text-center text-gray-300">Loading…</div>
              ) : (
              <>
              {/* Header Row */}
              <div className="flex bg-white/5 border-b border-white/20 min-w-max">
                <div className="flex-shrink-0 p-4 font-semibold text-white border-r border-white/20 w-[180px] text-center text-base">
                  Indicators
                </div>
                {displayedCountries.map((country) => (
                  <div key={country.iso2} className="flex-shrink-0 p-4 font-semibold text-white border-r border-white/20 w-[140px]">
                    <div className="relative flex items-center justify-center">
                      <span className="truncate text-base text-center">{country.name}</span>
                      <button
                        onClick={() => removeCountry(country.iso2)}
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
                <div key={indicator} className={`flex border-b border-white/10 hover:bg-white/5 transition-colors min-w-max ${
                  index % 2 === 0 ? 'bg-white/5' : 'bg-transparent'
                }`}>
                  <div className="flex-shrink-0 p-4 font-medium text-blue-300 border-r border-white/20 w-[180px] text-base text-center">
                    {indicator}
                  </div>
                  {displayedCountries.map((country) => (
                    <div key={`${country.iso2}-${index}`} className="flex-shrink-0 p-4 text-gray-300 border-r border-white/20 w-[140px] flex items-center justify-center">
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
