import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Ensure we run on the Node.js runtime so standard environment variables are available
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  
  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter is required' },
      { status: 400 }
    );
  }

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    // In production, fail gracefully to avoid breaking the UI
    if (process.env.NODE_ENV === 'production') {
      console.warn('NewsAPI key is not configured in production. Returning empty results.');
      return NextResponse.json({ articles: [] }, { status: 200 });
    }
    // In development, surface the misconfiguration
    console.error('NewsAPI key is not configured');
    return NextResponse.json(
      { error: 'No API KEY found' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=3&apiKey=${apiKey}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('NewsAPI error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch news', details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
