"use client";

import ComparisonTable from "./components/ComparisonTable";
import { Navbar } from "./components/Navbar";
import dynamic from "next/dynamic";
import useLocalStorage from "use-local-storage";

const GlobeComponent = dynamic(() => import("./GlobeComponent"), { ssr: false });

export default function Home() {
  const [viewMode, setViewMode] = useLocalStorage<'summary' | '3d' | '2d' | 'comparison'>('macroview_last_view', 'summary');

  const handleViewModeChange = (mode: 'summary' | '3d' | '2d' | 'comparison') => {
    setViewMode(mode);
  };

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
