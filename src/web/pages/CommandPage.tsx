// `React` is imported by name (as in components/ui.tsx) so exported components in
// this file also render under the classic JSX runtime used by the node tests.
import * as React from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, subscribeData } from "../lib/api";
import { daysUntil, humanizeMissing } from "../lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  KpiTile,
  Notice,
  PageHeader,
  Spinner,
  toast,
} from "../components/ui";

/**
 * The lifecycle endpoint links to organizer paths that predate the current SPA
 * route names (/app/agenda, /app/cfp, /app/reviews). Map them onto the routes
 * that actually exist so no checklist step is a dead end. Unknown hrefs pass
 * through unchanged.
 */
const LIFECYCLE_HREFS: Record<string, string> = {
  "/app/agenda": "/app/schedule",
  "/app/cfp": "/app/forms",
  "/app/reviews": "/app/review-progress",
};
export const lifecycleHref = (href: string) => LIFECYCLE_HREFS[href] || href || "/app";

/** Program lifecycle checklist: ordered, server-derived steps with "N of 7 complete". */
export function LifecycleChecklistCard({ steps }: { steps: any[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="p-5" data-testid="lifecycle-checklist">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-mid">Program lifecycle</h2>
        <Badge tone={done === steps.length ? "ok" : "muted"} data-testid="lifecycle-progress">
          {done} of {steps.length} complete
        </Badge>
      </div>
      <ol className="mt-3 divide-y divide-line">
        {steps.map((step: any) => (
          <li key={step.id} className="flex items-start justify-between gap-3 py-3" data-testid={`lifecycle-step-${step.id}`}>
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className={
                  step.done
                    ? "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-soft"
                    : "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[11px] text-mid"
                }
              >
                {step.done ? "✓" : ""}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">
                  {step.title}
                  <span className="sr-only">{step.done ? " — complete" : " — not complete"}</span>
                </div>
                <div className="text-xs text-mid">{step.detail}</div>
              </div>
            </div>
            <Link className="shrink-0 text-xs font-semibold text-ink underline" to={lifecycleHref(step.href)}>
              Open
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function CommandPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [scheduleUnscheduled, setScheduleUnscheduled] = useState<number | null>(null);
  const [lifecycle, setLifecycle] = useState<any[] | null>(null);
  const nav = useNavigate();

  const load = () =>
    Promise.all([api.command(), api.schedule().catch(() => null), api.lifecycle().catch(() => null)])
      .then(([cmd, sched, life]) => {
        setData(cmd.data);
        if (life) setLifecycle(life.data || []);
        if (sched) {
          const scheduled = new Set((sched.slots || []).map((x: any) => x.sessionId));
          const n = (sched.sessions || []).filter(
            (x: any) => x.status === "accepted" && !scheduled.has(x.id),
          ).length;
          setScheduleUnscheduled(n);
        }
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    const unsub = subscribeData(load);
    return () => {
      clearInterval(t);
      unsub();
    };
  }, []);

  if (!data && !err) return <Spinner />;
  if (err) return <Notice tone="danger">{err}</Notice>;

  const tMinus = daysUntil(data.event.startsAt);
  const unscheduled =
    scheduleUnscheduled != null ? scheduleUnscheduled : data.kpis.acceptedUnscheduled;

  const blockers = (data.blockers || []).map((b: any) => {
    if (b.id === "unscheduled" || /unscheduled/i.test(b.label || "")) {
      return {
        ...b,
        label: `${unscheduled} accepted session${unscheduled === 1 ? "" : "s"} still unscheduled`,
      };
    }
    return b;
  });

  return (
    <div>
      <PageHeader
        title="Command"
        description={`${data.event.name} · T-${tMinus} days · operational home, not a chart gallery.`}
        actions={
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Submissions" value={data.kpis.submissions} onClick={() => nav("/app/submissions")} />
        <KpiTile
          label="Awaiting review"
          value={data.kpis.awaitingReview}
          onClick={() => nav("/app/submissions?filter=pending")}
          hint="Submitted + in review"
        />
        <KpiTile
          label="Accepted unscheduled"
          value={unscheduled}
          onClick={() => nav("/app/schedule")}
          hint={
            scheduleUnscheduled != null && scheduleUnscheduled !== data.kpis.acceptedUnscheduled
              ? "From live schedule board"
              : undefined
          }
        />
        <KpiTile
          label="Speakers blocked"
          value={data.kpis.speakersBlocked}
          onClick={() => nav("/app/speakers")}
          hint="Missing onboarding"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-mid">Needs you</h2>
          {blockers?.length ? (
            <ul className="mt-3 divide-y divide-line">
              {blockers.map((b: any) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex items-center gap-3">
                    {/* Uniform pill width (widest label) with the word centered inside. */}
                    <Badge
                      className="w-24 shrink-0 justify-center"
                      tone={b.severity === "danger" ? "danger" : b.severity === "warn" ? "warn" : "info"}
                    >
                      {b.severity === "danger" ? "Urgent" : b.severity === "warn" ? "Attention" : "Info"}
                    </Badge>
                    <span className="text-sm font-medium">{b.label}</span>
                  </div>
                  <div className="flex gap-2">
                    {b.action === "nudge" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const ids = data.blockedSpeakers.map((s: any) => s.speakerId);
                          await api.sendComms({ templateKey: "task_reminder", speakerIds: ids });
                          toast(`Reminder sent to ${ids.length} speaker(s)`);
                          load();
                        }}
                      >
                        Nudge
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => nav(b.href)}>
                      Open
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3">
              <EmptyState title="All clear" description="No blockers right now." />
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {lifecycle?.length ? <LifecycleChecklistCard steps={lifecycle} /> : null}
          <Card className="p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-mid">Onboarding funnel</h2>
            <div className="mt-4 space-y-2 text-sm">
              {[
                ["Accepted", data.funnel.accepted],
                ["Profile ready", data.funnel.profile],
                ["Headshot", data.funnel.headshot],
                ["Slides", data.funnel.slides],
                ["Fully ready", data.funnel.ready],
              ].map(([label, n]) => (
                <div key={label as string} className="flex justify-between border-b border-line py-2">
                  <span className="text-mid">{label}</span>
                  <b>{n as number}</b>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-mid">Blocked speakers</h2>
            <ul className="mt-3 space-y-2">
              {data.blockedSpeakers.map((s: any) => (
                <li key={s.speakerId} className="rounded-[18px] bg-soft p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <b>{s.name}</b>
                    <Badge tone={s.pct >= 100 ? "ok" : s.pct > 0 ? "warn" : "danger"}>{s.pct}%</Badge>
                  </div>
                  <p className="mt-1 text-xs text-mid">{s.title}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Missing: {(s.missing || []).map(humanizeMissing).join(" · ")}
                  </p>
                </li>
              ))}
              {!data.blockedSpeakers.length ? (
                <li className="text-sm text-mid">Everyone accepted is ready.</li>
              ) : null}
            </ul>
            <Link className="mt-3 inline-block text-sm font-semibold text-ink" to="/app/speakers">
              View all speakers →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
