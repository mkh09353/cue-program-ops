import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { isoToZonedWallTime, zonedWallTimeToIso } from "../../timezone";

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
/** datetime-local value ("YYYY-MM-DDTHH:MM") for a stored instant, in the event timezone. */
export const eventDateTimeLocal=(iso:string)=>{const {day,time}=isoToZonedWallTime(iso);return `${day}T${time}`};
/** Inverse: a datetime-local value is EVENT wall time; store the matching UTC instant. */
export const eventLocalToIso=(value:string)=>{const [day,time]=String(value).split("T");return zonedWallTimeToIso(day!,time!)};

type ReviewerInviteSuccess = { name: string; email: string; url: string };

/** Persistent artifact shared by the Evaluation Plan and Assignments invite controls. */
function ReviewerInviteSuccessNotice({ invite, onClose }: { invite: ReviewerInviteSuccess; onClose: () => void }) {
  return (
    <Notice tone="ok" onClose={onClose}>
      <div data-testid="review-management-reviewer-demo-access-link">
        <b>Reviewer invited: {invite.name}</b> · {invite.email}
        <Input className="mt-2" readOnly aria-label="Reviewer demo access link" value={invite.url} />
        <Button
          className="mt-2"
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(invite.url);
            toast("Reviewer access link copied");
          }}
        >
          Copy reviewer access link
        </Button>
        <p className="mt-2 text-xs">
          It is credential-free demo persona access, not password authentication or a production login.
        </p>
      </div>
    </Notice>
  );
}

function RoundEditor({ round, personas, saved }: { round: any; personas: any[]; saved: () => void }) {
  const [draft, setDraftState] = useState(() => structuredClone(round));
  /** True once the organizer has typed into THIS round since the last save. */
  const [dirty, setDirty] = useState(false);
  const roundIdRef = useRef(round.id);
  // Every editor field goes through this, so any local edit marks the draft dirty.
  const setDraft = (next: any) => {
    setDirty(true);
    setDraftState(next);
  };
  const [invite, setInvite] = useState({ name: "", email: "" });
  const [inviteSuccess, setInviteSuccess] = useState<ReviewerInviteSuccess | null>(null);
  const criteria = draft.criteria || [];
  // Saving/inviting on ANOTHER round refetches every round, which used to reset this
  // editor and silently discard in-progress configuration. Re-sync only when the round
  // identity changes, or when there is nothing unsaved to lose.
  useEffect(() => {
    if (roundIdRef.current !== round.id) {
      roundIdRef.current = round.id;
      setDirty(false);
      setDraftState(structuredClone(round));
      return;
    }
    if (dirty) return;
    setDraftState((prev: any) => (JSON.stringify(prev) === JSON.stringify(round) ? prev : structuredClone(round)));
  }, [round, dirty]);
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
            const invited: any = await api.inviteReviewer(round.id, invite);
            const linked = await api.issueReviewerInviteLink(invited.data.reviewer.id, round.id);
            setInviteSuccess({
              name: invited.data.reviewer.name,
              email: invited.data.reviewer.email,
              url: linked.data.inviteUrl || `${window.location.origin}${linked.data.invitePath}`,
            });
            setInvite({ name: "", email: "" });
            toast("Reviewer invited");
            saved();
          }}
        >
          Invite reviewer
        </Button>
      </div>
      {inviteSuccess ? (
        <div className="mt-3">
          <ReviewerInviteSuccessNotice invite={inviteSuccess} onClose={() => setInviteSuccess(null)} />
        </div>
      ) : null}
      <Button
        className="mt-4"
        onClick={async () => {
          const savedRound:any=await api.updateReviewRound(round.id, draft);
          // Adopt the server copy and drop the dirty flag so later sibling refreshes may
          // re-sync this editor again.
          setDraftState(structuredClone(savedRound.data));
          setDirty(false);
          toast("Round saved");
          saved();
        }}
      >
        {dirty ? "Save round *" : "Save round"}
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
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
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
            disabled={addBusy}
            onClick={async () => {
              if (!name.trim()) {
                setAddError("Enter a round name first.");
                return;
              }
              setAddBusy(true);
              setAddError("");
              try {
                // A round is only useful once it can take assignments, so create it open.
                await api.createReviewRound({ name: name.trim(), status: "open", blind: false, reviewerIds: [], criteria: [] });
                setName("");
                toast("Round created");
                refresh();
              } catch (e: any) {
                // A duplicate name previously rejected the promise unhandled, so the
                // organizer saw nothing at all and assumed the round existed.
                const message = String(e?.message || "Could not create the round.");
                setAddError(
                  /already exists/i.test(message)
                    ? `A round named “${name.trim()}” already exists — pick a different name (for example “${name.trim()} 2”).`
                    : message,
                );
              } finally {
                setAddBusy(false);
              }
            }}
          >
            {addBusy ? "Adding…" : "Add round"}
          </Button>
        }
      />
      <Notice tone="info">AI review assistance is advisory. Open any submission in <a className="font-semibold underline" href="/app/submissions">Review Studio</a> and choose <b>AI draft review</b>; a human must edit and submit it.</Notice>
      {addError ? (
        <Notice tone="danger" onClose={() => setAddError("")}>
          <span data-testid="round-create-error">{addError}</span>
        </Notice>
      ) : null}
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
  const [inviteSuccess,setInviteSuccess]=useState<ReviewerInviteSuccess|null>(null);

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
      <Card className="mb-4 p-5"><h2 className="font-bold">Invite reviewer</h2><p className="text-sm text-mid">Add a reviewer directly to the selected round, then assign submissions below.</p><div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]"><Input placeholder="Reviewer name" value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})}/><Input type="email" placeholder="Reviewer email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/><Button variant="outline" onClick={async()=>{if(!roundId)return;const r:any=await api.inviteReviewer(roundId,invite);const linked=await api.issueReviewerInviteLink(r.data.reviewer.id,roundId);setInviteSuccess({name:r.data.reviewer.name,email:r.data.reviewer.email,url:linked.data.inviteUrl||`${window.location.origin}${linked.data.invitePath}`});setInvite({name:"",email:""});setReviewer(r.data.reviewer.id);toast("Reviewer invited to this round");reloadRounds();reloadBoot()}}>Invite reviewer</Button></div>{inviteSuccess?<div className="mt-3"><ReviewerInviteSuccessNotice invite={inviteSuccess} onClose={()=>setInviteSuccess(null)}/></div>:null}</Card>
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

/** Default Review Progress to the round that received the most recent assignment.
 *
 * Status is deliberately NOT a filter: a round the organizer just created and
 * assigned into must win even while it is still a draft. Ties and rounds with
 * no assignments fall back to declaration order. Exported for tests. */
export function defaultProgressRoundId(rounds: any[]): string {
  if (!rounds?.length) return "";
  const withAssignments = rounds.filter((r) => r.lastAssignmentAt);
  if (!withAssignments.length) return rounds[0].id;
  return [...withAssignments].sort((a, b) =>
    String(b.lastAssignmentAt || "").localeCompare(String(a.lastAssignmentAt || "")),
  )[0].id;
}

export function ReviewProgressPage() {
  const {data:rounds}=useData(api.reviewRounds);const [roundId,setRoundId]=useState("");
  useEffect(()=>{if(!roundId&&rounds.length)setRoundId(defaultProgressRoundId(rounds))},[rounds,roundId]);
  const { data, reload } = useData(()=>api.reviewProgress(roundId||undefined));
  const { data: automationRows } = useData(async()=>{const r=await api.automation();return {data:[r.data]}});
  const automation=automationRows[0];
  const [message, setMessage] = useState("");
  // Defensive scoping: only ever render rows belonging to the selected round, so
  // assignments made in other rounds can never inflate the header counts.
  const rows = roundId ? data.filter((r: any) => r.roundId === roundId) : data;
  const selectedRound = rounds.find((r: any) => r.id === roundId);
  const totals = rows.reduce(
    (acc: { assigned: number; completed: number }, r: any) => ({
      assigned: acc.assigned + (r.assigned || 0),
      completed: acc.completed + (r.completed || 0),
    }),
    { assigned: 0, completed: 0 },
  );
  const outstanding = rows.filter((r: any) => r.outstanding).map((r: any) => r.reviewerId);
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
      <Card className="mb-4 p-4">
        <Field label="Round"><Select aria-label="Progress round" value={roundId} onChange={e=>setRoundId(e.target.value)}>{rounds.map(r=><option key={r.id} value={r.id}>{r.name}{r.lastAssignmentAt?"":" · no assignments"}</option>)}</Select></Field>
        <p className="mt-2 text-sm" data-testid="progress-round-summary">
          <b>{selectedRound?.name || "No round selected"}</b> · <b data-testid="progress-total-assigned">{totals.assigned}</b> assigned ·{" "}
          <b data-testid="progress-total-complete">{totals.completed}</b> complete · {rows.length} reviewer{rows.length===1?"":"s"}
        </p>
        <p className="text-xs text-mid">Counts cover this round only — assignments in other rounds are excluded.</p>
      </Card>
      <Card className="mb-4 p-4"><b>Automation</b><p className="text-sm text-mid">{automation?.enabled?"Enabled":"Disabled"} · hourly ({automation?.schedule||"0 * * * *"})</p><p className="text-sm">Last run: {automation?.lastRunAt?new Date(automation.lastRunAt).toLocaleString():"Not run yet"} · speakers {automation?.speakerSent||0} · reviewers {automation?.reviewerSent||0} · {automation?.status||"never"}</p></Card>
      {message ? <Notice tone="ok">{message}</Notice> : null}
      {!rows.length ? <Card className="mt-2 p-4 text-sm text-mid" data-testid="progress-empty">No reviewers are assigned in this round yet.</Card> : null}
      {rows.map((r: any) => (
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
  const [expanded, setExpanded] = useState<string[]>([]);
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
            {sorted.map((r) => (<Fragment key={r.id}>
              <tr className="border-t" key={r.id}>
                <td className="p-3">
                  <button type="button" className="text-left font-bold underline-offset-2 hover:underline" aria-expanded={expanded.includes(r.id)} onClick={()=>setExpanded(x=>x.includes(r.id)?x.filter(id=>id!==r.id):[...x,r.id])}>{r.title}</button>
                </td>
                <td>{r.aggregateScore?.toFixed(2) || "—"} <span className="text-xs text-mid">{r.aggregateScore!=null?"/ 5 normalized":""}</span></td>
                <td>{r.reviewerCount}</td>
                <td>
                  <Badge>{r.status}</Badge>
                </td>
              </tr>
              {expanded.includes(r.id)?<tr key={`${r.id}-breakdown`} className="border-t bg-soft"><td colSpan={4} className="p-4"><b className="text-xs uppercase tracking-wide text-mid">Review math</b><div className="mt-2 space-y-2">{r.reviewBreakdown?.map((review:any)=><div key={review.id} className="rounded-[18px] border border-line bg-paper p-3"><div className="flex justify-between gap-2"><b>{review.reviewer}</b><span>{review.computedScore==null?"No numeric ratings":`${review.computedScore.toFixed(2)} / 5 normalized`}</span></div><ul className="mt-2 text-xs text-mid">{review.criteria.map((criterion:any)=><li key={criterion.id}>{criterion.label}: {typeof criterion.response==="number"?`${criterion.response}${criterion.type==="rating"?` on ${criterion.min??1}–${criterion.max??5} scale`:" (non-rating; excluded)"}`:String(criterion.response??"Not answered")} · weight {criterion.weight||0}</li>)}</ul></div>)}</div></td></tr>:null}
            </Fragment>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
