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
