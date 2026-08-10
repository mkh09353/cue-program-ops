import {
  EVENT_ID,
  ensureOnboarding,
  readiness,
  sendTemplate,
  store,
  type Communication,
  type LifecycleStore,
  type SpeakerProfile,
  type SpeakerTask,
  type Submission,
} from "./lifecycle.js";

export type SpeakerWorkflowStatus = "invited" | "confirmed" | "accepted" | "declined" | "withdrawn";

export const SPEAKER_WORKFLOW_STATUSES: { id: SpeakerWorkflowStatus; label: string }[] = [
  { id: "invited", label: "Invited" },
  { id: "confirmed", label: "Confirmed" },
  { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Declined" },
  { id: "withdrawn", label: "Withdrawn" },
];

export type FormFieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select";
  required?: boolean;
  options?: string[];
};

/** Extended profile fields used by speaker management (backward-compatible optional). */
export type SpeakerProfileExt = SpeakerProfile & {
  workflowStatus?: SpeakerWorkflowStatus;
  headshotUrl?: string;
  headshotDataBase64?: string;
  headshotMime?: string;
  travelPreference?: string;
  dietary?: string;
  customFields?: Record<string, string>;
  tags?: string[];
};

export type SpeakerTaskExt = SpeakerTask & {
  description?: string;
  instructions?: string;
  formSchema?: FormFieldDef[];
  formAnswers?: Record<string, string>;
  alwaysShow?: boolean;
};

export type SpeakerRosterQuery = {
  q?: string;
  status?: string;
  readiness?: "ready" | "not_ready" | "all";
  tag?: string;
};

const now = () => new Date().toISOString();
const id = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const normEmail = (e: string) => String(e || "").trim().toLowerCase();

export function asExt(p: SpeakerProfile): SpeakerProfileExt {
  return p as SpeakerProfileExt;
}

export function asTaskExt(t: SpeakerTask): SpeakerTaskExt {
  return t as SpeakerTaskExt;
}

export function listRoster(life: LifecycleStore = store, query: SpeakerRosterQuery = {}) {
  // One roster row per speaker: after a merge the primary owns both accepted
  // submissions, and the organizer must see a single combined record. A real proposal
  // wins over the "<name> (manual)" placeholder an import creates.
  const acceptedAll = life.submissions.filter((s) => s.status === "accepted");
  const bySpeaker = new Map<string, (typeof acceptedAll)[number]>();
  for (const s of acceptedAll) {
    const current = bySpeaker.get(s.speakerId);
    if (!current) { bySpeaker.set(s.speakerId, s); continue; }
    const currentIsPlaceholder = /\(manual\)$/.test(current.title || "");
    const candidateIsPlaceholder = /\(manual\)$/.test(s.title || "");
    if (currentIsPlaceholder && !candidateIsPlaceholder) bySpeaker.set(s.speakerId, s);
  }
  const accepted = acceptedAll.filter((s) => bySpeaker.get(s.speakerId) === s);
  const q = (query.q || "").trim().toLowerCase();
  const status = (query.status || "").trim().toLowerCase();
  const tag = (query.tag || "").trim().toLowerCase();
  const readinessFilter = query.readiness || "all";

  return accepted
    .map((s) => {
      const profile = life.profiles.find((p) => p.speakerId === s.speakerId) as SpeakerProfileExt | undefined;
      const ready = readiness(s.speakerId);
      const tasks = life.tasks.filter((t) => t.speakerId === s.speakerId).map(asTaskExt);
      const files = life.files.filter((f) => f.speakerId === s.speakerId);
      const sessions = life.sessions.filter((x) => x.speakerId === s.speakerId);
      const workflowStatus =
        profile?.workflowStatus ||
        (ready.state === "ready" ? "confirmed" : s.status === "accepted" ? "accepted" : "invited");
      return {
        speakerId: s.speakerId,
        submissionId: s.id,
        name: profile?.name || s.name,
        email: profile?.email || s.email,
        title: profile?.title || "",
        company: profile?.company || "",
        bio: profile?.bio || "",
        linkedin: profile?.linkedin,
        x: profile?.x,
        website: profile?.website,
        headshotName: profile?.headshotName,
        headshotUrl: profile?.headshotUrl,
        workflowStatus,
        travelPreference: profile?.travelPreference || "",
        dietary: profile?.dietary || "",
        customFields: profile?.customFields || {},
        tags: profile?.tags || [],
        readiness: ready,
        tasks,
        files,
        sessions,
        submission: s,
        profile,
      };
    })
    .filter((row) => {
      if (status && row.workflowStatus !== status) return false;
      if (readinessFilter === "ready" && row.readiness.state !== "ready") return false;
      if (readinessFilter === "not_ready" && row.readiness.state !== "not_ready") return false;
      if (tag && !row.tags.some((t) => t.toLowerCase() === tag)) return false;
      if (!q) return true;
      const hay = [row.name, row.email, row.title, row.company, row.bio, row.tags.join(" "), row.workflowStatus]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
}

export function progressMatrix(life: LifecycleStore = store) {
  const roster = listRoster(life);
  const taskTitles = new Map<string, string>();
  for (const r of roster) {
    for (const t of r.tasks) taskTitles.set(t.title, t.title);
  }
  const columns = [...taskTitles.values()].sort();
  const rows = roster.map((r) => ({
    speakerId: r.speakerId,
    name: r.name,
    workflowStatus: r.workflowStatus,
    readiness: r.readiness,
    cells: Object.fromEntries(
      columns.map((title) => {
        const t = r.tasks.find((x) => x.title === title);
        return [title, t ? { id: t.id, status: t.status, dueAt: t.dueAt, type: t.type } : null];
      }),
    ),
    completed: r.tasks.filter((t) => t.status === "completed").length,
    total: r.tasks.length,
    overdue: r.tasks.filter((t) => t.status !== "completed" && Date.parse(t.dueAt) < Date.now()).length,
  }));
  return { columns, rows, summary: { speakers: rows.length, ready: rows.filter((r) => r.readiness.state === "ready").length } };
}

export function addSpeakerManual(
  input: {
    name?: string;
    email?: string;
    title?: string;
    company?: string;
    bio?: string;
    linkedin?: string;
    x?: string;
    website?: string;
    travelPreference?: string;
    dietary?: string;
    tags?: string[];
    workflowStatus?: SpeakerWorkflowStatus;
    talkTitle?: string;
    abstract?: string;
    category?: string;
    sendInvite?: boolean;
  },
  life: LifecycleStore = store,
): { ok: true; speakerId: string; profile: SpeakerProfileExt; submission: Submission; communication?: Communication } | { ok: false; error: string } {
  const name = String(input.name || "").trim();
  const email = normEmail(input.email || "");
  if (!name) return { ok: false, error: "name is required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "valid email is required" };

  let profile = life.profiles.find((p) => normEmail(p.email) === email) as SpeakerProfileExt | undefined;
  let speakerId = profile?.speakerId;
  if (!speakerId) {
    speakerId = `spk-${crypto.randomUUID().slice(0, 8)}`;
    profile = {
      speakerId,
      name,
      email,
      bio: String(input.bio || ""),
      title: input.title?.trim() || undefined,
      company: input.company?.trim() || undefined,
      linkedin: input.linkedin?.trim() || undefined,
      x: input.x?.trim() || undefined,
      website: input.website?.trim() || undefined,
      workflowStatus: input.workflowStatus || "invited",
      travelPreference: input.travelPreference?.trim() || undefined,
      dietary: input.dietary?.trim() || undefined,
      tags: input.tags || [],
      customFields: {},
    };
    life.profiles.push(profile);
  } else if (profile) {
    Object.assign(profile, {
      name,
      title: input.title ?? profile.title,
      company: input.company ?? profile.company,
      bio: input.bio ?? profile.bio,
      linkedin: input.linkedin ?? profile.linkedin,
      x: input.x ?? profile.x,
      website: input.website ?? profile.website,
      travelPreference: input.travelPreference ?? profile.travelPreference,
      dietary: input.dietary ?? profile.dietary,
      workflowStatus: input.workflowStatus || profile.workflowStatus || "invited",
    });
    if (input.tags) profile.tags = input.tags;
  }

  let sub = life.submissions.find((s) => s.speakerId === speakerId && s.status === "accepted");
  if (!sub) {
    sub = {
      id: id("sub"),
      eventId: life.event.id || EVENT_ID,
      speakerId: speakerId!,
      name,
      email,
      title: input.talkTitle?.trim() || `${name} (manual)`,
      abstract: input.abstract?.trim() || input.bio || "Manually added speaker",
      category: input.category || "Engineering",
      format: "Talk",
      answers: { source: "manual" },
      status: "accepted",
      reviewBoard: "engineering",
      round: "final",
      createdAt: now(),
    };
    life.submissions.unshift(sub);
  }

  ensureOnboarding(sub);
  const p = life.profiles.find((x) => x.speakerId === speakerId) as SpeakerProfileExt;
  if (p && !p.workflowStatus) p.workflowStatus = "accepted";
  ensureSpeakerPersona(p, life);

  let communication: Communication | undefined;
  if (input.sendInvite !== false) {
    communication = sendTemplate("accepted", speakerId!, sub.title, "acceptance");
  }
  return { ok: true, speakerId: speakerId!, profile: p, submission: sub, communication };
}

/** Keep the demo identity catalog aligned with the canonical event speaker roster. */
export function ensureSpeakerPersona(profile: SpeakerProfileExt, life: LifecycleStore = store) {
  const existing = life.personas.find((p) => p.id === profile.speakerId || p.email.trim().toLowerCase() === profile.email.trim().toLowerCase());
  if (existing) Object.assign(existing, { id: profile.speakerId, role: "speaker", name: profile.name, email: profile.email, speakerId: profile.speakerId });
  else life.personas.push({ id: profile.speakerId, role: "speaker", name: profile.name, email: profile.email, speakerId: profile.speakerId });
}

export function mergeSpeakerRecords(primaryId: string, secondaryId: string, life: LifecycleStore = store) {
  if (primaryId === secondaryId) return { ok: false as const, error: "choose two different speakers" };
  const primary = life.profiles.find(p => p.speakerId === primaryId) as SpeakerProfileExt | undefined;
  const secondary = life.profiles.find(p => p.speakerId === secondaryId) as SpeakerProfileExt | undefined;
  if (!primary || !secondary) return { ok: false as const, error: "speaker not found" };
  primary.bio ||= secondary.bio; primary.title ||= secondary.title; primary.company ||= secondary.company;
  primary.linkedin ||= secondary.linkedin; primary.x ||= secondary.x; primary.website ||= secondary.website;
  for (const rows of [life.submissions, life.tasks, life.files, life.sessions, life.deliverableTasks, life.contentFiles] as any[][]) {
    for (const row of rows) if (row.speakerId === secondaryId) row.speakerId = primaryId;
  }
  life.communications.forEach(row => { if (row.speakerId === secondaryId) row.speakerId = primaryId; });
  life.profiles = life.profiles.filter(p => p.speakerId !== secondaryId);
  life.personas = life.personas.filter(p => p.id !== secondaryId);
  ensureSpeakerPersona(primary, life);
  return { ok: true as const, profile: primary };
}

export function updateSpeakerOrganizer(
  speakerId: string,
  patch: Partial<SpeakerProfileExt> & { workflowStatus?: SpeakerWorkflowStatus },
  life: LifecycleStore = store,
): { ok: true; profile: SpeakerProfileExt } | { ok: false; error: string } {
  const profile = life.profiles.find((p) => p.speakerId === speakerId) as SpeakerProfileExt | undefined;
  if (!profile) return { ok: false, error: "speaker not found" };
  if (patch.name != null) profile.name = String(patch.name).trim() || profile.name;
  if (patch.email != null) {
    const email = normEmail(patch.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "valid email is required" };
    profile.email = email;
  }
  if (patch.bio != null) profile.bio = String(patch.bio);
  if (patch.title !== undefined) profile.title = String(patch.title || "").trim() || undefined;
  if (patch.company !== undefined) profile.company = String(patch.company || "").trim() || undefined;
  if (patch.linkedin !== undefined) profile.linkedin = String(patch.linkedin || "").trim() || undefined;
  if (patch.x !== undefined) profile.x = String(patch.x || "").trim() || undefined;
  if (patch.website !== undefined) profile.website = String(patch.website || "").trim() || undefined;
  if (patch.travelPreference !== undefined) profile.travelPreference = String(patch.travelPreference || "").trim() || undefined;
  if (patch.dietary !== undefined) profile.dietary = String(patch.dietary || "").trim() || undefined;
  if (patch.workflowStatus) profile.workflowStatus = patch.workflowStatus;
  if (patch.tags) profile.tags = [...new Set(patch.tags.map((t) => String(t).trim()).filter(Boolean))];
  if (patch.customFields) profile.customFields = { ...(profile.customFields || {}), ...patch.customFields };
  if (patch.headshotUrl !== undefined) profile.headshotUrl = patch.headshotUrl;
  if (patch.headshotName !== undefined) profile.headshotName = patch.headshotName;
  return { ok: true, profile };
}

export function updateSpeakerSelf(
  speakerId: string,
  patch: Partial<SpeakerProfileExt>,
  life: LifecycleStore = store,
): { ok: true; profile: SpeakerProfileExt } | { ok: false; error: string } {
  // Speakers may not change workflow status or email ownership freely beyond profile fields
  const { workflowStatus: _w, email: _e, ...safe } = patch as any;
  return updateSpeakerOrganizer(speakerId, safe, life);
}

export function applyHeadshot(
  speakerId: string,
  input: { name: string; mime?: string; dataBase64?: string; dataUrl?: string },
  life: LifecycleStore = store,
) {
  const profile = life.profiles.find((p) => p.speakerId === speakerId) as SpeakerProfileExt | undefined;
  if (!profile) return { ok: false as const, error: "speaker not found" };
  profile.headshotName = input.name;
  if (input.dataUrl) {
    profile.headshotUrl = input.dataUrl;
  } else if (input.dataBase64) {
    const mime = input.mime || "image/png";
    profile.headshotMime = mime;
    profile.headshotDataBase64 = input.dataBase64;
    profile.headshotUrl = `data:${mime};base64,${input.dataBase64}`;
  }
  // Mirror into schedule speakers for public gallery
  void syncProfileToSchedule(speakerId, life);
  const headshotTask = life.tasks.find((t) => t.speakerId === speakerId && t.type === "headshot");
  if (headshotTask) headshotTask.status = "completed";
  // File receipt
  const existing = life.files.find((f) => f.speakerId === speakerId && f.kind === "headshot");
  if (existing) {
    existing.name = input.name;
    existing.createdAt = now();
  } else {
    life.files.push({
      id: id("file"),
      speakerId,
      kind: "headshot",
      name: input.name,
      visibility: "public",
      createdAt: now(),
    });
  }
  return { ok: true as const, profile };
}

export async function syncProfileToSchedule(speakerId: string, life: LifecycleStore = store, repo?: any) {
  const profile = life.profiles.find((p) => p.speakerId === speakerId) as SpeakerProfileExt | undefined;
  if (!profile) return;
  // Prefer injected repo; otherwise try MemoryRepository-shaped global via optional callback
  if (!repo?.getSchedule || !repo?.putSchedule) return;
  const sched = await repo.getSchedule(EVENT_ID);
  if (!sched) return;
  const target = sched.speakers?.find((s: any) => s.id === speakerId);
  if (target) {
    Object.assign(target, {
      name: profile.name,
      bio: profile.bio,
      company: profile.company,
      title: profile.title,
      headshotUrl: profile.headshotUrl || target.headshotUrl,
    });
    await repo.putSchedule(EVENT_ID, sched);
  }
}

/** Fields that make a speaker record genuinely "richer" for an organizer. */
const RICH_PROFILE_FIELDS = [
  "bio",
  "title",
  "company",
  "linkedin",
  "x",
  "website",
  "travelPreference",
  "dietary",
  "headshotUrl",
] as const;

/**
 * Deterministic "which record do we keep" score. Richer meaningful data wins; the
 * older record breaks ties, so the primary never depends on array order.
 */
export function speakerRecordScore(speakerId: string, life: LifecycleStore = store) {
  const profile = life.profiles.find((p) => p.speakerId === speakerId) as SpeakerProfileExt | undefined;
  const index = life.profiles.findIndex((p) => p.speakerId === speakerId);
  const filled = profile
    ? RICH_PROFILE_FIELDS.filter((key) => String((profile as any)[key] || "").trim()).length
    : 0;
  const tags = profile?.tags?.length ? 1 : 0;
  const customFields = Object.keys(profile?.customFields || {}).length ? 1 : 0;
  const sessions = life.sessions.filter((x) => x.speakerId === speakerId).length;
  const tasks = life.tasks.filter((x) => x.speakerId === speakerId).length;
  const files = life.files.filter((x) => x.speakerId === speakerId).length;
  const deliverables = life.deliverableTasks.filter((x) => x.speakerId === speakerId).length;
  const contentFiles = life.contentFiles.filter((x) => x.speakerId === speakerId).length;
  const submissions = life.submissions.filter((x) => x.speakerId === speakerId);
  // A real proposal outranks the placeholder "<name> (manual)" record an import creates.
  const realSubmission = submissions.some((x) => !/\(manual\)$/.test(x.title)) ? 2 : 0;
  const createdAt = submissions
    .map((x) => Date.parse(x.createdAt || ""))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b)[0];
  return {
    speakerId,
    richness: filled + tags + customFields + sessions * 2 + tasks + files + deliverables + contentFiles + realSubmission,
    // Older wins ties: earliest submission, then earliest position in the roster.
    createdAt: Number.isFinite(createdAt) ? (createdAt as number) : Number.MAX_SAFE_INTEGER,
    index: index < 0 ? Number.MAX_SAFE_INTEGER : index,
    profile,
  };
}

/** Sort helper: primary first (richer, then older, then earliest index). */
export function compareSpeakerPrimacy(a: ReturnType<typeof speakerRecordScore>, b: ReturnType<typeof speakerRecordScore>) {
  return b.richness - a.richness || a.createdAt - b.createdAt || a.index - b.index || a.speakerId.localeCompare(b.speakerId);
}

export type DuplicatePair = {
  primary: { speakerId: string; name: string; email: string };
  duplicate: { speakerId: string; name: string; email: string };
  reason: string;
};

/**
 * Same normalized name + different email = a SUGGESTION, never an automatic merge.
 * The richer/older record is proposed as primary so the fill-only merge enriches it.
 */
export function suggestDuplicatePairs(life: LifecycleStore = store): DuplicatePair[] {
  const byName = new Map<string, string[]>();
  for (const p of life.profiles) {
    const key = p.name.trim().toLowerCase().replace(/\s+/g, " ");
    byName.set(key, [...(byName.get(key) || []), p.speakerId]);
  }
  const view = (speakerId: string) => {
    const p = life.profiles.find((x) => x.speakerId === speakerId)!;
    return { speakerId, name: p.name, email: p.email };
  };
  return [...byName.values()]
    .filter((ids) => ids.length > 1)
    .flatMap((ids) => {
      const ranked = ids.map((x) => speakerRecordScore(x, life)).sort(compareSpeakerPrimacy);
      const primary = ranked[0]!.speakerId;
      return ranked.slice(1).map((row) => ({
        primary: view(primary),
        duplicate: view(row.speakerId),
        reason: "Same normalized name with a different email",
      }));
    });
}

export function importSpeakersCsv(
  csvText: string,
  opts: { sendInvite?: boolean } = {},
  life: LifecycleStore = store,
) {
  const lines = String(csvText || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  if (lines.length < 2) return { created: 0, updated: 0, skipped: 0, results: [] as any[], nearDuplicates: [] as DuplicatePair[] };
  const headers = splitCsv(lines[0]!).map((h) => h.trim().toLowerCase());
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const results: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsv(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] || "").trim();
    });
    const name =
      row.name ||
      row["full name"] ||
      [row["first name"] || row.firstname, row["last name"] || row.lastname].filter(Boolean).join(" ");
    const email = normEmail(row.email || row["e-mail"] || "");
    if (!name || !email) {
      skipped++;
      results.push({ row: i + 1, ok: false, error: "name and email required" });
      continue;
    }
    const existed = life.profiles.some((p) => normEmail(p.email) === email);
    const made = addSpeakerManual(
      {
        name,
        email,
        title: row.title || row["job title"] || undefined,
        company: row.company || row.organization || undefined,
        bio: row.bio || row.biography || undefined,
        linkedin: row.linkedin || undefined,
        x: row.twitter || row.x || undefined,
        website: row.website || undefined,
        travelPreference: row.travel || row["travel preference"] || undefined,
        tags: row.tags ? row.tags.split(/[|;,]/).map((t) => t.trim()).filter(Boolean) : undefined,
        sendInvite: opts.sendInvite === true,
        talkTitle: row["talk title"] || row.talk || undefined,
      },
      life,
    );
    if (!made.ok) {
      skipped++;
      results.push({ row: i + 1, ok: false, error: made.error });
      continue;
    }
    if (existed) updated++;
    else created++;
    results.push({ row: i + 1, ok: true, speakerId: made.speakerId, action: existed ? "updated" : "created" });
  }
  const nearDuplicates = suggestDuplicatePairs(life);
  return { created, updated, skipped, results, nearDuplicates };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function assignGeneralTasks(
  input: {
    title?: string;
    description?: string;
    dueAt?: string;
    type?: SpeakerTask["type"];
    speakerIds?: string[];
    required?: boolean;
    formSchema?: FormFieldDef[];
  },
  life: LifecycleStore = store,
): { ok: true; tasks: SpeakerTaskExt[] } | { ok: false; error: string } {
  const title = String(input.title || "").trim();
  const dueAt = String(input.dueAt || "").trim();
  const speakerIds = input.speakerIds || [];
  if (!title) return { ok: false, error: "title is required" };
  if (!dueAt || !Number.isFinite(Date.parse(dueAt))) return { ok: false, error: "valid dueAt is required" };
  if (!speakerIds.length) return { ok: false, error: "speakerIds required" };
  const type = input.type || "confirm";
  const made: SpeakerTaskExt[] = speakerIds.map((speakerId) => {
    const task: SpeakerTaskExt = {
      id: id("task"),
      speakerId,
      title,
      type,
      required: input.required !== false,
      status: "not_started",
      dueAt,
      description: input.description?.trim() || undefined,
      instructions: input.description?.trim() || undefined,
      formSchema: type === "form" ? input.formSchema || defaultFormSchema() : undefined,
      formAnswers: type === "form" ? {} : undefined,
    };
    life.tasks.push(task);
    return task;
  });
  return { ok: true, tasks: made };
}

function defaultFormSchema(): FormFieldDef[] {
  return [
    { key: "shirt_size", label: "T-shirt size", type: "select", required: true, options: ["XS", "S", "M", "L", "XL", "XXL"] },
    { key: "arrival_date", label: "Arrival date", type: "text", required: true },
    { key: "notes", label: "Anything we should know?", type: "textarea", required: false },
  ];
}

export function submitFormTask(
  taskId: string,
  speakerId: string,
  answers: Record<string, string>,
  life: LifecycleStore = store,
): { ok: true; task: SpeakerTaskExt } | { ok: false; error: string } {
  const task = life.tasks.find((t) => t.id === taskId) as SpeakerTaskExt | undefined;
  if (!task || task.speakerId !== speakerId) return { ok: false, error: "task not found" };
  if (task.type !== "form") return { ok: false, error: "not a form task" };
  const schema = task.formSchema || defaultFormSchema();
  for (const field of schema) {
    if (field.required && !String(answers[field.key] || "").trim()) {
      return { ok: false, error: `${field.label} is required` };
    }
  }
  task.formAnswers = { ...(task.formAnswers || {}), ...answers };
  task.formSchema = schema;
  task.status = "completed";
  return { ok: true, task };
}

export function renderMergePreview(
  template: { subject: string; body: string; includeCalendarLinks?: boolean },
  speakerId: string,
  life: LifecycleStore = store,
) {
  const profile = life.profiles.find((p) => p.speakerId === speakerId);
  const sub = life.submissions.find((s) => s.speakerId === speakerId && s.status === "accepted");
  const name = profile?.name || sub?.name || "Speaker";
  const first = name.split(/\s+/)[0] || name;
  const talk = sub?.title || "your session";
  const portal = `/p`;
  const calendar = template.includeCalendarLinks
    ? "Add to calendar: Google · Outlook · download ICS from your portal."
    : "";
  const vars: Record<string, string> = {
    first_name: first,
    name,
    email: profile?.email || sub?.email || "",
    talk_title: talk,
    portal_link: portal,
    calendar_links: calendar,
    company: profile?.company || "",
    title: profile?.title || "",
    event_name: life.event.name,
  };
  const subj = template.subject.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
  const body = template.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
  return { subject: subj, body, vars };
}

export function outstandingTaskReminders(life: LifecycleStore = store, at = new Date()) {
  const plans: { speakerId: string; taskId: string; title: string; dueAt: string; overdue: boolean; email: string; name: string }[] = [];
  for (const t of life.tasks) {
    if (t.status === "completed") continue;
    if (!t.required) continue;
    const profile = life.profiles.find((p) => p.speakerId === t.speakerId);
    if (!profile?.email) continue;
    const overdue = Date.parse(t.dueAt) < at.getTime();
    // Reminder window: within 7 days before due or already overdue
    const msLeft = Date.parse(t.dueAt) - at.getTime();
    const dueSoon = msLeft >= 0 && msLeft <= 7 * 24 * 3600 * 1000;
    if (!overdue && !dueSoon) continue;
    plans.push({
      speakerId: t.speakerId,
      taskId: t.id,
      title: t.title,
      dueAt: t.dueAt,
      overdue,
      email: profile.email,
      name: profile.name,
    });
  }
  return plans;
}

/** Seed a form task + travel fields on demo speakers for filled UI. */
export function enrichSpeakerMgmtDemo(life: LifecycleStore = store) {
  for (const p of life.profiles) {
    const ext = p as SpeakerProfileExt;
    // Repair snapshots produced by the former social/logistics field mapping.
    // A social handle belongs in X/Twitter, never in travel preferences.
    if (ext.travelPreference?.trim().startsWith("@")) {
      if (!ext.x) ext.x = ext.travelPreference.trim();
      ext.travelPreference = undefined;
    }
    if (!ext.workflowStatus) {
      ext.workflowStatus = life.submissions.some((s) => s.speakerId === p.speakerId && s.status === "accepted")
        ? "accepted"
        : "invited";
    }
    if (p.speakerId === "spk-ada" && !ext.travelPreference) {
      ext.travelPreference = "Direct flights preferred; aisle seat";
      ext.dietary = "Vegetarian";
    }
    if (p.speakerId === "spk-sam" && !ext.travelPreference) {
      ext.travelPreference = "Open to red-eyes";
    }
  }
  // Ensure at least one form task exists for Sam if accepted
  if (
    life.submissions.some((s) => s.speakerId === "spk-sam" && s.status === "accepted") &&
    !life.tasks.some((t) => t.speakerId === "spk-sam" && t.type === "form")
  ) {
    life.tasks.push({
      id: "task-sam-logistics-form",
      speakerId: "spk-sam",
      submissionId: "sub-sam",
      title: "Event logistics form",
      type: "form",
      required: true,
      status: "not_started",
      dueAt: "2026-09-15T00:00:00.000Z",
      description: "Shirt size, arrival, and notes for greenroom prep.",
      formSchema: defaultFormSchema(),
      formAnswers: {},
    } as SpeakerTaskExt);
  }
}
