// Staff time clock: opened by scanning the QR by the shop door (clock.html?k=<code>). The staff member signs in
// with their own dashboard account and taps Time in / Time out. The server stamps the time (Cloud Function clockPunch),
// so the phone's own clock doesn't matter. 9:01 is late; the deduction shows right away.
import { db, call, demo, demoBar, login, logout, onAuth } from './fb.js';
import { $, esc, money, fmtTime, fmtDate, STARTER, brand, themeBtn, phNow } from './shared.js';

const K = new URLSearchParams(location.search).get('k') || '';
const S = { info: { ...STARTER }, user: undefined, peek: null, busy: false, err: '', done: null, loginErr: '' };
const shop = () => S.info.shop || STARTER.shop;
const m = n => money(n, shop().currency || '₱');

function shell(inner) {
  return `${demoBar ? demoBar('') : ''}<header class="site-head"><div class="wrap head-in"><a class="wordmark" href="./">${brand(shop().wordmark || shop().name)}</a><nav class="site-nav">${themeBtn()}</nav></div></header>
  <main class="wrap acct clock-pg">${inner}</main>`;
}
function render() { $('#app').innerHTML = shell(body()); }
const clockNow = () => { const t = phNow().time; return fmtTime(t); };
function body() {
  if (!K) return `<section class="acct-card"><p class="eyebrow">Staff time clock</p><h1>Scan the QR at the shop</h1><p class="muted">Open your phone camera and point it at the time clock poster by the door. It opens this page with the shop’s code.</p></section>`;
  if (S.user === undefined) return '<div class="center"><span class="spinner"></span></div>';
  if (!S.user) return `<section class="acct-card acct-login"><p class="eyebrow">Staff time clock</p><h1>Sign in to time in</h1><p class="muted">Use the sign-in the owner gave you. Your phone remembers it next time.</p>
    <form id="ck-login" class="stack" novalidate><div class="field"><label for="ck-email">Email</label><input id="ck-email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="ck-pass">Password</label><input id="ck-pass" type="password" autocomplete="current-password" required></div>
      ${S.loginErr ? `<p class="err" role="alert">${esc(S.loginErr)}</p>` : ''}<button class="btn btn-accent btn-lg" type="submit">Sign in</button></form>
    ${demo ? `<div class="row" style="margin-top:12px"><span class="muted small">Demo:</span><button class="btn btn-sm" data-act="demo" data-email="lyndon@demo.realbarbers">Lyndon</button><button class="btn btn-sm" data-act="demo" data-email="vince@demo.realbarbers">Vince</button></div>` : ''}</section>`;
  if (S.done) { const r = S.done.rec, late = S.done.action === 'in' && r.lateMin > 0;
    return `<section class="acct-card clock-done ${late ? 'is-late' : 'is-ok'}"><p class="eyebrow">${S.done.action === 'in' ? 'Timed in' : 'Timed out'}</p><div class="clock-time">${fmtTime(S.done.action === 'in' ? r.inHM : r.outHM)}</div>
      <h1>${S.done.action === 'in' ? (late ? `${r.lateMin} minute${r.lateMin === 1 ? '' : 's'} late` : `On time. Have a good day, ${esc(S.done.name.split(' ')[0])}!`) : `See you next time, ${esc(S.done.name.split(' ')[0])}`}</h1>
      ${late ? `<p>${r.fine ? `${m(r.fine)} comes off your pay (${Math.ceil(r.lateMin / 15)} × ${m(r.rate)} for each started 15 minutes after ${fmtTime(r.start)}).` : 'No deduction for you.'} If there was a good reason, tell the owner: they can excuse it.</p>` : ''}
      ${S.done.action === 'out' && r.inHM ? `<p class="muted">In at ${fmtTime(r.inHM)}, out at ${fmtTime(r.outHM)}.</p>` : ''}
      <a class="btn btn-lg" href="r3al-hq-7m2k/#me">See my day</a></section>`; }
  if (!S.peek) return S.err ? `<section class="acct-card"><p class="err">${esc(S.err)}</p><button class="btn" data-act="retry">Try again</button> <button class="btn btn-ghost" data-act="out">Sign out</button></section>` : '<div class="center"><span class="spinner"></span></div>';
  const P = S.peek, r = P.rec, first = P.name.split(' ')[0];
  if (P.state === 'done') return `<section class="acct-card"><p class="eyebrow">Staff time clock</p><h1>You’re done for today, ${esc(first)}</h1><p class="muted">In at ${fmtTime(r.inHM)}, out at ${fmtTime(r.outHM)}. If that’s wrong, ask the owner to fix it.</p><a class="btn" href="r3al-hq-7m2k/#me">See my day</a></section>`;
  return `<section class="acct-card clock-card"><p class="eyebrow">Staff time clock · ${esc(fmtDate(phNow().date, true))}</p>
    <h1>${P.state === 'in' ? `Leaving, ${esc(first)}?` : `Hi, ${esc(first)}`}</h1>
    <p class="muted">${P.state === 'in' ? `You timed in at ${fmtTime(r.inHM)}.` : `Time in by ${fmtTime(P.start)}. It’s ${clockNow()} now.`}</p>
    ${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}
    <button class="btn btn-accent btn-xl clock-btn" data-act="punch" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spinner"></span>' : P.state === 'in' ? 'Time out' : 'Time in'}</button>
    <p class="muted small">Not ${esc(first)}? <button type="button" class="link-btn" data-act="out">Sign out</button></p></section>`;
}
async function peek() { S.err = ''; S.peek = null; render(); try { S.peek = await call('clockPunch', { k: K, peek: true }); } catch (e) { S.err = e.message || 'Couldn’t reach the time clock.'; } render(); }
// Location is optional: it helps the owner spot a time in from somewhere else
const where = () => new Promise(res => { if (!navigator.geolocation) return res({}); const t = setTimeout(() => res({}), 5000); navigator.geolocation.getCurrentPosition(p => { clearTimeout(t); res({ lat: p.coords.latitude, lng: p.coords.longitude }); }, () => { clearTimeout(t); res({}); }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }); });

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act;
  if (a === 'punch') { S.busy = true; S.err = ''; render(); try { S.done = await call('clockPunch', { k: K, ...(await where()) }); } catch (er) { S.err = er.message || 'Couldn’t time you in. Try again.'; } S.busy = false; render(); }
  if (a === 'retry') peek();
  if (a === 'out') { S.peek = null; S.done = null; await logout(); }
  if (a === 'demo') { await login(el.dataset.email, 'demo'); }
  if (a === 'resetDemo') { const fb = await import('./fb.js'); fb.resetDemo(); }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'ck-login') return; e.preventDefault();
  try { await login($('#ck-email').value.trim(), $('#ck-pass').value); S.loginErr = ''; }
  catch (er) { S.loginErr = /invalid|wrong|not-found|credential/i.test(er.code || er.message) ? 'Wrong email or password.' : 'Couldn’t sign in. Check your connection.'; render(); }
});
render();
db.doc('public/info').get().then(s => { if (s.exists) { S.info = { ...STARTER, ...s.data(), shop: { ...STARTER.shop, ...(s.data().shop || {}) } }; render(); } }).catch(() => {});
onAuth(u => { S.user = u || null; S.done = null; if (u && K) peek(); else render(); });
