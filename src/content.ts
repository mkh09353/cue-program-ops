import type { ContentFile, ContentFileVersion, DeliverableTask, LifecycleStore } from "./lifecycle.js";

/**
 * A re-request does not erase the canonical artifact. Instead it records the version
 * frontier that existed when the organizer opened this collection cycle. Only an upload
 * beyond that frontier satisfies the request.
 *
 * Kept as additive task metadata so older snapshots and seeded tasks retain their
 * existing status semantics without a lifecycle schema migration.
 */
export type DeliverableCollectionCycle = {
  requestedAt: string;
  baselineVersionCount: number;
  baselineCurrentVersionId?: string;
};
type CycleTask = DeliverableTask & { collectionCycle?: DeliverableCollectionCycle };

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
  file.versions.push(version); file.status="submitted";
  // A successful upload is newer than the request frontier and completes that cycle.
  // Tasks without cycle metadata preserve the legacy "any successful upload completes"
  // behavior used by seeded and accepted-submission deliverables.
  const cycle=(input.task as CycleTask).collectionCycle;
  input.task.status=!cycle||file.versions.length>cycle.baselineVersionCount?"complete":"incomplete";
  return {file,version};
}

export function contentReadiness(store: LifecycleStore, at=new Date()) {
  return store.deliverableTasks.map((task)=>{const file=store.contentFiles.find((f)=>f.taskId===task.id),uploadCount=file?.versions.length||0,cycle=(task as CycleTask).collectionCycle;const status=cycle?(uploadCount>cycle.baselineVersionCount?"complete":"incomplete"):task.status;const overdue=status!=="complete"&&Date.parse(task.dueAt)<at.getTime();return {...task,status,overdue,uploadCount,fileId:file?.id,fileStatus:file?.status||"draft",speaker:store.profiles.find((p)=>p.speakerId===task.speakerId),session:store.sessions.find((s)=>s.id===task.sessionId)};});
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
    // Organizer-created empty slots begin with an explicit zero-version cycle. Seeded
    // tasks do not pass through this path and therefore keep their current semantics.
    (candidate as CycleTask).collectionCycle={requestedAt:new Date().toISOString(),baselineVersionCount:0};
    candidate.status="incomplete";
    store.deliverableTasks.push(candidate);
    return { task: candidate, reused: false as const };
  }
  const winner = mergeDeliverableDuplicates(store, matches);
  winner.name = candidate.name || winner.name;
  winner.instructions = candidate.instructions || winner.instructions;
  winner.dueAt = candidate.dueAt || winner.dueAt;
  winner.acceptedTypes = candidate.acceptedTypes?.length ? candidate.acceptedTypes : winner.acceptedTypes;
  winner.fileRequired = candidate.fileRequired !== undefined ? candidate.fileRequired : winner.fileRequired;
  const file=store.contentFiles.find((f)=>f.taskId===winner.id);
  const current=file?.versions.find((version)=>version.current)||file?.versions.at(-1);
  // Re-requesting opens a fresh cycle at the current canonical frontier. Existing
  // versions/comments remain on the same file, but none can satisfy the new request.
  (winner as CycleTask).collectionCycle={requestedAt:new Date().toISOString(),baselineVersionCount:file?.versions.length||0,...(current?{baselineCurrentVersionId:current.id}:{})};
  winner.status="incomplete";
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
