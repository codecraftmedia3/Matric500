'use strict';
/* Matric500 — app shell. Data comes from window.ROADMAP_DATA (set by index.html after sign-in).
   Routes (hash): #/home  #/roadmap  #/subject/<key>  #/exams  #/profile */
const SUBJECTS = window.ROADMAP_DATA.subjects;
const ME = window.ROADMAP_DATA.user;
const IS_ADMIN = !!(ME && ME.role === 'admin');

/* Grade tiers: lime (G9) -> deep green (G12). c = lines/borders, t = accent text, f/k = badge fill/ink */
const TIERS = {
  9:  { c:'#7FA61F', t:'#4F6B0A', f:'#C8F25A', k:'#0F2A23', n:'Foundation' },
  10: { c:'#2F9E7A', t:'#12634A', f:'#8EDCC0', k:'#0F2A23', n:'Building' },
  11: { c:'#E0643F', t:'#B2391A', f:'#FFB59E', k:'#0F2A23', n:'Advancing' },
  12: { c:'#0F2A23', t:'#0F2A23', f:'#0F2A23', k:'#C8F25A', n:'Mastery' },
};

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

let progress = (ME && ME.progress) || {};
let profile = (ME && ME.profile) ? { ...ME.profile } : {};
let profileSaved = !!(profile.grade != null || profile.school || profile.stream);
let editingProfile = !profileSaved;
let toured = store.get('m500_tour_done', false);
let current = null;                 // subject key on the subject view
const openChapters = new Set();

const status = (id) => progress[id] || '';
const cls = (id) => ({ done:'is-done', challenging:'is-hard' }[status(id)] || '');

/* Flat index of every node so click handlers only need an id */
const INDEX = {};
for (const [key, s] of Object.entries(SUBJECTS)) for (const g of s.grades || []) for (const c of g.chapters || []) for (const t of c.topics || []) {
  INDEX[t.topic_id] = { title:t.topic_title, exp:t.explanation, kind:'Topic', grade:g.grade, subject:s.name, key };
  for (const sub of t.subtopics || []) INDEX[sub.subtopic_id] = { title:sub.subtopic_title, exp:sub.explanation, kind:'Subtopic', grade:g.grade, subject:s.name, key };
}
const idsOf = (key, grade) => Object.keys(INDEX).filter((i) => INDEX[i].key === key && (grade == null || INDEX[i].grade === grade));
const count = (ids) => ({ total: ids.length, done: ids.filter((i) => status(i) === 'done').length });
const pct = ({ total, done }) => (total ? Math.round((done / total) * 100) : 0);
const chapterCount = (s) => (s.grades || []).reduce((m, g) => m + (g.chapter_count ?? (g.chapters || []).length), 0);

const API_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };
let syncTimer;
function syncProgress() {           // debounce-save to the server
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => fetch('/api/progress', { method: 'PUT', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ progress }) }).catch(() => {}), 600);
}

function bar(p, color, h = 'h-2', track = 'bg-bg') {
  return `<div class="${h} overflow-hidden rounded-full ${track}"><div class="${h} rounded-full" style="width:${p}%;background:${color}"></div></div>`;
}
const ARROW = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const TILES = [
  { bg:'#E4F5B8', fg:'#0F2A23', track:'rgba(15,42,35,.18)', fill:'#0F2A23', ring:'' },
  { bg:'#0F2A23', fg:'#FFFFFF', track:'#2B4F44', fill:'#C8F25A', ring:'' },
  { bg:'#FFD9CE', fg:'#0F2A23', track:'rgba(15,42,35,.18)', fill:'#0F2A23', ring:'' },
  { bg:'#FFFFFF', fg:'#0F2A23', track:'#DDE2D8', fill:'#1F6B4F', ring:'border:1px solid #DDE2D8;' },
];
const firstName = () => String(profile.name || (ME && ME.name) || '').trim().split(/\s+/)[0];
const hardIds = () => Object.keys(INDEX).filter((i) => status(i) === 'challenging');

/* ---------- router ---------- */
const VIEWS = ['home', 'roadmap', 'subject', 'exams', 'forum', 'profile'];
function show(view, tab, title) {
  for (const v of VIEWS) $('view-' + v).classList.toggle('hidden', v !== view);
  document.querySelectorAll('[data-tab]').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('helpBtn').classList.toggle('hidden', view !== 'subject');
  document.title = title ? `${title} · Matric500` : 'Matric500';
  window.scrollTo({ top: 0 });
}
function route() {
  const [name, arg] = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
  if (name === 'subject' && arg && SUBJECTS[decodeURIComponent(arg)]) {
    current = decodeURIComponent(arg);
    for (const g of SUBJECTS[current].grades || []) { const c = (g.chapters || [])[0]; if (c) openChapters.add(c.chapter_id); }
    renderSubject(); show('subject', 'roadmap', SUBJECTS[current].name);
    if (!toured) startTour();
  } else if (name === 'roadmap') { renderRoadmap(); show('roadmap', 'roadmap', 'Roadmap'); }
  else if (name === 'exams')     { renderExams();   show('exams', 'exams', 'Exams'); }
  else if (name === 'forum')     { window.SocialsUI ? window.SocialsUI.init() : renderForum();   show('forum', 'forum', 'Socials'); }
  else if (name === 'profile')   { renderProfile(); show('profile', 'profile', 'Profile'); }
  else                           { renderHome();    show('home', 'home'); }
}
window.addEventListener('hashchange', route);
const goto = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

/* ---------- home ---------- */
function renderHome() {
  const all = count(Object.keys(INDEX));
  const p = pct(all);
  const hard = hardIds();
  const keys = Object.keys(SUBJECTS);
  const started = keys.find((k) => { const c = count(idsOf(k)); return c.done > 0 && c.done < c.total; });
  const target = started || keys[0];
  const C = 2 * Math.PI * 26, dash = (p / 100) * C;
  const name = firstName();

  const subjectRows = keys.map((k) => {
    const s = SUBJECTS[k], sp = pct(count(idsOf(k)));
    return `<li><a href="#/subject/${esc(encodeURIComponent(k))}" class="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:border-ink">
      <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink font-display text-base font-extrabold text-volt" aria-hidden="true">${esc(s.name.slice(0, 2))}</span>
      <span class="min-w-0 flex-1"><span class="block truncate font-display text-base font-bold">${esc(s.name)}</span><span class="mt-1.5 block">${bar(sp, '#1F6B4F', 'h-1.5')}</span></span>
      <span class="text-xs font-bold text-muted">${sp}%</span></a></li>`;
  }).join('');

  const revisit = hard.length
    ? hard.slice(0, 6).map((i) => `<li class="flex items-center justify-between gap-3 py-2.5 text-sm"><button data-goto="${esc(i)}" class="min-w-0 truncate text-left font-semibold hover:underline">${esc(INDEX[i].title)}</button><span class="shrink-0 rounded px-2 py-0.5 text-[10px] font-bold" style="background:${TIERS[INDEX[i].grade].f};color:${TIERS[INDEX[i].grade].k}">${esc(INDEX[i].subject)} · G${INDEX[i].grade}</span></li>`).join('')
    : '<li class="py-2.5 text-sm text-muted">Nothing marked challenging yet. Flag a topic you find hard and it will show up here.</li>';

  $('view-home').innerHTML = `
    <div class="grid gap-6 lg:grid-cols-5">
      <div class="rounded-[28px] bg-ink p-6 text-white lg:col-span-2">
        <div class="flex items-start justify-between gap-3">
          <div><p class="text-xs font-bold uppercase tracking-widest text-[#A9C2B8]">My progress</p>
          <h1 class="font-display text-2xl font-bold tracking-tight">Welcome back${name ? ', ' + esc(name) : ''}</h1></div>
          <span class="shrink-0 rounded-full bg-coral px-4 py-2 text-sm font-bold text-ink">${hard.length} to revisit</span>
        </div>
        <div class="mt-4 flex items-center gap-5 rounded-3xl bg-[#17382F] p-5">
          <svg width="88" height="88" viewBox="0 0 64 64" aria-hidden="true" class="shrink-0"><circle cx="32" cy="32" r="26" fill="none" stroke="#2B4F44" stroke-width="8"/><circle cx="32" cy="32" r="26" fill="none" stroke="#C8F25A" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="Figtree,sans-serif">${p}%</text></svg>
          <div class="min-w-0"><p class="text-sm font-semibold text-[#A9C2B8]">Overall</p>
          <p class="font-display text-xl font-bold leading-tight">${all.done} of ${all.total} topics done</p>
          <div class="mt-3" role="progressbar" aria-label="Overall progress" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">${bar(p, '#C8F25A', 'h-2', 'bg-[#2B4F44]')}</div></div>
        </div>
        ${target ? `<a href="#/subject/${esc(encodeURIComponent(target))}" class="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-volt px-4 py-3 text-base font-bold text-ink hover:opacity-90">${started ? 'Continue' : 'Start'} ${esc(SUBJECTS[target].name)}</a>` : ''}
      </div>
      <div class="space-y-6 lg:col-span-3">
        <section aria-labelledby="hSubjects"><h2 id="hSubjects" class="font-display text-xl font-extrabold">Your subjects</h2><ul class="mt-3 grid gap-3 sm:grid-cols-2">${subjectRows}</ul></section>
        <section aria-labelledby="hRevisit" class="rounded-2xl border border-line bg-surface p-5"><h2 id="hRevisit" class="font-display text-xl font-extrabold">To revisit</h2><ul class="mt-2 divide-y divide-line">${revisit}</ul></section>
      </div>
    </div>`;
}

/* ---------- roadmap (subject picker) ---------- */
function renderRoadmap() {
  const tierKey = Object.entries(TIERS).map(([g, t]) => `<span class="rounded-full px-3.5 py-1.5 text-xs font-bold" style="background:${t.f};color:${t.k}">Grade ${g} · ${t.n}</span>`).join('');
  const tiles = Object.entries(SUBJECTS).map(([key, s], n) => {
    const T = TILES[n % TILES.length];
    const p = pct(count(idsOf(key)));
    const segs = (s.grades || []).map((g) => `<span class="h-1.5 flex-1 rounded-full" style="background:${T.fg};opacity:${0.35 + 0.2 * (g.grade - 9)}" title="Grade ${g.grade}"></span>`).join('');
    const first = s.grades && s.grades[0] ? s.grades[0].grade : '';
    const last = s.grades && s.grades.length ? s.grades[s.grades.length - 1].grade : '';
    return `<a href="#/subject/${esc(encodeURIComponent(key))}" class="group flex min-h-[290px] flex-col justify-between rounded-[28px] p-6 text-left transition hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10" style="background:${T.bg};color:${T.fg};${T.ring}">
      <div class="flex items-start justify-between"><span class="grid h-14 w-14 place-items-center rounded-2xl font-display text-xl font-extrabold" style="background:${T.fg};color:${T.bg}" aria-hidden="true">${esc(s.name.slice(0, 2))}</span>${ARROW}</div>
      <div class="space-y-3">
        <h2 class="font-display text-3xl font-extrabold leading-tight tracking-tight">${esc(s.name)}</h2>
        <p class="text-sm leading-snug" style="opacity:.85">${esc(s.description || '')}</p>
        <div class="flex gap-1.5" aria-label="Grades covered">${segs}</div>
        <div class="flex items-center gap-3"><div class="h-2 flex-1 overflow-hidden rounded-full" style="background:${T.track}"><div class="h-2 rounded-full" style="width:${p}%;background:${T.fill}"></div></div><span class="text-xs font-bold">${p}%</span></div>
        <p class="text-xs font-bold uppercase tracking-widest" style="opacity:.8">Grades ${first}–${last} · ${chapterCount(s)} chapters</p>
      </div></a>`;
  }).join('');
  $('view-roadmap').innerHTML = `
    <h1 class="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Your roadmap</h1>
    <p class="mt-2 max-w-xl text-muted">Pick a subject to follow it grade by grade, chapter by chapter.</p>
    <div class="mt-4 flex flex-wrap gap-2" aria-label="Grade colour key">${tierKey}</div>
    <div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${tiles || '<p class="text-muted">No subjects are available for your stream yet.</p>'}</div>`;
}

/* ---------- subject tree ---------- */
function node(id, title, kind, tier, extra = '') {
  return `<div class="tree-item" style="--c:${tier.c};--k:${tier.k}">
    <div class="flex items-center gap-3 rounded-xl border-2 border-[color:var(--c)] bg-surface px-3 py-2.5 shadow-md shadow-black/10 transition hover:-translate-y-0.5 ${cls(id)}">
      <button data-check="${esc(id)}" aria-label="Toggle done: ${esc(title)}" class="chk grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[color:var(--c)] text-xs font-bold"></button>
      <button data-open="${esc(id)}" class="min-w-0 flex-1 text-left">
        <span class="block text-[10px] font-bold uppercase tracking-widest" style="color:${tier.t}">${kind}</span>
        <span class="ttl block text-sm font-semibold leading-snug text-ink">${esc(title)}</span>
      </button>
    </div>${extra}</div>`;
}
function renderSubject() {
  const s = SUBJECTS[current];
  if (!s) return;
  const all = count(idsOf(current));
  const grades = (s.grades || []).map((g) => {
    const tier = TIERS[g.grade] || TIERS[9];
    const gc = count(idsOf(current, g.grade));
    const chapters = (g.chapters || []).map((c, i) => {
      const ids = c.topics.flatMap((t) => [t.topic_id, ...(t.subtopics || []).map((x) => x.subtopic_id)]);
      const cc = count(ids), open = openChapters.has(c.chapter_id);
      const topics = c.topics.map((t) => node(t.topic_id, t.topic_title, 'Topic', tier,
        t.subtopics && t.subtopics.length ? `<div class="branch">${t.subtopics.map((x) => node(x.subtopic_id, x.subtopic_title, 'Subtopic', tier)).join('')}</div>` : '')).join('');
      return `<div class="tree-item" style="--c:${tier.c};--k:${tier.k}">
        <button data-chapter="${esc(c.chapter_id)}" aria-expanded="${open}" class="flex w-full items-center gap-3 rounded-xl border-2 border-[color:var(--c)] bg-line px-3 py-3 text-left shadow-lg shadow-black/10">
          <span class="chev text-sm" style="color:${tier.t}">▶</span>
          <span class="min-w-0 flex-1"><span class="block text-[10px] font-bold uppercase tracking-widest" style="color:${tier.t}">Chapter ${i + 1}</span><span class="block font-display text-sm font-bold leading-snug text-ink">${esc(c.chapter_title)}</span></span>
          <span class="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-bold" style="color:${tier.t}">${cc.done}/${cc.total}</span>
        </button>
        <div class="branch ${open ? '' : 'hidden'}">${topics}</div></div>`;
    }).join('');
    return `<div class="tree-item" style="--c:${tier.c};--k:${tier.k}">
      <div class="rounded-2xl border-2 border-[color:var(--c)] p-4 shadow-xl shadow-black/10" style="background:${tier.f}">
        <p class="text-[10px] font-bold uppercase tracking-widest" style="color:${tier.k}">${tier.n}</p>
        <div class="flex items-center justify-between gap-3"><h2 class="font-display text-2xl font-extrabold" style="color:${tier.k}">Grade ${g.grade}</h2><span class="text-xs font-bold" style="color:${tier.k}">${gc.done}/${gc.total} · ${pct(gc)}%</span></div>
      </div>
      <div class="branch">${chapters}</div></div>`;
  }).join('');

  $('view-subject').innerHTML = `
    <div class="mx-auto max-w-3xl">
      <a href="#/roadmap" class="mb-4 inline-flex min-h-[40px] items-center gap-1 text-sm font-bold text-ink hover:underline">← All subjects</a>
      <div class="rounded-2xl border-2 border-ink bg-surface p-5 text-center shadow-xl shadow-black/10">
        <h1 class="font-display text-3xl font-extrabold text-ink">${esc(s.name)}</h1>
        <p class="mx-auto mt-2 max-w-md text-sm text-muted">${esc(s.description || '')}</p>
        <div class="mx-auto mt-4 flex max-w-sm items-center gap-3"><div class="flex-1">${bar(pct(all), '#0F2A23')}</div><span class="text-xs font-bold text-muted">${all.done}/${all.total} · ${pct(all)}%</span></div>
        <div class="mt-4 flex flex-wrap justify-center gap-3 text-[11px] text-muted">
          <span>○ Not started</span><span>✓ Done</span><span class="text-magenta">⚑ Challenging</span>
          <button id="toggleAll" class="font-bold text-cyan underline">Expand / collapse all</button>
        </div>
      </div>
      <div class="branch" style="margin-left:0">${grades}</div>
    </div>`;
}

/* ---------- exams (placeholder) ---------- */
function renderExams() {
  $('view-exams').innerHTML = `
    <div class="mx-auto max-w-xl rounded-[28px] border border-line bg-surface p-8 text-center">
      <span class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-volt" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0F2A23" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/></svg></span>
      <p class="mt-4 inline-block rounded-full bg-coral px-3 py-1 text-xs font-bold uppercase tracking-widest text-ink">Coming soon</p>
      <h1 class="mt-3 font-display text-3xl font-extrabold tracking-tight">Exams</h1>
      <p class="mt-2 text-muted">Past papers and practice exams are on the way. For now, keep working through your roadmap and flag the topics you find challenging.</p>
      <a href="#/roadmap" class="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-ink px-6 py-3 text-base font-bold text-white hover:bg-cyan">Go to roadmap</a>
    </div>`;
}

/* ---------- profile ---------- */
function renderProfile() {
  const streamName = profile.stream === 'natural' ? 'Natural Science' : profile.stream === 'social' ? 'Social Science' : '-';
  const all = count(Object.keys(INDEX));
  const hard = hardIds();
  const field = 'mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base text-ink outline-none focus:border-ink';
  const identity = editingProfile ? `
    <div class="mt-4 space-y-4">
      <label class="block text-sm font-bold">Name<input id="nameInput" maxlength="80" autocomplete="name" value="${esc(profile.name || (ME && ME.name) || '')}" class="${field}"></label>
      <label class="block text-sm font-bold">Grade
        <select id="gradeInput" class="${field}"><option value="">Choose…</option>${[9, 10, 11, 12].map((g) => `<option value="${g}" ${Number(profile.grade) === g ? 'selected' : ''}>Grade ${g}</option>`).join('')}</select></label>
      <label class="block text-sm font-bold">School<input id="schoolInput" maxlength="120" value="${esc(profile.school || '')}" class="${field}"></label>
      <fieldset><legend class="text-sm font-bold">Field</legend><div class="mt-1 flex flex-wrap gap-4 text-sm">
        <label class="inline-flex items-center gap-2"><input type="radio" name="streamInput" value="natural" id="streamNatural" ${profile.stream === 'natural' ? 'checked' : ''}> Natural Science</label>
        <label class="inline-flex items-center gap-2"><input type="radio" name="streamInput" value="social" id="streamSocial" ${profile.stream === 'social' ? 'checked' : ''}> Social Science</label></div></fieldset>
      <div class="flex flex-wrap items-center gap-3">
        <button id="profileSaveBtn" type="button" class="min-h-[44px] rounded-full bg-ink px-6 text-sm font-bold text-white hover:bg-cyan disabled:opacity-50">Save</button>
        ${profileSaved ? '<button id="profileCancelBtn" type="button" class="min-h-[44px] rounded-full border-2 border-ink px-5 text-sm font-bold hover:bg-ink hover:text-white">Cancel</button>' : ''}
        <span id="saveNote" class="text-sm text-muted" role="status"></span>
      </div></div>` : `
    <dl class="mt-4 grid grid-cols-2 gap-4 text-sm">
      <div><dt class="text-xs font-bold uppercase tracking-widest text-muted">Name</dt><dd class="mt-0.5 font-semibold">${esc(profile.name || (ME && ME.name) || '-')}</dd></div>
      <div><dt class="text-xs font-bold uppercase tracking-widest text-muted">Grade</dt><dd class="mt-0.5 font-semibold">${esc(profile.grade ?? '-')}</dd></div>
      <div><dt class="text-xs font-bold uppercase tracking-widest text-muted">School</dt><dd class="mt-0.5 font-semibold">${esc(profile.school || '-')}</dd></div>
      <div><dt class="text-xs font-bold uppercase tracking-widest text-muted">Field</dt><dd class="mt-0.5 font-semibold">${streamName}</dd></div>
    </dl>
    <div class="mt-4 flex items-center gap-3"><button id="profileEditBtn" type="button" class="min-h-[44px] rounded-full border-2 border-ink px-5 text-sm font-bold hover:bg-ink hover:text-white">Edit</button><span id="saveNote" class="text-sm text-muted" role="status"></span></div>`;

  const gradeStats = Object.entries(SUBJECTS).flatMap(([key, s]) => (s.grades || []).map((g) => {
    const c = count(idsOf(key, g.grade)), t = TIERS[g.grade] || TIERS[9];
    return `<div><div class="mb-1 flex justify-between text-xs"><span class="font-bold" style="color:${t.t}">${esc(s.name)} · G${g.grade}</span><span class="text-muted">${c.done}/${c.total}</span></div>${bar(pct(c), t.c)}</div>`;
  })).join('');
  const hardList = hard.length
    ? hard.map((i) => `<li class="flex items-center justify-between gap-3 py-2 text-sm"><button data-goto="${esc(i)}" class="text-left hover:underline">${esc(INDEX[i].title)}</button><span class="shrink-0 rounded px-2 py-0.5 text-[10px] font-bold" style="background:${TIERS[INDEX[i].grade].f};color:${TIERS[INDEX[i].grade].k}">${esc(INDEX[i].subject)} · G${INDEX[i].grade}</span></li>`).join('')
    : '<li class="py-2 text-sm text-muted">Nothing marked challenging yet.</li>';

  $('view-profile').innerHTML = `
    <h1 class="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Profile</h1>
    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <section class="rounded-2xl border border-line bg-surface p-5" aria-labelledby="pInfo"><h2 id="pInfo" class="font-display text-xl font-extrabold">About you</h2>${identity}
        <p class="mt-4 text-xs text-muted">${esc((ME && ME.email) || '')}</p></section>
      <section class="rounded-2xl border border-line bg-surface p-5" aria-labelledby="pProg"><h2 id="pProg" class="font-display text-xl font-extrabold">Progress</h2>
        <div class="mt-3 mb-1 flex justify-between text-xs text-muted"><span>${all.done}/${all.total} topics</span><span>${pct(all)}%</span></div>${bar(pct(all), '#1F6B4F', 'h-3')}
        <div class="mt-5 space-y-3">${gradeStats}</div></section>
      <section class="rounded-2xl border border-line bg-surface p-5 lg:col-span-2" aria-labelledby="pHard"><h2 id="pHard" class="font-display text-xl font-extrabold">Challenging topics</h2><ul class="mt-2 divide-y divide-line">${hardList}</ul></section>
    </div>`;
}

async function saveProfile() {
  const name = $('nameInput').value.trim();
  const gradeValue = $('gradeInput').value;
  const school = $('schoolInput').value.trim();
  const stream = document.querySelector('input[name="streamInput"]:checked')?.value || null;
  const grade = gradeValue ? Number(gradeValue) : null;
  const btn = $('profileSaveBtn');
  if (name.length < 1 || name.length > 80 || (grade !== null && ![9, 10, 11, 12].includes(grade)) || school.length > 120) {
    $('saveNote').textContent = 'Check your name, grade, and school.';
    return;
  }
  btn.disabled = true;
  $('saveNote').textContent = '';
  try {
    const r = await fetch('/api/profile', { method: 'PUT', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ name, grade, school, stream }) });
    if (!r.ok) throw new Error('save_failed');
    profile = { name, grade, school, stream };
    profileSaved = true; editingProfile = false;
    renderProfile();
    $('saveNote').textContent = 'Saved';
  } catch {
    btn.disabled = false;
    $('saveNote').textContent = 'Could not save. Try again.';
  }
}

/* ---------- node modal ---------- */
let activeId = null;
function toggleModal(id, on) {
  const el = $(id);
  el.classList.toggle('hidden', !on);
  el.classList.toggle('flex', on);
  document.body.style.overflow = on ? 'hidden' : '';
}
function openNode(id) {
  const n = INDEX[id]; if (!n) return;
  const t = TIERS[n.grade];
  activeId = id;
  $('nmBox').style.borderColor = t.c;
  Object.assign($('nmKind').style, { background: t.f, color: t.k });
  $('nmKind').textContent = `${n.kind} · Grade ${n.grade}`;
  $('nmTitle').textContent = n.title;
  $('nmText').textContent = n.exp || 'No explanation available yet for this item.';
  toggleModal('nodeModal', true);
}
function setStatus(id, value) {
  if (value) progress[id] = value; else delete progress[id];
  syncProgress();
  if (!$('view-subject').classList.contains('hidden')) renderSubject();
}

/* ---------- onboarding tour ---------- */
const ICON = (p) => '<span class="grid h-14 w-14 place-items-center rounded-2xl bg-volt"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0F2A23" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg></span>';
const STEPS = [
  { i: ICON('<path d="M12 21V11M12 11 7 6M12 11l5-5M5 21h14"/>'), t:'Follow the tree', d:'Your subject is the root. Each grade is a branch, each chapter a sub-branch. Tap a chapter card to open or close its topics, or use “Expand / collapse all”.' },
  { i: ICON('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>'), t:'Read the colours', d:'Grade 9 is lime, Grade 10 mint, Grade 11 coral and Grade 12 deep green, so you always know which level you are on.' },
  { i: ICON('<path d="m5 12 5 5 9-10"/>'), t:'Track your progress', d:'Tap the circle on any card to mark it done. Open a card to set it as Done, Not started or Challenging. Dashed coral cards are the ones to revisit.' },
  { i: ICON('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/>'), t:'Read milestones', d:'Tap a card’s title to read a short explanation. Counters on each chapter and grade show how far you have come.' },
];
let step = 0;
function startTour() { step = 0; renderStep(); toggleModal('tourModal', true); }
function endTour() { toured = true; store.set('m500_tour_done', true); toggleModal('tourModal', false); }
function renderStep() {
  const s = STEPS[step];
  $('tourStep').textContent = `Step ${step + 1} of ${STEPS.length}`;
  $('tourIcon').innerHTML = s.i; $('tourTitle').textContent = s.t; $('tourText').textContent = s.d;
  $('tourDots').innerHTML = STEPS.map((_, i) => `<span class="h-2 w-2 rounded-full ${i === step ? 'bg-ink' : 'bg-line'}"></span>`).join('');
  $('tourBack').classList.toggle('invisible', step === 0);
  $('tourNext').textContent = step === STEPS.length - 1 ? 'Got it' : 'Next';
}

/* ---------- events (delegated, so re-rendering views never loses handlers) ---------- */
document.addEventListener('click', (e) => {
  const q = (s) => e.target.closest(s);
  if (q('#signoutBtn')) return signOut();
  if (q('#helpBtn')) return startTour();
  if (q('[data-check]')) { const id = q('[data-check]').dataset.check; return setStatus(id, status(id) === 'done' ? '' : 'done'); }
  if (q('[data-open]')) return openNode(q('[data-open]').dataset.open);
  if (q('[data-goto]')) {
    const id = q('[data-goto]').dataset.goto, n = INDEX[id]; if (!n) return;
    goto('#/subject/' + encodeURIComponent(n.key)); return openNode(id);
  }
  if (q('[data-chapter]')) {
    const b = q('[data-chapter]'), id = b.dataset.chapter, open = !openChapters.has(id);
    open ? openChapters.add(id) : openChapters.delete(id);
    b.setAttribute('aria-expanded', open); return b.nextElementSibling.classList.toggle('hidden', !open);
  }
  if (q('#toggleAll')) {
    const ids = SUBJECTS[current].grades.flatMap((g) => g.chapters.map((c) => c.chapter_id));
    const anyClosed = ids.some((i) => !openChapters.has(i));
    ids.forEach((i) => (anyClosed ? openChapters.add(i) : openChapters.delete(i)));
    return renderSubject();
  }
  if (q('#nmActions [data-set]')) { setStatus(activeId, q('[data-set]').dataset.set); return toggleModal('nodeModal', false); }
  if (q('[data-close]') || e.target.id === 'nodeModal') return toggleModal('nodeModal', false);
  if (q('#tourNext')) return step === STEPS.length - 1 ? endTour() : (step++, renderStep());
  if (q('#tourBack')) return (step--, renderStep());
  if (q('#tourSkip')) return endTour();
  if (q('#toTop')) return window.scrollTo({ top: 0, behavior: 'smooth' });
  if (q('#profileSaveBtn')) return saveProfile();
  if (q('#profileEditBtn')) { editingProfile = true; renderProfile(); return $('nameInput').focus(); }
  if (q('#profileCancelBtn')) { editingProfile = false; return renderProfile(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleModal('nodeModal', false); });
document.addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-open]'); if (!b) return;
  e.preventDefault(); const id = b.dataset.open; setStatus(id, status(id) === 'done' ? '' : 'done');
});

/* Back-to-top: appears after 300px of scroll */
function syncToTop() {
  const on = window.scrollY > 300, t = $('toTop');
  if (!t) return;
  t.classList.toggle('opacity-0', !on);
  t.classList.toggle('translate-y-4', !on);
  t.classList.toggle('pointer-events-none', !on);
}
window.addEventListener('scroll', syncToTop, { passive: true });

/* ---------- sign out ---------- */
async function signOut() {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS }); } catch { /* ignore */ }
  location.replace('/');
}

/* ---------- init ---------- */
window.M500 = { context: () => ({ view: (location.hash || '#/home').slice(2), subject: current && SUBJECTS[current] ? SUBJECTS[current].name : null, grade: profile.grade ?? null }) };
if (IS_ADMIN) { $('adminLink').classList.remove('hidden'); $('adminLink').classList.add('inline-flex'); }
route();
syncToTop();
{ const ai = document.createElement('script'); ai.src = 'assistant.js'; document.body.appendChild(ai); }

/* ---------- forum social community ---------- */
const forumState = {
  kind: 'community',
  posts: [],
  nextBefore: null,
  loading: false,
  selectedPostId: null,
  feedScroll: 0,
  search: '',
  comments: [],
  commentsBefore: null,
  commentsLoading: false,
};

const forumIcons = {
  home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
  explore: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4z"/></svg>',
  bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
  message: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/></svg>',
  user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
  arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m15 18-6-6 6-6"/></svg>',
  comment: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/></svg>',
  share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></svg>',
};

async function forumApi(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'request_failed');
    err.status = response.status;
    throw err;
  }
  return data;
}

async function forumImageToDataUrl(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 1_500_000) throw new Error('Image must be 1.5 MB or smaller.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process this image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL('image/webp', 0.82);
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrl.length > 2_000_000) throw new Error('Image is still too large. Try a smaller picture.');
    return dataUrl;
  } finally { bitmap.close(); }
}

function forumInitials(name) {
  return String(name || 'M').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'M';
}

function forumDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
}

function forumAvatar(name, size = 'h-10 w-10') {
  return `<span class="${size} shrink-0 rounded-full bg-ink text-xs font-bold text-volt grid place-items-center" aria-hidden="true">${esc(forumInitials(name))}</span>`;
}

async function loadForumPosts(reset = false) {
  if (forumState.loading) return;
  forumState.loading = true;
  const feed = document.querySelector('#forumFeedList');
  if (feed && reset) feed.innerHTML = '<div class="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">Loading community posts…</div>'; 
  const kind = forumState.kind === 'all' ? '' : `&kind=${encodeURIComponent(forumState.kind)}`;
  const before = reset || !forumState.nextBefore ? '' : `&before=${encodeURIComponent(forumState.nextBefore)}`;
  try {
    const data = await forumApi(`/api/posts?limit=10${kind}${before}`);
    const incoming = data.posts || [];
    forumState.posts = reset ? incoming : [...forumState.posts, ...incoming];
    forumState.nextBefore = data.nextBefore;
    renderForumFeed();
  } catch (error) {
    if (feed) feed.innerHTML = `<div class="rounded-2xl border border-line bg-surface p-6"><p class="text-sm text-magenta">Could not load the community feed.</p><button type="button" data-forum-action="retry-feed" class="mt-3 min-h-[44px] rounded-full border border-line px-4 text-sm font-bold">Try again</button></div>`;
  } finally { forumState.loading = false; }
}

function filteredForumPosts() {
  const query = forumState.search.trim().toLowerCase();
  if (!query) return forumState.posts;
  return forumState.posts.filter((post) => `${post.title} ${post.body} ${post.author?.name || ''}`.toLowerCase().includes(query));
}

function forumPostCard(post) {
  const authorName = post.author?.name || 'Matric500';
  const reactionCount = Number(post.reactionCount || 0);
  const commentCount = Number(post.commentCount || 0);
  const mine = !!post.mine;
  const canModerate = IS_ADMIN;
  const currentReaction = post.currentReaction;
  return `
    <article class="rounded-[24px] border border-line bg-surface p-4 sm:p-5" data-post-id="${esc(post.id)}">
      <div class="flex items-start gap-3">
        ${forumAvatar(authorName)}
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <button type="button" data-forum-action="open-post" data-id="${esc(post.id)}" class="min-w-0 text-left">
              <span class="block truncate text-sm font-extrabold text-ink">${esc(authorName)}</span>
              <span class="mt-0.5 block text-xs text-muted">${esc(forumDate(post.createdAt))} · ${esc(post.kind)}</span>
            </button>
            ${(mine || canModerate) ? `<button type="button" data-forum-action="post-menu" data-id="${esc(post.id)}" class="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg text-muted hover:bg-bg" aria-label="Post options">•••</button>` : ''}
          </div>
          <button type="button" data-forum-action="open-post" data-id="${esc(post.id)}" class="mt-3 block w-full text-left">
            <h2 class="font-display text-lg font-extrabold leading-snug text-ink sm:text-xl">${esc(post.title)}</h2>
            <p class="mt-2 line-clamp-4 whitespace-pre-line text-[15px] leading-relaxed text-ink">${esc(post.body)}</p>
          </button>
          ${post.hasImage ? `<button type="button" data-forum-action="open-post" data-id="${esc(post.id)}" class="mt-4 block w-full overflow-hidden rounded-2xl border border-line bg-bg" aria-label="Open post"><img src="/api/posts/${encodeURIComponent(post.id)}/image" alt="" class="h-56 w-full object-cover sm:h-64" loading="lazy"></button>` : ''}
          <div class="mt-4 flex items-center gap-1 border-t border-line pt-3 text-sm">
            <button type="button" data-forum-action="react" data-id="${esc(post.id)}" class="flex min-h-[44px] items-center gap-2 rounded-full px-3 font-bold ${currentReaction ? 'bg-coral/15 text-magenta' : 'text-muted hover:bg-bg'}" aria-label="${currentReaction ? 'Change reaction' : 'Like post'}"><span aria-hidden="true">${currentReaction ? '♥' : '♡'}</span><span>${reactionCount}</span></button>
            <button type="button" data-forum-action="open-post" data-id="${esc(post.id)}" class="flex min-h-[44px] items-center gap-2 rounded-full px-3 font-bold text-muted hover:bg-bg">${forumIcons.comment}<span>${commentCount}</span></button>
            <button type="button" data-forum-action="share" data-id="${esc(post.id)}" class="ml-auto grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-bg" aria-label="Share post">${forumIcons.share}</button>
          </div>
        </div>
      </div>
    </article>`;
}

function renderForumFeed() {
  const list = document.querySelector('#forumFeedList');
  if (!list) return;
  const posts = filteredForumPosts();
  if (!posts.length) {
    list.innerHTML = forumState.search
      ? '<div class="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">No posts match your search.</div>'
      : '<div class="rounded-2xl border border-line bg-surface p-8 text-center"><p class="font-display text-lg font-bold">No posts here yet</p><p class="mt-1 text-sm text-muted">The community feed is quiet for now.</p></div>';
  } else {
    list.innerHTML = posts.map(forumPostCard).join('') + (forumState.nextBefore
      ? '<button type="button" data-forum-action="load-more" class="mx-auto flex min-h-[44px] items-center rounded-full border border-line bg-surface px-5 text-sm font-bold hover:border-ink">Load more</button>'
      : '<p class="py-3 text-center text-xs text-muted">You’re all caught up</p>');
  }
  const count = document.querySelector('#forumCommunityCount');
  if (count) count.textContent = `${forumState.posts.length} loaded`;
}

function renderForumShell() {
  const root = $('view-forum');
  const canCreate = ME && (ME.role === 'admin' || ME.premium);
  root.innerHTML = `
    <div class="mx-auto max-w-[1180px]">
      <div class="grid items-start gap-5 lg:grid-cols-[176px_minmax(0,620px)_220px] xl:grid-cols-[176px_minmax(0,620px)_220px]">
        <aside class="forum-left hidden lg:sticky lg:top-24 lg:block" aria-label="Community navigation">
          <nav class="space-y-1">
            <button type="button" data-forum-nav="feed" class="forum-side-active flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm font-bold"><span>${forumIcons.home}</span><span>Community</span></button>
            <button type="button" data-forum-nav="explore" class="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface"><span>${forumIcons.explore}</span><span>Explore</span></button>
            <button type="button" data-forum-nav="notifications" class="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface"><span>${forumIcons.bell}</span><span>Notifications</span></button>
            <button type="button" data-forum-nav="messages" class="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface"><span>${forumIcons.message}</span><span>Messages</span></button>
            <a href="#/profile" class="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface"><span>${forumIcons.user}</span><span>Profile</span></a>
          </nav>
          ${canCreate ? '<button type="button" data-forum-action="open-composer" class="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-white hover:bg-cyan">'+forumIcons.plus+'<span>Create post</span></button>' : ''}
        </aside>
        <main class="min-w-0" id="forumMainColumn">
          <div id="forumView" class="space-y-4"></div>
        </main>
        <aside class="hidden lg:block lg:sticky lg:top-24" aria-label="Community information">
          <div class="rounded-[20px] border border-line bg-surface p-4">
            <p class="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">Community</p>
            <p id="forumCommunityCount" class="mt-2 text-sm font-bold text-ink">Loading…</p>
            <p class="mt-1 text-xs leading-relaxed text-muted">Official updates and community discussions.</p>
          </div>
          <div class="mt-4 rounded-[20px] border border-line bg-surface p-4">
            <p class="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">Discovery</p>
            <p class="mt-3 text-xs leading-relaxed text-muted">Follow suggestions and trending topics become available when those backend services are connected.</p>
          </div>
        </aside>
      </div>
      <button type="button" data-forum-action="open-composer" class="fixed bottom-[calc(env(safe-area-inset-bottom)+78px)] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-ink text-white shadow-lg lg:hidden" aria-label="Create post" ${canCreate ? '' : 'hidden'}>${forumIcons.plus}</button>
      <div id="forumModal" class="fixed inset-0 z-[60] hidden items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"></div>
    </div>`;
  renderForumFeedView();
}

function renderForumFeedView() {
  const view = document.querySelector('#forumView');
  if (!view) return;
  view.innerHTML = `
    <header class="rounded-[24px] border border-line bg-surface p-4 sm:p-5">
      <div class="flex items-center justify-between gap-3">
        <div><p class="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">Matric500</p><h1 class="mt-1 font-display text-2xl font-extrabold">Community</h1></div>
        ${ME ? `<button type="button" data-forum-action="open-composer" class="grid h-11 w-11 place-items-center rounded-full bg-ink text-white" aria-label="Create post" ${ME.premium || IS_ADMIN ? '' : 'hidden'}>${forumIcons.plus}</button>` : ''}
      </div>
      <label class="mt-4 flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-bg px-4"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><span class="sr-only">Search loaded posts</span><input id="forumSearch" value="${esc(forumState.search)}" placeholder="Search posts" class="w-full bg-transparent text-sm outline-none"></label>
      <div class="mt-3 flex gap-2 overflow-x-auto" aria-label="Feed filter">
        ${[['community','Community'],['official','Official'],['all','All posts']].map(([kind,label]) => `<button type="button" data-forum-kind="${kind}" class="min-h-[40px] shrink-0 rounded-full px-4 text-xs font-bold ${forumState.kind === kind ? 'bg-ink text-white' : 'border border-line text-muted'}">${label}</button>`).join('')}
      </div>
    </header>
    <div id="forumFeedList" class="space-y-3"></div>`;
  renderForumFeed();
  document.querySelector('#forumSearch')?.addEventListener('input', (event) => { forumState.search = event.target.value; renderForumFeed(); });
}

async function openForumPost(postId) {
  forumState.feedScroll = window.scrollY;
  forumState.selectedPostId = postId;
  const view = document.querySelector('#forumView');
  if (!view) return;
  view.innerHTML = '<div class="rounded-[24px] border border-line bg-surface p-6 text-sm text-muted">Loading post…</div>';
  try {
    const [postData, commentData] = await Promise.all([
      forumApi(`/api/posts/${encodeURIComponent(postId)}`),
      forumApi(`/api/posts/${encodeURIComponent(postId)}/comments?limit=20`),
    ]);
    forumState.comments = commentData.comments || [];
    forumState.commentsBefore = commentData.nextBefore;
    renderExpandedPost(postData.post);
  } catch (error) {
    view.innerHTML = '<div class="rounded-[24px] border border-line bg-surface p-6"><p class="text-sm text-magenta">This post could not be opened.</p><button type="button" data-forum-action="back-feed" class="mt-3 min-h-[44px] rounded-full border border-line px-4 text-sm font-bold">Back to feed</button></div>';
  }
}

function renderExpandedPost(post) {
  const view = document.querySelector('#forumView');
  if (!view) return;
  const authorName = post.author?.name || 'Matric500';
  const mine = !!post.mine;
  view.innerHTML = `
    <article class="overflow-hidden rounded-[24px] border border-line bg-surface">
      <div class="sticky top-20 z-20 flex min-h-[56px] items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur">
        <button type="button" data-forum-action="back-feed" class="grid h-10 w-10 place-items-center rounded-full hover:bg-bg" aria-label="Back to feed">${forumIcons.arrow}</button>
        <p class="font-display font-extrabold">Post</p>
      </div>
      <div class="p-4 sm:p-5">
        <div class="flex items-start gap-3">${forumAvatar(authorName)}<div><p class="text-sm font-extrabold">${esc(authorName)}</p><p class="text-xs text-muted">${esc(forumDate(post.createdAt))} · ${esc(post.kind)}</p></div></div>
        <h1 class="mt-5 font-display text-2xl font-extrabold leading-tight sm:text-3xl">${esc(post.title)}</h1>
        <div class="mt-4 whitespace-pre-line text-[15px] leading-relaxed sm:text-base">${esc(post.body)}</div>
        ${post.hasImage ? `<img src="/api/posts/${encodeURIComponent(post.id)}/image" alt="" class="mt-5 max-h-[520px] w-full rounded-2xl border border-line object-contain bg-bg">` : ''}
        <div class="mt-5 flex items-center gap-2 border-y border-line py-2">
          <button type="button" data-forum-action="react" data-id="${esc(post.id)}" class="flex min-h-[44px] items-center gap-2 rounded-full px-3 font-bold ${post.currentReaction ? 'text-magenta' : 'text-muted'}"><span>${post.currentReaction ? '♥' : '♡'}</span><span>${Number(post.reactionCount || 0)}</span></button>
          <button type="button" data-forum-action="focus-comment" class="flex min-h-[44px] items-center gap-2 rounded-full px-3 font-bold text-muted">${forumIcons.comment}<span>${Number(post.commentCount || 0)}</span></button>
          ${(mine || IS_ADMIN) ? `<button type="button" data-forum-action="post-menu" data-id="${esc(post.id)}" class="ml-auto min-h-[44px] rounded-full px-3 text-sm font-bold text-muted">Options</button>` : ''}
          ${ME ? `<button type="button" data-forum-action="report-post" data-id="${esc(post.id)}" class="min-h-[44px] rounded-full px-3 text-xs font-bold text-magenta">Report</button>` : ''}
        </div>
        <section class="mt-4">
          <h2 class="font-display text-lg font-extrabold">Discussion</h2>
          ${ME ? `<form id="forumCommentForm" class="mt-3 flex gap-2"><input id="forumCommentInput" maxlength="2000" required placeholder="Add to the discussion…" class="min-h-[44px] min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm outline-none focus:border-ink"><button type="submit" class="min-h-[44px] rounded-full bg-ink px-5 text-sm font-bold text-white">Post</button></form>` : '<p class="mt-3 text-sm text-muted">Sign in to join the discussion.</p>'}
          <div id="forumComments" class="mt-4 space-y-3"></div>
          ${forumState.commentsBefore ? '<button type="button" data-forum-action="load-comments" data-id="'+esc(post.id)+'" class="mt-3 min-h-[44px] rounded-full border border-line px-4 text-sm font-bold">Load earlier comments</button>' : ''}
        </section>
      </div>
    </article>`;
  renderForumComments(post);
}

function renderForumComments(post) {
  const container = document.querySelector('#forumComments');
  if (!container) return;
  container.innerHTML = forumState.comments.length ? forumState.comments.map((comment) => {
    const name = comment.author?.name || 'User';
    const mine = !!comment.deleted ? false : comment.author?.id === ME?.userId;
    return `<article class="flex gap-3 border-b border-line pb-3" data-comment-id="${esc(comment.id)}">
      ${forumAvatar(name, 'h-9 w-9')}
      <div class="min-w-0 flex-1"><div class="flex items-center gap-2"><p class="text-sm font-extrabold">${esc(comment.deleted ? 'Matric500' : name)}</p><span class="text-[11px] text-muted">${esc(forumDate(comment.createdAt))}</span></div>
      <p class="mt-1 whitespace-pre-line text-sm leading-relaxed ${comment.deleted ? 'italic text-muted' : 'text-ink'}">${esc(comment.body)}</p>
      ${!comment.deleted && ME ? `<div class="mt-2 flex gap-2"><button type="button" data-forum-action="reply-comment" data-id="${esc(comment.id)}" class="text-xs font-bold text-muted">Reply</button>${mine ? `<button type="button" data-forum-action="edit-comment" data-id="${esc(comment.id)}" class="text-xs font-bold text-muted">Edit</button><button type="button" data-forum-action="delete-comment" data-id="${esc(comment.id)}" class="text-xs font-bold text-magenta">Delete</button>` : ''}${IS_ADMIN ? `<button type="button" data-forum-action="delete-comment" data-id="${esc(comment.id)}" class="text-xs font-bold text-magenta">Remove</button>` : ''}${`<button type="button" data-forum-action="report-comment" data-post="${esc(post.id)}" data-id="${esc(comment.id)}" class="text-xs font-bold text-muted">Report</button>`}</div>` : ''}</div>
    </article>`;
  }).join('') : '<p class="rounded-xl bg-bg p-4 text-sm text-muted">No comments yet. Start the conversation.</p>';
}

async function forumCreatePost(payload) {
  await forumApi('/api/posts', { method: 'POST', body: JSON.stringify(payload) });
  closeForumModal();
  forumState.posts = [];
  forumState.nextBefore = null;
  await loadForumPosts(true);
}

function openForumComposer() {
  if (!ME) { location.href = '/login.html'; return; }
  if (!IS_ADMIN && !ME.premium) {
    openForumModal('<div class="w-full max-w-md rounded-[24px] bg-surface p-6"><p class="font-mono text-[10px] font-bold uppercase tracking-widest text-magenta">Community permission</p><h2 class="mt-2 font-display text-xl font-extrabold">Active community membership required</h2><p class="mt-2 text-sm text-muted">Your account does not currently have permission to publish community posts.</p><button type="button" data-forum-modal-close class="mt-5 min-h-[44px] w-full rounded-full border border-line text-sm font-bold">Close</button></div>');
    return;
  }
  openForumModal(`
    <form id="forumComposer" class="w-full max-w-lg rounded-t-[24px] bg-surface p-5 sm:rounded-[24px]">
      <div class="flex items-center justify-between"><h2 class="font-display text-xl font-extrabold">Create post</h2><button type="button" data-forum-modal-close class="grid h-10 w-10 place-items-center rounded-full text-xl text-muted">×</button></div>
      <div class="mt-4 flex items-center gap-3">${forumAvatar(ME.name, 'h-11 w-11')}<div><p class="text-sm font-extrabold">${esc(ME.name)}</p><p class="text-xs text-muted">${IS_ADMIN ? 'Administrator' : 'Community member'}</p></div></div>
      ${IS_ADMIN ? '<label class="mt-4 block text-xs font-bold">Post type<select id="forumPostKind" class="mt-1 min-h-[44px] w-full rounded-xl border border-line bg-bg px-3"><option value="community">Community</option><option value="official">Official</option></select></label>' : ''}
      <label class="mt-4 block text-xs font-bold">Title<input id="forumPostTitle" maxlength="120" required placeholder="Post title" class="mt-1 min-h-[44px] w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none"></label>
      <label class="mt-4 block text-xs font-bold">Message<textarea id="forumPostBody" maxlength="4000" required rows="5" placeholder="Share with the community…" class="mt-1 w-full rounded-xl border border-line bg-bg p-3 text-sm outline-none"></textarea></label>
      <label class="mt-3 block min-h-[44px] cursor-pointer rounded-xl border border-dashed border-line px-4 py-3 text-center text-sm font-bold text-muted">Add JPG, PNG or WebP<input id="forumPostImage" type="file" accept="image/jpeg,image/png,image/webp" class="hidden"></label>
      <div id="forumImagePreview" class="mt-3 hidden items-start gap-3"><img id="forumImagePreviewImg" alt="Image preview" class="max-h-48 max-w-[75%] rounded-xl object-contain"><button type="button" data-forum-action="remove-image" class="min-h-[44px] rounded-full border border-line px-3 text-xs font-bold">Remove</button></div>
      <p id="forumComposerStatus" role="status" class="mt-3 min-h-5 text-sm text-muted"></p>
      <div class="mt-2 flex justify-end gap-2"><button type="button" data-forum-modal-close class="min-h-[44px] rounded-full border border-line px-5 text-sm font-bold">Cancel</button><button id="forumPublish" type="submit" class="min-h-[44px] rounded-full bg-ink px-5 text-sm font-bold text-white">Publish</button></div>
    </form>`);
}

function openForumModal(markup) {
  const modal = document.querySelector('#forumModal');
  if (!modal) return;
  modal.innerHTML = markup;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeForumModal() {
  const modal = document.querySelector('#forumModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  modal.innerHTML = '';
}

async function renderForumUnavailable(title, message) {
  const view = document.querySelector('#forumView');
  if (!view) return;
  view.innerHTML = `<section class="rounded-[24px] border border-line bg-surface p-6 sm:p-8"><button type="button" data-forum-action="back-feed" class="mb-4 grid h-10 w-10 place-items-center rounded-full hover:bg-bg" aria-label="Back">${forumIcons.arrow}</button><p class="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">Matric500 Community</p><h1 class="mt-2 font-display text-2xl font-extrabold">${esc(title)}</h1><p class="mt-3 max-w-md text-sm leading-relaxed text-muted">${esc(message)}</p></section>`;
}

async function renderForum() {
  forumState.feedScroll = window.scrollY;
  renderForumShell();
  await loadForumPosts(true);
}

/* ---------- forum interactions ---------- */
document.addEventListener('click', async (event) => {
  const kindButton = event.target.closest('[data-forum-kind]');
  if (kindButton) {
    forumState.kind = kindButton.dataset.forumKind;
    forumState.posts = [];
    forumState.nextBefore = null;
    renderForumFeedView();
    await loadForumPosts(true);
    return;
  }

  const navButton = event.target.closest('[data-forum-nav]');
  if (navButton) {
    const target = navButton.dataset.forumNav;
    if (target === 'feed') {
      forumState.selectedPostId = null;
      renderForumFeedView();
      renderForumFeed();
    } else if (target === 'explore') {
      await renderForumUnavailable('Explore', 'Discoverable users and trending topics will appear here when discovery services are connected.');
    } else if (target === 'notifications') {
      await renderForumUnavailable('Notifications', 'There are no notification services connected yet. Matric500 will show real activity here when notifications are implemented.');
    } else if (target === 'messages') {
      await renderForumUnavailable('Messages', 'Direct messaging is not available yet. This view is a UI boundary and does not contain or send placeholder messages.');
    }
   
    return;
  }

  const modalClose = event.target.closest('[data-forum-modal-close]');
  if (modalClose) { closeForumModal(); return; }

  const action = event.target.closest('[data-forum-action]');
  if (!action) return;
  const name = action.dataset.forumAction;
  const id = action.dataset.id;

  if (name === 'open-composer') openForumComposer();
  if (name === 'back-feed') {
    forumState.selectedPostId = null;
    renderForumFeedView();
    renderForumFeed();
    window.scrollTo({ top: forumState.feedScroll, behavior: 'auto' });
  }
  if (name === 'open-post') await openForumPost(id);
  if (name === 'load-more') await loadForumPosts(false);
  if (name === 'retry-feed') {
    forumState.posts = [];
    forumState.nextBefore = null;
    await loadForumPosts(true);
  }
  if (name === 'focus-comment') document.querySelector('#forumCommentInput')?.focus();

  if (name === 'react') {
    if (!ME) { location.href = '/login.html'; return; }
    try {
      const post = forumState.posts.find((item) => item.id === id);
      if (post?.currentReaction) await forumApi(`/api/posts/${encodeURIComponent(id)}/reactions`, { method: 'DELETE' });
      else await forumApi(`/api/posts/${encodeURIComponent(id)}/reactions/like`, { method: 'PUT' });
      if (forumState.selectedPostId === id) await openForumPost(id);
      else await loadForumPosts(true);
    } catch (error) { alert(error.message === 'tier2_required' ? 'Active membership is required.' : 'Could not update your reaction.'); }
  }

  if (name === 'share') {
    const url = `${location.origin}${location.pathname}#/forum`;
    try { await navigator.clipboard.writeText(url); } catch { /* Clipboard may be unavailable. */ }
  }

  if (name === 'report-post') {
    if (!ME) { location.href = '/login.html'; return; }
    const reason = window.prompt('Why are you reporting this post?', '');
    if (!reason?.trim()) return;
    try {
      await forumApi(`/api/posts/${encodeURIComponent(id)}/reports`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      alert('Report submitted.');
    } catch (error) { alert(error.message === 'duplicate_report' ? 'You already have an active report for this post.' : 'Could not submit the report.'); }
  }

  if (name === 'report-comment') {
    if (!ME) { location.href = '/login.html'; return; }
    const reason = window.prompt('Why are you reporting this comment?', '');
    if (!reason?.trim()) return;
    try {
      await forumApi(`/api/posts/${encodeURIComponent(action.dataset.post)}/comments/${encodeURIComponent(id)}/reports`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      alert('Report submitted.');
    } catch (error) { alert(error.message === 'duplicate_report' ? 'You already have an active report for this comment.' : 'Could not submit the report.'); }
  }

  if (name === 'reply-comment') {
    if (!ME) { location.href = '/login.html'; return; }
    const body = window.prompt('Write a reply:', '');
    if (!body?.trim()) return;
    try {
      await forumApi(`/api/posts/${encodeURIComponent(forumState.selectedPostId)}/comments`, { method: 'POST', body: JSON.stringify({ body: body.trim(), parentId: id }) });
      await openForumPost(forumState.selectedPostId);
    } catch (error) { alert('Could not add the reply.'); }
  }

  if (name === 'edit-comment') {
    const comment = forumState.comments.find((item) => item.id === id);
    const body = window.prompt('Edit your comment:', comment?.body || '');
    if (!body?.trim()) return;
    try {
      await forumApi(`/api/posts/${encodeURIComponent(forumState.selectedPostId)}/comments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ body: body.trim() }) });
      await openForumPost(forumState.selectedPostId);
    } catch (error) { alert('Could not edit the comment.'); }
  }

  if (name === 'delete-comment') {
    if (!window.confirm('Remove this comment?')) return;
    try {
      await forumApi(`/api/posts/${encodeURIComponent(forumState.selectedPostId)}/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await openForumPost(forumState.selectedPostId);
    } catch (error) { alert('Could not remove the comment.'); }
  }

  if (name === 'post-menu') {
    const post = forumState.posts.find((item) => item.id === id);
    const choice = window.prompt('Type EDIT or DELETE:', '');
    if (!choice) return;
    if (choice.trim().toLowerCase() === 'delete') {
      if (!window.confirm('Permanently delete this post?')) return;
      try { await forumApi(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadForumPosts(true); }
      catch (error) { alert('Could not delete the post.'); }
    } else if (choice.trim().toLowerCase() === 'edit') {
      const title = window.prompt('Edit post title:', post?.title || '');
      if (!title?.trim()) return;
      const body = window.prompt('Edit post text:', post?.body || '');
      if (!body?.trim()) return;
      try {
        await forumApi(`/api/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ title: title.trim(), body: body.trim() }) });
        await loadForumPosts(true);
      } catch (error) { alert('Could not edit the post.'); }
    }
  }

  if (name === 'remove-image') {
    const preview = document.querySelector('#forumImagePreview');
    const input = document.querySelector('#forumPostImage');
    if (preview) preview.classList.add('hidden');
    if (input) input.value = '';
  }
});

let forumSelectedImage = null;
document.addEventListener('change', async (event) => {
  if (event.target?.id !== 'forumPostImage') return;
  const file = event.target.files?.[0];
  if (!file) return;
  const status = document.querySelector('#forumComposerStatus');
  if (status) status.textContent = 'Preparing image…';
  try {
    forumSelectedImage = await forumImageToDataUrl(file);
    const preview = document.querySelector('#forumImagePreview');
    const image = document.querySelector('#forumImagePreviewImg');
    if (image) image.src = forumSelectedImage;
    if (preview) { preview.classList.remove('hidden'); preview.classList.add('flex'); }
    if (status) status.textContent = 'Image ready.';
  } catch (error) {
    forumSelectedImage = null;
    event.target.value = '';
    if (status) status.textContent = error.message;
  }
});

document.addEventListener('submit', async (event) => {
  if (event.target?.id === 'forumCommentForm') {
    event.preventDefault();
    const input = document.querySelector('#forumCommentInput');
    const body = input?.value.trim();
    if (!body) return;
    try {
      await forumApi(`/api/posts/${encodeURIComponent(forumState.selectedPostId)}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      await openForumPost(forumState.selectedPostId);
    } catch (error) { alert(error.message === 'not_found' ? 'This post is not available for comments.' : 'Could not add the comment.'); }
  }

  if (event.target?.id === 'forumComposer') {
    event.preventDefault();
    const title = document.querySelector('#forumPostTitle')?.value.trim();
    const body = document.querySelector('#forumPostBody')?.value.trim();
    const kind = document.querySelector('#forumPostKind')?.value || 'community';
    const status = document.querySelector('#forumComposerStatus');
    const button = document.querySelector('#forumPublish');
    if (!title || !body) return;
    if (button) button.disabled = true;
    if (status) status.textContent = 'Publishing…';
    try {
      await forumCreatePost({ title, body, kind, published: true, ...(forumSelectedImage ? { image: forumSelectedImage } : {}) });
      forumSelectedImage = null;
    } catch (error) {
      if (status) status.textContent = error.message === 'tier2_required' ? 'Active community membership is required.' : error.message === 'bad_image' ? 'The selected image is invalid or too large.' : 'Could not publish the post.';
      if (button) button.disabled = false;
    }
  }
});