import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CalendarDays,
  Command,
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
  roleHome,
  setPersona,
  setPersonaCatalog,
  subscribePersona,
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
    <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
      <span className="hidden sm:inline">Demo as</span>
      <select
        aria-label="Demo persona"
        className="h-9 max-w-[200px] rounded-lg border border-stone-300 bg-white px-2 text-sm font-semibold text-ink"
        value={value}
        onChange={(e) => {
          const pool = list.length ? list : getPersonaCatalog();
          const p = pool.find((x) => x.id === e.target.value);
          if (!p) return;
          setPersona(p);
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
        className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-sm font-black text-lime"
        aria-hidden
      >
        C
      </div>
      {!compact ? (
        <div>
          <div className="text-sm font-bold tracking-tight">CUE</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">{subtitle}</div>
        </div>
      ) : null}
    </div>
  );
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-white"
    >
      Skip to content
    </a>
  );
}

function useRoleSync(role: Role) {
  const location = useLocation();
  // Imperative sync before paint of children that depend on headers
  ensurePersonaForRole(role);
  useEffect(() => {
    ensurePersonaForRole(role);
  }, [role, location.pathname]);
}

const orgNav = [
  { to: "/app", label: "Command", icon: Command, end: true },
  { to: "/app/submissions", label: "Submissions", icon: FileText },
  { to: "/app/evaluation-plan", label: "Evaluation Plan", icon: Sparkles },
  { to: "/app/assignments", label: "Assignments", icon: Users },
  { to: "/app/review-progress", label: "Review Progress", icon: LayoutGrid },
  { to: "/app/results", label: "Results", icon: FileText },
  { to: "/app/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/app/speakers", label: "Speakers", icon: Users },
  { to: "/app/comms", label: "Comms", icon: Megaphone },
  { to: "/app/publish", label: "Publish", icon: LayoutGrid },
  { to: "/app/forms", label: "Forms", icon: Sparkles },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function OrganizerShell() {
  useRoleSync("organizer");
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Organizer">
      {orgNav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100",
              isActive && "bg-ink text-white hover:bg-ink",
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
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-stone-200 bg-white/90 md:block">
          <div className="border-b border-stone-200 p-4">
            <Brand />
          </div>
          {nav}
          <div className="absolute bottom-0 left-0 right-0 border-t border-stone-200 p-3 text-[11px] text-stone-500">
            {EVENT_NAME} · in-memory demo
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-stone-200 bg-canvas/90 px-4 py-3 backdrop-blur">
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
              <div className="hidden text-sm text-stone-500 sm:block">Organizer workspace</div>
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
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
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
  useRoleSync("reviewer");
  return (
    <div className="min-h-screen bg-canvas">
      <SkipLink />
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur">
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
                    "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-stone-600",
                    isActive && "bg-ink text-white",
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
      <main id="main" className="mx-auto max-w-5xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}

export function PortalShell() {
  useRoleSync("speaker");
  const links = [
    { to: "/p", label: "Home", icon: Home, end: true },
    { to: "/p/talks", label: "Talks" },
    { to: "/p/tasks", label: "Tasks" },
    { to: "/p/resources", label: "Resources" },
    { to: "/p/profile", label: "Profile" },
  ];
  return (
    <div
      className="min-h-screen bg-canvas pb-20 md:pb-0"
      style={{ paddingBottom: "max(5rem, env(safe-area-inset-bottom))" }}
    >
      <SkipLink />
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Brand subtitle="Speaker portal" />
          <nav className="hidden gap-1 sm:flex" aria-label="Speaker portal">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn("rounded-lg px-3 py-2 text-sm font-semibold text-stone-600", isActive && "bg-ink text-white")
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <PersonaSwitcher lockRole="speaker" />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl p-4 sm:p-6">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-0 right-0 z-10 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Speaker mobile"
      >
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              cn("py-3 text-center text-[11px] font-bold", isActive ? "text-iris" : "text-stone-500")
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
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-iris">Call for speakers</div>
            <div className="text-base font-bold tracking-tight">{EVENT_NAME}</div>
          </div>
          <a className="text-sm font-semibold text-iris underline-offset-2 hover:underline" href="/p">
            Speaker portal
          </a>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl p-4 sm:p-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-center text-[11px] text-stone-400">
        Powered by CUE
      </footer>
    </div>
  );
}
