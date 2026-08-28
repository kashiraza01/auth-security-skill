import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auth Security Skills Lab // Day 07",
  description:
    "Without Security Skill vs With Security Skill — the same MERN auth code, audited and hardened by two Claude Code skills.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
