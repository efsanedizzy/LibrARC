import Link from "next/link";

import { Container } from "./Container";

const footerLinks = [
  { href: "/", label: "Discover" },
  { href: "/launch", label: "Launch a token" },
  { href: "/profile", label: "Profile" }
];

export function Footer() {
  return (
    <footer className="border-t border-white/8 bg-[rgba(4,8,22,0.72)]">
      <Container className="flex flex-col gap-8 py-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-lg font-semibold tracking-tight text-white">LibrARC</p>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--text-muted)]">
            A premium Arc Testnet launch surface for live Discover browsing, creator-led launches,
            and route-level token exploration without server-side signing.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-[var(--text-faint)]">
            Factory-backed discovery. Browser-wallet execution.
          </p>
        </div>

        <div className="flex flex-col gap-5 lg:items-end">
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    className="rounded-full px-1 py-1 transition hover:text-white"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="text-xs leading-6 text-[var(--text-faint)]">
            Built for Arc Testnet. No custodial keys. No mock market metrics.
          </p>
        </div>
      </Container>
    </footer>
  );
}
