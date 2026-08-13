import type { CueEnv } from "./durable.js";
import { runScheduledAutomation } from "./automation.js";
export { CueState } from "./durable.js";
export interface Env extends CueEnv {
  AI?: CueEnv["AI"];
  ACCELEVENTS_LIVE?: string;
  ACCELEVENTS_BASE_URL?: string;
  ACCELEVENTS_EVENT_ID?: string;
  ACCELEVENTS_TOKEN?: string;
  AIRTABLE_TOKEN?: string;
  AIRTABLE_BASE_ID?: string;
  MAILER_API_KEY?: string;
  MAILER_FROM?: string;
  DEMO_PERSONA_HEADERS?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  CUE_STATE: DurableObjectNamespace;
}
const apiPath = (pathname: string) =>
  pathname === "/health" ||
  pathname === "/demo" ||
  // /docs/* is the server-rendered API documentation page, not an SPA route.
  ["/api/", "/public/", "/embed/", "/sync/", "/docs/"].some((prefix) => pathname.startsWith(prefix)) ||
  // Public widgets live under /e/:slug/public/* (SPA CFP remains /e/:slug/cfp on assets).
  /^\/e\/[^/]+\/public(?:\/|$)/.test(pathname);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const pathname = new URL(request.url).pathname;
    if (!apiPath(pathname)) return env.ASSETS.fetch(request);
    const state = env.CUE_STATE.get(env.CUE_STATE.idFromName("primary"));
    return state.fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    runScheduledAutomation(env,(promise)=>ctx.waitUntil(promise));
  },
};
