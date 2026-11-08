'use strict';
const $ = (id) => document.getElementById(id);
const API_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };

let cfg = null;

const needsProfile = (u) => u && u.role !== 'admin' && !(u.profile && u.profile.name && u.profile.grade && u.profile.school && u.profile.stream);

function showStep(n) {
  $('step1').classList.toggle('hidden', n !== 1);
  $('step2').classList.toggle('hidden', n !== 2);
  $('stepLabel').textContent = `Step ${n} of 2`;
}

function showError(field, message) {
  const el = $('err' + field.charAt(0).toUpperCase() + field.slice(1));
  if (el) el.textContent = message || '';
}

async function loadConfig() {
  try {
    const r = await fetch('/api/config', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('config');
    cfg = await r.json();
    return cfg;
  } catch {
    return null;
  }
}

function initGoogle() {
  if (!cfg || !cfg.googleClientId) {
    $('gsiMsg').textContent = 'Google sign-in is not set up yet.';
    return;
  }
  if (!window.google || !google.accounts) {
    setTimeout(initGoogle, 200);
    return;
  }
  $('gsiMsg').textContent = '';
  google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    callback: async ({ credential }) => {
      $('gsiMsg').textContent = 'Signing you in…';
      try {
        const r = await fetch('/api/auth/google', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ credential }) });
        if (r.ok) {
          const nextCfg = await loadConfig();
          if (nextCfg && needsProfile(nextCfg.user)) {
            populateProfile(nextCfg.user);
            showStep(2);
            return;
          }
          location.replace('/');
          return;
        }
        $('gsiMsg').textContent = r.status === 403 ? 'This account has been suspended.' : 'Google sign-in failed. Please try again.';
      } catch {
        $('gsiMsg').textContent = 'Cannot reach the server. Please try again.';
      }
    },
  });
  google.accounts.id.renderButton($('gsiBtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', width: 300 });
}

function populateProfile(user) {
  const p = user && user.profile ? user.profile : {};
  $('pName').value = p.name || user?.name || '';
  $('pGrade').value = p.grade ? String(p.grade) : '';
  $('pSchool').value = p.school || '';
  const radio = document.querySelector(`input[name="stream"][value="${p.stream || ''}"]`);
  if (radio) radio.checked = true;
}

$('profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('pName').value.trim();
  const grade = Number($('pGrade').value) || null;
  const school = $('pSchool').value.trim();
  const stream = document.querySelector('input[name=stream]:checked')?.value || null;

  showError('name', '');
  showError('grade', '');
  showError('school', '');
  showError('stream', '');
  $('profileStatus').textContent = '';

  let invalid = false;
  if (name.length < 1 || name.length > 80) { showError('name', 'Enter a valid full name (1-80 characters).'); invalid = true; }
  if (grade === null || ![9, 10, 11, 12].includes(grade)) { showError('grade', 'Choose a grade from 9 to 12.'); invalid = true; }
  if (school.length < 1 || school.length > 120) { showError('school', 'Enter a school name (1-120 characters).'); invalid = true; }
  if (!stream || !['natural', 'social'].includes(stream)) { showError('stream', 'Choose Natural Science or Social Science.'); invalid = true; }
  if (invalid) return;

  const btn = $('saveProfileBtn');
  btn.disabled = true;
  $('profileStatus').textContent = 'Saving…';
  try {
    const r = await fetch('/api/profile', { method: 'PUT', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ name, grade, school, stream }) });
    if (!r.ok) {
      $('profileStatus').textContent = 'Could not save. Please check the fields and try again.';
      return;
    }
    location.replace('/');
  } catch {
    $('profileStatus').textContent = 'Could not save. Please try again.';
  } finally {
    btn.disabled = false;
  }
});

$('adminToggle').addEventListener('click', () => {
  const open = $('adminForm').classList.toggle('hidden') === false;
  $('adminToggle').setAttribute('aria-expanded', String(open));
  if (open) $('adminEmail').focus();
});

$('adminForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('adminErr').textContent = '';
  try {
    const r = await fetch('/api/auth/admin-login', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ email: $('adminEmail').value, password: $('adminPass').value }) });
    if (r.ok) return (location.href = '/admin');
    $('adminErr').textContent = r.status === 401 ? 'Wrong email or password.' : r.status === 503 ? 'Admin login is not configured on the server.' : 'Sign-in failed. Is the database connected?';
  } catch {
    $('adminErr').textContent = 'Cannot reach the server.';
  }
});

$('signOutBtn').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS }); } catch {}
  location.reload();
});

(async () => {
  const cfgData = await loadConfig();
  if (!cfgData) {
    $('gsiMsg').textContent = 'Sign-in is not available on this site yet (the server is not connected).';
    return;
  }
  if (cfgData.user) {
    if (cfgData.user.role === 'admin') {
      location.replace('/admin');
      return;
    }
    if (needsProfile(cfgData.user)) {
      populateProfile(cfgData.user);
      showStep(2);
      $('signOutBtn').classList.remove('hidden');
      if (cfgData.adminLogin) $('adminBox').classList.remove('hidden');
      return;
    }
    location.replace('/');
    return;
  }
  if (cfgData.adminLogin) $('adminBox').classList.remove('hidden');
  showStep(1);
  initGoogle();
})();
