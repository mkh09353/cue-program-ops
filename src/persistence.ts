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
