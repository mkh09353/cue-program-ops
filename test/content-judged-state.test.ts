import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";

const org={"content-type":"application/json","x-demo-persona":"org-swyx"};
const speaker=()=>store.personas.find(p=>p.speakerId==="spk-ada")!;

test("file comments project and persist explicit human role labels",async()=>{
  const app=createApp({repo:new MemoryRepository()});
  const file=store.contentFiles.find(f=>f.speakerId==="spk-ada")!;
  const posted=await app.request(`/api/content/files/${file.id}/comments`,{method:"POST",headers:org,body:JSON.stringify({body:"Organizer reply is durable"})});
  assert.equal(posted.status,201);
  assert.equal(((await posted.json()) as any).data.authorRole,"Organizer");
  const detail=await app.request(`/api/speaker/events/${EVENT_ID}/deliverables/${file.taskId}`,{headers:{"x-demo-persona":speaker().id}});
  const comments=((await detail.json()) as any).data.file.comments;
  assert.equal(comments.at(-1).authorRole,"Organizer");
  assert.ok(comments.every((c:any)=>c.authorRole==="Organizer"||c.authorRole==="Speaker"),"legacy rows get a role too");
});

test("public agenda names included and excluded session sets",async()=>{
  const app=createApp({repo:new MemoryRepository()});
  const schedule=await (new MemoryRepository() as any).getSchedule?.(EVENT_ID);
  void schedule;
  const html=await (await app.request("/e/ai-engineer-summit/public/agenda")).text();
  assert.match(html,/Approval gate applied/);
  assert.match(html,/Included approved\/published:/);
  assert.match(html,/Excluded unapproved:/);
  assert.match(html,/data-publication-gate/);
  const dayOne=await (await app.request("/e/ai-engineer-summit/public/agenda?day=2026-10-12")).text();
  const gate=dayOne.match(/data-agenda-publication-gate[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(gate,/Analytical Engines in Practice/);
  assert.match(gate,/Shipping AI Products/);
  assert.doesNotMatch(gate,/Advanced Agents Workshop/,"another day's title is not named in the current gate");
  assert.match(gate,/0 private sessions withheld/,"unscheduled drafts are outside this day-scoped agenda candidate set");

  const made=await app.request(`/api/events/${EVENT_ID}/embed-configs`,{method:"POST",headers:org,body:JSON.stringify({name:"Product agenda",widget:"agenda",filters:{track:"Product",day:"2026-10-12"}})});
  assert.equal(made.status,201);
  const config=((await made.json()) as any).data;
  const embedded=await (await app.request(`/e/ai-engineer-summit/public/agenda?config=${config.id}`)).text();
  const embeddedGate=embedded.match(/data-agenda-publication-gate[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(embeddedGate,/Shipping AI Products/);
  assert.doesNotMatch(embeddedGate,/Analytical Engines in Practice/);
  assert.match(embeddedGate,/0 private sessions withheld/,"excluded count uses the same embed filter basis");
});

test("portal tasks reconcile organizer deliverables and canonical completion",()=>{
  const page=readFileSync(new URL("../src/web/pages/PortalPages.tsx",import.meta.url),"utf8");
  assert.match(page,/portal-deliverable-task-/);
  assert.match(page,/deliverableForTask\(t,deliverables\)/);
  assert.match(page,/linkedDeliverable\.status === "complete" \? "completed" : "pending"/);
  assert.match(page,/organizer deliverable and portal completion agree/);
  assert.match(page,/task-uploaded-panel/);
  assert.match(page,/fileThreadStamp\(c\.createdAt\)/);
});
