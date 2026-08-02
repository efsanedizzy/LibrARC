"use client";

import { useState } from "react";

import { Features } from "./Features";
import { Hero } from "./Hero";
import { TrendingTokens } from "./TrendingTokens";

export function HomePageClient() {
  const [launchCount, setLaunchCount] = useState<number | null>(null);

  return (
    <main className="flex-1">
      <Hero launchCount={launchCount} />
      <Features />
      <TrendingTokens onLaunchCountChange={setLaunchCount} />
    </main>
  );
}
