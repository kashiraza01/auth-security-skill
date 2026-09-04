import Link from "next/link";
import { HudBackground, CrtOverlay } from "@/components/hud/CrtOverlay";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <HudBackground />
      <CrtOverlay />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
        <p className="hairline">SYS_SEC_LAB // DAY_07</p>
        <h1 className="display text-4xl text-glow-cyan">Auth Security Skills Lab</h1>
        <p className="max-w-xl text-sm leading-relaxed text-[var(--text-dim)]">
          The same MERN authentication code, two ways: one written the ordinary way, one audited by{" "}
          <code className="text-[var(--cyan)]">auth-security-breaker</code> and hardened by{" "}
          <code className="text-[var(--cyan)]">auth-security-hardener</code>. The comparison view runs the
          real audit and plots what changed.
        </p>
        <Link href="/lab" className="corner w-fit border border-[var(--cyan)]/60 px-5 py-3 text-xs font-bold uppercase tracking-widest text-[var(--cyan)] transition hover:bg-[var(--cyan)]/10">
          Open the lab →
        </Link>
      </div>
    </main>
  );
}
