import { Container } from "../layout/Container";
import { StatPill } from "../ui/StatPill";

type HeroProps = {
  launchCount: number | null;
};

function formatLaunchCount(launchCount: number | null) {
  if (launchCount === null) {
    return "Loading...";
  }

  return launchCount.toLocaleString("en-US");
}

export function Hero({ launchCount }: HeroProps) {
  return (
    <section className="pb-4 pt-8 sm:pb-5 sm:pt-10">
      <Container>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="eyebrow">Discover</p>
            <h1 className="text-[1.65rem] font-semibold tracking-tight text-white sm:text-[1.95rem]">
              Explore live LibrARC tokens on Arc Testnet.
            </h1>
            <p className="max-w-xl text-sm leading-6 text-[var(--text-muted)]">
              Browse the latest launches, spot growing pools, and open token pages without
              connecting a wallet first.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatPill label="Live launches" tone="accent" value={formatLaunchCount(launchCount)} />
          </div>
        </div>
      </Container>
    </section>
  );
}
