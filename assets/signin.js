// Staff sign-in page (the dashboard's own login, at the same unlisted address as the dashboard).
// Signs in with email and password, checks the account has dashboard access (admins/{uid}), then opens the dashboard.
import { db, call, login, logout, resetPassword, onAuth, demo } from './fb.js';
import { $, esc, STARTER, brand, themeBtn, phNow, fmtTime, DAYS, MONTHS } from './shared.js';

const next = (() => { const n = new URLSearchParams(location.search).get('next') || ''; return /^#[\w-]*$/.test(n) ? n : ''; })();
const S = { busy: false, err: '', msg: '', show: false, checking: true, email: '', two: null, uid: '' };
const devKey = uid => 'rb-2fa-' + uid;
try { S.email = localStorage.getItem('rb-last-email') || ''; } catch (_) {}
const shop = STARTER.shop;
let hours = STARTER.hours;
db.doc('public/info').get().then(d => { if (d.exists && Array.isArray(d.data().hours)) { hours = d.data().hours; tick(); } }).catch(() => {});
// shop status and the time, in Philippine time
function status() {
  const n = phNow(), h = hours.find(x => x.d === n.dow) || {}, fmt = t => fmtTime(t).replace(':00', '');
  if (!h.closed && h.open && n.time >= h.open && n.time < h.close) return { open: true, text: `Open now · until ${fmt(h.close)}` };
  if (!h.closed && h.open && n.time < h.open) return { open: false, text: `Opens at ${fmt(h.open)}` };
  for (let i = 1; i <= 7; i++) { const x = hours.find(y => y.d === (n.dow + i) % 7); if (x && !x.closed && x.open) return { open: false, text: `Closed · opens ${i === 1 ? 'tomorrow' : DAYS[x.d]} ${fmt(x.open)}` }; }
  return { open: false, text: 'Closed' };
}
// Philippine time: morning until noon, afternoon until 6 PM, evening after (and before 5 AM)
const greet = () => { const m = phNow().min; return m >= 300 && m < 720 ? 'Good morning' : m >= 720 && m < 1080 ? 'Good afternoon' : 'Good evening'; };
// A verse for the day (King James Version, public domain); a new one each day
const VERSES = [
  ['And whatsoever ye do, do it heartily, as to the Lord, and not unto men.', 'Colossians 3:23'],
  ['I can do all things through Christ which strengtheneth me.', 'Philippians 4:13'],
  ['Commit thy works unto the LORD, and thy thoughts shall be established.', 'Proverbs 16:3'],
  ['This is the day which the LORD hath made; we will rejoice and be glad in it.', 'Psalm 118:24'],
  ['They are new every morning: great is thy faithfulness.', 'Lamentations 3:23'],
  ['Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', 'Joshua 1:9'],
  ['And let us not be weary in well doing: for in due season we shall reap, if we faint not.', 'Galatians 6:9'],
  ['Trust in the LORD with all thine heart; and lean not unto thine own understanding.', 'Proverbs 3:5'],
  ['They shall run, and not be weary; and they shall walk, and not faint.', 'Isaiah 40:31'],
  ['Seest thou a man diligent in his business? he shall stand before kings.', 'Proverbs 22:29'],
  ['Establish thou the work of our hands upon us; yea, the work of our hands establish thou it.', 'Psalm 90:17'],
  ['Whatsoever thy hand findeth to do, do it with thy might.', 'Ecclesiastes 9:10']
];
const verse = () => { const d = new Date(phNow().date + 'T00:00:00'), n = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5); return VERSES[n % VERSES.length]; };
const dateLine = () => { const n = phNow(), d = new Date(n.date + 'T00:00:00'); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
function tick() {
  const c = $('#si-clock'), st = $('#si-status'), g = $('#si-greet'); if (!c) return;
  c.textContent = fmtTime(phNow().time); const x = status(); st.textContent = x.text; st.parentElement.classList.toggle('open', x.open);
  if (g) g.textContent = greet();
}
setInterval(tick, 20000);

const IC = {
  mail: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="m3 5.5 7 5.5 7-5.5"/></svg>',
  lock: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>',
  arrow: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 5l-5 5 5 5"/></svg>'
};
// Owner two-step: a 6-digit code by email or text the first time the owner signs in on a device
function twoStep() {
  const t = S.two;
  return `<form id="tf-form" class="si-form" novalidate aria-labelledby="tf-h">
    <h2 class="si-h2" id="tf-h">Two-step check</h2>
    <p class="si-sub">The owner’s account needs a code on a new device.${t.to ? ` We sent it to <b>${esc(t.to)}</b>.` : ' Where should we send it?'}</p>
    <div class="si-chips tf-via" role="group" aria-label="Send the code by">
      <button type="button" data-act="tfSend" data-via="email" ${S.busy ? 'disabled' : ''}><b>${t.to && t.via === 'email' ? 'Send again' : 'Email me'}</b><span>${esc(t.email || 'your email')}</span></button>
      ${t.phone ? `<button type="button" data-act="tfSend" data-via="sms" ${S.busy ? 'disabled' : ''}><b>${t.to && t.via === 'sms' ? 'Send again' : 'Text me'}</b><span>${esc(t.phone)}</span></button>` : ''}
    </div>
    ${t.to ? `<label class="si-field" for="tf-code"><span class="si-lbl">6-digit code</span><span class="si-in tf-in"><input id="tf-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="••••••" required aria-describedby="tf-help"></span></label>
    <p class="si-help" id="tf-help">${t.demoCode ? `Demo: no email or text is sent. Your code is <b>${esc(t.demoCode)}</b>.` : 'Check spam if the email doesn’t show up in a minute. The code works for 10 minutes.'}</p>
    <label class="si-check"><input type="checkbox" id="tf-remember" ${t.remember ? 'checked' : ''}> Remember this device for 30 days</label>` : ''}
    ${S.err ? `<p class="si-err" role="alert">${esc(S.err)}</p>` : ''}${S.msg ? `<p class="si-ok" role="status">${esc(S.msg)}</p>` : ''}
    ${t.to ? `<button class="si-btn" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spinner"></span> Checking…' : 'Verify and open the dashboard'}</button>` : ''}
    <button type="button" class="si-link" data-act="tfCancel">Use a different account</button>
  </form>`;
}
function render() {
  const a = document.activeElement, id = a && a.id, val = id === 'si-email' ? a.value : null, pv = $('#si-pass') ? $('#si-pass').value : '';
  const st = status();
  $('#app').innerHTML = `<main class="si">
    <aside class="si-brand" aria-hidden="true"><div class="si-brand-in">
      <img class="si-mark" src="../assets/logo.png" alt="" width="88" height="88">
      <p class="si-tag">Best looks,<br>realized.</p>
      <ul class="si-feats"><li>Schedule and walk-ins</li><li>Checkout and receipts</li><li>Pay, time in and payslips</li></ul>
      <p class="si-addr">${esc(shop.name)} · ${esc((shop.address || '').split(',').slice(-2).join(',').trim() || 'Antipolo')}</p></div></aside>
    <section class="si-main"><div class="si-box">
      <div class="si-top"><a class="si-back" href="../">${IC.arrow}<span>Website</span></a>${themeBtn()}</div>
      <img class="si-logo-sm" src="../assets/logo.png" alt="" width="64" height="64">
      <div class="si-head">
        <div class="si-meta"><span class="si-pill${st.open ? ' open' : ''}"><i></i><span id="si-status">${esc(st.text)}</span></span><span class="si-date">${esc(dateLine())} · <b id="si-clock">${fmtTime(phNow().time)}</b></span></div>
        <p class="si-eyebrow">Staff sign in</p>
        <h1 class="si-h"><span id="si-greet">${greet()}</span><span class="si-dot">.</span></h1>
        <p class="si-sub">Sign in to start your shift.</p>
        ${(() => { const [t, ref] = verse(); return `<figure class="si-verse"><blockquote>“${esc(t)}”</blockquote><figcaption>${esc(ref)} <span>KJV</span></figcaption></figure>`; })()}
      </div>
      ${S.checking ? '<div class="si-wait"><span class="spinner"></span><span>Checking your sign-in…</span></div>' : S.two ? twoStep() : `
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
document.addEventListener('submit', async e => {
  if (e.target.id === 'tf-form') {
    e.preventDefault(); const code = ($('#tf-code') || {}).value || '', remember = !!($('#tf-remember') || {}).checked;
    if (!/^\d{6}$/.test(code.trim())) { S.err = 'Enter the 6-digit code.'; render(); return; }
    S.busy = true; S.err = ''; S.msg = ''; S.two.remember = remember; render();
    try { const r = await call('twoFaVerify', { code: code.trim(), remember }); try { if (r.device) localStorage.setItem(devKey(S.uid), r.device); } catch (_) {} location.replace('./' + next); }
    catch (er) { S.busy = false; S.err = er.message || 'That code isn’t right.'; render(); const c = $('#tf-code'); if (c) c.focus(); }
    return;
  }
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
  if (a === 'tfSend') {
    S.busy = true; S.err = ''; S.msg = ''; render();
    try { const r = await call('twoFaSend', { via: el.dataset.via }); Object.assign(S.two, { to: r.to, via: el.dataset.via, demoCode: r.demoCode || '' }); S.msg = 'Code sent.'; }
    catch (er) { S.err = er.message || 'Couldn’t send the code. Try again.'; }
    S.busy = false; render(); const c = $('#tf-code'); if (c) c.focus();
  }
  if (a === 'tfCancel') { S.two = null; S.err = ''; S.msg = ''; await logout(); }
  if (a === 'resetDemo') { const fb = await import('./fb.js'); fb.resetDemo(); }
});
onAuth(async user => {
  if (!user) { S.checking = false; S.busy = false; render(); return; }
  if (await hasAccess(user)) {
    S.uid = user.uid; let dev = ''; try { dev = localStorage.getItem(devKey(user.uid)) || ''; } catch (_) {}
    let st = { ok: true }; try { st = await call('twoFaStatus', { device: dev }); } catch (_) {} // offline: the database rules still ask for the code
    if (st.ok) { location.replace('./' + next); return; }
    S.checking = false; S.busy = false; S.err = ''; S.two = { email: st.email || '', phone: st.phone || '', to: '', via: '', remember: true }; render(); return;
  }
  S.checking = false; S.busy = false; S.err = `${user.email || 'This account'} has no dashboard access. Ask the owner for a sign-in.`; await logout(); render();
});
render();
