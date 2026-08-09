import type { CanonicalData, EntityType, Repository, ScheduleProjection, SyncLink, SyncRun, SyncRunItem } from "./domain.js";
import { canonicalFromSchedule } from "./projection.js";

const EVENT_ID="evt-ai-summit-2026";
export const demoSchedule: ScheduleProjection = {
 event:{id:EVENT_ID,name:"AI Engineer Summit",timezone:"America/Los_Angeles",startsAt:"2026-10-12T16:00:00.000Z",endsAt:"2026-10-15T01:00:00.000Z"},version:1,
 rooms:[{id:"room-main",name:"Main Hall",capacity:900,color:"#8b5cf6"},{id:"room-lab",name:"Workshop Lab",capacity:150,color:"#06b6d4"},{id:"room-community",name:"Community Room",capacity:80,color:"#f59e0b"}],
 tracks:[{id:"track-agents",name:"Agents",color:"#8b5cf6",maxConcurrent:2},{id:"track-infra",name:"Infrastructure",color:"#06b6d4"},{id:"track-product",name:"Product",color:"#f59e0b",maxConcurrent:1}],
 speakers:[
  {id:"spk-ada",name:"Ada Lovelace",email:"ada@example.test",bio:"Builder of analytical systems and reliable AI platforms for creative engineering teams.",company:"Analytical Engines",title:"Principal Engineer",isPublic:true,acceptedSubmissionId:"sub-ada"},
  {id:"spk-grace",name:"Grace Hopper",email:"grace@example.test",bio:"Compiler pioneer and systems leader.",company:"Navy",title:"Distinguished Engineer",isPublic:false,acceptedSubmissionId:"sub-grace"},
  {id:"spk-lin",name:"Lin Clark",email:"lin@example.test",bio:"Making complex systems understandable.",company:"Mozilla",title:"Staff Engineer",isPublic:true,acceptedSubmissionId:"sub-lin"},
  {id:"spk-margaret",name:"Margaret Hamilton",email:"margaret@example.test",bio:"Reliable software for critical missions and high-stakes model-backed products.",company:"Hamilton Technologies",title:"CEO",isPublic:true,acceptedSubmissionId:"sub-margaret"},
  {id:"spk-sam",name:"Sam Rivera",email:"sam@example.test",bio:"Eval loops for production teams shipping trustworthy agents.",company:"Eval Collective",title:"Staff Engineer",isPublic:true,acceptedSubmissionId:"sub-sam"}
 ],
 sessions:[
  {id:"ses-analytical",acceptedSubmissionId:"sub-ada",title:"Analytical Engines in Practice",abstract:"A practical session on reliable systems patterns for creative engineering teams shipping AI products. Covers evaluation harnesses, rollback discipline, and operator tooling.",speakerIds:["spk-ada"],trackIds:["track-infra"],durationMinutes:45,capacity:500,status:"published",publishStatus:"published",slug:"analytical-engines",format:"Talk"},
  {id:"ses-reliable-agents",acceptedSubmissionId:"sub-grace",title:"Reliable Agent Systems",abstract:"A panel on shipping agents that work in production.",speakerIds:["spk-ada","spk-grace"],trackIds:["track-agents","track-infra"],durationMinutes:45,capacity:700,status:"accepted",publishStatus:"draft",slug:"reliable-agents",format:"Panel"},
  {id:"ses-product",acceptedSubmissionId:"sub-margaret",title:"Shipping AI Products",abstract:"Practical product lessons for high-stakes model-backed features, including staged rollouts and human oversight.",speakerIds:["spk-margaret"],trackIds:["track-product"],durationMinutes:45,capacity:300,status:"published",publishStatus:"published",slug:"shipping-ai-products",format:"Talk"},
  {id:"ses-workshop",acceptedSubmissionId:"sub-lin",title:"Advanced Agents Workshop",abstract:"Hands-on workflow design for long-running agent memory and tool use.",speakerIds:["spk-lin"],trackIds:["track-agents"],durationMinutes:60,capacity:120,status:"published",publishStatus:"published",slug:"advanced-agents",format:"Workshop"},
  {id:"ses-sam",acceptedSubmissionId:"sub-sam",title:"Eval Harnesses Teams Actually Use",abstract:"A field guide to eval loops that survive contact with production, with scorecards and regression gates.",speakerIds:["spk-sam"],trackIds:["track-infra"],durationMinutes:60,capacity:100,status:"accepted",publishStatus:"draft",slug:"eval-harnesses",format:"Workshop"}
 ],
 slots:[
  {id:"slot-analytical",sessionId:"ses-analytical",roomId:"room-main",startsAt:"2026-10-12T17:00:00.000Z",endsAt:"2026-10-12T17:45:00.000Z"},
  {id:"slot-product",sessionId:"ses-product",roomId:"room-lab",startsAt:"2026-10-12T18:00:00.000Z",endsAt:"2026-10-12T18:45:00.000Z"},
  {id:"slot-workshop",sessionId:"ses-workshop",roomId:"room-community",startsAt:"2026-10-13T17:00:00.000Z",endsAt:"2026-10-13T18:00:00.000Z"}
 ]
};
/** Compatibility export; canonical data is now derived from the schedule projection. */
export const demoData: CanonicalData = canonicalFromSchedule(EVENT_ID,demoSchedule);

export class MemoryRepository implements Repository {
  /** Legacy tests may mutate this map; getData is canonical whenever a schedule exists. */
  data = new Map([[EVENT_ID, structuredClone(demoData)] ]); links = new Map<string, SyncLink>(); runs = new Map<string, SyncRun>(); items = new Map<string, SyncRunItem[]>(); schedules = new Map([[EVENT_ID, structuredClone(demoSchedule)]]);
  async getData(eventId: string) { const schedule=this.schedules.get(eventId); if(!schedule) return this.data.get(eventId) && structuredClone(this.data.get(eventId)!); const canonical=canonicalFromSchedule(eventId,structuredClone(schedule)); /* Legacy compatibility: tests/tools may override profile fields in .data; schedule remains entity/time authority. */ const legacy=this.data.get(eventId); for(const speaker of canonical.speakers){const old=legacy?.speakers.find(x=>x.id===speaker.id);if(old){speaker.bio=old.bio;speaker.company=old.company;speaker.email=old.email;}} return canonical }
  async createRun(run: SyncRun) { this.runs.set(run.id, structuredClone(run)); this.items.set(run.id, []) }
  async updateRun(run: SyncRun) { this.runs.set(run.id, structuredClone(run)) }
  async addItem(item: SyncRunItem) { this.items.get(item.runId)?.push(structuredClone(item)) }
  async updateItem(item: SyncRunItem) { const a = this.items.get(item.runId) || []; const i = a.findIndex(x => x.id === item.id); if (i >= 0) a[i] = structuredClone(item) }
  async getLink(t: EntityType, id: string, scope: string) { return this.links.get(`${t}:${id}:${scope}`) }
  async putLink(link: SyncLink) { this.links.set(`${link.entityType}:${link.localId}:${link.scope}`, structuredClone(link)) }
  async listRuns(eventId: string) { return [...this.runs.values()].filter(r => r.eventId === eventId).sort((a,b) => b.startedAt.localeCompare(a.startedAt)) }
  async getRun(id: string) { return this.runs.get(id) }
  async listItems(id: string) { return this.items.get(id) || [] }
  async getSchedule(eventId:string) { const s=this.schedules.get(eventId); return s&&structuredClone(s) }
  async putSchedule(eventId:string,schedule:ScheduleProjection) { this.schedules.set(eventId,structuredClone(schedule)); this.data.set(eventId,canonicalFromSchedule(eventId,schedule)) }
  /** Snapshot adapter support; this deliberately exposes copies rather than live Maps. */
  exportSyncState(){ return {links:[...this.links.values()].map(x=>structuredClone(x)),runs:[...this.runs.values()].map(x=>structuredClone(x)),items:[...this.items.values()].flat().map(x=>structuredClone(x))} }
  importSyncState(state:{links:SyncLink[];runs:SyncRun[];items:SyncRunItem[]}) { this.links.clear();this.runs.clear();this.items.clear();for(const x of state.links)this.links.set(`${x.entityType}:${x.localId}:${x.scope}`,structuredClone(x));for(const x of state.runs)this.runs.set(x.id,structuredClone(x));for(const x of state.items){const a=this.items.get(x.runId)||[];a.push(structuredClone(x));this.items.set(x.runId,a)} }
}
/** D1 seam: bind this implementation to a D1Database in Workers; local development intentionally uses MemoryRepository. */
export class D1Repository implements Repository { constructor(private readonly unavailable = "D1 adapter not configured") {} private no(): never { throw new Error(this.unavailable) }
  getData(_: string) { return this.no() } createRun(_: SyncRun) { return this.no() } updateRun(_: SyncRun) { return this.no() } addItem(_: SyncRunItem) { return this.no() } updateItem(_: SyncRunItem) { return this.no() } getLink(_: EntityType,__:string,___:string) { return this.no() } putLink(_:SyncLink){return this.no()} listRuns(_:string){return this.no()} getRun(_:string){return this.no()} listItems(_:string){return this.no()} }
