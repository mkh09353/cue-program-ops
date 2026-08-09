import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, subscribeData } from "../lib/api";
import { formatStatus, humanizeMissing, taskTypeLabel } from "../lib/utils";
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

export function SpeakersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () =>
    api
      .speakers()
      .then((r) => {
        setRows(r.data);
        setLoaded(true);
      })
      .catch((e) => {
        setErr(e.message);
        setLoaded(true);
      });

  useEffect(() => {
    load();
    return subscribeData(load);
  }, []);

  if (!loaded) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Speakers"
        description="Accepted speakers and onboarding readiness. Nudge sends the task reminder template."
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              const blocked = rows.filter((r) => r.readiness?.state === "not_ready").map((r) => r.speakerId);
              if (!blocked.length) {
                toast("No blocked speakers", "info");
                return;
              }
              await api.sendComms({ templateKey: "task_reminder", speakerIds: blocked });
              toast(`Reminders sent to ${blocked.length} speaker(s)`);
            }}
          >
            Nudge blocked
          </Button>
        }
      />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {!rows.length ? (
        <EmptyState title="No accepted speakers" description="Accept a submission to start onboarding." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((s) => (
            <Card key={s.speakerId} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold">{s.name}</h3>
                  <p className="text-sm text-stone-500">{s.title}</p>
                </div>
                <Badge tone={s.readiness?.state === "ready" ? "ok" : "warn"}>{s.readiness?.pct ?? 0}%</Badge>
              </div>
              <p className="mt-2 text-xs text-stone-500">
                {s.tasks?.filter((t: any) => t.status === "completed").length || 0}/{s.tasks?.length || 0} tasks ·{" "}
                {s.files?.length || 0} files
              </p>
              {s.readiness?.missing?.length ? (
                <p className="mt-2 text-xs text-warn">
                  Missing: {(s.readiness.missing as string[]).map(humanizeMissing).join(" · ")}
                </p>
              ) : (
                <p className="mt-2 text-xs text-ok">Ready for showtime</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/app/speakers/${s.speakerId}`}>Open</Link>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await api.sendComms({ templateKey: "task_reminder", speakerId: s.speakerId });
                    toast(`Reminder sent to ${s.name}`);
                  }}
                >
                  Nudge
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function SpeakerDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<any>(null);

  const load = () =>
    api.speakers().then((r) => setRow(r.data.find((x: any) => x.speakerId === id) || null));

  useEffect(() => {
    load();
    return subscribeData(load);
  }, [id]);

  if (!row) return <Spinner />;

  return (
    <div>
      <PageHeader title={row.name} description={row.title} />
      <Card className="p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Tasks</h3>
        <ul className="mt-3 divide-y">
          {row.tasks?.map((t: any) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-3 text-sm">
              <div>
                <b>{t.title}</b>
                <div className="text-xs text-stone-500">
                  {taskTypeLabel(t.type)} · due {t.dueAt?.slice(0, 10)}
                </div>
              </div>
              <StatusBadge status={t.status} />
            </li>
          ))}
          {!row.tasks?.length ? (
            <li className="py-4 text-sm text-stone-500">No onboarding tasks for this speaker.</li>
          ) : null}
        </ul>
        <p className="mt-3 text-xs text-stone-500">
          Speakers complete file and profile tasks from the portal. Organizers can nudge from the list.
        </p>
      </Card>
    </div>
  );
}

export function CommsPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [speakerId, setSpeakerId] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    const [t, l, s] = await Promise.all([api.templates(), api.commsLog(), api.speakers()]);
    setTemplates(t.data);
    setLog(l.data);
    setSpeakers(s.data);
    setActive((prev: any) => {
      if (prev) {
        const fresh = t.data.find((x: any) => x.id === prev.id);
        return fresh || prev;
      }
      return t.data[0];
    });
    setSpeakerId((id) => id || s.data[0]?.speakerId || "");
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message));
    return subscribeData(() => {
      load().catch(() => {});
    });
  }, []);

  if (!active && !err) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Comms"
        description="Templated speaker email with mock delivery, send log, and calendar invitation copy."
      />
      {err ? <Notice tone="danger">{err}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
        <Card className="p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Templates</h3>
          <div className="space-y-1" role="listbox" aria-label="Email templates">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t)}
                aria-selected={active?.id === t.id}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                  active?.id === t.id ? "bg-ink text-white" : "hover:bg-stone-100"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          {active ? (
            <>
              <Field label="Subject">
                <Input
                  value={active.subject}
                  onChange={(e) => setActive({ ...active, subject: e.target.value })}
                />
              </Field>
              <Field
                label="Body"
                hint="Variables: {{first_name}} {{talk_title}} {{portal_link}} {{calendar_links}}"
              >
                <Textarea
                  rows={10}
                  value={active.body}
                  onChange={(e) => setActive({ ...active, body: e.target.value })}
                />
              </Field>
              <label className="mb-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!active.includeCalendarLinks}
                  onChange={(e) => setActive({ ...active, includeCalendarLinks: e.target.checked })}
                />
                Include calendar invitation language
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    await api.saveTemplate(active.id, active);
                    toast("Template saved");
                    load();
                  }}
                >
                  Save template
                </Button>
                <div className="flex items-center gap-2">
                  <select
                    className="h-10 rounded-lg border border-stone-300 px-2 text-sm"
                    value={speakerId}
                    aria-label="Recipient speaker"
                    onChange={(e) => setSpeakerId(e.target.value)}
                  >
                    {speakers.map((s) => (
                      <option key={s.speakerId} value={s.speakerId}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await api.sendComms({ templateKey: active.key, speakerId });
                      toast("Mock send logged");
                      load();
                    }}
                  >
                    Send to speaker
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </Card>

        <Card className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Send log</h3>
          <ul className="mt-3 max-h-[480px] space-y-2 overflow-auto">
            {log.map((c) => (
              <li key={c.id} className="rounded-xl border border-stone-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <b>{c.subject}</b>
                  <StatusBadge status={c.status || "mock_sent"} />
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {formatStatus(c.kind)} · {c.createdAt}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-xs text-stone-600 line-clamp-4">{c.body}</p>
                <a
                  className="mt-2 inline-block text-xs font-semibold text-iris"
                  href={`/api/communications/${c.id}/calendar.ics`}
                >
                  Download ICS
                </a>
              </li>
            ))}
            {!log.length ? (
              <li>
                <EmptyState
                  title="No sends yet"
                  description="Send a template or accept a talk to populate the log."
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!speakerId || !active}
                      onClick={async () => {
                        if (!active) return;
                        await api.sendComms({ templateKey: active.key, speakerId });
                        toast("Mock send logged");
                        load();
                      }}
                    >
                      Send sample
                    </Button>
                  }
                />
              </li>
            ) : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}
