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
  if (list?.length) personaCatalog = list;
}

export function setPersona(p: Persona) {
  persona = p;
  try {
    sessionStorage.setItem("cue-persona-id", p.id);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
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

/** Ensure persona matches the shell the judge is in. */
export function ensurePersonaForRole(role: Role, preferredSpeakerId?: string) {
  if (persona.role === role) {
    if (role === "speaker" && preferredSpeakerId && persona.speakerId !== preferredSpeakerId) {
      const match = personaCatalog.find((p) => p.speakerId === preferredSpeakerId);
      if (match) setPersona(match);
    }
    return getPersona();
  }
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

export function restorePersonaFromSession() {
  try {
    const id = sessionStorage.getItem("cue-persona-id");
    const found = personaCatalog.find((p) => p.id === id);
    if (found) persona = found;
  } catch {
    /* ignore */
  }
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
  assignReviews: (body: any) => mut<{data:any[]}>(`/api/events/${EVENT_ID}/review-assignments`, { method: "POST", body: JSON.stringify(body) }),
  reviewerQueue: () => req<{data:any[]}>(`/api/events/${EVENT_ID}/reviewer-queue`),
  reviewerAssignment: (id: string) => req<{data:any}>(`/api/events/${EVENT_ID}/reviewer-queue/${id}`),
  submitAssignment: (id: string, body: any) => mut(`/api/events/${EVENT_ID}/reviewer-queue/${id}/submit`, {method:"POST",body:JSON.stringify(body)}),
  recuseAssignment: (id: string, reason: string) => mut(`/api/events/${EVENT_ID}/reviewer-queue/${id}/recuse`, {method:"POST",body:JSON.stringify({reason})}),
  reviewProgress: () => req<{data:any[]}>(`/api/events/${EVENT_ID}/review-progress`),
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
  form: (id = "form-cfp") => req<{ data: any }>(`/api/events/${EVENT_ID}/forms/${id}`),
  saveForm: (id: string, body: any) =>
    mut(`/api/events/${EVENT_ID}/forms/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  publicCfp: () => req<{ data: any }>(`/api/public/events/ai-engineer-summit/cfp`),
  submitCfp: (body: any) =>
    mut(`/api/public/events/ai-engineer-summit/submissions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
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
  contentExport: () => mut<{data:any}>(`/api/events/${EVENT_ID}/content/export`,{method:"POST",body:JSON.stringify({grouping:"session"})}),
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
  schedule: () => req<any>(`/api/events/${EVENT_ID}/schedule`),
  validateSlot: (slot: any) =>
    req(`/api/events/${EVENT_ID}/schedule/validate`, { method: "POST", body: JSON.stringify(slot) }),
  moveSlot: (body: any) =>
    mut(`/api/events/${EVENT_ID}/schedule/move`, { method: "POST", body: JSON.stringify(body) }),
  saveSettings: (body: any) =>
    mut(`/api/events/${EVENT_ID}/settings`, { method: "PUT", body: JSON.stringify(body) }),
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
