import Link from "next/link";

import { Container } from "./Container";

const footerLinks = [
  { href: "/launch", label: "Launch a token" },
  { href: "/profile", label: "Creator profile" },
  { href: "/token/ARC-0x93f1", label: "Featured token" }
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/80">
      <Container className="flex flex-col gap-8 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-lg font-semibold tracking-tight text-white">LibrARC</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            A dark-mode crypto launchpad interface for discovering launches, reviewing momentum, and
            exploring token detail routes.
          </p>
        </div>

        <nav aria-label="Footer navigation">
          <ul className="flex flex-wrap gap-4 text-sm text-slate-300">
            {footerLinks.map((link) => (
              <li key={link.href}>
                <Link
                  className="rounded-full px-1 py-1 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                  href={link.href}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
