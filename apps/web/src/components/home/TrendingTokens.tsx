import { LaunchBrowser } from "./LaunchBrowser";

type TrendingTokensProps = {
  onLaunchCountChange?: (launchCount: number) => void;
};

export function TrendingTokens({ onLaunchCountChange }: TrendingTokensProps) {
  return <LaunchBrowser onLaunchCountChange={onLaunchCountChange} />;
}
