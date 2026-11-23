// Staff sign-in page (the dashboard's own login, at the same unlisted address as the dashboard).
// Signs in with email and password, checks the account has dashboard access (admins/{uid}), then opens the dashboard.
import { db, login, logout, resetPassword, onAuth, demo } from './fb.js';
import { $, esc, STARTER, brand } from './shared.js';

const next = (() => { const n = new URLSearchParams(location.search).get('next') || ''; return /^#[\w-]*$/.test(n) ? n : ''; })();
const S = { busy: false, err: '', msg: '', show: false, checking: true, email: '' };
try { S.email = localStorage.getItem('rb-last-email') || ''; } catch (_) {}
const shop = STARTER.shop;

const IC = {
  mail: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="m3 5.5 7 5.5 7-5.5"/></svg>',
  lock: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>',
  arrow: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 5l-5 5 5 5"/></svg>'
};
function render() {
  const a = document.activeElement, id = a && a.id, val = id === 'si-email' ? a.value : null, pv = $('#si-pass') ? $('#si-pass').value : '';
  const hr = new Date().getHours(), hello = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  $('#app').innerHTML = `<main class="si">
    <aside class="si-brand" aria-hidden="true"><div class="si-brand-in">
      <img class="si-mark" src="../assets/logo.png" alt="" width="88" height="88">
      <p class="si-tag">Best looks,<br>realized.</p>
      <ul class="si-feats"><li>Schedule and walk-ins</li><li>Checkout and receipts</li><li>Pay, time in and payslips</li></ul>
      <p class="si-addr">${esc(shop.name)} · ${esc((shop.address || '').split(',').slice(-2).join(',').trim() || 'Antipolo')}</p></div></aside>
    <section class="si-main"><div class="si-box">
      <a class="si-back" href="../">${IC.arrow}<span>Website</span></a>
      <img class="si-logo-sm" src="../assets/logo.png" alt="" width="64" height="64">
      <p class="si-eyebrow">${hello}</p><h1 class="si-h">Staff sign in</h1>
      <p class="si-sub">Use the email and password the owner gave you. You’ll see the pages for your role.</p>
      ${S.checking ? '<div class="si-wait"><span class="spinner"></span><span>Checking your sign-in…</span></div>' : `
      <form id="si-form" class="si-form" novalidate>
        <label class="si-field" for="si-email"><span class="si-lbl">Email</span><span class="si-in">${IC.mail}<input id="si-email" type="email" inputmode="email" autocomplete="username" placeholder="name@example.com" value="${esc(val ?? S.email)}" required></span></label>
        <label class="si-field" for="si-pass"><span class="si-lbl">Password</span><span class="si-in">${IC.lock}<input id="si-pass" type="${S.show ? 'text' : 'password'}" autocomplete="current-password" placeholder="••••••••" required><button type="button" class="si-eye" data-act="eye" aria-label="${S.show ? 'Hide' : 'Show'} password" aria-pressed="${S.show}">${S.show ? 'Hide' : 'Show'}</button></span></label>
        <div class="si-row"><span class="si-caps" id="si-caps" hidden>Caps Lock is on</span><button type="button" class="si-link" data-act="forgot">Forgot password?</button></div>
        ${S.err ? `<p class="si-err" role="alert">${esc(S.err)}</p>` : ''}${S.msg ? `<p class="si-ok" role="status">${esc(S.msg)}</p>` : ''}
        <button class="si-btn" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spinner"></span> Signing in…' : 'Sign in'}</button>
      </form>
      ${demo ? `<div class="si-demo"><p>Demo: any password works. Sign in as</p><div class="si-chips">${[['alex@demo.realbarbers', 'Owner', 'Alex'], ['airyl@demo.realbarbers', 'Receptionist', 'Airyl'], ['lyndon@demo.realbarbers', 'Barber', 'Lyndon']].map(([e, r, n]) => `<button type="button" data-act="demo" data-email="${e}"><b>${n}</b><span>${r}</span></button>`).join('')}</div></div>` : ''}`}
      <p class="si-foot">For REAL Barbers staff only. Every sign-in is recorded.</p>
    </div></section></main>`;
  if (pv && $('#si-pass')) $('#si-pass').value = pv;
  if (id) { const el = document.getElementById(id); if (el) { el.focus(); if (val !== null) el.setSelectionRange(val.length, val.length); } }
}
document.addEventListener('keyup', e => { const c = $('#si-caps'); if (c && e.getModifierState) c.hidden = !e.getModifierState('CapsLock'); });
async function hasAccess(user) { try { return (await db.doc(`admins/${user.uid}`).get()).exists; } catch (_) { return false; } }
async function doLogin(email, pass) {
  S.busy = true; S.err = ''; S.msg = ''; render();
  try { await login(email, pass); try { localStorage.setItem('rb-last-email', email); } catch (_) {} }
  catch (e) { S.busy = false; S.err = /too-many/i.test(e.code || '') ? 'Too many tries. Wait a few minutes, or reset your password.' : /invalid|wrong|not-found|credential|user/i.test(e.code || e.message || '') ? 'Wrong email or password.' : 'Couldn’t sign in. Check the internet connection.'; render(); }
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'si-form') return; e.preventDefault();
  const email = $('#si-email').value.trim(), pass = $('#si-pass').value;
  if (!email || !pass) { S.err = 'Enter your email and password.'; render(); return; }
  doLogin(email, pass);
});
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
  if (a === 'eye') { S.show = !S.show; render(); $('#si-pass').focus(); }
  if (a === 'demo') doLogin(el.dataset.email, 'demo');
  if (a === 'forgot') {
    const email = $('#si-email').value.trim();
    if (!email) { S.err = 'Type your email first, then tap “Forgot password?”.'; S.msg = ''; render(); return; }
    try { await resetPassword(email); S.err = ''; S.msg = demo ? 'Demo: no email is sent.' : `If ${email} has a sign-in, a reset link is on its way. Check the inbox and spam folder.`; } catch (_) { S.err = 'Couldn’t send the reset email. Try again.'; S.msg = ''; }
    render();
  }
  if (a === 'resetDemo') { const fb = await import('./fb.js'); fb.resetDemo(); }
});
onAuth(async user => {
  if (!user) { S.checking = false; S.busy = false; render(); return; }
  if (await hasAccess(user)) { location.replace('./' + next); return; }
  S.checking = false; S.busy = false; S.err = `${user.email || 'This account'} has no dashboard access. Ask the owner for a sign-in.`; await logout(); render();
});
render();
