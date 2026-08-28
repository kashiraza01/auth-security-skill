import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
        SYS_SEC_LAB // DAY_07
      </p>
      <h1 className="text-3xl font-bold text-glow-cyan">
        Auth Security Skills Lab
      </h1>
      <p className="max-w-xl text-sm leading-relaxed text-zinc-400">
        The same MERN authentication code, two ways: one written the ordinary way,
        one audited by <code className="text-cyber-cyan">auth-security-breaker</code>{" "}
        and hardened by <code className="text-cyber-cyan">auth-security-hardener</code>.
        The comparison view runs the real audit and shows you what changed.
      </p>
      <Link
        href="/lab"
        className="w-fit border border-cyber-cyan/60 px-5 py-3 text-xs font-bold uppercase tracking-widest text-cyber-cyan transition hover:bg-cyber-cyan/10"
      >
        Open the lab →
      </Link>
    </main>
  );
}
