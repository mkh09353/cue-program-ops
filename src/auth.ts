import { Hono } from "hono";
import type { Mailer } from "./mailer.js";
import { EVENT_ID, SEED_AUTH_IDENTITIES } from "./lifecycle.js";

export type AuthRole = "organizer" | "reviewer" | "speaker";
export interface AuthUser { id:string; email:string; name:string; passwordHash?:string; roleHints?:{role:AuthRole;personaId?:string;speakerId?:string}[]; createdAt:string }
export interface AuthSession { tokenHash:string; userId:string; createdAt:string; expiresAt:string }
export interface AuthOrganization { id:string; name:string }
export interface AuthOrgMembership { userId:string; orgId:string; role:"owner"|"admin"|"member" }
export interface AuthEventRole { userId:string; eventId:string; role:AuthRole }
export interface AuthInvitation { tokenHash:string; email:string; orgId?:string; eventId?:string; role:string; status:"pending"|"accepted"|"revoked"; createdAt:string; expiresAt:string }
export interface MagicLinkToken { tokenHash:string; email:string; expiresAt:string; usedAt?:string }
export interface AuthState { users:AuthUser[]; sessions:AuthSession[]; orgs:AuthOrganization[]; orgMemberships:AuthOrgMembership[]; eventRoles:AuthEventRole[]; invitations:AuthInvitation[]; magicLinkTokens:MagicLinkToken[] }
export interface AuthPrincipal { user:AuthUser; session:AuthSession; renewed?:boolean }

const DAY=86_400_000,SESSION_DAYS=7,PBKDF2_ITERATIONS=120_000;
const encoder=new TextEncoder();
const bytesToBase64Url=(bytes:Uint8Array)=>{
  let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
};
const base64UrlToBytes=(value:string)=>{
  const base=value.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(value.length/4)*4,"=");
  const binary=atob(base);return Uint8Array.from(binary,x=>x.charCodeAt(0));
};
export const randomToken=()=>bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
export async function tokenHash(token:string){return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(token))))}
const constantTimeEqual=(a:Uint8Array,b:Uint8Array)=>{if(!a.length||!b.length)return false;let diff=a.length^b.length;const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)diff|=(a[i%a.length]||0)^(b[i%b.length]||0);return diff===0};

export async function hashPassword(password:string){
  if(password.length<8)throw new Error("password must be at least 8 characters");
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const material=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:PBKDF2_ITERATIONS},material,256);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}
export async function verifyPassword(password:string,record?:string){
  if(!record)return false;const [algorithm,rawIterations,rawSalt,rawExpected]=record.split("$");
  const iterations=Number(rawIterations);if(algorithm!=="pbkdf2-sha256"||iterations<100_000||!rawSalt||!rawExpected)return false;
  try{const salt=base64UrlToBytes(rawSalt),expected=base64UrlToBytes(rawExpected);const material=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},material,expected.length*8);return constantTimeEqual(new Uint8Array(bits),expected)}catch{return false}
}
const normalizedEmail=(value:unknown)=>String(value||"").trim().toLowerCase();
const cookieValue=(request:Request,name:string)=>request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1);
const sessionCookie=(token:string,request:Request,maxAge=SESSION_DAYS*86400)=>`cue_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==="https:"?"; Secure":""}`;
const clearCookie=(request:Request)=>`cue_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol==="https:"?"; Secure":""}`;
export const renewalCookie=(request:Request)=>{const raw=cookieValue(request,"cue_session");return raw?sessionCookie(decodeURIComponent(raw),request):undefined};
const error=(c:any,message:string,status=400)=>c.json({error:{message}},status);

export function emptyAuthState():AuthState{return {users:[],sessions:[],orgs:[],orgMemberships:[],eventRoles:[],invitations:[],magicLinkTokens:[]}}
export const authStore:AuthState=emptyAuthState();
export function hydrateAuthState(value?:Partial<AuthState>){const source=value||{};for(const key of Object.keys(authStore) as (keyof AuthState)[])(authStore as any)[key]=structuredClone((source as any)[key]||[])}

/** Seeded accounts use real sessions but map onto the existing lifecycle persona ids. */
export function ensureSeededAuth(){
  const now=new Date().toISOString();
  const users:AuthUser[]=SEED_AUTH_IDENTITIES.map(seed=>({id:seed.id,email:seed.email,name:seed.name,roleHints:[{role:seed.role,personaId:seed.personaId,speakerId:"speakerId" in seed?seed.speakerId:undefined}],createdAt:now}));
  for(const user of users)if(!authStore.users.some(x=>x.id===user.id))authStore.users.push(user);
  if(!authStore.orgs.some(x=>x.id==="org-cue-demo"))authStore.orgs.push({id:"org-cue-demo",name:"CUE Demo Organization"});
  if(!authStore.orgMemberships.some(x=>x.userId==="user-demo-dana"))authStore.orgMemberships.push({userId:"user-demo-dana",orgId:"org-cue-demo",role:"owner"});
  const roles:AuthEventRole[]=SEED_AUTH_IDENTITIES.map(seed=>({userId:seed.id,eventId:EVENT_ID,role:seed.role}));
  for(const row of roles)if(!authStore.eventRoles.some(x=>x.userId===row.userId&&x.eventId===row.eventId&&x.role===row.role))authStore.eventRoles.push(row);
}

async function createSession(userId:string){const token=randomToken(),now=Date.now();authStore.sessions.push({tokenHash:await tokenHash(token),userId,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+SESSION_DAYS*DAY).toISOString()});return token}
export async function resolveSession(request:Request):Promise<AuthPrincipal|undefined>{
  const raw=cookieValue(request,"cue_session");if(!raw)return undefined;const hash=await tokenHash(decodeURIComponent(raw));const now=Date.now();
  const session=authStore.sessions.find(x=>x.tokenHash===hash&&!Number.isNaN(Date.parse(x.expiresAt))&&Date.parse(x.expiresAt)>now);if(!session)return undefined;
  const user=authStore.users.find(x=>x.id===session.userId);if(!user)return undefined;
  // Renewable seven-day sessions: renew during the final day without changing the opaque token.
  const renewed=Date.parse(session.expiresAt)-now<DAY;
  if(renewed)session.expiresAt=new Date(now+SESSION_DAYS*DAY).toISOString();
  return {user,session,renewed};
}

export function createAuthRoutes(deps:{mailer:Mailer;persist:()=>Promise<void>;origin?:(request:Request)=>string}){
  const app=new Hono();
  const current=async(c:any)=>resolveSession(c.req.raw);
  app.post("/api/auth/signup",async c=>{const b=await c.req.json().catch(()=>null) as any,email=normalizedEmail(b?.email),name=String(b?.name||"").trim();if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return error(c,"valid name and email required");if(authStore.users.some(x=>x.email===email))return error(c,"account already exists",409);let passwordHash:string;try{passwordHash=await hashPassword(String(b?.password||""))}catch(e){return error(c,e instanceof Error?e.message:"invalid password")};const now=new Date().toISOString(),user:AuthUser={id:`user-${crypto.randomUUID()}`,email,name,passwordHash,roleHints:[{role:"organizer"}],createdAt:now},org:AuthOrganization={id:`org-${crypto.randomUUID()}`,name:`${name}'s organization`};authStore.users.push(user);authStore.orgs.push(org);authStore.orgMemberships.push({userId:user.id,orgId:org.id,role:"owner"});const token=await createSession(user.id);await deps.persist();c.header("set-cookie",sessionCookie(token,c.req.raw));return c.json({data:{user:{id:user.id,email,name},organization:org}},201)});
  app.post("/api/auth/login",async c=>{const b=await c.req.json().catch(()=>null) as any,user=authStore.users.find(x=>x.email===normalizedEmail(b?.email));if(!user||!await verifyPassword(String(b?.password||""),user.passwordHash))return error(c,"invalid email or password",401);const token=await createSession(user.id);await deps.persist();c.header("set-cookie",sessionCookie(token,c.req.raw));return c.json({data:{user:{id:user.id,email:user.email,name:user.name}}})});
  app.post("/api/auth/logout",async c=>{const raw=cookieValue(c.req.raw,"cue_session");if(raw){const hash=await tokenHash(decodeURIComponent(raw));authStore.sessions=authStore.sessions.filter(x=>x.tokenHash!==hash);await deps.persist()}c.header("set-cookie",clearCookie(c.req.raw));return c.json({data:{loggedOut:true}})});
  app.post("/api/auth/magic-link",async c=>{const b=await c.req.json().catch(()=>null) as any,email=normalizedEmail(b?.email);if(!authStore.users.some(x=>x.email===email))return c.json({data:{accepted:true}});const token=randomToken(),expiresAt=new Date(Date.now()+15*60_000).toISOString();authStore.magicLinkTokens.push({tokenHash:await tokenHash(token),email,expiresAt});const origin=deps.origin?.(c.req.raw)||new URL(c.req.url).origin,url=`${origin}/login?token=${encodeURIComponent(token)}`;const result=await deps.mailer.send({to:email,subject:"Your CUE sign-in link",text:`Sign in to CUE: ${url}\n\nThis link expires in 15 minutes.`}).catch(()=>({status:"failed" as const}));await deps.persist();return c.json({data:{accepted:true,delivery:result.status,...(result.status==="mock_sent"?{demoOnlyLoginUrl:url,demoOnly:true}:{})}})});
  app.post("/api/auth/magic-link/consume",async c=>{const b=await c.req.json().catch(()=>null) as any,hash=await tokenHash(String(b?.token||"")),row=authStore.magicLinkTokens.find(x=>x.tokenHash===hash&&!x.usedAt&&Date.parse(x.expiresAt)>Date.now());if(!row)return error(c,"magic link is invalid or expired",400);const user=authStore.users.find(x=>x.email===row.email);if(!user)return error(c,"account not found",404);row.usedAt=new Date().toISOString();const token=await createSession(user.id);await deps.persist();c.header("set-cookie",sessionCookie(token,c.req.raw));return c.json({data:{user:{id:user.id,email:user.email,name:user.name}}})});
  app.get("/api/auth/me",async c=>{const principal=await current(c);if(!principal)return error(c,"authentication required",401);const user=principal.user;return c.json({data:{user:{id:user.id,email:user.email,name:user.name},orgMemberships:authStore.orgMemberships.filter(x=>x.userId===user.id),eventRoles:authStore.eventRoles.filter(x=>x.userId===user.id),roleHints:user.roleHints||[]}})});
  app.post("/api/auth/invitations",async c=>{const principal=await current(c);if(!principal)return error(c,"authentication required",401);const b=await c.req.json().catch(()=>null) as any,email=normalizedEmail(b?.email),orgId=b?.orgId?String(b.orgId):undefined,eventId=b?.eventId?String(b.eventId):undefined,role=String(b?.role||"member");const orgAdmin=orgId&&authStore.orgMemberships.some(x=>x.userId===principal.user.id&&x.orgId===orgId&&(x.role==="owner"||x.role==="admin")),eventAdmin=eventId&&(authStore.eventRoles.some(x=>x.userId===principal.user.id&&x.eventId===eventId&&x.role==="organizer")||authStore.orgMemberships.some(x=>x.userId===principal.user.id&&(x.role==="owner"||x.role==="admin")));if(!email||(!orgAdmin&&!eventAdmin))return error(c,"organization or event admin required",403);const token=randomToken(),row:AuthInvitation={tokenHash:await tokenHash(token),email,orgId,eventId,role,status:"pending",createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*DAY).toISOString()};authStore.invitations.push(row);const url=`${new URL(c.req.url).origin}/login?invitation=${encodeURIComponent(token)}`,result=await deps.mailer.send({to:email,subject:"You are invited to CUE",text:`Accept your CUE invitation: ${url}`}).catch(()=>({status:"failed" as const}));await deps.persist();return c.json({data:{invitation:{email,orgId,eventId,role,status:row.status},delivery:result.status,...(result.status==="mock_sent"?{demoOnlyAcceptUrl:url,demoOnly:true}:{})}},201)});
  app.post("/api/auth/invitations/accept",async c=>{const b=await c.req.json().catch(()=>null) as any,hash=await tokenHash(String(b?.token||"")),invite=authStore.invitations.find(x=>x.tokenHash===hash&&x.status==="pending"&&Date.parse(x.expiresAt)>Date.now());if(!invite)return error(c,"invitation is invalid or expired",400);let user=authStore.users.find(x=>x.email===invite.email);if(!user){const name=String(b?.name||"").trim();if(!name)return error(c,"name is required");let passwordHash:string|undefined;if(b?.password){try{passwordHash=await hashPassword(String(b.password))}catch(e){return error(c,e instanceof Error?e.message:"invalid password")}}user={id:`user-${crypto.randomUUID()}`,email:invite.email,name,passwordHash,roleHints:[],createdAt:new Date().toISOString()};authStore.users.push(user)}if(invite.orgId&&!authStore.orgMemberships.some(x=>x.userId===user!.id&&x.orgId===invite.orgId))authStore.orgMemberships.push({userId:user.id,orgId:invite.orgId,role:["owner","admin","member"].includes(invite.role)?invite.role as any:"member"});if(invite.eventId&&!authStore.eventRoles.some(x=>x.userId===user!.id&&x.eventId===invite.eventId&&x.role===invite.role))authStore.eventRoles.push({userId:user.id,eventId:invite.eventId,role:invite.role as AuthRole});invite.status="accepted";const token=await createSession(user.id);await deps.persist();c.header("set-cookie",sessionCookie(token,c.req.raw));return c.json({data:{user:{id:user.id,email:user.email,name:user.name}}})});
  app.get("/api/auth/demo/:persona",async c=>{ensureSeededAuth();const map:any={organizer:["user-demo-dana","/app"],reviewer:["user-demo-rey","/r"],speaker:["user-demo-maya","/p"]},entry=map[c.req.param("persona")];if(!entry)return error(c,"demo persona must be organizer, reviewer, or speaker",404);const token=await createSession(entry[0]);await deps.persist();c.header("set-cookie",sessionCookie(token,c.req.raw));return c.json({data:{target:entry[1]}})});
  return app;
}
