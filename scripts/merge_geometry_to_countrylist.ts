import fs from 'fs/promises';
import path from 'path';

const GEOJSON_PATH = path.join(process.cwd(), 'public', 'countries_with_continent.geo.json');
const COUNTRY_LIST_PATH = path.join(process.cwd(), 'list-of-countries-by-continent-2025.json');
const OUTPUT_PATH = path.join(process.cwd(), 'list-of-countries-by-continent-2025-with-geometry.json');

async function main() {
  // Cargar GeoJSON y crear mapeo ISO2 -> geometry
  const geoRaw = await fs.readFile(GEOJSON_PATH, 'utf-8');
  const geojson = JSON.parse(geoRaw);
  const iso2ToGeometry: Record<string, any> = {};
  for (const feature of geojson.features) {
    const iso2 = feature.properties?.ISO_A2 || feature.properties?.iso_a2 || feature.id;
    if (iso2 && typeof iso2 === 'string') {
      iso2ToGeometry[iso2.toUpperCase()] = feature.geometry;
    }
  }

  // Cargar lista de países
  const listRaw = await fs.readFile(COUNTRY_LIST_PATH, 'utf-8');
  const countryList = JSON.parse(listRaw);

  // Agregar geometría a cada país
  for (const entry of countryList) {
    if (entry.flagCode && typeof entry.flagCode === 'string') {
      entry.geometry = iso2ToGeometry[entry.flagCode.toUpperCase()] || null;
    } else {
      entry.geometry = null;
    }
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(countryList, null, 2), 'utf-8');
  console.log('Archivo enriquecido guardado en:', OUTPUT_PATH);
}

main(); 