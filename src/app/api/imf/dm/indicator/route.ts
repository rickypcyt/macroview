import { NextResponse } from 'next/server';

// Cache moderately; WEO/IFS indicators don't change daily.
export const revalidate = 21600; // 6h

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'referer': 'https://www.imf.org/external/datamapper/',
        'origin': 'https://www.imf.org',
        ...(init?.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function getWithRetry(url: string, retries = 3, timeoutMs = 15000) {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        const base = 500 * Math.pow(2, i);
        const jitter = Math.floor(Math.random() * 200);
        await new Promise(r => setTimeout(r, base + jitter));
      }
    }
  }
  throw lastErr;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const indicator = searchParams.get('indicator');
  const countriesRaw = searchParams.get('countries');
  if (!indicator || !countriesRaw) {
    return NextResponse.json({ error: 'Missing indicator or countries' }, { status: 400 });
  }
  const countries = (countriesRaw || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean).join(',');
  const upstream = `https://www.imf.org/external/datamapper/api/v1/${encodeURIComponent(indicator)}?countries=${encodeURIComponent(countries)}`;
  try {
    const res = await getWithRetry(upstream, 3, 15000);
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Unexpected content-type: ${ctype}. Snippet: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    // Fallback for some indicators via SDMX (transform to DM-like shape)
    try {
      // Only handle single country fallback for now
      const countryList = countries.split(',');
      if (countryList.length === 1) {
        const iso3 = countryList[0];
        const tryPaths: string[] = [];
        if (indicator === 'NGDP_RPCH') {
          // Try ISO2 guess (first 2 chars) then ISO3
          const iso2Guess = iso3.slice(0, 2);
          tryPaths.push(`WEO/A.${iso2Guess}.NGDP_RPCH`);
          tryPaths.push(`WEO/A.${iso3}.NGDP_RPCH`);
        }
        // Add more indicator mappings here as needed
        for (const path of tryPaths) {
          try {
            const sdmxRes = await getWithRetry(`https://dataservices.imf.org/REST/SDMX_JSON.svc/CompactData/${encodeURIComponent(path)}`, 2, 12000);
            const ctype2 = sdmxRes.headers.get('content-type') || '';
            if (!ctype2.includes('application/json')) continue;
            const sdmx = await sdmxRes.json();
            type SDMXObs = { ['@TIME_PERIOD']?: string; ['@OBS_VALUE']?: string | number | null };
            type SDMXSeries = { Obs?: SDMXObs[] };
            type SDMXResponse = { CompactData?: { DataSet?: { Series?: SDMXSeries | SDMXSeries[] } } };
            const series: SDMXSeries | SDMXSeries[] | undefined = (sdmx as unknown as SDMXResponse)?.CompactData?.DataSet?.Series;
            const firstSeries: SDMXSeries | undefined = Array.isArray(series) ? series[0] : series;
            const obsArr: SDMXObs[] = firstSeries?.Obs ?? [];
            const obj: Record<string, number> = {};
            for (const o of obsArr) {
              const y = o?.['@TIME_PERIOD'];
              const v = o?.['@OBS_VALUE'];
              if (y && v != null && !isNaN(Number(v))) obj[y] = Number(v);
            }
            // Transform to DM-like response
            return NextResponse.json({ data: { [iso3]: obj } }, { status: 200 });
          } catch {}
        }
      }
    } catch {}
    return NextResponse.json({ error: 'Failed to fetch IMF DataMapper indicator', upstream: upstream, detail: String(err) }, { status: 502 });
  }
}
