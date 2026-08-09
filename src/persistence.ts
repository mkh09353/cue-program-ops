import { AirtableTransport } from "./airtable.js";
import type { ScheduleProjection, SyncLink, SyncRun, SyncRunItem } from "./domain.js";
import type { LifecycleStore } from "./lifecycle.js";

/** One JSON record per event is intentionally a practical hackathon snapshot, not normalized production storage. */
export const AIRTABLE_SNAPSHOT_SCHEMA = {
  table: "CUE Snapshots",
  fields: { externalId: "External ID", eventId: "Event ID", snapshot: "Snapshot", updatedAt: "Updated At" },
} as const;
export interface CompetitionSnapshot { version: 1; eventId: string; savedAt: string; lifecycle: LifecycleStore; schedule?: ScheduleProjection; sync: { links: SyncLink[]; runs: SyncRun[]; items: SyncRunItem[] }; }
export interface SnapshotPersistence { load(eventId: string): Promise<CompetitionSnapshot | undefined>; save(snapshot: CompetitionSnapshot): Promise<void>; }
/** Default persistence is a no-op and cannot make a network call. */
export class MemorySnapshotPersistence implements SnapshotPersistence { async load(_: string) { return undefined; } async save(_: CompetitionSnapshot) {} }

/** Durable whole-event snapshot in D1. Saves arriving during the debounce window
 * share one flush and only the newest payload is written. Callers await that flush,
 * so an isolate cannot return a mutation while its trailing write is still pending. */
export class D1SnapshotPersistence implements SnapshotPersistence {
  private pending?: CompetitionSnapshot;
  private timer?: ReturnType<typeof setTimeout>;
  private flushing?: Promise<void>;
  private resolve?: () => void;
  private reject?: (error: unknown) => void;
  constructor(private readonly db: D1Database, private readonly debounceMs = 1750) {}
  async initialize() {
    await this.db.exec("CREATE TABLE IF NOT EXISTS snapshots (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
  }
  async load(eventId: string) {
    const row=await this.db.prepare("SELECT payload FROM snapshots WHERE event_id = ?").bind(eventId).first<{payload:string}>();
    if (!row?.payload) return undefined;
    const parsed=JSON.parse(row.payload) as CompetitionSnapshot;
    if(parsed.version!==1||parsed.eventId!==eventId)throw new Error("invalid D1 CUE snapshot");
    return parsed;
  }
  save(snapshot:CompetitionSnapshot):Promise<void>{
    this.pending=structuredClone(snapshot);
    if(!this.flushing)this.flushing=new Promise<void>((resolve,reject)=>{this.resolve=resolve;this.reject=reject});
    if(this.timer)clearTimeout(this.timer);
    this.timer=setTimeout(()=>void this.flush(),this.debounceMs);
    return this.flushing;
  }
  async flush():Promise<void>{
    if(!this.pending){this.resolve?.();this.reset();return}
    const snapshot=this.pending;this.pending=undefined;if(this.timer)clearTimeout(this.timer);this.timer=undefined;
    try{
      const payload=JSON.stringify(snapshot);
      await this.db.prepare("INSERT INTO snapshots(event_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(event_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(snapshot.eventId,payload,snapshot.savedAt).run();
      // A save may arrive while D1 was writing. Flush it before resolving callers.
      if(this.pending){await this.flush();return}
      this.resolve?.();this.reset();
    }catch(error){this.reject?.(error);this.reset();throw error}
  }
  private reset(){this.flushing=undefined;this.resolve=undefined;this.reject=undefined;this.timer=undefined}
}

export class CompositeSnapshotPersistence implements SnapshotPersistence {
  constructor(private readonly primary:SnapshotPersistence,private readonly secondary:SnapshotPersistence){}
  async load(eventId:string){return (await this.primary.load(eventId)) || this.secondary.load(eventId)}
  async save(snapshot:CompetitionSnapshot){await Promise.all([this.primary.save(snapshot),this.secondary.save(snapshot)])}
}

export class AirtableSnapshotPersistence implements SnapshotPersistence {
  constructor(private readonly transport: AirtableTransport, private readonly table = AIRTABLE_SNAPSHOT_SCHEMA.table) {}
  async save(snapshot: CompetitionSnapshot) {
    await this.transport.upsert(this.table, [{ fields: { [AIRTABLE_SNAPSHOT_SCHEMA.fields.externalId]: snapshot.eventId, [AIRTABLE_SNAPSHOT_SCHEMA.fields.eventId]: snapshot.eventId, [AIRTABLE_SNAPSHOT_SCHEMA.fields.snapshot]: JSON.stringify(snapshot), [AIRTABLE_SNAPSHOT_SCHEMA.fields.updatedAt]: snapshot.savedAt } }]);
  }
  async load(eventId: string) {
    const records = await this.transport.listAll(this.table) as { fields?: Record<string, unknown> }[];
    const record = records.find(r => r.fields?.[AIRTABLE_SNAPSHOT_SCHEMA.fields.externalId] === eventId);
    const raw = record?.fields?.[AIRTABLE_SNAPSHOT_SCHEMA.fields.snapshot];
    if (typeof raw !== "string") return undefined;
    const parsed = JSON.parse(raw) as CompetitionSnapshot;
    if (parsed.version !== 1 || parsed.eventId !== eventId) throw new Error("invalid Airtable CUE snapshot");
    return parsed;
  }
}
export function configuredPersistence(env: Record<string, string | undefined>, fetcher?: typeof fetch): SnapshotPersistence {
  return env.AIRTABLE_TOKEN && env.AIRTABLE_BASE_ID ? new AirtableSnapshotPersistence(new AirtableTransport(env.AIRTABLE_TOKEN, env.AIRTABLE_BASE_ID, fetcher)) : new MemorySnapshotPersistence();
}
