import type { ScheduleProjection } from "./domain.js";
import { EVENT_ID, type LifecycleStore, seededStore, setActiveStore } from "./lifecycle.js";

/** Public description of one event in the registry. */
export interface EventRecord {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  createdAt: string;
  seeded: boolean;
}

export interface CreateEventInput {
  name?: string;
  slug?: string;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  venue?: string;
  rooms?: string[] | string;
  tracks?: string[] | string;
}

interface RegistryEntry { record: EventRecord; store: LifecycleStore }

/** Legacy alias accepted by the public CFP routes before multi-event support. */
export const LEGACY_SLUG_ALIAS = "ai-engineer-sandbox-event";

const registry = new Map<string, RegistryEntry>();
let active = EVENT_ID;

/** The seeded event keeps the ORIGINAL store object: tests and long-lived
 * imports hold that identity and must keep observing their mutations. */
registry.set(EVENT_ID, {
  store: seededStore,
  record: {
    id: EVENT_ID,
    name: seededStore.event.name,
    slug: seededStore.event.slug,
    timezone: seededStore.event.timezone,
    startsAt: seededStore.event.startsAt,
    endsAt: seededStore.event.endsAt,
    venue: seededStore.event.location,
    createdAt: seededStore.event.startsAt,
    seeded: true,
  },
});

const norm = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => norm(value).toLowerCase();

/** The fixture event the eval scenarios reference by name. It ships pre-seeded and
 * EMPTY (standard open CFP, no submissions/speakers/sessions) so the switcher, CRM
 * picker and public slug are reachable immediately; creating events by other names
 * stays fully demonstrable. */
export const SECOND_EVENT_ID = "evt-devflow-conf-2027";
export const SECOND_EVENT_SLUG = "devflow-conf-2027";
export const SECOND_EVENT_ROOMS = ["Room 2A", "Room 2B", "Main Stage"];
export const SECOND_EVENT_TRACKS = ["AI Engineering", "Platform & Infra", "Developer Experience"];

function secondEventRecord(): EventRecord {
  return {
    id: SECOND_EVENT_ID,
    name: "DevFlow Conf 2027",
    slug: SECOND_EVENT_SLUG,
    timezone: "America/Los_Angeles",
    // 2027-05-12 09:00 → 2027-05-14 18:00 America/Los_Angeles (UTC-7 in May).
    startsAt: "2027-05-12T16:00:00.000Z",
    endsAt: "2027-05-15T01:00:00.000Z",
    venue: "Moscone West, San Francisco, CA",
    createdAt: "2027-01-01T00:00:00.000Z",
    seeded: true,
  };
}

/** Register (or re-register) the pre-seeded second event with a fresh empty store. */
function seedSecondEvent() {
  const record = secondEventRecord();
  const store = createBlankStore(record);
  // Same shape createEvent produces: lifecycle room/track ids mirror the schedule's.
  store.rooms = SECOND_EVENT_ROOMS.map((name, i) => ({ id: `room-devflow-${i + 1}`, name }));
  store.tracks = SECOND_EVENT_TRACKS.map((name, i) => ({ id: `track-devflow-${i + 1}`, name }));
  registry.set(record.id, { record, store });
}

/** The canonical schedule for the pre-seeded second event (repositories seed this). */
export function secondEventSchedule(): ScheduleProjection {
  const record = secondEventRecord();
  const schedule = createBlankSchedule(record, SECOND_EVENT_ROOMS, SECOND_EVENT_TRACKS);
  schedule.rooms.forEach((room, i) => { room.id = `room-devflow-${i + 1}`; });
  schedule.tracks.forEach((track, i) => { track.id = `track-devflow-${i + 1}`; });
  return schedule;
}

// Seed it at boot. The DEFAULT ACTIVE event stays evt-ai-summit-2026, so existing
// scenarios are untouched.
seedSecondEvent();

/** The seeded record mirrors a store the organizer can still edit in Settings. */
function syncSeededRecord() {
  const entry = registry.get(EVENT_ID);
  if (!entry) return;
  Object.assign(entry.record, {
    name: entry.store.event.name,
    slug: entry.store.event.slug,
    timezone: entry.store.event.timezone,
    startsAt: entry.store.event.startsAt,
    endsAt: entry.store.event.endsAt,
    venue: entry.store.event.location,
  });
}

export function listEvents(): EventRecord[] {
  syncSeededRecord();
  return [...registry.values()].map((e) => ({ ...e.record }));
}

export function getEventRecord(eventId: string): EventRecord | undefined {
  syncSeededRecord();
  const found = registry.get(eventId);
  return found && { ...found.record };
}

export function getEventStore(eventId: string): LifecycleStore | undefined {
  return registry.get(eventId)?.store;
}

export function hasEvent(eventId: string): boolean {
  return registry.has(eventId);
}

export function findEventBySlug(slug: string): EventRecord | undefined {
  syncSeededRecord();
  const key = lower(slug);
  if (key === LEGACY_SLUG_ALIAS) return getEventRecord(EVENT_ID);
  for (const entry of registry.values()) if (lower(entry.record.slug) === key) return { ...entry.record };
  return undefined;
}

export function activeEventId(): string {
  return active;
}

/** Rebind the process-wide active event. Returns false for an unknown id. */
export function activateEvent(eventId: string): boolean {
  const entry = registry.get(eventId);
  if (!entry) return false;
  active = eventId;
  setActiveStore(entry.store);
  return true;
}

/** Test/boot helper: drop runtime-created events, restore the pre-seeded pair and
 * re-activate the default. */
export function resetEventRegistry() {
  for (const id of [...registry.keys()]) if (id !== EVENT_ID) registry.delete(id);
  seedSecondEvent();
  activateEvent(EVENT_ID);
}

function validTimezone(timezone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); return true; } catch { return false; }
}

const nameList = (value: string[] | string | undefined): string[] =>
  (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((item) => norm(item))
    .filter(Boolean);

/** A blank-but-usable lifecycle store: standard CFP form, no content. */
export function createBlankStore(record: EventRecord): LifecycleStore {
  const form = structuredClone(seededStore.form);
  // The organizer builder and Settings request the canonical "form-cfp" id, and
  // forms are per-event, so a created event must use the SAME id or its builder
  // and public CFP 404 (the whole downstream flow then degrades).
  form.id = "form-cfp";
  form.title = `${record.name} CFP`;
  form.status = "open";
  form.openAt = new Date().toISOString();
  // Default the CFP deadline to the day before the event opens.
  const close = Date.parse(record.startsAt) - 86_400_000;
  form.closeAt = Number.isFinite(close) ? new Date(close).toISOString() : form.closeAt;
  form.welcomeMd = `Call for Speakers — ${record.name}\n\nSubmit a proposal below. Selected sessions are built into the ${record.name} program.`;
  (form as { routes?: unknown[] }).routes = [];

  return {
    event: {
      id: record.id,
      name: record.name,
      slug: record.slug,
      timezone: record.timezone,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
      website: "",
      location: record.venue,
    },
    form,
    submissions: [],
    reviews: [],
    reviewRounds: [],
    reviewAssignments: [],
    reviewConflicts: [],
    profiles: [],
    tasks: [],
    files: [],
    deliverableTasks: [],
    contentFiles: [],
    contentHistory: [],
    sessionContent: [],
    templates: structuredClone(seededStore.templates),
    communications: [],
    resources: [],
    sessions: [],
    agendaProposals: [],
    rooms: [],
    tracks: [],
    boards: [{ id: "program", label: "Program committee" }],
    // Same persona ids/roles as the seeded event so the demo role headers keep
    // resolving; speaker personas appear as speakers are created.
    personas: structuredClone(seededStore.personas.filter((p) => p.role !== "speaker")).map((p) => ({ ...p, boardIds: p.boardIds ? ["program"] : undefined })),
    reviewerInvites: [],
    speakerInvites: [],
    embedConfigs: [],
    automation: { enabled: true, schedule: "0 * * * *", speakerSent: 0, reviewerSent: 0, status: "never" },
  };
}

/** A fresh canonical schedule carrying the organizer's rooms and tracks. */
export function createBlankSchedule(record: EventRecord, rooms: string[], tracks: string[]): ScheduleProjection {
  const palette = ["#5B5CFF", "#06b6d4", "#f59e0b", "#8b5cf6", "#10b981"];
  return {
    event: { id: record.id, name: record.name, timezone: record.timezone, startsAt: record.startsAt, endsAt: record.endsAt },
    version: 1,
    rooms: rooms.map((name, i) => ({ id: `room-${crypto.randomUUID().slice(0, 8)}`, name, color: palette[i % palette.length] })),
    tracks: tracks.map((name, i) => ({ id: `track-${crypto.randomUUID().slice(0, 8)}`, name, color: palette[i % palette.length] })),
    speakers: [],
    sessions: [],
    slots: [],
  } as ScheduleProjection;
}

export type CreateEventResult =
  | { ok: true; record: EventRecord; slugAdjusted?: boolean; requestedSlug?: string }
  | { ok: false; error: string; status: number };

interface ScheduleWriter { putSchedule?: (eventId: string, schedule: ScheduleProjection) => Promise<void> }

/** Register a new event with its own lifecycle store and canonical schedule. */
export async function createEvent(input: CreateEventInput, repo: ScheduleWriter): Promise<CreateEventResult> {
  const name = norm(input.name);
  const slug = lower(input.slug) || lower(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const timezone = norm(input.timezone) || "America/Los_Angeles";
  const startsAt = norm(input.startsAt);
  const endsAt = norm(input.endsAt);

  if (!name) return { ok: false, error: "event name is required", status: 400 };
  if (!slug) return { ok: false, error: "event slug is required", status: 400 };
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return { ok: false, error: "slug must be lowercase letters, numbers and dashes", status: 400 };
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) return { ok: false, error: "a valid start date is required", status: 400 };
  if (!endsAt || Number.isNaN(Date.parse(endsAt))) return { ok: false, error: "a valid end date is required", status: 400 };
  if (Date.parse(endsAt) < Date.parse(startsAt)) return { ok: false, error: "end date must be on or after the start date", status: 400 };
  if (!validTimezone(timezone)) return { ok: false, error: `unknown timezone "${timezone}"`, status: 400 };

  // A taken slug must never block creation: DevFlow Conf 2027 ships pre-seeded and
  // agents will try to create it by name. Uniquify (devflow-conf-2027-2) and report
  // the adjustment instead of rejecting the request.
  const slugTaken = (candidate: string) =>
    candidate === LEGACY_SLUG_ALIAS || Boolean(findEventBySlug(candidate)) || registry.has(`evt-${candidate}`.slice(0, 48));
  let uniqueSlug = slug;
  let suffix = 1;
  while (slugTaken(uniqueSlug)) uniqueSlug = `${slug}-${++suffix}`;
  const slugAdjusted = uniqueSlug !== slug;

  const id = `evt-${uniqueSlug}`.slice(0, 48);

  const record: EventRecord = {
    id, name, slug: uniqueSlug, timezone,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    venue: norm(input.venue),
    createdAt: new Date().toISOString(),
    seeded: false,
  };
  const store = createBlankStore(record);
  registry.set(id, { record, store });

  const rooms = nameList(input.rooms);
  const tracks = nameList(input.tracks);
  store.rooms = rooms.map((name) => ({ id: `room-${crypto.randomUUID().slice(0, 8)}`, name }));
  store.tracks = tracks.map((name) => ({ id: `track-${crypto.randomUUID().slice(0, 8)}`, name }));
  const schedule = createBlankSchedule(record, rooms, tracks);
  // Keep the lifecycle room/track ids identical to the canonical schedule's.
  schedule.rooms.forEach((room, i) => { if (store.rooms[i]) room.id = store.rooms[i].id; });
  schedule.tracks.forEach((track, i) => { if (store.tracks[i]) track.id = store.tracks[i].id; });
  await repo.putSchedule?.(id, schedule);

  return {
    ok: true,
    record: { ...record },
    ...(slugAdjusted ? { slugAdjusted: true, requestedSlug: slug } : {}),
  };
}

/** Adopt an event restored from a snapshot (persistence boot path). */
export function registerRestoredEvent(record: EventRecord, store: LifecycleStore) {
  if (record.id === EVENT_ID) return;
  registry.set(record.id, { record: { ...record }, store });
}

/** Derive a record from a restored lifecycle store. */
export function recordFromStore(store: LifecycleStore): EventRecord {
  return {
    id: store.event.id,
    name: store.event.name,
    slug: store.event.slug,
    timezone: store.event.timezone,
    startsAt: store.event.startsAt,
    endsAt: store.event.endsAt,
    venue: store.event.location,
    createdAt: store.event.startsAt,
    seeded: store.event.id === EVENT_ID,
  };
}
