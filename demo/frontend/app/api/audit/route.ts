import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 300;

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

/**
 * Runs the real adversarial auditor (demo/security-tests) against both stacks and
 * streams its stdout back line-by-line. The final line is
 * `@@REPORT@@{...docs/findings.json...}` so the client can render the findings.
 *
 * Everything the UI shows about findings comes from this run — no hardcoded
 * numbers anywhere.
 */
export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(line + "\n"));

      send("$ npm run audit  (demo/security-tests → both stacks)");

      // Spawn via the workspace script so we never reference tsx/esbuild in the
      // Next bundle. shell:true so `npm` resolves to npm.cmd on Windows.
      const child = spawn("npm", ["run", "audit", "--", "--samples=40"], {
        cwd: path.join(REPO_ROOT, "demo", "security-tests"),
        env: { ...process.env },
        shell: true,
      });

      let carry = "";
      const onChunk = (buf: Buffer) => {
        carry += buf.toString();
        const lines = carry.split("\n");
        carry = lines.pop() ?? "";
        for (const l of lines) send(l);
      };
      child.stdout.on("data", onChunk);
      child.stderr.on("data", onChunk);

      child.on("close", async (code) => {
        if (carry.trim()) send(carry);
        try {
          const raw = await readFile(path.join(REPO_ROOT, "docs", "findings.json"), "utf8");
          send("@@REPORT@@" + raw.replace(/\s*\n\s*/g, " "));
        } catch (e) {
          send(`(could not read docs/findings.json: ${String(e)})`);
        }
        send(`\n[auditor exited with code ${code}]`);
        controller.close();
      });
      child.on("error", (e) => {
        send(`failed to start auditor: ${String(e)}`);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
