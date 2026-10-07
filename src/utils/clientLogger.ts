// Dev-only client-side logger for the Taruvi hackathon template.
//
// Captures: console.error, window.error, unhandledrejection, fetch failures,
// XHR failures, and manual error-boundary reports. Buffers entries and ships
// them to the Vite dev server's /__client_log middleware, which appends them
// to logs/frontend.ndjson so AI agents can read what went wrong in the user's
// browser without the user needing to open DevTools.
//
// Guarantees:
// - Runs only in dev (import.meta.env.DEV).
// - Installed exactly once per window, survives HMR and React StrictMode.
// - The shipper's own POST cannot recurse through the fetch wrapper.
// - All capture sites are wrapped in try/catch; logging can never crash the app.

import { redactSensitive, redactText } from './redaction';

export type LogSource =
  | "console-error"
  | "window-error"
  | "unhandled-rejection"
  | "network-error"
  | "react-error-boundary"
  | "manual";

export type LogEntry = {
  id: number;
  timestamp: string;
  source: LogSource;
  text: string;
  meta?: Record<string, unknown>;
};

const ENDPOINT = "/__client_log";
const LOG_HEADER = "x-tv-client-log";
const MAX_ENTRIES = 200;
const MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 1000;
const SESSION_STORAGE_KEY = "__tv_client_log_sid";

type Store = {
  entries: LogEntry[];
  listeners: Set<() => void>;
  nextId: number;
};

const INSTALL_FLAG = "__tv_client_logger_installed__";
const ENABLE_LOGGER = (): boolean => {
  try {
    return import.meta.env.VITE_ENABLE_CLIENT_LOGGER === "true";
  } catch {
    return false;
  }
};

const store: Store = {
  entries: [],
  listeners: new Set(),
  nextId: 1,
};

const queue: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedSessionId = "";
let originalFetch: typeof fetch | null = null;
let lastBoundaryAt = 0;

export const getLastBoundaryAt = (): number => lastBoundaryAt;

const isDev = (): boolean => {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
};

const notify = () => {
  store.listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* swallow subscriber errors */
    }
  });
};

export const subscribe = (listener: () => void): (() => void) => {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
};

export const getSnapshot = (): LogEntry[] => store.entries;

export const clearEntries = (): void => {
  store.entries = [];
  notify();
};

const serializeValue = (value: unknown, seen = new WeakSet<object>()): string => {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") return value;
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.toString();
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return String(value);

  if (typeof Element !== "undefined" && value instanceof Element) {
    const attrs = Array.from(value.attributes)
      .map((a) => `${a.name}="${a.value}"`)
      .join(" ");
    return `<${value.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ""}>`;
  }

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  try {
    return JSON.stringify(
      value,
      (_key, nested) => {
        if (nested instanceof Error) {
          return { name: nested.name, message: nested.message, stack: nested.stack };
        }
        if (typeof nested === "bigint") return `${nested.toString()}n`;
        if (typeof nested === "function") return `[Function ${nested.name || "anonymous"}]`;
        if (typeof nested === "symbol") return nested.toString();
        if (nested && typeof nested === "object") {
          if (seen.has(nested as object)) return "[Circular]";
          seen.add(nested as object);
        }
        return nested;
      },
      2,
    );
  } catch {
    return Object.prototype.toString.call(value);
  }
};

const getSessionId = (): string => {
  if (cachedSessionId) return cachedSessionId;
  const generated = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      cachedSessionId = existing;
      return cachedSessionId;
    }
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
  } catch {
    /* sessionStorage may be unavailable (private mode, sandboxed iframe) */
  }
  cachedSessionId = generated;
  return cachedSessionId;
};

const getAppSlug = (): string => {
  try {
    return typeof __TARUVI_APP_SLUG__ === "string" ? __TARUVI_APP_SLUG__ : "";
  } catch {
    return "";
  }
};

const record = (source: LogSource, values: unknown[], meta?: Record<string, unknown>): void => {
  try {
    const text = values
      .map((v) => redactText(serializeValue(redactSensitive(v))))
      .filter((s) => s.length > 0)
      .join(" ");

    const entry: LogEntry = {
      id: store.nextId++,
      timestamp: new Date().toISOString(),
      source,
      text,
      meta: redactSensitive(meta) as Record<string, unknown> | undefined,
    };

    if (source === "react-error-boundary") {
      lastBoundaryAt = Date.now();
    }

    store.entries =
      store.entries.length >= MAX_ENTRIES
        ? [...store.entries.slice(-(MAX_ENTRIES - 1)), entry]
        : [...store.entries, entry];
    notify();

    queue.push(entry);
    if (queue.length >= MAX_BATCH) {
      flush(false);
    } else if (flushTimer === null) {
      flushTimer = setTimeout(() => flush(false), FLUSH_INTERVAL_MS);
    }
  } catch {
    /* capture must never throw */
  }
};

const buildPayload = (batch: LogEntry[]): string => {
  const sessionId = getSessionId();
  const appSlug = getAppSlug();
  const url = typeof location !== "undefined" ? redactText(location.href) : "";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

  return JSON.stringify(
    batch.map((entry) => ({
      ...entry,
      session_id: sessionId,
      app_slug: appSlug,
      page_url: url,
      user_agent: userAgent,
    })),
  );
};

const flush = (viaBeacon: boolean): void => {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  const batch = queue.splice(0, queue.length);
  let body: string;
  try {
    body = buildPayload(batch);
  } catch {
    return;
  }

  try {
    if (viaBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }

    const fetcher = originalFetch ?? window.fetch.bind(window);
    fetcher(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [LOG_HEADER]: "1",
      },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      /* dev server might be restarting; drop the batch silently */
    });
  } catch {
    /* never let the shipper throw */
  }
};

const hasLogMarker = (headers: HeadersInit | undefined): boolean => {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has(LOG_HEADER);
  if (Array.isArray(headers)) return headers.some(([k]) => k?.toLowerCase() === LOG_HEADER);
  return Object.keys(headers as Record<string, string>).some((k) => k.toLowerCase() === LOG_HEADER);
};

const resolveUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

const resolveMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
};

const patchFetch = (): void => {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = resolveUrl(input);
    const method = resolveMethod(input, init);

    // never log our own shipping requests
    if (url.includes(ENDPOINT) || hasLogMarker(init?.headers)) {
      return originalFetch!(input, init);
    }

    try {
      const res = await originalFetch!(input, init);
      if (!res.ok) {
        record(
          "network-error",
          [`${method} ${url} -> ${res.status} ${res.statusText}`],
          { method, url, status: res.status, status_text: res.statusText },
        );
      }
      return res;
    } catch (err) {
      record("network-error", [`${method} ${url} failed`, err], { method, url });
      throw err;
    }
  };
};

const patchXhr = (): void => {
  if (typeof XMLHttpRequest === "undefined") return;
  const OriginalOpen = XMLHttpRequest.prototype.open;
  const OriginalSend = XMLHttpRequest.prototype.send;

  type TrackedXhr = XMLHttpRequest & { __tv_url?: string; __tv_method?: string };

  XMLHttpRequest.prototype.open = function (
    this: TrackedXhr,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    this.__tv_method = method.toUpperCase();
    this.__tv_url = typeof url === "string" ? url : url.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (OriginalOpen as any).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function (
    this: TrackedXhr,
    ...args: [body?: Document | XMLHttpRequestBodyInit | null]
  ) {
    const url = this.__tv_url ?? "";
    const method = this.__tv_method ?? "GET";

    if (!url.includes(ENDPOINT)) {
      this.addEventListener("loadend", () => {
        try {
          if (this.status === 0) {
            record(
              "network-error",
              [`${method} ${url} aborted or network failure (status 0)`],
              { method, url, status: 0 },
            );
          } else if (this.status >= 400) {
            record(
              "network-error",
              [`${method} ${url} -> ${this.status} ${this.statusText}`],
              { method, url, status: this.status, status_text: this.statusText },
            );
          }
        } catch {
          /* ignore */
        }
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (OriginalSend as any).apply(this, args);
  } as typeof XMLHttpRequest.prototype.send;
};

const patchConsole = (): void => {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    record("console-error", args);
    original.apply(console, args.map(value => redactSensitive(value)));
  };
};

export const installClientLogger = (): void => {
  if (typeof window === "undefined") return;
  if (!isDev()) return;
  if (!ENABLE_LOGGER()) return;
  const w = window as unknown as Record<string, unknown>;
  if (w[INSTALL_FLAG]) return;
  w[INSTALL_FLAG] = true;

  try {
    patchConsole();
  } catch {
    /* ignore */
  }
  try {
    patchFetch();
  } catch {
    /* ignore */
  }
  try {
    patchXhr();
  } catch {
    /* ignore */
  }

  window.addEventListener("error", (event) => {
    record("window-error", [
      event.message,
      event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : "",
      event.error ?? "",
    ]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    record("unhandled-rejection", ["Unhandled promise rejection", event.reason]);
  });

  const flushViaBeacon = () => flush(true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushViaBeacon();
  });
  window.addEventListener("pagehide", flushViaBeacon);
  window.addEventListener("beforeunload", flushViaBeacon);
};

export const reportError = (
  source: LogSource,
  values: unknown[],
  meta?: Record<string, unknown>,
): void => {
  if (!ENABLE_LOGGER() || !isDev()) return;
  record(source, values, meta);
};

// Auto-install on module load so importing this file as a side-effect
// from src/index.tsx runs before any other module initializes.
installClientLogger();
