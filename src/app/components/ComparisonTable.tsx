"use client";

import { useEffect, useMemo, useState } from 'react';

import Fuse from 'fuse.js';
import { toPng } from 'html-to-image';
import { getWEOGDPGrowthLatest, getIFSInflationLatestWithYear } from '../utils/imfApi';

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
  const [filteredCountries, setFilteredCountries] = useState<WorldBankCountry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [sortAZ, setSortAZ] = useState(true);

  // Load World Bank countries list
  useEffect(() => {
    const loadCountries = async () => {
      try {
        const response = await fetch('https://api.worldbank.org/v2/country?format=json&per_page=300');
        const data = await response.json();
        if (Array.isArray(data) && Array.isArray(data[1])) {
          interface WorldBankAPICountryRaw {
            id: string;
            name: string;
            iso2Code: string;
            region?: { value?: string };
            incomeLevel?: { value?: string };
          }
          const validCountries = (data[1] as WorldBankAPICountryRaw[])
            .filter((country: WorldBankAPICountryRaw) => country.region?.value !== 'Aggregates' && !!country.incomeLevel?.value)
            .map((country: WorldBankAPICountryRaw) => ({
              id: country.id,
              name: country.name,
              iso2Code: country.iso2Code,
              incomeLevel: country.incomeLevel?.value
            }));
          setWorldBankCountries(validCountries);
        }
      } catch (error) {
        console.error('Error loading countries:', error);
      }
    };

    loadCountries();
  }, []);

  // Build Fuse index when countries change
  const fuse = useMemo(() => {
    if (!worldBankCountries || worldBankCountries.length === 0) return null;
    return new Fuse(worldBankCountries, {
      keys: ['name', 'iso2Code'],
      threshold: 0.3,
      ignoreLocation: true,
      includeScore: true,
      useExtendedSearch: true
    });
  }, [worldBankCountries]);

  // Filter countries based on search term using Fuse.js
  useEffect(() => {
    if (searchTerm.trim() === '' || !fuse) {
      setFilteredCountries([]);
      setSelectedIndex(-1);
      return;
    }

    const results = fuse.search(searchTerm).slice(0, 10).map(r => r.item);
    setFilteredCountries(results);
    setSelectedIndex(-1); // Reset selection when search changes
  }, [searchTerm, fuse]);

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

    setLoading(true);
    const newCountry: CountryData = {
      name: country.name,
      iso2: country.iso2Code
    };

    try {
      // Run all indicator fetches in parallel to reduce latency
      const tasks: Promise<void>[] = [];

      // GDP Growth (annual %, latest) — IMF WEO: NGDP_RPCH
      tasks.push((async () => {
        try {
          const { value, year } = await getWEOGDPGrowthLatest(country.iso2Code);
          if (value != null && typeof value === 'number') {
            newCountry.gdpGrowth = value;
            newCountry.gdpGrowthYear = year ?? undefined;
            newCountry.gdpGrowthSourceLabel = `IMF WEO (NGDP_RPCH${year ? `, ${year}` : ''})`;
          }
        } catch (error) {
          console.error('Error fetching GDP growth (IMF):', error);
        }
      })());

      // Inflation (YoY, latest) — IMF IFS: PCPIPCH (with year) with WB fallback
      tasks.push((async () => {
        try {
          const { value, year } = await getIFSInflationLatestWithYear(country.iso2Code);
          if (value != null && typeof value === 'number') {
            newCountry.inflation = value;
            newCountry.inflationYear = year ?? undefined;
            newCountry.inflationSourceLabel = `IMF IFS (PCPIPCH${year ? `, ${year}` : ''})`;
          } else {
            // Fallback to World Bank if IMF has no value
            try {
              const resp = await fetch(
                `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1`
              );
              const json = await resp.json();
              if (Array.isArray(json) && Array.isArray(json[1]) && json[1][0]) {
                const wbVal = json[1][0].value;
                const wbDate = json[1][0].date;
                if (typeof wbVal === 'number') {
                  newCountry.inflation = wbVal;
                  newCountry.inflationYear = wbDate;
                  newCountry.inflationSourceLabel = `World Bank (FP.CPI.TOTL.ZG, ${wbDate})`;
                }
              }
            } catch (wbErr) {
              console.error('Inflation WB fallback failed:', wbErr);
            }
          }
        } catch (error) {
          console.error('Error fetching inflation (IMF):', error);
          // Network/5xx fallback to WB
          try {
            const resp = await fetch(
              `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1`
            );
            const json = await resp.json();
            if (Array.isArray(json) && Array.isArray(json[1]) && json[1][0]) {
              const wbVal = json[1][0].value;
              const wbDate = json[1][0].date;
              if (typeof wbVal === 'number') {
                newCountry.inflation = wbVal;
                newCountry.inflationYear = wbDate;
                newCountry.inflationSourceLabel = `World Bank (FP.CPI.TOTL.ZG, ${wbDate})`;
              }
            }
          } catch (wbErr) {
            console.error('Inflation WB fallback failed:', wbErr);
          }
        }
      })());

      // Interest Rate (%, latest) — World Bank: FR.INR.RINR (Real interest rate)
      tasks.push((async () => {
        try {
          const interestResponse = await fetch(
            `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/FR.INR.RINR?format=json&per_page=1`
          );
          const interestData = await interestResponse.json();
          if (Array.isArray(interestData) && Array.isArray(interestData[1]) && interestData[1][0]) {
            const val = interestData[1][0].value;
            const date = interestData[1][0].date;
            if (typeof val === 'number') {
              newCountry.interestRate = val;
              newCountry.interestRateYear = date;
              newCountry.interestRateSourceLabel = `World Bank (FR.INR.RINR, ${date})`;
            }
          }
        } catch (error) {
          console.error('Error fetching interest rate (WB):', error);
        }
      })());

      // Unemployment — World Bank: SL.UEM.TOTL.ZS
      tasks.push((async () => {
        try {
          const unemploymentResponse = await fetch(
            `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/SL.UEM.TOTL.ZS?format=json&per_page=1`
          );
          const unemploymentData = await unemploymentResponse.json();
          if (Array.isArray(unemploymentData) && Array.isArray(unemploymentData[1]) && unemploymentData[1][0]) {
            newCountry.unemployment = unemploymentData[1][0].value;
            newCountry.unemploymentYear = unemploymentData[1][0].date;
          }
        } catch (error) {
          console.error('Error fetching unemployment:', error);
        }
      })());

      // Labor force participation — World Bank: SL.TLF.CACT.ZS
      tasks.push((async () => {
        try {
          const laborResponse = await fetch(
            `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/SL.TLF.CACT.ZS?format=json&per_page=1`
          );
          const laborData = await laborResponse.json();
          if (Array.isArray(laborData) && Array.isArray(laborData[1]) && laborData[1][0]) {
            newCountry.laborForceParticipation = laborData[1][0].value;
            newCountry.laborForceParticipationYear = laborData[1][0].date;
          }
        } catch (error) {
          console.error('Error fetching labor force participation:', error);
        }
      })());

      // Regulatory Quality proxy — World Bank: GE.RQ.EST -> scale to 0-100
      tasks.push((async () => {
        try {
          const rqResponse = await fetch(
            `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/GE.RQ.EST?format=json&per_page=1`
          );
          const rqData = await rqResponse.json();
          if (Array.isArray(rqData) && Array.isArray(rqData[1]) && rqData[1][0]) {
            const val = rqData[1][0].value;
            const date = rqData[1][0].date;
            if (typeof val === 'number') {
              const scaled = Math.round(((val + 2.5) / 5) * 100);
              newCountry.easeOfDoingBusiness = Math.max(0, Math.min(100, scaled));
              newCountry.easeOfDoingBusinessYear = date;
            }
          }
        } catch (error) {
          console.error('Error fetching regulatory quality:', error);
        }
      })());

      // Legal rights index — World Bank: IC.LGL.CRED.XQ (0-12)
      tasks.push((async () => {
        try {
          const legalResponse = await fetch(
            `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/IC.LGL.CRED.XQ?format=json&per_page=1`
          );
          const legalData = await legalResponse.json();
          if (Array.isArray(legalData) && Array.isArray(legalData[1]) && legalData[1][0]) {
            const val = legalData[1][0].value;
            const date = legalData[1][0].date;
            if (typeof val === 'number') {
              newCountry.legalFramework = `${val}/12`;
              newCountry.legalFrameworkYear = date;
            }
          }
        } catch (error) {
          console.error('Error fetching legal rights index:', error);
        }
      })());

      // Internet users — World Bank: IT.NET.USER.ZS
      tasks.push((async () => {
        try {
          const internetResponse = await fetch(
            `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/IT.NET.USER.ZS?format=json&per_page=1`
          );
          const internetData = await internetResponse.json();
          if (Array.isArray(internetData) && Array.isArray(internetData[1]) && internetData[1][0]) {
            const val = internetData[1][0].value;
            const date = internetData[1][0].date;
            if (typeof val === 'number') {
              newCountry.digitalReadiness = `${val.toFixed(1)}%`;
              newCountry.digitalReadinessYear = date;
            }
          }
        } catch (error) {
          console.error('Error fetching internet users:', error);
        }
      })());

      // Domestic credit to private sector — World Bank: FS.AST.PRVT.GD.ZS
      tasks.push((async () => {
        try {
          const creditResponse = await fetch(
            `https://api.worldbank.org/v2/country/${country.iso2Code}/indicator/FS.AST.PRVT.GD.ZS?format=json&per_page=1`
          );
          const creditData = await creditResponse.json();
          if (Array.isArray(creditData) && Array.isArray(creditData[1]) && creditData[1][0]) {
            const val = creditData[1][0].value;
            const date = creditData[1][0].date;
            if (typeof val === 'number') {
              const maturity = val >= 100 ? 'Mature' : val >= 60 ? 'Developing' : 'Emerging';
              newCountry.marketMaturity = maturity;
              newCountry.marketMaturityYear = date;
            }
          }
        } catch (error) {
          console.error('Error fetching domestic credit to private sector:', error);
        }
      })());

      await Promise.allSettled(tasks);

    } catch (error) {
      console.error('Error adding country:', error);
    } finally {
      setLoading(false);
    }

    setCountries(prev => [...prev, newCountry]);
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
        return country.gdpGrowthSourceLabel ?? (country.gdpGrowthYear ? `World Bank (NY.GDP.MKTP.KD.ZG, ${country.gdpGrowthYear})` : null);
      case 1:
        return country.inflationSourceLabel ?? (country.inflationYear ? `World Bank (FP.CPI.TOTL.ZG, ${country.inflationYear})` : null);
      case 2:
        return country.interestRateSourceLabel ?? (country.interestRateYear ? `World Bank (FR.INR.RINR, ${country.interestRateYear})` : null);
      case 3:
        return country.unemploymentYear ? `World Bank (SL.UEM.TOTL.ZS, ${country.unemploymentYear})` : null;
      case 4:
        return country.laborForceParticipationYear ? `World Bank (SL.TLF.CACT.ZS, ${country.laborForceParticipationYear})` : null;
      case 5:
        return country.easeOfDoingBusinessYear ? `World Bank (GE.RQ.EST, ${country.easeOfDoingBusinessYear})` : 'Source not integrated';
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
                    onChange={(e) => setSearchTerm(e.target.value)}
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
                      <span
                        title={getIndicatorSource(country, index) || undefined}
                        className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-base font-medium border ${getIndicatorColor(country, index)}`}
                      >
                        {getIndicatorValue(country, index)}
                      </span>
                    </div>
                  ))}

              </div>
              ))}
              </>
              )}
            </div>
          </div>



          {loading && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white/10 backdrop-blur-sm p-8 rounded-2xl border border-white/20 shadow-2xl">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-white text-lg">Loading country data...</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
