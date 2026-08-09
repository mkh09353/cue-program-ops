import { Hono } from "hono";
import type { Repository } from "./domain.js";
import { store } from "./lifecycle.js";
import {
  agendaByDay,
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
  const d = fmtWhen(startsAt, timeZone, { weekday: "short", month: "short", day: "numeric" });
  const a = fmtWhen(startsAt, timeZone, { hour: "numeric", minute: "2-digit" });
  const b = fmtWhen(endsAt, timeZone, { hour: "numeric", minute: "2-digit" });
  return `${d} · ${a} – ${b}`;
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
:root{color-scheme:light;--ink:#12141A;--muted:#5c6170;--line:#e7e2d9;--bg:#F7F4EF;--card:#fff;--accent:#5B5CFF;--accent-soft:#eef0ff;--ok:#1B7F4E;--warn:#b45309;--radius:14px;--shadow:0 8px 24px rgba(18,20,26,.06)}
*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.45}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.top-inner{max-width:1100px;margin:0 auto;padding:12px 16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.brand{font-weight:800;letter-spacing:-.03em}.brand small{display:block;font-weight:600;color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase}
nav.tabs{display:flex;gap:6px;flex-wrap:wrap}
nav.tabs a{display:inline-flex;align-items:center;padding:8px 12px;border-radius:999px;font-size:13px;font-weight:700;color:var(--muted);background:transparent}
nav.tabs a.active,nav.tabs a:hover{background:var(--ink);color:#fff;text-decoration:none}
main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:clamp(1.4rem,3vw,2rem);letter-spacing:-.03em;margin:0 0 4px}
.sub{color:var(--muted);font-size:14px;margin:0 0 16px}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 14px;align-items:center}
input[type=search],select,button,.btn{font:inherit}
input[type=search],select{border:1px solid var(--line);background:#fff;border-radius:12px;padding:10px 12px;min-height:42px}
input[type=search]{flex:1 1 220px;min-width:180px}
.btn,button.btn{border:0;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer;background:var(--ink);color:#fff}
.btn.secondary{background:#fff;color:var(--ink);border:1px solid var(--line)}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid transparent}
.btn.sm{padding:6px 10px;font-size:12px;border-radius:999px}
.count{font-size:13px;font-weight:700;color:var(--muted)}
.facets{display:flex;flex-wrap:wrap;gap:8px;width:100%}
.facets label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.grid{display:grid;gap:12px}
.cards{grid-template-columns:1fr}
@media(min-width:720px){.cards{grid-template-columns:1fr 1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px;box-shadow:var(--shadow)}
.card h2,.card h3{margin:0 0 6px;letter-spacing:-.02em;font-size:1.05rem}
.meta{color:var(--muted);font-size:13px}
.pills{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;background:var(--accent-soft);color:var(--accent);padding:4px 8px;border-radius:999px}
.pill.track{background:#f3e8ff;color:#6b21a8}
.pill.format{background:#ecfeff;color:#0e7490}
.pill.room{background:#fff7ed;color:#c2410c}
.speakers{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.speaker-chip{display:flex;gap:8px;align-items:center;min-width:0}
.avatar{width:36px;height:36px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:12px;color:#fff;background:linear-gradient(135deg,#5B5CFF,#c7f464);flex:0 0 auto;overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
.speaker-chip .who{min-width:0}.speaker-chip .who b{display:block;font-size:13px}.speaker-chip .who span{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.desc{color:#2c3040;font-size:14px;margin:8px 0 0}
.desc.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.toggle{margin-top:6px;background:none;border:0;color:var(--accent);font-weight:700;cursor:pointer;padding:0;font-size:13px}
.empty{padding:28px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:var(--radius);background:#fff}
.back{display:inline-flex;align-items:center;gap:6px;font-weight:700;margin-bottom:12px}
.gallery{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.gallery .card{text-align:center;padding:16px 12px;cursor:pointer;transition:transform .12s ease,border-color .12s ease}
.gallery .card:hover{transform:translateY(-2px);border-color:#c7c2ff;text-decoration:none}
.gallery .avatar{width:72px;height:72px;margin:0 auto 10px;font-size:20px}
.detail-hero{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.detail-hero .avatar{width:88px;height:88px;font-size:28px}
.day-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.day-tabs a,.day-tabs button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 12px;font-weight:700;font-size:13px;cursor:pointer;color:var(--ink)}
.day-tabs a.active,.day-tabs button.active{background:var(--ink);color:#fff;border-color:var(--ink)}
.agenda-wrap{overflow:auto;border:1px solid var(--line);border-radius:var(--radius);background:#fff}
.agenda{border-collapse:separate;border-spacing:0;min-width:640px;width:100%}
.agenda th,.agenda td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:8px;vertical-align:top;font-size:12px}
.agenda th{background:#fafaf9;position:sticky;top:0;z-index:1;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.agenda th:first-child,.agenda td:first-child{position:sticky;left:0;background:#fafaf9;z-index:2;min-width:72px;font-weight:800}
.agenda td:first-child{background:#fff}
.block{display:block;border-radius:10px;padding:8px;background:var(--accent-soft);color:var(--ink);border-left:4px solid var(--accent);margin:0 0 6px}
.block b{display:block;font-size:12px;margin-bottom:2px}
.block .meta{font-size:11px}
.time-group{margin:18px 0 8px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.star{border:1px solid var(--line);background:#fff;border-radius:999px;width:36px;height:36px;display:inline-grid;place-items:center;cursor:pointer;font-size:16px}
.star.on{background:#fff7ed;border-color:#fdba74;color:#c2410c}
.row-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:10px}
footer.site{max-width:1100px;margin:0 auto;padding:8px 16px 28px;color:#9a9488;font-size:11px;text-align:center}
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
<footer class="site">Powered by CUE · published sessions only · timezone ${esc(program.event.timezone)}</footer>
</body>
</html>`;
}

function avatarHtml(sp: { name: string; initials: string; headshotUrl?: string }, cls = "") {
  if (sp.headshotUrl) {
    return `<div class="avatar ${cls}"><img src="${esc(sp.headshotUrl)}" alt="${esc(sp.name)}"/></div>`;
  }
  return `<div class="avatar ${cls}" aria-hidden="true">${esc(sp.initials)}</div>`;
}

function speakerChips(speakers: PublicSpeakerView[], base: string) {
  if (!speakers.length) return `<div class="meta">Speakers TBA</div>`;
  return `<div class="speakers">${speakers
    .map(
      (sp) => `<a class="speaker-chip" href="${esc(base)}/speakers/${esc(sp.id)}">
      ${avatarHtml(sp)}
      <span class="who"><b>${esc(sp.name)}</b><span>${esc([sp.title, sp.company].filter(Boolean).join(" · ") || "Speaker")}</span></span>
    </a>`,
    )
    .join("")}</div>`;
}

function sessionCard(s: PublicSessionView, program: PublicProgram, base: string, opts?: { star?: boolean; detailHref?: string }) {
  const trackPills = s.trackNames.map((t) => `<span class="pill track">${esc(t)}</span>`).join("");
  const detail = opts?.detailHref || `${base}/sessions/${s.id}`;
  const star = opts?.star
    ? `<button type="button" class="star" data-star="${esc(s.id)}" aria-label="Add to my schedule" title="My Schedule">☆</button>`
    : "";
  return `<article class="card" data-session-id="${esc(s.id)}" data-title="${esc(s.title)}" data-tracks="${esc(s.trackNames.join("|"))}" data-format="${esc(s.format)}" data-room="${esc(s.room)}" data-speakers="${esc(s.speakers.map((x) => x.name).join(" | "))}">
    <div class="pills">${trackPills}<span class="pill format">${esc(s.format)}</span><span class="pill room">${esc(s.room)}</span></div>
    <h3><a href="${esc(detail)}">${esc(s.title)}</a></h3>
    <div class="meta">${esc(fmtTimeRange(s.startsAt, s.endsAt, program.event.timezone))} · ${esc(s.room)}</div>
    <p class="desc clamp" data-desc>${esc(s.abstract)}</p>
    <button type="button" class="toggle" data-toggle-desc>Show more</button>
    ${speakerChips(s.speakers, base)}
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
    var shown=0;
    cards.forEach(function(card){
      var title=(card.getAttribute('data-title')||'').toLowerCase();
      var speakers=(card.getAttribute('data-speakers')||'').toLowerCase();
      var tracks=(card.getAttribute('data-tracks')||'');
      var fmt=card.getAttribute('data-format')||'';
      var rm=card.getAttribute('data-room')||'';
      var ok=true;
      if(q && title.indexOf(q)<0 && speakers.indexOf(q)<0 && (card.textContent||'').toLowerCase().indexOf(q)<0) ok=false;
      if(track && tracks.split('|').indexOf(track)<0) ok=false;
      if(format && fmt!==format) ok=false;
      if(room && rm!==room) ok=false;
      card.style.display = ok ? '' : 'none';
      if(ok) shown++;
    });
    var count=qs('[data-count]',root);
    if(count){ count.textContent = shown + ' of ' + cards.length + ' sessions'; }
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

function facetControls(program: PublicProgram) {
  const trackOpts = program.facets.tracks.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  const formatOpts = program.facets.formats.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  const roomOpts = program.facets.rooms.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  return `<div class="facets">
    <label>Track<select data-filter-track><option value="">All tracks</option>${trackOpts}</select></label>
    <label>Format<select data-filter-format><option value="">All formats</option>${formatOpts}</select></label>
    <label>Room / Location<select data-filter-room><option value="">All rooms</option>${roomOpts}</select></label>
  </div>`;
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
      <h2 style="font-size:1.1rem;margin:18px 0 8px">${esc(fmtDayLabel(day, program.event.timezone))}</h2>
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
  const body = `
  <h1>Sessions</h1>
  <p class="sub">Browse the published catalog. Keyword search matches titles and speaker names.</p>
  <div data-filter-root="sessions">
    <div class="toolbar">
      <input type="search" data-search placeholder="Search sessions and speakers" aria-label="Search sessions"/>
      <span class="count" data-count>${program.sessions.length} of ${program.sessions.length} sessions</span>
      ${facetControls(program)}
    </div>
    <div class="grid cards">${cards || emptyState("No published sessions yet.")}</div>
    <div class="empty" data-empty-filter style="display:none;margin-top:12px">No sessions match your search or filters.</div>
  </div>
  <script>${CLIENT_FILTER_JS}</script>`;
  return shell(program, { title: "Sessions", active: "sessions", body, base });
}

function renderSessionDetail(program: PublicProgram, session: PublicSessionView, base: string) {
  const body = `
  <a class="back" href="${esc(base)}/sessions">← Back to sessions</a>
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
        return `<a class="card" data-speaker-id="${esc(sp.id)}" data-name="${esc(sp.name)}" href="${esc(href)}">
          ${avatarHtml(sp)}
          <h3 style="margin:0;font-size:15px">${esc(sp.name)}</h3>
          <div class="meta">${esc(sp.title || "Speaker")}</div>
          <div class="meta">${esc(sp.company || "")}</div>
        </a>`;
      }
      const sess = sessionsForSpeaker(program, sp.id)
        .map(
          (s) =>
            `<li style="margin:6px 0"><a href="${esc(base)}/sessions/${esc(s.id)}"><strong>${esc(s.title)}</strong></a>
            <div class="meta">${esc(fmtTimeRange(s.startsAt, s.endsAt, program.event.timezone))} · ${esc(s.room)}</div></li>`,
        )
        .join("");
      return `<article class="card" data-speaker-id="${esc(sp.id)}" data-name="${esc(sp.name)}">
        <div class="detail-hero">
          ${avatarHtml(sp)}
          <div>
            <h3 style="margin:0"><a href="${esc(href)}">${esc(sp.name)}</a></h3>
            <div class="meta">${esc([sp.title, sp.company].filter(Boolean).join(" · ") || "Speaker")}</div>
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
  <p class="sub">${isGallery ? "Visual directory of speakers on published sessions." : "Directory paired with each speaker's published sessions. Sorted by surname."}</p>
  <div data-filter-root="speakers">
    <div class="toolbar">
      <input type="search" data-search placeholder="${isGallery ? "Search speaker by name" : "Search speakers"}" aria-label="Search speakers"/>
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

  const head = rooms.map((r) => `<th>${esc(r.name)}</th>`).join("");
  const rows = times
    .map((t) => {
      const cells = rooms
        .map((r) => {
          const blocks = agenda.sessions
            .filter((s) => s.startsAt === t && s.roomId === r.id)
            .map((s) => {
              const color = s.tracks[0]?.color || "#5B5CFF";
              return `<a class="block" style="border-left-color:${esc(color)}" href="${esc(base)}/sessions/${esc(s.id)}?from=agenda&day=${esc(day || "")}">
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
  <div class="day-tabs" aria-label="Day navigation">
    <a class="btn secondary sm" href="${esc(base)}/agenda${prev ? `?day=${encodeURIComponent(prev)}` : ""}" ${prev ? "" : 'aria-disabled="true" style="opacity:.4;pointer-events:none"'}>← Prev day</a>
    ${program.days
      .map(
        (d) =>
          `<a href="${esc(base)}/agenda?day=${encodeURIComponent(d)}" class="${d === day ? "active" : ""}">${esc(fmtDayLabel(d, program.event.timezone))}</a>`,
      )
      .join("")}
    <a class="btn secondary sm" href="${esc(base)}/agenda${next ? `?day=${encodeURIComponent(next)}` : ""}" ${next ? "" : 'aria-disabled="true" style="opacity:.4;pointer-events:none"'}>Next day →</a>
  </div>
  <p class="meta" style="margin-bottom:10px"><strong>Showing:</strong> ${esc(day ? fmtDayLabel(day, program.event.timezone) : "No days")}</p>
  ${
    times.length && rooms.length
      ? `<div class="agenda-wrap"><table class="agenda"><thead><tr><th>Time</th>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${rooms.length + 1}">No sessions</td></tr>`}</tbody></table></div>`
      : `<div class="grid cards">${listFallback || emptyState("No published sessions for this day.")}</div>`
  }`;
  return shell(program, { title: "Agenda", active: "agenda", body, base });
}

function jsonProgram(program: PublicProgram) {
  return {
    event: program.event,
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

export function createPublicSite(deps: PublicSiteDeps) {
  const app = new Hono();
  const { repo } = deps;

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
    return c.html(renderSessionsPage(loaded.program, baseFor(loaded.slug)));
  });

  app.get("/e/:slug/public/sessions/:id", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    const session = loaded.program.sessions.find((s) => s.id === c.req.param("id") || s.slug === c.req.param("id"));
    if (!session) return c.html(notFoundHtml("Session not found"), 404);
    const from = c.req.query("from");
    if (from === "agenda") {
      // detail with back to agenda
      const day = c.req.query("day") || session.dayKey;
      const html = renderSessionDetail(loaded.program, session, baseFor(loaded.slug)).replace(
        `href="${baseFor(loaded.slug)}/sessions"`,
        `href="${baseFor(loaded.slug)}/agenda?day=${encodeURIComponent(day)}"`,
      ).replace("Back to sessions", "Back to agenda");
      return c.html(html);
    }
    return c.html(renderSessionDetail(loaded.program, session, baseFor(loaded.slug)));
  });

  app.get("/e/:slug/public/speakers", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    return c.html(renderSpeakersList(loaded.program, baseFor(loaded.slug), "list"));
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
    return c.html(renderAgenda(loaded.program, baseFor(loaded.slug), c.req.query("day") || undefined));
  });

  app.get("/e/:slug/public/itinerary", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    return c.html(renderItinerary(loaded.program, baseFor(loaded.slug)));
  });

  app.get("/e/:slug/public/gallery", async (c) => {
    const loaded = await withProgram(c.req.param("slug"));
    if (!loaded) return c.html(notFoundHtml(), 404);
    return c.html(renderSpeakersList(loaded.program, baseFor(loaded.slug), "gallery"));
  });

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

