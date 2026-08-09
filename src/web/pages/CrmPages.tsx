import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, subscribeData } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  toast,
} from "../components/ui";

function CrmSubnav() {
  const link = "rounded-lg px-3 py-1.5 text-sm font-medium text-mid hover:bg-canvas";
  const active = "bg-canvas text-ink";
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-line pb-3">
      <NavLink to="/app/crm" end className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
        Directory
      </NavLink>
      <NavLink to="/app/crm/pipeline" className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
        Pipeline
      </NavLink>
      <NavLink to="/app/crm/segments" className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
        Segments
      </NavLink>
      <NavLink to="/app/crm/import" className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
        Import
      </NavLink>
      <NavLink to="/app/crm/campaigns" className={({ isActive }) => `${link} ${isActive ? active : ""}`}>
        Campaigns
      </NavLink>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const tone =
    stage === "confirmed" || stage === "alumni"
      ? "ok"
      : stage === "declined"
        ? "danger"
        : stage === "invited" || stage === "contacted"
          ? "warn"
          : "muted";
  return <Badge tone={tone as any}>{stage}</Badge>;
}

export function CrmDirectoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ total?: number; filtered?: number }>({});
  const [dash, setDash] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [company, setCompany] = useState("");
  const [stage, setStage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("Hello {{first_name}} — {{event_name}}");
  const [body, setBody] = useState("Hi {{name}},\n\nWe'd love to have you speak at {{event_name}}.\n\n— Program team");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const load = () => {
    const params = {
      q: q || undefined,
      tag: tag || undefined,
      company: company || undefined,
      stage: stage || searchParams.get("stage") || undefined,
      tags: searchParams.get("tags") || undefined,
    };
    return Promise.all([api.crmContacts(params), api.crmDashboard()])
      .then(([c, d]) => {
        setRows(c.data);
        setMeta(c.meta || {});
        setDash(d.data);
        setLoaded(true);
      })
      .catch((e) => {
        setErr(e.message);
        setLoaded(true);
      });
  };

  useEffect(() => {
    load();
    return subscribeData(load);
  }, [q, tag, company, stage, searchParams]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (!loaded) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Speaker CRM"
        description="Organization-level speaker directory across events — contacts, pipeline, segments, and import."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => api.crmSyncSpeakers().then(load).then(() => toast("Synced event speakers"))}>
              Sync event speakers
            </Button>
            <Button
              variant="secondary"
              disabled={!selected.length}
              onClick={() => setComposeOpen(true)}
            >
              Communicate ({selected.length})
            </Button>
          </div>
        }
      />
      <CrmSubnav />
      {err ? <Notice tone="danger">{err}</Notice> : null}

      {dash ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-mid">Contacts</p>
            <p className="mt-1 text-2xl font-bold">{dash.totalContacts}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-mid">Segments</p>
            <p className="mt-1 text-2xl font-bold">{dash.segments}</p>
          </Card>
          <Link to="/app/crm/campaigns" className="block">
            <Card className="p-4 transition hover:border-ink/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-mid">Campaigns</p>
              <p className="mt-1 text-2xl font-bold">{dash.campaigns}</p>
              <p className="mt-1 text-xs text-mid">View history →</p>
            </Card>
          </Link>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-mid">Top tag</p>
            <p className="mt-1 text-lg font-bold">{dash.topTags?.[0]?.name || "—"}</p>
          </Card>
        </div>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, company…" />
          </Field>
          <Field label="Tag">
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. agents" />
          </Field>
          <Field label="Company">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Exact company" />
          </Field>
          <Field label="Stage">
            <select
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="">All stages</option>
              {["prospect", "contacted", "invited", "confirmed", "alumni", "declined"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-mid">
          Showing {meta.filtered ?? rows.length} of {meta.total ?? rows.length} contacts
        </p>
      </Card>

      <Card className="mb-4 p-4">
        <h3 className="mb-2 text-sm font-bold">Add contact</h3>
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input className="max-w-xs" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Button
            onClick={async () => {
              try {
                const r = await api.crmCreateContact({ name: newName, email: newEmail });
                toast("Contact created");
                setNewName("");
                setNewEmail("");
                navigate(`/app/crm/contacts/${r.data.id}`);
              } catch (e: any) {
                toast(e.message || "Create failed", "danger");
              }
            }}
          >
            Create
          </Button>
        </div>
      </Card>

      {!rows.length ? (
        <EmptyState title="No contacts match" description="Adjust filters or import a CSV." />
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-line bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-soft text-xs uppercase tracking-wide text-mid">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.length === rows.length && rows.length > 0}
                    onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                  />
                </th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2">Events</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line hover:bg-soft">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <Link className="font-semibold text-ink hover:underline" to={`/app/crm/contacts/${r.id}`}>
                      {r.name}
                    </Link>
                    <div className="text-xs text-mid">{r.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.company || "—"}</div>
                    <div className="text-xs text-mid">{r.title || ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StageBadge stage={r.stage} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.tags || []).map((t: string) => (
                        <Badge key={t} tone="muted">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-mid">{(r.eventHistory || []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {composeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
            <h3 className="text-lg font-bold">Bulk communicate</h3>
            <p className="mt-1 text-sm text-mid">
              {selected.length} recipient(s). Merge tags: {"{{name}}"}, {"{{first_name}}"}, {"{{company}}"}, {"{{event_name}}"}.
            </p>
            <div className="mt-3"><Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field></div>
            <div className="mt-3"><Field label="Body">
              <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field></div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setComposeOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const r = await api.crmCommunicate({ contactIds: selected, subject, body });
                    toast(`Sent to ${r.data.sends.length} contact(s)`);
                    setComposeOpen(false);
                    setSelected([]);
                    load();
                  } catch (e: any) {
                    toast(e.message || "Send failed", "danger");
                  }
                }}
              >
                Send now
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

export function CrmContactPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState<any>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [eventRole,setEventRole]=useState("speaker");
  const [noteBusy, setNoteBusy] = useState(false);
  const [dupes, setDupes] = useState<any[]>([]);
  const [cfKey, setCfKey] = useState("");
  const [cfVal, setCfVal] = useState("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});

  const load = () =>
    Promise.all([api.crmContact(id!), api.crmContacts().catch(() => ({ data: [] }))])
      .then(([r, list]) => {
        setContact(r.data);
        setEditFields(r.data.customFields || {});
        const email = String(r.data.email || "").toLowerCase();
        const name = String(r.data.name || "").toLowerCase();
        setDupes(
          (list.data || []).filter(
            (c: any) =>
              c.id !== r.data.id &&
              ((email && String(c.email || "").toLowerCase() === email) ||
                (name && String(c.name || "").toLowerCase() === name)),
          ),
        );
        setLoaded(true);
      })
      .catch((e) => {
        setErr(e.message);
        setLoaded(true);
      });

  useEffect(() => {
    load();
    return subscribeData(load);
  }, [id]);

  if (!loaded) return <Spinner />;
  if (!contact) return <Notice tone="danger">{err || "Contact not found"}</Notice>;

  const nextStages = ["prospect", "contacted", "invited", "confirmed", "alumni", "declined"];
  return (
    <div>
      <PageHeader
        title={contact.name}
        description={`${contact.email} · org-level CRM profile`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate("/app/crm")}>
              Back to directory
            </Button>
            <Select value={eventRole} onChange={e=>setEventRole(e.target.value)} aria-label="Event role"><option value="speaker">Speaker</option><option value="reviewer">Reviewer</option></Select>
            <Button
              onClick={async () => {
                try {
                  const r = await api.crmAddToEvent(contact.id,{role:eventRole});
                  toast(r.data.created ? `Added to event as ${eventRole}` : "Already linked to event");
                  load();
                } catch (e: any) {
                  toast(e.message || "Handoff failed", "danger");
                }
              }}
            >
              Add to event
            </Button>
          </div>
        }
      />
      <CrmSubnav />
      {err ? <Notice tone="danger">{err}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={contact.stage} />
            <span className="text-sm text-mid">{contact.title}</span>
            {contact.company ? <span className="text-sm font-medium">@ {contact.company}</span> : null}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{contact.bio || "No bio yet."}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {(contact.tags || []).map((t: string) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              className="max-w-[10rem]"
              placeholder="Add tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                if (!tagInput.trim()) return;
                await api.crmUpdateContact(contact.id, { tags: [...(contact.tags || []), tagInput.trim()] });
                setTagInput("");
                toast("Tag added");
                load();
              }}
            >
              Save tag
            </Button>
          </div>

          <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-mid">Move stage</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {nextStages.map((s) => (
              <Button
                key={s}
                variant={s === contact.stage ? "default" : "secondary"}
                disabled={s === contact.stage}
                onClick={async () => {
                  try {
                    await api.crmMoveStage(contact.id, s);
                    toast(`Moved to ${s}`);
                    load();
                  } catch (e: any) {
                    toast(e.message || "Invalid transition", "danger");
                  }
                }}
              >
                {s}
              </Button>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-mid">Notes</h3>
          <div className="mt-2 flex gap-2">
            <Textarea className="flex-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note…" />
            <Button
              disabled={noteBusy || !note.trim()}
              onClick={async () => {
                if (noteBusy || !note.trim()) return;
                setNoteBusy(true);
                try {
                  await api.crmAddNote(contact.id, note.trim());
                  setNote("");
                  toast("Note saved");
                  await load();
                } catch (e: any) {
                  toast(e.message || "Note failed", "danger");
                } finally {
                  setNoteBusy(false);
                }
              }}
            >
              {noteBusy ? "Saving…" : "Add"}
            </Button>
          </div>
          <ul className="mt-3 space-y-2">
            {(contact.notes || []).map((n: any) => (
              <li key={n.id} className="rounded-lg border border-line bg-soft p-3 text-sm">
                <div className="text-xs text-mid">
                  {n.authorName} · {new Date(n.createdAt).toLocaleString()}
                </div>
                <div className="mt-1">{n.body}</div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Event history</h3>
            {(contact.eventHistory || []).length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {contact.eventHistory.map((e: any, i: number) => (
                  <li key={i} className="rounded-lg border border-line p-2">
                    <div className="font-semibold">{e.eventName}</div>
                    <div className="text-xs text-mid">
                      {e.role} · {e.status}
                      {e.speakerId ? ` · ${e.speakerId}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-mid">No linked events yet.</p>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Stage timeline</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(contact.stageHistory || [])
                .slice()
                .reverse()
                .map((h: any) => (
                  <li key={h.id} className="border-l-2 border-line pl-3">
                    <div className="font-medium">
                      {h.from || "—"} → {h.to}
                    </div>
                    <div className="text-xs text-mid">
                      {new Date(h.at).toLocaleString()}
                      {h.byName ? ` · ${h.byName}` : ""}
                    </div>
                    {h.note ? <div className="text-xs text-mid">{h.note}</div> : null}
                  </li>
                ))}
            </ul>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Custom fields</h3>
            <dl className="mt-2 space-y-2 text-sm">
              {Object.entries(editFields).map(([k, v]) => (
                <div key={k} className="grid gap-1">
                  <dt className="text-xs text-mid">{k}</dt>
                  <div className="flex gap-2">
                    <Input
                      value={String(v)}
                      onChange={(e) => setEditFields((f) => ({ ...f, [k]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const next = { ...editFields };
                        delete next[k];
                        await api.crmUpdateContact(contact.id, { customFields: next });
                        setEditFields(next);
                        toast("Field removed");
                        load();
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              {!Object.keys(editFields).length ? <p className="text-mid">No custom fields yet.</p> : null}
            </dl>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input placeholder="Field name" value={cfKey} onChange={(e) => setCfKey(e.target.value)} />
              <Input placeholder="Value" value={cfVal} onChange={(e) => setCfVal(e.target.value)} />
              <Button
                size="sm"
                onClick={async () => {
                  if (!cfKey.trim()) return;
                  const next = { ...editFields, [cfKey.trim()]: cfVal };
                  await api.crmUpdateContact(contact.id, { customFields: next });
                  setEditFields(next);
                  setCfKey("");
                  setCfVal("");
                  toast("Custom field saved");
                  load();
                }}
              >
                Add
              </Button>
            </div>
            {Object.keys(editFields).length ? (
              <Button
                className="mt-3"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await api.crmUpdateContact(contact.id, { customFields: editFields });
                  toast("Custom fields saved");
                  load();
                }}
              >
                Save field values
              </Button>
            ) : null}
          </Card>

          {dupes.length ? (
            <Card className="p-4 border-line">
              <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Possible duplicates</h3>
              <p className="mt-1 text-xs text-mid">Same name or email as this contact.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {dupes.map((d) => (
                  <li key={d.id} className="rounded-lg border border-line p-2">
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-xs text-mid">{d.email}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link to={`/app/crm/contacts/${d.id}`}>Open</Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await api.crmMerge(contact.id, d.id);
                            toast(`Merged ${d.name} into this contact`);
                            load();
                          } catch (e: any) {
                            toast(e.message || "Merge failed", "danger");
                          }
                        }}
                      >
                        Merge into this
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CrmPipelinePage() {
  const [columns, setColumns] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () =>
    api
      .crmPipeline()
      .then((r) => {
        setColumns(r.data.columns || []);
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
      <PageHeader title="Sourcing pipeline" description="Kanban-style stages for speaker prospects. Move cards with stage buttons." />
      <CrmSubnav />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.id} className="w-64 shrink-0 rounded-[18px] border border-line bg-soft p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">{col.label}</h3>
              <Badge tone="muted">{col.contacts?.length || 0}</Badge>
            </div>
            <div className="space-y-2">
              {(col.contacts || []).map((c: any) => (
                <Card key={c.id} className="p-3 shadow-sm">
                  <Link to={`/app/crm/contacts/${c.id}`} className="font-semibold text-ink hover:underline">
                    {c.name}
                  </Link>
                  <p className="text-xs text-mid">{c.company || c.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(c.tags || []).slice(0, 3).map((t: string) => (
                      <Badge key={t} tone="muted">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {["prospect", "contacted", "invited", "confirmed", "alumni", "declined"]
                      .filter((s) => s !== c.stage)
                      .slice(0, 3)
                      .map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mid ring-1 ring-line hover:bg-canvas"
                          onClick={async () => {
                            try {
                              await api.crmMoveStage(c.id, s);
                              load();
                            } catch (e: any) {
                              toast(e.message || "Cannot move", "danger");
                            }
                          }}
                        >
                          → {s}
                        </button>
                      ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CrmSegmentsPage() {
  const [segments, setSegments] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [stage, setStage] = useState("confirmed");
  const [tag, setTag] = useState("");
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  const load = () =>
    api
      .crmSegments()
      .then((r) => {
        setSegments(r.data);
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
      <PageHeader title="Segments" description="Saved filters for outreach and pipeline lists." />
      <CrmSubnav />
      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Card className="mb-4 p-4">
        <h3 className="mb-2 text-sm font-bold">Save segment</h3>
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="">Any stage</option>
            {["prospect", "contacted", "invited", "confirmed", "alumni", "declined"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Input className="max-w-[10rem]" placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
          <Button
            onClick={async () => {
              try {
                await api.crmSaveSegment({
                  name,
                  filters: { stage: stage || undefined, tag: tag || undefined },
                });
                setName("");
                toast("Segment saved");
                load();
              } catch (e: any) {
                toast(e.message || "Save failed", "danger");
              }
            }}
          >
            Save
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {segments.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold">{s.name}</h3>
                <p className="text-xs text-mid">{s.description || JSON.stringify(s.filters)}</p>
              </div>
              <Badge>{s.count} contacts</Badge>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (s.filters?.stage) params.set("stage", s.filters.stage);
                  if (s.filters?.tag) params.set("tag", s.filters.tag);
                  if (s.filters?.tagsAny?.length) params.set("tags", s.filters.tagsAny.join(","));
                  if (s.filters?.q) params.set("q", s.filters.q);
                  navigate(`/app/crm?${params.toString()}`);
                }}
              >
                Open in directory
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await api.crmDeleteSegment(s.id);
                  toast("Segment deleted");
                  load();
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CrmImportPage() {
  const [csv, setCsv] = useState(
    "name,email,title,company,bio\nAva Chen,ava.chen@example.test,Staff Engineer,Northstar,Platform talks\nBad Row,,Engineer,Acme,Missing email\nAda Lovelace,ada@example.test,Principal Engineer,Analytical Engines,Duplicate of seed",
  );
  const [results, setResults] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [merge, setMerge] = useState(true);
  const [err, setErr] = useState("");

  return (
    <div>
      <PageHeader
        title="Import contacts"
        description="Paste CSV with name, email, title, company, bio. Validation runs before commit; duplicates match on email."
      />
      <CrmSubnav />
      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Card className="p-4">
        <Field label="Upload CSV file">
          <input
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              setCsv(text);
              toast(`Loaded ${f.name}`);
            }}
          />
        </Field>
        <Field label="CSV (paste or edit)">
          <Textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" />
        </Field>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
          Merge duplicates by email (update blank/overlapping fields)
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const r = await api.crmValidateImport(csv);
                setResults(r.data);
                setSummary(null);
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            Validate
          </Button>
          <Button
            onClick={async () => {
              try {
                const r = await api.crmImport(csv, merge);
                setResults(r.data.results);
                setSummary(r.data);
                toast(`Import: ${r.data.created} created, ${r.data.merged} merged, ${r.data.skipped} skipped`);
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            Import
          </Button>
        </div>
      </Card>

      {summary ? (
        <div className="mt-4">
          <Notice tone="ok">
            Created {summary.created}, merged {summary.merged}, skipped {summary.skipped}
          </Notice>
        </div>
      ) : null}

      {results ? (
        <div className="mt-4 overflow-x-auto rounded-[18px] border border-line bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-soft text-xs uppercase text-mid">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.row} className="border-b border-line">
                  <td className="px-3 py-2">{r.row}</td>
                  <td className="px-3 py-2">{r.raw?.name}</td>
                  <td className="px-3 py-2">{r.raw?.email}</td>
                  <td className="px-3 py-2">
                    <Badge tone={r.ok ? "ok" : "danger"}>{r.action || (r.ok ? "ok" : "error")}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-mid">{r.error || r.duplicateOf || r.contactId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}


export function CrmCampaignsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api
      .crmCampaigns()
      .then((r) => {
        setRows(r.data || []);
        setLoaded(true);
      })
      .catch((e) => {
        setErr(e.message);
        setLoaded(true);
      });
  }, []);
  if (!loaded) return <Spinner />;
  return (
    <div>
      <PageHeader
        title="Campaign history"
        description="Outbound CRM campaigns and bulk communications logged for this organization."
      />
      <CrmSubnav />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <div className="space-y-3">
        {rows.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{c.name || c.subject || c.id}</h3>
                <p className="text-xs text-mid">
                  {c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}
                  {c.recipientCount != null ? ` · ${c.recipientCount} recipient(s)` : ""}
                  {c.status ? ` · ${c.status}` : ""}
                </p>
              </div>
              {c.status ? <Badge>{c.status}</Badge> : null}
            </div>
            {c.subject ? <p className="mt-2 text-sm font-medium">{c.subject}</p> : null}
            {c.body ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-mid">{c.body}</p> : null}
          </Card>
        ))}
        {!rows.length ? (
          <EmptyState title="No campaigns yet" description="Send a CRM communicate action to populate history." />
        ) : null}
      </div>
    </div>
  );
}
