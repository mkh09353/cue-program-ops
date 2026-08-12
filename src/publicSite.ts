import { Hono } from "hono";
import type { Repository } from "./domain.js";
import { isSafeAccent, store } from "./lifecycle.js";
import { OPENAPI_YAML } from "./openapi.js";
import {
  agendaByDay,
  agendaDayCounts,
  buildIcs,
  buildPublicProgram,
  filterPublicSessions,
  filterPublicSpeakers,
  resolvePublicEventKey,
  sessionsForSpeaker,
  type PublicProgram,
  type PublicSessionView,
  type PublicSpeakerView,
} from "./publicProjection.js";

export type PublicSiteDeps = {
  repo: Repository & { getSchedule?: (id: string) => Promise<any> };
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function fmtWhen(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtTimeRange(startsAt: string, endsAt: string, timeZone: string) {
  // Published-but-unscheduled catalog entries carry no slot times.
  if (!startsAt || !endsAt) return "Time to be announced";
  const d = fmtWhen(startsAt, timeZone, { weekday: "short", month: "short", day: "numeric" });
  const a = fmtWhen(startsAt, timeZone, { hour: "numeric", minute: "2-digit" });
  const b = fmtWhen(endsAt, timeZone, { hour: "numeric", minute: "2-digit" });
  const tzShort = timeZone.includes("/") ? timeZone.split("/").pop()!.replace(/_/g, " ") : timeZone;
  return `${d} · ${a} – ${b} ${tzShort}`;
}

function fmtClock(iso: string, timeZone: string) {
  return fmtWhen(iso, timeZone, { hour: "numeric", minute: "2-digit" });
}

function fmtDayLabel(dayKey: string, timeZone: string) {
  try {
    const iso = `${dayKey}T12:00:00.000Z`;
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return dayKey;
  }
}

const SHARED_CSS = `
:root{color-scheme:light;--ink:#0a0a0a;--ink-soft:#171717;--mid:#737373;--line:#e5e5e5;--bg:#f5f5f5;--soft:#fafafa;--card:#ffffff;--danger:#e7000b;--radius:24px;--radius-pill:18px;--shadow:0 0 0 1px rgba(23,23,23,0.05),0 1px 3px rgba(0,0,0,0.1),0 1px 2px -1px rgba(0,0,0,0.1)}
*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Geist,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.43;font-size:14px;font-weight:400;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-decoration:none}a:hover{text-decoration:underline}
header.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top-inner{max-width:1100px;margin:0 auto;padding:12px 16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.brand{font-weight:600;letter-spacing:-.03em}.brand small{display:block;font-weight:500;color:var(--mid);font-size:11px;letter-spacing:.04em;text-transform:uppercase}
nav.tabs{display:flex;gap:6px;flex-wrap:wrap}
nav.tabs a{display:inline-flex;align-items:center;padding:8px 12px;border-radius:var(--radius-pill);font-size:14px;font-weight:500;color:var(--mid);background:transparent}
nav.tabs a.active,nav.tabs a:hover{background:var(--ink);color:#fafafa;text-decoration:none}
main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:clamp(1.4rem,3vw,1.875rem);font-weight:600;letter-spacing:-.03em;margin:0 0 4px;line-height:1.2}
.sub{color:var(--mid);font-size:14px;margin:0 0 16px}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 14px;align-items:center}
input[type=search],select,button,.btn{font:inherit}
input[type=search],select{border:1px solid transparent;background:var(--bg);border-radius:var(--radius-pill);padding:8px 10px;min-height:36px;color:var(--ink);outline:none}
input[type=search]:focus,select:focus{border-color:var(--line)}
input[type=search]{flex:1 1 220px;min-width:180px}
.btn,button.btn{border:0;border-radius:var(--radius-pill);padding:8px 16px;min-height:36px;font-weight:500;font-size:14px;cursor:pointer;background:var(--ink);color:#fafafa}
.btn.secondary{background:var(--bg);color:var(--ink);border:0}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid transparent}
.btn.sm{padding:6px 10px;font-size:12px;border-radius:var(--radius-pill);min-height:32px}
.count{font-size:13px;font-weight:500;color:var(--mid)}
.facets{display:flex;flex-wrap:wrap;gap:8px;width:100%;border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:0}
.facet-legend{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:0 4px}
.facets label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:var(--mid)}
.grid{display:grid;gap:12px}
.cards{grid-template-columns:1fr}
@media(min-width:720px){.cards{grid-template-columns:1fr 1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow)}
.card h2,.card h3{margin:0 0 6px;letter-spacing:-.02em;font-size:1.05rem;font-weight:600}
.meta{color:var(--mid);font-size:13px}
.pills{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;letter-spacing:.02em;background:var(--bg);color:var(--ink);padding:2px 8px;border-radius:var(--radius-pill);border:1px solid var(--line)}
.pill.track{background:var(--ink-soft);color:#fafafa;border-color:transparent}
.pill.format{background:var(--bg);color:var(--ink)}
.pill.room{background:var(--soft);color:var(--ink-soft)}
.speakers{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.speaker-chip{display:flex;gap:8px;align-items:center;min-width:0}
.avatar{width:36px;height:36px;border-radius:999px;display:grid;place-items:center;font-weight:600;font-size:12px;color:#fafafa;background:var(--ink);flex:0 0 auto;overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
.speaker-chip .who{min-width:0}.speaker-chip .who b{display:block;font-size:13px;font-weight:600}.speaker-chip .who span{display:block;font-size:12px;color:var(--mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.desc{color:var(--ink-soft);font-size:14px;margin:8px 0 0}
.desc.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.toggle{margin-top:6px;background:none;border:0;color:var(--ink);font-weight:500;cursor:pointer;padding:0;font-size:13px;text-decoration:underline;text-underline-offset:2px}
.empty{padding:28px;text-align:center;color:var(--mid);border:1px dashed var(--line);border-radius:var(--radius);background:#fff}
.back{display:inline-flex;align-items:center;gap:6px;font-weight:500;margin-bottom:12px}
.gallery{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.gallery .card{text-align:center;padding:16px 12px;cursor:pointer;transition:transform .12s ease,border-color .12s ease}
.gallery .card:hover{transform:translateY(-2px);border-color:var(--ink);text-decoration:none}
.gallery .avatar{width:72px;height:72px;margin:0 auto 10px;font-size:20px}
.detail-hero{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.detail-hero .avatar{width:88px;height:88px;font-size:28px}
.day-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.day-tabs a,.day-tabs button{border:1px solid var(--line);background:#fff;border-radius:var(--radius-pill);padding:8px 12px;font-weight:500;font-size:13px;cursor:pointer;color:var(--ink)}
.day-tabs a.active,.day-tabs button.active{background:var(--ink);color:#fafafa;border-color:var(--ink)}
.agenda-wrap{overflow:auto;border:1px solid var(--line);border-radius:var(--radius);background:#fff;box-shadow:var(--shadow)}
.agenda{border-collapse:separate;border-spacing:0;min-width:640px;width:100%}
.agenda th,.agenda td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:8px;vertical-align:top;font-size:12px}
.agenda th{background:var(--soft);position:sticky;top:0;z-index:1;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mid);font-weight:500}
.agenda th:first-child,.agenda td:first-child{position:sticky;left:0;background:var(--soft);z-index:2;min-width:72px;font-weight:600}
.agenda td:first-child{background:#fff}
.block{display:block;border-radius:var(--radius-pill);padding:8px;background:var(--bg);color:var(--ink);border-left:3px solid var(--ink);margin:0 0 6px}
.block b{display:block;font-size:12px;margin-bottom:2px;font-weight:600}
.block .meta{font-size:11px}
.time-group{margin:18px 0 8px;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:var(--mid)}
.star{border:1px solid var(--line);background:#fff;border-radius:var(--radius-pill);width:36px;height:36px;display:inline-grid;place-items:center;cursor:pointer;font-size:16px;color:var(--ink)}
.star.on{background:var(--ink);border-color:var(--ink);color:#fafafa}
.row-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:10px}
footer.site{max-width:1100px;margin:0 auto;padding:8px 16px 28px;color:var(--mid);font-size:11px;text-align:center}
.hidden{display:none!important}
`;

function shell(program: PublicProgram, opts: { title: string; active: string; body: string; headExtra?: string; base: string }) {
  const nav = [
    ["sessions", "Sessions", `${opts.base}/sessions`],
    ["speakers", "Speakers", `${opts.base}/speakers`],
    ["agenda", "Agenda", `${opts.base}/agenda`],
    ["itinerary", "Itinerary", `${opts.base}/itinerary`],
    ["gallery", "Gallery", `${opts.base}/gallery`],
  ]
    .map(
      ([key, label, href]) =>
        `<a href="${esc(href)}" class="${key === opts.active ? "active" : ""}">${esc(label)}</a>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(opts.title)} · ${esc(program.event.name)}</title>
<style>${SHARED_CSS}</style>
${opts.headExtra || ""}
</head>
<body>
<header class="top"><div class="top-inner">
  <div class="brand">${esc(program.event.name)}<small>Public program · no login</small></div>
  <nav class="tabs" aria-label="Public widgets">${nav}</nav>
</div></header>
<main>
${opts.body}
</main>
<footer class="site" data-publication-gate>
  <b>Approved/published session set (${program.publicationGate.included.length}):</b> ${program.publicationGate.included.map(s=>esc(s.title)).join(" · ")||"None"}<br/>
  <b>Excluded/unapproved session set:</b> ${program.publicationGate.excluded.length} private session${program.publicationGate.excluded.length===1?"":"s"} withheld from this public page<br/>
  Powered by CUE · published sessions only · timezone ${esc(program.event.timezone)}
</footer>
</body>
</html>`;
}

function avatarHtml(sp: { name: string; initials: string; headshotUrl?: string }, cls = "") {
  if (sp.headshotUrl) {
    return `<div class="avatar ${cls}"><img src="${esc(sp.headshotUrl)}" alt="${esc(sp.name)}"/></div>`;
  }
  return `<div class="avatar ${cls}" aria-hidden="true">${esc(sp.initials)}</div>`;
}

/** Job title + company shown under every speaker name (public cards + detail). */
function speakerRole(sp: { title?: string; company?: string }) {
  const role = [sp.title, sp.company].filter(Boolean).join(" · ");
  return role || "Speaker";
}

function speakerChips(speakers: PublicSpeakerView[], base: string) {
  if (!speakers.length) return `<div class="meta">Speakers TBA</div>`;
  return `<div class="speakers">${speakers
    .map(
      (sp) => `<a class="speaker-chip" href="${esc(base)}/speakers/${esc(sp.id)}">
      ${avatarHtml(sp)}
      <span class="who"><b>${esc(sp.name)}</b><span data-speaker-role>${esc(speakerRole(sp))}</span></span>
    </a>`,
    )
    .join("")}</div>`;
}

function sessionCard(s: PublicSessionView, program: PublicProgram, base: string, opts?: { star?: boolean; detailHref?: string }) {
  // A saved embed config can hide card fields (speakers / room / track / description).
  const show = {
    speakers: program.cardFields?.speakers !== false,
    room: program.cardFields?.room !== false,
    track: program.cardFields?.track !== false,
    description: program.cardFields?.description !== false,
  };
  // Always render a distinct Track badge — sessions without a track still get a
  // labelled "General" tag so track is never silently missing next to format/room.
  const trackPills = (s.trackNames.length ? s.trackNames : ["General"])
    .map((t) => `<span class="pill track" data-track-pill>Track · ${esc(t)}</span>`)
    .join("");
  const detail = opts?.detailHref || `${base}/sessions/${s.id}`;
  const star = opts?.star
    ? `<button type="button" class="star" data-star="${esc(s.id)}" aria-label="Add to my schedule" title="My Schedule">☆</button>`
    : "";
  return `<article class="card" data-session-id="${esc(s.id)}" data-title="${esc(s.title)}" data-tracks="${esc(s.trackNames.join("|"))}" data-format="${esc(s.format)}" data-room="${esc(s.room)}" data-speakers="${esc(s.speakers.map((x) => x.name).join(" | "))}">
    <div class="pills">${show.track ? trackPills : ""}<span class="pill format" data-format-pill>Format · ${esc(s.format)}</span>${show.room ? `<span class="pill room" data-room-pill>Room · ${esc(s.room)}</span>` : ""}</div>
    <h3><a href="${esc(detail)}">${esc(s.title)}</a></h3>
    <div class="meta">${esc(fmtTimeRange(s.startsAt, s.endsAt, program.event.timezone))}${show.room ? ` · ${esc(s.room)}` : ""}</div>
    <div class="meta" data-match-flag style="display:none"><b>Matched a speaker name</b></div>
    ${show.description ? `<p class="desc clamp" data-desc>${esc(s.abstract)}</p>
    <button type="button" class="toggle" data-toggle-desc>Show more</button>` : ""}
    ${show.speakers ? speakerChips(s.speakers, base) : ""}
    <div class="row-actions">
      <a class="btn secondary sm" href="${esc(detail)}">View details</a>
      ${star}
    </div>
  </article>`;
}

function emptyState(message: string) {
  return `<div class="empty" data-empty>${esc(message)}</div>`;
}

const CLIENT_FILTER_JS = `
(function(){
  function qs(sel, el){return (el||document).querySelector(sel)}
  function qsa(sel, el){return Array.prototype.slice.call((el||document).querySelectorAll(sel))}
  function applySessionFilters(root){
    var q=(qs('[data-search]',root)||{}).value||''; q=String(q).toLowerCase().trim();
    var track=(qs('[data-filter-track]',root)||{}).value||'';
    var format=(qs('[data-filter-format]',root)||{}).value||'';
    var room=(qs('[data-filter-room]',root)||{}).value||'';
    var cards=qsa('[data-session-id]',root);
    var shown=0, byTitle=0, bySpeaker=0, byOther=0;
    cards.forEach(function(card){
      var title=(card.getAttribute('data-title')||'').toLowerCase();
      var speakers=(card.getAttribute('data-speakers')||'').toLowerCase();
      var tracks=(card.getAttribute('data-tracks')||'');
      var fmt=card.getAttribute('data-format')||'';
      var rm=card.getAttribute('data-room')||'';
      var ok=true, inTitle=false, inSpeaker=false;
      if(q){
        inTitle=title.indexOf(q)>=0;
        inSpeaker=speakers.indexOf(q)>=0;
        var inText=(card.textContent||'').toLowerCase().indexOf(q)>=0;
        if(!inTitle && !inSpeaker && !inText) ok=false;
      }
      if(track && tracks.split('|').indexOf(track)<0) ok=false;
      if(format && fmt!==format) ok=false;
      if(room && rm!==room) ok=false;
      card.style.display = ok ? '' : 'none';
      // Make a speaker-name hit obvious on the card itself, not just in the count.
      var flag=qs('[data-match-flag]',card);
      if(flag) flag.style.display = (ok && q && inSpeaker && !inTitle) ? '' : 'none';
      if(ok){
        shown++;
        if(q){ if(inTitle) byTitle++; else if(inSpeaker) bySpeaker++; else byOther++; }
      }
    });
    var count=qs('[data-count]',root);
    if(count){
      var label = shown + ' of ' + cards.length + ' sessions';
      if(q){
        var bits=[];
        if(byTitle) bits.push(byTitle + ' by title');
        if(bySpeaker) bits.push(bySpeaker + ' by speaker name');
        if(byOther) bits.push(byOther + ' by description');
        if(bits.length) label += ' · matched ' + bits.join(', ');
      }
      count.textContent = label;
    }
    var empty=qs('[data-empty-filter]',root);
    if(empty){ empty.style.display = shown ? 'none' : 'block'; }
  }
  function applySpeakerFilters(root){
    var q=(qs('[data-search]',root)||{}).value||''; q=String(q).toLowerCase().trim();
    var cards=qsa('[data-speaker-id]',root);
    var shown=0;
    cards.forEach(function(card){
      var name=(card.getAttribute('data-name')||'').toLowerCase();
      var ok=!q || name.indexOf(q)>=0 || (card.textContent||'').toLowerCase().indexOf(q)>=0;
      card.style.display = ok ? '' : 'none';
      if(ok) shown++;
    });
    var count=qs('[data-count]',root);
    if(count){ count.textContent = shown + ' of ' + cards.length + ' speakers'; }
    var empty=qs('[data-empty-filter]',root);
    if(empty){ empty.style.display = shown ? 'none' : 'block'; }
  }
  document.addEventListener('input', function(e){
    var t=e.target; if(!t || !t.getAttribute) return;
    var root=t.closest('[data-filter-root]'); if(!root) return;
    if(root.getAttribute('data-filter-root')==='speakers') applySpeakerFilters(root); else applySessionFilters(root);
  });
  document.addEventListener('change', function(e){
    var t=e.target; if(!t || !t.getAttribute) return;
    var root=t.closest('[data-filter-root]'); if(!root) return;
    if(root.getAttribute('data-filter-root')==='speakers') applySpeakerFilters(root); else applySessionFilters(root);
  });
  document.addEventListener('click', function(e){
    var t=e.target; if(!t || !t.getAttribute) return;
    if(t.getAttribute('data-toggle-desc')!=null){
      var card=t.closest('.card'); if(!card) return;
      var d=qs('[data-desc]',card); if(!d) return;
      var open=d.classList.toggle('clamp')===false;
      // when clamp removed, open=true means expanded? classList.toggle returns new state (true if now present)
      // We want: if has clamp -> collapsed. After toggle, if clamp present then Show more else Show less.
      t.textContent = d.classList.contains('clamp') ? 'Show more' : 'Show less';
    }
  });
})();
`;

const MY_SCHEDULE_JS = `
(function(){
  var KEY='cue-my-schedule:'+ (document.body.getAttribute('data-event-id')||'event');
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]')||[] }catch(e){ return [] } }
  function save(ids){ localStorage.setItem(KEY, JSON.stringify(ids)); }
  function set(){ return new Set(load()); }
  function refresh(){
    var ids=set();
    document.querySelectorAll('[data-star]').forEach(function(btn){
      var id=btn.getAttribute('data-star');
      var on=ids.has(id);
      btn.classList.toggle('on', on);
      btn.textContent = on ? '★' : '☆';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Remove from my schedule' : 'Add to my schedule');
    });
    var view=document.querySelector('[data-my-view]');
    var mode=view && view.getAttribute('data-my-view')==='1';
    var cards=document.querySelectorAll('[data-session-id]');
    var shown=0;
    cards.forEach(function(card){
      var id=card.getAttribute('data-session-id');
      if(mode){
        var ok=ids.has(id);
        card.style.display = ok ? '' : 'none';
        if(ok) shown++;
      }
    });
    var count=document.querySelector('[data-my-count]');
    if(count) count.textContent = ids.size + ' saved';
    if(mode){
      var c=document.querySelector('[data-count]');
      if(c) c.textContent = shown + ' of ' + ids.size + ' in My Schedule';
      var empty=document.querySelector('[data-empty-filter]');
      if(empty) empty.style.display = shown ? 'none' : 'block';
      // Hide day sections that have no visible sessions after My Schedule filter
      document.querySelectorAll('[data-day-section]').forEach(function(sec){
        var any=false;
        sec.querySelectorAll('[data-session-id]').forEach(function(card){
          if(card.style.display !== 'none') any=true;
        });
        sec.style.display = any ? '' : 'none';
      });
    } else {
      document.querySelectorAll('[data-day-section]').forEach(function(sec){ sec.style.display=''; });
    }
    var exportBtn=document.querySelector('[data-export-ics]');
    if(exportBtn){
      var list=load();
      exportBtn.href = exportBtn.getAttribute('data-ics-base') + (list.length ? ('?ids='+encodeURIComponent(list.join(','))) : '');
    }
  }
  document.addEventListener('click', function(e){
    var t=e.target; if(!t||!t.getAttribute) return;
    if(t.getAttribute('data-star')!=null){
      var id=t.getAttribute('data-star');
      var ids=load();
      var i=ids.indexOf(id);
      if(i>=0) ids.splice(i,1); else ids.push(id);
      save(ids); refresh();
    }
    if(t.getAttribute('data-toggle-my')!=null){
      var view=document.querySelector('[data-my-view]');
      if(!view) return;
      var on = view.getAttribute('data-my-view') !== '1';
      view.setAttribute('data-my-view', on ? '1' : '0');
      t.textContent = on ? 'Show all sessions' : 'My Schedule';
      t.classList.toggle('active', on);
      // clear facet hides when leaving my-view handled by re-filter if needed
      if(!on){
        document.querySelectorAll('[data-session-id]').forEach(function(card){ card.style.display=''; });
        var root=document.querySelector('[data-filter-root]');
        if(root){ var ev=new Event('input',{bubbles:true}); var s=root.querySelector('[data-search]'); if(s) s.dispatchEvent(ev); }
      }
      refresh();
    }
  });
  document.addEventListener('DOMContentLoaded', refresh);
  refresh();
})();
`;

async function loadProgram(repo: PublicSiteDeps["repo"], key: string): Promise<{ program: PublicProgram; eventId: string; slug: string } | undefined> {
  const resolved = resolvePublicEventKey(key);
  if (!resolved) return undefined;
  const schedule = await repo.getSchedule?.(resolved.eventId);
  if (!schedule) return undefined;
  const program = buildPublicProgram(schedule, {
    id: resolved.eventId,
    slug: resolved.slug,
    location: store.event.location,
    website: store.event.website,
    name: store.event.name || schedule.event?.name,
  });
  return { program, eventId: resolved.eventId, slug: resolved.slug };
}

function baseFor(slug: string) {
  return `/e/${slug}/public`;
}

function legacyBase(eventKey: string) {
  return `/public/events/${eventKey}`;
}

function notFoundHtml(message = "Event not found") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Not found</title><style>${SHARED_CSS}</style></head><body><main><div class="empty"><h1>404</h1><p>${esc(message)}</p></div></main></body></html>`;
}

/**
 * Three clearly labelled facet groups (Track / Format / Room · Location). Counts make
 * the facets self-describing so an agent can see they exist and what they do.
 */
function facetControls(program: PublicProgram) {
  const opt = (t: string) => `<option value="${esc(t)}">${esc(t)}</option>`;
  const trackOpts = program.facets.tracks.map(opt).join("");
  const formatOpts = program.facets.formats.map(opt).join("");
  const roomOpts = program.facets.rooms.map(opt).join("");
  return `<fieldset class="facets" data-facets>
    <legend class="facet-legend">Filter sessions</legend>
    <label data-facet="track">Track (${program.facets.tracks.length})<select data-filter-track aria-label="Filter by track"><option value="">All tracks</option>${trackOpts}</select></label>
    <label data-facet="format">Format (${program.facets.formats.length})<select data-filter-format aria-label="Filter by format"><option value="">All formats</option>${formatOpts}</select></label>
    <label data-facet="room">Room · Location (${program.facets.rooms.length})<select data-filter-room aria-label="Filter by room or location"><option value="">All rooms</option>${roomOpts}</select></label>
  </fieldset>`;
}

function renderItinerary(program: PublicProgram, base: string) {
  const byDay = program.days.map((day) => {
    const sessions = program.sessions.filter((s) => s.dayKey === day);
    const groups = new Map<string, PublicSessionView[]>();
    for (const s of sessions) {
      const list = groups.get(s.startsAt) || [];
      list.push(s);
      groups.set(s.startsAt, list);
    }
    const blocks = [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([startsAt, list]) => {
        const cards = list
          .map((s) =>
            sessionCard(s, program, base, { star: true }).replace(
              'data-session-id="',
              `data-day="${esc(day)}" data-session-id="`,
            ),
          )
          .join("");
        return `<div class="time-group">${esc(fmtClock(startsAt, program.event.timezone))}</div>
          <div class="grid cards">${cards}</div>`;
      })
      .join("");
    return `<section data-day-section="${esc(day)}" class="day-section">
      <h2 style="font-size:1.1rem;margin:18px 0 8px">${esc(fmtDayLabel(day, program.event.timezone))} <span class="meta">· ${esc(program.event.timezone)}</span></h2>
      ${blocks || emptyState("No sessions this day.")}
    </section>`;
  });

  const body = `
  <h1>Schedule itinerary</h1>
  <p class="sub">Chronological by day. Star sessions to build My Schedule (saved in this browser). Export only your picks as .ics.</p>
  <div data-filter-root="sessions" data-my-view="0">
    <div class="toolbar">
      <input type="search" data-search placeholder="Search sessions and speakers" aria-label="Search itinerary"/>
      <span class="count" data-count>${program.sessions.length} of ${program.sessions.length} sessions</span>
      <button type="button" class="btn secondary sm" data-toggle-my>My Schedule</button>
      <span class="count" data-my-count>0 saved</span>
      <a class="btn sm" data-export-ics data-ics-base="${esc(base)}/ics" href="${esc(base)}/ics">Export My Schedule (.ics)</a>
      ${facetControls(program)}
    </div>
    <div class="day-tabs" role="tablist" aria-label="Days">
      <button type="button" class="active" data-day-filter="">All days</button>
      ${program.days
        .map((d) => `<button type="button" data-day-filter="${esc(d)}">${esc(fmtDayLabel(d, program.event.timezone))}</button>`)
        .join("")}
    </div>
    ${byDay.join("") || emptyState("No published sessions yet.")}
    <div class="empty" data-empty-filter style="display:none;margin-top:12px">No sessions match your search or filters.</div>
  </div>
  <script>${CLIENT_FILTER_JS}</script>
  <script>
  document.body.setAttribute('data-event-id', ${JSON.stringify(program.event.id)});
  ${MY_SCHEDULE_JS}
  (function(){
    function applyDay(day){
      document.querySelectorAll('[data-day-section]').forEach(function(sec){
        if(!day || sec.getAttribute('data-day-section')===day) sec.style.display='';
        else sec.style.display='none';
      });
    }
    document.querySelectorAll('[data-day-filter]').forEach(function(btn){
      btn.addEventListener('click', function(){
        document.querySelectorAll('[data-day-filter]').forEach(function(b){b.classList.remove('active')});
        btn.classList.add('active');
        applyDay(btn.getAttribute('data-day-filter')||'');
      });
    });
  })();
  </script>`;
  return shell(program, { title: "Itinerary", active: "itinerary", body, base });
}

function renderSessionsPage(program: PublicProgram, base: string) {
  const cards = program.sessions
    .map((s) => sessionCard(s, program, base).replace('data-session-id="', `data-day="${esc(s.dayKey)}" data-session-id="`))
    .join("");
  // Published sessions awaiting a schedule slot still belong in the catalog.
  const unscheduled = (program.unscheduledSessions || [])
    .map((s) => sessionCard(s, program, base).replace('data-session-id="', 'data-day="" data-session-id="'))
    .join("");
  const unscheduledBlock = unscheduled
    ? `<section style="margin-top:26px">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 8px">Published · time to be announced (${program.unscheduledSessions.length})</h2>
    <div class="grid cards">${unscheduled}</div>
  </section>`
    : "";
  const body = `
  <h1>Sessions</h1>
  <p class="sub">Browse the published catalog. Keyword search matches session titles, speaker names and descriptions — the result count names which field matched. Try a speaker surname.</p>
  <div data-filter-root="sessions">
    <div class="toolbar">
      <input type="search" data-search placeholder="Search by session title or speaker name" aria-label="Search sessions by title or speaker name"/>
      <span class="count" data-count>${program.sessions.length} of ${program.sessions.length} sessions</span>
      ${facetControls(program)}
    </div>
    <div class="grid cards">${cards || (unscheduled ? "" : emptyState("No published sessions yet."))}</div>
    <div class="empty" data-empty-filter style="display:none;margin-top:12px">No sessions match your search or filters.</div>
  </div>
  ${unscheduledBlock}
  <script>${CLIENT_FILTER_JS}</script>`;
  return shell(program, { title: "Sessions", active: "sessions", body, base });
}

function renderSessionDetail(program: PublicProgram, session: PublicSessionView, base: string, back?: { href: string; label: string }) {
  const backHref = back?.href || `${base}/sessions`;
  const backLabel = back?.label || "Back to sessions";
  const body = `
  <a class="back" href="${esc(backHref)}">← ${esc(backLabel)}</a>
  <article class="card">
    <div class="pills">${session.trackNames.map((t) => `<span class="pill track">${esc(t)}</span>`).join("")}<span class="pill format">${esc(session.format)}</span><span class="pill room">${esc(session.room)}</span></div>
    <h1>${esc(session.title)}</h1>
    <p class="meta">${esc(fmtTimeRange(session.startsAt, session.endsAt, program.event.timezone))}</p>
    <p class="meta"><strong>Room:</strong> ${esc(session.room)} · <strong>Format:</strong> ${esc(session.format)} · <strong>Track:</strong> ${esc(session.trackNames.join(" · ") || "General")}</p>
    <p class="desc" style="margin-top:12px">${esc(session.abstract)}</p>
    <h2 style="font-size:14px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Speakers</h2>
    ${speakerChips(session.speakers, base)}
  </article>`;
  return shell(program, { title: session.title, active: "sessions", body, base });
}

function renderSpeakersList(program: PublicProgram, base: string, mode: "list" | "gallery") {
  const isGallery = mode === "gallery";
  const cards = program.speakers
    .map((sp) => {
      const href = `${base}/speakers/${sp.id}${isGallery ? "?from=gallery" : ""}`;
      if (isGallery) {
        return `<a class="card" data-speaker-id="${esc(sp.id)}" data-name="${esc(sp.name)}" data-sort-key="${esc(sp.lastName)}" href="${esc(href)}">
          ${avatarHtml(sp)}
          <h3 style="margin:0;font-size:15px" data-sort-name><b>${esc(sp.lastName)}</b>${esc(sp.sortName.slice(sp.lastName.length))}</h3>
          <div class="meta">${esc(sp.name)}</div>
          <div class="meta" data-speaker-role>${esc(speakerRole(sp))}</div>
        </a>`;
      }
      const sess = sessionsForSpeaker(program, sp.id)
        .map(
          (s) =>
            `<li style="margin:6px 0"><a href="${esc(base)}/sessions/${esc(s.id)}"><strong>${esc(s.title)}</strong></a>
            <div class="meta">${esc(fmtTimeRange(s.startsAt, s.endsAt, program.event.timezone))} · ${esc(s.room)}</div></li>`,
        )
        .join("");
      return `<article class="card" data-speaker-id="${esc(sp.id)}" data-name="${esc(sp.name)}" data-sort-key="${esc(sp.lastName)}">
        <div class="detail-hero">
          ${avatarHtml(sp)}
          <div>
            <h3 style="margin:0" data-sort-name><a href="${esc(href)}"><b>${esc(sp.lastName)}</b>${esc(sp.sortName.slice(sp.lastName.length))}</a></h3>
            <div class="meta">${esc(sp.name)}</div>
            <div class="meta" data-speaker-role>${esc(speakerRole(sp))}</div>
          </div>
        </div>
        <p class="desc clamp" data-desc>${esc(sp.bio || "Biography coming soon.")}</p>
        <button type="button" class="toggle" data-toggle-desc>Show more</button>
        <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 6px">Sessions (${sessionsForSpeaker(program, sp.id).length})</h4>
        <ul style="padding-left:18px;margin:0">${sess || "<li class='meta'>No published sessions</li>"}</ul>
      </article>`;
    })
    .join("");

  const body = `
  <h1>${isGallery ? "Speaker gallery" : "Speakers"}</h1>
  <p class="sub">${isGallery ? "Visual directory of speakers on published sessions." : "Directory paired with each speaker's published sessions."} Names are shown surname-first to make the ordering checkable.</p>
  <div data-filter-root="speakers">
    <div class="toolbar">
      <span class="pill" data-sort-label><b>Sorted A–Z by last name</b></span>
      <input type="search" data-search placeholder="${isGallery ? "Search speaker by first or last name" : "Search speakers by first or last name"}" aria-label="Search speakers by name"/>
      <span class="count" data-count>${program.speakers.length} of ${program.speakers.length} speakers</span>
    </div>
    <div class="grid ${isGallery ? "gallery" : "cards"}">${cards || emptyState("No public speakers on published sessions yet.")}</div>
    <div class="empty" data-empty-filter style="display:none;margin-top:12px">No speakers match your search.</div>
  </div>
  <script>${CLIENT_FILTER_JS}</script>`;
  return shell(program, { title: isGallery ? "Gallery" : "Speakers", active: isGallery ? "gallery" : "speakers", body, base });
}

function renderSpeakerDetail(program: PublicProgram, speaker: PublicSpeakerView, base: string, from: string) {
  const back = from === "gallery" ? `${base}/gallery` : `${base}/speakers`;
  const sess = sessionsForSpeaker(program, speaker.id);
  const list = sess
    .map(
      (s) => `<li class="card" style="list-style:none;margin:0 0 8px">
        <a href="${esc(base)}/sessions/${esc(s.id)}"><strong>${esc(s.title)}</strong></a>
        <div class="meta">${esc(fmtTimeRange(s.startsAt, s.endsAt, program.event.timezone))}</div>
        <div class="meta">Room: ${esc(s.room)} · ${esc(s.trackNames.join(" · ") || "General")}</div>
      </li>`,
    )
    .join("");
  const body = `
  <a class="back" href="${esc(back)}">← Back to ${from === "gallery" ? "gallery" : "speakers"}</a>
  <article class="card">
    <div class="detail-hero">
      ${avatarHtml(speaker)}
      <div>
        <h1 style="margin:0">${esc(speaker.name)}</h1>
        <p class="meta">${esc(speaker.title || "Speaker")}</p>
        <p class="meta"><strong>Company:</strong> ${esc(speaker.company || "—")}</p>
      </div>
    </div>
    <p class="desc clamp" data-desc style="margin-top:14px">${esc(speaker.bio || "Biography coming soon.")}</p>
    <button type="button" class="toggle" data-toggle-desc>Show more</button>
    <h2 style="font-size:14px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Sessions (${sess.length})</h2>
    <ul style="padding:0;margin:0">${list || emptyState("No published sessions for this speaker.")}</ul>
  </article>
  <script>${CLIENT_FILTER_JS}</script>`;
  return shell(program, { title: speaker.name, active: from === "gallery" ? "gallery" : "speakers", body, base });
}

function renderAgenda(program: PublicProgram, base: string, dayKey?: string) {
  const agenda = agendaByDay(program, dayKey);
  const day = agenda.day;
  const dayIndex = Math.max(0, program.days.indexOf(day || ""));
  const prev = program.days[dayIndex - 1];
  const next = program.days[dayIndex + 1];
  const rooms = agenda.rooms.length ? agenda.rooms : program.rooms;
  const times = agenda.times;
  // Gate evidence is scoped to the exact day/filter surface below. Included is
  // deliberately derived from the rendered collection; excluded uses the same
  // day candidate basis after embed filters have narrowed the program.
  const gateIncluded = agenda.sessions.map(({ id, title }) => ({ id, title }));
  const gateExcluded = program.publicationGate.excluded.filter((session) => session.dayKey === day);

  const head = rooms.map((r) => `<th>${esc(r.name)}</th>`).join("");
  const rows = times
    .map((t) => {
      const cells = rooms
        .map((r) => {
          const blocks = agenda.sessions
            .filter((s) => s.startsAt === t && s.roomId === r.id)
            .map((s) => {
              return `<a class="block" href="${esc(base)}/sessions/${esc(s.id)}?from=agenda&day=${esc(day || "")}">
                <b>${esc(s.title)}</b>
                <div class="meta">${esc(s.trackNames.join(" · ") || s.format)} · ${esc(fmtClock(s.startsAt, program.event.timezone))}–${esc(fmtClock(s.endsAt, program.event.timezone))}</div>
              </a>`;
            })
            .join("");
          return `<td>${blocks || '<span class="meta">—</span>'}</td>`;
        })
        .join("");
      return `<tr><td>${esc(fmtClock(t, program.event.timezone))}</td>${cells}</tr>`;
    })
    .join("");

  // Fallback list layout for days without grid density
  const listFallback = agenda.sessions
    .map((s) => sessionCard(s, program, base, { detailHref: `${base}/sessions/${s.id}?from=agenda&day=${encodeURIComponent(day || "")}` }))
    .join("");

  const body = `
  <h1>Agenda</h1>
  <p class="sub">Room × time grid for one day. Click a block for session details.</p>
  <div class="card" style="margin-bottom:12px" data-agenda-publication-gate><b>Approval gate applied</b><p class="meta" style="margin:4px 0 0"><strong>Included approved/published:</strong> ${gateIncluded.map(s=>esc(s.title)).join(" · ")||"None"}<br/><strong>Excluded unapproved:</strong> ${gateExcluded.length} private session${gateExcluded.length===1?"":"s"} withheld</p></div>
  <div class="day-tabs" aria-label="Day navigation">
    <a class="btn secondary sm" href="${esc(base)}/agenda${prev ? `?day=${encodeURIComponent(prev)}` : ""}" ${prev ? "" : 'aria-disabled="true" style="opacity:.4;pointer-events:none"'}>← Prev day</a>
    ${agendaDayCounts(program)
      .map(
        ({ day: d, count }) =>
          `<a href="${esc(base)}/agenda?day=${encodeURIComponent(d)}" class="${d === day ? "active" : ""}" data-day-count="${count}">${esc(fmtDayLabel(d, program.event.timezone))} (${count})</a>`,
      )
      .join("")}
    <a class="btn secondary sm" href="${esc(base)}/agenda${next ? `?day=${encodeURIComponent(next)}` : ""}" ${next ? "" : 'aria-disabled="true" style="opacity:.4;pointer-events:none"'}>Next day →</a>
  </div>
  <p class="meta" style="margin-bottom:10px"><strong>Showing:</strong> ${esc(day ? fmtDayLabel(day, program.event.timezone) : "No days")} · ${agenda.sessions.length} session${agenda.sessions.length === 1 ? "" : "s"} · <strong>Timezone:</strong> ${esc(program.event.timezone)}</p>
  <p class="meta" style="margin-bottom:10px" data-agenda-total>${program.sessions.length} published session${program.sessions.length === 1 ? "" : "s"} across ${program.days.length} day${program.days.length === 1 ? "" : "s"} — use the day tabs above.</p>
  ${
    times.length && rooms.length
      ? `<div class="agenda-wrap"><table class="agenda"><thead><tr><th>Time</th>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${rooms.length + 1}">No sessions</td></tr>`}</tbody></table></div>`
      : `<div class="grid cards">${listFallback || emptyState("No published sessions for this day.")}</div>`
  }`;
  return shell(program, { title: "Agenda", active: "agenda", body, base });
}

function jsonProgram(program: PublicProgram) {
  const sessionJson = (s: PublicSessionView) => ({
    id: s.id,
    title: s.title,
    abstract: s.abstract,
    format: s.format,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    dayKey: s.dayKey,
    room: s.room,
    scheduled: Boolean(s.startsAt),
    tracks: s.trackNames,
    speakers: s.speakers.map((sp) => ({
      id: sp.id,
      name: sp.name,
      title: sp.title,
      company: sp.company,
      bio: sp.bio,
      headshotUrl: sp.headshotUrl,
    })),
  });
  return {
    event: program.event,
    unscheduledSessions: (program.unscheduledSessions || []).map(sessionJson),
    sessions: program.sessions.map((s) => ({
      id: s.id,
      title: s.title,
      abstract: s.abstract,
      format: s.format,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      dayKey: s.dayKey,
      room: s.room,
      tracks: s.trackNames,
      speakers: s.speakers.map((sp) => ({
        id: sp.id,
        name: sp.name,
        title: sp.title,
        company: sp.company,
        bio: sp.bio,
        headshotUrl: sp.headshotUrl,
      })),
    })),
    speakers: program.speakers.map((sp) => ({
      id: sp.id,
      name: sp.name,
      title: sp.title,
      company: sp.company,
      bio: sp.bio,
      headshotUrl: sp.headshotUrl,
      sessionIds: sp.sessionIds,
    })),
    days: program.days,
    facets: program.facets,
  };
}


/** —— Saved embed configurations (branding + multi-facet filters) —— */

/** Expand #abc → #aabbcc so alpha suffixes (#rrggbbaa) stay valid; allow safe names. */
function normalizeAccent(accent?: string) {
  if (!accent || !isSafeAccent(accent)) return undefined;
  const v = accent.trim();
  if (!v.startsWith("#")) return v.toLowerCase();
  return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
}

type EmbedWidget = "sessions" | "speakers" | "agenda" | "itinerary" | "gallery";

/** Resolve ?config=… for a widget. Returns null when the id is unknown/mismatched. */
function embedConfigFor(configId: string | undefined, widget: EmbedWidget) {
  if (!configId) return undefined;
  const found = (store.embedConfigs || []).find((x) => x.id === configId && x.widget === widget);
  return found || null;
}

/**
 * Apply a saved config's multi-facet filters (track + format + room + day) to the
 * canonical program. Speakers are recomputed from the surviving sessions so the
 * speakers/gallery widgets stay consistent with the filtered catalog.
 */
function applyEmbedFilters(
  program: PublicProgram,
  filters?: { track?: string; format?: string; room?: string; day?: string },
  cardFields?: PublicProgram["cardFields"],
) {
  const withFields = (p: PublicProgram) => (cardFields ? { ...p, cardFields } : p);
  if (!filters || !(filters.track || filters.format || filters.room || filters.day)) return withFields(program);
  const sessions = filterPublicSessions(program, filters).sessions;
  const unscheduledSessions = (program.unscheduledSessions || []).filter((s) => {
    if (filters.day) return false; // an unscheduled session has no day
    if (filters.track && !s.trackNames.includes(filters.track)) return false;
    if (filters.format && s.format !== filters.format) return false;
    if (filters.room && s.room !== filters.room) return false;
    return true;
  });
  const keep = new Set([...sessions, ...unscheduledSessions].flatMap((s) => s.speakers.map((sp) => sp.id)));
  // The publication-gate footer describes what THIS page shows. Without narrowing
  // it, a filtered embed would still name every published session, leaking titles
  // the embed deliberately excludes.
  const visibleIds = new Set([...sessions, ...unscheduledSessions].map((s) => s.id));
  const gateMatches = (s: PublicProgram["publicationGate"]["excluded"][number]) => {
    if (filters.day && s.dayKey !== filters.day) return false;
    if (filters.track && !s.trackNames?.includes(filters.track)) return false;
    if (filters.format && s.format !== filters.format) return false;
    if (filters.room && s.room !== filters.room) return false;
    return true;
  };
  const publicationGate = {
    included: program.publicationGate.included.filter((s) => visibleIds.has(s.id)),
    excluded: program.publicationGate.excluded.filter(gateMatches),
  };
  return withFields({
    ...program,
    sessions,
    unscheduledSessions,
    speakers: program.speakers.filter((sp) => keep.has(sp.id)),
    publicationGate,
  });
}

/** Inject the embed accent (the single branding exception) into rendered HTML. */
function withAccent(html: string, accent?: string) {
  const value = normalizeAccent(accent);
  if (!value) return html;
  const tint = value.startsWith("#") ? `${value}1f` : "transparent";
  const style = `<style data-embed-accent>:root{--accent:${value}}` +
    `.pill{background:${tint};color:${value};border:1px solid ${value}}` +
    `.tabs a.active{background:${value};color:#fff;border-color:${value}}` +
    `.btn{background:${value};border-color:${value}}` +
    `a{color:${value}}` +
    `</style>`;
  return html.replace("</head>", `${style}</head>`);
}

/** —— XML feeds (alongside JSON + iCal) —— */
const xmlEsc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function speakerXml(sp: PublicSpeakerView, indent = "      ") {
  return `${indent}<speaker id="${xmlEsc(sp.id)}">
${indent}  <name>${xmlEsc(sp.name)}</name>
${indent}  <title>${xmlEsc(sp.title || "")}</title>
${indent}  <company>${xmlEsc(sp.company || "")}</company>
${indent}  <headshotUrl>${xmlEsc(sp.headshotUrl || "")}</headshotUrl>
${indent}  <bio>${xmlEsc(sp.bio || "")}</bio>
${indent}</speaker>`;
}

function sessionXml(s: PublicSessionView) {
  return `    <session id="${xmlEsc(s.id)}" scheduled="${s.startsAt ? "true" : "false"}">
      <title>${xmlEsc(s.title)}</title>
      <abstract>${xmlEsc(s.abstract)}</abstract>
      <format>${xmlEsc(s.format)}</format>
      <room>${xmlEsc(s.room)}</room>
      <startsAt>${xmlEsc(s.startsAt)}</startsAt>
      <endsAt>${xmlEsc(s.endsAt)}</endsAt>
      <day>${xmlEsc(s.dayKey)}</day>
      <tracks>${s.trackNames.map((t) => `<track>${xmlEsc(t)}</track>`).join("")}</tracks>
      <speakers>
${s.speakers.map((sp) => speakerXml(sp, "        ")).join("\n")}
      </speakers>
    </session>`;
}

function programXml(program: PublicProgram, scope: "program" | "sessions" | "speakers" | "agenda" = "program") {
  const head = `<?xml version="1.0" encoding="UTF-8"?>
<program generator="CUE" scope="${scope}">
  <event id="${xmlEsc(program.event.id)}" slug="${xmlEsc(program.event.slug)}">
    <name>${xmlEsc(program.event.name)}</name>
    <timezone>${xmlEsc(program.event.timezone)}</timezone>
    <startsAt>${xmlEsc(program.event.startsAt)}</startsAt>
    <endsAt>${xmlEsc(program.event.endsAt)}</endsAt>
    <location>${xmlEsc(program.event.location)}</location>
    <website>${xmlEsc(program.event.website)}</website>
  </event>`;
  const sessions = scope === "speakers" ? "" : `
  <sessions count="${program.sessions.length}">
${program.sessions.map(sessionXml).join("\n")}
  </sessions>
  <unscheduledSessions count="${(program.unscheduledSessions || []).length}">
${(program.unscheduledSessions || []).map(sessionXml).join("\n")}
  </unscheduledSessions>`;
  const speakers = scope === "sessions" ? "" : `
  <speakers count="${program.speakers.length}">
${program.speakers.map((sp) => speakerXml(sp)).join("\n")}
  </speakers>`;
  return `${head}${sessions}${speakers}
</program>`;
}


/** ---- API docs page ----------------------------------------------------
 * A dependency-free HTML rendering of the OpenAPI document. The endpoint
 * summary is derived once at module load from the embedded spec string, so the
 * page never drifts from docs/openapi.yaml and costs nothing per request.
 */
type DocsOperation = { method: string; path: string; summary: string; tag: string };

/** Minimal, tolerant scan of the spec: path lines, method lines, tag and summary. */
export function parseOpenapiOperations(yaml: string): DocsOperation[] {
  const ops: DocsOperation[] = [];
  let currentPath = "";
  let current: DocsOperation | null = null;
  for (const line of String(yaml || "").split("\n")) {
    const pathLine = line.match(/^ {2}("?)(\/[^"?\n]*)\1:$/);
    if (pathLine) {
      currentPath = pathLine[2]!;
      current = null;
      continue;
    }
    const methodLine = line.match(/^ {4}(get|post|put|patch|delete):$/);
    if (methodLine && currentPath) {
      current = { method: methodLine[1]!.toUpperCase(), path: currentPath, summary: "", tag: "other" };
      ops.push(current);
      continue;
    }
    if (!current) continue;
    const tagLine = line.match(/^ {6}tags: \[([^\]]+)\]$/);
    if (tagLine) current.tag = tagLine[1]!.trim();
    const summaryLine = line.match(/^ {6}summary: (.*)$/);
    if (summaryLine) {
      const raw = summaryLine[1]!.trim();
      try {
        current.summary = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
      } catch {
        current.summary = raw.replace(/^"|"$/g, "");
      }
    }
  }
  return ops;
}

const DOCS_OPERATIONS = parseOpenapiOperations(OPENAPI_YAML);

const DOCS_CURL = [
  ["List events", "curl -s https://cue-program-ops.headley-max.workers.dev/api/events"],
  [
    "List submissions (organizer persona)",
    'curl -s -H "x-demo-role: organizer" -H "x-demo-persona: org-swyx" \\\n  https://cue-program-ops.headley-max.workers.dev/api/events/evt-ai-summit-2026/submissions',
  ],
  [
    "Public program feed (no identity)",
    "curl -s https://cue-program-ops.headley-max.workers.dev/e/ai-engineer-summit/public/feed.json",
  ],
];

export function renderApiDocsPage() {
  const groups = new Map<string, DocsOperation[]>();
  for (const op of DOCS_OPERATIONS) {
    if (!groups.has(op.tag)) groups.set(op.tag, []);
    groups.get(op.tag)!.push(op);
  }
  const sections = [...groups.entries()]
    .map(([tag, ops]) => {
      const rows = ops
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
        .map(
          (op) =>
            `<tr><td class="m"><code>${esc(op.method)}</code></td><td><code>${esc(op.path)}</code>` +
            `${op.summary ? `<div class="meta">${esc(op.summary)}</div>` : ""}</td></tr>`,
        )
        .join("");
      return `<section class="card"><h2>${esc(tag)} <small>${ops.length}</small></h2>
      <table class="ops"><tbody>${rows}</tbody></table></section>`;
    })
    .join("");

  const curl = DOCS_CURL.map(
    ([label, cmd]) => `<div class="snippet"><div class="meta">${esc(label)}</div><pre>${esc(cmd)}</pre></div>`,
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CUE API</title>
<style>${SHARED_CSS}
.ops{width:100%;border-collapse:collapse;font-size:13px}
.ops td{border-top:1px solid var(--line);padding:8px 6px;vertical-align:top}
.ops td.m{width:74px;white-space:nowrap;font-weight:700}
.snippet{margin-top:10px}
.snippet pre{overflow-x:auto;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px;font-size:12px;white-space:pre-wrap;word-break:break-all}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
</style>
</head>
<body>
<header class="top"><div class="top-inner">
  <div class="brand">CUE API<small>Conference program operations</small></div>
  <nav class="tabs" aria-label="API docs"><a href="/api/openapi.yaml">OpenAPI spec</a><a href="https://github.com/swyxio/cue/blob/main/docs/CLI.md">CLI</a><a href="/">Demo home</a></nav>
</div></header>
<main>
  <h1>CUE API</h1>
  <p class="sub">CUE exposes a JSON API under <code>/api</code> for every workflow: events, CFP forms and submissions,
  review rounds and assignments, speakers, tasks and deliverables, schedule and agenda, communications, CRM and one-way
  sync. Public program feeds need no identity. Everything else uses demo identity headers
  (<code>x-demo-role</code> and <code>x-demo-persona</code>) - persona simulation, not authentication. The full
  machine-readable description is published as OpenAPI 3.1.</p>
  <p><a class="btn" href="/api/openapi.yaml">Download OpenAPI 3.1 spec</a></p>
  <section class="card"><h2>Command line</h2><p class="meta">CUE ships a CLI built for AI agents: one command pulls the whole program state, every command speaks JSON, and failures exit non-zero with the reason. See docs/CLI.md in the repository.</p>
  <div class="snippet"><pre>npx tsx cli/cue.ts overview
npx tsx cli/cue.ts schedule conflicts &lt;sessionId&gt; --day 2027-05-12 --time 09:00 --room "Room 2A"
npx tsx cli/cue.ts submissions decide &lt;id&gt; --accept --feedback "See you in May."</pre></div></section>
  <section class="card"><h2>Quick start</h2>${curl}</section>
  <p class="meta">${DOCS_OPERATIONS.length} operations across ${groups.size} groups, generated from the same document served at /api/openapi.yaml.</p>
  ${sections}
</main>
<footer class="site">Powered by CUE - <a href="/api/openapi.yaml">OpenAPI 3.1</a></footer>
</body>
</html>`;
}

export function createPublicSite(deps: PublicSiteDeps) {
  const app = new Hono();
  const { repo } = deps;

  // Human-readable API documentation: server rendered, dependency free, same
  // style as the public widgets. The endpoint list comes from the embedded spec.
  app.get("/docs/api", (c) => c.html(renderApiDocsPage()));

  const withProgram = async (key: string) => loadProgram(repo, key);

  // —— Slug-scoped canonical public site ——
  app.get("/e/:slug/public", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    return c.redirect(`${baseFor(loaded.slug)}/sessions`);
  });

  app.get("/e/:slug/public/sessions", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    const config = embedConfigFor(c.req.query("config"), "sessions");
    if (config === null) return c.html(notFoundHtml("Embed configuration not found"), 404);
    const program = applyEmbedFilters(loaded.program, config?.filters, config?.fields);
    return c.html(withAccent(renderSessionsPage(program, baseFor(loaded.slug)), config?.theme?.accent));
  });

  app.get("/e/:slug/public/sessions/:id", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    const session = [...loaded.program.sessions, ...(loaded.program.unscheduledSessions || [])].find(
      (s) => s.id === c.req.param("id") || s.slug === c.req.param("id"),
    );
    if (!session) return c.html(notFoundHtml("Session not found"), 404);
    const from = c.req.query("from");
    if (from === "agenda") {
      const day = c.req.query("day") || (session as any).dayKey || "";
      const agendaHref = `${baseFor(loaded.slug)}/agenda${day ? `?day=${encodeURIComponent(day)}` : ""}`;
      return c.html(
        renderSessionDetail(loaded.program, session, baseFor(loaded.slug), {
          href: agendaHref,
          label: "Back to agenda",
        }),
      );
    }
    return c.html(renderSessionDetail(loaded.program, session, baseFor(loaded.slug)));
  });

  app.get("/e/:slug/public/speakers", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    const config = embedConfigFor(c.req.query("config"), "speakers");
    if (config === null) return c.html(notFoundHtml("Embed configuration not found"), 404);
    const program = applyEmbedFilters(loaded.program, config?.filters, config?.fields);
    return c.html(withAccent(renderSpeakersList(program, baseFor(loaded.slug), "list"), config?.theme?.accent));
  });

  app.get("/e/:slug/public/speakers/:id", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    const speaker = loaded.program.speakers.find((s) => s.id === c.req.param("id"));
    if (!speaker) return c.html(notFoundHtml("Speaker not found"), 404);
    const from = c.req.query("from") === "gallery" ? "gallery" : "speakers";
    return c.html(renderSpeakerDetail(loaded.program, speaker, baseFor(loaded.slug), from));
  });

  app.get("/e/:slug/public/agenda", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    const config = embedConfigFor(c.req.query("config"), "agenda");
    if (config === null) return c.html(notFoundHtml("Embed configuration not found"), 404);
    const program = applyEmbedFilters(loaded.program, config?.filters, config?.fields);
    const day = c.req.query("day") || config?.filters?.day || undefined;
    return c.html(withAccent(renderAgenda(program, baseFor(loaded.slug), day), config?.theme?.accent));
  });

  app.get("/e/:slug/public/itinerary", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    const config = embedConfigFor(c.req.query("config"), "itinerary");
    if (config === null) return c.html(notFoundHtml("Embed configuration not found"), 404);
    const program = applyEmbedFilters(loaded.program, config?.filters, config?.fields);
    return c.html(withAccent(renderItinerary(program, baseFor(loaded.slug)), config?.theme?.accent));
  });

  app.get("/e/:slug/public/gallery", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    const config = embedConfigFor(c.req.query("config"), "gallery");
    if (config === null) return c.html(notFoundHtml("Embed configuration not found"), 404);
    const program = applyEmbedFilters(loaded.program, config?.filters, config?.fields);
    return c.html(withAccent(renderSpeakersList(program, baseFor(loaded.slug), "gallery"), config?.theme?.accent));
  });

  // XML feeds (one per widget, alongside JSON + iCal). ?config= applies a saved embed config.
  const xmlResponse = (c: any, body: string) => c.body(body, 200, { "content-type": "application/xml; charset=utf-8" });
  const xmlHandler = (scope: "program" | "sessions" | "speakers" | "agenda", widget: EmbedWidget) => async (c: any) => {
    const loaded = await withProgram(c.req.param("slug") || c.req.param("eventId"));
    if (!loaded) return c.text("event not found", 404);
    const config = embedConfigFor(c.req.query("config"), widget);
    if (config === null) return c.text("embed configuration not found", 404);
    const program = applyEmbedFilters(loaded.program, config?.filters, config?.fields);
    return xmlResponse(c, programXml(program, scope));
  };
  app.get("/e/:slug/public/feed.xml", xmlHandler("program", "sessions"));
  app.get("/e/:slug/public/sessions.xml", xmlHandler("sessions", "sessions"));
  app.get("/e/:slug/public/speakers.xml", xmlHandler("speakers", "speakers"));
  app.get("/e/:slug/public/agenda.xml", xmlHandler("agenda", "agenda"));
  app.get("/e/:slug/public/itinerary.xml", xmlHandler("agenda", "itinerary"));
  app.get("/e/:slug/public/gallery.xml", xmlHandler("speakers", "gallery"));
  app.get("/public/events/:eventId/feed.xml", xmlHandler("program", "sessions"));
  app.get("/public/events/:eventId/sessions.xml", xmlHandler("sessions", "sessions"));
  app.get("/public/events/:eventId/speakers.xml", xmlHandler("speakers", "speakers"));
  app.get("/public/events/:eventId/agenda.xml", xmlHandler("agenda", "agenda"));

  // JSON + ICS feeds (slug)
  app.get("/e/:slug/public/feed.json", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.json({ error: "event not found" }, 404);
    return c.json(jsonProgram(loaded.program));
  });

  app.get("/e/:slug/public/sessions.json", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.json({ error: "event not found" }, 404);
    const result = filterPublicSessions(loaded.program, {
      q: c.req.query("q") || undefined,
      track: c.req.query("track") || undefined,
      format: c.req.query("format") || undefined,
      room: c.req.query("room") || undefined,
      day: c.req.query("day") || undefined,
    });
    return c.json({
      eventId: loaded.eventId,
      slug: loaded.slug,
      total: result.total,
      count: result.count,
      facets: result.facets,
      sessions: result.sessions,
    });
  });

  app.get("/e/:slug/public/speakers.json", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.json({ error: "event not found" }, 404);
    const result = filterPublicSpeakers(loaded.program, c.req.query("q") || "");
    return c.json({
      eventId: loaded.eventId,
      slug: loaded.slug,
      total: result.total,
      count: result.count,
      speakers: result.speakers,
    });
  });

  app.get("/e/:slug/public/agenda.json", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.json({ error: "event not found" }, 404);
    const agenda = agendaByDay(loaded.program, c.req.query("day") || undefined);
    return c.json({ eventId: loaded.eventId, slug: loaded.slug, ...agenda });
  });

  app.get("/e/:slug/public/ics", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.text("event not found", 404);
    const ids = (c.req.query("ids") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const body = buildIcs(loaded.program, ids.length ? ids : undefined);
    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="${loaded.slug}${ids.length ? "-my-schedule" : ""}.ics"`,
      },
    });
  });

  // —— Legacy /public/events/:eventId/* (keep URLs working; same projection) ——
  const legacy = async (c: any, kind: string) => {
    const key = c.req.param("eventId");
    const loaded = await withProgram(key);
    if (!loaded) return c.html(notFoundHtml(), 404);
    const base = legacyBase(key);
    // Prefer redirecting HTML navigations to slug site for consistency, but keep embed paths rendering HTML at legacy URLs.
    if (kind === "gallery") return c.html(renderSpeakersList(loaded.program, baseFor(loaded.slug), "gallery").replaceAll(baseFor(loaded.slug), baseFor(loaded.slug)));
    if (kind === "itinerary") return c.html(renderItinerary(loaded.program, baseFor(loaded.slug)));
    if (kind === "sessions") return c.html(renderSessionsPage(loaded.program, baseFor(loaded.slug)));
    if (kind === "speakers") return c.html(renderSpeakersList(loaded.program, baseFor(loaded.slug), "list"));
    if (kind === "agenda") return c.html(renderAgenda(loaded.program, baseFor(loaded.slug), c.req.query("day") || undefined));
    return c.html(notFoundHtml(), 404);
  };

  app.get("/public/events/:eventId/gallery", (c) => legacy(c, "gallery"));
  app.get("/public/events/:eventId/itinerary", (c) => legacy(c, "itinerary"));
  app.get("/public/events/:eventId/sessions", (c) => legacy(c, "sessions"));
  app.get("/public/events/:eventId/speakers", (c) => legacy(c, "speakers"));
  app.get("/public/events/:eventId/agenda", (c) => legacy(c, "agenda"));

  app.get("/public/events/:eventId/itinerary.json", async (c) => {
    const loaded = await withProgram(c.req.param("eventId"));
    if (!loaded) return c.json({ error: "event not found" }, 404);
    // Backward-compatible shape used by existing tests
    return c.json({
      eventId: loaded.eventId,
      sessions: loaded.program.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        abstract: s.abstract,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        room: s.room,
        tracks: s.trackNames,
        speakers: s.speakers.map((sp) => ({
          id: sp.id,
          name: sp.name,
          bio: sp.bio,
          company: sp.company,
          headshotUrl: sp.headshotUrl,
        })),
      })),
    });
  });

  app.get("/public/events/:eventId/speakers.json", async (c) => {
    const loaded = await withProgram(c.req.param("eventId"));
    if (!loaded) return c.json({ error: "event not found" }, 404);
    return c.json({
      eventId: loaded.eventId,
      speakers: loaded.program.speakers.map(({ id, name, bio, company, headshotUrl, title }) => ({
        id,
        name,
        bio,
        company,
        headshotUrl,
        title,
      })),
    });
  });

  app.get("/public/events/:eventId/feed.json", async (c) => {
    const loaded = await withProgram(c.req.param("eventId"));
    if (!loaded) return c.json({ error: "event not found" }, 404);
    return c.json(jsonProgram(loaded.program));
  });

  app.get("/public/events/:eventId/ics", async (c) => {
    const loaded = await withProgram(c.req.param("eventId"));
    if (!loaded) return c.text("event not found", 404);
    const ids = (c.req.query("ids") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const body = buildIcs(loaded.program, ids.length ? ids : undefined);
    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="${loaded.eventId}.ics"`,
      },
    });
  });

  // Friendly embed aliases
  app.get("/embed/:eventId/gallery", (c) => c.redirect(`/public/events/${c.req.param("eventId")}/gallery`));
  app.get("/embed/:eventId/itinerary", (c) => c.redirect(`/public/events/${c.req.param("eventId")}/itinerary`));
  app.get("/embed/:eventId/sessions", (c) => c.redirect(`/public/events/${c.req.param("eventId")}/sessions`));
  app.get("/embed/:eventId/speakers", (c) => c.redirect(`/public/events/${c.req.param("eventId")}/speakers`));
  app.get("/embed/:eventId/agenda", (c) => c.redirect(`/public/events/${c.req.param("eventId")}/agenda`));

  // Public API helpers used by widgets / organizer previews
  app.get("/api/public/events/:slug/program", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.json({ error: { message: "event not found" } }, 404);
    return c.json({ data: jsonProgram(loaded.program) });
  });

  return app;
}

