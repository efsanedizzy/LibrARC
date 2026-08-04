import Image from "next/image";
import Link from "next/link";

import { Container } from "./Container";

const footerLinks = [
  { href: "/", label: "Discover" },
  { href: "/launch", label: "Launch a token" },
  { href: "/profile", label: "Profile" }
];

export function Footer() {
  return (
    <footer className="border-t border-[var(--border-soft)] bg-[rgba(21,25,34,0.72)]">
      <Container className="flex flex-col gap-5 py-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="relative h-[30px] w-[30px] shrink-0">
              <Image
                alt="LibrARC"
                className="object-contain"
                fill
                sizes="30px"
                src="/librarc-logo.png"
              />
            </span>
            <p className="text-sm font-semibold tracking-tight text-white">LibrARC</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Arc Testnet launchpad with live Factory discovery and browser-wallet execution.
          </p>
        </div>

        <div className="flex flex-col gap-4 lg:items-end">
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
            Built for Arc Testnet. No fake market data.
          </p>
        </div>
      </Container>
    </footer>
  );
}
