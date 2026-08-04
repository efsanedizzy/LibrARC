"use client";

import Image from "next/image";
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
      <div className="border-b border-[var(--border-soft)] bg-[rgba(21,25,34,0.9)] backdrop-blur-md">
        <Container className="py-3">
          <div className="flex min-h-[76px] items-center justify-between gap-3 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4">
            <div className="min-w-0 md:justify-self-start">
              <Link
                className="inline-flex items-center gap-3 rounded-[0.9rem] focus-visible:outline-offset-4"
                href="/"
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="surface-muted flex h-[46px] w-[46px] min-w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-strong)] shadow-[0_8px_20px_rgba(12,20,36,0.18)] sm:h-[56px] sm:w-[56px] sm:min-w-[56px]">
                  <span className="relative h-full w-full overflow-hidden rounded-full">
                    <Image
                      alt="LibrARC"
                      className="scale-[1.2] object-cover"
                      fill
                      priority
                      sizes="(min-width: 640px) 56px, 46px"
                      src="/librarc-logo.png"
                    />
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[1.08rem] font-semibold tracking-tight text-white sm:text-[1.12rem]">
                    LibrARC
                  </span>
                </span>
              </Link>
            </div>

            <nav aria-label="Primary navigation" className="hidden md:block md:justify-self-center">
              <ul className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-1">
                {navigation.map((item) => {
                  const isActive = isActivePath(pathname, item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        className={[
                          "inline-flex min-h-9 items-center rounded-[0.8rem] px-4 text-sm font-medium transition",
                          isActive
                            ? "bg-[var(--bg-surface-strong)] text-white shadow-[inset_0_0_0_1px_rgba(76,128,255,0.18)]"
                            : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-white"
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

            <div className="flex items-center gap-2 md:justify-self-end">
              <div className="flex min-w-0 justify-end md:w-auto">
                <WalletConnectButton />
              </div>

              <button
                aria-controls="mobile-navigation"
                aria-expanded={isMenuOpen}
                aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                className="surface-muted inline-flex h-10 w-10 items-center justify-center rounded-[0.9rem] text-[var(--text-secondary)] transition hover:text-white md:hidden"
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
              className="surface-panel mt-3 rounded-[var(--radius-lg)] p-2 md:hidden"
              id="mobile-navigation"
            >
              <ul className="flex flex-col gap-1">
                {navigation.map((item) => {
                  const isActive = isActivePath(pathname, item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        className={[
                          "flex min-h-10 items-center rounded-[var(--radius-md)] px-4 text-sm font-medium transition",
                          isActive
                            ? "bg-[var(--bg-surface-strong)] text-white"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-white"
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
