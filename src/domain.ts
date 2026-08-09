export type EntityType = "speaker" | "session";
export type Mode = "dry_run" | "live";
export type Operation = "create" | "update" | "skip" | "error";
export type RunStatus = "running" | "completed" | "failed" | "partial";

export interface Event { id: string; name: string; timezone: string }
export interface Speaker { id: string; eventId: string; name: string; email: string; bio: string; company?: string; acceptedSubmissionId: string }
export interface Session { id: string; eventId: string; title: string; abstract: string; speakerIds: string[]; startsAt: string; endsAt: string; track: string; room: string; acceptedSubmissionId: string }
export interface AcceptedSubmission { id: string; eventId: string; speakerId: string; status: "accepted"; category: string }
export interface CanonicalData { event: Event; speakers: Speaker[]; sessions: Session[]; submissions: AcceptedSubmission[] }
/** Optional schedule projection. Kept separate so the lifecycle sync contract stays compatible. */
export interface ScheduleProjection { event: Event & { startsAt:string; endsAt:string }; version:number; rooms: import("./schedule.js").ScheduleRoom[]; tracks: import("./schedule.js").ScheduleTrack[]; speakers: import("./schedule.js").ScheduleSpeaker[]; sessions: import("./schedule.js").ScheduleSession[]; slots: import("./schedule.js").AgendaSlot[] }

export interface SyncLink { provider: "accelevents"; entityType: EntityType; localId: string; scope: string; remoteId: string; payloadHash: string; updatedAt: string }
export interface SyncRun { id: string; eventId: string; provider: "accelevents"; mode: Mode; status: RunStatus; mappingVersion: string; mappingSnapshot: string; startedAt: string; finishedAt?: string; counts: Record<Operation, number> }
export interface SyncRunItem { id: string; runId: string; entityType: EntityType; localId: string; operation: Operation; idempotencyKey: string; payloadHash: string; remoteId?: string; status: "planned" | "succeeded" | "failed"; payloadSummary: string; error?: { message: string; retryable: boolean }; createdAt: string }

export interface Repository {
  getData(eventId: string): Promise<CanonicalData | undefined>;
  createRun(run: SyncRun): Promise<void>; updateRun(run: SyncRun): Promise<void>;
  addItem(item: SyncRunItem): Promise<void>; updateItem(item: SyncRunItem): Promise<void>;
  getLink(entityType: EntityType, localId: string, scope: string): Promise<SyncLink | undefined>; putLink(link: SyncLink): Promise<void>;
  listRuns(eventId: string): Promise<SyncRun[]>; getRun(id: string): Promise<SyncRun | undefined>; listItems(runId: string): Promise<SyncRunItem[]>;
}

export interface ScheduleRepository extends Repository {
  getSchedule(eventId:string): Promise<ScheduleProjection | undefined>;
  putSchedule(eventId:string, schedule:ScheduleProjection): Promise<void>;
}
