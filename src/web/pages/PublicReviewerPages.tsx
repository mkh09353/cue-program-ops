import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getActiveEvent, api, setPersona, setPersonaCatalog } from "../lib/api";
import { formatStatus } from "../lib/utils";
import { RuckusWordmark } from "../components/RuckusMascot";
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
    { to: `/e/${getActiveEvent().slug}/cfp`, label: "Public CFP", blurb: "Conditional fields, draft save, edit link" },
    { to: `/e/${getActiveEvent().slug}/public/sessions`, label: "Sessions widget", blurb: "Published catalog + search" },
    { to: `/e/${getActiveEvent().slug}/public/speakers`, label: "Speakers widget", blurb: "Bios + session pairing" },
    { to: `/e/${getActiveEvent().slug}/public/agenda`, label: "Agenda grid", blurb: "Room × time by day" },
    { to: `/e/${getActiveEvent().slug}/public/itinerary`, label: "Itinerary", blurb: "Chronological + My Schedule" },
    { to: `/e/${getActiveEvent().slug}/public/gallery`, label: "Speaker gallery", blurb: "Visual directory" },
    { to: `/e/${getActiveEvent().slug}/public/feed.json`, label: "JSON feed", blurb: "Machine-readable program" },
    { to: `/e/${getActiveEvent().slug}/public/ics`, label: "iCal feed", blurb: "Subscribe-friendly calendar" },
    { to: "/docs/api", label: "API docs", blurb: "Endpoint reference + OpenAPI 3.1 spec" },
  ];

  const loop = [
    "Configure & publish a CFP with routing",
    "Review & score across rounds",
    "Accept → speaker onboarding portal",
    "Build a conflict-aware agenda",
    "Publish embeds + one-way Accelevents sync",
  ];

  return (
    <div className="ruckus-brand min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        {/* Hero panel mirrors the marketing landing page: tinted violet field, dotted
            grain, brand lockup, display type. Copy and links are unchanged. */}
        <div
          className="relative overflow-hidden rounded-[32px] bg-ruckus-50/70 px-5 py-10 sm:px-10 sm:py-14"
          style={{
            backgroundImage: "radial-gradient(rgba(124,58,237,0.18) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/50 via-transparent to-white/70" />
          <div className="relative">
            <div className="mb-5">
              <RuckusWordmark showTagline />
            </div>
            <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.18em] text-mid">Kill My SaaS · Ruckus</div>
            <h1
              className="max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              Conference program ops, end to end — without Sessionboard.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-neutral-600">
          Open-source path for <b>{eventName}</b>: CFP → review → onboard → schedule → publish → Accelevents.
          Jump straight in with the persona picker, or use an emailed magic link — no passwords by design. State is
          durable: Durable Object + Cloudflare D1, mirrored to Airtable.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <Badge tone="primary">No passwords · magic links</Badge>
              <Badge tone="muted">Real email via Resend</Badge>
              <Badge tone="muted">D1 + Airtable persistence</Badge>
              <Badge tone="muted">Workers AI review drafts</Badge>
              <Badge tone="muted">Agent CLI + OpenAPI</Badge>
              <Badge tone="muted">Accelevents one-way mock</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <section className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">Enter a role shell</h2>
            <Link className="text-sm font-semibold text-brand-700 underline" to="/login" data-testid="demo-sign-in-link">
              Sign in with a real session →
            </Link>
          </div>
          <p className="mt-1 text-sm text-mid">
            Persona headers simulate identity — that is not authentication. Pick a card to land in the matching shell
            with seed data loaded, or use <b>Sign in as …</b> for a real server session (cookie-backed).
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
                <Card key={shell.role} hover className="flex flex-col p-5">
                  <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">{shell.title}</div>
                  <p className="mt-2 text-sm text-mid">{shell.blurb}</p>
                  <code className="mt-2 block text-[11px] text-mid">{shell.path}/*</code>
                  <div className="mt-4 flex flex-1 flex-col gap-2">
                    {list.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="rounded-2xl bg-white px-3 py-2 text-left shadow-sm ring-1 ring-line transition hover:ring-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
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
                  <Link
                    className="ruckus-press mt-3 block rounded-full bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                    to={`/login?demo=${shell.role}`}
                    data-testid={`demo-session-${shell.role}`}
                  >
                    Sign in as {shell.title.toLowerCase()} (real session)
                  </Link>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">Public surfaces</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {publicLinks.map((l) => (
              // Server-rendered pages: must be full-page loads, not SPA router links.
              <a
                key={l.to}
                href={l.to}
                className="rounded-3xl border border-line bg-paper p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card"
              >
                <div className="font-semibold text-ink">{l.label}</div>
                <div className="mt-1 text-xs text-mid">{l.blurb}</div>
              </a>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link className="text-brand-700 hover:underline" to="/app/publish">
              Organizer embed manager →
            </Link>
            <a className="text-brand-700 hover:underline" href="/public/events/evt-ai-summit-2026/gallery">
              Legacy gallery alias →
            </a>
            <a className="text-brand-700 hover:underline" href="/health">
              /health →
            </a>
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">Judge walkthrough</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
              {loop.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Card>
          <Card className="p-5">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">How this demo runs</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li>Identity: credential-free persona picker plus real per-person magic links (emailed access tokens for speakers and reviewers) — no password accounts by design.</li>
              <li>Email: LIVE provider delivery via Resend — invites, magic links, decision notices, and reminders really send; per-recipient provider IDs are logged. (Mock mailer is the safe default when no key is configured.)</li>
              <li>Persistence: durable — Durable Object + Cloudflare D1 write-through, mirrored to Airtable (snapshot blob for restore plus normalized Speakers/Sessions rows for automations).</li>
              <li>AI review drafts: real Workers AI (llama-3.1-8b) with provenance labels; deterministic heuristic fallback. Always advisory.</li>
              <li>Accelevents sync remains a one-way mock by default; live HTTP mappings are placeholders until validated against the real contract.</li>
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
  /** Load failures replace the page; submit/validation failures must NOT. */
  const [loadErr, setLoadErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");
  /** Inline, screenshot-visible draft outcome rendered beside the Save as draft button. */
  const [draftState, setDraftState] = useState<
    { status: "saved"; id: string; at: string; resumeUrl: string } | { status: "error"; error: string } | null
  >(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [search] = useSearchParams();
  const { slug, formId } = useParams();
  const nav = useNavigate();

  useEffect(() => {
    api
      .publicCfp(slug!, formId)
      .then(async (r) => {
        setData(r.data);
        const id=search.get("submission"),token=search.get("token");
        if(id&&token){const saved=await api.publicSubmission(slug!,id,token);setName(saved.data.name);setEmail(saved.data.email);
          // Co-authors live on the submission record AND inside answers; merge both so a
          // resumed draft/edit never loses them (and always re-sends them on save).
          const storedCoAuthors=(saved.data.additionalSpeakers||[]).map((p:any)=>({name:p.name,email:p.email,role:p.role||"co-presenter"}));
          const answerCoAuthors=(saved.data.answers?.additionalSpeakers||[]).map((p:any)=>({name:p.name,email:p.email,role:p.role||"co-presenter"}));
          const merged=storedCoAuthors.length?storedCoAuthors:answerCoAuthors;
          setAnswers({...(saved.data.answers||{}),additionalSpeakers:merged});setResult({id,speakerId:saved.data.speakerId,editToken:token,status:saved.data.status,editing:true,editable:saved.data.editable});setStep(1)}
      })
      .catch((e) => setLoadErr(e.message));
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

  /** Required visible fields still blocking submit. The review step used to disable
   * “Submit proposal” with no explanation when a conditional field became required
   * after the step-1 check, leaving a dead control and no way to tell what was wrong. */
  const blockingRequired = visibleFields.filter(
    (f: any) => f.required && !String(answers[f.key] ?? "").trim(),
  );

  if (!data && !loadErr) return <Spinner />;
  if (!data) return <Notice tone="danger">{loadErr}</Notice>;

  if (result && !result.editing) {
    return (
      <Card className="p-6">
        <Badge tone="ok">Submitted</Badge>
        <h1 className="mt-3 text-3xl font-bold">Proposal received</h1>
        <div className="mt-2">
          <Markdown text={data.form.successMd || ""} />
        </div>
        <p className="mt-4 rounded-2xl bg-canvas p-3 text-sm">
          Routed to <b>{result.boardLabel || result.reviewBoard}</b> review board
          {String(answers.format || "").startsWith("Workshop") ? " · Workshop conditional fields were collected." : ""}.
        </p>
        <p className="mt-3 text-sm"><b>Reference:</b> {result.id}</p>
        <a className="mt-2 block text-sm font-semibold text-ink underline" href={result.editUrl}>View or edit this submission</a>
        {result.portalUrl || result.portalPath ? (
          <div className="mt-4 rounded-2xl border border-line bg-soft p-3 text-sm" data-testid="portal-magic-link">
            <b className="block">Access your speaker portal</b>
            <a className="mt-1 block break-all font-semibold text-ink underline" href={result.portalPath || result.portalUrl}>
              {result.portalUrl || result.portalPath}
            </a>
            <span className="mt-1 block text-xs text-mid">
              Personal access link for {email} — we emailed it to you too. It is a per-speaker access token, not a
              password account; the credential-free demo persona picker also remains available.
            </span>
          </div>
        ) : null}
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
                name: "Jordan Alvarez",
                email: "jordan@ai.engineer",
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

  /** Per-field required checks used by both the Review step and Submit. */
  const validate = () => {
    const errors: Record<string, string> = {};
    for (const f of visibleFields) {
      if (f.required && !String(answers[f.key] ?? "").trim()) errors[f.key] = `${f.label} is required`;
    }
    for (const [i, person] of (answers.additionalSpeakers || []).entries()) {
      if (person.name?.trim() && !/^\S+@\S+\.\S+$/.test(String(person.email || "").trim())) {
        errors[`coauthor-${i}`] = `Co-author ${i + 1} needs a valid email`;
      }
    }
    return errors;
  };

  /** Map a server error message back onto the field it refers to, when possible. */
  const fieldForServerError = (message: string) => {
    const match = visibleFields.find((f: any) => message.toLowerCase().startsWith(String(f.label).toLowerCase()));
    return match?.key;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setErr(`Please fix ${Object.keys(errors).length} field${Object.keys(errors).length === 1 ? "" : "s"} below.`);
      setStep(1);
      toast("Some required fields are missing", "danger");
      return;
    }
    setFieldErrors({});
    try {
      const payload = { ...answers, additionalSpeakers: answers.additionalSpeakers || [] };
      const r = result?.editing ? await api.savePublicSubmission(slug!,result.id,{editToken:result.editToken,answers:payload,status:"submitted"}) : await api.submitCfp(slug!,{ formId: data.form.id, name, email, answers: payload });
      setResult(r.data);
      toast("Proposal submitted");
    } catch (ex: any) {
      // Submit failures keep the filled form on screen with an inline banner + field error.
      const message = ex?.message || "Submission failed";
      setErr(message);
      const key = fieldForServerError(message);
      if (key) {
        setFieldErrors({ [key]: message });
        setStep(1);
      }
      toast(message, "danger");
    }
  };

  const saveDraft = async () => {
    setDraftBusy(true);
    try {
      const draftAnswers={...answers,additionalSpeakers:answers.additionalSpeakers||[]};
      const r=result?.editing ? await api.savePublicSubmission(slug!,result.id,{editToken:result.editToken,answers:draftAnswers,status:"draft"}) : await api.submitCfp(slug!,{formId:data.form.id,name,email,answers:draftAnswers,status:"draft"});
      setResult({...r.data,editing:true,editable:true});setSaved(`Draft saved · reference ${r.data.id}`);toast("Draft saved — use this page link to resume");
      const resumeUrl=r.data.editUrl||`?submission=${r.data.id}&token=${r.data.editToken}`;
      setDraftState({status:"saved",id:r.data.id,at:new Date().toLocaleTimeString(),resumeUrl});
      history.replaceState(null,"",resumeUrl);
    } catch(ex:any){setErr(ex.message);setDraftState({status:"error",error:ex?.message||"Could not save the draft."})}
    finally{setDraftBusy(false)}
  };

  return (
    <div>
      <div className="mb-4 rounded-3xl border border-line bg-canvas px-4 py-3 text-sm text-ink">
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
            className={`rounded-full px-3 py-1 ${i === step ? "bg-brand-600 text-white" : "bg-canvas text-mid"}`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {err ? (
        <Notice tone="danger">
          <span className="block font-semibold">{err}</span>
          {Object.keys(fieldErrors).length ? (
            <ul className="mt-1 list-disc pl-5 text-sm" data-testid="cfp-error-summary">
              {Object.entries(fieldErrors).map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          ) : null}
          <span className="mt-1 block text-xs">Your answers are still here — correct the highlighted fields and submit again.</span>
        </Notice>
      ) : null}
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
              <div className="mb-4 rounded-2xl border border-line bg-paper p-4"><div className="flex items-center justify-between"><b>Co-authors / co-presenters</b><Button type="button" size="sm" variant="outline" onClick={()=>setAnswers(a=>({...a,additionalSpeakers:[...(a.additionalSpeakers||[]),{name:"",email:"",role:"co-presenter"}]}))}>Add person</Button></div>
                {(answers.additionalSpeakers||[]).map((person:any,i:number)=><div key={i} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_150px_auto]"><Input aria-label={`Additional speaker ${i+1} name`} placeholder="Name" value={person.name} onChange={e=>setAnswers(a=>({...a,additionalSpeakers:a.additionalSpeakers.map((x:any,n:number)=>n===i?{...x,name:e.target.value}:x)}))}/><Input aria-label={`Additional speaker ${i+1} email`} type="email" placeholder="Email" value={person.email} onChange={e=>setAnswers(a=>({...a,additionalSpeakers:a.additionalSpeakers.map((x:any,n:number)=>n===i?{...x,email:e.target.value}:x)}))}/><Select aria-label={`Additional speaker ${i+1} role`} value={person.role||"co-presenter"} onChange={e=>setAnswers(a=>({...a,additionalSpeakers:a.additionalSpeakers.map((x:any,n:number)=>n===i?{...x,role:e.target.value}:x)}))}><option value="co-presenter">Co-presenter</option><option value="co-author">Co-author</option></Select><Button type="button" variant="outline" onClick={()=>setAnswers(a=>({...a,additionalSpeakers:a.additionalSpeakers.filter((_:any,n:number)=>n!==i)}))}>Remove</Button></div>)}
                {Object.entries(fieldErrors)
                  .filter(([k]) => k.startsWith("coauthor-"))
                  .map(([k, message]) => (
                    <p key={k} className="mt-2 text-sm font-semibold text-red-700" role="alert" data-field-error={k}>
                      {message}
                    </p>
                  ))}
              </div>
              <Button type="button" onClick={() => setStep(1)} disabled={!name || !email}>
                Continue
              </Button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              {visibleFields.map((f: any,idx:number) => (<div key={f.key} className={fieldErrors[f.key]?"rounded-2xl border border-rose-300 bg-rose-50 p-3":""}>{f.section && visibleFields[idx-1]?.section!==f.section?<h2 className="mb-3 mt-5 border-b pb-2 text-lg font-bold">{f.section}</h2>:null}
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
                </Field>
                {fieldErrors[f.key] ? (
                  <p className="-mt-2 mb-3 text-sm font-semibold text-red-700" role="alert" data-field-error={f.key}>
                    {fieldErrors[f.key]}
                  </p>
                ) : null}
                </div>
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
                    const errors = validate();
                    if (Object.keys(errors).length) {
                      setFieldErrors(errors);
                      setErr(`Complete required fields before review: ${Object.values(errors).join(", ")}`);
                      toast(`Missing: ${Object.values(errors).join(", ")}`, "danger");
                      return;
                    }
                    setFieldErrors({});
                    setErr("");
                    setStep(2);
                  }}
                >
                  Review
                </Button>
                <Button type="button" variant="secondary" data-testid="save-draft" disabled={draftBusy||!name||!email||!answers.title||result?.editable===false} onClick={saveDraft}>{draftBusy?"Saving draft…":"Save as draft"}</Button>
              </div>
              {/* The confirmation must sit AT the button: a top-of-form notice and a
                  toast are both invisible from this scroll position. */}
              {draftState?<div className="mt-3 rounded-2xl border border-line bg-soft p-3 text-sm" data-testid="draft-saved-inline" role="status" aria-live="polite">
                {draftState.status==="error"
                  ? <span className="text-rose-600" data-testid="draft-save-error">{draftState.error}</span>
                  : <>
                      <span className="block font-semibold">Draft saved at {draftState.at} · reference {draftState.id}</span>
                      <span className="block text-xs text-mid">Not submitted yet — reviewers cannot see it. Use “Review” then Submit when you are ready.</span>
                      <a className="mt-1 inline-block text-xs font-semibold text-ink underline" data-testid="draft-resume-link" href={draftState.resumeUrl}>Copy or bookmark this resume link ↗</a>
                    </>}
              </div>:null}
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
                {(answers.additionalSpeakers||[]).map((person:any,i:number)=><div key={i}><dt className="text-xs text-mid">{person.role==="co-author"?"Co-author":"Co-presenter"}</dt><dd className="font-semibold">{person.name} · {person.email}</dd></div>)}
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
              {blockingRequired.length ? (
                <Notice tone="warn">
                  <span className="block font-semibold">
                    Submit is blocked by {blockingRequired.length} required field
                    {blockingRequired.length === 1 ? "" : "s"}.
                  </span>
                  <ul className="mt-1 list-disc pl-5 text-sm" data-testid="cfp-review-blocking-fields">
                    {blockingRequired.map((f: any) => (
                      <li key={f.key}>{f.label} is required</li>
                    ))}
                  </ul>
                  <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setStep(1)}>
                    Back to the form
                  </Button>
                </Notice>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit" disabled={result?.editable === false || blockingRequired.length > 0}>
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
            className="flex items-center justify-between rounded-3xl border border-line bg-white p-4 hover:border-brand-200"
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
  /** Inline, screenshot-visible evidence of the advisory draft (never toast-only). */
  const [aiDraft, setAiDraft] = useState<
    | { status: "loading" }
    | { status: "ready"; entries: { label: string; value: number }[]; notes: string; at: string }
    | { status: "error"; error: string }
    | null
  >(null);
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Scorecard</h2><p className="text-xs text-mid">AI drafts are heuristic, advisory, and never submit or decide.</p></div><Button variant="secondary" data-testid="ai-draft-button" disabled={aiBusy} onClick={async()=>{setAiBusy(true);setAiDraft({status:"loading"});try{const r:any=await api.aiAssist(data.review?.id || data.assignment.id);setResponses(x=>({...x,...(r.data.scores||{}),comments:r.data.notes||x.comments||""}));setAiDraft({status:"ready",entries:Object.entries(r.data.scores||{}).filter(([,v])=>typeof v==="number").map(([k,v])=>({label:k,value:Number(v)})),notes:String(r.data.notes||r.data.aiDraft||""),at:new Date().toLocaleTimeString()});setNotice("AI advisory draft applied. Review and edit every value before submitting.")}catch(e:any){setAiDraft({status:"error",error:e?.message||"AI draft failed"});setErr(e.message)}finally{setAiBusy(false)}}}>{aiBusy?"Drafting AI review…":"AI draft review"}</Button></div>
          {aiDraft?<div className="mb-4 rounded-2xl border border-line bg-soft p-3 text-sm" data-testid="ai-draft-panel" role="status" aria-live="polite">
            {aiDraft.status==="loading"?<span data-testid="ai-draft-loading">Drafting AI review… scoring this abstract now.</span>:aiDraft.status==="error"?<span className="text-rose-600" data-testid="ai-draft-error">{aiDraft.error}</span>:<>
              <div className="flex flex-wrap items-center gap-2"><Badge tone="ai">AI advisory draft</Badge><span className="text-xs text-mid">generated {aiDraft.at} · advisory only — you remain responsible for the score</span></div>
              <ul className="mt-2 flex flex-wrap gap-3" data-testid="ai-draft-scores">{aiDraft.entries.map(e=><li key={e.label} className="rounded-xl bg-paper px-2 py-1"><b className="capitalize">{e.label}</b> <span className="font-mono">{e.value}</span></li>)}</ul>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft" data-testid="ai-draft-rationale">{aiDraft.notes}</p>
            </>}
          </div>:null}
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
              className="mt-4 rounded-2xl border border-line bg-canvas p-4"
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
