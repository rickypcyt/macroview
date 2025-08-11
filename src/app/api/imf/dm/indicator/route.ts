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
  // IMF DataMapper expects path-style parameters: /{indicator}/{countries}
  // Example: https://www.imf.org/external/datamapper/api/v1/PCPIPCH/ECU
  const upstream = `https://www.imf.org/external/datamapper/api/v1/${encodeURIComponent(indicator)}/${encodeURIComponent(countries)}`;
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
    return NextResponse.json({ error: 'Failed to fetch IMF DataMapper indicator', upstream, indicator, countries, detail: String(err) }, { status: 502 });
  }
}

