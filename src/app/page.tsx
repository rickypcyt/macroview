"use client";

import dynamic from "next/dynamic";

const GlobeComponent = dynamic(() => import("./GlobeComponent"), { ssr: false });

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-3xl font-bold mb-8">Globo Terráqueo Interactivo</h1>
      <GlobeComponent />
    </div>
  );
}
