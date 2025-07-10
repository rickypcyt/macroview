import fs from 'fs/promises';
import path from 'path';

const INPUT_PATH = path.join(process.cwd(), 'public', 'countries.geo.json');
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'countries_with_continent.geo.json');

async function fetchContinentByISO2(iso2: string): Promise<string | null> {
  try {
    const res = await fetch(`https://restcountries.com/v3.1/alpha/${iso2}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.region) {
      return data[0].region;
    }
    return null;
  } catch {
    return null;
  }
}

async function enrichCountriesWithContinent() {
  const raw = await fs.readFile(INPUT_PATH, 'utf-8');
  const geojson = JSON.parse(raw);
  const features = geojson.features;

  for (const feature of features) {
    const iso2 = feature.properties?.ISO_A2 || feature.properties?.iso_a2 || feature.id;
    if (!iso2 || typeof iso2 !== 'string' || iso2.length !== 2) {
      feature.properties.continent = null;
      continue;
    }
    const continent = await fetchContinentByISO2(iso2);
    feature.properties.continent = continent;
    // Opcional: Espera corta para no saturar la API
    await new Promise(r => setTimeout(r, 100));
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify({ ...geojson, features }, null, 2), 'utf-8');
  console.log(`Archivo enriquecido guardado en: ${OUTPUT_PATH}`);
}

enrichCountriesWithContinent(); 