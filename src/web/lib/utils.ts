import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { EVENT_TIME_ZONE } from "../../timezone";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const EVENT_ID = "evt-ai-summit-2026";
export const EVENT_SLUG = "ai-engineer-summit";
export const EVENT_NAME = "AI Engineer Summit";
/** Event timezone used for organizer schedule + public widgets. */
export const EVENT_TZ = EVENT_TIME_ZONE;

/** Fallback program days when bootstrap event dates are unavailable. */
export const PROGRAM_DAYS = [
  { id: "2026-10-12", label: "Mon · Oct 12", short: "Mon 12", dateLabel: "October 12, 2026" },
  { id: "2026-10-13", label: "Tue · Oct 13", short: "Tue 13", dateLabel: "October 13, 2026" },
  { id: "2026-10-14", label: "Wed · Oct 14", short: "Wed 14", dateLabel: "October 14, 2026" },
] as const;

export type ProgramDay = { id: string; label: string; short: string; dateLabel: string };

/** Calendar day keys (YYYY-MM-DD) spanning event startsAt..endsAt in the event timezone. */
export function eventDayKeys(startsAt: string, endsAt: string, timeZone: string = EVENT_TZ): string[] {
  const keys: string[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  // Walk UTC noon anchors so DST doesn't skip a civil day
  let cursor = new Date(`${fmt.format(start)}T12:00:00.000Z`);
  const last = fmt.format(end);
  for (let i = 0; i < 31; i++) {
    const key = fmt.format(cursor);
    keys.push(key);
    if (key === last) break;
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return keys;
}

export function programDaysFromRange(
  startsAt?: string,
  endsAt?: string,
  timeZone: string = EVENT_TZ,
): ProgramDay[] {
  const keys =
    startsAt && endsAt ? eventDayKeys(startsAt, endsAt, timeZone) : PROGRAM_DAYS.map((d) => d.id);
  const use = keys.length ? keys : PROGRAM_DAYS.map((d) => d.id);
  return use.map((id) => {
    const known = PROGRAM_DAYS.find((d) => d.id === id);
    if (known) return { ...known };
    try {
      const d = new Date(`${id}T12:00:00.000Z`);
      const label = d.toLocaleDateString("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const short = d.toLocaleDateString("en-US", { timeZone, weekday: "short", day: "numeric" });
      const dateLabel = d.toLocaleDateString("en-US", {
        timeZone,
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      return { id, label, short, dateLabel };
    } catch {
      return { id, label: id, short: id.slice(5), dateLabel: id };
    }
  });
}

export type Role = "organizer" | "reviewer" | "speaker";

export interface Persona {
  id: string;
  role: Role;
  name: string;
  email: string;
  speakerId?: string;
  boardIds?: string[];
}

export const DEFAULT_PERSONAS: Persona[] = [
  { id: "org-swyx", role: "organizer", name: "Jordan Alvarez", email: "jordan@ai.engineer" },
  {
    id: "rev-ada",
    role: "reviewer",
    name: "Ada Reviewer",
    email: "reviewer@ai.engineer",
    boardIds: ["product", "agents", "engineering"],
  },
  {
    id: "spk-sam",
    role: "speaker",
    name: "Sam Rivera",
    email: "sam@example.test",
    speakerId: "spk-sam",
  },
  {
    id: "spk-ada",
    role: "speaker",
    name: "Ada Lovelace",
    email: "ada@example.test",
    speakerId: "spk-ada",
  },
];

export function daysUntil(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}


export function fmtTime(iso: string, timeZone: string = EVENT_TZ) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function fmtDate(iso: string, timeZone: string = EVENT_TZ) {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

export function fmtTzLabel(timeZone: string = EVENT_TZ) {
  return timeZone.includes("/") ? timeZone.split("/").pop()!.replace(/_/g, " ") : timeZone;
}

export function calendarLinks(title: string, startsAt: string, endsAt: string) {
  const start = startsAt.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = endsAt.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const text = encodeURIComponent(title);
  const dates = `${start}/${end}`;
  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${text}&startdt=${encodeURIComponent(startsAt)}&enddt=${encodeURIComponent(endsAt)}`,
  };
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "In review",
  in_review: "In review",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  // Organizer decision wording is "Rejected" (submission decisions). A speaker who
  // turns down an invitation keeps the distinct "Declined invite" wording.
  rejected: "Rejected",
  declined: "Declined invite",
  withdrawn: "Withdrawn",
  assigned: "Awaiting score",
  completed: "Done",
  not_started: "To do",
  ready: "Ready",
  not_ready: "Not ready",
  published: "Published",
  scheduled: "Scheduled",
  open: "Open",
  closed: "Closed",
  mock_sent: "Sent (mock)",
  pending: "Pending",
  overdue: "Overdue",
  conflict: "Conflict",
};

export function formatStatus(status: string | undefined | null): string {
  if (!status) return "—";
  const key = String(status).toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const TASK_TYPE_LABELS: Record<string, string> = {
  profile: "Complete speaker profile",
  headshot: "Upload headshot",
  slides: "Upload slides",
  supporting_doc: "Upload supporting document",
  supporting_document: "Upload supporting document",
  confirm: "Confirm details",
  form: "Complete form",
  bio: "Add speaker bio",
};

/** Turn API missing codes like task:task-ada-slides into human copy. */
export function humanizeMissing(code: string): string {
  const raw = String(code || "");
  if (raw.startsWith("task:")) {
    const id = raw.slice(5);
    if (id.includes("slides")) return "Upload slides";
    if (id.includes("headshot")) return "Upload headshot";
    if (id.includes("profile") || id.includes("bio")) return "Complete speaker profile";
    if (id.includes("doc") || id.includes("supporting")) return "Upload supporting document";
    if (id.includes("confirm")) return "Confirm details";
    return "Complete onboarding task";
  }
  if (TASK_TYPE_LABELS[raw]) return TASK_TYPE_LABELS[raw];
  if (raw === "headshot") return "Upload headshot";
  if (raw === "bio") return "Add speaker bio";
  return raw.replace(/[_-]/g, " ");
}

export function taskTypeLabel(type: string): string {
  return TASK_TYPE_LABELS[type] || formatStatus(type);
}

/** Safe, minimal markdown: bold, italic, newlines, bullets. No raw HTML. */
export function renderSimpleMarkdown(md: string): string {
  const escaped = String(md || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<div class="mt-3 text-sm font-bold">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="mt-3 text-base font-bold">$1</div>')
    .replace(/^# (.+)$/gm, '<div class="mt-3 text-lg font-bold">$1</div>')
    .replace(/^- (.+)$/gm, '<div class="ml-3 before:content-[\'•\'] before:mr-2">$1</div>')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
  return withBreaks;
}

const UNSAFE_EMBED = /rick.?roll|never.?gonna.?give/i;

export function isProfessionalEmbed(url?: string | null): boolean {
  if (!url) return false;
  if (UNSAFE_EMBED.test(url)) return false;
  try {
    const u = new URL(url);
    return ["www.youtube.com", "youtube.com", "player.vimeo.com"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function roleFromPath(pathname: string): Role | "public" | null {
  if (pathname === "/" || pathname.startsWith("/demo")) return null;
  if (pathname.startsWith("/app")) return "organizer";
  if (pathname.startsWith("/r")) return "reviewer";
  if (pathname.startsWith("/p")) return "speaker";
  if (pathname.startsWith("/e/")) return "public";
  return null;
}

export function averageScores(scores?: Record<string, number> | null): number | null {
  if (!scores) return null;
  const vals = Object.values(scores).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/**
 * Builder autosave race guard: adopt the server's saved copy ONLY when the local
 * draft has not changed while the request was in flight. Ticking "required" on a
 * freshly added field used to be clobbered by the in-flight autosave response.
 */
export function adoptSaveResult<T>(current: T, sentSnapshot: string, server: T, snapshot: (v: T) => string): T {
  return snapshot(current) === sentSnapshot ? server : current;
}
