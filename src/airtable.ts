import type { Repository } from "./domain.js";
/** Optional Airtable seam. It is intentionally not selected by default and requires no import-time credentials.
 * Configure AIRTABLE_TOKEN, AIRTABLE_BASE_ID, and table names before wiring a concrete Repository implementation. */
export class AirtableTransport {
  constructor(private token?:string, private baseId?:string, private fetcher:typeof fetch=fetch) {}
  private ready(){ if(!this.token||!this.baseId) throw new Error("Airtable is optional: AIRTABLE_TOKEN and AIRTABLE_BASE_ID are required") }
  async list(table:string, offset?:string):Promise<{records:unknown[];offset?:string}>{this.ready();const u=new URL(`https://api.airtable.com/v0/${this.baseId}/${encodeURIComponent(table)}`);if(offset)u.searchParams.set("offset",offset);const r=await this.fetcher(u,{headers:{Authorization:`Bearer ${this.token}`}});if(!r.ok)throw new Error(`Airtable HTTP ${r.status}`);return r.json() as Promise<{records:unknown[];offset?:string}>}
  async listAll(table:string):Promise<unknown[]>{const all:unknown[]=[];let offset: string|undefined;do{const page=await this.list(table,offset);all.push(...page.records);offset=page.offset;if(offset)await new Promise(r=>setTimeout(r,210))}while(offset);return all}
  async upsert(table:string, records:unknown[]):Promise<unknown>{this.ready();const r=await this.fetcher(`https://api.airtable.com/v0/${this.baseId}/${encodeURIComponent(table)}`,{method:"PATCH",headers:{Authorization:`Bearer ${this.token}`,"Content-Type":"application/json"},body:JSON.stringify({performUpsert:{fieldsToMergeOn:["External ID"]},records})});if(!r.ok)throw new Error(`Airtable HTTP ${r.status}`);return r.json()}
}
/** Implement Repository with event-specific Airtable table mappings when Airtable is selected. */
export type OptionalAirtableRepository = Repository;
