import { useEffect,useMemo,useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Badge,Button,Card,Field,Input,Notice,PageHeader,Select,Textarea,toast } from "../components/ui";

export function ContentPage(){const[data,setData]=useState<any>(null),[filter,setFilter]=useState("all"),[tab,setTab]=useState("dashboard"),[editing,setEditing]=useState<any>(null),[speaker,setSpeaker]=useState<any>(null),[comment,setComment]=useState("");const[savedSession,setSavedSession]=useState<any>(null),[savedSpeaker,setSavedSpeaker]=useState<any>(null),[reminderResult,setReminderResult]=useState<any>(null),[reminderBusy,setReminderBusy]=useState(false),[exportState,setExportState]=useState<any>(null),[exportBusy,setExportBusy]=useState(false);const [params,setParams]=useSearchParams();
const load=()=>api.content().then(r=>setData(r.data));useEffect(()=>{load()},[]);
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
{tab==="files"?<><div className="mb-3 flex flex-wrap items-center gap-2"><Button disabled={exportBusy} onClick={async()=>{setExportBusy(true);setExportState({status:"working"});try{const r=await api.contentExportZip();const url=URL.createObjectURL(r.blob);const a=document.createElement("a");a.href=url;a.download=r.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);setExportState({status:"ready",fileCount:r.fileCount,filename:r.filename,sizeKb:Math.max(1,Math.round(r.blob.size/1024)),at:new Date().toLocaleTimeString()});toast(`ZIP ready · ${r.fileCount} file${r.fileCount===1?"":"s"} · download started`)}catch(e:any){setExportState({status:"failed",error:e?.message||"Export failed"});toast(e?.message||"Export failed","danger")}finally{setExportBusy(false)}}}>{exportBusy?"Building ZIP…":"Generate ZIP · latest versions"}</Button><span className="text-xs text-mid">Bundles the current version of every uploaded file, grouped by session folder.</span></div>{exportState?<Notice tone={exportState.status==="ready"?"ok":exportState.status==="failed"?"danger":"info"} onClose={()=>setExportState(null)}>{exportState.status==="working"?"Building ZIP…":exportState.status==="failed"?exportState.error:<span><b>Download started</b> · {exportState.filename} · {exportState.fileCount} file{exportState.fileCount===1?"":"s"} · {exportState.sizeKb} KB · {exportState.at}</span>}</Notice>:null}{data.files.map((f:any)=><Card className="mb-3 p-5" key={f.id}><div className="flex justify-between"><div><h2 className="font-bold">{f.currentVersion?.name}</h2><p className="text-sm text-mid">{f.speaker?.name} · {f.session?.title} · uploaded {f.currentVersion?.uploadedAt.slice(0,10)} · {f.versions.length} versions</p></div><Select className="max-w-48" value={f.status} onChange={async e=>{await api.approveContentFile(f.id,{status:e.target.value,comment:"Reviewed in Content library"});load()}}><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="changes_requested">Changes requested</option></Select></div><div className="mt-3"><b className="text-xs uppercase text-mid">Version history</b>{[...f.versions].reverse().map((v:any)=><div className="mt-1 flex justify-between rounded bg-soft p-2 text-sm" key={v.id}><span>v{v.version} · {v.name} · {v.uploadedAt}</span><span>{v.current?<Badge tone="ok">Current</Badge>:null} <a className="text-ink underline" href={`/api/content/files/${f.id}/versions/${v.id}`}>View</a></span></div>)}</div><div className="mt-3"><b className="text-xs uppercase text-mid">Comments</b>{f.comments.map((c:any)=><p className="mt-1 rounded bg-soft p-2 text-sm" key={c.id}><b>{c.authorName}</b> · {new Date(c.createdAt).toLocaleString()}<br/>{c.body}</p>)}<div className="mt-2 flex gap-2"><Input placeholder="Reply to file thread" value={comment} onChange={e=>setComment(e.target.value)}/><Button onClick={async()=>{await api.addFileComment(f.id,comment);setComment("");load()}}>Reply</Button></div></div></Card>)}</>:null}
{tab==="sessions"?<div className="grid gap-4 lg:grid-cols-2"><div><h2 className="mb-2 font-bold">Sessions</h2><p className="mb-2 text-xs text-mid">Every canonical schedule session, including ones created directly in the schedule builder.</p>{data.sessions.map((s:any)=><Card className="mb-2 p-4" key={s.id} data-session-id={s.canonicalId||s.id}><div className="flex flex-wrap items-center justify-between gap-2"><b>{s.title}</b><span className="flex items-center gap-1"><Badge>{s.contentStatus}</Badge>{s.publishStatus==="published"?<Badge tone="ok">public</Badge>:null}{s.scheduled===false?<Badge tone="muted">unscheduled</Badge>:null}</span></div><p className="mt-1 text-xs text-mid">{s.canonicalId||s.id}{s.history?.length?` · ${s.history.length} change${s.history.length===1?"":"s"}`:""}</p><Button size="sm" className="mt-2" aria-label={`Edit ${s.title}`} onClick={()=>setEditing({...s})}>Edit session</Button></Card>)}</div><div><h2 className="mb-2 font-bold">Speakers</h2>{data.speakers.map((s:any)=><Card className="mb-2 p-4" key={s.speakerId}><b>{s.name}</b><p className="text-sm text-mid">{s.title} · {s.company}</p><Button size="sm" className="mt-2" onClick={()=>setSpeaker({...s})}>Edit profile</Button></Card>)}</div></div>:null}
{editing?<Card className="fixed inset-x-4 top-20 z-50 mx-auto max-h-[80vh] max-w-2xl overflow-auto p-6 shadow-xl" data-testid="session-editor">
  <PageHeader title={`Edit session content · ${editing.title}`} description={`Session ${editing.id} · approval ${editing.contentStatus||"draft"}`}/>
  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[18px] border border-line bg-soft p-3 text-sm">
    <b className="text-ink" data-testid="editor-current-title">{editing.title}</b>
    <Badge tone={editing.contentStatus==="approved"?"ok":"muted"}>{editing.contentStatus||"draft"}</Badge>
    <a className="ml-auto font-semibold text-ink underline" href={`/e/ai-engineer-summit/public/sessions/${editing.id}`} target="_blank" rel="noreferrer">View public page ↗</a>
    <a className="font-semibold text-ink underline" href="/e/ai-engineer-summit/public/sessions" target="_blank" rel="noreferrer">Public catalog ↗</a>
  </div>
  {savedSession&&savedSession.id===editing.id?<Notice tone="ok" onClose={()=>setSavedSession(null)}>
    <span className="block font-semibold" data-testid="session-saved-banner">Saved · title is now “{savedSession.title}”</span>
    <span className="text-xs">Approval {savedSession.contentStatus||"draft"} · saved {savedSession.at}. Approved sessions appear on the public page immediately.</span>
    <a className="mt-1 block text-xs font-semibold text-ink underline" data-testid="saved-public-link" href={`/e/ai-engineer-summit/public/sessions/${encodeURIComponent(savedSession.id)}?t=${savedSession.stamp}`} target="_blank" rel="noreferrer">View public page (fresh) ↗</a>
    <a className="block text-xs font-semibold text-ink underline" href={`/e/ai-engineer-summit/public/sessions?t=${savedSession.stamp}`} target="_blank" rel="noreferrer">View public catalog (fresh) ↗</a>
  </Notice>:null}<Field label="Title"><Input value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></Field><Field label="Abstract"><Textarea value={editing.abstract} onChange={e=>setEditing({...editing,abstract:e.target.value})}/></Field><Field label="Format"><Input value={editing.format||"Talk"} onChange={e=>setEditing({...editing,format:e.target.value})}/></Field><Field label="Track"><Select value={editing.trackId||""} onChange={e=>setEditing({...editing,trackId:e.target.value})}>{[...new Set([editing.trackId,...data.sessions.map((s:any)=>s.trackId),"track-eng","track-product","track-agents","track-workshop"].filter(Boolean))].map((x:any)=><option key={x} value={x}>{x}</option>)}</Select></Field><Field label="Approval status"><Select value={editing.contentStatus} onChange={e=>setEditing({...editing,contentStatus:e.target.value})}><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="changes_requested">Changes requested</option></Select></Field><div className="flex gap-2"><Button onClick={async()=>{const r:any=await api.editContentSession(editing.id,editing);setEditing({...r.data});setSavedSession({id:r.data.canonicalId||r.data.id,title:r.data.title,contentStatus:r.data.contentStatus,at:new Date().toLocaleTimeString(),stamp:Date.now()});toast(`Saved “${r.data.title}” to the canonical public projection`);load()}}>Save</Button><Button variant="outline" onClick={()=>{setEditing(null);setSavedSession(null)}}>Close</Button></div>{editing.history?.length===0?<p className="mt-4 text-xs text-mid" data-testid="history-empty">No edits recorded yet — saving a title, abstract, track, format or speaker change adds a restorable entry.</p>:null}{editing.history?.length?<div className="mt-4" data-testid="session-history"><b>Change history</b>{editing.history.map((h:any)=><div className="mt-1 flex justify-between rounded bg-soft p-2 text-sm" key={h.id}><span>{h.editorName} · {new Date(h.createdAt).toLocaleString()}</span><Button size="sm" variant="outline" onClick={async()=>{await api.restoreContentHistory(h.id);toast("Prior version restored");setEditing(null);load()}}>Restore</Button></div>)}</div>:null}</Card>:null}
{speaker?<Card className="fixed inset-x-4 top-20 z-50 mx-auto max-w-xl overflow-auto max-h-[85vh] p-6 shadow-xl" data-testid="speaker-editor"><PageHeader title={`Edit ${speaker.name}`} description={`Speaker ${speaker.speakerId}`}/>
  <div className="mb-3 flex items-center gap-3 rounded-[18px] border border-line bg-soft p-3">
    {speaker.headshotUrl?<img src={speaker.headshotUrl} alt={`${speaker.name} headshot`} data-testid="speaker-headshot-preview" className="h-14 w-14 rounded-full border border-line object-cover"/>:<div className="grid h-14 w-14 place-items-center rounded-full border border-line bg-white text-sm font-semibold text-mid">{speaker.name?.split(" ").map((x:string)=>x[0]).join("").slice(0,2)}</div>}
    <div className="min-w-0 text-sm"><b className="block truncate">{speaker.name}</b><span className="block truncate text-xs text-mid">{[speaker.title,speaker.company].filter(Boolean).join(" · ")||"No title yet"}</span><span className="block text-xs text-mid">Bio {String(speaker.bio||"").length} characters</span></div>
  </div>
  {savedSpeaker&&savedSpeaker.speakerId===speaker.speakerId?<Notice tone="ok" onClose={()=>setSavedSpeaker(null)}>
    <span className="block font-semibold" data-testid="speaker-saved-banner">Saved {savedSpeaker.name} at {savedSpeaker.at}</span>
    <span className="text-xs">Bio {savedSpeaker.bioLength} characters{savedSpeaker.headshot?" · headshot stored":""} · pushed to the roster and public projection.</span>
    <a className="mt-1 block text-xs font-semibold text-ink underline" href={`/e/ai-engineer-summit/public/speakers/${encodeURIComponent(savedSpeaker.speakerId)}?t=${savedSpeaker.stamp}`} target="_blank" rel="noreferrer">View public speaker page (fresh) ↗</a>
  </Notice>:null}<Field label="Title"><Input value={speaker.title||""} onChange={e=>setSpeaker({...speaker,title:e.target.value})}/></Field><Field label="Company"><Input value={speaker.company||""} onChange={e=>setSpeaker({...speaker,company:e.target.value})}/></Field><Field label="Bio"><Textarea value={speaker.bio||""} onChange={e=>setSpeaker({...speaker,bio:e.target.value})}/></Field><Field label="Headshot"><div className="space-y-2">{speaker.headshotUrl?<img src={speaker.headshotUrl} alt="" className="h-20 w-20 rounded-full object-cover border border-line"/>:null}<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload headshot" className="block w-full text-sm" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2*1024*1024){toast("Headshot must be under 2 MB","danger");return;}const dataUrl=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=reject;r.readAsDataURL(f)});setSpeaker({...speaker,headshotUrl:dataUrl,headshotName:f.name});toast(`Selected ${f.name}`,"info")}}/><p className="text-xs text-mid">PNG/JPEG/WebP · max 2 MB. File is stored on the speaker profile and public projection.</p></div></Field><div className="flex gap-2"><Button onClick={async()=>{const r:any=await api.editContentSpeaker(speaker.speakerId,{title:speaker.title,company:speaker.company,bio:speaker.bio,headshotUrl:speaker.headshotUrl});const saved=r?.data||speaker;setSpeaker({...speaker,...saved});setSavedSpeaker({speakerId:speaker.speakerId,name:saved.name||speaker.name,bioLength:String(saved.bio||"").length,headshot:Boolean(saved.headshotUrl),at:new Date().toLocaleTimeString(),stamp:Date.now()});toast(`Saved ${saved.name||speaker.name} — bio ${String(saved.bio||"").length} characters`);load()}}>Save</Button><Button variant="outline" onClick={()=>setSpeaker(null)}>Close</Button></div></Card>:null}</div>}

function TaskBuilder({data,reload}:{data:any;reload:()=>void}){
  const[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<any>(null),[err,setErr]=useState("");
  const[form,setForm]=useState<any>({name:"Upload Session Presentation",instructions:"Final slide deck as a PDF, 16:9 aspect ratio.",dueAt:"2027-05-01",speakerIds:[],fileRequired:true,acceptedTypes:["application/pdf"]});
  const speakers:any[]=data.speakers||[];
  const allSelected=speakers.length>0&&speakers.every((s:any)=>form.speakerIds.includes(s.speakerId));
  const toggle=(id:string,on:boolean)=>setForm((f:any)=>({...f,speakerIds:on?[...new Set([...f.speakerIds,id])]:f.speakerIds.filter((x:string)=>x!==id)}));
  const selectedNames=speakers.filter((s:any)=>form.speakerIds.includes(s.speakerId)).map((s:any)=>s.name);
  return <Card className="mb-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><b>File-request tasks</b><p className="text-sm text-mid">Assign instructions, deadlines, file requirements, and accepted MIME types to one or many speakers.</p></div>
      <Button onClick={()=>setOpen(!open)}>{open?"Close":"Create task"}</Button>
    </div>
    {result?<Notice tone="ok" onClose={()=>setResult(null)}>
      <b>{result.count} deliverable{result.count===1?"":"s"} created</b> · {result.name} · due {result.dueAt}<br/>
      Assigned to: {result.names.join(", ")}
    </Notice>:null}
    {err?<Notice tone="danger" onClose={()=>setErr("")}>{err}</Notice>:null}
    {open?<div className="mt-4 grid gap-2 md:grid-cols-2">
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
      <Field label="Accepted MIME types" hint={/headshot|photo|portrait/i.test(form.name)?"Headshot task — defaults to PNG/JPEG images.":"Comma separated MIME types (server enforces them on upload)."}><Input value={form.acceptedTypes.join(",")} onChange={e=>setForm({...form,acceptedTypes:e.target.value.split(",").map((x:string)=>x.trim()).filter(Boolean)})}/></Field>
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
              className={`flex cursor-pointer items-center gap-2 rounded-[18px] border px-3 py-2 text-sm ${checked?"border-ink bg-soft":"border-line bg-white"}`}>
              <input id={id} type="checkbox" aria-label={`Assign to ${s.name}`} checked={checked}
                onChange={e=>toggle(s.speakerId,e.target.checked)}/>
              <span className="min-w-0"><b className="block truncate">{s.name}</b><span className="block truncate text-xs text-mid">{s.email||s.speakerId}</span></span>
            </label>;
          })}
        </div>
        {selectedNames.length?<p className="mt-2 text-xs text-mid">Will create one deliverable per session for: <b className="text-ink">{selectedNames.join(", ")}</b></p>:<p className="mt-2 text-xs text-mid">Select at least one speaker.</p>}
      </div>
      <div className="md:col-span-2">
        <Button disabled={busy||!form.speakerIds.length||!form.name.trim()} onClick={async()=>{
          setBusy(true);setErr("");
          try{
            const r:any=await api.createDeliverableTask({...form,dueAt:new Date(`${form.dueAt}T23:59:59Z`).toISOString()});
            const made=r.data||[];
            const names=[...new Set(made.map((t:any)=>speakers.find((s:any)=>s.speakerId===t.speakerId)?.name||t.speakerId))] as string[];
            setResult({count:made.length,names,name:form.name,dueAt:form.dueAt});
            toast(`${made.length} deliverable(s) assigned to ${names.length} speaker(s)`);
            setOpen(false);reload();
          }catch(e:any){setErr(e?.message||"Task creation failed");toast(e?.message||"Task creation failed","danger")}
          finally{setBusy(false)}
        }}>{busy?"Saving…":"Save task"}</Button>
      </div>
    </div>:null}
  </Card>;
}
