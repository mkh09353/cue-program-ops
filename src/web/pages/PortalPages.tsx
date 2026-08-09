import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, subscribeData } from "../lib/api";
import { calendarLinks, fmtTime, isProfessionalEmbed, taskTypeLabel } from "../lib/utils";
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
          <div className="h-full bg-ink" style={{ width: `${data.readiness.pct}%` }} />
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
          <p className="mt-1 text-lg font-semibold">{scheduled.title}</p>
          <p className="text-sm text-mid">
            {fmtTime(scheduled.slot.startsAt)}–{fmtTime(scheduled.slot.endsAt)} UTC
          </p>
          <CalendarButtons
            title={scheduled.title}
            startsAt={scheduled.slot.startsAt}
            endsAt={scheduled.slot.endsAt}
            sessionId={scheduled.id}
          />
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
              <a href="/e/ai-engineer-summit/cfp">Start another proposal</a>
            </Button>
          )
        }
      />
      <div className="space-y-3">
        {data.submissions.map((s: any) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{s.title}</h3>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-1 text-sm text-mid">
              {s.category} · {s.format} · board {s.reviewBoard}
            </p>
            {s.editToken ? <Button asChild size="sm" variant="outline" className="mt-3"><a href={`/e/ai-engineer-summit/cfp?submission=${s.id}&token=${s.editToken}`}>{s.status === "draft" ? "Resume draft" : "View or edit submission"}</a></Button> : null}
          </Card>
        ))}
        {!data.submissions.length ? (
          <EmptyState title="No submissions yet" description="When you submit a CFP, it will show here." />
        ) : null}
      </div>
    </div>
  );
}

export function PortalTasksPage() {
  const { data, err } = useSpeakerHome();
  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  return (
    <div>
      <PageHeader title="Tasks" />
      <div className="space-y-2">
        {data.tasks.map((t: any) => (
          <Link
            key={t.id}
            to={`/p/tasks/${t.id}`}
            className="flex items-center justify-between rounded-[24px] border border-line bg-white p-4 hover:border-ink/20"
          >
            <div>
              <div className="font-semibold">{t.title}</div>
              <div className="text-xs text-mid">
                {taskTypeLabel(t.type)}
                {t.dueAt ? ` · due ${String(t.dueAt).slice(0, 10)}` : ""}
              </div>
            </div>
            <StatusBadge status={t.status} />
          </Link>
        ))}
        {!data.tasks.length ? (
          <EmptyState title="No tasks" description="Accepted speakers receive onboarding tasks here." />
        ) : null}
      </div>
    </div>
  );
}

export function PortalDeliverablesPage() {
  const [rows,setRows]=useState<any[]>([]),[err,setErr]=useState("");
  useEffect(()=>{api.deliverables().then(r=>setRows(r.data)).catch(e=>setErr(e.message))},[]);
  if(err)return <Notice tone="danger">{err}</Notice>;
  return <div><PageHeader title="Deliverables" description="Your assigned session files, deadlines, and approval state."/><div className="space-y-2">{rows.map(t=><Link key={t.id} to={`/p/deliverables/${t.id}`} className="flex justify-between rounded-[24px] border bg-white p-4"><div><b>{t.name}</b><p className="text-xs text-mid">{t.session?.title} · Due {t.dueAt.slice(0,10)} · {t.uploadCount} version(s)</p></div><StatusBadge status={t.overdue?"overdue":t.status}/></Link>)}</div></div>;
}

export function PortalDeliverableDetailPage() {
  const {id}=useParams();const[data,setData]=useState<any>(null),[err,setErr]=useState(""),[comment,setComment]=useState("");
  const load=()=>api.deliverable(id!).then(r=>setData(r.data)).catch(e=>setErr(e.message));useEffect(()=>{void load()},[id]);
  const upload=async(file:File)=>{const dataBase64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=reject;r.readAsDataURL(file)});await api.uploadDeliverable(id!,{name:file.name,mime:file.type,size:file.size,dataBase64,kind:file.type.startsWith("image/")?"headshot":file.type==="application/pdf"?"slides":"document"});toast("Upload saved as a new version");load()};
  if(!data&&!err)return <Spinner/>;if(err)return <Notice tone="danger">{err}</Notice>;const file=data.file;
  return <div><PageHeader title={data.name} description={`${data.session?.title||"Speaker deliverable"} · Due ${data.dueAt.slice(0,10)}`}/><Card className="p-5"><StatusBadge status={data.overdue?"overdue":data.status}/><p className="mt-3 text-sm">{data.instructions}</p><div className="mt-4 rounded-[18px] border border-dashed p-4"><b>Upload file</b><p className="mb-2 text-xs text-mid">Accepted: {data.acceptedTypes.join(", ")} · Maximum 2 MB. Re-uploading creates a new version.</p><Input type="file" accept={data.acceptedTypes.join(",")} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f)}}/></div>{file?<div className="mt-5"><h2 className="font-bold">{file.versions.find((v:any)=>v.current)?.name}</h2><p className="text-sm text-mid">Approval: {file.status} · {file.versions.length} versions</p>{[...file.versions].reverse().map((v:any)=><div key={v.id} className="mt-2 flex justify-between rounded bg-soft p-2 text-sm"><span>v{v.version} · {new Date(v.uploadedAt).toLocaleString()}</span><span>{v.current?<Badge tone="ok">Current</Badge>:null} <a className="text-ink underline" href={`/api/content/files/${file.id}/versions/${v.id}`}>View</a></span></div>)}<h3 className="mt-4 text-xs font-bold uppercase text-mid">Comments</h3>{file.comments.map((c:any)=><p key={c.id} className="mt-2 rounded bg-soft p-2 text-sm"><b>{c.authorName}</b> · {new Date(c.createdAt).toLocaleString()}<br/>{c.body}</p>)}<div className="mt-2 flex gap-2"><Input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a comment"/><Button onClick={async()=>{await api.addFileComment(file.id,comment);setComment("");load()}}>Comment</Button></div></div>:null}</Card></div>;
}

const FILE_TYPES = new Set(["headshot", "slides", "supporting_doc"]);

export function PortalTaskDetailPage() {
  const { id } = useParams();
  const { data, err, load } = useSpeakerHome();
  const [fileName, setFileName] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [formAnswers, setFormAnswers] = useState<Record<string, string>>({});
  const [headshotFile, setHeadshotFile] = useState<File | null>(null);

  useEffect(() => {
    if (data?.profile) setProfile({ ...data.profile });
  }, [data]);

  useEffect(() => {
    const task = data?.tasks?.find((t: any) => t.id === id);
    if (task?.formAnswers) setFormAnswers({ ...task.formAnswers });
    else if (task?.formSchema) setFormAnswers(Object.fromEntries(task.formSchema.map((f: any) => [f.key, ""])));
  }, [data, id]);

  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  const task = data.tasks.find((t: any) => t.id === id);
  if (!task) return <Notice tone="danger">Task not found</Notice>;

  const kindMap: Record<string, "headshot" | "slides" | "supporting_document"> = {
    headshot: "headshot",
    slides: "slides",
    supporting_doc: "supporting_document",
  };

  const isFile = FILE_TYPES.has(task.type);
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
              <Input value={profile.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Title">
              <Input value={profile.title || ""} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
            </Field>
            <Field label="Company">
              <Input value={profile.company || ""} onChange={(e) => setProfile({ ...profile, company: e.target.value })} />
            </Field>
            <Field label="Bio" hint="Save with 20+ characters to auto-complete this task.">
              <Textarea rows={5} value={profile.bio || ""} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
            </Field>
            <Field label="LinkedIn">
              <Input value={profile.linkedin || ""} onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })} />
            </Field>
            <Field label="X / Twitter">
              <Input value={profile.x || ""} onChange={(e) => setProfile({ ...profile, x: e.target.value })} />
            </Field>
            <Field label="Website">
              <Input value={profile.website || ""} onChange={(e) => setProfile({ ...profile, website: e.target.value })} />
            </Field>
            <Field label="Travel preference">
              <Input
                value={profile.travelPreference || ""}
                onChange={(e) => setProfile({ ...profile, travelPreference: e.target.value })}
              />
            </Field>
            <Button
              onClick={async () => {
                await api.saveProfile(profile);
                toast("Profile saved");
                load();
              }}
            >
              Save profile
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
                    onChange={(e) => setFormAnswers({ ...formAnswers, [f.key]: e.target.value })}
                    disabled={task.status === "completed"}
                  />
                ) : f.type === "select" ? (
                  <select
                    className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
                    value={formAnswers[f.key] || ""}
                    disabled={task.status === "completed"}
                    onChange={(e) => setFormAnswers({ ...formAnswers, [f.key]: e.target.value })}
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
                    onChange={(e) => setFormAnswers({ ...formAnswers, [f.key]: e.target.value })}
                  />
                )}
              </Field>
            ))}
            {task.status !== "completed" ? (
              <Button
                onClick={async () => {
                  try {
                    await api.submitTaskForm(task.id, formAnswers);
                    toast("Form submitted");
                    load();
                  } catch (e: any) {
                    toast(e.message || "Form failed", "danger");
                  }
                }}
              >
                Submit form
              </Button>
            ) : (
              <p className="text-sm text-ink">Form submitted.</p>
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
            <input
              type="file"
              accept={task.type === "headshot" ? "image/png,image/jpeg" : undefined}
              className="mb-3 block w-full text-sm"
              aria-label="Choose file"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setHeadshotFile(f);
                setFileName(f?.name || "");
              }}
            />
            <Button
              disabled={!fileName.trim() || task.status === "completed"}
              onClick={async () => {
                if (!fileName.trim()) {
                  toast("Choose or name a file first", "warn");
                  return;
                }
                if (task.type === "headshot" && headshotFile) {
                  const dataUrl = await new Promise<string>((resolve, reject) => {
                    const r = new FileReader();
                    r.onload = () => resolve(String(r.result || ""));
                    r.onerror = reject;
                    r.readAsDataURL(headshotFile);
                  });
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
                toast("File recorded and task completed");
                load();
              }}
            >
              Upload & complete
            </Button>
          </>
        ) : null}

        {task.type === "confirm" && task.status !== "completed" ? (
          <Button
            onClick={async () => {
              await api.completeTask(task.id);
              toast("Task completed");
              load();
            }}
          >
            Mark complete
          </Button>
        ) : null}

        {task.status === "completed" && task.type !== "form" ? (
          <p className="mt-4 text-sm text-ink">This task is complete.</p>
        ) : isFile && task.status !== "completed" ? (
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
          <div className="mt-4 overflow-hidden rounded-[18px] border">
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
          <div className="mt-4 rounded-[24px] border border-dashed border-line bg-soft p-6">
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
  useEffect(() => {
    if (data?.profile) setProfile({ ...data.profile });
  }, [data]);
  if (!profile && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  return (
    <div>
      <PageHeader title="Profile" description="Bio, social links, headshot, and travel preferences sync to the organizer roster." />
      <Card className="p-5">
        {profile.headshotUrl ? (
          <img src={profile.headshotUrl} alt="" className="mb-4 h-24 w-24 rounded-full object-cover" />
        ) : null}
        <Field label="Name">
          <Input value={profile.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
        </Field>
        <Field label="Email" hint="Contact email on your speaker record">
          <Input value={profile.email || ""} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
        </Field>
        <Field label="Title">
          <Input value={profile.title || ""} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
        </Field>
        <Field label="Company">
          <Input value={profile.company || ""} onChange={(e) => setProfile({ ...profile, company: e.target.value })} />
        </Field>
        <Field label="Bio">
          <Textarea rows={5} value={profile.bio || ""} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
        </Field>
        <Field label="LinkedIn">
          <Input value={profile.linkedin || ""} onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })} />
        </Field>
        <Field label="X / Twitter">
          <Input value={profile.x || ""} onChange={(e) => setProfile({ ...profile, x: e.target.value })} />
        </Field>
        <Field label="Website">
          <Input value={profile.website || ""} onChange={(e) => setProfile({ ...profile, website: e.target.value })} />
        </Field>
        <Field label="Travel preference">
          <Input
            value={profile.travelPreference || ""}
            onChange={(e) => setProfile({ ...profile, travelPreference: e.target.value })}
            placeholder="e.g. Direct flights, aisle seat"
          />
        </Field>
        <Field label="Dietary">
          <Input value={profile.dietary || ""} onChange={(e) => setProfile({ ...profile, dietary: e.target.value })} />
        </Field>
        <Field label="Headshot" hint="Well-lit, neutral background. PNG or JPEG. Included when you click Save profile.">
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setProfile((p: any) => ({ ...p, _headshotFile: f }));
            }}
          />
          {profile._headshotFile ? (
            <p className="mt-1 text-xs text-mid">Selected: {profile._headshotFile.name} (saves with profile)</p>
          ) : null}
        </Field>
        <Button
          onClick={async () => {
            const { _headshotFile, ...fields } = profile;
            if (_headshotFile instanceof File) {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result || ""));
                r.onerror = reject;
                r.readAsDataURL(_headshotFile);
              });
              await api.uploadHeadshot({ name: _headshotFile.name, dataUrl, mime: _headshotFile.type });
            }
            await api.saveProfile(fields);
            toast("Profile saved");
            load();
          }}
        >
          Save profile
        </Button>
      </Card>
    </div>
  );
}
