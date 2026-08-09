import { useEffect, useMemo, useState } from "react";
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
  const [progress, setProgress] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [readiness, setReadiness] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", title: "", company: "", bio: "", travelPreference: "" });
  const [csv, setCsv] = useState("name,email,title,company,bio\nDana Kowalski,dana.kowalski@example.test,Staff Engineer,Northwind,Systems thinker");
  const [taskForm, setTaskForm] = useState({
    title: "Confirm travel plans",
    description: "Reply with arrival city and hotel needs.",
    dueAt: "2026-09-20",
    type: "confirm",
  });

  const load = () =>
    Promise.all([
      api.speakersQuery({
        q: q || undefined,
        status: status || undefined,
        readiness: readiness || undefined,
      }),
      api.speakerProgress(),
    ])
      .then(([s, p]) => {
        setRows(s.data);
        setProgress(p.data);
        setLoaded(true);
      })
      .catch((e) => {
        setErr(e.message);
        setLoaded(true);
      });

  useEffect(() => {
    load();
    return subscribeData(load);
  }, [q, status, readiness]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (!loaded) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Speakers"
        description="Event roster, onboarding progress, invitations, and task assignment."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              Import CSV
            </Button>
            <Button variant="secondary" onClick={() => setShowTask(true)} disabled={!selected.length && !rows.length}>
              Assign task
            </Button>
            <Button onClick={() => setShowAdd(true)}>Add speaker</Button>
          </div>
        }
      />
      {err ? <Notice tone="danger">{err}</Notice> : null}

      {progress ? (
        <Card className="mb-4 overflow-x-auto p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Onboarding progress</h3>
            <p className="text-xs text-mid">
              {progress.summary?.ready || 0}/{progress.summary?.speakers || 0} ready · derived from live task state
            </p>
          </div>
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b text-mid">
                <th className="py-2 pr-3">Speaker</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">%</th>
                {(progress.columns || []).map((c: string) => (
                  <th key={c} className="py-2 pr-3">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(progress.rows || []).map((r: any) => (
                <tr key={r.speakerId} className="border-b border-line">
                  <td className="py-2 pr-3 font-semibold">
                    <Link className="text-ink hover:underline" to={`/app/speakers/${r.speakerId}`}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge>{r.workflowStatus}</Badge>
                  </td>
                  <td className="py-2 pr-3">{r.readiness?.pct ?? 0}%</td>
                  {(progress.columns || []).map((c: string) => {
                    const cell = r.cells?.[c];
                    return (
                      <td key={c} className="py-2 pr-3">
                        {cell ? (
                          <Badge tone={cell.status === "completed" ? "ok" : "warn"}>{cell.status === "completed" ? "done" : "open"}</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-4">
        <Field label="Search">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company, email…" />
        </Field>
        <Field label="Workflow status">
          <select className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {["invited", "confirmed", "accepted", "declined", "withdrawn"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Readiness">
          <select className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" value={readiness} onChange={(e) => setReadiness(e.target.value)}>
            <option value="">All</option>
            <option value="ready">Ready</option>
            <option value="not_ready">Not ready</option>
          </select>
        </Field>
        <div className="flex items-end gap-2">
          <Button
            variant="secondary"
            disabled={!selected.length}
            onClick={async () => {
              await api.sendComms({ templateKey: "task_reminder", speakerIds: selected });
              toast(`Reminders logged for ${selected.length} speaker(s)`);
              load();
            }}
          >
            Nudge selected ({selected.length})
          </Button>
        </div>
      </Card>

      {!rows.length ? (
        <EmptyState title="No speakers match" description="Accept a submission, add manually, or import CSV." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((s) => (
            <Card key={s.speakerId} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex gap-3">
                  <input type="checkbox" checked={selected.includes(s.speakerId)} onChange={() => toggle(s.speakerId)} />
                  {s.headshotUrl || s.profile?.headshotUrl ? (
                    <img src={s.headshotUrl || s.profile?.headshotUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-canvas text-sm font-bold text-ink">
                      {(s.name || "?").slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold">{s.name}</h3>
                    <p className="text-sm text-mid">
                      {[s.title, s.company].filter(Boolean).join(" · ") || s.email}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge tone={s.readiness?.state === "ready" ? "ok" : "warn"}>{s.readiness?.pct ?? 0}%</Badge>
                  <div className="mt-1">
                    <Badge>{s.workflowStatus || "accepted"}</Badge>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-mid">
                {s.tasks?.filter((t: any) => t.status === "completed").length || 0}/{s.tasks?.length || 0} tasks · {s.files?.length || 0}{" "}
                files · {s.sessions?.length || 0} session(s)
              </p>
              {s.readiness?.missing?.length ? (
                <p className="mt-2 text-xs text-ink-soft">Missing: {(s.readiness.missing as string[]).map(humanizeMissing).join(" · ")}</p>
              ) : (
                <p className="mt-2 text-xs text-ink">Ready for showtime</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/app/speakers/${s.speakerId}`}>Open</Link>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await api.inviteSpeaker(s.speakerId);
                    toast(`Portal invite logged for ${s.name}`);
                    load();
                  }}
                >
                  Send invite
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await api.sendComms({ templateKey: "task_reminder", speakerId: s.speakerId });
                    toast(`Reminder sent to ${s.name}`);
                    load();
                  }}
                >
                  Nudge
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd ? (
        <Modal title="Add speaker" onClose={() => setShowAdd(false)}>
          {(["name", "email", "title", "company"] as const).map((k) => (
            <Field key={k} label={k}>
              <Input value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </Field>
          ))}
          <Field label="Bio">
            <Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </Field>
          <Field label="Travel preference">
            <Input value={form.travelPreference} onChange={(e) => setForm({ ...form, travelPreference: e.target.value })} />
          </Field>
          <Button
            onClick={async () => {
              try {
                await api.addSpeaker({ ...form, sendInvite: true });
                toast("Speaker added + invite logged");
                setShowAdd(false);
                setForm({ name: "", email: "", title: "", company: "", bio: "", travelPreference: "" });
                load();
              } catch (e: any) {
                toast(e.message || "Failed", "danger");
              }
            }}
          >
            Save & invite
          </Button>
        </Modal>
      ) : null}

      {showImport ? (
        <Modal title="Import speakers CSV" onClose={() => setShowImport(false)}>
          <Field label="CSV" hint="Columns: name, email, title, company, bio (dedupes by email)">
            <Textarea className="font-mono text-xs" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} />
          </Field>
          <Button
            onClick={async () => {
              try {
                const r = await api.importSpeakers(csv);
                toast(`Import: ${r.data.created} created, ${r.data.updated} updated, ${r.data.skipped} skipped`);
                setShowImport(false);
                load();
              } catch (e: any) {
                toast(e.message || "Import failed", "danger");
              }
            }}
          >
            Import
          </Button>
        </Modal>
      ) : null}

      {showTask ? (
        <Modal title="Assign general task" onClose={() => setShowTask(false)}>
          <Field label="Title">
            <Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={taskForm.dueAt} onChange={(e) => setTaskForm({ ...taskForm, dueAt: e.target.value })} />
          </Field>
          <Field label="Type">
            <select
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
              value={taskForm.type}
              onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}
            >
              <option value="confirm">Action / confirm</option>
              <option value="form">Form</option>
              <option value="profile">Profile</option>
            </select>
          </Field>
          <p className="mb-3 text-xs text-mid">
            Assignees: {selected.length ? `${selected.length} selected` : `all ${rows.length} visible speakers`}
          </p>
          <Button
            onClick={async () => {
              const speakerIds = selected.length ? selected : rows.map((r) => r.speakerId);
              const dueAt = taskForm.dueAt.includes("T") ? taskForm.dueAt : `${taskForm.dueAt}T23:59:59.000Z`;
              try {
                const r = await api.assignSpeakerTasks({ ...taskForm, dueAt, speakerIds });
                toast(`Assigned ${r.data.length} task(s)`);
                setShowTask(false);
                load();
              } catch (e: any) {
                toast(e.message || "Assign failed", "danger");
              }
            }}
          >
            Assign
          </Button>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{title}</h3>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </Card>
    </div>
  );
}

export function SpeakerDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<any>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<any>(null);

  const load = () =>
    api
      .speakerDetail(id!)
      .then((r) => {
        setRow(r.data);
        setEdit({
          name: r.data.name,
          email: r.data.email,
          title: r.data.title || "",
          company: r.data.company || "",
          bio: r.data.bio || "",
          linkedin: r.data.linkedin || "",
          website: r.data.website || "",
          travelPreference: r.data.travelPreference || "",
          dietary: r.data.dietary || "",
          workflowStatus: r.data.workflowStatus || "accepted",
        });
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    return subscribeData(load);
  }, [id]);

  if (!row && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;
  if (!row) return <Notice tone="danger">Speaker not found</Notice>;

  return (
    <div>
      <PageHeader
        title={row.name}
        description={`${row.email} · onboarding ${row.readiness?.pct ?? 0}%`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => api.inviteSpeaker(row.speakerId).then(() => toast("Invite logged"))}>
              Send portal invite
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/speakers">Back</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Profile</h3>
          {edit ? (
            <>
              {(["name", "email", "title", "company", "linkedin", "website", "travelPreference", "dietary"] as const).map((k) => (
                <Field key={k} label={k}>
                  <Input value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                </Field>
              ))}
              <Field label="Bio">
                <Textarea rows={4} value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} />
              </Field>
              <Field label="Workflow status">
                <select
                  className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
                  value={edit.workflowStatus}
                  onChange={(e) => setEdit({ ...edit, workflowStatus: e.target.value })}
                >
                  {["invited", "confirmed", "accepted", "declined", "withdrawn"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                onClick={async () => {
                  await api.updateSpeaker(row.speakerId, edit);
                  toast("Speaker saved");
                  load();
                }}
              >
                Save changes
              </Button>
            </>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Sessions</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(row.sessions || []).map((s: any) => (
                <li key={s.id} className="rounded-lg border border-line p-2">
                  <b>{s.title}</b>
                  <div className="text-xs text-mid">
                    {s.status}
                    {s.slot ? ` · ${s.slot.startsAt}` : " · unscheduled"}
                  </div>
                </li>
              ))}
              {!row.sessions?.length ? <li className="text-mid">No session assignment yet.</li> : null}
            </ul>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Tasks</h3>
            <ul className="mt-3 divide-y">
              {row.tasks?.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <b>{t.title}</b>
                    <div className="text-xs text-mid">
                      {taskTypeLabel(t.type)} · due {t.dueAt?.slice(0, 10)}
                      {t.formAnswers && Object.keys(t.formAnswers).length ? ` · form submitted` : ""}
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </li>
              ))}
              {!row.tasks?.length ? <li className="py-4 text-sm text-mid">No onboarding tasks.</li> : null}
            </ul>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Files / deliverables</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(row.files || []).map((f: any) => (
                <li key={f.id} className="rounded border border-line p-2">
                  <b>{f.name}</b>
                  <div className="text-xs text-mid">
                    {f.kind} · {f.createdAt?.slice(0, 19)} · {f.visibility}
                  </div>
                  {f.kind === "headshot" && (row.headshotUrl || row.profile?.headshotUrl) ? (
                    <a
                      className="mt-1 inline-block text-xs font-semibold text-ink underline"
                      href={row.headshotUrl || row.profile?.headshotUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View / download headshot
                    </a>
                  ) : f.kind === "headshot" && (row.headshotName || f.name) ? (
                    <span className="mt-1 block text-xs text-mid">Metadata only (no binary stored for seed file)</span>
                  ) : null}
                </li>
              ))}
              {(row.contentFiles || []).map((f: any) => (
                <li key={f.id} className="rounded border border-line p-2">
                  <b>{f.currentVersion?.name || f.id}</b>
                  <div className="text-xs text-mid">
                    content · {f.status} · {f.currentVersion?.uploadedAt?.slice(0, 19)}
                  </div>
                  {f.currentVersion ? (
                    <a className="text-xs font-semibold text-ink underline" href={`/api/content/files/${f.id}/versions/${f.currentVersion.id}`}>
                      View / download
                    </a>
                  ) : null}
                </li>
              ))}
              {!row.files?.length && !row.contentFiles?.length && !(row.headshotUrl || row.profile?.headshotUrl) ? (
                <li className="text-mid">No files yet.</li>
              ) : null}
              {!row.files?.some((f: any) => f.kind === "headshot") && (row.headshotUrl || row.profile?.headshotUrl) ? (
                <li className="rounded border border-line p-2">
                  <b>{row.headshotName || "headshot.png"}</b>
                  <div className="text-xs text-mid">headshot · profile</div>
                  <a
                    className="mt-1 inline-block text-xs font-semibold text-ink underline"
                    href={row.headshotUrl || row.profile?.headshotUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View / download headshot
                  </a>
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function CommsPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(null);
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
    setSelected((ids) => (ids.length ? ids : s.data[0]?.speakerId ? [s.data[0].speakerId] : []));
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message));
    return subscribeData(() => {
      load().catch(() => {});
    });
  }, []);

  const allSelected = useMemo(() => speakers.length > 0 && selected.length === speakers.length, [speakers, selected]);

  if (!active && !err) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Comms"
        description="Templated bulk email with merge fields, per-recipient delivery log, and honest mock vs provider status. ICS is downloadable — not auto-delivered to calendars."
        actions={
          <Button
            variant="secondary"
            onClick={async () => {
              const r = await api.runTaskReminders();
              toast(`Automated reminders: ${r.data.count} speaker(s), ${r.data.planned} task(s)`);
              load();
            }}
          >
            Run due-task reminders
          </Button>
        }
      />
      {err ? <Notice tone="danger">{err}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-[200px_1fr_1fr]">
        <Card className="p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mid">Templates</h3>
          <div className="space-y-1">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${active?.id === t.id ? "bg-ink text-white" : "hover:bg-canvas"}`}
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
                <Input value={active.subject} onChange={(e) => setActive({ ...active, subject: e.target.value })} />
              </Field>
              <Field label="Body" hint="Merge: {{first_name}} {{name}} {{talk_title}} {{portal_link}} {{calendar_links}} {{company}} {{event_name}}">
                <Textarea rows={10} value={active.body} onChange={(e) => setActive({ ...active, body: e.target.value })} />
              </Field>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!active.includeCalendarLinks}
                  onChange={(e) => setActive({ ...active, includeCalendarLinks: e.target.checked })}
                />
                Include calendar invitation language (downloadable ICS — not calendar push)
              </label>

              <div className="mb-3 max-h-40 space-y-1 overflow-auto rounded-lg border border-line p-2">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? speakers.map((s) => s.speakerId) : [])}
                  />
                  All speakers ({speakers.length})
                </label>
                {speakers.map((s) => (
                  <label key={s.speakerId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(s.speakerId)}
                      onChange={() =>
                        setSelected((prev) => (prev.includes(s.speakerId) ? prev.filter((x) => x !== s.speakerId) : [...prev, s.speakerId]))
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>

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
                <Button
                  variant="secondary"
                  disabled={!selected[0]}
                  onClick={async () => {
                    const r = await api.commsPreview({
                      templateKey: active.key,
                      subject: active.subject,
                      body: active.body,
                      includeCalendarLinks: active.includeCalendarLinks,
                      speakerId: selected[0],
                    });
                    setPreview(r.data);
                  }}
                >
                  Preview merge
                </Button>
                <Button
                  variant="secondary"
                  disabled={!selected.length}
                  onClick={async () => {
                    const r = await api.sendComms({
                      templateKey: active.key,
                      speakerIds: selected,
                      subject: active.subject,
                      body: active.body,
                      includeCalendarLinks: active.includeCalendarLinks,
                    });
                    const n = Array.isArray(r.data) ? r.data.length : r.data?.count || selected.length;
                    toast(`Logged ${n} send(s)`);
                    load();
                  }}
                >
                  Send to selected
                </Button>
              </div>

              {preview ? (
                <div className="mt-4 rounded-[18px] border border-line bg-soft p-3 text-sm">
                  <div className="text-xs font-bold uppercase text-ink">Per-recipient preview</div>
                  <div className="mt-1 font-semibold">{preview.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-ink-soft">{preview.body}</pre>
                </div>
              ) : null}
            </>
          ) : null}
        </Card>

        <Card className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Per-recipient send log</h3>
          <ul className="mt-3 max-h-[520px] space-y-2 overflow-auto">
            {log.map((c) => (
              <li key={c.id} className="rounded-[18px] border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <b>{c.subject}</b>
                  <StatusBadge status={c.status || "mock_sent"} />
                </div>
                <p className="mt-1 text-xs text-mid">
                  {c.recipientName || c.speakerId} · {c.recipientEmail || "no email"} · {formatStatus(c.kind)} · {c.createdAt}
                </p>
                <p className="mt-1 text-[11px] text-mid">{c.deliveryNote || (c.status === "mock_sent" ? "Mock delivery" : "")}</p>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-mid">{c.body}</p>
                <a className="mt-2 inline-block text-xs font-semibold text-ink" href={`/api/communications/${c.id}/calendar.ics`}>
                  Download ICS (not calendar-push)
                </a>
              </li>
            ))}
            {!log.length ? (
              <li>
                <EmptyState title="No sends yet" description="Send a template or accept a talk to populate the log." />
              </li>
            ) : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}
