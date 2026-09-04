import type { Metadata } from "next";
import { Orbitron, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", weight: ["500", "700", "900"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-hud", weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "Auth Security Skills Lab // Day 07",
  description:
    "Without Security Skill vs With Security Skill — the same MERN auth code, audited and hardened by two Claude Code skills.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${orbitron.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
