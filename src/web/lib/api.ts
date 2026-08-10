import {
  DEFAULT_PERSONAS,
  EVENT_ID,
  type Persona,
  type Role,
} from "./utils";

let persona: Persona = DEFAULT_PERSONAS[0];
let personaCatalog: Persona[] = [...DEFAULT_PERSONAS];
const listeners = new Set<() => void>();
const dataListeners = new Set<() => void>();

export function getPersona() {
  return persona;
}

export function getPersonaCatalog() {
  return personaCatalog;
}

export function setPersonaCatalog(list: Persona[]) {
  if (list?.length) {
    personaCatalog = list;
    // A public CFP confirmation can persist a newly-created persona before the
    // server catalog is loaded. Re-resolve it immediately when bootstrap arrives.
    restorePersonaFromSession();
  }
}

const PERSONA_KEY = "cue-persona-id";

function readStoredPersonaId(): string | null {
  try {
    return sessionStorage.getItem(PERSONA_KEY) || localStorage.getItem(PERSONA_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredPersonaId(id: string) {
  try {
    sessionStorage.setItem(PERSONA_KEY, id);
    localStorage.setItem(PERSONA_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * The persona the user explicitly picked. Kept in memory as well as storage so a
 * provisional role fallback (used when the server catalog has not loaded yet) can
 * never overwrite a real selection.
 */
let explicitPersonaId: string | null = readStoredPersonaId();

export function getExplicitPersonaId() {
  return explicitPersonaId;
}

function applyPersona(p: Persona) {
  const changed = persona.id !== p.id;
  persona = p;
  if (changed) {
    listeners.forEach((l) => l());
    // Persona identity is part of every request; page data must be refetched.
    bumpData();
  }
  return changed;
}

/**
 * Select a persona. `explicit` selections (persona picker, landing page) persist
 * and always win over role fallbacks; provisional selections do not persist.
 */
export function setPersona(p: Persona, opts: { explicit?: boolean } = {}) {
  const explicit = opts.explicit !== false;
  if (explicit) {
    explicitPersonaId = p.id;
    writeStoredPersonaId(p.id);
  }
  applyPersona(p);
}

export function subscribePersona(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Notify pages that server state changed (after mutations). */
export function bumpData() {
  dataListeners.forEach((l) => l());
}

export function subscribeData(fn: () => void): () => void {
  dataListeners.add(fn);
  return () => {
    dataListeners.delete(fn);
  };
}

/**
 * Soft-align persona only when the current persona already matches the shell role
 * (e.g. pick a preferred speaker). Never auto-promote a speaker/reviewer into an
 * organizer persona — shells must deny access instead of silent switching.
 */
export function ensurePersonaForRole(role: Role, preferredSpeakerId?: string) {
  restorePersonaFromSession();
  if (persona.role === role) {
    if (role === "speaker" && preferredSpeakerId && persona.speakerId !== preferredSpeakerId) {
      const match = personaCatalog.find((p) => p.speakerId === preferredSpeakerId);
      if (match) setPersona(match);
    }
    return getPersona();
  }
  // Do not auto-switch roles. Caller (shell) is responsible for access-denied UI.
  return getPersona();
}

/** Soft switch used only by persona picker / landing — not by shell mount. */
export function switchToRole(role: Role, preferredSpeakerId?: string) {
  let next: Persona | undefined;
  if (role === "speaker") {
    next =
      personaCatalog.find((p) => p.speakerId === preferredSpeakerId) ||
      personaCatalog.find((p) => p.id === "spk-sam") ||
      personaCatalog.find((p) => p.role === "speaker");
  } else {
    next = personaCatalog.find((p) => p.role === role);
  }
  if (next) setPersona(next);
  return getPersona();
}

/**
 * Adopt the explicitly selected persona as soon as it is resolvable in the catalog.
 * Returns true when an explicit selection is now active.
 */
export function restorePersonaFromSession() {
  const id = explicitPersonaId || readStoredPersonaId();
  if (!id) return false;
  explicitPersonaId = id;
  const found = personaCatalog.find((p) => p.id === id);
  if (!found) return false;
  applyPersona(found);
  return true;
}

/** Portal shells use a synchronous best-effort restore and must always unblock. */
export function resolvePortalPersona(role: Role) {
  restorePersonaFromSession();
  // An explicit selection for this portal always wins — never fall back over it.
  // A provisional persona of the right role is also left alone.
  if (getPersona().role === role) return true;
  // Nothing usable is selected for this portal. Entering an explicit role portal is
  // the fallback boundary: unlike organizer route gating, it is safe to select a
  // known demo persona so API headers stay usable. The fallback is PROVISIONAL —
  // it must not persist, so a pending explicit selection survives catalog loading.
  const fallback =
    (role === "speaker"
      ? personaCatalog.find((p) => p.id === "spk-sam") || personaCatalog.find((p) => p.role === role)
      : personaCatalog.find((p) => p.role === role)) || DEFAULT_PERSONAS.find((p) => p.role === role);
  if (fallback) setPersona(fallback, { explicit: false });
  return true;
}

function headers(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-demo-role": persona.role,
    "x-demo-persona": persona.id,
  };
  if (persona.speakerId) h["x-demo-speaker"] = persona.speakerId;
  return { ...h, ...(extra as Record<string, string>) };
}

async function req<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: headers(init?.headers),
  });
  const text = await r.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!r.ok) {
    const msg = data?.error?.message || data?.error || r.statusText;
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data as T;
}

async function mut<T = any>(path: string, init?: RequestInit): Promise<T> {
  const data = await req<T>(path, init);
  bumpData();
  return data;
}

export const api = {
  bootstrap: () => req<{ data: any }>(`/api/events/${EVENT_ID}/bootstrap`),
  command: () => req<{ data: any }>(`/api/events/${EVENT_ID}/command`),
  submissions: (filter?: string) =>
    req<{ data: any[] }>(
      `/api/events/${EVENT_ID}/submissions${filter ? `?filter=${filter}` : ""}`,
    ),
  submission: (id: string) => req<{ data: any }>(`/api/events/${EVENT_ID}/submissions/${id}`),
  reviews: () => req<{ data: any[] }>(`/api/events/${EVENT_ID}/reviews`),
  reviewRounds: () => req<{ data: any[] }>(`/api/events/${EVENT_ID}/review-rounds`),
  createReviewRound: (body: any) => mut(`/api/events/${EVENT_ID}/review-rounds`, { method: "POST", body: JSON.stringify(body) }),
  updateReviewRound: (id:string,body:any) => mut(`/api/events/${EVENT_ID}/review-rounds/${id}`,{method:"PUT",body:JSON.stringify(body)}),
  inviteReviewer: (id:string,body:any) => mut(`/api/events/${EVENT_ID}/review-rounds/${id}/reviewers`,{method:"POST",body:JSON.stringify(body)}),
  assignReviews: (body: any) => mut<{data:any[]}>(`/api/events/${EVENT_ID}/review-assignments`, { method: "POST", body: JSON.stringify(body) }),
  reviewerQueue: () => req<{data:any[]}>(`/api/events/${EVENT_ID}/reviewer-queue`),
  reviewerAssignment: (id: string) => req<{data:any}>(`/api/events/${EVENT_ID}/reviewer-queue/${id}`),
  submitAssignment: (id: string, body: any) => mut(`/api/events/${EVENT_ID}/reviewer-queue/${id}/submit`, {method:"POST",body:JSON.stringify(body)}),
  recuseAssignment: (id: string, reason: string) => mut(`/api/events/${EVENT_ID}/reviewer-queue/${id}/recuse`, {method:"POST",body:JSON.stringify({reason})}),
  reviewRecusals: () => req<{ data: any[] }>(`/api/events/${EVENT_ID}/review-recusals`),
  reinstateAssignment: (id: string) => mut<{ data: any }>(`/api/events/${EVENT_ID}/review-assignments/${id}/reinstate`, { method: "POST", body: "{}" }),
  reviewProgress: () => req<{data:any[]}>(`/api/events/${EVENT_ID}/review-progress`),
  automation: () => req<{data:any}>(`/api/events/${EVENT_ID}/automation`),
  reviewReminders: (reviewerIds: string[]) => mut<{data:any[]}>(`/api/events/${EVENT_ID}/review-reminders`, {method:"POST",body:JSON.stringify({reviewerIds})}),
  reviewResults: () => req<{data:any[]}>(`/api/events/${EVENT_ID}/review-results`),
  reviewResultsCsv: () => `/api/events/${EVENT_ID}/review-results.csv`,
  saveReview: (id: string, body: any) =>
    mut(`/api/events/${EVENT_ID}/reviews/${id}`, { method: "POST", body: JSON.stringify(body) }),
  aiAssist: (id: string) =>
    mut(`/api/events/${EVENT_ID}/reviews/${id}/ai-assist`, { method: "POST", body: "{}" }),
  decide: (id: string, body: any) =>
    mut(`/api/events/${EVENT_ID}/submissions/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  speakers: () => req<{ data: any[] }>(`/api/events/${EVENT_ID}/speakers`),
  speakerProgress: () => req<{ data: any }>(`/api/events/${EVENT_ID}/speakers/progress`),
  speakerDetail: (id: string) => req<{ data: any }>(`/api/events/${EVENT_ID}/speakers/${id}`),
  addSpeaker: (body: any) => mut<{ data: any }>(`/api/events/${EVENT_ID}/speakers`, { method: "POST", body: JSON.stringify(body) }),
  updateSpeaker: (id: string, body: any) => mut<{ data: any }>(`/api/events/${EVENT_ID}/speakers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  setSpeakerStatus: (id: string, status: string) => mut<{ data: any }>(`/api/events/${EVENT_ID}/speakers/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  inviteSpeaker: (id: string) => mut<{ data: any }>(`/api/events/${EVENT_ID}/speakers/${id}/invite`, { method: "POST", body: "{}" }),
  importSpeakers: (csv: string) => mut<{ data: any }>(`/api/events/${EVENT_ID}/speakers/import`, { method: "POST", body: JSON.stringify({ csv }) }),
  assignSpeakerTasks: (body: any) => mut<{ data: any }>(`/api/events/${EVENT_ID}/speakers/tasks`, { method: "POST", body: JSON.stringify(body) }),
  uploadHeadshot: (body: any) => mut<{ data: any }>(`/api/speaker/events/${EVENT_ID}/profile/headshot`, { method: "POST", body: JSON.stringify(body) }),
  submitTaskForm: (id: string, answers: any) => mut<{ data: any }>(`/api/speaker/events/${EVENT_ID}/tasks/${id}/form`, { method: "POST", body: JSON.stringify({ answers }) }),
  commsPreview: (body: any) => mut<{ data: any }>(`/api/events/${EVENT_ID}/comms/preview`, { method: "POST", body: JSON.stringify(body) }),
  runTaskReminders: () => mut<{ data: any }>(`/api/events/${EVENT_ID}/comms/reminders/run`, { method: "POST", body: "{}" }),
  speakersQuery: (params: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    const qs = q.toString();
    return req<{ data: any[]; meta?: any }>(`/api/events/${EVENT_ID}/speakers${qs ? `?${qs}` : ""}`);
  },

  form: (id = "form-cfp") => req<{ data: any }>(`/api/events/${EVENT_ID}/forms/${id}`),
  saveForm: (id: string, body: any) =>
    mut(`/api/events/${EVENT_ID}/forms/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  publicCfp: () => req<{ data: any }>(`/api/public/events/ai-engineer-summit/cfp`),
  submitCfp: (body: any) =>
    mut(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  publicSubmission: (id:string,token:string) => req<{data:any}>(`/api/public/events/ai-engineer-summit/submissions/${id}?token=${encodeURIComponent(token)}`),
  savePublicSubmission: (id:string,body:any) => mut<{data:any}>(`/api/public/events/ai-engineer-summit/submissions/${id}`,{method:"PUT",body:JSON.stringify(body)}),
  editSpeakerSubmission: (id:string,body:any) => mut<{data:any}>(`/api/speaker/events/${EVENT_ID}/submissions/${id}`,{method:"PUT",body:JSON.stringify(body)}),
  speakerHome: () => req<{ data: any }>(`/api/speaker/events/${EVENT_ID}/home`),
  completeTask: (id: string) =>
    mut(`/api/speaker/events/${EVENT_ID}/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    }),
  saveProfile: (body: any) =>
    mut(`/api/speaker/events/${EVENT_ID}/profile`, { method: "PUT", body: JSON.stringify(body) }),
  uploadFile: (body: any) =>
    mut(`/api/speaker/events/${EVENT_ID}/files`, { method: "POST", body: JSON.stringify(body) }),
  deliverables: () => req<{data:any[]}>(`/api/speaker/events/${EVENT_ID}/deliverables`),
  deliverable: (id:string) => req<{data:any}>(`/api/speaker/events/${EVENT_ID}/deliverables/${id}`),
  uploadDeliverable: (id:string,body:any) => mut(`/api/speaker/events/${EVENT_ID}/deliverables/${id}/upload`,{method:"POST",body:JSON.stringify(body)}),
  addFileComment: (id:string,body:string) => mut(`/api/content/files/${id}/comments`,{method:"POST",body:JSON.stringify({body})}),
  content: () => req<{data:any}>(`/api/events/${EVENT_ID}/content`),
  createDeliverableTask: (body:any) => mut(`/api/events/${EVENT_ID}/content/tasks`,{method:"POST",body:JSON.stringify(body)}),
  approveContentFile: (id:string,body:any) => mut(`/api/events/${EVENT_ID}/content/files/${id}/approval`,{method:"PATCH",body:JSON.stringify(body)}),
  contentReminders: (overdueOnly=false) => mut<{data:any[]}>(`/api/events/${EVENT_ID}/content/reminders`,{method:"POST",body:JSON.stringify({overdueOnly})}),
  editContentSession: (id:string,body:any) => mut(`/api/events/${EVENT_ID}/content/sessions/${id}`,{method:"PATCH",body:JSON.stringify(body)}),
  editContentSpeaker: (id:string,body:any) => mut(`/api/events/${EVENT_ID}/content/speakers/${id}`,{method:"PATCH",body:JSON.stringify(body)}),
  restoreContentHistory: (id:string) => mut(`/api/events/${EVENT_ID}/content/history/${id}/restore`,{method:"POST",body:"{}"}),
  contentExportUrl: () => `/api/events/${EVENT_ID}/content/export`,
  /** Download the latest-version ZIP and report how many files it contains. */
  contentExportZip: async () => {
    const r = await fetch(`/api/events/${EVENT_ID}/content/export`, { headers: headers() });
    if (!r.ok) throw new Error(`Export failed (${r.status})`);
    const fileCount = Number(r.headers.get("x-cue-file-count") || "0");
    const blob = await r.blob();
    return { blob, fileCount, filename: "cue-latest-content.zip" };
  },
  resource: (slug: string) =>
    req<{ data: any }>(`/api/speaker/events/${EVENT_ID}/resources/${slug}`),
  templates: () => req<{ data: any[] }>(`/api/events/${EVENT_ID}/comms/templates`),
  saveTemplate: (id: string, body: any) =>
    mut(`/api/events/${EVENT_ID}/comms/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  commsLog: () => req<{ data: any[] }>(`/api/events/${EVENT_ID}/comms/log`),
  sendComms: (body: any) =>
    mut(`/api/events/${EVENT_ID}/comms/send`, { method: "POST", body: JSON.stringify(body) }),
  previewDecision: (body:any)=>req<{data:any}>(`/api/events/${EVENT_ID}/comms/decisions/preview`,{method:"POST",body:JSON.stringify(body)}),
  sendDecisions: (body:any)=>mut<{data:any[]}>(`/api/events/${EVENT_ID}/comms/decisions/send`,{method:"POST",body:JSON.stringify(body)}),
  schedule: () => req<any>(`/api/events/${EVENT_ID}/schedule`),
  validateSlot: (slot: any) =>
    req(`/api/events/${EVENT_ID}/schedule/validate`, { method: "POST", body: JSON.stringify(slot) }),
  moveSlot: (body: any) =>
    mut(`/api/events/${EVENT_ID}/schedule/move`, { method: "POST", body: JSON.stringify(body) }),
  /**
   * Same canonical /schedule/move mutation, but returns the FULL server response
   * (status + error + conflicts + warnings) instead of throwing a bare message, so
   * the place/move dialog can render the server's own conflict text inline and tell
   * hard blocks (409) apart from acknowledgeable warnings (422) and stale versions.
   */
  moveSlotDetailed: async (body: any) => {
    const r = await fetch(`/api/events/${EVENT_ID}/schedule/move`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    if (r.ok) bumpData();
    return {
      ok: r.ok,
      status: r.status,
      error: typeof data?.error === "string" ? data.error : data?.error?.message || "",
      conflicts: (data?.conflicts || []) as any[],
      warnings: (data?.warnings || []) as any[],
      version: data?.version as number | undefined,
      slot: data?.slot,
    };
  },
  createScheduleSession:(body:any)=>mut<{data:any}>(`/api/events/${EVENT_ID}/schedule/sessions`,{method:"POST",body:JSON.stringify(body)}),
  updateScheduleSession:(id:string,body:any)=>mut<{data:any}>(`/api/events/${EVENT_ID}/schedule/sessions/${id}`,{method:"PATCH",body:JSON.stringify(body)}),
  agendaProposals: () => req<{data:any[]}>(`/api/events/${EVENT_ID}/agenda/proposals`),
  generateAgenda: (body:any) => mut<{data:any}>(`/api/events/${EVENT_ID}/agenda/proposals/generate`,{method:"POST",body:JSON.stringify(body)}),
  decideAgendaPlacement: (proposalId:string,placementId:string,decision:"accept"|"reject") => mut(`/api/events/${EVENT_ID}/agenda/proposals/${proposalId}/placements/${placementId}/${decision}`,{method:"POST",body:"{}"}),
  decideAgenda: (proposalId:string,decision:"accept"|"reject") => mut(`/api/events/${EVENT_ID}/agenda/proposals/${proposalId}/${decision}`,{method:"POST",body:"{}"}),
  createAgendaRoom: (body:any) => mut(`/api/events/${EVENT_ID}/agenda/rooms`,{method:"POST",body:JSON.stringify(body)}),
  createAgendaTrack: (body:any) => mut(`/api/events/${EVENT_ID}/agenda/tracks`,{method:"POST",body:JSON.stringify(body)}),
  publishAgenda: () => mut<{data:any}>(`/api/events/${EVENT_ID}/agenda/publish`,{method:"POST",body:"{}"}),
  saveSettings: (body: any) =>
    mut(`/api/events/${EVENT_ID}/settings`, { method: "PUT", body: JSON.stringify(body) }),
  embedConfigs:()=>req<{data:any[]}>(`/api/events/${EVENT_ID}/embed-configs`),
  createEmbedConfig:(body:any)=>mut<{data:any}>(`/api/events/${EVENT_ID}/embed-configs`,{method:"POST",body:JSON.stringify(body)}),
  deleteEmbedConfig:(id:string)=>mut(`/api/events/${EVENT_ID}/embed-configs/${id}`,{method:"DELETE"}),
  syncPreview: () =>
    mut(`/sync/preview`, { method: "POST", body: JSON.stringify({ eventId: EVENT_ID }) }),
  syncRun: () => mut(`/sync/run`, { method: "POST", body: JSON.stringify({ eventId: EVENT_ID }) }),
  syncRuns: () => req<any[]>(`/sync/runs?eventId=${EVENT_ID}`),
  crmDashboard: () => req<{ data: any }>(`/api/crm/dashboard`),
  crmStages: () => req<{ data: any[] }>(`/api/crm/stages`),
  crmContacts: (params: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    const qs = q.toString();
    return req<{ data: any[]; meta?: any }>(`/api/crm/contacts${qs ? `?${qs}` : ""}`);
  },
  crmContact: (id: string) => req<{ data: any }>(`/api/crm/contacts/${id}`),
  crmCreateContact: (body: any) => mut<{ data: any }>(`/api/crm/contacts`, { method: "POST", body: JSON.stringify(body) }),
  crmUpdateContact: (id: string, body: any) => mut<{ data: any }>(`/api/crm/contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  crmDeleteContact: (id: string) => mut(`/api/crm/contacts/${id}`, { method: "DELETE" }),
  crmAddNote: (id: string, body: string) => mut<{ data: any }>(`/api/crm/contacts/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) }),
  crmMoveStage: (id: string, stage: string, note?: string) => mut<{ data: any }>(`/api/crm/contacts/${id}/stage`, { method: "POST", body: JSON.stringify({ stage, note }) }),
  crmAddToEvent: (id: string, body: any = {}) => mut<{ data: any }>(`/api/crm/contacts/${id}/add-to-event`, { method: "POST", body: JSON.stringify(body) }),
  crmMerge: (primaryId: string, secondaryId: string) => mut<{ data: any }>(`/api/crm/contacts/merge`, { method: "POST", body: JSON.stringify({ primaryId, secondaryId }) }),
  crmValidateImport: (csv: string) => mut<{ data: any[] }>(`/api/crm/import/validate`, { method: "POST", body: JSON.stringify({ csv }) }),
  crmImport: (csv: string, mergeDuplicates = false) => mut<{ data: any }>(`/api/crm/import`, { method: "POST", body: JSON.stringify({ csv, mergeDuplicates }) }),
  crmFieldDefinitions: () => req<{ data: any[] }>(`/api/crm/field-definitions`),
  crmSaveFieldDefinition: (body: any) => mut<{ data: any }>(`/api/crm/field-definitions`, { method: "POST", body: JSON.stringify(body) }),
  crmDeleteFieldDefinition: (key: string) => mut(`/api/crm/field-definitions/${key}`, { method: "DELETE" }),
  crmSegments: () => req<{ data: any[] }>(`/api/crm/segments`),
  crmSaveSegment: (body: any) => mut<{ data: any }>(`/api/crm/segments`, { method: "POST", body: JSON.stringify(body) }),
  crmDeleteSegment: (id: string) => mut(`/api/crm/segments/${id}`, { method: "DELETE" }),
  crmPipeline: () => req<{ data: any }>(`/api/crm/pipeline`),
  crmSyncSpeakers: () => mut<{ data: any }>(`/api/crm/sync-event-speakers`, { method: "POST", body: "{}" }),
  crmCommunicate: (body: any) => mut<{ data: any }>(`/api/crm/communicate`, { method: "POST", body: JSON.stringify(body) }),
  crmCampaigns: () => req<{ data: any[] }>(`/api/crm/campaigns`),
  syncRunDetail: (id: string) => req(`/sync/runs/${id}`),
};

export function roleHome(role: Role) {
  if (role === "organizer") return "/app";
  if (role === "reviewer") return "/r";
  return "/p";
}
