// `React` is imported by name (as in components/ui.tsx) so the exported table also
// renders under the classic JSX runtime used by the node tests.
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, subscribeData } from "../lib/api";
import { fmtDate, fmtTime } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  LoadState,
  Notice,
  PageHeader,
  toast,
} from "../components/ui";
import { useAsyncData } from "../lib/useAsyncData";

/**
 * Operational sessions roster.
 *
 * The canonical program record for every session (CFP-accepted or manually
 * created): its code, speakers, schedule placement, publication state and
 * cancellation. Approve/cancel are server mutations — this page never keeps a
 * private copy of publication state.
 */

type PublicationFilter = "" | "approved" | "draft" | "cancelled";

export function placementLabel(schedule: any): string {
  if (!schedule?.startsAt) return "Not scheduled";
  const room = schedule.room || schedule.roomId || "Unassigned room";
  return `${room} · ${fmtDate(schedule.startsAt)} ${fmtTime(schedule.startsAt)}–${fmtTime(schedule.endsAt)}`;
}

/** Publication/cancellation filter applied to the server rows. */
export function filterSessions(rows: any[], filter: PublicationFilter): any[] {
  if (!filter) return rows;
  if (filter === "cancelled") return rows.filter((r) => r.cancelled);
  return rows.filter((r) => r.publicationState === filter && !r.cancelled);
}

/**
 * Presentation half of the roster: rows in, labelled actions out. Split from the
 * page so it can be rendered against real API rows in tests.
 */
export function SessionsTable({
  rows,
  busy = "",
  onAction,
}: {
  rows: any[];
  busy?: string;
  onAction: (row: any, action: "approve" | "unapprove" | "cancel" | "uncancel") => void;
}) {
  return (
    <Card className="overflow-hidden" data-testid="sessions-table">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b bg-soft text-[11px] uppercase tracking-wide text-mid">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Speakers</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Publication</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-soft" data-testid={`session-row-${row.id}`}>
                <td className="px-4 py-3 font-mono text-xs" data-testid={`session-code-${row.id}`}>
                  {row.code || "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink">{row.title}</div>
                  {row.cancelled && row.cancellationReason ? (
                    <div className="text-xs text-mid">Reason: {row.cancellationReason}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {row.speakers?.length
                    ? row.speakers.map((s: any) => (
                        <div key={s.id}>
                          <Link className="hover:underline" to={`/app/speakers/${s.id}`}>
                            {s.name}
                          </Link>
                        </div>
                      ))
                    : "—"}
                </td>
                <td className="px-4 py-3 text-mid">{placementLabel(row.schedule)}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.publicationState === "approved" ? "ok" : "muted"} data-testid={`session-state-${row.id}`}>
                    {row.publicationState === "approved" ? "Approved" : "Draft"}
                  </Badge>
                  {row.cancelled ? (
                    <div className="mt-1">
                      <Badge tone="danger" data-testid={`session-cancelled-${row.id}`}>
                        Cancelled
                      </Badge>
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="muted">{row.source === "cfp" ? "CFP" : "Manual"}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {row.publicationState === "approved" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`session-unapprove-${row.id}`}
                        disabled={!!busy}
                        onClick={() => onAction(row, "unapprove")}
                      >
                        {busy === `${row.id}-unapprove` ? "Working…" : "Unapprove"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        data-testid={`session-approve-${row.id}`}
                        disabled={!!busy}
                        onClick={() => onAction(row, "approve")}
                      >
                        {busy === `${row.id}-approve` ? "Working…" : "Approve"}
                      </Button>
                    )}
                    {row.cancelled ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        data-testid={`session-uncancel-${row.id}`}
                        disabled={!!busy}
                        onClick={() => onAction(row, "uncancel")}
                      >
                        {busy === `${row.id}-uncancel` ? "Working…" : "Uncancel"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`session-cancel-${row.id}`}
                        disabled={!!busy}
                        onClick={() => onAction(row, "cancel")}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function SessionsPage() {
  const [filter, setFilter] = useState<PublicationFilter>("");
  const [busy, setBusy] = useState("");
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");

  const list = useAsyncData(async () => api.sessionsList(), []);
  useEffect(() => subscribeData(() => list.reload()), [list.reload]);

  const rows: any[] = list.data?.data || [];
  const meta = list.data?.meta || { approved: 0, draft: 0, cancelled: 0 };
  const visible = useMemo(() => filterSessions(rows, filter), [rows, filter]);

  const mutate = async (
    row: any,
    action: "approve" | "unapprove" | "cancel" | "uncancel",
    body?: { reason?: string },
  ) => {
    setBusy(`${row.id}-${action}`);
    try {
      await api.setSessionState(row.id, action, body);
      toast(
        action === "approve"
          ? `Approved "${row.title}" for publication`
          : action === "unapprove"
            ? `"${row.title}" moved back to draft`
            : action === "cancel"
              ? `Cancelled "${row.title}"`
              : `Restored "${row.title}"`,
      );
      await list.reload();
    } catch (e: any) {
      toast(e?.message || "That change was rejected by the server", "danger");
    } finally {
      setBusy("");
    }
  };

  if (!list.data)
    return (
      <div>
        <PageHeader title="Sessions" description="Canonical program sessions with publication and cancellation state." />
        <LoadState
          loading={list.loading}
          timedOut={list.timedOut}
          error={list.error}
          onRetry={list.reload}
          label="the session roster"
        />
      </div>
    );

  const filters: [PublicationFilter, string, number][] = [
    ["", "All", rows.length],
    ["approved", "Approved", meta.approved],
    ["draft", "Draft", meta.draft],
    ["cancelled", "Cancelled", meta.cancelled],
  ];

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="Every accepted CFP talk and manually added session. Approve a session to make it eligible for the public program; cancel it to withhold it without deleting the record."
        actions={
          <Button variant="secondary" onClick={() => void list.reload()}>
            Refresh
          </Button>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm text-mid" data-testid="sessions-summary">
          <b>{rows.length}</b> sessions · <b>{meta.approved}</b> approved · <b>{meta.draft}</b> draft ·{" "}
          <b>{meta.cancelled}</b> cancelled
        </span>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Publication state filters">
          {filters.map(([key, label, count]) => (
            <Button
              key={label}
              size="sm"
              variant={filter === key ? "dark" : "outline"}
              aria-pressed={filter === key}
              data-testid={`sessions-filter-${key || "all"}`}
              onClick={() => setFilter(key)}
            >
              {label} ({count})
            </Button>
          ))}
        </div>
      </Card>

      {list.error ? <Notice tone="danger">{list.error}</Notice> : null}

      {!visible.length ? (
        <EmptyState
          title="No sessions match this filter"
          description="Accept a submission or add a session on the schedule board, then approve it for publication here."
          action={
            <Button asChild variant="secondary">
              <Link to="/app/schedule">Open the schedule board</Link>
            </Button>
          }
        />
      ) : (
        <SessionsTable
          rows={visible}
          busy={busy}
          onAction={(row, action) => {
            if (action === "cancel") {
              setCancelReason("");
              setCancelTarget(row);
              return;
            }
            void mutate(row, action);
          }}
        />
      )}

      <Dialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`Cancel "${cancelTarget?.title || ""}"?`}
        description="The session stays on the record and can be uncancelled. A reason is optional and is shown to organizers."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Keep session
            </Button>
            <Button
              data-testid="session-cancel-confirm"
              disabled={!!busy}
              onClick={async () => {
                const target = cancelTarget;
                setCancelTarget(null);
                if (target) await mutate(target, "cancel", { reason: cancelReason.trim() || undefined });
              }}
            >
              Cancel session
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)">
          <Input
            data-testid="session-cancel-reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Speaker travel fell through"
          />
        </Field>
      </Dialog>
    </div>
  );
}
