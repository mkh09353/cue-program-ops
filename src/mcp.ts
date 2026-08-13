import { Hono } from "hono";
import { authStore, tokenHash } from "./auth.js";
import type { Mailer } from "./mailer.js";
import type { Repository } from "./domain.js";
import { activateEvent, listEvents } from "./events.js";
import { completeTaskForSpeaker, EVENT_ID, EVENT_SLUG, readiness, reminderPlans, reviewHistory, sendTemplate, store, type SubmissionStatus } from "./lifecycle.js";
import { scheduleWarnings, validateSlot, type ScheduleConflict, type ScheduleData } from "./schedule.js";

const versions=["2025-06-18","2025-03-26"] as const;
const statuses:SubmissionStatus[]=["draft","submitted","under_review","accepted","waitlisted","rejected","withdrawn"];
const objectSchema=(properties:Record<string,unknown>={},required:string[]=[])=>({type:"object",properties,...(required.length?{required}:{}),additionalProperties:false});
export const MCP_TOOLS=[
 {name:"list_events",description:"List CUE conference events with identifiers, dates, timezone, and public slug.",inputSchema:objectSchema()},
 {name:"list_submissions",description:"List submissions for the seeded active event, optionally filtered by lifecycle status.",inputSchema:objectSchema({status:{type:"string",enum:statuses}})},
 {name:"get_submission",description:"Get one submission and its canonical human/AI review history summary.",inputSchema:objectSchema({id:{type:"string",description:"Submission id"}},["id"])},
 {name:"list_speakers",description:"List canonical speaker profiles with onboarding tasks and derived readiness.",inputSchema:objectSchema()},
 {name:"get_schedule",description:"Get canonical sessions, rooms, times, and warnings from CUE's schedule conflict engine.",inputSchema:objectSchema()},
 {name:"list_review_progress",description:"List per-submission review assignment and completed-review progress.",inputSchema:objectSchema()},
 {name:"send_task_reminder",description:"Send/log a task reminder through CUE's existing template, communication, and mailer path.",inputSchema:objectSchema({speakerId:{type:"string"},taskId:{type:"string"}},["speakerId","taskId"])},
 {name:"complete_speaker_task",description:"Complete a speaker onboarding task through CUE's canonical task completion rules.",inputSchema:objectSchema({speakerId:{type:"string"},taskId:{type:"string"}},["speakerId","taskId"])},
] as const;

const rpc=(id:unknown,result:unknown)=>({jsonrpc:"2.0",id,result});
const rpcError=(id:unknown,code:number,message:string,data?:unknown)=>({jsonrpc:"2.0",id,error:{code,message,...(data===undefined?{}:{data})}});
const toolResult=(value:unknown,isError=false)=>({content:[{type:"text",text:typeof value==="string"?value:JSON.stringify(value)}],...(isError?{isError:true}:{})});
const argsOf=(params:unknown)=>{if(!params||typeof params!=="object"||Array.isArray(params))return undefined;const args=(params as any).arguments;return args===undefined?{}:args&&typeof args==="object"&&!Array.isArray(args)?args:undefined};

async function authorize(request:Request,demoToken?:string){
 const header=request.headers.get("authorization")||"";if(!header.startsWith("Bearer "))return undefined;const raw=header.slice(7).trim();if(!raw)return undefined;
 if(demoToken!==undefined&&demoToken!==""&&raw===demoToken)return {demo:true};
 const hash=await tokenHash(raw),row=authStore.apiTokens.find(x=>x.tokenHash===hash&&!x.revokedAt);if(!row)return undefined;row.lastUsedAt=new Date().toISOString();return {demo:false,row};
}

export function createMcpRoutes(deps:{repo:Repository;mailer:Mailer;persist:()=>Promise<void>;demoToken?:string}){
 const app=new Hono();
 app.get("/.well-known/mcp.json",c=>c.json({name:"CUE MCP",endpoint:"/api/mcp",transport:"streamable-http",auth:{type:"bearer",tokenEndpoint:"/api/auth/tokens",instructions:"Create an API token from an authenticated organizer session. For explicit demos only, configure DEMO_MCP_TOKEN=cue-demo and send that value as bearer token."}}));
 app.post("/api/mcp",async c=>{
  const authorization=await authorize(c.req.raw,deps.demoToken);if(!authorization)return c.json({error:"bearer token required"},401);
  if(!authorization.demo)await deps.persist();
  let body:any;try{body=await c.req.json()}catch{return c.json(rpcError(null,-32700,"Parse error"))}
  if(!body||typeof body!=="object"||Array.isArray(body)||body.jsonrpc!=="2.0"||typeof body.method!=="string")return c.json(rpcError(body?.id??null,-32600,"Invalid Request"));
  const id=body.id??null;
  if(body.method==="notifications/initialized")return c.body(null,202);
  if(body.method==="initialize"){
   if(!body.params||typeof body.params!=="object"||Array.isArray(body.params))return c.json(rpcError(id,-32602,"Invalid params"));
   const requested=String(body.params.protocolVersion||"");const protocolVersion=(versions as readonly string[]).includes(requested)?requested:versions[0];
   return c.json(rpc(id,{protocolVersion,serverInfo:{name:"cue",version:"1.0.0"},capabilities:{tools:{}}}));
  }
  if(body.method==="tools/list"){
   if(body.params!==undefined&&(!body.params||typeof body.params!=="object"||Array.isArray(body.params)))return c.json(rpcError(id,-32602,"Invalid params"));
   return c.json(rpc(id,{tools:MCP_TOOLS}));
  }
  if(body.method!=="tools/call")return c.json(rpcError(id,-32601,"Method not found"));
  const args=argsOf(body.params),name=(body.params as any)?.name;if(typeof name!=="string"||!args)return c.json(rpcError(id,-32602,"Invalid params"));
  activateEvent(EVENT_ID);
  try{
   let value:unknown;
   if(name==="list_events")value=listEvents().map(event=>({...event,publicProgram:`/e/${event.slug}/public`}));
   else if(name==="list_submissions"){
    if(args.status!==undefined&&!statuses.includes(args.status))return c.json(rpcError(id,-32602,"status is not a valid SubmissionStatus"));
    value=store.submissions.filter(x=>!args.status||x.status===args.status);
   }else if(name==="get_submission"){
    if(typeof args.id!=="string")return c.json(rpcError(id,-32602,"id is required"));const submission=store.submissions.find(x=>x.id===args.id);if(!submission)return c.json(rpc(id,toolResult("submission not found",true)));value={...submission,reviews:reviewHistory(submission.id).map(x=>({id:x.id,roundId:x.roundId,roundName:x.roundName,reviewerName:x.reviewerName,status:x.status,average:x.average,comment:x.comment,isAiDraft:x.isAiDraft}))};
   }else if(name==="list_speakers")value=store.profiles.map(profile=>({...profile,tasks:store.tasks.filter(x=>x.speakerId===profile.speakerId),readiness:readiness(profile.speakerId)}));
   else if(name==="get_schedule"){
    const schedule=await (deps.repo as Repository&{getSchedule?:(id:string)=>Promise<ScheduleData|undefined>}).getSchedule?.(EVENT_ID);if(!schedule)return c.json(rpc(id,toolResult("schedule not found",true)));const conflicts:ScheduleConflict[]=[...scheduleWarnings(schedule)];for(const slot of schedule.slots)conflicts.push(...validateSlot(schedule,slot).conflicts);const unique=[...new Map(conflicts.map(x=>[x.id,x])).values()];value={event:{id:EVENT_ID,slug:EVENT_SLUG},version:schedule.version,rooms:schedule.rooms,sessions:schedule.sessions.map(session=>{const slot=schedule.slots.find(x=>x.sessionId===session.id),room=schedule.rooms.find(x=>x.id===slot?.roomId);return {...session,slot:slot?{...slot,room:room?.name}:undefined}}),warnings:unique};
   }else if(name==="list_review_progress")value=store.submissions.map(submission=>{const assignments=store.reviewAssignments.filter(x=>x.submissionId===submission.id),reviews=reviewHistory(submission.id);return {submissionId:submission.id,title:submission.title,status:submission.status,assigned:assignments.filter(x=>x.status!=="recused").length,completed:assignments.filter(x=>x.status==="completed").length,recused:assignments.filter(x=>x.status==="recused").length,reviews:reviews.length}});
   else if(name==="complete_speaker_task"){
    if(typeof args.taskId!=="string"||typeof args.speakerId!=="string")return c.json(rpcError(id,-32602,"speakerId and taskId are required"));const result=completeTaskForSpeaker(args.taskId,args.speakerId);if(!result.ok)return c.json(rpc(id,toolResult(result.error,true)));await deps.persist();value=result.task;
   }else if(name==="send_task_reminder"){
    if(typeof args.taskId!=="string"||typeof args.speakerId!=="string")return c.json(rpcError(id,-32602,"speakerId and taskId are required"));const plan=reminderPlans().find(x=>x.taskId===args.taskId&&x.speakerId===args.speakerId);if(!plan)return c.json(rpc(id,toolResult("outstanding required task not found",true)));const task=store.tasks.find(x=>x.id===args.taskId)!;const row=sendTemplate("task_reminder",args.speakerId,task.title,"reminder");const to=store.profiles.find(x=>x.speakerId===args.speakerId)?.email||store.submissions.find(x=>x.speakerId===args.speakerId)?.email;if(!to)row.status="failed";else try{const sent=await deps.mailer.send({to,subject:row.subject,text:row.body});row.status=sent.status;row.providerId=sent.providerId}catch{row.status="failed"}await deps.persist();value=row;
   }else return c.json(rpc(id,toolResult(`unknown tool: ${name}`,true)));
   return c.json(rpc(id,toolResult(value)));
  }catch(error){return c.json(rpc(id,toolResult(error instanceof Error?error.message:"tool failed",true)))}
 });
 return app;
}
