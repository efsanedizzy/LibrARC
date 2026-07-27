import Link from "next/link";

import { Container } from "../layout/Container";
import { Card } from "../ui/Card";

const launches = [
  {
    address: "ARC-0x0af3",
    creator: "Nebula Works",
    launchWindow: "Opened 14 min ago",
    name: "Orbit Loom",
    status: "Filling"
  },
  {
    address: "ARC-0x41de",
    creator: "Pulse Market",
    launchWindow: "Opened 36 min ago",
    name: "Cinder Mesh",
    status: "Hot"
  },
  {
    address: "ARC-0x8c2e",
    creator: "Northline DAO",
    launchWindow: "Opened 52 min ago",
    name: "Signal Harbour",
    status: "Stable"
  }
];

export function RecentlyLaunched() {
  return (
    <section aria-labelledby="recently-launched-title" className="pb-20 pt-16 sm:pb-24 sm:pt-20">
      <Container>
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
            Fresh launches
          </p>
          <h2
            className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl"
            id="recently-launched-title"
          >
            Recently opened pools worth a closer look.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-400">
            Static launch cards keep the interface visually rich while respecting the no-network,
            no-wallet implementation boundary.
          </p>
        </div>

        <div className="mt-10 grid gap-5">
          {launches.map((launch) => (
            <article key={launch.address}>
              <Card className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                      {launch.status}
                    </span>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      {launch.address}
                    </p>
                  </div>

                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white">
                    {launch.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">
                    by {launch.creator} • {launch.launchWindow}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <Link
                    className="inline-flex rounded-full text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
                    href={`/token/${launch.address}`}
                  >
                    Review token page
                  </Link>
                  <Link
                    className="inline-flex rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
                    href="/profile"
                  >
                    View creator profile
                  </Link>
                </div>
              </Card>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
