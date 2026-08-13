import { useSyncExternalStore } from "react";
import type { Role } from "./utils";

/**
 * SPA client for CUE's real cookie-backed session auth (`cue_session`).
 *
 * This is deliberately separate from the demo persona headers in `api.ts`:
 * session identity is authoritative when a session exists, while persona
 * simulation stays available for the credential-free demo. Every call sends
 * `credentials: "include"` so the HttpOnly session cookie rides along.
 */

export interface SessionUser { id: string; name: string; email: string }
export interface SessionRoleHint { role: Role; personaId?: string; speakerId?: string }
export interface SessionInfo {
  user: SessionUser;
  orgMemberships: { userId: string; orgId: string; role: string }[];
  eventRoles: { userId: string; eventId: string; role: Role }[];
  roleHints: SessionRoleHint[];
}

export type SessionStatus = "unknown" | "loading" | "authenticated" | "anonymous";

let session: SessionInfo | null = null;
let status: SessionStatus = "unknown";
let inFlight: Promise<SessionInfo | null> | null = null;
const listeners = new Set<() => void>();
/** Cached snapshot: useSyncExternalStore requires a stable object identity. */
let snapshot: { status: SessionStatus; session: SessionInfo | null } = { status, session };

const notify = () => {
  snapshot = { status, session };
  for (const fn of listeners) fn();
};

export const getSessionSnapshot = () => snapshot;
export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function setSession(next: SessionInfo | null) {
  session = next;
  status = next ? "authenticated" : "anonymous";
  notify();
}

async function call<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    // Same-origin cookies are sent by default; explicit for clarity and for any
    // future cross-origin deployment of the SPA.
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers as Record<string, string>) },
  });
  const text = await r.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!r.ok) {
    const msg = data?.error?.message || data?.error || r.statusText || "Request failed";
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data as T;
}

/**
 * Load (or reload) the signed-in user. A 401 is the normal "no session" answer
 * and resolves to null rather than throwing, so shells never show an error for
 * the credential-free demo.
 */
export function refreshSession(): Promise<SessionInfo | null> {
  if (inFlight) return inFlight;
  if (status === "unknown") { status = "loading"; notify(); }
  inFlight = call<{ data: SessionInfo }>("/api/auth/me")
    .then((r) => { setSession(r.data || null); return session; })
    .catch(() => { setSession(null); return null; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Read the session in a component; kicks off the one-time /api/auth/me load. */
export function useSession() {
  const snap = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  if (snap.status === "unknown") void refreshSession();
  return snap;
}

/** Where a signed-in user should land, from their strongest role hint. */
export function sessionHome(info: SessionInfo | null): string {
  const roles = [
    ...(info?.roleHints || []).map((h) => h.role),
    ...(info?.eventRoles || []).map((r) => r.role),
  ];
  if (roles.includes("organizer")) return "/app";
  if (roles.includes("reviewer")) return "/r";
  if (roles.includes("speaker")) return "/p";
  // An account with no event role yet still owns an organization: /app is its home.
  return "/app";
}

export const authApi = {
  me: () => call<{ data: SessionInfo }>("/api/auth/me"),
  signup: (body: { name: string; email: string; password: string }) =>
    call<{ data: { user: SessionUser; organization: { id: string; name: string } } }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    call<{ data: { user: SessionUser } }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => call<{ data: { loggedOut: boolean } }>("/api/auth/logout", { method: "POST", body: "{}" }),
  /** Mock-mailer demo mode also returns an explicitly demo-only sign-in URL. */
  magicLink: (email: string) =>
    call<{ data: { accepted: boolean; delivery?: string; demoOnlyLoginUrl?: string; loginUrl?: string; demoOnly?: boolean } }>(
      "/api/auth/magic-link",
      { method: "POST", body: JSON.stringify({ email }) },
    ),
  consumeMagicLink: (token: string) =>
    call<{ data: { user: SessionUser } }>("/api/auth/magic-link/consume", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  /** One-click demo session; returns the shell to land in ("/app", "/r", "/p"). */
  demo: (persona: "organizer" | "reviewer" | "speaker") =>
    call<{ data: { target: string } }>(`/api/auth/demo/${persona}`),
};

/** Sign out and forget the cached session (callers navigate to /login). */
export async function signOut(): Promise<void> {
  try { await authApi.logout(); } finally { setSession(null); }
}

/** Adopt a fresh session after login/signup/magic-link; returns the landing path. */
export async function adoptSession(preferredTarget?: string): Promise<string> {
  const info = await refreshSession();
  return preferredTarget || sessionHome(info);
}

/** Test/demo hook: drop cached state so a fresh /api/auth/me is issued. */
export function resetSessionCache() {
  session = null;
  status = "unknown";
  inFlight = null;
  notify();
}
