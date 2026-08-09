import { createApp, configuredClient, restoreSnapshot } from "./app.js";
import { configuredPersistence } from "./persistence.js";
import { configuredMailer } from "./mailer.js";
import { MemoryRepository } from "./repository.js";
export interface Env {
  ACCELEVENTS_LIVE?: string;
  ACCELEVENTS_BASE_URL?: string;
  ACCELEVENTS_EVENT_ID?: string;
  ACCELEVENTS_TOKEN?: string;
  AIRTABLE_TOKEN?: string;
  AIRTABLE_BASE_ID?: string;
  MAILER_API_KEY?: string;
  MAILER_FROM?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const repo = new MemoryRepository();
let runtime: Promise<ReturnType<typeof createApp>> | undefined;
const apiPath = (pathname: string) =>
  pathname === "/health" ||
  pathname === "/demo" ||
  ["/api/", "/public/", "/embed/", "/sync/"].some((prefix) => pathname.startsWith(prefix)) ||
  // Public widgets live under /e/:slug/public/* (SPA CFP remains /e/:slug/cfp on assets).
  /^\/e\/[^/]+\/public(?:\/|$)/.test(pathname);

async function getApp(env: Env) {
  runtime ??= (async () => {
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
    const persistence = configuredPersistence(variables);
    const app = createApp({ repo, client: configuredClient(variables), persistence, mailer: configuredMailer(variables) });
    await restoreSnapshot({ repo, persistence }).catch((error) =>
      console.error("CUE snapshot restore failed", error instanceof Error ? error.message : "unknown error"),
    );
    return app;
  })();
  return runtime;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const pathname = new URL(request.url).pathname;
    if (!apiPath(pathname)) return env.ASSETS.fetch(request);
    return (await getApp(env)).fetch(request, env, ctx);
  },
};
