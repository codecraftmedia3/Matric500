'use strict';
/* Matric500 sign-in page. All auth UI lives here (login.html + login.js).
   The server side is auth.js: POST /api/auth/google, /api/auth/admin-login, /api/auth/logout. */
const $ = (id) => document.getElementById(id);
const API_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };
const say = (t) => { $('gsiMsg').textContent = t; };

let cfg = null; // { user, googleClientId, adminLogin } from /api/roadmap

/* ---------- Google ---------- */
function initGoogle(tries = 0) {
  if (!cfg.googleClientId) return say('Google sign-in is not set up yet. You can continue as a guest.');
  if (!window.google || !google.accounts) {                // Google's script loads async: wait up to ~10s
    if (tries < 50) { say('Loading Google sign-in…'); return setTimeout(() => initGoogle(tries + 1), 200); }
    return say('Google sign-in could not load. Turn off any ad blocker for this site or try another browser, then refresh.');
  }
  say('');
  google.accounts.id.initialize({
    client_id: cfg.googleClientId,
    callback: async ({ credential }) => {
      say('Signing you in…');
      try {
        const r = await fetch('/api/auth/google', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ credential }) });
        if (r.ok) return (location.href = '/');
        say(r.status === 403 ? 'This account has been suspended.'
          : r.status === 401 ? 'Google rejected the sign-in. Check that GOOGLE_CLIENT_ID on the server matches your Google client.'
          : 'Sign-in failed (server error). Please try again.');
      } catch { say('Cannot reach the server. Please try again.'); }
    },
  });
  google.accounts.id.renderButton($('gsiBtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', width: 300 });
}

/* ---------- Admin (email + password from the server's .env) ---------- */
$('adminToggle').addEventListener('click', () => {
  const open = $('adminForm').classList.toggle('hidden') === false;
  $('adminToggle').setAttribute('aria-expanded', String(open));
  if (open) $('adminEmail').focus();
});
$('adminForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('adminErr').textContent = '';
  try {
    const r = await fetch('/api/auth/admin-login', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS, body: JSON.stringify({ email: $('adminEmail').value, password: $('adminPass').value }) });
    if (r.ok) return (location.href = '/admin');
    $('adminErr').textContent = r.status === 401 ? 'Wrong email or password.'
      : r.status === 503 ? 'Admin login is not configured on the server.'
      : 'Sign-in failed. Is the database connected?';
  } catch { $('adminErr').textContent = 'Cannot reach the server.'; }
});

/* ---------- Sign out ---------- */
$('signOutBtn').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: API_HEADERS }); } catch { /* ignore */ }
  location.reload();
});

/* ---------- start ---------- */
(async () => {
  try {
    const r = await fetch('/api/roadmap', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('api');
    cfg = await r.json();
  } catch {
    say('Sign-in is not available on this site yet (the server is not connected). You can continue as a guest.');
    return;
  }
  if (cfg.user) {
    $('signedOut').classList.add('hidden');
    $('signedIn').classList.remove('hidden');
    $('whoName').textContent = cfg.user.name || 'your account';
    $('whoEmail').textContent = cfg.user.email || '';
    if (cfg.user.role === 'admin') { const a = $('adminDash'); a.classList.remove('hidden'); a.classList.add('flex'); }
    return;
  }
  if (cfg.adminLogin) $('adminBox').classList.remove('hidden');
  initGoogle();
})();
