import type { CanonicalData, Event, ScheduleProjection } from "./domain.js";
import type { ScheduleData, ScheduleSession, ScheduleSpeaker } from "./schedule.js";

/** The schedule projection is the canonical event-program source for sync and public publishing. */
export const scheduleEvent = (eventId: string, schedule: ScheduleProjection): Event => ({
  id: eventId,
  name: schedule.event.name,
  timezone: schedule.event.timezone,
});

const eligibleSession = (session: ScheduleSession) => session.status === "accepted" || session.status === "published";
const scheduledEligible = (session: ScheduleSession) => eligibleSession(session);

export function publicSpeakerIds(schedule: ScheduleData): Set<string> {
  const ids = new Set<string>();
  for (const session of schedule.sessions) {
    if (eligibleSession(session)) for (const id of session.speakerIds) ids.add(id);
  }
  return ids;
}

export function publicSpeakers(schedule: ScheduleData): ScheduleSpeaker[] {
  const ids = publicSpeakerIds(schedule);
  return schedule.speakers
    .filter((speaker) => speaker.isPublic !== false && ids.has(speaker.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Outbound rows are only accepted/published sessions with an actual schedule slot. */
export function canonicalFromSchedule(eventId: string, schedule: ScheduleProjection): CanonicalData {
  const slots = new Map(schedule.slots.map((slot) => [slot.sessionId, slot]));
  const rooms = new Map(schedule.rooms.map((room) => [room.id, room]));
  const tracks = new Map(schedule.tracks.map((track) => [track.id, track]));
  const included = schedule.sessions.filter((session) => scheduledEligible(session) && slots.has(session.id));
  const speakerIds = new Set(included.flatMap((session) => session.speakerIds));
  const speakers = schedule.speakers
    .filter((speaker) => speakerIds.has(speaker.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((speaker) => ({
      id: speaker.id,
      eventId,
      name: speaker.name,
      // A live adapter should reject missing email; .invalid prevents accidental delivery in demo mode.
      email: speaker.email || `${speaker.id}@example.invalid`,
      bio: speaker.bio,
      company: speaker.company,
      acceptedSubmissionId: speaker.acceptedSubmissionId || `sub-${speaker.id}`,
    }));
  return {
    event: scheduleEvent(eventId, schedule),
    speakers,
    sessions: included
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((session) => {
        const slot = slots.get(session.id)!;
        return {
          id: session.id,
          eventId,
          title: session.title,
          abstract: session.abstract,
          speakerIds: [...session.speakerIds].sort(),
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          track: session.trackIds.map((id) => tracks.get(id)?.name).filter(Boolean).join(" · ") || "General",
          room: rooms.get(slot.roomId)?.name || "TBA",
          acceptedSubmissionId: session.acceptedSubmissionId || `sub-${session.id}`,
        };
      }),
    submissions: included.map((session) => ({
      id: session.acceptedSubmissionId || `sub-${session.id}`,
      eventId,
      speakerId: session.speakerIds[0] || "",
      status: "accepted" as const,
      category: session.trackIds.map((id) => tracks.get(id)?.name).filter(Boolean).join(" · ") || "General",
    })),
  };
}

export async function canonicalScheduleMetrics(repo: { getSchedule?: (eventId: string) => Promise<ScheduleProjection | undefined> }, eventId: string) {
  const schedule = await repo.getSchedule?.(eventId);
  if (!schedule) return { acceptedUnscheduled: 0, acceptedScheduled: 0 };
  const scheduled = new Set(schedule.slots.map((slot) => slot.sessionId));
  const accepted = schedule.sessions.filter(eligibleSession);
  return {
    acceptedUnscheduled: accepted.filter((session) => !scheduled.has(session.id)).length,
    acceptedScheduled: accepted.filter((session) => scheduled.has(session.id)).length,
  };
}
