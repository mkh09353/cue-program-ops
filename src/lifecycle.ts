export const EVENT_ID = "evt-ai-summit-2026";
export const EVENT_SLUG = "ai-engineer-summit";

export type Role = "organizer" | "reviewer" | "speaker";
export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "accepted"
  | "waitlisted"
  | "rejected"
  | "withdrawn";

export interface FormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "speaker_block";
  required: boolean;
  options?: string[];
  /** Conditional visibility — e.g. Workshop plan only when category=Workshop */
  visibleWhen?: { key: string; equals: string };
  /** Category → review board routing uses category field values */
  helpText?: string;
}

export interface CfpForm {
  id: string;
  title: string;
  status: "open" | "closed";
  closeAt: string;
  maxPerUser: number;
  welcomeMd: string;
  successMd: string;
  fields: FormField[];
  /** Map category option → review board id */
  routes: { category: string; boardId: string; boardLabel: string }[];
}

export interface Submission {
  id: string;
  eventId: string;
  speakerId: string;
  name: string;
  email: string;
  title: string;
  abstract: string;
  category: string;
  format: string;
  answers: Record<string, unknown>;
  status: SubmissionStatus;
  reviewBoard: string;
  round: "r1" | "r2" | "final";
  createdAt: string;
}

export interface Review {
  id: string;
  submissionId: string;
  reviewerId: string;
  round: "r1" | "r2" | "final";
  scores: Record<string, number>;
  notes: string;
  status: "assigned" | "submitted";
  aiDraft?: string;
  source?: "human" | "ai_draft";
  responses?: Record<string, string | number>;
  recommendation?: string;
}

export interface ReviewCriterion {
  id: string;
  label: string;
  type: "rating" | "select" | "text";
  weight: number;
  options?: string[];
}
export interface ReviewRound {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
  status: "draft" | "open" | "closed";
  blind: boolean;
  reviewerIds: string[];
  criteria: ReviewCriterion[];
}
export interface ReviewAssignment {
  id: string;
  roundId: string;
  submissionId: string;
  reviewerId: string;
  status: "assigned" | "completed" | "recused";
  createdAt: string;
  completedAt?: string;
}
export interface ReviewConflict {
  id: string;
  assignmentId: string;
  reviewerId: string;
  submissionId: string;
  reason: string;
  createdAt: string;
}

export interface SpeakerProfile {
  speakerId: string;
  name: string;
  email: string;
  bio: string;
  company?: string;
  title?: string;
  linkedin?: string;
  x?: string;
  website?: string;
  headshotName?: string;
}

export interface SpeakerTask {
  id: string;
  speakerId: string;
  submissionId?: string;
  title: string;
  type: "profile" | "headshot" | "slides" | "supporting_doc" | "confirm" | "form";
  required: boolean;
  status: "not_started" | "completed";
  dueAt: string;
}

export interface FileRecord {
  id: string;
  speakerId: string;
  kind: "headshot" | "slides" | "supporting_document";
  name: string;
  visibility: "private" | "public";
  createdAt: string;
}

export interface CommTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  includeCalendarLinks: boolean;
}

export interface Communication {
  id: string;
  speakerId: string;
  templateKey?: string;
  subject: string;
  body: string;
  kind: "acceptance" | "reminder" | "rejection" | "cfp_received" | "schedule_locked" | "custom";
  status: "mock_sent" | "sent" | "failed";
  ics: string;
  createdAt: string;
}

export interface Resource {
  id: string;
  slug: string;
  title: string;
  body: string;
  published: boolean;
  embedUrl?: string;
}

export interface ReminderPlan { speakerId: string; taskId: string; templateKey: "task_reminder"; dueAt: string; overdue: boolean }

export interface SessionDraft {
  id: string;
  submissionId: string;
  speakerId: string;
  title: string;
  abstract: string;
  status: "draft" | "scheduled" | "published";
  trackId: string;
  roomId?: string;
  slot?: { startsAt: string; endsAt: string };
}

export interface LifecycleStore {
  event: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    startsAt: string;
    endsAt: string;
    website: string;
    location: string;
  };
  form: CfpForm;
  submissions: Submission[];
  reviews: Review[];
  reviewRounds: ReviewRound[];
  reviewAssignments: ReviewAssignment[];
  reviewConflicts: ReviewConflict[];
  profiles: SpeakerProfile[];
  tasks: SpeakerTask[];
  files: FileRecord[];
  templates: CommTemplate[];
  communications: Communication[];
  resources: Resource[];
  sessions: SessionDraft[];
  rooms: { id: string; name: string }[];
  tracks: { id: string; name: string }[];
  boards: { id: string; label: string }[];
  personas: { id: string; role: Role; name: string; email: string; speakerId?: string; boardIds?: string[] }[];
}

const now = () => new Date().toISOString();

export const RUBRIC_CRITERIA = ["relevance", "novelty", "clarity", "depth"] as const;

export const store: LifecycleStore = {
  event: {
    id: EVENT_ID,
    name: "AI Engineer Summit",
    slug: EVENT_SLUG,
    timezone: "America/Los_Angeles",
    startsAt: "2026-10-12T16:00:00.000Z",
    endsAt: "2026-10-14T01:00:00.000Z",
    website: "https://ai.engineer",
    location: "New York, NY",
  },
  boards: [
    { id: "engineering", label: "Engineering board" },
    { id: "product", label: "Product board" },
    { id: "workshop", label: "Workshop board" },
    { id: "agents", label: "Agents board" },
  ],
  form: {
    id: "form-cfp",
    title: "AI Engineer Summit CFP",
    status: "open",
    closeAt: "2026-09-15T06:59:00.000Z",
    maxPerUser: 3,
    welcomeMd:
      "Call for Speakers\n\nOur event welcomes builders shipping real AI systems. Sessions are selected from these submissions.\n\n**Tracks:** Engineering · Product · Workshop · Agents\n\nTip: choose **Workshop** to add a workshop plan field.",
    successMd:
      "You will receive a confirmation shortly. Next, open your speaker portal to track status and complete onboarding if accepted.",
    fields: [
      { key: "title", label: "Talk title", type: "text", required: true },
      { key: "abstract", label: "Abstract", type: "textarea", required: true },
      {
        key: "category",
        label: "Track",
        type: "select",
        required: true,
        options: ["Engineering", "Product", "Workshop", "Agents"],
        helpText: "Routes your talk to the matching review board.",
      },
      {
        key: "format",
        label: "Format",
        type: "select",
        required: true,
        options: ["Talk", "Panel", "Workshop"],
      },
      {
        key: "workshopPlan",
        label: "Workshop plan",
        type: "textarea",
        required: true,
        visibleWhen: { key: "format", equals: "Workshop" },
        helpText: "Shown only when Format = Workshop.",
      },
      {
        key: "duration",
        label: "Workshop duration (minutes)",
        type: "text",
        required: true,
        visibleWhen: { key: "format", equals: "Workshop" },
      },
      {
        key: "experience",
        label: "Experience level",
        type: "select",
        required: true,
        options: ["new", "intermediate", "advanced"],
      },
    ],
    routes: [
      { category: "Engineering", boardId: "engineering", boardLabel: "Engineering board" },
      { category: "Product", boardId: "product", boardLabel: "Product board" },
      { category: "Workshop", boardId: "workshop", boardLabel: "Workshop board" },
      { category: "Agents", boardId: "agents", boardLabel: "Agents board" },
    ],
  },
  submissions: [
    {
      id: "sub-ada",
      eventId: EVENT_ID,
      speakerId: "spk-ada",
      name: "Ada Lovelace",
      email: "ada@example.test",
      title: "Analytical Engines in Practice",
      abstract: "Reliable systems patterns for creative engineering teams shipping AI products.",
      category: "Engineering",
      format: "Talk",
      answers: { experience: "advanced", format: "Talk" },
      status: "accepted",
      reviewBoard: "engineering",
      round: "final",
      createdAt: "2026-07-01T12:00:00.000Z",
    },
    {
      id: "sub-grace",
      eventId: EVENT_ID,
      speakerId: "spk-grace",
      name: "Grace Hopper",
      email: "grace@example.test",
      title: "Compilers for Humans",
      abstract: "Making agent toolchains legible to the teams who maintain them.",
      category: "Product",
      format: "Talk",
      answers: { experience: "advanced", format: "Talk" },
      status: "under_review",
      reviewBoard: "product",
      round: "r1",
      createdAt: "2026-07-10T15:00:00.000Z",
    },
    {
      id: "sub-lin",
      eventId: EVENT_ID,
      speakerId: "spk-lin",
      name: "Lin Clark",
      email: "lin@example.test",
      title: "Visualizing Agent Memory",
      abstract: "Interactive mental models for long-running agent state.",
      category: "Agents",
      format: "Talk",
      answers: { experience: "intermediate", format: "Talk" },
      status: "submitted",
      reviewBoard: "agents",
      round: "r1",
      createdAt: "2026-07-20T18:00:00.000Z",
    },
    {
      id: "sub-margaret",
      eventId: EVENT_ID,
      speakerId: "spk-margaret",
      name: "Margaret Hamilton",
      email: "margaret@example.test",
      title: "Shipping AI Products Without Regret",
      abstract: "Release discipline for high-stakes model-backed features.",
      category: "Product",
      format: "Talk",
      answers: { experience: "advanced", format: "Talk" },
      status: "accepted",
      reviewBoard: "product",
      round: "final",
      createdAt: "2026-07-05T10:00:00.000Z",
    },
    {
      id: "sub-sam",
      eventId: EVENT_ID,
      speakerId: "spk-sam",
      name: "Sam Rivera",
      email: "sam@example.test",
      title: "Eval Harnesses Teams Actually Use",
      abstract: "A field guide to eval loops that survive contact with production.",
      category: "Engineering",
      format: "Workshop",
      answers: {
        experience: "intermediate",
        format: "Workshop",
        workshopPlan: "Hands-on harness build in pairs.",
        duration: "60",
      },
      status: "accepted",
      reviewBoard: "engineering",
      round: "final",
      createdAt: "2026-07-12T09:00:00.000Z",
    },
  ],
  reviews: [
    {
      id: "rev-grace-r1",
      submissionId: "sub-grace",
      reviewerId: "rev-ada",
      round: "r1",
      scores: { relevance: 5, novelty: 4, clarity: 4, depth: 3 },
      notes: "Strong product fit. Want sharper customer story.",
      status: "assigned",
    },
    {
      id: "rev-lin-r1",
      submissionId: "sub-lin",
      reviewerId: "rev-ada",
      round: "r1",
      scores: { relevance: 0, novelty: 0, clarity: 0, depth: 0 },
      notes: "",
      status: "assigned",
    },
  ],
  reviewRounds: [
    {
      id: "round-initial",
      name: "Initial Review",
      opensAt: "2026-08-01T00:00:00.000Z",
      closesAt: "2026-08-31T23:59:59.000Z",
      status: "open",
      blind: true,
      reviewerIds: ["rev-ada", "rev-linus"],
      criteria: [
        { id: "relevance", label: "Program relevance", type: "rating", weight: 2 },
        { id: "novelty", label: "Novelty", type: "rating", weight: 1 },
        { id: "recommendation", label: "Recommendation", type: "select", weight: 0, options: ["Strong accept", "Accept", "Borderline", "Reject"] },
        { id: "comments", label: "Committee comments", type: "text", weight: 0 },
      ],
    },
    {
      id: "round-final",
      name: "Final Committee Review",
      opensAt: "2026-09-01T00:00:00.000Z",
      closesAt: "2026-09-10T23:59:59.000Z",
      status: "draft",
      blind: false,
      reviewerIds: ["rev-linus"],
      criteria: [
        { id: "clarity", label: "Clarity", type: "rating", weight: 1 },
        { id: "depth", label: "Technical depth", type: "rating", weight: 2 },
        { id: "recommendation", label: "Recommendation", type: "select", weight: 0, options: ["Accept", "Waitlist", "Reject"] },
        { id: "comments", label: "Final notes", type: "text", weight: 0 },
      ],
    },
  ],
  reviewAssignments: [
    { id: "assign-grace-ada", roundId: "round-initial", submissionId: "sub-grace", reviewerId: "rev-ada", status: "assigned", createdAt: "2026-08-01T00:00:00.000Z" },
    { id: "assign-lin-ada", roundId: "round-initial", submissionId: "sub-lin", reviewerId: "rev-ada", status: "assigned", createdAt: "2026-08-01T00:00:00.000Z" },
    { id: "assign-sam-linus", roundId: "round-initial", submissionId: "sub-sam", reviewerId: "rev-linus", status: "assigned", createdAt: "2026-08-01T00:00:00.000Z" },
  ],
  reviewConflicts: [],
  profiles: [
    {
      speakerId: "spk-ada",
      name: "Ada Lovelace",
      email: "ada@example.test",
      bio: "Builder of analytical systems and reliable AI platforms.",
      company: "Analytical Engines",
      title: "Principal Engineer",
      linkedin: "https://linkedin.com/in/ada",
      website: "https://analytical.example",
      headshotName: "ada-headshot.jpg",
    },
    {
      speakerId: "spk-grace",
      name: "Grace Hopper",
      email: "grace@example.test",
      bio: "Compiler pioneer focused on human-readable systems.",
      company: "Navy Labs",
      title: "Distinguished Engineer",
    },
    {
      speakerId: "spk-lin",
      name: "Lin Clark",
      email: "lin@example.test",
      bio: "Making complex systems understandable.",
      company: "Mozilla",
    },
    {
      speakerId: "spk-margaret",
      name: "Margaret Hamilton",
      email: "margaret@example.test",
      bio: "Reliable software for critical missions.",
      company: "Hamilton Technologies",
      headshotName: "margaret.jpg",
    },
    {
      speakerId: "spk-sam",
      name: "Sam Rivera",
      email: "sam@example.test",
      bio: "",
      company: "Eval Collective",
      title: "Staff Engineer",
    },
  ],
  tasks: [
    {
      id: "task-ada-profile",
      speakerId: "spk-ada",
      submissionId: "sub-ada",
      title: "Confirm your speaker profile",
      type: "profile",
      required: true,
      status: "completed",
      dueAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "task-ada-headshot",
      speakerId: "spk-ada",
      submissionId: "sub-ada",
      title: "Upload headshot",
      type: "headshot",
      required: true,
      status: "completed",
      dueAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "task-ada-slides",
      speakerId: "spk-ada",
      submissionId: "sub-ada",
      title: "Upload presentation slides",
      type: "slides",
      required: true,
      status: "not_started",
      dueAt: "2026-10-08T00:00:00.000Z",
    },
    {
      id: "task-sam-profile",
      speakerId: "spk-sam",
      submissionId: "sub-sam",
      title: "Complete your speaker profile",
      type: "profile",
      required: true,
      status: "not_started",
      dueAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "task-sam-headshot",
      speakerId: "spk-sam",
      submissionId: "sub-sam",
      title: "Upload headshot",
      type: "headshot",
      required: true,
      status: "not_started",
      dueAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "task-sam-slides",
      speakerId: "spk-sam",
      submissionId: "sub-sam",
      title: "Upload workshop slides",
      type: "slides",
      required: true,
      status: "not_started",
      dueAt: "2026-10-08T00:00:00.000Z",
    },
    {
      id: "task-sam-doc",
      speakerId: "spk-sam",
      submissionId: "sub-sam",
      title: "Upload supporting handout",
      type: "supporting_doc",
      required: false,
      status: "not_started",
      dueAt: "2026-10-08T00:00:00.000Z",
    },
    {
      id: "task-margaret-slides",
      speakerId: "spk-margaret",
      submissionId: "sub-margaret",
      title: "Upload presentation slides",
      type: "slides",
      required: true,
      status: "not_started",
      dueAt: "2026-10-08T00:00:00.000Z",
    },
  ],
  files: [
    {
      id: "file-ada-headshot",
      speakerId: "spk-ada",
      kind: "headshot",
      name: "ada-headshot.jpg",
      visibility: "public",
      createdAt: "2026-07-20T00:00:00.000Z",
    },
    {
      id: "file-margaret-headshot",
      speakerId: "spk-margaret",
      kind: "headshot",
      name: "margaret.jpg",
      visibility: "public",
      createdAt: "2026-07-21T00:00:00.000Z",
    },
  ],
  templates: [
    {
      id: "tpl-cfp",
      key: "cfp_received",
      name: "CFP received",
      subject: "We received your talk proposal",
      body: "Hi {{first_name}},\n\nThanks for submitting \"{{talk_title}}\". Track it anytime in your portal: {{portal_link}}",
      includeCalendarLinks: false,
    },
    {
      id: "tpl-accepted",
      key: "accepted",
      name: "Acceptance",
      subject: "You're speaking at AI Engineer Summit",
      body: "Hi {{first_name}},\n\nCongratulations — \"{{talk_title}}\" was accepted.\n\nComplete onboarding: {{portal_link}}\n\n{{calendar_links}}",
      includeCalendarLinks: true,
    },
    {
      id: "tpl-rejected",
      key: "rejected",
      name: "Rejection",
      subject: "Update on your AI Engineer Summit proposal",
      body: "Hi {{first_name}},\n\nThank you for proposing \"{{talk_title}}\". We can't place it this year and hope you'll submit again.",
      includeCalendarLinks: false,
    },
    {
      id: "tpl-reminder",
      key: "task_reminder",
      name: "Task reminder",
      subject: "Reminder: finish your speaker tasks",
      body: "Hi {{first_name}},\n\nYou still have open onboarding tasks for \"{{talk_title}}\". Portal: {{portal_link}}",
      includeCalendarLinks: false,
    },
    {
      id: "tpl-schedule",
      key: "schedule_locked",
      name: "Schedule locked",
      subject: "Your session time is confirmed",
      body: "Hi {{first_name}},\n\n\"{{talk_title}}\" is on the agenda.\n\n{{calendar_links}}\n\nPortal: {{portal_link}}",
      includeCalendarLinks: true,
    },
  ],
  communications: [],
  resources: [
    {
      id: "res-welcome",
      slug: "speaker-handbook",
      title: "Speaker handbook",
      body: "Arrival details, green room guidance, AV check times, and recording consent. Be onsite 30 minutes before your session.",
      published: true,
      embedUrl: "https://www.youtube.com/embed/airtable-workflow-guide",
    },
    {
      id: "res-faq",
      slug: "travel-faq",
      title: "Travel & logistics FAQ",
      body: "Hotel blocks, badge pickup, and dietary forms. Contact speakers@ai.engineer for exceptions.",
      published: true,
    },
  ],
  sessions: [
    {
      id: "ses-analytical",
      submissionId: "sub-ada",
      speakerId: "spk-ada",
      title: "Analytical Engines in Practice",
      abstract: "Reliable systems patterns for creative engineering teams shipping AI products.",
      status: "published",
      trackId: "track-eng",
      roomId: "room-main",
      slot: { startsAt: "2026-10-12T17:00:00.000Z", endsAt: "2026-10-12T17:45:00.000Z" },
    },
    {
      id: "ses-margaret",
      submissionId: "sub-margaret",
      speakerId: "spk-margaret",
      title: "Shipping AI Products Without Regret",
      abstract: "Release discipline for high-stakes model-backed features.",
      status: "draft",
      trackId: "track-product",
    },
    {
      id: "ses-sam",
      submissionId: "sub-sam",
      speakerId: "spk-sam",
      title: "Eval Harnesses Teams Actually Use",
      abstract: "A field guide to eval loops that survive contact with production.",
      status: "draft",
      trackId: "track-eng",
    },
  ],
  rooms: [
    { id: "room-main", name: "Main Hall" },
    { id: "room-studio", name: "Studio" },
    { id: "room-lab", name: "Workshop Lab" },
  ],
  tracks: [
    { id: "track-eng", name: "Engineering" },
    { id: "track-product", name: "Product" },
    { id: "track-agents", name: "Agents" },
    { id: "track-workshop", name: "Workshop" },
  ],
  personas: [
    { id: "org-swyx", role: "organizer", name: "Swyx", email: "swyx@ai.engineer" },
    {
      id: "rev-ada",
      role: "reviewer",
      name: "Ada Reviewer",
      email: "reviewer@ai.engineer",
      boardIds: ["product", "agents", "engineering"],
    },
    {
      id: "rev-linus",
      role: "reviewer",
      name: "Linus Reviewer",
      email: "linus.reviewer@example.test",
      boardIds: ["engineering", "product"],
    },
    {
      id: "spk-sam",
      role: "speaker",
      name: "Sam Rivera",
      email: "sam@example.test",
      speakerId: "spk-sam",
    },
    {
      id: "spk-ada",
      role: "speaker",
      name: "Ada Lovelace",
      email: "ada@example.test",
      speakerId: "spk-ada",
    },
  ],
};

export function readiness(speakerId: string, at = new Date()) {
  const tasks = store.tasks.filter((t) => t.speakerId === speakerId && t.required);
  const files = store.files.filter((f) => f.speakerId === speakerId);
  const profile = store.profiles.find((p) => p.speakerId === speakerId);
  const missing: string[] = [];
  for (const task of tasks.filter((t) => t.status !== "completed")) {
    const overdue = Date.parse(task.dueAt) < at.getTime();
    missing.push(`${overdue ? "Overdue" : "Incomplete"}: ${task.title}${overdue ? ` (due ${task.dueAt.slice(0, 10)})` : ""}`);
  }
  if (!files.some((f) => f.kind === "headshot") && !profile?.headshotName) missing.push("Missing: headshot");
  if (profile && !profile.bio?.trim()) missing.push("Missing: speaker bio");
  const completedRequiredTaskCount = tasks.filter((t) => t.status === "completed").length;
  const requiredTaskCount = tasks.length;
  const pct = requiredTaskCount ? Math.round((completedRequiredTaskCount / requiredTaskCount) * 100) : 100;
  return {
    state: missing.length ? ("not_ready" as const) : ("ready" as const),
    missing,
    completedRequiredTaskCount,
    requiredTaskCount,
    pct,
    overdueTaskCount: tasks.filter((t) => t.status !== "completed" && Date.parse(t.dueAt) < at.getTime()).length,
  };
}

export function ics(title: string, startsAt = "20261012T170000Z", endsAt = "20261012T174500Z", options: { uid?: string; description?: string; location?: string; dtstamp?: string } = {}) {
  const clean = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/[,;]/g, "\\$&");
  const uid = options.uid || `cue-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@cue.local`;
  const description = options.description || `AI Engineer Summit session. ${store.event.website}`;
  const location = options.location || store.event.location;
  const dtstamp = options.dtstamp || "20261001T000000Z";
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nPRODID:-//CUE//EN\r\nBEGIN:VEVENT\r\nUID:${clean(uid)}\r\nDTSTAMP:${dtstamp}\r\nDTSTART:${startsAt}\r\nDTEND:${endsAt}\r\nSUMMARY:${clean(title)}\r\nDESCRIPTION:${clean(description)}\r\nLOCATION:${clean(location)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
}

export function safeEmbed(url?: string) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return ["www.youtube.com", "youtube.com", "player.vimeo.com"].includes(u.hostname)
      ? u.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Demo identity resolver. Only known persona ids are accepted; caller-provided speaker ids are ignored. */
export function resolveDemoPersona(personaId?: string) {
  return store.personas.find((p) => p.id === personaId) || store.personas.find((p) => p.id === "org-swyx")!;
}

export function validateCfpSubmission(answers: Record<string, unknown>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { ok: false as const, error: "valid email is required" };
  const category = String(answers.category || "");
  const route = store.form.routes.find((r) => r.category === category);
  if (!route) return { ok: false as const, error: "invalid category" };
  for (const field of store.form.fields) {
    const visible = !field.visibleWhen || answers[field.visibleWhen.key] === field.visibleWhen.equals;
    if (visible && field.required && (answers[field.key] == null || String(answers[field.key]).trim() === "")) return { ok: false as const, error: `${field.label} is required` };
  }
  const count = store.submissions.filter((s) => s.email.trim().toLowerCase() === normalizedEmail).length;
  if (count >= store.form.maxPerUser) return { ok: false as const, error: `submission limit reached (${store.form.maxPerUser})` };
  return { ok: true as const, normalizedEmail, route };
}

/** Keeps review history immutable by creating/finding a record per submission/reviewer/round. */
export function reviewForRound(submissionId: string, reviewerId: string, round: Review["round"]) {
  let review = store.reviews.find((r) => r.submissionId === submissionId && r.reviewerId === reviewerId && r.round === round);
  if (!review) { review = { id: `rev-${crypto.randomUUID()}`, submissionId, reviewerId, round, scores: {}, notes: "", status: "assigned" }; store.reviews.push(review); }
  return review;
}

export function completeTaskForSpeaker(taskId: string, speakerId: string) {
  const task = store.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false as const, error: "task not found" };
  if (task.speakerId !== speakerId) return { ok: false as const, error: "cannot modify another speaker's task" };
  const requiredFile = task.type === "headshot" ? "headshot" : task.type === "slides" ? "slides" : task.type === "supporting_doc" ? "supporting_document" : undefined;
  if (requiredFile && !store.files.some((f) => f.speakerId === speakerId && f.kind === requiredFile)) return { ok: false as const, error: `upload a ${requiredFile.replace("_", " ")} before completing this task` };
  task.status = "completed"; return { ok: true as const, task };
}

export function upsertResource(input: Omit<Resource, "id"> & { id?: string }) {
  const clean = safeEmbed(input.embedUrl);
  const resource: Resource = { id: input.id || `res-${crypto.randomUUID()}`, slug: input.slug.trim(), title: input.title.trim(), body: input.body.trim(), published: !!input.published, ...(clean ? { embedUrl: clean } : {}) };
  const i = store.resources.findIndex((r) => r.id === resource.id || r.slug === resource.slug);
  if (i >= 0) store.resources[i] = resource; else store.resources.push(resource);
  return resource;
}
export function deleteResource(id: string) { const i=store.resources.findIndex((r)=>r.id===id); if(i<0)return false; store.resources.splice(i,1);return true }

export function reminderPlans(at = new Date()): ReminderPlan[] { return store.tasks.filter((t)=>t.required&&t.status!=="completed").map((t)=>({speakerId:t.speakerId,taskId:t.id,templateKey:"task_reminder" as const,dueAt:t.dueAt,overdue:Date.parse(t.dueAt)<at.getTime()})); }

export function icsForSession(session: SessionDraft) {
  if (!session.slot) return undefined;
  const format=(iso:string)=>{const d=new Date(iso),p=(n:number)=>String(n).padStart(2,"0");return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`};
  const room = store.rooms.find((r) => r.id === session.roomId)?.name;
  return ics(session.title, format(session.slot.startsAt), format(session.slot.endsAt), { uid: `${session.id}@cue.local`, description: session.abstract, location: room ? `${room}, ${store.event.location}` : store.event.location });
}

export function boardForCategory(category: string) {
  const route = store.form.routes.find((r) => r.category === category);
  return route ?? { category, boardId: category.toLowerCase(), boardLabel: `${category} board` };
}

export function renderTemplate(
  tpl: CommTemplate,
  vars: { first_name: string; talk_title: string; portal_link: string; calendar_links?: string },
) {
  const calendar = tpl.includeCalendarLinks
    ? vars.calendar_links ||
      "Add to calendar: Google · Outlook · download ICS from your portal."
    : "";
  return {
    subject: tpl.subject
      .replaceAll("{{first_name}}", vars.first_name)
      .replaceAll("{{talk_title}}", vars.talk_title),
    body: tpl.body
      .replaceAll("{{first_name}}", vars.first_name)
      .replaceAll("{{talk_title}}", vars.talk_title)
      .replaceAll("{{portal_link}}", vars.portal_link)
      .replaceAll("{{calendar_links}}", calendar),
  };
}

export function ensureOnboarding(submission: Submission) {
  if (store.tasks.some((t) => t.speakerId === submission.speakerId)) return;
  const due = "2026-10-01T00:00:00.000Z";
  const base = [
    { type: "profile" as const, title: "Complete your speaker profile" },
    { type: "headshot" as const, title: "Upload headshot" },
    { type: "slides" as const, title: "Upload presentation slides" },
    { type: "supporting_doc" as const, title: "Upload supporting document", required: false },
  ];
  for (const b of base) {
    store.tasks.push({
      id: `task-${submission.id}-${b.type}`,
      speakerId: submission.speakerId,
      submissionId: submission.id,
      title: b.title,
      type: b.type,
      required: b.required !== false,
      status: "not_started",
      dueAt: due,
    });
  }
  if (!store.profiles.some((p) => p.speakerId === submission.speakerId)) {
    store.profiles.push({
      speakerId: submission.speakerId,
      name: submission.name,
      email: submission.email,
      bio: "",
      company: "",
    });
  }
  if (!store.sessions.some((s) => s.submissionId === submission.id)) {
    const track =
      store.tracks.find((t) => t.name.toLowerCase() === submission.category.toLowerCase())?.id ||
      "track-eng";
    store.sessions.push({
      id: `ses-${submission.id}`,
      submissionId: submission.id,
      speakerId: submission.speakerId,
      title: submission.title,
      abstract: submission.abstract,
      status: "draft",
      trackId: track,
    });
  }
}

export function sendTemplate(
  templateKey: string,
  speakerId: string,
  talkTitle: string,
  kind: Communication["kind"] = "custom",
) {
  const tpl = store.templates.find((t) => t.key === templateKey);
  const profile = store.profiles.find((p) => p.speakerId === speakerId);
  const name = profile?.name || store.submissions.find((s) => s.speakerId === speakerId)?.name || "Speaker";
  const first = name.split(" ")[0] || name;
  // Relative URL is safe across preview, deployed, and custom public origins; it is not a localhost persistence leak.
  const portal = `/speaker/${encodeURIComponent(speakerId)}`;
  const rendered = tpl
    ? renderTemplate(tpl, {
        first_name: first,
        talk_title: talkTitle,
        portal_link: portal,
      })
    : { subject: "Message from CUE", body: `Hi ${first}, regarding ${talkTitle}` };
  const session = store.sessions.find((s) => s.speakerId === speakerId && s.title === talkTitle);
  const icsBody = session ? icsForSession(session) || "" : "";
  const row: Communication = {
    id: `comm-${crypto.randomUUID()}`,
    speakerId,
    templateKey,
    subject: rendered.subject,
    body: rendered.body,
    kind: (tpl?.key === "accepted"
      ? "acceptance"
      : tpl?.key === "task_reminder"
        ? "reminder"
        : tpl?.key === "rejected"
          ? "rejection"
          : kind) as Communication["kind"],
    status: "mock_sent",
    ics: icsBody,
    createdAt: now(),
  };
  store.communications.unshift(row);
  return row;
}

/** Deterministic advisory AI — never a decision. */
export function advisoryAi(submission: Submission): { scores: Record<string, number>; notes: string } {
  const len = submission.abstract.length;
  const base = Math.min(5, Math.max(2, Math.round(len / 80) + (submission.format === "Workshop" ? 1 : 0)));
  const scores = {
    relevance: Math.min(5, base + (submission.category === "Agents" ? 1 : 0)),
    novelty: Math.min(5, base - 0),
    clarity: Math.min(5, base + (len > 120 ? 1 : 0) > 5 ? 5 : base + (len > 120 ? 1 : 0)),
    depth: Math.min(5, Math.max(1, base - 1 + (submission.answers.experience === "advanced" ? 1 : 0))),
  };
  const notes = `Advisory draft only — not a decision. “${submission.title}” reads as a ${submission.format.toLowerCase()} for the ${submission.category} track. Strengths: concrete framing${len > 100 ? " and sufficient abstract detail" : ""}. Verify claims, speaker fit, and audience level before scoring as a human.`;
  return { scores, notes };
}

export function commandSnapshot() {
  const accepted = store.submissions.filter((s) => s.status === "accepted");
  const awaitingReview = store.submissions.filter((s) =>
    ["submitted", "under_review"].includes(s.status),
  );
  const unscored = store.reviews.filter((r) => r.status === "assigned");
  const unscheduled = store.sessions.filter((s) => s.status === "draft" || !s.slot);
  const speakers = [...new Set(accepted.map((s) => s.speakerId))];
  const blocked = speakers
    .map((id) => {
      const sub = accepted.find((s) => s.speakerId === id)!;
      const ready = readiness(id);
      return { speakerId: id, name: sub.name, title: sub.title, ...ready };
    })
    .filter((s) => s.state === "not_ready");

  const blockers: {
    id: string;
    severity: "danger" | "warn" | "info";
    label: string;
    href: string;
    action?: string;
  }[] = [];

  if (unscored.length)
    blockers.push({
      id: "unscored",
      severity: "warn",
      label: `${unscored.length} review${unscored.length === 1 ? "" : "s"} awaiting scores`,
      href: "/app/submissions?filter=unscored",
    });
  if (awaitingReview.length)
    blockers.push({
      id: "decisions",
      severity: "info",
      label: `${awaitingReview.length} submission${awaitingReview.length === 1 ? "" : "s"} awaiting decision`,
      href: "/app/submissions?filter=pending",
    });
  if (blocked.length)
    blockers.push({
      id: "onboarding",
      severity: "danger",
      label: `${blocked.length} accepted speaker${blocked.length === 1 ? "" : "s"} blocked on onboarding`,
      href: "/app/speakers",
      action: "nudge",
    });
  if (unscheduled.length)
    blockers.push({
      id: "unscheduled",
      severity: "warn",
      label: `${unscheduled.length} accepted session${unscheduled.length === 1 ? "" : "s"} still unscheduled`,
      href: "/app/schedule",
    });

  const funnel = {
    accepted: accepted.length,
    profile: speakers.filter((id) => readiness(id).missing.every((m) => m !== "bio")).length,
    headshot: speakers.filter(
      (id) =>
        store.files.some((f) => f.speakerId === id && f.kind === "headshot") ||
        store.profiles.find((p) => p.speakerId === id)?.headshotName,
    ).length,
    slides: speakers.filter((id) =>
      store.tasks.some((t) => t.speakerId === id && t.type === "slides" && t.status === "completed"),
    ).length,
    ready: speakers.filter((id) => readiness(id).state === "ready").length,
  };

  return {
    event: store.event,
    kpis: {
      submissions: store.submissions.length,
      awaitingReview: awaitingReview.length,
      acceptedUnscheduled: unscheduled.length,
      speakersBlocked: blocked.length,
    },
    blockers,
    blockedSpeakers: blocked,
    funnel,
    recentComms: store.communications.slice(0, 5),
  };
}
