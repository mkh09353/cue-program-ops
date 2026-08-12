import { useEffect, useState } from "react";
import { api, subscribeData } from "../lib/api";
import { getActiveEvent, getEventId } from "../lib/api";
/** Public links follow the ACTIVE event, not the seeded demo event. */
const EVENT_SLUG = { toString: () => getActiveEvent().slug } as unknown as string;
import { useAsyncData } from "../lib/useAsyncData";
import { adoptSaveResult, formatStatus } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadState,
  Markdown,
  Notice,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  toast,
} from "../components/ui";

/** Where saved-embed presentation preferences live (see the note in the manager). */
export const EMBED_PREFS_KEY = "cue-embed-prefs";

/** Build the copyable snippet for a saved embed.
 * Basic = a bare iframe. Styled = iframe plus a scoped <style> block carrying the
 * organizer's custom CSS, so the format choice produces genuinely different output. */
export function embedSnippet(input: { url: string; name: string; format: "basic" | "styled"; css?: string }) {
  const iframe = `<iframe src="${input.url}" title="${input.name}" style="width:100%;min-height:640px;border:0"></iframe>`;
  if (input.format !== "styled") return iframe;
  const css = (input.css || "").trim() || ".cue-embed{border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}";
  return `<style>\n${css}\n</style>\n<div class="cue-embed">\n  ${iframe}\n</div>`;
}

export function PublishPage() {
  const [sync, setSync] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [widget, setWidget] = useState<"sessions" | "speakers" | "agenda" | "itinerary" | "gallery">("sessions");
  const [configs,setConfigs]=useState<any[]>([]),[configName,setConfigName]=useState(""),[trackFilter,setTrackFilter]=useState("");
  const [formatFilter,setFormatFilter]=useState(""),[dayFilter,setDayFilter]=useState(""),[accent,setAccent]=useState("#12141A"),[configErr,setConfigErr]=useState("");
  const [cardFields,setCardFields]=useState({speakers:true,room:true,track:true,description:true});
  const [configSaved,setConfigSaved]=useState("");
  const [configBusy,setConfigBusy]=useState(false);
  const [configQuery,setConfigQuery]=useState("");
  const [embedFormat,setEmbedFormat]=useState<"basic"|"styled">("basic");
  const [customCss,setCustomCss]=useState("");
  /** Presentation state for saved embeds (enabled flag, snippet format, custom CSS).
   * The server's embed-config record does not carry these fields, so they are kept
   * in this browser under EMBED_PREFS_KEY. See the note rendered next to the toggle. */
  const [prefs,setPrefs]=useState<Record<string,{enabled:boolean;format:"basic"|"styled";css:string}>>(()=>{
    try{return JSON.parse(localStorage.getItem(EMBED_PREFS_KEY)||"{}")}catch{return {}}
  });
  const prefFor=(id:string)=>prefs[id]||{enabled:true,format:"basic" as const,css:""};
  const savePrefs=(next:Record<string,{enabled:boolean;format:"basic"|"styled";css:string}>)=>{
    setPrefs(next);
    try{localStorage.setItem(EMBED_PREFS_KEY,JSON.stringify(next))}catch{/* storage unavailable */}
  };
  const loadConfigs=()=>api.embedConfigs().then(r=>setConfigs(r.data)).catch(()=>{});
  const configMatches=(c:any,q:string)=>{
    const needle=q.trim().toLowerCase();
    if(!needle)return true;
    const filters=[c.filters?.track,c.filters?.format,c.filters?.day,c.filters?.room].filter(Boolean).join(" ");
    return [c.name,c.widget,filters].join(" ").toLowerCase().includes(needle);
  };
  const visibleConfigs=configs.filter(c=>configMatches(c,configQuery));
  const enabledCount=configs.filter(c=>prefFor(c.id).enabled).length;
  const [facets,setFacets]=useState<{tracks:string[];formats:string[];rooms:string[];days:string[]}>({tracks:[],formats:[],rooms:[],days:[]});
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
  // One XML output URL per widget, alongside JSON and iCal.
  const xmlByWidget: Record<string,string> = {
    sessions: `${origin}/e/${EVENT_SLUG}/public/sessions.xml`,
    speakers: `${origin}/e/${EVENT_SLUG}/public/speakers.xml`,
    agenda: `${origin}/e/${EVENT_SLUG}/public/agenda.xml`,
    itinerary: `${origin}/e/${EVENT_SLUG}/public/itinerary.xml`,
    gallery: `${origin}/e/${EVENT_SLUG}/public/gallery.xml`,
  };
  const legacyGallery = `/public/events/${getEventId()}/gallery`;
  const legacyItinerary = `/public/events/${getEventId()}/itinerary`;

  const loadRuns = () => api.syncRuns().then(setRuns).catch(() => {});

  useEffect(() => {
    loadRuns();
    void loadConfigs();
    // Facet values come from the same canonical published program the widgets render.
    fetch(`/e/${EVENT_SLUG}/public/feed.json`)
      .then(r=>r.json())
      .then(d=>setFacets({tracks:d.facets?.tracks||[],formats:d.facets?.formats||[],rooms:d.facets?.rooms||[],days:d.days||[]}))
      .catch(()=>{});
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
        <div className="mt-4 rounded-[18px] border border-line p-4">
          <b>Saved embed configurations</b>
          <p className="mt-1 text-xs text-mid">
            Save a reusable embed for the <b>{widget}</b> widget: brand color, plus any combination of track, format and day filters.
            Each saved config gets its own iframe URL and matching JSON / XML / iCal feed URLs.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <Field label="Configuration name">
              <Input aria-label="Embed configuration name" placeholder="Product track, day 1" value={configName} onChange={e=>setConfigName(e.target.value)}/>
            </Field>
            <Field label="Track filter">
              <Select aria-label="Embed track filter" value={trackFilter} onChange={e=>setTrackFilter(e.target.value)}>
                <option value="">All tracks</option>
                {facets.tracks.map(t=><option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Format filter">
              <Select aria-label="Embed format filter" value={formatFilter} onChange={e=>setFormatFilter(e.target.value)}>
                <option value="">All formats</option>
                {facets.formats.map(t=><option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Day filter">
              <Select aria-label="Embed day filter" value={dayFilter} onChange={e=>setDayFilter(e.target.value)}>
                <option value="">All days</option>
                {facets.days.map(t=><option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Branding color" hint="Accent for headers, badges and links on this embed only.">
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Embed branding color" className="h-10 w-12 cursor-pointer rounded-[12px] border border-line bg-white" value={accent} onChange={e=>setAccent(e.target.value)}/>
                <Input aria-label="Embed branding color hex" value={accent} onChange={e=>setAccent(e.target.value)}/>
              </div>
            </Field>
            <div className="flex items-end">
              <Button disabled={configBusy} onClick={async()=>{
                setConfigErr("");setConfigSaved("");setConfigBusy(true);
                try{
                  const r=await api.createEmbedConfig({name:configName.trim()||`${widget} embed`,widget,filters:{track:trackFilter||undefined,format:formatFilter||undefined,day:dayFilter||undefined},theme:{accent},fields:cardFields});
                  // Optimistic add AND authoritative re-fetch: the saved config must be
                  // visible immediately on the first click, not after a later interaction.
                  setConfigs((prev:any[])=>prev.some(x=>x.id===r.data.id)?prev:[...prev,r.data]);
                  await loadConfigs();
                  savePrefs({ ...prefs, [r.data.id]: { enabled: true, format: embedFormat, css: customCss } });
                  setConfigName("");
                  setConfigSaved(`Saved "${r.data.name}" · ${r.data.widget} · ${embedFormat === "styled" ? "styled" : "basic"} snippet ready below`);
                  toast("Embed configuration saved");
                }catch(e:any){setConfigErr(e?.message||"Save failed");toast(e?.message||"Save failed","danger")}
                finally{setConfigBusy(false)}
              }}>{configBusy?"Saving…":"Save config"}</Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Field label="Snippet format" hint="Basic emits a bare iframe. Styled wraps it and applies your CSS.">
              <Select aria-label="Embed snippet format" data-testid="embed-format" value={embedFormat} onChange={e=>setEmbedFormat(e.target.value as "basic"|"styled")}>
                <option value="basic">Basic HTML (plain iframe)</option>
                <option value="styled">Styled HTML (wrapper + custom CSS)</option>
              </Select>
            </Field>
            <Field label="Custom CSS" hint="Applied to the styled snippet only; scope rules to .cue-embed.">
              <Textarea aria-label="Embed custom CSS" data-testid="embed-css" rows={2} placeholder=".cue-embed{border-radius:18px}" value={customCss} onChange={e=>setCustomCss(e.target.value)}/>
            </Field>
          </div>
          <div className="mt-3 rounded-[18px] border border-line p-3">
            <b className="text-xs uppercase tracking-wide text-mid">Card fields to display</b>
            <p className="mt-1 text-xs text-mid">Unchecked fields are omitted from the rendered cards in this embed.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ["speakers","Speakers"],
                ["room","Room"],
                ["track","Track"],
                ["description","Description"],
              ] as const).map(([key,label])=>{
                const id=`embed-field-${key}`;
                const checked=(cardFields as any)[key];
                return <label key={key} htmlFor={id} className={`flex cursor-pointer items-center gap-2 rounded-[18px] border px-3 py-2 text-sm ${checked?"border-ink bg-soft":"border-line bg-white"}`}>
                  <input id={id} type="checkbox" aria-label={`Show ${label}`} checked={checked} onChange={e=>setCardFields(prev=>({...prev,[key]:e.target.checked}))}/>
                  {label}
                </label>;
              })}
            </div>
          </div>
          {configSaved?<Notice tone="ok" onClose={()=>setConfigSaved("")}>{configSaved}</Notice>:null}
          {configErr?<Notice tone="danger" onClose={()=>setConfigErr("")}>{configErr}</Notice>:null}
          <p className="mt-3 text-xs text-mid" data-testid="embed-prefs-note">
            Enabled/disabled, snippet format and custom CSS are stored in this browser — the shared event record keeps name, widget, filters, branding and fields.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input aria-label="Search saved embeds" data-testid="embed-search" placeholder="Search saved embeds by name, widget or filter" value={configQuery} onChange={e=>setConfigQuery(e.target.value)}/>
            <span className="text-xs text-mid" data-testid="embed-config-count">{visibleConfigs.length} of {configs.length} saved · {enabledCount} enabled · {configs.length-enabledCount} disabled</span>
          </div>
          {configs.length&&!visibleConfigs.length?<p className="mt-2 text-sm text-mid" data-testid="embed-search-empty">No saved embed matches “{configQuery}”.</p>:null}
          {!configs.length?<p className="mt-2 text-sm text-mid" data-testid="embed-none-saved">No saved embeds yet — configure one above and click Save config.</p>:null}
          {visibleConfigs.map(c=>{
            const url=`${origin}/e/${EVENT_SLUG}/public/${c.widget}?config=${c.id}`;
            const pref=prefFor(c.id);
            const snippet=embedSnippet({url,name:c.name,format:pref.format,css:pref.css});
            const filterBits=[c.filters?.track&&`track: ${c.filters.track}`,c.filters?.format&&`format: ${c.filters.format}`,c.filters?.day&&`day: ${c.filters.day}`].filter(Boolean);
            return <div key={c.id} className="mt-3 rounded-[18px] bg-soft p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{c.name}</b>
                  <Badge tone="muted">{c.widget}</Badge>
                  {c.theme?.accent?<span className="inline-flex items-center gap-1 text-xs text-mid"><span className="inline-block h-3 w-3 rounded-full border border-line" style={{background:c.theme.accent}}/>{c.theme.accent}</span>:null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={pref.enabled?"ok":"muted"} data-testid={`embed-status-${c.id}`}>{pref.enabled?"Enabled":"Disabled"}</Badge>
                  <Badge tone="muted">{pref.format==="styled"?"Styled HTML":"Basic HTML"}</Badge>
                  <Button size="sm" variant="outline" data-testid={`embed-toggle-${c.id}`} onClick={()=>savePrefs({...prefs,[c.id]:{...pref,enabled:!pref.enabled}})}>{pref.enabled?"Disable":"Enable"}</Button>
                  <Button asChild size="sm" variant="ghost"><a href={url} target="_blank" rel="noreferrer">Open</a></Button>
                  <Button size="sm" variant="outline" onClick={async()=>{await api.deleteEmbedConfig(c.id);setConfigs(configs.filter(x=>x.id!==c.id))}}>Delete</Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-mid">{filterBits.length?filterBits.join(" · "):"No filters — full published program"}</p>
              {c.fields?<p className="text-xs text-mid">Fields: {Object.entries(c.fields).filter(([,v])=>v).map(([k])=>k).join(", ")||"title only"}</p>:null}
              {pref.enabled
                ? <code className="mt-1 block whitespace-pre-wrap break-all text-xs" data-testid={`embed-snippet-${c.id}`}>{snippet}</code>
                : <p className="mt-1 text-xs text-mid" data-testid={`embed-disabled-note-${c.id}`}>Disabled — the snippet is withheld here so it is not pasted by mistake. Re-enable to copy it. The public URL itself stays reachable until the config is deleted.</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <a className="underline" href={`${origin}/e/${EVENT_SLUG}/public/feed.json?config=${c.id}`} target="_blank" rel="noreferrer">JSON</a>
                <a className="underline" href={`${origin}/e/${EVENT_SLUG}/public/${c.widget==="speakers"||c.widget==="gallery"?"speakers":"sessions"}.xml?config=${c.id}`} target="_blank" rel="noreferrer">XML</a>
                <a className="underline" href={`${origin}/e/${EVENT_SLUG}/public/ics`} target="_blank" rel="noreferrer">iCal</a>
              </div>
            </div>;
          })}
        </div>
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
              <div className="text-[11px] font-bold uppercase tracking-wide text-mid">XML feed ({active.label})</div>
              <code className="mt-1 block break-all text-xs">{xmlByWidget[widget]}</code>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(xmlByWidget[widget]);
                    toast("XML feed URL copied");
                  }}
                >
                  Copy XML
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={xmlByWidget[widget]} target="_blank" rel="noreferrer">
                    Open XML
                  </a>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={`${origin}/e/${EVENT_SLUG}/public/feed.xml`} target="_blank" rel="noreferrer">
                    Full program XML
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

export function createCustomCfpField(existingFields: Array<{key:string}>) {
  const used = new Set(existingFields.map((field) => field.key));
  let key = "";
  do key = `custom_${crypto.randomUUID()}`; while (used.has(key));
  // Build from a clean literal: never clone a neighboring seeded field's options,
  // condition, or help text.
  return { key, label: "New field", type: "text", required: false, section: "Proposal" };
}

export function FormsPage() {
  const [form, setForm] = useState<any>(null);
  const [savedSnap, setSavedSnap] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState("");
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({
    format: "Talk (30 min)",
    category: "AI Engineering",
  });

  const snapshotOf = (f: any) => JSON.stringify(f || {});

  const load = () =>
    api
      .form()
      .then((r) => {
        setForm(r.data);
        setSavedSnap(snapshotOf(r.data));
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    return subscribeData(load);
  }, []);

  useEffect(()=>{
    if(!form||!savedSnap||snapshotOf(form)===savedSnap||saving)return;
    const timer=window.setTimeout(async()=>{
      // Snapshot what we are sending: edits made WHILE the request is in flight
      // (e.g. ticking "required" right after adding a field) must not be clobbered
      // by the server response.
      const sent=snapshotOf(form);
      try{
        const r=await api.saveForm(form.id,form);
        setSavedSnap(snapshotOf(r.data));
        setForm((cur:any)=>adoptSaveResult(cur,sent,r.data,snapshotOf));
        setLastAutoSave(new Date().toLocaleTimeString());
      }catch(e:any){setErr(e?.message||"Auto-save failed")}
    },700);
    return()=>window.clearTimeout(timer);
  },[form,savedSnap,saving]);

  if (!form && !err) return <Spinner />;
  if (!form) return <Notice tone="danger">{err}</Notice>;

  const dirty = snapshotOf(form) !== savedSnap;

  /** Patch a field BY KEY. Index-based updates re-bound the wrong field's
   * conditional visibility whenever the list shifted (a new field appended). */
  const updateFieldByKey = (key: string, patch: any) => {
    const fields = form.fields.map((f: any) => (f.key === key ? { ...f, ...patch } : f));
    setForm({ ...form, fields });
  };
  const updateField = (idx: number, patch: any) => {
    const target = form.fields[idx];
    if (!target) return;
    updateFieldByKey(target.key, patch);
  };

  const fieldKeys = form.fields.map((f: any) => f.key);
  const selectFields = form.fields.filter((f: any) => f.type === "select" || (f.options || []).length);
  const trackField = form.fields.find((f: any) => f.key === "category");
  const trackOptions: string[] = trackField?.options || [];

  const save = async (opts?: { openPublic?: boolean; silent?: boolean }) => {
    setSaving(true);
    setErr("");
    try {
      // Keep board routes aligned with current track options so public CFP never drifts.
      const existing = new Map((form.routes || []).map((r: any) => [r.category, r]));
      const routes = trackOptions.map((category) => {
        const prev: any = existing.get(category);
        if (prev) return prev;
        const slug = category
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        return {
          category,
          boardId: slug || "engineering",
          boardLabel: `${category} board`,
        };
      });
      // Preserve legacy routes for already-submitted categories not in the current track list.
      for (const r of form.routes || []) {
        if (!routes.some((x: any) => x.category === r.category)) routes.push(r);
      }
      const payload = { ...form, routes };
      const sent = snapshotOf(form);
      const r = await api.saveForm(form.id, payload);
      setSavedSnap(snapshotOf(r.data));
      // Keep any edit made while the save was in flight (see autosave note).
      setForm((cur: any) => adoptSaveResult(cur, sent, r.data, snapshotOf));
      setLastAutoSave(new Date().toLocaleTimeString());
      if (!opts?.silent) {
        toast(
          opts?.openPublic
            ? "Saved & published to public CFP"
            : "Form saved — public CFP uses this schema",
        );
      }
      if (opts?.openPublic) {
        window.open(`/e/${EVENT_SLUG}/cfp`, "_blank", "noopener,noreferrer");
      }
      return r.data;
    } catch (e: any) {
      const msg = e?.message || "Save failed";
      setErr(msg);
      toast(msg, "danger");
      throw e;
    } finally {
      setSaving(false);
    }
  };


  const closeNow = async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    setForm({ ...form, closeAt: past, status: "closed" });
    // save with closed status immediately
    setSaving(true);
    try {
      const r = await api.saveForm(form.id, { ...form, closeAt: past, status: "closed" });
      setForm(r.data);
      setSavedSnap(snapshotOf(r.data));
      toast("CFP closed — public form shows Closed immediately");
    } catch (e: any) {
      toast(e?.message || "Close failed", "danger");
    } finally {
      setSaving(false);
    }
  };

  const openNow = async () => {
    const future = new Date(Date.now() + 86400_000 * 30).toISOString();
    setSaving(true);
    try {
      const r = await api.saveForm(form.id, {
        ...form,
        status: "open",
        closeAt: form.closeAt && Date.parse(form.closeAt) > Date.now() ? form.closeAt : future,
        openAt: form.openAt || new Date(Date.now() - 86400_000).toISOString(),
      });
      setForm(r.data);
      setSavedSnap(snapshotOf(r.data));
      toast("CFP opened");
    } catch (e: any) {
      toast(e?.message || "Open failed", "danger");
    } finally {
      setSaving(false);
    }
  };

  const toLocalInput = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div>
      <PageHeader
        title="CFP form builder"
        description="Edit the public call-for-proposals form. Save (or Save & publish) so field changes reach the public CFP."
        actions={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => save()}>
              {saving ? "Saving…" : dirty ? "Save form *" : "Save form"}
            </Button>
            <Button
              disabled={saving}
              onClick={() => save({ openPublic: true })}
              aria-label="Save and publish CFP"
            >
              {saving ? "Publishing…" : "Save & publish CFP"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (dirty) {
                  try {
                    await save({ silent: true });
                  } catch {
                    return;
                  }
                }
                window.open(`/e/${EVENT_SLUG}/cfp`, "_blank", "noopener,noreferrer");
              }}
            >
              View public CFP
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/e/${EVENT_SLUG}/cfp`);
                toast("Public CFP link copied");
              }}
            >
              Copy CFP link
            </Button>
          </>
        }
      />

      {/* Prominent CFP window — agent looked in Settings and missed buried Opens/Closes fields */}
      <Card className="mb-4 border-line p-5" id="cfp-window" data-testid="cfp-window">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-mid">CFP window</h2>
            <p className="mt-1 text-sm text-mid">
              Open / close dates control the public form. Closing takes effect as soon as you save.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={saving} onClick={openNow}>
              Open CFP now
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={closeNow}>
              Close CFP now
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <Select
              aria-label="CFP status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
          <Field label="Open date">
            <Input
              type="datetime-local"
              aria-label="CFP open date"
              value={toLocalInput(form.openAt)}
              onChange={(e) =>
                setForm({
                  ...form,
                  openAt: e.target.value ? new Date(e.target.value).toISOString() : form.openAt,
                })
              }
            />
          </Field>
          <Field label="Close date">
            <Input
              type="datetime-local"
              aria-label="CFP close date"
              value={toLocalInput(form.closeAt)}
              onChange={(e) =>
                setForm({
                  ...form,
                  closeAt: e.target.value ? new Date(e.target.value).toISOString() : form.closeAt,
                })
              }
            />
          </Field>
          <Field label="Max proposals per user">
            <Input
              type="number"
              aria-label="Max proposals per user"
              value={form.maxPerUser}
              onChange={(e) => setForm({ ...form, maxPerUser: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={form.status === "open" ? "ok" : "warn"}>{form.status === "open" ? "Open" : "Closed"}</Badge>
          <span className="text-mid">
            Accepting until {form.closeAt ? new Date(form.closeAt).toLocaleString() : "—"}
          </span>
          <Button size="sm" className="ml-auto" disabled={saving || !dirty} onClick={() => save()}>
            Save window
          </Button>
        </div>
      </Card>

      {err ? <Notice tone="danger">{err}</Notice> : null}
      {dirty ? (
        <Notice tone="warn">
          Unsaved changes — public CFP still shows the last saved schema. Click <b>Save form</b> or{" "}
          <b>Save &amp; publish CFP</b>.
        </Notice>
      ) : (
        <Notice tone="ok">All changes saved{lastAutoSave?` at ${lastAutoSave}`:""}. Public CFP matches this builder.</Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mid">Write</h2>
          <Field label="Internal title">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field
            label="Welcome markdown"
            hint="Do not hard-code tracks here — the public page lists tracks from the Track field options only."
          >
            <Textarea
              rows={6}
              value={form.welcomeMd}
              onChange={(e) => setForm({ ...form, welcomeMd: e.target.value })}
            />
          </Field>
          <div className="mb-3 rounded-[18px] border border-line bg-soft p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-mid">Welcome preview</div>
            <Markdown text={form.welcomeMd || ""} />
            {trackOptions.length ? (
              <p className="mt-2 text-sm text-mid">
                <span className="font-medium text-ink">Tracks (from form): </span>
                {trackOptions.join(" · ")}
              </p>
            ) : null}
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
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mid">Fields & conditional logic</h2>
          <div className="space-y-3">
            {form.fields.map((f: any, idx: number) => {
              const hasCondition = !!f.visibleWhen;
              return (
                <div key={f.key} className="rounded-[18px] border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                    <Field label="Field label">
                      <Input value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })} />
                    </Field>
                    <Field label="Type">
                      <Select value={f.type} onChange={(e) => updateField(idx, { type: e.target.value })}>
                        {[
                          ["text", "Short text"],
                          ["textarea", "Long text"],
                          ["select", "Dropdown"],
                          ["checkbox", "Checkbox"],
                          ["file", "File upload"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <p className="mt-1 text-xs text-mid">key: {f.key}</p>
                  <Field label="Section">
                    <Input
                      value={f.section || ""}
                      placeholder="Proposal"
                      onChange={(e) => updateField(idx, { section: e.target.value })}
                    />
                  </Field>
                  {f.type === "select" ? (
                    <Field label="Options" hint="One per line">
                      <Textarea
                        rows={3}
                        value={(f.options || []).join("\n")}
                        onChange={(e) =>
                          updateField(idx, {
                            options: e.target.value
                              .split("\n")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </Field>
                  ) : null}

                  <label className="mt-2 flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={hasCondition}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Prefer the Format field: binding to Track by default made a
                          // brand-new field silently conditional on "AI Engineering".
                          const trigger =
                            selectFields.find((x: any) => x.key === "format" && x.key !== f.key) ||
                            selectFields.find((x: any) => x.key !== f.key && x.key !== "category") ||
                            selectFields.find((x: any) => x.key !== f.key);
                          const equals = (trigger?.options || ["Workshop (120 min)"])[0] || "Workshop (120 min)";
                          updateFieldByKey(f.key, {
                            visibleWhen: { key: trigger?.key || "format", equals },
                          });
                        } else {
                          updateFieldByKey(f.key, { visibleWhen: undefined });
                        }
                      }}
                    />
                    Conditional visibility
                    {hasCondition ? (
                      <Badge tone="muted" data-testid={`field-condition-${f.key}`}>
                        shown when {f.visibleWhen.key} = {f.visibleWhen.equals}
                      </Badge>
                    ) : (
                      <Badge tone="ok" data-testid={`field-always-${f.key}`}>Always visible</Badge>
                    )}
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
                      data-testid={`field-required-${f.key}`}
                      aria-label={`Required: ${f.label}`}
                      checked={!!f.required}
                      onChange={(e) => updateFieldByKey(f.key, { required: e.target.checked })}
                    />
                    Required when visible
                  </label>
                  {!["title", "abstract", "category", "format"].includes(f.key) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      onClick={() =>
                        setForm({ ...form, fields: form.fields.filter((_: any, i: number) => i !== idx) })
                      }
                    >
                      Remove field
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setForm({
                ...form,
                fields: [...form.fields, createCustomCfpField(form.fields)],
              });
              toast("Field added — auto-saving changes");
            }}
          >
            Add field
          </Button>

          <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-mid">
            Category → board routing
          </h3>
          <ul className="space-y-2 text-sm">
            {form.routes.map((r: any, idx: number) => (
              <li key={`${r.category}-${idx}`} className="grid grid-cols-[1fr_1fr] gap-2 rounded-lg bg-soft p-2">
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

          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => save()}>
              {dirty ? "Save form *" : "Save form"}
            </Button>
            <Button disabled={saving} variant="secondary" onClick={() => save({ openPublic: true })}>
              Save &amp; publish CFP
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Compact CFP window controls for Settings. Same canonical state (form-cfp) and
 * same save endpoint as the CFP form builder card on /app/forms — agents look for
 * close dates in Settings, so both places must work.
 */
function CfpWindowSettingsCard() {
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [savedAt, setSavedAt] = useState("");

  // Bounded load: this card used to render nothing at all while its fetch was pending
  // or failed, which read as a stuck Settings page.
  const cfp = useAsyncData(async () => (await api.form()).data, []);
  const load = () => cfp.reload();

  useEffect(() => {
    if (cfp.data) setForm(cfp.data);
  }, [cfp.data]);

  useEffect(() => subscribeData(() => cfp.reload()), [cfp.reload]);

  const toLocalInput = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const persist = async (patch: any, message: string) => {
    setSaving(true);
    setErr("");
    try {
      const r = await api.saveForm(form.id, { ...form, ...patch });
      setForm(r.data);
      setSavedAt(new Date().toLocaleTimeString());
      toast(message);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
      toast(e?.message || "Save failed", "danger");
    } finally {
      setSaving(false);
    }
  };

  if (!form)
    return (
      <Card className="p-5 lg:col-span-2" data-testid="cfp-window-settings">
        <h2 className="text-sm font-bold uppercase tracking-wide text-mid">CFP window</h2>
        <LoadState
          loading={cfp.loading}
          timedOut={cfp.timedOut}
          error={cfp.error}
          onRetry={cfp.reload}
          label="the CFP window"
        />
      </Card>
    );

  return (
    <Card className="p-5 lg:col-span-2" id="cfp-window" data-testid="cfp-window-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-mid">CFP window</h2>
          <p className="mt-1 text-sm text-mid">
            Open and close dates for the public call for proposals. Saving here takes effect immediately on the public
            form (same setting as the CFP form builder).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() =>
              persist(
                {
                  status: "open",
                  openAt: form.openAt || new Date(Date.now() - 86400_000).toISOString(),
                  closeAt:
                    form.closeAt && Date.parse(form.closeAt) > Date.now()
                      ? form.closeAt
                      : new Date(Date.now() + 86400_000 * 30).toISOString(),
                },
                "CFP opened",
              )
            }
          >
            Open CFP now
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() =>
              persist(
                { status: "closed", closeAt: new Date(Date.now() - 60_000).toISOString() },
                "CFP closed — public form shows Closed immediately",
              )
            }
          >
            Close CFP now
          </Button>
        </div>
      </div>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Status">
          <Select
            aria-label="CFP status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
        <Field label="CFP open date">
          <Input
            type="datetime-local"
            aria-label="CFP open date"
            value={toLocalInput(form.openAt)}
            onChange={(e) =>
              setForm({ ...form, openAt: e.target.value ? new Date(e.target.value).toISOString() : form.openAt })
            }
          />
        </Field>
        <Field label="CFP close date">
          <Input
            type="datetime-local"
            aria-label="CFP close date"
            value={toLocalInput(form.closeAt)}
            onChange={(e) =>
              setForm({ ...form, closeAt: e.target.value ? new Date(e.target.value).toISOString() : form.closeAt })
            }
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={form.status === "open" ? "ok" : "warn"}>{form.status === "open" ? "Open" : "Closed"}</Badge>
        <span className="text-mid">
          Accepting until {form.closeAt ? new Date(form.closeAt).toLocaleString() : "—"}
          {savedAt ? ` · saved ${savedAt}` : ""}
        </span>
        <Button size="sm" className="ml-auto" disabled={saving} onClick={() => persist({}, "CFP window saved")}>
          {saving ? "Saving…" : "Save CFP window"}
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/app/forms#cfp-window">Full CFP builder</a>
        </Button>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const [event, setEvent] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [invite, setInvite] = useState({ name: "", email: "", roundId: "" });
  const [inviteMsg, setInviteMsg] = useState<any>(null);

  // A failed/slow bootstrap used to leave this page on a permanent spinner; the shared
  // loader surfaces a timed error with Retry instead.
  const settings = useAsyncData(
    async () => {
      const [b, s, rr] = await Promise.all([
        api.bootstrap(),
        api.schedule().catch(() => null),
        api.reviewRounds().catch(() => ({ data: [] as any[] })),
      ]);
      return { event: b.data.event, schedule: s, rounds: rr?.data || [] };
    },
    [],
  );

  useEffect(() => {
    const data = settings.data;
    if (!data) return;
    setEvent(data.event);
    if (data.schedule) {
      setRooms(data.schedule.rooms || []);
      setTracks(data.schedule.tracks || []);
    }
    setRounds(data.rounds);
    setInvite((inv) => ({
      ...inv,
      roundId: inv.roundId || data.rounds.find((r: any) => r.status === "open")?.id || data.rounds[0]?.id || "",
    }));
  }, [settings.data]);

  if (!event)
    return (
      <div>
        <PageHeader title="Settings" description="Event basics, CFP window, program structure, and review team." />
        <LoadState
          loading={settings.loading}
          timedOut={settings.timedOut}
          error={settings.error}
          onRetry={settings.reload}
          label="settings"
        />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Event basics, CFP open/close window, program structure, and review team."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <CfpWindowSettingsCard />
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

        <Card className="p-5 lg:col-span-2" id="review-team" data-testid="invite-reviewer-settings">
          <h2 className="text-sm font-bold uppercase tracking-wide text-mid">Review team</h2>
          <p className="mt-1 text-sm text-mid">
            Invite a reviewer by name and email. They appear on Assignments for the selected round (same endpoint as
            Evaluation Plan).
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
            <Field label="Round">
              <Select
                aria-label="Invite reviewer round"
                value={invite.roundId}
                onChange={(e) => setInvite({ ...invite, roundId: e.target.value })}
              >
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reviewer name">
              <Input
                aria-label="Reviewer name"
                placeholder="Sam Whitfield"
                value={invite.name}
                onChange={(e) => setInvite({ ...invite, name: e.target.value })}
              />
            </Field>
            <Field label="Reviewer email">
              <Input
                aria-label="Reviewer email"
                type="email"
                placeholder="sam@example.test"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              />
            </Field>
            <div className="flex items-end">
              <Button
                disabled={!invite.roundId || !invite.name.trim() || !invite.email.trim()}
                onClick={async () => {
                  try {
                    const invited:any = await api.inviteReviewer(invite.roundId, {
                      name: invite.name.trim(),
                      email: invite.email.trim(),
                    });
                    const linked = await api.issueReviewerInviteLink(invited.data.reviewer.id, invite.roundId);
                    const absoluteUrl = linked.data.inviteUrl || `${window.location.origin}${linked.data.invitePath}`;
                    setInviteMsg({name:invited.data.reviewer.name,email:invited.data.reviewer.email,roundId:invite.roundId,url:absoluteUrl});
                    settings.reload();
                    toast(`Reviewer invited: ${invite.name.trim()}`);
                    setInvite((x) => ({ ...x, name: "", email: "" }));
                  } catch (e: any) {
                    toast(e?.message || "Invite failed", "danger");
                  }
                }}
              >
                Invite reviewer
              </Button>
            </div>
          </div>
          {inviteMsg ? (
            <Notice tone="ok" onClose={() => setInviteMsg(null)}>
              <div data-testid="reviewer-demo-access-link">
                <b>Reviewer invited: {inviteMsg.name}</b> · {inviteMsg.email}<br/>
                <span className="text-xs">Round: {rounds.find((r:any)=>r.id===inviteMsg.roundId)?.name||inviteMsg.roundId}</span>
                <Input className="mt-2" readOnly aria-label="Reviewer demo access link" value={inviteMsg.url}/>
                <Button className="mt-2" size="sm" variant="secondary" onClick={async()=>{await navigator.clipboard.writeText(inviteMsg.url);toast("Reviewer access link copied")}}>Copy reviewer access link</Button>
                <p className="mt-2 text-xs">This is a credential-free <b>demo reviewer persona access link</b>. It is not password authentication or a production login.</p>
              </div>
            </Notice>
          ) : null}
          <p className="mt-2 text-xs text-mid">
            Also available on{" "}
            <a className="font-semibold underline" href="/app/evaluation-plan">
              Evaluation Plan
            </a>{" "}
            and the Submissions inbox header.
          </p>
        </Card>
      </div>
    </div>
  );
}
