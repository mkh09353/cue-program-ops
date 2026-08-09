import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, setPersona, setPersonaCatalog } from "../lib/api";
import { formatStatus } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Markdown,
  Notice,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  toast,
} from "../components/ui";

export function DemoLandingPage() {
  const nav = useNavigate();
  const [personas, setPersonas] = useState<any[]>([]);
  useEffect(() => {
    api.bootstrap().then((r) => {
      const list = r.data.personas || [];
      setPersonas(list);
      if (list.length) setPersonaCatalog(list);
    });
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center p-6">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-stone-500">Kill My SaaS · CUE</div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Run the program ops loop in six minutes.</h1>
      <p className="mt-3 max-w-xl text-stone-600">
        Open-source replacement path for Sessionboard: CFP → review → onboard → schedule → publish → Accelevents.
        In-memory demo, credential-free.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {personas.map((p) => (
          <button
            key={p.id}
            type="button"
            className="rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm hover:border-iris/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris"
            onClick={() => {
              setPersona(p);
              nav(p.role === "organizer" ? "/app" : p.role === "reviewer" ? "/r" : "/p");
            }}
          >
            <div className="text-xs font-bold uppercase text-stone-500">{p.role}</div>
            <div className="mt-1 text-lg font-bold">{p.name}</div>
            <div className="text-xs text-stone-500">{p.email}</div>
          </button>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="text-iris" to="/e/ai-engineer-summit/cfp">
          Public CFP →
        </Link>
        <Link className="text-iris" to="/app/publish">
          Embeds & sync →
        </Link>
      </div>
    </div>
  );
}

export function PublicCfpPage() {
  const [data, setData] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({
    format: "Talk",
    category: "Engineering",
    experience: "intermediate",
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    api
      .publicCfp()
      .then((r) => setData(r.data))
      .catch((e) => setErr(e.message));
  }, []);

  const visibleFields = useMemo(() => {
    if (!data) return [];
    return data.form.fields.filter(
      (f: any) => !f.visibleWhen || answers[f.visibleWhen.key] === f.visibleWhen.equals,
    );
  }, [data, answers]);

  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;

  if (result) {
    return (
      <Card className="p-6">
        <Badge tone="ok">Submitted</Badge>
        <h1 className="mt-3 text-3xl font-bold">Proposal received</h1>
        <div className="mt-2">
          <Markdown text={data.form.successMd || ""} />
        </div>
        <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm">
          Routed to <b>{result.boardLabel || result.reviewBoard}</b> review board
          {answers.format === "Workshop" ? " · Workshop conditional fields were collected." : ""}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setPersona({
                id: result.speakerId,
                role: "speaker",
                name,
                email,
                speakerId: result.speakerId,
              });
              nav("/p");
            }}
          >
            Open speaker portal
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPersona({
                id: "org-swyx",
                role: "organizer",
                name: "Swyx",
                email: "swyx@ai.engineer",
              });
              nav("/app/submissions");
            }}
          >
            View as organizer
          </Button>
        </div>
      </Card>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const r = await api.submitCfp({ name, email, answers });
      setResult(r.data);
      toast("Proposal submitted");
    } catch (ex: any) {
      setErr(ex.message);
      toast(ex.message, "danger");
    }
  };

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Accepting until {new Date(data.form.closeAt).toLocaleString()} · max {data.form.maxPerUser} per user ·{" "}
        {formatStatus(data.form.status)}
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{data.form.title}</h1>
      <div className="mt-3">
        <Markdown text={data.form.welcomeMd || ""} />
      </div>

      <div className="my-6 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide" aria-label="Steps">
        {["You", "Talk", "Review"].map((label, i) => (
          <span
            key={label}
            className={`rounded-full px-3 py-1 ${i === step ? "bg-ink text-white" : "bg-stone-200 text-stone-600"}`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Card className="p-5">
        <form onSubmit={onSubmit}>
          {step === 0 ? (
            <>
              <Field label="Your name">
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Button type="button" onClick={() => setStep(1)} disabled={!name || !email}>
                Continue
              </Button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              {visibleFields.map((f: any) => (
                <Field key={f.key} label={f.label} hint={f.helpText}>
                  {f.type === "textarea" ? (
                    <Textarea
                      required={f.required}
                      value={answers[f.key] || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    />
                  ) : f.type === "select" ? (
                    <Select
                      required={f.required}
                      value={answers[f.key] || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      {(f.options || []).map((o: string) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      required={f.required}
                      value={answers[f.key] || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    />
                  )}
                </Field>
              ))}
              {answers.format === "Workshop" ? (
                <Notice tone="info">Workshop plan + duration are visible because Format = Workshop.</Notice>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button type="button" onClick={() => setStep(2)}>
                  Review
                </Button>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-stone-500">Speaker</dt>
                  <dd className="font-semibold">
                    {name} · {email}
                  </dd>
                </div>
                {visibleFields.map((f: any) => (
                  <div key={f.key}>
                    <dt className="text-xs text-stone-500">{f.label}</dt>
                    <dd className="font-medium">{answers[f.key]}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-xs text-stone-500">Review board routing</dt>
                  <dd className="font-semibold">
                    {data.form.routes.find((r: any) => r.category === answers.category)?.boardLabel || "default"}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit">Submit proposal</Button>
              </div>
            </>
          ) : null}
        </form>
      </Card>
    </div>
  );
}

export function ReviewerQueuePage({ done = false }: { done?: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api
      .reviewerQueue()
      .then((r) => {
        setRows(r.data.filter((x: any) => (done ? x.status === "completed" : x.status === "assigned")));
        setLoaded(true);
      })
      .catch((e) => {
        setErr(e.message);
        setLoaded(true);
      });
  }, [done]);

  if (!loaded) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;

  return (
    <div>
      <PageHeader
        title={done ? "Completed reviews" : "My queue"}
        description="Score from the queue. AI drafts never decide."
      />
      <div className="space-y-2">
        {rows.map((r) => (
          <Link
            key={r.id}
            to={`/r/${r.submissionId}`}
            className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 hover:border-iris/40"
          >
            <div>
              <div className="font-bold">{r.submission?.title || r.submissionId}</div>
              <div className="text-xs text-stone-500">
                {r.round?.blind ? "Anonymous speaker · Blind" : r.submission?.name} · {r.round?.name} · board {r.submission?.reviewBoard}
              </div>
            </div>
            <StatusBadge status={r.status} />
          </Link>
        ))}
        {!rows.length ? (
          <EmptyState
            title={done ? "No completed reviews" : "Queue empty"}
            description={done ? "Submitted scores will appear here." : "Nothing assigned to this reviewer right now."}
          />
        ) : null}
      </div>
    </div>
  );
}

export function ReviewerGuidelinesPage() {
  return (
    <div>
      <PageHeader title="Guidelines" />
      <Card className="space-y-3 p-5 text-sm text-stone-700">
        <p>Score relevance, novelty, clarity, and depth on a 1–5 scale.</p>
        <p>AI assist is deterministic and advisory. You must click Score & save as a human.</p>
        <p>Only organizers can accept or decline submissions. After scoring, use “Finish as organizer” on the submission.</p>
      </Card>
    </div>
  );
}

export function ReviewerSubmissionPage() {
  const { submissionId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [err, setErr] = useState("");
  const load = () => api.reviewerAssignment(submissionId!).then((r) => { setData(r.data); setResponses(r.data.review?.responses || r.data.review?.scores || {}); }).catch((e: Error) => setErr(e.message));
  useEffect(() => { load(); }, [submissionId]);
  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  const submission=data.submission, round=data.round;
  return <div>
    <PageHeader title={submission.title} description={`${round.name} · ${round.blind ? "Blind review — author identity redacted" : submission.name} · AI remains advisory`} />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5"><div className="flex gap-2"><StatusBadge status={data.assignment.status}/>{round.blind?<Badge tone="primary">Blind</Badge>:null}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{submission.abstract}</p><p className="mt-4 text-xs text-stone-500">Category: {submission.category} · Review board: {submission.reviewBoard}</p></Card>
      <Card className="p-5"><h2 className="mb-4 font-bold">Scorecard</h2>{round.criteria.map((criterion:any) => <Field key={criterion.id} label={`${criterion.label}${criterion.weight ? ` · ${criterion.weight}× weight` : ""}`}>
        {criterion.type === "rating" ? <div><input className="w-full accent-iris" type="range" min={1} max={5} value={Number(responses[criterion.id] || 3)} onChange={e=>setResponses(x=>({...x,[criterion.id]:Number(e.target.value)}))}/><div className="text-right text-xs font-bold">{responses[criterion.id] || 3}/5</div></div> : criterion.type === "select" ? <Select value={String(responses[criterion.id]||"")} onChange={e=>setResponses(x=>({...x,[criterion.id]:e.target.value}))}><option value="">Select…</option>{criterion.options?.map((o:string)=><option key={o}>{o}</option>)}</Select> : <Textarea value={String(responses[criterion.id]||"")} onChange={e=>setResponses(x=>({...x,[criterion.id]:e.target.value}))}/>} 
      </Field>)}<div className="flex flex-wrap gap-2"><Button onClick={async()=>{await api.submitAssignment(data.assignment.id,{responses});toast("Evaluation submitted");nav("/r/done")}}>Submit evaluation</Button><Button variant="danger" onClick={async()=>{await api.recuseAssignment(data.assignment.id,"Reviewer-declared conflict of interest");toast("Conflict logged; assignment removed");nav("/r")}}>Declare conflict / recuse</Button></div></Card>
    </div>
  </div>;
}
