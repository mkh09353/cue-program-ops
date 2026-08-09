import type { AcceleventsClient } from "./accelevents.js";
import { mapSession, mapSpeaker, MAPPING_VERSION, type Mapped } from "./mapping.js";
import type { EntityType, Mode, Repository, SyncRun, SyncRunItem } from "./domain.js";
const id=()=>crypto.randomUUID(), now=()=>new Date().toISOString();
const cleanError=(e:unknown)=>({message:String(e instanceof Error?e.message:"sync failed").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,300),retryable:/timeout|network|5\d\d/i.test(String(e))});
export class SyncService { constructor(private repo:Repository, private client:AcceleventsClient) {}
  async execute(eventId:string, mode:Mode, retryRunId?:string) { const data=await this.repo.getData(eventId); if(!data) throw new Error("event not found"); const run:SyncRun={id:id(),eventId,provider:"accelevents",mode,status:"running",mappingVersion:MAPPING_VERSION,mappingSnapshot:JSON.stringify({version:MAPPING_VERSION,source:"canonical->placeholder-accelevents"}),startedAt:now(),counts:{create:0,update:0,skip:0,error:0}}; await this.repo.createRun(run);
    let retry = new Set<string>(); if(retryRunId) retry=new Set((await this.repo.listItems(retryRunId)).filter(x=>x.status==="failed").map(x=>`${x.entityType}:${x.localId}`));
    const entries: Mapped[]=[]; for(const s of data.speakers) entries.push(await mapSpeaker(s)); for(const s of data.sessions) entries.push(await mapSession(s));
    for(const m of entries) { if(retry.size && !retry.has(`${m.entityType}:${m.localId}`)) continue; await this.one(run,m,mode,data.event.id) }
    run.finishedAt=now(); run.status=run.counts.error ? (run.counts.create+run.counts.update+run.counts.skip ? "partial":"failed") : "completed"; await this.repo.updateRun(run); return {run,items:await this.repo.listItems(run.id)} }
  private async one(run:SyncRun,m:Mapped,mode:Mode,scope:string) { const link=await this.repo.getLink(m.entityType,m.localId,scope); const op = link?.payloadHash===m.payloadHash ? "skip" : link ? "update" : "create"; const item:SyncRunItem={id:id(),runId:run.id,entityType:m.entityType,localId:m.localId,operation:op,idempotencyKey:m.idempotencyKey,payloadHash:m.payloadHash,remoteId:link?.remoteId,status:"planned",payloadSummary:m.summary,createdAt:now()}; await this.repo.addItem(item);
    if(mode==="dry_run" || op==="skip") { item.status="succeeded"; run.counts[op]++; await this.repo.updateItem(item); return }
    try { const r=op==="create" ? await this.client.create(m.entityType,m.payload,m.idempotencyKey) : await this.client.update(m.entityType,link!.remoteId,m.payload,m.idempotencyKey); item.remoteId=r.remoteId; item.status="succeeded"; run.counts[op]++; await this.repo.putLink({provider:"accelevents",entityType:m.entityType,localId:m.localId,scope,remoteId:r.remoteId,payloadHash:m.payloadHash,updatedAt:now()}) } catch(e) { item.operation="error";item.status="failed";item.error=cleanError(e);run.counts.error++ } await this.repo.updateItem(item) }
}
