import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "../components/layout/Footer";
import { Navbar } from "../components/layout/Navbar";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LibrARC | Crypto Launchpad",
    template: "%s | LibrARC"
  },
  description: "Responsive dark crypto launchpad interface built with the Next.js App Router."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-950 text-slate-100 antialiased">
        <a
          className="skip-link absolute left-4 top-4 z-50 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950"
          href="#content"
        >
          Skip to content
        </a>
        <Navbar />
        <div className="flex flex-1 flex-col" id="content">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
