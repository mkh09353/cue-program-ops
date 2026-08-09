import { createApp, configuredClient, restoreSnapshot } from "./app.js";
import { configuredPersistence } from "./persistence.js";
import { configuredMailer } from "./mailer.js";
import { MemoryRepository } from "./repository.js";
export interface Env { ACCELEVENTS_LIVE?: string; ACCELEVENTS_BASE_URL?: string; ACCELEVENTS_EVENT_ID?: string; ACCELEVENTS_TOKEN?: string; AIRTABLE_TOKEN?:string; AIRTABLE_BASE_ID?:string; MAILER_API_KEY?:string; MAILER_FROM?:string }
const env=typeof process === "undefined" ? {} : process.env;
const repo=new MemoryRepository(), persistence=configuredPersistence(env);
const app=createApp({repo,client:configuredClient(env),persistence,mailer:configuredMailer(env)});
const restored=restoreSnapshot({repo,persistence}).catch(error=>console.error("CUE snapshot restore failed",error instanceof Error?error.message:"unknown error"));
export default { fetch: (request:Request, env?:unknown, ctx?:unknown) => restored.then(()=>app.fetch(request,env,ctx as any)) };
