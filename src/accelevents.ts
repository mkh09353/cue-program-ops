import type { EntityType } from "./domain.js";
export interface RemoteResult { remoteId: string }
export interface AcceleventsClient { create(type: EntityType, payload: Record<string, unknown>, key: string): Promise<RemoteResult>; update(type: EntityType, remoteId: string, payload: Record<string, unknown>, key: string): Promise<RemoteResult> }
/** Default client: in-process remote state; it never performs network I/O and supports local live demonstrations. */
export class MockAcceleventsClient implements AcceleventsClient { records = new Map<string, Record<string,unknown>>(); creates = 0; updates = 0; failNextCreate = false;
  async create(t:EntityType,p:Record<string,unknown>,key:string) { if(this.failNextCreate){this.failNextCreate=false;throw new Error("simulated remote timeout")} const existing=[...this.records.entries()].find(([,x])=>x.__key===key); if(existing)return {remoteId:existing[0]}; const id=`mock-${t}-${this.creates++ + 1}`; this.records.set(id,{...p,__key:key}); return {remoteId:id} }
  async update(_:EntityType,id:string,p:Record<string,unknown>,__:string) { this.updates++; if(!this.records.has(id)) throw new Error("remote record not found"); this.records.set(id,{...p}); return {remoteId:id} }
}
/** Real client. REST paths/field names are placeholders pending Accelevents API confirmation. */
export class HttpAcceleventsClient implements AcceleventsClient { constructor(private baseUrl:string, private eventId:string, private token:string, private fetcher: typeof fetch = fetch) {}
  private async request(method:string,type:EntityType,id:string|undefined,payload:Record<string,unknown>,key:string):Promise<RemoteResult> { const path=`${this.baseUrl.replace(/\/$/,"")}/events/${encodeURIComponent(this.eventId)}/${type}s${id?`/${encodeURIComponent(id)}`:""}`; const r=await this.fetcher(path,{method,headers:{"Authorization":`Bearer ${this.token}`,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(payload)}); if(!r.ok) throw new Error(`Accelevents HTTP ${r.status}`); const body=await r.json() as {id?:string}; if(!body.id) throw new Error("Accelevents response missing id"); return {remoteId:body.id} }
  create(t:EntityType,p:Record<string,unknown>,k:string){return this.request("POST",t,undefined,p,k)} update(t:EntityType,id:string,p:Record<string,unknown>,k:string){return this.request("PUT",t,id,p,k)} }
