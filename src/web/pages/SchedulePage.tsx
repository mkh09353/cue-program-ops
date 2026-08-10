import { useEffect, useMemo, useState } from "react";
import { api, subscribeData } from "../lib/api";
import { EVENT_ID, EVENT_TZ, PROGRAM_DAYS, programDaysFromRange, type ProgramDay, fmtDate, fmtTime, fmtTzLabel, formatStatus } from "../lib/utils";
import { isoToZonedWallTime, zonedDayKey, zonedWallTimeToIso } from "../../timezone";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
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

/**
 * Accessible click-to-place form state. Drag-and-drop is unreachable for keyboard and
 * aria-driven agents, so every session also gets a Place/Move button that drives the
 * same canonical /schedule/move mutation through explicit Day / Time / Room selects.
 */
type PlaceTarget = {
  sessionId: string;
  title: string;
  durationMinutes: number;
  mode: "place" | "move";
  day: string;
  time: string;
  roomId: string;
};

/** HH:MM options across the configured day window, stepped by the slot interval. */
export function timeOptions(startHour: number, endHour: number, stepMinutes: number) {
  const step = Math.max(5, Math.min(120, Math.round(stepMinutes || 30)));
  const from = Math.max(0, Math.min(23, Math.round(startHour)));
  const to = Math.max(from + 1, Math.min(24, Math.round(endHour)));
  const out: string[] = [];
  for (let minutes = from * 60; minutes < to * 60; minutes += step) {
    out.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Human copy for a hard conflict, keyed on the server's code so the dialog never shows
 * the generic invalid-range line for a room/speaker clash.
 */
export function conflictHeadline(conflict: { code?: string; message?: string } | undefined) {
  if (!conflict) return "";
  const label =
    conflict.code === "ROOM_OVERLAP"
      ? "Room already booked"
      : conflict.code === "SPEAKER_OVERLAP"
        ? "Speaker double-booked"
        : conflict.code === "TRACK_CONCURRENCY"
          ? "Track limit reached"
          : conflict.code === "INVALID_RANGE"
            ? "Invalid day, time or room"
            : "Blocked";
  return conflict.message ? `${label}: ${conflict.message}` : label;
}

/** Capacity (soft) warnings for an already-placed slot, derived from canonical data. */
export function capacityWarning(
  session: { capacity?: number } | undefined,
  room: { name?: string; capacity?: number } | undefined,
) {
  if (!session?.capacity || !room?.capacity || session.capacity <= room.capacity) return "";
  return `${session.capacity} expected attendees exceeds ${room.name}'s ${room.capacity} capacity.`;
}

export function SchedulePage() {
  const [d, setD] = useState<any>(null);
  const [view, setView] = useState<View>(defaultView);
  const [drag, setDrag] = useState<string | null>(null);
  const [err, setErr] = useState("");
  // Drop hour is EVENT wall time (see zonedWallTimeToIso); defaults inside day hours.
  const [hour, setHour] = useState(10);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [busy, setBusy] = useState(false);
  const [agenda,setAgenda]=useState<any[]>([]);
  const [constraints,setConstraints]=useState({dayStartHour:9,dayEndHour:17,slotMinutes:30,breakMinutes:15});
  const [newRoom, setNewRoom] = useState("");
  const [newTrack, setNewTrack] = useState("");
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [showTrackForm, setShowTrackForm] = useState(false);
  const [programDays, setProgramDays] = useState<ProgramDay[]>(() => [...PROGRAM_DAYS]);
  const [selectedDay, setSelectedDay] = useState<string>(PROGRAM_DAYS[0].id);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishBanner, setPublishBanner] = useState("");
  const [newSession,setNewSession]=useState({title:"",speakerIds:[] as string[],trackId:"",durationMinutes:45});
  const [place, setPlace] = useState<PlaceTarget | null>(null);
  const [placeError, setPlaceError] = useState("");
  const [placeConflicts, setPlaceConflicts] = useState<any[]>([]);
  const [placeWarnings, setPlaceWarnings] = useState<any[]>([]);
  const [placeBusy, setPlaceBusy] = useState(false);

  const load = () =>
    api
      .schedule()
      .then((sched) => {
        setD(sched);
        const last = (sched as any)?.lastAgendaPublish;
        if (last?.publishedAt != null && last?.count != null) {
          const when = new Date(last.publishedAt).toLocaleString();
          setPublishBanner(`Published · ${last.count} session${last.count === 1 ? "" : "s"} · ${when}`);
        }
      })
      .catch((e) => setErr(e.message));
  const loadAgenda = () => api.agendaProposals().then((r) => setAgenda(r.data)).catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    loadAgenda();
    api
      .bootstrap()
      .then((r) => {
        const ev = r.data?.event || {};
        const days = programDaysFromRange(ev.startsAt, ev.endsAt, ev.timezone || EVENT_TZ);
        if (days.length) {
          setProgramDays(days);
          setSelectedDay((cur) => (days.some((d) => d.id === cur) ? cur : days[0].id));
        }
      })
      .catch(() => {});
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

  const move = async (sessionId: string, roomId: string, startHour = hour, dayIso: string = selectedDay) => {
    if (!d) return;
    const s = session(sessionId);
    if (!s) return;
    // The picked hour is EVENT wall time on that calendar day, not UTC.
    const startsAt = zonedWallTimeToIso(dayIso, `${String(startHour).padStart(2, "0")}:00`);
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

  /** Open the accessible place/move form for a session, prefilled from its slot. */
  const openPlace = (sessionId: string, mode: "place" | "move") => {
    const s = session(sessionId);
    if (!s || !d) return;
    const slot = d.slots.find((x: any) => x.sessionId === sessionId);
    const iso: string | undefined = slot?.startsAt;
    const options = timeOptions(constraints.dayStartHour, constraints.dayEndHour, constraints.slotMinutes);
    // Prefill from the stored instant as it reads in the event timezone.
    const current = iso ? isoToZonedWallTime(iso) : null;
    setPlaceError("");
    setPlaceConflicts([]);
    setPlaceWarnings([]);
    setPlace({
      sessionId,
      title: s.title,
      durationMinutes: s.durationMinutes || 45,
      mode,
      day: (current?.day || selectedDay) || programDays[0]?.id || selectedDay,
      // Keep the session's current time even if it is off the step grid.
      time: current?.time || options[0] || "09:00",
      roomId: slot?.roomId || d.rooms?.[0]?.id || "",
    });
  };

  const placeSlot = (target: PlaceTarget) => {
    // Day + HH:MM are event wall time; storage stays a UTC ISO instant.
    const startsAt = zonedWallTimeToIso(target.day, target.time);
    return {
      id: d?.slots.find((x: any) => x.sessionId === target.sessionId)?.id ?? `slot-${target.sessionId}`,
      sessionId: target.sessionId,
      roomId: target.roomId,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + target.durationMinutes * 60000).toISOString(),
    };
  };

  /**
   * Submit through the canonical /schedule/move path. Hard conflicts (409) keep the
   * dialog open with the server's own message; capacity warnings (422) offer an
   * explicit acknowledgement; a stale version (409) refetches and retries once.
   */
  const submitPlace = async (acknowledge: string[] = [], retry = true): Promise<void> => {
    if (!place || !d) return;
    if (!place.roomId) {
      setPlaceError("Choose a room.");
      return;
    }
    let slot: any;
    try {
      slot = placeSlot(place);
    } catch (e: any) {
      // Bad day/time input is a local problem: report it without ever entering the
      // saving state (this is what previously produced an unrecoverable dialog).
      setPlaceError(e?.message || "Choose a valid day and time.");
      setPlaceConflicts([]);
      setPlaceWarnings([]);
      return;
    }
    if (!(Date.parse(slot.endsAt) > Date.parse(slot.startsAt))) {
      setPlaceError("The end time must be after the start time — check the session duration.");
      return;
    }
    setPlaceBusy(true);
    setPlaceError("");
    setPlaceConflicts([]);
    setPlaceWarnings([]);
    try {
      const result = await api.moveSlotDetailed({ slot, version: d.version, acknowledge });
      if (result.ok) {
        toast(`${place.mode === "move" ? "Moved" : "Placed"} ${place.title}`);
        setPlace(null);
        setErr("");
        load();
        return;
      }
      if (result.status === 409 && /stale/i.test(result.error) && retry) {
        // Someone else (or an earlier action) advanced the schedule: refresh and retry.
        const fresh = await api.schedule();
        setD(fresh);
        const again = await api.moveSlotDetailed({ slot, version: fresh.version, acknowledge });
        if (again.ok) {
          toast(`${place.mode === "move" ? "Moved" : "Placed"} ${place.title}`);
          setPlace(null);
          load();
          return;
        }
        setPlaceConflicts(again.conflicts.filter((x: any) => x.severity === "hard"));
        setPlaceWarnings(again.warnings || []);
        setPlaceError(again.error || "Move rejected");
        return;
      }
      const hard = (result.conflicts || []).filter((x: any) => x.severity === "hard");
      setPlaceConflicts(hard);
      setPlaceWarnings(result.warnings || []);
      setPlaceError(
        result.status === 422
          ? "This placement has soft warnings. Review them and confirm to place anyway."
          : // Lead with the server's specific reason (room vs speaker vs invalid range).
            conflictHeadline(hard[0]) || result.error || "Move rejected",
      );
      toast(hard[0]?.message || result.error || "Move rejected", "danger");
    } catch (e: any) {
      setPlaceError(e?.message || "Move failed");
    } finally {
      setPlaceBusy(false);
    }
  };

  if (!d && !err) return <Spinner />;

  const items = [...(d?.slots || [])].sort((a: any, b: any) => a.startsAt.localeCompare(b.startsAt));
  const unscheduled = (d?.sessions || []).filter((x: any) => !scheduled.has(x.id) && x.status === "accepted");
  const seedDayLabel = items[0]?.startsAt ? fmtDate(items[0].startsAt) : programDays[0]?.dateLabel || PROGRAM_DAYS[0].dateLabel;
  const activeDay = programDays.find((d) => d.id === selectedDay) || programDays[0] || PROGRAM_DAYS[0];
  const dayItems = items.filter((slot: any) => zonedDayKey(slot.startsAt) === selectedDay);

  const roomLanes = d?.rooms || [];
  const trackLanes = d?.tracks || [];

  return (
    <div>
      <Notice tone="info">All times shown in <b>{EVENT_TZ}</b> ({fmtTzLabel()}).</Notice>
      <PageHeader
        title="Schedule"
        description="Drag accepted sessions onto rooms. Hard room/speaker conflicts are blocked server-side."
        actions={
          <a
            className="text-sm font-semibold text-ink"
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
      <Card className="mb-4 p-4"><h2 className="font-bold">New session</h2><p className="text-sm text-mid">Create directly in the canonical schedule, then place it to test conflicts.</p><div className="mt-3 grid gap-3 md:grid-cols-4"><Field label="Title"><Input value={newSession.title} onChange={e=>setNewSession({...newSession,title:e.target.value})}/></Field><Field label="Speakers"><select multiple aria-label="Session speakers" className="min-h-24 rounded-[18px] border border-line p-2" value={newSession.speakerIds} onChange={e=>setNewSession({...newSession,speakerIds:Array.from(e.target.selectedOptions).map(x=>x.value)})}>{(d?.speakers||[]).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Track"><select className="h-10 rounded-[18px] border border-line px-3" value={newSession.trackId} onChange={e=>setNewSession({...newSession,trackId:e.target.value})}><option value="">General</option>{(d?.tracks||[]).map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field><Field label="Duration"><Input type="number" value={newSession.durationMinutes} onChange={e=>setNewSession({...newSession,durationMinutes:Number(e.target.value)})}/></Field></div><Button className="mt-3" disabled={!newSession.title||!newSession.speakerIds.length} onClick={async()=>{await api.createScheduleSession(newSession);toast("Session created");setNewSession({title:"",speakerIds:[],trackId:"",durationMinutes:45});load()}}>Create session</Button></Card>

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
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-mid">
          Drop hour (event tz)
          <select
            className="h-8 rounded-md border border-line px-2"
            value={hour}
            aria-label="Drop hour in event timezone"
            onChange={(e) => setHour(Number(e.target.value))}
          >
            {Array.from(
              { length: Math.max(1, constraints.dayEndHour - constraints.dayStartHour) },
              (_, i) => constraints.dayStartHour + i,
            ).map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="secondary" onClick={() => { setShowRoomForm((v) => !v); setShowTrackForm(false); }}>+ Room</Button>
        <Button size="sm" variant="secondary" onClick={() => { setShowTrackForm((v) => !v); setShowRoomForm(false); }}>+ Track</Button>
        <Button
          size="sm"
          disabled={publishBusy}
          onClick={async () => {
            setPublishBusy(true);
            try {
              const r = await api.publishAgenda();
              const count = r.data?.count ?? 0;
              const when = r.data?.publishedAt
                ? new Date(r.data.publishedAt).toLocaleString()
                : new Date().toLocaleString();
              const line =
                r.data?.message ||
                `Published · ${count} session${count === 1 ? "" : "s"} · ${when}`;
              setPublishBanner(line);
              toast(line);
              load();
              if (r.data?.publicUrl) window.open(r.data.publicUrl, "_blank", "noopener,noreferrer");
            } catch (e: any) {
              const msg = e?.message || "Publish failed";
              setErr(msg);
              toast(msg, "danger");
            } finally {
              setPublishBusy(false);
            }
          }}
        >
          {publishBusy ? "Publishing…" : "Publish agenda"}
        </Button>
      </div>

      {publishBanner ? (
        <Notice tone="ok" onClose={() => setPublishBanner("")}>
          <span data-testid="agenda-publish-status">{publishBanner}</span>
          {" · "}
          <a
            className="font-semibold underline"
            href={(d as any)?.lastAgendaPublish?.publicUrl || `/public/events/${EVENT_ID}/itinerary`}
            target="_blank"
            rel="noreferrer"
          >
            Open public itinerary ↗
          </a>
        </Notice>
      ) : null}

      {showRoomForm ? (
        <Card className="mb-3 flex flex-wrap items-end gap-2 p-3" id="add-room-form">
          <Field label="New room name">
            <Input
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              placeholder="Overflow Room"
              aria-label="New room name"
            />
          </Field>
          <Button
            size="sm"
            disabled={!newRoom.trim()}
            onClick={async () => {
              const name = newRoom.trim();
              if (!name) return;
              await api.createAgendaRoom({ name });
              toast("Room added and ready for scheduling");
              setNewRoom("");
              setShowRoomForm(false);
              load();
            }}
          >
            Add room
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowRoomForm(false)}>
            Cancel
          </Button>
        </Card>
      ) : null}
      {showTrackForm ? (
        <Card className="mb-3 flex flex-wrap items-end gap-2 p-3" id="add-track-form">
          <Field label="New track name">
            <Input
              value={newTrack}
              onChange={(e) => setNewTrack(e.target.value)}
              placeholder="Community"
              aria-label="New track name"
            />
          </Field>
          <Button
            size="sm"
            disabled={!newTrack.trim()}
            onClick={async () => {
              const name = newTrack.trim();
              if (!name) return;
              await api.createAgendaTrack({ name });
              toast("Track added");
              setNewTrack("");
              setShowTrackForm(false);
              load();
            }}
          >
            Add track
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowTrackForm(false)}>
            Cancel
          </Button>
        </Card>
      ) : null}

      <Card className="mb-4 border-line p-4" id="ai-agenda">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><Badge tone="primary">AI Agenda · advisory</Badge><h2 className="mt-2 text-xl font-bold">Heuristic schedule assistant</h2><p className="text-sm text-mid">Deterministic demo heuristic only—not a model. It creates a persisted review draft and never changes the live schedule until you accept placements.</p></div><div className="flex gap-2"><Button onClick={async()=>{setBusy(true);try{await api.generateAgenda(constraints);toast("Reviewable agenda draft generated");loadAgenda()}catch(e:any){setErr(e.message)}finally{setBusy(false)}}} disabled={busy}>{agenda.length?"Regenerate draft":"Generate draft"}</Button>{agenda[0]?.status==="review"?<><Button variant="secondary" onClick={async()=>{await api.decideAgenda(agenda[0].id,"accept");toast("Accepted conflict-free placements through canonical schedule mutation");load();loadAgenda()}}>Accept all</Button><Button variant="outline" onClick={async()=>{await api.decideAgenda(agenda[0].id,"reject");toast("Proposal rejected; live schedule unchanged");loadAgenda()}}>Reject all</Button></>:null}</div></div>
        <div className="mt-3 flex flex-wrap gap-3">{Object.entries(constraints).map(([key,value])=><label key={key} className="text-xs font-semibold text-mid">{key.replace(/([A-Z])/g," $1")}<input className="ml-2 w-16 rounded border px-2 py-1" type="number" value={value} onChange={e=>setConstraints(x=>({...x,[key]:Number(e.target.value)}))}/></label>)}</div>
        {agenda[0]?<div className="mt-4"><p className="text-xs text-mid">Generation {agenda[0].generation} · {new Date(agenda[0].generatedAt).toLocaleString()} · provenance: {agenda[0].provenance}</p><div className="mt-2 grid gap-2 lg:grid-cols-2">{agenda[0].placements.map((p:any)=>{const s=session(p.sessionId),room=d?.rooms.find((r:any)=>r.id===p.slot.roomId);return <article key={p.id} className="rounded-[18px] border p-3"><div className="flex justify-between gap-2"><b>{s?.title||p.sessionId}</b><Badge tone={p.status==="accepted"?"ok":p.status==="conflict"?"danger":"primary"}>{p.status}</Badge></div><p className="mt-1 text-sm">{fmtDate(p.slot.startsAt)} · {fmtTime(p.slot.startsAt)} · {room?.name}</p><p className="mt-2 text-xs text-mid">Why: {p.rationale}</p>{p.conflicts?.length?<Notice tone="danger">{p.conflicts.join(" ")}</Notice>:null}{p.status==="proposed"?<div className="mt-2 flex gap-2"><Button size="sm" onClick={async()=>{try{await api.decideAgendaPlacement(agenda[0].id,p.id,"accept");toast("Placement applied through canonical conflict checks");load();loadAgenda()}catch(e:any){setErr(`AI proposal blocked: ${e.message}`);loadAgenda()}}}>Accept</Button><Button size="sm" variant="outline" onClick={async()=>{await api.decideAgendaPlacement(agenda[0].id,p.id,"reject");loadAgenda()}}>Reject</Button></div>:null}</article>})}</div>{!agenda[0].placements.length?<EmptyState title="No eligible unscheduled sessions" description="Accept a session or move one back to the pool, then regenerate."/>:null}</div>:null}
      </Card>

      {d?.warnings?.length ? (
        <Card className="mb-4 border-line bg-canvas p-3 text-sm text-ink">
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
          <p className="mt-1 text-xs text-mid">
            Accepted sessions needing a room. Use <b>Place session</b> to pick day, time and room, or drag a card onto a lane.
          </p>
          <div className="mt-3 space-y-2">
            {unscheduled.map((x: any) => (
              <article
                key={x.id}
                draggable
                onDragStart={() => setDrag(x.id)}
                className="cursor-grab rounded-[18px] border border-line bg-soft p-3 active:cursor-grabbing"
              >
                <Badge tone="primary">
                  {x.trackIds?.map((i: string) => d.tracks.find((t: any) => t.id === i)?.name).join(" · ")}
                </Badge>
                <div className="mt-1 text-sm font-semibold">{x.title}</div>
                <div className="text-xs text-mid">
                  {x.speakerIds?.map((i: string) => d.speakers.find((q: any) => q.id === i)?.name).join(", ")}
                </div>
                <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">Edit session speakers</summary><p className="mt-2"><a className="font-semibold text-ink underline" href={`/app/content?session=${encodeURIComponent(x.id)}`} aria-label={`Open full editor for ${x.title}`}>Full editor · title, abstract &amp; approval ↗</a></p><select multiple aria-label={`Edit speakers for ${x.title}`} className="mt-2 min-h-20 w-full rounded-[12px] border border-line p-2" value={x.speakerIds||[]} onChange={async e=>{await api.updateScheduleSession(x.id,{speakerIds:Array.from(e.target.selectedOptions).map(o=>o.value)});toast("Session speakers updated");load()}}>{(d.speakers||[]).map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></details>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    aria-label={`Place ${x.title}`}
                    data-testid={`place-${x.id}`}
                    onClick={() => openPlace(x.id, "place")}
                  >
                    Place session
                  </Button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1 md:hidden">
                  {(d.rooms || []).slice(0, 3).map((room: any) => (
                    <Button key={room.id} size="sm" variant="outline" onClick={() => move(x.id, room.id, hour, selectedDay)}>
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-mid">
            <span>
              {view} view · {programDays.length} program day{programDays.length === 1 ? "" : "s"} · focusing {activeDay?.label || selectedDay}
            </span>
            <span>version {d?.version}</span>
          </div>
          {(view === "day" || view === "week" || view === "room" || view === "track") ? (
            <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Program days">
              {programDays.map((day) => (
                <Button
                  key={day.id}
                  size="sm"
                  variant={selectedDay === day.id ? "dark" : "outline"}
                  aria-selected={selectedDay === day.id}
                  onClick={() => setSelectedDay(day.id)}
                >
                  {day.label}
                </Button>
              ))}
            </div>
          ) : null}

          {view === "list" ? (
            <div className="divide-y">
              {items.map((slot: any) => {
                const s = session(slot.sessionId);
                return (
                  <div key={slot.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <b>{s?.title}</b>
                      <div className="text-xs text-mid">
                        {fmtDate(slot.startsAt)} · {fmtTime(slot.startsAt)}–{fmtTime(slot.endsAt)} ·{" "}
                        {d.rooms.find((r: any) => r.id === slot.roomId)?.name}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {capacityWarning(s, d.rooms.find((r: any) => r.id === slot.roomId)) ? (
                        <Badge tone="warn">Capacity warning</Badge>
                      ) : null}
                      <Badge tone="ok">{formatStatus(s?.publishStatus || "published")}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Move ${s?.title || slot.sessionId}`}
                        data-testid={`move-${slot.sessionId}`}
                        onClick={() => openPlace(slot.sessionId, "move")}
                      >
                        Move
                      </Button>
                    </div>
                  </div>
                );
              })}
              {unscheduled.map((x: any) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <b>{x.title}</b>
                    <div className="text-xs text-ink-soft">Accepted · not on grid yet</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      aria-label={`Place ${x.title}`}
                      data-testid={`place-list-${x.id}`}
                      onClick={() => openPlace(x.id, "place")}
                    >
                      Place session
                    </Button>
                    {(d.rooms || []).map((room: any) => (
                      <Button key={room.id} size="sm" variant="secondary" onClick={() => move(x.id, room.id, hour, selectedDay)}>
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
              {programDays.map((day, idx) => {
                const daySlots = items.filter((slot: any) => zonedDayKey(slot.startsAt) === day.id);
                const isSeedDay = idx === 0 || daySlots.length > 0;
                return (
                  <section
                    key={day.id}
                    className="rounded-[18px] border border-line p-3"
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
                    <p className="text-[11px] text-mid">{day.dateLabel} · event timezone</p>
                    <div className="mt-2 min-h-28 rounded-lg border border-dashed border-line p-2">
                      {daySlots.length ? (
                        daySlots.map((slot: any) => {
                          const s = session(slot.sessionId);
                          return (
                            <div key={slot.id} className="mb-2 rounded-lg bg-soft p-2 text-xs">
                              <b className="text-sm">{s?.title}</b>
                              <div>
                                {fmtTime(slot.startsAt)} · {d.rooms.find((r: any) => r.id === slot.roomId)?.name}
                              </div>
                              {capacityWarning(s, d.rooms.find((r: any) => r.id === slot.roomId)) ? (
                                <Badge tone="warn">Capacity warning</Badge>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-1"
                                aria-label={`Move ${s?.title || slot.sessionId}`}
                                onClick={() => openPlace(slot.sessionId, "move")}
                              >
                                Move
                              </Button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex h-full min-h-24 flex-col justify-center text-center text-xs text-mid">
                          <p className="font-semibold text-mid">Open day</p>
                          <p className="mt-1">
                            Drop here to schedule onto{" "}
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
              {view === "day" ? (
                <p className="text-xs text-mid">
                  Placing onto <b>{activeDay?.dateLabel || selectedDay}</b> at {hour}:00 ({fmtTzLabel()}). Switch days with the tabs above.
                </p>
              ) : null}
              {(view === "track" ? trackLanes : roomLanes).map((lane: any) => (
                <section
                  key={lane.id}
                  className="rounded-[18px] border border-line p-3"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!drag) return;
                    const roomId = view === "track" ? d.rooms[0].id : lane.id;
                    move(drag, roomId, hour, selectedDay);
                    setDrag(null);
                  }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-bold">{lane.name}</h3>
                    <span className="text-[11px] text-mid">Drop → {hour}:00 · {fmtTzLabel()}</span>
                  </div>
                  <div className="min-h-16 rounded-lg border border-dashed border-line bg-soft/50 p-2">
                    {items
                      .filter((slot: any) => {
                        const s = session(slot.sessionId);
                        const onDay = view !== "day" || zonedDayKey(slot.startsAt) === selectedDay;
                        if (!onDay) return false;
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
                            <div className="text-[11px] font-bold text-mid">
                              {fmtTime(slot.startsAt)}–{fmtTime(slot.endsAt)}
                            </div>
                            <div className="text-sm font-semibold">{s?.title}</div>
                            <div className="text-xs text-mid">
                              {s?.speakerIds
                                ?.map((i: string) => d.speakers.find((q: any) => q.id === i)?.name)
                                .join(", ")}
                            </div>
                            {(() => {
                              const warning = capacityWarning(s, d.rooms.find((r: any) => r.id === slot.roomId));
                              return warning ? (
                                <div className="mt-1" title={warning} data-testid={`capacity-warning-${slot.sessionId}`}>
                                  <Badge tone="warn">Capacity warning</Badge>
                                  <p className="mt-1 text-[11px] text-mid">{warning}</p>
                                </div>
                              ) : null;
                            })()}
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              aria-label={`Move ${s?.title || slot.sessionId}`}
                              data-testid={`move-day-${slot.sessionId}`}
                              onClick={() => openPlace(slot.sessionId, "move")}
                            >
                              Move
                            </Button>
                            <a
                              className="ml-2 text-xs font-semibold text-ink underline"
                              href={`/app/content?session=${encodeURIComponent(slot.sessionId)}`}
                              aria-label={`Open full editor for ${s?.title || slot.sessionId}`}
                            >
                              Full editor ↗
                            </a>
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
        open={!!place}
        onClose={() => {
          setPlace(null);
          setPlaceBusy(false);
        }}
        title={place?.mode === "move" ? `Move ${place?.title}` : `Place ${place?.title || "session"}`}
        description="Choose a day, time and room. Placement goes through the canonical schedule check — hard room/speaker conflicts are refused."
        footer={
          <>
            {/* Always enabled: an in-flight save must never trap the organizer. */}
            <Button
              variant="outline"
              onClick={() => {
                setPlace(null);
                setPlaceBusy(false);
                setPlaceError("");
              }}
            >
              Cancel
            </Button>
            {placeWarnings.length ? (
              <Button
                variant="secondary"
                disabled={placeBusy}
                aria-label="Place anyway despite warnings"
                onClick={() => void submitPlace(placeWarnings.map((w: any) => w.id))}
              >
                Place anyway
              </Button>
            ) : null}
            <Button
              variant="dark"
              disabled={placeBusy || !place?.roomId}
              data-testid="confirm-place"
              aria-label={place?.mode === "move" ? `Confirm move of ${place?.title}` : `Confirm placement of ${place?.title}`}
              onClick={() => void submitPlace([])}
            >
              {placeBusy ? "Saving…" : place?.mode === "move" ? "Move session" : "Place session"}
            </Button>
          </>
        }
      >
        {place ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Day">
                <select
                  className="h-10 w-full rounded-[18px] border border-line bg-white px-3 text-sm"
                  aria-label="Day"
                  value={place.day}
                  onChange={(e) => setPlace({ ...place, day: e.target.value })}
                >
                  {programDays.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.label} · {day.dateLabel}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Start time (${fmtTzLabel()})`}>
                <select
                  className="h-10 w-full rounded-[18px] border border-line bg-white px-3 text-sm"
                  aria-label="Start time"
                  value={place.time}
                  onChange={(e) => setPlace({ ...place, time: e.target.value })}
                >
                  {[
                    ...new Set([
                      ...timeOptions(constraints.dayStartHour, constraints.dayEndHour, constraints.slotMinutes),
                      place.time,
                    ]),
                  ]
                    .filter(Boolean)
                    .sort()
                    .map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Room">
                <select
                  className="h-10 w-full rounded-[18px] border border-line bg-white px-3 text-sm"
                  aria-label="Room"
                  value={place.roomId}
                  onChange={(e) => setPlace({ ...place, roomId: e.target.value })}
                >
                  {(d?.rooms || []).map((room: any) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                      {room.capacity ? ` · seats ${room.capacity}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-xs text-mid" data-testid="place-summary">
              Duration <b className="text-ink">{place.durationMinutes} minutes</b> · ends{" "}
              {(() => {
                // Never throw during render: a malformed day/time must show a hint, not
                // blank the dialog behind a stuck "Saving…".
                try {
                  return fmtTime(placeSlot(place).endsAt);
                } catch {
                  return "—";
                }
              })()}{" "}
              · slot interval {constraints.slotMinutes} min · times are {fmtTzLabel()}.
            </p>
            {placeError ? (
              <Notice tone={placeWarnings.length && !placeConflicts.length ? "warn" : "danger"}>
                <span className="block font-semibold" data-testid="place-error">
                  {placeError}
                </span>
                {placeConflicts.length ? (
                  <ul className="mt-1 list-disc pl-5" data-testid="place-conflicts">
                    {placeConflicts.map((c: any) => (
                      <li key={c.id}>{conflictHeadline(c)}</li>
                    ))}
                  </ul>
                ) : null}
                {placeWarnings.length ? (
                  <ul className="mt-1 list-disc pl-5" data-testid="place-warnings">
                    {placeWarnings.map((w: any) => (
                      <li key={w.id}>{w.message}</li>
                    ))}
                  </ul>
                ) : null}
                {placeConflicts.length ? (
                  <span className="mt-1 block text-xs">
                    Pick a different time or room above, then submit again — nothing was changed.
                  </span>
                ) : null}
              </Notice>
            ) : null}
          </div>
        ) : null}
      </Dialog>

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
            <ul className="list-disc space-y-1 pl-5 text-ink">
              {pending.warnings.map((w) => (
                <li key={w.id}>{w.message}</li>
              ))}
            </ul>
            {pending.alternatives?.length ? (
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-mid">
                  Suggested alternatives
                </div>
                <div className="space-y-2">
                  {pending.alternatives.slice(0, 5).map((alt: any, i: number) => (
                    <button
                      key={i}
                      type="button"
                      className="flex w-full items-center justify-between rounded-[18px] border border-line px-3 py-2 text-left hover:border-ink/20"
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
                      <span className="text-xs font-semibold text-ink">Use</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-mid">No alternate slots returned by the validator.</p>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
