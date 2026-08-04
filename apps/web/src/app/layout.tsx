import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "../components/layout/Footer";
import { Navbar } from "../components/layout/Navbar";
import { Web3Provider } from "../providers/Web3Provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LibrARC | Arc Testnet Launchpad",
    template: "%s | LibrARC"
  },
  description:
    "Discover, launch, and monitor Arc Testnet tokens through a refined crypto-native interface.",
  icons: {
    icon: [
      {
        type: "image/png",
        url: "/librarc-logo.png"
      }
    ],
    shortcut: ["/librarc-logo.png"],
    apple: [
      {
        type: "image/png",
        url: "/librarc-logo.png"
      }
    ]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="app-shell flex min-h-screen flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] antialiased">
        <Web3Provider>
          <a
            className="skip-link absolute left-4 top-4 z-50 rounded-full bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-slate-950"
            href="#content"
          >
            Skip to content
          </a>
          <Navbar />
          <div className="relative flex flex-1 flex-col" id="content">
            {children}
          </div>
          <Footer />
        </Web3Provider>
      </body>
    </html>
  );
}
