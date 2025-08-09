import { NextResponse } from 'next/server';

// Cache modestly; SDMX endpoints are relatively static intra-day
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
        'referer': 'https://dataservices.imf.org/REST/SDMX_JSON.svc/',
        'origin': 'https://dataservices.imf.org',
        ...(init?.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function getWithRetry(url: string, retries = 2, timeoutMs = 12000) {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }
  const upstream = `https://dataservices.imf.org/REST/SDMX_JSON.svc/CompactData/${path}`;
  try {
    const res = await getWithRetry(upstream, 2, 12000);
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Unexpected content-type: ${ctype}. Snippet: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: 'Failed to fetch IMF SDMX data', detail: String(err) }, { status: 502 });
  }
}
