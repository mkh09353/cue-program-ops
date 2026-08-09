import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CalendarDays,
  Command,
  ContactRound,
  FileText,
  Home,
  LayoutGrid,
  Megaphone,
  Menu,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  api,
  ensurePersonaForRole,
  getPersona,
  getPersonaCatalog,
  restorePersonaFromSession,
  resolvePortalPersona,
  roleHome,
  setPersona,
  setPersonaCatalog,
  subscribePersona,
  switchToRole,
} from "../lib/api";
import { cn, EVENT_NAME, type Persona, type Role } from "../lib/utils";
import { Button } from "./ui";

function usePersona(): Persona {
  return useSyncExternalStore(subscribePersona, getPersona, getPersona);
}

function PersonaSwitcher({ lockRole }: { lockRole?: Role }) {
  const persona = usePersona();
  const [list, setList] = useState<Persona[]>(() => getPersonaCatalog());
  const nav = useNavigate();

  useEffect(() => {
    api
      .bootstrap()
      .then((r) => {
        const personas = (r.data.personas || []) as Persona[];
        if (personas.length) {
          setPersonaCatalog(personas);
          setList(personas);
          // Re-assert shell role after catalog loads (ids may differ slightly)
          if (lockRole) ensurePersonaForRole(lockRole);
        }
      })
      .catch(() => {});
  }, [lockRole]);

  const options = (list.length ? list : getPersonaCatalog()).filter((p) =>
    lockRole ? p.role === lockRole : true,
  );
  const shown = options.length ? options : [persona];
  const value = shown.some((p) => p.id === persona.id) ? persona.id : shown[0]?.id || persona.id;

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-mid">
      <span className="hidden sm:inline">Demo as</span>
      <select
        aria-label="Demo persona"
        className="h-9 max-w-[200px] rounded-[18px] border-0 bg-canvas px-2.5 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-ink"
        value={value}
        onChange={(e) => {
          const pool = list.length ? list : getPersonaCatalog();
          const p = pool.find((x) => x.id === e.target.value);
          if (!p) return;
          setPersona(p, { explicit: true });
          nav(roleHome(p.role));
        }}
      >
        {shown.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.role}
          </option>
        ))}
      </select>
    </label>
  );
}

function Brand({ subtitle = "Conference ops", compact = false }: { subtitle?: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="grid h-9 w-9 place-items-center rounded-[18px] bg-ink text-sm font-semibold text-soft"
        aria-hidden
      >
        C
      </div>
      {!compact ? (
        <div>
          <div className="text-sm font-semibold tracking-tight text-ink">CUE</div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-mid">{subtitle}</div>
        </div>
      ) : null}
    </div>
  );
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[18px] focus:bg-ink focus:px-3 focus:py-2 focus:text-soft"
    >
      Skip to content
    </a>
  );
}

function useRoleSync(role: Role) {
  const location = useLocation();
  const persona = usePersona();
  const [ready, setReady] = useState(false);
  // Rehydrate stored persona before any role gating so direct URL loads don't flash 403.
  // This never overrides an explicit selection (see resolvePortalPersona).
  resolvePortalPersona(role);
  useEffect(() => {
    restorePersonaFromSession();
    ensurePersonaForRole(role);
    setReady(true);
  }, [role, location.pathname]);
  // Portal pages are keyed on the persona id so every query refetches on switch.
  return { ready, personaKey: persona.id };
}

const orgNav = [
  { to: "/app", label: "Command", icon: Command, end: true },
  { to: "/app/submissions", label: "Submissions", icon: FileText },
  { to: "/app/evaluation-plan", label: "Evaluation Plan", icon: Sparkles },
  { to: "/app/assignments", label: "Assignments", icon: Users },
  { to: "/app/review-progress", label: "Review Progress", icon: LayoutGrid },
  { to: "/app/results", label: "Results", icon: FileText },
  { to: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/app/schedule#ai-agenda", label: "AI Agenda", icon: CalendarDays },
  { to: "/app/speakers", label: "Speakers", icon: Users },
  { to: "/app/crm", label: "Speaker CRM", icon: ContactRound },
  { to: "/app/content", label: "Content", icon: FileText },
  { to: "/app/comms", label: "Comms", icon: Megaphone },
  { to: "/app/publish", label: "Publish", icon: LayoutGrid },
  { to: "/app/forms", label: "Forms", icon: Sparkles },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function OrganizerShell() {
  const currentPersona = usePersona();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (currentPersona.role !== "organizer") {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="max-w-md rounded-[24px] border border-line bg-paper p-6 text-center shadow-card">
          <h1 className="text-xl font-semibold">Organizer access required</h1>
          <p className="mt-2 text-sm text-mid">
            You are signed in as <b>{currentPersona.name}</b> ({currentPersona.role}). Persona simulation does not
            auto-promote non-organizers into organizer mode — switch persona explicitly or return to your portal.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              onClick={() => {
                switchToRole("organizer");
                navigate("/app");
              }}
            >
              Switch to organizer persona
            </Button>
            <Button asChild variant="secondary">
              <a href={roleHome(currentPersona.role)}>Return to your portal</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }
  const nav = (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Organizer">
      {orgNav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-[18px] px-3 py-2 text-sm font-medium text-mid hover:bg-canvas hover:text-ink",
              isActive && "bg-ink text-soft hover:bg-ink hover:text-soft",
            )
          }
        >
          <item.icon className="h-4 w-4" aria-hidden />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SkipLink />
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-soft md:block">
          <div className="border-b border-line p-4">
            <Brand />
          </div>
          {nav}
          <div className="absolute bottom-0 left-0 right-0 border-t border-line p-3 text-[11px] text-mid">
            {EVENT_NAME} · in-memory demo
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="md:hidden">
                <Brand compact />
              </div>
              <div className="hidden text-sm text-mid sm:block">Organizer workspace</div>
            </div>
            <PersonaSwitcher />
          </header>
          <main id="main" className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-ink/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-soft shadow-card">
            <div className="flex items-center justify-between border-b border-line p-4">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ReviewerShell() {
  const { ready, personaKey } = useRoleSync("reviewer");
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-sm text-mid">
        Restoring reviewer session…
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-canvas">
      <SkipLink />
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Brand subtitle="Reviewer" />
          <nav className="flex gap-1 overflow-x-auto" aria-label="Reviewer">
            {[
              { to: "/r", label: "My queue", end: true },
              { to: "/r/done", label: "Completed" },
              { to: "/r/guidelines", label: "Guidelines" },
            ].map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-[18px] px-3 py-2 text-sm font-medium text-mid",
                    isActive && "bg-ink text-soft",
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <PersonaSwitcher lockRole="reviewer" />
      </header>
      <main id="main" className="mx-auto max-w-5xl p-4 sm:p-6" key={personaKey}>
        <Outlet />
      </main>
    </div>
  );
}

export function PortalShell() {
  const { ready, personaKey } = useRoleSync("speaker");
  const links = [
    { to: "/p", label: "Home", icon: Home, end: true },
    { to: "/p/talks", label: "Talks" },
    { to: "/p/tasks", label: "Tasks" },
    { to: "/p/deliverables", label: "Deliverables" },
    { to: "/p/resources", label: "Resources" },
    { to: "/p/profile", label: "Profile" },
  ];
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-sm text-mid">
        Restoring speaker session…
      </div>
    );
  }
  return (
    <div
      className="min-h-screen bg-canvas pb-20 md:pb-0"
      style={{ paddingBottom: "max(5rem, env(safe-area-inset-bottom))" }}
    >
      <SkipLink />
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Brand subtitle="Speaker portal" />
          <nav className="hidden gap-1 sm:flex" aria-label="Speaker portal">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn("rounded-[18px] px-3 py-2 text-sm font-medium text-mid", isActive && "bg-ink text-soft")
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <PersonaSwitcher lockRole="speaker" />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl p-4 sm:p-6" key={personaKey}>
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 z-10 grid grid-cols-6 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Speaker mobile"
      >
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              cn("py-3 text-center text-[11px] font-medium", isActive ? "text-ink" : "text-mid")
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PublicShell() {
  return (
    <div className="min-h-screen bg-canvas">
      <SkipLink />
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-mid">Call for speakers</div>
            <div className="text-base font-semibold tracking-tight text-ink">{EVENT_NAME}</div>
          </div>
          <a className="text-sm font-medium text-ink underline-offset-2 hover:underline" href="/p">
            Speaker portal
          </a>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl p-4 sm:p-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-center text-[11px] text-mid">
        Powered by CUE
      </footer>
    </div>
  );
}
