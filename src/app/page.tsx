"use client";

import ComparisonTable from "./components/ComparisonTable";
import { Navbar } from "./components/Navbar";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const GlobeComponent = dynamic(() => import("./GlobeComponent"), { ssr: false });

export default function Home() {
  // Guard initial render to avoid SSR/CSR mismatch due to localStorage-derived state
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [viewMode, setViewMode] = useState<'summary' | '3d' | '2d' | 'comparison'>('summary');

  // Load persisted view mode on client only
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('macroview_last_view') : null;
      if (stored === 'summary' || stored === '3d' || stored === '2d' || stored === 'comparison') {
        setViewMode(stored);
      }
    } catch {}
  }, []);

  // Persist view mode changes
  useEffect(() => {
    try {
      if (mounted) {
        window.localStorage.setItem('macroview_last_view', viewMode);
      }
    } catch {}
  }, [mounted, viewMode]);

  const handleViewModeChange = (mode: 'summary' | '3d' | '2d' | 'comparison') => {
    setViewMode(mode);
  };

  // Render a stable placeholder until mounted to keep SSR and first CSR identical
  if (!mounted) {
    return <div className="w-full h-full" />;
  }

  return (
    <div className="w-full h-full">
      <Navbar viewMode={viewMode} onViewModeChange={handleViewModeChange} />
      {viewMode === 'comparison' ? (
        <ComparisonTable />
      ) : (
        <GlobeComponent viewMode={viewMode} />
      )}
    </div>
  );
}
