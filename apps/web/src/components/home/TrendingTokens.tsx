import Link from "next/link";

import { Container } from "../layout/Container";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

const trendingTokens = [
  {
    address: "ARC-0x93f1",
    change: "+46.8%",
    liquidity: "$2.4M",
    name: "ARC Flux",
    sentiment: "Breakout volume",
    volume: "$8.2M"
  },
  {
    address: "ARC-0x19b7",
    change: "+28.1%",
    liquidity: "$1.1M",
    name: "Relay Nine",
    sentiment: "Whale accumulation",
    volume: "$4.7M"
  },
  {
    address: "ARC-0x72cd",
    change: "+17.5%",
    liquidity: "$960K",
    name: "Luma Forge",
    sentiment: "Steady climb",
    volume: "$3.2M"
  }
];

export function TrendingTokens() {
  return (
    <section aria-labelledby="trending-title" className="py-16 sm:py-20" id="trending">
      <Container>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
              Trending now
            </p>
            <h2
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl"
              id="trending-title"
            >
              Token cards wired to your existing dynamic route.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Each card uses static mock data and links directly into `/token/[address]` without any
              API or blockchain dependencies.
            </p>
          </div>

          <Button href="/launch" variant="secondary">
            Launch Your Token
          </Button>
        </div>

        <ul className="mt-10 grid gap-5 lg:grid-cols-3">
          {trendingTokens.map((token) => (
            <li key={token.address}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                      {token.address}
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                      {token.name}
                    </h3>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    {token.change}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-7 text-slate-400">{token.sentiment}</p>

                <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      24h volume
                    </dt>
                    <dd className="mt-2 text-lg font-semibold text-white">{token.volume}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Liquidity</dt>
                    <dd className="mt-2 text-lg font-semibold text-white">{token.liquidity}</dd>
                  </div>
                </dl>

                <Link
                  className="mt-6 inline-flex rounded-full text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
                  href={`/token/${token.address}`}
                >
                  Open token page
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
