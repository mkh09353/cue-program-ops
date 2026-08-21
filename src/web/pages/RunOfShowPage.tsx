// `React` is imported by name (as in components/ui.tsx) so this page also renders
// under the classic JSX runtime used by the node tests.
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, getActiveEvent, getEventCatalog, subscribeData } from "../lib/api";
import { EVENT_TZ, eventDayKeys, fmtTime, fmtTzLabel } from "../lib/utils";
import { zonedDayKey } from "../../timezone";
import { Button, Notice, PageHeader, Select, Spinner } from "../components/ui";

/**
 * Run of show — the printable operating document for show callers.
 *
 * Everything is derived from the canonical schedule payload (api.schedule()), so a
 * placement made on /app/schedule is on the printed sheet after the next refetch.
 * There is no second store and no run-of-show specific endpoint.
 *
 * Layout is one SHEET per selected day+room: a paper block on screen, a fresh page
 * in print. Print rules live in src/web/style.css under the .ros-* hooks.
 */

/** Sessions that belong on an operating document. */
export function isProgrammable(session: any): boolean {
  if (!session) return false;
  if (session.cancelled) return false;
  const status = String(session.status || "").toLowerCase();
  return ["accepted", "approved", "scheduled", "published"].includes(status);
}

/**
 * Optional production notes, if the payload ever carries them.
 *
 * The schedule API does NOT expose a notes field today (verified against a live
 * response). `abstract` is deliberately NOT used: an abstract is speaker marketing
 * copy, not an AV cue. Until a notes field exists the cell prints blank and ruled
 * so a show caller can write in it.
 */
export function sessionNotes(session: any): string {
  for (const key of ["notes", "avNotes", "productionNotes", "runOfShowNotes", "operationalNotes"]) {
    const value = session?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** "Monday, October 12" in the EVENT's timezone. */
export function dayLabel(dayKey: string, timeZone: string): string {
  try {
    // Noon UTC anchor keeps the civil date stable across DST and offset flips.
    const anchor = new Date(`${dayKey}T12:00:00.000Z`);
    // An unparseable key formats as the literal string "Invalid Date", which must
    // never reach a printed sheet header.
    if (Number.isNaN(anchor.getTime())) return dayKey;
    return anchor.toLocaleDateString("en-US", {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dayKey;
  }
}

/** Event slug for the printed footer, never hardcoded. */
export function resolveEventSlug(schedule: any): string {
  const active = getActiveEvent();
  if (active?.slug) return active.slug;
  const fromCatalog = getEventCatalog().find((e) => e.id === (schedule?.event?.id || active?.id));
  if (fromCatalog?.slug) return fromCatalog.slug;
  const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // The PAYLOAD identifies the event these sheets describe, so it outranks the
  // active-event name: printing another event's slug in the footer would be worse
  // than printing a raw id.
  const name = String(schedule?.event?.name || "").trim();
  if (name) return slugify(name);
  const id = String(schedule?.event?.id || active?.id || "").trim();
  if (id) return id;
  const activeName = String(active?.name || "").trim();
  return activeName ? slugify(activeName) : "event";
}

export type SheetRow = {
  slotId: string;
  sessionId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  speakers: string;
  tracks: string;
  notes: string;
};

export type Sheet = { id: string; dayKey: string; dayLabel: string; roomId: string; roomName: string; rows: SheetRow[] };

/** Ordered day keys: the event's own span first, then any placement outside it. */
export function orderedDayKeys(schedule: any, timeZone: string): string[] {
  const span = eventDayKeys(schedule?.event?.startsAt || "", schedule?.event?.endsAt || "", timeZone);
  const placed = (schedule?.slots || []).map((s: any) => zonedDayKey(s.startsAt, timeZone));
  const out: string[] = [];
  for (const key of [...span, ...placed]) if (key && !out.includes(key)) out.push(key);
  return out.sort();
}

/**
 * Chronological day → room sheets. Rooms keep the canonical schedule order so the
 * printed pack matches the board; a slot in an unknown room still gets a sheet.
 */
export function buildSheets(schedule: any, timeZone: string): Sheet[] {
  const sessions = new Map<string, any>((schedule?.sessions || []).map((s: any) => [s.id, s]));
  const speakerNames = new Map<string, string>(
    (schedule?.speakers || []).map((s: any) => [s.id, String(s.name || "").trim()]),
  );
  const trackNames = new Map<string, string>(
    (schedule?.tracks || []).map((t: any) => [t.id, String(t.name || "").trim()]),
  );
  const rooms: any[] = schedule?.rooms || [];
  const roomOrder = new Map<string, number>(rooms.map((r: any, i: number) => [r.id, i]));

  const sheets = new Map<string, Sheet>();
  for (const slot of schedule?.slots || []) {
    const session = sessions.get(slot.sessionId);
    if (!isProgrammable(session)) continue;
    const dayKey = zonedDayKey(slot.startsAt, timeZone);
    const room = rooms.find((r: any) => r.id === slot.roomId);
    const id = `${dayKey}__${slot.roomId}`;
    if (!sheets.has(id)) {
      sheets.set(id, {
        id,
        dayKey,
        dayLabel: dayLabel(dayKey, timeZone),
        roomId: slot.roomId,
        // A room deleted after placement must not print as "room-main".
        roomName: room?.name || "Unassigned room",
        rows: [],
      });
    }
    // A speaker id with no roster record must never print raw.
    const speakers = (session?.speakerIds || [])
      .map((id: string) => speakerNames.get(id) || "Unnamed speaker")
      .filter(Boolean);
    const tracks = (session?.trackIds || [])
      .map((id: string) => trackNames.get(id) || "")
      .filter(Boolean);
    sheets.get(id)!.rows.push({
      slotId: slot.id,
      sessionId: slot.sessionId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      title: session?.title || "Untitled session",
      speakers: speakers.length ? speakers.join(", ") : "—",
      tracks: tracks.length ? tracks.join(" · ") : "—",
      notes: sessionNotes(session),
    });
  }

  const dayOrder = orderedDayKeys(schedule, timeZone);
  const dayRank = (key: string) => {
    const i = dayOrder.indexOf(key);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...sheets.values()]
    .map((sheet) => ({
      ...sheet,
      rows: sheet.rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .sort(
      (a, b) =>
        dayRank(a.dayKey) - dayRank(b.dayKey) ||
        a.dayKey.localeCompare(b.dayKey) ||
        (roomOrder.get(a.roomId) ?? Number.MAX_SAFE_INTEGER) - (roomOrder.get(b.roomId) ?? Number.MAX_SAFE_INTEGER) ||
        a.roomName.localeCompare(b.roomName),
    );
}

/**
 * Accepted-but-unplaced sessions.
 *
 * Mirrors the single definition already used by SchedulePage: the server's
 * UNSCHEDULED_ACCEPTED warnings, falling back to the server predicate only when a
 * payload carries no warnings. A second local rule would drift.
 */
export function unplacedSessions(schedule: any): any[] {
  const placed = new Set((schedule?.slots || []).map((s: any) => s.sessionId));
  const warned = Array.isArray(schedule?.warnings)
    ? new Set(
        schedule.warnings
          .filter((w: any) => w.code === "UNSCHEDULED_ACCEPTED")
          .flatMap((w: any) => w.relatedIds || []),
      )
    : null;
  return (schedule?.sessions || []).filter((s: any) =>
    placed.has(s.id) ? false : warned ? warned.has(s.id) : s.status === "accepted" && !s.cancelled,
  );
}

/**
 * A selection that no longer exists in the payload collapses back to "all".
 *
 * Without this, switching events left `room` pinned to a room id from the previous
 * event: the <select> fell back to displaying "All rooms" (its option was gone)
 * while the filter still excluded everything, so a populated event rendered zero
 * sheets under a control that claimed no filter was applied.
 */
export function clampFilter(value: string, allowed: string[]): string {
  return value === "all" || allowed.includes(value) ? value : "all";
}

/**
 * Screen copy for what a Print will actually produce.
 *
 * "Not yet placed" is a required FINAL sheet and is deliberately not filtered by
 * day/room (it has neither), so the page count has to name it explicitly rather
 * than let the sheet count silently disagree with the printed pack.
 */
export function printSummary(sheetCount: number, sessionCount: number, unplacedCount: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const pages = sheetCount + (unplacedCount ? 1 : 0);
  const parts = [plural(sheetCount, "day sheet"), plural(sessionCount, "placed session")];
  if (unplacedCount) parts.push(`plus 1 “Not yet placed” sheet (${plural(unplacedCount, "session")})`);
  parts.push(`${plural(pages, "page")} total`);
  return parts.join(" · ");
}

export function RunOfShowPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState<Date>(() => new Date());
  const [day, setDay] = useState("all");
  const [room, setRoom] = useState("all");

  useEffect(() => {
    const load = () =>
      api
        .schedule()
        .then((sched) => {
          setD(sched);
          setGeneratedAt(new Date());
          setErr("");
        })
        .catch((e) => setErr(e?.message || "Could not load the schedule."))
        .finally(() => setLoading(false));
    load();
    // Refetches on any mutation AND on an event switch (setActiveEventId bumps data).
    return subscribeData(load);
  }, []);

  const timeZone = d?.event?.timezone || EVENT_TZ;
  const sheets = useMemo(() => (d ? buildSheets(d, timeZone) : []), [d, timeZone]);
  const unplaced = useMemo(() => (d ? unplacedSessions(d) : []), [d]);
  const eventName = d?.event?.name || getActiveEvent().name;
  const slug = d ? resolveEventSlug(d) : "";
  const stamp = generatedAt.toLocaleString("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const dayKeys = useMemo(() => [...new Set(sheets.map((s) => s.dayKey))], [sheets]);
  const roomOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const sheet of sheets) if (!seen.has(sheet.roomId)) seen.set(sheet.roomId, sheet.roomName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [sheets]);

  // Switching events resets the filters. Keyed on the payload's event id, and it
  // only fires when that id actually CHANGES, so a routine refetch (a placement on
  // another tab) never yanks the organizer's selection back to "all".
  const eventId = d?.event?.id ? String(d.event.id) : "";
  const seenEventId = useRef<string>("");
  useEffect(() => {
    if (!eventId) return;
    if (seenEventId.current && seenEventId.current !== eventId) {
      setDay("all");
      setRoom("all");
    }
    seenEventId.current = eventId;
  }, [eventId]);

  // Belt and braces: clamp during render so the <select> value and the filter can
  // never disagree, even on the frame between new data and the reset effect.
  const activeDay = clampFilter(day, dayKeys);
  const activeRoom = clampFilter(
    room,
    roomOptions.map((r) => r.id),
  );

  const visible = sheets.filter(
    (s) => (activeDay === "all" || s.dayKey === activeDay) && (activeRoom === "all" || s.roomId === activeRoom),
  );
  const placedCount = visible.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div data-testid="run-of-show-page" className="ros-page">
      <div className="ros-screen-only">
        <PageHeader
          eyebrow="Schedule"
          title="Run of show"
          description={`Printable day-by-room operating sheets for ${eventName}. Times are ${fmtTzLabel(timeZone)} event time.`}
          actions={
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/app/schedule">← Back to schedule</Link>
              </Button>
              <Button
                size="sm"
                onClick={() => window.print()}
                data-testid="run-of-show-print"
                aria-label="Print the run of show"
              >
                Print
              </Button>
            </>
          }
        />

        {err ? <Notice tone="danger" onClose={() => setErr("")}>{err}</Notice> : null}

        <div className="mb-6 flex flex-wrap items-end gap-3" data-testid="run-of-show-controls">
          <div>
            <label htmlFor="ros-day" className="mb-1 block text-[12px] font-medium uppercase tracking-[0.18em] text-mid">
              Day
            </label>
            <Select
              id="ros-day"
              aria-label="Filter sheets by day"
              data-testid="run-of-show-day"
              className="w-56"
              value={activeDay}
              onChange={(e) => setDay(e.target.value)}
            >
              <option value="all">All days</option>
              {dayKeys.map((key) => (
                <option key={key} value={key}>
                  {dayLabel(key, timeZone)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="ros-room" className="mb-1 block text-[12px] font-medium uppercase tracking-[0.18em] text-mid">
              Room
            </label>
            <Select
              id="ros-room"
              aria-label="Filter sheets by room"
              data-testid="run-of-show-room"
              className="w-56"
              value={activeRoom}
              onChange={(e) => setRoom(e.target.value)}
            >
              <option value="all">All rooms</option>
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <p className="pb-2 text-xs text-mid" data-testid="run-of-show-count">
            {printSummary(visible.length, placedCount, unplaced.length)}
          </p>
        </div>

        {loading && !d ? <Spinner /> : null}
      </div>

      {/* Only when NOTHING will print: the unplaced sheet prints regardless of filters. */}
      {!loading && d && !visible.length && !unplaced.length ? (
        <div className="ros-screen-only">
          <Notice tone="info">
            Nothing to print for this selection. Place accepted sessions on the{" "}
            <Link className="font-semibold underline" to="/app/schedule">
              schedule board
            </Link>{" "}
            first, or widen the day/room filters.
          </Notice>
        </div>
      ) : null}

      {!loading && d && !visible.length && unplaced.length ? (
        <div className="ros-screen-only">
          <Notice tone="info">
            No day sheets match this filter — only the “Not yet placed” sheet will print. Widen the day or room
            filter to include placed sessions.
          </Notice>
        </div>
      ) : null}

      {visible.map((sheet) => (
        <section
          key={sheet.id}
          className="ros-sheet"
          data-testid={`run-of-show-sheet-${sheet.id}`}
          aria-label={`Run of show — ${sheet.dayLabel}, ${sheet.roomName}`}
        >
          <header className="ros-sheet-head">
            <div>
              <p className="ros-eyebrow">{eventName}</p>
              <h2 className="ros-title">{sheet.dayLabel}</h2>
              <p className="ros-room">{sheet.roomName}</p>
            </div>
            <div className="ros-meta">
              <p className="ros-kicker">Run of show</p>
              <p>Generated {stamp}</p>
              <p>All times {fmtTzLabel(timeZone)}</p>
            </div>
          </header>

          <table className="ros-table" data-testid={`run-of-show-table-${sheet.id}`}>
            <caption className="sr-only">
              Run of show for {sheet.dayLabel} in {sheet.roomName}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="ros-col-time">Time</th>
                <th scope="col">Session</th>
                <th scope="col">Speakers</th>
                <th scope="col">Track</th>
                <th scope="col" className="ros-col-notes">Notes / AV</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row) => (
                <tr key={row.slotId} className="ros-row" data-testid={`run-of-show-row-${row.sessionId}`}>
                  <td className="ros-col-time">
                    {fmtTime(row.startsAt, timeZone)}–{fmtTime(row.endsAt, timeZone)}
                  </td>
                  <td className="ros-strong">{row.title}</td>
                  <td>{row.speakers}</td>
                  <td>{row.tracks}</td>
                  {/* Empty on purpose: a ruled cell the show caller writes in. */}
                  <td className="ros-notes">{row.notes || <span className="ros-blank" aria-hidden />}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <footer className="ros-foot">
            <span>{slug}</span>
            <span>
              {sheet.dayLabel} · {sheet.roomName}
            </span>
          </footer>
        </section>
      ))}

      {unplaced.length ? (
        <section className="ros-sheet" data-testid="run-of-show-unplaced" aria-label="Accepted sessions not yet placed">
          <header className="ros-sheet-head">
            <div>
              <p className="ros-eyebrow">{eventName}</p>
              <h2 className="ros-title">Not yet placed</h2>
              <p className="ros-room">
                {unplaced.length} accepted session{unplaced.length === 1 ? "" : "s"} without a room and time
              </p>
            </div>
            <div className="ros-meta">
              <p className="ros-kicker">Run of show</p>
              <p>Generated {stamp}</p>
            </div>
          </header>

          <table className="ros-table" data-testid="run-of-show-unplaced-table">
            <caption className="sr-only">Accepted sessions not yet placed on the schedule</caption>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Speakers</th>
                <th scope="col">Track</th>
                <th scope="col" className="ros-col-time">Length</th>
                <th scope="col" className="ros-col-notes">Notes / AV</th>
              </tr>
            </thead>
            <tbody>
              {unplaced.map((session: any) => {
                const speakers = (session.speakerIds || [])
                  .map((id: string) => (d?.speakers || []).find((s: any) => s.id === id)?.name || "Unnamed speaker")
                  .filter(Boolean);
                const tracks = (session.trackIds || [])
                  .map((id: string) => (d?.tracks || []).find((t: any) => t.id === id)?.name || "")
                  .filter(Boolean);
                return (
                  <tr key={session.id} className="ros-row" data-testid={`run-of-show-unplaced-row-${session.id}`}>
                    <td className="ros-strong">{session.title || "Untitled session"}</td>
                    <td>{speakers.length ? speakers.join(", ") : "—"}</td>
                    <td>{tracks.length ? tracks.join(" · ") : "—"}</td>
                    <td className="ros-col-time">
                      {session.durationMinutes ? `${session.durationMinutes} min` : "—"}
                    </td>
                    <td className="ros-notes">
                      {sessionNotes(session) || <span className="ros-blank" aria-hidden />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <footer className="ros-foot">
            <span>{slug}</span>
            <span>Not yet placed</span>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
