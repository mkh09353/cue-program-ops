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
  const fetcher=(async (url: any, init: RequestInit = {}) => { const href=String(url);requests.push({url:href,init});if(href.includes("/meta/bases/"))return new Response(JSON.stringify({tables:[{name:"Speakers"},{name:"Sessions"}]}),{status:200});if(init.method==="PATCH"){const body=JSON.parse(String(init.body));if(href.endsWith("CUE%20Snapshots"))saved=body;return new Response(JSON.stringify({records:[]}),{status:200});}return new Response(JSON.stringify({records:[{fields:saved.records[0].fields}]}),{status:200}); }) as typeof fetch;
  const persistence=new AirtableSnapshotPersistence(new AirtableTransport("secret-token","base123",fetcher));
  const source=snapshot(); await persistence.save(source); const loaded=await persistence.load(source.eventId);
  const blobPatch=requests.find(r=>r.init.method==="PATCH"&&r.url.endsWith("CUE%20Snapshots"));const blobGet=requests.find(r=>!r.init.method&&r.url.endsWith("CUE%20Snapshots"));
  assert.ok(blobPatch,"snapshot blob is upserted");assert.ok(blobGet,"snapshot blob remains the load source");assert.equal((blobPatch.init.headers as any).Authorization,"Bearer secret-token");
  assert.equal(saved.performUpsert.fieldsToMergeOn[0],"External ID");
  assert.deepEqual(loaded,source);
});

test("Airtable creates and caches normalized tables then upserts exact speaker and session mirrors",async()=>{
  const source=snapshot();
  const wantedSubmissions=source.lifecycle.submissions.filter(s=>["spk-ada","spk-margaret"].includes(s.speakerId)).slice(0,2).map(s=>({...s,status:"accepted" as const}));
  assert.equal(wantedSubmissions.length,2,"fixture has two accepted speakers");source.lifecycle.submissions=wantedSubmissions;
  source.lifecycle.profiles=source.lifecycle.profiles.filter(p=>["spk-ada","spk-margaret"].includes(p.speakerId));
  (source.lifecycle.profiles[0] as any).workflowStatus="accepted";(source.lifecycle.profiles[1] as any).workflowStatus="confirmed";
  source.schedule!.sessions=source.schedule!.sessions.filter(s=>["ses-analytical","ses-product"].includes(s.id));
  source.schedule!.slots=source.schedule!.slots.filter(s=>["ses-analytical","ses-product"].includes(s.sessionId));
  const requests:{url:string;init:RequestInit}[]=[];const tables=new Set<string>();
  const fetcher=(async(url:any,init:RequestInit={})=>{const href=String(url);requests.push({url:href,init});if(href.includes("/meta/bases/")){if(init.method==="POST"){const body=JSON.parse(String(init.body));tables.add(body.name);return new Response(JSON.stringify({id:`tbl-${body.name}`,name:body.name,fields:body.fields}),{status:200})}return new Response(JSON.stringify({tables:[...tables].map(name=>({name}))}),{status:200})}return new Response(JSON.stringify({records:[]}),{status:200})}) as typeof fetch;
  const persistence=new AirtableSnapshotPersistence(new AirtableTransport("token","base",fetcher));await persistence.save(source);await persistence.save(source);
  const metadataPosts=requests.filter(r=>r.url.includes("/meta/bases/")&&r.init.method==="POST");assert.deepEqual(metadataPosts.map(r=>JSON.parse(String(r.init.body)).name),["Speakers","Sessions"]);
  assert.equal(requests.filter(r=>r.url.includes("/meta/bases/")&&!r.init.method).length,2,"each table existence is checked once per transport");
  const patches=requests.filter(r=>r.init.method==="PATCH");for(const request of patches)assert.deepEqual(JSON.parse(String(request.init.body)).performUpsert.fieldsToMergeOn,["External ID"]);
  const latest=(table:string)=>JSON.parse(String(patches.filter(r=>r.url.endsWith(table)).at(-1)!.init.body)).records;
  const speakerRows=latest("Speakers");assert.equal(speakerRows.length,2);assert.deepEqual(Object.keys(speakerRows[0].fields),["Name","Email","Title","Company","Bio","Workflow Status","Event","External ID"]);assert.deepEqual(new Set(speakerRows.map((r:any)=>r.fields["External ID"])),new Set(["spk-ada","spk-margaret"]));assert.deepEqual(new Set(speakerRows.map((r:any)=>r.fields["Workflow Status"])),new Set(["accepted","confirmed"]));
  const sessionRows=latest("Sessions");assert.equal(sessionRows.length,2);assert.deepEqual(Object.keys(sessionRows[0].fields),["Title","Abstract","Status","Track","Room","Starts At","Ends At","Speakers","Event","External ID"]);assert.deepEqual(new Set(sessionRows.map((r:any)=>r.fields["External ID"])),new Set(["ses-analytical","ses-product"]));
  const analytical=sessionRows.find((r:any)=>r.fields["External ID"]==="ses-analytical").fields;assert.equal(analytical.Track,"Infrastructure");assert.equal(analytical.Room,"Main Hall");assert.equal(analytical["Starts At"],"2026-10-12T17:00:00.000Z");assert.equal(analytical["Ends At"],"2026-10-12T17:45:00.000Z");assert.equal(analytical.Speakers,"Ada Lovelace");
  const product=sessionRows.find((r:any)=>r.fields["External ID"]==="ses-product").fields;assert.equal(product.Track,"Product");assert.equal(product.Room,"Workshop Lab");assert.equal(product.Speakers,"Margaret Hamilton");
});

test("normalized Airtable failure does not reject blob save and the other table is attempted",async()=>{
  const requests:{url:string;init:RequestInit}[]=[];const warnings:string[]=[];const originalWarn=console.warn;console.warn=(...args:unknown[])=>warnings.push(args.map(String).join(" "));
  try{const fetcher=(async(url:any,init:RequestInit={})=>{const href=String(url);requests.push({url:href,init});if(href.includes("/meta/bases/")){const metadataGets=requests.filter(r=>r.url.includes("/meta/bases/")&&!r.init.method).length;if(metadataGets===1)return new Response("denied",{status:403});return new Response(JSON.stringify({tables:[{name:"Sessions"}]}),{status:200})}return new Response(JSON.stringify({records:[]}),{status:200})}) as typeof fetch;const persistence=new AirtableSnapshotPersistence(new AirtableTransport("token","base",fetcher));await assert.doesNotReject(()=>persistence.save(snapshot()));assert.ok(requests.some(r=>r.init.method==="PATCH"&&r.url.endsWith("CUE%20Snapshots")));assert.ok(requests.some(r=>r.init.method==="PATCH"&&r.url.endsWith("Sessions")),"Sessions sync is attempted after Speakers failure");assert.ok(warnings.some(w=>w.includes("Speakers sync failed")))}finally{console.warn=originalWarn}
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
