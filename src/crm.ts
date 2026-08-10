import { EVENT_ID, store, type LifecycleStore, type Role } from "./lifecycle.js";

export type CrmStage = "prospect" | "contacted" | "invited" | "confirmed" | "alumni" | "declined";

export const CRM_STAGES: { id: CrmStage; label: string; order: number }[] = [
  { id: "prospect", label: "Prospect", order: 0 },
  { id: "contacted", label: "Contacted", order: 1 },
  { id: "invited", label: "Invited", order: 2 },
  { id: "confirmed", label: "Confirmed", order: 3 },
  { id: "alumni", label: "Alumni", order: 4 },
  { id: "declined", label: "Declined", order: 5 },
];

/** Allowed forward/side moves; declined is terminal-ish but can re-open to prospect. */
export const CRM_STAGE_TRANSITIONS: Record<CrmStage, CrmStage[]> = {
  prospect: ["contacted", "invited", "declined"],
  contacted: ["invited", "prospect", "declined"],
  invited: ["confirmed", "contacted", "declined"],
  confirmed: ["alumni", "invited", "declined"],
  alumni: ["prospect", "invited"],
  declined: ["prospect", "contacted"],
};

export interface CrmNote {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface CrmStageEvent {
  id: string;
  from: CrmStage | null;
  to: CrmStage;
  at: string;
  byId?: string;
  byName?: string;
  note?: string;
}

export interface CrmEventLink {
  eventId: string;
  eventName: string;
  role: string;
  speakerId?: string;
  status: string;
  linkedAt: string;
}

export interface CrmContact {
  id: string;
  name: string;
  email: string;
  title?: string;
  company?: string;
  bio?: string;
  tags: string[];
  customFields: Record<string, string>;
  notes: CrmNote[];
  stage: CrmStage;
  stageHistory: CrmStageEvent[];
  eventHistory: CrmEventLink[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmSegment {
  id: string;
  name: string;
  description?: string;
  filters: CrmContactQuery;
  createdAt: string;
}

export interface CrmCampaignSend {
  contactId: string;
  email: string;
  status: "mock_sent" | "sent" | "failed";
  error?: string;
}

export interface CrmCampaign {
  id: string;
  subject: string;
  body: string;
  templateKey?: string;
  createdAt: string;
  sends: CrmCampaignSend[];
}

/**
 * Typed CRM custom field definition (Settings-level). "select" fields render as a
 * dropdown on contact profiles and only accept one of their configured options.
 */
export interface CrmFieldDefinition {
  key: string;
  label: string;
  type: "text" | "select";
  options: string[];
  createdAt: string;
}

export interface CrmState {
  contacts: CrmContact[];
  segments: CrmSegment[];
  campaigns: CrmCampaign[];
  /** Optional: older snapshots restore without it (see ensureCrm). */
  fieldDefinitions?: CrmFieldDefinition[];
}

export type CrmContactQuery = {
  q?: string;
  tag?: string;
  company?: string;
  stage?: string;
  tagsAny?: string[];
};

const now = () => new Date().toISOString();
const id = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export function emptyCrmState(): CrmState {
  // Ship one worked example (Speaker Type: Internal/External) so the typed-field
  // workflow is discoverable instead of an empty configuration screen.
  return { contacts: [], segments: [], campaigns: [], fieldDefinitions: [...DEFAULT_CRM_FIELD_DEFINITIONS] };
}

export function ensureCrm(life: LifecycleStore = store): CrmState {
  const anyStore = life as LifecycleStore & { crm?: CrmState };
  if (!anyStore.crm) anyStore.crm = emptyCrmState();
  if (!Array.isArray(anyStore.crm.contacts)) anyStore.crm.contacts = [];
  if (!Array.isArray(anyStore.crm.segments)) anyStore.crm.segments = [];
  if (!Array.isArray(anyStore.crm.campaigns)) anyStore.crm.campaigns = [];
  if (!Array.isArray(anyStore.crm.fieldDefinitions)) anyStore.crm.fieldDefinitions = [...DEFAULT_CRM_FIELD_DEFINITIONS];
  return anyStore.crm;
}

export function normalizeEmail(email: string) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function createContact(
  input: {
    name?: string;
    email?: string;
    title?: string;
    company?: string;
    bio?: string;
    tags?: string[];
    customFields?: Record<string, string>;
    stage?: CrmStage;
  },
  actor?: { id: string; name: string },
): { ok: true; contact: CrmContact } | { ok: false; error: string } {
  const name = String(input.name || "").trim();
  const email = normalizeEmail(input.email || "");
  if (!name) return { ok: false, error: "name is required" };
  if (!isValidEmail(email)) return { ok: false, error: "valid email is required" };
  const crm = ensureCrm();
  if (crm.contacts.some((c) => normalizeEmail(c.email) === email)) {
    return { ok: false, error: "a contact with this email already exists" };
  }
  const stage: CrmStage = input.stage && CRM_STAGES.some((s) => s.id === input.stage) ? input.stage! : "prospect";
  const ts = now();
  const contact: CrmContact = {
    id: id("crm"),
    name,
    email,
    title: input.title?.trim() || undefined,
    company: input.company?.trim() || undefined,
    bio: input.bio?.trim() || undefined,
    tags: uniqueTags(input.tags || []),
    customFields: { ...(input.customFields || {}) },
    notes: [],
    stage,
    stageHistory: [
      {
        id: id("stage"),
        from: null,
        to: stage,
        at: ts,
        byId: actor?.id,
        byName: actor?.name,
        note: "Created",
      },
    ],
    eventHistory: [],
    createdAt: ts,
    updatedAt: ts,
  };
  crm.contacts.unshift(contact);
  return { ok: true, contact };
}

export function updateContact(
  contactId: string,
  patch: Partial<Pick<CrmContact, "name" | "email" | "title" | "company" | "bio" | "tags" | "customFields">>,
): { ok: true; contact: CrmContact } | { ok: false; error: string } {
  const crm = ensureCrm();
  const contact = crm.contacts.find((c) => c.id === contactId);
  if (!contact) return { ok: false, error: "contact not found" };
  if (patch.email != null) {
    const email = normalizeEmail(patch.email);
    if (!isValidEmail(email)) return { ok: false, error: "valid email is required" };
    if (crm.contacts.some((c) => c.id !== contactId && normalizeEmail(c.email) === email)) {
      return { ok: false, error: "a contact with this email already exists" };
    }
    contact.email = email;
  }
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) return { ok: false, error: "name is required" };
    contact.name = name;
  }
  if (patch.title !== undefined) contact.title = String(patch.title || "").trim() || undefined;
  if (patch.company !== undefined) contact.company = String(patch.company || "").trim() || undefined;
  if (patch.bio !== undefined) contact.bio = String(patch.bio || "").trim() || undefined;
  if (patch.tags) contact.tags = uniqueTags(patch.tags);
  if (patch.customFields) {
    const checked = validateCustomFields(patch.customFields);
    if (!checked.ok) return { ok: false, error: checked.error };
    contact.customFields = { ...contact.customFields, ...checked.values };
  }
  contact.updatedAt = now();
  return { ok: true, contact };
}

export function deleteContact(contactId: string) {
  const crm = ensureCrm();
  const i = crm.contacts.findIndex((c) => c.id === contactId);
  if (i < 0) return false;
  crm.contacts.splice(i, 1);
  return true;
}

export function addNote(
  contactId: string,
  body: string,
  actor: { id: string; name: string },
): { ok: true; note: CrmNote; contact: CrmContact } | { ok: false; error: string } {
  const crm = ensureCrm();
  const contact = crm.contacts.find((c) => c.id === contactId);
  if (!contact) return { ok: false, error: "contact not found" };
  const text = String(body || "").trim();
  if (!text) return { ok: false, error: "note body is required" };
  const note: CrmNote = {
    id: id("note"),
    body: text,
    authorId: actor.id,
    authorName: actor.name,
    createdAt: now(),
  };
  contact.notes.unshift(note);
  contact.updatedAt = now();
  return { ok: true, note, contact };
}

export function canTransition(from: CrmStage, to: CrmStage) {
  if (from === to) return true;
  return (CRM_STAGE_TRANSITIONS[from] || []).includes(to);
}

export function moveStage(
  contactId: string,
  to: CrmStage,
  actor?: { id: string; name: string },
  note?: string,
): { ok: true; contact: CrmContact } | { ok: false; error: string } {
  const crm = ensureCrm();
  const contact = crm.contacts.find((c) => c.id === contactId);
  if (!contact) return { ok: false, error: "contact not found" };
  if (!CRM_STAGES.some((s) => s.id === to)) return { ok: false, error: "invalid stage" };
  if (!canTransition(contact.stage, to)) {
    return { ok: false, error: `cannot move from ${contact.stage} to ${to}` };
  }
  if (contact.stage === to) return { ok: true, contact };
  const from = contact.stage;
  contact.stage = to;
  contact.stageHistory.push({
    id: id("stage"),
    from,
    to,
    at: now(),
    byId: actor?.id,
    byName: actor?.name,
    note: note?.trim() || undefined,
  });
  contact.updatedAt = now();
  return { ok: true, contact };
}

export function filterContacts(query: CrmContactQuery = {}, life: LifecycleStore = store): CrmContact[] {
  const crm = ensureCrm(life);
  const q = (query.q || "").trim().toLowerCase();
  const tag = (query.tag || "").trim().toLowerCase();
  const company = (query.company || "").trim().toLowerCase();
  const stage = (query.stage || "").trim().toLowerCase();
  const tagsAny = (query.tagsAny || []).map((t) => t.toLowerCase()).filter(Boolean);
  return crm.contacts.filter((c) => {
    if (stage && c.stage !== stage) return false;
    if (company && (c.company || "").toLowerCase() !== company) return false;
    if (tag && !c.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (tagsAny.length && !tagsAny.some((t) => c.tags.some((x) => x.toLowerCase() === t))) return false;
    if (!q) return true;
    const hay = [c.name, c.email, c.title, c.company, c.bio, c.tags.join(" "), Object.values(c.customFields).join(" ")]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function saveSegment(input: {
  id?: string;
  name: string;
  description?: string;
  filters: CrmContactQuery;
}): { ok: true; segment: CrmSegment } | { ok: false; error: string } {
  const name = String(input.name || "").trim();
  if (!name) return { ok: false, error: "segment name is required" };
  const crm = ensureCrm();
  const existing = input.id ? crm.segments.find((s) => s.id === input.id) : undefined;
  if (existing) {
    existing.name = name;
    existing.description = input.description?.trim() || undefined;
    existing.filters = { ...input.filters };
    return { ok: true, segment: existing };
  }
  const segment: CrmSegment = {
    id: id("seg"),
    name,
    description: input.description?.trim() || undefined,
    filters: { ...input.filters },
    createdAt: now(),
  };
  crm.segments.unshift(segment);
  return { ok: true, segment };
}

export function deleteSegment(segmentId: string) {
  const crm = ensureCrm();
  const i = crm.segments.findIndex((s) => s.id === segmentId);
  if (i < 0) return false;
  crm.segments.splice(i, 1);
  return true;
}

export type CsvImportRowResult = {
  row: number;
  raw: Record<string, string>;
  ok: boolean;
  error?: string;
  duplicateOf?: string;
  contactId?: string;
  action?: "created" | "skipped" | "merged" | "would_create" | "would_merge";
};

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function pickField(row: Record<string, string>, keys: string[]) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
  }
  // fuzzy
  for (const [k, v] of Object.entries(row)) {
    if (keys.some((want) => k.replace(/[\s_]+/g, "") === want.replace(/[\s_]+/g, ""))) {
      if (String(v).trim()) return String(v).trim();
    }
  }
  return "";
}

export function validateCsvImport(text: string): CsvImportRowResult[] {
  const { rows } = parseCsv(text);
  const crm = ensureCrm();
  const seen = new Map<string, number>();
  return rows.map((raw, idx) => {
    const row = idx + 2; // header is 1
    const name =
      pickField(raw, ["name", "full name", "fullname"]) ||
      [pickField(raw, ["first name", "firstname", "first"]), pickField(raw, ["last name", "lastname", "last"])]
        .filter(Boolean)
        .join(" ")
        .trim();
    const email = normalizeEmail(pickField(raw, ["email", "e-mail", "mail"]));
    const title = pickField(raw, ["title", "job title", "jobtitle", "role"]);
    const company = pickField(raw, ["company", "org", "organization"]);
    const bio = pickField(raw, ["bio", "biography", "about"]);
    const normalized = { name, email, title, company, bio };
    if (!name) return { row, raw: normalized, ok: false, error: "name is required" };
    if (!isValidEmail(email)) return { row, raw: normalized, ok: false, error: "valid email is required" };
    if (seen.has(email)) {
      return {
        row,
        raw: normalized,
        ok: false,
        error: `duplicate email in file (also row ${seen.get(email)})`,
        action: "skipped",
      };
    }
    seen.set(email, row);
    const existing = crm.contacts.find((c) => normalizeEmail(c.email) === email);
    if (existing) {
      return {
        row,
        raw: normalized,
        ok: true,
        duplicateOf: existing.id,
        contactId: existing.id,
        action: "would_merge",
      };
    }
    return { row, raw: normalized, ok: true, action: "would_create" };
  });
}

export function commitCsvImport(
  text: string,
  opts: { mergeDuplicates?: boolean } = {},
  actor?: { id: string; name: string },
): { results: CsvImportRowResult[]; created: number; merged: number; skipped: number } {
  const validated = validateCsvImport(text);
  let created = 0;
  let merged = 0;
  let skipped = 0;
  const results: CsvImportRowResult[] = validated.map((r) => {
    if (!r.ok) {
      skipped++;
      return { ...r, action: "skipped" };
    }
    if (r.duplicateOf) {
      if (!opts.mergeDuplicates) {
        skipped++;
        return { ...r, ok: false, error: r.error || "duplicate email — merge required", action: "skipped" };
      }
      const patch = {
        name: r.raw.name,
        title: r.raw.title || undefined,
        company: r.raw.company || undefined,
        bio: r.raw.bio || undefined,
      };
      const updated = updateContact(r.duplicateOf, patch);
      if (!updated.ok) {
        skipped++;
        return { ...r, ok: false, error: updated.error, action: "skipped" };
      }
      if (actor) addNote(r.duplicateOf, `Merged from CSV import`, actor);
      merged++;
      return { ...r, ok: true, contactId: r.duplicateOf, action: "merged" };
    }
    const made = createContact(
      {
        name: r.raw.name,
        email: r.raw.email,
        title: r.raw.title,
        company: r.raw.company,
        bio: r.raw.bio,
        stage: "prospect",
        tags: ["imported"],
      },
      actor,
    );
    if (!made.ok) {
      skipped++;
      return { ...r, ok: false, error: made.error, action: "skipped" };
    }
    created++;
    return { ...r, ok: true, contactId: made.contact.id, action: "created" };
  });
  return { results, created, merged, skipped };
}

export function mergeContacts(
  primaryId: string,
  secondaryId: string,
  actor?: { id: string; name: string },
  life: LifecycleStore = store,
): { ok: true; contact: CrmContact } | { ok: false; error: string } {
  if (primaryId === secondaryId) return { ok: false, error: "cannot merge a contact with itself" };
  const crm = ensureCrm(life);
  const primary = crm.contacts.find((c) => c.id === primaryId);
  const secondary = crm.contacts.find((c) => c.id === secondaryId);
  if (!primary || !secondary) return { ok: false, error: "contact not found" };
  primary.title = primary.title || secondary.title;
  primary.company = primary.company || secondary.company;
  primary.bio = primary.bio || secondary.bio;
  primary.tags = uniqueTags([...primary.tags, ...secondary.tags]);
  primary.customFields = { ...secondary.customFields, ...primary.customFields };
  primary.notes = [...secondary.notes, ...primary.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  primary.stageHistory = [...primary.stageHistory, ...secondary.stageHistory].sort((a, b) => a.at.localeCompare(b.at));
  primary.eventHistory = dedupeEventHistory([...primary.eventHistory, ...secondary.eventHistory]);
  // Prefer more advanced stage
  const order = Object.fromEntries(CRM_STAGES.map((s) => [s.id, s.order])) as Record<CrmStage, number>;
  if (order[secondary.stage] > order[primary.stage] && canTransition(primary.stage, secondary.stage)) {
    const from=primary.stage;primary.stage=secondary.stage;primary.stageHistory.push({id:id("stage"),from,to:secondary.stage,at:now(),byId:actor?.id,byName:actor?.name,note:`Merged from ${secondary.email}`});
  }
  if (actor) addNote(primary.id, `Merged duplicate ${secondary.name} <${secondary.email}>`, actor);
  const secondaryIndex=crm.contacts.findIndex((contact)=>contact.id===secondaryId);
  if(secondaryIndex>=0)crm.contacts.splice(secondaryIndex,1);
  primary.updatedAt = now();
  return { ok: true, contact: primary };
}

export function addContactToEvent(
  contactId: string,
  opts: { eventId?: string; eventName?: string } = {},
  life: LifecycleStore = store,
): { ok: true; contact: CrmContact; speakerId: string; created: boolean } | { ok: false; error: string } {
  const crm = ensureCrm(life);
  const contact = crm.contacts.find((c) => c.id === contactId);
  if (!contact) return { ok: false, error: "contact not found" };
  const eventId = opts.eventId || life.event.id || EVENT_ID;
  const eventName = opts.eventName || life.event.name;
  const existingLink = contact.eventHistory.find((e) => e.eventId === eventId && e.speakerId);
  if (existingLink?.speakerId) {
    return { ok: true, contact, speakerId: existingLink.speakerId, created: false };
  }

  // Prefer matching profile by email
  let profile = life.profiles.find((p) => normalizeEmail(p.email) === normalizeEmail(contact.email));
  let speakerId = profile?.speakerId;
  let created = false;
  if (!speakerId) {
    speakerId = `spk-crm-${contact.id.slice(-8)}`;
    created = true;
    life.profiles.push({
      speakerId,
      name: contact.name,
      email: contact.email,
      bio: contact.bio || "",
      company: contact.company,
      title: contact.title,
    });
  } else if (profile) {
    // keep CRM fields authoritative when blank on profile
    if (!profile.bio && contact.bio) profile.bio = contact.bio;
    if (!profile.company && contact.company) profile.company = contact.company;
    if (!profile.title && contact.title) profile.title = contact.title;
    if (profile.name !== contact.name) profile.name = contact.name;
  }

  // Ensure an accepted submission + session draft so Speakers list shows them
  let sub = life.submissions.find((s) => s.speakerId === speakerId);
  if (!sub) {
    sub = {
      id: `sub-crm-${contact.id.slice(-8)}`,
      eventId,
      speakerId,
      name: contact.name,
      email: contact.email,
      title: contact.customFields.talkTitle || `${contact.name} (CRM)`,
      abstract: contact.bio || "Added from Speaker CRM",
      category: contact.customFields.track || "Engineering",
      format: "Talk",
      answers: { source: "crm" },
      status: "accepted",
      reviewBoard: "engineering",
      round: "final",
      createdAt: now(),
    };
    life.submissions.unshift(sub);
  } else if (sub.status !== "accepted") {
    sub.status = "accepted";
  }

  if (!life.sessions.some((s) => s.speakerId === speakerId)) {
    const track =
      life.tracks.find((t) => t.name.toLowerCase() === (sub!.category || "").toLowerCase())?.id ||
      life.tracks[0]?.id ||
      "track-eng";
    life.sessions.push({
      id: `ses-crm-${contact.id.slice(-8)}`,
      submissionId: sub.id,
      speakerId,
      title: sub.title,
      abstract: sub.abstract,
      status: "draft",
      trackId: track,
    });
  }

  contact.eventHistory.push({
    eventId,
    eventName,
    role: "speaker",
    speakerId,
    status: "accepted",
    linkedAt: now(),
  });
  if (contact.stage === "prospect" || contact.stage === "contacted" || contact.stage === "invited") {
    moveStage(contact.id, "confirmed", undefined, `Added to ${eventName}`);
  }
  contact.updatedAt = now();
  return { ok: true, contact, speakerId, created };
}

export function syncEventSpeakersIntoCrm(life: LifecycleStore = store) {
  const crm = ensureCrm(life);
  let linked = 0;
  for (const sub of life.submissions.filter((s) => s.status === "accepted")) {
    const email = normalizeEmail(sub.email);
    if (!email) continue;
    let contact = crm.contacts.find((c) => normalizeEmail(c.email) === email);
    if (!contact) {
      const profile = life.profiles.find((p) => p.speakerId === sub.speakerId);
      const made = createContact(
        {
          name: sub.name || profile?.name || email,
          email,
          title: profile?.title,
          company: profile?.company,
          bio: profile?.bio,
          tags: ["event-speaker", sub.category].filter(Boolean) as string[],
          stage: "confirmed",
        },
        { id: "system", name: "CUE" },
      );
      if (!made.ok) continue;
      contact = made.contact;
    }
    if (!contact.eventHistory.some((e) => e.eventId === life.event.id && e.speakerId === sub.speakerId)) {
      contact.eventHistory.push({
        eventId: life.event.id,
        eventName: life.event.name,
        role: "speaker",
        speakerId: sub.speakerId,
        status: sub.status,
        linkedAt: now(),
      });
      linked++;
    }
    if (contact.stage === "prospect" || contact.stage === "contacted") {
      moveStage(contact.id, "confirmed", { id: "system", name: "CUE" }, "Synced from accepted speakers");
    }
  }
  return { contacts: crm.contacts.length, linked };
}

export function renderCrmTemplate(
  template: string,
  contact: CrmContact,
  extras: Record<string, string> = {},
) {
  const vars: Record<string, string> = {
    first_name: contact.name.split(/\s+/)[0] || contact.name,
    name: contact.name,
    email: contact.email,
    title: contact.title || "",
    company: contact.company || "",
    event_name: store.event.name,
    ...extras,
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function recordCampaign(input: {
  subject: string;
  body: string;
  templateKey?: string;
  sends: CrmCampaignSend[];
}) {
  const crm = ensureCrm();
  const campaign: CrmCampaign = {
    id: id("camp"),
    subject: input.subject,
    body: input.body,
    templateKey: input.templateKey,
    createdAt: now(),
    sends: input.sends,
  };
  crm.campaigns.unshift(campaign);
  return campaign;
}

export function crmDashboard(life: LifecycleStore = store) {
  const crm = ensureCrm(life);
  const byStage = Object.fromEntries(CRM_STAGES.map((s) => [s.id, 0])) as Record<CrmStage, number>;
  for (const c of crm.contacts) byStage[c.stage] = (byStage[c.stage] || 0) + 1;
  const companies = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const c of crm.contacts) {
    if (c.company) companies.set(c.company, (companies.get(c.company) || 0) + 1);
    for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  return {
    totalContacts: crm.contacts.length,
    segments: crm.segments.length,
    campaigns: crm.campaigns.length,
    byStage,
    topCompanies: [...companies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    topTags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count })),
  };
}

function uniqueTags(tags: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = String(t || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function dedupeEventHistory(rows: CrmEventLink[]) {
  const seen = new Set<string>();
  const out: CrmEventLink[] = [];
  for (const r of rows) {
    const key = `${r.eventId}|${r.speakerId || ""}|${r.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Seed demo CRM data once (idempotent). */
export function seedCrmDemo(life: LifecycleStore = store) {
  const crm = ensureCrm(life);
  if (crm.contacts.length >= 6) {
    syncEventSpeakersIntoCrm(life);
    return crm;
  }

  const demo: Array<{
    name: string;
    email: string;
    title: string;
    company: string;
    bio: string;
    tags: string[];
    stage: CrmStage;
    note: string;
    customFields?: Record<string, string>;
  }> = [
    {
      name: "Priya Raman",
      email: "priya.speaker@sbek-test.example.com",
      title: "Principal Engineer",
      company: "Latticework Systems",
      bio: "Build systems and monorepo CI specialist.",
      tags: ["platform", "ci", "returning"],
      stage: "invited",
      note: "Strong abstract on incremental builds.",
      customFields: { region: "Bay Area", fee: "standard" },
    },
    {
      name: "Marcus Okafor",
      email: "marcus.speaker@sbek-test.example.com",
      title: "Staff Developer Advocate",
      company: "Cloudreach Labs",
      bio: "AI agents in production; newsletter author.",
      tags: ["agents", "advocate"],
      stage: "contacted",
      note: "Met at SF AI Tinkerers.",
    },
    {
      name: "Jordan Alvarez",
      email: "jordan.organizer@sbek-test.example.com",
      title: "Program Chair",
      company: "DevFlow Conf",
      bio: "Organizer contact mirrored into CRM for outreach tests.",
      tags: ["internal"],
      stage: "alumni",
      note: "Org-level contact.",
    },
    {
      name: "Sam Whitfield",
      email: "sam.reviewer@sbek-test.example.com",
      title: "Staff Engineer",
      company: "Review Collective",
      bio: "Program committee reviewer and occasional speaker.",
      tags: ["reviewer", "infra"],
      stage: "prospect",
      note: "Potential lightning talk.",
    },
    {
      name: "Ada Lovelace",
      email: "ada@example.test",
      title: "Principal Engineer",
      company: "Analytical Engines",
      bio: "Builder of analytical systems.",
      tags: ["keynote-candidate", "infra"],
      stage: "confirmed",
      note: "Accepted for AI Engineer Summit.",
    },
    {
      name: "Grace Hopper",
      email: "grace@example.test",
      title: "Distinguished Engineer",
      company: "Navy Labs",
      bio: "Compiler pioneer focused on human-readable systems.",
      tags: ["compilers", "alumni"],
      stage: "alumni",
      note: "Spoke last year.",
    },
    {
      name: "Lin Clark",
      email: "lin@example.test",
      title: "Staff Engineer",
      company: "Mozilla",
      bio: "Making complex systems understandable.",
      tags: ["agents", "workshop"],
      stage: "confirmed",
      note: "Workshop ready.",
    },
    {
      name: "Morgan Lee",
      email: "morgan.lee@example.test",
      title: "Head of Developer Experience",
      company: "Northwind AI",
      bio: "DX platforms and internal tooling.",
      tags: ["dx", "prospect"],
      stage: "prospect",
      note: "Cold outreach list.",
    },
  ];

  for (const row of demo) {
    if (crm.contacts.some((c) => normalizeEmail(c.email) === normalizeEmail(row.email))) continue;
    const made = createContact(
      {
        name: row.name,
        email: row.email,
        title: row.title,
        company: row.company,
        bio: row.bio,
        tags: row.tags,
        stage: "prospect",
        customFields: row.customFields,
      },
      { id: "system", name: "CUE" },
    );
    if (!made.ok) continue;
    if (row.stage !== "prospect") {
      // walk transitions when needed
      const path = pathToStage("prospect", row.stage);
      for (const step of path) moveStage(made.contact.id, step, { id: "system", name: "CUE" });
    }
    addNote(made.contact.id, row.note, { id: "org-swyx", name: "Jordan Alvarez" });
  }

  if (!crm.segments.some((s) => s.name === "AI Experts")) {
    saveSegment({
      name: "AI Experts",
      description: "Agents + platform tags",
      filters: { tagsAny: ["agents", "platform"] },
    });
  }
  if (!crm.segments.some((s) => s.name === "Confirmed speakers")) {
    saveSegment({ name: "Confirmed speakers", filters: { stage: "confirmed" } });
  }

  // Event history for alumni/confirmed demos
  for (const c of crm.contacts) {
    if (c.stage === "alumni" && !c.eventHistory.length) {
      c.eventHistory.push({
        eventId: "evt-prior-2025",
        eventName: "AI Engineer Summit 2025",
        role: "speaker",
        status: "completed",
        linkedAt: "2025-10-01T00:00:00.000Z",
      });
    }
  }

  syncEventSpeakersIntoCrm(life);
  return crm;
}

function pathToStage(from: CrmStage, to: CrmStage): CrmStage[] {
  if (from === to) return [];
  // BFS over transition graph
  const q: CrmStage[][] = [[from]];
  const seen = new Set<CrmStage>([from]);
  while (q.length) {
    const path = q.shift()!;
    const cur = path[path.length - 1]!;
    for (const next of CRM_STAGE_TRANSITIONS[cur] || []) {
      if (seen.has(next)) continue;
      const np = [...path, next];
      if (next === to) return np.slice(1);
      seen.add(next);
      q.push(np);
    }
  }
  // fallback direct if allowed else jump via declined reset
  if (canTransition(from, to)) return [to];
  return [to];
}

/** —— Typed custom field definitions (additive; used by CRM Settings + profiles) —— */

export const DEFAULT_CRM_FIELD_DEFINITIONS: CrmFieldDefinition[] = [
  {
    key: "speakerType",
    label: "Speaker Type",
    type: "select",
    options: ["Internal", "External"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

export function listFieldDefinitions(): CrmFieldDefinition[] {
  return ensureCrm().fieldDefinitions || [];
}

export function saveFieldDefinition(input: {
  key?: string;
  label: string;
  type?: string;
  options?: string[] | string;
}): { ok: true; definition: CrmFieldDefinition } | { ok: false; error: string } {
  const crm = ensureCrm();
  const label = String(input.label || "").trim();
  if (!label) return { ok: false, error: "field label is required" };
  const type = input.type === "select" ? "select" : "text";
  const key =
    String(input.key || "").trim() ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  if (!key) return { ok: false, error: "field key is required" };
  const options = (Array.isArray(input.options) ? input.options : String(input.options || "").split(","))
    .map((o) => String(o).trim())
    .filter(Boolean);
  if (type === "select" && options.length < 2) {
    return { ok: false, error: "dropdown fields need at least two options" };
  }
  const list = crm.fieldDefinitions || (crm.fieldDefinitions = []);
  const existing = list.find((f) => f.key === key);
  if (existing) {
    Object.assign(existing, { label, type, options });
    return { ok: true, definition: existing };
  }
  const definition: CrmFieldDefinition = { key, label, type, options, createdAt: now() };
  list.push(definition);
  return { ok: true, definition };
}

export function deleteFieldDefinition(key: string) {
  const crm = ensureCrm();
  const list = crm.fieldDefinitions || [];
  const index = list.findIndex((f) => f.key === key);
  if (index < 0) return false;
  list.splice(index, 1);
  return true;
}

/**
 * Server-side enforcement for typed custom fields: a "select" field only accepts one
 * of its configured options (empty string clears it). Undefined keys pass through so
 * ad-hoc custom fields keep working.
 */
export function validateCustomFields(
  values: Record<string, string>,
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const defs = listFieldDefinitions();
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(values || {})) {
    const value = String(raw ?? "").trim();
    const def = defs.find((d) => d.key === key);
    if (def?.type === "select" && value && !def.options.includes(value)) {
      return { ok: false, error: `${def.label} must be one of: ${def.options.join(", ")}` };
    }
    out[key] = value;
  }
  return { ok: true, values: out };
}

// Augment LifecycleStore for TypeScript consumers
declare module "./lifecycle.js" {
  interface LifecycleStore {
    crm?: CrmState;
  }
}

void 0 as unknown as Role;
