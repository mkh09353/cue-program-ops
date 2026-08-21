import { EVENT_TIME_ZONE, isoToZonedWallTime, zoneOffsetMinutes } from "./timezone.js";

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC stamp (`YYYYMMDDTHHMMSSZ`) used for DTSTAMP. */
export function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Wall-clock stamp in `timeZone` (`YYYYMMDDTHHMMSS`, no Z) for `DTSTART;TZID=`. */
export function toIcsLocal(iso: string, timeZone: string = EVENT_TIME_ZONE): string {
  const { day, time } = isoToZonedWallTime(iso, timeZone);
  const [hour, minute] = time.split(":");
  return `${day.replaceAll("-", "")}T${hour}${minute}00`;
}

function offsetIcs(minutesEast: number): string {
  const sign = minutesEast >= 0 ? "+" : "-";
  const abs = Math.abs(minutesEast);
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/**
 * VTIMEZONE block so clients honor TZID. America/Los_Angeles gets US Pacific DST
 * rules; other IANA zones get a STANDARD-only block using the offset at `at`.
 */
export function vtimezoneLines(timeZone: string, at = Date.now()): string[] {
  if (timeZone === "America/Los_Angeles" || timeZone === "US/Pacific") {
    return [
      "BEGIN:VTIMEZONE",
      `TZID:${timeZone}`,
      "X-LIC-LOCATION:America/Los_Angeles",
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:-0800",
      "TZOFFSETTO:-0700",
      "TZNAME:PDT",
      "DTSTART:19700308T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:-0700",
      "TZOFFSETTO:-0800",
      "TZNAME:PST",
      "DTSTART:19701101T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
  }
  const offset = offsetIcs(zoneOffsetMinutes(at, timeZone));
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${timeZone}`,
    "BEGIN:STANDARD",
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    "DTSTART:19700101T000000",
    `TZNAME:${timeZone}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

const icsEscape = (value: string) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  dtstamp?: string;
};

/** RFC5545 calendar with X-WR-TIMEZONE, VTIMEZONE, and TZID wall-clock DTSTART/DTEND. */
export function buildCalendarDocument(input: {
  name?: string;
  timeZone?: string;
  events: IcsEvent[];
}): string {
  const timeZone = input.timeZone || EVENT_TIME_ZONE;
  const events = input.events
    .map((event) => {
      const dtstamp = event.dtstamp ? toIcsUtc(event.dtstamp) : toIcsUtc(new Date().toISOString());
      return [
        "BEGIN:VEVENT",
        `UID:${icsEscape(event.uid)}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=${timeZone}:${toIcsLocal(event.startsAt, timeZone)}`,
        `DTEND;TZID=${timeZone}:${toIcsLocal(event.endsAt, timeZone)}`,
        `SUMMARY:${icsEscape(event.title)}`,
        event.description ? `DESCRIPTION:${icsEscape(event.description)}` : "",
        event.location ? `LOCATION:${icsEscape(event.location)}` : "",
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `PRODID:-//Ruckus//${icsEscape(input.name || "Ruckus")}//EN`,
    input.name ? `X-WR-CALNAME:${icsEscape(input.name)}` : "",
    `X-WR-TIMEZONE:${timeZone}`,
    ...vtimezoneLines(timeZone),
    events,
    "END:VCALENDAR",
    "",
  ].filter((line, i, all) => line !== "" || i === all.length - 1);
  return lines.join("\r\n");
}
