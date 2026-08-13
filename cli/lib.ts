/**
 * Ruckus CLI runtime helpers.
 *
 * Node built-ins only: the worker bundle must gain zero runtime dependencies, and
 * the CLI must run from a clean checkout with `npx tsx cli/cue.ts`.
 */

export const DEFAULT_URL = "https://cue-program-ops.headley-max.workers.dev";
export const DEFAULT_EVENT = "evt-ai-summit-2026";

export type Flags = Record<string, string | boolean | string[]>;

/** Parsed argv: positional words plus --flags (repeatable flags become arrays). */
export function parseArgs(argv: string[]): { words: string[]; flags: Flags } {
  const words: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s);
    const key = String(rawKey);
    const next = argv[i + 1];
    const value = inlineValue !== undefined ? inlineValue : next && !next.startsWith("--") ? (i++, next) : true;
    const existing = flags[key];
    if (existing === undefined) flags[key] = value;
    else if (Array.isArray(existing)) existing.push(String(value));
    else flags[key] = [String(existing), String(value)];
  }
  return { words, flags };
}

export const flagStr = (flags: Flags, name: string, fallback = ""): string => {
  const value = flags[name];
  if (value === undefined) return fallback;
  if (Array.isArray(value)) return value[value.length - 1] ?? fallback;
  return typeof value === "boolean" ? (value ? "true" : fallback) : value;
};

export const flagList = (flags: Flags, name: string): string[] => {
  const value = flags[name];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [String(value)]).filter((v) => v !== "true");
};

export const flagBool = (flags: Flags, name: string): boolean => Boolean(flags[name]);

export interface Config {
  url: string;
  event: string;
  role: string;
  persona: string;
  json: boolean;
}

export function resolveConfig(flags: Flags, env: NodeJS.ProcessEnv = process.env): Config {
  const url = (flagStr(flags, "url") || env.RUCKUS_URL || DEFAULT_URL).replace(/\/+$/, "");
  return {
    url,
    event: flagStr(flags, "event") || env.RUCKUS_EVENT || DEFAULT_EVENT,
    role: flagStr(flags, "role") || env.RUCKUS_ROLE || "organizer",
    persona: flagStr(flags, "persona") || env.RUCKUS_PERSONA || "org-swyx",
    json: flagBool(flags, "json"),
  };
}

/** Thrown for any non-2xx response; carries the server message and status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const messageFrom = (body: unknown, fallback: string): string => {
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 500);
  if (body && typeof body === "object") {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof (error as { message?: string }).message === "string") {
      return (error as { message: string }).message;
    }
  }
  return fallback;
};

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Override demo identity for this call (speaker/reviewer flows). */
  persona?: string;
  role?: string;
  /** Return raw text instead of parsed JSON (CSV, ICS, HTML). */
  raw?: boolean;
  headers?: Record<string, string>;
}

export async function api<T = any>(config: Config, path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const url = path.startsWith("http") ? path : `${config.url}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-demo-role": options.role ?? config.role,
    "x-demo-persona": options.persona ?? config.persona,
    "x-cue-event": config.event,
    ...(options.headers || {}),
  };
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    throw new ApiError(
      `could not reach ${config.url} (${cause instanceof Error ? cause.message : "network error"})`,
      0,
    );
  }
  const text = await response.text();
  let parsed: unknown = text;
  if (!options.raw && text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) throw new ApiError(messageFrom(parsed, `${method} ${path} failed with ${response.status}`), response.status, parsed);
  return (options.raw ? text : parsed) as T;
}

/** Unwrap the standard { data } envelope. */
export const data = <T = any>(payload: any): T => (payload && typeof payload === "object" && "data" in payload ? payload.data : payload);

// —— output ——————————————————————————————————————————————

export const out = (line = "") => process.stdout.write(`${line}\n`);

export function printJson(value: unknown) {
  out(JSON.stringify(value, null, 2));
}

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(cell).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\s+/g, " ").trim();
};

/** Compact fixed-width table; long values are truncated so rows stay one line. */
export function printTable(rows: Record<string, unknown>[], columns?: string[], max = 46) {
  if (!rows.length) {
    out("(none)");
    return;
  }
  const keys = columns && columns.length ? columns : [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const trim = (value: string) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
  const table = rows.map((row) => keys.map((key) => trim(cell(row[key]))));
  const widths = keys.map((key, i) => Math.max(key.length, ...table.map((row) => row[i]!.length)));
  out(keys.map((key, i) => key.toUpperCase().padEnd(widths[i]!)).join("  "));
  out(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of table) out(row.map((value, i) => value.padEnd(widths[i]!)).join("  "));
}

export function printKeyValues(pairs: Record<string, unknown>) {
  const keys = Object.keys(pairs);
  const width = Math.max(...keys.map((k) => k.length), 0);
  for (const key of keys) out(`${key.padEnd(width)}  ${cell(pairs[key])}`);
}

export const heading = (title: string) => {
  out();
  out(title.toUpperCase());
  out("=".repeat(Math.max(title.length, 8)));
};

/** Emit either machine JSON or a human rendering, per --json. */
export function emit(config: Config, payload: unknown, human: () => void) {
  if (config.json) printJson(payload);
  else human();
}

/** Parse repeated --field key=value pairs. */
export function parseFields(values: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const entry of values) {
    const [key, ...rest] = entry.split("=");
    if (!key || !rest.length) throw new ApiError(`--field expects key=value, received "${entry}"`, 0);
    fields[key] = rest.join("=");
  }
  return fields;
}

/** Local wall-clock day+time to a UTC instant, matching the event timezone. */
export function toInstant(day: string, time: string, timezone: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !date || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new ApiError(`could not read --day "${day}" --time "${time}" (expected YYYY-MM-DD and HH:MM)`, 0);
  }
  // Two-pass zone resolution: guess UTC, measure the zone offset, correct.
  const guess = Date.UTC(year, month - 1, date, hour, minute, 0);
  const offset = zoneOffsetMs(guess, timezone);
  const corrected = guess - offset;
  const check = zoneOffsetMs(corrected, timezone);
  return new Date(check === offset ? corrected : guess - check).toISOString();
}

function zoneOffsetMs(instant: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant;
}

/** Format an instant in the event timezone as YYYY-MM-DD HH:MM. */
export function inZone(iso: string | undefined, timezone: string): string {
  if (!iso) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

export const dayOf = (iso: string | undefined, timezone: string): string => inZone(iso, timezone).slice(0, 10);
