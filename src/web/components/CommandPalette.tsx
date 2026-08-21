import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { api, getActiveEvent, setActiveEventId } from "../lib/api";
import { toast } from "./ui";
import { cn } from "../lib/utils";

/**
 * Organizer command palette (⌘K / Ctrl+K).
 *
 * Jumps to any organizer page plus individual submissions and speakers. The
 * record lists are fetched lazily the first time the palette opens, so the shell
 * costs nothing until an organizer actually searches.
 *
 * The global shortcut listener only reacts to ⌘/Ctrl+K, so typing in an input
 * anywhere in the shell is never intercepted while the palette is closed.
 */

export type PaletteItem = {
  id: string;
  label: string;
  sublabel?: string;
  group: string;
  to: string;
  keywords?: string;
  /** Non-navigation commands (e.g. Publish agenda) run this instead of routing. */
  run?: () => void | Promise<void>;
};

/** Every organizer destination, in the order the sidebar presents them. */
export const ORGANIZER_PAGES: PaletteItem[] = [
  { id: "page-dashboard", label: "Dashboard", sublabel: "Command center", group: "Pages", to: "/app", keywords: "command home overview kpis" },
  { id: "page-submissions", label: "Submissions", sublabel: "CFP inbox", group: "Pages", to: "/app/submissions", keywords: "proposals abstracts inbox cfp" },
  { id: "page-evaluation-plan", label: "Evaluation Plan", sublabel: "Rounds, boards, criteria", group: "Pages", to: "/app/evaluation-plan", keywords: "review rounds rubric criteria boards" },
  { id: "page-assignments", label: "Assignments", sublabel: "Reviewer assignments", group: "Pages", to: "/app/assignments", keywords: "reviewers assign workload" },
  { id: "page-review-progress", label: "Review Progress", sublabel: "Scoring completion", group: "Pages", to: "/app/review-progress", keywords: "reviews progress reminders" },
  { id: "page-results", label: "Results", sublabel: "Scores and decisions", group: "Pages", to: "/app/results", keywords: "scores decisions accept reject export" },
  { id: "page-schedule", label: "Schedule", sublabel: "Agenda builder", group: "Pages", to: "/app/schedule", keywords: "agenda rooms tracks conflicts" },
  { id: "page-ai-agenda", label: "AI Agenda Builder", sublabel: "Advisory draft agenda", group: "Pages", to: "/app/schedule#ai-agenda", keywords: "ai agenda draft suggestions" },
  { id: "page-sessions", label: "Sessions", sublabel: "Program roster, approvals, cancellations", group: "Pages", to: "/app/sessions", keywords: "sessions talks program approve cancel publication draft" },
  { id: "page-speakers", label: "Speakers", sublabel: "Roster and onboarding", group: "Pages", to: "/app/speakers", keywords: "roster onboarding readiness tasks" },
  { id: "page-crm", label: "Speaker CRM", sublabel: "Pipeline and outreach", group: "Pages", to: "/app/crm", keywords: "crm contacts pipeline segments campaigns" },
  { id: "page-content", label: "Content", sublabel: "Slides, headshots, approvals", group: "Pages", to: "/app/content", keywords: "files uploads slides headshots approvals" },
  { id: "page-comms", label: "Comms", sublabel: "Templated email and reminders", group: "Pages", to: "/app/comms", keywords: "email templates reminders ics invitations" },
  { id: "page-publish", label: "Publish", sublabel: "Public widgets and embeds", group: "Pages", to: "/app/publish", keywords: "widgets embed public website feeds" },
  { id: "page-forms", label: "Forms", sublabel: "CFP form builder", group: "Pages", to: "/app/forms", keywords: "cfp builder fields questions" },
  { id: "page-settings", label: "Settings", sublabel: "Event settings and integrations", group: "Pages", to: "/app/settings", keywords: "event integrations accelevents sync providers" },
];

/** Token-AND match over label + sublabel + keywords. */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return items;
  return items.filter((item) => {
    const hay = `${item.label} ${item.sublabel || ""} ${item.keywords || ""}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

/** Ids of every action command, so tests can assert the registry stays complete. */
export const PALETTE_ACTION_IDS = [
  "action-new-event",
  "action-new-session",
  "action-add-speaker",
  "action-invite-reviewer",
  "action-run-of-show",
  "action-publish-agenda",
  "action-export-results",
] as const;

/**
 * Actions are static, so they are searchable the instant the palette opens.
 * Publish is the only one with a side effect; everything else is a deep link.
 */
export function paletteActions(): PaletteItem[] {
  return [
    { id: "action-new-event", label: "New event", sublabel: "Create an event with rooms and tracks", group: "Actions", to: "/app/settings?new=event", keywords: "create add conference" },
    { id: "action-new-session", label: "New session", sublabel: "Add a session to the schedule", group: "Actions", to: "/app/schedule#new-session", keywords: "create add talk" },
    { id: "action-add-speaker", label: "Add speaker", sublabel: "Add someone to the roster", group: "Actions", to: "/app/speakers?add=1", keywords: "create invite person roster" },
    { id: "action-invite-reviewer", label: "Invite reviewer", sublabel: "Add a reviewer to a round", group: "Actions", to: "/app/evaluation-plan#invite", keywords: "review board judge" },
    { id: "action-run-of-show", label: "Print run-of-show", sublabel: "Printable schedule", group: "Actions", to: "/app/schedule/run-of-show", keywords: "print pdf paper agenda" },
    {
      id: "action-publish-agenda",
      label: "Publish agenda",
      sublabel: "Push the schedule public",
      group: "Actions",
      to: "/app/schedule",
      keywords: "public release live",
      run: async () => {
        try {
          const r = await api.publishAgendaDetailed();
          if (r.status === 409) {
            toast(r.error || "Hard conflicts block publishing", "danger");
            return;
          }
          if (r.status === 422) {
            toast("Schedule warnings require acknowledgement — open Schedule to confirm", "danger");
            return;
          }
          if (!r.ok) {
            toast(r.error || "Could not publish the agenda", "danger");
            return;
          }
          toast("Agenda published");
        } catch (e: any) {
          toast(e?.message || "Could not publish the agenda", "danger");
        }
      },
    },
    { id: "action-export-results", label: "Export results CSV", sublabel: "Download review results", group: "Actions", to: "/app/results?export=csv", keywords: "download csv scores export" },
  ];
}

const RECENTS_KEY = "ruckus-palette-recents";
/** Recently run command ids, most recent first (max 5). */
export function readPaletteRecents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}
export function rememberPaletteRecent(id: string) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify([id, ...readPaletteRecents().filter((x) => x !== id)].slice(0, 5)));
  } catch {
    /* storage unavailable */
  }
}

/** Character positions of a subsequence match, for highlighting. */
export function matchPositions(text: string, query: string): number[] {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return [];
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return Array.from({ length: needle.length }, (_, i) => direct + i);
  const hits: number[] = [];
  let cursor = 0;
  for (const char of needle.replace(/\s+/g, "")) {
    const found = haystack.indexOf(char, cursor);
    if (found < 0) return [];
    hits.push(found);
    cursor = found + 1;
  }
  return hits;
}

/** Bold the characters the query matched. */
function Highlight({ text, query }: { text: string; query: string }) {
  const hits = new Set(matchPositions(text, query));
  if (!hits.size) return <>{text}</>;
  return (
    <>
      {Array.from(text).map((char, i) => (
        <span key={i} className={hits.has(i) ? "font-bold" : undefined}>
          {char}
        </span>
      ))}
    </>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [records, setRecords] = useState<PaletteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Lazy load: submissions + speakers are fetched the first time the palette opens.
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    Promise.all([
      api.submissions().then((r) => r.data || []).catch(() => [] as any[]),
      api.speakers().then((r) => r.data || []).catch(() => [] as any[]),
      api.schedule().then((r: any) => r?.sessions || []).catch(() => [] as any[]),
      api.crmContacts().then((r: any) => r.data || []).catch(() => [] as any[]),
      api.events().then((r: any) => r.data || []).catch(() => [] as any[]),
    ])
      .then(([subs, speakers, sessions, contacts, events]) => {
        const subItems: PaletteItem[] = (subs as any[]).map((s: any) => ({
          id: `submission-${s.id}`,
          label: s.title || s.id,
          sublabel: [s.id, s.name, s.category, s.status].filter(Boolean).join(" · "),
          group: "Submissions",
          to: `/app/submissions/${s.id}`,
          keywords: `${s.id} ${s.name || ""} ${s.category || ""} ${s.status || ""}`,
        }));
        const speakerItems: PaletteItem[] = (speakers as any[]).map((s: any) => ({
          id: `speaker-${s.speakerId || s.id}`,
          label: s.name || s.email || s.speakerId,
          sublabel: [s.company, s.email].filter(Boolean).join(" · "),
          group: "Speakers",
          to: `/app/speakers/${s.speakerId || s.id}`,
          keywords: `${s.email || ""} ${s.company || ""} ${s.title || ""}`,
        }));
        const sessionItems: PaletteItem[] = (sessions as any[]).map((x: any) => ({
          id: `session-${x.id}`,
          label: x.title || x.id,
          sublabel: [x.format, x.status].filter(Boolean).join(" · ") || "Open on the schedule",
          group: "Sessions",
          // The schedule highlights the session named in the query string.
          to: `/app/schedule?session=${encodeURIComponent(x.id)}`,
          keywords: `${x.id} ${x.format || ""} session agenda`,
        }));
        const contactItems: PaletteItem[] = (contacts as any[]).map((c: any) => ({
          id: `contact-${c.id}`,
          label: c.name || c.email || c.id,
          sublabel: [c.company, c.stage].filter(Boolean).join(" · "),
          group: "CRM contacts",
          to: `/app/crm/contacts/${c.id}`,
          keywords: `${c.email || ""} ${c.stage || ""} crm contact`,
        }));
        const eventItems: PaletteItem[] = (events as any[]).map((e: any) => ({
          id: `event-${e.id}`,
          label: e.name || e.id,
          sublabel: e.id === getActiveEvent().id ? "Current event" : "Switch to this event",
          group: "Events",
          to: "/app",
          keywords: `${e.slug || ""} switch event`,
          run: () => {
            setActiveEventId(e.id);
            toast(`Now working in ${e.name}`);
          },
        }));
        setRecords([...subItems, ...speakerItems, ...sessionItems, ...contactItems, ...eventItems]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Reset the query each time the palette opens and focus the search box.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const items = useMemo(() => {
    const all = [...ORGANIZER_PAGES, ...paletteActions(), ...records];
    const matched = filterPaletteItems(all, query);
    if (query.trim()) return matched.slice(0, 40);
    // No query: lead with what this organizer ran most recently.
    const recent = readPaletteRecents()
      .map((id) => all.find((i) => i.id === id))
      .filter(Boolean)
      .map((i) => ({ ...(i as PaletteItem), group: "Recent" }));
    // With no query, show a representative sample of EVERY group rather than the
    // first 40 items, which hid whole groups (Events) behind long lists.
    const perGroup = new Map<string, number>();
    const sample = matched.filter((i) => {
      if (recent.some((r) => r.id === i.id)) return false;
      const seen = perGroup.get(i.group) || 0;
      if (seen >= 5) return false;
      perGroup.set(i.group, seen + 1);
      return true;
    });
    return [...recent, ...sample];
  }, [records, query]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open, items.length]);

  if (!open || typeof document === "undefined") return null;

  const go = (item?: PaletteItem) => {
    if (!item) return;
    rememberPaletteRecent(item.id);
    onClose();
    // A command with run() performs its side effect, then still routes somewhere useful.
    if (item.run) void Promise.resolve(item.run()).then(() => navigate(item.to));
    else navigate(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, items.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[10vh]" role="presentation">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close command palette" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-paper shadow-lift"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-mid" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-label="Search organizer pages, actions, submissions, sessions, contacts and events"
            placeholder="Search pages, actions, people, sessions…"
            data-testid="command-palette-input"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-mid"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] text-mid sm:block">Esc</kbd>
        </div>
        <div id="command-palette-list" role="listbox" aria-label="Results" ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {items.length ? (
            items.map((item, index) => {
              const header = item.group !== lastGroup ? item.group : "";
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header ? (
                    <div
                      className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-mid"
                      data-testid={`command-group-${header.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {header}
                    </div>
                  ) : null}
                  <div
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    data-testid={`command-item-${item.id}`}
                    tabIndex={-1}
                    className={cn(
                      "cursor-pointer rounded-2xl px-3 py-2 text-sm text-ink",
                      index === active ? "bg-brand-600 text-white" : "hover:bg-brand-50",
                    )}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item)}
                  >
                    <div className="font-medium"><Highlight text={item.label} query={query} /></div>
                    {item.sublabel ? (
                      <div className={cn("truncate text-xs", index === active ? "text-soft/80" : "text-mid")}>{item.sublabel}</div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="px-3 py-6 text-center text-sm text-mid">
              {loading ? "Loading records…" : `No matches for “${query}”`}
            </p>
          )}
        </div>
        <div className="border-t border-line px-4 py-2 text-[11px] text-mid">
          ↑↓ to navigate · Enter to open · Esc to close
          <span className={loading ? "" : "invisible"}> · loading records…</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Header affordance so the palette is discoverable without knowing the shortcut. */
export function CommandPaletteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="command-palette-button"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      title="Search (⌘K)"
      className="flex h-9 items-center gap-2 rounded-full bg-white px-3 text-sm text-mid ring-1 ring-line transition hover:text-ink hover:ring-brand-200"
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Search</span>
      <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px]">⌘K</kbd>
    </button>
  );
}
