"use client";

import "leaflet/dist/leaflet.css";

// import countriesData from "world-countries"; // No usar, solo GeoJSON
import { GeoJSON, MapContainer as LeafletMap, TileLayer } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { Tooltip, useMap } from "react-leaflet";
import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";
import { feature } from "topojson-client";
import { useMapEvents } from "react-leaflet";

// --- Modo 2D: Mostrar nombre del país en hover ---

// Popup de país modular

// Cache en memoria para poblaciones obtenidas por API
const populationCache: Record<string, number> = {};
// Helper para cachear en localStorage
function getPopulationFromStorage(countryName: string): number | null {
  try {
    const val = localStorage.getItem(`populationCache:${countryName}`);
    if (val) return parseInt(val);
  } catch {}
  return null;
}
function setPopulationInStorage(countryName: string, value: number) {
  try {
    localStorage.setItem(`populationCache:${countryName}`, value.toString());
  } catch {}
}

function CountryInfoPopup({ country, position, onClose, popByCountry, normalizeCountryName }: { country: any, position: { x: number, y: number }, onClose: () => void, popByCountry: Record<string, number>, normalizeCountryName: (name: string) => string }) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [apiPopulation, setApiPopulation] = useState<number | null>(null);
  const [loadingApi, setLoadingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  if (!country) return null;
  // Buscar población por nombre normalizado
  const countryName = country.properties?.name || country.properties?.NAME || country.id || "";
  const normalized = normalizeCountryName(countryName);
  let population: string | number = "Desconocida";
  if (normalized && popByCountry[normalized]) {
    population = popByCountry[normalized];
  } else if (country.properties?.POP_EST) {
    population = country.properties.POP_EST;
  }

  // Si no hay población local, intenta obtenerla de la API externa
  useEffect(() => {
    if (population === "Desconocida" && countryName) {
      // Buscar ISO2 code
      const iso2 = country.properties?.ISO_A2 || country.properties?.iso_a2 || country.properties?.iso2 || country.id;
      let queryKey: string;
      let queryValue: string;
      if (iso2 && typeof iso2 === 'string' && iso2.length === 2) {
        queryKey = iso2.toUpperCase();
        queryValue = iso2.toUpperCase();
      } else {
        queryKey = normalizeCountryName(countryName);
        queryValue = queryKey;
      }
      // Si ya está en caché en memoria o localStorage, úsala
      if (populationCache[queryKey]) {
        setApiPopulation(populationCache[queryKey]);
        setApiError(null);
        setLoadingApi(false);
        return;
      }
      const localPop = getPopulationFromStorage(queryKey);
      if (localPop) {
        populationCache[queryKey] = localPop;
        setApiPopulation(localPop);
        setApiError(null);
        setLoadingApi(false);
        return;
      }
      setLoadingApi(true);
      setApiError(null);
      const API_NINJAS_KEY = process.env.NEXT_PUBLIC_API_NINJAS_KEY;
      if (!API_NINJAS_KEY) {
        setApiError("API Key no configurada (.env.local)");
        setLoadingApi(false);
        return;
      }
      // SIEMPRE usa ISO2 si existe, si no, nombre normalizado
      fetch(`https://api.api-ninjas.com/v1/population?country=${encodeURIComponent(queryValue)}`, {
        headers: { 'X-Api-Key': API_NINJAS_KEY }
      })
        .then(res => {
          if (!res.ok) throw new Error("No se pudo obtener la población");
          return res.json();
        })
        .then((data) => {
          if (data && typeof data.population === 'number') {
            setApiPopulation(data.population);
            populationCache[queryKey] = data.population;
            setPopulationInStorage(queryKey, data.population);
          } else {
            setApiError("No disponible en API externa");
          }
        })
        .catch(() => setApiError("No disponible en API externa"))
        .finally(() => setLoadingApi(false));
    } else {
      setApiPopulation(null);
      setApiError(null);
      setLoadingApi(false);
    }
  }, [countryName, population]);

  return (
    <div
      ref={popupRef}
      className="fixed z-[2100] px-4 py-3 rounded bg-white/95 text-black text-sm font-semibold pointer-events-auto shadow-lg border border-gray-300 min-w-[220px]"
      style={{ left: position.x + 16, top: position.y + 8 }}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-base">{country.properties?.name || "País"}</span>
        <button onClick={onClose} className="ml-2 text-gray-500 hover:text-red-500 font-bold text-lg leading-none">×</button>
      </div>
      <div className="mb-1">
        <span className="text-gray-700">Población:</span> {typeof population === 'number' ? population.toLocaleString() :
          loadingApi ? <span className="italic text-gray-500 ml-2">Cargando...</span> :
          apiPopulation ? apiPopulation.toLocaleString() :
          apiError ? <span className="text-red-500 ml-2">{apiError}</span> : population}
      </div>
      {/* Aquí puedes agregar más info del país */}
    </div>
  );
}

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
  { name: "NORTH AMERICA", lat: 55, lng: -100 },
  { name: "SOUTH AMERICA", lat: -18, lng: -58 },
  { name: "EUROPE", lat: 54, lng: 20 },
  { name: "AFRICA", lat: 2, lng: 22 },
  { name: "ASIA", lat: 45, lng: 100 },
  { name: "AUSTRALIA", lat: -25, lng: 135 },
  { name: "ANTARCTICA", lat: -82, lng: 0 },
];

const CONTINENT_LABEL_OFFSETS: Record<string, { x: number; y: number }> = {
  "NORTH AMERICA": { x: -90, y: -30 },
  "SOUTH AMERICA": { x: -90, y: 0 },
  "EUROPE": { x: -60, y: -30 },
  "AFRICA": { x: -60, y: 0 },
  "ASIA": { x: -90, y: -30 },
  "AUSTRALIA": { x: -90, y: 0 },
  "ANTARCTICA": { x: -80, y: 0 },
};

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

function ContinentLabels2D({ continents }: { continents: { name: string, lat: number, lng: number }[] }) {
  const map = useMap();
  const [positions, setPositions] = useState<{ name: string, x: number, y: number }[]>([]);

  useEffect(() => {
    function updatePositions() {
      const newPositions = continents.map((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng]);
        return { name: c.name, x: point.x, y: point.y };
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
      {positions.map((c) => (
        <div
          key={c.name}
          className="pointer-events-none select-none font-extrabold text-2xl md:text-4xl text-white/90 drop-shadow-lg"
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            zIndex: 1000,
            textShadow: "0 2px 8px #000, 0 0 2px #000",
            transform: "translate(-50%, -50%)",
          }}
        >
          {c.name.toUpperCase()}
        </div>
      ))}
    </>
  );
}

function MapZoomListener({ setZoom }: { setZoom: (z: number) => void }) {
  useMapEvents({
    zoomend: (e) => setZoom(e.target.getZoom()),
    zoomstart: (e) => setZoom(e.target.getZoom()),
    moveend: (e) => setZoom(e.target.getZoom()),
  });
  return null;
}


function CountryMap2D({ geojson, popByCountry, normalizeCountryName }: { geojson: any, popByCountry: Record<string, number>, normalizeCountryName: (name: string) => string }) {
  const [zoom, setZoom] = useState(2);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);

  // Para mantener el borde resaltado si el popup está abierto para ese país
  const highlightedCountry = selectedCountry?.properties?.name || hoveredCountry;

  // Custom onEachFeature to handle hover and click
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
        // Solo quitar el highlight si no está seleccionado
        if (!selectedCountry || selectedCountry.properties.name !== feature.properties.name) {
          layer.setStyle({ weight: 1, color: "#222" });
        }
      },
      click: (e: any) => {
        setSelectedCountry(feature);
        if (e.originalEvent) {
          setPopupPos({ x: e.originalEvent.clientX, y: e.originalEvent.clientY });
        }
      },
    });
  }

  // Custom style para resaltar el país hovered o seleccionado
  function countryStyle(feature: any) {
    const isHighlighted = highlightedCountry === feature.properties.name;
    return {
      color: isHighlighted ? "#22c55e" : "#222",
      weight: isHighlighted ? 2.5 : 1,
      fillOpacity: 0,
      dashArray: isHighlighted ? "2 2" : undefined,
    };
  }

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-black">
      <LeafletMap
        center={[20, 0] as LatLngExpression}
        zoom={2}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]] as LatLngBoundsExpression}
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
          style={countryStyle}
          onEachFeature={onEachCountry}
        />
        <ContinentLabels2D continents={CONTINENTS_EN} />
      </LeafletMap>
      {hoveredCountry && hoverPos && !selectedCountry && (
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
        />
      )}
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
  const [popByCountry, setPopByCountry] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/countries.geo.json")
      .then((res) => res.json())
      .then((geojson) => {
        setCountries(geojson.features);
        setGeojson(geojson);
        setLabels([]);
      });
    // Fetch población de countriesnow.space
    fetch("https://countriesnow.space/api/v0.1/countries/population")
      .then((res) => res.json())
      .then((data) => {
        const popMap: Record<string, number> = {};
        if (Array.isArray(data.data)) {
          data.data.forEach((item: any) => {
            if (item.country && Array.isArray(item.populationCounts) && item.populationCounts.length > 0) {
              // Tomar el valor más reciente
              const mostRecent = item.populationCounts.reduce((a: any, b: any) => (parseInt(a.year) > parseInt(b.year) ? a : b));
              popMap[normalizeCountryName(item.country)] = parseInt(mostRecent.value);
            }
          });
        }
        setPopByCountry(popMap);
      });
  }, []);

  // Normaliza el nombre de país para hacer matching flexible
  function normalizeCountryName(name: string): string {
    const n = name
      .toLowerCase()
      .replace(/\b(the|of|and)\b/g, "")
      .replace(/[^a-z]/g, "")
      .replace(/korea,? republicof/, "southkorea")
      .replace(/korea,? democraticpeoplesrepublicof/, "northkorea")
      .replace(/viet nam/, "vietnam")
      .replace(/czechia/, "czechrepublic")
      .replace(/russianfederation/, "russia")
      .replace(/syrianarabrepublic/, "syria")
      .replace(/iranislamicrepublicof/, "iran")
      .replace(/bolivia\(plurinationalstateof\)/, "bolivia")
      .replace(/tanzaniaunitedrepublicof/, "tanzania")
      .replace(/venezuela\(bolivarianrepublicof\)/, "venezuela")
      .replace(/moldovarepublicof/, "moldova")
      .replace(/palestine,? stateof/, "palestine")
      .replace(/laopeoplesdemocraticrepublic/, "laos")
      .replace(/brunei darussalam/, "brunei")
      .replace(/myanmar/, "burma")
      .replace(/unitedkingdomofgreatbritainandnorthernireland/, "unitedkingdom")
      .replace(/\s+/g, "");
    // Special cases for US/USA
    if (["unitedstatesamerica", "unitedstates", "usa"].includes(n)) return "US";
    // Special case for UK
    if (["unitedkingdom", "uk"].includes(n)) return "UK";
    return n;
  }

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
        <CountryMap2D geojson={geojson} popByCountry={popByCountry} normalizeCountryName={normalizeCountryName} />
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