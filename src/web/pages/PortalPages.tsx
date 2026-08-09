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
            <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Onboarding</div>
            <div className="mt-1 text-3xl font-bold">{data.readiness.pct}%</div>
          </div>
          <StatusBadge status={data.readiness.state} />
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden>
          <div className="h-full bg-iris" style={{ width: `${data.readiness.pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-stone-500">
          {data.readiness.completedRequiredTaskCount}/{data.readiness.requiredTaskCount} required tasks complete
        </p>
      </Card>

      {next ? (
        <Card className="mb-4 border-iris/30 p-5">
          <div className="text-xs font-bold uppercase tracking-wide text-iris">Up next</div>
          <h2 className="mt-1 text-xl font-bold">{next.title}</h2>
          <p className="mt-1 text-xs text-stone-500">{taskTypeLabel(next.type)}</p>
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
          <p className="text-sm text-stone-500">
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
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{data.communications[0].body}</p>
          <a
            className="mt-3 inline-block text-sm font-semibold text-iris"
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
      <PageHeader title="My talks" description="Submission status and schedule placement." />
      <div className="space-y-3">
        {data.submissions.map((s: any) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{s.title}</h3>
              <StatusBadge status={s.status} />
            </div>
            <p className="mt-1 text-sm text-stone-500">
              {s.category} · {s.format} · board {s.reviewBoard}
            </p>
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
            className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 hover:border-iris/40"
          >
            <div>
              <div className="font-semibold">{t.title}</div>
              <div className="text-xs text-stone-500">{taskTypeLabel(t.type)}</div>
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

const FILE_TYPES = new Set(["headshot", "slides", "supporting_doc"]);

export function PortalTaskDetailPage() {
  const { id } = useParams();
  const { data, err, load } = useSpeakerHome();
  const [fileName, setFileName] = useState("");
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (data?.profile) setProfile({ ...data.profile });
  }, [data]);

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

  return (
    <div>
      <PageHeader title={task.title} description={taskTypeLabel(task.type)} />
      <Card className="p-5">
        {task.type === "profile" && profile ? (
          <>
            <Field label="Name">
              <Input value={profile.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Title">
              <Input value={profile.title || ""} onChange={(e) => setProfile({ ...profile, title: e.target.value })} />
            </Field>
            <Field label="Company">
              <Input
                value={profile.company || ""}
                onChange={(e) => setProfile({ ...profile, company: e.target.value })}
              />
            </Field>
            <Field label="Bio" hint="Save with 20+ characters to auto-complete this task.">
              <Textarea
                rows={5}
                value={profile.bio || ""}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              />
            </Field>
            <Field label="LinkedIn">
              <Input
                value={profile.linkedin || ""}
                onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })}
              />
            </Field>
            <Field label="Website">
              <Input
                value={profile.website || ""}
                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
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

        {isFile ? (
          <>
            <p className="mb-3 text-sm text-stone-600">
              Demo upload stores a file receipt (filename) on your speaker record and marks the task complete. No binary
              is persisted.
            </p>
            <Field label="File name">
              <Input
                placeholder={task.type === "headshot" ? "headshot.jpg" : "slides.pdf"}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
              />
            </Field>
            <input
              type="file"
              className="mb-3 block w-full text-sm"
              aria-label="Choose file"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
            />
            <Button
              disabled={!fileName.trim() || task.status === "completed"}
              onClick={async () => {
                if (!fileName.trim()) {
                  toast("Choose or name a file first", "warn");
                  return;
                }
                await api.uploadFile({
                  kind: kindMap[task.type],
                  name: fileName.trim(),
                  speakerId: data.speakerId,
                });
                toast("File recorded and task completed");
                load();
              }}
            >
              Upload & complete
            </Button>
          </>
        ) : null}

        {(task.type === "confirm" || task.type === "form") && task.status !== "completed" ? (
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

        {task.status === "completed" ? (
          <p className="mt-4 text-sm text-ok">This task is complete.</p>
        ) : isFile ? (
          <p className="mt-4 text-xs text-stone-500">
            Required file tasks complete only after upload — there is no skip path in the demo.
          </p>
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
              <Link className="hover:text-iris" to={`/p/resources/${r.slug}`}>
                {r.title}
              </Link>
            </h3>
            <p className="mt-1 text-sm text-stone-600">{r.body}</p>
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
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{r.body}</p>
        {safeEmbed ? (
          <div className="mt-4 overflow-hidden rounded-xl border">
            <iframe
              title="resource embed"
              src={r.embedUrl}
              className="aspect-video w-full"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="no-referrer"
            />
            <p className="bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
              Allowlisted embed host only (YouTube/Vimeo). Sandboxed iframe.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6">
            <div className="text-xs font-bold uppercase tracking-wide text-iris">Speaker handbook</div>
            <h3 className="mt-2 text-lg font-bold">Session day checklist</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-stone-700">
              <li>Arrive 30 minutes before your slot for AV check.</li>
              <li>Upload final slides at least 24 hours before you go on stage.</li>
              <li>Confirm headshot and bio match the public gallery.</li>
              <li>Join the speaker Slack channel for day-of logistics.</li>
              <li>Have a backup of your deck on a USB and in the cloud.</li>
            </ul>
            <p className="mt-4 text-xs text-stone-500">
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
      <PageHeader title="Profile" />
      <Card className="p-5">
        <Field label="Name">
          <Input value={profile.name || ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input value={profile.email || ""} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
        </Field>
        <Field label="Bio">
          <Textarea
            rows={5}
            value={profile.bio || ""}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </Field>
        <Field label="Company">
          <Input value={profile.company || ""} onChange={(e) => setProfile({ ...profile, company: e.target.value })} />
        </Field>
        <Button
          onClick={async () => {
            await api.saveProfile(profile);
            toast("Profile saved");
            load();
          }}
        >
          Save
        </Button>
      </Card>
    </div>
  );
}
