import { Container } from "../layout/Container";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

const metrics = [
  { label: "Active launch rooms", value: "28" },
  { label: "Community watchlists", value: "14.2K" },
  { label: "24h paper volume", value: "$18.6M" }
];

const watchlist = [
  { name: "ARC Flux", change: "+38.2%", tone: "text-emerald-300" },
  { name: "Night Relay", change: "+21.4%", tone: "text-emerald-300" },
  { name: "Drift Mint", change: "-4.8%", tone: "text-rose-300" }
];

export function Hero() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-20 lg:py-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-0 top-28 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <Container className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div>
          <p className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">
            Live launchpad radar
          </p>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Discover high-signal token launches before the crowd catches up.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            LibrARC gives creators and traders a single dark-mode control room for launch activity,
            momentum snapshots, and route-level token exploration.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/launch" size="lg">
              Start a Launch
            </Button>
            <Button href="#trending" size="lg" variant="secondary">
              Explore Trending Tokens
            </Button>
          </div>

          <dl className="mt-10 grid gap-4 sm:grid-cols-3">
            {metrics.map((metric) => (
              <Card key={metric.label} className="p-5">
                <dt className="text-sm text-slate-400">{metric.label}</dt>
                <dd className="mt-2 text-2xl font-semibold text-white">{metric.value}</dd>
              </Card>
            ))}
          </dl>
        </div>

        <Card className="relative overflow-hidden p-0">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(103,232,249,0.18),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(244,114,182,0.12),_transparent_50%)]"
          />

          <div className="relative border-b border-white/10 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-100/70">
                  Momentum board
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Signal stack
                </h2>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
                +12.4% pulse
              </div>
            </div>
          </div>

          <div className="relative space-y-4 p-6">
            {watchlist.map((token) => (
              <div
                key={token.name}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
              >
                <div>
                  <p className="text-base font-semibold text-white">{token.name}</p>
                  <p className="mt-1 text-sm text-slate-400">Community momentum tracking</p>
                </div>
                <p className={["text-sm font-semibold", token.tone].join(" ")}>{token.change}</p>
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </section>
  );
}
