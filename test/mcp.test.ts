import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createApp } from "../src/app.js";
import { emptyAuthState, hydrateAuthState } from "../src/auth.js";
import { EVENT_ID, store } from "../src/lifecycle.js";
import { MemoryRepository } from "../src/repository.js";

const demoToken="test-mcp-secret";
const rpc=(app:ReturnType<typeof createApp>,body:unknown,token=demoToken)=>app.request("/api/mcp",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify(body)});
const call=(app:ReturnType<typeof createApp>,id:number,name:string,args:Record<string,unknown>={})=>rpc(app,{jsonrpc:"2.0",id,method:"tools/call",params:{name,arguments:args}});
const cookie=(response:Response)=>{const value=response.headers.get("set-cookie");assert.ok(value);return value.split(";",1)[0]};

beforeEach(()=>hydrateAuthState(emptyAuthState()));

test("MCP initialize negotiates protocol and advertises server capabilities",async()=>{
 const app=createApp({demoMcpToken:demoToken});const response=await rpc(app,{jsonrpc:"2.0",id:"init-1",method:"initialize",params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"test",version:"1"}}});assert.equal(response.status,200);const body=await response.json() as any;assert.equal(body.id,"init-1");assert.equal(body.result.protocolVersion,"2025-03-26");assert.deepEqual(body.result.serverInfo,{name:"cue",version:"1.0.0"});assert.deepEqual(body.result.capabilities,{tools:{}});
});

test("MCP tools/list returns every tool with object input schemas",async()=>{
 const app=createApp({demoMcpToken:demoToken});const response=await rpc(app,{jsonrpc:"2.0",id:2,method:"tools/list",params:{}}),body=await response.json() as any;assert.deepEqual(body.result.tools.map((x:any)=>x.name),["list_events","list_submissions","get_submission","list_speakers","get_schedule","list_review_progress","send_task_reminder","complete_speaker_task"]);for(const tool of body.result.tools){assert.equal(tool.inputSchema.type,"object");assert.equal(typeof tool.description,"string")}
});

test("MCP list_submissions returns real seeded lifecycle data",async()=>{
 const app=createApp({demoMcpToken:demoToken});const response=await call(app,3,"list_submissions",{status:"accepted"}),body=await response.json() as any;const rows=JSON.parse(body.result.content[0].text);assert.ok(rows.length>0);assert.ok(rows.every((x:any)=>x.status==="accepted"));assert.ok(rows.some((x:any)=>x.id==="sub-ada"));
});

test("MCP requires a configured valid bearer token",async()=>{
 const app=createApp({demoMcpToken:demoToken}),body={jsonrpc:"2.0",id:4,method:"tools/list",params:{}};assert.equal((await app.request("/api/mcp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})).status,401);assert.equal((await rpc(app,body,"wrong-token")).status,401);const noConfiguredDemo=createApp();assert.equal((await rpc(noConfiguredDemo,body,demoToken)).status,401);
});

test("complete_speaker_task MCP write uses and mutates the canonical lifecycle store",async()=>{
 const app=createApp({repo:new MemoryRepository(),demoMcpToken:demoToken}),task=store.tasks.find(x=>x.id==="task-sam-profile")!;task.status="not_started";const response=await call(app,5,"complete_speaker_task",{speakerId:"spk-sam",taskId:task.id}),body=await response.json() as any;assert.equal(body.result.isError,undefined);assert.equal(JSON.parse(body.result.content[0].text).status,"completed");assert.equal(task.status,"completed");
});

test("organizer API token create/list/revoke roundtrip rejects the revoked token",async()=>{
 const app=createApp();const demo=await app.request("/api/auth/demo/organizer"),session=cookie(demo);const created=await app.request("/api/auth/tokens",{method:"POST",headers:{"content-type":"application/json",cookie:session},body:JSON.stringify({name:"Agent token"})});assert.equal(created.status,201);const createdBody=await created.json() as any,raw=createdBody.data.token,id=createdBody.data.apiToken.id;assert.equal(typeof raw,"string");
 const listed=await app.request("/api/auth/tokens",{headers:{cookie:session}}),listedBody=await listed.json() as any;assert.ok(listedBody.data.some((x:any)=>x.id===id&&x.name==="Agent token"));assert.equal(JSON.stringify(listedBody).includes(raw),false);assert.equal((await rpc(app,{jsonrpc:"2.0",id:6,method:"tools/list",params:{}},raw)).status,200);
 const revoked=await app.request(`/api/auth/tokens/${id}`,{method:"DELETE",headers:{cookie:session}});assert.equal(revoked.status,200);assert.equal((await rpc(app,{jsonrpc:"2.0",id:7,method:"tools/list",params:{}},raw)).status,401);
});

test("initialized notification returns 202 with no JSON-RPC body",async()=>{const app=createApp({demoMcpToken:demoToken}),response=await rpc(app,{jsonrpc:"2.0",method:"notifications/initialized"});assert.equal(response.status,202);assert.equal(await response.text(),"")});
