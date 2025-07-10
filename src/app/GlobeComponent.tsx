"use client";

import { useEffect, useState } from "react";

import dynamic from "next/dynamic";
import { feature } from "topojson-client";
// import countriesData from "world-countries"; // No usar, solo GeoJSON
import { MapContainer as LeafletMap, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMapEvents } from "react-leaflet";

const Globe = dynamic<any>(() => import("react-globe.gl"), { ssr: false, loading: () => <div className="text-center">Cargando globo...</div> });

const CONTINENTS = [
  { name: "África", lat: 2, lng: 17 },
  { name: "América del Norte", lat: 54, lng: -105 },
  { name: "América del Sur", lat: -15, lng: -60 },
  { name: "Asia", lat: 34, lng: 100 },
  { name: "Europa", lat: 54, lng: 15 },
  { name: "Oceanía", lat: -22, lng: 140 },
];

const CONTINENTS_EN = [
  { name: "Africa", lat: 2, lng: 17 },
  { name: "North America", lat: 54, lng: -105 },
  { name: "South America", lat: -15, lng: -60 },
  { name: "Asia", lat: 34, lng: 100 },
  { name: "Europe", lat: 54, lng: 15 },
  { name: "Oceania", lat: -22, lng: 140 },
];

function getCentroid(coords: any[]): [number, number] {
  // Solo soporta MultiPolygon y Polygon
  let all: any[] = [];
  if (Array.isArray(coords[0][0][0])) {
    // MultiPolygon
    coords.forEach((poly: any) => {
      poly[0].forEach((c: any) => all.push(c));
    });
  } else {
    // Polygon
    coords[0].forEach((c: any) => all.push(c));
  }
  const lats = all.map((c: any) => c[1]);
  const lngs = all.map((c: any) => c[0]);
  return [lats.reduce((a, b) => a + b, 0) / lats.length, lngs.reduce((a, b) => a + b, 0) / lngs.length];
}

// Generador de estrellas (canvas background)
function StarBackground() {
  return (
    <div
      className="fixed inset-0 -z-10"
      style={{
        background: "#000",
        pointerEvents: "none",
      }}
    >
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 200 }).map((_, i) => (
          <circle
            key={i}
            cx={Math.random() * window.innerWidth}
            cy={Math.random() * window.innerHeight}
            r={Math.random() * 1.2 + 0.2}
            fill="#fff"
            opacity={Math.random() * 0.7 + 0.3}
          />
        ))}
      </svg>
    </div>
  );
}

function ContinentLabels2D({ zoom }: { zoom: number }) {
  if (zoom < 3.5) {
    return CONTINENTS_EN.map((c) => (
      <div
        key={c.name}
        className="pointer-events-none select-none font-extrabold text-2xl md:text-4xl text-white/90 drop-shadow-lg"
        style={{
          position: "absolute",
          left: `calc(${((c.lng + 180) / 360) * 100}% - 50px)` ,
          top: `calc(${((90 - c.lat) / 180) * 100}% - 20px)` ,
          zIndex: 1000,
          textShadow: "0 2px 8px #000, 0 0 2px #000"
        }}
      >
        {c.name.toUpperCase()}
      </div>
    ));
  }
  return null;
}

function MapZoomListener({ setZoom }: { setZoom: (z: number) => void }) {
  useMapEvents({
    zoomend: (e) => setZoom(e.target.getZoom()),
    zoomstart: (e) => setZoom(e.target.getZoom()),
    moveend: (e) => setZoom(e.target.getZoom()),
  });
  return null;
}

// --- Modo 2D: Mostrar nombre del país en hover ---
import { useRef } from "react";
import { Tooltip, useMap } from "react-leaflet";

function CountryMap2D({ geojson }: { geojson: any }) {
  const [zoom, setZoom] = useState(2);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Custom onEachFeature to handle hover
  function onEachCountry(feature: any, layer: any) {
    layer.on({
      mouseover: (e: any) => {
        setHoveredCountry(feature.properties.name);
        if (e.originalEvent) {
          setHoverPos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        }
        layer.setStyle({ weight: 2, color: "#fff" });
      },
      mouseout: () => {
        setHoveredCountry(null);
        setHoverPos(null);
        layer.setStyle({ weight: 1, color: "#222" });
      },
    });
  }

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-black">
      <LeafletMap
        center={[20, 0] as any}
        zoom={2}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]] as any}
        style={{ width: "100vw", height: "100vh", background: "#000" }}
        scrollWheelZoom={true}
        zoomControl={true}
        attributionControl={false}
      >
        <MapZoomListener setZoom={setZoom} />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          // @ts-ignore
          attribution="&copy; OpenStreetMap contributors"
        />
        <GeoJSON
          data={geojson}
          // @ts-ignore
          style={() => ({ color: "#222", weight: 1, fillOpacity: 0 })}
          onEachFeature={onEachCountry}
        />
      </LeafletMap>
      {hoveredCountry && hoverPos && (
        <div
          className="fixed z-[2000] px-3 py-1 rounded bg-white/90 text-black text-xs font-bold pointer-events-none shadow"
          style={{ left: hoverPos.x + 12, top: hoverPos.y + 4 }}
        >
          {hoveredCountry}
        </div>
      )}
      <ContinentLabels2D zoom={zoom} />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-gray-400 mt-2 z-[1000]">Fuente de países: <a href="https://datahub.io/core/geo-countries" target="_blank" rel="noopener noreferrer" className="underline">datahub.io/core/geo-countries</a></div>
    </div>
  );
}

export default function GlobeComponent() {
  const [countries, setCountries] = useState<any[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [zoom, setZoom] = useState(1.5);
  const [geojson, setGeojson] = useState<any>(null);
  const [mode2D, setMode2D] = useState(false);

  useEffect(() => {
    fetch("/countries.geo.json")
      .then((res) => res.json())
      .then((geojson) => {
        setCountries(geojson.features);
        setGeojson(geojson);
        // No generar etiquetas de ciudades ni detalles, solo países
        setLabels([]);
      });
  }, []);

  const handleZoom = (camera: any) => {
    if (camera && camera.position) {
      setZoom(camera.position.length());
    }
  };

  const visibleLabels: any[] = [];

  // Custom label renderer para fondo blanco
  const labelDotRenderer = (label: any) => {
    if (label.isContinent) {
      return `<div style="display:flex;align-items:center;justify-content:center;">
        <span style="background:${label.bgColor};border-radius:10px;padding:6px 18px;font-size:2.2rem;color:${label.color};font-weight:900;text-shadow:0 2px 8px #0003;letter-spacing:2px;box-shadow:0 2px 12px #0002;">${label.text}</span>
      </div>`;
    }
    return `<div style="display:flex;align-items:center;justify-content:center;">
      <span style="background:${label.bgColor};border-radius:6px;padding:2px 6px;font-size:14px;color:${label.color};font-weight:bold;box-shadow:0 1px 4px #0002;">${label.text}</span>
    </div>`;
  };

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center">
      <StarBackground />
      <button
        className="absolute top-4 right-4 z-[1000] bg-white/90 text-gray-900 px-4 py-2 rounded shadow hover:bg-green-400 transition font-bold"
        onClick={() => setMode2D((v) => !v)}
      >
        {mode2D ? "🌍 Modo 3D" : "🗺️ Modo 2D"}
      </button>
      {mode2D && geojson ? (
        <CountryMap2D geojson={geojson} />
      ) : (
        <Globe
          globeImageUrl={"//unpkg.com/three-globe/example/img/earth-water.png"}
          backgroundColor="#000"
          polygonsData={countries}
          polygonCapColor={() => "#22c55e"}
          polygonSideColor={() => "#16a34a"}
          polygonStrokeColor={() => "#166534"}
          polygonLabel={({ properties }: any) => properties?.name}
          polygonsTransitionDuration={0}
          width={typeof window !== 'undefined' ? window.innerWidth : 1920}
          height={typeof window !== 'undefined' ? window.innerHeight : 1080}
          enablePointerInteraction={true}
          atmosphereColor="#1e3a8a"
          atmosphereAltitude={0.01}
          showAtmosphere={false}
          animateIn={false}
          onGlobeReady={handleZoom}
          onZoom={handleZoom}
          labelsData={[]}
          labelLat={(d: any) => d.lat}
          labelLng={(d: any) => d.lng}
          labelText={(d: any) => d.text}
          labelColor={(d: any) => d.color}
          labelSize={(d: any) => d.size}
          labelDotRadius={0}
          labelResolution={2}
          labelsTransitionDuration={0}
          labelLabel={labelDotRenderer}
        />
      )}
    </div>
  );
} 