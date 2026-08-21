import { Hono } from "hono";
import { type ContentApprovalStatus, type LifecycleStore } from "./lifecycle.js";
import type { Mailer } from "./mailer.js";
import { brandedHtmlFor } from "./emailTemplate.js";
import type { Repository } from "./domain.js";
import { addFileVersion, canAccessFile, canonicalDeliverable, contentReadiness, upsertDeliverable, validateUpload } from "./content.js";
import { applySessionEdit, listEditableSessions, restoreSessionHistory } from "./sessionContent.js";
import { createZip } from "./zip.js";

const fail=(c:any,message:string,status=400)=>c.json({error:{message}},status as any);
const validStatus=(v:string):v is ContentApprovalStatus=>["draft","submitted","approved","changes_requested"].includes(v);
export function createContentRoutes(deps:{store:LifecycleStore;persist:(eventId?:string,store?:LifecycleStore)=>Promise<void>;persona:(c:any)=>{id:string;role:string;name:string;email:string;speakerId?:string};mailer:Mailer;repo:Repository}) {
 const app=new Hono(); const event=(c:any)=>c.req.param("eventId")===deps.store.event.id; const org=(c:any)=>deps.persona(c).role==="organizer";
 const requireOrg=(c:any)=>{if(org(c))return null;const hasAuth=c.get("auth")||c.get("authCookiePresent");const demoOn=c.get("demoPersonaHeaders")!==false;const hasDemo=demoOn&&(c.req.header("x-demo-persona")||c.req.header("x-demo-role"));if(hasAuth||hasDemo)return fail(c,"organizer role required",403);return fail(c,"authentication required",401);};
 const scheduleRepo=deps.repo as Repository&{getSchedule?:(id:string)=>Promise<any>;putSchedule?:(id:string,s:any)=>Promise<void>};
 /**
  * Mirror a lifecycle session edit onto the canonical schedule session that every
  * public widget/feed reads.
  *
  * Publication rule: approving content PUBLISHES the session; any other content
  * status LEAVES the existing publication state alone. Previously this line reset
  * publishStatus to "draft" on every edit, which silently UNPUBLISHED a live
  * session the moment an organizer fixed its title — the edit then never reached
  * the public catalog.
  */
 const syncSession=async(sessionId:string)=>{const life=deps.store.sessions.find(s=>s.id===sessionId), state=deps.store.sessionContent.find(s=>s.sessionId===sessionId), schedule=await scheduleRepo.getSchedule?.(deps.store.event.id), target=schedule?.sessions.find((s:any)=>s.id===sessionId);if(life&&target){target.title=life.title;target.abstract=life.abstract;target.trackIds=[life.trackId];target.format=(life as any).format||target.format;if(state?.status==="approved"){target.publishStatus="published";if(target.status!=="published")target.status=target.status||"accepted";}else if(state?.status==="changes_requested"){target.publishStatus="draft";}if(scheduleRepo.putSchedule)await scheduleRepo.putSchedule(deps.store.event.id,schedule);}};
 const syncSpeaker=async(speakerId:string)=>{const profile=deps.store.profiles.find(p=>p.speakerId===speakerId), schedule=await scheduleRepo.getSchedule?.(deps.store.event.id), target=schedule?.speakers.find((s:any)=>s.id===speakerId);if(profile&&target){Object.assign(target,{name:profile.name,bio:profile.bio,company:profile.company,title:profile.title,headshotUrl:(profile as any).headshotUrl});if(scheduleRepo.putSchedule)await scheduleRepo.putSchedule(deps.store.event.id,schedule);}};
 const commentRole=(comment:{authorId:string;authorRole?:string})=>comment.authorRole||(deps.store.personas.find(p=>p.id===comment.authorId)?.role==="organizer"?"Organizer":"Speaker");
 const projectFile=(f:any)=>({...f,comments:(f.comments||[]).map((comment:any)=>({...comment,authorRole:commentRole(comment)}))});
 app.get("/api/events/:eventId/content",async(c)=>{if(!event(c))return fail(c,"event not found",404);const denied=requireOrg(c);if(denied)return denied;
  // Sessions are the canonical schedule rows (including runtime-created ones), each with
  // its approval state and full history so the restore UI exists before any save.
  const schedule=await scheduleRepo.getSchedule?.(deps.store.event.id);
  return c.json({data:{tasks:contentReadiness(deps.store),files:deps.store.contentFiles.map(f=>({...projectFile(f),speaker:deps.store.profiles.find(p=>p.speakerId===f.speakerId),session:deps.store.sessions.find(s=>s.id===f.sessionId),currentVersion:f.versions.find(v=>v.current)})),sessions:listEditableSessions(deps.store,schedule),speakers:deps.store.profiles}})});
 app.post("/api/events/:eventId/content/tasks",async(c)=>{if(!event(c))return fail(c,"event not found",404);const denied=requireOrg(c);if(denied)return denied;const b=await c.req.json();if(!b.name||!b.dueAt||!Array.isArray(b.speakerIds)||!b.speakerIds.length)return fail(c,"name, due date, and assigned speakers are required");const made=b.speakerIds.flatMap((speakerId:string)=>{const sessions=(b.sessionIds?.length?deps.store.sessions.filter(s=>b.sessionIds.includes(s.id)&&s.speakerId===speakerId):deps.store.sessions.filter(s=>s.speakerId===speakerId));const targets=sessions.length?sessions:[undefined];return targets.map((session:any)=>{
      // One canonical slot per speaker/session/kind: reuse+extend an equivalent
      // deliverable instead of forking a second row the uploads would miss.
      const candidate={id:`deliverable-${crypto.randomUUID().slice(0,8)}`,name:b.name,instructions:b.instructions||"",dueAt:b.dueAt,speakerId,sessionId:session?.id,fileRequired:b.fileRequired!==false,acceptedTypes:b.acceptedTypes||["application/pdf"],status:"incomplete" as const,createdAt:new Date().toISOString()};
      const {task,reused}=upsertDeliverable(deps.store,candidate);
      return {...task,reused};
    });});await deps.persist(deps.store.event.id, deps.store);return c.json({data:made},201)});
 app.get("/api/speaker/events/:eventId/deliverables",(c)=>{if(!event(c))return fail(c,"event not found",404);const p=deps.persona(c);if(p.role!=="speaker"||!p.speakerId)return fail(c,"speaker role required",403);return c.json({data:contentReadiness(deps.store).filter(t=>t.speakerId===p.speakerId)})});
 app.get("/api/speaker/events/:eventId/deliverables/:taskId",(c)=>{if(!event(c))return fail(c,"event not found",404);const p=deps.persona(c),task=deps.store.deliverableTasks.find(t=>t.id===c.req.param("taskId"));if(!task||p.role!=="speaker"||task.speakerId!==p.speakerId)return fail(c,"deliverable not found",404);const file=deps.store.contentFiles.find(f=>f.taskId===task.id);return c.json({data:{...contentReadiness(deps.store).find(t=>t.id===task.id),file:file?projectFile(file):undefined}})});
 app.post("/api/speaker/events/:eventId/deliverables/:taskId/upload",async(c)=>{if(!event(c))return fail(c,"event not found",404);const life=deps.store,p=deps.persona(c),task=life.deliverableTasks.find(t=>t.id===c.req.param("taskId"));if(!task||p.role!=="speaker"||task.speakerId!==p.speakerId)return fail(c,"deliverable not found",404);const b=await c.req.json();const canonical=canonicalDeliverable(life,task);const check=validateUpload(b,canonical.acceptedTypes);if(!check.ok)return fail(c,check.error);const kind=b.kind||(/image\//.test(b.mime)?"headshot":"document");const made=addFileVersion(life,{task:canonical,name:b.name,mime:b.mime,size:b.size,dataBase64:b.dataBase64,uploadedBy:p.id,kind});if(kind==="headshot"){const profile=life.profiles.find(x=>x.speakerId===canonical.speakerId);if(profile)(profile as any).headshotUrl=`/api/events/${life.event.id}/content/files/${made.file.id}/versions/${made.version.id}`;await syncSpeaker(canonical.speakerId)}await deps.persist(life.event.id,life);return c.json({data:made},201)});
 const download=(c:any)=>{const p=deps.persona(c),file=deps.store.contentFiles.find(f=>f.id===c.req.param("fileId"));if(!file)return fail(c,"file not found",404);const version=file.versions.find(v=>v.id===c.req.param("versionId"));if(!version)return fail(c,"version not found",404);const profile=deps.store.profiles.find(x=>x.speakerId===file.speakerId),isPublicHeadshot=file.kind==="headshot"&&((profile as any)?.headshotUrl===c.req.path||(profile as any)?.headshotUrl?.endsWith(`/content/files/${file.id}/versions/${version.id}`));if(!isPublicHeadshot&&!canAccessFile(file,p))return fail(c,"file not found",404);const bytes=Uint8Array.from(atob(version.dataBase64),x=>x.charCodeAt(0));return c.body(bytes.buffer,200,{"content-type":version.mime,"content-disposition":`inline; filename="${version.name.replaceAll('"','')}"`})};
 app.get("/api/events/:eventId/content/files/:fileId/versions/:versionId",download);
 app.get("/api/content/files/:fileId/versions/:versionId",download);
 app.post("/api/content/files/:fileId/comments",async(c)=>{const p=deps.persona(c),file=deps.store.contentFiles.find(f=>f.id===c.req.param("fileId"));if(!file||!canAccessFile(file,p))return fail(c,"file not found",404);const b=await c.req.json();if(!String(b.body||"").trim())return fail(c,"comment is required");const row={id:`comment-${crypto.randomUUID().slice(0,8)}`,authorId:p.id,authorName:p.name,authorRole:p.role==="organizer"?"Organizer":"Speaker",body:String(b.body),createdAt:new Date().toISOString()};file.comments.push(row as any);await deps.persist(deps.store.event.id, deps.store);return c.json({data:row},201)});
 app.patch("/api/events/:eventId/content/files/:fileId/approval",async(c)=>{if(!event(c))return fail(c,"event not found",404);const denied=requireOrg(c);if(denied)return denied;const file=deps.store.contentFiles.find(f=>f.id===c.req.param("fileId")),b=await c.req.json();if(!file)return fail(c,"file not found",404);if(!validStatus(b.status))return fail(c,"invalid approval status");file.status=b.status;file.approvalComment=b.comment||"";await deps.persist(deps.store.event.id, deps.store);return c.json({data:file})});
 app.post("/api/events/:eventId/content/reminders",async(c)=>{if(!event(c))return fail(c,"event not found",404);const denied=requireOrg(c);if(denied)return denied;const b=await c.req.json().catch(()=>({}));const outstanding=contentReadiness(deps.store).filter(t=>t.status!=="complete"&&(!b.overdueOnly||t.overdue)),ids=[...new Set(outstanding.map(t=>t.speakerId))],sent=[];for(const speakerId of ids){const profile=deps.store.profiles.find(p=>p.speakerId===speakerId);if(!profile)continue;const tasks=outstanding.filter(t=>t.speakerId===speakerId);const names=tasks.map(t=>`${t.name} (due ${t.dueAt.slice(0,10)})`);const subject="Speaker deliverables outstanding",text=`Please complete: ${names.join(", ")}`;const result=await deps.mailer.send({to:profile.email,subject,text,html:brandedHtmlFor(subject,text,{eventName:deps.store.event.name,kind:"reminder",tasks:tasks.map(t=>({title:t.name,dueAt:t.dueAt,overdue:t.overdue}))})}).catch(()=>({status:"failed" as const}));deps.store.communications.push({id:`comm-${crypto.randomUUID().slice(0,8)}`,speakerId,subject:"Speaker deliverables outstanding",body:names.join("\n"),kind:"reminder",status:result.status,providerId:"providerId" in result?result.providerId:undefined,ics:"",createdAt:new Date().toISOString()});sent.push({speakerId,status:result.status,providerId:"providerId" in result?result.providerId:undefined});}await deps.persist(deps.store.event.id, deps.store);return c.json({data:sent})});
 app.patch("/api/events/:eventId/content/sessions/:sessionId",async(c)=>{
  if(!event(c))return fail(c,"event not found",404);const denied=requireOrg(c);if(denied)return denied;
  const b=await c.req.json().catch(()=>null) as any;if(!b)return fail(c,"JSON body required");
  if(b.contentStatus&&!validStatus(b.contentStatus))return fail(c,"invalid approval status");
  const schedule=await scheduleRepo.getSchedule?.(deps.store.event.id);
  const p=deps.persona(c);
  const result=applySessionEdit({store:deps.store,schedule,id:c.req.param("sessionId"),patch:b,editor:{id:p.id,name:p.name}});
  if(!result.ok)return fail(c,result.error,result.status);
  // One propagation path: the canonical schedule object public projections read.
  if(result.scheduleTouched&&schedule&&scheduleRepo.putSchedule)await scheduleRepo.putSchedule(deps.store.event.id,schedule);
  await deps.persist(deps.store.event.id, deps.store);
  const row=listEditableSessions(deps.store,schedule).find(x=>x.canonicalId===result.canonicalId);
  return c.json({data:{...row,id:result.canonicalId,contentStatus:result.contentStatus,propagated:result.scheduleTouched}});
 });
 app.post("/api/events/:eventId/content/history/:historyId/restore",async(c)=>{
  if(!event(c))return fail(c,"event not found",404);const denied=requireOrg(c);if(denied)return denied;
  const h=deps.store.contentHistory.find(x=>x.id===c.req.param("historyId"));if(!h)return fail(c,"history not found",404);
  const p=deps.persona(c);
  if(h.entityType==="session"){
   const schedule=await scheduleRepo.getSchedule?.(deps.store.event.id);
   const result=restoreSessionHistory({store:deps.store,schedule,historyId:h.id,editor:{id:p.id,name:p.name}});
   if(!result.ok)return fail(c,result.error,result.status);
   if(result.scheduleTouched&&schedule&&scheduleRepo.putSchedule)await scheduleRepo.putSchedule(deps.store.event.id,schedule);
  }else{const profile=deps.store.profiles.find(x=>x.speakerId===h.entityId);if(profile){Object.assign(profile,h.before);await syncSpeaker(profile.speakerId)}}
  await deps.persist(deps.store.event.id, deps.store);
  if(h.entityType==="session"){
   const schedule=await scheduleRepo.getSchedule?.(deps.store.event.id);
   const row=listEditableSessions(deps.store,schedule).find(x=>x.canonicalId===h.entityId||x.lifecycleId===h.entityId);
   return c.json({data:{...row,restoredHistoryId:h.id,restoredAt:new Date().toISOString()}});
  }
  return c.json({data:h});
 });
 app.patch("/api/events/:eventId/content/speakers/:speakerId",async(c)=>{if(!event(c))return fail(c,"event not found",404);const denied=requireOrg(c);if(denied)return denied;const profile=deps.store.profiles.find(p=>p.speakerId===c.req.param("speakerId")),b=await c.req.json();if(!profile)return fail(c,"speaker not found",404);const before={bio:profile.bio,company:profile.company,title:profile.title,headshotUrl:(profile as any).headshotUrl};Object.assign(profile,{bio:b.bio??profile.bio,company:b.company??profile.company,title:b.title??profile.title});if(b.headshotUrl!==undefined)(profile as any).headshotUrl=b.headshotUrl;const p=deps.persona(c);deps.store.contentHistory.push({id:`history-${crypto.randomUUID().slice(0,8)}`,entityType:"speaker",entityId:profile.speakerId,editorId:p.id,editorName:p.name,createdAt:new Date().toISOString(),before,after:{bio:profile.bio,company:profile.company,title:profile.title,headshotUrl:(profile as any).headshotUrl}});await syncSpeaker(profile.speakerId);await deps.persist(deps.store.event.id, deps.store);return c.json({data:profile})});
 /**
  * —— Archive export (CNT-14) ——
  *
  * The organizer picks exactly what to archive; an empty or malformed selection is a
  * 400, never a silent "export everything". Only the CURRENT version of each file is
  * included, and only files owned by this event's content records.
  */
 const cleanSegment=(value:string)=>String(value||"").replace(/[^a-zA-Z0-9._ -]+/g,"-").replace(/^[.\s]+|[\s.]+$/g,"").slice(0,80)||"General";

 /** Latest (current) version of a file, or the last uploaded one as a fallback. */
 const currentVersion=(file:any)=>file.versions.find((v:any)=>v.current)||file.versions.at(-1);

 /** Resolve which content files a selection refers to, in a stable order. */
 const selectedFiles=(selection:{sessionIds?:string[];fileIds?:string[]})=>{
  const fileIds=new Set((selection.fileIds||[]).map(String));
  const sessionIds=new Set((selection.sessionIds||[]).map(String));
  return deps.store.contentFiles.filter(f=>fileIds.has(f.id)||(f.sessionId?sessionIds.has(f.sessionId):false));
 };

 /** Folder for a file under the chosen grouping. */
 const folderFor=(file:any,grouping:"session"|"speaker")=>{
  if(grouping==="speaker"){
   const speaker=deps.store.profiles.find(p=>p.speakerId===file.speakerId);
   return cleanSegment(speaker?.name||"Unassigned");
  }
  const session=deps.store.sessions.find(s=>s.id===file.sessionId);
  return cleanSegment(session?.title||"General");
 };

 /** Build ZIP entries, disambiguating duplicate paths so no file is silently dropped. */
 const buildEntries=(files:any[],grouping:"session"|"speaker")=>{
  const used=new Map<string,number>(),entries:{name:string;bytes:Uint8Array}[]=[];
  for(const file of files){
   const version=currentVersion(file);
   if(!version)continue;
   const folder=folderFor(file,grouping);
   const base=cleanSegment(version.name||`${file.id}.bin`);
   let path=`${folder}/${base}`;
   if(used.has(path)){
    const n=(used.get(path)||1)+1;used.set(path,n);
    const dot=base.lastIndexOf(".");
    const stem=dot>0?base.slice(0,dot):base,ext=dot>0?base.slice(dot):"";
    path=`${folder}/${stem} (${n})${ext}`;
   }else used.set(path,1);
   entries.push({name:path,bytes:Uint8Array.from(atob(version.dataBase64),x=>x.charCodeAt(0))});
  }
  return entries;
 };

 const zipResponse=(c:any,entries:{name:string;bytes:Uint8Array}[],grouping:string)=>{
  const zip=createZip(entries);
  return c.body(zip.buffer,200,{
   "content-type":"application/zip",
   "content-disposition":"attachment; filename=cue-content-archive.zip",
   "x-cue-file-count":String(entries.length),
   "x-cue-grouping":grouping,
   "x-cue-entry-names":encodeURIComponent(JSON.stringify(entries.map(entry=>entry.name))),
  });
 };

 /** Legacy GET stays global (unchanged behaviour for any existing consumer). */
 const exportAllZip=(c:any)=>{
  if(!event(c))return fail(c,"event not found",404);
  const denied=requireOrg(c);if(denied)return denied;
  const entries=buildEntries(deps.store.contentFiles,"session");
  return zipResponse(c,entries,"session");
 };

 /** Filtered POST used by the archive dialog. */
 const exportSelectionZip=async(c:any)=>{
  if(!event(c))return fail(c,"event not found",404);
  const denied=requireOrg(c);if(denied)return denied;
  const body=await c.req.json().catch(()=>null) as any;
  if(!body||typeof body!=="object")return fail(c,"selection payload required");
  const grouping=body.grouping;
  if(grouping!=="session"&&grouping!=="speaker")return fail(c,'grouping must be "session" or "speaker"');
  const sessionIds=Array.isArray(body.sessionIds)?body.sessionIds.filter((x:any)=>typeof x==="string"&&x.trim()):[];
  const fileIds=Array.isArray(body.fileIds)?body.fileIds.filter((x:any)=>typeof x==="string"&&x.trim()):[];
  if(!sessionIds.length&&!fileIds.length)return fail(c,"select at least one session or file to export");
  const files=selectedFiles({sessionIds,fileIds});
  const entries=buildEntries(files,grouping);
  if(!entries.length)return fail(c,"no matching files with an uploaded version for this selection");
  return zipResponse(c,entries,grouping);
 };
 app.get("/api/events/:eventId/content/export",exportAllZip);
 app.post("/api/events/:eventId/content/export",exportSelectionZip);
 return app;
}
