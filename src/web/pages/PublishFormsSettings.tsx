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
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const galleryPath = `/public/events/${EVENT_ID}/gallery`;
  const itineraryPath = `/public/events/${EVENT_ID}/itinerary`;
  const gallerySnippet = `<iframe src="${origin}${galleryPath}" title="Speaker gallery" style="width:100%;min-height:480px;border:0;border-radius:12px" loading="lazy"></iframe>`;
  const itinerarySnippet = `<iframe src="${origin}${itineraryPath}" title="Schedule itinerary" style="width:100%;min-height:640px;border:0;border-radius:12px" loading="lazy"></iframe>`;

  const loadRuns = () => api.syncRuns().then(setRuns).catch(() => {});

  useEffect(() => {
    loadRuns();
    return subscribeData(loadRuns);
  }, []);

  return (
    <div>
      <PageHeader
        title="Publish"
        description="HTML embeds for your site, plus honest one-way Accelevents sync (mock by default)."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-lg font-bold">Speaker gallery embed</h2>
            <Badge tone="primary">HTML</Badge>
          </div>
          <p className="text-sm text-stone-500">Mobile-friendly public page — not a JSON feed.</p>
          <div className="mt-3 overflow-hidden rounded-xl border">
            <iframe title="gallery preview" src={galleryPath} className="h-64 w-full bg-white" />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-3 text-[11px] text-lime">{gallerySnippet}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(gallerySnippet);
                toast("Gallery snippet copied");
              }}
            >
              Copy snippet
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={galleryPath} target="_blank" rel="noreferrer">
                Open HTML
              </a>
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-lg font-bold">Schedule itinerary embed</h2>
            <Badge tone="primary">HTML</Badge>
          </div>
          <p className="text-sm text-stone-500">Published sessions only, responsive list layout.</p>
          <div className="mt-3 overflow-hidden rounded-xl border">
            <iframe title="itinerary preview" src={itineraryPath} className="h-64 w-full bg-white" />
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-3 text-[11px] text-lime">{itinerarySnippet}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(itinerarySnippet);
                toast("Itinerary snippet copied");
              }}
            >
              Copy snippet
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={itineraryPath} target="_blank" rel="noreferrer">
                Open HTML
              </a>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={`${itineraryPath}.json`} target="_blank" rel="noreferrer">
                JSON feed
              </a>
            </Button>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">Accelevents one-way sync</h2>
            <Badge tone="warn">Mock mode · no network</Badge>
          </div>
          <p className="max-w-3xl text-sm text-stone-500">
            Preview plans create/update/skip without remote calls. Run uses the in-process mock client. Production HTTP
            paths and field names remain placeholders until Accelevents confirms its API — do not enable{" "}
            <code className="rounded bg-stone-100 px-1">ACCELEVENTS_LIVE=true</code> without that contract.
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
            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
              <b>
                {sync.run?.mode === "dry_run" ? "Preview" : "Run"} · {formatStatus(sync.run?.status)}
              </b>
              <p className="mt-1 text-stone-600">
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

          <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-stone-500">Run history</h3>
          {runs.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {runs.map((r) => (
                <li key={r.id} className="rounded-lg border border-stone-200 px-3 py-2">
                  {r.mode} · {formatStatus(r.status)} · create {r.counts?.create} / update {r.counts?.update} / skip{" "}
                  {r.counts?.skip} / error {r.counts?.error}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2">
              <EmptyState
                title="No runs yet"
                description="Preview or push to record a mock sync run."
              />
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
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-500">Write</h2>
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
          <div className="mb-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">Welcome preview</div>
            <Markdown text={form.welcomeMd || ""} />
          </div>
          <Field label="Success markdown">
            <Textarea
              rows={4}
              value={form.successMd}
              onChange={(e) => setForm({ ...form, successMd: e.target.value })}
            />
          </Field>
          <div className="mb-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">Success preview</div>
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
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-500">Fields & conditional logic</h2>
          <div className="space-y-3">
            {form.fields.map((f: any, idx: number) => {
              const hasCondition = !!f.visibleWhen;
              return (
                <div key={f.key} className="rounded-xl border border-stone-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm">{f.label}</b>
                    <Badge tone="muted">{f.type}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">key: {f.key}</p>

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
                    <p className="mt-2 text-xs text-stone-500">Always visible</p>
                  )}

                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => updateField(idx, { required: e.target.checked })}
                    />
                    Required when visible
                  </label>
                </div>
              );
            })}
          </div>

          <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">
            Category → board routing
          </h3>
          <ul className="space-y-2 text-sm">
            {form.routes.map((r: any, idx: number) => (
              <li key={r.category} className="grid grid-cols-[1fr_1fr] gap-2 rounded-lg bg-stone-50 p-2">
                <div>
                  <div className="text-[10px] font-bold uppercase text-stone-500">Category</div>
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
                  <div className="text-[10px] font-bold uppercase text-stone-500">Review board</div>
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

          <div className="mt-5 rounded-xl border border-dashed border-stone-300 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Logic preview</div>
            <div className="mb-2 flex flex-wrap gap-2">
              {selectFields.map((f: any) => (
                <label key={f.key} className="text-xs font-semibold text-stone-600">
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
                  <li key={f.key} className={visible ? "text-ink" : "text-stone-400 line-through"}>
                    {f.label} {visible ? "· visible" : "· hidden"}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-stone-500">
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Program structure</h2>
          <p className="mt-1 text-xs text-stone-500">Read-only from schedule seed (edit requires backend).</p>
          <div className="mt-4">
            <div className="text-xs font-bold uppercase text-stone-500">Tracks</div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {tracks.map((t) => (
                <Badge key={t.id} tone="primary">
                  {t.name}
                </Badge>
              ))}
              {!tracks.length ? <span className="text-sm text-stone-500">—</span> : null}
            </ul>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold uppercase text-stone-500">Rooms</div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {rooms.map((r) => (
                <Badge key={r.id} tone="muted">
                  {r.name}
                  {r.capacity ? ` · ${r.capacity}` : ""}
                </Badge>
              ))}
              {!rooms.length ? <span className="text-sm text-stone-500">—</span> : null}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
