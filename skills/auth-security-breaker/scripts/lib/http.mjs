// Timed HTTP client over the built-in fetch. Records wall-clock ms per request.
export class HttpClient {
  constructor(baseUrl) { this.baseUrl = baseUrl.replace(/\/$/, ""); }

  async request({ method = "GET", path, body, headers = {}, cookie }) {
    const h = { ...headers };
    let payload;
    if (body !== undefined) { h["content-type"] = "application/json"; payload = JSON.stringify(body); }
    if (cookie) h["cookie"] = cookie;
    const start = process.hrtime.bigint();
    const res = await fetch(this.baseUrl + path, { method, headers: h, body: payload });
    const text = await res.text();
    const end = process.hrtime.bigint();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }
    const headerObj = {};
    res.headers.forEach((v, k) => (headerObj[k] = v));
    return {
      status: res.status, body: parsed, text, headers: headerObj,
      ms: Number(end - start) / 1e6,
      setCookie: res.headers.getSetCookie ? res.headers.getSetCookie() : [],
    };
  }
  post(path, body, headers) { return this.request({ method: "POST", path, body, headers }); }
  get(path, headers) { return this.request({ method: "GET", path, headers }); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitForHealth(client, healthPath, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await client.get(healthPath); if (r.status >= 200 && r.status < 500) return true; } catch { /* not up */ }
    await sleep(400);
  }
  return false;
}

export function pickCookie(setCookies) {
  if (!setCookies || setCookies.length === 0) return undefined;
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}
