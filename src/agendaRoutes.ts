import { Hono } from "hono";
import type { Repository, ScheduleProjection } from "./domain.js";
import type { AgendaProposal, LifecycleStore } from "./lifecycle.js";
import { applyScheduleMove, validateSlot, type AgendaSlot } from "./schedule.js";

const fail=(c:any,message:string,status=400)=>c.json({error:{message}},status as any);
type ScheduleRepo=Repository&{getSchedule?:(id:string)=>Promise<ScheduleProjection|undefined>;putSchedule?:(id:string,s:ScheduleProjection)=>Promise<void>};

/** Turn opaque conflict ids/codes into organizer-readable copy. */
export function humanizeAgendaConflict(
  conflict: { id?: string; code?: string; message?: string; relatedIds?: string[] },
  data: {
    sessions?: { id: string; title: string; capacity?: number }[];
    rooms?: { id: string; name: string; capacity?: number }[];
    tracks?: { id: string; name: string }[];
    speakers?: { id: string; name: string }[];
  },
): string {
  if (conflict.message && !/^(CAPACITY|ROOM_OVERLAP|SPEAKER_OVERLAP|TRACK_CONCURRENCY):/.test(conflict.message)) {
    return conflict.message;
  }
  const code = conflict.code || String(conflict.id || "").split(":")[0] || "";
  const ids = conflict.relatedIds?.length
    ? conflict.relatedIds
    : String(conflict.id || "").split(":").slice(1).filter(Boolean);
  const sessionTitle = (id: string) => data.sessions?.find((s) => s.id === id)?.title || id;
  const roomName = (id: string) => data.rooms?.find((r) => r.id === id)?.name || id;
  const trackName = (id: string) => data.tracks?.find((t) => t.id === id)?.name || id;
  const speakerName = (id: string) => data.speakers?.find((s) => s.id === id)?.name || id;
  if (code === "CAPACITY" || String(conflict.id || "").startsWith("CAPACITY:")) {
    const sess =
      ids.find((id) => data.sessions?.some((s) => s.id === id) || id.startsWith("ses-")) || ids[0];
    const room =
      ids.find((id) => data.rooms?.some((r) => r.id === id) || id.startsWith("room-")) || ids[1];
    const roomObj = data.rooms?.find((r) => r.id === room);
    const sessObj = data.sessions?.find((s) => s.id === sess);
    const cap = roomObj?.capacity != null ? `${roomObj.capacity}-seat` : "listed";
    const need =
      sessObj?.capacity != null ? `${sessObj.capacity} expected attendees` : "expected attendance";
    return `Capacity warning: "${sessionTitle(sess || "")}" needs ${need} but ${roomName(room || "")} is a ${cap} room.`;
  }
  if (code === "ROOM_OVERLAP" || String(conflict.id || "").startsWith("ROOM_OVERLAP:")) {
    return `Room overlap involving ${ids.map(sessionTitle).join(" and ")}.`;
  }
  if (code === "SPEAKER_OVERLAP" || String(conflict.id || "").startsWith("SPEAKER_OVERLAP:")) {
    return `Speaker double-booked: ${ids.map((id) => (id.startsWith("spk-") ? speakerName(id) : sessionTitle(id))).join(", ")}.`;
  }
  if (code === "TRACK_CONCURRENCY" || String(conflict.id || "").startsWith("TRACK_CONCURRENCY:")) {
    return `Track concurrency: too many sessions in ${ids.map(trackName).join(", ")} at once.`;
  }
  return conflict.message || conflict.id || "Schedule warning";
}

export function createAgendaRoutes(deps:{store:LifecycleStore;repo:Repository;persist:()=>Promise<void>;persona:(c:any)=>{role:string}}){
 const app=new Hono(),org=(c:any)=>deps.persona(c).role==="organizer",schedule=()=> (deps.repo as ScheduleRepo).getSchedule?.(deps.store.event.id);
 const guard=(c:any)=>org(c)?null:fail(c,"organizer role required",403);
 app.get("/api/events/:eventId/agenda/proposals",async c=>{const denied=guard(c);if(denied)return denied;if(c.req.param("eventId")!==deps.store.event.id)return fail(c,"event not found",404);return c.json({data:deps.store.agendaProposals||[]})});
 app.post("/api/events/:eventId/agenda/rooms",async c=>{const denied=guard(c);if(denied)return denied;const data=await schedule(),b=await c.req.json().catch(()=>null) as any;if(!data||!b?.name?.trim())return fail(c,"room name is required");const room={id:b.id||`room-${crypto.randomUUID().slice(0,8)}`,name:String(b.name).trim(),capacity:b.capacity?Number(b.capacity):undefined,color:b.color||"#5B5CFF"};data.rooms.push(room);await (deps.repo as ScheduleRepo).putSchedule?.(deps.store.event.id,data);await deps.persist();return c.json({data:room},201)});
 app.post("/api/events/:eventId/agenda/tracks",async c=>{const denied=guard(c);if(denied)return denied;const data=await schedule(),b=await c.req.json().catch(()=>null) as any;if(!data||!b?.name?.trim())return fail(c,"track name is required");const track={id:b.id||`track-${crypto.randomUUID().slice(0,8)}`,name:String(b.name).trim(),color:b.color||"#5B5CFF",maxConcurrent:b.maxConcurrent?Number(b.maxConcurrent):undefined};data.tracks.push(track);await (deps.repo as ScheduleRepo).putSchedule?.(deps.store.event.id,data);await deps.persist();return c.json({data:track},201)});
 app.post("/api/events/:eventId/agenda/publish",async c=>{const denied=guard(c);if(denied)return denied;const data=await schedule();if(!data)return fail(c,"schedule not found",404);const scheduled=new Set(data.slots.map(x=>x.sessionId));let count=0;for(const session of data.sessions.filter(x=>scheduled.has(x.id))){session.status="published";session.publishStatus="published";count++}data.version++;const publishedAt=new Date().toISOString();const publicUrl=`/public/events/${deps.store.event.id}/itinerary`;(data as any).lastAgendaPublish={status:"published",count,publishedAt,publicUrl};await (deps.repo as ScheduleRepo).putSchedule?.(deps.store.event.id,data);await deps.persist();return c.json({data:{status:"published",count,publishedAt,publicUrl,message:`Published · ${count} session${count===1?"":"s"} · ${publishedAt}`}})});
 app.post("/api/events/:eventId/agenda/proposals/generate",async c=>{
  const denied=guard(c);if(denied)return denied;const data=await schedule();if(!data)return fail(c,"schedule not found",404);const body=await c.req.json().catch(()=>({})) as any;
  const constraints={dayStartHour:Number(body.dayStartHour??9),dayEndHour:Number(body.dayEndHour??17),slotMinutes:Number(body.slotMinutes??30),breakMinutes:Number(body.breakMinutes??0),speakerAvailability:body.speakerAvailability||{}};
  if(constraints.dayStartHour<0||constraints.dayEndHour>24||constraints.dayStartHour>=constraints.dayEndHour||constraints.slotMinutes<5||constraints.breakMinutes<0)return fail(c,"invalid agenda constraints");
  const working=structuredClone(data),placements:AgendaProposal["placements"]=[],scheduled=new Set(data.slots.map(x=>x.sessionId));
  const days:string[]=[];for(let at=Date.parse(data.event.startsAt);at<Date.parse(data.event.endsAt);at+=86400000)days.push(new Date(at).toISOString().slice(0,10));
  for(const session of [...data.sessions].filter(s=>s.status==="accepted"&&!scheduled.has(s.id)).sort((a,b)=>a.title.localeCompare(b.title))){let chosen:AgendaSlot|undefined;
   for(const day of days)for(let minute=constraints.dayStartHour*60;minute+session.durationMinutes<=constraints.dayEndHour*60;minute+=constraints.slotMinutes+constraints.breakMinutes)for(const room of [...data.rooms].sort((a,b)=>a.name.localeCompare(b.name))){
    const startsAt=`${day}T${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}:00.000Z`,endsAt=new Date(Date.parse(startsAt)+session.durationMinutes*60000).toISOString();const available=session.speakerIds.every(id=>{const ranges=constraints.speakerAvailability[id];return !ranges?.length||ranges.some((r:any)=>Date.parse(r.startsAt)<=Date.parse(startsAt)&&Date.parse(r.endsAt)>=Date.parse(endsAt))});if(!available)continue;
    const trial={id:`ai-slot-${session.id}`,sessionId:session.id,roomId:room.id,startsAt,endsAt};if(!validateSlot(working,trial).conflicts.some(x=>x.severity==="hard")){chosen=trial;break;}}
   if(chosen){working.slots.push(chosen);const warningConflicts=validateSlot(data,chosen).conflicts.filter(x=>x.severity==="warning");const warnings=warningConflicts.map(x=>humanizeAgendaConflict(x,data));placements.push({id:`place-${crypto.randomUUID().slice(0,8)}`,sessionId:session.id,slot:chosen,status:"proposed",rationale:`Deterministic demo heuristic chose the earliest conflict-free ${data.rooms.find(r=>r.id===chosen!.roomId)?.name} slot; respected ${session.durationMinutes}-minute duration, room, track, speaker overlap, configured hours/breaks, and supplied availability.`,conflicts:warnings})}
  }
  const prior=(deps.store.agendaProposals||[])[0],proposal:AgendaProposal={id:`agenda-${crypto.randomUUID().slice(0,8)}`,eventId:deps.store.event.id,status:"review",provenance:"deterministic_heuristic_demo",generatedAt:new Date().toISOString(),generation:(prior?.generation||0)+1,constraints,placements};deps.store.agendaProposals=[proposal,...(deps.store.agendaProposals||[])];await deps.persist();return c.json({data:proposal},201);
 });
 app.post("/api/events/:eventId/agenda/proposals/:id/placements/:placementId/:decision",async c=>{
  const denied=guard(c);if(denied)return denied;const proposal=deps.store.agendaProposals.find(x=>x.id===c.req.param("id")),placement=proposal?.placements.find(x=>x.id===c.req.param("placementId"));if(!proposal||!placement)return fail(c,"proposal placement not found",404);if(placement.status!=="proposed")return fail(c,"placement already decided",409);
  if(c.req.param("decision")==="reject"){placement.status="rejected";placement.decidedAt=new Date().toISOString();proposal.status=proposal.placements.every(x=>x.status==="rejected")?"rejected":"partially_applied";await deps.persist();return c.json({data:placement})}
  if(c.req.param("decision")!=="accept")return fail(c,"invalid decision");const data=await schedule();if(!data)return fail(c,"schedule not found",404);const check=validateSlot(data,placement.slot),result=applyScheduleMove(data,placement.slot,data.version,check.conflicts.filter(x=>x.severity==="warning").map(x=>x.id));if(!result.ok){placement.status="conflict";placement.conflicts=result.conflicts.map(x=>x.message);await deps.persist();return c.json({error:result.error,...result},result.status as any)}await (deps.repo as ScheduleRepo).putSchedule?.(deps.store.event.id,data);placement.status="accepted";placement.decidedAt=new Date().toISOString();proposal.status=proposal.placements.every(x=>x.status!=="proposed")?"applied":"partially_applied";await deps.persist();return c.json({data:{placement,version:data.version}});
 });
 app.post("/api/events/:eventId/agenda/proposals/:id/:decision",async c=>{const denied=guard(c);if(denied)return denied;const p=deps.store.agendaProposals.find(x=>x.id===c.req.param("id"));if(!p)return fail(c,"proposal not found",404);if(c.req.param("decision")==="reject"){for(const x of p.placements.filter(x=>x.status==="proposed")){x.status="rejected";x.decidedAt=new Date().toISOString()}p.status="rejected";await deps.persist();return c.json({data:p})}if(c.req.param("decision")!=="accept")return fail(c,"invalid decision");const data=await schedule();if(!data)return fail(c,"schedule not found",404);const outcomes=[];for(const placement of p.placements.filter(x=>x.status==="proposed")){const check=validateSlot(data,placement.slot),result=applyScheduleMove(data,placement.slot,data.version,check.conflicts.filter(x=>x.severity==="warning").map(x=>x.id));if(result.ok){placement.status="accepted";placement.decidedAt=new Date().toISOString()}else{placement.status="conflict";placement.conflicts=result.conflicts.map(x=>x.message)}outcomes.push({placementId:placement.id,ok:result.ok,error:result.error})}await (deps.repo as ScheduleRepo).putSchedule?.(deps.store.event.id,data);p.status=p.placements.every(x=>x.status==="accepted")?"applied":"partially_applied";await deps.persist();return c.json({data:p,outcomes,version:data.version})});
 return app;
}
