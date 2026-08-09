import { useEffect, useState } from "react";
import { api, subscribeData } from "../lib/api";
import { EVENT_ID, EVENT_SLUG, formatStatus } from "../lib/utils";
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
  Textarea,
  toast,
} from "../components/ui";

export function PublishPage() {
  const [sync, setSync] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [widget, setWidget] = useState<"sessions" | "speakers" | "agenda" | "itinerary" | "gallery">("sessions");
  const [configs,setConfigs]=useState<any[]>([]),[configName,setConfigName]=useState(""),[trackFilter,setTrackFilter]=useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const widgets = [
    { id: "sessions" as const, label: "Sessions list", path: `/e/${EVENT_SLUG}/public/sessions`, blurb: "Searchable catalog with track/format/room facets." },
    { id: "speakers" as const, label: "Speakers list", path: `/e/${EVENT_SLUG}/public/speakers`, blurb: "Directory with bios and per-speaker sessions." },
    { id: "agenda" as const, label: "Agenda grid", path: `/e/${EVENT_SLUG}/public/agenda`, blurb: "Day tabs with room × time layout." },
    { id: "itinerary" as const, label: "Schedule itinerary", path: `/e/${EVENT_SLUG}/public/itinerary`, blurb: "Chronological days + My Schedule + ICS." },
    { id: "gallery" as const, label: "Speaker gallery", path: `/e/${EVENT_SLUG}/public/gallery`, blurb: "Visual photo grid of published speakers." },
  ];
  const active = widgets.find((w) => w.id === widget) || widgets[0];
  const iframeSnippet = `<iframe src="${origin}${active.path}" title="${active.label}" style="width:100%;min-height:640px;border:0;border-radius:12px" loading="lazy"></iframe>`;
  const jsonFeed = `${origin}/e/${EVENT_SLUG}/public/feed.json`;
  const sessionsJson = `${origin}/e/${EVENT_SLUG}/public/sessions.json`;
  const icsFeed = `${origin}/e/${EVENT_SLUG}/public/ics`;
  const legacyGallery = `/public/events/${EVENT_ID}/gallery`;
  const legacyItinerary = `/public/events/${EVENT_ID}/itinerary`;

  const loadRuns = () => api.syncRuns().then(setRuns).catch(() => {});

  useEffect(() => {
    loadRuns();
    api.embedConfigs().then(r=>setConfigs(r.data)).catch(()=>{});
    return subscribeData(loadRuns);
  }, []);

  return (
    <div>
      <PageHeader
        title="Publish"
        description="Embeddable public widgets from the canonical published program, plus honest one-way Accelevents sync (mock by default)."
      />

      <Card className="mb-4 p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">Embed manager</h2>
          <Badge tone="primary">5 widgets</Badge>
          <Badge tone="muted">published-only</Badge>
        </div>
        <p className="text-sm text-mid">
          Pick a surface, copy an iframe snippet, or share JSON / iCal feeds. All widgets read the same canonical projection — no republish step.
        </p>
        <div className="mt-4 rounded-[18px] border border-line p-4"><b>Saved embed configurations</b><div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]"><Input placeholder="Configuration name" value={configName} onChange={e=>setConfigName(e.target.value)}/><Input placeholder="Track filter (optional)" value={trackFilter} onChange={e=>setTrackFilter(e.target.value)}/><Button onClick={async()=>{const r=await api.createEmbedConfig({name:configName,widget,filters:{track:trackFilter},theme:{}});setConfigs([...configs,r.data]);setConfigName("");toast("Embed configuration saved")}}>Save config</Button></div>{configs.map(c=>{const url=`${origin}/e/${EVENT_SLUG}/public/${c.widget}?config=${c.id}`,snippet=`<iframe src="${url}" title="${c.name}" style="width:100%;min-height:640px;border:0"></iframe>`;return <div key={c.id} className="mt-3 rounded-[18px] bg-soft p-3 text-sm"><div className="flex justify-between"><b>{c.name}</b><Button size="sm" variant="outline" onClick={async()=>{await api.deleteEmbedConfig(c.id);setConfigs(configs.filter(x=>x.id!==c.id))}}>Delete</Button></div><code className="mt-1 block break-all text-xs">{snippet}</code></div>})}</div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Widget picker">
          {widgets.map((w) => (
            <Button
              key={w.id}
              size="sm"
              variant={widget === w.id ? "dark" : "outline"}
              onClick={() => setWidget(w.id)}
              aria-pressed={widget === w.id}
            >
              {w.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-sm text-mid">{active.blurb}</p>
        <div className="mt-3 overflow-hidden rounded-[18px] border">
          <iframe title={`${active.label} preview`} src={active.path} className="h-80 w-full bg-white" />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-mid">iframe snippet</div>
            <pre className="overflow-x-auto rounded-[18px] bg-ink p-3 text-[11px] text-soft">{iframeSnippet}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(iframeSnippet);
                  toast("Embed snippet copied");
                }}
              >
                Copy iframe
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={active.path} target="_blank" rel="noreferrer">
                  Open widget
                </a>
              </Button>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="rounded-[18px] border border-line bg-soft p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-mid">JSON feed</div>
              <code className="mt-1 block break-all text-xs">{jsonFeed}</code>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(jsonFeed);
                    toast("JSON feed URL copied");
                  }}
                >
                  Copy JSON
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={sessionsJson} target="_blank" rel="noreferrer">
                    sessions.json
                  </a>
                </Button>
              </div>
            </div>
            <div className="rounded-[18px] border border-line bg-soft p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-mid">iCal feed</div>
              <code className="mt-1 block break-all text-xs">{icsFeed}</code>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(icsFeed);
                    toast("iCal URL copied");
                  }}
                >
                  Copy iCal
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={icsFeed} target="_blank" rel="noreferrer">
                    Download .ics
                  </a>
                </Button>
              </div>
            </div>
            <div className="rounded-[18px] border border-dashed border-line p-3 text-xs text-mid">
              Legacy aliases still work:{" "}
              <a className="font-semibold text-ink" href={legacyGallery} target="_blank" rel="noreferrer">
                /public/.../gallery
              </a>
              {" · "}
              <a className="font-semibold text-ink" href={legacyItinerary} target="_blank" rel="noreferrer">
                /public/.../itinerary
              </a>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">Accelevents one-way sync</h2>
            <Badge tone="warn">Mock mode · no network</Badge>
          </div>
          <p className="max-w-3xl text-sm text-mid">
            Preview plans create/update/skip without remote calls. Run uses the in-process mock client. Production HTTP
            paths and field names remain placeholders until Accelevents confirms its API — do not enable{" "}
            <code className="rounded bg-canvas px-1">ACCELEVENTS_LIVE=true</code> without that contract.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                try {
                  const r = await api.syncPreview();
                  setSync(r);
                  loadRuns();
                  toast("Dry-run preview recorded");
                } catch (e: any) {
                  toast(e.message, "danger");
                }
              }}
            >
              Preview push
            </Button>
            <Button
              variant="dark"
              onClick={async () => {
                try {
                  const r = await api.syncRun();
                  setSync(r);
                  loadRuns();
                  toast("Mock live run completed");
                } catch (e: any) {
                  toast(e.message, "danger");
                }
              }}
            >
              Push now (mock)
            </Button>
          </div>

          {sync ? (
            <div className="mt-4 rounded-[18px] border border-line bg-soft p-4 text-sm">
              <b>
                {sync.run?.mode === "dry_run" ? "Preview" : "Run"} · {formatStatus(sync.run?.status)}
              </b>
              <p className="mt-1 text-mid">
                {Object.entries(sync.run?.counts || {})
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                {(sync.items || []).map((it: any) => (
                  <li key={it.id}>
                    {it.entityType} {it.localId}: <b>{it.operation}</b> · {it.status}
                    {it.payloadSummary ? ` · ${it.payloadSummary.slice(0, 80)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-mid">Run history</h3>
          {runs.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {runs.map((r) => (
                <li key={r.id} className="rounded-lg border border-line px-3 py-2">
                  {r.mode} · {formatStatus(r.status)} · create {r.counts?.create} / update {r.counts?.update} / skip{" "}
                  {r.counts?.skip} / error {r.counts?.error}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2">
              <EmptyState title="No runs yet" description="Preview or push to record a mock sync run." />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const BOARD_OPTIONS = [
  { id: "engineering", label: "Engineering" },
  { id: "product", label: "Product" },
  { id: "agents", label: "Agents" },
  { id: "workshop", label: "Workshop" },
];

export function FormsPage() {
  const [form, setForm] = useState<any>(null);
  const [err, setErr] = useState("");
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({
    format: "Talk",
    category: "Engineering",
  });

  const load = () =>
    api
      .form()
      .then((r) => setForm(r.data))
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    return subscribeData(load);
  }, []);

  if (!form && !err) return <Spinner />;
  if (!form) return <Notice tone="danger">{err}</Notice>;

  const updateField = (idx: number, patch: any) => {
    const fields = form.fields.map((f: any, i: number) => (i === idx ? { ...f, ...patch } : f));
    setForm({ ...form, fields });
  };

  const fieldKeys = form.fields.map((f: any) => f.key);
  const selectFields = form.fields.filter((f: any) => f.type === "select" || (f.options || []).length);

  const save = async () => {
    await api.saveForm(form.id, form);
    toast("Form saved — public CFP uses this schema");
    load();
  };

  return (
    <div>
      <PageHeader
        title="CFP form builder"
        description="Edit copy, conditional visibility, and category → review-board routing. Changes persist in memory."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/e/${EVENT_SLUG}/cfp`);
                toast("Public CFP link copied");
              }}
            >
              Copy CFP link
            </Button>
            <Button asChild variant="outline">
              <a href={`/e/${EVENT_SLUG}/cfp`} target="_blank" rel="noreferrer">
                View CFP
              </a>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mid">Write</h2>
          <Field label="Internal title">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Welcome markdown" hint="Supports **bold**, lists, and line breaks.">
            <Textarea
              rows={6}
              value={form.welcomeMd}
              onChange={(e) => setForm({ ...form, welcomeMd: e.target.value })}
            />
          </Field>
          <div className="mb-3 rounded-[18px] border border-line bg-soft p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-mid">Welcome preview</div>
            <Markdown text={form.welcomeMd || ""} />
          </div>
          <Field label="Success markdown">
            <Textarea
              rows={4}
              value={form.successMd}
              onChange={(e) => setForm({ ...form, successMd: e.target.value })}
            />
          </Field>
          <div className="mb-3 rounded-[18px] border border-line bg-soft p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-mid">Success preview</div>
            <Markdown text={form.successMd || ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
            <Field label="Max per user">
              <Input
                type="number"
                value={form.maxPerUser}
                onChange={(e) => setForm({ ...form, maxPerUser: Number(e.target.value) })}
              />
            </Field>
            <Field label="Opens at">
              <Input type="datetime-local" value={form.openAt?.slice(0, 16) || ""} onChange={(e) => setForm({ ...form, openAt: new Date(e.target.value).toISOString() })} />
            </Field>
            <Field label="Closes at">
              <Input type="datetime-local" value={form.closeAt?.slice(0, 16) || ""} onChange={(e) => setForm({ ...form, closeAt: new Date(e.target.value).toISOString() })} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mid">Fields & conditional logic</h2>
          <div className="space-y-3">
            {form.fields.map((f: any, idx: number) => {
              const hasCondition = !!f.visibleWhen;
              return (
                <div key={f.key} className="rounded-[18px] border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                    <Field label="Field label"><Input value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })} /></Field>
                    <Field label="Type"><Select value={f.type} onChange={(e) => updateField(idx, { type: e.target.value })}>{[["text","Short text"],["textarea","Long text"],["select","Dropdown"],["checkbox","Checkbox"],["file","File upload"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
                  </div>
                  <p className="mt-1 text-xs text-mid">key: {f.key}</p>
                  <Field label="Section"><Input value={f.section || ""} placeholder="Proposal" onChange={(e) => updateField(idx, { section: e.target.value })} /></Field>
                  {f.type === "select" ? <Field label="Options" hint="One per line"><Textarea rows={3} value={(f.options || []).join("\n")} onChange={(e) => updateField(idx, { options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Field> : null}

                  <label className="mt-2 flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={hasCondition}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const trigger = selectFields.find((x: any) => x.key !== f.key) || form.fields[0];
                          const equals = (trigger?.options || ["Workshop"])[0] || "Workshop";
                          updateField(idx, {
                            visibleWhen: { key: trigger?.key || "format", equals },
                          });
                        } else {
                          updateField(idx, { visibleWhen: undefined });
                        }
                      }}
                    />
                    Conditional visibility
                  </label>

                  {hasCondition ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label="Show if field">
                        <Select
                          value={f.visibleWhen.key}
                          onChange={(e) => {
                            const key = e.target.value;
                            const src = form.fields.find((x: any) => x.key === key);
                            const equals = f.visibleWhen.equals || (src?.options || [""])[0] || "";
                            updateField(idx, { visibleWhen: { key, equals } });
                          }}
                        >
                          {fieldKeys
                            .filter((k: string) => k !== f.key)
                            .map((k: string) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                        </Select>
                      </Field>
                      <Field label="Equals">
                        {(() => {
                          const src = form.fields.find((x: any) => x.key === f.visibleWhen.key);
                          const opts: string[] = src?.options || [];
                          if (opts.length) {
                            return (
                              <Select
                                value={f.visibleWhen.equals}
                                onChange={(e) =>
                                  updateField(idx, {
                                    visibleWhen: { ...f.visibleWhen, equals: e.target.value },
                                  })
                                }
                              >
                                {opts.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </Select>
                            );
                          }
                          return (
                            <Input
                              value={f.visibleWhen.equals}
                              onChange={(e) =>
                                updateField(idx, {
                                  visibleWhen: { ...f.visibleWhen, equals: e.target.value },
                                })
                              }
                            />
                          );
                        })()}
                      </Field>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-mid">Always visible</p>
                  )}

                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                    />
                    Required when visible
                  </label>
                  {!['title','abstract','category','format'].includes(f.key) ? <Button size="sm" variant="ghost" className="mt-2" onClick={() => setForm({ ...form, fields: form.fields.filter((_:any,i:number)=>i!==idx) })}>Remove field</Button> : null}
                </div>
              );
            })}
          </div>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => { const key=`custom_${Date.now()}`; setForm({ ...form, fields:[...form.fields,{ key,label:"New field",type:"text",required:false,section:"Proposal" }] }); }}>Add field</Button>

          <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-mid">
            Category → board routing
          </h3>
          <ul className="space-y-2 text-sm">
            {form.routes.map((r: any, idx: number) => (
              <li key={r.category} className="grid grid-cols-[1fr_1fr] gap-2 rounded-lg bg-soft p-2">
                <div>
                  <div className="text-[10px] font-bold uppercase text-mid">Category</div>
                  <Input
                    value={r.category}
                    onChange={(e) => {
                      const routes = form.routes.map((x: any, i: number) =>
                        i === idx ? { ...x, category: e.target.value } : x,
                      );
                      setForm({ ...form, routes });
                    }}
                  />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-mid">Review board</div>
                  <Select
                    value={r.boardId}
                    onChange={(e) => {
                      const board = BOARD_OPTIONS.find((b) => b.id === e.target.value);
                      const routes = form.routes.map((x: any, i: number) =>
                        i === idx
                          ? {
                              ...x,
                              boardId: e.target.value,
                              boardLabel: board?.label || e.target.value,
                            }
                          : x,
                      );
                      setForm({ ...form, routes });
                    }}
                  >
                    {BOARD_OPTIONS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                    {!BOARD_OPTIONS.some((b) => b.id === r.boardId) ? (
                      <option value={r.boardId}>{r.boardLabel || r.boardId}</option>
                    ) : null}
                  </Select>
                </div>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() =>
              setForm({
                ...form,
                routes: [
                  ...form.routes,
                  { category: "New track", boardId: "engineering", boardLabel: "Engineering" },
                ],
              })
            }
          >
            Add route
          </Button>

          <div className="mt-5 rounded-[18px] border border-dashed border-line p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-mid">Logic preview</div>
            <div className="mb-2 flex flex-wrap gap-2">
              {selectFields.map((f: any) => (
                <label key={f.key} className="text-xs font-semibold text-mid">
                  {f.label}
                  <Select
                    className="mt-1"
                    value={previewAnswers[f.key] || f.options?.[0] || ""}
                    onChange={(e) => setPreviewAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
                  >
                    {(f.options || []).map((o: string) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            <ul className="space-y-1 text-xs">
              {form.fields.map((f: any) => {
                const visible =
                  !f.visibleWhen || previewAnswers[f.visibleWhen.key] === f.visibleWhen.equals;
                return (
                  <li key={f.key} className={visible ? "text-ink" : "text-mid line-through"}>
                    {f.label} {visible ? "· visible" : "· hidden"}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-mid">
              Category “{previewAnswers.category || "—"}” routes to{" "}
              <b>
                {form.routes.find((r: any) => r.category === previewAnswers.category)?.boardLabel ||
                  "default board"}
              </b>
            </p>
          </div>

          <Button className="mt-4" onClick={save}>
            Save form
          </Button>
        </Card>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [event, setEvent] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([api.bootstrap(), api.schedule().catch(() => null)]).then(([b, s]) => {
      setEvent(b.data.event);
      if (s) {
        setRooms(s.rooms || []);
        setTracks(s.tracks || []);
      }
    });
  }, []);

  if (!event) return <Spinner />;

  return (
    <div>
      <PageHeader title="Settings" description="Event basics used across CFP, portal, and embeds." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Field label="Name">
            <Input value={event.name} onChange={(e) => setEvent({ ...event, name: e.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={event.website} onChange={(e) => setEvent({ ...event, website: e.target.value })} />
          </Field>
          <Field label="Location">
            <Input value={event.location} onChange={(e) => setEvent({ ...event, location: e.target.value })} />
          </Field>
          <Field label="Timezone">
            <Input value={event.timezone} onChange={(e) => setEvent({ ...event, timezone: e.target.value })} />
          </Field>
          <Button
            onClick={async () => {
              const r = await api.saveSettings(event);
              setEvent(r.data);
              toast("Settings saved");
            }}
          >
            Save
          </Button>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-mid">Program structure</h2>
          <p className="mt-1 text-xs text-mid">
            Rooms and tracks are editable on the{" "}
            <a className="font-semibold underline" href="/app/schedule">
              Schedule
            </a>{" "}
            page (+ Room / + Track). Changes apply immediately to the canonical schedule.
          </p>
          <div className="mt-4">
            <div className="text-xs font-bold uppercase text-mid">Tracks</div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {tracks.map((t) => (
                <Badge key={t.id} tone="primary">
                  {t.name}
                </Badge>
              ))}
              {!tracks.length ? <span className="text-sm text-mid">—</span> : null}
            </ul>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold uppercase text-mid">Rooms</div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {rooms.map((r) => (
                <Badge key={r.id} tone="muted">
                  {r.name}
                  {r.capacity ? ` · ${r.capacity}` : ""}
                </Badge>
              ))}
              {!rooms.length ? <span className="text-sm text-mid">—</span> : null}
            </ul>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <a href="/app/schedule">Open schedule builder</a>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
