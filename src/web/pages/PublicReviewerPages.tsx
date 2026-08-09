import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  const [eventName, setEventName] = useState("AI Engineer Summit");
  useEffect(() => {
    api.bootstrap().then((r) => {
      const list = r.data.personas || [];
      setPersonas(list);
      if (list.length) setPersonaCatalog(list);
      if (r.data.event?.name) setEventName(r.data.event.name);
    });
  }, []);

  const byRole = (role: string) => personas.filter((p) => p.role === role);
  const enter = (p: any) => {
    setPersona(p);
    nav(p.role === "organizer" ? "/app" : p.role === "reviewer" ? "/r" : "/p");
  };

  const publicLinks = [
    { to: "/e/ai-engineer-summit/cfp", label: "Public CFP", blurb: "Conditional fields, draft save, edit link" },
    { to: "/e/ai-engineer-summit/public/sessions", label: "Sessions widget", blurb: "Published catalog + search" },
    { to: "/e/ai-engineer-summit/public/speakers", label: "Speakers widget", blurb: "Bios + session pairing" },
    { to: "/e/ai-engineer-summit/public/agenda", label: "Agenda grid", blurb: "Room × time by day" },
    { to: "/e/ai-engineer-summit/public/itinerary", label: "Itinerary", blurb: "Chronological + My Schedule" },
    { to: "/e/ai-engineer-summit/public/gallery", label: "Speaker gallery", blurb: "Visual directory" },
    { to: "/e/ai-engineer-summit/public/feed.json", label: "JSON feed", blurb: "Machine-readable program" },
    { to: "/e/ai-engineer-summit/public/ics", label: "iCal feed", blurb: "Subscribe-friendly calendar" },
  ];

  const loop = [
    "Configure & publish a CFP with routing",
    "Review & score across rounds",
    "Accept → speaker onboarding portal",
    "Build a conflict-aware agenda",
    "Publish embeds + one-way Accelevents sync",
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-mid">Kill My SaaS · CUE</div>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl" style={{ letterSpacing: "-0.05em" }}>
          Conference program ops, end to end — without Sessionboard.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-mid">
          Open-source path for <b>{eventName}</b>: CFP → review → onboard → schedule → publish → Accelevents.
          Credential-free demo with persona simulation (not production auth). State lives in process memory unless
          optional Airtable snapshot restore is configured.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Badge tone="primary">Demo · no login</Badge>
          <Badge tone="muted">Mock mailer default</Badge>
          <Badge tone="muted">Accelevents one-way mock</Badge>
        </div>

        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wide text-mid">Enter a role shell</h2>
          <p className="mt-1 text-sm text-mid">
            Persona headers simulate identity. Pick a card to land in the matching shell with seed data loaded.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {(
              [
                {
                  role: "organizer",
                  title: "Organizer",
                  path: "/app",
                  blurb: "Command center, submissions, review, speakers, schedule, CRM, publish.",
                },
                {
                  role: "reviewer",
                  title: "Reviewer",
                  path: "/r",
                  blurb: "Scoped queue, weighted scorecards, recusal, guidelines.",
                },
                {
                  role: "speaker",
                  title: "Speaker",
                  path: "/p",
                  blurb: "Profile, tasks, deliverables, talks, resources, calendar ICS.",
                },
              ] as const
            ).map((shell) => {
              const list = byRole(shell.role);
              return (
                <Card key={shell.role} className="flex flex-col p-5">
                  <div className="text-xs font-medium uppercase tracking-wide text-mid">{shell.title}</div>
                  <p className="mt-2 text-sm text-mid">{shell.blurb}</p>
                  <code className="mt-2 block text-[11px] text-mid">{shell.path}/*</code>
                  <div className="mt-4 flex flex-1 flex-col gap-2">
                    {list.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="rounded-[18px] border border-line bg-paper px-3 py-2 text-left shadow-sm hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                        onClick={() => enter(p)}
                      >
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-mid">{p.email}</div>
                      </button>
                    ))}
                    {!list.length ? (
                      <Button type="button" variant="outline" onClick={() => nav(shell.path)}>
                        Open {shell.title.toLowerCase()} shell
                      </Button>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xs font-medium uppercase tracking-wide text-mid">Public surfaces</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {publicLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-[24px] border border-line bg-paper p-4 shadow-card transition hover:border-ink/20"
              >
                <div className="font-semibold text-ink">{l.label}</div>
                <div className="mt-1 text-xs text-mid">{l.blurb}</div>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link className="text-ink" to="/app/publish">
              Organizer embed manager →
            </Link>
            <a className="text-ink" href="/public/events/evt-ai-summit-2026/gallery">
              Legacy gallery alias →
            </a>
            <a className="text-ink" href="/health">
              /health →
            </a>
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-mid">Judge walkthrough</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
              {loop.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Card>
          <Card className="p-5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-mid">Honest defaults</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li>Identity is header/persona simulation — not multi-tenant auth.</li>
              <li>Mailer is mock unless a Resend-compatible endpoint is configured.</li>
              <li>Accelevents sync is one-way mock; live HTTP is placeholder.</li>
              <li>Memory resets on Worker restart; optional Airtable snapshot for demo recovery only.</li>
            </ul>
          </Card>
        </section>
      </div>
    </div>
  );
}

export function PublicCfpPage() {
  const [data, setData] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [search] = useSearchParams();
  const nav = useNavigate();

  useEffect(() => {
    api
      .publicCfp()
      .then(async (r) => {
        setData(r.data);
        const id=search.get("submission"),token=search.get("token");
        if(id&&token){const saved=await api.publicSubmission(id,token);setName(saved.data.name);setEmail(saved.data.email);setAnswers(saved.data.answers||{});setResult({id,speakerId:saved.data.speakerId,editToken:token,status:saved.data.status,editing:true,editable:saved.data.editable});setStep(1)}
      })
      .catch((e) => setErr(e.message));
  }, []);

  const visibleFields = useMemo(() => {
    if (!data) return [];
    return data.form.fields.filter(
      (f: any) => !f.visibleWhen || answers[f.visibleWhen.key] === f.visibleWhen.equals,
    );
  }, [data, answers]);

  useEffect(()=>{
    if(!data)return;
    setAnswers((current)=>{const next={...current};for(const field of data.form.fields||[]){if(next[field.key]==null&&field.type==="select"&&field.options?.length)next[field.key]=field.options[0]}return next});
  },[data]);

  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;

  if (result && !result.editing) {
    return (
      <Card className="p-6">
        <Badge tone="ok">Submitted</Badge>
        <h1 className="mt-3 text-3xl font-bold">Proposal received</h1>
        <div className="mt-2">
          <Markdown text={data.form.successMd || ""} />
        </div>
        <p className="mt-4 rounded-[18px] bg-canvas p-3 text-sm">
          Routed to <b>{result.boardLabel || result.reviewBoard}</b> review board
          {String(answers.format || "").startsWith("Workshop") ? " · Workshop conditional fields were collected." : ""}.
        </p>
        <p className="mt-3 text-sm"><b>Reference:</b> {result.id}</p>
        <a className="mt-2 block text-sm font-semibold text-ink underline" href={result.editUrl}>View or edit this submission</a>
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
      const r = result?.editing ? await api.savePublicSubmission(result.id,{editToken:result.editToken,answers,status:"submitted"}) : await api.submitCfp({ name, email, answers });
      setResult(r.data);
      toast("Proposal submitted");
    } catch (ex: any) {
      setErr(ex.message);
      toast(ex.message, "danger");
    }
  };

  const saveDraft = async () => {
    try {
      const r=result?.editing ? await api.savePublicSubmission(result.id,{editToken:result.editToken,answers,status:"draft"}) : await api.submitCfp({name,email,answers,status:"draft"});
      setResult({...r.data,editing:true,editable:true});setSaved(`Draft saved · reference ${r.data.id}`);toast("Draft saved — use this page link to resume");
      history.replaceState(null,"",r.data.editUrl||`?submission=${r.data.id}&token=${r.data.editToken}`);
    } catch(ex:any){setErr(ex.message)}
  };

  return (
    <div>
      <div className="mb-4 rounded-[24px] border border-line bg-canvas px-4 py-3 text-sm text-ink">
        Accepting until {new Date(data.form.closeAt).toLocaleString()} · max {data.form.maxPerUser} per user ·{" "}
        {formatStatus(data.form.status)}
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{data.event.name} · {data.form.title}</h1>
      <div className="mt-3">
        <Markdown text={data.form.welcomeMd || ""} />
      </div>
      {(() => {
        const trackField = data.form.fields?.find((f: any) => f.key === "category");
        const tracks = trackField?.options || data.form.routes?.map((r: any) => r.category) || [];
        return tracks.length ? (
          <p className="mt-2 text-sm text-mid">
            <span className="font-medium text-ink">Tracks: </span>
            {tracks.join(" · ")}
          </p>
        ) : null;
      })()}

      {!data.window?.open ? <Card className="my-6 border-line p-8 text-center"><Badge tone="warn">Closed</Badge><h2 className="mt-3 text-2xl font-bold">Submissions closed</h2><p className="mt-2 text-mid">{data.window?.reason}. The deadline was {new Date(data.form.closeAt).toLocaleString()}.</p></Card> : null}
      {data.window?.open ? <><div className="my-6 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide" aria-label="Steps">
        {["You", "Talk", "Review"].map((label, i) => (
          <span
            key={label}
            className={`rounded-full px-3 py-1 ${i === step ? "bg-ink text-white" : "bg-canvas text-mid"}`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {err ? <Notice tone="danger">{err}</Notice> : null}
      {saved ? <Notice tone="ok">{saved}. Bookmark the current edit link to resume.</Notice> : null}
      {result?.editing && !result.editable ? <Notice tone="warn">Editing closed. This submission is read-only after the CFP deadline.</Notice> : null}

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
              <div className="mb-4 rounded-[18px] border border-line bg-paper p-4"><div className="flex items-center justify-between"><b>Co-authors / co-presenters</b><Button type="button" size="sm" variant="outline" onClick={()=>setAnswers(a=>({...a,additionalSpeakers:[...(a.additionalSpeakers||[]),{name:"",email:""}]}))}>Add co-author</Button></div>
                {(answers.additionalSpeakers||[]).map((person:any,i:number)=><div key={i} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label={`Co-author ${i+1} name`} placeholder="Name" value={person.name} onChange={e=>setAnswers(a=>({...a,additionalSpeakers:a.additionalSpeakers.map((x:any,n:number)=>n===i?{...x,name:e.target.value}:x)}))}/><Input aria-label={`Co-author ${i+1} email`} type="email" placeholder="Email" value={person.email} onChange={e=>setAnswers(a=>({...a,additionalSpeakers:a.additionalSpeakers.map((x:any,n:number)=>n===i?{...x,email:e.target.value}:x)}))}/><Button type="button" variant="outline" onClick={()=>setAnswers(a=>({...a,additionalSpeakers:a.additionalSpeakers.filter((_:any,n:number)=>n!==i)}))}>Remove</Button></div>)}
              </div>
              <Button type="button" onClick={() => setStep(1)} disabled={!name || !email}>
                Continue
              </Button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              {visibleFields.map((f: any,idx:number) => (<div key={f.key}>{f.section && visibleFields[idx-1]?.section!==f.section?<h2 className="mb-3 mt-5 border-b pb-2 text-lg font-bold">{f.section}</h2>:null}
                <Field label={`${f.label}${f.required ? " *" : ""}`} hint={f.helpText}>
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
                  ) : f.type === "checkbox" ? <input type="checkbox" checked={answers[f.key]==="true"} onChange={(e)=>setAnswers(a=>({...a,[f.key]:String(e.target.checked)}))} /> : f.type === "file" ? <Input type="file" onChange={(e)=>setAnswers(a=>({...a,[f.key]:e.target.files?.[0]?.name||""}))} /> : (
                    <Input
                      required={f.required}
                      value={answers[f.key] || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                    />
                  )}
                </Field></div>
              ))}
              {answers.format?.startsWith("Workshop") ? (
                <Notice tone="info">Workshop plan + duration are visible because Format = Workshop.</Notice>
              ) : null}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const missing = visibleFields
                      .filter((f: any) => f.required && !(String(answers[f.key] ?? "").trim()))
                      .map((f: any) => f.label);
                    if (missing.length) {
                      setErr(`Complete required fields before review: ${missing.join(", ")}`);
                      toast(`Missing: ${missing.join(", ")}`, "danger");
                      return;
                    }
                    setErr("");
                    setStep(2);
                  }}
                >
                  Review
                </Button>
                <Button type="button" variant="secondary" disabled={!name||!email||!answers.title||result?.editable===false} onClick={saveDraft}>Save as draft</Button>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-mid">Speaker</dt>
                  <dd className="font-semibold">
                    {name} · {email}
                  </dd>
                </div>
                {(answers.additionalSpeakers||[]).map((person:any,i:number)=><div key={i}><dt className="text-xs text-mid">Co-author</dt><dd className="font-semibold">{person.name} · {person.email}</dd></div>)}
                {visibleFields.map((f: any) => {
                  const raw = answers[f.key];
                  const display =
                    raw == null || String(raw).trim() === ""
                      ? f.required
                        ? "— not selected (required)"
                        : "— not selected"
                      : String(raw);
                  return (
                    <div key={f.key}>
                      <dt className="text-xs text-mid">{f.label}{f.required ? " *" : ""}</dt>
                      <dd className={`font-medium ${raw == null || String(raw).trim() === "" ? "text-mid" : ""}`}>
                        {display}
                      </dd>
                    </div>
                  );
                })}
                <div>
                  <dt className="text-xs text-mid">Review board routing</dt>
                  <dd className="font-semibold">
                    {data.form.routes.find((r: any) => r.category === answers.category)?.boardLabel || "default"}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={
                    result?.editable === false ||
                    visibleFields.some(
                      (f: any) => f.required && !(String(answers[f.key] ?? "").trim()),
                    )
                  }
                >
                  Submit proposal
                </Button>
              </div>
            </>
          ) : null}
        </form>
      </Card>
      </> : null}
    </div>
  );
}

export function ReviewerQueuePage({ done = false }: { done?: boolean }) {
  const location = useLocation();
  const isDone = done || location.pathname.endsWith("/done");
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  // Gate the list on this key so /r → /r/done never paints the previous filter's rows.
  const listKey = `${isDone ? "done" : "queue"}:${location.pathname}`;
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setRows([]);
    setErr("");
    api
      .reviewerQueue()
      .then((r) => {
        if (cancelled) return;
        setRows(r.data.filter((x: any) => (isDone ? x.status === "completed" : x.status === "assigned")));
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e.message);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isDone, location.pathname]);

  if (!loaded) {
    return (
      <div>
        <PageHeader
          title={isDone ? "Completed reviews" : "My queue"}
          description={isDone ? "Loading completed evaluations…" : "Loading your queue…"}
        />
        <Spinner />
      </div>
    );
  }
  if (err) return <Notice tone="danger">{err}</Notice>;

  return (
    <div key={listKey}>
      <PageHeader
        title={isDone ? "Completed reviews" : "My queue"}
        description="Score from the queue. AI drafts never decide."
      />
      <div className="space-y-2" data-queue-mode={isDone ? "completed" : "assigned"}>
        {rows.map((r) => (
          <Link
            key={r.id}
            to={`/r/${r.id}`}
            className="flex items-center justify-between rounded-[24px] border border-line bg-white p-4 hover:border-ink/20"
          >
            <div>
              <div className="font-bold">{r.submission?.title || r.submissionId}</div>
              <div className="text-xs text-mid">
                {r.round?.blind ? "Anonymous speaker · Blind" : r.submission?.name} · {r.round?.name} · board {r.submission?.reviewBoard}
              </div>
            </div>
            <StatusBadge status={r.status} />
          </Link>
        ))}
        {!rows.length ? (
          <EmptyState
            title={isDone ? "No completed reviews" : "Queue empty"}
            description={isDone ? "Submitted scores will appear here." : "Nothing assigned to this reviewer right now."}
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
      <Card className="space-y-3 p-5 text-sm text-ink-soft">
        <p>Score the configured round criteria (ratings use the organizer scale; select options come from the scorecard).</p>
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
  const [confirmRecuse, setConfirmRecuse] = useState(false);
  const [recuseBusy, setRecuseBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const load = () =>
    api
      .reviewerAssignment(submissionId!)
      .then((r) => {
        setData(r.data);
        setResponses(r.data.review?.responses || r.data.review?.scores || {});
      })
      .catch((e: Error) => setErr(e.message));
  useEffect(() => {
    load();
  }, [submissionId]);
  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  const submission = data.submission;
  const round = data.round;
  const scoreCriteria=[...(round.criteria||[])];
  if(!scoreCriteria.some((x:any)=>x.type==="rating"))scoreCriteria.unshift({id:"overall_rating",label:"Overall rating",type:"rating",weight:1,min:1,max:5});
  if(!scoreCriteria.some((x:any)=>x.type==="text"))scoreCriteria.push({id:"comments",label:"Comments",type:"text",weight:0});
  if(!scoreCriteria.some((x:any)=>x.type==="select"))scoreCriteria.push({id:"recommendation",label:"Recommendation",type:"select",weight:0,options:["Accept","Waitlist","Reject"]});
  return (
    <div>
      <PageHeader
        title={submission.title}
        description={`${round.name} · ${round.blind ? "Blind review — author identity redacted" : submission.name} · AI remains advisory`}
      />
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex gap-2">
            <StatusBadge status={data.assignment.status} />
            {round.blind ? <Badge tone="primary">Blind</Badge> : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{submission.abstract}</p>
          <p className="mt-4 text-xs text-mid">
            Category: {submission.category} · Review board: {submission.reviewBoard}
          </p>
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Scorecard</h2><p className="text-xs text-mid">AI drafts are heuristic, advisory, and never submit or decide.</p></div><Button variant="secondary" disabled={aiBusy} onClick={async()=>{setAiBusy(true);try{const r:any=await api.aiAssist(data.review?.id || data.assignment.id);setResponses(x=>({...x,...(r.data.scores||{}),comments:r.data.notes||x.comments||""}));setNotice("AI advisory draft applied. Review and edit every value before submitting.")}catch(e:any){setErr(e.message)}finally{setAiBusy(false)}}}>{aiBusy?"Drafting…":"AI draft review"}</Button></div>
          {scoreCriteria.map((criterion: any) => {
            const min = criterion.min ?? 1;
            const max = criterion.max ?? 5;
            return (
              <Field
                key={criterion.id}
                label={`${criterion.label}${criterion.weight ? ` · ${criterion.weight}× weight` : ""}${
                  criterion.type === "rating" ? ` · ${min}–${max}` : ""
                }`}
              >
                {criterion.type === "rating" ? (
                  <div>
                    <input
                      className="w-full accent-ink"
                      type="range"
                      min={min}
                      max={max}
                      aria-label={criterion.label}
                      value={Number(responses[criterion.id] ?? min)}
                      onChange={(e) => setResponses((x) => ({ ...x, [criterion.id]: Number(e.target.value) }))}
                    />
                    <div className="text-right text-xs font-bold">
                      {responses[criterion.id] ?? min}/{max}
                    </div>
                  </div>
                ) : criterion.type === "select" ? (
                  <Select
                    value={String(responses[criterion.id] || "")}
                    onChange={(e) => setResponses((x) => ({ ...x, [criterion.id]: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {(criterion.options || []).map((o: string) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Textarea
                    value={String(responses[criterion.id] || "")}
                    onChange={(e) => setResponses((x) => ({ ...x, [criterion.id]: e.target.value }))}
                  />
                )}
              </Field>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                await api.submitAssignment(data.assignment.id, { responses });
                toast("Evaluation submitted");
                nav("/r/done");
              }}
            >
              Submit evaluation
            </Button>
            <Button variant="danger" onClick={() => setConfirmRecuse(true)}>
              Declare conflict / recuse
            </Button>
          </div>
          {confirmRecuse ? (
            <div
              className="mt-4 rounded-[18px] border border-line bg-canvas p-4"
              role="dialog"
              aria-label="Confirm recusal"
            >
              <p className="text-sm font-semibold">Recuse from this assignment?</p>
              <p className="mt-1 text-xs text-mid">
                This logs a conflict of interest and removes the submission from your queue. Organizers can reinstate
                it later.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={recuseBusy}
                  onClick={async () => {
                    setRecuseBusy(true);
                    try {
                      await api.recuseAssignment(data.assignment.id, "Reviewer-declared conflict of interest");
                      setNotice("Recusal recorded — assignment removed from your queue.");
                      toast("Conflict logged; assignment removed");
                      setTimeout(() => nav("/r"), 600);
                    } catch (e: any) {
                      toast(e.message || "Recuse failed", "danger");
                    } finally {
                      setRecuseBusy(false);
                      setConfirmRecuse(false);
                    }
                  }}
                >
                  {recuseBusy ? "Recusing…" : "Confirm recuse"}
                </Button>
                <Button variant="outline" disabled={recuseBusy} onClick={() => setConfirmRecuse(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
