"use client";

import dynamic from "next/dynamic";

const GlobeComponent = dynamic(() => import("./GlobeComponent"), { ssr: false });

export default function Home() {
  return (
    <div className="w-full h-full">
      <GlobeComponent />
    </div>
  );
}
