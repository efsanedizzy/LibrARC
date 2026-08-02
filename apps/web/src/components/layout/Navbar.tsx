"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { Container } from "./Container";

const navigation = [
  { href: "/", label: "Discover" },
  { href: "/launch", label: "Launch" },
  { href: "/profile", label: "Profile" }
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-white/8 bg-[rgba(4,8,22,0.8)] backdrop-blur-xl">
        <Container className="py-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Link
                className="inline-flex items-center gap-3 rounded-full focus-visible:outline-offset-4"
                href="/"
                onClick={() => setIsMenuOpen(false)}
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-200/15 bg-[radial-gradient(circle_at_30%_30%,rgba(103,232,249,0.98),rgba(15,118,110,0.85)_60%,rgba(4,8,22,0.7)_100%)] text-lg font-black text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.2)]"
                >
                  L
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold tracking-tight text-white">
                    LibrARC
                  </span>
                  <span className="block text-[0.68rem] font-medium uppercase tracking-[0.32em] text-[var(--text-faint)]">
                    Arc Testnet
                  </span>
                </span>
              </Link>
            </div>

            <nav
              aria-label="Primary navigation"
              className="hidden md:flex md:flex-1 md:justify-center"
            >
              <ul className="surface-muted flex items-center gap-1 rounded-full p-1.5">
                {navigation.map((item) => {
                  const isActive = isActivePath(pathname, item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        className={[
                          "inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition",
                          isActive
                            ? "bg-[rgba(94,234,212,0.12)] text-white shadow-[inset_0_0_0_1px_rgba(94,234,212,0.2)]"
                            : "text-[var(--text-muted)] hover:bg-white/6 hover:text-white"
                        ].join(" ")}
                        href={item.href}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="ml-auto flex items-center gap-2 md:gap-3">
              <div className="flex w-auto justify-end md:min-w-[14rem] md:max-w-[14rem]">
                <WalletConnectButton />
              </div>

              <button
                aria-controls="mobile-navigation"
                aria-expanded={isMenuOpen}
                aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                className="surface-muted inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:text-white md:hidden"
                onClick={() => setIsMenuOpen((current) => !current)}
                type="button"
              >
                <span className="sr-only">Toggle navigation</span>
                <span className="flex flex-col gap-1.5">
                  <span
                    className={[
                      "block h-0.5 w-4 rounded-full bg-current transition",
                      isMenuOpen ? "translate-y-2 rotate-45" : ""
                    ].join(" ")}
                  />
                  <span
                    className={[
                      "block h-0.5 w-4 rounded-full bg-current transition",
                      isMenuOpen ? "opacity-0" : ""
                    ].join(" ")}
                  />
                  <span
                    className={[
                      "block h-0.5 w-4 rounded-full bg-current transition",
                      isMenuOpen ? "-translate-y-2 -rotate-45" : ""
                    ].join(" ")}
                  />
                </span>
              </button>
            </div>
          </div>

          {isMenuOpen ? (
            <nav
              aria-label="Mobile navigation"
              className="surface-panel mt-4 rounded-[var(--radius-lg)] p-2 md:hidden"
              id="mobile-navigation"
            >
              <ul className="flex flex-col gap-1">
                {navigation.map((item) => {
                  const isActive = isActivePath(pathname, item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        className={[
                          "flex min-h-11 items-center rounded-[var(--radius-md)] px-4 text-sm font-medium transition",
                          isActive
                            ? "bg-[rgba(94,234,212,0.12)] text-white"
                            : "text-[var(--text-secondary)] hover:bg-white/6 hover:text-white"
                        ].join(" ")}
                        href={item.href}
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </Container>
      </div>
    </header>
  );
}
