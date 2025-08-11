# 🌍 MacroView - Global Economic Data Visualization
An interactive web app to explore global macro data: GDP, inflation, trade/tariffs, plus live financial news.

This README is intentionally opinionated and practical. If you’re learning, it gives you a clean path to read the code. If you already know React/Next.js, it highlights the architecture quickly so you can dive in where it matters.

## ✨ Key Features

### 📊 Data Visualization
- World map with per-country macro indicators
- Global stats for GDP and inflation, with comparisons
- Dynamic charts and country-to-country comparisons
- Typeahead search to jump to any country

### 📰 Smart News System
- Persistent caching to minimize API calls
- Per-user daily quota enforcement (50/day by default)
- Auto refresh every 24h per category
- Structured categories: tariffs, global macro, inflation

### 🚀 Performance & UX
- Local cache for macro data and news
- Lazy loading by country/feature
- Robust error handling and graceful fallbacks
- Responsive UI

## 🧱 Tech Stack

- Next.js 14 (App Router), React 18, TypeScript
- Styling: Tailwind CSS (+ CSS Modules where useful)
- Maps/graphics: GeoJSON and D3.js
- Data providers: World Bank (historical), IMF (current/point-in-time), NewsAPI, API Ninjas (population)
- Caching: localStorage + custom cache rules

## 🏁 Quickstart

### Prereqs
- Node.js 18+
- A package manager: npm, yarn, pnpm, or bun

### Install

1) Clone and install
```bash
git clone https://github.com/tu-usuario/macroview.git
cd macroview
npm install
```

2) Environment
```bash
cp .env.example .env.local
```
Then edit `.env.local` as needed:
```env
# Optional for local dev
NEXT_PUBLIC_NEWS_API_KEY=your_news_api_key
NEXT_PUBLIC_API_NINJAS_KEY=your_api_ninjas_key
```

3) Run
```bash
npm run dev
# open http://localhost:3000
```

## 🧭 How to Read the Code (start here → go there)

If you’re new to the repo and want a fast mental model:

1) App entry and layout
   - `src/app/page.tsx` — home page; wires together the main sections
   - `src/app/layout.tsx` — global layout, fonts, providers, global CSS

2) The main dashboard and UI shell
   - `src/app/components/Dashboard.tsx` — high-level screen composition
   - `src/app/components/Navbar.tsx` — top nav
   - `src/app/globals.css` — Tailwind/base styles

3) Map and country interaction
   - `src/app/components/Globe2D.tsx` and `Globe3D.tsx` — map rendering
   - `src/app/components/CountrySearch.tsx` — search + selection
   - `src/app/components/SelectedCountryCard.tsx` and `SidePanelCountryInfo.tsx` — details
   - `src/app/components/ComparisonTable.tsx` — country comparisons

4) Data layer and utils
   - `src/app/utils/imfApi.ts` — IMF data helpers
   - `src/app/utils/dataService.ts` — fetch/shape macro series (incl. World Bank)
   - `src/app/utils/newsService.ts` — News API fetching + cache rules
   - `src/app/utils/useNewsCache.ts` — React hook for news caching
   - `src/app/utils/errorHandler.ts` — centralized error handling utilities

5) API routes (server-side)
   - `src/app/api/news/route.ts` — news proxy/caching boundary
   - `src/app/api/population/route.ts` — population proxy (API Ninjas)
   - `src/app/api/imf/*` — IMF related endpoints/utilities

Skim that list top-to-bottom, opening files as you go. You’ll see how the UI reads from the data layer, and how the server routes wrap external APIs.

## 🏗️ Architecture in 60 Seconds

- App Router (Next.js) for file-based routing and server components where helpful
- Client components for interactive visualizations (map, charts)
- Utilities centralize calls to World Bank/IMF/News, with a small error and cache layer
- API routes act as a server-side boundary for rate-limited or key’d providers
- Caching is lightweight: category- and time-scoped, with fallbacks when providers fail

### Data Flow (high-level)
UI → utils (`dataService.ts`/`imfApi.ts`/`newsService.ts`) → external APIs (WB/IMF/News/API Ninjas)
→ normalized shape → components render

## 📰 News Cache System

Key properties:
- 24h TTL per category
- 50 requests/day quota per user (default; adjustable)
- Dedupes concurrent requests
- Falls back to expired data if upstream is down

Details: see `docs/NEWS_CACHE_SYSTEM.md`.

## 🧪 Testing

Run cache tests:
```bash
node scripts/test-news-cache.js
```

Dev tests:
```bash
npm run test
```

## 📁 Project Structure

```
macroview/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── news/route.ts
│   │   │   └── population/route.ts
│   │   ├── components/
│   │   │   ├── NewsSection.tsx
│   │   │   ├── NewsCacheManager.tsx
│   │   │   ├── Globe2D.tsx / Globe3D.tsx
│   │   │   ├── ComparisonTable.tsx
│   │   │   └── ...
│   │   ├── utils/
│   │   │   ├── imfApi.ts
│   │   │   ├── dataService.ts
│   │   │   ├── newsService.ts
│   │   │   ├── useNewsCache.ts
│   │   │   └── errorHandler.ts
│   │   ├── page.tsx
│   │   └── layout.tsx
│   └── ...
├── scripts/
│   └── test-news-cache.js
├── docs/
│   └── NEWS_CACHE_SYSTEM.md
└── ...
```

## 🔧 Advanced Config

Cache limits in `src/app/utils/newsService.ts`:
```ts
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const MAX_DAILY_REQUESTS = 50; // per-user daily cap
```

Add a news category in `src/app/components/NewsSection.tsx`:
```ts
const categories = [
  { name: "Tariffs", query: "tariff OR trade policy", icon: "🚢" },
  // ...
];
```

## 🌐 Data Providers

- World Bank API — historical series (e.g., GDP: `NY.GDP.MKTP.CD`, inflation: `FP.CPI.TOTL.ZG`)
- IMF — point-in-time/current macro stats and metadata
- NewsAPI — finance headlines and articles
- API Ninjas — population data

## 🤝 Contributing

1) Fork
2) Create a feature branch: `git checkout -b feature/awesome`
3) Commit: `git commit -m "feat: awesome"`
4) Push: `git push origin feature/awesome`
5) Open a PR

## 📄 License

MIT — see `LICENSE`.

## 🆘 Support

If you get stuck:
1) Read `docs/NEWS_CACHE_SYSTEM.md`
2) Run `node scripts/test-news-cache.js`
3) Open an issue

## 🚀 Deploy

Vercel (recommended):
```bash
npm run build
vercel --prod
```

Other Next.js-friendly providers: Netlify, Railway, DigitalOcean App Platform, AWS Amplify

---

Built with ❤️ to make macro data actually explorable.
