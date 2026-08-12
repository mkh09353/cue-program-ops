/**
 * CUE CLI command implementations.
 *
 * Every command is registered with usage + option help so that `cue help` and
 * `cue <group> --help` are sufficient for an agent to operate the tool without
 * reading this source.
 */
import { readFileSync } from "node:fs";
import {
  ApiError,
  api,
  data,
  dayOf,
  emit,
  flagBool,
  flagList,
  flagStr,
  heading,
  inZone,
  out,
  parseFields,
  printJson,
  printKeyValues,
  printTable,
  toInstant,
  type Config,
  type Flags,
} from "./lib.js";

export interface CommandContext {
  config: Config;
  words: string[];
  flags: Flags;
}

export interface Command {
  name: string;
  summary: string;
  usage: string[];
  options?: string[];
  run(ctx: CommandContext): Promise<void>;
}

const need = (value: string, message: string) => {
  if (!value) throw new ApiError(message, 0);
  return value;
};

const eventPath = (config: Config, suffix: string) => `/api/events/${encodeURIComponent(config.event)}${suffix}`;

/** Event metadata (timezone, slug) used for time formatting and public links. */
async function eventInfo(config: Config) {
  const events = data<any[]>(await api(config, "/api/events"));
  const match = events.find((e) => e.id === config.event) || events[0];
  return match || { id: config.event, name: config.event, slug: "", timezone: "UTC" };
}

const speakerNames = (session: any, schedule: any): string =>
  (session.speakerIds || [])
    .map((id: string) => schedule.speakers?.find((s: any) => s.id === id)?.name || id)
    .join(", ");

// —— events ————————————————————————————————————————————————

const events: Command = {
  name: "events",
  summary: "List, create and switch the active event.",
  usage: [
    "cue events list",
    "cue events create --name 'DevFlow Conf 2027' [--slug devflow-conf-2027] [--start 2027-05-12] [--end 2027-05-14] [--venue 'Moscone West'] [--rooms 'Room 2A,Room 2B'] [--tracks 'Platform,DX']",
    "cue events switch <eventId>",
  ],
  options: [
    "--name      event name (required for create)",
    "--slug      URL slug; derived from the name when omitted, auto-uniquified if taken",
    "--start/--end  dates (YYYY-MM-DD or any parseable date); sensible defaults when omitted",
    "--venue, --rooms, --tracks  optional; rooms/tracks are comma separated",
  ],
  async run({ config, words, flags }) {
    const action = words[0] || "list";
    if (action === "list") {
      const rows = data<any[]>(await api(config, "/api/events"));
      emit(config, rows, () =>
        printTable(
          rows.map((e) => ({ id: e.id, name: e.name, slug: e.slug, timezone: e.timezone, venue: e.venue, active: e.id === config.event ? "*" : "" })),
          ["active", "id", "name", "slug", "timezone", "venue"],
        ),
      );
      return;
    }
    if (action === "create") {
      const payload = {
        name: need(flagStr(flags, "name"), "events create needs --name"),
        slug: flagStr(flags, "slug"),
        startsAt: flagStr(flags, "start"),
        endsAt: flagStr(flags, "end"),
        timezone: flagStr(flags, "timezone"),
        venue: flagStr(flags, "venue"),
        rooms: flagStr(flags, "rooms"),
        tracks: flagStr(flags, "tracks"),
      };
      const response = await api(config, "/api/events", { method: "POST", body: payload });
      const record = data(response);
      emit(config, response, () => {
        out(`Created ${record.name} (${record.id})`);
        if ((response as any).slugAdjusted) out(`Slug "${(response as any).requestedSlug}" was taken; using "${record.slug}".`);
        out(`Use it with:  cue --event ${record.id} overview`);
      });
      return;
    }
    if (action === "switch") {
      const target = need(words[1] || "", "events switch needs an event id");
      const rows = data<any[]>(await api(config, "/api/events"));
      const match = rows.find((e) => e.id === target || e.slug === target);
      if (!match) throw new ApiError(`event not found: ${target}`, 404);
      emit(config, match, () => {
        out(`Active event for future commands: ${match.name} (${match.id})`);
        out(`Export it:  export CUE_EVENT=${match.id}`);
      });
      return;
    }
    throw new ApiError(`unknown events action "${action}" (expected list, create or switch)`, 0);
  },
};

// —— overview ——————————————————————————————————————————————

const overview: Command = {
  name: "overview",
  summary: "One-shot dump of the whole program state. Run this first.",
  usage: ["cue overview [--json]"],
  async run({ config }) {
    const settled = await Promise.allSettled([
      api(config, eventPath(config, "/bootstrap")),
      api(config, eventPath(config, "/submissions")),
      api(config, eventPath(config, "/review-progress")),
      api(config, eventPath(config, "/schedule")),
      api(config, eventPath(config, "/speakers/progress")),
      api(config, eventPath(config, "/comms/log")),
      api(config, eventPath(config, "/forms/form-cfp")),
    ]);
    // Secondary sections degrade to warnings, but a bootstrap failure means the
    // event itself is unreachable - that is fatal, not a partial overview.
    if (settled[0]!.status === "rejected") throw (settled[0] as PromiseRejectedResult).reason;
    const value = (i: number) => (settled[i]!.status === "fulfilled" ? data((settled[i] as PromiseFulfilledResult<any>).value) : null);
    const boot = value(0) || {};
    const submissions: any[] = value(1) || [];
    const reviewProgress: any[] = value(2) || [];
    const schedule = settled[3]!.status === "fulfilled" ? (settled[3] as PromiseFulfilledResult<any>).value : { sessions: [], slots: [], rooms: [] };
    const speakerProgress = value(4) || { rows: [] };
    const comms: any[] = value(5) || [];
    const form = value(6) || {};
    const timezone = boot.event?.timezone || "UTC";

    const byStatus: Record<string, number> = {};
    for (const s of submissions) byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    const placed = new Set((schedule.slots || []).map((slot: any) => slot.sessionId));
    const unscheduled = (schedule.sessions || []).filter((s: any) => !placed.has(s.id) && ["accepted", "published"].includes(s.status));
    const agenda = (schedule.slots || [])
      .map((slot: any) => {
        const session = (schedule.sessions || []).find((s: any) => s.id === slot.sessionId);
        return {
          day: dayOf(slot.startsAt, timezone),
          time: inZone(slot.startsAt, timezone).slice(11),
          room: (schedule.rooms || []).find((r: any) => r.id === slot.roomId)?.name || slot.roomId,
          title: session?.title || slot.sessionId,
          speakers: session ? speakerNames(session, schedule) : "",
        };
      })
      .sort((a: any, b: any) => `${a.day}${a.time}`.localeCompare(`${b.day}${b.time}`));

    const payload = {
      event: boot.event,
      cfp: { status: form.status, closeAt: form.closeAt, fields: (form.fields || []).length },
      submissions: { total: submissions.length, byStatus },
      reviewProgress,
      unscheduled: unscheduled.map((s: any) => ({ id: s.id, title: s.title, durationMinutes: s.durationMinutes })),
      agenda,
      speakers: (speakerProgress.rows || []).map((r: any) => ({ name: r.name, completed: r.completed, total: r.total, percent: r.percent, status: r.workflowStatus })),
      comms: comms.slice(0, 5).map((c: any) => ({ at: c.createdAt, kind: c.kind, subject: c.subject, status: c.status })),
      warnings: settled.map((s, i) => (s.status === "rejected" ? `section ${i} unavailable: ${(s.reason as Error).message}` : null)).filter(Boolean),
    };

    emit(config, payload, () => {
      heading("event");
      printKeyValues({
        name: boot.event?.name,
        id: boot.event?.id,
        slug: boot.event?.slug,
        timezone,
        dates: `${dayOf(boot.event?.startsAt, timezone)} → ${dayOf(boot.event?.endsAt, timezone)}`,
        venue: boot.event?.location,
      });
      heading("cfp");
      printKeyValues({ status: form.status, closes: inZone(form.closeAt, timezone), fields: (form.fields || []).length });
      heading("submissions");
      printKeyValues({ total: submissions.length, ...byStatus });
      heading("review progress");
      printTable(
        reviewProgress.map((r: any) => ({ reviewer: r.reviewer?.name || r.reviewerId, round: r.roundName, assigned: r.assigned, completed: r.completed, percent: `${r.percent}%` })),
      );
      heading("accepted, not yet scheduled");
      printTable(unscheduled.map((s: any) => ({ id: s.id, title: s.title, minutes: s.durationMinutes })));
      heading("agenda");
      printTable(agenda, ["day", "time", "room", "title", "speakers"]);
      heading("speaker readiness");
      printTable(payload.speakers.map((s: any) => ({ ...s, percent: `${s.percent ?? 0}%` })));
      heading("recent comms");
      printTable(payload.comms);
      if (payload.warnings.length) {
        heading("warnings");
        for (const warning of payload.warnings) out(String(warning));
      }
    });
  },
};

// —— submissions ————————————————————————————————————————————

const submissions: Command = {
  name: "submissions",
  summary: "List, inspect and decide CFP submissions.",
  usage: [
    "cue submissions list [--filter pending|accepted|rejected|unscored]",
    "cue submissions show <submissionId>",
    "cue submissions decide <submissionId> --accept|--reject [--feedback 'notes for the speaker'] [--no-comms]",
  ],
  options: [
    "--accept / --reject   the decision to apply (exactly one)",
    "--feedback            committee feedback: emailed to the speaker and shown in their portal",
    "--no-comms            apply the decision without sending email",
  ],
  async run({ config, words, flags }) {
    const action = words[0] || "list";
    if (action === "list") {
      const filter = flagStr(flags, "filter");
      const rows = data<any[]>(await api(config, eventPath(config, `/submissions${filter ? `?filter=${encodeURIComponent(filter)}` : ""}`)));
      emit(config, rows, () =>
        printTable(rows.map((s) => ({ id: s.id, title: s.title, speaker: s.name, track: s.category, status: s.status, board: s.reviewBoard })), [
          "id", "title", "speaker", "track", "status", "board",
        ]),
      );
      return;
    }
    if (action === "show") {
      const id = need(words[1] || "", "submissions show needs a submission id");
      const row = data(await api(config, eventPath(config, `/submissions/${encodeURIComponent(id)}`)));
      emit(config, row, () => {
        printKeyValues({
          id: row.id, title: row.title, speaker: `${row.name} <${row.email}>`, track: row.category,
          format: row.format, status: row.status, board: row.reviewBoard, feedback: row.decisionFeedback || "(none)",
        });
        out();
        out(row.abstract || "");
        if (row.additionalSpeakers?.length) {
          heading("co-speakers");
          printTable(row.additionalSpeakers.map((p: any) => ({ name: p.name, email: p.email, role: p.role })));
        }
        if (row.reviews?.length) {
          heading("reviews");
          printTable(row.reviews.map((r: any) => ({ reviewer: r.reviewerName || r.reviewerId, round: r.roundName || r.round, status: r.status, average: r.average })));
        }
      });
      return;
    }
    if (action === "decide") {
      const id = need(words[1] || "", "submissions decide needs a submission id");
      const accept = flagBool(flags, "accept");
      const reject = flagBool(flags, "reject");
      if (accept === reject) throw new ApiError("submissions decide needs exactly one of --accept or --reject", 0);
      const body = {
        nextStatus: accept ? "accepted" : "rejected",
        sendComms: !flagBool(flags, "no-comms"),
        createTasks: accept,
        feedback: flagStr(flags, "feedback"),
      };
      const response = data(await api(config, eventPath(config, `/submissions/${encodeURIComponent(id)}/decision`), { method: "POST", body }));
      emit(config, response, () => {
        out(`${response.submission.title} → ${response.submission.status}`);
        if (response.submission.decisionFeedback) out(`feedback: ${response.submission.decisionFeedback}`);
        if (response.communication) out(`email: ${response.communication.subject} (${response.communication.status})`);
        if (response.tasks?.length) out(`onboarding tasks created: ${response.tasks.length}`);
      });
      return;
    }
    throw new ApiError(`unknown submissions action "${action}" (expected list, show or decide)`, 0);
  },
};

// —— reviews ————————————————————————————————————————————————

const reviews: Command = {
  name: "reviews",
  summary: "Review rounds, assignments, reviewer queue, progress and results.",
  usage: [
    "cue reviews rounds [--create 'Initial Review'] [--blind]",
    "cue reviews assign --round <roundId> --reviewer <personaId> --submissions id1,id2",
    "cue reviews queue --persona <reviewerPersonaId>",
    "cue reviews progress [--round <roundId>]",
    "cue reviews results [--round <roundId>]",
    "cue reviews export [--round <roundId>]   # CSV to stdout",
  ],
  async run({ config, words, flags }) {
    const action = words[0] || "rounds";
    const round = flagStr(flags, "round");
    const roundQuery = round ? `?roundId=${encodeURIComponent(round)}` : "";
    if (action === "rounds") {
      const create = flagStr(flags, "create");
      if (create) {
        const made = data(await api(config, eventPath(config, "/review-rounds"), {
          method: "POST",
          body: { name: create, status: "open", blind: flagBool(flags, "blind"), reviewerIds: [], criteria: [] },
        }));
        emit(config, made, () => out(`Created round ${made.name} (${made.id})`));
        return;
      }
      const rows = data<any[]>(await api(config, eventPath(config, "/review-rounds")));
      emit(config, rows, () =>
        printTable(rows.map((r) => ({ id: r.id, name: r.name, status: r.status, blind: r.blind ? "yes" : "no", reviewers: (r.reviewerIds || []).length, lastAssignment: r.lastAssignmentAt || "" }))),
      );
      return;
    }
    if (action === "assign") {
      const body = {
        roundId: need(round, "reviews assign needs --round"),
        reviewerId: need(flagStr(flags, "reviewer"), "reviews assign needs --reviewer"),
        submissionIds: flagStr(flags, "submissions").split(",").map((s) => s.trim()).filter(Boolean),
        method: "specific",
      };
      const made = data<any[]>(await api(config, eventPath(config, "/review-assignments"), { method: "POST", body }));
      emit(config, made, () => out(`Created ${made.length} assignment(s).`));
      return;
    }
    if (action === "queue") {
      const persona = need(flagStr(flags, "persona") || config.persona, "reviews queue needs --persona <reviewerPersonaId>");
      const rows = data<any[]>(await api(config, eventPath(config, "/reviewer-queue"), { persona, role: "reviewer" }));
      emit(config, rows, () =>
        printTable(rows.map((a) => ({ assignment: a.id, submission: a.submissionId, title: a.submission?.title, round: a.round?.name, status: a.status }))),
      );
      return;
    }
    if (action === "progress") {
      const rows = data<any[]>(await api(config, eventPath(config, `/review-progress${roundQuery}`)));
      emit(config, rows, () =>
        printTable(rows.map((r) => ({ reviewer: r.reviewer?.name || r.reviewerId, round: r.roundName, assigned: r.assigned, completed: r.completed, outstanding: r.outstanding, percent: `${r.percent}%` }))),
      );
      return;
    }
    if (action === "results") {
      const rows = data<any[]>(await api(config, eventPath(config, `/review-results${roundQuery}`)));
      emit(config, rows, () =>
        printTable(rows.map((r) => ({ id: r.id, title: r.title, status: r.status, reviewers: r.reviewerCount, score: r.aggregateScore, scale: r.scoreScale }))),
      );
      return;
    }
    if (action === "export") {
      const csv = await api<string>(config, eventPath(config, `/review-results.csv${roundQuery}`), { raw: true });
      if (config.json) printJson({ csv });
      else out(csv.trimEnd());
      return;
    }
    throw new ApiError(`unknown reviews action "${action}"`, 0);
  },
};

// —— schedule ——————————————————————————————————————————————

const schedule: Command = {
  name: "schedule",
  summary: "Inspect the agenda, place and move sessions, test conflicts, publish.",
  usage: [
    "cue schedule view [--day 2026-10-12] [--room 'Main Hall'] [--track Agents]",
    "cue schedule place <sessionId> --day 2026-10-12 --time 09:00 --room 'Room 2A' [--minutes 45]",
    "cue schedule move <sessionId> --day ... --time ... --room ...   # same as place",
    "cue schedule conflicts <sessionId> --day ... --time ... --room ...   # dry run, no writes",
    "cue schedule publish",
  ],
  options: [
    "--day    civil date in the event timezone (YYYY-MM-DD)",
    "--time   wall clock start in the event timezone (HH:MM)",
    "--room   room name or id",
    "--minutes  duration override; defaults to the session's own duration",
  ],
  async run({ config, words, flags }) {
    const action = words[0] || "view";
    const info = await eventInfo(config);
    const timezone = info.timezone || "UTC";
    const board = await api<any>(config, eventPath(config, "/schedule"));

    if (action === "view") {
      const dayFilter = flagStr(flags, "day");
      const roomFilter = flagStr(flags, "room").toLowerCase();
      const trackFilter = flagStr(flags, "track").toLowerCase();
      const rows = (board.slots || [])
        .map((slot: any) => {
          const session = (board.sessions || []).find((s: any) => s.id === slot.sessionId) || {};
          const room = (board.rooms || []).find((r: any) => r.id === slot.roomId);
          const trackNames = (session.trackIds || []).map((id: string) => (board.tracks || []).find((t: any) => t.id === id)?.name || id);
          return {
            day: dayOf(slot.startsAt, timezone),
            time: inZone(slot.startsAt, timezone).slice(11),
            room: room?.name || slot.roomId,
            session: slot.sessionId,
            title: session.title || "",
            tracks: trackNames.join(", "),
            speakers: speakerNames(session, board),
          };
        })
        .filter((row: any) => (!dayFilter || row.day === dayFilter) && (!roomFilter || row.room.toLowerCase().includes(roomFilter)) && (!trackFilter || row.tracks.toLowerCase().includes(trackFilter)))
        .sort((a: any, b: any) => `${a.day}${a.time}`.localeCompare(`${b.day}${b.time}`));
      const placed = new Set((board.slots || []).map((s: any) => s.sessionId));
      const pool = (board.sessions || []).filter((s: any) => !placed.has(s.id) && ["accepted", "published"].includes(s.status));
      emit(config, { version: board.version, rooms: board.rooms, placed: rows, unscheduled: pool }, () => {
        heading("placed");
        printTable(rows, ["day", "time", "room", "title", "speakers", "session"]);
        heading("unscheduled accepted sessions");
        printTable(pool.map((s: any) => ({ id: s.id, title: s.title, minutes: s.durationMinutes })));
        heading("rooms");
        printTable((board.rooms || []).map((r: any) => ({ id: r.id, name: r.name, capacity: r.capacity ?? "" })));
        out();
        out(`schedule version ${board.version} (pass it back automatically on place/move)`);
      });
      return;
    }

    if (action === "place" || action === "move" || action === "conflicts") {
      const sessionId = need(words[1] || "", `schedule ${action} needs a session id`);
      const session = (board.sessions || []).find((s: any) => s.id === sessionId);
      if (!session) throw new ApiError(`session not found in this event: ${sessionId}`, 404);
      const roomInput = need(flagStr(flags, "room"), `schedule ${action} needs --room`);
      const room = (board.rooms || []).find((r: any) => r.id === roomInput || String(r.name).toLowerCase() === roomInput.toLowerCase());
      if (!room) throw new ApiError(`room not found: ${roomInput} (available: ${(board.rooms || []).map((r: any) => r.name).join(", ")})`, 404);
      const startsAt = toInstant(need(flagStr(flags, "day"), `schedule ${action} needs --day`), need(flagStr(flags, "time"), `schedule ${action} needs --time`), timezone);
      const minutes = Number(flagStr(flags, "minutes")) || session.durationMinutes || 45;
      const slot = {
        id: `slot-${sessionId}`,
        sessionId,
        roomId: room.id,
        startsAt,
        endsAt: new Date(Date.parse(startsAt) + minutes * 60000).toISOString(),
      };

      if (action === "conflicts") {
        const result = await api<any>(config, eventPath(config, "/schedule/validate"), { method: "POST", body: slot });
        emit(config, result, () => {
          const conflicts = result.conflicts || [];
          if (!conflicts.length) out(`No conflicts: ${session.title} fits ${room.name} at ${inZone(startsAt, timezone)}.`);
          else {
            out(`${conflicts.length} conflict(s):`);
            for (const conflict of conflicts) out(`  - ${conflict.type || conflict.code || "conflict"}: ${conflict.message || JSON.stringify(conflict)}`);
          }
        });
        return;
      }

      let response: any;
      try {
        response = await api<any>(config, eventPath(config, "/schedule/move"), { method: "POST", body: { slot, version: board.version } });
      } catch (error) {
        // A rejected placement must explain WHY, so an agent can pick another slot.
        if (error instanceof ApiError) {
          const conflicts = (error.body as any)?.conflicts || (error.body as any)?.data?.conflicts || [];
          const reasons = conflicts.map((c: any) => `${c.type || c.code || "conflict"}: ${c.message || JSON.stringify(c)}`);
          throw new ApiError(reasons.length ? `${error.message}\n${reasons.map((r: string) => `  - ${r}`).join("\n")}` : error.message, error.status, error.body);
        }
        throw error;
      }
      emit(config, response, () => {
        out(`Placed ${session.title} in ${room.name} at ${inZone(startsAt, timezone)} (${timezone}).`);
        const warnings = response.warnings || response.data?.warnings || [];
        for (const warning of warnings) out(`  warning: ${warning.message || JSON.stringify(warning)}`);
      });
      return;
    }

    if (action === "publish") {
      const response = await api<any>(config, eventPath(config, "/agenda/publish"), { method: "POST", body: {} });
      emit(config, response, () => {
        out("Agenda published.");
        const url = `${config.url}/e/${info.slug}/public/agenda`;
        out(`Public agenda: ${url}`);
      });
      return;
    }
    throw new ApiError(`unknown schedule action "${action}"`, 0);
  },
};

// —— speakers ——————————————————————————————————————————————

const speakers: Command = {
  name: "speakers",
  summary: "Roster, profiles, imports, status, portal invites and task assignment.",
  usage: [
    "cue speakers list [--status accepted] [--q raman]",
    "cue speakers show <speakerId>",
    "cue speakers add --name 'Priya Raman' --email priya@example.test [--title ...] [--company ...] [--bio ...]",
    "cue speakers import <file.csv>",
    "cue speakers status <speakerId> --status confirmed",
    "cue speakers invite <speakerId>            # prints the portal magic link",
    "cue speakers tasks assign --speakers id1,id2 --title 'Confirm participation' --due 2027-04-01 [--type action]",
  ],
  async run({ config, words, flags }) {
    const action = words[0] || "list";
    if (action === "list") {
      const query = new URLSearchParams();
      for (const key of ["status", "q", "tag", "readiness"]) if (flagStr(flags, key)) query.set(key, flagStr(flags, key));
      const rows = data<any[]>(await api(config, eventPath(config, `/speakers${query.toString() ? `?${query}` : ""}`)));
      emit(config, rows, () =>
        printTable(rows.map((s) => ({ id: s.speakerId, name: s.name, email: s.email, status: s.workflowStatus, tasks: `${(s.tasks || []).filter((t: any) => t.status === "completed").length}/${(s.tasks || []).length}` }))),
      );
      return;
    }
    if (action === "show") {
      const id = need(words[1] || "", "speakers show needs a speaker id");
      const row = data(await api(config, eventPath(config, `/speakers/${encodeURIComponent(id)}`)));
      emit(config, row, () => {
        printKeyValues({ id: row.speakerId, name: row.name, email: row.email, title: row.title, company: row.company, status: row.workflowStatus, travel: row.travelPreference, dietary: row.dietary });
        if (row.tasks?.length) {
          heading("tasks");
          printTable(row.tasks.map((t: any) => ({ id: t.id, title: t.title, type: t.type, status: t.status, due: String(t.dueAt || "").slice(0, 10) })));
        }
      });
      return;
    }
    if (action === "add") {
      const body = {
        name: need(flagStr(flags, "name"), "speakers add needs --name"),
        email: need(flagStr(flags, "email"), "speakers add needs --email"),
        title: flagStr(flags, "title"),
        company: flagStr(flags, "company"),
        bio: flagStr(flags, "bio"),
        createAsNew: flagBool(flags, "new-person"),
        sendInvite: flagBool(flags, "invite"),
      };
      const response = data(await api(config, eventPath(config, "/speakers"), { method: "POST", body }));
      emit(config, response, () => {
        out(`${response.linked ? "Linked to existing speaker" : "Added"} ${response.profile?.name} (${response.speakerId})`);
        if (response.linked) out("Pass --new-person to force a separate record for a different person with the same name.");
      });
      return;
    }
    if (action === "import") {
      const file = need(words[1] || "", "speakers import needs a CSV file path");
      const csv = readFileSync(file, "utf8");
      const response = data(await api(config, eventPath(config, "/speakers/import"), { method: "POST", body: { csv } }));
      emit(config, response, () => {
        out(`created ${response.created}, updated ${response.updated}, skipped ${response.skipped}`);
        const failures = (response.results || []).filter((r: any) => !r.ok);
        if (failures.length) printTable(failures.map((r: any) => ({ row: r.row, error: r.error })));
      });
      return;
    }
    if (action === "status") {
      const id = need(words[1] || "", "speakers status needs a speaker id");
      const status = need(flagStr(flags, "status"), "speakers status needs --status");
      const response = data(await api(config, eventPath(config, `/speakers/${encodeURIComponent(id)}/status`), { method: "POST", body: { status } }));
      emit(config, response, () => out(`${id} → ${status}`));
      return;
    }
    if (action === "invite") {
      const id = need(words[1] || "", "speakers invite needs a speaker id");
      const response = data(await api(config, eventPath(config, `/speakers/${encodeURIComponent(id)}/invite`), { method: "POST", body: {} }));
      emit(config, response, () => {
        out(`Invite email: ${response.communication?.subject} (${response.communication?.status})`);
        out(`Portal magic link: ${response.portalUrl || `${config.url}${response.portalPath}`}`);
        out("Use it with:  cue portal tasks --token <token from the link>");
      });
      return;
    }
    if (action === "tasks") {
      if ((words[1] || "assign") !== "assign") throw new ApiError('speakers tasks only supports "assign"', 0);
      const body = {
        speakerIds: flagStr(flags, "speakers").split(",").map((s) => s.trim()).filter(Boolean),
        title: need(flagStr(flags, "title"), "speakers tasks assign needs --title"),
        dueAt: need(flagStr(flags, "due"), "speakers tasks assign needs --due"),
        type: flagStr(flags, "type", "action"),
        description: flagStr(flags, "description"),
      };
      const made = data<any[]>(await api(config, eventPath(config, "/speakers/tasks"), { method: "POST", body }));
      emit(config, made, () => out(`Assigned "${body.title}" to ${made.length} speaker(s).`));
      return;
    }
    throw new ApiError(`unknown speakers action "${action}"`, 0);
  },
};

// —— comms ————————————————————————————————————————————————

const comms: Command = {
  name: "comms",
  summary: "Templated email, the delivery log and decision notifications.",
  usage: [
    "cue comms log [--limit 20]",
    "cue comms send --template accepted --speakers id1,id2",
    "cue comms decisions [--cohorts accepted,rejected] [--subject '...'] [--body '...']",
  ],
  async run({ config, words, flags }) {
    const action = words[0] || "log";
    if (action === "log") {
      const limit = Number(flagStr(flags, "limit")) || 20;
      const rows = data<any[]>(await api(config, eventPath(config, "/comms/log"))).slice(0, limit);
      emit(config, rows, () =>
        printTable(rows.map((c) => ({ at: c.createdAt, to: c.recipientEmail || c.speakerId, kind: c.kind, subject: c.subject, status: c.status, feedback: c.feedback ? "yes" : "" }))),
      );
      return;
    }
    if (action === "send") {
      const body = {
        templateKey: need(flagStr(flags, "template"), "comms send needs --template"),
        speakerIds: flagStr(flags, "speakers").split(",").map((s) => s.trim()).filter(Boolean),
      };
      const rows = data<any[]>(await api(config, eventPath(config, "/comms/send"), { method: "POST", body }));
      emit(config, rows, () => out(`Sent ${rows.length} message(s).`));
      return;
    }
    if (action === "decisions") {
      const body = {
        cohorts: (flagStr(flags, "cohorts", "accepted,rejected")).split(",").map((s) => s.trim()).filter(Boolean),
        subject: flagStr(flags, "subject", "Decision for {{talk_title}}"),
        body: flagStr(flags, "body", "Hi {{name}}, your proposal {{talk_title}} was {{decision}}. {{feedback}}"),
      };
      const rows = data<any[]>(await api(config, eventPath(config, "/comms/decisions/send"), { method: "POST", body }));
      emit(config, rows, () => out(`Sent ${rows.length} decision email(s).`));
      return;
    }
    throw new ApiError(`unknown comms action "${action}"`, 0);
  },
};

// —— content ————————————————————————————————————————————————

const content: Command = {
  name: "content",
  summary: "Speaker files, approvals and the archive export.",
  usage: [
    "cue content files",
    "cue content approve <fileId> --status approved|changes_requested [--comment '...']",
    "cue content zip [--out archive.zip]",
  ],
  async run({ config, words, flags }) {
    const action = words[0] || "files";
    if (action === "files") {
      const payload = data(await api(config, eventPath(config, "/content")));
      const rows = (payload.files || []).map((f: any) => ({
        id: f.id, file: f.currentVersion?.name, speaker: f.speaker?.name, session: f.session?.title, versions: (f.versions || []).length, status: f.status,
      }));
      emit(config, payload.files || [], () => printTable(rows));
      return;
    }
    if (action === "approve") {
      const id = need(words[1] || "", "content approve needs a file id");
      const body = { status: need(flagStr(flags, "status"), "content approve needs --status"), comment: flagStr(flags, "comment") };
      const response = data(await api(config, eventPath(config, `/content/files/${encodeURIComponent(id)}/approval`), { method: "PATCH", body }));
      emit(config, response, () => out(`${id} → ${body.status}`));
      return;
    }
    if (action === "zip") {
      const target = flagStr(flags, "out", "cue-content.zip");
      const url = `${config.url}${eventPath(config, "/content/export")}`;
      const response = await fetch(url, { headers: { "x-demo-role": config.role, "x-demo-persona": config.persona, "x-cue-event": config.event } });
      if (!response.ok) throw new ApiError(`content export failed with ${response.status}`, response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      const { writeFileSync } = await import("node:fs");
      writeFileSync(target, bytes);
      const summary = { file: target, bytes: bytes.length, files: response.headers.get("x-cue-file-count"), grouping: response.headers.get("x-cue-grouping") };
      emit(config, summary, () => out(`Wrote ${target} (${bytes.length} bytes, ${summary.files ?? "?"} files).`));
      return;
    }
    throw new ApiError(`unknown content action "${action}"`, 0);
  },
};

// —— crm ————————————————————————————————————————————————————

const crm: Command = {
  name: "crm",
  summary: "Organization-level speaker CRM.",
  usage: [
    "cue crm contacts [--q raman] [--stage prospect]",
    "cue crm add-to-event <contactId> [--role speaker] [--to <eventId>]",
    "cue crm communicate --contacts id1,id2 --subject '...' --body '...'",
  ],
  async run({ config, words, flags }) {
    const action = words[0] || "contacts";
    if (action === "contacts") {
      const query = new URLSearchParams();
      for (const key of ["q", "stage", "tag", "company"]) if (flagStr(flags, key)) query.set(key, flagStr(flags, key));
      const rows = data<any[]>(await api(config, `/api/crm/contacts${query.toString() ? `?${query}` : ""}`));
      emit(config, rows, () => printTable(rows.map((c) => ({ id: c.id, name: c.name, email: c.email, stage: c.stage, company: c.company }))));
      return;
    }
    if (action === "add-to-event") {
      const id = need(words[1] || "", "crm add-to-event needs a contact id");
      const body = { eventId: flagStr(flags, "to") || config.event, role: flagStr(flags, "role", "speaker") };
      const response = await api<any>(config, `/api/crm/contacts/${encodeURIComponent(id)}/add-to-event`, { method: "POST", body });
      const payload = data(response);
      emit(config, response, () => out(`${payload.created ? "Created" : "Linked"} ${body.role} ${payload.speakerId || payload.reviewerId} in ${response.eventId || body.eventId}`));
      return;
    }
    if (action === "communicate") {
      const body = {
        contactIds: flagStr(flags, "contacts").split(",").map((s) => s.trim()).filter(Boolean),
        subject: need(flagStr(flags, "subject"), "crm communicate needs --subject"),
        body: need(flagStr(flags, "body"), "crm communicate needs --body"),
      };
      const rows = data(await api(config, "/api/crm/communicate", { method: "POST", body }));
      emit(config, rows, () => out(`Logged ${Array.isArray(rows) ? rows.length : 1} campaign message(s).`));
      return;
    }
    throw new ApiError(`unknown crm action "${action}"`, 0);
  },
};

// —— publish ————————————————————————————————————————————————

const publish: Command = {
  name: "publish",
  summary: "Saved embed configurations and public feed URLs.",
  usage: ["cue publish embeds", "cue publish feeds"],
  async run({ config, words }) {
    const action = words[0] || "feeds";
    const info = await eventInfo(config);
    if (action === "embeds") {
      const rows = data<any[]>(await api(config, eventPath(config, "/embed-configs")));
      emit(config, rows, () =>
        printTable(rows.map((e) => ({ id: e.id, name: e.name, widget: e.widget, url: `${config.url}/e/${info.slug}/public/${e.widget}?config=${e.id}` }))),
      );
      return;
    }
    if (action === "feeds") {
      const base = `${config.url}/e/${info.slug}/public`;
      const feeds = {
        sessions: `${base}/sessions`,
        speakers: `${base}/speakers`,
        agenda: `${base}/agenda`,
        itinerary: `${base}/itinerary`,
        gallery: `${base}/gallery`,
        json: `${base}/feed.json`,
        xml: `${base}/feed.xml`,
        ics: `${base}/ics`,
      };
      emit(config, feeds, () => printKeyValues(feeds));
      return;
    }
    throw new ApiError(`unknown publish action "${action}"`, 0);
  },
};

// —— cfp (speaker flow) ————————————————————————————————————

const cfp: Command = {
  name: "cfp",
  summary: "Public CFP: inspect the form and submit a proposal.",
  usage: [
    "cue cfp form [--slug ai-engineer-summit]",
    "cue cfp submit --title '...' --abstract '...' --name '...' --email '...' [--field category='AI Engineering'] [--field format='Talk (30 min)']",
  ],
  options: ["--field key=value   repeatable; supplies any form field, including required ones"],
  async run({ config, words, flags }) {
    const action = words[0] || "form";
    const info = await eventInfo(config);
    const slug = flagStr(flags, "slug") || info.slug;
    if (action === "form") {
      const payload = data(await api(config, `/api/public/events/${encodeURIComponent(slug)}/cfp`, { role: "", persona: "" }));
      emit(config, payload, () => {
        printKeyValues({ event: payload.event?.name, form: payload.form?.title, status: payload.form?.status, open: payload.window?.open, closes: payload.form?.closeAt });
        heading("fields");
        printTable((payload.form?.fields || []).map((f: any) => ({ key: f.key, label: f.label, type: f.type, required: f.required ? "yes" : "", options: f.options || "", showsWhen: f.visibleWhen ? `${f.visibleWhen.key}=${f.visibleWhen.equals}` : "" })));
      });
      return;
    }
    if (action === "submit") {
      const answers: Record<string, unknown> = {
        title: need(flagStr(flags, "title"), "cfp submit needs --title"),
        abstract: need(flagStr(flags, "abstract"), "cfp submit needs --abstract"),
        ...parseFields(flagList(flags, "field")),
      };
      const body = { name: need(flagStr(flags, "name"), "cfp submit needs --name"), email: need(flagStr(flags, "email"), "cfp submit needs --email"), answers };
      const payload = data(await api(config, `/api/public/events/${encodeURIComponent(slug)}/submissions`, { method: "POST", body, role: "", persona: "" }));
      emit(config, payload, () => {
        out(`Submitted: ${payload.id} (${payload.status})`);
        out(`Review board: ${payload.boardLabel || payload.reviewBoard}`);
        out(`Edit link: ${config.url}${payload.editUrl}`);
        if (payload.portalUrl) out(`Speaker portal magic link: ${payload.portalUrl}`);
      });
      return;
    }
    throw new ApiError(`unknown cfp action "${action}"`, 0);
  },
};

// —— portal (speaker flow) ————————————————————————————————

const portal: Command = {
  name: "portal",
  summary: "Speaker portal via a magic-link token.",
  usage: [
    "cue portal tasks --token <token>",
    "cue portal complete <taskId> --token <token>",
  ],
  options: ["--token   the invite token from a portal magic link (…/p?invite=TOKEN)"],
  async run({ config, words, flags }) {
    const token = need(flagStr(flags, "token"), "portal commands need --token from a magic link");
    const resolved = data(await api(config, `/api/public/speaker-invites/${encodeURIComponent(token)}`, { role: "", persona: "" }));
    const identity = { persona: resolved.speaker.id, role: "speaker" as const };
    const action = words[0] || "tasks";
    if (action === "tasks") {
      const home = data(await api(config, `/api/speaker/events/${encodeURIComponent(resolved.eventId)}/home`, identity));
      emit(config, home, () => {
        printKeyValues({ speaker: resolved.speaker.name, event: resolved.eventId, readiness: `${home.readiness?.completedRequiredTaskCount ?? 0}/${home.readiness?.requiredTaskCount ?? 0} required` });
        heading("tasks");
        printTable((home.tasks || []).map((t: any) => ({ id: t.id, title: t.title, type: t.type, status: t.status, due: String(t.dueAt || "").slice(0, 10) })));
        heading("talks");
        printTable((home.submissions || []).map((s: any) => ({ id: s.id, title: s.title, status: s.status, feedback: s.decisionFeedback || "" })));
      });
      return;
    }
    if (action === "complete") {
      const taskId = need(words[1] || "", "portal complete needs a task id");
      const response = data(await api(config, `/api/speaker/events/${encodeURIComponent(resolved.eventId)}/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", body: { status: "completed" }, ...identity }));
      emit(config, response, () => out(`${response.task?.title || taskId} → ${response.task?.status}`));
      return;
    }
    throw new ApiError(`unknown portal action "${action}"`, 0);
  },
};

// —— raw escape hatch ————————————————————————————————————

const rawApi: Command = {
  name: "api",
  summary: "Call any endpoint directly. Escape hatch for the full 186-operation surface.",
  usage: ["cue api GET /api/events", "cue api POST /api/events/<id>/review-rounds --data '{\"name\":\"Round 2\"}'"],
  options: ["--data   JSON request body", "--raw    print the response body verbatim (CSV, ICS, HTML)"],
  async run({ config, words, flags }) {
    const method = (words[0] || "GET").toUpperCase();
    const path = need(words[1] || "", "api needs a path, for example: cue api GET /api/events");
    const raw = flagStr(flags, "data");
    let body: unknown;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        throw new ApiError(`--data must be valid JSON, received: ${raw.slice(0, 80)}`, 0);
      }
    }
    const wantRaw = flagBool(flags, "raw");
    const response = await api(config, path, { method, body, raw: wantRaw });
    if (wantRaw) out(String(response));
    else printJson(response);
  },
};

export const COMMANDS: Command[] = [events, overview, submissions, reviews, schedule, speakers, comms, content, crm, publish, cfp, portal, rawApi];
