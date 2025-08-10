"use client";

import React from "react";
import type * as GeoJSON from "geojson";
import { CountrySearch } from "./CountrySearch";

interface SearchCardProps {
  countries: GeoJSON.Feature[];
  gdpByCountry: Record<string, number>;
  popByCountry: Record<string, number>;
  inflationCache: Record<string, number>;
  tariffCache: Record<string, number>;
  onCountryClick: (country: GeoJSON.Feature | null) => void;
  loadGDPForCountry: (countryName: string) => Promise<void>;
  loadInflationForCountry: (countryName: string) => Promise<number | null>;
  loadTariffForCountry: (countryName: string) => Promise<number | null>;
  gdpSourceLabel: string;
  populationSourceLabel: string;
}

export function SearchCard(props: SearchCardProps) {
  const {
    countries,
    gdpByCountry,
    popByCountry,
    inflationCache,
    tariffCache,
    onCountryClick,
    loadGDPForCountry,
    loadInflationForCountry,
    loadTariffForCountry,
    gdpSourceLabel,
    populationSourceLabel,
  } = props;

  return (
    <div className="w-full px-4 sm:px-6 md:px-12 lg:px-24 mb-6 sm:mb-2 md:mb-4 lg:mb-4">
      <div className="w-full">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 lg:p-12 border border-white/20">
          <CountrySearch
            countries={countries}
            gdpByCountry={gdpByCountry}
            popByCountry={popByCountry}
            inflationCache={inflationCache}
            tariffCache={tariffCache}
            onCountryClick={onCountryClick}
            loadGDPForCountry={loadGDPForCountry}
            loadInflationForCountry={loadInflationForCountry}
            loadTariffForCountry={loadTariffForCountry}
            gdpSourceLabel={gdpSourceLabel}
            populationSourceLabel={populationSourceLabel}
          />
        </div>
      </div>
    </div>
  );
}
