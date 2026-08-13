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

export function CommandPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [scheduleUnscheduled, setScheduleUnscheduled] = useState<number | null>(null);
  const nav = useNavigate();

  const load = () =>
    Promise.all([api.command(), api.schedule().catch(() => null)])
      .then(([cmd, sched]) => {
        setData(cmd.data);
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
