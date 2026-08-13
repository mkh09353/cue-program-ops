import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, getEventId, subscribeData, type EventSummary } from "../lib/api";
import { cn } from "../lib/utils";
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

/**
 * Stage transition rules, mirrored from CRM_STAGE_TRANSITIONS in src/crm.ts so the
 * board can mute invalid drop targets without pulling the server module (and the
 * whole lifecycle seed) into the browser bundle.
 * test/crm-pipeline-dnd.test.ts fails if the two ever diverge.
 */
export const CRM_STAGE_TRANSITIONS: Record<string, string[]> = {
  prospect: ["contacted", "invited", "declined"],
  contacted: ["invited", "prospect", "declined"],
  invited: ["confirmed", "contacted", "declined"],
  confirmed: ["alumni", "invited", "declined"],
  alumni: ["prospect", "invited"],
  declined: ["prospect", "contacted"],
};


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

export const toggleCrmSelection = (selected: string[], id: string) =>
  selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
export const canBulkCommunicate = (selected: string[]) => selected.length >= 2;

export function CrmDirectoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [allRows, setAllRows] = useState<any[]>([]);
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
    return Promise.all([api.crmContacts(params), api.crmDashboard(), api.crmContacts()])
      .then(([c, d, all]) => {
        setRows(c.data);
        setAllRows(all.data || []);
        setSelected((current) => current.filter((id) => c.data.some((row: any) => row.id === id)));
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

  // Options are derived from real contact data, so a chosen value always matches rows.
  const facetTags = [...new Set(allRows.flatMap((row: any) => row.tags || []))].filter(Boolean).sort();
  const facetCompanies = [...new Set(allRows.map((row: any) => row.company).filter(Boolean))].sort();
  const activeFilters = [
    q ? `search "${q}"` : "",
    tag ? `tag ${tag}` : "",
    company ? `company ${company}` : "",
    stage ? `stage ${stage}` : "",
  ].filter(Boolean);

  const toggle = (id: string) =>
    setSelected((prev) => toggleCrmSelection(prev, id));

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
              disabled={!canBulkCommunicate(selected)}
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
          <button
            type="button"
            className="text-left"
            data-testid="kpi-contacts"
            onClick={() => {
              setQ("");
              setTag("");
              setCompany("");
              setStage("");
            }}
          >
            <Card className="p-4 transition hover:border-ink/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-mid">Contacts</p>
              <p className="mt-1 text-2xl font-bold">{dash.totalContacts}</p>
              <p className="mt-1 text-xs text-mid">Show all →</p>
            </Card>
          </button>
          <Link to="/app/crm/segments" className="block" data-testid="kpi-segments">
            <Card className="p-4 transition hover:border-ink/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-mid">Segments</p>
              <p className="mt-1 text-2xl font-bold">{dash.segments}</p>
              <p className="mt-1 text-xs text-mid">Manage segments →</p>
            </Card>
          </Link>
          <Link to="/app/crm/campaigns" className="block">
            <Card className="p-4 transition hover:border-ink/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-mid">Campaigns</p>
              <p className="mt-1 text-2xl font-bold">{dash.campaigns}</p>
              <p className="mt-1 text-xs text-mid">View history →</p>
            </Card>
          </Link>
          <button type="button" className="text-left" data-testid="kpi-top-tag" onClick={() => setTag(dash.topTags?.[0]?.name || "")}>
            <Card className="p-4 transition hover:border-ink/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-mid">Top tag</p>
              <p className="mt-1 text-lg font-bold">{dash.topTags?.[0]?.name || "—"}</p>
              <p className="mt-1 text-xs text-mid">Filter by this tag →</p>
            </Card>
          </button>
        </div>
      ) : null}

      {dash?.stageBars?.length ? (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          <Card className="p-4" data-testid="crm-stage-bars">
            <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Contacts by stage</h3>
            <ul className="mt-3 space-y-2">
              {dash.stageBars.map((bar: any) => {
                const max = Math.max(1, ...dash.stageBars.map((x: any) => x.count));
                return (
                  <li key={bar.id}>
                    <button
                      type="button"
                      className="w-full text-left"
                      aria-label={`Filter by ${bar.label} (${bar.count})`}
                      onClick={() => setStage(bar.id)}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className={stage === bar.id ? "font-bold text-ink" : "text-mid"}>{bar.label}</span>
                        <span className="font-semibold text-ink">{bar.count}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas" aria-hidden>
                        <div className="h-full bg-ink" style={{ width: `${Math.round((bar.count / max) * 100)}%` }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4" data-testid="crm-activity-feed">
            <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Recent activity</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(dash.recentActivity || []).map((row: any) => (
                <li key={`${row.kind}-${row.id}`} className="rounded-[18px] bg-soft p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="muted">{row.kind === "stage" ? "stage move" : row.kind}</Badge>
                    <span className="text-xs text-mid">{new Date(row.at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1">
                    {row.contactId ? (
                      <Link className="font-semibold underline" to={`/app/crm/contacts/${row.contactId}`}>
                        {row.contactName}
                      </Link>
                    ) : null}
                    {row.contactId ? " · " : ""}
                    {row.summary}
                  </p>
                  {row.by ? <p className="text-xs text-mid">by {row.by}</p> : null}
                </li>
              ))}
              {!(dash.recentActivity || []).length ? (
                <li className="text-sm text-mid">No notes, stage moves or campaigns yet.</li>
              ) : null}
            </ul>
          </Card>
        </div>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, company…" />
          </Field>
          <Field label="Tag" hint="Options come from tags actually in use.">
            <select
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
              aria-label="Filter by tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">All tags ({facetTags.length})</option>
              {facetTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Company" hint="Companies on existing contacts — no free text.">
            <select
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
              aria-label="Filter by company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">All companies ({facetCompanies.length})</option>
              {facetCompanies.map((cName) => (
                <option key={cName} value={cName}>{cName}</option>
              ))}
            </select>
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-mid" data-testid="crm-result-count">
            Showing <b className="text-ink">{meta.filtered ?? rows.length}</b> of {meta.total ?? rows.length} contacts
            {activeFilters.length ? ` · filtered by ${activeFilters.join(" · ")}` : " · no filters"}
          </p>
          {activeFilters.length ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="crm-clear-filters"
              onClick={() => {
                setQ("");
                setTag("");
                setCompany("");
                setStage("");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        {activeFilters.length && (meta.filtered ?? rows.length) === 0 ? (
          <Notice tone="warn">
            No contacts match these filters. Tag and Company only offer values that exist on current contacts — clear the
            filters to see all {meta.total ?? rows.length}.
          </Notice>
        ) : null}
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
                    aria-label="Select all visible contacts"
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
                    <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.includes(r.id)} onChange={(e) => { e.stopPropagation(); toggle(r.id); }} />
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
  // The CRM is org-level: a contact can be handed off to ANY event.
  const [eventId,setEventId]=useState(()=>getEventId());
  const [eventOptions,setEventOptions]=useState<EventSummary[]>([]);
  useEffect(()=>{api.events().then(r=>{const list=r.data||[];setEventOptions(list);setEventId(cur=>list.some(e=>e.id===cur)?cur:(list[0]?.id||cur))}).catch(()=>{})},[]);
  const eventName=(id:string)=>eventOptions.find(e=>e.id===id)?.name||id;
  const [handoff,setHandoff]=useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteSaved, setNoteSaved] = useState<{ body: string; author: string; at: string } | null>(null);
  const [dupes, setDupes] = useState<any[]>([]);
  const [cfKey, setCfKey] = useState("");
  const [cfVal, setCfVal] = useState("");
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [fieldDefs, setFieldDefs] = useState<any[]>([]);
  const [cfErr, setCfErr] = useState("");
  useEffect(() => {
    api.crmFieldDefinitions().then((r) => setFieldDefs(r.data)).catch(() => {});
  }, []);

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
            <Select value={eventId} onChange={e=>setEventId(e.target.value)} aria-label="Event" data-testid="crm-event-picker">
              {(eventOptions.length?eventOptions:[{id:eventId,name:eventName(eventId)} as EventSummary]).map(e=>(
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
            <Select value={eventRole} onChange={e=>setEventRole(e.target.value)} aria-label="Event role"><option value="speaker">Speaker</option><option value="reviewer">Reviewer</option></Select>
            <Button
              onClick={async () => {
                try {
                  const r:any = await api.crmAddToEvent(contact.id,{eventId,role:eventRole});
                  const linked=r.data.speakerId||r.data.reviewerId;
                  setHandoff(`${r.data.created?"Created":"Linked"} ${eventRole}: ${contact.name}${linked?` · ${linked}`:""} · ${eventName(eventId)}`);
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
      {handoff ? <Notice tone="ok">{handoff}</Notice> : null}

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
          {noteSaved ? (
            <Notice tone="ok" onClose={() => setNoteSaved(null)}>
              <span className="block font-semibold" data-testid="note-saved">
                Note saved · {noteSaved.author} · {noteSaved.at}
              </span>
              <span className="text-xs">“{noteSaved.body}”</span>
            </Notice>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Textarea className="flex-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note…" />
            <Button
              disabled={noteBusy || !note.trim()}
              onClick={async () => {
                if (noteBusy || !note.trim()) return;
                setNoteBusy(true);
                try {
                  const saved: any = await api.crmAddNote(contact.id, note.trim());
                  const row = saved?.data;
                  // Show it immediately (optimistic) so the activity list never looks empty.
                  if (row) setContact((current: any) => (current ? { ...current, notes: [...(current.notes || []), row] } : current));
                  setNoteSaved({
                    body: row?.body || note.trim(),
                    author: row?.authorName || "You",
                    at: new Date(row?.createdAt || Date.now()).toLocaleTimeString(),
                  });
                  setNote("");
                  toast("Note saved to the activity log");
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
            {cfErr ? <Notice tone="danger" onClose={() => setCfErr("")}>{cfErr}</Notice> : null}
            {fieldDefs.length ? (
              <div className="mt-2 space-y-2" data-testid="crm-defined-fields">
                {fieldDefs.map((def: any) => (
                  <Field key={def.key} label={`${def.label}${def.type === "select" ? " (dropdown)" : ""}`}>
                    {def.type === "select" ? (
                      <Select
                        aria-label={def.label}
                        value={editFields[def.key] || ""}
                        onChange={async (e) => {
                          const next = { ...editFields, [def.key]: e.target.value };
                          setEditFields(next);
                          setCfErr("");
                          try {
                            await api.crmUpdateContact(contact.id, { customFields: next });
                            toast(`${def.label}: ${e.target.value || "cleared"}`);
                            load();
                          } catch (err: any) {
                            setCfErr(err?.message || "Save failed");
                            toast(err?.message || "Save failed", "danger");
                          }
                        }}
                      >
                        <option value="">Not set</option>
                        {(def.options || []).map((o: string) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          aria-label={def.label}
                          value={editFields[def.key] || ""}
                          onChange={(e) => setEditFields((f) => ({ ...f, [def.key]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await api.crmUpdateContact(contact.id, { customFields: editFields });
                              toast(`${def.label} saved`);
                              load();
                            } catch (err: any) {
                              setCfErr(err?.message || "Save failed");
                            }
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    )}
                  </Field>
                ))}
              </div>
            ) : null}
            <dl className="mt-2 space-y-2 text-sm">
              {Object.entries(editFields)
                .filter(([k]) => !fieldDefs.some((d: any) => d.key === k))
                .map(([k, v]) => (
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
              {!Object.keys(editFields).filter((k) => !fieldDefs.some((d: any) => d.key === k)).length ? (
                <p className="text-mid">No ad-hoc custom fields yet.</p>
              ) : null}
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
  const [contacts,setContacts]=useState<any[]>([]);
  const [prospectId,setProspectId]=useState("");
  /** Drag state: which card is in flight, which column is hovered, what just landed. */
  const [dragging, setDragging] = useState<{ id: string; from: string; name: string } | null>(null);
  const [dropTarget, setDropTarget] = useState("");
  const [justMoved, setJustMoved] = useState("");

  const canDrop = (to: string) => !dragging || dragging.from === to || (CRM_STAGE_TRANSITIONS as any)[dragging.from]?.includes(to);

  /** Optimistic move with revert-on-error; the server remains the authority. */
  const moveCard = async (contactId: string, to: string, from: string) => {
    if (from === to) return;
    const snapshot = columns;
    setColumns((prev) =>
      prev.map((col) => {
        if (col.id === from) return { ...col, contacts: (col.contacts || []).filter((c: any) => c.id !== contactId) };
        if (col.id === to) {
          const moved = (snapshot.find((x) => x.id === from)?.contacts || []).find((c: any) => c.id === contactId);
          return { ...col, contacts: moved ? [{ ...moved, stage: to }, ...(col.contacts || [])] : col.contacts };
        }
        return col;
      }),
    );
    try {
      await api.crmMoveStage(contactId, to);
      setJustMoved(contactId);
      setTimeout(() => setJustMoved((current) => (current === contactId ? "" : current)), 1600);
      load();
    } catch (e: any) {
      setColumns(snapshot); // snap back
      toast(e?.message || "Could not move the contact", "danger");
    }
  };

  const load = () =>
    Promise.all([api.crmPipeline(),api.crmContacts()])
      .then(([r,list]) => {
        setColumns(r.data.columns || []);
        setContacts(list.data||[]);
        setProspectId((current)=>current||list.data?.[0]?.id||"");
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
      <PageHeader title="Sourcing pipeline" description="Kanban-style stages for speaker prospects." />
      <p className="mb-3 text-xs text-mid" data-testid="pipeline-hint">Drag cards between stages, or use the stage buttons.</p>
      <CrmSubnav />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Card className="mb-4 p-4"><h2 className="font-bold">Add prospect</h2><p className="text-sm text-mid">Enroll an existing directory contact into the Prospect stage.</p><div className="mt-3 flex flex-wrap gap-2"><Select aria-label="Prospect contact" value={prospectId} onChange={e=>setProspectId(e.target.value)}>{contacts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}</Select><Button disabled={!prospectId} onClick={async()=>{try{await api.crmMoveStage(prospectId,"prospect");toast("Contact enrolled as prospect");load()}catch(e:any){toast(e.message||"Could not enroll prospect","danger")}}}>Add prospect</Button></div></Card>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div
            key={col.id}
            data-testid={`pipeline-column-${col.id}`}
            aria-dropeffect={dragging ? (canDrop(col.id) ? "move" : "none") : undefined}
            onDragOver={(e) => {
              // Only a valid transition accepts the drop; preventDefault enables it.
              if (!canDrop(col.id)) return;
              e.preventDefault();
              if (dropTarget !== col.id) setDropTarget(col.id);
            }}
            onDragLeave={() => setDropTarget((current) => (current === col.id ? "" : current))}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget("");
              const id = e.dataTransfer.getData("text/cue-contact") || dragging?.id || "";
              const from = e.dataTransfer.getData("text/cue-stage") || dragging?.from || "";
              setDragging(null);
              if (id && from && canDrop(col.id)) void moveCard(id, col.id, from);
            }}
            className={cn(
              "w-64 shrink-0 rounded-[18px] border border-line bg-soft p-3 transition",
              dragging && !canDrop(col.id) && "opacity-40",
              dropTarget === col.id && canDrop(col.id) && "border-ink bg-canvas ring-2 ring-ink",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">{col.label}</h3>
              <Badge tone="muted">{col.contacts?.length || 0}</Badge>
            </div>
            {dragging && !canDrop(col.id) ? (
              <p className="mb-2 text-[10px] uppercase tracking-wide text-mid">Not allowed from {dragging.from}</p>
            ) : null}
            <div className="space-y-2">
              {(col.contacts || []).map((c: any) => (
                <Card
                  key={c.id}
                  draggable
                  data-testid={`pipeline-card-${c.id}`}
                  onDragStart={(e: any) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/cue-contact", c.id);
                    e.dataTransfer.setData("text/cue-stage", col.id);
                    setDragging({ id: c.id, from: col.id, name: c.name });
                  }}
                  onDragEnd={() => { setDragging(null); setDropTarget(""); }}
                  className={cn(
                    "cursor-grab p-3 shadow-sm transition active:cursor-grabbing",
                    dragging?.id === c.id && "opacity-50",
                    justMoved === c.id && "ring-2 ring-ink",
                  )}
                >
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
                    {/* Retained as the accessible / agent path: drag is primary, these
                        always work without a pointer. Only valid transitions are offered. */}
                    {["prospect", "contacted", "invited", "confirmed", "alumni", "declined"]
                      .filter((s) => s !== c.stage && (CRM_STAGE_TRANSITIONS as any)[c.stage]?.includes(s))
                      .slice(0, 3)
                      .map((s) => (
                        <button
                          key={s}
                          type="button"
                          data-testid={`stage-button-${c.id}-${s}`}
                          aria-label={`Move ${c.name} to ${s}`}
                          className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mid ring-1 ring-line hover:bg-canvas hover:text-ink"
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


/**
 * Typed custom field definitions for CRM contacts. A "select" field becomes a
 * dropdown on every contact profile and is enforced server-side (crm.validateCustomFields).
 */
function CrmFieldDefinitionsCard() {
  const [defs, setDefs] = useState<any[]>([]);
  const [label, setLabel] = useState("Speaker Type");
  const [type, setType] = useState("select");
  const [options, setOptions] = useState("Internal, External");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => api.crmFieldDefinitions().then((r) => setDefs(r.data)).catch((e) => setErr(e.message));
  useEffect(() => {
    void load();
    return subscribeData(load);
  }, []);

  return (
    <Card className="mb-4 p-4" data-testid="crm-field-definitions">
      <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Custom field definitions</h3>
      <p className="mt-1 text-xs text-mid">
        Define typed fields once; they appear on every contact profile. Dropdown fields only accept their configured
        options (enforced by the API).
      </p>
      {err ? <Notice tone="danger" onClose={() => setErr("")}>{err}</Notice> : null}
      {msg ? <Notice tone="ok" onClose={() => setMsg("")}>{msg}</Notice> : null}
      <ul className="mt-3 space-y-2 text-sm">
        {defs.map((d) => (
          <li key={d.key} className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] bg-soft p-3">
            <div>
              <b>{d.label}</b> <Badge tone="muted">{d.type}</Badge>
              <div className="text-xs text-mid">
                key: {d.key}
                {d.type === "select" ? ` · options: ${(d.options || []).join(", ")}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await api.crmDeleteFieldDefinition(d.key);
                setMsg(`Removed ${d.label}`);
                load();
              }}
            >
              Remove
            </Button>
          </li>
        ))}
        {!defs.length ? <li className="text-mid">No custom fields defined yet.</li> : null}
      </ul>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
        <Field label="Field label">
          <Input aria-label="Custom field label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select aria-label="Custom field type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="select">Dropdown</option>
            <option value="text">Text</option>
          </Select>
        </Field>
        <Field label="Dropdown options (comma separated)">
          <Input
            aria-label="Custom field options"
            value={options}
            disabled={type !== "select"}
            onChange={(e) => setOptions(e.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button
            onClick={async () => {
              setErr("");
              try {
                const r = await api.crmSaveFieldDefinition({ label, type, options: options.split(",") });
                setMsg(`Saved "${r.data.label}" (${r.data.type}${r.data.type === "select" ? `: ${r.data.options.join(", ")}` : ""})`);
                load();
              } catch (e: any) {
                setErr(e?.message || "Save failed");
              }
            }}
          >
            Save field
          </Button>
        </div>
      </div>
    </Card>
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

      <CrmFieldDefinitionsCard />

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
