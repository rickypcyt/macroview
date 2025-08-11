"use client";

import type * as GeoJSON from "geojson";

import React, { useEffect, useState } from "react";
import { getIMF_LPForYearByIso3, getIMF_LPLatestByIso3, getIMF_NGDPDForYearByIso3, getIMF_NGDPDLatestByIso3 } from "../utils/imfApi";
import { loadCountryGDP, loadCountryPopulationIMF } from "../utils/dataService";

import { normalizeCountryName } from "../utils/helpers";

interface SelectedCountryCardProps {
  selectedCountryFromSearch: GeoJSON.Feature;
  setSelectedCountryFromSearch: (country: GeoJSON.Feature | null) => void;
  gdpByCountry: Record<string, number>;
  popByCountry: Record<string, number>;
  selectedCountryInflation: number | null;
  selectedCountryLoading: boolean;
  selectedCountryGDPLoading: boolean;
  selectedCountryInflationLoading: boolean;
}

export function SelectedCountryCard({
  selectedCountryFromSearch,
  setSelectedCountryFromSearch,
  gdpByCountry,
  popByCountry,
  selectedCountryInflation,
  selectedCountryLoading,
  selectedCountryGDPLoading,
  selectedCountryInflationLoading,
}: SelectedCountryCardProps) {
  const props = (selectedCountryFromSearch.properties ?? {}) as {
    name?: unknown;
    NAME?: unknown;
    continent?: unknown;
    ISO_A3?: unknown;
    iso_a3?: unknown;
    iso3?: unknown;
  };
  const nameKey =
    (typeof props.name === 'string' && props.name) ||
    (typeof props.NAME === 'string' && props.NAME) ||
    (selectedCountryFromSearch.id != null ? String(selectedCountryFromSearch.id) : "");

  // Robust ISO3 resolver: checks common GeoJSON property keys without using `any` casts
  const resolveIso3 = (p: Record<string, unknown>): string => {
    const candidates = [
      'ISO_A3', 'iso_a3', 'ADM0_A3', 'WB_A3', 'BRK_A3', 'iso3', 'ISO3',
    ];
    for (const key of candidates) {
      const v = p[key];
      if (typeof v === 'string' && v.length >= 3) {
        return v.toUpperCase();
      }
    }
    return '';
  };

  // Local GDP for 2025 via IMF DataMapper NGDPD
  const [gdpValue, setGdpValue] = useState<number | null>(null);
  const [gdpLoading, setGdpLoading] = useState<boolean>(false);
  const [gdpYear, setGdpYear] = useState<string | null>('2025');
  // Local Population via IMF DataMapper LP
  const [popValue, setPopValue] = useState<number | null>(null);
  const [popLoading, setPopLoading] = useState<boolean>(false);
  const [popYear, setPopYear] = useState<string | null>('2025');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setGdpLoading(true);
        const iso3 = resolveIso3(selectedCountryFromSearch.properties ?? {});
        let value: number | null = null;
        let year: string | null = '2025';
        const targetYear = 2025;
        if (iso3 && iso3.length >= 3) {
          console.debug('[SelectedCountryCard] Fetch NGDPD', { iso3, year: targetYear });
          const r = await getIMF_NGDPDForYearByIso3(iso3, targetYear);
          value = r.value; year = r.year ?? year;
          if (value == null) {
            console.debug('[SelectedCountryCard] NGDPD 2025 missing, fallback latest', { iso3 });
            const latest = await getIMF_NGDPDLatestByIso3(iso3);
            value = latest.value; year = latest.year ?? year;
          }
        }
        // Name-based fallback (year unknown) if no ISO3 or value remains null
        if (value == null) {
          try {
            const n = typeof nameKey === 'string' ? nameKey : '';
            if (n) {
              console.debug('[SelectedCountryCard] Name fallback GDP via loader', { name: n });
              const v = await loadCountryGDP(n);
              if (v != null && isFinite(Number(v))) {
                value = Number(v);
                // keep year as-is (likely 2025 or latest)
              }
            }
          } catch (e) {
            console.error('[SelectedCountryCard] loadCountryGDP fallback error', e);
          }
        }
        if (!cancelled) {
          setGdpValue(value ?? null);
          setGdpYear(year);
        }
      } catch {
        console.error('[SelectedCountryCard] GDP fetch error');
        if (!cancelled) setGdpValue(null);
      } finally {
        if (!cancelled) setGdpLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountryFromSearch]);

  // Load Population (prefer 2025, fallback to latest) via IMF DataMapper LP
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setPopLoading(true);
        const iso3 = resolveIso3(selectedCountryFromSearch.properties ?? {});
        const targetYear = 2025;
        let value: number | null = null;
        let year: string | null = String(targetYear);
        if (iso3 && iso3.length >= 3) {
          console.debug('[SelectedCountryCard] Fetch LP', { iso3, year: targetYear });
          const r = await getIMF_LPForYearByIso3(iso3, targetYear);
          value = r.value; year = r.year ?? year;
          if (value == null) {
            console.debug('[SelectedCountryCard] LP 2025 missing, fallback latest', { iso3 });
            const latest = await getIMF_LPLatestByIso3(iso3);
            value = latest.value; year = latest.year ?? year;
          }
        }
        // Optional name fallback remains, but year will reflect fetched year if provided
        if (value == null) {
          const n = typeof nameKey === 'string' ? nameKey : '';
          console.debug('[SelectedCountryCard] Name fallback LP (2025/latest)', { name: n });
          const r = await loadCountryPopulationIMF(n, targetYear);
          value = r.value; year = r.year ?? year;
        }
        if (!cancelled) {
          setPopValue(value ?? null);
          setPopYear(year);
        }
      } catch {
        console.error('[SelectedCountryCard] Population fetch error');
        if (!cancelled) setPopValue(null);
      } finally {
        if (!cancelled) setPopLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountryFromSearch]);

  return (
    <div className="w-full px-4 sm:px-6 md:px-12 lg:px-24 mb-6 sm:mb-8 md:mb-10 lg:mb-12" aria-busy={selectedCountryLoading}>
      <div className="w-full">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 lg:p-12 border border-white/20">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">
              {nameKey}
            </h2>
            <button
              className="text-white text-lg sm:text-xl font-bold hover:text-green-400 focus:outline-none transition-colors"
              onClick={() => setSelectedCountryFromSearch(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
            {/* Population */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">👥 Population (millions)</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-blue-400">
                {popLoading ? (
                  <div className="w-24 h-6 rounded-md bg-white/10 border border-white/20 animate-pulse mx-auto" />
                ) : popValue != null ? (
                  Number(popValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                ) : popByCountry[normalizeCountryName(nameKey)] ? (
                  (() => {
                    const fb = popByCountry[normalizeCountryName(nameKey)];
                    const inMillions = fb > 1_000_000 ? fb / 1_000_000 : fb; // heuristic: absolute vs already-in-millions
                    return Number(inMillions).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  })()
                ) : (
                  <span className="text-gray-400">Not available</span>
                )}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">IMF DataMapper - LP {popYear ? `(${popYear})` : '(2025)'} </div>
            </div>

            {/* Continent */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">🌍 Continent</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-purple-400">
                {typeof props.continent === 'string' ? props.continent : <span className="text-gray-400">Not available</span>}
              </div>
            </div>
          </div>

          {/* Additional Info Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* GDP (IMF NGDPD - selected year or latest) */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">💰 GDP (billions USD)</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-green-400">
                {gdpLoading || selectedCountryGDPLoading ? (
                  <div className="w-28 h-6 rounded-md bg-white/10 border border-white/20 animate-pulse mx-auto" />
                ) : gdpValue != null ? (
                  `$${(gdpValue / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `
                ) : gdpByCountry[normalizeCountryName(nameKey)] ? (
                  `$${(gdpByCountry[normalizeCountryName(nameKey)] / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} billion`
                ) : (
                  <span className="text-gray-400">Not available</span>
                )}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">IMF DataMapper - NGDPD {gdpYear ? `(${gdpYear})` : ''} </div>
            </div>

            {/* Inflation */}
            <div className="text-center p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="text-sm sm:text-base md:text-lg text-gray-300 font-semibold mb-1 sm:mb-2">📈 Inflation (%)</div>
              <div className="text-base sm:text-lg md:text-xl font-bold text-yellow-400">
                {selectedCountryInflationLoading ? (
                  <div className="w-24 h-6 rounded-md bg-white/10 border border-white/20 animate-pulse mx-auto" />
                ) : selectedCountryInflation !== null ? (
                  `${selectedCountryInflation.toFixed(2)}%`
                ) : (
                  <span className="text-gray-400">Not available</span>
                )}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2">IMF IFS - CPI inflation (PCPIPCH)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
