import type { ContentFile, ContentFileVersion, DeliverableTask, LifecycleStore } from "./lifecycle.js";

export const MAX_CONTENT_FILE_BYTES = 2 * 1024 * 1024;
export const CONTENT_MIME_ALLOWLIST = new Set(["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain"]);

export function validateUpload(input: { mime: string; size: number; dataBase64: string }, acceptedTypes?: string[]) {
  if (!CONTENT_MIME_ALLOWLIST.has(input.mime)) return { ok:false as const, error:"File type is not allowed" };
  if (acceptedTypes?.length && !acceptedTypes.includes(input.mime)) return { ok:false as const, error:"File type is not accepted for this deliverable" };
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > MAX_CONTENT_FILE_BYTES) return { ok:false as const, error:"File must be 2 MB or smaller" };
  try { const actual = atob(input.dataBase64).length; if (actual !== input.size) return { ok:false as const, error:"File size does not match uploaded data" }; }
  catch { return { ok:false as const, error:"Invalid base64 file data" }; }
  return { ok:true as const };
}

export function addFileVersion(store: LifecycleStore, input: { task: DeliverableTask; name:string; mime:string; size:number; dataBase64:string; uploadedBy:string; kind:"headshot"|"slides"|"document" }) {
  let file=store.contentFiles.find((f)=>f.taskId===input.task.id);
  if (!file) { file={id:`content-${crypto.randomUUID().slice(0,8)}`,speakerId:input.task.speakerId,sessionId:input.task.sessionId,taskId:input.task.id,kind:input.kind,status:"submitted",versions:[],comments:[]}; store.contentFiles.push(file); }
  file.versions.forEach((v)=>v.current=false);
  const version: ContentFileVersion={id:`version-${crypto.randomUUID().slice(0,8)}`,version:file.versions.length+1,name:input.name,mime:input.mime,size:input.size,dataBase64:input.dataBase64,uploadedBy:input.uploadedBy,uploadedAt:new Date().toISOString(),current:true};
  file.versions.push(version); file.status="submitted"; input.task.status="complete"; return {file,version};
}

export function contentReadiness(store: LifecycleStore, at=new Date()) {
  return store.deliverableTasks.map((task)=>{const file=store.contentFiles.find((f)=>f.taskId===task.id);const overdue=task.status!=="complete"&&Date.parse(task.dueAt)<at.getTime();return {...task,overdue,uploadCount:file?.versions.length||0,fileId:file?.id,fileStatus:file?.status||"draft",speaker:store.profiles.find((p)=>p.speakerId===task.speakerId),session:store.sessions.find((s)=>s.id===task.sessionId)};});
}

export function canAccessFile(file: ContentFile, persona: {role:string;speakerId?:string}) { return persona.role==="organizer" || (persona.role==="speaker" && persona.speakerId===file.speakerId); }

/**
 * —— Canonical deliverable slot resolution ——
 *
 * A speaker/session must have exactly ONE deliverable slot per file kind. Two paths
 * create deliverables (accepted-submission onboarding and organizer-created file
 * request tasks); before this helper existed they produced duplicate slots, so an
 * upload landed on one row while the other stayed "Incomplete · 0 versions".
 */

/** Same speaker + same session + overlapping accepted MIME types = the same slot. */
export function isEquivalentDeliverable(
  a: { speakerId: string; sessionId?: string; acceptedTypes?: string[] },
  b: { speakerId: string; sessionId?: string; acceptedTypes?: string[] },
) {
  if (a.speakerId !== b.speakerId) return false;
  if ((a.sessionId || "") !== (b.sessionId || "")) return false;
  const at = a.acceptedTypes || [];
  const bt = b.acceptedTypes || [];
  if (!at.length || !bt.length) return true;
  return at.some((type) => bt.includes(type));
}

/** All existing slots equivalent to the candidate, most-populated first. */
export function equivalentDeliverables(
  store: LifecycleStore,
  candidate: { speakerId: string; sessionId?: string; acceptedTypes?: string[] },
) {
  return store.deliverableTasks
    .filter((task) => isEquivalentDeliverable(task, candidate))
    .sort((a, b) => versionsFor(store, b) - versionsFor(store, a));
}

const versionsFor = (store: LifecycleStore, task: DeliverableTask) =>
  store.contentFiles.find((f) => f.taskId === task.id)?.versions.length || 0;

/**
 * Collapse duplicate slots onto `winner`, moving any uploaded versions across so no
 * file history is lost. Returns the canonical slot.
 */
export function mergeDeliverableDuplicates(store: LifecycleStore, matches: DeliverableTask[]) {
  const winner = matches.find((t) => versionsFor(store, t) > 0) || matches[0]!;
  for (const duplicate of matches.filter((t) => t.id !== winner.id)) {
    const source = store.contentFiles.find((f) => f.taskId === duplicate.id);
    const target = store.contentFiles.find((f) => f.taskId === winner.id);
    if (source && target) {
      for (const version of source.versions) {
        version.current = false;
        version.version = target.versions.length + 1;
        target.versions.push(version);
      }
      target.comments.push(...source.comments);
      store.contentFiles = store.contentFiles.filter((f) => f.id !== source.id);
      if (target.versions.length) target.versions.at(-1)!.current = true;
      target.status = "submitted";
    } else if (source) {
      source.taskId = winner.id;
    }
    if (duplicate.status === "complete") winner.status = "complete";
    store.deliverableTasks = store.deliverableTasks.filter((t) => t.id !== duplicate.id);
  }
  if (versionsFor(store, winner) > 0) winner.status = "complete";
  return winner;
}

/**
 * Create OR extend the canonical deliverable slot for a file request. Reuses an
 * equivalent existing slot (updating its instructions/deadline/accepted types) so
 * organizer-created tasks never fork a speaker's upload history.
 */
export function upsertDeliverable(store: LifecycleStore, candidate: DeliverableTask) {
  const matches = equivalentDeliverables(store, candidate);
  if (!matches.length) {
    store.deliverableTasks.push(candidate);
    return { task: candidate, reused: false as const };
  }
  const winner = mergeDeliverableDuplicates(store, matches);
  winner.name = candidate.name || winner.name;
  winner.instructions = candidate.instructions || winner.instructions;
  winner.dueAt = candidate.dueAt || winner.dueAt;
  winner.acceptedTypes = candidate.acceptedTypes?.length ? candidate.acceptedTypes : winner.acceptedTypes;
  winner.fileRequired = candidate.fileRequired !== undefined ? candidate.fileRequired : winner.fileRequired;
  return { task: winner, reused: true as const };
}

/**
 * Uploads must always land on the canonical slot even when a stale/duplicate id is
 * used (an open portal tab, a bookmarked deliverable URL).
 */
export function canonicalDeliverable(store: LifecycleStore, task: DeliverableTask) {
  const matches = equivalentDeliverables(store, task);
  if (matches.length <= 1) return task;
  return mergeDeliverableDuplicates(store, matches);
}
