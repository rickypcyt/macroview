"use client";

import dynamic from "next/dynamic";

const GlobeComponent = dynamic(() => import("./GlobeComponent"), { ssr: false });

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <GlobeComponent />
    </div>
  );
}
