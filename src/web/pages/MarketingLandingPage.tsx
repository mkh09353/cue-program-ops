import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import { EVENT_SLUG } from "../lib/utils";

/**
 * Marketing landing page served at "/".
 * Static by design: no data fetching, no images — every visual is Tailwind markup,
 * and every link points at a real seeded route.
 */

const slug = EVENT_SLUG;
const cfpHref = `/e/${slug}/cfp`;
const widgetsHref = `/e/${slug}/public`;

type IconProps = { className?: string };

function Icon({ path, className }: { path: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
    >
      {path}
    </svg>
  );
}

const IconDoc = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </>
    }
  />
);
const IconCheck = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <path d="M9 11l2.5 2.5L16 9" />
        <rect x="3" y="4" width="18" height="16" rx="2" />
      </>
    }
  />
);
const IconUsers = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
        <circle cx="9.5" cy="7.5" r="3.5" />
        <path d="M17 11a3 3 0 1 0-2-5.2M21 20v-1.5a3.5 3.5 0 0 0-2.5-3.35" />
      </>
    }
  />
);
const IconGrid = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 10v10M15 10v10" />
      </>
    }
  />
);
const IconUpload = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <path d="M12 16V5" />
        <path d="M8 9l4-4 4 4" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </>
    }
  />
);
const IconGlobe = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.7 5.7 3.7 9S14.5 18.4 12 21c-2.5-2.6-3.7-5.7-3.7-9S9.5 5.6 12 3z" />
      </>
    }
  />
);
const IconScale = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <path d="M12 4v16M6 8h12" />
        <path d="M6 8 3 15h6zM18 8l-3 7h6z" />
      </>
    }
  />
);
const IconSparkle = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7z" />
        <path d="M18 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
      </>
    }
  />
);

const IconMail = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3.5 7l8.5 6 8.5-6" />
      </>
    }
  />
);
const IconCalendar = (p: IconProps) => (
  <Icon
    {...p}
    path={
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    }
  />
);

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[11px] font-semibold tracking-tight text-white">
        C
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">CUE</span>
      <span className="hidden text-[13px] text-mid sm:inline">Conference Ops</span>
    </span>
  );
}

const roleDemos: {
  title: string;
  blurb: string;
  href: string;
  external?: boolean;
  icon: (p: IconProps) => ReactElement;
}[] = [
  {
    title: "Organizer workspace",
    blurb: "Command center, submissions, review rounds, speakers, schedule and publishing.",
    href: "/app",
    icon: IconGrid,
  },
  {
    title: "Reviewer portal",
    blurb: "A queue scoped to your assignments, weighted scorecards and recusal.",
    href: "/r",
    icon: IconScale,
  },
  {
    title: "Speaker portal",
    blurb: "Talks, onboarding tasks, deliverable uploads and profile details.",
    href: "/p",
    icon: IconUsers,
  },
  {
    title: "Public CFP",
    blurb: "The live submission form with conditional fields, drafts and deadlines.",
    href: cfpHref,
    icon: IconDoc,
  },
  {
    title: "Public widgets",
    blurb: "Embeddable sessions, speakers, agenda, itinerary and gallery pages.",
    href: widgetsHref,
    external: true,
    icon: IconGlobe,
  },
  {
    title: "Demo launcher",
    blurb: "Pick a persona and jump straight into any role with seed data loaded.",
    href: "/demo",
    icon: IconCheck,
  },
];

const features: { title: string; blurb: string; icon: (p: IconProps) => ReactElement }[] = [
  {
    title: "Call for Papers",
    blurb:
      "Build forms with conditional fields, submission limits and deadlines, then route categories to the right review board.",
    icon: IconDoc,
  },
  {
    title: "Abstract review",
    blurb:
      "Assign reviewers, score across multiple rounds with weighted criteria, and track progress to an accept/decline decision.",
    icon: IconScale,
  },
  {
    title: "Speaker management",
    blurb:
      "Accepted submissions become canonical sessions and speakers — onboarding tasks, deadlines and comms without re-entry.",
    icon: IconUsers,
  },
  {
    title: "AI agenda builder",
    blurb:
      "Draft a schedule across rooms and tracks with server-enforced conflict checks. AI suggestions are advisory and explainable.",
    icon: IconSparkle,
  },
  {
    title: "Content management",
    blurb:
      "Collect headshots, slides and supporting files with versions, review states and an unambiguous current version.",
    icon: IconUpload,
  },
  {
    title: "Public widgets",
    blurb:
      "Responsive, iframe-ready sessions, speakers, agenda, itinerary and gallery pages plus JSON and iCal feeds.",
    icon: IconGlobe,
  },
];

const workflow = [
  { step: "01", title: "Configure the CFP", blurb: "Fields, deadlines, limits and review-board routing." },
  { step: "02", title: "Review & decide", blurb: "Scoped reviewer queues, multi-round scoring, results." },
  { step: "03", title: "Onboard speakers", blurb: "Accepted talks become sessions, tasks and deliverables." },
  { step: "04", title: "Schedule & publish", blurb: "Conflict-aware agenda, widgets, feeds and calendar files." },
];

function ModuleTile({
  icon: IconEl,
  title,
  value,
  support,
  children,
  wide,
}: {
  icon: (p: IconProps) => ReactElement;
  title: string;
  value?: string;
  support?: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-xl border border-line bg-white p-3 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-soft text-ink ring-1 ring-line">
          <IconEl className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-mid">{title}</span>
      </div>
      {value ? <div className="mt-2 truncate text-lg font-semibold tracking-tight">{value}</div> : null}
      {children}
      {support ? <div className="mt-1 truncate text-[11px] text-mid">{support}</div> : null}
    </div>
  );
}

function MockScreenshot() {
  const rows = [
    { title: "Evaluating agent frameworks in production", track: "AI Engineering", status: "Under review" },
    { title: "Shipping RAG that survives real users", track: "Applied AI", status: "Accepted" },
    { title: "Observability for LLM pipelines", track: "Platform", status: "Needs 2nd review" },
  ];
  const statusTone: Record<string, string> = {
    Accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "Under review": "bg-indigo-50 text-indigo-700 ring-indigo-200",
    "Needs 2nd review": "bg-amber-50 text-amber-700 ring-amber-200",
  };
  const initials = ["DO", "MF", "PR", "TH", "AK"];
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_-25px_rgba(15,23,42,0.35)] ring-1 ring-black/10">
      <div className="flex items-center gap-2 border-b border-line bg-soft px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        <span className="ml-3 truncate rounded-md bg-white px-2 py-1 text-[11px] text-mid ring-1 ring-line">
          cue.app/app
        </span>
      </div>
      <div className="flex">
        <aside className="hidden w-52 shrink-0 border-r border-line bg-soft p-3 sm:block">
          <div className="mb-3 px-2">
            <Wordmark />
          </div>
          {["Command center", "Submissions", "Review", "Speakers", "Schedule", "Content", "Publish"].map((item, i) => (
            <div
              key={item}
              className={`mb-1 rounded-lg px-2 py-1.5 text-[12px] ${i === 0 ? "bg-ink text-white" : "text-mid"}`}
            >
              {item}
            </div>
          ))}
        </aside>
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight">Command center</h3>
              <p className="truncate text-[12px] text-mid">AI Engineer Summit · Round 2 · 41 days out</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-lg px-2.5 py-1 text-[11px] text-mid ring-1 ring-line">Round 2</span>
              <span className="rounded-lg bg-ink px-2.5 py-1 text-[11px] text-white">Assign reviewers</span>
            </div>
          </div>

          {/* Stat cards */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Submitted", value: "184" },
              { label: "Reviewed", value: "121" },
              { label: "Accepted", value: "38" },
              { label: "Avg score", value: "3.9" },
            ].map((s) => (
              <div key={s.label} className="min-w-0 rounded-xl border border-line bg-white p-3">
                <div className="truncate text-[11px] uppercase tracking-wide text-mid">{s.label}</div>
                <div className="mt-1 text-xl font-semibold tracking-tight">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Module tiles */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <ModuleTile icon={IconDoc} title="Call for papers" value="Open" support="184 submissions · closes Mar 14">
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700 ring-1 ring-indigo-200">
                  3 forms live
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 ring-1 ring-neutral-200">
                  2 boards routed
                </span>
              </div>
            </ModuleTile>

            <ModuleTile icon={IconScale} title="Review" value="121 / 184" support="Round 2 · 14 reviewers active">
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: "66%" }} />
              </div>
            </ModuleTile>

            <ModuleTile icon={IconUsers} title="Speakers" value="34 confirmed" support="41 invited · 7 awaiting reply">
              <div className="mt-2 flex -space-x-1.5">
                {initials.map((n) => (
                  <span
                    key={n}
                    className="grid h-6 w-6 place-items-center rounded-full bg-soft text-[9px] font-medium text-mid ring-1 ring-line"
                  >
                    {n}
                  </span>
                ))}
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[9px] font-medium text-white ring-1 ring-ink">
                  +29
                </span>
              </div>
            </ModuleTile>

            <ModuleTile icon={IconCalendar} title="Schedule" value="38 sessions placed" support="4 rooms · 2 days · 2 conflicts resolved">
              <div className="mt-2 flex gap-1">
                {[3, 5, 4, 6, 5, 4, 2].map((n, i) => (
                  <span
                    key={i}
                    className={`h-6 flex-1 rounded-sm ${i === 3 ? "bg-indigo-500" : "bg-neutral-200"}`}
                    style={{ opacity: 0.4 + n / 10 }}
                  />
                ))}
              </div>
            </ModuleTile>

            <ModuleTile icon={IconUpload} title="Content" value="12 awaiting approval" support="Slides v3 · headshots 31 / 34 received">
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 ring-1 ring-amber-200">
                  9 slide decks
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 ring-1 ring-neutral-200">
                  3 bios
                </span>
              </div>
            </ModuleTile>

            <ModuleTile icon={IconMail} title="Communications" value="Acceptances sent" support="38 recipients · 0 failures">
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700 ring-1 ring-indigo-200">
                  2 reminders scheduled
                </span>
              </div>
            </ModuleTile>

            <ModuleTile
              icon={IconGlobe}
              title="Publish & widgets"
              value="26 / 38 published"
              support="Sessions, speakers, agenda, itinerary, gallery"
            >
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
                  Widgets live
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 ring-1 ring-neutral-200">
                  Synced to Accelevents
                </span>
              </div>
            </ModuleTile>

            {/* Recent submissions, compact */}
            <div className="min-w-0 rounded-xl border border-line bg-white p-3 sm:col-span-2">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-soft text-ink ring-1 ring-line">
                  <IconGrid className="h-3.5 w-3.5" />
                </span>
                <span className="truncate text-[11px] font-medium uppercase tracking-wide text-mid">
                  Recent submissions
                </span>
              </div>
              <table className="mt-2 w-full table-fixed text-left text-[12px]">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.title} className="border-t border-line first:border-t-0">
                      <td className="truncate py-2 pr-2 font-medium text-ink">{r.title}</td>
                      <td className="hidden w-28 truncate py-2 pr-2 text-mid md:table-cell">{r.track}</td>
                      <td className="w-32 py-2 text-right">
                        <span
                          className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] ring-1 ${statusTone[r.status]}`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketingLandingPage() {
  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-line/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link to="/" className="shrink-0">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] text-mid md:flex">
            <a href="#platform" className="transition hover:text-ink">Platform</a>
            <a href="#workflow" className="transition hover:text-ink">Workflow</a>
            <a href="#widgets" className="transition hover:text-ink">Widgets</a>
          </nav>
          <div className="flex items-center gap-2">
            {/* Real cookie-session sign-in (with one-click demo entry on that page). */}
            <Link to="/login" className="rounded-full px-3 py-2 text-[13px] text-mid transition hover:text-ink">
              Log in
            </Link>
            <Link
              to="/demo"
              className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-ink-soft"
            >
              Explore the live demo
            </Link>
          </div>
        </div>
      </header>

      {/* Hero + product mock inside a tinted panel */}
      <section className="px-4 pt-6 sm:px-5">
        <div
          className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-indigo-50/70 px-5 pb-10 pt-14 sm:px-10 sm:pb-14 sm:pt-20"
          style={{
            backgroundImage:
              "radial-gradient(rgba(79,70,229,0.16) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/50 via-transparent to-white/70" />
          <div className="relative mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[12px] font-medium text-indigo-700 ring-1 ring-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              Open-source conference program operations
            </span>
            <h1
              className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
              style={{ letterSpacing: "-0.04em" }}
            >
              One platform for CFPs, speakers, sessions and content
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-neutral-600 sm:text-lg">
              CUE runs the whole program loop — call for papers, abstract review, speaker onboarding,
              a conflict-aware agenda and public widgets — on canonical data you own. An open-source
              alternative to Sessionboard, free to run and inspect.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/app"
                className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-ink-soft sm:w-auto"
              >
                Explore the platform
              </Link>
              <a
                href="#demos"
                className="w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-ink ring-1 ring-line transition hover:ring-neutral-300 sm:w-auto"
              >
                See demos by role
              </a>
            </div>
            <p className="mt-4 text-[12px] text-neutral-500">
              No signup. The demo loads a seeded event with real submissions, reviewers and sessions.
            </p>
          </div>

          <div className="relative mx-auto mt-12 max-w-5xl">
            <MockScreenshot />
          </div>
        </div>
      </section>

      {/* Demos by type */}
      <section id="demos" className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">Demos by type</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            Every role, running on the same seeded event
          </h2>
          <p className="mt-3 text-neutral-600">
            Organizers, reviewers, speakers and the public read the same canonical records, so a change
            in one shell shows up in the others.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roleDemos.map((d) => {
            const IconEl = d.icon;
            const body = (
              <>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                  <IconEl className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight">{d.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">{d.blurb}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink">
                  Open demo <span aria-hidden="true">→</span>
                </span>
              </>
            );
            const cls =
              "group flex flex-col rounded-2xl border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-card";
            return d.external ? (
              <a key={d.title} href={d.href} className={cls}>
                {body}
              </a>
            ) : (
              <Link key={d.title} to={d.href} className={cls}>
                {body}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Feature grid */}
      <section id="platform" className="border-y border-line bg-soft">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <div className="max-w-2xl">
            <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">Platform</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              The modules a program team actually runs
            </h2>
            <p className="mt-3 text-neutral-600">
              Each module is implemented in the demo — rules are enforced on the server, not just in the UI.
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-line sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const IconEl = f.icon;
              return (
                <div key={f.title} className="bg-white p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white">
                    <IconEl className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">{f.blurb}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">Workflow</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            One loop, no re-entry between steps
          </h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {workflow.map((w) => (
            <div key={w.step} className="rounded-2xl border border-line bg-white p-5">
              <div className="text-[12px] font-semibold tabular-nums text-indigo-600">{w.step}</div>
              <h3 className="mt-2 text-base font-semibold tracking-tight">{w.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">{w.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Widgets */}
      <section id="widgets" className="border-t border-line bg-soft">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">Public widgets</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
              Publish the program anywhere
            </h2>
            <p className="mt-3 text-neutral-600">
              Responsive, iframe-ready pages for sessions, speakers, agenda, itinerary and the speaker
              gallery — plus JSON and iCal feeds. All of them read published records only.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={widgetsHref}
                className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-ink-soft"
              >
                Browse the widgets
              </a>
              <a
                href={cfpHref}
                className="rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-ink ring-1 ring-line transition hover:ring-neutral-300"
              >
                Open the public CFP
              </a>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Sessions", href: `/e/${slug}/public/sessions`, blurb: "Published catalog with search" },
              { label: "Speakers", href: `/e/${slug}/public/speakers`, blurb: "Bios paired with sessions" },
              { label: "Agenda", href: `/e/${slug}/public/agenda`, blurb: "Room × time, by day" },
              { label: "Itinerary", href: `/e/${slug}/public/itinerary`, blurb: "Chronological + my schedule" },
              { label: "Gallery", href: `/e/${slug}/public/gallery`, blurb: "Visual speaker directory" },
              { label: "JSON feed", href: `/e/${slug}/public/feed.json`, blurb: "Machine-readable program" },
            ].map((w) => (
              <a
                key={w.label}
                href={w.href}
                className="rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-card"
              >
                <div className="text-[13px] font-semibold tracking-tight">{w.label}</div>
                <div className="mt-1 text-[12px] text-neutral-600">{w.blurb}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="rounded-[28px] bg-ink px-6 py-12 text-center text-white sm:px-12 sm:py-16">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
            Run the whole program loop yourself
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-neutral-300">
            The demo is open and writable — submit to the CFP, score an abstract, accept it and watch the
            session, speaker and widgets update.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/app"
              className="w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-ink transition hover:bg-neutral-200 sm:w-auto"
            >
              Explore the platform
            </Link>
            <Link
              to="/demo"
              className="w-full rounded-full px-6 py-3 text-sm font-medium text-white ring-1 ring-white/30 transition hover:ring-white/60 sm:w-auto"
            >
              Pick a demo persona
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Wordmark />
            <p className="mt-2 max-w-md text-[12px] text-mid">
              Open-source conference program operations, MIT licensed. This site is a public demo running
              on seeded data — no accounts, no billing, no customer data.
            </p>
          </div>
          <div className="flex flex-wrap gap-5 text-[13px] text-mid">
            <Link to="/demo" className="transition hover:text-ink">Demo launcher</Link>
            <Link to="/app" className="transition hover:text-ink">Organizer</Link>
            <a href={cfpHref} className="transition hover:text-ink">Public CFP</a>
            <a href={widgetsHref} className="transition hover:text-ink">Widgets</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default MarketingLandingPage;
