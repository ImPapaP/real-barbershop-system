// My visits: clients log in with their mobile number and a code sent by text, then see their bookings,
// past visits, receipts and loyalty card, and can book the same again in one tap.
import { db, call, demo, demoBar } from './fb.js';
import { $, esc, money, fmtDate, fmtTime, MONTHS, STARTER, brand, themeBtn, BACK_IC, fmtBday, phNow } from './shared.js';

const KEY = 'rb-session';
const S = { info: { ...STARTER }, allVisits: false, session: '', step: 'phone', phone: '', code: '', busy: false, err: '', demoCode: '', data: null, loading: false };
try { S.session = localStorage.getItem(KEY) || ''; } catch (_) {}
try { const me = JSON.parse(localStorage.getItem('rb-me') || 'null'); if (me && me.phone) S.phone = me.phone; } catch (_) {}
const shop = () => S.info.shop || STARTER.shop;
const m = n => money(n, shop().currency || '₱');

function shell(inner) {
  return `${demoBar ? demoBar('') : ''}<header class="site-head"><div class="wrap head-in"><a class="wordmark" href="./">${brand(shop().wordmark || shop().name)}</a><nav class="site-nav">${themeBtn()}<a class="btn btn-accent btn-sm" href="./#book">Book now</a></nav></div></header>
  <main class="wrap acct"><a class="pop-back page-back-link" href="./">${BACK_IC}<span>Back to the website</span></a>${inner}</main>
  <footer class="site-foot"><div class="wrap"><span>${esc(shop().name)} · ${esc(shop().phone || '')}</span><span><a href="terms.html">Booking Terms</a> · <a href="privacy.html">Privacy Policy</a></span></div></footer>`;
}
function render() {
  const a = document.activeElement, id = a && a.id;
  $('#app').innerHTML = shell(S.session ? home() : login());
  if (id) document.getElementById(id)?.focus();
}

function login() {
  const code = S.step === 'code';
  return `<section class="acct-login acct-card">
    <p class="eyebrow">My visits</p><h1>${code ? 'Enter your code' : 'Log in with your number'}</h1>
    <p class="muted">${code ? `We texted a 6-digit code to <b>${esc(S.phone)}</b>. It expires in 10 minutes.` : 'See your bookings, receipts and loyalty card, and book the same again in one tap. Use the number you book with.'}</p>
    <form id="login-form" class="stack" novalidate>
      ${code ? `<div class="field"><label for="ac-code">Code</label><input id="ac-code" class="code-in" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${esc(S.code)}" placeholder="••••••" required></div>
        ${S.demoCode ? `<p class="demo-code">Demo: no text is sent. Your code is <b>${esc(S.demoCode)}</b>.</p>` : ''}`
      : `<div class="field"><label for="ac-phone">Mobile number</label><input id="ac-phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(S.phone)}" placeholder="0917 123 4567" required></div>`}
      ${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}
      <button class="btn btn-accent btn-lg" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spinner"></span>' : code ? 'Log in' : 'Text me a code'}</button>
      ${code ? '<div class="row" style="justify-content:space-between"><button type="button" class="link-btn" data-act="back">Use another number</button><button type="button" class="link-btn" data-act="resend">Send a new code</button></div>' : ''}
    </form>
    ${demo && !code ? '<p class="muted small">Demo: try 0917 000 0100 (Marco Reyes).</p>' : ''}
  </section>`;
}

function home() {
  if (S.loading && !S.data) return '<div class="center"><div><span class="spinner"></span><p class="muted">Loading your visits…</p></div></div>';
  if (!S.data) return `<div class="acct-card"><p class="err">${esc(S.err || 'Couldn’t load your visits.')}</p><button class="btn" data-act="reload">Try again</button></div>`;
  const d = S.data, first = String(d.name || '').split(' ')[0] || 'there', L = d.loyalty;
  const again = d.again && (d.again.svc.length || d.again.barber) ? `./?${d.again.svc.length ? 'svc=' + d.again.svc.join(',') + '&' : ''}${d.again.barber ? 'barber=' + encodeURIComponent(d.again.barber) : ''}#book`.replace('&#book', '#book') : '';
  let loy = '';
  if (L) {
    const k = L.visits % L.every, left = L.every - 1 - k;
    loy = `<section class="acct-card"><h2>Loyalty card</h2><div class="loy-big"><span class="meter">${Array.from({ length: Math.min(L.every, 12) }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('')}</span>
      <b>${L.nextFree ? 'Your next visit is free' : k === 0 && L.visits ? 'Free visit used. New card started' : `${left} more visit${left === 1 ? '' : 's'} to a free cut`}</b></div>
      <p class="muted small">Every ${L.every}th visit is on us. ${d.visitCount} visit${d.visitCount === 1 ? '' : 's'} so far.</p></section>`;
  }
  const upcoming = d.upcoming.length ? d.upcoming.map(u => {
    const dt = new Date(u.date + 'T00:00:00'), link = u.token ? `booking.html?id=${encodeURIComponent(u.id)}&t=${encodeURIComponent(u.token)}` : '';
    const label = u.source === 'walk-in' ? `Walk-in${u.queueNo ? ' #' + u.queueNo : ''}` : fmtTime(u.time);
    return `<div class="up-item"><div class="up-date"><small>${MONTHS[dt.getMonth()]}</small><b>${dt.getDate()}</b></div>
      <div><b>${esc(label)} · ${esc(u.services.join(' + ') || 'Visit')}</b><div class="muted small">${u.barberName ? 'with ' + esc(u.barberName) : u.source === 'walk-in' ? 'next free barber' : 'the shop will assign your barber'}${u.status === 'pending_payment' ? ' · waiting for your deposit' : ''}</div></div>
      ${link ? `<a class="btn btn-sm" href="${esc(link)}">${u.status === 'pending_payment' ? 'Pay deposit' : 'Manage'}</a>` : ''}</div>`;
  }).join('') : '<p class="muted">Nothing booked yet.</p>';
  const shown = S.allVisits ? d.visits : d.visits.slice(0, 6);
  const visits = d.visits.length ? shown.map(v => `<div class="visit-row"><div><b>${esc(fmtDate(v.date, true))}</b><div class="sub">${esc(v.services.join(', '))}${v.barberName ? ' · ' + esc(v.barberName) : ''}</div></div>
      <div class="amt">${m(v.total)}${v.receipt ? `<div><a class="link-btn small" href="receipt.html?id=${encodeURIComponent(v.receipt.id)}&t=${encodeURIComponent(v.receipt.t)}">Receipt</a></div>` : ''}</div></div>`).join('')
    : '<p class="muted">Your visits show here after your first cut.</p>';
  const more = d.visits.length > 6 && !S.allVisits ? `<button type="button" class="btn btn-sm" data-act="allVisits" style="justify-self:start">Show all ${d.visits.length} visits</button>` : '';
  return `<section class="acct-hi"><div><p class="eyebrow">My visits</p><h1>Hi, ${esc(first)}</h1><p class="muted small">${esc(d.phone)}${d.birthday ? ` · Birthday ${esc(fmtBday(d.birthday))}: your haircut is on us` : ''}</p></div><button type="button" class="btn btn-sm btn-ghost" data-act="logout">Log out</button></section>
    <div class="row">${again ? `<a class="btn btn-accent" href="${esc(again)}">Book the same again</a>` : ''}<a class="btn" href="./#book">Book something new</a></div>
    ${loy}
    ${(d.coupons || []).length ? `<section class="acct-card"><h2>Your coupons</h2><ul class="cp-acct">${d.coupons.map(cp => `<li><span class="cp-tag">${esc(cp.label)}</span><span>${esc(cp.note || 'Use it on your next visit')}${cp.expires ? `<small class="muted"> · until ${esc(fmtDate(cp.expires))}</small>` : ''}</span></li>`).join('')}</ul><p class="muted small">Show this at checkout. Each coupon is used once.</p></section>` : ''}
    <section class="acct-card"><h2>Coming up</h2>${upcoming}</section>
    <section class="acct-card"><h2>Past visits</h2>${visits}${more}</section>`;
}

async function load() {
  S.loading = true; render();
  try { S.data = await call('myAccount', { session: S.session }); S.err = ''; }
  catch (e) {
    if (e.code === 'unauthenticated' || /log in/i.test(e.message || '')) { S.session = ''; try { localStorage.removeItem(KEY); } catch (_) {} S.step = 'phone'; S.err = e.message; }
    else S.err = e.message || 'Couldn’t load your visits.';
  }
  S.loading = false; render();
}
async function sendCode() {
  S.busy = true; S.err = ''; render();
  try { const r = await call('requestCode', { phone: S.phone }); S.demoCode = r.demoCode || ''; S.step = 'code'; S.code = ''; }
  catch (e) { S.err = e.message || 'Couldn’t send a code. Try again.'; }
  S.busy = false; render();
}

document.addEventListener('submit', async e => {
  if (e.target.id !== 'login-form') return; e.preventDefault();
  if (S.step === 'phone') { S.phone = $('#ac-phone').value.trim(); return sendCode(); }
  S.code = $('#ac-code').value.trim(); S.busy = true; S.err = ''; render();
  try { const r = await call('verifyCode', { phone: S.phone, code: S.code }); S.session = r.session; try { localStorage.setItem(KEY, r.session); } catch (_) {} S.busy = false; S.step = 'phone'; return load(); }
  catch (err) { S.err = err.message || 'That code isn’t right.'; }
  S.busy = false; render();
});
document.addEventListener('input', e => { if (e.target.id === 'ac-code' && e.target.value.replace(/\D/g, '').length === 6) $('#login-form').requestSubmit(); });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'back') { S.step = 'phone'; S.err = ''; S.demoCode = ''; render(); }
  if (act === 'resend') sendCode();
  if (act === 'reload') load();
  if (act === 'allVisits') { S.allVisits = true; render(); }
  if (act === 'logout') { const t = S.session; S.session = ''; S.data = null; try { localStorage.removeItem(KEY); } catch (_) {} render(); call('logoutClient', { session: t }).catch(() => {}); }
  if (act === 'resetDemo') { const fb = await import('./fb.js'); fb.resetDemo(); }
});

render();
db.doc('public/info').get().then(s => { if (s.exists) { S.info = { ...STARTER, ...s.data(), shop: { ...STARTER.shop, ...(s.data().shop || {}) } }; render(); } }).catch(() => {});
if (S.session) load();
