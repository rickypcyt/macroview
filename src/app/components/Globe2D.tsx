"use client";

import type { LatLngBoundsExpression, LatLngExpression, LeafletEvent } from "leaflet";
import { GeoJSON as LeafletGeoJSON, MapContainer as LeafletMap, useMap, useMapEvents } from "react-leaflet";
import React, { useEffect, useState } from "react";

import { CONTINENTS_EN } from "../utils/helpers";
import { CountryInfoPopup } from "./CountryInfoPopup";
import { GeoJSON } from "geojson";

interface Globe2DProps {
  geojson: GeoJSON.FeatureCollection;
  popByCountry: Record<string, number>;
  normalizeCountryName: (name: string) => string;
  gdpByCountry: Record<string, number>;
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

function ContinentLabels2D({ continents, onContinentClick }: { continents: { name: string, lat: number, lng: number }[], onContinentClick: (name: string) => void }) {
  const map = useMap();
  const [positions, setPositions] = useState<{ name: string, x: number, y: number }[]>([]);

  useEffect(() => {
    function updatePositions() {
      const newPositions = continents.map((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng]);
        // Aplica offset si existe
        const offset = { y: 0 }; // Simplified offset
        return { name: c.name, x: point.x, y: point.y + offset.y };
      });
      setPositions(newPositions);
    }
    updatePositions();
    map.on("move zoom resize", updatePositions);
    return () => {
      map.off("move zoom resize", updatePositions);
    };
  }, [map, continents]);

  return (
    <>
      {positions.map((c) => {
        const sizeClass = "text-2xl md:text-4xl";
        return (
          <button
            key={c.name}
            className={`pointer-events-auto select-none font-extrabold ${sizeClass} text-white/90 drop-shadow-lg bg-transparent border-none outline-none cursor-pointer hover:scale-105 transition`}
            style={{
              position: "absolute",
              left: c.x,
              top: c.y,
              zIndex: 1000,
              textShadow: "0 2px 8px #000, 0 0 2px #000",
              transform: "translate(-50%, -50%)",
            }}
            onClick={() => onContinentClick(c.name)}
          >
            {c.name.toUpperCase()}
          </button>
        );
      })}
    </>
  );
}

function CountryLabels2D({ geojson, zoom }: { geojson: GeoJSON.FeatureCollection, zoom: number }) {
  const map = useMap();
  const [, setMapUpdate] = useState(0);

  useEffect(() => {
    function update() {
      setMapUpdate((v) => v + 1); // Forzar re-render
    }
    map.on("move", update);
    map.on("zoom", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
    };
  }, [map]);

  if (zoom <= 3.5) return null;
  return (
    <>
      {geojson.features.map((feature: GeoJSON.Feature) => {
        if (!feature.geometry || !hasCoordinates(feature.geometry)) return null;
        const [lat, lng] = getCentroid((feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates);
        const point = map.latLngToContainerPoint([lat, lng]);
        return (
          <div
            key={feature.properties?.name || feature.id}
            className="absolute pointer-events-none select-none text-xs font-bold text-white bg-black/60 rounded px-2 py-1 shadow"
            style={{
              left: point.x,
              top: point.y,
              transform: "translate(-50%, -50%)",
              zIndex: 1200,
              whiteSpace: "nowrap"
            }}
          >
            {feature.properties?.name}
          </div>
        );
      })}
    </>
  );
}

function MapZoomListener({ setZoom }: { setZoom: (z: number) => void }) {
  useMapEvents({
    zoomend: (e: LeafletEvent) => setZoom(e.target.getZoom()),
    zoomstart: (e: LeafletEvent) => setZoom(e.target.getZoom()),
    moveend: (e: LeafletEvent) => setZoom(e.target.getZoom()),
  });
  return null;
}

export function Globe2D({ geojson, popByCountry, normalizeCountryName, gdpByCountry }: Globe2DProps) {
  const [zoom, setZoom] = useState(2);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<GeoJSON.Feature | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);

  const continentColors: Record<string, string> = {
    "Africa": "#34d399",
    "North America": "#f87171",
    "South America": "#fbbf24",
    "Europe": "#60a5fa",
    "Asia": "#a78bfa",
    "Oceania": "#f472b6",
    "Antarctica": "#a3a3a3",
  };

  // Custom onEachFeature to handle hover and click
  function onEachCountry(feature: GeoJSON.Feature, layer: L.Layer) {
    layer.on({
      mouseover: (e: L.LeafletMouseEvent) => {
        setHoveredCountry(feature.properties?.name || feature.id);
        if (e.originalEvent) {
          setHoverPos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        }
        (layer as L.Path).setStyle({ weight: 2, color: "#fff" });
      },
      mouseout: () => {
        setHoveredCountry(null);
        setHoverPos(null);
        // Solo quitar el highlight si no está seleccionado
        if (!selectedCountry || selectedCountry.properties?.name !== feature.properties?.name) {
          (layer as L.Path).setStyle({ weight: 1, color: "#222" });
        }
      },
      click: (e: L.LeafletMouseEvent) => {
        setSelectedCountry(feature);
        if (e.originalEvent) {
          setPopupPos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        }
      },
    });
  }

  // Custom style para resaltar el país hovered o seleccionado
  function countryStyle(feature?: GeoJSON.Feature) {
    if (!feature || !feature.properties) return {};
    // Unificar el grosor y color de las líneas
    const continent = feature.properties.continent;
    const fillColor = continentColors[continent] || "#e5e7eb";
    return {
      color: "#222",
      weight: 1,
      fillOpacity: 0.95,
      fillColor,
      dashArray: undefined,
    };
  }

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-black">
      <LeafletMap
        center={[20, 0] as LatLngExpression}
        zoom={2}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]] as LatLngBoundsExpression}
        style={{ width: "100vw", height: "100vh", background: "#1e40af" }}
        scrollWheelZoom={true}
        zoomControl={true}
        attributionControl={false}
      >
        <MapZoomListener setZoom={setZoom} />
        <LeafletGeoJSON
          data={geojson}
          style={countryStyle}
          onEachFeature={onEachCountry}
        />
        <ContinentLabels2D continents={CONTINENTS_EN} onContinentClick={() => {}} />
        <CountryLabels2D geojson={geojson} zoom={zoom} />
        {/* Leyenda de colores de continentes */}
        <div className="absolute bottom-4 right-4 bg-white/90 rounded shadow-lg p-3 z-[2000] text-sm flex flex-col gap-2 border border-gray-200">
          <div className="font-bold mb-1 text-gray-700">Continentes</div>
          {Object.entries(continentColors).map(([continent, color]) => (
            <div key={continent} className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded-full border border-gray-400" style={{ background: color }}></span>
              <span className="text-gray-800">{continent}</span>
            </div>
          ))}
        </div>
      </LeafletMap>
      {/* Mostrar hover solo si el país NO está como label en el mapa */}
      {hoveredCountry && hoverPos && !selectedCountry &&
        !(geojson.features.some(f => f.properties?.name === hoveredCountry)) && (
        <div
          className="fixed z-[2000] px-3 py-1 rounded bg-white/90 text-black text-xs font-bold pointer-events-none shadow"
          style={{ left: hoverPos.x + 12, top: hoverPos.y + 4 }}
        >
          {hoveredCountry}
        </div>
      )}
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
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 mt-2 z-[1000]">Fuente de países: <a href="https://datahub.io/core/geo-countries" target="_blank" rel="noopener noreferrer" className="underline">datahub.io/core/geo-countries</a></div>
    </div>
  );
} 