'use strict';
/* Matric500 — roadmap app. Data comes from window.ROADMAP_DATA (js/roadmap-data.js). */
const SUBJECTS = window.ROADMAP_DATA.subjects;
const ME = window.ROADMAP_DATA.user;           // null when signed out
const GOOGLE_CLIENT_ID = window.ROADMAP_DATA.googleClientId;
const ADMIN_LOGIN = !!window.ROADMAP_DATA.adminLogin;
const IS_ADMIN = !!(ME && ME.role === 'admin');

/* Grade tiers: warm yellow (G9) -> deep ruby (G12). c = lines/borders, t = accent text, f/k = badge fill/ink */
const TIERS = {
  9:  { c:'#00F0FF', t:'#00F0FF', f:'#00F0FF', k:'#08050F', n:'Foundation' },
  10: { c:'#B026FF', t:'#B026FF', f:'#B026FF', k:'#F1E9FF', n:'Building' },
  11: { c:'#FF2EC4', t:'#FF2EC4', f:'#FF2EC4', k:'#08050F', n:'Advancing' },
  12: { c:'#F4FF52', t:'#F4FF52', f:'#F4FF52', k:'#08050F', n:'Mastery' },
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
function renderHome() {
  $('tierKey').innerHTML = Object.entries(TIERS).map(([g, t]) =>
    `<span class="rounded-full px-3 py-1 text-xs font-bold" style="background:${t.f};color:${t.k}">Grade ${g} · ${t.n}</span>`).join('');
  $('subjectGrid').innerHTML = Object.entries(SUBJECTS).map(([key, s]) => {
    const p = pct(count(idsOf(key)));
    const chips = s.grades.map((g) => `<span class="h-2.5 flex-1 rounded-full" style="background:${TIERS[g.grade].c}" title="Grade ${g.grade}"></span>`).join('');
    return `<button data-subject="${key}" class="group rounded-2xl border-2 border-line bg-surface p-5 text-left shadow-lg shadow-black/40 transition hover:-translate-y-1 hover:border-cyan">
      <h2 class="font-display text-lg font-bold uppercase text-ink">${esc(s.name)}</h2>
      <p class="mt-1 min-h-[2.75rem] text-sm text-muted/80">${esc(s.description)}</p>
      <div class="mt-3 flex gap-1" aria-label="Grades covered">${chips}</div>
      <div class="mt-3 flex items-center gap-3">${bar(p, '#00F0FF').replace('class="h-2', 'class="flex-1 h-2')}<span class="text-xs font-bold text-muted">${p}%</span></div>
      <p class="mt-2 text-[11px] uppercase tracking-widest text-cyan">Grades ${s.grades[0].grade}–${s.grades.at(-1).grade} · ${s.grades.reduce((n, g) => n + (g.chapter_count ?? g.chapters.length), 0)} chapters</p>
    </button>`;
  }).join('');
}

/* ---------- tree ---------- */
function node(id, title, kind, tier, extra = '') {
  return `<div class="tree-item" style="--c:${tier.c}">
    <div class="flex items-center gap-3 rounded-xl border-2 border-[color:var(--c)] bg-surface px-3 py-2.5 shadow-md shadow-black/40 transition hover:-translate-y-0.5 ${cls(id)}">
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
      return `<div class="tree-item" style="--c:${tier.c}">
        <button data-chapter="${c.chapter_id}" aria-expanded="${open}" class="flex w-full items-center gap-3 rounded-xl border-2 border-[color:var(--c)] bg-line px-3 py-3 text-left shadow-lg shadow-black/50">
          <span class="chev text-sm" style="color:${tier.t}">▶</span>
          <span class="min-w-0 flex-1"><span class="block text-[10px] font-bold uppercase tracking-widest" style="color:${tier.t}">Chapter ${i + 1}</span><span class="block font-display text-sm font-bold leading-snug text-ink">${esc(c.chapter_title)}</span></span>
          <span class="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-bold" style="color:${tier.t}">${cc.done}/${cc.total}</span>
        </button>
        <div class="branch ${open ? '' : 'hidden'}">${topics}</div></div>`;
    }).join('');
    return `<div class="tree-item" style="--c:${tier.c}">
      <div class="rounded-2xl border-2 border-[color:var(--c)] p-4 shadow-xl shadow-black/50" style="background:${tier.f}">
        <p class="text-[10px] font-bold uppercase tracking-widest" style="color:${tier.k}">${tier.n}</p>
        <div class="flex items-center justify-between gap-3"><h2 class="font-display text-2xl font-extrabold" style="color:${tier.k}">Grade ${g.grade}</h2><span class="text-xs font-bold" style="color:${tier.k}">${gc.done}/${gc.total} · ${pct(gc)}%</span></div>
      </div>
      <div class="branch">${chapters}</div></div>`;
  }).join('');

  $('subjectTree').innerHTML = `
    <div class="rounded-2xl border-2 border-purple bg-surface p-5 text-center shadow-xl shadow-black/50">
      <h1 class="font-display text-3xl font-extrabold uppercase text-ink">${esc(s.name)}</h1>
      <p class="mx-auto mt-2 max-w-md text-sm text-muted/85">${esc(s.description)}</p>
      <div class="mx-auto mt-4 flex max-w-sm items-center gap-3">${bar(pct(all), '#B026FF').replace('class="h-2', 'class="flex-1 h-2')}<span class="text-xs font-bold text-muted">${all.done}/${all.total} · ${pct(all)}%</span></div>
      <div class="mt-4 flex flex-wrap justify-center gap-3 text-[11px] text-muted/80">
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
  $('overall').innerHTML = `<div class="mb-1 flex justify-between text-xs text-muted"><span>${all.done}/${all.total} nodes</span><span>${pct(all)}%</span></div>${bar(pct(all), '#00F0FF', 'h-3')}`;
  $('gradeStats').innerHTML = Object.entries(SUBJECTS).flatMap(([key, s]) => s.grades.map((g) => {
    const c = count(idsOf(key, g.grade)), t = TIERS[g.grade];
    return `<div><div class="mb-1 flex justify-between text-xs"><span class="font-bold" style="color:${t.t}">${esc(s.name)} · G${g.grade}</span><span class="text-muted/80">${c.done}/${c.total}</span></div>${bar(pct(c), t.c)}</div>`;
  })).join('');
  const hard = Object.keys(INDEX).filter((i) => status(i) === 'challenging');
  $('hardList').innerHTML = hard.length
    ? hard.map((i) => `<li class="flex items-center justify-between gap-3 py-2 text-sm"><button data-goto="${i}" class="text-left hover:underline">${esc(INDEX[i].title)}</button><span class="shrink-0 rounded px-2 py-0.5 text-[10px] font-bold" style="background:${TIERS[INDEX[i].grade].f};color:${TIERS[INDEX[i].grade].k}">${esc(INDEX[i].subject)} · G${INDEX[i].grade}</span></li>`).join('')
    : '<li class="py-2 text-sm text-muted/70">Nothing marked challenging yet.</li>';
}

/* ---------- onboarding tour (roadmap page only) ---------- */
const STEPS = [
  { i:'🌳', t:'Follow the tree', d:'Your subject is the root. Each grade is a branch, each chapter a sub-branch. Tap a chapter card to open or close its topics, or use “Expand / collapse all”.' },
  { i:'🎨', t:'Read the colours', d:'Grade 9 glows yellow, Grade 10 honey-orange, Grade 11 red-orange and Grade 12 deep ruby, so you always know which level you are on.' },
  { i:'✅', t:'Track your progress', d:'Tap the circle on any card to mark it done. Open a card to set it as ✓ Done, Not started or ⚑ Challenging. Dashed red cards are the ones to revisit.' },
  { i:'📖', t:'Read milestones', d:'Tap a card’s title to read a short explanation. Counters on each chapter and grade show how far you have come.' },
];
let step = 0;
function startTour() { step = 0; renderStep(); toggleModal('tourModal', true); }
function endTour() { toured = true; store.set('m500_tour_done', true); toggleModal('tourModal', false); }
function renderStep() {
  const s = STEPS[step];
  $('tourStep').textContent = `Step ${step + 1} of ${STEPS.length}`;
  $('tourIcon').textContent = s.i; $('tourTitle').textContent = s.t; $('tourText').textContent = s.d;
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
  if (q('#dashBtn')) return goDash();
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleModal('nodeModal', false); });
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
renderHome();
syncToTop();
if (!loginHandled) toggleModal('loginModal', true);

/* Google Identity Services: swaps the mock button for the real one when a client id is configured */
function initAuth() {
  if (!GOOGLE_CLIENT_ID || !window.google || !google.accounts) return;
  $('googleBtn').classList.add('hidden');
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: async ({ credential }) => {
    const r = await fetch('/api/auth/google', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ credential }) });
    if (r.ok) { store.set('m500_login_done', true); location.reload(); }
    else alert(r.status === 403 ? 'This account has been suspended.' : 'Sign-in failed. Please try again.');
  } });
  google.accounts.id.renderButton($('gsiBtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with' });
}
window.addEventListener('load', initAuth);

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
