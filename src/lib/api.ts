/**
 * api.ts — Central API configuration for the FlowCAD backend.
 *
 * The backend base URL is read from VITE_API_URL (set in .env or injected
 * by Vercel/Lovable environment variables).
 *
 * Local dev:   VITE_API_URL=http://127.0.0.1:8000   (default)
 * Production:  set VITE_API_URL to your deployed backend URL
 *
 * NEVER hardcode http://127.0.0.1:8000 anywhere else in the codebase.
 * Import API_BASE from this module instead.
 */

export const API_BASE: string = (() => {
  // Vite exposes VITE_* vars through import.meta.env at build time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env as Record<string, string> | undefined;
  const fromEnv = env?.VITE_API_URL;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.replace(/\/$/, "");
  // Fallback for SSR / Jest where import.meta.env is unavailable
  return "http://127.0.0.1:8000";
})();

/** Maximum time in ms to wait for the health check (must be long enough for Render free tier cold starts) */
export const HEALTH_TIMEOUT_MS = 120_000;

/** Maximum time in ms to wait for the full pipeline (8 stages × ~30s each) */
export const GENERATE_TIMEOUT_MS = 5 * 60 * 1_000;

/**
 * A fetch wrapper that:
 *  - prepends API_BASE automatically
 *  - distinguishes between network failures ("can't reach server") and
 *    HTTP error responses ("server returned 4xx/5xx")
 *  - throws typed errors with a `kind` discriminator
 */
export class ApiNetworkError extends Error {
  readonly kind = "network" as const;
  constructor(url: string, cause?: unknown) {
    super(
      `Cannot reach FlowCAD backend at ${url}.\n` +
        `Make sure the backend is running:\n` +
        `  cd backend && uvicorn main:app --reload --port 8000\n` +
        (cause instanceof Error ? `\nBrowser detail: ${cause.message}` : ""),
    );
    this.name = "ApiNetworkError";
  }
}

export class ApiResponseError extends Error {
  readonly kind = "response" as const;
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    let detail = "";
    if (typeof body === "object" && body !== null) {
      const d = (body as Record<string, unknown>).detail;
      detail =
        d !== undefined ? (typeof d === "string" ? d : JSON.stringify(d)) : JSON.stringify(body);
    } else {
      detail = String(body);
    }

    super(`Backend returned ${status} ${statusText}: ${detail}`);
    this.name = "ApiResponseError";
  }
}

/**
 * Probes /health and returns true if the backend is reachable.
 * Never throws — returns false on any failure.
 */
export async function probeBackend(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    window.clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * POST to a backend endpoint with JSON body.
 * Throws ApiNetworkError or ApiResponseError — never a raw TypeError.
 */
export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ApiNetworkError(url, err);
  }
  if (!res.ok) {
    const raw = await res.json().catch(() => res.statusText);
    throw new ApiResponseError(res.status, res.statusText, raw);
  }
  return res.json() as Promise<T>;
}

/**
 * GET a backend endpoint.
 * Throws ApiNetworkError or ApiResponseError — never a raw TypeError.
 */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    throw new ApiNetworkError(url, err);
  }
  if (!res.ok) {
    const raw = await res.json().catch(() => res.statusText);
    throw new ApiResponseError(res.status, res.statusText, raw);
  }
  return res.json() as Promise<T>;
}
