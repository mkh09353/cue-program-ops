// `React` is imported by name (as in components/ui.tsx) so these components also
// render under the classic JSX runtime used by the node test runner.
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Field, Input, Notice, Spinner, toast } from "../components/ui";
import { authApi, refreshSession, sessionHome, useSession, type SessionInfo } from "../lib/auth";
import { switchToRole } from "../lib/api";
import type { Role } from "../lib/utils";

/**
 * Sign-in / sign-up screens for Ruckus's real cookie session auth.
 *
 * The demo buttons are the fast path an evaluator (or a first-time visitor) can
 * take without credentials: one request creates a real server session and hands
 * back the shell to land in. Password and magic-link sign-in use the same
 * session cookie.
 */

export const DEMO_ROLES = [
  {
    role: "organizer" as const,
    label: "Enter as Organizer",
    who: "Dana · dana@demo.ruckus.to",
    blurb: "Command center, submissions, review rounds, speakers, schedule, publish.",
    target: "/app",
  },
  {
    role: "reviewer" as const,
    label: "Enter as Reviewer",
    who: "Rey · rey@demo.ruckus.to",
    blurb: "Assigned queue, weighted scorecards, recusal, guidelines.",
    target: "/r",
  },
  {
    role: "speaker" as const,
    label: "Enter as Speaker",
    who: "Maya · maya@demo.ruckus.to",
    blurb: "Profile, onboarding tasks, deliverables, talks, calendar.",
    target: "/p",
  },
];

/** Only these three personas have server-side demo sessions. */
export function parseDemoRole(value: string | null): Role | null {
  const raw = String(value || "").toLowerCase();
  return raw === "organizer" || raw === "reviewer" || raw === "speaker" ? (raw as Role) : null;
}

function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <Link to="/" className="mb-6 flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">C</span>
          Ruckus · Conference program ops
        </Link>
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-2 text-sm text-mid">{subtitle}</p>
          {children}
        </Card>
        {footer ? <div className="mt-4 text-center text-sm text-mid">{footer}</div> : null}
      </div>
    </div>
  );
}

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, status } = useSession();
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [magic, setMagic] = useState<{ delivery?: string; loginUrl?: string } | null>(null);
  const autoRan = useRef(false);

  const demoParam = parseDemoRole(params.get("demo"));
  const token = params.get("token") || "";
  const next = params.get("next") || "";

  // Session identity wins, but the shells still speak demo-persona headers, so
  // align the persona with the session's role before landing. Without this an
  // organizer arriving by magic link could hit the "organizer access required"
  // gate because a speaker persona was still selected.
  const land = (info: SessionInfo | null, preferred?: string) => {
    const role = info?.roleHints?.[0]?.role || info?.eventRoles?.[0]?.role;
    if (role) switchToRole(role, info?.roleHints?.[0]?.speakerId);
    const target = preferred || next || sessionHome(info);
    navigate(target);
  };

  const enterDemo = async (role: Role) => {
    setError("");
    setBusy(`demo-${role}`);
    try {
      const r = await authApi.demo(role as "organizer" | "reviewer" | "speaker");
      const info = await refreshSession();
      // Keep the demo persona headers aligned with the session role so the shells
      // (which still support header-only demo mode) do not gate the new session out.
      switchToRole(role);
      toast(`Signed in as the demo ${role}`);
      land(info, r.data?.target);
    } catch (e: any) {
      setError(e?.message || `Could not start the demo ${role} session`);
    } finally {
      setBusy("");
    }
  };

  // /login?demo=organizer|reviewer|speaker enters that shell straight away, and
  // /login?token=… consumes a magic link. Both run once per mount.
  useEffect(() => {
    if (autoRan.current) return;
    if (token) {
      autoRan.current = true;
      setBusy("token");
      authApi
        .consumeMagicLink(token)
        .then(async () => {
          const info = await refreshSession();
          toast("Signed in with your magic link");
          land(info);
        })
        .catch((e: any) => setError(e?.message || "That magic link is invalid or expired"))
        .finally(() => setBusy(""));
      return;
    }
    if (demoParam) {
      autoRan.current = true;
      void enterDemo(demoParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, demoParam]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy("password");
    try {
      await authApi.login({ email: email.trim(), password });
      const info = await refreshSession();
      toast("Signed in");
      land(info);
    } catch (err: any) {
      setError(err?.message || "Invalid email or password");
    } finally {
      setBusy("");
    }
  };

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy("magic");
    setMagic(null);
    try {
      const r = await authApi.magicLink(magicEmail.trim());
      setMagic({
        delivery: r.data?.delivery,
        loginUrl: r.data?.demoOnlyLoginUrl || r.data?.loginUrl,
      });
    } catch (err: any) {
      setError(err?.message || "Could not send a sign-in link");
    } finally {
      setBusy("");
    }
  };

  return (
    <AuthLayout
      title="Sign in to Ruckus"
      subtitle="Real server sessions (HttpOnly cookie). Start with one click as a demo user, or sign in with your own account."
      footer={
        <>
          New here?{" "}
          <Link className="font-semibold text-ink underline" to="/signup">
            Create an account
          </Link>{" "}
          · <Link className="font-semibold text-ink underline" to="/demo">Browse the demo launcher</Link>
        </>
      }
    >
      {status === "authenticated" && session ? (
        <Notice tone="ok">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Already signed in as <b>{session.user.name}</b> ({session.user.email}).
            </span>
            <Button size="sm" variant="secondary" onClick={() => land(session)}>
              Continue
            </Button>
          </div>
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {busy === "token" ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-mid" role="status">
          <Spinner /> Consuming your magic link…
        </div>
      ) : null}

      <section className="mt-6" aria-labelledby="demo-entry">
        <h2 id="demo-entry" className="text-xs font-medium uppercase tracking-wide text-mid">
          One-click demo access
        </h2>
        <p className="mt-1 text-sm text-mid">
          Creates a real session for a seeded demo user — no password required.
        </p>
        <div className="mt-3 grid gap-2">
          {DEMO_ROLES.map((d) => (
            <Button
              key={d.role}
              data-testid={`demo-login-${d.role}`}
              className="h-auto w-full justify-start px-4 py-3 text-left"
              disabled={!!busy}
              onClick={() => void enterDemo(d.role)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">
                  {busy === `demo-${d.role}` ? "Signing in…" : d.label}
                </span>
                <span className="text-xs font-normal opacity-80">{d.who} · {d.blurb}</span>
              </span>
            </Button>
          ))}
        </div>
      </section>

      <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wide text-mid">
        <span className="h-px flex-1 bg-line" /> or sign in with your account <span className="h-px flex-1 bg-line" />
      </div>

      <form className="grid gap-3" onSubmit={signIn} aria-label="Email and password sign-in">
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            data-testid="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            data-testid="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </Field>
        <div>
          <Button type="submit" data-testid="login-submit" disabled={busy === "password"}>
            {busy === "password" ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>

      <section className="mt-8 rounded-2xl border border-line bg-soft p-4" aria-labelledby="magic-link">
        <h2 id="magic-link" className="text-sm font-semibold text-ink">
          Prefer no password?
        </h2>
        <p className="mt-1 text-sm text-mid">
          We email a one-time sign-in link that expires in 15 minutes.
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={sendMagicLink} aria-label="Magic link request">
          <div className="min-w-[220px] flex-1">
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                data-testid="magic-email"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                placeholder="dana@demo.ruckus.to"
                required
              />
            </Field>
          </div>
          <Button type="submit" variant="secondary" data-testid="magic-submit" disabled={busy === "magic"}>
            {busy === "magic" ? "Sending…" : "Email me a magic link"}
          </Button>
        </form>
        {magic ? (
          <div className="mt-3 text-sm" data-testid="magic-result" role="status" aria-live="polite">
            <p className="text-mid">
              If that address has an account, a sign-in link is on its way
              {magic.delivery ? (
                <>
                  {" "}
                  · <Badge tone={magic.delivery === "mock_sent" ? "muted" : "ok"}>
                    {magic.delivery === "mock_sent" ? "mock mailer" : magic.delivery}
                  </Badge>
                </>
              ) : null}
              .
            </p>
            {magic.loginUrl ? (
              <p className="mt-2">
                <Badge tone="warn">Demo mode convenience</Badge>{" "}
                <span className="text-mid">
                  no real email was delivered, so the link is shown here:
                </span>{" "}
                <a className="break-all font-semibold text-ink underline" data-testid="magic-login-url" href={magic.loginUrl}>
                  {magic.loginUrl}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </AuthLayout>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await authApi.signup({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      const info = await refreshSession();
      switchToRole("organizer");
      toast("Account created — welcome to Ruckus");
      navigate(sessionHome(info));
    } catch (err: any) {
      setError(err?.message || "Could not create the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your Ruckus account"
      subtitle="You get an organization and an organizer session. This open-source demo stores identity in process memory and snapshots — do not reuse a real password."
      footer={
        <>
          Already have an account?{" "}
          <Link className="font-semibold text-ink underline" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <form className="mt-6 grid gap-3" onSubmit={submit} aria-label="Create account">
        <Field label="Name">
          <Input
            data-testid="signup-name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ada Lovelace"
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            data-testid="signup-email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="Password" hint="At least 10 characters.">
          <Input
            type="password"
            data-testid="signup-password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            minLength={10}
            required
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" data-testid="signup-submit" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </Button>
          <Link className="text-sm font-semibold text-ink underline" to="/login?demo=organizer">
            or enter the organizer demo
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
