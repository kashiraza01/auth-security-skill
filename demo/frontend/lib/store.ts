"use client";

import { create } from "zustand";
import type { AuditReport, Finding } from "./types";
import { CHECKS } from "./checks";

type AuditStatus = "idle" | "running" | "done" | "error";

interface LabState {
  activeCheck: string; // findingId
  setActiveCheck: (id: string) => void;

  source: Record<string, string>; // sourceKey -> file contents
  loadSource: (key: string) => Promise<void>;

  auditStatus: AuditStatus;
  auditLog: string[];
  report: AuditReport | null;
  runAudit: () => Promise<void>;

  findingFor: (findingId: string, stack: "baseline" | "hardened") => Finding | undefined;
}

export const useLab = create<LabState>((set, get) => ({
  activeCheck: CHECKS[0].findingId,
  setActiveCheck: (id) => set({ activeCheck: id }),

  source: {},
  loadSource: async (key) => {
    if (get().source[key]) return;
    try {
      const res = await fetch(`/api/source?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (data.content) set((s) => ({ source: { ...s.source, [key]: data.content } }));
      else set((s) => ({ source: { ...s.source, [key]: `// ${data.error ?? "unavailable"}` } }));
    } catch (e) {
      set((s) => ({ source: { ...s.source, [key]: `// failed to load: ${String(e)}` } }));
    }
  },

  auditStatus: "idle",
  auditLog: [],
  report: null,
  runAudit: async () => {
    set({ auditStatus: "running", auditLog: [], report: null });
    try {
      const res = await fetch("/api/audit", { method: "POST" });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("@@REPORT@@")) {
            const report = JSON.parse(line.slice("@@REPORT@@".length)) as AuditReport;
            set({ report });
          } else {
            set((s) => ({ auditLog: [...s.auditLog, line] }));
          }
        }
      }
      set({ auditStatus: get().report ? "done" : "error" });
    } catch (e) {
      set((s) => ({ auditStatus: "error", auditLog: [...s.auditLog, `error: ${String(e)}`] }));
    }
  },

  findingFor: (findingId, stack) =>
    get().report?.findings.find((f) => f.id === findingId && f.stack === stack),
}));
