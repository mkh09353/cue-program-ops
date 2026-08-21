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
  // Mirrors the seeded organizer catalog; swyx is the default persona.
  { id: "org-swyx", role: "organizer", name: "swyx", email: "swyx@ai.engineer" },
  { id: "org-sydney", role: "organizer", name: "Sydney", email: "sydney@ai.engineer" },
  { id: "org-phlo", role: "organizer", name: "Phlo", email: "phlo@ai.engineer" },
  { id: "org-kelsey", role: "organizer", name: "Kelsey", email: "kelsey@ai.engineer" },
  { id: "org-jordan", role: "organizer", name: "Jordan Alvarez", email: "jordan@ai.engineer" },
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
  confirmation: "Confirm details",
  form: "Complete form",
  general: "General action",
  action: "General action",
  file: "File request",
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

/** Task types the SERVER completes as a side effect of saving the speaker profile
 * (bio over 20 characters) or attaching a headshot — the speaker never presses a
 * “mark complete” button for these, so a Done badge otherwise appears unexplained. */
const AUTO_COMPLETED_TASK_TYPES: Record<string, string> = {
  profile: "Completed automatically via profile save",
  headshot: "Completed automatically via headshot upload",
};
const COMPLETED_VIA_NOTES: Record<string, string> = {
  profile_save: "Completed automatically via profile save",
  headshot_upload: "Completed automatically via headshot upload",
  file_upload: "Completed automatically via file upload",
};

/**
 * Annotation for a completed task that the profile/headshot save closed on the
 * speaker's behalf, or null when the task carries no such rule.
 *
 * Prefers the server `completedVia` provenance field when present; falls back to
 * the task TYPE for records that predate the field. {@link autoCompletionRule}
 * states the rule itself for the not-yet-completed case.
 */
export function autoCompletionNote(task: { type?: string; status?: string; completedVia?: string } | null | undefined): string | null {
  if (!task || task.status !== "completed") return null;
  if (task.completedVia === "manual") return null;
  if (task.completedVia) return COMPLETED_VIA_NOTES[task.completedVia] || null;
  return AUTO_COMPLETED_TASK_TYPES[String(task.type)] || null;
}

export interface SubmissionParticipant {
  id?: string;
  name: string;
  email?: string;
  /** Raw role from the record (lead / co-author / co-presenter). */
  role?: string;
  /** Explicit organizer-facing label: “Author” or “Co-author”. */
  roleLabel: string;
  /** Set when the raw role adds detail beyond the label (e.g. co-presenter). */
  roleDetail?: string;
}

/** Author vs co-author, stated in words rather than a raw enum. */
export function participantRoleLabel(role?: string): string {
  const raw = String(role || "").toLowerCase();
  return !raw || raw === "lead" || raw === "author" || raw === "speaker" ? "Author" : "Co-author";
}

/**
 * Canonical participant list for a submission, for every organizer-facing surface.
 *
 * Co-authors were stored (submission.participants, or additionalSpeakers on older
 * records) but surfaced as a bare joined string, so a reader could not tell WHO was the
 * author and who was a co-author. Ordering puts the author first.
 */
export function submissionParticipants(record: any): SubmissionParticipant[] {
  if (!record) return [];
  const raw: any[] = Array.isArray(record.participants) && record.participants.length
    ? record.participants
    : [
        { id: record.speakerId, name: record.name, email: record.email, role: "lead" },
        ...(record.additionalSpeakers || []),
      ];
  const mapped = raw
    .filter((p) => p && (p.name || p.email))
    .map((p) => {
      const roleLabel = participantRoleLabel(p.role);
      const detail = String(p.role || "").toLowerCase();
      return {
        id: p.id,
        name: p.name || p.email,
        email: p.email,
        role: p.role,
        roleLabel,
        roleDetail: detail && detail !== "lead" && detail !== "co-author" ? detail.replace(/[_-]/g, " ") : undefined,
      } as SubmissionParticipant;
    });
  // Author first, co-authors in declaration order.
  return [
    ...mapped.filter((p) => p.roleLabel === "Author"),
    ...mapped.filter((p) => p.roleLabel !== "Author"),
  ];
}

/** The standing rule, shown before completion so the automatic flip is not a surprise. */
export function autoCompletionRule(task: { type?: string } | null | undefined): string | null {
  if (!task) return null;
  if (task.type === "profile") return "Completes automatically when the speaker profile is saved with a bio";
  if (task.type === "headshot") return "Completes automatically when a headshot is uploaded";
  return null;
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

/**
 * Weighted mean over rating criteria, normalized onto a 1-5 scale.
 *
 * Mirrors weightedAverage() in src/lifecycle.ts so the browser can show the same
 * number the server computes without bundling the server module (and its seed).
 * test/review-weighted-aggregate.test.ts fails if the two ever diverge.
 */
export function weightedAverageScores(
  scores: Record<string, unknown> | null | undefined,
  criteria: { id: string; type?: string; weight?: number; min?: number; max?: number }[],
): number | null {
  const values = Object.entries(scores || {}).flatMap(([id, raw]) => {
    const criterion = (criteria || []).find((c) => c.id === id && (c.type ?? "rating") === "rating");
    const value = Number(raw);
    if (!criterion || typeof raw !== "number" || !Number.isFinite(value)) return [];
    const min = Number(criterion.min ?? 1);
    const max = Number(criterion.max ?? 5);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || value < min || value > max) return [];
    return [{ normalized: 1 + (4 * (value - min)) / (max - min), weight: Number(criterion.weight ?? 0) }];
  });
  if (!values.length) return null;
  const weighted = values.filter((v) => v.weight > 0);
  const pool = weighted.length ? weighted : values.map((v) => ({ ...v, weight: 1 }));
  const total = pool.reduce((sum, v) => sum + v.weight, 0);
  if (!total) return null;
  return Math.round((pool.reduce((sum, v) => sum + v.normalized * v.weight, 0) / total) * 100) / 100;
}

/** "(2x4 + 1x2)/3 = 3.33" - the arithmetic behind a displayed aggregate. */
export function weightedMathLabel(
  scores: Record<string, unknown> | null | undefined,
  criteria: { id: string; label?: string; type?: string; weight?: number; min?: number; max?: number }[],
): string {
  const parts = Object.entries(scores || {}).flatMap(([id, raw]) => {
    const criterion = (criteria || []).find((c) => c.id === id && (c.type ?? "rating") === "rating");
    if (!criterion || typeof raw !== "number" || !Number.isFinite(Number(raw))) return [];
    return [{ weight: Number(criterion.weight ?? 0) || 1, value: Number(raw) }];
  });
  if (!parts.length) return "";
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  const result = weightedAverageScores(scores, criteria);
  if (result == null || !total) return "";
  return `(${parts.map((p) => `${p.weight}x${p.value}`).join(" + ")})/${total} = ${result}`;
}
