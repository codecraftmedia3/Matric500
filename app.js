'use strict';

const SUBJECTS = window.ROADMAP_DATA.subjects;
const ME = window.ROADMAP_DATA.user;
const IS_ADMIN = !!(ME && ME.role === 'admin');
const TELEGRAM_URL = 'https://t.me/matricEthio';
const TIERS = {
  9: { c:'#7FA61F', t:'#4F6B0A', f:'#C8F25A', k:'#0F2A23', n:'Foundation' },
  10: { c:'#2F9E7A', t:'#12634A', f:'#8EDCC0', k:'#0F2A23', n:'Building' },
  11: { c:'#E0643F', t:'#B2391A', f:'#FFB59E', k:'#0F2A23', n:'Advancing' },
  12: { c:'#0F2A23', t:'#0F2A23', f:'#0F2A23', k:'#C8F25A', n:'Mastery' },
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be unavailable */ } },
};
const API_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };
const progress = ME ? (ME.progress || {}) : store.get('m500_progress', {});
const profile = ME
  ? { ...(ME.profile || {}), name: (ME.profile && ME.profile.name) || ME.name || '' }
  : store.get('m500_profile', {});
let profileSaved = !!(profile.name && profile.grade && profile.school && profile.stream);
let editingProfile = !profileSaved;
let current = null;
let activeId = null;
let tourStep = 0;
let toured = store.get('m500_tour_done', false);
let newsCursor = null;
let newsRequest = 0;
let syncTimer;
const openChapters = new Set();
const INDEX = {};

for (const [key, subject] of Object.entries(SUBJECTS)) {
  for (const grade of subject.grades || []) {
    for (const chapter of grade.chapters || []) {
      for (const topic of chapter.topics || []) {
        INDEX[topic.topic_id] = { title:topic.topic_title, exp:topic.explanation, kind:'Topic', grade:grade.grade, subject:subject.name, key };
        for (const sub of topic.subtopics || []) {
          INDEX[sub.subtopic_id] = { title:sub.subtopic_title, exp:sub.explanation, kind:'Subtopic', grade:grade.grade, subject:subject.name, key };
        }
      }
    }
  }
}

const visibleSubjects = () => SUBJECTS;
const idsOf = (key, grade) => Object.keys(INDEX).filter((id) => INDEX[id].key === key && (grade == null || INDEX[id].grade === grade));
const status = (id) => progress[id] || '';
const count = (ids) => ({ total:ids.length, done:ids.filter((id) => status(id) === 'done').length });
const pct = ({ total, done }) => total ? Math.round((done / total) * 100) : 0;
const allVisibleIds = () => Object.keys(INDEX);
const bar = (value, color, height = 'h-2') => `<div class="${height} overflow-hidden rounded-full bg-bg"><div class="${height} rounded-full" style="width:${value}%;background:${color}"></div></div>`;
const ARROW = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const TELEGRAM_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>';

function syncProgress() {
  if (!ME) {
    store.set('m500_progress', progress);
    return;
  }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    fetch('/api/progress', { method:'PUT', credentials:'same-origin', headers:API_HEADERS, body:JSON.stringify({ progress }) })
      .then((r) => { if (!r.ok) throw new Error('progress_save_failed'); })
      .catch(() => { /* Keep the local progress cache; it will be retried on the next change. */ });
  }, 600);
}

function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${esc(name.trim().split(/\s+/)[0])}` : part;
}

function renderHome() {
  const ids = allVisibleIds();
  const overall = count(ids);
  const percent = pct(overall);
  const hard = ids.filter((id) => status(id) === 'challenging').length;
  const keys = Object.keys(visibleSubjects());
  const started = keys.find((key) => {
    const subjectCount = count(idsOf(key));
    return subjectCount.done > 0 && subjectCount.done < subjectCount.total;
  });
  const target = started || keys[0];
  const field = profile.stream === 'natural' ? 'Natural Science' : profile.stream === 'social' ? 'Social Science' : '';
  const chips = [
    profile.grade ? `Grade ${esc(profile.grade)}` : '',
    field ? esc(field) : '',
    profile.school ? esc(profile.school) : '',
  ].filter(Boolean);
  const circumference = 2 * Math.PI * 26;
  const name = profile.name || ME.name || '';
  $('view-home').innerHTML = `
    <div class="space-y-6">
      <section class="rounded-[28px] bg-ink p-5 text-white shadow-xl sm:p-7">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div><p class="text-xs font-bold uppercase tracking-widest text-[#A9C2B8]">Your study space</p>
            <h1 class="mt-1 font-display text-3xl font-extrabold tracking-tight">${greeting(name)}</h1>
            ${chips.length ? `<div class="mt-3 flex flex-wrap gap-2">${chips.map((chip) => `<span class="rounded-full bg-[#24463D] px-3 py-1.5 text-xs font-bold text-white">${chip}</span>`).join('')}</div>` : ''}
          </div>
          <span class="rounded-full bg-coral px-4 py-2 text-sm font-bold text-ink">${hard} to revisit</span>
        </div>
        <div class="mt-5 flex items-center gap-5 rounded-3xl bg-[#17382F] p-4 sm:p-5">
          <svg width="88" height="88" viewBox="0 0 64 64" aria-hidden="true" class="shrink-0">
            <circle cx="32" cy="32" r="26" fill="none" stroke="#2B4F44" stroke-width="8"/>
            <circle cx="32" cy="32" r="26" fill="none" stroke="#C8F25A" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(percent / 100 * circumference).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 32 32)"/>
            <text x="32" y="37" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="Figtree,sans-serif">${percent}%</text>
          </svg>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-[#A9C2B8]">Overall progress</p>
            <p class="font-display text-xl font-bold leading-tight">${overall.done} of ${overall.total} topics done</p>
            <div class="mt-3" role="progressbar" aria-label="Overall progress" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">${bar(percent, '#C8F25A').replace('bg-bg', 'bg-[#2B4F44]')}</div>
          </div>
        </div>
        ${target ? `<a href="#/roadmap/${encodeURIComponent(target)}" class="mt-4 flex min-h-[52px] items-center justify-center rounded-2xl bg-volt px-4 py-3 text-base font-bold text-ink hover:opacity-90">${started ? 'Continue' : 'Start'} ${esc(SUBJECTS[target].name)}</a>` : '<p class="mt-4 rounded-2xl bg-[#17382F] p-4 text-sm text-white">Your roadmap subjects will appear here.</p>'}
      </section>

      <section aria-label="Quick links" class="grid gap-4 sm:grid-cols-2">
        <a href="#/roadmap" class="group flex min-h-[145px] items-center justify-between rounded-[28px] bg-[#E4F5B8] p-5 text-ink transition hover:-translate-y-1 hover:shadow-lg sm:p-6">
          <span><span class="block text-xs font-bold uppercase tracking-widest">Study plan</span><strong class="mt-2 block font-display text-2xl font-extrabold">Roadmap</strong><span class="mt-1 block text-sm">${keys.length} ${keys.length === 1 ? 'subject' : 'subjects'}</span></span>${ARROW}
        </a>
        <a href="#/exams" class="group flex min-h-[145px] items-center justify-between rounded-[28px] bg-surface p-5 text-ink shadow-sm ring-1 ring-line transition hover:-translate-y-1 hover:shadow-lg sm:p-6">
          <span><span class="block text-xs font-bold uppercase tracking-widest text-muted">Practice</span><strong class="mt-2 block font-display text-2xl font-extrabold">Exams</strong><span class="mt-2 inline-flex rounded-full bg-coral/30 px-3 py-1 text-xs font-bold">Coming soon</span></span>${ARROW}
        </a>
      </section>

      <a href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer" class="flex min-h-[96px] flex-wrap items-center justify-between gap-4 rounded-[28px] bg-volt p-5 text-ink sm:p-6">
        <span class="flex items-center gap-4"><span class="grid h-12 w-12 place-items-center rounded-2xl bg-ink text-volt" aria-hidden="true">${TELEGRAM_ICON}</span>
          <span><b class="block font-display text-xl font-extrabold tracking-tight">Join our Telegram channel</b><span class="text-sm">Get updates, tips and announcements.</span></span>
        </span><span class="inline-flex min-h-[44px] items-center rounded-full bg-ink px-5 text-sm font-bold text-white">Open Telegram</span>
      </a>

      <section>
        <div class="mb-4 flex items-end justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-widest text-muted">Updates</p><h2 class="font-display text-2xl font-extrabold tracking-tight">Latest news</h2></div></div>
        <div id="newsList" class="space-y-4"><div class="animate-pulse rounded-[28px] border border-line bg-surface p-6"><div class="h-4 w-28 rounded bg-line"></div><div class="mt-4 h-6 w-2/3 rounded bg-line"></div><div class="mt-3 h-4 rounded bg-line"></div></div></div>
        <button id="newsMore" type="button" class="mx-auto mt-4 hidden min-h-[44px] rounded-full border-2 border-ink px-6 text-sm font-bold hover:bg-ink hover:text-white">Load more</button>
      </section>
      <footer class="pb-2 text-center text-sm text-muted"><a href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer" class="font-bold underline">Telegram</a></footer>
    </div>`;
  loadNews(false);
}

async function loadNews(more) {
  const list = $('newsList');
  if (!list) return;
  const requestId = ++newsRequest;
  if (more) $('newsMore').disabled = true;
  else {
    newsCursor = null;
    list.innerHTML = '<div class="animate-pulse rounded-[28px] border border-line bg-surface p-6"><div class="h-4 w-28 rounded bg-line"></div><div class="mt-4 h-6 w-2/3 rounded bg-line"></div><div class="mt-3 h-4 rounded bg-line"></div></div>';
  }
  try {
    const query = new URLSearchParams({ limit:'10' });
    if (more && newsCursor) query.set('before', newsCursor);
    const response = await fetch(`/api/news?${query}`, { credentials:'same-origin' });
    if (!response.ok) throw new Error('news_load_failed');
    const data = await response.json();
    if (requestId !== newsRequest || !$('newsList')) return;
    newsCursor = data.nextBefore;
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const html = posts.map((post) => `
      <article class="overflow-hidden rounded-[28px] border border-line bg-surface">
        ${post.hasImage ? `<img src="/api/news/${encodeURIComponent(post.id)}/image" alt="" loading="lazy" decoding="async" class="aspect-[16/9] w-full object-cover">` : ''}
        <div class="p-5 sm:p-6">        <p class="text-xs font-bold uppercase tracking-widest text-muted">${esc(new Intl.DateTimeFormat(undefined, { dateStyle:'medium' }).format(new Date(post.createdAt)))}${post.authorName ? ` · ${esc(post.authorName)}` : ''}</p>
          <h3 class="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight">${esc(post.title)}</h3>
          <p class="mt-2 whitespace-pre-line text-base leading-relaxed text-muted">${esc(post.body)}</p>
        </div>
      </article>`).join('');
    if (more) list.insertAdjacentHTML('beforeend', html);
    else list.innerHTML = html || '<p class="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">No news yet. Check back soon.</p>';
    $('newsMore').classList.toggle('hidden', !newsCursor);
  } catch {
    if (requestId === newsRequest && $('newsList')) {
      const error = '<p class="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">Could not load news. Please try again later.</p>';
      if (more) list.insertAdjacentHTML('beforeend', error);
      else list.innerHTML = error;
      $('newsMore').classList.add('hidden');
    }
  } finally {
    if ($('newsMore')) $('newsMore').disabled = false;
  }
}

const TILES = [
  { bg:'#E4F5B8', fg:'#0F2A23', track:'rgba(15,42,35,.18)', fill:'#0F2A23', ring:'' },
  { bg:'#0F2A23', fg:'#FFFFFF', track:'#2B4F44', fill:'#C8F25A', ring:'' },
  { bg:'#FFD9CE', fg:'#0F2A23', track:'rgba(15,42,35,.18)', fill:'#0F2A23', ring:'' },
  { bg:'#FFFFFF', fg:'#0F2A23', track:'#DDE2D8', fill:'#1F6B4F', ring:'border:1px solid #DDE2D8;' },
];

function subjectCards() {
  return Object.entries(visibleSubjects()).map(([key, subject], index) => {
    const tile = TILES[index % TILES.length];
    const percent = pct(count(idsOf(key)));
    const grades = subject.grades || [];
    const segments = grades.map((grade) => `<span class="h-1.5 flex-1 rounded-full" style="background:${tile.fg};opacity:${0.35 + 0.2 * (grade.grade - 9)}" title="Grade ${grade.grade}"></span>`).join('');
    const chapterCount = grades.reduce((sum, grade) => sum + (grade.chapter_count ?? grade.chapters.length), 0);
    return `<a href="#/roadmap/${encodeURIComponent(key)}" class="group flex min-h-[290px] flex-col justify-between rounded-[28px] p-6 text-left transition hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10" style="background:${tile.bg};color:${tile.fg};${tile.ring}">
      <div class="flex items-start justify-between"><span class="grid h-14 w-14 place-items-center rounded-2xl font-display text-xl font-extrabold" style="background:${tile.fg};color:${tile.bg}" aria-hidden="true">${esc(subject.name.slice(0, 2))}</span>${ARROW}</div>
      <div class="space-y-3"><h2 class="font-display text-3xl font-extrabold leading-tight tracking-tight">${esc(subject.name)}</h2>
        <p class="text-sm leading-snug" style="opacity:.85">${esc(subject.description)}</p><div class="flex gap-1.5" aria-label="Grades covered">${segments}</div>
        <div class="flex items-center gap-3"><div class="h-2 flex-1 overflow-hidden rounded-full" style="background:${tile.track}"><div class="h-2 rounded-full" style="width:${percent}%;background:${tile.fill}"></div></div><span class="text-xs font-bold">${percent}%</span></div>
        <p class="text-xs font-bold uppercase tracking-widest" style="opacity:.8">Grades ${grades[0]?.grade ?? ''}–${grades.at(-1)?.grade ?? ''} · ${chapterCount} chapters</p>
      </div></a>`;
  }).join('');
}

function renderRoadmap() {
  const keys = Object.keys(visibleSubjects());
  $('view-roadmap').innerHTML = `<div class="space-y-6">
    <div><p class="text-xs font-bold uppercase tracking-widest text-muted">Your study plan</p><h1 class="font-display text-3xl font-extrabold tracking-tight">Roadmap</h1><p class="mt-2 text-muted">Choose a subject to explore its grades, chapters, and topics.</p></div>
    ${keys.length ? `<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">${subjectCards()}</div>` : '<p class="rounded-[28px] border border-line bg-surface p-6 text-muted">No subjects are available for this profile yet. Update your field of study in Profile.</p>'}
  </div>`;
}

function renderExams() {
  $('view-exams').innerHTML = `<div class="mx-auto flex min-h-[55vh] max-w-lg items-center justify-center">
    <section class="w-full rounded-[28px] border border-line bg-surface p-7 text-center shadow-sm sm:p-10">
      <span class="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-volt text-ink" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h6"/></svg></span>
      <span class="mt-5 inline-flex rounded-full bg-coral/30 px-3 py-1 text-xs font-bold">Coming soon</span>
      <h1 class="mt-3 font-display text-3xl font-extrabold tracking-tight">Exams are coming soon</h1>
      <p class="mt-3 leading-relaxed text-muted">Practice papers and timed exams will appear here.</p>
      <a href="#/roadmap" class="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-ink px-6 font-bold text-white hover:bg-cyan">Explore the roadmap</a>
    </section>
  </div>`;
}

function renderProfile() {
  const all = count(allVisibleIds());
  const gradeStats = Object.entries(visibleSubjects()).flatMap(([key, subject]) => (subject.grades || []).map((grade) => {
    const c = count(idsOf(key, grade.grade));
    const tier = TIERS[grade.grade];
    return `<div><div class="mb-1 flex justify-between gap-2 text-xs"><span class="font-bold" style="color:${tier.t}">${esc(subject.name)} · G${grade.grade}</span><span class="text-muted">${c.done}/${c.total}</span></div>${bar(pct(c), tier.c)}</div>`;
  })).join('');
  const challenging = allVisibleIds().filter((id) => status(id) === 'challenging');
  $('view-profile').innerHTML = `<div class="space-y-6">
    <div><p class="text-xs font-bold uppercase tracking-widest text-muted">Your account</p><h1 class="font-display text-3xl font-extrabold tracking-tight">Profile</h1></div>
    <section class="rounded-[28px] border border-line bg-surface p-5 sm:p-7">
      <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-display text-2xl font-extrabold">Personal details</h2><span class="rounded-full bg-volt px-3 py-1 text-xs font-bold">${profile.stream ? (profile.stream === 'natural' ? 'Natural Science' : 'Social Science') : 'Study field not set'}</span></div>
      <div id="profileRead" class="mt-4 space-y-2 text-sm text-muted"></div>
      <div id="profileEdit" class="mt-4 hidden grid gap-4 sm:grid-cols-2">
        <label class="text-sm font-bold">Full name<input id="nameInput" maxlength="80" autocomplete="name" class="mt-1 min-h-[44px] w-full rounded-xl border border-line bg-bg px-3 font-normal"></label>
        <label class="text-sm font-bold">Grade<select id="gradeInput" class="mt-1 min-h-[44px] w-full rounded-xl border border-line bg-bg px-3 font-normal"><option value="">Select grade</option><option value="9">Grade 9</option><option value="10">Grade 10</option><option value="11">Grade 11</option><option value="12">Grade 12</option></select></label>
        <label class="text-sm font-bold sm:col-span-2">School<input id="schoolInput" maxlength="120" autocomplete="organization" class="mt-1 min-h-[44px] w-full rounded-xl border border-line bg-bg px-3 font-normal"></label>
        <fieldset class="sm:col-span-2"><legend class="text-sm font-bold">Field of study</legend><div class="mt-2 grid gap-3 sm:grid-cols-2">
          <label class="flex min-h-[48px] items-center gap-3 rounded-xl border border-line bg-bg p-3 text-sm"><input type="radio" name="streamInput" value="natural">Natural Science</label>
          <label class="flex min-h-[48px] items-center gap-3 rounded-xl border border-line bg-bg p-3 text-sm"><input type="radio" name="streamInput" value="social">Social Science</label>
        </div></fieldset>
      </div>
      <p id="saveNote" role="status" class="mt-3 text-sm font-semibold text-cyan"></p>
      <div class="mt-4 flex flex-wrap gap-2"><button id="profileSaveBtn" type="button" class="min-h-[44px] rounded-full bg-ink px-5 font-bold text-white hover:bg-cyan">Save</button><button id="profileEditBtn" type="button" class="hidden min-h-[44px] rounded-full bg-ink px-5 font-bold text-white hover:bg-cyan">Edit</button><button id="profileCancelBtn" type="button" class="hidden min-h-[44px] px-3 text-sm font-bold text-muted underline">Cancel</button></div>
    </section>
    <section class="rounded-[28px] border border-line bg-surface p-5 sm:p-7"><h2 class="font-display text-2xl font-extrabold">Progress</h2>
      <div id="overall" class="mt-4"></div><div class="mt-5 grid gap-4 sm:grid-cols-2">${gradeStats}</div>
      <h3 class="mt-6 font-display text-lg font-bold">Topics to revisit</h3><ul class="mt-2 divide-y divide-line">${challenging.length ? challenging.map((id) => `<li class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><button type="button" data-goto="${esc(id)}" class="text-left font-semibold hover:underline">${esc(INDEX[id].title)}</button><span class="rounded-full bg-bg px-3 py-1 text-xs font-bold">${esc(INDEX[id].subject)} · Grade ${INDEX[id].grade}</span></li>`).join('') : '<li class="py-3 text-sm text-muted">Nothing marked challenging yet.</li>'}</ul>
      <a href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer" class="mt-5 inline-flex min-h-[44px] items-center gap-2 font-bold text-cyan underline">${TELEGRAM_ICON} Telegram</a>
    </section>
  </div>`;
  $('overall').innerHTML = `<div class="mb-2 flex justify-between text-sm text-muted"><span>${all.done}/${all.total} topics done</span><span>${pct(all)}%</span></div>${bar(pct(all), '#1F6B4F', 'h-3')}`;
  $('nameInput').value = profile.name || '';
  $('gradeInput').value = profile.grade == null ? '' : String(profile.grade);
  $('schoolInput').value = profile.school || '';
  document.querySelectorAll('input[name="streamInput"]').forEach((input) => { input.checked = input.value === profile.stream; });
  setProfileMode(editingProfile);
}

function setProfileMode(editing, focus = false) {
  $('profileEdit').classList.toggle('hidden', !editing);
  $('profileRead').classList.toggle('hidden', editing);
  $('profileSaveBtn').classList.toggle('hidden', !editing);
  $('profileEditBtn').classList.toggle('hidden', editing);
  $('profileCancelBtn').classList.toggle('hidden', editing || !profileSaved);
  $('profileRead').innerHTML = `<p><strong class="text-ink">Name:</strong> ${esc(profile.name || '-')}</p><p><strong class="text-ink">Grade:</strong> ${esc(profile.grade ?? '-')}</p><p><strong class="text-ink">School:</strong> ${esc(profile.school || '-')}</p><p><strong class="text-ink">Field:</strong> ${profile.stream === 'natural' ? 'Natural Science' : profile.stream === 'social' ? 'Social Science' : '-'}</p>`;
  if (focus && editing) $('nameInput').focus();
  if (focus && !editing) $('profileEditBtn').focus();
}

async function saveProfile() {
  const previousStream = profile.stream;
  const name = $('nameInput').value.trim();
  const gradeValue = $('gradeInput').value;
  const school = $('schoolInput').value.trim();
  const stream = document.querySelector('input[name="streamInput"]:checked')?.value || null;
  const grade = gradeValue ? Number(gradeValue) : null;
  const note = $('saveNote');
  const button = $('profileSaveBtn');
  if (name.length < 1 || name.length > 80 || ![9, 10, 11, 12].includes(grade) || school.length < 1 || school.length > 120 || !['natural', 'social'].includes(stream)) {
    note.textContent = 'Enter a name, grade, school, and field of study.';
    return;
  }
  const updated = { name, grade, school, stream };
  button.disabled = true;
  note.textContent = '';
  try {
    if (ME) {
      const response = await fetch('/api/profile', { method:'PUT', credentials:'same-origin', headers:API_HEADERS, body:JSON.stringify(updated) });
      if (!response.ok) throw new Error('profile_save_failed');
    }
    Object.assign(profile, updated);
    profileSaved = true;
    if (ME) {
      ME.name = name;
      ME.profile = updated;
      ME.profileComplete = true;
    } else store.set('m500_profile', updated);
    if (ME && previousStream !== stream) return location.reload();
    editingProfile = false;
    renderProfile();
    $('saveNote').textContent = 'Saved';
  } catch {
    note.textContent = 'Could not save your profile. Please try again.';
  } finally {
    if ($('profileSaveBtn')) $('profileSaveBtn').disabled = false;
  }
}

function renderSubject() {
  const subject = SUBJECTS[current];
  if (!subject) return;
  const all = count(idsOf(current));
  const grades = subject.grades.map((grade) => {
    const tier = TIERS[grade.grade];
    const gradeCount = count(idsOf(current, grade.grade));
    const chapters = grade.chapters.map((chapter, index) => {
      const ids = chapter.topics.flatMap((topic) => [topic.topic_id, ...(topic.subtopics || []).map((sub) => sub.subtopic_id)]);
      const chapterCount = count(ids);
      const opened = openChapters.has(chapter.chapter_id);
      const topics = chapter.topics.map((topic) => renderNode(topic.topic_id, topic.topic_title, 'Topic', tier,
        topic.subtopics?.length ? `<div class="branch">${topic.subtopics.map((sub) => renderNode(sub.subtopic_id, sub.subtopic_title, 'Subtopic', tier)).join('')}</div>` : '')).join('');
      return `<div class="tree-item">
        <button type="button" data-chapter="${esc(chapter.chapter_id)}" aria-expanded="${opened}" class="flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 border-[color:var(--c)] bg-line px-3 py-3 text-left shadow-lg shadow-black/10" style="--c:${tier.c}">
          <span class="text-sm" aria-hidden="true">${opened ? '▼' : '▶'}</span><span class="min-w-0 flex-1"><span class="block text-[10px] font-bold uppercase tracking-widest" style="color:${tier.t}">Chapter ${index + 1}</span><span class="block font-display text-sm font-bold leading-snug text-ink">${esc(chapter.chapter_title)}</span></span>
          <span class="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-bold" style="color:${tier.t}">${chapterCount.done}/${chapterCount.total}</span>
        </button><div class="branch ${opened ? '' : 'hidden'}">${topics}</div>
      </div>`;
    }).join('');
    return `<section class="tree-item"><div class="rounded-2xl border-2 p-4 shadow-xl shadow-black/10" style="background:${tier.f};border-color:${tier.c}">
      <p class="text-[10px] font-bold uppercase tracking-widest" style="color:${tier.k}">${tier.n}</p><div class="flex items-center justify-between gap-3"><h2 class="font-display text-2xl font-extrabold" style="color:${tier.k}">Grade ${grade.grade}</h2><span class="text-xs font-bold" style="color:${tier.k}">${gradeCount.done}/${gradeCount.total} · ${pct(gradeCount)}%</span></div>
      </div><div class="branch">${chapters}</div></section>`;
  }).join('');
  $('subjectTree').innerHTML = `<section class="rounded-[28px] border border-line bg-surface p-5 text-center shadow-sm">
    <p class="text-xs font-bold uppercase tracking-widest text-muted">Roadmap subject</p><h1 class="mt-1 font-display text-3xl font-extrabold text-ink">${esc(subject.name)}</h1>
    <p class="mx-auto mt-2 max-w-md text-sm text-muted">${esc(subject.description)}</p>
    <div class="mx-auto mt-4 flex max-w-sm items-center gap-3">${bar(pct(all), '#0F2A23').replace('class="h-2', 'class="flex-1 h-2')}<span class="text-xs font-bold text-muted">${all.done}/${all.total} · ${pct(all)}%</span></div>
    <div class="mt-4 flex flex-wrap justify-center gap-3 text-[11px] text-muted"><span>Not started</span><span>Done</span><span>Challenging</span><button id="toggleAll" type="button" class="font-bold text-cyan underline">Expand / collapse all</button></div>
  </section><div class="branch" style="margin-left:0">${grades}</div>`;
}

function renderNode(id, title, kind, tier, extra = '') {
  const stateClass = status(id) === 'done' ? 'is-done' : status(id) === 'challenging' ? 'is-hard' : '';
  const checked = status(id) === 'done';
  return `<div class="tree-item">
    <div class="flex items-center gap-3 rounded-xl border-2 bg-surface px-3 py-2.5 shadow-md shadow-black/10 transition hover:-translate-y-0.5 ${stateClass}" style="border-color:${tier.c}">
      <button type="button" data-check="${esc(id)}" aria-label="${checked ? 'Mark not done' : 'Mark done'}: ${esc(title)}" aria-pressed="${checked}" class="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold" style="border-color:${tier.c};color:${tier.t}">${checked ? '✓' : ''}</button>
      <button type="button" data-open="${esc(id)}" class="min-h-[44px] min-w-0 flex-1 text-left"><span class="block text-[10px] font-bold uppercase tracking-widest" style="color:${tier.t}">${kind}</span><span class="block text-sm font-semibold leading-snug text-ink">${esc(title)}</span></button>
      <button type="button" data-hard="${esc(id)}" aria-label="Mark challenging: ${esc(title)}" class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-coral">!</button>
    </div>${extra}</div>`;
}

function setStatus(id, value) {
  if (value) progress[id] = value;
  else delete progress[id];
  syncProgress();
  if (current) renderSubject();
  if (location.hash === '#/home') renderHome();
  if (location.hash === '#/profile') renderProfile();
}

function route() {
  const [, name = 'home', arg] = location.hash.split('/');
  const viewIds = ['home', 'roadmap', 'subject', 'exams', 'profile'];
  let view = name;
  if (name === 'roadmap' && arg && visibleSubjects()[decodeURIComponent(arg)]) {
    current = decodeURIComponent(arg);
    view = 'subject';
    const subject = SUBJECTS[current];
    for (const grade of subject.grades) {
      const first = grade.chapters[0];
      if (first && !openChapters.has(first.chapter_id)) openChapters.add(first.chapter_id);
    }
    $('subjectTree').innerHTML = '';
    renderSubject();
  } else {
    current = null;
    if (!viewIds.includes(view) || view === 'subject') view = 'home';
    if (view === 'home') renderHome();
    if (view === 'roadmap') renderRoadmap();
    if (view === 'exams') renderExams();
    if (view === 'profile') renderProfile();
  }
  for (const id of viewIds) $(`view-${id}`).classList.toggle('hidden', id !== view);
  document.querySelectorAll('[data-tab]').forEach((link) => {
    const tab = view === 'subject' ? 'roadmap' : view;
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (view !== 'subject') window.scrollTo({ top:0 });
  if (IS_ADMIN) $('adminLink').classList.remove('hidden');
}

function toggleModal(id, open) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.toggle('hidden', !open);
  modal.classList.toggle('flex', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function openNode(id) {
  const node = INDEX[id];
  if (!node) return;
  activeId = id;
  $('nmKind').textContent = `${node.kind} · Grade ${node.grade}`;
  $('nmTitle').textContent = node.title;
  $('nmText').textContent = node.exp || 'No explanation available yet for this item.';
  $('nmDone').dataset.set = status(id) === 'done' ? '' : 'done';
  $('nmDone').textContent = status(id) === 'done' ? 'Mark not done' : 'Mark done';
  $('nmHard').dataset.set = status(id) === 'challenging' ? '' : 'challenging';
  $('nmHard').textContent = status(id) === 'challenging' ? 'Clear challenging' : 'Mark challenging';
  toggleModal('nodeModal', true);
}

const STEPS = [
  { title:'Follow the tree', text:'Your subject is the root. Each grade is a branch, each chapter a sub-branch. Tap a chapter card to open or close its topics.' },
  { title:'Read the colours', text:'Grade 9 is lime, Grade 10 mint, Grade 11 coral and Grade 12 deep green, so you always know which level you are on.' },
  { title:'Track your progress', text:'Mark topics done or challenging with the controls on each topic card. Counters show how far you have come.' },
  { title:'Read milestones', text:'Tap a topic title to read its explanation. Use Expand / collapse all to browse a subject quickly.' },
];
function renderTourStep() {
  const item = STEPS[tourStep];
  $('tourStep').textContent = `Step ${tourStep + 1} of ${STEPS.length}`;
  $('tourTitle').textContent = item.title;
  $('tourText').textContent = item.text;
  $('tourDots').innerHTML = STEPS.map((_, index) => `<span class="h-2 w-2 rounded-full ${index === tourStep ? 'bg-ink' : 'bg-line'}"></span>`).join('');
  $('tourBack').classList.toggle('invisible', tourStep === 0);
  $('tourNext').textContent = tourStep === STEPS.length - 1 ? 'Got it' : 'Next';
}
function startTour() { tourStep = 0; renderTourStep(); toggleModal('tourModal', true); }
function endTour() { toured = true; store.set('m500_tour_done', true); toggleModal('tourModal', false); }

function addDialogs() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="nodeModal" class="fixed inset-0 z-[70] hidden items-center justify-center bg-ink/70 p-4" role="dialog" aria-modal="true" aria-labelledby="nmTitle">
      <div class="w-full max-w-lg rounded-[28px] border-2 border-line bg-surface p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4"><div><p id="nmKind" class="text-xs font-bold uppercase tracking-widest text-cyan"></p><h2 id="nmTitle" class="mt-1 font-display text-2xl font-extrabold"></h2></div><button type="button" data-close class="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line" aria-label="Close">×</button></div>
        <p id="nmText" class="mt-4 whitespace-pre-line leading-relaxed text-muted"></p><div id="nmActions" class="mt-6 flex flex-wrap gap-2"><button id="nmDone" type="button" data-set="" class="min-h-[44px] rounded-full bg-ink px-5 font-bold text-white">Mark done</button><button id="nmHard" type="button" data-set="" class="min-h-[44px] rounded-full border-2 border-coral px-5 font-bold text-ink">Mark challenging</button></div>
      </div>
    </div>
    <div id="tourModal" class="fixed inset-0 z-[70] hidden items-center justify-center bg-ink/70 p-4" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div class="w-full max-w-md rounded-[28px] bg-surface p-6 shadow-2xl"><div class="flex items-center justify-between"><span id="tourStep" class="text-xs font-bold uppercase tracking-widest text-muted"></span><button id="tourSkip" type="button" class="min-h-[44px] px-3 text-sm font-bold text-muted underline">Skip</button></div>
        <div class="mt-4 grid h-14 w-14 place-items-center rounded-2xl bg-volt" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0F2A23" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V11M12 11 7 6M12 11l5-5M5 21h14"/></svg></div>
        <h2 id="tourTitle" class="mt-4 font-display text-2xl font-extrabold"></h2><p id="tourText" class="mt-2 leading-relaxed text-muted"></p>
        <div class="mt-5 flex items-center justify-between"><div id="tourDots" class="flex gap-2"></div><div class="flex gap-2"><button id="tourBack" type="button" class="min-h-[44px] rounded-full border border-line px-4 font-bold">Back</button><button id="tourNext" type="button" class="min-h-[44px] rounded-full bg-ink px-5 font-bold text-white">Next</button></div></div>
      </div>
    </div>`);
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('[data-check]')) return setStatus(target.dataset.check, status(target.dataset.check) === 'done' ? '' : 'done');
  if (target.matches('[data-hard]')) return setStatus(target.dataset.hard, status(target.dataset.hard) === 'challenging' ? '' : 'challenging');
  if (target.matches('[data-open]')) return openNode(target.dataset.open);
  if (target.matches('[data-goto]')) {
    const id = target.dataset.goto, node = INDEX[id];
    if (node) { location.hash = `#/roadmap/${encodeURIComponent(node.key)}`; setTimeout(() => openNode(id), 0); }
    return;
  }
  if (target.matches('[data-chapter]')) {
    const id = target.dataset.chapter;
    if (openChapters.has(id)) openChapters.delete(id); else openChapters.add(id);
    return renderSubject();
  }
  if (target.id === 'toggleAll' && current) {
    const chapters = SUBJECTS[current].grades.flatMap((grade) => grade.chapters.map((chapter) => chapter.chapter_id));
    const openAll = chapters.some((id) => !openChapters.has(id));
    chapters.forEach((id) => openAll ? openChapters.add(id) : openChapters.delete(id));
    return renderSubject();
  }
  if (target.id === 'newsMore') return loadNews(true);
  if (target.id === 'signoutBtn') return signOut();
  if (target.id === 'helpBtn') return startTour();
  if (target.id === 'profileSaveBtn') return saveProfile();
  if (target.id === 'profileEditBtn') {
    editingProfile = true;
    $('nameInput').value = profile.name || '';
    $('gradeInput').value = profile.grade == null ? '' : String(profile.grade);
    $('schoolInput').value = profile.school || '';
    document.querySelectorAll('input[name="streamInput"]').forEach((input) => { input.checked = input.value === profile.stream; });
    $('saveNote').textContent = '';
    return setProfileMode(true, true);
  }
  if (target.id === 'profileCancelBtn') { editingProfile = false; $('saveNote').textContent = ''; return renderProfile(); }
  if (target.id === 'nmDone' || target.id === 'nmHard') {
    setStatus(activeId, target.dataset.set);
    return toggleModal('nodeModal', false);
  }
  if (target.matches('[data-close]') || target.id === 'nodeModal') return toggleModal('nodeModal', false);
  if (target.id === 'tourNext') {
    if (tourStep === STEPS.length - 1) return endTour();
    tourStep++;
    return renderTourStep();
  }
  if (target.id === 'tourBack') { tourStep--; return renderTourStep(); }
  if (target.id === 'tourSkip') return endTour();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!$('nodeModal').classList.contains('hidden')) toggleModal('nodeModal', false);
    if (!$('tourModal').classList.contains('hidden')) endTour();
  }
  if (event.key === ' ' && event.target.matches('[data-open]')) {
    event.preventDefault();
    const id = event.target.dataset.open;
    setStatus(id, status(id) === 'done' ? '' : 'done');
  }
});

document.addEventListener('contextmenu', (event) => {
  const button = event.target.closest('[data-open]');
  if (!button) return;
  event.preventDefault();
  const id = button.dataset.open;
  setStatus(id, status(id) === 'done' ? '' : 'done');
});

window.addEventListener('hashchange', route);
window.addEventListener('M500:news-refresh', () => { if (location.hash === '#/home') loadNews(false); });
window.M500 = {
  context() {
    const node = activeId && INDEX[activeId];
    return {
      subject: current ? SUBJECTS[current].name : '',
      topic: node ? node.title : '',
      grade: node ? node.grade : profile.grade || null,
    };
  },
};

async function signOut() {
  try {
    const response = await fetch('/api/auth/logout', { method:'POST', credentials:'same-origin', headers:API_HEADERS });
    if (!response.ok) throw new Error('signout_failed');
  } catch { /* The session cookie will expire if the network is unavailable. */ }
  location.assign('/login.html');
}

addDialogs();
if (IS_ADMIN) $('adminLink').classList.remove('hidden');
route();
const assistantScript = document.createElement('script');
assistantScript.src = '/assistant.js';
document.body.appendChild(assistantScript);
