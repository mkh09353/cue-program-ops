/**
 * Client-side CSV export helpers.
 *
 * Rows are exported from data the page has already loaded, so an organizer gets
 * exactly the rows currently visible after filtering — no extra API surface and
 * no risk of the file disagreeing with the table on screen.
 */

/** RFC 4180 quoting: wrap when the value contains a delimiter, quote or newline. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  const raw = String(value);
  if (!raw) return "";
  // Guard against spreadsheet formula injection while keeping the text readable.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Serialize a header row + body rows into CSV text (CRLF line endings). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** cue-submissions-ai-engineer-summit-2026-10-12.csv */
export function csvFilename(kind: string, eventSlug: string, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const slug = String(eventSlug || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `cue-${kind}-${slug || "event"}-${date}.csv`;
}

/** Trigger a browser download of CSV text (UTF-8 BOM so Excel keeps accents). */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
