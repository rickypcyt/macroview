import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country');

    if (!country) {
      return NextResponse.json({ error: 'country is required' }, { status: 400 });
    }

    const apiKey = process.env.API_NINJAS_KEY;

    if (!apiKey) {
      if (process.env.NODE_ENV === 'production') {
        console.warn('API_NINJAS_KEY not set in production. Returning empty payload.');
        return NextResponse.json({ population: null, year: null, historical_population: [] }, { status: 200 });
      }
      console.error('API_NINJAS_KEY is not configured');
      return NextResponse.json({ error: 'No API KEY found' }, { status: 500 });
    }

    const url = `https://api.api-ninjas.com/v1/population?country=${encodeURIComponent(country)}`;
    const res = await fetch(url, {
      headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
      // Avoid Next fetch cache for fresh data
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('API Ninjas error:', res.status, text);
      return NextResponse.json({ error: 'Failed to fetch population' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('Population route error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
