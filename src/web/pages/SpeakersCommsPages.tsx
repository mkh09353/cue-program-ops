import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, getActiveEvent, subscribeData } from "../lib/api";
import {
  autoCompletionNote,
  autoCompletionRule,
  cn,
  EVENT_SLUG,
  formatStatus,
  humanizeMissing,
  taskTypeLabel,
} from "../lib/utils";
import { csvFilename, downloadCsv, toCsv } from "../lib/csv";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadState,
  Notice,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Table,
  Textarea,
  Th,
  THead,
  toast,
} from "../components/ui";
import { useAsyncData } from "../lib/useAsyncData";

/** One-click Assign-task templates (label, task type and prefilled description). */
export const TASK_TEMPLATE_DUE_DAYS = 14;
export const TASK_TEMPLATES = [
  { title: "Confirm participation", type: "confirm", description: "Confirm that you will participate in the event." },
  { title: "Sign speaker release form", type: "confirm", description: "Confirm that you signed the speaker release form." },
  { title: "Complete bio and profile", type: "profile", description: "Review and complete your speaker bio and profile." },
  { title: "Speaker details form", type: "form", description: "Complete speaker logistics and event preparation details.", formSchema: [
    { key: "shirt_size", label: "Shirt size", type: "select", required: true, options: ["XS", "S", "M", "L", "XL", "XXL"] },
    { key: "av_needs", label: "AV needs", type: "textarea", required: false },
    { key: "arrival_date", label: "Arrival date", type: "text", required: true },
  ] },
  // swyx's literal examples of speaker logistics tasks.
  { title: "Hotel stay requirement form", type: "form", description: "Tell us your hotel dates and room preferences so we can book your stay.", formSchema: [
    { key: "check_in", label: "Check-in date", type: "text", required: true },
    { key: "check_out", label: "Check-out date", type: "text", required: true },
    { key: "room_preference", label: "Room preference", type: "select", required: true, options: ["King", "Twin", "Accessible", "No preference"] },
    { key: "special_requests", label: "Special requests", type: "textarea", required: false },
  ] },
  { title: "Flight reimbursement form", type: "form", description: "Submit your flight details so we can reimburse your travel.", formSchema: [
    { key: "airline", label: "Airline", type: "text", required: true },
    { key: "amount", label: "Amount to reimburse", type: "text", required: true },
    { key: "receipt_reference", label: "Receipt reference", type: "text", required: true },
    { key: "notes", label: "Notes", type: "textarea", required: false },
  ] },
] as const;

/** Stable, unique test id per template (several templates share the form type). */
export const taskTemplateId = (title: string) =>
  String(title).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Deterministic relative due date (YYYY-MM-DD), matching the date input convention. */
export const taskTemplateDueDate = (from: Date = new Date()) =>
  new Date(from.getTime() + TASK_TEMPLATE_DUE_DAYS * 86400000).toISOString().slice(0, 10);

const normalizedName = (value: string) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

/** One column of the onboarding-progress table after de-duplication. */
export interface ProgressColumn {
  /** React key + the label shown in the header. */
  key: string;
  label: string;
  /** Every raw server column title that collapsed into this one; cells are looked up
   * across all of them so no speaker's task cell is lost by the merge. */
  sources: string[];
}

/**
 * Collapse progress columns that are the SAME task by identity.
 *
 * The roster table rendered one `<Th>` per raw column title, so titles that differ only
 * by case or spacing ("Upload headshot" / "Upload Headshot") appeared as two identical
 * headers. Columns whose titles are genuinely different are KEPT — dropping them would
 * hide a real deliverable — and are disambiguated by their task type in the header.
 */
export function dedupeProgressColumns(columns: string[]): ProgressColumn[] {
  const out: ProgressColumn[] = [];
  const seen = new Map<string, ProgressColumn>();
  for (const raw of columns || []) {
    const identity = normalizedName(raw);
    if (!identity) continue;
    const existing = seen.get(identity);
    if (existing) {
      if (!existing.sources.includes(raw)) existing.sources.push(raw);
      continue;
    }
    const column: ProgressColumn = { key: identity, label: raw, sources: [raw] };
    seen.set(identity, column);
    out.push(column);
  }
  return out;
}

/** First defined cell for a (possibly merged) column. */
export function progressCell(row: any, column: ProgressColumn) {
  for (const source of column.sources) {
    const cell = row?.cells?.[source];
    if (cell) return cell;
  }
  return null;
}

/** Mirrors speakerMgmt.speakerRecordScore so the UI proposes the same primary as the API. */
const RICH_FIELDS = ["bio", "title", "company", "linkedin", "website", "travelPreference", "dietary", "headshotUrl"] as const;
export const rosterRecordScore = (row: any, index: number) => ({
  richness:
    RICH_FIELDS.filter((key) => String(row?.[key] || "").trim()).length +
    (row?.tags?.length ? 1 : 0) +
    (Object.keys(row?.customFields || {}).length ? 1 : 0) +
    (row?.sessions?.length || 0) * 2 +
    (row?.tasks?.length || 0) +
    (row?.files?.length || 0) +
    (row?.submission && !/\(manual\)$/.test(String(row.submission.title || "")) ? 2 : 0),
  createdAt: Date.parse(row?.submission?.createdAt || "") || Number.MAX_SAFE_INTEGER,
  index,
  row,
});

/**
 * Same normalized name + different email stays a SUGGESTION until an organizer merges.
 * The richer/older record is proposed as primary (older breaks ties), matching the API.
 */
const duplicateSuggestions = (rows: any[]) => {
  const groups = new Map<string, any[]>();
  rows.forEach((row, index) =>
    groups.set(normalizedName(row.name), [...(groups.get(normalizedName(row.name)) || []), rosterRecordScore(row, index)]),
  );
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .flatMap((group) => {
      const ranked = [...group].sort(
        (a, b) => b.richness - a.richness || a.createdAt - b.createdAt || a.index - b.index,
      );
      return ranked.slice(1).map((entry) => ({ primary: ranked[0]!.row, duplicate: entry.row }));
    });
};

/** CSV of the speakers currently listed (after search / status / readiness filters). */
export function speakersCsv(rows: any[]): string {
  return toCsv(
    [
      "speaker id",
      "name",
      "email",
      "title",
      "company",
      "workflow status",
      "readiness",
      "readiness %",
      "tasks completed",
      "tasks total",
      "files",
      "sessions",
      "missing",
    ],
    rows.map((s) => {
      const tasks: any[] = s.tasks || [];
      return [
        s.speakerId,
        s.name,
        s.email,
        s.title,
        s.company,
        formatStatus(s.workflowStatus || "accepted"),
        formatStatus(s.readiness?.state || "not_ready"),
        s.readiness?.pct ?? 0,
        tasks.filter((t) => t.status === "completed").length,
        tasks.length,
        s.files?.length || 0,
        s.sessions?.length || 0,
        ((s.readiness?.missing || []) as string[]).map(humanizeMissing).join("; "),
      ];
    }),
  );
}

export function SpeakersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [progressFilter, setProgressFilter] = useState("all");
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [readiness, setReadiness] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  /** Duplicate-name handling: link by default, opt out explicitly. */
  const [createAsNew, setCreateAsNew] = useState(false);
  const [linkNotice, setLinkNotice] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", title: "", company: "", bio: "", travelPreference: "" });
  const [csv, setCsv] = useState("name,email,title,company,bio\nDana Kowalski,dana.kowalski@example.test,Staff Engineer,Northwind,Systems thinker");
  const [importDupes,setImportDupes]=useState<any[]>([]);
  const [importSummary,setImportSummary]=useState<{created:number;updated:number;duplicates:number}|null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "Confirm travel plans",
    description: "Reply with arrival city and hotel needs.",
    dueAt: "2026-09-20",
    type: "confirm",
  });
  /** Assignees chosen inside the task dialog (seeded from the table selection). */
  const [taskSpeakerIds, setTaskSpeakerIds] = useState<string[]>([]);
  const [taskResult, setTaskResult] = useState<{ count: number; names: string[] } | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<Record<string, string>>({});

  // Bounded loader: a hung request must surface Retry instead of an endless spinner.
  const roster = useAsyncData(
    async () => {
      const [s, p] = await Promise.all([
        api.speakersQuery({
          q: q || undefined,
          status: status || undefined,
          readiness: readiness || undefined,
        }),
        api.speakerProgress(),
      ]);
      const suggestions = await api.speakerMergeSuggestions().catch(() => ({ data: [] as any[] }));
      return { rows: s.data, progress: p.data, suggestions: suggestions.data || [] };
    },
    [q, status, readiness],
  );
  const load = () => roster.reload();

  useEffect(() => {
    if (!roster.data) return;
    setRows(roster.data.rows);
    setProgress(roster.data.progress);
    setErr("");
    setLoaded(true);
  }, [roster.data]);

  // Keep live refresh on mutations without re-flashing the loading state.
  useEffect(() => subscribeData(() => roster.reload()), [roster.reload]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Only the FIRST load blocks the page; refetches keep the last good roster on screen.
  if (!loaded)
    return (
      <div>
        <PageHeader title="Speakers" description="Roster, onboarding readiness, and bulk actions." />
        <LoadState
          loading={roster.loading}
          timedOut={roster.timedOut}
          error={roster.error}
          onRetry={roster.reload}
          label="the speaker roster"
        />
      </div>
    );
  // Authoritative pairs from the API (richer/older primary); the local heuristic is the
  // offline fallback if that call failed.
  const serverPairs = (roster.data?.suggestions || []).map((pair: any) => ({
    primary: rows.find((row) => row.speakerId === pair.primary.speakerId) || pair.primary,
    duplicate: rows.find((row) => row.speakerId === pair.duplicate.speakerId) || pair.duplicate,
  }));
  const duplicatePairs = serverPairs.length ? serverPairs : duplicateSuggestions(rows);
  const mergeAll = async (pairs: any[]) => {
    const unique = pairs.filter((pair, index) => pairs.findIndex((candidate) => candidate.duplicate.speakerId === pair.duplicate.speakerId) === index);
    try {
      const result = await api.mergeSuggestedSpeakers(
        unique.map((pair) => ({ primaryId: pair.primary.speakerId, secondaryId: pair.duplicate.speakerId })),
      );
      const skipped = result.data.skipped?.length || 0;
      toast(
        `${result.data.merged} suggested duplicate${result.data.merged === 1 ? "" : "s"} merged${skipped ? ` · ${skipped} skipped` : ""}`,
      );
      setImportDupes(result.data.remaining || []);
      await load();
    } catch (e: any) {
      toast(e?.message || "Merge failed", "danger");
    }
  };

  const progressRows = ((progress?.rows || []) as any[]).filter((r) =>
    progressFilter === "complete" ? r.complete : progressFilter === "incomplete" ? !r.complete : true,
  );
  const progressColumns = dedupeProgressColumns(progress?.columns || []);
  /** Task type behind a column, used to tell two same-family columns apart. */
  const columnTypeLabel = (column: ProgressColumn) => {
    for (const row of (progress?.rows || []) as any[]) {
      const cell = progressCell(row, column);
      if (cell?.type) return taskTypeLabel(cell.type);
    }
    return "";
  };

  return (
    <div>
      <PageHeader
        title="Speakers"
        description="Event roster, onboarding progress, invitations, and task assignment."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              data-testid="export-speakers-csv"
              disabled={!rows.length}
              onClick={() => {
                downloadCsv(csvFilename("speakers", getActiveEvent().slug || EVENT_SLUG), speakersCsv(rows));
                toast(`Exported ${rows.length} speaker${rows.length === 1 ? "" : "s"} to CSV`);
              }}
            >
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              Import CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                // Seed the dialog with whatever is checked in the table (may be empty).
                setTaskSpeakerIds(selected.length ? [...selected] : []);
                setTaskResult(null);
                setShowTask(true);
              }}
              disabled={!rows.length}
            >
              Assign task
            </Button>
            <Button onClick={() => setShowAdd(true)}>Add speaker</Button>
          </div>
        }
      />
      {duplicatePairs.length ? <Card className="mb-4 border-line p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold uppercase tracking-wide text-mid">{duplicatePairs.length} possible duplicate{duplicatePairs.length === 1 ? "" : "s"} — Review &amp; merge</h2><p className="mt-1 text-xs text-mid">Name matches with different emails. They stay separate until you merge; the richer, older record is kept and enriched with the duplicate\u2019s missing details.</p></div><Button size="sm" onClick={()=>void mergeAll(duplicatePairs)}>Merge all suggested duplicates</Button></div><div className="mt-3 space-y-2">{duplicatePairs.map(pair=><div key={`${pair.primary.speakerId}-${pair.duplicate.speakerId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm"><div><b>{pair.primary.name}</b><div className="text-xs text-mid">Keep {pair.primary.email} · merge {pair.duplicate.email}</div></div><Button size="sm" onClick={async()=>{await api.mergeSpeakers(pair.primary.speakerId,pair.duplicate.speakerId);toast("Speaker records merged");load();}}>Merge duplicate</Button></div>)}</div></Card>:null}
      {err ? <Notice tone="danger">{err}</Notice> : null}

      {progress ? (
        <Card className="mb-4 overflow-x-auto p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-mid">Onboarding progress</h3>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-mid" data-testid="progress-summary">
                {progress.summary?.complete ?? 0} complete · {progress.summary?.incomplete ?? 0} incomplete ·{" "}
                {progress.summary?.ready || 0}/{progress.summary?.speakers || 0} ready · every task type, live
              </p>
              <Select
                className="max-w-44"
                aria-label="Task completion filter"
                data-testid="progress-filter"
                value={progressFilter}
                onChange={(e: any) => setProgressFilter(e.target.value)}
              >
                <option value="all">All speakers</option>
                <option value="complete">Complete only</option>
                <option value="incomplete">Incomplete only</option>
              </Select>
            </div>
          </div>
          <Table className="min-w-full text-xs">
            <THead>
              <tr>
                <Th className="py-2 pr-3">Speaker</Th>
                <Th className="py-2 pr-3">Status</Th>
                <Th className="py-2 pr-3">%</Th>
                {progressColumns.map((c) => (
                  <Th key={c.key} className="py-2 pr-3">
                    <span className="block">{c.label}</span>
                    {columnTypeLabel(c) ? (
                      <span className="block text-[10px] font-normal uppercase tracking-wide text-mid">
                        {columnTypeLabel(c)}
                      </span>
                    ) : null}
                  </Th>
                ))}
              </tr>
            </THead>
            <tbody>
              {progressRows.map((r: any) => (
                <tr key={r.speakerId} className="border-t border-line">
                  <td className="py-2 pr-3 font-semibold">
                    <Link className="text-ink hover:underline" to={`/app/speakers/${r.speakerId}`}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge>{r.workflowStatus}</Badge>
                  </td>
                  <td className="py-2 pr-3" data-testid={`progress-pct-${r.speakerId}`}>{r.percent ?? r.readiness?.pct ?? 0}%</td>
                  {progressColumns.map((c) => {
                    const cell = progressCell(r, c);
                    const auto = autoCompletionNote(cell);
                    return (
                      <td key={c.key} className="py-2 pr-3">
                        {cell ? (
                          <>
                            <Badge tone={cell.status === "completed" ? "ok" : "warn"}>{cell.status === "completed" ? "done" : "open"}</Badge>
                            {auto ? (
                              <span
                                className="mt-1 block text-[10px] leading-tight text-mid"
                                data-testid={`progress-auto-${r.speakerId}-${c.key.replace(/\s+/g, "-")}`}
                              >
                                {auto}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-4">
        <Field label="Search">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company, email…" />
        </Field>
        <Field label="Filter by workflow status">
          <select className="h-10 w-full rounded-full bg-white px-3 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {["invited", "confirmed", "accepted", "declined", "withdrawn"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Readiness">
          <select className="h-10 w-full rounded-full bg-white px-3 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400" value={readiness} onChange={(e) => setReadiness(e.target.value)}>
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
                    <img key={s.headshotUrl || s.profile?.headshotUrl} src={s.headshotUrl || s.profile?.headshotUrl} alt={`${s.name} headshot`} className="h-12 w-12 rounded-full object-cover" />
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
                    try {
                      const response = await api.inviteSpeaker(s.speakerId);
                      const communication = response.data.communication;
                      const message = `Portal invite logged for ${s.name} (${communication.status})`;
                      setInviteSuccess((current) => ({ ...current, [s.speakerId]: message }));
                      toast(message);
                      await load();
                    } catch (error: any) {
                      toast(error.message || "Portal invite failed", "danger");
                    }
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
              {inviteSuccess[s.speakerId] ? <p className="mt-2 text-xs font-semibold text-ink" role="status">{inviteSuccess[s.speakerId]} · Communication history updated.</p> : null}
            </Card>
          ))}
        </div>
      )}

      {showAdd ? (
        <Modal title="Add speaker" onClose={() => { setShowAdd(false); setLinkNotice(""); }}>
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
          <label htmlFor="create-as-new" className="mt-2 flex cursor-pointer items-start gap-2 rounded-2xl border border-line bg-soft p-3 text-sm">
            <input
              id="create-as-new"
              type="checkbox"
              className="mt-0.5"
              checked={createAsNew}
              onChange={(e) => setCreateAsNew(e.target.checked)}
              data-testid="create-as-new"
            />
            <span>
              <b className="block">This is a different person with the same name</b>
              <span className="text-xs text-mid">
                By default a matching name links to the existing speaker so tasks, files and portal edits stay on one record.
              </span>
            </span>
          </label>
          {linkNotice ? (
            <Notice tone="ok" onClose={() => setLinkNotice("")}>
              <span data-testid="speaker-link-notice">{linkNotice}</span>
            </Notice>
          ) : null}
          <Button
            onClick={async () => {
              try {
                const r: any = await api.addSpeaker({ ...form, sendInvite: true, createAsNew });
                const linked = r?.data?.linked;
                const label = linked
                  ? `Linked to existing speaker ${r.data.profile?.name || form.name} — details merged onto their record (${r.data.speakerId}).`
                  : `Speaker added + invite logged`;
                setLinkNotice(label);
                toast(linked ? `Linked to existing speaker ${r.data.profile?.name || form.name}` : "Speaker added + invite logged");
                if (!linked) setShowAdd(false);
                setForm({ name: "", email: "", title: "", company: "", bio: "", travelPreference: "" });
                setCreateAsNew(false);
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
            <input
              type="file"
              accept=".csv,text/csv"
              className="mb-3 block w-full rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400 text-ink"
              aria-label="Upload speakers CSV"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCsv(await file.text());
              }}
            />
            <Textarea className="font-mono text-xs" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} />
          </Field>
          <Button
            onClick={async () => {
              try {
                const r = await api.importSpeakers(csv);
                const duplicates = r.data.nearDuplicates?.length || 0;
                setImportSummary({created:r.data.created,updated:r.data.updated,duplicates});
                toast(`${r.data.created} created · ${r.data.updated} updated (existing email) · ${duplicates} possible duplicates (name match)`);
                setImportDupes(r.data.nearDuplicates || []);
                if(!r.data.nearDuplicates?.length)setShowImport(false);
                load();
              } catch (e: any) {
                toast(e.message || "Import failed", "danger");
              }
            }}
          >
            Import
          </Button>
          {importSummary ? <p className="mt-3 text-sm font-semibold" role="status">{importSummary.created} created · {importSummary.updated} updated (existing email) · {importSummary.duplicates} possible duplicates (name match)</p> : null}
          {importDupes.length ? <div className="mt-4 rounded-xl border border-line bg-soft p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm">Possible duplicate speakers</b><p className="text-xs text-mid">Same name, different email. Review before combining records.</p></div><Button size="sm" onClick={()=>void mergeAll(importDupes)}>Merge all suggested duplicates</Button></div>{importDupes.map((pair:any)=><div key={pair.duplicate.speakerId} className="mt-2 rounded-lg border border-line bg-white p-2 text-sm"><div>{pair.primary.name}: {pair.primary.email} / {pair.duplicate.email}</div><Button size="sm" className="mt-2" onClick={async()=>{await api.mergeSpeakers(pair.primary.speakerId,pair.duplicate.speakerId);toast("Speaker records merged");setImportDupes(x=>x.filter((d:any)=>d!==pair));load();}}>Merge duplicate</Button></div>)}</div>:null}
        </Modal>
      ) : null}

      {showTask ? (
        <Modal
          title="Assign general task"
          onClose={() => {
            setShowTask(false);
            setTaskResult(null);
          }}
        >
          <div className="mb-4">
            <b className="text-xs uppercase tracking-wide text-mid">Quick add</b>
            <p className="mt-1 text-xs text-mid">Prefills title, type and a due date {TASK_TEMPLATE_DUE_DAYS} days out — edit anything before assigning.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TASK_TEMPLATES.map((template) => (
                <Button
                  key={template.title}
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Use template ${template.title}`}
                  data-testid={`task-template-${taskTemplateId(template.title)}`}
                  // Functional update: never capture a stale taskForm from render.
                  onClick={() => setTaskForm((prev) => ({ ...prev, ...template, dueAt: taskTemplateDueDate() }))}
                >
                  {template.title}
                </Button>
              ))}
            </div>
          </div>
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
              className="h-10 w-full rounded-full bg-white px-3 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400"
              value={taskForm.type}
              onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}
            >
              <option value="confirm">Action / confirm</option>
              <option value="form">Form</option>
              <option value="profile">Profile</option>
            </select>
          </Field>
          <div className="mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-xs uppercase tracking-wide text-mid">
                Assign to speakers ({taskSpeakerIds.length} selected)
              </b>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  type="button"
                  data-testid="task-select-all-speakers"
                  onClick={() =>
                    setTaskSpeakerIds((prev) =>
                      prev.length === rows.length ? [] : rows.map((r) => r.speakerId),
                    )
                  }
                >
                  {taskSpeakerIds.length === rows.length && rows.length ? "Clear all" : "All speakers"}
                </Button>
              </div>
            </div>
            <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto">
              {rows.map((r) => {
                const id = `task-assign-${r.speakerId}`;
                const checked = taskSpeakerIds.includes(r.speakerId);
                return (
                  <label
                    key={r.speakerId}
                    htmlFor={id}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm ${
                      checked ? "border-brand-400 bg-brand-50" : "border-line bg-white"
                    }`}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      aria-label={`Assign task to ${r.name}`}
                      checked={checked}
                      onChange={(e) =>
                        setTaskSpeakerIds((prev) =>
                          e.target.checked
                            ? prev.includes(r.speakerId)
                              ? prev
                              : [...prev, r.speakerId]
                            : prev.filter((x) => x !== r.speakerId),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <b className="block truncate">{r.name}</b>
                      <span className="block truncate text-xs text-mid">{r.email || r.speakerId}</span>
                    </span>
                  </label>
                );
              })}
              {!rows.length ? <p className="text-sm text-mid">No speakers match the current filters.</p> : null}
            </div>
            <p className="mt-2 text-xs text-mid">
              {taskSpeakerIds.length
                ? `Will create ${taskSpeakerIds.length} task(s).`
                : "Select at least one speaker — nothing is assigned by default."}
            </p>
          </div>
          {taskResult ? (
            <Notice tone="ok" onClose={() => setTaskResult(null)}>
              <b>{taskResult.count} task(s) assigned</b> · {taskResult.names.join(", ")}
            </Notice>
          ) : null}
          <Button
            disabled={taskBusy || !taskSpeakerIds.length}
            onClick={async () => {
              const speakerIds = [...taskSpeakerIds];
              const dueAt = taskForm.dueAt.includes("T") ? taskForm.dueAt : `${taskForm.dueAt}T23:59:59.000Z`;
              setTaskBusy(true);
              try {
                const r = await api.assignSpeakerTasks({ ...taskForm, dueAt, speakerIds });
                const names = speakerIds.map((id) => rows.find((x) => x.speakerId === id)?.name || id);
                setTaskResult({ count: r.data.length, names });
                toast(`Assigned ${r.data.length} task(s) to ${names.length} speaker(s)`);
                load();
              } catch (e: any) {
                toast(e.message || "Assign failed", "danger");
              } finally {
                setTaskBusy(false);
              }
            }}
          >
            {taskBusy ? "Assigning…" : `Assign to ${taskSpeakerIds.length} speaker(s)`}
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

/**
 * Organizer speaker record fields, explicitly labelled and grouped. Raw camelCase keys
 * used to be rendered as labels, so logistics text was typed into the "website" box.
 */
export const PROFILE_FIELD_GROUPS: {
  heading: string;
  fields: { key: string; label: string; hint?: string; type?: string; placeholder?: string }[];
}[] = [
  {
    heading: "Identity",
    fields: [
      { key: "name", label: "Full name" },
      { key: "email", label: "Email address", type: "email" },
      { key: "title", label: "Job title", placeholder: "Principal Engineer" },
      { key: "company", label: "Company / organization", placeholder: "Analytical Engines" },
    ],
  },
  {
    heading: "Links",
    fields: [
      { key: "linkedin", label: "LinkedIn URL", type: "url", placeholder: "https://linkedin.com/in/…" },
      { key: "website", label: "Personal website URL", type: "url", placeholder: "https://example.com" },
    ],
  },
  {
    heading: "Logistics",
    fields: [
      {
        key: "travelPreference",
        label: "Travel preference",
        hint: "Arrival city, hotel needs, or travel constraints.",
        placeholder: "Arrives Oct 11, needs hotel near venue",
      },
      {
        key: "dietary",
        label: "Dietary requirements",
        hint: "Allergies and meal preferences for catering.",
        placeholder: "Vegetarian, no nuts",
      },
    ],
  },
];

export function SpeakerDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<any>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [headshotBusy, setHeadshotBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusConfirmation, setStatusConfirmation] = useState("");
  /** Persist-evident stamp shown next to the workflow badge after a save. */
  const [statusSavedAt, setStatusSavedAt] = useState("");

  const detail = useAsyncData(async () => (await api.speakerDetail(id!)).data, [id]);
  const load = () => detail.reload();
  /** True once the organizer has typed into THIS speaker since the last save.
   * Any mutation anywhere calls bumpData() → refetch; without this guard the
   * refetch overwrote in-progress edits (typed Travel preference / Dietary were
   * discarded and the pre-edit values were saved back). */
  const [dirty, setDirty] = useState(false);
  const editedIdRef = useRef(id);
  const patchEdit = (patch: any) => { setDirty(true); setEdit((prev: any) => ({ ...prev, ...patch })); };

  useEffect(() => {
    const r = { data: detail.data };
    if (r.data) {
        setRow(r.data);
        if (editedIdRef.current !== id) { editedIdRef.current = id; setDirty(false); }
        else if (dirty) { setErr(""); return; }
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
      setErr("");
    }
  }, [detail.data, id, dirty]);

  useEffect(() => subscribeData(() => detail.reload()), [detail.reload]);

  if (!row)
    return (
      <div>
        <PageHeader title="Speaker" description="Organizer speaker record." />
        <LoadState
          loading={detail.loading}
          timedOut={detail.timedOut}
          error={detail.error || err}
          onRetry={detail.reload}
          label="this speaker"
        />
      </div>
    );
  if (err) return <Notice tone="danger">{err}</Notice>;
  if (!row) return <Notice tone="danger">Speaker not found</Notice>;

  return (
    <div>
      <PageHeader
        title={row.name}
        description={`${row.email} · onboarding ${row.readiness?.pct ?? 0}%`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const r = await api.inviteSpeaker(row.speakerId);
                  const at = new Date().toLocaleString();
                  const link = (r as any)?.data?.portalUrl || (r as any)?.data?.portalPath || "";
                  setInviteMsg(`Invited · logged at ${at}`);
                  setInviteLink(link);
                  toast(`Portal invite logged for ${row.name}`);
                  load();
                  void r;
                } catch (e: any) {
                  toast(e.message || "Invite failed", "danger");
                }
              }}
            >
              Send portal invite
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/speakers">Back</Link>
            </Button>
          </div>
        }
      />
      {inviteMsg ? (
        <Notice tone="ok" onClose={() => { setInviteMsg(""); setInviteLink(""); }}>
          <span className="block font-semibold">{inviteMsg}</span>
          {inviteLink ? (
            <span className="mt-1 block" data-testid="speaker-portal-link">
              <span className="block text-xs">Magic link emailed to the speaker:</span>
              <Input className="mt-1" readOnly aria-label="Speaker portal access link" value={inviteLink} />
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={async () => { await navigator.clipboard.writeText(inviteLink); toast("Speaker portal link copied"); }}
              >
                Copy portal access link
              </Button>
              <span className="mt-2 block text-xs text-mid">
                Per-speaker access token, not a password account. The credential-free demo persona picker also remains
                available at /p.
              </span>
            </span>
          ) : null}
        </Notice>
      ) : null}

      {/* Workflow status is the first thing on the page: the badge states the SAVED
          value before any change, the labeled select drives the change, and the badge
          plus the saved stamp reflect the stored value after Update status + reload. */}
      <Card className="mb-4 p-4" data-testid="workflow-status-card">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Workflow status</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-mid">Current:</span>
              <Badge tone="primary" data-testid="workflow-status-badge">
                {formatStatus(row.workflowStatus || "accepted")}
              </Badge>
              {statusSavedAt ? (
                <span className="text-xs text-mid" data-testid="workflow-status-saved-at">saved {statusSavedAt}</span>
              ) : null}
            </div>
          </div>
          {edit ? (
            <div className="ml-auto flex flex-wrap items-end gap-2">
              <Field label="Change workflow status">
                <select
                  aria-label="Change workflow status"
                  data-testid="workflow-status-select"
                  className="h-10 min-w-48 rounded-full bg-white px-3 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400"
                  value={edit.workflowStatus}
                  onChange={(e) => {
                    setEdit({ ...edit, workflowStatus: e.target.value });
                    setStatusConfirmation("");
                  }}
                >
                  {["invited", "confirmed", "accepted", "declined", "withdrawn"].map((s) => (
                    <option key={s} value={s}>
                      {formatStatus(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                type="button"
                variant="secondary"
                data-testid="workflow-status-save"
                disabled={statusBusy || edit.workflowStatus === row.workflowStatus}
                title={
                  edit.workflowStatus === row.workflowStatus
                    ? "Pick a different status to enable this"
                    : undefined
                }
                onClick={async () => {
                  setStatusBusy(true);
                  try {
                    const result = await api.setSpeakerStatus(row.speakerId, edit.workflowStatus);
                    const saved = result.data.workflowStatus;
                    setEdit((current: any) => ({ ...current, workflowStatus: saved }));
                    const at = new Date().toLocaleTimeString();
                    setStatusConfirmation(`Workflow status updated to ${formatStatus(saved)}.`);
                    setStatusSavedAt(at);
                    await load();
                  } catch (e: any) {
                    toast(e.message || "Status update failed", "danger");
                  } finally {
                    setStatusBusy(false);
                  }
                }}
              >
                {statusBusy ? "Updating…" : "Update status"}
              </Button>
            </div>
          ) : null}
        </div>
        {edit && edit.workflowStatus !== row.workflowStatus ? (
          <p className="mt-2 text-xs font-semibold text-mid" data-testid="workflow-status-pending">
            Pending: {formatStatus(row.workflowStatus || "accepted")} → {formatStatus(edit.workflowStatus)} · click
            Update status to save.
          </p>
        ) : null}
        {statusConfirmation ? (
          <Notice tone="ok" onClose={() => setStatusConfirmation("")}>
            <span role="status">{statusConfirmation}</span>
          </Notice>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Profile</h3>
          {edit ? (
            <>
              {PROFILE_FIELD_GROUPS.map((group) => (
                <div key={group.heading} className="mb-2">
                  <h4 className="mb-2 mt-3 text-[11px] font-bold uppercase tracking-wide text-mid">{group.heading}</h4>
                  {group.fields.map((f) => (
                    <Field key={f.key} label={f.label} hint={f.hint}>
                      <Input
                        aria-label={f.label}
                        type={f.type || "text"}
                        placeholder={f.placeholder}
                        value={(edit as any)[f.key] || ""}
                        onChange={(e) => patchEdit({ [f.key]: e.target.value })}
                      />
                    </Field>
                  ))}
                </div>
              ))}
              {/* The saved bio, in full. It used to be visible only inside the 4-row
                  editor, so a reader saw a clipped “Leads the build-tooling…” and could
                  not tell the whole record was stored. */}
              <Field label="Bio">
                <div
                  className="mb-2 rounded-2xl border border-line bg-soft p-3"
                  data-testid="speaker-bio-saved"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-mid">Saved bio</span>
                    <span className="text-[11px] text-mid" data-testid="speaker-bio-length">
                      {String(row.bio || "").length} characters
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {row.bio || <span className="text-mid">No bio saved yet.</span>}
                  </p>
                </div>
                <Textarea rows={8} aria-label="Bio" value={edit.bio} onChange={(e) => patchEdit({ bio: e.target.value })} />
              </Field>
              <Field label="Headshot">
                <div className="space-y-2">
                  {(row.headshotUrl || row.profile?.headshotUrl) ? (
                    <img
                      src={row.headshotUrl || row.profile?.headshotUrl}
                      alt=""
                      className="h-20 w-20 rounded-full object-cover border border-line"
                    />
                  ) : null}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Upload headshot"
                    className="block w-full text-sm"
                    disabled={headshotBusy}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 2 * 1024 * 1024) {
                        toast("Headshot must be under 2 MB", "danger");
                        return;
                      }
                      setHeadshotBusy(true);
                      try {
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                          const r = new FileReader();
                          r.onload = () => resolve(String(r.result || ""));
                          r.onerror = reject;
                          r.readAsDataURL(f);
                        });
                        // Organizer path: content speaker edit accepts headshotUrl (no app.ts change).
                        await api.editContentSpeaker(row.speakerId, {
                          title: edit.title,
                          company: edit.company,
                          bio: edit.bio,
                          headshotUrl: dataUrl,
                        });
                        // Also patch speaker profile fields if updateSpeaker accepts headshotUrl.
                        await api.updateSpeaker(row.speakerId, { ...edit, headshotUrl: dataUrl, headshotName: f.name }).catch(() => null);
                        toast("Headshot uploaded");
                        load();
                      } catch (err: any) {
                        toast(err.message || "Headshot upload failed", "danger");
                      } finally {
                        setHeadshotBusy(false);
                      }
                    }}
                  />
                  <p className="text-xs text-mid">
                    {headshotBusy ? "Uploading…" : "PNG/JPEG/WebP · max 2 MB · replaces current headshot"}
                  </p>
                </div>
              </Field>
              <Button
                onClick={async () => {
                  const { workflowStatus: _workflowStatus, ...profileFields } = edit;
                  const savedRow: any = await api.updateSpeaker(row.speakerId, profileFields);
                  // Adopt the server's echo, then allow refetches to re-seed again.
                  setDirty(false);
                  if (savedRow?.data) setEdit((prev: any) => ({ ...prev, ...savedRow.data, workflowStatus: prev.workflowStatus }));
                  toast(`Saved ${profileFields.name || "speaker"} · travel and dietary details stored`);
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
                <li key={s.id} className="rounded-xl border border-line p-2">
                  <Input aria-label={`Session title for ${s.title}`} defaultValue={s.title} onBlur={async e=>{const title=e.target.value.trim();if(title&&title!==s.title){await api.editContentSession(s.id,{title});toast("Session renamed");load();}}}/>
                  <div className="text-xs text-mid">
                    {s.status}
                    {s.slot ? ` · ${s.slot.startsAt}` : " · unscheduled"}
                  </div>
                </li>
              ))}
              {!row.sessions?.length ? <li className="text-mid">No session assignment yet.</li> : null}
            </ul>
            <Field label="Link speaker to an existing session" hint="Uses the canonical event session list.">
              <select className="h-10 w-full rounded-full bg-white px-3 text-sm ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400" defaultValue="" onChange={async e=>{if(e.target.value){await api.linkSpeakerSession(row.speakerId,e.target.value);toast("Speaker linked to session");load();}}}>
                <option value="">Choose session…</option>
                {(row.availableSessions||[]).map((s:any)=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}
              </select>
            </Field>
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
                    {/* A Done badge on these types otherwise looks unexplained: the speaker
                        never pressed anything, the profile/headshot save closed them. */}
                    {autoCompletionNote(t) ? (
                      <Badge tone="muted" data-testid={`task-auto-${t.id}`}>{autoCompletionNote(t)}</Badge>
                    ) : autoCompletionRule(t) ? (
                      <span className="block text-[11px] text-mid" data-testid={`task-auto-rule-${t.id}`}>
                        {autoCompletionRule(t)}
                      </span>
                    ) : null}
                    {t.type === "form" ? <Badge tone="muted">Form to complete</Badge> : null}
                    {t.formAnswers && Object.keys(t.formAnswers).length ? <dl className="mt-2 text-xs">{Object.entries(t.formAnswers).map(([key,value])=><div key={key}><dt className="inline font-semibold">{t.formSchema?.find((f:any)=>f.key===key)?.label || key}: </dt><dd className="inline">{String(value)}</dd></div>)}</dl> : null}
                  </div>
                  <StatusBadge status={t.status} />
                </li>
              ))}
              {!row.tasks?.length ? <li className="py-4 text-sm text-mid">No onboarding tasks.</li> : null}
            </ul>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Communication history</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(row.communications || []).map((c:any)=><li key={c.id} className="rounded-lg border border-line p-2"><div className="flex items-center justify-between gap-2"><b>{c.subject}</b><StatusBadge status={c.status}/></div><div className="text-xs text-mid">{c.createdAt}{c.status === "sent" && c.providerId ? ` · provider id ${c.providerId}` : ""}</div></li>)}
              {!row.communications?.length ? <li className="text-mid">No communication history.</li> : null}
            </ul>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-mid">Files / deliverables</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(row.files || []).map((f: any) => (
                <li key={f.id} className="rounded-lg border border-line p-2">
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
                <li key={f.id} className="rounded-lg border border-line p-2">
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
                <li className="rounded-lg border border-line p-2">
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
  /** True once the organizer has edited THIS template since the last save; reset on
   * save and whenever a different template is selected. */
  const [templateDirty, setTemplateDirty] = useState(false);
  const patchActive = (patch: any) => {
    setTemplateDirty(true);
    setActive((prev: any) => ({ ...prev, ...patch }));
  };
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [err, setErr] = useState("");
  const [decision,setDecision]=useState({accepted:true,rejected:true,subject:"Decision for {{talk_title}}",body:"Hi {{name}},\n\nYour proposal {{talk_title}} was {{decision}}."});
  const [decisionPreview,setDecisionPreview]=useState<any>(null);
  /** Persistent outcome of the last send (toasts vanish before evidence is captured). */
  const [sendResult, setSendResult] = useState<
    { kind: string; count: number; at: string; rows: { name: string; email?: string; status: string }[]; error?: string } | null
  >(null);
  const [sendBusy, setSendBusy] = useState("");
  const [sentIds, setSentIds] = useState<string[]>([]);

  /** One send pipeline: busy → await API → refresh log → persistent Notice (or error). */
  const runSend = async (kind: string, label: string, call: () => Promise<any>) => {
    setSendBusy(kind);
    setSendResult(null);
    try {
      const response = await call();
      const rows: any[] = Array.isArray(response?.data) ? response.data : [];
      const count = rows.length || response?.meta?.count || response?.data?.count || 0;
      setSentIds(rows.map((row) => row.id).filter(Boolean));
      setSendResult({
        kind,
        count,
        at: new Date().toLocaleTimeString(),
        rows: rows.map((row) => ({ name: row.name || row.speakerId, email: row.email, status: row.status || "mock_sent" })),
      });
      toast(`${label}: sent to ${count} recipient${count === 1 ? "" : "s"}`);
      await load();
    } catch (e: any) {
      const message = e?.message || "Send failed";
      setSendResult({ kind, count: 0, at: new Date().toLocaleTimeString(), rows: [], error: message });
      toast(message, "danger");
    } finally {
      setSendBusy("");
    }
  };

  // Bounded loader; previously an empty template list left this page on a spinner.
  //
  // Each request settles INDEPENDENTLY: a slow or failing delivery log or speaker
  // list must never blank the decision composer, which is the point of this page.
  // Only a failed template load leaves us with nothing to render.
  const comms = useAsyncData(async () => {
    const [t, l, s] = await Promise.allSettled([api.templates(), api.commsLog(), api.speakers()]);
    if (t.status === "rejected") throw t.reason instanceof Error ? t.reason : new Error("Could not load templates");
    const partial: string[] = [];
    if (l.status === "rejected") partial.push("delivery log");
    if (s.status === "rejected") partial.push("speaker list");
    return {
      templates: t.value.data,
      log: l.status === "fulfilled" ? l.value.data : [],
      speakers: s.status === "fulfilled" ? s.value.data : [],
      partial,
    };
  }, []);
  const load = async () => comms.reload();

  useEffect(() => {
    const data = comms.data;
    if (!data) return;
    setTemplates(data.templates);
    setLog(data.log);
    setSpeakers(data.speakers);
    setErr("");
    // Adopt the server copy ONLY when the editor is clean. Sending decisions or running
    // reminders both call bumpData() → reload, which used to replace an unsaved subject
    // or body with the stored template mid-edit.
    setActive((prev: any) => {
      if (prev) {
        if (templateDirty) return prev;
        const fresh = data.templates.find((x: any) => x.id === prev.id);
        return fresh || prev;
      }
      return data.templates[0];
    });
    setSelected((ids) => (ids.length ? ids : data.speakers[0]?.speakerId ? [data.speakers[0].speakerId] : []));
  }, [comms.data]);

  useEffect(() => subscribeData(() => comms.reload()), [comms.reload]);

  const allSelected = useMemo(() => speakers.length > 0 && selected.length === speakers.length, [speakers, selected]);

  // Valid-but-empty data must render the page, not a spinner.
  if (!comms.data)
    return (
      <div>
        <PageHeader title="Communications" description="Templates, previews, and the delivery log." />
        <LoadState
          loading={comms.loading}
          timedOut={comms.timedOut}
          error={comms.error || err}
          onRetry={comms.reload}
          label="communications"
        />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Comms"
        description="Templated bulk email with merge fields, per-recipient delivery log, and honest mock vs provider status. ICS is downloadable — not auto-delivered to calendars."
        actions={
          <Button
            variant="secondary"
            disabled={Boolean(sendBusy)}
            data-testid="run-task-reminders"
            onClick={() =>
              void runSend("reminders", "Due-task reminders", async () => {
                const r = await api.runTaskReminders();
                // Normalise to the {data:[…]} shape the shared pipeline reports on.
                const rows = (Array.isArray(r.data?.sent) ? r.data.sent : []).map((row: any) => ({
                  ...row,
                  name: speakers.find((s: any) => s.speakerId === row.speakerId)?.name || row.speakerId,
                }));
                return { data: rows, meta: { count: rows.length || r.data?.count || 0 } };
              })
            }
          >
            {sendBusy === "reminders" ? "Sending…" : "Run due-task reminders"}
          </Button>
        }
      />
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {comms.data?.partial?.length ? (
        <Notice tone="warn" data-testid="comms-partial-warning">
          <span className="block font-semibold">Loaded with gaps — the {comms.data.partial.join(" and ")} could not be fetched.</span>
          <span className="text-xs">Templates and the decision composer below are usable. Recipient counts may be incomplete until this loads.</span>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => comms.reload()}>Retry loading</Button>
        </Notice>
      ) : null}
      <Card className="mb-4 p-4" id="decisions" data-testid="send-decisions-composer"><h2 className="text-lg font-bold">Send decisions — accept / reject notifications</h2><p className="text-sm text-mid">Notify accepted/rejected cohorts. Merge fields: {"{{name}}"}, {"{{talk_title}}"}, {"{{decision}}"}, {"{{feedback}}"}. Per-submission committee feedback entered in Review Studio is merged automatically; add {"{{feedback}}"} to place it yourself.</p><div className="mt-3 flex gap-4"><label><input type="checkbox" checked={decision.accepted} onChange={e=>setDecision({...decision,accepted:e.target.checked})}/> Accepted</label><label><input type="checkbox" checked={decision.rejected} onChange={e=>setDecision({...decision,rejected:e.target.checked})}/> Rejected</label></div><div className="mt-3 grid gap-3"><Field label="Decision subject"><Input value={decision.subject} onChange={e=>setDecision({...decision,subject:e.target.value})}/></Field><Field label="Decision body"><Textarea rows={5} value={decision.body} onChange={e=>setDecision({...decision,body:e.target.value})}/></Field></div><div className="flex gap-2"><Button variant="secondary" onClick={async()=>{const sub=(await api.submissions()).data.find((x:any)=>(decision.accepted&&x.status==="accepted")||(decision.rejected&&x.status==="rejected"));if(sub)setDecisionPreview((await api.previewDecision({submissionId:sub.id,subject:decision.subject,body:decision.body})).data)}}>Preview decision email</Button><Button disabled={Boolean(sendBusy)} data-testid="send-decisions" onClick={()=>void runSend("decisions","Decision emails",()=>api.sendDecisions({cohorts:[decision.accepted&&"accepted",decision.rejected&&"rejected"].filter(Boolean),subject:decision.subject,body:decision.body}))}>{sendBusy==="decisions"?"Sending…":"Send decision notifications"}</Button></div>{decisionPreview?<Notice tone="info"><b>{decisionPreview.subject}</b><pre className="mt-2 whitespace-pre-wrap text-xs">{decisionPreview.body}</pre></Notice>:null}</Card>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr_1fr]">
        <Card className="p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mid">Templates</h3>
          <div className="space-y-1">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTemplateDirty(false);
                  setActive(t);
                }}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${active?.id === t.id ? "bg-brand-600 text-white" : "hover:bg-brand-50"}`}
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
                <Input value={active.subject} onChange={(e) => patchActive({ subject: e.target.value })} />
              </Field>
              <Field label="Body" hint="Merge: {{first_name}} {{name}} {{talk_title}} {{portal_link}} {{calendar_links}} {{company}} {{event_name}}">
                <Textarea rows={10} value={active.body} onChange={(e) => patchActive({ body: e.target.value })} />
              </Field>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!active.includeCalendarLinks}
                  onChange={(e) => patchActive({ includeCalendarLinks: e.target.checked })}
                />
                Include calendar invitation language (downloadable ICS — not calendar push)
              </label>

              <div className="mb-3 max-h-40 space-y-1 overflow-auto rounded-xl border border-line p-2">
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
                    const saved: any = await api.saveTemplate(active.id, active);
                    if (saved?.data) setActive((prev: any) => ({ ...prev, ...saved.data }));
                    setTemplateDirty(false);
                    toast("Template saved");
                    load();
                  }}
                >
                  {templateDirty ? "Save template *" : "Save template"}
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
                  disabled={!selected.length || Boolean(sendBusy)}
                  data-testid="send-to-selected"
                  onClick={() =>
                    void runSend("bulk", "Bulk send", () =>
                      api.sendComms({
                        templateKey: active.key,
                        speakerIds: selected,
                        subject: active.subject,
                        body: active.body,
                        includeCalendarLinks: active.includeCalendarLinks,
                      }),
                    )
                  }
                >
                  {sendBusy === "bulk" ? "Sending…" : `Send to selected (${selected.length})`}
                </Button>
              </div>

              {sendResult ? (
                <Notice tone={sendResult.error ? "danger" : "ok"} onClose={() => setSendResult(null)}>
                  <span className="block font-semibold" data-testid="send-result">
                    {sendResult.error
                      ? sendResult.error
                      : `Sent to ${sendResult.count} recipient${sendResult.count === 1 ? "" : "s"} · ${sendResult.at}`}
                  </span>
                  {sendResult.rows.length ? (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {sendResult.rows.map((row, i) => (
                        <li key={`${row.email || row.name}-${i}`}>
                          {row.name}
                          {row.email ? ` · ${row.email}` : ""} · {formatStatus(row.status)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {!sendResult.error ? (
                    <span className="mt-1 block text-xs">New entries appear at the top of the send log.</span>
                  ) : null}
                </Notice>
              ) : null}

              {preview ? (
                <div className="mt-4 rounded-2xl border border-line bg-soft p-3 text-sm">
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
            {/* The API already returns newest-first (communications are unshifted), so a
                new send lands at the TOP of this scrollable list — highlighted below. */}
            {log.map((c) => (
              <li
                key={c.id}
                data-testid={`comm-log-${c.id}`}
                className={cn(
                  "rounded-2xl border border-line p-3 text-sm",
                  sentIds.includes(c.id) && "ring-2 ring-brand-500 ring-offset-2 ring-offset-canvas",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <b>{c.subject}</b>
                  <span className="flex items-center gap-1">
                    {sentIds.includes(c.id) ? <Badge tone="ok">Just sent</Badge> : null}
                    <StatusBadge status={c.status || "mock_sent"} />
                  </span>
                </div>
                <p className="mt-1 text-xs text-mid">
                  {c.recipientName || c.speakerId} · {c.recipientEmail || "no email"} · {formatStatus(c.kind)} · {c.createdAt}
                </p>
                <p className="mt-1 text-[11px] text-mid">{c.deliveryNote || (c.status === "mock_sent" ? "Mock delivery" : "")}</p>
                {c.status === "sent" && c.providerId ? <p className="mt-1 text-[11px] font-semibold text-mid">provider id {c.providerId}</p> : null}
                {c.feedback ? (
                  <p className="mt-2 rounded-xl bg-soft p-2 text-xs" data-testid={`comm-feedback-${c.id}`}>
                    <b>Committee feedback included:</b> <span className="whitespace-pre-wrap text-ink-soft">{c.feedback}</span>
                  </p>
                ) : null}
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
