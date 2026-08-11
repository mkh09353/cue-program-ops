import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, getActiveEvent, setActiveEventId, subscribeData, subscribeEvent } from "../lib/api";
import { averageScores } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  PageHeader,
  Spinner,
  StatusBadge,
  Textarea,
  toast,
} from "../components/ui";

const CRITERIA = ["relevance", "novelty", "clarity", "depth"] as const;

/** Find which event owns a submission the active event cannot see.
 * Used only on the 404 path, so the extra probes are cheap. */
export async function findOwningEvent(submissionId: string): Promise<{ id: string; name: string } | null> {
  try {
    const events = (await api.events()).data || [];
    const active = getActiveEvent().id;
    for (const event of events) {
      if (event.id === active) continue;
      const found = await fetch(`/api/events/${event.id}/submissions/${submissionId}`, {
        headers: { "x-demo-role": "organizer", "x-demo-persona": "org-swyx", "x-cue-event": event.id },
      })
        .then((r) => r.ok)
        .catch(() => false);
      if (found) return { id: event.id, name: event.name };
    }
  } catch {
    /* fall back to the plain error notice */
  }
  return null;
}

function inboxScore(s: any): string {
  if (s.avgScore != null && s.avgScore !== "") return String(s.avgScore);
  const reviews: any[] = s.reviews || [];
  const withScores = reviews.filter((r) => r.scores && Object.keys(r.scores).length);
  if (!withScores.length) return "—";
  const avgs = withScores
    .map((r) => averageScores(r.scores))
    .filter((n): n is number => n != null);
  if (!avgs.length) return "—";
  const mean = Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10;
  const draftOnly = withScores.every((r) => r.status !== "submitted");
  return draftOnly ? `${mean} (draft)` : String(mean);
}

export function SubmissionsListPage() {
  const [params, setParams] = useSearchParams();
  // Normalize unknown/stale filter query values so we never false-empty the inbox.
  const rawFilter = params.get("filter") || "";
  const allowedFilters = new Set(["", "pending", "unscored", "accepted", "rejected"]);
  const filter = allowedFilters.has(rawFilter) ? rawFilter : "";
  const [rows, setRows] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setErr("");
    }
    return Promise.all([
      api.submissions(filter || undefined),
      api.reviews().catch(() => ({ data: [] as any[] })),
    ])
      .then(([subs, revs]) => {
        const list = Array.isArray(subs?.data)
          ? subs.data
          : Array.isArray(subs)
            ? (subs as any[])
            : null;
        if (list == null) {
          throw new Error("Submissions response was empty or malformed");
        }
        setRows(list);
        setReviews(revs?.data || []);
        setErr("");
        setLoaded(true);
      })
      .catch((e) => {
        // Keep prior rows on refresh failure so a transient error is not a false-empty inbox.
        setErr(e?.message || "Failed to load submissions");
        setLoaded(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Drop stale rows when the filter changes; show spinner instead of a false empty state.
    setRows([]);
    setLoaded(false);
    setErr("");
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.submissions(filter || undefined),
      api.reviews().catch(() => ({ data: [] as any[] })),
    ])
      .then(([subs, revs]) => {
        if (cancelled) return;
        const list = Array.isArray(subs?.data)
          ? subs.data
          : Array.isArray(subs)
            ? (subs as any[])
            : null;
        if (list == null) throw new Error("Submissions response was empty or malformed");
        setRows(list);
        setReviews(revs?.data || []);
        setErr("");
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e?.message || "Failed to load submissions");
        setLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const unsub = subscribeData(() => {
      if (!cancelled) load({ silent: true });
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // If URL had a bad filter, rewrite to All so the UI matches the fetch.
  useEffect(() => {
    if (rawFilter && !allowedFilters.has(rawFilter)) {
      setParams({}, { replace: true });
    }
  }, [rawFilter, setParams]);

  const enriched = useMemo(() => {
    return rows.map((s) => ({
      ...s,
      reviews: reviews.filter((r) => r.submissionId === s.id),
    }));
  }, [rows, reviews]);

  return (
    <div>
      <PageHeader
        title="Submissions"
        description="Inbox for CFP proposals. Open Review Studio to score, accept, or decline."
      />
      {err ? (
        <Notice tone="danger">
          <div className="flex flex-wrap items-center gap-3">
            <span>{err}</span>
            <Button size="sm" variant="secondary" onClick={() => load()}>
              Retry
            </Button>
          </div>
        </Notice>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Submission filters">
        {[
          ["", "All"],
          ["pending", "Pending"],
          ["unscored", "Unscored"],
          ["accepted", "Accepted"],
          ["rejected", "Rejected"],
        ].map(([k, label]) => (
          <Button
            key={label}
            size="sm"
            variant={filter === k ? "dark" : "outline"}
            onClick={() => setParams(k ? { filter: k } : {})}
            aria-pressed={filter === k}
          >
            {label}
          </Button>
        ))}
      </div>
      {!loaded || loading ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden" data-testid="submissions-table">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-soft text-[11px] uppercase tracking-wide text-mid">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Speaker</th>
                  <th className="px-4 py-3">Track</th>
                  <th className="px-4 py-3">Board</th>
                  <th className="px-4 py-3">Round</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-soft">
                    <td className="px-4 py-3">
                      <Link className="font-semibold text-ink hover:text-ink" to={`/app/submissions/${s.id}`}>
                        {s.title}
                      </Link>
                      <div className="text-xs text-mid">{s.format}</div>
                    </td>
                    <td className="px-4 py-3">
                      {s.name}
                      {s.additionalSpeakers?.length
                        ? s.additionalSpeakers.map((p: any) => ` + ${p.name}`).join("")
                        : ""}
                    </td>
                    <td className="px-4 py-3">{s.category}</td>
                    <td className="px-4 py-3">{s.reviewBoard}</td>
                    <td className="px-4 py-3 uppercase">{s.round}</td>
                    <td className="px-4 py-3">{inboxScore(s)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                      {s.decisionEmailAt ? <div className="mt-1 text-xs text-mid">Decision email sent · {new Date(s.decisionEmailAt).toLocaleString()}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!enriched.length ? (
            <div className="p-6">
              <EmptyState
                title={err ? "Could not load submissions" : "No submissions"}
                description={
                  err
                    ? "Use Retry above after checking your connection or persona."
                    : filter
                      ? `Nothing matches the “${filter}” filter yet.`
                      : "Nothing in the inbox yet."
                }
              />
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}

export function ReviewStudioPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<string, number | string>>({});
  const [notes, setNotes] = useState("");
  const [roundId, setRoundId] = useState<string>("");
  const [err, setErr] = useState("");
  /** Set when the submission exists, but in a different event. */
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Assignments let the studio request an AI draft before any Review row exists.
  const [assignments, setAssignments] = useState<any[]>([]);
  const [aiDraft, setAiDraft] = useState<
    | { status: "loading" }
    | { status: "ready"; entries: { label: string; value: number }[]; notes: string; at: string }
    | { status: "error"; error: string }
    | null
  >(null);

  const load = () =>
    Promise.all([
      api.submission(id!),
      api.reviewRounds().catch(() => ({ data: [] as any[] })),
      api.submissionAssignments(id!).catch(() => ({ data: [] as any[] })),
    ])
      .then(([r, rr, ra]) => {
        setData(r.data);
        setAssignments(ra.data || []);
        const list = rr.data || [];
        setRounds(list);
        const preferred =
          list.find((x: any) => x.status === "open") ||
          list[0];
        setRoundId((cur) => cur || preferred?.id || "");
        const rev =
          r.data.reviews?.find((x: any) => x.status === "assigned") ||
          r.data.reviews?.[r.data.reviews.length - 1];
        if (rev) {
          setScores({ ...(rev.responses || rev.scores || {}) });
          setNotes(rev.notes || "");
        }
      })
      .catch(async (e) => {
        setErr(e?.message || "Could not load this submission");
        // A record the ACTIVE event does not own is the classic multi-event trap:
        // say which event holds it and offer the switch instead of a bare 404.
        if (/not found/i.test(String(e?.message || ""))) setOwner(await findOwningEvent(id!));
      });

  useEffect(() => {
    load();
    return subscribeData(load);
  }, [id]);

  const activeRound = useMemo(
    () => rounds.find((r) => r.id === roundId) || rounds.find((r) => r.status === "open") || rounds[0],
    [rounds, roundId],
  );
  const criteria = activeRound?.criteria || [];

  const activeReview = useMemo(() => {
    if (!data?.reviews?.length) return null;
    return (
      data.reviews.find((x: any) => x.status === "assigned") ||
      data.reviews[data.reviews.length - 1] ||
      data.reviews[0]
    );
  }, [data]);

  if (!data && !err) return <Spinner />;
  if (err)
    return (
      <div>
        <PageHeader title="Submission unavailable" description={`Active event: ${getActiveEvent().name}`} actions={
          <Button variant="outline" onClick={() => nav("/app/submissions")}>Back to inbox</Button>
        }/>
        {owner ? (
          <Notice tone="warn">
            <span className="block font-semibold" data-testid="cross-event-notice">
              This submission belongs to {owner.name} — switch event to view it.
            </span>
            <span className="text-xs">You are currently working in {getActiveEvent().name}.</span>
            <Button size="sm" className="mt-2" data-testid="switch-to-owner" onClick={() => { setActiveEventId(owner.id); setErr(""); setOwner(null); load(); }}>
              Switch to {owner.name}
            </Button>
          </Notice>
        ) : (
          <Notice tone="danger" data-testid="submission-error">{err}</Notice>
        )}
      </div>
    );

  const ratingCriteria = criteria.filter((c: any) => c.type === "rating");
  const total = ratingCriteria.length
    ? ratingCriteria.reduce((a: number, c: any) => a + (Number(scores[c.id]) || 0), 0) / ratingCriteria.length
    : 0;

  return (
    <div>
      <PageHeader
        title="Review Studio"
        description="Human-only decisions. AI is advisory and never accepts a talk."
        actions={
          <Button variant="outline" onClick={() => nav("/app/submissions")}>
            Back to inbox
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            <Badge tone="primary">{data.category}</Badge>
            <Badge tone="muted">{data.format}</Badge>
            <Badge tone="info">Board · {data.reviewBoard}</Badge>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{data.title}</h2>
          <div className="mt-2 rounded-[18px] border border-line p-3 text-sm"><b>Speakers</b><ul className="mt-1 space-y-1"><li>{data.name} · {data.email} <Badge tone="muted">lead</Badge></li>{(data.additionalSpeakers||[]).map((p:any)=><li key={p.id}>{p.name} · {p.email} <Badge tone="muted">{p.role==="co-author"?"co-author":"co-presenter"}</Badge></li>)}</ul></div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{data.abstract}</p>
          {data.answers?.workshopPlan ? (
            <div className="mt-4 rounded-[18px] bg-canvas p-3 text-sm">
              <b>Workshop plan</b>
              <p className="mt-1">{String(data.answers.workshopPlan)}</p>
              {data.answers.duration ? (
                <p className="mt-1 text-xs">Duration: {String(data.answers.duration)} min</p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 rounded-[18px] border border-line p-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Submission answers</h3>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(data.answers || {}).filter(([key]) => !["title","abstract","category","format","workshopPlan","duration","additionalSpeakers"].includes(key)).map(([key,value]) => <div key={key}><dt className="text-xs font-semibold text-mid">{key.replaceAll("_"," ")}</dt><dd className="whitespace-pre-wrap">{String(value ?? "—")}</dd></div>)}
            </dl>
          </div>
          <div className="mt-4 text-xs text-mid">
            Round on submission: <b className="uppercase">{data.round}</b>
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {rounds.map((r) => (
              <Button
                key={r.id}
                size="sm"
                variant={activeRound?.id === r.id ? "dark" : "outline"}
                onClick={() => setRoundId(r.id)}
              >
                {r.name}
              </Button>
            ))}
            {activeReview?.source === "ai_draft" ? (
              <Badge tone="ai">AI draft — edit before submit</Badge>
            ) : null}
          </div>
          <p className="mb-3 text-xs text-mid">
            Scorecard from <b>{activeRound?.name || "active round"}</b>
            {activeRound?.blind ? " · blind" : ""}. AI assist fills configured rating criteria only.
          </p>

          <div className="space-y-4">
            {criteria.map((c: any) => {
              const min = c.min ?? 1;
              const max = c.max ?? 5;
              if (c.type === "rating") {
                return (
                  <div key={c.id}>
                    <div className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-mid">
                      <span>
                        {c.label}
                        {c.weight ? ` · ${c.weight}×` : ""}
                      </span>
                      <span>
                        {scores[c.id] ?? min}/{max}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={1}
                      aria-label={`${c.label} score`}
                      value={Number(scores[c.id] ?? min)}
                      onChange={(e) => setScores((s) => ({ ...s, [c.id]: Number(e.target.value) }))}
                      className="w-full accent-ink"
                    />
                  </div>
                );
              }
              if (c.type === "select") {
                return (
                  <Field key={c.id} label={`${c.label}${c.weight ? ` · ${c.weight}×` : ""}`}>
                    <select
                      className="h-10 w-full rounded-[18px] border border-line bg-white px-3 text-sm"
                      aria-label={c.label}
                      value={String(scores[c.id] || "")}
                      onChange={(e) => setScores((s) => ({ ...s, [c.id]: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      {(c.options || []).map((o: string) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                );
              }
              return (
                <Field key={c.id} label={c.label}>
                  <Textarea
                    aria-label={c.label}
                    value={String(scores[c.id] || "")}
                    onChange={(e) => setScores((s) => ({ ...s, [c.id]: e.target.value }))}
                    rows={3}
                  />
                </Field>
              );
            })}
            {!criteria.length ? (
              <Notice tone="warn">No criteria on this round — configure them under Evaluation Plan.</Notice>
            ) : null}
          </div>

          <Field label="Organizer notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </Field>
          <div className="mb-4 text-sm">
            Rating average <b>{total.toFixed(1)}</b>
            {activeReview?.source === "ai_draft" ? (
              <span className="ml-2 text-xs text-mid">· provenance: AI advisory draft</span>
            ) : null}
          </div>

          {aiDraft ? (
            <div
              className="mt-3 rounded-[18px] border border-line bg-soft p-3 text-sm"
              data-testid="ai-draft-panel"
              role="status"
              aria-live="polite"
            >
              {aiDraft.status === "loading" ? (
                <span data-testid="ai-draft-loading">Drafting AI review… scoring this abstract now.</span>
              ) : aiDraft.status === "error" ? (
                <span className="text-rose-600" data-testid="ai-draft-error">{aiDraft.error}</span>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="ai">AI advisory draft</Badge>
                    <span className="text-xs text-mid">generated {aiDraft.at} · advisory only — a human must review and save</span>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-3" data-testid="ai-draft-scores">
                    {aiDraft.entries.map((e) => (
                      <li key={e.label} className="rounded-[10px] bg-paper px-2 py-1">
                        <b className="capitalize">{e.label}</b> <span className="font-mono">{e.value}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft" data-testid="ai-draft-rationale">{aiDraft.notes}</p>
                </>
              )}
            </div>
          ) : null}
          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              variant="secondary"
              data-testid="ai-draft-button"
              // Enabled as soon as a reviewer is assigned: the server materializes
              // the Review row from an assignment id when none exists yet.
              disabled={busy || (!activeReview && !assignments.length)}
              onClick={async () => {
                const target = activeReview?.id || assignments[0]?.id;
                if (!target) return;
                setBusy(true);
                setAiDraft({ status: "loading" });
                try {
                  const r = await api.aiAssist(target);
                  const aiScores = r.data.scores || {};
                  setAiDraft({
                    status: "ready",
                    entries: Object.entries(aiScores)
                      .filter(([, v]) => typeof v === "number")
                      .map(([k, v]) => ({ label: k, value: Number(v) })),
                    notes: String(r.data.notes || r.data.aiDraft || ""),
                    at: new Date().toLocaleTimeString(),
                  });
                  const mapped: Record<string, number | string> = { ...scores };
                  for (const c of criteria) {
                    if (c.type === "rating") {
                      if (aiScores[c.id] != null) mapped[c.id] = Number(aiScores[c.id]);
                      else if (aiScores[c.label?.toLowerCase?.()] != null) mapped[c.id] = Number(aiScores[c.label.toLowerCase()]);
                      else if (["relevance", "novelty", "clarity", "depth"].includes(c.id) && aiScores[c.id] != null)
                        mapped[c.id] = Number(aiScores[c.id]);
                      else if (aiScores.relevance != null && c.id === "relevance") mapped[c.id] = Number(aiScores.relevance);
                      else if (aiScores.novelty != null && c.id === "novelty") mapped[c.id] = Number(aiScores.novelty);
                      else if (aiScores.clarity != null && c.id === "clarity") mapped[c.id] = Number(aiScores.clarity);
                      else if (aiScores.depth != null && c.id === "depth") mapped[c.id] = Number(aiScores.depth);
                      else if (Object.keys(aiScores).length) {
                        // Fall back: distribute first rating values onto criteria in order
                        const vals = Object.values(aiScores).filter((v) => typeof v === "number") as number[];
                        const idx = criteria.filter((x: any) => x.type === "rating").indexOf(c);
                        if (idx >= 0 && vals[idx] != null) mapped[c.id] = vals[idx];
                      }
                    }
                  }
                  setScores(mapped);
                  setNotes(r.data.notes || notes);
                  toast("AI advisory draft applied — human remains responsible", "info");
                  load();
                } catch (e: any) {
                  setAiDraft({ status: "error", error: e?.message || "AI draft failed" });
                  toast(e.message, "danger");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && aiDraft?.status === "loading" ? "Drafting AI review…" : "AI draft review"}
            </Button>
            <Button
              disabled={busy || !activeReview}
              onClick={async () => {
                if (!activeReview) return;
                setBusy(true);
                try {
                  await api.saveReview(activeReview.id, { scores, responses: scores, notes, round: activeRound?.id || roundId });
                  toast("Scores saved for this round");
                  load();
                } catch (e: any) {
                  toast(e.message, "danger");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Score & save
            </Button>
            <Button
              variant="dark"
              disabled={busy || data.status === "accepted"}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api.decide(data.id, {
                    nextStatus: "accepted",
                    sendComms: true,
                    createTasks: true,
                  });
                  toast(
                    `Accepted · ${r.data.tasks?.length || 0} tasks + mock email${
                      r.data.communication ? " + ICS" : ""
                    }`,
                  );
                  load();
                } catch (e: any) {
                  toast(e.message, "danger");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Accept
            </Button>
            <Button
              variant="danger"
              disabled={busy || data.status === "rejected"}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.decide(data.id, { nextStatus: "rejected", sendComms: true });
                  toast("Rejected and mock email logged");
                  load();
                } catch (e: any) {
                  toast(e.message, "danger");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reject
            </Button>
          </div>

          <div className="mt-4 border-t pt-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Review history</h3>
            <ul className="mt-2 space-y-2 text-xs text-mid">
              {data.reviews?.map((r: any) => {
                const avg = r.average != null ? r.average : averageScores(r.scores);
                const entries: any[] = r.entries?.length
                  ? r.entries
                  : Object.entries(r.scores || {}).map(([key, value]) => ({ key, label: key, value }));
                const comment = r.comment || r.notes || "";
                return (
                  <li key={r.id} className="rounded-lg bg-soft p-3" data-testid="review-history-item">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-ink">{r.reviewerName || r.reviewerId}</b>
                      <span className="uppercase">{r.roundName || r.round}</span>
                      <StatusBadge status={r.status} />
                      <Badge tone={r.isAiDraft || r.source === "ai_draft" ? "ai" : "muted"}>
                        {r.isAiDraft || r.source === "ai_draft" ? "AI draft" : "Human"}
                      </Badge>
                      {avg != null ? <span className="font-semibold">Avg {avg}</span> : null}
                      {r.submittedAt ? (
                        <span className="text-mid">submitted {new Date(r.submittedAt).toLocaleString()}</span>
                      ) : null}
                    </div>
                    {entries.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entries.map((e: any) => (
                          <span key={e.key} className="rounded-md bg-white px-2 py-0.5">
                            {e.label} {String(e.value)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-mid">No scores yet</div>
                    )}
                    {r.recommendation ? (
                      <p className="mt-2 text-ink">Recommendation: {r.recommendation}</p>
                    ) : null}
                    {comment ? <p className="mt-2 text-mid">{comment}</p> : null}
                  </li>
                );
              })}
              {!data.reviews?.length ? (
                <li className="text-mid">No reviews assigned yet.</li>
              ) : null}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
