export type ConflictSeverity = "hard" | "warning";
export type ConflictCode = "INVALID_RANGE" | "ROOM_OVERLAP" | "SPEAKER_OVERLAP" | "TRACK_CONCURRENCY" | "CAPACITY" | "UNSCHEDULED_ACCEPTED" | "MISSING_PUBLIC_CONTENT" | "SESSION_CANCELLED";
export interface ScheduleRoom { id:string; name:string; capacity?:number; color?:string }
export interface ScheduleTrack { id:string; name:string; color:string; maxConcurrent?:number }
export interface ScheduleSpeaker { id:string; name:string; email?:string; bio:string; company?:string; title?:string; headshotUrl?:string; isPublic?:boolean; acceptedSubmissionId?:string }
export interface ScheduleSession { id:string; acceptedSubmissionId?:string; title:string; abstract:string; speakerIds:string[]; trackIds:string[]; durationMinutes:number; capacity?:number; status:"accepted"|"draft"|"published"; publishStatus:"draft"|"published"; publicationState?:"draft"|"approved"; cancelled?:boolean; cancellationReason?:string; slug:string; format?:string }
export interface AgendaSlot { id:string; sessionId:string; roomId:string; startsAt:string; endsAt:string }
/** Recent placements shown on the Schedule page so a reload proves work persisted. */
export interface PlacementRecord { id:string; sessionId:string; title:string; roomId:string; roomName:string; startsAt:string; endsAt:string; dayKey:string; placedAt:string; source:"manual"|"ai" }
export interface ScheduleData { event?:{startsAt:string;endsAt:string;timezone:string}; version:number; rooms:ScheduleRoom[]; tracks:ScheduleTrack[]; speakers:ScheduleSpeaker[]; sessions:ScheduleSession[]; slots:AgendaSlot[]; lastPlacements?:PlacementRecord[] }
export interface ScheduleConflict { id:string; severity:ConflictSeverity; code:ConflictCode; message:string; relatedIds:string[] }
export interface SuggestedSlot { roomId:string; startsAt:string; endsAt:string; label:string }
export interface Validation { conflicts:ScheduleConflict[]; alternatives:SuggestedSlot[] }
export interface ScheduleMoveResult { ok:boolean; status:200|400|409|422; error?:string; conflicts:ScheduleConflict[]; warnings:ScheduleConflict[]; slot?:AgendaSlot; version:number }
import { EVENT_TIME_ZONE, zonedDayKey } from "./timezone.js";

const ms=(v:string)=>Date.parse(v);
/** Half-open [start,end) intersection; equal endpoints deliberately do not overlap. */
export const overlaps=(a:{startsAt:string;endsAt:string},b:{startsAt:string;endsAt:string})=>ms(a.startsAt)<ms(b.endsAt)&&ms(b.startsAt)<ms(a.endsAt);
/** Old snapshots and shipped seed schedules predate explicit approval. */
export function normalizeScheduleSessions(data:ScheduleData){for(const session of data.sessions)if(!session.publicationState)session.publicationState="approved";return data}
/** Single source of the advisory capacity sentence (server conflicts + organizer cards). */
export function capacityWarningMessage(expected:number,roomName:string,capacity:number){
 return `Expected attendance ${expected} exceeds ${roomName} capacity ${capacity} (over by ${expected-capacity}) \u2014 advisory only, placement is allowed.`;
}

const conflict=(severity:ConflictSeverity,code:ConflictCode,relatedIds:string[],message:string):ScheduleConflict=>({id:`${code}:${[...relatedIds].sort().join(":")}`,severity,code,relatedIds:[...relatedIds].sort(),message});
/** Accepted or published, not cancelled — the sessions that belong on the agenda / unscheduled KPI. */
export function isAcceptedOrPublishedSession(session:{cancelled?:boolean;status?:string}):boolean{
 return !session.cancelled && (session.status==="accepted"||session.status==="published");
}
/** Shared unscheduled predicate: KPI, warnings, and command blockers must agree. */
export function isAcceptedUnscheduled(session:{id:string;cancelled?:boolean;status?:string},slottedIds:Set<string>):boolean{
 return isAcceptedOrPublishedSession(session) && !slottedIds.has(session.id);
}
export function validateSlot(data:ScheduleData, candidate:AgendaSlot):Validation {
 const s=data.sessions.find(x=>x.id===candidate.sessionId); const room=data.rooms.find(x=>x.id===candidate.roomId); const cs:ScheduleConflict[]=[];
 // INVALID_RANGE must only fire for genuinely invalid input, and must say WHICH part
 // is wrong — organizers were shown "choose a valid room and end time" for placements
 // whose real problem was an unknown session id or a room that had not synced yet.
 const invalidReason = !s
   ? `Session ${candidate.sessionId} is not on this schedule yet — reload the schedule and try again.`
   : !room
     ? `Room ${candidate.roomId} is not on this schedule yet — reload the schedule and try again.`
     : !Number.isFinite(ms(candidate.startsAt)) || !Number.isFinite(ms(candidate.endsAt))
       ? "Start and end times must be valid timestamps."
       : ms(candidate.endsAt)<=ms(candidate.startsAt)
         ? "The end time must be after the start time."
         : "";
 if(invalidReason) cs.push(conflict("hard","INVALID_RANGE",[candidate.sessionId,candidate.roomId],invalidReason));
 if(s&&room) {
  for(const other of data.slots.filter(x=>x.sessionId!==candidate.sessionId && !data.sessions.find(s=>s.id===x.sessionId)?.cancelled && overlaps(x,candidate)).sort((a,b)=>a.sessionId.localeCompare(b.sessionId))) {
   if(other.roomId===candidate.roomId){
    const occupant=data.sessions.find(x=>x.id===other.sessionId);
    cs.push(conflict("hard","ROOM_OVERLAP",[candidate.sessionId,other.sessionId,candidate.roomId],`${room.name} is already occupied ${eventClockRange(other.startsAt,other.endsAt,data)}${occupant?` by ${occupant.title}`:""}.`));
   }
   const os=data.sessions.find(x=>x.id===other.sessionId); const shared=[...new Set(s.speakerIds.filter(id=>os?.speakerIds.includes(id)))].sort();
   if(shared.length) cs.push(conflict("hard","SPEAKER_OVERLAP",[candidate.sessionId,other.sessionId,...shared],`${shared.map(id=>data.speakers.find(x=>x.id===id)?.name??id).join(", ")} is already speaking during this time.`));
  }
  // Capacity is ADVISORY: it never blocks a placement, so the copy states the numbers,
  // the overage and that the organizer may proceed.
  if(s.capacity && room.capacity && s.capacity>room.capacity) cs.push(conflict("warning","CAPACITY",[s.id,room.id],capacityWarningMessage(s.capacity,room.name,room.capacity)));
  for(const tid of [...s.trackIds].sort()) { const t=data.tracks.find(x=>x.id===tid); if(t?.maxConcurrent) { const n=data.slots.filter(x=>{const os=data.sessions.find(q=>q.id===x.sessionId);return x.sessionId!==s.id&&!os?.cancelled&&overlaps(x,candidate)&&!!os?.trackIds.includes(tid)}).length+1; if(n>t.maxConcurrent)cs.push(conflict("hard","TRACK_CONCURRENCY",[s.id,tid],`${t.name} allows only ${t.maxConcurrent} concurrent session${t.maxConcurrent===1?"":"s"}.`)); } }
 }
 const alternatives:SuggestedSlot[]=[];
 if(s && room) { const eventStart=data.event?.startsAt||candidate.startsAt; const eventEnd=data.event?.endsAt||new Date(ms(eventStart)+8*3600000).toISOString(); const first=Math.ceil(ms(eventStart)/3600000)*3600000; for(const r of [...data.rooms].sort((a,b)=>a.name.localeCompare(b.name))) for(let at=first;at<ms(eventEnd);at+=3600000) { const start=new Date(at).toISOString(); const end=new Date(at+s.durationMinutes*60000).toISOString(); if(ms(end)>ms(eventEnd))break; const trial={...candidate,roomId:r.id,startsAt:start,endsAt:end}; if(!validateCore(data,trial).some(x=>x.severity==="hard")) alternatives.push({roomId:r.id,startsAt:start,endsAt:end,label:`${r.name} · ${start.slice(0,16)}Z`}); if(alternatives.length>=3)break; } }
 return {conflicts:cs.sort((a,b)=>a.severity.localeCompare(b.severity)||a.code.localeCompare(b.code)||a.id.localeCompare(b.id)),alternatives};
}
function validateCore(data:ScheduleData,candidate:AgendaSlot){ const s=data.sessions.find(x=>x.id===candidate.sessionId); const room=data.rooms.find(x=>x.id===candidate.roomId); const cs:ScheduleConflict[]=[]; if(!s||!room||ms(candidate.endsAt)<=ms(candidate.startsAt))return [conflict("hard","INVALID_RANGE",[candidate.sessionId],"Invalid")]; for(const o of data.slots.filter(x=>x.sessionId!==candidate.sessionId&&!data.sessions.find(s=>s.id===x.sessionId)?.cancelled&&overlaps(x,candidate))){if(o.roomId===candidate.roomId)cs.push(conflict("hard","ROOM_OVERLAP",[o.sessionId,candidate.sessionId],"Room"));const os=data.sessions.find(x=>x.id===o.sessionId);if(s.speakerIds.some(id=>os?.speakerIds.includes(id)))cs.push(conflict("hard","SPEAKER_OVERLAP",[o.sessionId,candidate.sessionId],"Speaker"));}return cs }
export function scheduleWarnings(data:ScheduleData):ScheduleConflict[]{
 const slotted=new Set(data.slots.map(x=>x.sessionId));
 return data.sessions.filter(s=>isAcceptedUnscheduled(s,slotted)).map(s=>conflict("warning","UNSCHEDULED_ACCEPTED",[s.id],`${s.title} is accepted but unscheduled.`)).sort((a,b)=>a.id.localeCompare(b.id));
}
/** Union of unscheduled-accepted warnings and every placed-slot validation conflict. */
export function collectScheduleIssues(data:ScheduleData):ScheduleConflict[]{
 const byId=new Map<string,ScheduleConflict>();
 for(const row of scheduleWarnings(data)) byId.set(row.id,row);
 for(const slot of data.slots){
  if(data.sessions.find(s=>s.id===slot.sessionId)?.cancelled) continue;
  for(const row of validateSlot(data,slot).conflicts) byId.set(row.id,row);
 }
 return [...byId.values()].sort((a,b)=>a.severity.localeCompare(b.severity)||a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
}
/** The single canonical mutation used by manual moves and accepted agenda suggestions. */
export function applyScheduleMove(data:ScheduleData, slot:AgendaSlot, version:number, acknowledge:string[]=[]):ScheduleMoveResult {
 if(version!==data.version)return {ok:false,status:409,error:"stale schedule",conflicts:[],warnings:[],version:data.version};
 const target=data.sessions.find(x=>x.id===slot.sessionId);
 if(target?.cancelled){
  const cancelled=conflict("hard","SESSION_CANCELLED",[slot.sessionId],`${target.title} is cancelled and cannot be placed on the schedule.`);
  return {ok:false,status:400,error:"cancelled sessions cannot be placed",conflicts:[cancelled],warnings:[],version:data.version};
 }
 const result=validateSlot(data,slot),hard=result.conflicts.filter(x=>x.severity==="hard"),warnings=result.conflicts.filter(x=>x.severity==="warning");
 if(hard.length)return {ok:false,status:409,error:"hard conflicts block this move",conflicts:result.conflicts,warnings,version:data.version};
 if(warnings.some(x=>!acknowledge.includes(x.id)))return {ok:false,status:422,error:"warnings require acknowledgement",conflicts:result.conflicts,warnings,version:data.version};
 const i=data.slots.findIndex(x=>x.sessionId===slot.sessionId);if(i>=0)data.slots[i]=slot;else data.slots.push(slot);data.version++;
 return {ok:true,status:200,conflicts:result.conflicts,warnings,slot,version:data.version};
}
export function publicSchedule(data:ScheduleData){const published=data.sessions.filter(s=>!s.cancelled&&s.publicationState!=="draft"&&s.publishStatus==="published"&&(s.status==="published"||s.status==="accepted"));const eligible=new Set(published.flatMap(s=>s.speakerIds));const publicSpeakers=new Map(data.speakers.filter(x=>x.isPublic!==false&&eligible.has(x.id)).map(x=>[x.id,x]));const publishedIds=new Set(published.map(s=>s.id));return data.slots.map(slot=>{const s=data.sessions.find(x=>x.id===slot.sessionId)!;const room=data.rooms.find(x=>x.id===slot.roomId)!;return {id:s.id,title:s.title,abstract:s.abstract,startsAt:slot.startsAt,endsAt:slot.endsAt,room:room?.name||"TBA",tracks:s.trackIds.map(id=>data.tracks.find(t=>t.id===id)?.name).filter(Boolean),speakers:s.speakerIds.map(id=>publicSpeakers.get(id)).filter(Boolean).map(x=>({id:x!.id,name:x!.name,bio:x!.bio,company:x!.company,title:x!.title,headshotUrl:x!.headshotUrl}))}}).filter(x=>publishedIds.has(x.id)).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.title.localeCompare(b.title));}

/** Event-timezone clock range used in conflict copy ("10:00–10:45"). */
export function eventClockRange(startsAt:string,endsAt:string,data?:ScheduleData){
 const timeZone=data?.event?.timezone||EVENT_TIME_ZONE;
 try{
  const fmt=(iso:string)=>new Intl.DateTimeFormat("en-US",{timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(iso));
  return `${fmt(startsAt)}\u2013${fmt(endsAt)}`;
 }catch{return "during this time"}
}

export const MAX_RECENT_PLACEMENTS = 5;

/**
 * Record a placement on the canonical schedule (bounded, newest first). Lives on the
 * schedule object so it is persisted/snapshotted with everything else and survives the
 * reload the organizer does to check their work.
 */
export function recordPlacement(data:ScheduleData, slot:AgendaSlot, source:PlacementRecord["source"]="manual"){
 const session=data.sessions.find(x=>x.id===slot.sessionId);
 const room=data.rooms.find(x=>x.id===slot.roomId);
 const timeZone=data.event?.timezone||EVENT_TIME_ZONE;
 const record:PlacementRecord={
  id:`placed-${slot.sessionId}-${Date.parse(slot.startsAt)||0}`,
  sessionId:slot.sessionId,
  title:session?.title||slot.sessionId,
  roomId:slot.roomId,
  roomName:room?.name||slot.roomId,
  startsAt:slot.startsAt,
  endsAt:slot.endsAt,
  dayKey:zonedDayKey(slot.startsAt,timeZone),
  placedAt:new Date().toISOString(),
  source,
 };
 const rest=(data.lastPlacements||[]).filter(x=>x.sessionId!==record.sessionId);
 data.lastPlacements=[record,...rest].slice(0,MAX_RECENT_PLACEMENTS);
 return record;
}
