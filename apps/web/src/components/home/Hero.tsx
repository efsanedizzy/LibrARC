import { Container } from "../layout/Container";
import { Button } from "../ui/Button";

type HeroProps = {
  launchCount: number | null;
};

const liveNotes = [
  "Live launches resolve from the active Arc Testnet LaunchFactory.",
  "Browsing works without a wallet or browser-side signing.",
  "Every card leads directly into the real token route."
] as const;

function formatLaunchCount(launchCount: number | null) {
  if (launchCount === null) {
    return "Reading live registry";
  }

  if (launchCount === 1) {
    return "1 live launch";
  }

  return `${launchCount.toLocaleString("en-US")} live launches`;
}

export function Hero({ launchCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden pb-10 pt-14 sm:pb-14 sm:pt-20 lg:pb-20 lg:pt-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-[10%] top-4 h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute right-[8%] top-20 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      <Container className="relative grid items-start gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(21rem,0.8fr)] xl:gap-14">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow rounded-full border border-cyan-300/18 bg-cyan-300/8 px-4 py-1.5">
              Discover live launches
            </p>
            <span className="surface-muted inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-[var(--text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)] shadow-[0_0_18px_rgba(52,211,153,0.45)]" />
              Arc Testnet
            </span>
          </div>

          <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-[4.5rem] lg:leading-[1.02]">
            A calmer, sharper way to launch and discover Arc-native tokens.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--text-secondary)] sm:text-xl">
            LibrARC turns the working Arc Testnet launch flow into a credible crypto-native front
            end: verified Discover browsing, direct token routes, and wallet-optional exploration.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button className="sm:min-w-[11rem]" href="/launch" size="lg">
              Launch a token
            </Button>
            <Button className="sm:min-w-[11rem]" href="#discover" size="lg" variant="secondary">
              Browse live launches
            </Button>
          </div>

          <dl className="mt-10 grid gap-4 sm:grid-cols-2 xl:max-w-3xl xl:grid-cols-3">
            <div className="surface-card rounded-[var(--radius-lg)] px-5 py-5">
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-faint)]">
                Network
              </dt>
              <dd className="mt-3 text-2xl font-semibold text-white">Arc Testnet</dd>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                Server-read discovery with browser-wallet execution.
              </p>
            </div>
            <div className="surface-card rounded-[var(--radius-lg)] px-5 py-5">
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-faint)]">
                Registry
              </dt>
              <dd className="mt-3 text-2xl font-semibold text-white">
                {launchCount === null ? "Live" : launchCount.toLocaleString("en-US")}
              </dd>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                {formatLaunchCount(launchCount)} visible through Discover.
              </p>
            </div>
            <div className="surface-card rounded-[var(--radius-lg)] px-5 py-5 sm:col-span-2 xl:col-span-1">
              <dt className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-faint)]">
                Access
              </dt>
              <dd className="mt-3 text-2xl font-semibold text-white">Wallet optional</dd>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                Browse launches first, connect only when you are ready to act.
              </p>
            </div>
          </dl>
        </div>

        <aside className="surface-panel relative overflow-hidden rounded-[var(--radius-xl)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.12),transparent_46%),linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0))]" />
          <div className="relative border-b border-white/8 px-6 py-6 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Live registry status</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  Verified, minimal, and ready to browse.
                </h2>
              </div>
              <span className="surface-muted inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                {formatLaunchCount(launchCount)}
              </span>
            </div>
          </div>

          <div className="relative space-y-4 px-6 py-6 sm:px-7">
            {liveNotes.map((line, index) => (
              <div
                className="surface-muted flex items-start gap-4 rounded-[var(--radius-lg)] px-4 py-4"
                key={line}
              >
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(94,234,212,0.12)] text-sm font-semibold text-[var(--accent-strong)]">
                  0{index + 1}
                </span>
                <div>
                  <p className="text-base font-medium text-white">{line}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                    Preserving live Arc functionality without fake metrics or placeholder market
                    data.
                  </p>
                </div>
              </div>
            ))}

            <div className="surface-card rounded-[var(--radius-lg)] px-5 py-5">
              <p className="eyebrow text-[var(--text-faint)]">Browse or launch</p>
              <p className="mt-2 text-base font-medium text-white">
                Start with Discover, then move directly into the real launch route.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button href="#discover" size="sm" variant="secondary">
                  View live cards
                </Button>
                <Button href="/launch" size="sm" variant="ghost">
                  Open launch page
                </Button>
              </div>
            </div>
          </div>
        </aside>
      </Container>
    </section>
  );
}
