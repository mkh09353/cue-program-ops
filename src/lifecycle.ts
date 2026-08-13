// content.ts imports only types from this module, so this import is not a runtime cycle.
import { upsertDeliverable } from "./content.js";

export const EVENT_ID = "evt-ai-summit-2026";
export const EVENT_SLUG = "ai-engineer-summit";
/** Stable authentication-to-lifecycle links for one-click demo sessions. Passwords
 * and tokens are deliberately not seed data; auth.ts creates only hashed secrets. */
export const SEED_AUTH_IDENTITIES = [
  { id: "user-demo-dana", email: "dana@demo.cue.dev", name: "Dana", role: "organizer", personaId: "org-swyx" },
  { id: "user-demo-rey", email: "rey@demo.cue.dev", name: "Rey", role: "reviewer", personaId: "rev-ada" },
  { id: "user-demo-maya", email: "maya@demo.cue.dev", name: "Maya", role: "speaker", personaId: "spk-sam", speakerId: "spk-sam" },
] as const;

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
  type: "text" | "textarea" | "select" | "checkbox" | "file" | "speaker_block";
  required: boolean;
  options?: string[];
  /** Conditional visibility — e.g. Workshop plan only when category=Workshop */
  visibleWhen?: { key: string; equals: string };
  /** Category → review board routing uses category field values */
  helpText?: string;
  section?: string;
}

export interface CfpForm {
  id: string;
  title: string;
  status: "open" | "closed";
  openAt?: string;
  closeAt: string;
  maxPerUser: number;
  welcomeMd: string;
  successMd: string;
  fields: FormField[];
  /** Map category option → review board id */
  routes: { category: string; boardId: string; boardLabel: string }[];
}

/** Credential-free demo access link. This selects a reviewer persona; it is not authentication. */
export interface ReviewerInvite {
  token: string;
  eventId: string;
  reviewerId: string;
  roundId: string;
  email: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

/** Per-speaker portal access token (magic link). Mirrors ReviewerInvite: it is a
 * real credential scoped to one speaker in one event, not a password account. */
export interface SpeakerInvite {
  token: string;
  eventId: string;
  speakerId: string;
  email: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface Submission {
  /** Which submission form produced this proposal (defaults to the primary form). */
  formId?: string;
  /** Committee feedback sent to the speaker with the accept/reject decision. */
  decisionFeedback?: string;
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
  updatedAt?: string;
  editToken?: string;
  additionalSpeakers?: { id: string; name: string; email: string; role?: "co-presenter" | "co-author" }[];
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
  aiDraftProvenance?: "ai_draft (workers-ai llama-3.1-8b)" | "ai_draft (heuristic)";
  source?: "human" | "ai_draft";
  responses?: Record<string, string | number>;
  recommendation?: string;
  /** Review round this scorecard belongs to (canonical link to reviewRounds). */
  roundId?: string;
  submittedAt?: string;
}

export interface ReviewCriterion {
  id: string;
  label: string;
  type: "rating" | "select" | "text";
  weight: number;
  /** Inclusive scale bounds for rating criteria (default 1–5). */
  min?: number;
  max?: number;
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
  /** Inline image (data URL) or served file URL for the speaker's headshot. */
  headshotUrl?: string;
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

export type ContentApprovalStatus = "draft" | "submitted" | "approved" | "changes_requested";
export interface DeliverableTask {
  id: string; name: string; instructions: string; dueAt: string; speakerId: string; sessionId?: string;
  fileRequired: boolean; acceptedTypes: string[]; status: "incomplete" | "complete"; createdAt: string;
}
export interface ContentFileVersion {
  id: string; version: number; name: string; mime: string; size: number; dataBase64: string;
  uploadedBy: string; uploadedAt: string; current: boolean;
}
export interface ContentFileComment { id: string; authorId: string; authorName: string; body: string; createdAt: string }
export interface ContentFile {
  id: string; speakerId: string; sessionId?: string; taskId: string; kind: "headshot" | "slides" | "document";
  status: ContentApprovalStatus; approvalComment?: string; versions: ContentFileVersion[]; comments: ContentFileComment[];
}
export interface ContentEditHistory {
  id: string; entityType: "session" | "speaker"; entityId: string; editorId: string; editorName: string;
  createdAt: string; before: Record<string, unknown>; after: Record<string, unknown>;
  /** True when the save carried fields but nothing actually differed. */
  noChange?: boolean;
}
export interface SessionContentState { sessionId: string; status: ContentApprovalStatus; approvalComment?: string }

export interface CommTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  includeCalendarLinks: boolean;
}

export interface Communication {
  /** Committee feedback merged into this message, when the send included any. */
  feedback?: string;
  id: string;
  speakerId: string;
  templateKey?: string;
  subject: string;
  body: string;
  kind: "acceptance" | "reminder" | "rejection" | "cfp_received" | "schedule_locked" | "custom";
  status: "mock_sent" | "sent" | "logged_undeliverable" | "failed";
  ics: string;
  createdAt: string;
  submissionId?: string;
  /** Provider receipt retained only when an external provider accepts the send. */
  providerId?: string;
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
/** Which card fields a saved embed renders (all true when omitted). */
export interface EmbedCardFields { speakers?:boolean; room?:boolean; track?:boolean; description?:boolean }
export interface EmbedConfig { id:string; name:string; widget:"sessions"|"speakers"|"agenda"|"itinerary"|"gallery"; filters:{track?:string;format?:string;room?:string;day?:string}; theme:{accent?:string}; fields?:EmbedCardFields; createdAt:string }

/** Named CSS colors accepted for embed branding (kept tiny and audit-able). */
export const ACCENT_NAMED_COLORS = new Set([
  "black",
  "white",
  "slate",
  "gray",
  "grey",
  "navy",
  "teal",
  "purple",
  "indigo",
  "crimson",
  "orange",
  "green",
  "blue",
  "red",
]);

/** Embed accent colors are the ONE branding exception to Monochrome Paper. Only
 *  #rgb / #rrggbb literals or an allowlisted color name are accepted, so a saved
 *  config can never inject arbitrary CSS into a public page. */
export const isSafeAccent = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) || ACCENT_NAMED_COLORS.has(v.toLowerCase());
};
export interface AutomationState { enabled:boolean; schedule:string; lastRunAt?:string; speakerSent:number; reviewerSent:number; status:"never"|"completed"|"failed"; eventResults?:{eventId:string;speakerSent:number;reviewerSent:number;status:"completed"|"failed";ranAt:string}[] }

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
export interface AgendaProposalPlacement { id:string; sessionId:string; slot:{id:string;sessionId:string;roomId:string;startsAt:string;endsAt:string}; status:"proposed"|"accepted"|"rejected"|"conflict"; rationale:string; conflicts:string[]; decidedAt?:string }
export interface AgendaProposal { id:string; eventId:string; status:"review"|"partially_applied"|"applied"|"rejected"; provenance:"deterministic_heuristic_demo"; generatedAt:string; generation:number; constraints:{dayStartHour:number;dayEndHour:number;slotMinutes:number;breakMinutes:number;speakerAvailability:Record<string,{startsAt:string;endsAt:string}[]>}; placements:AgendaProposalPlacement[] }

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
  /** Additional submission forms for this event. The primary form (`form`) is
   * untouched so every existing single-form path keeps working unchanged. */
  extraForms?: CfpForm[];
  submissions: Submission[];
  reviews: Review[];
  reviewRounds: ReviewRound[];
  reviewAssignments: ReviewAssignment[];
  reviewConflicts: ReviewConflict[];
  profiles: SpeakerProfile[];
  tasks: SpeakerTask[];
  files: FileRecord[];
  deliverableTasks: DeliverableTask[];
  contentFiles: ContentFile[];
  contentHistory: ContentEditHistory[];
  sessionContent: SessionContentState[];
  templates: CommTemplate[];
  communications: Communication[];
  resources: Resource[];
  sessions: SessionDraft[];
  agendaProposals: AgendaProposal[];
  rooms: { id: string; name: string }[];
  tracks: { id: string; name: string }[];
  boards: { id: string; label: string }[];
  personas: { id: string; role: Role; name: string; email: string; speakerId?: string; boardIds?: string[] }[];
  reviewerInvites: ReviewerInvite[];
  speakerInvites: SpeakerInvite[];
  embedConfigs: EmbedConfig[];
  automation: AutomationState;
}

const now = () => new Date().toISOString();

export const RUBRIC_CRITERIA = ["relevance", "novelty", "clarity", "depth"] as const;

/** The ACTIVE event's lifecycle state.
 *
 * Multi-event support keeps one LifecycleStore per event in the registry
 * (src/events.ts) and rebinds this export per request. It is an ESM live
 * binding, so every `import { store }` consumer resolves the active event
 * without threading an explicit resolver through ~300 call sites.
 *
 * CAVEAT: this is a request-scoped mutable global. It is correct for this
 * demo (the Durable Object serializes requests and state is in-memory), but
 * it is NOT safe under true request concurrency within one isolate.
 */
/** Pristine seed organizer personas, captured at module init BEFORE any snapshot
 * restore mutates the store in place. Restore merges these authoritatively. */
export const SEED_ORGANIZER_PERSONAS: { id: string; role: "organizer"; name: string; email: string }[] = [
  { id: "org-swyx", role: "organizer", name: "swyx", email: "swyx@ai.engineer" },
  { id: "org-sydney", role: "organizer", name: "Sydney", email: "sydney@ai.engineer" },
  { id: "org-phlo", role: "organizer", name: "Phlo", email: "phlo@ai.engineer" },
  { id: "org-kelsey", role: "organizer", name: "Kelsey", email: "kelsey@ai.engineer" },
  { id: "org-jordan", role: "organizer", name: "Jordan Alvarez", email: "jordan@ai.engineer" },
];
export let store: LifecycleStore = {
  reviewerInvites: [],
  speakerInvites: [],
  embedConfigs: [],
  automation: {enabled:true,schedule:"0 * * * *",speakerSent:0,reviewerSent:0,status:"never"},
  event: {
    id: EVENT_ID,
    name: "AI Engineer Summit",
    slug: EVENT_SLUG,
    timezone: "America/Los_Angeles",
    startsAt: "2026-10-12T16:00:00.000Z",
    // End of program day Oct 14 in America/Los_Angeles (covers three civil days).
    endsAt: "2026-10-15T01:00:00.000Z",
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
    openAt: "2026-01-01T00:00:00.000Z",
    closeAt: "2027-04-30T23:59:00.000Z",
    maxPerUser: 10,
    welcomeMd:
      "Call for Speakers\n\nOur event welcomes builders shipping real AI systems. Sessions are selected from these submissions.\n\nTip: choose **Workshop** format to reveal workshop-specific fields.",
    successMd:
      "You will receive a confirmation shortly. Next, open your speaker portal to track status and complete onboarding if accepted.",
    fields: [
      { key: "title", label: "Session title", type: "text", required: true, section: "Proposal" },
      { key: "abstract", label: "Abstract", type: "textarea", required: true, section: "Proposal" },
      {
        key: "category",
        label: "Track",
        type: "select",
        required: true,
        options: ["AI Engineering", "Platform & Infra", "Developer Experience"],
        helpText: "Routes your talk to the matching review board.",
      },
      {
        key: "format",
        label: "Format",
        type: "select",
        required: true,
        options: ["Keynote (45 min)", "Talk (30 min)", "Lightning Talk (10 min)", "Workshop (120 min)", "Panel (45 min)"],
      },
      {
        key: "workshopPlan",
        label: "Workshop plan",
        type: "textarea",
        required: true,
        visibleWhen: { key: "format", equals: "Workshop (120 min)" },
        helpText: "Shown only when Format = Workshop (120 min).",
      },
      {
        key: "duration",
        label: "Workshop duration (minutes)",
        type: "text",
        required: true,
        visibleWhen: { key: "format", equals: "Workshop (120 min)" },
        helpText: "Shown only when Format = Workshop (120 min).",
      },
      {
        key: "experience",
        label: "Experience level",
        type: "select",
        required: true,
        options: ["Beginner", "Intermediate", "Advanced"],
      },
      { key: "speaker_bio", label: "Speaker bio", type: "textarea", required: false, section: "Speaker" },
      { key: "notes_for_reviewers", label: "Notes for reviewers", type: "textarea", required: false, section: "Review" },
    ],
    routes: [
      { category: "AI Engineering", boardId: "ai-engineering", boardLabel: "AI Engineering board" },
      { category: "Platform & Infra", boardId: "platform-infra", boardLabel: "Platform & Infra board" },
      { category: "Developer Experience", boardId: "developer-experience", boardLabel: "Developer Experience board" },
      // Legacy seed submission categories (not shown on public CFP track list)
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
      format: "Talk (30 min)",
      // A seeded multi-participant proposal: co-author support must be observable
      // even when the CFP window is closed and no new submission can be made.
      additionalSpeakers: [
        { id: "spk-co-marcus", name: "Marcus Okafor", email: "marcus.okafor@example.test", role: "co-author" },
      ],
      answers: {
        experience: "advanced",
        format: "Talk (30 min)",
        additionalSpeakers: [{ name: "Marcus Okafor", email: "marcus.okafor@example.test", role: "co-author" }],
      },
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
      format: "Talk (30 min)",
      answers: { experience: "advanced", format: "Talk (30 min)" },
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
      format: "Talk (30 min)",
      answers: { experience: "intermediate", format: "Talk (30 min)" },
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
      format: "Talk (30 min)",
      answers: { experience: "advanced", format: "Talk (30 min)" },
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
      format: "Workshop (120 min)",
      answers: {
        experience: "intermediate",
        format: "Workshop (120 min)",
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
        { id: "overall", label: "Overall rating", type: "rating", weight: 3, min: 1, max: 5 },
        { id: "relevance", label: "Program relevance", type: "rating", weight: 2, min: 1, max: 5 },
        { id: "novelty", label: "Novelty", type: "rating", weight: 1, min: 1, max: 5 },
        { id: "recommendation", label: "Recommendation", type: "select", weight: 0, options: ["Strong accept", "Accept", "Borderline", "Reject"] },
        { id: "comments", label: "Comments", type: "text", weight: 0 },
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
        { id: "clarity", label: "Clarity", type: "rating", weight: 1, min: 1, max: 5 },
        { id: "depth", label: "Technical depth", type: "rating", weight: 2, min: 1, max: 5 },
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
  deliverableTasks: [
    { id:"deliverable-slides-ada", name:"Upload Session Presentation", instructions:"Final slide deck as a PDF, 16:9 aspect ratio.", dueAt:"2027-05-01T23:59:59.000Z", speakerId:"spk-ada", sessionId:"ses-analytical", fileRequired:true, acceptedTypes:["application/pdf"], status:"complete", createdAt:"2027-03-01T10:00:00.000Z" },
    { id:"deliverable-headshot-ada", name:"Upload Final Headshot (print quality)", instructions:"Upload a high-resolution PNG or JPEG headshot.", dueAt:"2027-04-14T23:59:59.000Z", speakerId:"spk-ada", sessionId:"ses-analytical", fileRequired:true, acceptedTypes:["image/png","image/jpeg"], status:"incomplete", createdAt:"2027-03-01T10:00:00.000Z" },
    { id:"deliverable-slides-sam", name:"Upload Session Presentation", instructions:"Final slide deck as a PDF, 16:9 aspect ratio.", dueAt:"2027-05-01T23:59:59.000Z", speakerId:"spk-sam", sessionId:"ses-sam", fileRequired:true, acceptedTypes:["application/pdf"], status:"incomplete", createdAt:"2027-03-01T10:00:00.000Z" },
    { id:"deliverable-headshot-sam", name:"Upload Final Headshot (print quality)", instructions:"Upload a high-resolution PNG or JPEG headshot.", dueAt:"2027-04-14T23:59:59.000Z", speakerId:"spk-sam", sessionId:"ses-sam", fileRequired:true, acceptedTypes:["image/png","image/jpeg"], status:"incomplete", createdAt:"2027-03-01T10:00:00.000Z" },
  ],
  contentFiles: [
    { id:"content-slides-ada", speakerId:"spk-ada", sessionId:"ses-analytical", taskId:"deliverable-slides-ada", kind:"slides", status:"submitted", versions:[
      { id:"content-slides-ada-v1", version:1, name:"slides.pdf", mime:"application/pdf", size:18, dataBase64:"JVBERi0xLjQgZGVtbyB2MQ==", uploadedBy:"spk-ada", uploadedAt:"2027-04-01T10:00:00.000Z", current:false },
      { id:"content-slides-ada-v2", version:2, name:"slides.pdf", mime:"application/pdf", size:18, dataBase64:"JVBERi0xLjQgZGVtbyB2Mg==", uploadedBy:"spk-ada", uploadedAt:"2027-04-04T10:00:00.000Z", current:true },
    ], comments:[{ id:"comment-ada-draft", authorId:"spk-ada", authorName:"Ada Lovelace", body:"Draft deck - final version coming Friday.", createdAt:"2027-04-01T10:05:00.000Z" }] },
  ],
  contentHistory: [],
  sessionContent: [
    { sessionId:"ses-analytical", status:"approved" },
    { sessionId:"ses-margaret", status:"draft" },
    { sessionId:"ses-sam", status:"submitted" },
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
  agendaProposals: [],
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
    // AI Engineer team organizers. swyx is FIRST and keeps the canonical
    // "org-swyx" id, so it is the persona the shells resolve to by default.
    { id: "org-swyx", role: "organizer", name: "swyx", email: "swyx@ai.engineer" },
    { id: "org-sydney", role: "organizer", name: "Sydney", email: "sydney@ai.engineer" },
    { id: "org-phlo", role: "organizer", name: "Phlo", email: "phlo@ai.engineer" },
    { id: "org-kelsey", role: "organizer", name: "Kelsey", email: "kelsey@ai.engineer" },
    // Retained: the eval content fixtures attribute change history to this name.
    { id: "org-jordan", role: "organizer", name: "Jordan Alvarez", email: "jordan@ai.engineer" },
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

export function readiness(speakerId: string, at = new Date(), life: LifecycleStore = store) {
  const tasks = life.tasks.filter((t) => t.speakerId === speakerId && t.required);
  const files = life.files.filter((f) => f.speakerId === speakerId);
  const profile = life.profiles.find((p) => p.speakerId === speakerId);
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
  const categoryField = store.form.fields.find((field) => field.key === "category");
  if (!category || (categoryField?.options?.length && !categoryField.options.includes(category))) return { ok: false as const, error: "invalid category" };
  const route = store.form.routes.find((r) => r.category === category) || boardForCategory(category);
  for (const field of store.form.fields) {
    const visible = !field.visibleWhen || answers[field.visibleWhen.key] === field.visibleWhen.equals;
    if (visible && field.required && (answers[field.key] == null || String(answers[field.key]).trim() === "")) return { ok: false as const, error: `${field.label} is required` };
  }
  const count = store.submissions.filter((s) => s.email.trim().toLowerCase() === normalizedEmail).length;
  if (count >= store.form.maxPerUser) return { ok: false as const, error: `submission limit reached (${store.form.maxPerUser})` };
  return { ok: true as const, normalizedEmail, route };
}

export function cfpWindow(at = new Date()) {
  const opens = store.form.openAt ? Date.parse(store.form.openAt) : Number.NEGATIVE_INFINITY;
  const closes = Date.parse(store.form.closeAt);
  const open = store.form.status === "open" && at.getTime() >= opens && at.getTime() < closes;
  return { open, opensAt: store.form.openAt, closesAt: store.form.closeAt, reason: store.form.status === "closed" || at.getTime() >= closes ? "Submissions closed" : "Submissions have not opened yet" };
}

export function cfpRouteForCategory(category: string) {
  const existing = store.form.routes.find((route) => route.category === category);
  if (existing) return existing;
  const boardId = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
  const route = { category, boardId, boardLabel: `${category} board` };
  store.form.routes.push(route);
  if (!store.boards.some((board) => board.id === boardId)) store.boards.push({ id: boardId, label: route.boardLabel });
  return route;
}

/** Keeps review history immutable by creating/finding a record per submission/reviewer/round. */
export function reviewForRound(submissionId: string, reviewerId: string, round: Review["round"]) {
  let review = store.reviews.find((r) => r.submissionId === submissionId && r.reviewerId === reviewerId && r.round === round);
  if (!review) { review = { id: `rev-${crypto.randomUUID()}`, submissionId, reviewerId, round, scores: {}, notes: "", status: "assigned" }; store.reviews.push(review); }
  return review;
}

/**
 * Canonical review-history projection. Both the reviewer scorecard flow
 * (reviewer-queue submit) and the legacy Review Studio saves write to
 * `store.reviews`; this is the ONE read path the organizer UI and reviewer UI
 * both render, so a submitted scorecard shows up immediately with the reviewer
 * name, round, criterion labels, ratings, and comment.
 */
export function reviewHistory(submissionId: string, life: LifecycleStore = store) {
  const humanize = (key: string) =>
    key.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  return life.reviews
    .filter((review) => review.submissionId === submissionId)
    .map((review) => {
      const assignment = life.reviewAssignments.find(
        (a) => a.submissionId === review.submissionId && a.reviewerId === review.reviewerId && a.status !== "recused",
      );
      const round =
        life.reviewRounds.find((r) => r.id === (review.roundId || assignment?.roundId)) ||
        life.reviewRounds.find((r) => r.reviewerIds.includes(review.reviewerId)) ||
        life.reviewRounds[0];
      const criteria = round?.criteria || [];
      const raw: Record<string, string | number> = {
        ...(review.scores || {}),
        ...(review.responses || {}),
      };
      const entries = Object.entries(raw)
        .filter(([key]) => key !== "comments")
        .map(([key, value]) => {
          const criterion = criteria.find((x) => x.id === key);
          return {
            key,
            label: criterion?.label || humanize(key),
            type: criterion?.type || (typeof value === "number" ? "rating" : "text"),
            value,
          };
        })
        .filter((entry) => entry.value !== "" && entry.value != null);
      const ratings = entries.filter((e) => typeof e.value === "number") as {
        key: string;
        label: string;
        type: string;
        value: number;
      }[];
      const average = ratings.length
        ? Math.round((ratings.reduce((a, b) => a + b.value, 0) / ratings.length) * 100) / 100
        : null;
      const reviewer = life.personas.find((p) => p.id === review.reviewerId);
      const comment = String(review.responses?.comments ?? review.notes ?? "");
      return {
        ...review,
        roundId: review.roundId || assignment?.roundId || round?.id,
        roundName: round?.name || review.round,
        reviewerName: reviewer?.name || review.reviewerId,
        reviewerEmail: reviewer?.email,
        entries,
        ratings,
        average,
        comment,
        isAiDraft: review.source === "ai_draft",
        assignmentStatus: assignment?.status,
      };
    });
}

/**
 * Mirror a submitted scorecard onto the canonical assignment + submission state so
 * reviewer-side and organizer-side flows never diverge.
 */
export function markReviewSubmitted(review: Review, at = new Date().toISOString(), life: LifecycleStore = store) {
  review.status = "submitted";
  review.source = review.source === "ai_draft" ? "human" : review.source || "human";
  review.submittedAt = at;
  const assignment = life.reviewAssignments.find(
    (a) => a.submissionId === review.submissionId && a.reviewerId === review.reviewerId && a.status === "assigned",
  );
  if (assignment) {
    assignment.status = "completed";
    assignment.completedAt = at;
    review.roundId = review.roundId || assignment.roundId;
  }
  const submission = life.submissions.find((s) => s.id === review.submissionId);
  if (submission && submission.status === "submitted") submission.status = "under_review";
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

export function reminderPlans(at = new Date(), life: LifecycleStore = store): ReminderPlan[] { return life.tasks.filter((t)=>t.required&&t.status!=="completed").map((t)=>({speakerId:t.speakerId,taskId:t.id,templateKey:"task_reminder" as const,dueAt:t.dueAt,overdue:Date.parse(t.dueAt)<at.getTime()})); }

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

/** Merge committee feedback into a message body.
 *
 * A template that declares {{feedback}} controls its own placement; otherwise the
 * feedback is appended under a clear label so the speaker always sees who wrote it.
 * With no feedback the placeholder is removed and the body is unchanged.
 */
export function appendFeedback(body: string, feedback?: string) {
  const text = String(feedback || "").trim();
  if (body.includes("{{feedback}}")) {
    return body.replaceAll("{{feedback}}", text ? `${FEEDBACK_LABEL} ${text}` : "").replace(/\n{3,}/g, "\n\n").trim();
  }
  return text ? `${body}\n\n${FEEDBACK_LABEL} ${text}` : body;
}

/** One label for committee feedback across email, comms log and the speaker portal. */
export const FEEDBACK_LABEL = "Feedback from the committee:";

export function renderTemplate(
  tpl: CommTemplate,
  vars: { first_name: string; talk_title: string; portal_link: string; calendar_links?: string; feedback?: string },
) {
  const feedback = String(vars.feedback || "").trim();
  const calendar = tpl.includeCalendarLinks
    ? vars.calendar_links ||
      "Add to calendar: Google · Outlook · download ICS from your portal."
    : "";
  return {
    subject: tpl.subject
      .replaceAll("{{first_name}}", vars.first_name)
      .replaceAll("{{talk_title}}", vars.talk_title),
    body: appendFeedback(
      tpl.body
        .replaceAll("{{first_name}}", vars.first_name)
        .replaceAll("{{talk_title}}", vars.talk_title)
        .replaceAll("{{portal_link}}", vars.portal_link)
        .replaceAll("{{calendar_links}}", calendar),
      feedback,
    ),
  };
}

export function ensureOnboarding(submission: Submission) {
  if (store.tasks.some((t) => t.speakerId === submission.speakerId)) {
    // Deliverables are a separate, file-backed table from onboarding tasks; an
    // accepted speaker must always get both or /p/deliverables looks broken.
    ensureDeliverables(submission);
    return;
  }
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
  for (const speaker of submission.additionalSpeakers || []) {
    if (!store.profiles.some((p) => p.speakerId === speaker.id)) store.profiles.push({ speakerId: speaker.id, name: speaker.name, email: speaker.email, bio: "" });
    if (!store.personas.some((p) => p.id === speaker.id)) store.personas.push({ id: speaker.id, role: "speaker", name: speaker.name, email: speaker.email, speakerId: speaker.id });
  }
  ensureDeliverables(submission);
}

/**
 * Give every accepted speaker the standard file-request deliverables (slides +
 * print headshot) so the speaker Deliverables page and the organizer content
 * dashboard are populated from the same canonical records.
 */
export function ensureDeliverables(submission: Submission) {
  const sessionId = store.sessions.find((s) => s.submissionId === submission.id)?.id || `ses-${submission.id}`;
  const createdAt = new Date().toISOString();
  const canonical: DeliverableTask[] = [
    {
      id: `deliverable-slides-${submission.speakerId}`,
      name: "Upload Session Presentation",
      instructions: "Final slide deck as a PDF, 16:9 aspect ratio.",
      dueAt: "2027-05-01T23:59:59.000Z",
      speakerId: submission.speakerId,
      sessionId,
      fileRequired: true,
      acceptedTypes: ["application/pdf"],
      status: "incomplete",
      createdAt,
    },
    {
      id: `deliverable-headshot-${submission.speakerId}`,
      name: "Upload Final Headshot (print quality)",
      instructions: "Upload a high-resolution PNG or JPEG headshot.",
      dueAt: "2027-04-14T23:59:59.000Z",
      speakerId: submission.speakerId,
      sessionId,
      fileRequired: true,
      acceptedTypes: ["image/png", "image/jpeg"],
      status: "incomplete",
      createdAt,
    },
  ];
  // Single shared resolver with the organizer file-request path (see content.ts):
  // an equivalent slot is reused/extended, never duplicated.
  for (const task of canonical) upsertDeliverable(store, task);
}

export function sendTemplate(
  templateKey: string,
  speakerId: string,
  talkTitle: string,
  kind: Communication["kind"] = "custom",
  life: LifecycleStore = store,
  options: { feedback?: string } = {},
) {
  const tpl = life.templates.find((t) => t.key === templateKey);
  const profile = life.profiles.find((p) => p.speakerId === speakerId);
  const name = profile?.name || life.submissions.find((s) => s.speakerId === speakerId)?.name || "Speaker";
  const first = name.split(" ")[0] || name;
  // Relative URL is safe across preview, deployed, and custom public origins; it is not a localhost persistence leak.
  const portal = `/speaker/${encodeURIComponent(speakerId)}`;
  const rendered = tpl
    ? renderTemplate(tpl, {
        first_name: first,
        talk_title: talkTitle,
        portal_link: portal,
        feedback: options.feedback,
      })
    : {
        subject: "Message from CUE",
        body: appendFeedback(`Hi ${first}, regarding ${talkTitle}`, options.feedback),
      };
  const session = life.sessions.find((s) => s.speakerId === speakerId && s.title === talkTitle);
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
    feedback: String(options.feedback || "").trim() || undefined,
    createdAt: now(),
  };
  life.communications.unshift(row);
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

/** The seeded default event's store, captured before any rebinding. */
export const seededStore: LifecycleStore = store;

/** Rebind the active event's lifecycle state. See the note on `store`. */
export function setActiveStore(next: LifecycleStore) { store = next; }


/** Days a speaker magic link stays valid. */
export const SPEAKER_INVITE_TTL_DAYS = 30;

/** The portal path a speaker magic link points at. */
export const speakerInvitePath = (token: string) => `/p?invite=${encodeURIComponent(token)}`;

/**
 * Issue (or reuse) a speaker's portal access token.
 *
 * Reuses the newest live token for that speaker so a re-sent invite keeps working
 * links valid; expired/revoked tokens are never reused.
 */
export function issueSpeakerInvite(speakerId: string, life: LifecycleStore = store): SpeakerInvite | undefined {
  const profile = life.profiles.find((p) => p.speakerId === speakerId);
  if (!profile) return undefined;
  // A portal invite must always land somewhere: guarantee the speaker persona the
  // link resolves to (some seeded/imported profiles have no persona row yet).
  const persona = life.personas.find((p) => p.speakerId === speakerId && p.role === "speaker");
  if (persona) Object.assign(persona, { name: profile.name, email: profile.email });
  else life.personas.push({ id: speakerId, role: "speaker", name: profile.name, email: profile.email, speakerId });
  life.speakerInvites ||= [];
  const live = life.speakerInvites.find(
    (x) =>
      x.speakerId === speakerId &&
      x.eventId === life.event.id &&
      !x.revokedAt &&
      (!x.expiresAt || Date.parse(x.expiresAt) > Date.now()),
  );
  if (live) {
    live.email = profile.email;
    return live;
  }
  const invite: SpeakerInvite = {
    token: crypto.randomUUID(),
    eventId: life.event.id,
    speakerId,
    email: profile.email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SPEAKER_INVITE_TTL_DAYS * 86_400_000).toISOString(),
  };
  life.speakerInvites.push(invite);
  return invite;
}

/** Resolve a speaker magic link within one event's store. */
export function resolveSpeakerInvite(token: string, life: LifecycleStore) {
  const invite = (life.speakerInvites || []).find((x) => x.token === token);
  if (!invite || invite.eventId !== life.event.id || invite.revokedAt) return undefined;
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now()) return undefined;
  const persona = life.personas.find((p) => p.speakerId === invite.speakerId && p.role === "speaker");
  const profile = life.profiles.find((p) => p.speakerId === invite.speakerId);
  if (!persona || !profile) return undefined;
  return { invite, persona, profile };
}


/** Every submission form for an event, primary first. */
export function formsOf(life: LifecycleStore = store): CfpForm[] {
  return [life.form, ...(life.extraForms || [])];
}

/** Resolve a form by id (primary or additional). */
export function findForm(id: string, life: LifecycleStore = store): CfpForm | undefined {
  return formsOf(life).find((f) => f.id === id);
}

/** The id every legacy/default path uses. */
export const PRIMARY_FORM_ID = "form-cfp";

/** Build an additional form from the primary as a template. */
export function createEventForm(input: { name?: string; slug?: string }, life: LifecycleStore = store):
  | { ok: true; form: CfpForm }
  | { ok: false; error: string } {
  const name = String(input.name || "").trim();
  if (!name) return { ok: false, error: "form name is required" };
  const base = String(input.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (!base) return { ok: false, error: "form name must contain letters or numbers" };
  let id = `form-${base}`;
  let n = 1;
  while (findForm(id, life)) id = `form-${base}-${++n}`;
  const form: CfpForm = {
    ...structuredClone(life.form),
    id,
    title: name,
    status: "open",
    welcomeMd: `## ${name}\n\nSubmit your proposal for **${name}**.`,
    successMd: life.form.successMd,
  };
  life.extraForms ||= [];
  life.extraForms.push(form);
  return { ok: true, form };
}
