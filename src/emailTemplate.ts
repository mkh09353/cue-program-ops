/** Email-client-safe branded HTML for Ruckus. Tables + inline styles only. */

export const EMAIL_CANVAS = "#f5f5f5";
export const EMAIL_CARD = "#ffffff";
export const EMAIL_INK = "#171717";
export const EMAIL_MUTED = "#525252";
export const EMAIL_LINE = "#e5e5e5";
export const EMAIL_FOOTER_HREF = "https://ruckus.to";

export type EmailCta = { href: string; label: string };
export type EmailTask = { title: string; dueAt?: string; overdue?: boolean };
export type EmailDecision = { status: string; feedback?: string };

export type BrandedEmailInput = {
  subject: string;
  text: string;
  eventName?: string;
  cta?: EmailCta;
  decision?: EmailDecision;
  tasks?: EmailTask[];
};

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const paragraphs = (text: string) =>
  String(text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

export function extractFirstHttpUrl(text: string) {
  const match = String(text || "").match(/https?:\/\/[^\s<>"']+/);
  return match?.[0];
}

function decisionLabel(status: string) {
  const value = String(status || "").toLowerCase();
  if (value === "accepted" || value === "acceptance") return "ACCEPTED";
  if (value === "rejected" || value === "rejection" || value === "declined") return "DECLINED";
  return String(status || "UPDATE").toUpperCase();
}

function paragraphHtml(text: string) {
  return paragraphs(text)
    .map((block) => `<p style="margin:0 0 16px;color:${EMAIL_INK};font-size:16px;line-height:1.55;">${esc(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function ctaHtml(cta: EmailCta) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
    <tr>
      <td align="center" bgcolor="${EMAIL_INK}" style="background:${EMAIL_INK};border-radius:999px;">
        <a href="${esc(cta.href)}" style="display:inline-block;padding:12px 22px;color:${EMAIL_CARD};font-size:14px;font-weight:700;letter-spacing:.02em;text-decoration:none;border-radius:999px;">${esc(cta.label)}</a>
      </td>
    </tr>
  </table>`;
}

function decisionHtml(decision: EmailDecision) {
  const label = decisionLabel(decision.status);
  const accepted = label === "ACCEPTED";
  const feedback = String(decision.feedback || "").trim();
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    <tr>
      <td style="padding:12px 14px;border:1px solid ${EMAIL_LINE};border-radius:18px;background:${accepted ? "#f0fdf4" : "#fafafa"};">
        <p style="margin:0;color:${EMAIL_INK};font-size:13px;font-weight:700;letter-spacing:.08em;">${esc(label)}</p>
      </td>
    </tr>
    ${
      feedback
        ? `<tr><td style="padding:14px 0 0;">
      <p style="margin:0 0 8px;color:${EMAIL_MUTED};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Feedback from the committee</p>
      <p style="margin:0;padding:12px 14px;border:1px solid ${EMAIL_LINE};border-radius:18px;background:${EMAIL_CANVAS};color:${EMAIL_INK};font-size:15px;line-height:1.5;">${esc(feedback).replace(/\n/g, "<br/>")}</p>
    </td></tr>`
        : ""
    }
  </table>`;
}

function reminderHtml(tasks: EmailTask[]) {
  const rows = tasks
    .map((task) => {
      const due = task.dueAt ? String(task.dueAt).slice(0, 10) : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${EMAIL_LINE};color:${EMAIL_INK};font-size:15px;">${esc(task.title)}</td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${EMAIL_LINE};color:${EMAIL_MUTED};font-size:13px;white-space:nowrap;">${esc(due)}${task.overdue ? " · overdue" : ""}</td>
      </tr>`;
    })
    .join("");
  return `<p style="margin:0 0 8px;color:${EMAIL_MUTED};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Outstanding tasks</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">${rows}</table>`;
}

export function renderEmailLayout(input: {
  preheader?: string;
  eventName?: string;
  bodyHtml: string;
}) {
  const eventName = input.eventName || "your event";
  const preheader = input.preheader || "";
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${EMAIL_CANVAS};color:${EMAIL_INK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${EMAIL_CANVAS};">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_CANVAS}" style="background:${EMAIL_CANVAS};margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
          <tr>
            <td style="padding:0 0 16px;">
              <p style="margin:0;color:${EMAIL_INK};font-size:22px;font-weight:800;letter-spacing:.04em;">Ruckus</p>
              <p style="margin:4px 0 0;color:${EMAIL_MUTED};font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Open-source conference ops</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="${EMAIL_CARD}" style="background:${EMAIL_CARD};border:1px solid ${EMAIL_LINE};border-radius:24px;padding:28px 24px;color:${EMAIL_INK};">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 8px 0;color:${EMAIL_MUTED};font-size:12px;line-height:1.5;">
              <p style="margin:0 0 6px;">${esc(eventName)}</p>
              <p style="margin:0;">Sent by Ruckus — open-source conference ops · <a href="${EMAIL_FOOTER_HREF}" style="color:${EMAIL_INK};text-decoration:underline;">ruckus.to</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderGenericEmail(input: { text: string; eventName?: string; subject?: string }) {
  return renderEmailLayout({
    preheader: input.subject,
    eventName: input.eventName,
    bodyHtml: paragraphHtml(input.text),
  });
}

export function renderCtaEmail(input: { text: string; cta: EmailCta; eventName?: string; subject?: string }) {
  return renderEmailLayout({
    preheader: input.subject,
    eventName: input.eventName,
    bodyHtml: `${paragraphHtml(input.text)}${ctaHtml(input.cta)}`,
  });
}

export function renderDecisionEmail(input: {
  text: string;
  decision: EmailDecision;
  cta?: EmailCta;
  eventName?: string;
  subject?: string;
}) {
  return renderEmailLayout({
    preheader: input.subject,
    eventName: input.eventName,
    bodyHtml: `${decisionHtml(input.decision)}${paragraphHtml(input.text)}${input.cta ? ctaHtml(input.cta) : ""}`,
  });
}

export function renderReminderEmail(input: {
  text: string;
  tasks: EmailTask[];
  cta?: EmailCta;
  eventName?: string;
  subject?: string;
}) {
  return renderEmailLayout({
    preheader: input.subject,
    eventName: input.eventName,
    bodyHtml: `${paragraphHtml(input.text)}${reminderHtml(input.tasks)}${input.cta ? ctaHtml(input.cta) : ""}`,
  });
}

function inferredCta(text: string, subject: string): EmailCta | undefined {
  const href = extractFirstHttpUrl(text);
  if (!href) return undefined;
  const hay = `${subject} ${text}`.toLowerCase();
  const label = /review/.test(hay)
    ? "Open your review queue"
    : /sign-in|magic|invitation|login/.test(hay)
      ? "Open your speaker portal".replace("speaker portal", /invitation|invite/.test(hay) ? "invitation" : "sign-in link")
      : /portal|speaker/.test(hay)
        ? "Open your speaker portal"
        : "Open link";
  const resolved =
    /review/.test(hay) ? "Open your review queue"
    : /portal|speaker/.test(hay) ? "Open your speaker portal"
    : /sign-in|magic|login/.test(hay) ? "Open your sign-in link"
    : /invitation|invite/.test(hay) ? "Open your invitation"
    : "Open link";
  void label;
  return { href, label: resolved };
}

function inferredTasks(text: string): EmailTask[] {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]/.test(line))
    .map((line) => {
      const body = line.replace(/^[-*•]\s*/, "");
      const due = body.match(/due ([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1];
      return { title: body.replace(/\s*\(due [^)]+\)/i, "").trim() || body, dueAt: due, overdue: /overdue/i.test(body) };
    });
}

function inferredFeedback(text: string) {
  const match = String(text || "").match(/Feedback from the committee:\s*([\s\S]+)$/i);
  return match?.[1]?.trim();
}

/** Pick the richest matching variant while keeping merge fields identical to the plain-text body. */
export function renderBrandedEmail(input: BrandedEmailInput) {
  const eventName = input.eventName || "your event";
  const cta = input.cta || inferredCta(input.text, input.subject);
  const tasks = input.tasks?.length ? input.tasks : inferredTasks(input.text);
  const decision = input.decision;
  if (decision) return renderDecisionEmail({ text: input.text, decision, cta, eventName, subject: input.subject });
  if (tasks.length) return renderReminderEmail({ text: input.text, tasks, cta, eventName, subject: input.subject });
  if (cta) return renderCtaEmail({ text: input.text, cta, eventName, subject: input.subject });
  const feedback = inferredFeedback(input.text);
  if (feedback) {
    const haystack = `${input.subject} ${input.text}`;
    const accepted = /accept|congratulat|speaking|you.?re in/i.test(haystack) && !/reject|declin|can.?t place/i.test(haystack);
    return renderDecisionEmail({
      text: input.text,
      decision: { status: accepted ? "accepted" : "rejected", feedback },
      cta,
      eventName,
      subject: input.subject,
    });
  }
  return renderGenericEmail({ text: input.text, eventName, subject: input.subject });
}

export function brandedHtml(subject: string, text: string, extras: Omit<BrandedEmailInput, "subject" | "text"> = {}) {
  return renderBrandedEmail({ subject, text, ...extras });
}

function ctaLabelFor(hay: string, kind?: string) {
  if (kind === "reviewer_invite" || /review queue|reviews outstanding|reviewer/i.test(hay)) return "Open your review queue";
  if (kind === "cfp_received" || kind === "acceptance" || /speaker portal|portal/i.test(hay)) return "Open your speaker portal";
  if (/sign-in|magic|login/i.test(hay)) return "Open your sign-in link";
  if (/invitation|invite/i.test(hay)) return "Open your invitation";
  return "Open link";
}

/** Structured extras for a communication kind. Inference still fills gaps. */
export function brandedExtras(opts: {
  eventName?: string;
  kind?: string;
  subject?: string;
  text: string;
  feedback?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  tasks?: EmailTask[];
}): Omit<BrandedEmailInput, "subject" | "text"> {
  const hay = `${opts.kind || ""} ${opts.subject || ""} ${opts.text}`;
  const href = opts.ctaUrl || extractFirstHttpUrl(opts.text);
  const extras: Omit<BrandedEmailInput, "subject" | "text"> = { eventName: opts.eventName };
  if (href) extras.cta = { href, label: opts.ctaLabel || ctaLabelFor(hay, opts.kind) };
  if (opts.kind === "acceptance" || opts.kind === "rejection") {
    extras.decision = { status: opts.kind === "acceptance" ? "accepted" : "rejected", feedback: opts.feedback };
  }
  if (opts.tasks?.length) extras.tasks = opts.tasks;
  return extras;
}

export function brandedHtmlFor(
  subject: string,
  text: string,
  extras: Omit<Parameters<typeof brandedExtras>[0], "subject" | "text"> & { text?: string } = {},
) {
  return brandedHtml(subject, text, brandedExtras({ ...extras, subject, text }));
}
