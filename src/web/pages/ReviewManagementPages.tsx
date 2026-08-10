import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getPersona } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadState,
  Notice,
  PageHeader,
  Select,
  Textarea,
  toast,
} from "../components/ui";
import { LOAD_TIMEOUT_MS } from "../lib/useAsyncData";

/**
 * Page loader with an explicit timeout: organizer screens must never sit on a bare
 * "Loading…" forever — after LOAD_TIMEOUT_MS the caller renders <LoadState> with a
 * Retry button (see LoadState in components/ui).
 */
function useData(load: () => Promise<any>) {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const runIdRef = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    const runId = ++runIdRef.current;
    setLoading(true);
    setTimedOut(false);
    setError("");
    const timer = setTimeout(() => {
      if (runIdRef.current === runId) {
        setTimedOut(true);
        setLoading(false);
      }
    }, LOAD_TIMEOUT_MS);
    loadRef
      .current()
      .then((r) => {
        if (runIdRef.current !== runId) return;
        clearTimeout(timer);
        setData(r.data);
        setLoading(false);
        setTimedOut(false);
      })
      .catch((e) => {
        if (runIdRef.current !== runId) return;
        clearTimeout(timer);
        setError(e?.message || "Request failed");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload, loading, timedOut };
}

function updateCriterion(criteria: any[], i: number, patch: Record<string, unknown>) {
  return criteria.map((x: any, n: number) => (n === i ? { ...x, ...patch } : x));
}
export const eventDateTimeLocal=(iso:string)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(iso)).replace(" ","T");
export const eventLocalToIso=(value:string)=>{const [date,time]=value.split("T"),[y,m,d]=date!.split("-").map(Number),[h,min]=time!.split(":").map(Number);const guess=Date.UTC(y!,m!-1,d!,h!,min!),shown=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",timeZoneName:"shortOffset"}).formatToParts(new Date(guess)).find(x=>x.type==="timeZoneName")?.value||"GMT-8",match=shown.match(/GMT([+-])(\d+)(?::(\d+))?/),offset=(match?(match[1]==="-"?-1:1)*(Number(match[2])*60+Number(match[3]||0)):-480);return new Date(guess-offset*60000).toISOString()};

function RoundEditor({ round, personas, saved }: { round: any; personas: any[]; saved: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(round));
  const [invite, setInvite] = useState({ name: "", email: "" });
  const criteria = draft.criteria || [];
  useEffect(()=>setDraft(structuredClone(round)),[round]);
  const reviewers=[...new Map(personas.filter(p=>p.role==="reviewer").map(p=>[String(p.email||p.id).trim().toLowerCase(),p])).values()];

  return (
    <Card className="p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Round name">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Blind review">
          <Select
            value={String(draft.blind)}
            onChange={(e) => setDraft({ ...draft, blind: e.target.value === "true" })}
          >
            <option value="false">Identity visible</option>
            <option value="true">Blind</option>
          </Select>
        </Field>
        <Field label="Opens">
          <Input
            type="datetime-local"
            value={eventDateTimeLocal(draft.opensAt)}
            onChange={(e) => setDraft({ ...draft, opensAt: eventLocalToIso(e.target.value) })}
          />
        </Field>
        <Field label="Closes">
          <Input
            type="datetime-local"
            value={eventDateTimeLocal(draft.closesAt)}
            onChange={(e) => setDraft({ ...draft, closesAt: eventLocalToIso(e.target.value) })}
          />
        </Field>
      </div>

      <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-mid">Scorecard criteria</h3>
      <p className="mt-1 text-xs text-mid">
        Rating criteria use min/max scale. Select criteria (including Recommendation) use an editable options list —
        one option per line.
      </p>
      {criteria.map((c: any, i: number) => (
        <div key={c.id} className="mt-3 rounded-[18px] border border-line p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_140px_100px_auto]">
            <Input
              aria-label="Criterion label"
              value={c.label}
              onChange={(e) => setDraft({ ...draft, criteria: updateCriterion(criteria, i, { label: e.target.value }) })}
            />
            <Select
              value={c.type}
              onChange={(e) => {
                const type = e.target.value;
                const patch: any = { type };
                if (type === "rating") {
                  patch.min = c.min ?? 1;
                  patch.max = c.max ?? 5;
                }
                if (type === "select" && !c.options?.length) {
                  patch.options = ["Strong accept", "Accept", "Borderline", "Reject"];
                }
                setDraft({ ...draft, criteria: updateCriterion(criteria, i, patch) });
              }}
            >
              <option value="rating">Rating</option>
              <option value="select">Select</option>
              <option value="text">Text</option>
            </Select>
            <Input
              aria-label="Criterion weight"
              type="number"
              min="0"
              step="0.5"
              value={c.weight}
              onChange={(e) =>
                setDraft({ ...draft, criteria: updateCriterion(criteria, i, { weight: Number(e.target.value) }) })
              }
            />
            <Button variant="outline" onClick={() => setDraft({ ...draft, criteria: criteria.filter((_: any, n: number) => n !== i) })}>
              Remove
            </Button>
          </div>
          {c.type === "rating" ? (
            <div className="mt-2 grid max-w-sm grid-cols-2 gap-2">
              <Field label="Min">
                <Input
                  aria-label={`${c.label} min`}
                  type="number"
                  value={c.min ?? 1}
                  onChange={(e) =>
                    setDraft({ ...draft, criteria: updateCriterion(criteria, i, { min: Number(e.target.value) }) })
                  }
                />
              </Field>
              <Field label="Max">
                <Input
                  aria-label={`${c.label} max`}
                  type="number"
                  value={c.max ?? 5}
                  onChange={(e) =>
                    setDraft({ ...draft, criteria: updateCriterion(criteria, i, { max: Number(e.target.value) }) })
                  }
                />
              </Field>
            </div>
          ) : null}
          {c.type === "select" ? (
            <Field label="Options (one per line)">
              <Textarea
                aria-label={`${c.label} options`}
                rows={4}
                value={(c.options || []).join("\n")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    criteria: updateCriterion(criteria, i, {
                      options: e.target.value
                        .split("\n")
                        .map((o) => o.trim())
                        .filter(Boolean),
                    }),
                  })
                }
              />
            </Field>
          ) : null}
        </div>
      ))}
      <Button
        className="mt-2"
        size="sm"
        variant="outline"
        onClick={() =>
          setDraft({
            ...draft,
            criteria: [
              ...criteria,
              { id: `criterion-${Date.now()}`, label: "New criterion", type: "rating", weight: 1, min: 1, max: 5 },
            ],
          })
        }
      >
        Add criterion
      </Button>

      <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-mid">Reviewer pool</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {reviewers
          .map((p) => (
            <label key={p.id} className="rounded-full border px-3 py-1 text-sm">
              <input
                className="mr-2"
                type="checkbox"
                checked={draft.reviewerIds.includes(p.id)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reviewerIds: e.target.checked
                      ? [...draft.reviewerIds, p.id]
                      : draft.reviewerIds.filter((id: string) => id !== p.id),
                  })
                }
              />
              {p.name}
            </label>
          ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Reviewer name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
        <Input
          type="email"
          placeholder="Reviewer email"
          value={invite.email}
          onChange={(e) => setInvite({ ...invite, email: e.target.value })}
        />
        <Button
          variant="outline"
          onClick={async () => {
            await api.inviteReviewer(round.id, invite);
            setInvite({ name: "", email: "" });
            toast("Reviewer invited");
            saved();
          }}
        >
          Invite reviewer
        </Button>
      </div>
      <Button
        className="mt-4"
        onClick={async () => {
          const savedRound:any=await api.updateReviewRound(round.id, draft);
          setDraft(structuredClone(savedRound.data));
          toast("Round saved");
          saved();
        }}
      >
        Save round
      </Button>
    </Card>
  );
}

export function EvaluationPlanPage() {
  const { data: rounds, error, reload } = useData(api.reviewRounds);
  const { data: boot, reload: reloadBoot } = useData(async () => {
    const x = await api.bootstrap();
    return { data: x.data.personas };
  });
  const [name, setName] = useState("");
  const refresh = () => {
    reload();
    reloadBoot();
  };
  return (
    <div>
      <PageHeader
        title="Evaluation Plan"
        description="Edit dates, blind review, reviewer pools, and weighted scorecards with scales and options."
        actions={
          <Button
            onClick={async () => {
              if (!name) return;
              await api.createReviewRound({ name, status: "draft", blind: false, reviewerIds: [], criteria: [] });
              setName("");
              toast("Round created");
              refresh();
            }}
          >
            Add round
          </Button>
        }
      />
      <Notice tone="info">AI review assistance is advisory. Open any submission in <a className="font-semibold underline" href="/app/submissions">Review Studio</a> and choose <b>AI draft review</b>; a human must edit and submit it.</Notice>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="mb-4 max-w-sm">
        <Field label="New round name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Committee Decision" />
        </Field>
      </div>
      <div className="space-y-3">
        {rounds.map((r) => (
          <RoundEditor key={r.id} round={r} personas={boot} saved={refresh} />
        ))}
      </div>
    </div>
  );
}

export function AssignmentsPage() {
  const { data: rounds, reload: reloadRounds } = useData(api.reviewRounds);
  const { data: subs } = useData(api.submissions);
  const { data: boot, reload: reloadBoot } = useData(async () => {
    const x = await api.bootstrap();
    return { data: x.data.personas };
  });
  const { data: recusals, reload: reloadRecusals } = useData(api.reviewRecusals);
  const { loading: subsLoading, timedOut: subsTimedOut, error: subsError, reload: reloadSubs } = useData(api.submissions);
  const [roundId, setRound] = useState("round-initial");
  const [reviewerId, setReviewer] = useState("rev-ada");
  const [cap, setCap] = useState(5);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [assigned, setAssigned] = useState<{ titles: string[]; skipped: string[]; reviewer: string } | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [invite,setInvite]=useState({name:"",email:""});

  const titleOf = (id: string) => subs.find((s) => s.id === id)?.title || id;

  const run = async (method: string) => {
    // Snapshot the exact ids we are sending so the confirmation can name every one.
    const ids = method === "specific" ? [...selected] : subs.map((s) => s.id);
    if (!ids.length) {
      setMessage("Select at least one submission to assign.");
      setAssigned(null);
      toast("Select submissions first", "warn");
      return;
    }
    setAssignBusy(true);
    try {
      const r = await api.assignReviews({ roundId, reviewerId, submissionIds: ids, method, cap });
      const made = r.data || [];
      const count = made.length;
      const reviewerName = boot.find((p) => p.id === reviewerId)?.name || reviewerId;
      const assignedIds = new Set(made.map((a: any) => a.submissionId));
      const titles = made.map((a: any) => titleOf(a.submissionId));
      const skipped = ids.filter((id) => !assignedIds.has(id)).map(titleOf);
      const msg =
        count === 0
          ? `No new assignments for ${reviewerName} — all ${ids.length} selected are already assigned or over the per-reviewer limit (${cap}).`
          : `${count} of ${ids.length} selected assigned to ${reviewerName}`;
      setMessage(msg);
      setAssigned({ titles, skipped, reviewer: reviewerName });
      toast(msg);
      if (method === "specific" && count > 0) setSelected([]);
      reloadRounds();
      reloadRecusals();
    } catch (e: any) {
      const err = e?.message || "Assign failed";
      setMessage(err);
      setAssigned(null);
      toast(err, "danger");
    } finally {
      setAssignBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Assignments" description="Choose abstracts and assign them to a reviewer. Reinstate recused work below." />
      <Card className="mb-4 p-5"><h2 className="font-bold">Invite reviewer</h2><p className="text-sm text-mid">Add a reviewer directly to the selected round, then assign submissions below.</p><div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]"><Input placeholder="Reviewer name" value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})}/><Input type="email" placeholder="Reviewer email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/><Button variant="outline" onClick={async()=>{if(!roundId)return;const r:any=await api.inviteReviewer(roundId,invite);setInvite({name:"",email:""});setReviewer(r.data.reviewer.id);toast("Reviewer invited to this round");reloadRounds();reloadBoot()}}>Invite reviewer</Button></div></Card>
      <Card className="grid gap-4 p-5 md:grid-cols-3">
        <Field label="Round">
          <Select value={roundId} onChange={(e) => setRound(e.target.value)}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reviewer">
          <Select value={reviewerId} onChange={(e) => setReviewer(e.target.value)}>
            {boot
              .filter((p) => p.role === "reviewer")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Per-reviewer limit">
          <Input type="number" min={1} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
        </Field>
        <div className="flex flex-wrap items-center gap-2 md:col-span-3">
          <Button disabled={!selected.length || assignBusy} onClick={() => void run("specific")}>
            {assignBusy ? "Assigning…" : `Assign selected (${selected.length})`}
          </Button>
          <Button variant="outline" disabled={assignBusy} onClick={() => void run("auto")}>
            Auto-distribute
          </Button>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            onClick={() =>
              setSelected((prev) => (prev.length === subs.length ? [] : subs.map((s) => s.id)))
            }
          >
            {selected.length === subs.length && subs.length ? "Clear all" : "Select all"}
          </Button>
          <span className="text-sm text-mid" data-testid="assignment-selection-count">
            {selected.length} of {subs.length} selected
          </span>
        </div>
        {message ? (
          <div className="md:col-span-3" role="status" aria-live="polite">
            <Notice tone={message.toLowerCase().includes("fail") || message.toLowerCase().includes("select") ? "warn" : "ok"}>
              <span className="block font-semibold">{message}</span>
              {assigned?.titles.length ? (
                <ul className="mt-1 list-disc pl-5" data-testid="assigned-titles">
                  {assigned.titles.map((t) => (
                    <li key={t}>
                      {t} → {assigned.reviewer}
                    </li>
                  ))}
                </ul>
              ) : null}
              {assigned?.skipped.length ? (
                <p className="mt-1 text-xs">
                  Skipped (already assigned to {assigned.reviewer} or over the limit): {assigned.skipped.join(", ")}
                </p>
              ) : null}
            </Notice>
          </div>
        ) : null}
      </Card>

      {subsLoading || subsTimedOut || subsError ? (
        <div className="mt-4">
          <LoadState
            loading={subsLoading}
            timedOut={subsTimedOut}
            error={subsError}
            onRetry={reloadSubs}
            label="submissions"
          />
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-[24px] border bg-paper">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-3">Select</th>
              <th>Submission</th>
              <th>Track</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="p-3">
                  <input
                    aria-label={`Select ${s.title}`}
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={(e) =>
                      // Functional update: two checkboxes toggled in the same tick must
                      // both survive (a stale `selected` closure dropped one before).
                      setSelected((prev) =>
                        e.target.checked
                          ? prev.includes(s.id)
                            ? prev
                            : [...prev, s.id]
                          : prev.filter((id) => id !== s.id),
                      )
                    }
                  />
                </td>
                <td>
                  <b>{s.title}</b>
                  <div className="text-xs text-mid">{s.name}</div>
                </td>
                <td>{s.category}</td>
                <td>
                  <Badge>{s.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-mid">Recused assignments</h2>
        <p className="mt-1 text-xs text-mid">Reviewers who declared a conflict. Reinstate returns the work to their queue.</p>
        <div className="mt-3 space-y-2">
          {recusals.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-line p-3 text-sm"
            >
              <div>
                <b>{a.submission?.title || a.submissionId}</b>
                <div className="text-xs text-mid">
                  {a.reviewer?.name || a.reviewerId} · {a.round?.name || a.roundId} · {a.reason}
                </div>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  await api.reinstateAssignment(a.id);
                  toast("Assignment reinstated");
                  reloadRecusals();
                }}
              >
                Reinstate
              </Button>
            </div>
          ))}
          {!recusals.length ? <p className="text-sm text-mid">No recused assignments.</p> : null}
        </div>
      </Card>
    </div>
  );
}

export function ReviewProgressPage() {
  const {data:rounds}=useData(api.reviewRounds);const [roundId,setRoundId]=useState("");
  useEffect(()=>{if(!roundId&&rounds.length)setRoundId(rounds.find(r=>r.status==="open")?.id||rounds[0].id)},[rounds,roundId]);
  const { data, reload } = useData(()=>api.reviewProgress(roundId||undefined));
  const { data: automationRows } = useData(async()=>{const r=await api.automation();return {data:[r.data]}});
  const automation=automationRows[0];
  const [message, setMessage] = useState("");
  const outstanding = data.filter((r) => r.outstanding).map((r) => r.reviewerId);
  return (
    <div>
      <PageHeader
        title="Review Progress"
        description="Live completion by round and reviewer."
        actions={
          <Button
            disabled={!outstanding.length}
            onClick={async () => {
              const r = await api.reviewReminders([...new Set(outstanding)] as string[]);
              const msg = `${r.data.length} reminder(s) logged`;
              setMessage(msg);
              toast(msg);
              reload();
            }}
          >
            Remind outstanding reviewers
          </Button>
        }
      />
      <Card className="mb-4 p-4"><Field label="Round"><Select aria-label="Progress round" value={roundId} onChange={e=>setRoundId(e.target.value)}>{rounds.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field></Card>
      <Card className="mb-4 p-4"><b>Automation</b><p className="text-sm text-mid">{automation?.enabled?"Enabled":"Disabled"} · hourly ({automation?.schedule||"0 * * * *"})</p><p className="text-sm">Last run: {automation?.lastRunAt?new Date(automation.lastRunAt).toLocaleString():"Not run yet"} · speakers {automation?.speakerSent||0} · reviewers {automation?.reviewerSent||0} · {automation?.status||"never"}</p></Card>
      {message ? <Notice tone="ok">{message}</Notice> : null}
      {data.map((r) => (
        <Card className="mt-2 flex justify-between p-4" key={`${r.roundId}-${r.reviewerId}`}>
          <b>{r.reviewer?.name || r.reviewerId}</b>
          <span>
            {r.completed} of {r.assigned} complete · {r.percent}%
          </span>
        </Card>
      ))}
    </div>
  );
}

/** Sort helper for the Results table (exported for tests). */
export function sortResults(rows: any[], sort: "score-desc" | "score-asc" | "title" | "reviews-desc") {
  const score = (r: any) => (typeof r.aggregateScore === "number" ? r.aggregateScore : null);
  const copy = [...rows];
  if (sort === "title") return copy.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  if (sort === "reviews-desc") return copy.sort((a, b) => (b.reviewerCount || 0) - (a.reviewerCount || 0));
  return copy.sort((a, b) => {
    const av = score(a);
    const bv = score(b);
    // Unscored rows always sort last, in both directions.
    if (av == null && bv == null) return String(a.title).localeCompare(String(b.title));
    if (av == null) return 1;
    if (bv == null) return -1;
    return sort === "score-asc" ? av - bv : bv - av;
  });
}

export function ResultsPage() {
  const {data:rounds}=useData(api.reviewRounds);const [roundId,setRoundId]=useState("");
  const { data, loading, timedOut, error, reload } = useData(()=>api.reviewResults(roundId||undefined));
  const [exportMsg, setExportMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<"score-desc" | "score-asc" | "title" | "reviews-desc">("score-desc");
  const sorted = useMemo(() => sortResults(data, sort), [data, sort]);

  const downloadCsv = async () => {
    setExporting(true);
    setExportMsg("");
    try {
      const p = getPersona();
      const res = await fetch(api.reviewResultsCsv(), {
        headers: {
          "x-demo-persona": p.id,
          "x-demo-role": p.role,
        },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "review-results.csv";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg("CSV download started — check your downloads folder.");
      toast("CSV download started");
    } catch (e: any) {
      const err = e?.message || "Export failed";
      setExportMsg(err);
      toast(err, "danger");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Results"
        description="Human review aggregates and disposition."
        actions={
          <Button onClick={() => void downloadCsv()} disabled={exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />
      <Notice tone="info">Need evaluation help? AI drafts are advisory only. Open a submission in <a className="font-semibold underline" href="/app/submissions">Review Studio</a> and choose <b>AI draft review</b>; human reviewers retain responsibility.</Notice>
      {exportMsg ? <Notice tone="ok">{exportMsg}</Notice> : null}
      {loading || timedOut || error ? (
        <LoadState loading={loading} timedOut={timedOut} error={error} onRetry={reload} label="review results" />
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-mid">Round<Select aria-label="Results round" value={roundId} onChange={e=>setRoundId(e.target.value)}><option value="">All rounds</option>{rounds.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
        <label className="flex items-center gap-2 text-sm font-medium text-mid">
          Sort by
          <Select
            aria-label="Sort results"
            className="max-w-56"
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
          >
            <option value="score-desc">Score · high to low</option>
            <option value="score-asc">Score · low to high</option>
            <option value="reviews-desc">Review count · high to low</option>
            <option value="title">Title · A to Z</option>
          </Select>
        </label>
        <Button
          size="sm"
          variant="outline"
          data-testid="toggle-score-sort"
          onClick={() => setSort((cur) => (cur === "score-desc" ? "score-asc" : "score-desc"))}
        >
          Score {sort === "score-asc" ? "↑ ascending" : "↓ descending"}
        </Button>
        <span className="text-xs text-mid">Unscored submissions always sort last.</span>
      </div>
      <div className="overflow-x-auto rounded-[24px] border bg-paper">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Submission</th>
              <th>
                <button
                  type="button"
                  className="font-semibold underline-offset-2 hover:underline"
                  onClick={() => setSort((cur) => (cur === "score-desc" ? "score-asc" : "score-desc"))}
                >
                  Score {sort === "score-desc" ? "↓" : sort === "score-asc" ? "↑" : ""}
                </button>
              </th>
              <th>Reviews</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody data-testid="results-rows">
            {sorted.map((r) => (
              <tr className="border-t" key={r.id}>
                <td className="p-3">
                  <b>{r.title}</b>
                </td>
                <td>{r.aggregateScore?.toFixed(2) || "—"}</td>
                <td>{r.reviewerCount}</td>
                <td>
                  <Badge>{r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
