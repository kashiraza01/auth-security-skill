import { HttpClient } from "../harness/http";
import type { Stack } from "../harness/finding";

export interface ProbeContext {
  http: HttpClient;
  stack: Stack;
  target: string;
  /** an account that exists with a known-correct password */
  known: { email: string; password: string; userId?: string; accessToken?: string };
  /** an account registered while asking for role:admin in the request body */
  adminAttempt: { email: string; password: string; accessToken?: string };
  /** an address that is definitely not registered */
  absentEmail: string;
  /** GET /api/_lab/config */
  config: {
    jwtAccessSecretIsDefault?: boolean;
    hardenedAccessTtl?: number;
    lockoutPolicy?: { MAX_FAILURES: number };
    [k: string]: unknown;
  };
  /** knobs (overridable via CLI) */
  opts: {
    timingSamples: number;
    timingWarmup: number;
    timingSleepMs: number;
    bruteforceAttempts: number;
  };
}

export type Probe = (ctx: ProbeContext) => Promise<import("../harness/finding").Finding[]>;

export const nowIso = () => new Date().toISOString();
