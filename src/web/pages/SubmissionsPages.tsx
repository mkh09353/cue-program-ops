import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, subscribeData } from "../lib/api";
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
  const filter = params.get("filter") || "";
  const [rows, setRows] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [err, setErr] = useState("");

  const load = () =>
    Promise.all([
      api.submissions(filter || undefined),
      api.reviews().catch(() => ({ data: [] as any[] })),
    ])
      .then(([subs, revs]) => {
        setRows(subs.data);
        setReviews(revs.data || []);
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    return subscribeData(load);
  }, [filter]);

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
      {err ? <Notice tone="danger">{err}</Notice> : null}
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
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
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
                <tr key={s.id} className="border-b last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <Link className="font-semibold text-ink hover:text-iris" to={`/app/submissions/${s.id}`}>
                      {s.title}
                    </Link>
                    <div className="text-xs text-stone-500">{s.format}</div>
                  </td>
                  <td className="px-4 py-3">{s.name}</td>
                  <td className="px-4 py-3">{s.category}</td>
                  <td className="px-4 py-3">{s.reviewBoard}</td>
                  <td className="px-4 py-3 uppercase">{s.round}</td>
                  <td className="px-4 py-3">{inboxScore(s)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!enriched.length ? (
          <div className="p-6">
            <EmptyState title="No submissions" description="Nothing matches this filter yet." />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export function ReviewStudioPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [round, setRound] = useState<"r1" | "r2" | "final">("r1");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .submission(id!)
      .then((r) => {
        setData(r.data);
        const rev =
          r.data.reviews?.find((x: any) => x.status === "assigned") ||
          r.data.reviews?.[r.data.reviews.length - 1];
        if (rev) {
          setScores(rev.scores || {});
          setNotes(rev.notes || "");
          setRound(rev.round || "r1");
        }
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    return subscribeData(load);
  }, [id]);

  const activeReview = useMemo(() => {
    if (!data?.reviews?.length) return null;
    return (
      data.reviews.find((x: any) => x.status === "assigned" && x.round === round) ||
      data.reviews.find((x: any) => x.round === round) ||
      data.reviews[0]
    );
  }, [data, round]);

  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;

  const total = CRITERIA.reduce((a, k) => a + (Number(scores[k]) || 0), 0) / CRITERIA.length;

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
          <p className="mt-1 text-sm text-stone-500">
            {data.name} · {data.email}
          </p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{data.abstract}</p>
          {data.answers?.workshopPlan ? (
            <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm">
              <b>Workshop plan</b>
              <p className="mt-1">{String(data.answers.workshopPlan)}</p>
              {data.answers.duration ? (
                <p className="mt-1 text-xs">Duration: {String(data.answers.duration)} min</p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 rounded-xl border border-stone-200 p-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Submission answers</h3>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(data.answers || {}).filter(([key]) => !["title","abstract","category","format","workshopPlan","duration"].includes(key)).map(([key,value]) => <div key={key}><dt className="text-xs font-semibold text-stone-500">{key.replaceAll("_"," ")}</dt><dd className="whitespace-pre-wrap">{String(value ?? "—")}</dd></div>)}
            </dl>
          </div>
          <div className="mt-4 text-xs text-stone-500">
            Round on submission: <b className="uppercase">{data.round}</b>
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["r1", "r2", "final"] as const).map((r) => (
              <Button key={r} size="sm" variant={round === r ? "dark" : "outline"} onClick={() => setRound(r)}>
                {r.toUpperCase()}
              </Button>
            ))}
            {activeReview?.source === "ai_draft" ? (
              <Badge tone="ai">AI draft — edit before submit</Badge>
            ) : null}
          </div>

          <div className="space-y-4">
            {CRITERIA.map((k) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <span>{k}</span>
                  <span>
                    {scores[k] || 0}/5
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  aria-label={`${k} score`}
                  value={scores[k] || 0}
                  onChange={(e) => setScores((s) => ({ ...s, [k]: Number(e.target.value) }))}
                  className="w-full accent-iris"
                />
              </div>
            ))}
          </div>

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </Field>
          <div className="mb-4 text-sm">
            Average <b>{total.toFixed(1)}</b>
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy || !activeReview}
              onClick={async () => {
                if (!activeReview) return;
                setBusy(true);
                try {
                  const r = await api.aiAssist(activeReview.id);
                  setScores(r.data.scores);
                  setNotes(r.data.notes);
                  toast("AI advisory draft applied — submit as a human", "info");
                  load();
                } catch (e: any) {
                  toast(e.message, "danger");
                } finally {
                  setBusy(false);
                }
              }}
            >
              AI assist
            </Button>
            <Button
              disabled={busy || !activeReview}
              onClick={async () => {
                if (!activeReview) return;
                setBusy(true);
                try {
                  await api.saveReview(activeReview.id, { scores, notes, round });
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
                  toast("Declined and mock email logged");
                  load();
                } catch (e: any) {
                  toast(e.message, "danger");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Decline
            </Button>
          </div>

          <div className="mt-4 border-t pt-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Review history</h3>
            <ul className="mt-2 space-y-2 text-xs text-stone-600">
              {data.reviews?.map((r: any) => {
                const avg = averageScores(r.scores);
                return (
                  <li key={r.id} className="rounded-lg bg-stone-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="uppercase">{r.round}</b>
                      <StatusBadge status={r.status} />
                      <Badge tone={r.source === "ai_draft" ? "ai" : "muted"}>
                        {r.source === "ai_draft" ? "AI draft" : "Human"}
                      </Badge>
                      {avg != null ? <span className="font-semibold">Avg {avg}</span> : null}
                    </div>
                    {r.scores && Object.keys(r.scores).length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(r.scores).map(([k, v]) => (
                          <span key={k} className="rounded-md bg-white px-2 py-0.5 capitalize">
                            {k} {String(v)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-stone-400">No scores yet</div>
                    )}
                    {r.notes ? <p className="mt-2 text-stone-600">{r.notes}</p> : null}
                  </li>
                );
              })}
              {!data.reviews?.length ? (
                <li className="text-stone-500">No reviews assigned yet.</li>
              ) : null}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
