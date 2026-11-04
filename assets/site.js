// Customer website: menu, team, hours and the booking flow (pays the deposit through PayMongo).
import { db, call, demoBar, resetDemo } from './fb.js';
import {
  $, esc, money, priceLabel, fmtTime, fmtDate, DAYS, DAYS_LONG, MONTHS, toMin, sum, phNow, dowOf, policyOf, openStatus,
  availableTimes, bookableDates, eligibleBarbers, timeChips, initials, STARTER, STARTER_STAFF, publicBarber
} from './shared.js';

const S = {
  info: null, loaded: false, slow: false, menuTab: 'him',
  slots: {}, slotsDate: '', slotsLoaded: false, unsub: null,
  bk: { group: 'him', svc: {}, barber: '', date: '', time: '', name: '', phone: '', email: '', notes: '', consent: false },
  err: '', busy: false, last: null
};
const PREVIEW = { ...STARTER, barbers: STARTER_STAFF.map(publicBarber) };
const info = () => S.info || PREVIEW;
const cur = () => info().shop.currency || '₱';
const m = n => money(n, cur());
const svcs = () => (info().services || []).filter(s => s.active !== false);
const chosen = () => svcs().filter(s => S.bk.svc[s.id]);
const barber = id => (info().barbers || []).find(b => b.id === id);
try { S.last = JSON.parse(localStorage.getItem('lastBooking') || 'null'); } catch (_) {}

// ---------- render ----------
let raf = 0;
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
function render() {
  const a = document.activeElement, id = a && a.id; let s = null, e = null;
  try { s = a.selectionStart; e = a.selectionEnd; } catch (_) {}
  $('#app').innerHTML = page();
  if (id) { const n = document.getElementById(id); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (s != null) n.setSelectionRange(s, e); } catch (_) {} } }
}

function hoursSummary(hrs) {
  const open = hrs.filter(h => !h.closed);
  if (open.length === 7 && open.every(h => h.open === open[0].open && h.close === open[0].close)) return `Daily ${fmtTime(open[0].open)} – ${fmtTime(open[0].close)}`;
  return open.length ? `${open.length} days a week` : 'Closed';
}

function page() {
  const I = info(), shop = I.shop, st = openStatus(I), today = phNow();
  const th = I.hours.find(h => h.d === today.dow);
  const inToday = (I.barbers || []).filter(b => (b.days || []).includes(today.dow));
  const cut = svcs().find(s => /deluxe haircut$/i.test(s.name)) || svcs()[0];
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.name + ' ' + shop.address)}`;
  if (!S.loaded) return `<div class="center"><div><span class="wordmark">${esc(shop.wordmark || shop.name)}</span><p class="muted">${S.slow ? `We can’t load the booking calendar right now. Call us at <b>${esc(shop.phone)}</b>.` : 'Loading…'}</p></div></div>`;
  return `${demoBar('admin/')}
  <header class="site-head"><div class="wrap head-in">
    <a class="wordmark" href="#top" data-act="top"><span class="mark" aria-hidden="true">R3</span>${esc(shop.wordmark || shop.name)}</a>
    <nav class="site-nav" aria-label="Sections">
      <button class="lnk" data-act="scroll" data-to="services">Services</button>
      <button class="lnk" data-act="scroll" data-to="team">Team</button>
      <button class="lnk" data-act="scroll" data-to="visit">Visit</button>
      <button class="btn btn-accent btn-sm" data-act="scroll" data-to="book">Book now</button>
    </nav>
  </div></header>
  ${S.last && S.last.date >= today.date ? `<div class="wrap" style="padding-block:12px"><p class="note row" style="justify-content:space-between"><span>You have a booking for <b>${fmtDate(S.last.date)}, ${fmtTime(S.last.time)}</b>.</span><a class="btn btn-sm" href="booking.html?id=${encodeURIComponent(S.last.id)}&t=${encodeURIComponent(S.last.token)}">View booking</a></p></div>` : ''}

  <section class="hero-dark" id="top"><div class="wrap hero-grid">
    <div>
      <span class="chip"><b aria-hidden="true" style="color:${st.open ? 'var(--good)' : 'var(--hero-muted)'}">●</b>${esc(st.text)}</span>
      <h1>${esc(shop.tagline)}</h1>
      <p class="lede">${esc(shop.about)}</p>
      <div class="hero-cta"><button class="btn btn-accent btn-lg" data-act="scroll" data-to="book">Book an appointment</button><button class="btn btn-ghost btn-lg" data-act="scroll" data-to="services">See prices</button></div>
      <dl class="facts">
        ${cut ? `<div><dt>${esc(cut.name)}</dt><dd>${m(cut.price)}</dd></div>` : ''}
        <div><dt>Hours</dt><dd>${esc(hoursSummary(I.hours))}</dd></div>
        <div><dt>Deposit to book</dt><dd>${m(policyOf(I).deposit)}</dd></div>
      </dl>
    </div>
    <aside class="hero-card" aria-label="Today at the shop">
      <p class="eyebrow" style="color:var(--hero-muted)">Today, ${DAYS_LONG[today.dow]}</p>
      <p style="font:800 26px/1 var(--f-display)">${th && !th.closed ? `${fmtTime(th.open)} – ${fmtTime(th.close)}` : 'Closed today'}</p>
      ${th && !th.closed && inToday.length ? `<p class="row small">In today: <b>${inToday.map(b => esc(b.name)).join(', ')}</b></p>` : ''}
      <p class="row small">${esc(shop.address)}</p>
      <p class="row small"><b>${esc(shop.phone)}</b><button class="btn btn-sm btn-ghost" data-act="copy" data-text="${esc(shop.phone)}">Copy</button></p>
    </aside>
  </div></section>

  <section id="services" class="sec alt"><div class="wrap">
    <div class="sec-head"><h2 class="sec-title">Services & prices</h2>
      <div class="tabs" role="tablist">${[['him', 'For him'], ['her', 'For her']].map(([k, l]) => `<button role="tab" aria-selected="${S.menuTab === k}" data-act="menuTab" data-v="${k}">${l}</button>`).join('')}</div></div>
    ${menuBoard(S.menuTab)}
  </div></section>

  <section id="book" class="sec"><div class="wrap">
    <div class="sec-head"><h2 class="sec-title">Book an appointment</h2><p class="muted small">Pay a ${m(policyOf(I).deposit)} deposit to lock in your slot. It goes toward your bill.</p></div>
    ${booker()}
  </div></section>

  <section id="team" class="sec alt"><div class="wrap">
    <div class="sec-head"><h2 class="sec-title">The team</h2></div>
    <div class="barbers">${(I.barbers || []).map(b => `
      <article class="barber">
        <span class="mono" aria-hidden="true">${esc(initials(b.name))}</span>
        <div><h3>${esc(b.name)}</h3><p class="muted small">${esc(b.title || '')}${b.specialty ? ' · ' + esc(b.specialty) : ''}</p></div>
        <div class="days" aria-label="Days in">${[1, 2, 3, 4, 5, 6, 0].map(i => `<span class="${(b.days || []).includes(i) ? 'on' : ''}" title="${DAYS_LONG[i]}">${DAYS[i].slice(0, 2)}</span>`).join('')}</div>
        <button class="btn btn-sm" data-act="bookWith" data-id="${esc(b.id)}">Book with ${esc(b.name)}</button>
      </article>`).join('')}</div>
  </div></section>

  <section id="visit" class="sec"><div class="wrap">
    <div class="sec-head"><h2 class="sec-title">Visit us</h2></div>
    <div class="visit">
      <table class="hours"><tbody>${[1, 2, 3, 4, 5, 6, 0].map(d => { const h = I.hours.find(x => x.d === d); return `<tr class="${d === today.dow ? 'now' : ''}"><td>${DAYS_LONG[d]}</td><td>${h && !h.closed ? `${fmtTime(h.open)} – ${fmtTime(h.close)}` : 'Closed'}</td></tr>`; }).join('')}</tbody></table>
      <div class="stack">
        <div><p class="eyebrow">Address</p><p style="font-size:18px;font-weight:600;margin-top:4px">${esc(shop.address)}</p><p style="margin-top:6px"><a href="${esc(mapUrl)}" target="_blank" rel="noopener">Open in Google Maps</a></p></div>
        <div><p class="eyebrow">Call or text</p><p class="row" style="margin-top:4px"><span style="font-size:18px;font-weight:600">${esc(shop.phone)}</span><button class="btn btn-sm" data-act="copy" data-text="${esc(shop.phone)}">Copy</button></p></div>
        ${shop.facebook ? `<div><p class="eyebrow">Facebook</p><p style="margin-top:4px"><a href="${esc(shop.facebook)}" target="_blank" rel="noopener">${esc(shop.facebook.replace(/^https?:\/\/(www\.)?/, ''))}</a></p></div>` : ''}
      </div>
    </div>
    <h3 class="sec-title" style="font-size:30px;margin:44px 0 16px">Booking policy</h3>
    ${policyCards()}
  </div></section>
  <footer class="site-foot"><div class="wrap"><span>© ${today.date.slice(0, 4)} ${esc(shop.name)}</span><span>${esc(shop.address)}</span></div></footer>`;
}

function policyCards() {
  const p = policyOf(info());
  return `<div class="policy">
    <div><b>${m(p.deposit)}</b><span>Deposit to confirm your booking, paid online by GCash, Maya or card. It’s deducted from your bill.</span></div>
    <div><b>${p.lateMinutes} min</b><span>Arriving ${p.lateMinutes} minutes late or more cancels the booking, and the deposit isn’t refunded.</span></div>
    <div><b>${p.rescheduleHours} hrs</b><span>Reschedule online up to ${p.rescheduleHours} hours before your appointment, using the link in your confirmation email.</span></div>
  </div>`;
}

function menuBoard(group) {
  const list = svcs().filter(s => (s.group || 'him') === group);
  const cats = [...new Set(list.map(s => s.cat || 'Services'))];
  if (!list.length) return '<p class="empty">Menu coming soon.</p>';
  return `<div class="board">${cats.map(c => `<div class="${/promo/i.test(c) ? 'promo' : ''}"><h3>${esc(c)}</h3><ul>${list.filter(s => (s.cat || 'Services') === c).map(s => `
    <li><div class="mi"><span class="mi-name">${esc(s.name)}</span><span class="leader" aria-hidden="true"></span><span class="mi-price">${esc(priceLabel(s, cur()))}</span></div>
    <p class="mi-meta">${esc(s.mins)} min${s.desc ? ' · ' + esc(s.desc) : ''}</p></li>`).join('')}</ul></div>`).join('')}</div>`;
}

// ---------- booking ----------
function booker() {
  const I = info(), b = S.bk, pol = policyOf(I), picked = chosen();
  const bars = (I.barbers || []).filter(x => (x.groups || ['him']).includes(b.group));
  const dates = bookableDates(I).map(d => ({ ...d, off: !d.closed && b.barber && !(barber(b.barber)?.days || []).includes(dowOf(d.date)) }));
  const times = b.date && picked.length ? availableTimes(I, { services: picked, date: b.date, barberId: b.barber }, S.slots) : [];
  const step1 = picked.length > 0, step3 = step1 && b.date && b.time;
  const total = sum(picked, s => s.price), from = picked.some(s => s.priceFrom);
  const assigned = b.time ? (times.find(t => t.time === b.time) || { barbers: [] }).barbers : [];
  const ready = step3 && b.name.trim() && b.phone.trim() && b.email.trim() && b.consent;
  return `<div class="booker"><div class="steps">
    <section class="step"><div class="step-h"><span class="n">1</span><h3>Choose services</h3>${picked.length ? `<span class="done">${picked.length} selected</span>` : ''}</div>
      <div class="tabs" role="tablist">${[['him', 'For him'], ['her', 'For her']].map(([k, l]) => `<button role="tab" type="button" aria-selected="${b.group === k}" data-act="bkGroup" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="pick">${svcs().filter(s => (s.group || 'him') === b.group).map(s => `<button type="button" class="pickcard" data-act="bkSvc" data-id="${esc(s.id)}" aria-pressed="${!!b.svc[s.id]}"><b>${esc(s.name)}</b><small>${esc(s.mins)} min${/promo/i.test(s.cat || '') ? ' · Promo' : ''}</small><span class="p">${esc(priceLabel(s, cur()))}</span></button>`).join('')}</div>
    </section>
    <section class="step" ${step1 ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n">2</span><h3>Choose your ${b.group === 'her' ? 'stylist' : 'barber'}</h3></div>
      <div class="pick">
        <button type="button" class="pickcard" data-act="bkBarber" data-id="" aria-pressed="${!b.barber}" ${step1 ? '' : 'disabled'}><b>Any available</b><small>Earliest free chair</small></button>
        ${bars.map(x => `<button type="button" class="pickcard" data-act="bkBarber" data-id="${esc(x.id)}" aria-pressed="${b.barber === x.id}" ${step1 ? '' : 'disabled'}><b>${esc(x.name)}</b><small>${esc(x.title || '')}</small></button>`).join('')}
      </div>
    </section>
    <section class="step" ${step1 ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n">3</span><h3>Pick a date and time</h3>${b.date && b.time ? `<span class="done">${fmtDate(b.date)}, ${fmtTime(b.time)}</span>` : ''}</div>
      <div class="dates" role="group" aria-label="Date">${dates.map(d => { const x = new Date(`${d.date}T00:00:00Z`); return `<button type="button" class="dchip" data-act="bkDate" data-v="${d.date}" aria-pressed="${d.date === b.date}" ${d.closed || d.off || !step1 ? 'disabled' : ''}><small>${DAYS[x.getUTCDay()]}</small><b>${x.getUTCDate()}</b><span>${d.closed ? 'Closed' : d.off ? 'Off' : MONTHS[x.getUTCMonth()]}</span></button>`; }).join('')}</div>
      ${step1 && b.date ? (S.slotsLoaded ? timeChips(times, b.time, 'bkTime') : '<p class="muted small"><span class="spinner"></span> Checking free times…</p>') : `<p class="muted small">${step1 ? 'Pick a date to see free times.' : 'Choose a service first.'}</p>`}
    </section>
    <section class="step" ${step3 ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n">4</span><h3>Your details</h3></div>
      <div class="fgrid">
        ${fieldIn('Full name', 'bk-name', 'name', 'text', 'name')}
        ${fieldIn('Mobile number', 'bk-phone', 'phone', 'tel', 'tel', '0917 123 4567')}
      </div>
      ${fieldIn('Email (for your confirmation and booking link)', 'bk-email', 'email', 'email', 'email', 'you@example.com')}
      <div class="field"><label for="bk-notes">Notes (optional)</label><textarea id="bk-notes" data-bind="bk.notes" rows="2" placeholder="Style, reference photo on Facebook, anything we should know">${esc(b.notes)}</textarea></div>
      <label class="row small" style="align-items:flex-start;flex-wrap:nowrap"><input type="checkbox" id="bk-consent" data-bind="bk.consent" data-live ${b.consent ? 'checked' : ''} style="margin-top:2px"><span>I agree to the booking policy: the ${m(pol.deposit)} deposit isn’t refunded if I cancel or arrive ${pol.lateMinutes}+ minutes late. ${esc(info().shop.name)} may use my name, number and email to manage this booking and send reminders.</span></label>
    </section>
  </div>
  <aside class="summary" aria-label="Booking summary">
    <div class="band" aria-hidden="true" style="background:var(--ink);height:6px"></div>
    <div class="summary-b">
      <h3>Your booking</h3>
      <div class="sumrow"><span>Services</span><b>${picked.length ? picked.map(s => esc(s.name)).join('<br>') : '—'}</b></div>
      <div class="sumrow"><span>${b.group === 'her' ? 'Stylist' : 'Barber'}</span><b>${b.barber ? esc(barber(b.barber)?.name || '') : assigned.length ? `Any available` : 'Any available'}</b></div>
      <div class="sumrow"><span>When</span><b>${b.date && b.time ? `${fmtDate(b.date)}<br>${fmtTime(b.time)}` : '—'}</b></div>
      <div class="sumrow"><span>Estimated total</span><b>${picked.length ? (from ? 'from ' : '') + m(total) : '—'}</b></div>
      <div class="due"><span>Due now</span><b>${m(pol.deposit)}</b></div>
      <p class="muted small">Deposit secures your slot for ${pol.holdMinutes} minutes while you pay. Pay the rest at the shop.</p>
      ${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}
      <button type="button" class="btn btn-accent btn-lg" data-act="pay" ${ready && !S.busy ? '' : 'disabled'}>${S.busy ? '<span class="spinner"></span> Securing your slot…' : `Pay ${m(pol.deposit)} deposit`}</button>
      <p class="muted small">You’ll pay on PayMongo’s secure page with GCash, Maya or card.</p>
    </div>
  </aside></div>`;
}
function fieldIn(label, id, key, type, ac, ph = '') {
  return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" type="${type}" data-bind="bk.${key}" data-live value="${esc(S.bk[key])}" autocomplete="${ac}" ${ph ? `placeholder="${esc(ph)}"` : ''}></div>`;
}

function watchSlots() {
  const d = S.bk.date;
  if (!d || d === S.slotsDate) return;
  if (S.unsub) S.unsub();
  S.slotsDate = d; S.slots = {}; S.slotsLoaded = false; S.unsub = null;
  S.unsub = db.collection('slots').where('date', '==', d).onSnapshot(s => {
    S.slots = Object.fromEntries(s.docs.map(x => [x.id, x.data()])); S.slotsLoaded = true;
    if (S.bk.time && !S.busy) { const t = availableTimes(info(), { services: chosen(), date: d, barberId: S.bk.barber }, S.slots).find(x => x.time === S.bk.time); if (!t || !t.barbers.length) { S.bk.time = ''; S.err = 'Someone just booked that time. Please pick another.'; } }
    schedule();
  }, () => { S.slotsLoaded = true; schedule(); });
}
function firstDate() {
  const b = S.bk;
  const d = bookableDates(info()).find(x => !x.closed && (!b.barber || (barber(b.barber)?.days || []).includes(dowOf(x.date))));
  return d ? d.date : '';
}

// ---------- actions ----------
const ACT = {
  resetDemo,
  top() { window.scrollTo({ top: 0, behavior: 'smooth' }); },
  scroll(el) { document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); },
  async copy(el) { try { await navigator.clipboard.writeText(el.dataset.text); toast('Copied'); } catch (_) { toast(el.dataset.text); } },
  menuTab(el) { S.menuTab = el.dataset.v; render(); },
  bkGroup(el) { if (S.bk.group === el.dataset.v) return; S.bk.group = el.dataset.v; S.bk.svc = {}; S.bk.barber = ''; S.bk.time = ''; render(); },
  bkSvc(el) { const id = el.dataset.id; S.bk.svc[id] = !S.bk.svc[id]; S.bk.time = ''; S.err = ''; if (!S.bk.date) { S.bk.date = firstDate(); watchSlots(); } render(); },
  bkBarber(el) { S.bk.barber = el.dataset.id; S.bk.time = ''; S.err = ''; const b = barber(S.bk.barber); if (b && S.bk.date && !(b.days || []).includes(dowOf(S.bk.date))) S.bk.date = firstDate(); watchSlots(); render(); },
  bkDate(el) { S.bk.date = el.dataset.v; S.bk.time = ''; S.err = ''; watchSlots(); render(); },
  bkTime(el) { S.bk.time = el.dataset.v; S.err = ''; render(); },
  bookWith(el) {
    const b = barber(el.dataset.id); if (!b) return;
    const g = (b.groups || ['him'])[0];
    if (S.bk.group !== g) { S.bk.group = g; S.bk.svc = {}; }
    S.bk.barber = b.id; S.bk.time = ''; S.bk.date = firstDate(); watchSlots(); render();
    ACT.scroll({ dataset: { to: 'book' } });
  },
  async pay() {
    const b = S.bk;
    const when = { date: b.date, time: b.time };
    S.busy = true; S.err = ''; render();
    try {
      const r = await call('createBooking', { serviceIds: Object.keys(b.svc).filter(k => b.svc[k]), barberId: b.barber, date: b.date, time: b.time, name: b.name, phone: b.phone, email: b.email, notes: b.notes, consent: b.consent });
      try { localStorage.setItem('lastBooking', JSON.stringify({ id: r.id, token: r.token, ...when })); } catch (_) {}
      location.href = r.checkoutUrl;
    } catch (e) {
      S.busy = false; S.err = e.message || 'Something went wrong. Please try again.';
      if (e.code === 'already-exists') b.time = '';
      render();
    }
  }
};
let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }
function setPath(path, val) { const k = path.split('.'); let o = S; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = val; }
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const f = ACT[el.dataset.act]; if (f) { if (el.tagName === 'A') e.preventDefault(); f(el, e); } });
document.addEventListener('input', e => { const el = e.target; if (!el.dataset || !el.dataset.bind) return; setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value); S.err = ''; if (el.hasAttribute('data-live')) schedule(); });

// ---------- start ----------
render();
{
  const slow = setTimeout(() => { S.slow = true; schedule(); }, 10000);
  db.doc('public/info').onSnapshot(s => {
    clearTimeout(slow);
    S.info = s.exists ? s.data() : null; S.loaded = true; schedule();
  }, () => { S.slow = true; schedule(); });
}
