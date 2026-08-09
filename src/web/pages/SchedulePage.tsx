import { useEffect, useMemo, useState } from "react";
import { api, subscribeData } from "../lib/api";
import { EVENT_ID, PROGRAM_DAYS, fmtDate, fmtTime, formatStatus } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Notice,
  PageHeader,
  Spinner,
  toast,
} from "../components/ui";

type View = "list" | "day" | "week" | "track" | "room";

function defaultView(): View {
  if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) return "list";
  return "day";
}

type PendingMove = {
  slot: any;
  version: number;
  warnings: any[];
  alternatives: any[];
};

export function SchedulePage() {
  const [d, setD] = useState<any>(null);
  const [view, setView] = useState<View>(defaultView);
  const [drag, setDrag] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [hour, setHour] = useState(18);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [busy, setBusy] = useState(false);
  const [agenda,setAgenda]=useState<any[]>([]);
  const [constraints,setConstraints]=useState({dayStartHour:9,dayEndHour:17,slotMinutes:30,breakMinutes:15});
  const [newRoom,setNewRoom]=useState(""),[newTrack,setNewTrack]=useState("");

  const load = () =>
    api
      .schedule()
      .then(setD)
      .catch((e) => setErr(e.message));
  const loadAgenda=()=>api.agendaProposals().then(r=>setAgenda(r.data)).catch(e=>setErr(e.message));

  useEffect(() => {
    load();
    loadAgenda();
    return subscribeData(load);
  }, []);

  const session = (id: string) => d?.sessions.find((x: any) => x.id === id);
  const scheduled = useMemo(() => new Set((d?.slots || []).map((x: any) => x.sessionId)), [d]);

  const commitMove = async (slot: any, version: number, acknowledge: string[] = []) => {
    setBusy(true);
    try {
      await api.moveSlot({ slot, version, acknowledge });
      toast("Schedule updated");
      setPending(null);
      setErr("");
      load();
    } catch (e: any) {
      toast(e.message, "danger");
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const move = async (sessionId: string, roomId: string, startHour = hour, dayIso: string = PROGRAM_DAYS[0].id) => {
    if (!d) return;
    const s = session(sessionId);
    if (!s) return;
    const startsAt = `${dayIso}T${String(startHour).padStart(2, "0")}:00:00.000Z`;
    const endsAt = new Date(Date.parse(startsAt) + (s.durationMinutes || 45) * 60000).toISOString();
    const slot = {
      id: d.slots.find((x: any) => x.sessionId === sessionId)?.id ?? `slot-${sessionId}`,
      sessionId,
      roomId,
      startsAt,
      endsAt,
    };
    try {
      const check = await api.validateSlot(slot);
      const hard = check.conflicts?.filter((x: any) => x.severity === "hard") || [];
      if (hard.length) {
        const msg = hard.map((x: any) => x.message).join(" ");
        setErr(`Blocked: ${msg}`);
        toast(msg, "danger");
        return;
      }
      const warning = check.conflicts?.filter((x: any) => x.severity === "warning") || [];
      const alternatives = check.alternatives || check.suggestions || [];
      if (warning.length) {
        setPending({
          slot,
          version: d.version,
          warnings: warning,
          alternatives,
        });
        return;
      }
      await commitMove(slot, d.version, []);
    } catch (e: any) {
      setErr(e.message);
      toast(e.message, "danger");
    }
  };

  if (!d && !err) return <Spinner />;

  const items = [...(d?.slots || [])].sort((a: any, b: any) => a.startsAt.localeCompare(b.startsAt));
  const unscheduled = (d?.sessions || []).filter((x: any) => !scheduled.has(x.id) && x.status === "accepted");
  const seedDayLabel = items[0]?.startsAt ? fmtDate(items[0].startsAt) : PROGRAM_DAYS[0].dateLabel;

  const roomLanes = d?.rooms || [];
  const trackLanes = d?.tracks || [];

  return (
    <div>
      <PageHeader
        title="Schedule"
        description="Drag accepted sessions onto rooms. Hard room/speaker conflicts are blocked server-side."
        actions={
          <a
            className="text-sm font-semibold text-iris"
            href={`/public/events/${EVENT_ID}/itinerary`}
            target="_blank"
            rel="noreferrer"
          >
            Public HTML itinerary ↗
          </a>
        }
      />
      {err ? (
        <Notice tone="danger" onClose={() => setErr("")}>
          {err}
        </Notice>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["list", "day", "week", "track", "room"] as View[]).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? "dark" : "outline"}
            onClick={() => setView(v)}
            aria-pressed={view === v}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-stone-600">
          Drop hour (UTC)
          <select
            className="h-8 rounded-md border border-stone-300 px-2"
            value={hour}
            aria-label="Drop hour UTC"
            onChange={(e) => setHour(Number(e.target.value))}
          >
            {[14, 15, 16, 17, 18, 19, 20, 21].map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="secondary" onClick={async()=>{const name=prompt("New room name",newRoom||"Overflow Room");if(name){setNewRoom(name);await api.createAgendaRoom({name});toast("Room added and ready for scheduling");load()}}}>+ Room</Button>
        <Button size="sm" variant="secondary" onClick={async()=>{const name=prompt("New track name",newTrack||"Community");if(name){setNewTrack(name);await api.createAgendaTrack({name});toast("Track added");load()}}}>+ Track</Button>
        <Button size="sm" onClick={async()=>{const r=await api.publishAgenda();toast(`${r.data.count} sessions published`);load();window.open(r.data.publicUrl,"_blank")}}>Publish agenda</Button>
      </div>

      <Card className="mb-4 border-indigo-200 p-4" id="ai-agenda">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><Badge tone="primary">AI Agenda · advisory</Badge><h2 className="mt-2 text-xl font-bold">Heuristic schedule assistant</h2><p className="text-sm text-stone-600">Deterministic demo heuristic only—not a model. It creates a persisted review draft and never changes the live schedule until you accept placements.</p></div><div className="flex gap-2"><Button onClick={async()=>{setBusy(true);try{await api.generateAgenda(constraints);toast("Reviewable agenda draft generated");loadAgenda()}catch(e:any){setErr(e.message)}finally{setBusy(false)}}} disabled={busy}>{agenda.length?"Regenerate draft":"Generate draft"}</Button>{agenda[0]?.status==="review"?<><Button variant="secondary" onClick={async()=>{await api.decideAgenda(agenda[0].id,"accept");toast("Accepted conflict-free placements through canonical schedule mutation");load();loadAgenda()}}>Accept all</Button><Button variant="outline" onClick={async()=>{await api.decideAgenda(agenda[0].id,"reject");toast("Proposal rejected; live schedule unchanged");loadAgenda()}}>Reject all</Button></>:null}</div></div>
        <div className="mt-3 flex flex-wrap gap-3">{Object.entries(constraints).map(([key,value])=><label key={key} className="text-xs font-semibold text-stone-600">{key.replace(/([A-Z])/g," $1")}<input className="ml-2 w-16 rounded border px-2 py-1" type="number" value={value} onChange={e=>setConstraints(x=>({...x,[key]:Number(e.target.value)}))}/></label>)}</div>
        {agenda[0]?<div className="mt-4"><p className="text-xs text-stone-500">Generation {agenda[0].generation} · {new Date(agenda[0].generatedAt).toLocaleString()} · provenance: {agenda[0].provenance}</p><div className="mt-2 grid gap-2 lg:grid-cols-2">{agenda[0].placements.map((p:any)=>{const s=session(p.sessionId),room=d?.rooms.find((r:any)=>r.id===p.slot.roomId);return <article key={p.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><b>{s?.title||p.sessionId}</b><Badge tone={p.status==="accepted"?"ok":p.status==="conflict"?"danger":"primary"}>{p.status}</Badge></div><p className="mt-1 text-sm">{fmtDate(p.slot.startsAt)} · {fmtTime(p.slot.startsAt)} · {room?.name}</p><p className="mt-2 text-xs text-stone-500">Why: {p.rationale}</p>{p.conflicts?.length?<Notice tone="danger">{p.conflicts.join(" ")}</Notice>:null}{p.status==="proposed"?<div className="mt-2 flex gap-2"><Button size="sm" onClick={async()=>{try{await api.decideAgendaPlacement(agenda[0].id,p.id,"accept");toast("Placement applied through canonical conflict checks");load();loadAgenda()}catch(e:any){setErr(`AI proposal blocked: ${e.message}`);loadAgenda()}}}>Accept</Button><Button size="sm" variant="outline" onClick={async()=>{await api.decideAgendaPlacement(agenda[0].id,p.id,"reject");loadAgenda()}}>Reject</Button></div>:null}</article>})}</div>{!agenda[0].placements.length?<EmptyState title="No eligible unscheduled sessions" description="Accept a session or move one back to the pool, then regenerate."/>:null}</div>:null}
      </Card>

      {d?.warnings?.length ? (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>
            {d.warnings.length} unscheduled accepted session{d.warnings.length === 1 ? "" : "s"}
          </b>
          <ul className="mt-1 list-disc pl-5">
            {d.warnings.map((w: any) => (
              <li key={w.id}>{w.message}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="p-4 lg:sticky lg:top-24 lg:self-start">
          <h3 className="text-sm font-bold">Unscheduled pool</h3>
          <p className="mt-1 text-xs text-stone-500">Accepted sessions needing a room. Drag onto a lane.</p>
          <div className="mt-3 space-y-2">
            {unscheduled.map((x: any) => (
              <article
                key={x.id}
                draggable
                onDragStart={() => setDrag(x.id)}
                className="cursor-grab rounded-xl border border-stone-200 bg-stone-50 p-3 active:cursor-grabbing"
              >
                <Badge tone="primary">
                  {x.trackIds?.map((i: string) => d.tracks.find((t: any) => t.id === i)?.name).join(" · ")}
                </Badge>
                <div className="mt-1 text-sm font-semibold">{x.title}</div>
                <div className="text-xs text-stone-500">
                  {x.speakerIds?.map((i: string) => d.speakers.find((q: any) => q.id === i)?.name).join(", ")}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 md:hidden">
                  {(d.rooms || []).slice(0, 3).map((room: any) => (
                    <Button key={room.id} size="sm" variant="outline" onClick={() => move(x.id, room.id)}>
                      → {room.name}
                    </Button>
                  ))}
                </div>
              </article>
            ))}
            {!unscheduled.length ? (
              <EmptyState title="Pool empty" description="All accepted sessions are placed." />
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-500">
            <span>
              {view} view · program week · seed day {seedDayLabel}
            </span>
            <span>version {d?.version}</span>
          </div>

          {view === "list" ? (
            <div className="divide-y">
              {items.map((slot: any) => {
                const s = session(slot.sessionId);
                return (
                  <div key={slot.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <b>{s?.title}</b>
                      <div className="text-xs text-stone-500">
                        {fmtDate(slot.startsAt)} · {fmtTime(slot.startsAt)}–{fmtTime(slot.endsAt)} ·{" "}
                        {d.rooms.find((r: any) => r.id === slot.roomId)?.name}
                      </div>
                    </div>
                    <Badge tone="ok">{formatStatus(s?.publishStatus || "published")}</Badge>
                  </div>
                );
              })}
              {unscheduled.map((x: any) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <b>{x.title}</b>
                    <div className="text-xs text-warn">Accepted · not on grid yet</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(d.rooms || []).map((room: any) => (
                      <Button key={room.id} size="sm" variant="secondary" onClick={() => move(x.id, room.id)}>
                        Place in {room.name}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {!items.length && !unscheduled.length ? (
                <EmptyState title="No sessions" description="Accept talks to populate the schedule." />
              ) : null}
            </div>
          ) : view === "week" ? (
            <div className="grid gap-3 md:grid-cols-3">
              {PROGRAM_DAYS.map((day, idx) => {
                const daySlots = items.filter((slot: any) => String(slot.startsAt).startsWith(day.id));
                const isSeedDay = idx === 0 || daySlots.length > 0;
                return (
                  <section
                    key={day.id}
                    className="rounded-xl border border-stone-200 p-3"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!drag) return;
                      if (!isSeedDay && daySlots.length === 0 && idx !== 0) {
                        // Allow drop on any day using that day's ISO
                        move(drag, d.rooms[0].id, hour, day.id);
                      } else {
                        move(drag, d.rooms[0].id, hour, day.id);
                      }
                      setDrag(null);
                    }}
                  >
                    <h3 className="text-sm font-bold">{day.label}</h3>
                    <p className="text-[11px] text-stone-500">{day.dateLabel} · UTC grid</p>
                    <div className="mt-2 min-h-28 rounded-lg border border-dashed border-stone-300 p-2">
                      {daySlots.length ? (
                        daySlots.map((slot: any) => {
                          const s = session(slot.sessionId);
                          return (
                            <div key={slot.id} className="mb-2 rounded-lg bg-stone-50 p-2 text-xs">
                              <b className="text-sm">{s?.title}</b>
                              <div>
                                {fmtTime(slot.startsAt)} · {d.rooms.find((r: any) => r.id === slot.roomId)?.name}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex h-full min-h-24 flex-col justify-center text-center text-xs text-stone-500">
                          <p className="font-semibold text-stone-600">Open day</p>
                          <p className="mt-1">
                            Demo seed places sessions on {PROGRAM_DAYS[0].short}. Drop here to schedule onto{" "}
                            {day.short}.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {(view === "track" ? trackLanes : roomLanes).map((lane: any) => (
                <section
                  key={lane.id}
                  className="rounded-xl border border-stone-200 p-3"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!drag) return;
                    const roomId = view === "track" ? d.rooms[0].id : lane.id;
                    move(drag, roomId);
                    setDrag(null);
                  }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-bold">{lane.name}</h3>
                    <span className="text-[11px] text-stone-500">Drop → {hour}:00 UTC</span>
                  </div>
                  <div className="min-h-16 rounded-lg border border-dashed border-stone-300 bg-stone-50/50 p-2">
                    {items
                      .filter((slot: any) => {
                        const s = session(slot.sessionId);
                        if (view === "track") return s?.trackIds?.includes(lane.id);
                        return slot.roomId === lane.id;
                      })
                      .map((slot: any) => {
                        const s = session(slot.sessionId);
                        return (
                          <article
                            key={slot.id}
                            draggable
                            onDragStart={() => setDrag(s.id)}
                            className="mb-2 cursor-grab rounded-lg border-l-4 border-l-lime bg-white p-2 shadow-sm"
                          >
                            <div className="text-[11px] font-bold text-stone-500">
                              {fmtTime(slot.startsAt)}–{fmtTime(slot.endsAt)}
                            </div>
                            <div className="text-sm font-semibold">{s?.title}</div>
                            <div className="text-xs text-stone-500">
                              {s?.speakerIds
                                ?.map((i: string) => d.speakers.find((q: any) => q.id === i)?.name)
                                .join(", ")}
                            </div>
                          </article>
                        );
                      })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog
        open={!!pending}
        onClose={() => !busy && setPending(null)}
        title="Schedule warning"
        description="The engine found soft conflicts. You can place anyway or pick an alternative slot."
        footer={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="dark"
              disabled={busy || !pending}
              onClick={() => {
                if (!pending) return;
                commitMove(
                  pending.slot,
                  pending.version,
                  pending.warnings.map((w) => w.id),
                );
              }}
            >
              Schedule anyway
            </Button>
          </>
        }
      >
        {pending ? (
          <div className="space-y-3 text-sm">
            <ul className="list-disc space-y-1 pl-5 text-amber-900">
              {pending.warnings.map((w) => (
                <li key={w.id}>{w.message}</li>
              ))}
            </ul>
            {pending.alternatives?.length ? (
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">
                  Suggested alternatives
                </div>
                <div className="space-y-2">
                  {pending.alternatives.slice(0, 5).map((alt: any, i: number) => (
                    <button
                      key={i}
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-left hover:border-iris/40"
                      onClick={() => {
                        const slot = {
                          ...pending.slot,
                          roomId: alt.roomId || pending.slot.roomId,
                          startsAt: alt.startsAt || pending.slot.startsAt,
                          endsAt: alt.endsAt || pending.slot.endsAt,
                        };
                        commitMove(slot, pending.version, []);
                      }}
                    >
                      <span>
                        {alt.label ||
                          `${alt.roomName || alt.roomId || "Room"} · ${alt.startsAt ? fmtTime(alt.startsAt) : "suggested time"}`}
                      </span>
                      <span className="text-xs font-semibold text-iris">Use</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-stone-500">No alternate slots returned by the validator.</p>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
