import { NextResponse } from 'next/server';

// Cache modestly; SDMX endpoints are relatively static intra-day
export const revalidate = 21600; // 6h

// Simple in-memory cache to avoid repeating slow IMF calls within the server process
type CacheEntry = { data: unknown; ts: number };
const CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<Response>>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

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

async function getWithRetry(url: string, retries = 1, timeoutMs = 6500) {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 300 * Math.pow(2, i)));
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
  const cacheKey = upstream;
  const now = Date.now();

  // Serve from memory cache if fresh
  const cached = CACHE.get(cacheKey);
  if (cached && now - cached.ts < TTL_MS) {
    return NextResponse.json(cached.data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
      },
    });
  }

  // Deduplicate concurrent requests
  const inflight = INFLIGHT.get(cacheKey);
  if (inflight) {
    try {
      const res = await inflight;
      return res;
    } catch {
      // Fall through to new attempt
    }
  }

  const promise = (async () => {
    try {
      const res = await getWithRetry(upstream, 1, 6500);
      const ctype = res.headers.get('content-type') || '';
      if (!ctype.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Unexpected content-type: ${ctype}. Snippet: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      CACHE.set(cacheKey, { data, ts: Date.now() });
      return NextResponse.json(data, {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
        },
      });
    } catch (err: unknown) {
      return NextResponse.json({ error: 'Failed to fetch IMF SDMX data', detail: String(err) }, { status: 502 });
    } finally {
      INFLIGHT.delete(cacheKey);
    }
  })();
  INFLIGHT.set(cacheKey, promise);
  return promise;
}
