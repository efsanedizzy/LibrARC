import Link from "next/link";

import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { Container } from "./Container";

const navigation = [
  { href: "/", label: "Discover" },
  { href: "/launch", label: "Launch" },
  { href: "/profile", label: "Profile" }
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <Container className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link
            className="inline-flex items-center gap-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
            href="/"
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,_rgba(103,232,249,0.95),_rgba(8,145,178,0.6)_55%,_rgba(15,23,42,0.3)_100%)] text-lg font-black text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.35)]"
            >
              L
            </span>
            <span>
              <span className="block text-lg font-semibold tracking-tight text-white">LibrARC</span>
              <span className="block text-xs uppercase tracking-[0.3em] text-cyan-200/70">
                Launchpad
              </span>
            </span>
          </Link>

          <div className="md:hidden">
            <WalletConnectButton />
          </div>
        </div>

        <nav aria-label="Primary navigation">
          <ul className="flex flex-wrap items-center gap-2 sm:gap-3">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium text-slate-300 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden md:block">
          <WalletConnectButton />
        </div>
      </Container>
    </header>
  );
}
