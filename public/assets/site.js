// Customer website: menu, gallery, team, reviews, hours and the booking flow (pays the deposit through PayMongo).
// The page is drawn once; the booking panel, menu tabs and lightbox redraw on their own so animations don't replay.
import { db, call, demo, demoBar, resetDemo } from './fb.js';
import {
  $, esc, money, priceLabel, fmtTime, fmtDate, DAYS, DAYS_LONG, MONTHS, sum, phNow, dowOf, policyOf, openStatus,
  availableTimes, bookableDates, timeChips, initials, canServe, comboError, TIERS, STARTER, STARTER_STAFF, publicBarber, revealOnScroll, morph, brand, LOGO_LG, dur
} from './shared.js';

const S = {
  info: null, loaded: false, slow: false, menuTab: 'him', painted: false,
  slots: {}, slotsDate: '', slotsLoaded: false, unsub: null,
  bk: { group: 'him', tier: '', svc: {}, barber: '', date: '', time: '', name: '', phone: '', email: '', notes: '', consent: false },
  err: '', busy: false, last: null, lb: -1,
  wl: { open: false, window: 'any', consent: false, done: '', err: '', busy: false }
};
const PREVIEW = { ...STARTER, barbers: STARTER_STAFF.map(publicBarber) };
const info = () => S.info || PREVIEW;
const cur = () => info().shop.currency || '₱';
const m = n => money(n, cur());
const svcs = () => (info().services || []).filter(s => s.active !== false);
const chosen = () => svcs().filter(s => S.bk.svc[s.id]);
// Menu and booking tabs: For him, For her, and Nails once nail services are on the menu
const groupTabs = () => [['him', 'For him'], ['her', 'For her'], ['nails', 'Nails']].filter(([k]) => k !== 'nails' || svcs().some(x => x.group === 'nails'));
const hasTiers = g => svcs().some(s => (s.group || 'him') === g && s.kind === 'base');
const tierNames = t => (info().barbers || []).filter(b => (b.tiers || []).includes(t)).map(b => b.name);
const listNames = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
const barber = id => (info().barbers || []).find(b => b.id === id);
const gallery = () => (info().gallery || []).slice(0, 12);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
try { S.last = JSON.parse(localStorage.getItem('lastBooking') || 'null'); } catch (_) {}

const ICON = {
  star: '<path d="M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z" fill="currentColor" stroke="none"/>',
  pin: '<path d="M10 18s6-5.3 6-10a6 6 0 10-12 0c0 4.7 6 10 6 10z"/><circle cx="10" cy="8" r="2.2"/>',
  phone: '<path d="M4 3h3l1.5 4-2 1.3a10 10 0 005.2 5.2L13 11.5l4 1.5v3a1.5 1.5 0 01-1.6 1.5A14.5 14.5 0 012.5 4.6 1.5 1.5 0 014 3z"/>',
  clock: '<circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3 2"/>',
  arrow: '<path d="M4 10h12M11 5l5 5-5 5"/>',
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  scissors: '<circle cx="6" cy="14.5" r="2.5"/><circle cx="14" cy="14.5" r="2.5"/><path d="M7.6 12.6L15 3M12.4 12.6L5 3"/>',
  camera: '<rect x="2.5" y="2.5" width="15" height="15" rx="4.5"/><circle cx="10" cy="10" r="3.3"/><circle cx="14.6" cy="5.4" r=".6" fill="currentColor"/>',
  user: '<circle cx="10" cy="6.5" r="3.2"/><path d="M3.5 17.5a6.5 6.5 0 0113 0"/>',
  close: '<path d="M5 5l10 10M15 5L5 15"/>', left: '<path d="M12.5 4.5L7 10l5.5 5.5"/>', right: '<path d="M7.5 4.5L13 10l-5.5 5.5"/>'
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

// ---------- drawing ----------
let raf = 0;
const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderAll); };
function keepFocus(fn) {
  const a = document.activeElement, id = a && a.id; let s = null, e = null;
  try { s = a.selectionStart; e = a.selectionEnd; } catch (_) {}
  fn();
  if (id) { const n = document.getElementById(id); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (s != null) n.setSelectionRange(s, e); } catch (_) {} } }
}
function renderAll() {
  keepFocus(() => { $('#app').innerHTML = page(); });
  S.painted = true;
  revealOnScroll();
  syncHeader();
}
function renderBooker() { const el = $('#booker'); if (el) morph(el, booker()); syncStickyBar(); }
function renderMenu() { const el = $('#menu-board'); if (el) el.innerHTML = menuBoard(S.menuTab); document.querySelectorAll('[data-act=menuTab]').forEach(b => b.setAttribute('aria-selected', b.dataset.v === S.menuTab)); }

function hoursSummary(hrs) {
  const open = hrs.filter(h => !h.closed);
  if (open.length === 7 && open.every(h => h.open === open[0].open && h.close === open[0].close)) return `Daily ${fmtTime(open[0].open)} – ${fmtTime(open[0].close)}`;
  return open.length ? `${open.length} days a week` : 'Closed';
}
function ratingChip(sh, light) {
  if (sh.googleRating === '' || sh.googleRating == null) return '';
  const inner = `${ic('star', 'star')}<b>${Number(sh.googleRating).toFixed(1)}</b><span>${sh.googleCount ? `${sh.googleCount} ${esc(sh.ratingSource || 'Google')} reviews` : `on ${esc(sh.ratingSource || 'Google')}`}</span>`;
  return sh.googleUrl ? `<a class="rating${light ? ' light' : ''}" href="${esc(sh.googleUrl)}" target="_blank" rel="noopener">${inner}</a>` : `<span class="rating${light ? ' light' : ''}">${inner}</span>`;
}

function page() {
  const I = info(), shop = I.shop, st = openStatus(I), today = phNow(), an = I.announcement || {};
  if (!S.loaded) return `<div class="center"><div><span class="wordmark">${brand(shop.wordmark || shop.name)}</span><p class="muted">${S.slow ? `We can’t load the booking calendar right now. Call us at <b>${esc(shop.phone)}</b>.` : '<span class="spinner"></span>'}</p></div></div>`;
  const th = I.hours.find(h => h.d === today.dow);
  const inToday = (I.barbers || []).filter(b => (b.days || []).includes(today.dow));
  const cuts = svcs().filter(s => (s.group || 'him') === 'him' && /haircut$/i.test(s.name)).sort((x, y) => x.price - y.price);
  const cut = cuts[0] ? { name: cuts.length > 1 ? 'Haircuts from' : cuts[0].name, price: cuts[0].price } : svcs()[0];
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.name + ' ' + shop.address)}`;
  const anim = S.painted ? '' : ' hero-anim';
  const gal = gallery(), revs = (I.reviews || []).slice(0, 6);
  return `${demoBar('admin/')}
  ${an.active && an.text ? `<div class="announce">${an.link ? `<a href="${esc(an.link)}" target="_blank" rel="noopener">${esc(an.text)} ${ic('arrow')}</a>` : `<span>${esc(an.text)}</span>`}</div>` : ''}
  <header class="site-head" id="site-head"><div class="wrap head-in">
    <a class="wordmark" href="#top" data-act="top" aria-label="${esc(shop.name)} home">${brand(shop.wordmark || shop.name)}</a>
    <nav class="site-nav" aria-label="Sections">
      <button class="lnk" data-act="scroll" data-to="services">Services</button>
      ${gal.length || demo ? '<button class="lnk" data-act="scroll" data-to="gallery">Gallery</button>' : ''}
      <button class="lnk" data-act="scroll" data-to="team">Team</button>
      <button class="lnk" data-act="scroll" data-to="visit">Visit</button>
      <button class="btn btn-accent btn-sm" data-act="scroll" data-to="book">Book now</button>
    </nav>
  </div></header>
  ${S.last && S.last.date >= today.date ? `<div class="wrap" style="padding-block:12px"><p class="note row" style="justify-content:space-between"><span>You have a booking for <b>${fmtDate(S.last.date)}, ${fmtTime(S.last.time)}</b>.</span><a class="btn btn-sm" href="booking.html?id=${encodeURIComponent(S.last.id)}&t=${encodeURIComponent(S.last.token)}">View booking</a></p></div>` : ''}

  <section class="hero-x${shop.heroPhoto ? ' has-photo' : ''}" id="top">
    ${shop.heroPhoto ? `<div class="hero-photo" style="background-image:url('${esc(shop.heroPhoto)}')" role="img" aria-label="Inside ${esc(shop.name)}"></div>` : ''}
    <div class="brick" aria-hidden="true"></div>
    <img class="hero-mark" src="${LOGO_LG}" alt="" aria-hidden="true" width="640" height="640">
    <div class="wrap hero-grid${anim}">
      <div class="hero-copy">
        <div class="row hero-chips"><span class="chip open-chip"><b aria-hidden="true" class="${st.open ? 'pulse' : ''}" style="color:${st.open ? 'var(--good)' : 'var(--hero-muted)'}">●</b>${esc(st.text)}</span>${ratingChip(shop, true)}</div>
        <h1>${esc(shop.tagline)}</h1>
        <p class="lede">${esc(shop.about)}</p>
        <div class="hero-cta"><button class="btn btn-accent btn-lg" data-act="scroll" data-to="book">Book an appointment ${ic('arrow')}</button><button class="btn btn-ghost btn-lg" data-act="scroll" data-to="services">See prices</button></div>
        <dl class="facts">
          ${cut ? `<div><dt>${esc(cut.name)}</dt><dd>${m(cut.price)}</dd></div>` : ''}
          <div><dt>Hours</dt><dd>${esc(hoursSummary(I.hours))}</dd></div>
          ${policyOf(I).onlineBooking ? `<div><dt>Deposit to book</dt><dd>${m(policyOf(I).deposit)}</dd></div>` : '<div><dt>Walk-ins</dt><dd>Welcome</dd></div>'}
        </dl>
      </div>
      <div class="hero-side">
      <aside class="hero-card" aria-label="Today at the shop">
        <p class="eyebrow">Today, ${DAYS_LONG[today.dow]}</p>
        <p class="today-hours">${th && !th.closed ? `${fmtTime(th.open)} – ${fmtTime(th.close)}` : 'Closed today'}</p>
        ${th && !th.closed && inToday.length ? `<div class="faces">${inToday.slice(0, 6).map(b => b.photo ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}" title="${esc(b.name)}">` : `<span title="${esc(b.name)}">${esc(initials(b.name))}</span>`).join('')}<small>${inToday.length} in today</small></div>` : ''}
        <p class="row small">${ic('pin')}${esc(shop.address)}</p>
        <p class="row small">${ic('phone')}<b>${esc(shop.phone)}</b><button class="btn btn-sm btn-ghost" data-act="copy" data-text="${esc(shop.phone)}">Copy</button></p>
      </aside>
      </div>
    </div>
  </section>
  <div class="marquee" aria-hidden="true"><div class="track">${[0, 1].map(() => `<span>${svcs().filter(s => s.group !== 'her').slice(0, 7).concat(svcs().filter(s => s.group === 'her').slice(0, 4)).map(s => `${esc(s.name)} ${ic('scissors')}`).join(' ')}</span>`).join('')}</div></div>

  <section id="services" class="sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Menu</p><h2 class="sec-title">Services & prices</h2></div>
      <div class="tabs" role="tablist">${groupTabs().map(([k, l]) => `<button role="tab" aria-selected="${S.menuTab === k}" data-act="menuTab" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div id="menu-board" class="reveal">${menuBoard(S.menuTab)}</div>
  </div></section>

  ${gal.length || demo ? `<section id="gallery" class="sec dark-sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Gallery</p><h2 class="sec-title">Fresh from the chair</h2></div><div class="row">${shop.instagram ? `<a class="btn btn-ghost" href="${esc(shop.instagram)}" target="_blank" rel="noopener">${ic('camera')} Instagram</a>` : ''}${shop.facebook ? `<a class="btn btn-ghost" href="${esc(shop.facebook)}" target="_blank" rel="noopener">More on Facebook ${ic('arrow')}</a>` : ''}</div></div>
    ${gal.length ? `<div class="gallery">${gal.map((g, i) => `<button type="button" class="g-item reveal" data-act="lightbox" data-i="${i}" style="--d:${(i % 4) * 70}ms" aria-label="Open photo${g.caption ? ': ' + esc(g.caption) : ''}"><img src="${esc(g.url)}" alt="${esc(g.caption || 'Haircut at ' + shop.name)}" loading="lazy">${g.caption ? `<span class="g-cap">${esc(g.caption)}</span>` : ''}</button>`).join('')}</div>`
      : `<div class="gallery placeholder">${Array.from({ length: 8 }, (_, i) => `<div class="g-item g-ph reveal" style="--d:${(i % 4) * 70}ms">${ic('scissors')}<span>${i === 0 ? 'Add photos in Dashboard → Website' : ''}</span></div>`).join('')}</div>`}
  </div></section>` : ''}

  <section id="book" class="sec alt"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">${policyOf(I).onlineBooking ? 'Book online' : 'Bookings'}</p><h2 class="sec-title">Book an appointment</h2></div>${policyOf(I).onlineBooking ? `<p class="muted small">Pay a ${m(policyOf(I).deposit)} deposit to lock in your slot. It goes toward your bill.</p>` : ''}</div>
    <div id="booker">${booker()}</div>
  </div></section>

  <section id="team" class="sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">The team</p><h2 class="sec-title">Meet your barbers</h2></div></div>
    <div class="team">${(I.barbers || []).map((b, i) => `
      <article class="member reveal" style="--d:${(i % 4) * 80}ms">
        <div class="m-photo">${b.photo ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}" loading="lazy">` : `<span class="m-mono" aria-hidden="true">${esc(initials(b.name))}</span>`}${b.chair ? `<small>Chair ${esc(b.chair)}</small>` : ''}</div>
        <div class="m-body"><h3>${esc(b.name)}</h3><p class="muted small">${esc(b.title || '')}${b.specialty ? ' · ' + esc(b.specialty) : ''}</p>
        <div class="days" aria-label="Days in">${[1, 2, 3, 4, 5, 6, 0].map(d => `<span class="${(b.days || []).includes(d) ? 'on' : ''}" title="${DAYS_LONG[d]}">${DAYS[d].slice(0, 2)}</span>`).join('')}</div>
        <button class="btn btn-sm" data-act="bookWith" data-id="${esc(b.id)}">Book with ${esc(b.name)} ${ic('arrow')}</button></div>
      </article>`).join('')}</div>
  </div></section>

  ${revs.length ? `<section id="reviews" class="sec alt"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Reviews</p><h2 class="sec-title">What clients say</h2></div>${ratingChip(shop)}</div>
    <div class="reviews">${revs.map((r, i) => `<figure class="review reveal" style="--d:${(i % 3) * 90}ms"><div class="stars" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}<span>${'★'.repeat(5 - r.rating)}</span></div><blockquote>${esc(r.text)}</blockquote><figcaption><b>${esc(r.name)}</b> · ${esc(r.source || '')}</figcaption></figure>`).join('')}</div>
  </div></section>` : ''}

  <section id="visit" class="sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Visit</p><h2 class="sec-title">Find us</h2></div><a class="btn btn-primary" href="${esc(mapUrl)}" target="_blank" rel="noopener">${ic('pin')} Get directions</a></div>
    <div class="visit reveal">
      <table class="hours"><tbody>${[1, 2, 3, 4, 5, 6, 0].map(d => { const h = I.hours.find(x => x.d === d); return `<tr class="${d === today.dow ? 'now' : ''}"><td>${DAYS_LONG[d]}</td><td>${h && !h.closed ? `${fmtTime(h.open)} – ${fmtTime(h.close)}` : 'Closed'}</td></tr>`; }).join('')}</tbody></table>
      <div class="stack">
        <div class="vrow">${ic('pin')}<div><p class="eyebrow">Address</p><p class="big">${esc(shop.address)}</p></div></div>
        <div class="vrow">${ic('phone')}<div><p class="eyebrow">Call or text</p><p class="row"><span class="big">${esc(shop.phone)}</span><button class="btn btn-sm" data-act="copy" data-text="${esc(shop.phone)}">Copy</button></p></div></div>
        ${shop.instagram ? `<div class="vrow">${ic('camera')}<div><p class="eyebrow">Instagram</p><p><a href="${esc(shop.instagram)}" target="_blank" rel="noopener">@${esc(shop.instagram.replace(/\/+$/, '').split('/').pop())}</a></p></div></div>` : ''}
        ${shop.facebook ? `<div class="vrow">${ic('arrow')}<div><p class="eyebrow">Facebook</p><p><a href="${esc(shop.facebook)}" target="_blank" rel="noopener">${esc(shop.facebook.replace(/^https?:\/\/(www\.)?/, ''))}</a></p></div></div>` : ''}
      </div>
    </div>
    <h3 class="sec-title reveal" style="font-size:30px;margin:48px 0 16px">Booking policy</h3>
    ${policyCards()}
  </div></section>
  <footer class="site-foot"><div class="wrap"><span class="wordmark" style="font-size:18px">${brand(shop.wordmark || shop.name, 'sm')}</span><span>${esc(shop.address)} · ${esc(shop.phone)}</span><span>© ${today.date.slice(0, 4)} ${esc(shop.name)}</span></div></footer>
  <div class="mbar" id="mbar" hidden><div><b id="mbar-t">Book a chair</b><small id="mbar-s">${policyOf(I).onlineBooking ? m(policyOf(I).deposit) + ' deposit secures your slot' : 'Call or message us to book'}</small></div><button class="btn btn-accent" data-act="mbar">Book now</button></div>
  <div id="lightbox" hidden></div>`;
}

function policyCards() {
  const p = policyOf(info()), sh = info().shop, on = p.onlineBooking;
  const pay = on ? 'Down payment to confirm your booking, paid online by GCash, Maya or card. It’s deducted from your bill.'
    : `Down payment to confirm your booking${sh.gcashNumber ? `, sent by GCash to ${esc(sh.gcashNumber)}${sh.gcashName ? ` (${esc(sh.gcashName)})` : ''}` : ''}. Send the proof on our Facebook page. No down payment, no booking. It’s deducted from your bill.`;
  return `<div class="policy">
    <div class="reveal">${ic('check', 'pic')}<b>${m(p.deposit)}</b><span>${pay}</span></div>
    <div class="reveal" style="--d:80ms">${ic('clock', 'pic')}<b>${p.lateMinutes} min</b><span>Arriving ${p.lateMinutes} minutes late or more cancels the booking, and the down payment isn’t refunded.</span></div>
    <div class="reveal" style="--d:160ms">${ic('arrow', 'pic')}<b>${p.rescheduleHours} hrs</b><span>${on ? `Reschedule online up to ${p.rescheduleHours} hours before your appointment, using the link in your confirmation email.` : `Reschedule up to ${p.rescheduleHours} hours before your appointment by messaging us.`}</span></div>
    <div class="reveal" style="--d:240ms">${ic('user', 'pic')}<b>1 person</b><span>Each booking is for one person only. Booking for a friend too? Book a separate slot for them.</span></div>
  </div>`;
}

function menuBoard(group) {
  const list = svcs().filter(s => (s.group || 'him') === group);
  const cats = [...new Set(list.map(s => s.cat || 'Services'))];
  if (!list.length) return '<p class="empty">Menu coming soon.</p>';
  const note = c => {
    const items = list.filter(s => (s.cat || 'Services') === c), t = items[0].tier;
    if (t && items.every(s => s.tier === t) && tierNames(t).length) return `<p class="tier-note">${ic('user')} With ${esc(listNames(tierNames(t)))}</p>`;
    if (items.every(s => s.kind === 'extra')) return `<p class="tier-note">${ic('check')} Add to any Deluxe or Regular haircut</p>`;
    return '';
  };
  return `<div class="board tab-in">${cats.map(c => `<div class="${/promo/i.test(c) ? 'promo' : ''}"><h3>${esc(c)}</h3>${note(c)}<ul>${list.filter(s => (s.cat || 'Services') === c).map(s => `
    <li><div class="mi"><span class="mi-name">${esc(s.name)}</span><span class="leader" aria-hidden="true"></span><span class="mi-price">${esc(priceLabel(s, cur()))}</span></div>
    <div class="mi-row"><p class="mi-meta"><span class="mi-time">${ic('clock')}${dur(s.mins)}</span>${s.desc ? ' · ' + esc(s.desc) : ''}</p><button class="mi-book" data-act="bookSvc" data-id="${esc(s.id)}">Book ${ic('arrow')}</button></div></li>`).join('')}</ul></div>`).join('')}</div>`;
}

// ---------- booking ----------
function stepState() {
  const b = S.bk, picked = chosen().length > 0 && !comboError(info(), chosen()), when = !!(b.date && b.time);
  const details = when && b.name.trim() && b.phone.trim() && b.email.trim() && b.consent;
  return { picked, when, details, n: details ? 4 : when ? 3 : picked ? (b.date ? 2 : 1) : 0 };
}
function bookOffline() {
  const sh = info().shop;
  return `<div class="offline-book reveal"><div><h3>Book by phone or Facebook</h3><p class="muted">Online booking is coming soon. For now, book in three steps:</p>
      <ol class="steps-ol"><li><span>Call, text or message us on Facebook with the service, barber and time you want.</span></li>
      <li><span>Send the ${m(policyOf(info()).deposit)} down payment${sh.gcashNumber ? ` by GCash to <b>${esc(sh.gcashNumber)}</b>${sh.gcashName ? ` (${esc(sh.gcashName)})` : ''} <button class="btn btn-sm btn-ghost" data-act="copy" data-text="${esc(sh.gcashNumber)}">Copy</button>` : ''}</span></li>
      <li><span>Send a screenshot of the payment on our Facebook page. Your slot is saved once we confirm.</span></li></ol>
      <p class="muted small">Walk-ins are welcome too, when a chair is free.</p></div>
    <div class="offline-actions"><p class="row"><b class="big">${esc(sh.phone)}</b><button class="btn btn-sm" data-act="copy" data-text="${esc(sh.phone)}">Copy number</button></p>
    ${sh.facebook ? `<a class="btn btn-accent" href="${esc(sh.facebook)}" target="_blank" rel="noopener">Message us on Facebook ${ic('arrow')}</a>` : ''}</div></div>`;
}
function booker() {
  if (!policyOf(info()).onlineBooking) return bookOffline();
  const I = info(), b = S.bk, pol = policyOf(I), picked = chosen(), st = stepState();
  const bars = (I.barbers || []).filter(x => picked.length ? canServe(x, picked) : (x.groups || ['him']).includes(b.group));
  const dates = bookableDates(I).map(d => ({ ...d, off: !d.closed && b.barber && !(barber(b.barber)?.days || []).includes(dowOf(d.date)) }));
  const times = b.date && picked.length ? availableTimes(I, { services: picked, date: b.date, barberId: b.barber }, S.slots) : [];
  const total = sum(picked, s => s.price), from = picked.some(s => s.priceFrom), mins = sum(picked, s => s.mins);
  const labels = ['Services', b.group === 'her' ? 'Stylist' : 'Barber', 'Date & time', 'Details'];
  const done = [st.picked, st.picked && b.date, st.when, st.details];
  return `<div class="progress" aria-label="Booking progress"><div class="bar-track"><i style="width:${st.n * 25}%"></i></div><ol>${labels.map((l, i) => `<li class="${done[i] ? 'done' : ''}"><span>${done[i] ? ic('check') : i + 1}</span>${l}</li>`).join('')}</ol></div>
  <div class="booker"><div class="steps">
    <section class="step" id="st-1"><div class="step-h"><span class="n ${st.picked ? 'ok' : ''}">${st.picked ? ic('check') : 1}</span><h3>Choose services</h3>${picked.length ? `<span class="done">${picked.length} selected · ${dur(mins)}</span>` : ''}</div>
      <div class="tabs" role="tablist">${groupTabs().map(([k, l]) => `<button role="tab" type="button" aria-selected="${b.group === k}" data-act="bkGroup" data-v="${k}">${l}</button>`).join('')}</div>
      ${hasTiers(b.group) ? tierPicker() : `<div class="pick">${svcs().filter(s => (s.group || 'him') === b.group).map(s => svcCard(s)).join('')}</div>`}
    </section>
    <section class="step" id="st-2" ${st.picked ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n ${st.picked ? 'ok' : ''}">${st.picked ? ic('check') : 2}</span><h3>Choose your ${b.group === 'her' ? 'stylist' : 'barber'}</h3></div>
      <div class="pick barbers-pick">
        <button type="button" class="pickcard" data-act="bkBarber" data-id="" aria-pressed="${!b.barber}" ${st.picked ? '' : 'disabled'}><span class="av any">${ic('scissors')}</span><b>Any available</b><small>Earliest free chair</small></button>
        ${bars.map(x => `<button type="button" class="pickcard" data-act="bkBarber" data-id="${esc(x.id)}" aria-pressed="${b.barber === x.id}" ${st.picked ? '' : 'disabled'}><span class="av">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : esc(initials(x.name))}</span><b>${esc(x.name)}</b><small>${esc(x.title || '')}</small></button>`).join('')}
      </div>
    </section>
    <section class="step" id="st-3" ${st.picked ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n ${st.when ? 'ok' : ''}">${st.when ? ic('check') : 3}</span><h3>Pick a date and time</h3>${st.when ? `<span class="done">${fmtDate(b.date)}, ${fmtTime(b.time)}</span>` : ''}</div>
      <div class="dates" role="group" aria-label="Date">${dates.map(d => { const x = new Date(`${d.date}T00:00:00Z`); return `<button type="button" class="dchip" data-act="bkDate" data-v="${d.date}" aria-pressed="${d.date === b.date}" ${d.closed || d.off || !st.picked ? 'disabled' : ''}><small>${DAYS[x.getUTCDay()]}</small><b>${x.getUTCDate()}</b><span>${d.closed ? 'Closed' : d.off ? 'Off' : MONTHS[x.getUTCMonth()]}</span></button>`; }).join('')}</div>
      ${st.picked && b.date ? (S.slotsLoaded ? `<div class="times-in">${timeChips(times, b.time, 'bkTime')}</div>${waitlistBox(times)}` : '<p class="muted small"><span class="spinner"></span> Checking free times…</p>') : `<p class="muted small">${st.picked ? 'Pick a date to see free times.' : hasTiers(b.group) ? 'Pick a haircut first.' : 'Choose a service first.'}</p>`}
    </section>
    <section class="step" id="st-4" ${st.when ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n ${st.details ? 'ok' : ''}">${st.details ? ic('check') : 4}</span><h3>Your details</h3></div>
      <div class="fgrid">
        ${fieldIn('Full name', 'bk-name', 'name', 'text', 'name')}
        ${fieldIn('Mobile number', 'bk-phone', 'phone', 'tel', 'tel', '0917 123 4567')}
      </div>
      ${fieldIn('Email (for your confirmation and booking link)', 'bk-email', 'email', 'email', 'email', 'you@example.com')}
      <div class="field"><label for="bk-notes">Notes (optional)</label><textarea id="bk-notes" data-bind="bk.notes" rows="2" placeholder="Style, reference photo on Facebook, anything we should know">${esc(b.notes)}</textarea></div>
      <label class="consent"><input type="checkbox" id="bk-consent" data-bind="bk.consent" data-live ${b.consent ? 'checked' : ''}><span>I agree to the booking policy: the ${m(pol.deposit)} deposit isn’t refunded if I cancel or arrive ${pol.lateMinutes}+ minutes late. ${esc(I.shop.name)} may use my name, number and email to manage this booking and send reminders.</span></label>
    </section>
  </div>
  <aside class="summary" id="summary" aria-label="Booking summary">
    <div class="summary-top"><h3>Your booking</h3>${picked.length ? `<span class="chip">${ic('clock')}${dur(mins)}</span>` : ''}</div>
    <div class="summary-b">
      <div class="sumrow"><span>Services</span><b>${picked.length ? picked.map(s => esc(s.name)).join('<br>') : '—'}</b></div>
      <div class="sumrow"><span>${b.group === 'her' ? 'Stylist' : 'Barber'}</span><b>${b.barber ? esc(barber(b.barber)?.name || '') : 'Any available'}</b></div>
      <div class="sumrow"><span>When</span><b>${st.when ? `${fmtDate(b.date)}<br>${fmtTime(b.time)}` : '—'}</b></div>
      <div class="sumrow"><span>Estimated total</span><b>${picked.length ? (from ? 'from ' : '') + m(total) : '—'}</b></div>
      <div class="due"><span>Due now</span><b>${m(pol.deposit)}</b></div>
      <p class="muted small">Your slot is held for ${pol.holdMinutes} minutes while you pay. Pay the rest at the shop.</p>
      ${S.err ? `<p class="err shake" role="alert">${esc(S.err)}</p>` : ''}
      <button type="button" class="btn btn-accent btn-lg pay-btn" data-act="pay" ${st.details && !S.busy ? '' : 'disabled'}>${S.busy ? '<span class="spinner"></span> Securing your slot…' : `Pay ${m(pol.deposit)} deposit ${ic('arrow')}`}</button>
      <p class="paynote">${ic('check')} Secure payment by PayMongo: GCash, Maya, card or QR Ph</p>
    </div>
  </aside></div>`;
}
function svcCard(s, act = 'bkSvc', extra = {}) {
  return `<button type="button" class="pickcard${extra.radio ? ' radio' : ''}" data-act="${act}" data-id="${esc(s.id)}" aria-pressed="${!!S.bk.svc[s.id]}" ${extra.disabled ? 'disabled' : ''}><span class="tick" aria-hidden="true">${ic('check')}</span><b>${esc(s.name)}</b><small>${extra.note ? esc(extra.note) : `${dur(s.mins)}${s.desc && s.kind === 'base' && /^Save/.test(s.desc) ? ' · ' + esc(s.desc) : ''}`}</small><span class="p">${esc(priceLabel(s, cur()))}</span></button>`;
}
// Men's step 1: one haircut (Deluxe or Regular), then optional add-ons.
// Men's step 1: A) Deluxe or Regular, B) one haircut from that level only, C) optional add-ons.
function tierPicker() {
  const g = S.bk.group, all = svcs().filter(s => (s.group || 'him') === g);
  const bases = all.filter(s => s.kind === 'base'), extras = all.filter(s => s.kind !== 'base');
  const tiers = [...new Set(bases.map(s => s.tier || ''))];
  const tier = tiers.includes(S.bk.tier) ? S.bk.tier : (tiers.length === 1 ? tiers[0] : '');
  const base = bases.find(s => S.bk.svc[s.id]), err = chosen().length ? comboError(info(), chosen()) : '';
  const tierCard = t => {
    const list = bases.filter(s => (s.tier || '') === t), from = Math.min(...list.map(s => s.price)), names = tierNames(t);
    return `<button type="button" class="tier-card${tier === t ? ' on' : ''}" data-act="bkTier" data-v="${esc(t)}" aria-pressed="${tier === t}">
      <span class="tick" aria-hidden="true">${ic('check')}</span>
      <b>${esc(TIERS[t] || t || 'Haircuts')}</b>
      <span class="tc-from">Price starts at ${m(from)}</span>
      ${names.length ? `<small>${esc(listNames(names))}</small>` : ''}
      <small class="tc-what">${t === 'deluxe' ? 'Senior barbers · shampoo, hot towel and massage included' : t === 'regular' ? 'Junior barbers · signature and regular cuts' : `${list.length} options`}</small></button>`;
  };
  return `<p class="substep"><span>A</span>Deluxe or Regular? <small>Choose one</small></p>
    <div class="tier-cards">${tiers.map(tierCard).join('')}</div>
    ${tier ? `<p class="substep"><span>B</span>Pick your ${esc((TIERS[tier] || '').toLowerCase())} haircut <small>Choose one</small></p>
    <div class="pick one-col tab-in">${bases.filter(s => (s.tier || '') === tier).map(s => svcCard(s, 'bkBase', { radio: true })).join('')}</div>
    ${extras.length ? `<p class="substep"><span>C</span>Add extras <small>Optional</small></p>
    <div class="pick">${extras.map(s => { const inPromo = base && (base.includes || []).includes(s.id); return svcCard(s, 'bkSvc', { disabled: !base || inPromo, note: inPromo ? `Included in ${base.name.split(' · ')[0]}` : '' }); }).join('')}</div>
    ${base ? '' : '<p class="muted small">Pick a haircut first, then add extras.</p>'}` : ''}` : ''}
    ${err && base ? `<p class="err" role="alert">${esc(err)}</p>` : ''}`;
}
function fitBarber() { const b = barber(S.bk.barber); if (b && chosen().length && !canServe(b, chosen())) S.bk.barber = ''; }
function waitlistBox(times) {
  const w = S.wl, b = S.bk, full = !times.some(t => t.barbers.length);
  if (w.done) return `<div class="wl done-wl">${ic('check')}<div><b>You’re on the waitlist for ${fmtDate(w.done)}.</b><p class="muted small">We’ll text you if a matching slot opens. It goes to whoever books first.</p></div></div>`;
  if (!w.open) return `<button type="button" class="wl-link${full ? ' wl-strong' : ''}" data-act="wlOpen">${full ? `Fully booked on ${fmtDate(b.date)}? Join the waitlist` : 'Can’t find a time that works? Join the waitlist'} ${ic('arrow')}</button>`;
  const WIN = [['any', 'Any time'], ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening']];
  return `<div class="wl"><div class="wl-h"><b>Waitlist for ${fmtDate(b.date)}${b.barber ? ' with ' + esc(barber(b.barber)?.name || '') : ''}</b><button type="button" class="icon-btn" data-act="wlClose" aria-label="Close">${ic('close')}</button></div>
    <div class="seg" role="group" aria-label="Time of day">${WIN.map(([k, l]) => `<button type="button" data-act="wlWin" data-v="${k}" aria-pressed="${w.window === k}">${l}</button>`).join('')}</div>
    <div class="fgrid">${fieldIn('Full name', 'wl-name', 'name', 'text', 'name')}${fieldIn('Mobile number', 'wl-phone', 'phone', 'tel', 'tel', '0917 123 4567')}</div>
    ${fieldIn('Email (optional)', 'wl-email', 'email', 'email', 'email', 'you@example.com')}
    <label class="consent"><input type="checkbox" id="wl-consent" data-bind="wl.consent" ${w.consent ? 'checked' : ''}><span>Text or email me if a slot opens that day. No deposit is taken until I book.</span></label>
    ${w.err ? `<p class="err shake" role="alert">${esc(w.err)}</p>` : ''}
    <button type="button" class="btn btn-primary" data-act="wlJoin" ${w.busy ? 'disabled' : ''}>${w.busy ? '<span class="spinner"></span> Adding you…' : 'Join the waitlist'}</button></div>`;
}
function fieldIn(label, id, key, type, ac, ph = '') {
  return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" type="${type}" data-bind="bk.${key}" data-live value="${esc(S.bk[key])}" autocomplete="${ac}" ${ph ? `placeholder="${esc(ph)}"` : ''}></div>`;
}
function goStep(n) {
  if (window.innerWidth > 920 && n === 4) return; // the details step is right beside the summary on wide screens
  const el = document.getElementById('st-' + n); if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < 80 || r.top > innerHeight * 0.55) window.scrollBy({ top: r.top - 90, behavior: reduced() ? 'auto' : 'smooth' });
}

function watchSlots() {
  const d = S.bk.date;
  if (!d || d === S.slotsDate) return;
  if (S.unsub) S.unsub();
  S.slotsDate = d; S.slots = {}; S.slotsLoaded = false; S.unsub = null;
  S.unsub = db.collection('slots').where('date', '==', d).onSnapshot(s => {
    S.slots = Object.fromEntries(s.docs.map(x => [x.id, x.data()])); S.slotsLoaded = true;
    if (S.bk.time && !S.busy) { const t = availableTimes(info(), { services: chosen(), date: d, barberId: S.bk.barber }, S.slots).find(x => x.time === S.bk.time); if (!t || !t.barbers.length) { S.bk.time = ''; S.err = 'Someone just booked that time. Please pick another.'; } }
    renderBooker();
  }, () => { S.slotsLoaded = true; renderBooker(); });
}
function firstDate() {
  const b = S.bk;
  const d = bookableDates(info()).find(x => !x.closed && (!b.barber || (barber(b.barber)?.days || []).includes(dowOf(x.date))));
  return d ? d.date : '';
}
function pickService(id) {
  const s = svcs().find(x => x.id === id); if (!s) return;
  if (S.bk.group !== (s.group || 'him')) { S.bk.group = s.group || 'him'; S.bk.svc = {}; S.bk.barber = ''; }
  if (s.tier) S.bk.tier = s.tier;
  if (s.kind === 'base') { svcs().forEach(x => { if (x.kind === 'base' || (s.includes || []).includes(x.id)) S.bk.svc[x.id] = false; }); }
  S.bk.svc[id] = true; S.bk.time = ''; S.err = ''; fitBarber();
  if (!S.bk.date) { S.bk.date = firstDate(); watchSlots(); }
}

// ---------- header, sticky bar, lightbox ----------
function syncHeader() { const h = $('#site-head'); if (h) h.classList.toggle('scrolled', scrollY > 10); }
function syncStickyBar() {
  const bar = $('#mbar'), bk = $('#book'); if (!bar || !bk) return;
  const r = bk.getBoundingClientRect(), inBook = r.top < innerHeight && r.bottom > 0, st = stepState();
  bar.hidden = window.innerWidth > 920 || inBook || scrollY < 300;
  $('#mbar-t').textContent = st.n ? `${chosen().length} service${chosen().length === 1 ? '' : 's'} picked` : 'Book a chair';
}
function lightbox() {
  const el = $('#lightbox'), g = gallery(), i = S.lb;
  if (i < 0 || !g[i]) { el.hidden = true; el.innerHTML = ''; document.body.style.overflow = ''; return; }
  el.innerHTML = `<div class="lb" data-act="lbClose" role="dialog" aria-modal="true" aria-label="Photo ${i + 1} of ${g.length}">
    <button class="lb-btn lb-x" data-act="lbClose" aria-label="Close">${ic('close')}</button>
    ${g.length > 1 ? `<button class="lb-btn lb-prev" data-act="lbStep" data-d="-1" aria-label="Previous photo">${ic('left')}</button><button class="lb-btn lb-next" data-act="lbStep" data-d="1" aria-label="Next photo">${ic('right')}</button>` : ''}
    <figure><img src="${esc(g[i].url)}" alt="${esc(g[i].caption || 'Gallery photo')}">${g[i].caption ? `<figcaption>${esc(g[i].caption)}</figcaption>` : ''}<span class="lb-n">${i + 1} / ${g.length}</span></figure></div>`;
  el.hidden = false; document.body.style.overflow = 'hidden';
  el.querySelector('.lb-x').focus();
}

// ---------- actions ----------
const ACT = {
  resetDemo,
  top() { window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); },
  scroll(el) { document.getElementById(el.dataset.to)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); },
  mbar() { ACT.scroll({ dataset: { to: 'book' } }); },
  async copy(el) { try { await navigator.clipboard.writeText(el.dataset.text); toast('Copied'); } catch (_) { toast(el.dataset.text); } },
  menuTab(el) { S.menuTab = el.dataset.v; renderMenu(); },
  bookSvc(el) { pickService(el.dataset.id); renderBooker(); ACT.scroll({ dataset: { to: 'book' } }); },
  lightbox(el) { S.lb = +el.dataset.i; lightbox(); },
  lbClose(el, e) { if (e && el.classList.contains('lb') && e.target !== el) return; S.lb = -1; lightbox(); },
  lbStep(el) { const n = gallery().length; S.lb = (S.lb + (+el.dataset.d) + n) % n; lightbox(); },
  bkGroup(el) { if (S.bk.group === el.dataset.v) return; S.bk.group = el.dataset.v; S.bk.tier = ''; S.bk.svc = {}; S.bk.barber = ''; S.bk.time = ''; renderBooker(); },
  bkTier(el) {
    const t = el.dataset.v; if (S.bk.tier === t) return;
    S.bk.tier = t; S.bk.svc = {}; S.bk.time = ''; S.err = ''; fitBarber(); // switching level starts the haircut over
    const b = barber(S.bk.barber); if (b && (b.tiers || []).length && !b.tiers.includes(t)) S.bk.barber = '';
    renderBooker();
  },
  bkBase(el) { const id = el.dataset.id; if (S.bk.svc[id]) return; pickService(id); renderBooker(); },
  bkSvc(el) { const id = el.dataset.id; if (S.bk.svc[id]) { S.bk.svc[id] = false; S.bk.time = ''; } else pickService(id); renderBooker(); },
  bkBarber(el) { S.bk.barber = el.dataset.id; S.bk.time = ''; S.err = ''; const b = barber(S.bk.barber); if (b && S.bk.date && !(b.days || []).includes(dowOf(S.bk.date))) S.bk.date = firstDate(); watchSlots(); renderBooker(); goStep(3); },
  bkDate(el) { S.bk.date = el.dataset.v; S.bk.time = ''; S.err = ''; S.wl.done = ''; S.wl.err = ''; watchSlots(); renderBooker(); },
  bkTime(el) { S.bk.time = el.dataset.v; S.err = ''; renderBooker(); goStep(4); },
  wlOpen() { S.wl.open = true; S.wl.err = ''; renderBooker(); },
  wlClose() { S.wl.open = false; renderBooker(); },
  wlWin(el) { S.wl.window = el.dataset.v; renderBooker(); },
  async wlJoin() {
    const b = S.bk, w = S.wl; w.busy = true; w.err = ''; renderBooker();
    try {
      await call('joinWaitlist', { name: b.name, phone: b.phone, email: b.email, date: b.date, window: w.window, barberId: b.barber, serviceIds: Object.keys(b.svc).filter(k => b.svc[k]), consent: w.consent });
      w.done = b.date; w.open = false;
    } catch (e) { w.err = e.message || 'Couldn’t add you to the waitlist.'; }
    w.busy = false; renderBooker();
  },
  bookWith(el) {
    const b = barber(el.dataset.id); if (!b) return;
    const g = (b.groups || ['him'])[0];
    if (S.bk.group !== g) { S.bk.group = g; S.bk.svc = {}; }
    if (!canServe(b, chosen())) S.bk.svc = {};
    if ((b.tiers || []).length === 1 && S.bk.tier !== b.tiers[0]) { S.bk.tier = b.tiers[0]; S.bk.svc = {}; }
    S.bk.barber = b.id; S.bk.time = ''; S.bk.date = firstDate(); watchSlots(); renderBooker();
    ACT.scroll({ dataset: { to: 'book' } });
  },
  async pay() {
    const b = S.bk, when = { date: b.date, time: b.time };
    S.busy = true; S.err = ''; renderBooker();
    try {
      const r = await call('createBooking', { serviceIds: Object.keys(b.svc).filter(k => b.svc[k]), barberId: b.barber, date: b.date, time: b.time, name: b.name, phone: b.phone, email: b.email, notes: b.notes, consent: b.consent });
      try { localStorage.setItem('lastBooking', JSON.stringify({ id: r.id, token: r.token, ...when })); } catch (_) {}
      location.href = r.checkoutUrl;
    } catch (e) {
      S.busy = false; S.err = e.message || 'Something went wrong. Please try again.';
      if (e.code === 'already-exists') b.time = '';
      renderBooker();
    }
  }
};
let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }
function setPath(path, val) { const k = path.split('.'); let o = S; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = val; }
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const f = ACT[el.dataset.act]; if (f) { if (el.tagName === 'A') e.preventDefault(); f(el, e); } });
document.addEventListener('input', e => { const el = e.target; if (!el.dataset || !el.dataset.bind) return; setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value); S.err = ''; if (el.hasAttribute('data-live')) { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderBooker); } });
document.addEventListener('keydown', e => {
  if (S.lb < 0) return;
  if (e.key === 'Escape') { S.lb = -1; lightbox(); }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ACT.lbStep({ dataset: { d: e.key === 'ArrowRight' ? 1 : -1 } });
});
addEventListener('scroll', () => { syncHeader(); syncStickyBar(); }, { passive: true });
addEventListener('resize', syncStickyBar, { passive: true });

// ---------- start ----------
renderAll();
{
  const slow = setTimeout(() => { S.slow = true; schedule(); }, 10000);
  db.doc('public/info').onSnapshot(s => {
    clearTimeout(slow);
    S.info = s.exists ? s.data() : null; S.loaded = true; schedule();
  }, () => { S.slow = true; schedule(); });
}
