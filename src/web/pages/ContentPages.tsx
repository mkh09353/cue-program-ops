import { useEffect,useMemo,useRef,useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getActiveEvent, api, subscribeEvent } from "../lib/api";
import { Badge,Button,Card,Field,Input,Notice,PageHeader,Select,Textarea,toast } from "../components/ui";

/** Precise, distinct stamp for history rows: two saves in the same minute must differ. */
export function historyStamp(iso:string){
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return String(iso||"unknown time");
  const pad=(n:number,w=2)=>String(n).padStart(w,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(),3)}`;
}

export function contentThreadStamp(iso:string){
  const d=new Date(iso);return Number.isNaN(d.getTime())?String(iso||"unknown time"):d.toISOString().replace("T"," ").replace("Z"," UTC");
}
export const contentCommentRole=(comment:{authorRole?:string})=>comment.authorRole==="Organizer"?"Organizer":"Speaker";
const downloadArchive=(state:any)=>{if(!state?.blob)return;const url=URL.createObjectURL(state.blob),a=document.createElement("a");a.href=url;a.download=state.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)};

const HISTORY_FIELDS:[string,string][]=[["title","Title"],["abstract","Abstract"],["trackId","Track"],["format","Format"],["speakerIds","Speakers"]];
const historyValue=(value:unknown)=>{
  if(value==null||value==="")return "—";
  if(Array.isArray(value))return value.join(", ")||"—";
  const text=String(value);
  return text.length>60?`${text.slice(0,57)}…`:text;
};
/** Concise before→after summary of the fields a save actually changed. */
export function historyChanges(entry:{before?:any;after?:any}){
  const before=entry?.before||{},after=entry?.after||{};
  return HISTORY_FIELDS.filter(([key])=>JSON.stringify(before[key]??"")!==JSON.stringify(after[key]??""))
    .map(([key,label])=>({key,label,from:historyValue(before[key]),to:historyValue(after[key])}));
}

/** Keys the session drawer may change; the Save diff is computed over exactly these. */
const SESSION_EDIT_KEYS=["title","abstract","format","trackId","contentStatus"] as const;

export function ContentPage(){const[data,setData]=useState<any>(null),[filter,setFilter]=useState("all"),[tab,setTab]=useState("dashboard"),[editing,setEditing]=useState<any>(null),[speaker,setSpeaker]=useState<any>(null),[comment,setComment]=useState("");const[postedComment,setPostedComment]=useState<any>(null),[savedSession,setSavedSession]=useState<any>(null),[savedSpeaker,setSavedSpeaker]=useState<any>(null),[headshotState,setHeadshotState]=useState<"idle"|"loading"|"ready"|"error">("idle"),[headshotMeta,setHeadshotMeta]=useState<{name?:string;type?:string;size?:number;width?:number;height?:number}|null>(null),[reminderResult,setReminderResult]=useState<any>(null),[archiveOpen,setArchiveOpen]=useState(false),[archiveSessions,setArchiveSessions]=useState<string[]>([]),[archiveFiles,setArchiveFiles]=useState<string[]>([]),[archiveGrouping,setArchiveGrouping]=useState<"session"|"speaker">("session"),[reminderBusy,setReminderBusy]=useState(false),[exportState,setExportState]=useState<any>(null),[exportBusy,setExportBusy]=useState(false);const [params,setParams]=useSearchParams();
const load=()=>api.content().then(r=>setData(r.data));useEffect(()=>{load()},[]);
// Baseline copy of the session record as last loaded/saved. Save sends ONLY the keys the
// organizer actually changed: posting the whole editor snapshot silently overwrote any
// field a concurrent editor (another organizer, or the speaker portal) had changed while
// this drawer was open. The server applies each key only when it is defined.
const editingBaseRef=useRef<any>(null);
useEffect(()=>{
  if(!editing){editingBaseRef.current=null;return}
  if(!editingBaseRef.current||editingBaseRef.current.id!==editing.id)editingBaseRef.current={...editing};
},[editing]);
const sessionEditPatch=(next:any)=>{
  const base=editingBaseRef.current||{};
  const patch:any={};
  for(const key of SESSION_EDIT_KEYS)if(JSON.stringify(next?.[key]??null)!==JSON.stringify(base?.[key]??null))patch[key]=next[key];
  return patch;
};
// Content is event-scoped: refetch on an event switch so deliverables, files and
// session copy never keep showing the previously selected event.
useEffect(()=>subscribeEvent(()=>{setEditing(null);setData(null);load()}),[]);
// Deep link from the Schedule page: /app/content?session=<canonical-id>
useEffect(()=>{
  const id=params.get("session");
  if(!id||!data)return;
  const match=data.sessions.find((s:any)=>s.canonicalId===id||s.id===id||s.lifecycleId===id);
  if(!match)return;
  setTab("sessions");
  // Only open once: clearing the param keeps normal navigation from looping.
  setEditing((cur:any)=>cur&&cur.id===match.id?cur:{...match});
  const next=new URLSearchParams(params);next.delete("session");setParams(next,{replace:true});
},[params,data]);const tasks=useMemo(()=>data?.tasks.filter((t:any)=>filter==="all"||(filter==="incomplete"&&t.status!=="complete")||(filter==="overdue"&&t.overdue))||[],[data,filter]);if(!data)return <p>Loading content…</p>;
return <div><PageHeader title="Content" description="Deliverables, approvals, session copy, speaker profiles, and final asset distribution." actions={<><Button variant={tab==="dashboard"?"dark":"outline"} onClick={()=>setTab("dashboard")}>Deliverables</Button><Button variant={tab==="files"?"dark":"outline"} onClick={()=>setTab("files")}>Files library</Button><Button variant={tab==="sessions"?"dark":"outline"} onClick={()=>setTab("sessions")}>Session & speaker editors</Button></>}/>
{tab==="dashboard"?<><TaskBuilder data={data} reload={load}/><div className="mb-3 flex flex-wrap gap-2"><Select className="max-w-48" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All deliverables</option><option value="incomplete">Incomplete</option><option value="overdue">Overdue</option></Select><Button disabled={reminderBusy} onClick={async()=>{setReminderBusy(true);try{const r=await api.contentReminders(filter==="overdue");const rows=r.data||[];const names=rows.map((x:any)=>data.speakers.find((s:any)=>s.speakerId===x.speakerId)?.name||x.speakerId);const failed=rows.filter((x:any)=>x.status==="failed").length;setReminderResult({count:rows.length,names,failed,at:new Date().toLocaleTimeString(),scope:filter==="overdue"?"overdue deliverables":"all outstanding deliverables"});toast(rows.length?`${rows.length} reminder${rows.length===1?"":"s"} sent (mock) and logged to Comms`:"No outstanding deliverables — no reminders sent",rows.length?"info":"warn");load()}catch(e:any){toast(e?.message||"Reminder failed","danger");setReminderResult({error:e?.message||"Reminder failed"})}finally{setReminderBusy(false)}}}>{reminderBusy?"Sending…":"Remind outstanding speakers"}</Button></div>{reminderResult?<Notice tone={reminderResult.error?"danger":reminderResult.count?"ok":"warn"} onClose={()=>setReminderResult(null)}>{reminderResult.error?reminderResult.error:reminderResult.count?<span><b>{reminderResult.count} reminder{reminderResult.count===1?"":"s"} sent</b> at {reminderResult.at} for {reminderResult.scope} (mock mail provider · logged to Comms){reminderResult.failed?` · ${reminderResult.failed} failed`:""}<br/>Recipients: {reminderResult.names.join(", ")}</span>:<span>No outstanding deliverables matched — <b>0 reminders sent</b>.</span>}</Notice>:null}<div className="space-y-2">{tasks.map((t:any)=><Card className="flex justify-between p-4" key={t.id}><div><b>{t.name}</b><p className="text-sm">{t.speaker?.name} · {t.session?.title||"General"}</p><p className="text-xs text-mid">Due {t.dueAt.slice(0,10)} · {t.uploadCount} upload version(s)</p></div><div className="flex gap-2"><Badge tone={t.overdue?"danger":t.status==="complete"?"ok":"warn"}>{t.overdue?"Overdue":t.status}</Badge><Badge>{t.fileStatus}</Badge></div></Card>)}</div></>:null}
{tab==="files"?<><div className="mb-3 flex flex-wrap items-center gap-2"><Button disabled={exportBusy} data-testid="open-archive-dialog" onClick={()=>setArchiveOpen(true)}>Generate ZIP · choose content</Button><Button variant="outline" disabled={exportBusy} onClick={()=>{setArchiveOpen(true);setArchiveFiles(data.files.map((f:any)=>f.id))}}>Export all (latest versions)</Button><span className="text-xs text-mid">Bundles the current version of every uploaded file, grouped by session folder.</span></div>{postedComment?<Notice tone="ok"><b>Organizer reply posted and saved</b> · {contentThreadStamp(postedComment.createdAt)}<br/>{postedComment.body}</Notice>:null}{data.files.map((f:any)=><Card className="mb-3 p-5" key={f.id}><div className="flex justify-between"><div><h2 className="font-bold">{f.currentVersion?.name}</h2><p className="text-sm text-mid">{f.speaker?.name} · {f.session?.title} · uploaded {f.currentVersion?.uploadedAt.slice(0,10)} · {f.versions.length} versions</p></div><Select className="max-w-48" value={f.status} onChange={async e=>{await api.approveContentFile(f.id,{status:e.target.value,comment:"Reviewed in Content library"});load()}}><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="changes_requested">Changes requested</option></Select></div><div className="mt-3"><b className="text-xs uppercase text-mid">Version history</b>{[...f.versions].reverse().map((v:any)=><div className="mt-1 flex justify-between rounded-lg bg-soft p-2 text-sm" key={v.id}><span>v{v.version} · {v.name} · {v.uploadedAt}</span><span>{v.current?<Badge tone="ok">Current</Badge>:null} <a className="text-ink underline" href={`/api/content/files/${f.id}/versions/${v.id}`}>View</a></span></div>)}</div><div className="mt-3"><b className="text-xs uppercase text-mid">Comments</b>{f.comments.map((c:any)=><p className={`mt-1 rounded-lg border p-2 text-sm ${postedComment?.id===c.id?"border-brand-400 bg-brand-50 ring-2 ring-brand-500/10":"border-transparent bg-soft"}`} key={c.id}><Badge tone={contentCommentRole(c)==="Organizer"?"ok":"muted"}>{contentCommentRole(c)}</Badge>{" "}<b>{c.authorName}</b> · <span className="font-mono text-xs">{contentThreadStamp(c.createdAt)}</span><br/>{c.body}</p>)}<div className="mt-2 flex gap-2"><Input placeholder="Reply to file thread" value={comment} onChange={e=>setComment(e.target.value)}/><Button disabled={!comment.trim()} onClick={async()=>{const r:any=await api.addFileComment(f.id,comment.trim());setPostedComment(r.data);setComment("");toast("Organizer reply posted and saved");load()}}>Reply</Button></div></div></Card>)}</>:null}
{tab==="sessions"?<div className="grid gap-4 lg:grid-cols-2"><div><h2 className="mb-2 font-bold">Sessions</h2><p className="mb-2 text-xs text-mid">Every canonical schedule session, including ones created directly in the schedule builder.</p>{data.sessions.map((s:any)=><Card className="mb-2 p-4" key={s.id} data-session-id={s.canonicalId||s.id}><div className="flex flex-wrap items-center justify-between gap-2"><b>{s.title}</b><span className="flex items-center gap-1"><Badge>{s.contentStatus}</Badge>{s.publishStatus==="published"?<Badge tone="ok">public</Badge>:null}{s.scheduled===false?<Badge tone="muted">unscheduled</Badge>:null}</span></div><p className="mt-1 text-xs text-mid">{s.canonicalId||s.id}{s.history?.length?` · ${s.history.length} change${s.history.length===1?"":"s"}`:""}</p><Button size="sm" className="mt-2" aria-label={`Edit ${s.title}`} onClick={()=>setEditing({...s})}>Edit session</Button></Card>)}</div><div><h2 className="mb-2 font-bold">Speakers</h2>{data.speakers.map((s:any)=><Card className="mb-2 p-4" key={s.speakerId}><b>{s.name}</b><p className="text-sm text-mid">{s.title} · {s.company}</p><Button size="sm" className="mt-2" onClick={()=>{setHeadshotState("idle");setHeadshotMeta(null);setSpeaker({...s})}}>Edit profile</Button></Card>)}</div></div>:null}
{archiveOpen?<Card className="fixed inset-x-4 top-16 z-50 mx-auto max-h-[80vh] max-w-2xl overflow-auto p-6 shadow-xl" data-testid="archive-dialog">
  <PageHeader title="Generate content archive" description="Pick the sessions and files to include. Only the current version of each file is archived."/>
  <div className="mb-3 flex flex-wrap items-center gap-2">
    <Button size="sm" variant="secondary" data-testid="archive-select-all" onClick={()=>{setArchiveSessions(data.sessions.map((x:any)=>x.canonicalId||x.id));setArchiveFiles(data.files.map((f:any)=>f.id))}}>Select all</Button>
    <Button size="sm" variant="outline" data-testid="archive-clear-all" onClick={()=>{setArchiveSessions([]);setArchiveFiles([])}}>Clear all</Button>
    <span className="text-xs text-mid" data-testid="archive-selection-count">{archiveSessions.length} session(s) · {archiveFiles.length} file(s) selected</span>
  </div>
  <Field label="Group folders by">
    <Select aria-label="Archive grouping" value={archiveGrouping} onChange={e=>setArchiveGrouping(e.target.value as "session"|"speaker")}>
      <option value="session">By session (General for unassigned)</option>
      <option value="speaker">By speaker (Unassigned for none)</option>
    </Select>
  </Field>
  <div className="mt-3 grid gap-3 md:grid-cols-2">
    <div>
      <b className="text-xs uppercase tracking-wide text-mid">Sessions ({data.sessions.length})</b>
      <p className="mt-1 text-xs text-mid">Includes every current file attached to the session.</p>
      <div className="mt-2 max-h-52 space-y-1 overflow-auto">
        {data.sessions.map((session:any)=>{const sid=session.canonicalId||session.id;const checked=archiveSessions.includes(sid);return <label key={sid} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm ${checked?"border-brand-400 bg-brand-50":"border-line bg-white"}`}><input type="checkbox" aria-label={`Include session ${session.title}`} checked={checked} onChange={e=>setArchiveSessions(prev=>e.target.checked?[...new Set([...prev,sid])]:prev.filter(x=>x!==sid))}/><span className="min-w-0 truncate">{session.title}</span></label>})}
        {!data.sessions.length?<p className="text-xs text-mid">No sessions yet.</p>:null}
      </div>
    </div>
    <div>
      <b className="text-xs uppercase tracking-wide text-mid">Files ({data.files.length})</b>
      <p className="mt-1 text-xs text-mid">Current version only; older versions stay in history.</p>
      <div className="mt-2 max-h-52 space-y-1 overflow-auto">
        {data.files.map((f:any)=>{const checked=archiveFiles.includes(f.id);return <label key={f.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm ${checked?"border-brand-400 bg-brand-50":"border-line bg-white"}`}><input type="checkbox" aria-label={`Include file ${f.currentVersion?.name||f.id}`} checked={checked} onChange={e=>setArchiveFiles(prev=>e.target.checked?[...new Set([...prev,f.id])]:prev.filter(x=>x!==f.id))}/><span className="min-w-0"><b className="block truncate">{f.currentVersion?.name||f.id}</b><span className="block truncate text-xs text-mid">{f.speaker?.name||"No speaker"} · {f.session?.title||"General"} · v{f.currentVersion?.version??f.versions.length}</span></span></label>})}
        {!data.files.length?<p className="text-xs text-mid">No uploaded files yet.</p>:null}
      </div>
    </div>
  </div>
  {exportState?<Notice tone={exportState.status==="ready"?"ok":exportState.status==="failed"?"danger":"info"} onClose={()=>setExportState(null)}>{exportState.status==="working"?"Building ZIP…":exportState.status==="failed"?exportState.error:<span><b>ZIP ready · download started</b> · {exportState.filename} · {exportState.fileCount} file{exportState.fileCount===1?"":"s"} · grouped by {exportState.grouping} · {exportState.sizeKb} KB · {exportState.at}<br/><b>Exact included filenames:</b><ul className="ml-5 list-disc" data-testid="archive-entry-names">{exportState.entryNames.map((name:string)=><li key={name} className="font-mono text-xs">{name}</li>)}</ul><Button size="sm" variant="outline" className="mt-2" data-testid="archive-download-again" onClick={()=>downloadArchive(exportState)}>Download again</Button></span>}</Notice>:null}
  <div className="mt-4 flex flex-wrap gap-2">
    <Button disabled={exportBusy||(!archiveSessions.length&&!archiveFiles.length)} data-testid="archive-download" onClick={async()=>{
      setExportBusy(true);setExportState({status:"working"});
      try{
        const r=await api.contentExportZip({sessionIds:archiveSessions,fileIds:archiveFiles,grouping:archiveGrouping});
        downloadArchive(r);
        setExportState({status:"ready",blob:r.blob,entryNames:r.entryNames,fileCount:r.fileCount,grouping:r.grouping,filename:r.filename,sizeKb:Math.max(1,Math.round(r.blob.size/1024)),at:new Date().toLocaleTimeString()});
        toast(`ZIP ready · ${r.fileCount} file${r.fileCount===1?"":"s"} · grouped by ${r.grouping}`);
      }catch(e:any){setExportState({status:"failed",error:e?.message||"Export failed"});toast(e?.message||"Export failed","danger")}
      finally{setExportBusy(false)}
    }}  className="min-w-[10.5rem]">{exportBusy?"Building ZIP…":"Download archive"}</Button>
    <Button variant="outline" disabled={exportBusy} onClick={()=>setArchiveOpen(false)}>Close</Button>
    {!archiveSessions.length&&!archiveFiles.length?<span className="self-center text-xs text-mid">Select at least one session or file.</span>:null}
  </div>
</Card>:null}
{editing?<Card className="fixed inset-x-4 top-20 z-50 mx-auto max-h-[80vh] max-w-2xl overflow-auto p-6 shadow-xl" data-testid="session-editor">
  <PageHeader title={`Edit session content · ${editing.title}`} description={`Session ${editing.id} · approval ${editing.contentStatus||"draft"}`}/>
  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-soft p-3 text-sm">
    <b className="text-ink" data-testid="editor-current-title">{editing.title}</b>
    <Badge tone={editing.contentStatus==="approved"?"ok":"muted"}>{editing.contentStatus||"draft"}</Badge>
    <a className="ml-auto font-semibold text-ink underline" href={`/e/${getActiveEvent().slug}/public/sessions/${editing.id}`} target="_blank" rel="noreferrer">View public page ↗</a>
    <a className="font-semibold text-ink underline" href={`/e/${getActiveEvent().slug}/public/sessions`} target="_blank" rel="noreferrer">Public catalog ↗</a>
  </div>
  {savedSession&&savedSession.id===editing.id?<Notice tone="ok" onClose={()=>setSavedSession(null)}>
    <span className="block font-semibold" data-testid="session-saved-banner">{savedSession.restored?"Restored and displayed in editor":"Saved"} · title is now “{savedSession.title}”</span>
    <span className="text-xs">Approval {savedSession.contentStatus||"draft"} · saved {savedSession.at}. Approved sessions appear on the public page immediately.</span>
    <a className="mt-1 block text-xs font-semibold text-ink underline" data-testid="saved-public-link" href={`/e/${getActiveEvent().slug}/public/sessions/${encodeURIComponent(savedSession.id)}?t=${savedSession.stamp}`} target="_blank" rel="noreferrer">View public page (fresh) ↗</a>
    <a className="block text-xs font-semibold text-ink underline" href={`/e/${getActiveEvent().slug}/public/sessions?t=${savedSession.stamp}`} target="_blank" rel="noreferrer">View public catalog (fresh) ↗</a>
    {savedSession.dayKey ? <a className="block text-xs font-semibold text-ink underline" data-testid="saved-agenda-link" href={`/e/${getActiveEvent().slug}/public/agenda?day=${encodeURIComponent(savedSession.dayKey)}&t=${savedSession.stamp}`} target="_blank" rel="noreferrer">View public agenda for its day ↗</a> : null}
  </Notice>:null}
  <div className="mb-4 rounded-2xl border-2 border-brand-400 bg-white p-3" data-testid="session-history-always-visible">
    <b>Change history · always visible</b><p className="text-xs text-mid">{editing.history?.length||0} timestamped save{editing.history?.length===1?"":"s"} · newest first</p>
    {[...(editing.history||[])].sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,2).map((h:any)=><div key={`pinned-${h.id}`} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-soft p-2 text-xs"><span><b>{h.editorName}</b> · <span className="font-mono">{historyStamp(h.createdAt)}</span></span><Button size="sm" variant="outline" onClick={async()=>{const r:any=await api.restoreContentHistory(h.id);setEditing({...r.data});editingBaseRef.current={...r.data};setSavedSession({id:r.data.canonicalId||r.data.id,title:r.data.title,contentStatus:r.data.contentStatus,at:historyStamp(r.data.restoredAt),stamp:Date.now(),restored:true});toast(`Restored content from ${historyStamp(h.createdAt)}`);load()}}>Restore this version</Button></div>)}
    {!editing.history?.length?<p className="mt-2 text-xs text-mid">No edits recorded yet.</p>:null}
  </div>
  <Field label="Title"><Input value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></Field><Field label="Abstract"><Textarea value={editing.abstract} onChange={e=>setEditing({...editing,abstract:e.target.value})}/></Field><Field label="Format"><Input value={editing.format||"Talk"} onChange={e=>setEditing({...editing,format:e.target.value})}/></Field><Field label="Track"><Select value={editing.trackId||""} onChange={e=>setEditing({...editing,trackId:e.target.value})}>{[...new Set([editing.trackId,...data.sessions.map((s:any)=>s.trackId),"track-eng","track-product","track-agents","track-workshop"].filter(Boolean))].map((x:any)=><option key={x} value={x}>{x}</option>)}</Select></Field><Field label="Approval status"><Select value={editing.contentStatus} onChange={e=>setEditing({...editing,contentStatus:e.target.value})}><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="changes_requested">Changes requested</option></Select></Field><div className="flex gap-2"><Button onClick={async()=>{const r:any=await api.editContentSession(editing.id,sessionEditPatch(editing));setEditing({...r.data});editingBaseRef.current={...r.data};setSavedSession({id:r.data.canonicalId||r.data.id,title:r.data.title,contentStatus:r.data.contentStatus,dayKey:r.data.dayKey,at:new Date().toLocaleTimeString(),stamp:Date.now()});toast(`Saved “${r.data.title}” to the canonical public projection`);load()}}>Save</Button><Button variant="outline" onClick={()=>{setEditing(null);setSavedSession(null)}}>Close</Button></div>{editing.history?.length===0?<p className="mt-4 text-xs text-mid" data-testid="history-empty">No edits recorded yet — saving a title, abstract, track, format or speaker change adds a restorable entry.</p>:null}{editing.history?.length?<div className="mt-4" data-testid="session-history"><b>Change history</b><p className="text-xs text-mid">{editing.history.length} save{editing.history.length===1?"":"s"} · newest first · each row restores that prior version.</p>{[...editing.history].sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt))).map((h:any,idx:number)=>{const changes=historyChanges(h);return <div className="mt-2 rounded-2xl border border-line bg-soft p-3 text-sm" key={h.id} data-testid={`history-row-${h.id}`}>
  <div className="flex flex-wrap items-center justify-between gap-2">
    <span className="flex flex-wrap items-center gap-2"><Badge tone="muted">#{editing.history.length-idx}</Badge><b>{h.editorName}</b><span className="font-mono text-xs text-mid" data-testid={`history-time-${h.id}`}>{historyStamp(h.createdAt)}</span>{h.noChange?<Badge tone="warn">No field changes</Badge>:null}</span>
    <Button size="sm" variant="outline" aria-label={`Restore version from ${historyStamp(h.createdAt)}`} onClick={async()=>{const r:any=await api.restoreContentHistory(h.id);setEditing({...r.data});editingBaseRef.current={...r.data};setSavedSession({id:r.data.canonicalId||r.data.id,title:r.data.title,contentStatus:r.data.contentStatus,at:historyStamp(r.data.restoredAt),stamp:Date.now(),restored:true});toast(`Restored the version saved at ${historyStamp(h.createdAt)}`);load()}}>Restore this version</Button>
  </div>
  {changes.length?<ul className="mt-2 space-y-1 text-xs" data-testid={`history-changes-${h.id}`}>{changes.map(ch=><li key={ch.key}><b className="text-ink">{ch.label}</b>: <span className="text-mid line-through">{ch.from}</span> → <span className="text-ink">{ch.to}</span></li>)}</ul>:<p className="mt-2 text-xs text-mid">Saved with no field changes.</p>}
</div>})}</div>:null}</Card>:null}
{speaker?<Card className="fixed inset-x-4 top-20 z-50 mx-auto max-w-xl overflow-auto max-h-[85vh] p-6 shadow-xl" data-testid="speaker-editor"><PageHeader title={`Edit ${speaker.name}`} description={`Speaker ${speaker.speakerId}`}/>
  <div className="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-soft p-3">
    {speaker.headshotUrl?<img src={speaker.headshotUrl} alt={`${speaker.name} headshot`} data-testid="speaker-headshot-preview" className="h-20 w-20 rounded-2xl border border-line bg-white object-contain" onError={()=>setHeadshotState("error")}/>:<div className="grid h-20 w-20 place-items-center rounded-2xl border border-line bg-white text-sm font-semibold text-mid">{speaker.name?.split(" ").map((x:string)=>x[0]).join("").slice(0,2)}</div>}
    <div className="min-w-0 text-sm"><b className="block truncate">{speaker.name}</b><span className="block truncate text-xs text-mid">{[speaker.title,speaker.company].filter(Boolean).join(" · ")||"No title yet"}</span><span className="block text-xs text-mid">Bio {String(speaker.bio||"").length} characters</span></div>
  </div>
  {savedSpeaker&&savedSpeaker.speakerId===speaker.speakerId?<Notice tone="ok" onClose={()=>setSavedSpeaker(null)}>
    <span className="block font-semibold" data-testid="speaker-saved-banner">Saved {savedSpeaker.name} at {savedSpeaker.at}</span>
    <span className="text-xs">Bio {savedSpeaker.bioLength} characters{savedSpeaker.headshot?" · headshot stored":""} · pushed to the roster and public projection.</span>
    <a className="mt-1 block text-xs font-semibold text-ink underline" href={`/e/${getActiveEvent().slug}/public/speakers/${encodeURIComponent(savedSpeaker.speakerId)}?t=${savedSpeaker.stamp}`} target="_blank" rel="noreferrer">View public speaker page (fresh) ↗</a>
  </Notice>:null}<Field label="Title"><Input value={speaker.title||""} onChange={e=>setSpeaker({...speaker,title:e.target.value})}/></Field><Field label="Company"><Input value={speaker.company||""} onChange={e=>setSpeaker({...speaker,company:e.target.value})}/></Field><Field label="Bio"><Textarea value={speaker.bio||""} onChange={e=>setSpeaker({...speaker,bio:e.target.value})}/></Field><Field label="Headshot"><div className="space-y-2">
  {speaker.headshotUrl?<div className="rounded-2xl border border-line bg-soft p-3">
    {/* Large square preview: a 56px circle made any image look like a solid blob. */}
    <img src={speaker.headshotUrl} alt={`${speaker.name} headshot preview`} data-testid="headshot-large-preview" className="h-40 w-40 rounded-2xl border border-line bg-white object-contain"
      onLoad={e=>{const img=e.currentTarget;setHeadshotState("ready");setHeadshotMeta(m=>({...(m||{}),width:img.naturalWidth,height:img.naturalHeight}))}}
      onError={()=>setHeadshotState("error")}/>
    <p className="mt-2 text-xs" data-testid="headshot-status">
      {headshotState==="error"?<span className="font-semibold text-red-700">Image failed to decode — the file is not a readable PNG/JPEG/WebP. Nothing was saved.</span>
      :headshotState==="loading"?<span className="text-mid">Decoding image…</span>
      :headshotState==="ready"?<span className="font-semibold text-ink">Image decoded{headshotMeta?.width?` · ${headshotMeta.width}×${headshotMeta.height}px`:""}</span>
      :<span className="text-mid">Stored headshot</span>}
    </p>
    {headshotMeta?.name?<p className="text-xs text-mid" data-testid="headshot-file-meta">{headshotMeta.name}{headshotMeta.type?` · ${headshotMeta.type}`:""}{headshotMeta.size?` · ${Math.max(1,Math.round(headshotMeta.size/1024))} KB`:""}</p>:null}
    <p className="text-xs text-mid">Source: {String(speaker.headshotUrl).startsWith("data:")?"inline data URL":"server URL"}</p>
  </div>:<p className="text-xs text-mid" data-testid="headshot-status">No headshot uploaded yet.</p>}
  <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload headshot" className="block w-full text-sm" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2*1024*1024){toast("Headshot must be under 2 MB","danger");return;}
    setHeadshotState("loading");setHeadshotMeta({name:f.name,type:f.type,size:f.size});
    try{
      const dataUrl=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("Could not read the file"));r.readAsDataURL(f)});
      setSpeaker({...speaker,headshotUrl:dataUrl,headshotName:f.name});
      toast(`Selected ${f.name} · decoding preview`,"info");
    }catch(err:any){setHeadshotState("error");toast(err?.message||"Could not read the file","danger")}
  }}/>
  <p className="text-xs text-mid">PNG/JPEG/WebP · max 2 MB. Saved to the speaker profile and the public projection.</p>
</div></Field><div className="flex gap-2"><Button disabled={headshotState==="error"} onClick={async()=>{if(headshotState==="error"){toast("Fix the headshot before saving — the selected image did not decode.","danger");return}const r:any=await api.editContentSpeaker(speaker.speakerId,{title:speaker.title,company:speaker.company,bio:speaker.bio,headshotUrl:speaker.headshotUrl});const saved=r?.data||speaker;setSpeaker({...speaker,...saved});setSavedSpeaker({speakerId:speaker.speakerId,name:saved.name||speaker.name,bioLength:String(saved.bio||"").length,headshot:Boolean(saved.headshotUrl),at:new Date().toLocaleTimeString(),stamp:Date.now()});toast(`Saved ${saved.name||speaker.name} — bio ${String(saved.bio||"").length} characters`);load()}}>Save</Button><Button variant="outline" onClick={()=>setSpeaker(null)}>Close</Button></div></Card>:null}</div>}

function TaskBuilder({data,reload}:{data:any;reload:()=>void}){
  const[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<any>(null),[err,setErr]=useState("");
  const[kind,setKind]=useState<"file"|"general">("file");
  const[form,setForm]=useState<any>({name:"Upload Session Presentation",instructions:"Final slide deck as a PDF, 16:9 aspect ratio.",dueAt:"2027-05-01",speakerIds:[],fileRequired:true,acceptedTypes:["application/pdf"]});
  const speakers:any[]=data.speakers||[];
  const allSelected=speakers.length>0&&speakers.every((s:any)=>form.speakerIds.includes(s.speakerId));
  const toggle=(id:string,on:boolean)=>setForm((f:any)=>({...f,speakerIds:on?[...new Set([...f.speakerIds,id])]:f.speakerIds.filter((x:string)=>x!==id)}));
  const selectedNames=speakers.filter((s:any)=>form.speakerIds.includes(s.speakerId)).map((s:any)=>s.name);
  const isGeneral=kind==="general";
  return <Card className="mb-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <b>{isGeneral?"General action tasks":"File-request tasks"}</b>
        <p className="text-sm text-mid">{isGeneral?"Assign a title, optional description, due date, and one or many speakers. No file is required — each speaker marks the task complete independently.":"Assign instructions, deadlines, file requirements, and accepted MIME types to one or many speakers."}</p>
      </div>
      <Button onClick={()=>setOpen(!open)}>{open?"Close":"Create task"}</Button>
    </div>
    {result?<Notice tone="ok" onClose={()=>setResult(null)}>
      <b>{result.count} {result.kind==="general"?"general task":"deliverable"}{result.count===1?"":"s"} created</b> · {result.name} · due {result.dueAt}<br/>
      Assigned to: {result.names.join(", ")}
    </Notice>:null}
    {err?<Notice tone="danger" onClose={()=>setErr("")}>{err}</Notice>:null}
    {open?<div className="mt-4 grid gap-2 md:grid-cols-2">
      <Field label="Task kind" hint="General/action tasks never require a file. File-request tasks collect an upload.">
        <Select aria-label="Task kind" data-testid="task-kind" value={kind} onChange={e=>{
          const next=e.target.value==="general"?"general":"file";
          setKind(next);
          setForm((f:any)=>({
            ...f,
            name: next==="general" && f.name==="Upload Session Presentation" ? "Sign speaker release form" : next==="file" && f.name==="Sign speaker release form" ? "Upload Session Presentation" : f.name,
            instructions: next==="general" && f.instructions.startsWith("Final slide deck") ? "Confirm that you signed the speaker release form." : f.instructions,
            fileRequired: next==="file",
          }));
        }}>
          <option value="file">File request (upload required)</option>
          <option value="general">General action (no file)</option>
        </Select>
      </Field>
      <Field label="Task name"><Input value={form.name} onChange={e=>{
        const name=e.target.value;
        // A task named "…headshot…" should collect images, not PDFs — switch the
        // default accepted types unless the organizer already customised them.
        const isHeadshot=/headshot|photo|portrait/i.test(name);
        const defaults=isHeadshot?["image/png","image/jpeg"]:["application/pdf"];
        const untouched=JSON.stringify(form.acceptedTypes)===JSON.stringify(["application/pdf"])||JSON.stringify(form.acceptedTypes)===JSON.stringify(["image/png","image/jpeg"]);
        setForm({...form,name,acceptedTypes:untouched?defaults:form.acceptedTypes});
      }}/></Field>
      <Field label="Due date"><Input type="date" value={form.dueAt} onChange={e=>setForm({...form,dueAt:e.target.value})}/></Field>
      <Field label="Instructions"><Textarea value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})}/></Field>
      {isGeneral?null:<Field label="Accepted MIME types" hint={/headshot|photo|portrait/i.test(form.name)?"Headshot task — defaults to PNG/JPEG images.":"Comma separated MIME types (server enforces them on upload)."}><Input value={form.acceptedTypes.join(",")} onChange={e=>setForm({...form,acceptedTypes:e.target.value.split(",").map((x:string)=>x.trim()).filter(Boolean)})}/></Field>}
      <div className="md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="text-xs uppercase tracking-wide text-mid">Assign to speakers ({form.speakerIds.length} selected)</b>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" type="button" data-testid="select-all-speakers"
              onClick={()=>setForm((f:any)=>({...f,speakerIds:allSelected?[]:speakers.map((s:any)=>s.speakerId)}))}>
              {allSelected?"Clear all":"All speakers"}
            </Button>
          </div>
        </div>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {speakers.map((s:any)=>{
            const id=`assign-${s.speakerId}`;const checked=form.speakerIds.includes(s.speakerId);
            return <label key={s.speakerId} htmlFor={id}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm ${checked?"border-brand-400 bg-brand-50":"border-line bg-white"}`}>
              <input id={id} type="checkbox" aria-label={`Assign to ${s.name}`} checked={checked}
                onChange={e=>toggle(s.speakerId,e.target.checked)}/>
              <span className="min-w-0"><b className="block truncate">{s.name}</b><span className="block truncate text-xs text-mid">{s.email||s.speakerId}</span></span>
            </label>;
          })}
        </div>
        {selectedNames.length?<p className="mt-2 text-xs text-mid">{isGeneral?"Will create one independent general task per speaker for:":"Will create one deliverable per session for:"} <b className="text-ink">{selectedNames.join(", ")}</b></p>:<p className="mt-2 text-xs text-mid">Select at least one speaker.</p>}
      </div>
      <div className="md:col-span-2">
        <Button disabled={busy||!form.speakerIds.length||!form.name.trim()} onClick={async()=>{
          setBusy(true);setErr("");
          try{
            const dueAt=new Date(`${form.dueAt}T23:59:59Z`).toISOString();
            const r:any=isGeneral
              ? await api.assignSpeakerTasks({title:form.name,description:form.instructions,dueAt,type:"general",speakerIds:form.speakerIds})
              : await api.createDeliverableTask({...form,dueAt,fileRequired:true});
            const made=r.data||[];
            const names=[...new Set(made.map((t:any)=>speakers.find((s:any)=>s.speakerId===t.speakerId)?.name||t.speakerId))] as string[];
            setResult({count:made.length,names,name:form.name,dueAt:form.dueAt,kind:isGeneral?"general":"file"});
            toast(`${made.length} ${isGeneral?"general task":"deliverable"}(s) assigned to ${names.length} speaker(s)`);
            setOpen(false);reload();
          }catch(e:any){setErr(e?.message||"Task creation failed");toast(e?.message||"Task creation failed","danger")}
          finally{setBusy(false)}
        }}>{busy?"Saving…":isGeneral?"Save general task":"Save task"}</Button>
      </div>
    </div>:null}
  </Card>;
}
