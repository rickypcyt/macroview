import { NextResponse } from 'next/server';

// Revalidate once per day for country list
export const revalidate = 86400;

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function getWithRetry(url: string, retries = 2, timeoutMs = 8000) {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs, { headers: { 'accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

export async function GET() {
  const upstream = 'https://www.imf.org/external/datamapper/api/v1/countries';
  try {
    const res = await getWithRetry(upstream, 2, 8000);
    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: 'Failed to fetch IMF countries', detail: String(err) }, { status: 502 });
  }
}
