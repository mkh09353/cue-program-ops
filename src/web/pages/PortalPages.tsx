import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getActiveEvent, api, getPersona, subscribeData } from "../lib/api";
import { calendarLinks, fmtTime, fmtTzLabel, isProfessionalEmbed, taskTypeLabel } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Spinner,
  StatusBadge,
  Textarea,
  toast,
} from "../components/ui";

/**
 * Organizer-linked sessions carry the CANONICAL title the organizer edits. Until the
 * organizer names a manually created record it stays a placeholder, which we say plainly
 * instead of showing "<name> (manual)".
 */
export function sessionDisplayTitle(session: { title?: string; placeholderTitle?: boolean }) {
  return session?.placeholderTitle ? "Session title to be confirmed" : session?.title || "Untitled session";
}

/** Time/room line for a linked session, in the event timezone (never a literal "UTC"). */
export function sessionPlacementLine(session: { slot?: { startsAt: string; endsAt?: string }; roomName?: string }) {
  if (!session?.slot?.startsAt) return "Awaiting schedule placement";
  const time = session.slot.endsAt
    ? `${fmtTime(session.slot.startsAt)}–${fmtTime(session.slot.endsAt)}`
    : fmtTime(session.slot.startsAt);
  return `${time} ${fmtTzLabel()}${session.roomName ? ` · ${session.roomName}` : ""}`;
}

/** Full, deterministic timestamp used by both sides of content file threads. */
export function fileThreadStamp(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso || "unknown time") : d.toISOString().replace("T", " ").replace("Z", " UTC");
}

export function fileCommentRole(comment: { authorRole?: string }) {
  return comment.authorRole === "Organizer" ? "Organizer" : "Speaker";
}

function deliverableForTask(task: any, deliverables: any[]) {
  const wanted = task.type === "headshot" ? ["image/png", "image/jpeg"] : task.type === "slides" ? ["application/pdf"] : [];
  return deliverables.find((d: any) => wanted.length
    ? (d.acceptedTypes || []).some((type: string) => wanted.includes(type))
    : task.type === "supporting_doc" && (d.acceptedTypes || []).some((type: string) => !type.startsWith("image/")));
}

function useSpeakerHome() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const load = () =>
    api
      .speakerHome()
      .then((r) => setData(r.data))
      .catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    return subscribeData(load);
  }, []);
  return { data, err, load, setErr };
}

export function PortalHomePage() {
  const { data, err } = useSpeakerHome();
  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;

  const open = data.tasks.filter((t: any) => t.status !== "completed");
  const next = open[0];
  const scheduled = data.sessions?.find((s: any) => s.slot);
  const linkedDrafts = (data.sessions || []).filter((s: any) => !s.slot);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${data.profile?.name?.split(" ")[0] || "speaker"}`}
        description="Your greenroom — tasks, talks, and resources in one place."
      />
      <Card className="mb-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-mid">Onboarding</div>
            <div className="mt-1 text-3xl font-bold">{data.readiness.pct}%</div>
          </div>
          <StatusBadge status={data.readiness.state} />
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas" aria-hidden>
          <div className="h-full bg-brand-600" style={{ width: `${data.readiness.pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-mid">
          {data.readiness.completedRequiredTaskCount}/{data.readiness.requiredTaskCount} required tasks complete
        </p>
      </Card>

      {next ? (
        <Card className="mb-4 border-line p-5">
          <div className="text-xs font-bold uppercase tracking-wide text-ink">Up next</div>
          <h2 className="mt-1 text-xl font-bold">{next.title}</h2>
          <p className="mt-1 text-xs text-mid">{taskTypeLabel(next.type)}</p>
          {/* Say up-front what will close this task, so the later flip to Done is expected. */}
          {DERIVED_TASK_TYPES.has(next.type) ? (
            <p className="mt-1 text-[11px] text-mid" data-testid="next-task-derived-todo">
              {derivedTodoCopy(next.type)}
            </p>
          ) : null}
          {next.type === "form" ? <Badge tone="muted">Form to complete</Badge> : null}
          <Button asChild className="mt-3">
            <Link to={`/p/tasks/${next.id}`}>Continue task</Link>
          </Button>
        </Card>
      ) : (
        <Notice tone="ok">All required tasks complete. You’re clear.</Notice>
      )}

      {scheduled?.slot ? (
        <Card className="mb-4 p-5">
          <h3 className="text-sm font-bold">Your session</h3>
          <p className="mt-1 text-lg font-semibold">{sessionDisplayTitle(scheduled)}</p>
          <p className="text-sm text-mid">{sessionPlacementLine(scheduled)}</p>
          <CalendarButtons
            title={sessionDisplayTitle(scheduled)}
            startsAt={scheduled.slot.startsAt}
            endsAt={scheduled.slot.endsAt}
            sessionId={scheduled.id}
          />
        </Card>
      ) : null}

      {linkedDrafts.length ? (
        <Card className="mb-4 p-5">
          <h3 className="text-sm font-bold">Your linked session{linkedDrafts.length === 1 ? "" : "s"}</h3>
          {linkedDrafts.map((session: any) => (
            <div key={session.id} className="mt-2 border-t border-line pt-2 first:border-0 first:pt-0">
              <p className="font-semibold">{sessionDisplayTitle(session)}</p>
              <p className="text-xs text-mid">Draft · {sessionPlacementLine(session)}</p>
            </div>
          ))}
        </Card>
      ) : null}

      {data.communications?.[0] ? (
        <Card className="p-5">
          <h3 className="text-sm font-bold">Latest message</h3>
          <p className="mt-1 font-semibold">{data.communications[0].subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-mid">{data.communications[0].body}</p>
          <a
            className="mt-3 inline-block text-sm font-semibold text-ink"
            href={`/api/communications/${data.communications[0].id}/calendar.ics`}
          >
            Download calendar invite (ICS)
          </a>
        </Card>
      ) : null}
    </div>
  );
}

function CalendarButtons({
  title,
  startsAt,
  endsAt,
  sessionId,
}: {
  title: string;
  startsAt: string;
  endsAt: string;
  sessionId: string;
}) {
  const links = calendarLinks(title, startsAt, endsAt);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button asChild size="sm" variant="secondary">
        <a href={links.google} target="_blank" rel="noreferrer">
          Google Calendar
        </a>
      </Button>
      <Button asChild size="sm" variant="secondary">
        <a href={links.outlook} target="_blank" rel="noreferrer">
          Outlook
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`/api/calendar/${sessionId}.ics`}>Download ICS</a>
      </Button>
    </div>
  );
}

export function PortalTalksPage() {
  const { data, err } = useSpeakerHome();
  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  return (
    <div>
      <PageHeader
        title="My submissions"
        description="Proposal status and schedule placement."
        actions={
          data.cfpOpen === false ? (
            <Button disabled variant="secondary" title={data.cfpClosedReason || "CFP is closed"}>
              CFP closed
            </Button>
          ) : (
            <Button asChild>
              <a href={`/e/${getActiveEvent().slug}/cfp`}>Start another proposal</a>
            </Button>
          )
        }
      />
      <div className="space-y-3">
        {(data.sessions || []).map((session: any) => (
          <Card key={`session-${session.canonicalId || session.id}`} className="p-4" data-testid={`linked-session-${session.canonicalId || session.id}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{sessionDisplayTitle(session)}</h3>
              <StatusBadge status={session.slot ? "scheduled" : session.status || "draft"} />
            </div>
            <p className="mt-1 text-sm text-mid">Organizer-linked session · {sessionPlacementLine(session)}</p>
            {session.placeholderTitle ? (
              <p className="mt-1 text-xs text-mid">Your organizer has not published a title for this session yet.</p>
            ) : null}
          </Card>
        ))}
        {/* A proposal that already has a linked session is shown once, as the session. */}
        {data.submissions
          .filter((s: any) => !(data.sessions || []).some((session: any) => session.submissionId === s.id))
          .map((s: any) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{s.title}</h3>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-1 text-sm text-mid">
              {s.category} · {s.format} · board {s.reviewBoard}
            </p>
            {s.decisionFeedback ? (
              <div className="mt-3 rounded-2xl border border-line bg-soft p-3 text-sm" data-testid={`decision-feedback-${s.id}`}>
                <b className="block">Committee feedback:</b>
                <span className="whitespace-pre-wrap text-ink-soft">{s.decisionFeedback}</span>
              </div>
            ) : null}
            {s.editToken ? <Button asChild size="sm" variant="outline" className="mt-3"><a href={`/e/${getActiveEvent().slug}/cfp?submission=${s.id}&token=${s.editToken}`}>{s.status === "draft" ? "Resume draft" : "View or edit submission"}</a></Button> : null}
          </Card>
        ))}
        {!data.submissions.length && !data.sessions?.length ? (
          <EmptyState title="No talks yet" description="Submissions and organizer-linked sessions appear here." />
        ) : null}
      </div>
    </div>
  );
}


/** Tasks whose completion is DERIVED from saving something else. */
const DERIVED_TASK_TYPES = new Set(["profile", "headshot", "slides", "supporting_doc", "form"]);
export const derivedCompletionCopy = (typeOrTask: string | { type?: string; completedVia?: string }) => {
  const via = typeof typeOrTask === "object" ? typeOrTask.completedVia : undefined;
  const type = typeof typeOrTask === "object" ? String(typeOrTask.type || "") : typeOrTask;
  if (via === "manual") return "Completed manually";
  if (via === "profile_save") return "Completed automatically when you saved your profile";
  if (via === "headshot_upload" || via === "file_upload") return "Completed automatically when you uploaded the file";
  return type === "profile"
    ? "Completed automatically when you saved your profile"
    : type === "form"
      ? "Completed automatically when you submitted the form"
      : "Completed automatically when you uploaded the file";
};
export const derivedTodoCopy = (type: string) =>
  type === "profile"
    ? "Complete your profile below"
    : type === "form"
      ? "Fill in the form below"
      : "Upload the file below";

export function PortalTasksPage() {
  const { data, err } = useSpeakerHome();
  const nav = useNavigate();
  const [deliverables,setDeliverables]=useState<any[]|null>(null);
  useEffect(()=>{api.deliverables().then(r=>setDeliverables(r.data||[])).catch(()=>setDeliverables([]))},[getPersona().id]);
  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  if(!deliverables)return <Spinner/>;
  const linkedIds=new Set(data.tasks.map((task:any)=>deliverableForTask(task,deliverables)?.id).filter(Boolean));
  return (
    <div>
      <PageHeader title="Tasks" />
      <div className="space-y-2">
        {data.tasks.map((t: any) => {const linked=deliverableForTask(t,deliverables);const effectiveStatus=linked?(linked.status==="complete"?"completed":"pending"):t.status;return (
          <Link
            key={t.id}
            to={`/p/tasks/${t.id}`}
            className="flex items-center justify-between rounded-3xl border border-line bg-white p-4 hover:border-brand-200"
          >
            <div>
              <div className="font-semibold">{t.title}</div>
              <div className="text-xs text-mid">
                {taskTypeLabel(t.type)}
                {t.dueAt ? ` · due ${String(t.dueAt).slice(0, 10)}` : ""}
              </div>
              {t.type === "form" ? <Badge tone="muted">Form to complete</Badge> : null}
              {effectiveStatus === "completed" && DERIVED_TASK_TYPES.has(t.type) ? (
                <div className="mt-1 text-[11px] text-mid" data-testid={`task-derived-note-${t.id}`}>
                  {derivedCompletionCopy(t)}
                </div>
              ) : null}
            </div>
            <span className="flex items-center gap-2">
              {effectiveStatus === "completed" ? (
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label={`${t.title} is complete`}
                  data-testid={`task-complete-check-${t.id}`}
                />
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`task-mark-complete-${t.id}`}
                  aria-label={`Mark ${t.title} complete`}
                  onClick={async (e: any) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Derived tasks cannot be ticked off directly: send the speaker
                    // to the thing that completes them.
                    if (DERIVED_TASK_TYPES.has(t.type)) {
                      toast(derivedTodoCopy(t.type));
                      nav(`/p/tasks/${t.id}`);
                      return;
                    }
                    try {
                      await api.completeTask(t.id);
                      toast("Task completed");
                    } catch (err: any) {
                      toast(err?.message || "Could not complete the task", "danger");
                    }
                  }}
                >
                  Mark complete
                </Button>
              )}
              <StatusBadge status={effectiveStatus} />
            </span>
          </Link>
        )})}
        {deliverables.filter((d:any)=>!linkedIds.has(d.id)).map((d:any)=><Link key={d.id} to={`/p/deliverables/${d.id}`} data-testid={`portal-deliverable-task-${d.id}`} className="flex items-center justify-between rounded-3xl border border-line bg-white p-4 hover:border-brand-200"><div><div className="font-semibold">{d.name}</div><div className="text-xs text-mid">Organizer file request · due {String(d.dueAt).slice(0,10)} · {d.uploadCount} version{d.uploadCount===1?"":"s"}</div></div><StatusBadge status={d.overdue?"overdue":d.status}/></Link>)}
        {!data.tasks.length&&!deliverables.length ? (
          <EmptyState title="No tasks" description="Accepted speakers receive onboarding tasks here." />
        ) : null}
      </div>
    </div>
  );
}

export function PortalDeliverablesPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const persona = getPersona();
  const load = () =>
    api
      .deliverables()
      .then((r) => setRows(r.data))
      .catch((e) => setErr(e.message));
  // Keyed on the persona id so an explicit persona switch refetches this page.
  useEffect(() => {
    setRows(null);
    setErr("");
    void load();
    return subscribeData(load);
  }, [persona.id]);
  if (err) return <Notice tone="danger">{err}</Notice>;
  if (!rows) return <Spinner />;
  return (
    <div>
      <PageHeader
        title="Deliverables"
        description={`Session files, deadlines, versions, and approval state for ${persona.name}.`}
      />
      <div className="space-y-2">
        {rows.map((t) => (
          <Link
            key={t.id}
            to={`/p/deliverables/${t.id}`}
            className="flex justify-between rounded-3xl border border-line bg-white p-4 hover:border-brand-200"
          >
            <div>
              <b>{t.name}</b>
              <p className="text-xs text-mid">
                {t.session?.title || "General"} · Due {t.dueAt.slice(0, 10)} · {t.uploadCount} version(s) ·{" "}
                {(t.acceptedTypes || []).join(", ") || "any file type"} · max 2 MB
              </p>
            </div>
            <StatusBadge status={t.overdue ? "overdue" : t.status} />
          </Link>
        ))}
      </div>
      {!rows.length ? (
        <EmptyState
          title={`No deliverables assigned to ${persona.name} yet`}
          description="File requests (slides, print headshots, supporting documents) appear here as soon as an organizer assigns them to you in Content → Deliverables. Onboarding steps live under Tasks."
          action={
            <Button asChild variant="secondary">
              <Link to="/p/tasks">Go to my tasks</Link>
            </Button>
          }
        />
      ) : null}
      <p className="mt-4 text-xs text-mid">
        Viewing as <b>{persona.name}</b> ({persona.email}). Deliverables are scoped to the signed-in speaker — use the
        persona selector in the header to view another speaker's portal.
      </p>
    </div>
  );
}

export function PortalDeliverableDetailPage() {
  const {id}=useParams();const[data,setData]=useState<any>(null),[err,setErr]=useState(""),[comment,setComment]=useState("");
  const [postedComment,setPostedComment]=useState<any>(null);
  const persona=getPersona();
  // Re-selecting the SAME file must fire another change event, so the file input is
  // remounted (and its value cleared) after every upload.
  const [uploadNonce,setUploadNonce]=useState(0);
  const [uploadBusy,setUploadBusy]=useState(false);
  const [uploadResult,setUploadResult]=useState("");
  const load=()=>api.deliverable(id!).then(r=>setData(r.data)).catch(e=>setErr(e.message));useEffect(()=>{setData(null);setErr("");void load()},[id,persona.id]);
  const upload=async(file:File)=>{
    setUploadBusy(true);setUploadResult("");
    try{
      const dataBase64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=reject;r.readAsDataURL(file)});
      const made:any=await api.uploadDeliverable(id!,{name:file.name,mime:file.type,size:file.size,dataBase64,kind:file.type.startsWith("image/")?"headshot":file.type==="application/pdf"?"slides":"document"});
      const version=made?.data?.version?.version;
      setUploadResult(version?`Uploaded ${file.name} as version ${version}.`:`Uploaded ${file.name}.`);
      toast(version&&version>1?`New version v${version} saved`:"Upload saved as a new version");
      await load();
    }catch(e:any){
      setUploadResult("");
      toast(e?.message||"Upload failed","danger");
      setErr("");
    }finally{
      setUploadBusy(false);
      // Remount the input so the same file can be chosen again for v2, v3, …
      setUploadNonce(n=>n+1);
    }
  };
  if(!data&&!err)return <Spinner/>;
  if(err)return <PersonaScopeNotice what="deliverable" error={err} backTo="/p/deliverables" backLabel="All my deliverables"/>;
  const file=data.file;
  return <div><PageHeader title={data.name} description={`${data.session?.title||"Speaker deliverable"} · Due ${data.dueAt.slice(0,10)}`}/><Card className="p-5"><StatusBadge status={data.overdue?"overdue":data.status}/><p className="mt-3 text-sm">{data.instructions}</p><div className="mt-4 rounded-2xl border border-dashed p-4"><b>Upload file</b><p className="mb-2 text-xs text-mid">Accepted: {data.acceptedTypes.join(", ")} · Maximum 2 MB. Re-uploading creates a new version.</p><Input key={`deliverable-upload-${uploadNonce}`} type="file" aria-label="Choose a file to upload" disabled={uploadBusy} accept={data.acceptedTypes.join(",")} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void upload(f)}}/>{uploadBusy?<p className="mt-2 text-xs font-semibold text-ink">Uploading…</p>:null}{uploadResult?<Notice tone="ok" onClose={()=>setUploadResult("")}><span data-testid="upload-result">{uploadResult}</span></Notice>:null}</div>{file?<div className="mt-5"><h2 className="font-bold">{file.versions.find((v:any)=>v.current)?.name}</h2><p className="text-sm text-mid">Approval: {file.status} · <span data-testid="version-count">{file.versions.length}</span> version{file.versions.length===1?"":"s"}</p>{[...file.versions].reverse().map((v:any)=><div key={v.id} className="mt-2 flex justify-between rounded-lg bg-soft p-2 text-sm"><span>v{v.version} · {new Date(v.uploadedAt).toLocaleString()}</span><span>{v.current?<Badge tone="ok">Current</Badge>:null} <a className="text-ink underline" href={`/api/content/files/${file.id}/versions/${v.id}`}>View</a></span></div>)}<h3 className="mt-4 text-xs font-bold uppercase text-mid">Comments</h3>{file.comments.map((c:any)=><p key={c.id} className="mt-2 rounded-lg bg-soft p-2 text-sm"><Badge tone={fileCommentRole(c)==="Organizer"?"ok":"muted"}>{fileCommentRole(c)}</Badge>{" "}<b>{c.authorName}</b> · <span className="font-mono text-xs">{fileThreadStamp(c.createdAt)}</span><br/>{c.body}</p>)}<div className="mt-2 flex gap-2"><Input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a comment"/><Button onClick={async()=>{await api.addFileComment(file.id,comment);setComment("");load()}}>Comment</Button></div></div>:null}</Card></div>;
}

const FILE_TYPES = new Set(["headshot", "slides", "supporting_doc"]);

/** Accepted types + size limits shown next to every portal file input (server enforces the same). */
const UPLOAD_HINTS: Record<string, { types: string; accept: string; extra?: string }> = {
  headshot: {
    types: "PNG or JPEG image",
    accept: "image/png,image/jpeg",
    extra: "square crop, 1000px+ recommended for print",
  },
  slides: { types: "PDF", accept: "application/pdf", extra: "16:9 aspect ratio" },
  supporting_doc: { types: "PDF or plain text", accept: "application/pdf,text/plain" },
};

/**
 * Portal records are scoped to the signed-in speaker. When a URL belongs to another
 * speaker we must not leak their data — but we also must not dead-end the user with
 * a bare "not found", so explain the persona scope and offer the way out.
 */
function PersonaScopeNotice({
  what,
  error,
  backTo,
  backLabel,
}: {
  what: string;
  error: string;
  backTo: string;
  backLabel: string;
}) {
  const persona = getPersona();
  return (
    <Card className="p-5">
      <Notice tone="warn">{error}</Notice>
      <p className="mt-3 text-sm text-mid">
        You are viewing the speaker portal as <b className="text-ink">{persona.name}</b> ({persona.email}). This {what}{" "}
        either does not exist or belongs to a different speaker — portal data is always scoped to the speaker you are
        signed in as.
      </p>
      <p className="mt-2 text-sm text-mid">
        If this {what} belongs to someone else, switch persona with the <b className="text-ink">Demo as</b> selector in
        the header, then open the link again.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link to={backTo}>{backLabel}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/p">Portal home</Link>
        </Button>
      </div>
    </Card>
  );
}

export function PortalTaskDetailPage() {
  const { id } = useParams();
  const { data, err, load } = useSpeakerHome();
  const [detailTask, setDetailTask] = useState<any>(null);
  const [detailErr, setDetailErr] = useState("");
  const [fileName, setFileName] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [formAnswers, setFormAnswers] = useState<Record<string, string>>({});
  const [headshotFile, setHeadshotFile] = useState<File | null>(null);
  /** Canonical deliverable slot backing this file task (versions, comments live there). */
  const [deliverables, setDeliverables] = useState<any[]>([]);
  const [linkedFile, setLinkedFile] = useState<any>(null);
  const [taskComment, setTaskComment] = useState("");
  const [postedComment, setPostedComment] = useState<any>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  /** Bumped after each upload so re-choosing the SAME file fires a fresh change event. */
  const [taskUploadNonce, setTaskUploadNonce] = useState(0);

  const loadDeliverables = () =>
    api
      .deliverables()
      .then((r) => setDeliverables(r.data || []))
      .catch(() => setDeliverables([]));

  useEffect(() => {
    void loadDeliverables();
    return subscribeData(loadDeliverables);
  }, []);

  useEffect(() => {
    if (!id) return;
    setDetailTask(null);
    setDetailErr("");
    api.speakerTask(id).then((r) => setDetailTask(r.data.task)).catch((e) => setDetailErr(e.message));
  }, [id, data]);

  // Pull versions + comments for the deliverable backing this task.
  const linkedId = (() => {
    const t = data?.tasks?.find((x: any) => x.id === id);
    if (!t) return "";
    const match = deliverableForTask(t, deliverables);
    return match?.id || "";
  })();

  useEffect(() => {
    if (!linkedId) {
      setLinkedFile(null);
      return;
    }
    api
      .deliverable(linkedId)
      .then((r) => setLinkedFile(r.data?.file || null))
      .catch(() => setLinkedFile(null));
  }, [linkedId, deliverables]);

  /** Guards the two editable blocks on this page (profile fields and the logistics
   * form answers) against the refetch that every bumpData() triggers: uploading a
   * file or posting a comment on this very page used to wipe whatever was typed. */
  const [dirty, setDirty] = useState(false);
  const editedTaskRef = useRef(id);
  const patchProfile = (patch: any) => {
    setDirty(true);
    setProfile((prev: any) => ({ ...prev, ...patch }));
  };
  const patchAnswers = (patch: Record<string, string>) => {
    setDirty(true);
    setFormAnswers((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    if (!data) return;
    // Route switch = different record: always adopt, and drop the guard.
    if (editedTaskRef.current !== id) {
      editedTaskRef.current = id;
      setDirty(false);
    } else if (dirty) return;
    if (data.profile) setProfile({ ...data.profile });
    const task = data.tasks?.find((t: any) => t.id === id);
    if (task?.formAnswers) setFormAnswers({ ...task.formAnswers });
    else if (task?.formSchema) setFormAnswers(Object.fromEntries(task.formSchema.map((f: any) => [f.key, ""])));
  }, [data, id, dirty]);

  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  const task = detailTask || data.tasks.find((t: any) => t.id === id);
  if (!task)
    return (
      <PersonaScopeNotice
        what="task"
        error={detailErr || "Task not found for the speaker you are viewing as."}
        backTo="/p/tasks"
        backLabel="All my tasks"
      />
    );

  const kindMap: Record<string, "headshot" | "slides" | "supporting_document"> = {
    headshot: "headshot",
    slides: "slides",
    supporting_doc: "supporting_document",
  };

  const isFile = FILE_TYPES.has(task.type);
  // Match this onboarding task to the canonical deliverable slot of the same kind so
  // uploads, versions and comments all live on ONE record.
  const linkedDeliverable = deliverableForTask(task, deliverables) || null;
  const effectiveTaskStatus = linkedDeliverable ? (linkedDeliverable.status === "complete" ? "completed" : "pending") : task.status;
  const formSchema =
    task.formSchema ||
    (task.type === "form"
      ? [
          { key: "shirt_size", label: "T-shirt size", type: "select", required: true, options: ["S", "M", "L", "XL"] },
          { key: "arrival_date", label: "Arrival date", type: "text", required: true },
          { key: "notes", label: "Notes", type: "textarea", required: false },
        ]
      : []);

  return (
    <div>
      <PageHeader
        title={task.title}
        description={`${taskTypeLabel(task.type)}${task.dueAt ? ` · due ${String(task.dueAt).slice(0, 10)}` : ""}`}
      />
      <Card className="p-5">
        {task.description || task.instructions ? (
          <p className="mb-4 text-sm text-mid">{task.description || task.instructions}</p>
        ) : null}

        {task.type === "profile" && profile ? (
          <>
            <Field label="Name">
              <Input value={profile.name || ""} onChange={(e) => patchProfile({ name: e.target.value })} />
            </Field>
            <Field label="Title">
              <Input value={profile.title || ""} onChange={(e) => patchProfile({ title: e.target.value })} />
            </Field>
            <Field label="Company">
              <Input value={profile.company || ""} onChange={(e) => patchProfile({ company: e.target.value })} />
            </Field>
            <Field label="Bio" hint="Save with 20+ characters to auto-complete this task.">
              <Textarea rows={5} value={profile.bio || ""} onChange={(e) => patchProfile({ bio: e.target.value })} />
            </Field>
            <Field label="LinkedIn">
              <Input value={profile.linkedin || ""} onChange={(e) => patchProfile({ linkedin: e.target.value })} />
            </Field>
            <Field label="X / Twitter">
              <Input value={profile.x || ""} onChange={(e) => patchProfile({ x: e.target.value })} />
            </Field>
            <Field label="Website">
              <Input value={profile.website || ""} onChange={(e) => patchProfile({ website: e.target.value })} />
            </Field>
            <Field label="Travel preference">
              <Input
                value={profile.travelPreference || ""}
                onChange={(e) => patchProfile({ travelPreference: e.target.value })}
              />
            </Field>
            <Button
              onClick={async () => {
                await api.saveProfile(profile);
                // Refresh first, then drop the guard, so the re-seed uses saved state.
                await load();
                setDirty(false);
                toast("Profile saved");
              }}
            >
              {dirty ? "Save profile *" : "Save profile"}
            </Button>
          </>
        ) : null}

        {task.type === "form" ? (
          <>
            <p className="mb-3 text-sm text-mid">Complete this logistics form. Answers are saved on your speaker record.</p>
            {formSchema.map((f: any) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                {f.type === "textarea" ? (
                  <Textarea
                    rows={3}
                    value={formAnswers[f.key] || ""}
                    onChange={(e) => patchAnswers({ [f.key]: e.target.value })}
                    disabled={task.status === "completed"}
                  />
                ) : f.type === "select" ? (
                  <select
                    className="h-10 w-full rounded-full bg-white px-3 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                    value={formAnswers[f.key] || ""}
                    disabled={task.status === "completed"}
                    onChange={(e) => patchAnswers({ [f.key]: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {(f.options || []).map((o: string) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={formAnswers[f.key] || ""}
                    disabled={task.status === "completed"}
                    onChange={(e) => patchAnswers({ [f.key]: e.target.value })}
                  />
                )}
              </Field>
            ))}
            {task.status !== "completed" ? (
              <Button
                onClick={async () => {
                  try {
                    await api.submitTaskForm(task.id, formAnswers);
                    await load();
                    setDirty(false);
                    toast("Form submitted");
                  } catch (e: any) {
                    toast(e.message || "Form failed", "danger");
                  }
                }}
              >
                {dirty ? "Submit form *" : "Submit form"}
              </Button>
            ) : (
              <div className="rounded-2xl border border-line bg-soft p-3">
                <p className="text-sm font-semibold text-ink">Form submitted.</p>
                <p className="mt-1 text-xs text-mid">
                  Answered too soon? Reopen the task to edit and submit it again.
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  data-testid="reopen-task"
                  aria-label={`Reopen ${task.title}`}
                  onClick={async () => {
                    try {
                      await api.reopenTask(task.id);
                      await load();
                      setDirty(false);
                      toast("Task reopened — you can edit and resubmit it");
                    } catch (e: any) {
                      toast(e.message || "Could not reopen the task", "danger");
                    }
                  }}
                >
                  Reopen task
                </Button>
              </div>
            )}
          </>
        ) : null}

        {isFile ? (
          <>
            {task.type === "headshot" ? (
              <p className="mb-3 text-sm text-mid">
                Upload a well-lit headshot (PNG/JPEG). Image data is stored on your profile and synced to the organizer
                roster and public gallery when published.
              </p>
            ) : (
              <p className="mb-3 text-sm text-mid">
                Demo file receipt stores filename metadata on your speaker record. Prefer Deliverables for versioned
                content files.
              </p>
            )}
            <Field label="File name">
              <Input
                placeholder={task.type === "headshot" ? "headshot.jpg" : "slides.pdf"}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
              />
            </Field>
            <div className="mb-2 rounded-2xl border border-dashed border-line bg-soft p-3 text-xs text-mid">
              <b className="text-ink">Upload requirements</b>
              <br />
              Accepted file types: <b className="text-ink">{UPLOAD_HINTS[task.type]?.types || "PDF, PNG, JPEG"}</b> ·
              Maximum size: <b className="text-ink">2 MB</b>
              {UPLOAD_HINTS[task.type]?.extra ? <> · {UPLOAD_HINTS[task.type].extra}</> : null}
            </div>
            <input
              key={`task-upload-${taskUploadNonce}`}
              type="file"
              accept={UPLOAD_HINTS[task.type]?.accept}
              className="mb-1 block w-full text-sm"
              aria-label="Choose file"
              aria-describedby="upload-constraints"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setHeadshotFile(f);
                setFileName(f?.name || "");
              }}
            />
            <p id="upload-constraints" className="mb-3 text-xs text-mid">
              Accepted: {UPLOAD_HINTS[task.type]?.types || "PDF, PNG, JPEG"} · Maximum 2 MB. Larger or unsupported files
              are rejected by the server.
            </p>
            <Button
              disabled={!fileName.trim() || uploadBusy || (effectiveTaskStatus === "completed" && !linkedDeliverable)}
              onClick={async () => {
                if (!fileName.trim()) {
                  toast("Choose or name a file first", "warn");
                  return;
                }
                setUploadBusy(true);
                try {
                  const dataUrl = headshotFile
                    ? await new Promise<string>((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(String(r.result || ""));
                        r.onerror = reject;
                        r.readAsDataURL(headshotFile);
                      })
                    : "";
                  // The receipt completes the onboarding task; re-uploading an already
                  // complete task must still reach the versioned deliverable below, so a
                  // receipt failure never blocks the new version.
                  try {
                    if (task.type === "headshot" && headshotFile) {
                      await api.uploadHeadshot({ name: fileName.trim(), dataUrl, mime: headshotFile.type });
                    } else if (task.type === "headshot") {
                      await api.uploadHeadshot({ name: fileName.trim() });
                    } else {
                      await api.uploadFile({
                        kind: kindMap[task.type],
                        name: fileName.trim(),
                        speakerId: data.speakerId,
                      });
                    }
                  } catch (receiptError: any) {
                    if (effectiveTaskStatus !== "completed") throw receiptError;
                  }
                  // Mirror the bytes onto the canonical deliverable slot so the task
                  // receipt and the versioned deliverable never diverge.
                  let versioned = false;
                  if (linkedDeliverable && headshotFile && dataUrl.includes(",")) {
                    try {
                      await api.uploadDeliverable(linkedDeliverable.id, {
                        name: fileName.trim(),
                        mime: headshotFile.type,
                        size: headshotFile.size,
                        dataBase64: dataUrl.split(",")[1] || "",
                        kind: headshotFile.type.startsWith("image/")
                          ? "headshot"
                          : headshotFile.type === "application/pdf"
                            ? "slides"
                            : "document",
                      });
                      versioned = true;
                    } catch (e: any) {
                      toast(`Saved receipt, but versioning failed: ${e?.message || "upload rejected"}`, "warn");
                    }
                  }
                  toast(
                    versioned
                      ? "Uploaded — task complete and a new version was saved"
                      : "File recorded and task completed",
                  );
                  load();
                  void loadDeliverables();
                  // Reset the picker so uploading the same file again creates v2.
                  setTaskUploadNonce((n) => n + 1);
                  setHeadshotFile(null);
                  setFileName("");
                } catch (e: any) {
                  toast(e?.message || "Upload failed", "danger");
                } finally {
                  setUploadBusy(false);
                }
              }}
            >
              {uploadBusy ? "Uploading…" : effectiveTaskStatus === "completed" ? "Upload new version" : "Upload & complete"}
            </Button>
          </>
        ) : null}

        {/* Explicit completion state for EVERY task type: an action task gets a real
            button, a derived task says what completes it (and points at that). */}
        {effectiveTaskStatus === "completed" ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-soft p-3 text-sm" data-testid="task-complete-state">
            <input type="checkbox" checked disabled aria-label={`${task.title} is complete`} />
            <span>
              <b>Completed</b>
              {DERIVED_TASK_TYPES.has(task.type) ? (
                <span className="ml-1 text-mid" data-testid="task-derived-completion-copy">
                  · {derivedCompletionCopy(task)}
                </span>
              ) : null}
            </span>
          </div>
        ) : DERIVED_TASK_TYPES.has(task.type) ? (
          <div className="mt-4 rounded-2xl border border-line bg-soft p-3 text-sm" data-testid="task-derived-todo">
            <b>To complete this task:</b> <span className="text-mid">{derivedTodoCopy(task.type)}</span>
          </div>
        ) : (
          <Button
            data-testid="task-mark-complete"
            aria-label={`Mark ${task.title} complete`}
            onClick={async () => {
              try {
                await api.completeTask(task.id);
                toast("Task completed");
                load();
              } catch (e: any) {
                toast(e?.message || "Could not complete the task", "danger");
              }
            }}
          >
            Mark complete
          </Button>
        )}

        {isFile && linkedDeliverable ? (
          <div className="mt-4 rounded-2xl border border-line bg-soft p-4" data-testid="task-uploaded-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm">Uploaded file</b>
              <Badge tone={linkedFile?.versions?.length ? "ok" : "warn"}>
                {linkedFile?.versions?.length
                  ? `${linkedFile.versions.length} version${linkedFile.versions.length === 1 ? "" : "s"}`
                  : "No file yet"}
              </Badge>
            </div>
            {linkedFile?.versions?.length ? (
              <>
                <p className="mt-1 text-sm">
                  <b className="text-ink">{linkedFile.versions.find((v: any) => v.current)?.name || linkedFile.versions.at(-1)?.name}</b>
                  {" · "}
                  uploaded {fileThreadStamp(linkedFile.versions.find((v: any) => v.current)?.uploadedAt || linkedFile.versions.at(-1)?.uploadedAt)}
                  {" · approval: "}
                  {linkedFile.status}
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {[...linkedFile.versions].reverse().map((v: any) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2">
                      <span>
                        v{v.version} · {v.name} · {fileThreadStamp(v.uploadedAt)}
                      </span>
                      <span className="flex items-center gap-2">
                        {v.current ? <Badge tone="ok">Current</Badge> : null}
                        <a className="font-semibold text-ink underline" href={`/api/content/files/${linkedFile.id}/versions/${v.id}`}>
                          View
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <b className="text-xs uppercase tracking-wide text-mid">Comments</b>
                  {(linkedFile.comments || []).map((c: any) => (
                    <p key={c.id} className={`mt-1 rounded-lg border p-2 text-xs ${postedComment?.id===c.id?"border-brand-400 bg-white ring-2 ring-brand-500/10":"border-transparent bg-white"}`}>
                      <Badge tone={fileCommentRole(c)==="Organizer"?"ok":"muted"}>{fileCommentRole(c)}</Badge>{" "}<b>{c.authorName}</b> · <span className="font-mono">{fileThreadStamp(c.createdAt)}</span>
                      <br />
                      {c.body}
                    </p>
                  ))}
                  {!linkedFile.comments?.length ? (
                    <p className="mt-1 text-xs text-mid">No comments yet.</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Input
                      aria-label="Add a comment on this file"
                      placeholder="Add a comment for organizers"
                      value={taskComment}
                      onChange={(e) => setTaskComment(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={!taskComment.trim()}
                      onClick={async () => {
                        const posted:any=await api.addFileComment(linkedFile.id, taskComment.trim());
                        setPostedComment(posted.data);
                        setTaskComment("");
                        toast("Speaker comment posted and saved");
                        const r = await api.deliverable(linkedId);
                        setLinkedFile(r.data?.file || null);
                      }}
                    >
                      Comment
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-mid">
                Uploading here also saves a version on your <b>{linkedDeliverable.name}</b> deliverable.
              </p>
            )}
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to={`/p/deliverables/${linkedDeliverable.id}`}>Open deliverable · versions &amp; approval</Link>
            </Button>
          </div>
        ) : null}

        {postedComment?<Notice tone="ok"><b>Speaker reply posted and saved</b> · {fileThreadStamp(postedComment.createdAt)}<br/>{postedComment.body}</Notice>:null}
        {effectiveTaskStatus === "completed" && task.type !== "form" ? (
          <p className="mt-4 text-sm text-ink">This task is complete — organizer deliverable and portal completion agree.</p>
        ) : isFile && effectiveTaskStatus !== "completed" ? (
          <p className="mt-4 text-xs text-mid">Required file tasks complete only after upload.</p>
        ) : null}
      </Card>
    </div>
  );
}

export function PortalResourcesPage() {
  const { data, err } = useSpeakerHome();
  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  return (
    <div>
      <PageHeader title="Resources" description="Handbook and logistics with safe embeds only." />
      <div className="space-y-3">
        {data.resources.map((r: any) => (
          <Card key={r.id} className="p-4">
            <h3 className="text-lg font-bold">
              <Link className="hover:text-ink" to={`/p/resources/${r.slug}`}>
                {r.title}
              </Link>
            </h3>
            <p className="mt-1 text-sm text-mid">{r.body}</p>
          </Card>
        ))}
        {!data.resources?.length ? (
          <EmptyState title="No resources yet" description="Organizers publish handbook pages here." />
        ) : null}
      </div>
    </div>
  );
}

export function PortalResourceDetailPage() {
  const { slug } = useParams();
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api
      .resource(slug!)
      .then((res) => setR(res.data))
      .catch((e) => setErr(e.message));
  }, [slug]);
  if (!r && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;

  const safeEmbed = isProfessionalEmbed(r.embedUrl);

  return (
    <div>
      <PageHeader title={r.title} />
      <Card className="p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{r.body}</p>
        {safeEmbed ? (
          <div className="mt-4 overflow-hidden rounded-2xl border">
            <iframe
              title="resource embed"
              src={r.embedUrl}
              className="aspect-video w-full"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="no-referrer"
            />
            <p className="bg-soft px-3 py-2 text-[11px] text-mid">
              Allowlisted embed host only (YouTube/Vimeo). Sandboxed iframe.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-3xl border border-dashed border-line bg-soft p-6">
            <div className="text-xs font-bold uppercase tracking-wide text-ink">Speaker handbook</div>
            <h3 className="mt-2 text-lg font-bold">Session day checklist</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
              <li>Arrive 30 minutes before your slot for AV check.</li>
              <li>Upload final slides at least 24 hours before you go on stage.</li>
              <li>Confirm headshot and bio match the public gallery.</li>
              <li>Join the speaker Slack channel for day-of logistics.</li>
              <li>Have a backup of your deck on a USB and in the cloud.</li>
            </ul>
            <p className="mt-4 text-xs text-mid">
              {r.embedUrl
                ? "An external embed was suppressed because it is not on the professional allowlist."
                : "No external embed configured for this page."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

export function PortalProfilePage() {
  const { data, err, load } = useSpeakerHome();
  const [profile, setProfile] = useState<any>(null);
  /** True once the speaker has typed (or picked a headshot) since the last save.
   * useSpeakerHome refetches on every bumpData(), i.e. after ANY mutation on the
   * portal; without this guard the refetch overwrote in-progress edits and silently
   * dropped the chosen headshot file stashed on `_headshotFile`. */
  const [dirty, setDirty] = useState(false);
  const seededSpeakerRef = useRef<string | undefined>(undefined);
  const patchProfile = (patch: any) => {
    setDirty(true);
    setProfile((prev: any) => ({ ...prev, ...patch }));
  };
  useEffect(() => {
    if (!data?.profile) return;
    // A persona/speaker switch is a record switch: always adopt the new record.
    if (seededSpeakerRef.current !== data.profile.speakerId) {
      seededSpeakerRef.current = data.profile.speakerId;
      setDirty(false);
    } else if (dirty) return;
    setProfile({ ...data.profile });
  }, [data, dirty]);
  if (!profile && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  return (
    <div>
      <PageHeader title="Profile" description="Bio, social links, headshot, and travel preferences sync to the organizer roster." />
      <Card className="p-5">
        {profile.headshotUrl ? (
          <img key={profile.headshotUrl} src={profile.headshotUrl} alt={`${profile.name || "Speaker"} headshot`} className="mb-4 h-24 w-24 rounded-full object-cover" />
        ) : null}
        <Field label="Name">
          <Input value={profile.name || ""} onChange={(e) => patchProfile({ name: e.target.value })} />
        </Field>
        <Field label="Email" hint="Contact email on your speaker record">
          <Input value={profile.email || ""} onChange={(e) => patchProfile({ email: e.target.value })} />
        </Field>
        <Field label="Title">
          <Input value={profile.title || ""} onChange={(e) => patchProfile({ title: e.target.value })} />
        </Field>
        <Field label="Company">
          <Input value={profile.company || ""} onChange={(e) => patchProfile({ company: e.target.value })} />
        </Field>
        <Field label="Bio">
          <Textarea rows={5} value={profile.bio || ""} onChange={(e) => patchProfile({ bio: e.target.value })} />
        </Field>
        <Field label="LinkedIn">
          <Input value={profile.linkedin || ""} onChange={(e) => patchProfile({ linkedin: e.target.value })} />
        </Field>
        <Field label="X / Twitter">
          <Input value={profile.x || ""} onChange={(e) => patchProfile({ x: e.target.value })} />
        </Field>
        <Field label="Website">
          <Input value={profile.website || ""} onChange={(e) => patchProfile({ website: e.target.value })} />
        </Field>
        <Field label="Travel preference">
          <Input
            value={profile.travelPreference || ""}
            onChange={(e) => patchProfile({ travelPreference: e.target.value })}
            placeholder="e.g. Direct flights, aisle seat"
          />
        </Field>
        <Field label="Dietary">
          <Input value={profile.dietary || ""} onChange={(e) => patchProfile({ dietary: e.target.value })} />
        </Field>
        <Field label="Headshot" hint="Well-lit, neutral background. PNG or JPEG. Included when you click Save profile.">
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              patchProfile({ _headshotFile: f });
            }}
          />
          {profile._headshotFile ? (
            <p className="mt-1 text-xs text-mid">Selected: {profile._headshotFile.name} (saves with profile)</p>
          ) : null}
        </Field>
        {dirty ? (
          <p className="mb-3 text-xs font-semibold text-mid" data-testid="profile-unsaved">
            Unsaved changes — click Save profile to store them.
          </p>
        ) : null}
        <Button
          onClick={async () => {
            const { _headshotFile, ...fields } = profile;
            let headshot: { name: string; dataUrl: string; mime: string } | undefined;
            if (_headshotFile instanceof File) {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result || ""));
                r.onerror = reject;
                r.readAsDataURL(_headshotFile);
              });
              headshot = { name: _headshotFile.name, dataUrl, mime: _headshotFile.type };
            }
            const saved = await api.saveProfile({ ...fields, headshot });
            setProfile({ ...saved.data.profile });
            // Pull fresh server state BEFORE dropping the guard so clearing `dirty`
            // re-seeds from the saved record rather than the pre-save snapshot.
            await load();
            setDirty(false);
            toast("Profile saved");
          }}
        >
          {dirty ? "Save profile *" : "Save profile"}
        </Button>
      </Card>
    </div>
  );
}
