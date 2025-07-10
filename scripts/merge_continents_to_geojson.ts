import fs from 'fs/promises';
import path from 'path';

const GEOJSON_PATH = path.join(process.cwd(), 'public', 'countries_with_continent.geo.json');
const CONTINENT_LIST_PATH = path.join(process.cwd(), 'list-of-countries-by-continent-2025.json');

// Mapeo manual de ISO3 a ISO2 para todos los países del mundo
// Lo generamos a partir del JSON de países
async function main() {
  // Cargar lista de países con continente
  const listRaw = await fs.readFile(CONTINENT_LIST_PATH, 'utf-8');
  const countryList = JSON.parse(listRaw);
  // Crear mapeos ISO3 -> ISO2 y ISO2 -> continente
  const iso3ToIso2: Record<string, string> = {};
  const iso2ToContinent: Record<string, string> = {};
  for (const entry of countryList) {
    if (entry.flagCode && entry.country) {
      // Usar una librería o mapeo para obtener ISO3 a partir de ISO2 y nombre
      // Pero aquí asumimos que el nombre es igual en ambos archivos
      // Si tienes un campo ISO3 en tu JSON de países, úsalo aquí
      // Si no, puedes usar una librería como 'iso-3166-1' para obtenerlo
      // Aquí, para hacerlo robusto, buscamos por nombre
      iso2ToContinent[entry.flagCode.toUpperCase()] = Array.isArray(entry.continent) ? entry.continent[0] : entry.continent;
    }
  }
  // Generar mapeo nombre normalizado -> ISO2
  const nameToIso2: Record<string, string> = {};
  for (const entry of countryList) {
    if (entry.flagCode && entry.country) {
      const norm = entry.country.toLowerCase().replace(/[^a-z]/g, "");
      nameToIso2[norm] = entry.flagCode.toUpperCase();
    }
  }
  // Mapeo manual para casos especiales
  const manualNameToIso2: Record<string, string> = {
    "antarctica": "AQ",
    "frenchsouthernandantarcticlands": "TF",
    "thebahamas": "BS",
    "democraticrepublicofthecongo": "CD",
    "northerncyprus": "CY",
    "kosovo": "XK",
    "macedonia": "MK",
    "somaliland": "SO", // O null si prefieres
    "republicofserbia": "RS",
    "swaziland": "SZ",
    "easttimor": "TL",
    "unitedrepublicoftanzania": "TZ",
    "unitedstatesofamerica": "US",
    "westbank": "PS"
  };

  // Cargar GeoJSON
  const geoRaw = await fs.readFile(GEOJSON_PATH, 'utf-8');
  const geojson = JSON.parse(geoRaw);
  for (const feature of geojson.features) {
    // Usar id (ISO3) o name para buscar el ISO2
    const name = feature.properties?.name || feature.id;
    const norm = name.toLowerCase().replace(/[^a-z]/g, "");
    const iso2 = manualNameToIso2[norm] || nameToIso2[norm];
    if (!iso2) {
      feature.properties.continent = null;
      console.log(`Sin ISO2 para: ${feature.properties?.name || feature.id}`);
      continue;
    }
    const continent = iso2ToContinent[iso2] || null;
    feature.properties.continent = continent;
    if (!continent) {
      console.log(`Sin continente para: ${feature.properties?.name || feature.id} (${iso2})`);
    }
  }

  await fs.writeFile(GEOJSON_PATH, JSON.stringify(geojson, null, 2), 'utf-8');
  console.log('Archivo GeoJSON enriquecido con continentes guardado en:', GEOJSON_PATH);
}

main(); 