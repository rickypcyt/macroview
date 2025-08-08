"use client";

import { CONTINENTS_EN, CONTINENT_COLORS, CONTINENT_NAME_MAP, COUNTRIES_PER_CONTINENT } from "../utils/helpers";
import React, { useRef, useState } from "react";

import { CountryInfoPopup } from "./CountryInfoPopup";
import { GeoJSON } from "geojson";
import GlobeImport from "react-globe.gl";

type GlobeLabel = { lat: number; lng: number; text: string; isCountry?: boolean; isContinent?: boolean; bgColor?: string; color?: string; size?: number; };

interface Globe3DProps {
  countries: GeoJSON.Feature[];
  popByCountry: Record<string, number>;
  normalizeCountryName: (name: string) => string;
  onContinentClick: (name: string) => void;
  gdpByCountry: Record<string, number>;
  loadGDPForCountry: (countryName: string) => Promise<void>;
}

function hasCoordinates(geometry: GeoJSON.Geometry): geometry is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

function getCentroid(coords: number[][][] | number[][][][]): [number, number] {
  // Solo soporta MultiPolygon y Polygon
  const all: number[][] = [];
  if (Array.isArray(coords[0][0][0])) {
    // MultiPolygon
    (coords as number[][][][]).forEach((poly) => {
      (poly[0] as number[][]).forEach((c) => all.push(c));
    });
  } else {
    // Polygon
    (coords as number[][][])[0].forEach((c) => all.push(c));
  }
  const lats = all.map((c) => c[1]);
  const lngs = all.map((c) => c[0]);
  return [lats.reduce((a, b) => a + b, 0) / lats.length, lngs.reduce((a, b) => a + b, 0) / lngs.length];
}

function ContinentStatsModal({ continent, onClose, countriesCount }: { continent: string, onClose: () => void, countriesCount: number }) {
  if (!continent) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] relative text-black">
        <button onClick={onClose} className="absolute top-2 right-3 text-gray-500 hover:text-red-500 text-2xl font-bold">×</button>
        <h2 className="text-xl font-bold mb-2 text-center">{continent}</h2>
        <div className="mb-2"><span className="font-semibold">Number of countries:</span> {countriesCount}</div>
      </div>
    </div>
  );
}

export function Globe3D({ countries, popByCountry, normalizeCountryName, onContinentClick, gdpByCountry, loadGDPForCountry }: Globe3DProps) {
  const [selectedCountry, setSelectedCountry] = useState<GeoJSON.Feature | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeRef = useRef<any>(null);
  const [selectedContinent, setSelectedContinent] = useState<string | null>(null);
  // Estado para el nivel de zoom/cámara
  const [cameraDistance, setCameraDistance] = useState(2);

  // Actualiza el nivel de zoom/cámara
  function handleCameraChange() {
    if (globeRef.current && globeRef.current.camera()) {
      setCameraDistance(globeRef.current.camera().position.length());
    }
  }

  // Labels de países cuando el zoom es moderado para mejor rendimiento
  const showCountryLabels = cameraDistance < 2.5; // Mostrar nombres en zoom moderado

  // Labels de países (centroide) - países importantes y grandes
  const countryLabelsData = showCountryLabels
    ? countries
        .filter((c) => {
          // Filtrar países para evitar superposición y mejorar legibilidad
          const name = c.properties?.name || "";
          const area = c.properties?.AREA || c.properties?.area || 0;
          
          // Países importantes que siempre se muestran
          const importantCountries = [
            "United States", "Canada", "Mexico", "Brazil", "Argentina", "Chile",
            "United Kingdom", "France", "Germany", "Spain", "Italy", "Poland",
            "Russia", "China", "Japan", "India", "Australia", "South Africa",
            "Egypt", "Nigeria", "Kenya", "Morocco", "Algeria", "Tunisia",
            "Colombia", "Peru", "Venezuela", "Ecuador", "Bolivia", "Paraguay",
            "Uruguay", "Guyana", "Suriname", "French Guiana", "Greenland",
            "Iceland", "Norway", "Sweden", "Finland", "Denmark", "Netherlands",
            "Belgium", "Switzerland", "Austria", "Czech Republic", "Hungary",
            "Romania", "Bulgaria", "Greece", "Turkey", "Ukraine", "Belarus",
            "Kazakhstan", "Mongolia", "Myanmar", "Thailand", "Vietnam", "Laos",
            "Cambodia", "Malaysia", "Indonesia", "Philippines", "New Zealand",
            "Papua New Guinea", "Fiji", "Vanuatu", "Solomon Islands"
          ];
          
          // Mostrar si es importante O si es grande (>50,000 km²)
          return importantCountries.includes(name) || area > 50000;
        })
        .map((c) => {
          if (!c.geometry || !hasCoordinates(c.geometry)) return null;
          // Calcular centroide
          const coords = getCentroid((c.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
          return {
            lat: coords[0],
            lng: coords[1],
            text: c.properties?.name,
            isCountry: true,
          };
        }).filter(Boolean)
    : [];

  // Labels de continentes
  const continentLabelsData = CONTINENTS_EN.map(c => ({
    lat: c.lat,
    lng: c.lng,
    text: c.name,
    isContinent: true,
  }));

  // Unir labels
  const allLabelsData = [...continentLabelsData, ...countryLabelsData];

  // Handler para click en país (funciona con o sin labels visibles)
  function handlePolygonClick(country: GeoJSON.Feature) {
    const handleCountryClick = async (country: GeoJSON.Feature) => {
      const countryName = country.properties?.name || '';
      
      // Cargar datos de GDP si no están disponibles
      if (countryName && gdpByCountry[countryName] === undefined) {
        await loadGDPForCountry(countryName);
      }
      
      setSelectedCountry(country);
      
      // Calcular posición del popup basado en el centroide del país
      if (country.geometry && hasCoordinates(country.geometry)) {
        const coords = country.geometry.coordinates;
        const [lng, lat] = getCentroid(coords);
        
        if (globeRef.current) {
          const { x, y } = globeRef.current.pointOfView({ lat, lng, altitude: 0.1 });
          setPopupPos({ x, y });
        }
      }
    };
    handleCountryClick(country);
  }

  // Colores por continente
  function getPolygonColor(country: GeoJSON.Feature) {
    const continent = country.properties?.continent;
    return CONTINENT_COLORS[continent] || "#e5e7eb";
  }

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-black">
      <GlobeImport
        ref={globeRef}
        globeImageUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2048' height='1024'%3E%3Crect width='100%25' height='100%25' fill='%232563eb'/%3E%3C/svg%3E"
        backgroundColor="#000"
        polygonsData={countries}
        polygonCapColor={(country) => getPolygonColor(country as GeoJSON.Feature)}
        polygonSideColor={() => "#16a34a"}
        polygonStrokeColor={() => "#166534"}
        polygonLabel={(country) => (country as GeoJSON.Feature).properties?.name}
        polygonsTransitionDuration={0}
        width={typeof window !== 'undefined' ? window.innerWidth : 1920}
        height={typeof window !== 'undefined' ? window.innerHeight : 1080}
        enablePointerInteraction={true}
        atmosphereColor="#1e3a8a"
        atmosphereAltitude={0.01}
        showAtmosphere={false}
        animateIn={false}
        onPolygonClick={(country) => handlePolygonClick(country as GeoJSON.Feature)}
        onZoom={handleCameraChange}
        onGlobeReady={handleCameraChange}
        labelsData={allLabelsData as GlobeLabel[]}
        labelLat={(d: object) => (d as GlobeLabel).lat}
        labelLng={(d: object) => (d as GlobeLabel).lng}
        labelText={(d: object) => (d as GlobeLabel).text}
        labelColor={(d: object) => (d as GlobeLabel).isCountry ? "#ffffff" : "#ffffff"}
        labelSize={(d: object) => (d as GlobeLabel).isCountry ? 1.1 : 2.6}
        labelLabel={(label: object) => {
          const globeLabel = label as GlobeLabel;
          const isCountry = globeLabel.isCountry;
          const fontSize = isCountry ? "0.85rem" : "2.2rem";
          const fontWeight = isCountry ? "600" : "700";
          const padding = isCountry ? "2px 6px" : "4px 8px";
          const borderRadius = isCountry ? "4px" : "6px";
          const background = isCountry ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.7)";
          const textShadow = isCountry ? "0 1px 3px #000, 0 0 2px #000" : "0 2px 6px #000, 0 0 3px #000";
          
          return `<div style='font-weight:${fontWeight};font-size:${fontSize};color:white;text-shadow:${textShadow};background:${background};padding:${padding};border-radius:${borderRadius};border:1px solid rgba(255,255,255,0.2);white-space:nowrap;'>${globeLabel.text}</div>`;
        }}
        onLabelClick={(label: object) => {
          const globeLabel = label as GlobeLabel;
          if (globeLabel && globeLabel.text && globeLabel.isContinent) {
            setSelectedContinent(globeLabel.text);
            if (onContinentClick) onContinentClick(globeLabel.text);
          }
        }}
        labelDotRadius={0}
        labelAltitude={0.02}
        labelResolution={3}
        labelsTransitionDuration={200}
      />
      {/* Labels de continentes HTML superpuestos eliminados */}
      {selectedCountry && popupPos && (
        <CountryInfoPopup
          country={selectedCountry}
          position={popupPos}
          onClose={() => setSelectedCountry(null)}
          popByCountry={popByCountry}
          normalizeCountryName={normalizeCountryName}
          gdpByCountry={gdpByCountry}
        />
      )}
      {selectedContinent && selectedContinent !== "ANTARCTICA" && (
        <ContinentStatsModal
          continent={selectedContinent}
          onClose={() => setSelectedContinent(null)}
          countriesCount={COUNTRIES_PER_CONTINENT[CONTINENT_NAME_MAP[selectedContinent]] || 0}
        />
      )}
      {/* Leyenda de colores de continentes */}
      <div className="absolute bottom-4 right-4 bg-white/90 rounded shadow-lg p-3 z-[2000] text-sm flex flex-col gap-2 border border-gray-200">
        <div className="font-bold mb-1 text-gray-700">Continents</div>
        {Object.entries(CONTINENT_COLORS).map(([continent, color]) => (
          <div key={continent} className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded-full border border-gray-400" style={{ background: color }}></span>
            <span className="text-gray-800">{continent}</span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 mt-2 z-[1000]">Source of countries: <a href="https://datahub.io/core/geo-countries" target="_blank" rel="noopener noreferrer" className="underline">datahub.io/core/geo-countries</a></div>
    </div>
  );
} 