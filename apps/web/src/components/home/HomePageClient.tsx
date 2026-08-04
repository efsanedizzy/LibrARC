"use client";

import { useState } from "react";

import { Hero } from "./Hero";
import { LaunchBrowser } from "./LaunchBrowser";

export function HomePageClient() {
  const [launchCount, setLaunchCount] = useState<number | null>(null);

  return (
    <main className="flex-1">
      <Hero launchCount={launchCount} />
      <LaunchBrowser onLaunchCountChange={setLaunchCount} />
    </main>
  );
}
