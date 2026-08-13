import { DurableObject } from "cloudflare:workers";
import { createApp, configuredClient, restoreSnapshot } from "./app.js";
import { configuredMailer } from "./mailer.js";
import { CompositeSnapshotPersistence, D1SnapshotPersistence, configuredPersistence } from "./persistence.js";
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
  DEMO_PERSONA_HEADERS?: string;
  DEMO_MCP_TOKEN?: string;
  AUTOMATION_PROVIDER_DELIVERY?: string;
  DB?: D1Database;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}

/** Single named instance owns Ruckus's mutable demo runtime. It never touches DO storage. */
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
        DEMO_PERSONA_HEADERS: env.DEMO_PERSONA_HEADERS,
        DEMO_MCP_TOKEN: env.DEMO_MCP_TOKEN,
      };
      const repo = new MemoryRepository();
      const secondary = configuredPersistence(variables);
      let persistence = secondary;
      if(env.DB){const d1=new D1SnapshotPersistence(env.DB);await d1.initialize();persistence=new CompositeSnapshotPersistence(d1,secondary)}
      this.app = createApp({
        repo,
        client: configuredClient(variables),
        persistence,
        mailer: configuredMailer(variables),
        ai: env.AI,
        demoPersonaHeaders: env.DEMO_PERSONA_HEADERS !== "false",
        demoMcpToken: env.DEMO_MCP_TOKEN,
        automationProviderDelivery: env.AUTOMATION_PROVIDER_DELIVERY === "true",
      });
      await restoreSnapshot({ repo, persistence }).catch((error) =>
        console.error("CUE Durable Object snapshot restore failed", error instanceof Error ? error.message : "unknown error"),
      );
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.app) return new Response("Ruckus state is initializing", { status: 503 });
    return this.app.fetch(request, this.env);
  }
}
