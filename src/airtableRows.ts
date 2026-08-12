import type { AirtableTransport, AirtableFieldDefinition } from "./airtable.js";
import type { CompetitionSnapshot } from "./persistence.js";

type AirtableRecord = { fields: Record<string, string> };
type ExtendedProfile = CompetitionSnapshot["lifecycle"]["profiles"][number] & { workflowStatus?: "invited" | "confirmed" | "accepted" | "declined" | "withdrawn" };

export const AIRTABLE_SPEAKERS_TABLE = "Speakers";
export const AIRTABLE_SESSIONS_TABLE = "Sessions";

export const AIRTABLE_SPEAKERS_FIELDS: AirtableFieldDefinition[] = [
  { name: "Name", type: "singleLineText" },
  { name: "Email", type: "email" },
  { name: "Title", type: "singleLineText" },
  { name: "Company", type: "singleLineText" },
  { name: "Bio", type: "multilineText" },
  { name: "Workflow Status", type: "singleLineText" },
  { name: "Event", type: "singleLineText" },
  { name: "External ID", type: "singleLineText" },
];

export const AIRTABLE_SESSIONS_FIELDS: AirtableFieldDefinition[] = [
  { name: "Title", type: "singleLineText" },
  { name: "Abstract", type: "multilineText" },
  { name: "Status", type: "singleLineText" },
  { name: "Track", type: "singleLineText" },
  { name: "Room", type: "singleLineText" },
  { name: "Starts At", type: "singleLineText" },
  { name: "Ends At", type: "singleLineText" },
  { name: "Speakers", type: "singleLineText" },
  { name: "Event", type: "singleLineText" },
  { name: "External ID", type: "singleLineText" },
];

/** Pure accepted-speaker projection. Explicit workflow state wins; legacy rows default to accepted. */
export function airtableSpeakerRows(snapshot: CompetitionSnapshot): AirtableRecord[] {
  const accepted = new Map<string, CompetitionSnapshot["lifecycle"]["submissions"][number]>();
  for (const submission of snapshot.lifecycle.submissions) {
    if (submission.status === "accepted" && !accepted.has(submission.speakerId)) accepted.set(submission.speakerId, submission);
  }
  return [...accepted.values()].flatMap((submission) => {
    const profile = snapshot.lifecycle.profiles.find((candidate) => candidate.speakerId === submission.speakerId) as ExtendedProfile | undefined;
    const requiredTasks = snapshot.lifecycle.tasks.filter((task) => task.speakerId === submission.speakerId && task.required);
    const hasHeadshot = snapshot.lifecycle.files.some((file) => file.speakerId === submission.speakerId && file.kind === "headshot") || Boolean(profile?.headshotName);
    const ready = requiredTasks.every((task) => task.status === "completed") && hasHeadshot && (!profile || Boolean(profile.bio?.trim()));
    const workflowStatus = profile?.workflowStatus || (ready ? "confirmed" : "accepted");
    if (workflowStatus !== "accepted" && workflowStatus !== "confirmed") return [];
    return [{ fields: {
      Name: profile?.name || submission.name || "",
      Email: profile?.email || submission.email || "",
      Title: profile?.title || "",
      Company: profile?.company || "",
      Bio: profile?.bio || "",
      "Workflow Status": workflowStatus,
      Event: snapshot.lifecycle.event.name || snapshot.eventId,
      "External ID": submission.speakerId,
    } }];
  });
}

/** Pure canonical-schedule projection; unscheduled values remain safe empty strings. */
export function airtableSessionRows(snapshot: CompetitionSnapshot): AirtableRecord[] {
  const schedule = snapshot.schedule;
  if (!schedule) return [];
  const tracks = new Map(schedule.tracks.map((track) => [track.id, track.name]));
  const speakers = new Map(schedule.speakers.map((speaker) => [speaker.id, speaker.name]));
  const rooms = new Map(schedule.rooms.map((room) => [room.id, room.name]));
  return schedule.sessions.map((session) => {
    const slot = schedule.slots.find((candidate) => candidate.sessionId === session.id);
    return { fields: {
      Title: session.title || "",
      Abstract: session.abstract || "",
      Status: session.status || "",
      Track: session.trackIds.map((id) => tracks.get(id)).filter((name): name is string => !!name).join(", "),
      Room: slot ? rooms.get(slot.roomId) || "" : "",
      "Starts At": slot?.startsAt || "",
      "Ends At": slot?.endsAt || "",
      Speakers: session.speakerIds.map((id) => speakers.get(id)).filter((name): name is string => !!name).join(", "),
      Event: snapshot.lifecycle.event.name || snapshot.eventId,
      "External ID": session.id,
    } };
  });
}

async function upsertBatches(transport: AirtableTransport, table: string, rows: AirtableRecord[]) {
  for (let offset = 0; offset < rows.length; offset += 10) await transport.upsert(table, rows.slice(offset, offset + 10));
}

/** Best-effort per-table sync: one table's metadata/upsert failure never blocks the other. */
export async function syncNormalizedAirtableRows(snapshot: CompetitionSnapshot, transport: AirtableTransport) {
  const jobs: [string, AirtableFieldDefinition[], AirtableRecord[]][] = [
    [AIRTABLE_SPEAKERS_TABLE, AIRTABLE_SPEAKERS_FIELDS, airtableSpeakerRows(snapshot)],
    [AIRTABLE_SESSIONS_TABLE, AIRTABLE_SESSIONS_FIELDS, airtableSessionRows(snapshot)],
  ];
  for (const [table, fields, rows] of jobs) {
    try {
      await transport.ensureTable(table, fields);
      if (rows.length) await upsertBatches(transport, table, rows);
    } catch (error) {
      console.warn(`CUE Airtable normalized ${table} sync failed`, error instanceof Error ? error.message : "unknown error");
    }
  }
}
