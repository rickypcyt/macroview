"use client";

import "leaflet/dist/leaflet.css";

import { loadCountriesGeoJSON, loadCountryGDP, loadPopulationData } from "./utils/dataService";
import { useCallback, useEffect, useState } from "react";

import { Dashboard } from "./components/Dashboard";
import { GeoJSON } from "geojson";
import { Globe2D } from "./components/Globe2D";
import { Globe3D } from "./components/Globe3D";
import { logError } from "./utils/errorHandler";
import { normalizeCountryName } from "./utils/helpers";

interface GlobeComponentProps {
  viewMode?: 'summary' | '3d' | '2d' | 'comparison';
}

export default function GlobeComponent({ viewMode: externalViewMode }: GlobeComponentProps) {
  const [countries, setCountries] = useState<GeoJSON.Feature[]>([]);
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [popByCountry, setPopByCountry] = useState<Record<string, number>>({});
  const [gdpByCountry, setGDPByCountry] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'summary' | '3d' | '2d' | 'comparison'>(externalViewMode || 'summary');
  const [selectedCountryFromSearch, setSelectedCountryFromSearch] = useState<GeoJSON.Feature | null>(null);
  const [loadingStates, setLoadingStates] = useState({
    countries: false,
    population: false,
    gdp: new Set<string>()
  });
  const [errors, setErrors] = useState<string[]>([]);

  // Update internal viewMode when external viewMode changes
  useEffect(() => {
    if (externalViewMode && externalViewMode !== viewMode) {
      setViewMode(externalViewMode);
    }
  }, [externalViewMode, viewMode]);

  // No internal control to change view mode here; parent controls it

  // Load GDP data for a specific country (lazy loading)
  const loadGDPForCountry = useCallback(async (countryName: string) => {
    if (!countryName || gdpByCountry[countryName] !== undefined) {
      return;
    }

    setLoadingStates(prev => ({
      ...prev,
      gdp: new Set([...prev.gdp, countryName])
    }));

    try {
      const gdp = await loadCountryGDP(countryName);
      if (gdp !== null) {
        setGDPByCountry(prev => ({ ...prev, [countryName]: gdp }));
      }
    } catch (error) {
      logError(error, `loadGDPForCountry:${countryName}`);
      setErrors(prev => [...prev, `Failed to load GDP data for ${countryName}`]);
    } finally {
      setLoadingStates(prev => {
        const newGdpSet = new Set(prev.gdp);
        newGdpSet.delete(countryName);
        return { ...prev, gdp: newGdpSet };
      });
    }
  }, [gdpByCountry]);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load countries GeoJSON
        setLoadingStates(prev => ({ ...prev, countries: true }));
        const { countries: countriesData, geojson: geojsonData } = await loadCountriesGeoJSON();
        setCountries(countriesData);
        setGeojson(geojsonData);
        setLoadingStates(prev => ({ ...prev, countries: false }));

        // Load population data
        setLoadingStates(prev => ({ ...prev, population: true }));
        const populationData = await loadPopulationData();
        const normalizedPopData: Record<string, number> = {};
        Object.entries(populationData).forEach(([country, population]) => {
          normalizedPopData[normalizeCountryName(country)] = population;
        });
        setPopByCountry(normalizedPopData);
        setLoadingStates(prev => ({ ...prev, population: false }));

      } catch (error) {
        logError(error, 'loadInitialData');
        setErrors(prev => [...prev, 'Failed to load initial data. Please refresh the page.']);
        setLoadingStates({
          countries: false,
          population: false,
          gdp: new Set()
        });
      }
    };

    loadInitialData();
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="absolute top-6 left-6 z-[1001] max-w-md">
          {errors.map((error, index) => (
            <div
              key={index}
              className="bg-red-500/90 backdrop-blur-sm text-white p-3 rounded-lg mb-2 shadow-lg border border-red-400/20"
            >
              <div className="flex justify-between items-start">
                <span className="text-sm">{error}</span>
                <button
                  onClick={() => setErrors(prev => prev.filter((_, i) => i !== index))}
                  className="ml-2 text-red-200 hover:text-white"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading Indicator */}
      {(loadingStates.countries || loadingStates.population) && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[1001]">
          <div className="bg-blue-500/90 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-lg border border-blue-400/20">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span className="text-sm">
                Loading {loadingStates.countries ? 'countries' : 'population data'}...
              </span>
            </div>
          </div>
        </div>
      )}


      
      {/* Content based on view mode */}
      {viewMode === 'summary' && (
        <Dashboard
          countries={countries}
          geojson={geojson}
          popByCountry={popByCountry}
          gdpByCountry={gdpByCountry}
          setSelectedCountryFromSearch={setSelectedCountryFromSearch}
          selectedCountryFromSearch={selectedCountryFromSearch}
          loadGDPForCountry={loadGDPForCountry}
        />
      )}
      
      {viewMode === '3d' && (
        <Globe3D
          countries={countries}
          popByCountry={popByCountry}
          normalizeCountryName={normalizeCountryName}
          onContinentClick={() => {}}
          gdpByCountry={gdpByCountry}
          loadGDPForCountry={loadGDPForCountry}
        />
      )}
      
      {viewMode === '2d' && geojson && (
        <Globe2D
          geojson={geojson}
          popByCountry={popByCountry}
          normalizeCountryName={normalizeCountryName}
          gdpByCountry={gdpByCountry}
          loadGDPForCountry={loadGDPForCountry}
        />
      )}
    </div>
  );
} 