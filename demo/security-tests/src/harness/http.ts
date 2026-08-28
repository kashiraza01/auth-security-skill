/** Thin fetch wrapper that records wall-clock time for each request. */

export interface TimedResponse {
  status: number;
  body: unknown;
  text: string;
  headers: Record<string, string>;
  /** milliseconds, measured around the fetch call with a high-resolution clock */
  ms: number;
  setCookie: string[];
}

export interface RequestOptions {
  method?: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  cookie?: string;
}

export class HttpClient {
  constructor(private readonly baseUrl: string) {}

  async request(opts: RequestOptions): Promise<TimedResponse> {
    const url = this.baseUrl.replace(/\/$/, "") + opts.path;
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let payload: string | undefined;
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(opts.body);
    }
    if (opts.cookie) headers["cookie"] = opts.cookie;

    const start = process.hrtime.bigint();
    const res = await fetch(url, { method: opts.method ?? "GET", headers, body: payload });
    const text = await res.text();
    const end = process.hrtime.bigint();

    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* leave as text */
    }

    const headerObj: Record<string, string> = {};
    res.headers.forEach((v, k) => (headerObj[k] = v));

    return {
      status: res.status,
      body,
      text,
      headers: headerObj,
      ms: Number(end - start) / 1e6,
      setCookie: res.headers.getSetCookie?.() ?? [],
    };
  }

  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<TimedResponse> {
    return this.request({ method: "POST", path, body, headers });
  }
  get(path: string, headers?: Record<string, string>): Promise<TimedResponse> {
    return this.request({ method: "GET", path, headers });
  }
}

export async function waitForHealth(baseUrl: string, timeoutMs = 20_000): Promise<boolean> {
  const client = new HttpClient(baseUrl);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await client.get("/api/health");
      if (res.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Fixed delay between samples so we are never the noisy neighbour. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
