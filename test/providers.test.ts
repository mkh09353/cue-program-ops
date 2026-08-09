import test from "node:test";
import assert from "node:assert/strict";
import { AirtableSnapshotPersistence, CompetitionSnapshot, D1SnapshotPersistence, MemorySnapshotPersistence, configuredPersistence } from "../src/persistence.js";
import { AirtableTransport } from "../src/airtable.js";
import { HttpMailer, MockMailer, configuredMailer } from "../src/mailer.js";
import { demoSchedule } from "../src/repository.js";
import { store } from "../src/lifecycle.js";

const snapshot = (): CompetitionSnapshot => ({ version: 1, eventId: "evt-ai-summit-2026", savedAt: "2026-10-01T00:00:00.000Z", lifecycle: structuredClone(store), schedule: structuredClone(demoSchedule), sync: { links: [], runs: [], items: [] } });

test("default persistence and mail adapters make zero network calls", async () => {
  let calls=0; const fetcher=(async () => { calls++; throw new Error("network must not be used"); }) as typeof fetch;
  const persistence=configuredPersistence({},fetcher); const mailer=configuredMailer({},fetcher);
  assert.ok(persistence instanceof MemorySnapshotPersistence); assert.ok(mailer instanceof MockMailer);
  await persistence.save(snapshot()); await persistence.load("evt-ai-summit-2026");
  const sent=await mailer.send({to:"speaker@example.test",subject:"Hello",text:"body"});
  assert.equal(sent.status,"mock_sent"); assert.equal(calls,0);
});

test("D1 persistence coalesces a burst, flushes latest, and restores it",async()=>{let row:any,writes=0;const db={exec:async()=>({}),prepare:(sql:string)=>({bind:(...args:any[])=>({run:async()=>{writes++;row={event_id:args[0],payload:args[1],updated_at:args[2]};return{}},first:async()=>row?{payload:row.payload}:null})})} as any;const persistence=new D1SnapshotPersistence(db,10);await persistence.initialize();const a=snapshot(),b=snapshot();b.savedAt="2026-10-01T00:00:02.000Z";b.schedule!.version=42;const pending=[persistence.save(a),persistence.save(b)];await Promise.all(pending);assert.equal(writes,1);const restored=await persistence.load(b.eventId);assert.equal(restored?.schedule?.version,42);assert.equal(restored?.savedAt,b.savedAt)});

test("Airtable snapshot save/load uses documented upsert and round-trips JSON", async () => {
  let saved: any; const requests: {url:string; init:RequestInit}[]=[];
  const fetcher=(async (url: any, init: RequestInit = {}) => { requests.push({url:String(url),init}); if(init.method==="PATCH"){saved=JSON.parse(String(init.body)); return new Response(JSON.stringify({records:[]}),{status:200});} return new Response(JSON.stringify({records:[{fields:saved.records[0].fields}]}),{status:200}); }) as typeof fetch;
  const persistence=new AirtableSnapshotPersistence(new AirtableTransport("secret-token","base123",fetcher));
  const source=snapshot(); await persistence.save(source); const loaded=await persistence.load(source.eventId);
  assert.equal(requests.length,2); assert.match(requests[0].url,/api\.airtable\.com\/v0\/base123\/CUE%20Snapshots/);
  assert.equal((requests[0].init.headers as any).Authorization,"Bearer secret-token");
  assert.equal(saved.performUpsert.fieldsToMergeOn[0],"External ID");
  assert.deepEqual(loaded,source);
});

test("configured mailer uses Resend-compatible request with ICS attachment", async () => {
  let request: any; const fetcher=(async (url:any,init:RequestInit={})=>{request={url:String(url),init};return new Response(JSON.stringify({id:"mail-1"}),{status:200});}) as typeof fetch;
  const mailer=configuredMailer({MAILER_API_KEY:"resend-secret",MAILER_FROM:"CUE <ops@example.test>"},fetcher);
  assert.ok(mailer instanceof HttpMailer);
  const result=await mailer.send({to:"speaker@example.test",subject:"Schedule",text:"Attached",attachments:[{filename:"invite.ics",content:"BEGIN:VCALENDAR",contentType:"text/calendar"}]});
  const body=JSON.parse(request.init.body);
  assert.equal(request.url,"https://api.resend.com/emails"); assert.equal(request.init.headers.Authorization,"Bearer resend-secret");
  assert.deepEqual(body.to,["speaker@example.test"]); assert.equal(body.attachments[0].content_type,"text/calendar"); assert.equal(result.status,"sent");
});
