import type { ContentEditHistory, LifecycleStore, SessionDraft, SessionContentState } from "./lifecycle.js";
import type { ScheduleData, ScheduleSession } from "./schedule.js";

/**
 * ONE session-editing mechanism shared by the Content editor and the schedule session
 * API.
 *
 * Sessions live in two stores: lifecycle drafts (`store.sessions`, created from accepted
 * submissions) and canonical schedule sessions (`schedule.sessions`, what every public
 * projection reads). Their ids only sometimes agree, so edits used to silently no-op
 * (lifecycle-only rows) or be impossible (schedule-only / runtime-created rows).
 *
 * Canonical identity here is ALWAYS the schedule session id. Lifecycle drafts are
 * resolved and linked deterministically, never faked.
 */

/** Editable fields shared by both entry paths. */
export type SessionEditPatch = {
  title?: string;
  abstract?: string;
  trackId?: string;
  format?: string;
  speakerIds?: string[];
  durationMinutes?: number;
  contentStatus?: SessionContentState["status"];
  approvalComment?: string;
};

export type EditableSession = {
  /** Canonical schedule session id (or the lifecycle id for unlinked legacy drafts). */
  id: string;
  title: string;
  abstract: string;
  trackId: string;
  format?: string;
  speakerIds: string[];
  contentStatus: SessionContentState["status"];
  approvalComment?: string;
  status?: ScheduleSession["status"];
  publishStatus?: ScheduleSession["publishStatus"];
  /** Where the canonical record lives; "lifecycle" means no schedule twin resolved. */
  origin: "schedule" | "lifecycle";
  canonicalId: string;
  lifecycleId?: string;
  scheduled: boolean;
  history: ContentEditHistory[];
};

const normalizeTitle = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Global, order-independent draft↔session matching.
 *
 * Runs strictly ordered passes over the WHOLE schedule and only ever claims a pair that
 * is mutually unique (one session ⇄ one draft) in the current pass, so a draft can never
 * be attached to the wrong session just because it happened to be visited first, and a
 * draft is never reused. Ambiguous candidates are deliberately left unlinked.
 */
export function linkSessions(store: LifecycleStore, schedule: ScheduleData | undefined) {
  const sessions = [...(schedule?.sessions || [])];
  const links = new Map<string, SessionDraft | undefined>(sessions.map((s) => [s.id, undefined]));
  const usedDrafts = new Set<string>();
  const unresolved = new Set(sessions.map((s) => s.id));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const available = () => store.sessions.filter((d) => !usedDrafts.has(d.id));

  const claim = (sessionId: string, draft: SessionDraft) => {
    links.set(sessionId, draft);
    usedDrafts.add(draft.id);
    unresolved.delete(sessionId);
  };

  /**
   * Apply one candidate rule until it stops making progress. Only mutually unique
   * pairs are claimed: the session must have exactly one candidate draft, AND that
   * draft must be the candidate of exactly one unresolved session.
   */
  const runPass = (candidatesFor: (session: ScheduleSession, drafts: SessionDraft[]) => SessionDraft[]) => {
    for (let guard = 0; guard < sessions.length + 1; guard++) {
      const drafts = available();
      const proposals = new Map<string, SessionDraft[]>();
      for (const sessionId of unresolved) {
        proposals.set(sessionId, candidatesFor(sessionById.get(sessionId)!, drafts));
      }
      const claimants = new Map<string, string[]>();
      for (const [sessionId, list] of proposals) {
        for (const draft of list) claimants.set(draft.id, [...(claimants.get(draft.id) || []), sessionId]);
      }
      const ready = [...proposals.entries()].filter(
        ([sessionId, list]) => list.length === 1 && (claimants.get(list[0]!.id) || []).length === 1 && sessionId,
      );
      if (!ready.length) return;
      for (const [sessionId, list] of ready) claim(sessionId, list[0]!);
    }
  };

  // 1. Same id.
  runPass((session, drafts) => drafts.filter((d) => d.id === session.id));
  // 2. Same accepted submission (this is what maps seeded ses-product → ses-margaret).
  runPass((session, drafts) =>
    session.acceptedSubmissionId ? drafts.filter((d) => d.submissionId === session.acceptedSubmissionId) : [],
  );
  // 3. Identical normalized title, then the same title narrowed to a session speaker.
  runPass((session, drafts) => drafts.filter((d) => normalizeTitle(d.title) === normalizeTitle(session.title)));
  runPass((session, drafts) =>
    drafts.filter(
      (d) => normalizeTitle(d.title) === normalizeTitle(session.title) && session.speakerIds.includes(d.speakerId),
    ),
  );
  // 4. Last resort: a single remaining draft owned by one of this session's speakers,
  //    and only when no other unresolved session could claim it (mutual uniqueness).
  runPass((session, drafts) =>
    session.acceptedSubmissionId ? [] : drafts.filter((d) => session.speakerIds.includes(d.speakerId)),
  );

  const orphanDrafts = store.sessions.filter((d) => !usedDrafts.has(d.id));
  return { links, orphanDrafts };
}

/**
 * Single-session lookup. Delegates to the global matcher so one-off callers see exactly
 * the same one-to-one mapping as the Content editor (no heuristic of its own).
 */
export function findLinkedDraft(
  store: LifecycleStore,
  session: ScheduleSession,
  schedule?: ScheduleData,
): SessionDraft | undefined {
  const data = schedule || ({ sessions: [session] } as unknown as ScheduleData);
  return linkSessions(store, data).links.get(session.id);
}

/** Approval metadata, keyed by canonical id with legacy lifecycle-id fallback. */
export function contentStateFor(store: LifecycleStore, canonicalId: string, lifecycleId?: string) {
  return (
    store.sessionContent.find((x) => x.sessionId === canonicalId) ||
    (lifecycleId ? store.sessionContent.find((x) => x.sessionId === lifecycleId) : undefined)
  );
}

function ensureContentState(store: LifecycleStore, canonicalId: string, lifecycleId?: string) {
  let state = contentStateFor(store, canonicalId, lifecycleId);
  if (!state) {
    state = { sessionId: canonicalId, status: "draft" };
    store.sessionContent.push(state);
  }
  return state;
}

export function historyFor(store: LifecycleStore, canonicalId: string, lifecycleId?: string) {
  return store.contentHistory.filter(
    (h) => h.entityType === "session" && (h.entityId === canonicalId || (!!lifecycleId && h.entityId === lifecycleId)),
  );
}

/**
 * Every session an organizer may edit: one row per canonical schedule session (including
 * runtime-created ones), plus legacy lifecycle drafts that have no schedule twin.
 * History is always included so the restore UI exists before the first save.
 */
export function listEditableSessions(store: LifecycleStore, schedule: ScheduleData | undefined): EditableSession[] {
  const { links, orphanDrafts } = linkSessions(store, schedule);
  const slotted = new Set((schedule?.slots || []).map((s) => s.sessionId));
  const rows: EditableSession[] = (schedule?.sessions || []).map((session) => {
    const draft = links.get(session.id);
    const state = contentStateFor(store, session.id, draft?.id);
    return {
      id: session.id,
      title: session.title,
      abstract: session.abstract || "",
      trackId: session.trackIds?.[0] || draft?.trackId || "",
      format: session.format,
      speakerIds: session.speakerIds || [],
      contentStatus: state?.status || "draft",
      approvalComment: state?.approvalComment,
      status: session.status,
      publishStatus: session.publishStatus,
      origin: "schedule",
      canonicalId: session.id,
      lifecycleId: draft?.id,
      scheduled: slotted.has(session.id),
      history: historyFor(store, session.id, draft?.id),
    };
  });
  for (const draft of orphanDrafts) {
    const state = contentStateFor(store, draft.id);
    rows.push({
      id: draft.id,
      title: draft.title,
      abstract: draft.abstract || "",
      trackId: draft.trackId || "",
      speakerIds: [draft.speakerId],
      contentStatus: state?.status || "draft",
      approvalComment: state?.approvalComment,
      origin: "lifecycle",
      canonicalId: draft.id,
      lifecycleId: draft.id,
      scheduled: false,
      history: historyFor(store, draft.id),
    });
  }
  return rows;
}

/** Resolve an editor id (canonical OR lifecycle) to its canonical target. */
export function resolveSessionTarget(store: LifecycleStore, schedule: ScheduleData | undefined, id: string) {
  const { links } = linkSessions(store, schedule);
  const direct = schedule?.sessions.find((s) => s.id === id);
  if (direct) return { session: direct, draft: links.get(direct.id), canonicalId: direct.id };
  for (const [canonicalId, draft] of links) {
    if (draft?.id === id) {
      const session = schedule!.sessions.find((s) => s.id === canonicalId)!;
      return { session, draft, canonicalId };
    }
  }
  const orphan = store.sessions.find((d) => d.id === id);
  if (orphan) return { session: undefined, draft: orphan, canonicalId: orphan.id };
  return undefined;
}

const TRACKED_FIELDS = ["title", "abstract", "trackId", "format", "speakerIds"] as const;

const APPROVAL_STATUSES: SessionContentState["status"][] = ["draft", "submitted", "approved", "changes_requested"];

function snapshot(session: ScheduleSession | undefined, draft: SessionDraft | undefined) {
  return {
    title: session?.title ?? draft?.title ?? "",
    abstract: session?.abstract ?? draft?.abstract ?? "",
    trackId: session?.trackIds?.[0] ?? draft?.trackId ?? "",
    format: session?.format,
    speakerIds: session ? [...(session.speakerIds || [])] : draft ? [draft.speakerId] : [],
  };
}

const changed = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  TRACKED_FIELDS.some((key) => JSON.stringify(a[key] ?? "") !== JSON.stringify(b[key] ?? ""));

export type SessionEditResult =
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      session?: ScheduleSession;
      draft?: SessionDraft;
      canonicalId: string;
      contentStatus: SessionContentState["status"];
      recorded: boolean;
      scheduleTouched: boolean;
    };

/**
 * THE shared session mutation. Both `PATCH /content/sessions/:id` and
 * `PATCH /schedule/sessions/:id` go through here, so canonical propagation, approval
 * gating and history are identical whichever surface the organizer used.
 */
export function applySessionEdit(input: {
  store: LifecycleStore;
  schedule: ScheduleData | undefined;
  id: string;
  patch: SessionEditPatch;
  editor: { id: string; name: string };
}): SessionEditResult {
  const { store, schedule, id, patch, editor } = input;
  const target = resolveSessionTarget(store, schedule, id);
  if (!target) return { ok: false, error: "session not found", status: 404 };
  const { session, draft, canonicalId } = target;

  // —— Validate everything BEFORE touching any object ——
  // A rejected patch must be atomic: no title/abstract/history side effects may survive
  // a 400, whichever surface sent it.
  let nextSpeakerIds: string[] | undefined;
  if (patch.speakerIds !== undefined) {
    if (!Array.isArray(patch.speakerIds)) return { ok: false, error: "valid speakers are required", status: 400 };
    nextSpeakerIds = patch.speakerIds.filter((sid) => (schedule?.speakers || []).some((sp) => sp.id === sid));
    if (!nextSpeakerIds.length) return { ok: false, error: "valid speakers are required", status: 400 };
  }
  if (patch.contentStatus !== undefined && !APPROVAL_STATUSES.includes(patch.contentStatus)) {
    return { ok: false, error: "invalid approval status", status: 400 };
  }
  if (patch.durationMinutes !== undefined && !(Number(patch.durationMinutes) > 0)) {
    return { ok: false, error: "duration must be a positive number of minutes", status: 400 };
  }
  if (patch.title !== undefined && !String(patch.title).trim()) {
    return { ok: false, error: "title cannot be empty", status: 400 };
  }

  const before = snapshot(session, draft);

  if (session) {
    if (patch.title !== undefined) session.title = String(patch.title);
    if (patch.abstract !== undefined) session.abstract = String(patch.abstract);
    if (patch.trackId !== undefined) session.trackIds = patch.trackId ? [patch.trackId] : [];
    if (patch.format !== undefined) session.format = patch.format;
    if (patch.durationMinutes !== undefined) session.durationMinutes = Number(patch.durationMinutes);
    if (nextSpeakerIds) session.speakerIds = nextSpeakerIds;
  }
  if (draft) {
    if (patch.title !== undefined) draft.title = String(patch.title);
    if (patch.abstract !== undefined) draft.abstract = String(patch.abstract);
    if (patch.trackId !== undefined) draft.trackId = patch.trackId;
    if (patch.format !== undefined) (draft as SessionDraft & { format?: string }).format = patch.format;
  }

  // —— Approval + publication ——
  const state = ensureContentState(store, canonicalId, draft?.id);
  if (patch.contentStatus) {
    state.status = patch.contentStatus;
    state.approvalComment = patch.approvalComment || "";
    // Keep any legacy lifecycle-keyed record in step so older readers stay correct.
    const legacy = draft && draft.id !== canonicalId ? store.sessionContent.find((x) => x.sessionId === draft.id) : undefined;
    if (legacy) {
      legacy.status = state.status;
      legacy.approvalComment = state.approvalComment;
    }
  }
  if (session) {
    const meta = state as SessionContentState & { publishedByApproval?: boolean };
    if (state.status === "approved") {
      if (session.publishStatus !== "published") {
        // This publication exists only because content was approved; remember that so
        // withdrawing approval can take it back off the public surfaces.
        meta.publishedByApproval = true;
        session.publishStatus = "published";
      }
      if (session.status !== "published") session.status = session.status || "accepted";
    } else if (state.status === "changes_requested") {
      session.publishStatus = "draft";
    } else if (meta.publishedByApproval && session.publishStatus === "published") {
      // draft / submitted on a session that was only ever published by approval.
      session.publishStatus = "draft";
    }
  }

  const after = snapshot(session, draft);
  const recorded = changed(before, after);
  if (recorded) {
    store.contentHistory.push({
      id: `history-${crypto.randomUUID().slice(0, 8)}`,
      entityType: "session",
      entityId: canonicalId,
      editorId: editor.id,
      editorName: editor.name,
      createdAt: new Date().toISOString(),
      before,
      after,
    });
  }
  return {
    ok: true,
    session,
    draft,
    canonicalId,
    contentStatus: state.status,
    recorded,
    scheduleTouched: Boolean(session),
  };
}

/** Restore a recorded edit onto the canonical session and its linked lifecycle draft. */
export function restoreSessionHistory(input: {
  store: LifecycleStore;
  schedule: ScheduleData | undefined;
  historyId: string;
  editor: { id: string; name: string };
}): SessionEditResult & { history?: ContentEditHistory } {
  const { store, schedule, historyId, editor } = input;
  const history = store.contentHistory.find((h) => h.id === historyId);
  if (!history || history.entityType !== "session") return { ok: false, error: "history not found", status: 404 };
  const before = history.before as Record<string, unknown>;
  const result = applySessionEdit({
    store,
    schedule,
    id: history.entityId,
    patch: {
      title: before.title as string | undefined,
      abstract: before.abstract as string | undefined,
      trackId: before.trackId as string | undefined,
      format: before.format as string | undefined,
      speakerIds: Array.isArray(before.speakerIds) ? (before.speakerIds as string[]) : undefined,
    },
    editor,
  });
  return { ...result, history };
}
