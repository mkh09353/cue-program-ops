import type { ScheduleProjection } from "./domain.js";
import type { ScheduleData, ScheduleSession, ScheduleSpeaker } from "./schedule.js";
import { EVENT_ID, EVENT_SLUG, store } from "./lifecycle.js";
import { listEvents } from "./events.js";

/** Published-only gate used by every public widget and feed. */
export function isPublishedSession(session: ScheduleSession | undefined | null): boolean {
  if (!session) return false;
  return !session.cancelled && session.publicationState !== "draft" && session.publishStatus === "published" && (session.status === "published" || session.status === "accepted");
}

export type PublicSpeakerView = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  bio: string;
  company?: string;
  title?: string;
  headshotUrl?: string;
  /** False when headshotUrl is the generated initials avatar rather than an upload. */
  hasUploadedHeadshot?: boolean;
  initials: string;
  sessionIds: string[];
  /** Surname-forward form (“Clark, Lin”) so the A–Z ordering is visible on the page. */
  sortName: string;
};

export type PublicSessionView = {
  id: string;
  slug: string;
  title: string;
  abstract: string;
  format: string;
  startsAt: string;
  endsAt: string;
  dayKey: string;
  room: string;
  roomId: string;
  tracks: { id: string; name: string; color: string }[];
  trackNames: string[];
  speakers: PublicSpeakerView[];
};

export type PublicProgram = {
  event: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    startsAt: string;
    endsAt: string;
    location: string;
    website: string;
  };
  sessions: PublicSessionView[];
  /**
   * Published sessions that do not have a schedule slot yet. They belong in the
   * public SESSIONS CATALOG (as "Time TBA") but never in the agenda grid,
   * itinerary, or ICS — those stay strictly slot-driven.
   */
  unscheduledSessions: PublicSessionView[];
  speakers: PublicSpeakerView[];
  days: string[];
  rooms: { id: string; name: string; color?: string }[];
  tracks: { id: string; name: string; color: string }[];
  formats: string[];
  facets: { tracks: string[]; formats: string[]; rooms: string[] };
  /** Optional per-embed card field selection (set by a saved embed config). */
  cardFields?: { speakers?: boolean; room?: boolean; track?: boolean; description?: boolean };
  /** Human-auditable publication gate shown on public pages. */
  publicationGate: { included: PublicationGateSession[]; excluded: PublicationGateSession[] };
};

export type PublicationGateSession = {
  id: string;
  title: string;
  dayKey?: string;
  trackNames?: string[];
  format?: string;
  room?: string;
};

/** Generational/qualification suffixes never act as a surname. */
const NAME_SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v", "phd", "ph.d.", "md", "mba", "(manual)"]);

export const splitName = (name: string) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  // Walk past trailing suffixes so “Ada Lovelace Jr.” still sorts under Lovelace.
  let last = parts.length - 1;
  while (last > 0 && NAME_SUFFIXES.has(parts[last]!.toLowerCase())) last--;
  const lastName = parts[last]!;
  const firstName = parts.slice(0, last).join(" ") || lastName;
  return { firstName, lastName };
};

/** Provenance markers an import/CRM handoff appends to a placeholder record's
 * display name (e.g. “Priya Raman (manual)”). Only these parenthetical markers are
 * ignored for duplicate identity — generational suffixes are NOT, because “Ada
 * Lovelace” and “Ada Lovelace Jr.” may well be two different people. */
const PROVENANCE_MARKER = /\s*\((?:manual|imported|import|duplicate|copy)\)\s*$/i;

/** Identity key for duplicate detection: the display name minus any provenance marker. */
export function baseNameKey(name: string) {
  return String(name || "").replace(PROVENANCE_MARKER, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when the display name itself advertises the record as a placeholder. */
export const hasProvenanceMarker = (name: string) => PROVENANCE_MARKER.test(String(name || ""));

/** Locale-aware, case/diacritic-insensitive comparison for directory ordering. */
const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true, ignorePunctuation: true });

/**
 * Deterministic monochrome initials avatar (inline SVG data URL) so no public card
 * ever renders a broken/missing image for a speaker without an uploaded headshot.
 */
/** True for the generated initials placeholder (never a real uploaded image). */
export const isGeneratedAvatar = (url?: string) =>
  typeof url === "string" && url.startsWith("data:image/svg+xml") && url.includes("192");

/** A real uploaded headshot always beats a generated placeholder, whichever side it is on. */
export function preferUploadedHeadshot(...candidates: (string | undefined)[]) {
  const values = candidates.filter((v): v is string => Boolean(v && String(v).trim()));
  return values.find((v) => !isGeneratedAvatar(v)) || values[0];
}

export function initialsAvatarDataUrl(name: string) {
  const initials = initialsOf(name) || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" fill="#12141A"/><text x="96" y="124" font-family="Helvetica,Arial,sans-serif" font-size="76" font-weight="700" fill="#F7F4EF" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const initialsOf = (name: string) =>
  String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase() || "?";

export function dayKeyOf(iso: string, timeZone = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Inclusive civil-day keys for the event window (used by public agenda day tabs). */
export function eventRangeDayKeys(startsAt: string, endsAt: string, timeZone = "UTC"): string[] {
  const keys: string[] = [];
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return keys;
    let cursor = new Date(`${fmt.format(start)}T12:00:00.000Z`);
    const last = fmt.format(end);
    for (let i = 0; i < 31; i++) {
      const key = fmt.format(cursor);
      keys.push(key);
      if (key === last) break;
      cursor = new Date(cursor.getTime() + 86400000);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

function speakerView(sp: ScheduleSpeaker, sessionIds: string[] = []): PublicSpeakerView {
  const { firstName, lastName } = splitName(sp.name);
  return {
    id: sp.id,
    name: sp.name,
    firstName,
    lastName,
    bio: sp.bio || "",
    company: sp.company,
    title: (sp as ScheduleSpeaker & { title?: string }).title,
    // Never expose an empty image: fall back to a generated initials avatar.
    headshotUrl: sp.headshotUrl || initialsAvatarDataUrl(sp.name),
    hasUploadedHeadshot: Boolean(sp.headshotUrl),
    initials: initialsOf(sp.name),
    sessionIds,
    sortName: firstName && firstName !== lastName ? `${lastName}, ${firstName}` : lastName,
  };
}

/** Collapse the placeholder speaker an import/CRM handoff can leave behind.
 *
 * Two records are merged ONLY when they carry the same name AND one of them is
 * a bare placeholder (no job title, no company, no uploaded headshot). Distinct
 * people who happen to share a name both keep their own card. */
export function dedupePublicSpeakers(list: PublicSpeakerView[]): PublicSpeakerView[] {
  // Only an EMPTY record is a placeholder. A provenance marker alone must not
  // qualify: a populated “Dana Cruz (manual)” may be a genuinely different person
  // from “Dana Cruz”, so the marker only widens grouping, never the drop rule.
  const isPlaceholder = (s: PublicSpeakerView) => !s.title && !s.company && !s.hasUploadedHeadshot;
  const byName = new Map<string, PublicSpeakerView[]>();
  for (const speaker of list) {
    // Group on the BASE name so “Priya Raman” and “Priya Raman (manual)” meet.
    const key = baseNameKey(speaker.name);
    byName.set(key, [...(byName.get(key) || []), speaker]);
  }
  const dropped = new Set<string>();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    // Prefer an unmarked survivor so the public sees the canonical display name
    // (“Priya Raman”, never “Priya Raman (manual)”).
    const canonical = group
      .filter((s) => !isPlaceholder(s))
      .sort((a, b) => Number(hasProvenanceMarker(a.name)) - Number(hasProvenanceMarker(b.name)));
    if (!canonical.length) continue;
    const keep = canonical[0]!;
    for (const speaker of group) {
      if (speaker === keep || !isPlaceholder(speaker)) continue;
      // Preserve the placeholder's sessions on the surviving card.
      keep.sessionIds = [...new Set([...keep.sessionIds, ...speaker.sessionIds])];
      dropped.add(speaker.id);
    }
  }
  return list.filter((s) => !dropped.has(s.id));
}

/**
 * Single canonical published-program projection for every public widget + feed.
 * Only sessions with publishStatus === "published" and a schedule slot are included.
 * Speakers appear only when they sit on at least one such session and are not private.
 */
export function buildPublicProgram(
  schedule: ScheduleData | ScheduleProjection,
  meta?: { id?: string; slug?: string; location?: string; website?: string; name?: string },
): PublicProgram {
  const eventId = meta?.id || (schedule as ScheduleProjection).event?.id || EVENT_ID;
  const slug = meta?.slug || store.event.slug || EVENT_SLUG;
  const timezone = schedule.event?.timezone || store.event.timezone || "UTC";
  const rooms = new Map((schedule.rooms || []).map((r) => [r.id, r]));
  const tracks = new Map((schedule.tracks || []).map((t) => [t.id, t]));
  const speakersById = new Map((schedule.speakers || []).map((s) => [s.id, s]));

  const sessions: PublicSessionView[] = [];
  for (const slot of [...(schedule.slots || [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const session = schedule.sessions.find((s) => s.id === slot.sessionId);
    if (!isPublishedSession(session)) continue;
    const room = rooms.get(slot.roomId);
    const trackList = (session!.trackIds || [])
      .map((id) => tracks.get(id))
      .filter(Boolean)
      .map((t) => ({ id: t!.id, name: t!.name, color: t!.color }));
    const sessSpeakers = (session!.speakerIds || [])
      .map((id) => speakersById.get(id))
      .filter((sp): sp is ScheduleSpeaker => !!sp && sp.isPublic !== false)
      .map((sp) => speakerView(sp));
    const format =
      (session as ScheduleSession & { format?: string }).format ||
      (session!.durationMinutes && session!.durationMinutes >= 60 ? "Workshop" : "Talk");
    sessions.push({
      id: session!.id,
      slug: session!.slug || session!.id,
      title: session!.title,
      abstract: session!.abstract || "",
      format,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      dayKey: dayKeyOf(slot.startsAt, timezone),
      room: room?.name || "TBA",
      roomId: slot.roomId,
      tracks: trackList,
      trackNames: trackList.map((t) => t.name),
      speakers: sessSpeakers,
    });
  }

  // Published sessions without a slot: visible in the catalog as "Time TBA".
  const slottedIds = new Set((schedule.slots || []).map((s) => s.sessionId));
  const unscheduledSessions: PublicSessionView[] = (schedule.sessions || [])
    .filter((session) => !slottedIds.has(session.id) && isPublishedSession(session))
    .map((session) => {
      const trackList = (session.trackIds || [])
        .map((id) => tracks.get(id))
        .filter(Boolean)
        .map((t) => ({ id: t!.id, name: t!.name, color: t!.color }));
      return {
        id: session.id,
        slug: session.slug || session.id,
        title: session.title,
        abstract: session.abstract || "",
        format:
          (session as ScheduleSession & { format?: string }).format ||
          (session.durationMinutes && session.durationMinutes >= 60 ? "Workshop" : "Talk"),
        startsAt: "",
        endsAt: "",
        dayKey: "",
        room: "TBA",
        roomId: "",
        tracks: trackList,
        trackNames: trackList.map((t) => t.name),
        speakers: (session.speakerIds || [])
          .map((id) => speakersById.get(id))
          .filter((sp): sp is ScheduleSpeaker => !!sp && sp.isPublic !== false)
          .map((sp) => speakerView(sp)),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const speakerSessionMap = new Map<string, string[]>();
  for (const sess of [...sessions, ...unscheduledSessions]) {
    for (const sp of sess.speakers) {
      const list = speakerSessionMap.get(sp.id) || [];
      list.push(sess.id);
      speakerSessionMap.set(sp.id, list);
    }
  }

  // Directory order is surname A→Z (the public page states this explicitly).
  const speakers = dedupePublicSpeakers(
    [...speakerSessionMap.keys()].map((id) => {
      const raw = speakersById.get(id)!;
      return speakerView(raw, speakerSessionMap.get(id) || []);
    }),
  ).sort(bySurname);

  const sessionDays = [...new Set(sessions.map((s) => s.dayKey))];
  const startsAt = schedule.event?.startsAt || store.event.startsAt;
  const endsAt = schedule.event?.endsAt || store.event.endsAt;
  // Always expose every civil day in the event window (even if empty) so agenda nav reaches day 3.
  const rangeDays = eventRangeDayKeys(startsAt, endsAt, timezone);
  const days = [...new Set([...rangeDays, ...sessionDays])].sort();
  const formats = [...new Set(sessions.map((s) => s.format).filter(Boolean))].sort();
  const trackNames = [...new Set(sessions.flatMap((s) => s.trackNames))].sort();
  const roomNames = [...new Set(sessions.map((s) => s.room))].sort();
  const gateView = (session: ScheduleSession): PublicationGateSession => {
    const slot = (schedule.slots || []).find((candidate) => candidate.sessionId === session.id);
    const room = slot ? rooms.get(slot.roomId) : undefined;
    return {
      id: session.id,
      title: session.title,
      dayKey: slot ? dayKeyOf(slot.startsAt, timezone) : undefined,
      trackNames: (session.trackIds || []).map((id) => tracks.get(id)?.name).filter((name): name is string => !!name),
      format: (session as ScheduleSession & { format?: string }).format || (session.durationMinutes && session.durationMinutes >= 60 ? "Workshop" : "Talk"),
      room: room?.name,
    };
  };
  const publicationGate = {
    included: (schedule.sessions || []).filter(isPublishedSession).map(gateView),
    excluded: (schedule.sessions || []).filter((s) => !isPublishedSession(s)).map(gateView),
  };

  return {
    event: {
      id: eventId,
      slug,
      name: meta?.name || (schedule.event as { name?: string } | undefined)?.name || store.event.name,
      timezone,
      startsAt,
      endsAt,
      location: meta?.location || store.event.location || "",
      website: meta?.website || store.event.website || "",
    },
    sessions,
    unscheduledSessions,
    speakers,
    days,
    rooms: (schedule.rooms || []).map((r) => ({ id: r.id, name: r.name, color: r.color })),
    tracks: (schedule.tracks || []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
    formats,
    facets: { tracks: trackNames, formats, rooms: roomNames },
    publicationGate,
  };
}

/** Canonical directory ordering: surname, then first name, then full name.
 *
 * Locale-aware (accents and case fold together) and TOTAL: the trailing id
 * comparison makes the order deterministic and stable for runtime-added
 * speakers who share a name, independent of insertion order. */
export function bySurname(a: PublicSpeakerView, b: PublicSpeakerView) {
  return (
    nameCollator.compare(a.lastName, b.lastName) ||
    nameCollator.compare(a.firstName, b.firstName) ||
    nameCollator.compare(a.name, b.name) ||
    String(a.id).localeCompare(String(b.id))
  );
}

export type SessionQuery = {
  q?: string;
  track?: string;
  format?: string;
  room?: string;
  day?: string;
};

/** Filter published sessions by keyword (title + speaker names) and facets. */
export function filterPublicSessions(program: PublicProgram, query: SessionQuery = {}) {
  const q = (query.q || "").trim().toLowerCase();
  const track = (query.track || "").trim().toLowerCase();
  const format = (query.format || "").trim().toLowerCase();
  const room = (query.room || "").trim().toLowerCase();
  const day = (query.day || "").trim();

  const sessions = program.sessions.filter((s) => {
    if (day && s.dayKey !== day) return false;
    if (track && !s.trackNames.some((t) => t.toLowerCase() === track)) return false;
    if (format && s.format.toLowerCase() !== format) return false;
    if (room && s.room.toLowerCase() !== room) return false;
    if (!q) return true;
    const hay = [
      s.title,
      s.abstract,
      s.format,
      s.room,
      ...s.trackNames,
      ...s.speakers.map((sp) => `${sp.name} ${sp.company || ""} ${sp.title || ""}`),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return {
    total: program.sessions.length,
    count: sessions.length,
    sessions,
    facets: program.facets,
  };
}

export function filterPublicSpeakers(program: PublicProgram, qRaw = "") {
  const q = qRaw.trim().toLowerCase();
  const speakers = !q
    ? program.speakers
    : program.speakers.filter((sp) => {
        const hay = `${sp.name} ${sp.company || ""} ${sp.title || ""} ${sp.bio || ""}`.toLowerCase();
        return hay.includes(q);
      });
  return { total: program.speakers.length, count: speakers.length, speakers };
}

export function sessionsForSpeaker(program: PublicProgram, speakerId: string) {
  return program.sessions.filter((s) => s.speakers.some((sp) => sp.id === speakerId));
}

/** Sessions per calendar day, so the agenda can advertise where content actually is. */
export function agendaDayCounts(program: PublicProgram) {
  return program.days.map((day) => ({ day, count: program.sessions.filter((s) => s.dayKey === day).length }));
}

export function agendaByDay(program: PublicProgram, dayKey?: string) {
  // Default to the first day that HAS sessions: blindly showing day 1 made an edit on a
  // later day look like the agenda had not updated at all.
  const firstPopulated = program.days.find((d) => program.sessions.some((s) => s.dayKey === d));
  const day = dayKey && program.days.includes(dayKey) ? dayKey : firstPopulated || program.days[0];
  const sessions = day ? program.sessions.filter((s) => s.dayKey === day) : [];
  const rooms = program.rooms.filter((r) => sessions.some((s) => s.roomId === r.id));
  const times = [...new Set(sessions.map((s) => s.startsAt))].sort();
  return { day, days: program.days, sessions, rooms: rooms.length ? rooms : program.rooms, times };
}

export function toIcsDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export function buildIcs(program: PublicProgram, sessionIds?: string[]): string {
  const want = sessionIds?.length ? new Set(sessionIds) : null;
  const rows = program.sessions.filter((s) => !want || want.has(s.id));
  const escape = (value: string) =>
    String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const events = rows
    .map((s) => {
      const desc = [s.abstract, `Track: ${s.trackNames.join(" · ") || "General"}`, `Speakers: ${s.speakers.map((x) => x.name).join(", ")}`]
        .filter(Boolean)
        .join("\\n");
      return [
        "BEGIN:VEVENT",
        `UID:${s.id}@${program.event.slug}.cue.local`,
        `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
        `DTSTART:${toIcsDate(s.startsAt)}`,
        `DTEND:${toIcsDate(s.endsAt)}`,
        `SUMMARY:${escape(s.title)}`,
        `DESCRIPTION:${escape(desc)}`,
        `LOCATION:${escape([s.room, program.event.location].filter(Boolean).join(", "))}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `PRODID:-//CUE//${escape(program.event.name)}//EN`,
    `X-WR-CALNAME:${escape(program.event.name)}`,
    events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Resolve demo event id/slug aliases to the schedule event id. */
export function resolvePublicEventKey(key: string): { eventId: string; slug: string } | undefined {
  const k = decodeURIComponent(key || "").trim().toLowerCase();
  if (!k) return undefined;
  if (k === EVENT_ID.toLowerCase() || k === EVENT_SLUG.toLowerCase() || k === store.event.slug.toLowerCase() || k === store.event.id.toLowerCase()) {
    // The seeded event answers to its id, its slug, and the legacy demo aliases.
    return k === store.event.id.toLowerCase() || k === store.event.slug.toLowerCase()
      ? { eventId: store.event.id, slug: store.event.slug || EVENT_SLUG }
      : { eventId: EVENT_ID, slug: EVENT_SLUG };
  }
  // Any other registered event resolves by its own id or slug.
  for (const record of listEvents()) {
    if (k === record.id.toLowerCase() || k === record.slug.toLowerCase()) return { eventId: record.id, slug: record.slug };
  }
  return undefined;
}
