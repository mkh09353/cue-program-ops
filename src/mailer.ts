export type MailStatus = "mock_sent" | "sent" | "logged_undeliverable" | "failed";

export interface MailAttachment { filename: string; content: string; contentType: "text/calendar"; }
export interface MailMessage { to: string; subject: string; text: string; attachments?: MailAttachment[]; }
export interface Mailer { send(message: MailMessage): Promise<{ status: Exclude<MailStatus, "failed">; providerId?: string; note?: string }>; }

/** Credential-free default. It deliberately performs no I/O. */
export class MockMailer implements Mailer {
  readonly messages: MailMessage[] = [];
  async send(message: MailMessage) { this.messages.push(structuredClone(message)); return { status: "mock_sent" as const }; }
}

/** Minimal Resend-compatible HTTP seam. Selected only with MAILER_API_KEY and MAILER_FROM. */
export class HttpMailer implements Mailer {
  // Workers requires fetch to be invoked with the correct `this`; a bare reference throws "Illegal invocation".
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetcher: typeof fetch = (...args) => fetch(...args), private readonly url = "https://api.resend.com/emails") {}
  async send(message: MailMessage) {
    const response = await this.fetcher(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, attachments: message.attachments?.map(a => ({ filename: a.filename, content: a.content, content_type: a.contentType })) }) });
    if (response.status === 422) {
      // Provider validation (e.g. Resend sandbox refusing example.com fixtures):
      // record honestly as logged-not-delivered instead of failing the workflow.
      return { status: "logged_undeliverable" as const, note: "provider rejected recipient (sandbox/test address); message logged in-app only" };
    }
    if (!response.ok) throw new Error(`mail provider HTTP ${response.status}`);
    const body = await response.json().catch(() => ({})) as { id?: string };
    return { status: "sent" as const, providerId: body.id };
  }
}

export function configuredMailer(env: Record<string, string | undefined>, fetcher?: typeof fetch): Mailer {
  return env.MAILER_API_KEY && env.MAILER_FROM ? new HttpMailer(env.MAILER_API_KEY, env.MAILER_FROM, fetcher) : new MockMailer();
}
