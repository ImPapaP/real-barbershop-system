// Staff sign-in page (the dashboard's own login, at the same unlisted address as the dashboard).
// Signs in with email and password, checks the account has dashboard access (admins/{uid}), then opens the dashboard.
import { db, login, logout, resetPassword, onAuth, demo } from './fb.js';
import { $, esc, STARTER, brand } from './shared.js';

const next = (() => { const n = new URLSearchParams(location.search).get('next') || ''; return /^#[\w-]*$/.test(n) ? n : ''; })();
const S = { busy: false, err: '', msg: '', show: false, checking: true, email: '' };
try { S.email = localStorage.getItem('rb-last-email') || ''; } catch (_) {}
const shop = STARTER.shop;

function render() {
  const a = document.activeElement, id = a && a.id, val = id === 'si-email' ? a.value : null;
  $('#app').innerHTML = `<main class="signin-pg"><div class="signin-card">
    <img class="signin-logo" src="../assets/logo.png" alt="" width="104" height="104">
    <p class="eyebrow">${esc(shop.name)}</p><h1>Staff sign in</h1>
    ${S.checking ? '<p class="muted center-t"><span class="spinner"></span></p>' : `
    <form id="si-form" class="stack" novalidate>
      <div class="field"><label for="si-email">Email</label><input id="si-email" type="email" autocomplete="username" value="${esc(val ?? S.email)}" required></div>
      <div class="field"><label for="si-pass">Password</label><div class="pw-wrap"><input id="si-pass" type="${S.show ? 'text' : 'password'}" autocomplete="current-password" required><button type="button" class="pw-eye" data-act="eye" aria-label="${S.show ? 'Hide' : 'Show'} password">${S.show ? 'Hide' : 'Show'}</button></div></div>
      ${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}${S.msg ? `<p class="ok-msg" role="status">${esc(S.msg)}</p>` : ''}
      <button class="btn btn-primary btn-lg" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spinner"></span> Signing in…' : 'Sign in'}</button>
      <button type="button" class="link-btn small" data-act="forgot">Forgot password?</button>
    </form>
    ${demo ? `<div class="signin-demo"><p class="muted small">Demo: any password works. Sign in as</p><div class="row">${[['alex@demo.realbarbers', 'Owner (Alex)'], ['airyl@demo.realbarbers', 'Receptionist (Airyl)'], ['lyndon@demo.realbarbers', 'Barber (Lyndon)']].map(([e, l]) => `<button type="button" class="btn btn-sm" data-act="demo" data-email="${e}">${l}</button>`).join('')}</div></div>` : ''}`}
    <p class="signin-foot muted small">For REAL Barbers staff only. <a href="../">Back to the website</a></p>
  </div></main>`;
  if (id) { const el = document.getElementById(id); if (el) { el.focus(); if (val !== null) el.setSelectionRange(val.length, val.length); } }
}
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
  if (a === 'eye') { S.show = !S.show; const v = $('#si-pass').value; render(); $('#si-pass').value = v; $('#si-pass').focus(); }
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
