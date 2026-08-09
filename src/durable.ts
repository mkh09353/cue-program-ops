import { DurableObject } from "cloudflare:workers";
import { createApp, configuredClient, restoreSnapshot } from "./app.js";
import { configuredMailer } from "./mailer.js";
import { configuredPersistence } from "./persistence.js";
import { MemoryRepository } from "./repository.js";

export interface CueEnv {
  ACCELEVENTS_LIVE?: string;
  ACCELEVENTS_BASE_URL?: string;
  ACCELEVENTS_EVENT_ID?: string;
  ACCELEVENTS_TOKEN?: string;
  AIRTABLE_TOKEN?: string;
  AIRTABLE_BASE_ID?: string;
  MAILER_API_KEY?: string;
  MAILER_FROM?: string;
}

/** Single named instance owns CUE's mutable demo runtime. It never touches DO storage. */
export class CueState extends DurableObject<CueEnv> {
  private app?: ReturnType<typeof createApp>;

  constructor(ctx: DurableObjectState, env: CueEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const variables: Record<string, string | undefined> = {
        ACCELEVENTS_LIVE: env.ACCELEVENTS_LIVE,
        ACCELEVENTS_BASE_URL: env.ACCELEVENTS_BASE_URL,
        ACCELEVENTS_EVENT_ID: env.ACCELEVENTS_EVENT_ID,
        ACCELEVENTS_TOKEN: env.ACCELEVENTS_TOKEN,
        AIRTABLE_TOKEN: env.AIRTABLE_TOKEN,
        AIRTABLE_BASE_ID: env.AIRTABLE_BASE_ID,
        MAILER_API_KEY: env.MAILER_API_KEY,
        MAILER_FROM: env.MAILER_FROM,
      };
      const repo = new MemoryRepository();
      // Memory persistence is a no-op; configured Airtable optionally restores and
      // snapshots state. Durable Object storage is deliberately unused.
      const persistence = configuredPersistence(variables);
      this.app = createApp({
        repo,
        client: configuredClient(variables),
        persistence,
        mailer: configuredMailer(variables),
      });
      await restoreSnapshot({ repo, persistence }).catch((error) =>
        console.error("CUE Durable Object snapshot restore failed", error instanceof Error ? error.message : "unknown error"),
      );
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.app) return new Response("CUE state is initializing", { status: 503 });
    return this.app.fetch(request, this.env);
  }
}
