import { Container } from "../layout/Container";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

const highlights = [
  {
    label: "Verified source",
    value: "LaunchFactory-backed",
    description: "Every Discover card is resolved from the active Arc Testnet LaunchFactory."
  },
  {
    label: "Read only",
    value: "No wallet required",
    description: "Public browsing works without a connection and without browser-side RPC reads."
  },
  {
    label: "Automatic updates",
    value: "New launches appear live",
    description:
      "Newly created Factory launches populate the homepage without hard-coded addresses."
  }
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
            <Button href="#discover" size="lg" variant="secondary">
              Browse Live Launches
            </Button>
          </div>

          <dl className="mt-10 grid gap-4 sm:grid-cols-3">
            {highlights.map((item) => (
              <Card key={item.label} className="p-5">
                <dt className="text-sm text-slate-400">{item.label}</dt>
                <dd className="mt-2 text-2xl font-semibold text-white">{item.value}</dd>
                <p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p>
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
                  Discover flow
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Verified launch browsing
                </h2>
              </div>
              <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                Arc Testnet only
              </div>
            </div>
          </div>

          <div className="relative space-y-4 p-6">
            {[
              "Resolve the canonical launch record from Factory storage.",
              "Load token and pool state through the resilient Arc server client.",
              "Open each token route without signing, approvals, or trade actions."
            ].map((line) => (
              <div
                key={line}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
              >
                <div>
                  <p className="text-base font-semibold text-white">{line}</p>
                  <p className="mt-1 text-sm text-slate-400">Read-only Discover surface</p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                  Live
                </span>
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </section>
  );
}
