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
