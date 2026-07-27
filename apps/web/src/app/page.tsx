import { Features } from "../components/home/Features";
import { Hero } from "../components/home/Hero";
import { RecentlyLaunched } from "../components/home/RecentlyLaunched";
import { TrendingTokens } from "../components/home/TrendingTokens";

export default function HomePage() {
  return (
    <main className="flex-1">
      <Hero />
      <Features />
      <TrendingTokens />
      <RecentlyLaunched />
    </main>
  );
}
