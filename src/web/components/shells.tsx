import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  CalendarDays,
  ChevronDown,
  Command,
  ContactRound,
  FileText,
  Home,
  LayoutGrid,
  Megaphone,
  Menu,
  Plus,
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
  hasPersonaForRole,
  resolvePortalPersona,
  roleHome,
  setPersona,
  setPersonaCatalog,
  subscribePersona,
  switchToRole,
} from "../lib/api";
import { cn, EVENT_NAME, type Persona, type Role } from "../lib/utils";
import { Button } from "./ui";
import {
  getActiveEvent,
  getEventCatalog,
  setActiveEventId,
  setEventCatalog,
  subscribeEvent,
  type EventSummary,
} from "../lib/api";

function usePersona(): Persona {
  return useSyncExternalStore(subscribePersona, getPersona, getPersona);
}

function useActiveEvent(): EventSummary {
  return useSyncExternalStore(subscribeEvent, getActiveEvent, getActiveEvent);
}

const BLANK_EVENT = { name: "", slug: "", startsAt: "", endsAt: "", timezone: "America/Los_Angeles", venue: "", rooms: "", tracks: "" };

/** URL slug derived from the event name (organizers rarely want to type one). */
export const slugifyEventName = (name: string) =>
  String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Defaults so "New event" needs only a name: a two-day window starting next month. */
export function eventCreateDefaults(form: typeof BLANK_EVENT, now = new Date()) {
  const start = form.startsAt ? new Date(form.startsAt) : new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0);
  const end = form.endsAt ? new Date(form.endsAt) : new Date(start.getTime() + 25 * 60 * 60 * 1000);
  return {
    name: form.name.trim(),
    slug: (form.slug.trim() || slugifyEventName(form.name)),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    timezone: form.timezone.trim() || "America/Los_Angeles",
    venue: form.venue.trim(),
    rooms: form.rooms.trim(),
    tracks: form.tracks.trim(),
  };
}

/** Header control for choosing which event every scoped API call targets,
 * plus the create-event form. The selection persists in localStorage. */
export function EventSwitcher({ readOnly }: { readOnly?: boolean } = {}) {
  const active = useActiveEvent();
  const [events, setEvents] = useState<EventSummary[]>(() => getEventCatalog());
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...BLANK_EVENT });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Persistent confirmation that the workspace switched to the new event. */
  const [created, setCreated] = useState<{ id: string; name: string; slug: string; at: string } | null>(null);

  const load = () =>
    api
      .events()
      .then((r) => {
        const list = r.data || [];
        if (list.length) {
          setEventCatalog(list);
          setEvents(list);
        }
      })
      .catch(() => setError("Could not load the event list."));

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const created = await api.createEvent(eventCreateDefaults(form));
      // Do NOT silently switch: an implicit change of active event made every
      // later click operate on an empty workspace. Confirm, and let the organizer
      // switch deliberately.
      await load();
      setCreated({ id: created.data.id, name: created.data.name, slug: created.data.slug, at: new Date().toLocaleTimeString() });
      setCreating(false);
      setOpen(false);
      setForm({ ...BLANK_EVENT });
    } catch (e: any) {
      setError(e?.message || "Could not create the event.");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
    <label className="block text-[11px] font-medium uppercase tracking-wide text-mid">
      {label}
      <input
        type={type}
        value={(form as any)[key]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="mt-1 w-full rounded-[10px] border border-line bg-paper px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-ink"
      />
    </label>
  );

  return (
    <div className="relative" data-testid="event-switcher">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current event: ${active.name}. Switch event`}
        className="flex max-w-[240px] items-center gap-2 rounded-[10px] border border-line bg-paper px-2.5 py-1.5 text-left text-sm text-ink hover:bg-soft"
      >
        <span className="truncate font-medium" data-testid="active-event-name">{active.name}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-mid" />
      </button>
      {created ? (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-[320px] rounded-[14px] border border-line bg-paper p-3 text-sm shadow-card"
          role="status"
          aria-live="polite"
          data-testid="event-created-banner"
        >
          <span className="block font-semibold">Created {created.name}</span>
          <span className="block text-xs text-mid">
            {created.at} · slug {created.slug} · empty by design: no submissions, speakers or sessions yet.
            You are still working in <b>{active.name}</b>.
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" data-testid="switch-to-created" onClick={() => { setActiveEventId(created.id); setCreated(null); }}>
              Switch to {created.name}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Stay in {active.name}</Button>
          </div>
        </div>
      ) : null}
      {open ? (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-[320px] rounded-[14px] border border-line bg-paper p-2 shadow-card">
          <div className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-mid">Events</div>
          {events.map((e) => (
            <button
              key={e.id}
              role="menuitem"
              type="button"
              onClick={() => {
                setActiveEventId(e.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col rounded-[10px] px-2 py-1.5 text-left text-sm hover:bg-soft",
                e.id === active.id && "bg-soft font-medium",
              )}
            >
              <span className="truncate text-ink">{e.name}</span>
              <span className="truncate text-[11px] text-mid">
                {e.venue || "No venue"} · {e.timezone}
              </span>
            </button>
          ))}
          {readOnly ? null : (
            <>
              <div className="my-1 border-t border-line" />
              {creating ? (
                <div className="space-y-2 p-2" data-testid="create-event-form">
                  <p className="text-[11px] text-mid">Only a name is required — slug, dates and timezone get sensible defaults you can edit later.</p>
                  {field("Event name", "name", "text", "DevFlow Conf 2027")}
                  {field("URL slug (optional)", "slug", "text", form.name ? slugifyEventName(form.name) : "devflow-conf-2027")}
                  <div className="grid grid-cols-2 gap-2">
                    {field("Starts (optional)", "startsAt", "datetime-local")}
                    {field("Ends (optional)", "endsAt", "datetime-local")}
                  </div>
                  {field("Timezone", "timezone", "text", "America/Los_Angeles")}
                  {field("Venue (optional)", "venue", "text", "Moscone West")}
                  {field("Rooms (optional, comma separated)", "rooms", "text", "Room 2A, Room 2B")}
                  {field("Tracks (optional, comma separated)", "tracks", "text", "Platform, DX")}
                  {error ? <div className="text-xs text-rose-600" role="alert">{error}</div> : null}
                  <div className="flex gap-2">
                    <Button size="sm" data-testid="create-event-submit" onClick={submit} disabled={busy || !form.name.trim()}>
                      {busy ? "Creating…" : "Create event"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-sm text-ink hover:bg-soft"
                >
                  <Plus className="h-4 w-4" /> New event
                </button>
              )}
            </>
          )}
          {error && !creating ? <div className="px-2 py-1 text-xs text-rose-600" role="alert">{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
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
  /** "none" once the event's catalog is known to hold no persona for this role. */
  const [missing, setMissing] = useState(false);
  const activeEvent = useActiveEvent();

  // Resolution runs in an EFFECT, never during render: resolvePortalPersona calls
  // setPersona, and a render-time store write re-entered this component through
  // useSyncExternalStore. It is also bounded — one bootstrap fetch per event.
  useEffect(() => {
    let live = true;
    setReady(false);
    setMissing(false);
    const finish = () => {
      if (!live) return;
      restorePersonaFromSession();
      const resolved = resolvePortalPersona(role);
      if (resolved) ensurePersonaForRole(role);
      setMissing(!resolved && !hasPersonaForRole(role));
      setReady(true);
    };
    // The event catalog is loaded too so the empty state can name the real event
    // (the switcher is not mounted on that screen).
    void api.events().then((r) => { if (live && r.data?.length) setEventCatalog(r.data); }).catch(() => {});
    api
      .bootstrap()
      .then((r) => {
        if (!live) return;
        const personas = (r.data?.personas || []) as Persona[];
        if (personas.length) setPersonaCatalog(personas);
      })
      .catch(() => { /* fall through: resolve against whatever catalog we have */ })
      .finally(finish);
    return () => { live = false; };
  }, [role, activeEvent.id]);

  // Portal pages are keyed on the persona id so every query refetches on switch.
  return { ready, personaKey: persona.id, missing };
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
              <EventSwitcher />
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
  const location = useLocation();
  const navigate = useNavigate();
  const persona = usePersona();
  const inviteToken = new URLSearchParams(location.search).get("invite");
  const [inviteState,setInviteState]=useState<{ready:boolean;error?:string}>({ready:!inviteToken});
  const [noReviewers,setNoReviewers]=useState(false);
  const activeEvent=useActiveEvent();
  useEffect(()=>{
    let active=true;
    if(!inviteToken){
      // Resolve reviewer personas against the ACTIVE event's catalog. Without this
      // the shell kept a persona from another event and every queue call 403'd
      // ("reviewer role required") while demoing as a reviewer of this event.
      setInviteState({ready:false});
      setNoReviewers(false);
      api.bootstrap()
        .then((r)=>{const personas=(r.data?.personas||[]) as Persona[];if(active&&personas.length)setPersonaCatalog(personas)})
        .catch(()=>{})
        .finally(()=>{
          if(!active)return;
          restorePersonaFromSession();
          const resolved=resolvePortalPersona("reviewer");
          if(resolved)ensurePersonaForRole("reviewer");
          setNoReviewers(!resolved&&!hasPersonaForRole("reviewer"));
          setInviteState({ready:true});
        });
      return()=>{active=false};
    }
    setInviteState({ready:false});
    api.resolveReviewerInvite(inviteToken).then((r)=>{
      if(!active)return;
      // Scope the shell to the invite's event BEFORE the queue loads, otherwise the
      // reviewer's first queue request targets whichever event was last active.
      if(r.data.eventId)setActiveEventId(r.data.eventId);
      setPersona(r.data.reviewer,{explicit:true});
      setInviteState({ready:true});
      navigate("/r",{replace:true});
    }).catch((e)=>{if(active)setInviteState({ready:false,error:e?.message||"Reviewer demo access link is invalid"})});
    return()=>{active=false};
  },[inviteToken,activeEvent.id]);
  const ready=inviteState.ready, personaKey=persona.id;
  if(inviteState.error){return <div className="grid min-h-screen place-items-center bg-canvas p-6"><div className="max-w-md rounded-[24px] border border-line bg-paper p-6 text-center"><h1 className="text-xl font-semibold">Reviewer demo access link unavailable</h1><p className="mt-2 text-sm text-mid">{inviteState.error}</p><p className="mt-2 text-xs text-mid">No reviewer persona was selected. Ask the organizer for a new demo access link.</p></div></div>}
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas text-sm text-mid">
        Restoring reviewer session…
      </div>
    );
  }
  if (noReviewers) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="max-w-md rounded-[24px] border border-line bg-paper p-6 text-center" data-testid="reviewer-none">
          <h1 className="text-lg font-bold text-ink">No reviewers in this event</h1>
          <p className="mt-2 text-sm text-mid">
            <b>{getActiveEvent().name}</b> has no reviewer personas yet. Invite a reviewer to a review round in the
            organizer workspace, then reload this page.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary"><a href="/app/evaluation-plan">Open Evaluation Plan</a></Button>
            <Button asChild variant="ghost"><a href="/app">Organizer workspace</a></Button>
          </div>
        </div>
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
        <div className="flex items-center gap-2">
          <EventSwitcher readOnly />
          <PersonaSwitcher lockRole="reviewer" />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl p-4 sm:p-6" key={personaKey}>
        <Outlet />
      </main>
    </div>
  );
}

export function PortalShell() {
  const { ready, personaKey, missing } = useRoleSync("speaker");
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
  if (missing) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="max-w-md rounded-[24px] border border-line bg-paper p-6 text-center" data-testid="portal-no-speakers">
          <h1 className="text-lg font-bold text-ink">No speaker personas in this event</h1>
          <p className="mt-2 text-sm text-mid">
            <b>{getActiveEvent().name}</b> has no speakers yet, so there is no portal to sign in to. Accept a submission
            or add a speaker in the organizer workspace, then come back.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary"><a href="/app/speakers">Open organizer roster</a></Button>
            <Button asChild variant="ghost"><a href="/app">Organizer workspace</a></Button>
          </div>
        </div>
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
          <div className="flex items-center gap-2">
            <EventSwitcher readOnly />
            <PersonaSwitcher lockRole="speaker" />
          </div>
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
  // Public pages are SLUG-driven: the header must name the event in the URL, never
  // the seeded constant (a runtime event rendered "AI Engineer Summit" here).
  const { slug } = useParams();
  const [eventName, setEventName] = useState("");
  useEffect(() => {
    let live = true;
    setEventName("");
    if (!slug) return;
    api
      .publicCfp(slug)
      .then((r) => { if (live) setEventName(r.data?.event?.name || ""); })
      .catch(() => { /* the page below renders its own error state */ });
    return () => { live = false; };
  }, [slug]);
  return (
    <div className="min-h-screen bg-canvas">
      <SkipLink />
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-mid">Call for speakers</div>
            <div className="text-base font-semibold tracking-tight text-ink" data-testid="public-event-name">{eventName || slug || EVENT_NAME}</div>
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
