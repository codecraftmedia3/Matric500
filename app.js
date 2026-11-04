'use strict';
/* Matric500 — roadmap app. Data comes from window.ROADMAP_DATA (set by index.html). */
const SUBJECTS = window.ROADMAP_DATA.subjects;
const ME = window.ROADMAP_DATA.user;           // null when signed out
const GOOGLE_CLIENT_ID = window.ROADMAP_DATA.googleClientId;
const ADMIN_LOGIN = !!window.ROADMAP_DATA.adminLogin;
const IS_ADMIN = !!(ME && ME.role === 'admin');

/* Grade tiers: warm yellow (G9) -> deep ruby (G12). c = lines/borders, t = accent text, f/k = badge fill/ink */
const TIERS = {
  9:  { c:'#7FA61F', t:'#4F6B0A', f:'#C8F25A', k:'#0F2A23', n:'Foundation' },
  10: { c:'#2F9E7A', t:'#12634A', f:'#8EDCC0', k:'#0F2A23', n:'Building' },
  11: { c:'#E0643F', t:'#B2391A', f:'#FFB59E', k:'#0F2A23', n:'Advancing' },
  12: { c:'#0F2A23', t:'#0F2A23', f:'#0F2A23', k:'#C8F25A', n:'Mastery' },
};

/* ---------- storage (localStorage, always guarded) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
let progress = ME ? ME.progress : store.get('m500_progress', {});
let profile  = store.get('m500_profile', {});
let loginHandled = !!ME || store.get('m500_login_done', false);
let toured = store.get('m500_tour_done', false);

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const status = (id) => progress[id] || '';
const cls = (id) => ({ done:'is-done', challenging:'is-hard' }[status(id)] || '');

/* Flat index of every node so click handlers only need an id */
const INDEX = {};
for (const [key, s] of Object.entries(SUBJECTS)) for (const g of s.grades) for (const c of g.chapters) for (const t of c.topics) {
  INDEX[t.topic_id] = { title:t.topic_title, exp:t.explanation, kind:'Topic', grade:g.grade, subject:s.name, key };
  for (const sub of t.subtopics || []) INDEX[sub.subtopic_id] = { title:sub.subtopic_title, exp:sub.explanation, kind:'Subtopic', grade:g.grade, subject:s.name, key };
}
const idsOf = (key, grade) => Object.keys(INDEX).filter((i) => INDEX[i].key === key && (grade == null || INDEX[i].grade === grade));
const count = (ids) => ({ total: ids.length, done: ids.filter((i) => status(i) === 'done').length });
const pct = ({ total, done }) => (total ? Math.round((done / total) * 100) : 0);

const API_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };
let syncTimer;
function syncProgress() {                       // signed-in users: debounce-save to the server
  if (!ME) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => fetch('/api/progress', { method: 'PUT', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ progress }) }).catch(() => {}), 600);
}
let current = null;
const openChapters = new Set();

/* ---------- views ---------- */
function show(view) {
  for (const v of ['home', 'subject', 'dash']) $('view-' + v).classList.toggle('hidden', v !== view);
  $('helpBtn').classList.toggle('hidden', view !== 'subject');
  window.scrollTo({ top: 0 });
}
function goHome() { renderHome(); show('home'); }
function goDash() { renderDash(); show('dash'); }
function openSubject(key) {
  current = key;
  const grades = SUBJECTS[key].grades;
  for (const g of grades) { const c = g.chapters[0]; if (c) openChapters.add(c.chapter_id); }
  renderSubject();
  show('subject');
  if (loginHandled && !toured) startTour();
}

/* ---------- home ---------- */
function bar(p, color, h = 'h-2') {
  return `<div class="${h} overflow-hidden rounded-full bg-bg"><div class="${h} rounded-full" style="width:${p}%;background:${color}"></div></div>`;
}
const TILES = [
  { bg:'#E4F5B8', fg:'#0F2A23', track:'rgba(15,42,35,.18)', fill:'#0F2A23', ring:'' },
  { bg:'#0F2A23', fg:'#FFFFFF', track:'#2B4F44', fill:'#C8F25A', ring:'' },
  { bg:'#FFD9CE', fg:'#0F2A23', track:'rgba(15,42,35,.18)', fill:'#0F2A23', ring:'' },
  { bg:'#FFFFFF', fg:'#0F2A23', track:'#DDE2D8', fill:'#1F6B4F', ring:'border:1px solid #DDE2D8;' },
];
const ARROW = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

function renderHeroPanel() {
  const all = count(Object.keys(INDEX));
  const p = pct(all);
  const hard = Object.keys(INDEX).filter((i) => status(i) === 'challenging').length;
  const name = profile.name || (ME && ME.name) || '';
  const keys = Object.keys(SUBJECTS);
  const started = keys.find((k) => { const c = count(idsOf(k)); return c.done > 0 && c.done < c.total; });
  const target = started || keys[0];
  const verb = started ? 'Continue' : 'Start';
  const C = 2 * Math.PI * 26, dash = (p / 100) * C;
  const guest = !ME ? `<div class="rounded-2xl bg-[#17382F] p-4 text-sm text-[#D4E3DC]">Guest mode: progress is saved on this device. <button data-signin class="font-bold text-volt underline">Sign in</button> to keep it across devices.</div>` : '';
  $('heroPanel').innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div><p class="text-xs font-bold uppercase tracking-widest text-[#A9C2B8]">My progress</p>
      <p class="font-display text-2xl font-bold tracking-tight">Welcome back${name ? ', ' + esc(name) : ''}</p></div>
      <span class="rounded-full bg-coral px-4 py-2 text-sm font-bold text-ink">${hard} to revisit</span>
    </div>
    <div class="mt-4 flex items-center gap-5 rounded-3xl bg-[#17382F] p-5">
      <svg width="88" height="88" viewBox="0 0 64 64" aria-hidden="true" class="shrink-0"><circle cx="32" cy="32" r="26" fill="none" stroke="#2B4F44" stroke-width="8"/><circle cx="32" cy="32" r="26" fill="none" stroke="#C8F25A" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="Figtree,sans-serif">${p}%</text></svg>
      <div class="min-w-0"><p class="text-sm font-semibold text-[#A9C2B8]">Overall</p>
      <p class="font-display text-xl font-bold leading-tight">${all.done} of ${all.total} topics done</p>
      <div class="mt-3" role="progressbar" aria-label="Overall progress" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">${bar(p, '#C8F25A').replace('bg-bg', 'bg-[#2B4F44]')}</div></div>
    </div>
    <button data-subject="${target}" class="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-volt px-4 py-3 text-base font-bold text-ink hover:opacity-90">${verb} ${esc(SUBJECTS[target].name)}</button>
    <div class="mt-4 space-y-3">${guest}</div>`;
}
function renderHome() {
  renderHeroPanel();
  $('tierKey').innerHTML = Object.entries(TIERS).map(([g, t]) =>
    `<span class="rounded-full px-3.5 py-1.5 text-xs font-bold" style="background:${t.f};color:${t.k}">Grade ${g} · ${t.n}</span>`).join('');
  $('subjectGrid').innerHTML = Object.entries(SUBJECTS).map(([key, s], n) => {
    const T = TILES[n % TILES.length];
    const p = pct(count(idsOf(key)));
    const segs = s.grades.map((g) => `<span class="h-1.5 flex-1 rounded-full" style="background:${T.fg};opacity:${0.35 + 0.2 * (g.grade - 9)}" title="Grade ${g.grade}"></span>`).join('');
    return `<button data-subject="${key}" class="group flex min-h-[290px] flex-col justify-between rounded-[28px] p-6 text-left transition hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10" style="background:${T.bg};color:${T.fg};${T.ring}">
      <div class="flex items-start justify-between"><span class="grid h-14 w-14 place-items-center rounded-2xl font-display text-xl font-extrabold" style="background:${T.fg};color:${T.bg}" aria-hidden="true">${esc(s.name.slice(0, 2))}</span>${ARROW}</div>
      <div class="space-y-3">
        <h2 class="font-display text-3xl font-extrabold leading-tight tracking-tight">${esc(s.name)}</h2>
        <p class="text-sm leading-snug" style="opacity:.85">${esc(s.description)}</p>
        <div class="flex gap-1.5" aria-label="Grades covered">${segs}</div>
        <div class="flex items-center gap-3"><div class="h-2 flex-1 overflow-hidden rounded-full" style="background:${T.track}"><div class="h-2 rounded-full" style="width:${p}%;background:${T.fill}"></div></div><span class="text-xs font-bold">${p}%</span></div>
        <p class="text-xs font-bold uppercase tracking-widest" style="opacity:.8">Grades ${s.grades[0].grade}–${s.grades.at(-1).grade} · ${s.grades.reduce((m, g) => m + (g.chapter_count ?? g.chapters.length), 0)} chapters</p>
      </div></button>`;
  }).join('');
}

/* ---------- tree ---------- */
function node(id, title, kind, tier, extra = '') {
  return `<div class="tree-item" style="--c:${tier.c};--k:${tier.k}">
    <div class="flex items-center gap-3 rounded-xl border-2 border-[color:var(--c)] bg-surface px-3 py-2.5 shadow-md shadow-black/10 transition hover:-translate-y-0.5 ${cls(id)}">
      <button data-check="${id}" aria-label="Toggle done: ${esc(title)}" class="chk grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[color:var(--c)] text-xs font-bold"></button>
      <button data-open="${id}" class="min-w-0 flex-1 text-left">
        <span class="block text-[10px] font-bold uppercase tracking-widest" style="color:${tier.t}">${kind}</span>
        <span class="ttl block text-sm font-semibold leading-snug text-ink">${esc(title)}</span>
      </button>
    </div>${extra}</div>`;
}
function renderSubject() {
  const s = SUBJECTS[current];
  const all = count(idsOf(current));
  const grades = s.grades.map((g) => {
    const tier = TIERS[g.grade];
    const gc = count(idsOf(current, g.grade));
    const chapters = g.chapters.map((c, i) => {
      const ids = c.topics.flatMap((t) => [t.topic_id, ...(t.subtopics || []).map((x) => x.subtopic_id)]);
      const cc = count(ids), open = openChapters.has(c.chapter_id);
      const topics = c.topics.map((t) => node(t.topic_id, t.topic_title, 'Topic', tier,
        t.subtopics?.length ? `<div class="branch">${t.subtopics.map((x) => node(x.subtopic_id, x.subtopic_title, 'Subtopic', tier)).join('')}</div>` : '')).join('');
      return `<div class="tree-item" style="--c:${tier.c};--k:${tier.k}">
        <button data-chapter="${c.chapter_id}" aria-expanded="${open}" class="flex w-full items-center gap-3 rounded-xl border-2 border-[color:var(--c)] bg-line px-3 py-3 text-left shadow-lg shadow-black/10">
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

  $('subjectTree').innerHTML = `
    <div class="rounded-2xl border-2 border-purple bg-surface p-5 text-center shadow-xl shadow-black/10">
      <h1 class="font-display text-3xl font-extrabold text-ink">${esc(s.name)}</h1>
      <p class="mx-auto mt-2 max-w-md text-sm text-muted">${esc(s.description)}</p>
      <div class="mx-auto mt-4 flex max-w-sm items-center gap-3">${bar(pct(all), '#0F2A23').replace('class="h-2', 'class="flex-1 h-2')}<span class="text-xs font-bold text-muted">${all.done}/${all.total} · ${pct(all)}%</span></div>
      <div class="mt-4 flex flex-wrap justify-center gap-3 text-[11px] text-muted">
        <span>○ Not started</span><span>✓ Done</span><span class="text-magenta">⚑ Challenging</span>
        <button id="toggleAll" class="font-bold text-cyan underline">Expand / collapse all</button>
      </div>
    </div>
    <div class="branch" style="margin-left:0">${grades}</div>`;
}

/* ---------- node modal ---------- */
let activeId = null;
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
  store.set('m500_progress', progress);
  syncProgress();
  renderSubject();
}
function toggleModal(id, on) {
  const el = $(id);
  el.classList.toggle('hidden', !on);
  el.classList.toggle('flex', on);
  document.body.style.overflow = on ? 'hidden' : '';
}

/* ---------- dashboard ---------- */
function renderDash() {
  $('nameInput').value = profile.name || (ME && ME.name) || '';
  const all = count(Object.keys(INDEX));
  $('overall').innerHTML = `<div class="mb-1 flex justify-between text-xs text-muted"><span>${all.done}/${all.total} nodes</span><span>${pct(all)}%</span></div>${bar(pct(all), '#1F6B4F', 'h-3')}`;
  $('gradeStats').innerHTML = Object.entries(SUBJECTS).flatMap(([key, s]) => s.grades.map((g) => {
    const c = count(idsOf(key, g.grade)), t = TIERS[g.grade];
    return `<div><div class="mb-1 flex justify-between text-xs"><span class="font-bold" style="color:${t.t}">${esc(s.name)} · G${g.grade}</span><span class="text-muted">${c.done}/${c.total}</span></div>${bar(pct(c), t.c)}</div>`;
  })).join('');
  const hard = Object.keys(INDEX).filter((i) => status(i) === 'challenging');
  $('hardList').innerHTML = hard.length
    ? hard.map((i) => `<li class="flex items-center justify-between gap-3 py-2 text-sm"><button data-goto="${i}" class="text-left hover:underline">${esc(INDEX[i].title)}</button><span class="shrink-0 rounded px-2 py-0.5 text-[10px] font-bold" style="background:${TIERS[INDEX[i].grade].f};color:${TIERS[INDEX[i].grade].k}">${esc(INDEX[i].subject)} · G${INDEX[i].grade}</span></li>`).join('')
    : '<li class="py-2 text-sm text-muted">Nothing marked challenging yet.</li>';
}

/* ---------- onboarding tour (roadmap page only) ---------- */
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

/* ---------- login (first visit only) ---------- */
function finishLogin(name) {
  if (name) { profile.name = name; store.set('m500_profile', profile); }
  loginHandled = true; store.set('m500_login_done', true);
  toggleModal('loginModal', false);
  if (!$('view-subject').classList.contains('hidden') && !toured) startTour();
}

/* ---------- events (delegated) ---------- */
document.addEventListener('click', (e) => {
  const q = (s) => e.target.closest(s);
  if (q('[data-subject]')) return openSubject(q('[data-subject]').dataset.subject);
  if (q('[data-home]') || q('#brand')) return goHome();
  if (q('#dashBtn') || q('[data-godash]')) return goDash();
  if (q('#signinBtn') || q('[data-signin]')) return toggleModal('loginModal', true);
  if (q('#helpBtn')) return startTour();
  if (q('[data-check]')) { const id = q('[data-check]').dataset.check; return setStatus(id, status(id) === 'done' ? '' : 'done'); }
  if (q('[data-open]')) return openNode(q('[data-open]').dataset.open);
  if (q('[data-goto]')) { const i = INDEX[q('[data-goto]').dataset.goto]; openSubject(i.key); return openNode(q('[data-goto]').dataset.goto); }
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
  if (q('#googleBtn')) return finishLogin('Student');
  if (q('#adminToggle')) return $('adminForm').classList.toggle('hidden');
  if (q('#guestBtn')) return finishLogin();
  if (q('#tourNext')) return step === STEPS.length - 1 ? endTour() : (step++, renderStep());
  if (q('#tourBack')) return (step--, renderStep());
  if (q('#tourSkip')) return endTour();
  if (q('#toTop')) return window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleModal('nodeModal', false); toggleModal('loginModal', false); } });
document.addEventListener('contextmenu', (e) => {
  const b = e.target.closest('[data-open]'); if (!b) return;
  e.preventDefault(); const id = b.dataset.open; setStatus(id, status(id) === 'done' ? '' : 'done');
});
let saveTimer;
$('nameInput').addEventListener('input', (e) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { profile.name = e.target.value; store.set('m500_profile', profile); $('saveNote').textContent = 'Saved'; setTimeout(() => ($('saveNote').textContent = ''), 1000); }, 350);
});

/* Back-to-top: appears after 300px of scroll */
const toTop = $('toTop');
function syncToTop() {
  const on = window.scrollY > 300;
  toTop.classList.toggle('opacity-0', !on);
  toTop.classList.toggle('translate-y-4', !on);
  toTop.classList.toggle('pointer-events-none', !on);
}
window.addEventListener('scroll', syncToTop, { passive: true });

/* ---------- init ---------- */
if (ME) $('signinBtn').classList.add('hidden');
if (IS_ADMIN) $('adminLink').classList.remove('hidden');
renderHome();
syncToTop();
if (!loginHandled) toggleModal('loginModal', true);

/* Google Identity Services. app.js loads after the roadmap fetch, which can be after window "load",
   so do not wait for that event: poll until the Google script is ready (about 10s), then draw the real button. */
function showGsiMsg(t) { const m = $('gsiMsg'); if (m) m.textContent = t; }
function initAuth(tries = 0) {
  $('googleBtn').classList.add('hidden');            // the placeholder button never signs anyone in
  if (!GOOGLE_CLIENT_ID) return showGsiMsg('Sign-in is not set up yet. You can continue as a guest and your progress is saved on this device.');
  if (!window.google || !google.accounts) {
    if (tries < 50) { showGsiMsg('Loading Google sign-in…'); return setTimeout(() => initAuth(tries + 1), 200); }
    return showGsiMsg('Google sign-in could not load. Turn off any ad blocker for this site or try another browser, then refresh.');
  }
  showGsiMsg('');
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: async ({ credential }) => {
    showGsiMsg('Signing you in…');
    try {
      const r = await fetch('/api/auth/google', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ credential }) });
      if (r.ok) { store.set('m500_login_done', true); return location.reload(); }
      showGsiMsg(r.status === 403 ? 'This account has been suspended.' : r.status === 401 ? 'Google rejected the sign-in. Check that GOOGLE_CLIENT_ID on the server matches your Google client.' : 'Sign-in failed (server error). Please try again.');
    } catch { showGsiMsg('Cannot reach the server. Please try again.'); }
  } });
  google.accounts.id.renderButton($('gsiBtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with' });
}
initAuth();

/* Admin sign-in (email + password from server .env) */
if (!ADMIN_LOGIN) $('adminToggle').classList.add('hidden');
$('adminForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('adminErr').textContent = '';
  try {
    const r = await fetch('/api/auth/admin-login', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ email: $('adminEmail').value, password: $('adminPass').value }) });
    if (r.ok) { store.set('m500_login_done', true); location.href = '/admin'; return; }
    $('adminErr').textContent = r.status === 401 ? 'Wrong email or password.' : r.status === 503 ? 'Admin login is not configured on the server.' : 'Sign-in failed. Is the database running?';
  } catch { $('adminErr').textContent = 'Cannot reach the server.'; }
});
