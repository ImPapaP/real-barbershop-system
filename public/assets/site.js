// Customer website: menu, gallery, team, reviews, hours and the booking flow (pays the deposit through PayMongo).
// The page is drawn once; the booking panel, menu tabs and lightbox redraw on their own so animations don't replay.
import { db, call, demo, demoBar, resetDemo } from './fb.js';
import { themeBtn,
  $, esc, money, priceLabel, fmtTime, fmtDate, DAYS, DAYS_LONG, MONTHS, sum, phNow, dowOf, policyOf, openStatus,
  availableTimes, bookableDates, timeChips, initials, canServe, comboError, TIERS, STARTER, STARTER_STAFF, publicBarber, revealOnScroll, morph, brand, LOGO_LG, dur, isServiceStaff, toMin, fromMin, addDays, blockTimes, slotId, messengerLink, defaultFaq, monthGrid, shiftMonth, BACK_IC, bdaySelects, cleanBday, BDAY_TITLE, BDAY_HINT, queueEstimate, resizeImage, depositFor
} from './shared.js';
import { paintBanners } from './banner.js';

const S = {
  info: null, loaded: false, slow: false, menuTab: 'him', painted: false,
  slots: {}, slotsDate: '', slotsLoaded: false, unsub: null,
  bk: { group: 'him', tier: '', svc: {}, barber: '', date: '', time: '', name: '', phone: '', email: '', bm: '', bd: '', ref: '', refBusy: false, notes: '', consent: false, remember: true, guest: { on: false, mode: '', name: '', own: false, group: 'him', tier: '', svc: {}, date: '', time: '', barber: '' } },
  touched: {}, tried: false, pay: 'online',
  promo: { open: false, code: '', applied: null, err: '', busy: false },
  walkin: new URLSearchParams(location.search).get('walkin') === '1',
  q: { name: '', phone: '', bm: '', bd: '', ref: '', refBusy: false, pick: '', barber: '', err: '', busy: false, done: null },
  galTag: 'all', profile: '',
  me: null, byBarber: false, range: { slots: {}, at: 0, loading: false }, urlApplied: false,
  err: '', busy: false, last: null, lb: -1,
  wl: { open: false, window: 'any', consent: false, done: '', err: '', busy: false }
};
const PREVIEW = { ...STARTER, barbers: STARTER_STAFF.filter(isServiceStaff).map(publicBarber) };
const info = () => S.info || PREVIEW;
const cur = () => info().shop.currency || '₱';
const m = n => money(n, cur());
const svcs = () => (info().services || []).filter(s => s.active !== false);
// A service can have options that change the price, e.g. polish on a manicure (+₱30 regular, +₱50 L’Oréal/Orly).
// The pick is kept in S.bk.opt { serviceId: optionId } and folded into the name and price here.
const withOpt = s => { const o = (s.options || []).find(x => x.id === (S.bk.opt || {})[s.id]); return o ? { ...s, price: s.price + (Number(o.add) || 0), name: `${s.name} + ${o.name}`, opt: o.id } : s; };
const chosen = () => svcs().filter(s => S.bk.svc[s.id]).map(withOpt);
const chosenOpts = () => { const o = {}; [...chosen(), ...(S.bk.guest && S.bk.guest.own ? guestSvcs() : [])].forEach(s => { if (s.opt) o[s.id] = s.opt; }); return o; };
function optionsBox(list) {
  const withO = list.filter(s => (s.options || []).length); if (!withO.length) return '';
  return `<div class="optbox">${withO.map(s => { const cur = (S.bk.opt || {})[s.id] || '';
    return `<div class="optrow"><b>${esc(s.name)}</b><div class="chips-row" role="radiogroup" aria-label="${esc(s.name)} options">${[{ id: '', name: s.optNone || 'No polish', add: 0 }, ...s.options].map(o => `<button type="button" class="ochip" role="radio" data-act="bkOpt" data-id="${esc(s.id)}" data-v="${esc(o.id)}" aria-checked="${cur === o.id}">${esc(o.name)}${o.add ? ` <span>+${m(o.add)}</span>` : ''}</button>`).join('')}</div></div>`; }).join('')}</div>`;
}
// Menu and booking tabs: For him, For her, and Nails once nail services are on the menu
// What to call the person doing the service
const staffWord = (g, cap) => { const w = g === 'her' ? 'stylist' : g === 'nails' ? 'nail technician' : g === 'braids' ? 'braider' : 'barber'; return cap ? w[0].toUpperCase() + w.slice(1) : w; };
const groupTabs = () => [['him', 'For him'], ['her', 'For her'], ['nails', 'Nails'], ['braids', 'Braids']].filter(([k]) => ['him', 'her'].includes(k) || svcs().some(x => x.group === k));
const hasTiers = g => svcs().some(s => (s.group || 'him') === g && s.kind === 'base');
const tierNames = t => (info().barbers || []).filter(b => (b.tiers || []).includes(t)).map(b => b.name);
const listNames = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
const barber = id => (info().barbers || []).find(b => b.id === id);
// Fresh from the chair: newest photos from the Facebook page (synced every 3 hours, when connected) + the shop's own uploads
const galAll = () => { const I = info(), fb = I.fbShow === false ? [] : (I.fbPhotos || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const own = (I.gallery || []).filter(g => g.url), seen = new Set(); return [...fb, ...own].filter(g => g.url && !seen.has(g.url) && seen.add(g.url)); };
// Promos & events the shop posts in the dashboard; ended ones hide themselves
const happenings = () => { const t = phNow().date; return (info().happenings || []).filter(h => h.title && (!h.end || h.end >= t) && (h.kind === 'event' || !h.start || h.start <= t))
  .sort((a, b) => (a.kind === 'promo' ? 0 : 1) - (b.kind === 'promo' ? 0 : 1) || String(a.start || a.end || '').localeCompare(String(b.start || b.end || ''))); };
const gallery = () => galAll().filter(g => S.galTag === 'all' || g.style === S.galTag).slice(0, 12);
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
  chat: '<path d="M10 2.8c-4.3 0-7.5 3-7.5 6.9 0 2.1 1 4 2.6 5.2V18l3-1.6c.6.2 1.3.2 1.9.2 4.3 0 7.5-3 7.5-6.9S14.3 2.8 10 2.8z"/><path d="M6 11.2l2.7-2.8 1.8 1.8 3-2.9" />',
  plus: '<path d="M10 4v12M4 10h12"/>',
  calendar: '<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4"/>',
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
  paintBanners(happenings(), info().shop);
  S.painted = true;
  revealOnScroll();
  syncHeader();
}
function renderBooker() { const el = $('#booker'); if (el) morph(el, booker()); syncStickyBar(); maybeApplyPromo(); }
// A promo picked from Promos & events is applied as soon as there's a service to price it against
function maybeApplyPromo() { const P = S.promo; if (P.pending && !P.busy && !P.applied && chosen().length) { P.pending = ''; ACT.promoApply(); } }
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
  return `${demoBar('')}
  ${an.active && an.text ? `<div class="announce">${an.link ? `<a href="${esc(an.link)}" target="_blank" rel="noopener">${esc(an.text)} ${ic('arrow')}</a>` : `<span>${esc(an.text)}</span>`}</div>` : ''}
  <header class="site-head" id="site-head"><div class="wrap head-in">
    <a class="wordmark" href="#top" data-act="top" aria-label="${esc(shop.name)} home">${brand(shop.wordmark || shop.name)}</a>
    <nav class="site-nav" aria-label="Sections">
      <button class="lnk" data-act="scroll" data-to="services">Services</button>
      <button class="lnk" data-act="scroll" data-to="promos">Events</button>
      ${products().length ? '<button class="lnk" data-act="scroll" data-to="products">Products</button>' : ''}
      ${galAll().length || demo ? '<button class="lnk" data-act="scroll" data-to="gallery">Gallery</button>' : ''}
      <button class="lnk" data-act="scroll" data-to="team">Team</button>
      <button class="lnk" data-act="scroll" data-to="visit">Visit</button>
      <a class="lnk acct-lnk" href="account.html" aria-label="My visits">${ic('user') || ''}<span>My visits</span></a>
      <span class="head-open${st.open ? ' on' : ''}" title="${esc(st.text)}"><b aria-hidden="true">●</b>${st.open ? 'Open now' : 'Closed now'}</span>
      ${themeBtn()}<button class="btn btn-accent btn-sm" data-act="scroll" data-to="book">Book now</button>
    </nav>
  </div></header>
  ${S.last && S.last.date >= today.date ? `<div class="wrap" style="padding-block:12px"><p class="note row" style="justify-content:space-between"><span>You have a booking for <b>${fmtDate(S.last.date)}, ${fmtTime(S.last.time)}</b>.</span><a class="btn btn-sm" href="booking.html?id=${encodeURIComponent(S.last.id)}&t=${encodeURIComponent(S.last.token)}">View booking</a></p></div>` : ''}

  <section class="hero-x${shop.heroPhoto ? ' has-photo' : ''}" id="top">
    ${shop.heroPhoto ? `<div class="hero-photo" style="background-image:url('${esc(shop.heroPhoto)}')" role="img" aria-label="Inside ${esc(shop.name)}"></div>` : ''}
    <div class="brick" aria-hidden="true"></div>
    <img class="hero-mark" src="${LOGO_LG}" alt="" aria-hidden="true" width="640" height="640">
    <div class="wrap hero-grid${anim}">
      <div class="hero-copy">
        <div class="row hero-chips"><span class="chip open-chip"><b aria-hidden="true" class="${st.open ? 'pulse' : ''}" style="color:${st.open ? 'var(--good)' : 'var(--hero-muted)'}">●</b>${esc(st.text)}</span>${waitChip()}${ratingChip(shop, true)}</div>
        <h1>${esc(shop.tagline)}</h1>
        <p class="lede">${esc(shop.about)}</p>
        <div class="hero-cta"><button class="btn btn-accent btn-lg" data-act="scroll" data-to="book">Book an appointment ${ic('arrow')}</button><button class="btn btn-ghost btn-lg" data-act="scroll" data-to="services">See prices</button></div>
        <dl class="facts">
          ${cut ? `<div><dt>${esc(cut.name)}</dt><dd>${m(cut.price)}</dd></div>` : ''}
          <div><dt>Hours</dt><dd>${esc(hoursSummary(I.hours))}</dd></div>
          ${policyOf(I).onlineBooking ? `<div><dt>Down payment</dt><dd>${m(policyOf(I).deposit)} · senior barbers only</dd></div>` : '<div><dt>Walk-ins</dt><dd>Welcome</dd></div>'}
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
  ${S.walkin ? `<section id="walkin" class="sec walkin-sec"><div class="wrap">${walkinBox()}</div></section>` : ''}
  <div class="marquee" aria-hidden="true"><div class="track">${[0, 1].map(() => `<span>${svcs().filter(s => s.group !== 'her').slice(0, 7).concat(svcs().filter(s => s.group === 'her').slice(0, 4)).map(s => `${esc(s.name)} ${ic('scissors')}`).join(' ')}</span>`).join('')}</div></div>

  <section id="services" class="sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Menu</p><h2 class="sec-title">Services & prices</h2></div>
      <div class="tabs" role="tablist">${groupTabs().map(([k, l]) => `<button role="tab" aria-selected="${S.menuTab === k}" data-act="menuTab" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div id="menu-board" class="reveal">${menuBoard(S.menuTab)}</div>
  </div></section>

  <section id="promos" class="sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">What’s on</p><h2 class="sec-title">Events &amp; promos</h2></div>${shop.facebook ? `<a class="btn btn-ghost" href="${esc(shop.facebook)}" target="_blank" rel="noopener">Follow for news ${ic('arrow')}</a>` : ''}</div>
    ${happenings().length ? `<div class="happen-grid">${happenings().map(h => happenCard(h)).join('')}</div>`
      : `<div class="happen-empty reveal">${ic('star', 'pic')}<div><b>Nothing scheduled right now</b><p class="muted">Pop-ups, holiday hours, barber battles and promos show up here. ${shop.facebook ? 'Follow our Facebook page to hear first.' : 'Check back soon.'}</p></div></div>`}
  </div></section>
  ${products().length ? `<section id="products" class="sec alt"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Take it home</p><h2 class="sec-title">Our products</h2></div><p class="muted" style="max-width:40ch">The same products we use in the chair. Buy at the shop, or add one to your booking and we’ll set it aside.</p></div>
    <div class="prod-grid">${products().map(productCard).join('')}</div>
  </div></section>` : ''}
  ${galAll().length || demo ? `<section id="gallery" class="sec dark-sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Style gallery</p><h2 class="sec-title">Fresh from the chair</h2></div><div class="row">${shop.instagram ? `<a class="btn btn-ghost" href="${esc(shop.instagram)}" target="_blank" rel="noopener">${ic('camera')} Instagram</a>` : ''}${shop.facebook ? `<a class="btn btn-ghost" href="${esc(shop.facebook)}" target="_blank" rel="noopener">More on Facebook ${ic('arrow')}</a>` : ''}</div></div>
    ${galAll().length ? `${galTags()}<div id="gal-wrap">${galleryGrid()}</div>${shop.facebook ? `<p class="gal-more"><a href="${esc(shop.facebook)}" target="_blank" rel="noopener">See more on our Facebook page ${ic('arrow')}</a></p>` : ''}`
      : `<div class="gallery placeholder">${Array.from({ length: 8 }, (_, i) => `<div class="g-item g-ph reveal" style="--d:${(i % 4) * 70}ms">${ic('scissors')}<span>${i === 0 ? 'Add photos in Dashboard → Website' : ''}</span></div>`).join('')}</div>`}
  </div></section>` : ''}

  <section id="book" class="sec alt"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">${policyOf(I).onlineBooking ? 'Book online' : 'Bookings'}</p><h2 class="sec-title">Book an appointment</h2></div>${policyOf(I).onlineBooking ? `<p class="muted small">Pay a ${m(policyOf(I).deposit)} deposit to lock in your slot. It goes toward your bill.</p>` : ''}</div>
    <div id="booker">${booker()}</div>
  </div></section>

  <section id="team" class="sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Barbers, stylist and nail techs</p><h2 class="sec-title">Meet the team</h2></div></div>
    <div class="team">${(I.barbers || []).map((b, i) => `
      <article class="member reveal" style="--d:${(i % 4) * 80}ms">
        <button type="button" class="m-photo m-open" data-act="profile" data-id="${esc(b.id)}" aria-label="See ${esc(b.name)}’s profile">${b.photo ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}" loading="lazy">` : `<span class="m-mono" aria-hidden="true">${esc(initials(b.name))}</span>`}${b.chair ? `<small>Chair ${esc(b.chair)}</small>` : ''}</button>
        <div class="m-body"><h3>${esc(b.name)}</h3><p class="muted small">${esc(b.title || '')}${b.specialty ? ' · ' + esc(b.specialty) : ''}</p>${b.ratingCount ? `<p class="m-rate">${ic('star', 'star')}<b>${Number(b.rating).toFixed(1)}</b><span>${b.ratingCount} rating${b.ratingCount === 1 ? '' : 's'}</span></p>` : ''}
        <div class="days" aria-label="Days in">${[1, 2, 3, 4, 5, 6, 0].map(d => `<span class="${(b.days || []).includes(d) ? 'on' : ''}" title="${DAYS_LONG[d]}">${DAYS[d].slice(0, 2)}</span>`).join('')}</div>
        <div class="row m-acts">${bookable(b) ? `<button class="btn btn-sm" data-act="bookWith" data-id="${esc(b.id)}">Book with ${esc(b.name)} ${ic('arrow')}</button>` : `<span class="muted small">${b.role === 'nails' ? 'Nail services coming soon' : 'Booking coming soon'}</span>`}<button class="link-btn" data-act="profile" data-id="${esc(b.id)}">Profile</button></div></div>
      </article>`).join('')}</div>
  </div></section>

  ${revs.length ? `<section id="reviews" class="sec alt"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Reviews</p><h2 class="sec-title">What clients say</h2></div><div class="row">${ratingChip(shop)}${shop.googleUrl ? `<a class="btn btn-accent" href="${esc(shop.googleUrl)}" target="_blank" rel="noopener">${ic('star')} Leave a review</a>` : ''}</div></div>
    <div class="reviews">${revs.map((r, i) => `<figure class="review reveal" style="--d:${(i % 3) * 90}ms"><div class="stars" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}<span>${'★'.repeat(5 - r.rating)}</span></div><blockquote>${esc(r.text)}</blockquote><figcaption><b>${esc(r.name)}</b> · ${esc(r.source || '')}</figcaption></figure>`).join('')}</div>
  </div></section>` : ''}

  <section id="faq" class="sec alt"><div class="wrap faq-wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Questions</p><h2 class="sec-title">Good to know</h2></div>${messengerLink(shop) ? `<a class="btn btn-ghost" href="${esc(messengerLink(shop))}" target="_blank" rel="noopener">${ic('chat')} Ask us on Messenger</a>` : ''}</div>
    <div class="faq reveal">${faqList().map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}<span class="faq-ic" aria-hidden="true">${ic('plus')}</span></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  </div></section>

  <section id="visit" class="sec"><div class="wrap">
    <div class="sec-head reveal"><div><p class="eyebrow">Visit</p><h2 class="sec-title">Find us</h2></div><a class="btn btn-primary" href="${esc(mapUrl)}" target="_blank" rel="noopener">${ic('pin')} Get directions</a></div>
    <div class="visit reveal">
      <table class="hours"><tbody>${[1, 2, 3, 4, 5, 6, 0].map(d => { const h = I.hours.find(x => x.d === d); return `<tr class="${d === today.dow ? 'now' : ''}"><td>${DAYS_LONG[d]}</td><td>${h && !h.closed ? `${fmtTime(h.open)} – ${fmtTime(h.close)}` : 'Closed'}</td></tr>`; }).join('')}</tbody></table>
      <div class="stack">
        <div class="vrow">${ic('pin')}<div><p class="eyebrow">Address</p><p class="big">${esc(shop.address)}</p></div></div>
        <div class="vrow">${ic('phone')}<div><p class="eyebrow">Call or text</p><p class="row"><span class="big">${esc(shop.phone)}</span><button class="btn btn-sm" data-act="copy" data-text="${esc(shop.phone)}">Copy</button></p></div></div>
        ${shop.instagram ? `<div class="vrow">${ic('camera')}<div><p class="eyebrow">Instagram</p><p><a href="${esc(shop.instagram)}" target="_blank" rel="noopener">@${esc(shop.instagram.replace(/\/+$/, '').split('/').pop())}</a></p></div></div>` : ''}
        ${shop.facebook ? `<div class="vrow">${ic('arrow')}<div><p class="eyebrow">Facebook</p><p><a href="${esc(shop.facebook)}" target="_blank" rel="noopener">${esc(shop.facebook.replace(/^https?:\/\/(www\.)?/, ''))}</a></p></div></div>` : ''}
        ${messengerLink(shop) ? `<div class="vrow">${ic('chat')}<div><p class="eyebrow">Messenger</p><p><a href="${esc(messengerLink(shop))}" target="_blank" rel="noopener">Message us</a></p></div></div>` : ''}
      </div>
    </div>
    <div class="map-card reveal">
      <iframe class="map" src="https://www.google.com/maps?q=${encodeURIComponent(shop.name + ', ' + shop.address)}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map to ${esc(shop.name)}"></iframe>
      <div class="map-side"><p class="eyebrow">How to find us</p><p class="big">${esc(shop.address)}</p>${shop.directions ? `<p class="muted">${esc(shop.directions)}</p>` : ''}
        <p class="map-open${st.open ? ' on' : ''}"><b aria-hidden="true">●</b>${esc(st.text)}</p>
        <a class="btn btn-primary" href="${esc(mapUrl)}" target="_blank" rel="noopener">${ic('pin')} Open in Google Maps</a></div>
    </div>
    <h3 class="sec-title reveal" style="font-size:30px;margin:48px 0 16px">Booking policy</h3>
    ${policyCards()}
  </div></section>
  <footer class="site-foot"><div class="wrap"><span class="wordmark" style="font-size:18px">${brand(shop.wordmark || shop.name, 'sm')}</span><span>${esc(shop.address)} · ${esc(shop.phone)}</span><span>© ${today.date.slice(0, 4)} ${esc(shop.name)} · <a href="account.html">My visits</a> · <a href="terms.html">Booking Terms</a> · <a href="privacy.html">Privacy Policy</a></span></div></footer>
  <div class="mbar" id="mbar" hidden><div><b id="mbar-t">Book a chair</b><small id="mbar-s">${policyOf(I).onlineBooking ? 'Down payment only for senior barbers' : 'Call or message us to book'}</small></div><button class="btn btn-accent" data-act="mbar">Book now</button></div>
  ${messengerLink(shop) ? `<a class="msgr" href="${esc(messengerLink(shop))}" target="_blank" rel="noopener" aria-label="Message us on Messenger">${ic('chat')}<span>Message us</span></a>` : ''}
  <div id="lightbox" hidden></div><div id="profile" hidden></div>`;
}
const products = () => (info().products || []).filter(p => p.name);
// Products to set aside for the visit, with how many: { 'Liquid Pomade': 2 }
const prodQ = () => (S.bk.prodQ = S.bk.prodQ || {});
const prodNote = () => Object.entries(prodQ()).filter(([, n]) => n > 0).map(([name, n]) => n > 1 ? `${name} ×${n}` : name).join('; ');
const MAX_PROD = 10;
function productCard(p) {
  const qty = prodQ()[p.name] || 0, added = qty > 0;
  return `<article class="prod reveal"><div class="prod-ph">${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="prod-mono" aria-hidden="true">${esc(initials(p.name))}</span>`}${p.tag ? `<span class="prod-tag">${esc(p.tag)}</span>` : ''}</div>
    <div class="prod-b"><h3>${esc(p.name)}</h3>${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
      <div class="prod-foot">${p.price ? `<b class="prod-price">${m(p.price)}</b>` : '<b class="prod-price ask">Ask for price</b>'}${p.inStock ? '<span class="prod-in">In stock</span>' : '<span class="prod-out">Out of stock</span>'}</div>
      ${!p.inStock ? '' : added ? `<div class="prod-qty"><span class="prod-added">${ic('check')} Added</span><div class="stepper" role="group" aria-label="How many ${esc(p.name)}"><button type="button" data-act="prodQty" data-name="${esc(p.name)}" data-d="-1" aria-label="One less">−</button><b aria-live="polite">${qty}</b><button type="button" data-act="prodQty" data-name="${esc(p.name)}" data-d="1" aria-label="One more" ${qty >= MAX_PROD ? 'disabled' : ''}>+</button></div></div>`
        : `<button type="button" class="btn btn-sm" data-act="prodQty" data-name="${esc(p.name)}" data-d="1">Add to my booking</button>`}</div></article>`;
}
function happenCard(h) {
  const when = h.kind === 'event' ? (h.start && h.end && h.start !== h.end ? `${fmtDate(h.start)} – ${fmtDate(h.end)}` : h.start ? fmtDate(h.start) : h.end ? `Until ${fmtDate(h.end)}` : '') : h.end ? `Until ${fmtDate(h.end)}` : 'Ongoing';
  const cta = h.code ? `<button type="button" class="btn btn-accent btn-sm" data-act="usePromo" data-code="${esc(h.code)}">Book with this code ${ic('arrow')}</button>`
    : h.link ? `<a class="btn btn-sm" href="${esc(h.link)}" target="_blank" rel="noopener">${esc(h.linkLabel || 'Learn more')} ${ic('arrow')}</a>`
    : `<button type="button" class="btn btn-sm" data-act="scroll" data-to="book">Book now ${ic('arrow')}</button>`;
  return `<article class="happen reveal ${h.kind === 'event' ? 'ev' : 'pr'}">${h.image ? `<img class="happen-img" src="${esc(h.image)}" alt="" loading="lazy">` : `<canvas class="happen-img" data-banner="${esc(h.id)}" width="1200" height="630" role="img" aria-label="${esc(h.title)}"></canvas>`}
    <div class="happen-b"><div class="happen-top"><span class="happen-kind">${h.kind === 'event' ? ic('calendar') + ' Event' : '% Promo'}</span>${when ? `<span class="happen-when">${esc(when)}</span>` : ''}${h.sample && demo ? '<span class="happen-when">Sample</span>' : ''}</div>
    <h3>${esc(h.title)}</h3>${h.text ? `<p>${esc(h.text)}</p>` : ''}
    ${h.code ? `<div class="happen-code"><span>Code</span><b>${esc(h.code)}</b><button type="button" class="link-btn" data-act="copyCode" data-code="${esc(h.code)}">Copy</button></div>` : ''}
    <div class="happen-cta">${cta}</div></div></article>`;
}
// Has at least one service on the menu this person can do (Luz has none until nail services are added)
const bookable = b => svcs().some(s => canServe(b, [s]));
const faqList = () => (Array.isArray(info().faq) && info().faq.length ? info().faq : defaultFaq(info()));
// ---------- style gallery ----------
function galTags() {
  const tags = [...new Set(galAll().map(g => g.style).filter(Boolean))];
  if (tags.length < 2) return '';
  return `<div class="gal-tags reveal" role="group" aria-label="Filter by style">${['all', ...tags].map(t => `<button type="button" data-act="galTag" data-v="${esc(t)}" aria-pressed="${S.galTag === t}">${t === 'all' ? 'All' : esc(t)}</button>`).join('')}</div>`;
}
function galleryGrid() {
  const gal = gallery(), shop = info().shop;
  return `<div class="gallery">${gal.map((g, i) => { const by = barber(g.barberId); const cap = [g.caption || g.style, by ? `by ${by.name}` : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="g-item reveal" data-act="lightbox" data-i="${i}" style="--d:${(i % 4) * 70}ms" aria-label="Open photo${cap ? ': ' + esc(cap) : ''}"><img src="${esc(g.url)}" alt="${esc(g.caption || g.style || 'Haircut at ' + shop.name)}" loading="lazy">${cap ? `<span class="g-cap">${esc(cap)}</span>` : ''}</button>`; }).join('')}</div>`;
}
function renderGallery() { const w = $('#gal-wrap'); if (w) { w.innerHTML = galleryGrid(); revealOnScroll(); } document.querySelectorAll('[data-act=galTag]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.galTag)); }
// ---------- pop-ups and the phone's back button ----------
// Opening a profile or a photo adds a step to the browser history, so the phone's back button closes it
// instead of leaving the site.
const POP = { open: [], skip: 0, fromPop: false };
try { history.scrollRestoration = 'manual'; } catch (_) {}
function popOpened(name) { if (!POP.open.includes(name)) { POP.open.push(name); history.pushState({ rbPop: name }, ''); } }
function popClosed(name) { const i = POP.open.indexOf(name); if (i < 0) return; POP.open.splice(i, 1); if (!POP.fromPop) { POP.skip++; history.back(); } }
window.addEventListener('popstate', () => {
  if (POP.skip) { POP.skip--; return; }
  const top = POP.open[POP.open.length - 1]; if (!top) return;
  POP.fromPop = true; if (top === 'lb') { S.lb = -1; lightbox(); } else { S.profile = ''; profile(); } POP.fromPop = false;
});
// ---------- barber profile ----------
function profile() {
  const el = $('#profile'), b = barber(S.profile);
  if (!b) { el.hidden = true; el.innerHTML = ''; document.body.style.overflow = ''; popClosed('pf'); return; }
  popOpened('pf');
  const photos = galAll().filter(g => g.barberId === b.id).slice(0, 6), bases = svcs().filter(x => x.kind === 'base' && (b.tiers || []).includes(x.tier));
  el.innerHTML = (`<div class="pf-scrim" data-act="pfClose"><div class="pf" role="dialog" aria-modal="true" aria-labelledby="pf-name">
    <button type="button" class="pop-back pf-back" data-act="pfClose">${BACK_IC}<span>Back</span></button><button type="button" class="icon-btn pf-x" data-act="pfClose" aria-label="Close">${ic('close')}</button>
    <div class="pf-top"><div class="pf-photo">${b.photo ? `<img src="${esc(b.photo)}" alt="">` : `<span>${esc(initials(b.name))}</span>`}</div>
      <div><p class="eyebrow">${esc(b.title || '')}</p><h3 id="pf-name">${esc(b.name)}</h3>${b.ratingCount ? `<p class="m-rate">${ic('star', 'star')}<b>${Number(b.rating).toFixed(1)}</b><span>${b.ratingCount} rating${b.ratingCount === 1 ? '' : 's'} from booked clients</span></p>` : ''}${b.specialty ? `<p class="muted small">${esc(b.specialty)}</p>` : ''}</div></div>
    ${b.bio ? `<p class="pf-bio">${esc(b.bio)}</p>` : ''}
    <div class="pf-row"><p class="eyebrow">Days in</p><div class="days">${[1, 2, 3, 4, 5, 6, 0].map(d => `<span class="${(b.days || []).includes(d) ? 'on' : ''}" title="${DAYS_LONG[d]}">${DAYS[d].slice(0, 2)}</span>`).join('')}</div></div>
    ${bases.length ? `<div class="pf-row"><p class="eyebrow">${esc((b.tiers || []).map(t => TIERS[t] || t).join(' and '))} haircuts</p><p>Price starts at <b>${m(Math.min(...bases.map(x => x.price)))}</b></p></div>` : ''}
    ${photos.length ? `<div class="pf-row"><p class="eyebrow">Recent work</p><div class="pf-gal">${photos.map(g => `<img src="${esc(g.url)}" alt="${esc(g.caption || g.style || 'Haircut')}" loading="lazy">`).join('')}</div></div>` : ''}
    ${bookable(b) ? `<button type="button" class="btn btn-accent btn-lg" data-act="bookWith" data-id="${esc(b.id)}">Book with ${esc(b.name)} ${ic('arrow')}</button>` : `<p class="muted">${b.role === 'nails' ? 'Nail services are coming to online booking soon.' : 'Online booking with ' + esc(b.name) + ' is coming soon.'}</p>`}
  </div></div>`);
  el.hidden = false; document.body.style.overflow = 'hidden';
  el.querySelector('.pf-x').focus();
}
// ---------- walk-in queue (QR poster at the shop) ----------
// Optional reference photo: the cut they want, so the barber sees it before they sit down
function refBox(k) {
  const o = S[k];
  return `<div class="field refbox"><label for="${k}-ref">Photo of the cut you want <span class="opt">(optional)</span></label>
    ${o.ref ? `<div class="ref-prev"><img src="${o.ref}" alt="Your reference photo"><div><b>Photo added</b><p class="muted small">Your barber sees it before your visit.</p><button type="button" class="link-btn" data-act="refRemove" data-k="${k}">Remove</button></div></div>`
      : `<label class="ref-drop${o.refBusy ? ' busy' : ''}">${o.refBusy ? '<span class="spinner"></span> Adding…' : `${ic('camera') || ''}<span><b>Add a photo</b><small>A screenshot or picture of a cut you like</small></span>`}<input type="file" id="${k}-ref" accept="image/*" data-ref="${k}" hidden></label>`}</div>`;
}
document.addEventListener('change', async e => {
  const k = e.target && e.target.dataset && e.target.dataset.ref; if (!k || !e.target.files[0]) return;
  const o = S[k]; o.refBusy = true; renderBooker(); schedule();
  try { const blob = await resizeImage(e.target.files[0], 900, 0.78); o.ref = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
  catch (err) { o.ref = ''; if (k === 'bk') S.err = err.message || 'Couldn’t read that photo.'; else o.err = err.message || 'Couldn’t read that photo.'; }
  o.refBusy = false; renderBooker(); schedule();
});
// Sends the photo once the booking exists (the photo is optional, so a failure doesn't stop the booking)
const sendRef = async (o, r) => { if (o.ref && r && r.id && r.token) { try { await call('addRefPhoto', { id: r.id, token: r.token, image: o.ref }); } catch (_) {} } };
// Optional birthday (month and day) for the free birthday haircut. `k` is the state key: 'bk' or 'q'.
const bdayOf = o => cleanBday(o.bm && o.bd ? `${o.bm}-${o.bd}` : '');
function bdayBox(k) {
  const o = S[k], half = (o.bm || o.bd) && !bdayOf(o);
  return `<div class="field bday"><label for="${k}-bday-m">${BDAY_TITLE} <span class="opt">(optional)</span></label><p class="muted small bday-hint">${BDAY_HINT}</p>
    ${bdayPick(o, k)}
    ${half ? `<p class="muted small">Pick the ${o.bm ? 'day' : 'month'} too.</p>` : ''}</div>`;
}
const bdayPick = (o, k) => bdaySelects(`${o.bm || 0}-${o.bd || 0}`, k + '-bday', part => `data-bind="${k}.b${part}" data-live`);
// Live walk-in wait, from the shop's queue (no names). Updates as the shop checks people in.
function waitText() {
  const e = queueEstimate(S.queue, info()); if (!e) return '';
  return e.mins === 0 ? 'A chair is free now' : `About ${e.mins} min wait${e.waiting ? ` · ${e.waiting} waiting` : ''}`;
}
const waitChip = () => { const t = waitText(); return t ? `<span class="chip wait-chip" title="Walk-in wait right now"><b aria-hidden="true">⏱</b>Walk-ins: ${esc(t.charAt(0).toLowerCase() + t.slice(1))}</span>` : ''; };
// Pop-up before paying for a senior barber booking: the rules that cost money, with a box to tick
function agreePop() {
  const p = policyOf(info()), el = document.createElement('div');
  el.className = 'agree-scrim'; el.id = 'agree-pop';
  el.innerHTML = `<div class="agree-card" role="dialog" aria-modal="true" aria-labelledby="agree-h"><p class="eyebrow">Before you book</p><h2 id="agree-h">Senior barber booking rules</h2>
    <ul class="agree-list"><li><b>${m(p.deposit)} down payment</b> to confirm your slot. It comes off your bill.</li>
      <li><b>${p.lateMinutesDeposit ?? 20}-minute grace period.</b> If you’re more than ${p.lateMinutesDeposit ?? 20} minutes late, the down payment is kept and you still pay the <b>full price of your service</b>, for the barber’s reserved time.</li>
      <li><b>Cancel at least ${p.cancelHours ?? 48} hours before</b> to get your down payment back. Later than that, it isn’t refunded.</li></ul>
    <label class="consent"><input type="checkbox" id="agree-tick"><span>I understand and agree to these rules.</span></label>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="agreeNo">Go back</button><button type="button" class="btn btn-accent" data-act="agreeYes" disabled>Agree and continue</button></div></div>`;
  document.body.appendChild(el); document.body.style.overflow = 'hidden';
  const tick = el.querySelector('#agree-tick'), yes = el.querySelector('[data-act=agreeYes]');
  tick.addEventListener('change', () => { yes.disabled = !tick.checked; });
  setTimeout(() => tick.focus(), 30);
}
const agreeClose = () => { document.getElementById('agree-pop')?.remove(); document.body.style.overflow = ''; };
function walkinBox() {
  const q = S.q, I = info(), t = phNow(), inToday = (I.barbers || []).filter(b => (b.days || []).includes(t.dow));
  if (q.done) return `<div class="walkin done-wl">${ic('check')}<div><p class="eyebrow">Walk-in queue</p><h3>You’re number ${esc(q.done.queueNo)}</h3><p class="muted">We’ll call your name in order. Keep this page open to see how many are ahead of you.</p>
    <a class="btn btn-accent" href="booking.html?id=${encodeURIComponent(q.done.id)}&t=${encodeURIComponent(q.done.token)}">See my place in line ${ic('arrow')}</a></div></div>`;
  const picks = [['deluxe', 'Deluxe haircut'], ['regular', 'Regular haircut'], ['her', 'For her'], ['nails', 'Nails'], ['other', 'Not sure yet']].filter(([k]) => k === 'other' || (k === 'her' || k === 'nails' ? svcs().some(x => x.group === k) : svcs().some(x => x.tier === k)));
  return `<div class="walkin"><div class="walkin-h"><p class="eyebrow">At the shop now?</p><h2 class="sec-title" style="font-size:clamp(26px,4vw,36px)">Join the walk-in queue</h2>${waitText() ? `<p class="wait-now"><b aria-hidden="true">⏱</b> Right now: <b>${esc(waitText())}</b></p>` : ''}<p class="muted">No down payment. We call names in order, and clients with a booking go first at their time.</p></div>
    <div class="walkin-f">
      <div class="fgrid"><div class="field"><label for="q-name">Your name <span class="req" aria-hidden="true">*</span></label><input id="q-name" data-bind="q.name" value="${esc(q.name)}" autocomplete="name" required></div>
      <div class="field"><label for="q-phone">Mobile number <span class="req" aria-hidden="true">*</span></label><input id="q-phone" type="tel" inputmode="tel" data-bind="q.phone" value="${esc(q.phone)}" autocomplete="tel" placeholder="0917 123 4567" required></div></div>
      ${bdayBox('q')}
      ${refBox('q')}
      <p class="small" style="font-weight:700;margin:0">What are you getting?</p>
      <div class="seg" role="group" aria-label="What you’re getting">${picks.map(([k, l]) => `<button type="button" data-act="qPick" data-v="${k}" aria-pressed="${q.pick === k}">${l}</button>`).join('')}</div>
      ${inToday.length ? `<div class="field"><label for="q-barber">Barber</label><select id="q-barber" data-bind="q.barber"><option value="">Whoever’s free first</option>${inToday.map(b => `<option value="${esc(b.id)}" ${q.barber === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>` : ''}
      ${q.err ? `<p class="err" role="alert">${esc(q.err)}</p>` : ''}
      <button type="button" class="btn btn-accent btn-lg" data-act="joinQueue" ${q.busy ? 'disabled' : ''}>${q.busy ? '<span class="spinner"></span> Adding you…' : 'Join the queue'}</button>
      <button type="button" class="link-btn" data-act="scroll" data-to="book">Want a set time instead? Book an appointment</button>
    </div></div>`;
}

function policyCards() {
  const p = policyOf(info()), sh = info().shop, on = p.onlineBooking;
  const juniors = (info().barbers || []).some(b => b.noDeposit && b.active !== false) ? ' Only bookings with our senior barbers need one; everyone else, you pay at the shop.' : '';
  const pay = on ? `Down payment to confirm your booking, paid online by GCash, Maya or card. It’s deducted from your bill.${juniors}`
    : `Down payment to confirm your booking${sh.gcashNumber ? `, sent by GCash to ${esc(sh.gcashNumber)}${sh.gcashName ? ` (${esc(sh.gcashName)})` : ''}` : ''}. Send the proof on our Facebook page. No down payment, no booking. It’s deducted from your bill.`;
  return `<div class="policy">
    <div class="reveal">${ic('check', 'pic')}<b>${m(p.deposit)}</b><span>${pay}</span></div>
    <div class="reveal" style="--d:80ms">${ic('clock', 'pic')}<b>${p.lateMinutes} / ${p.lateMinutesDeposit ?? 20} min</b><span>Junior barbers: ${p.lateMinutes} minutes late and your slot may go to a walk-in; we’ll fit you in at the next free time. Senior barbers: over ${p.lateMinutesDeposit ?? 20} minutes late, the down payment is kept and the full price is still due.</span></div>
    <div class="reveal" style="--d:120ms">${ic('arrow', 'pic')}<b>${p.cancelHours ?? 48} hrs</b><span>Cancel at least ${p.cancelHours ?? 48} hours before to get your down payment back. Later than that, it isn’t refunded.</span></div>
    <div class="reveal" style="--d:160ms">${ic('arrow', 'pic')}<b>${p.rescheduleHours} hrs</b><span>${on ? `Reschedule online up to ${p.rescheduleHours} hours before your appointment, using the link in your confirmation email.` : `Reschedule up to ${p.rescheduleHours} hours before your appointment by messaging us.`}</span></div>
    <div class="reveal" style="--d:240ms">${ic('user', 'pic')}<b>1 person</b><span>Each booking is for one person only. Booking for a friend too? Book a separate slot for them.</span></div>
  </div>`;
}

const optLine = s => (s.options || []).length ? `<span class="mi-opts">${s.options.map(o => `${esc(o.name)} +${m(o.add)}`).join(' · ')}</span>` : '';
function menuBoard(group) {
  const list = svcs().filter(s => (s.group || 'him') === group);
  if (!list.length) return '<p class="empty">Menu coming soon.</p>';
  const cats = [...new Set(list.map(s => s.cat || 'Services'))], inCat = c => list.filter(s => (s.cat || 'Services') === c);
  // Each category gets a layout by what's in it: haircut tiers side by side, bundles as cards, add-ons as a compact list
  const role = c => { const it = inCat(c); if (/promo|bundle/i.test(c)) return 'bundle'; if (it.every(s => s.kind === 'extra')) return 'extra'; if (it.every(s => s.kind === 'base' && s.tier) && new Set(it.map(s => s.tier)).size === 1) return 'tier'; return 'rest'; };
  const note = c => {
    const items = inCat(c), t = items[0].tier;
    if (t && items.every(s => s.tier === t) && tierNames(t).length) return `<p class="tier-note">${ic('user')} With ${esc(listNames(tierNames(t)))}</p>`;
    if (items.every(s => s.kind === 'extra')) return `<p class="tier-note">${ic('check')} Add to any Deluxe or Regular haircut</p>`;
    return '';
  };
  const item = s => `<li><div class="mi"><span class="mi-name">${esc(s.name)}</span><span class="leader" aria-hidden="true"></span><span class="mi-price">${esc(priceLabel(s, cur()))}</span></div>${perks(s)}
    <div class="mi-row"><p class="mi-meta">${s.mins ? `<span class="mi-time">${ic('clock')}${dur(s.mins)}</span>` : ''}${s.desc ? (s.mins ? ' · ' : '') + esc(s.desc) : ''}${optLine(s)}</p><button class="mi-book" data-act="bookSvc" data-id="${esc(s.id)}">Book ${ic('arrow')}</button></div></li>`;
  const group_ = c => `<div class="mgroup"><h3>${esc(c)}</h3>${note(c)}<ul>${inCat(c).map(item).join('')}</ul></div>`;
  const bundle = s => { const m = /^([A-Z]{1,4}\d+)\s*·\s*(.+)$/.exec(s.name) || [, '', s.name];
    return `<article class="bundle"><div>${m[1] ? `<p class="b-code">${esc(m[1])}</p>` : ''}<h4>${esc(m[2])}</h4><p class="mi-meta"><span class="mi-time">${ic('clock')}${dur(s.mins)}</span>${s.desc ? ' · ' + esc(s.desc) : ''}${optLine(s)}</p></div>
      <div class="b-foot"><b class="mi-price">${esc(priceLabel(s, cur()))}</b><button class="btn btn-sm" data-act="bookSvc" data-id="${esc(s.id)}">Book</button></div></article>`; };
  const by = r => cats.filter(c => role(c) === r);
  const tiers = by('tier'), bundles = by('bundle'), extras = by('extra'), rest = by('rest');
  return `<div class="board2 tab-in">
    ${tiers.length ? `<div class="m-tiers${tiers.length === 1 ? ' one' : ''}">${tiers.map(c => `<section class="tier-box">${group_(c)}</section>`).join('')}</div>` : ''}
    ${bundles.map(c => `<section class="m-bundles"><div class="mb-h"><h3>${esc(c)}</h3>${note(c)}</div><div class="bundle-grid">${inCat(c).map(bundle).join('')}</div></section>`).join('')}
    ${extras.map(c => `<section class="m-extras">${group_(c)}</section>`).join('')}
    ${rest.length ? `<div class="m-rest">${rest.map(group_).join('')}</div>` : ''}
  </div>`;
}

// ---------- booking ----------
// ---------- returning customers: remembered on this phone only ----------
const ME_KEY = 'rb-me';
function loadMe() { try { const v = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); return v && v.name ? v : null; } catch (_) { return null; } }
function saveMe() {
  const b = S.bk;
  try {
    if (!b.remember) { localStorage.removeItem(ME_KEY); return; }
    localStorage.setItem(ME_KEY, JSON.stringify({ name: b.name.trim(), phone: b.phone.trim(), email: b.email.trim(), birthday: bdayOf(b),
      last: { group: b.group, svc: chosen().map(x => x.id), barber: b.barber }, at: Date.now() }));
  } catch (_) {}
}
function forgetMe() { try { localStorage.removeItem(ME_KEY); } catch (_) {} S.me = null; Object.assign(S.bk, { name: '', phone: '', email: '', bm: '', bd: '' }); }
// Pick services + barber (from "Book again", a rebook link, or the remembered last visit), then go to the date step.
function applySelection({ group, svc = [], barber: bid = '' }) {
  const list = svc.map(id => svcs().find(x => x.id === id)).filter(Boolean);
  if (!list.length && !bid) return false;
  const g = (list[0] && (list[0].group || 'him')) || group || (barber(bid)?.groups || ['him'])[0] || 'him';
  S.bk.group = g; S.bk.svc = {}; S.bk.tier = '';
  const bases = list.filter(x => x.kind === 'base');
  for (const x of list) if (x.kind !== 'base' || x === bases[0]) S.bk.svc[x.id] = true;
  if (bases[0] && bases[0].tier) S.bk.tier = bases[0].tier;
  const b = barber(bid);
  S.bk.barber = b && (!list.length || canServe(b, chosen())) ? b.id : '';
  if (!S.bk.tier && b && (b.tiers || []).length === 1) S.bk.tier = b.tiers[0];
  S.bk.time = ''; S.bk.date = firstDate(); watchSlots();
  return true;
}
// ---------- book for two ----------
// The second person gets the same services, or picks their own. They come at the same time with another
// barber/stylist, or right after with the same barber (only when he does their services too).
const guestSvcs = () => { const g = S.bk.guest; return g.own ? svcs().filter(x => g.svc[x.id]).map(withOpt) : chosen(); };
// "Add nails to this visit": the same client adds a service of another kind, done by someone else (one down payment)
// Only between For her and Nails (not offered with men's haircuts)
const addOnGroups = () => groupTabs().filter(([k]) => (S.bk.group === 'her' && k === 'nails') || (S.bk.group === 'nails' && k === 'her'));
// Who does the extra service, for the summary: the chosen person, or the only one free, or "another <role>"
const guestWho = o => { const id = o.barberId || ((availableTimes(info(), { services: guestSvcs(), date: o.date || S.bk.date, barberId: '' }, S.slots).find(x => x.time === o.time) || {}).barbers || []).filter(x => x !== S.bk.barber).concat([''])[0];
  return id ? ` with ${esc(barber(id)?.name || '')}` : `, another ${staffWord(guestSvcs()[0] && guestSvcs()[0].group)}`; };
// Step 1: "Add nails to this visit" right under the haircut (or "Add a hair service" when booking nails)
function addOnPicker() {
  const groups = addOnGroups(); if (!groups.length) return '';
  const g = S.bk.guest, grp = g.self ? g.group : groups.some(x => x[0] === S.addOnG) ? S.addOnG : groups[0][0], list = svcs().filter(s => (s.group || 'him') === grp && s.kind !== 'extra');
  const who = (info().barbers || []).filter(x => isServiceStaff(x) && x.active !== false && list.some(s => canServe(x, [s]))).map(x => x.name);
  return `<div class="addon"><div class="addon-h"><b>${ic('plus')} Add ${addOnLabel(grp)} to this visit?</b><small>${who.length === 1 ? `With ${esc(who[0])}, ` : ''}at the same time or right after. No extra down payment.</small></div>
    ${groups.length > 1 ? `<div class="tabs sm" role="tablist">${groups.map(([k, l]) => `<button role="tab" type="button" aria-selected="${grp === k}" data-act="addOnGroup" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    <div class="pick">${svcs().filter(s => (s.group || 'him') === grp).map(s => `<button type="button" class="pickcard sm" data-act="addOnSvc" data-g="${grp}" data-id="${esc(s.id)}" aria-pressed="${!!(g.self && g.svc[s.id])}"><span class="tick" aria-hidden="true">${ic('check')}</span><b>${esc(s.name)}</b><small>${dur(s.mins)}</small><span class="p">${esc(priceLabel(s, cur()))}</span></button>`).join('')}</div>
    ${g.self ? optionsBox(svcs().filter(s => g.svc[s.id])) : ''}
    ${g.self && guestSvcs().length && comboError(info(), guestSvcs()) ? `<p class="err">${esc(comboError(info(), guestSvcs()))}</p>` : ''}</div>`;
}
// Step 3: when the add-on happens (picked after the main time)
function addOnWhen(times) {
  const g = S.bk.guest; if (!g.self || !guestValid()) return '';
  const opts = guestOptions(times);
  if (opts.length && !g.mode) g.mode = opts[0].mode;
  return `<div class="addon-when"><p class="small" style="font-weight:700;margin:0 0 8px">When for your ${esc(guestSvcs().map(x => x.name.toLowerCase()).join(' + '))}?</p>
    ${opts.length ? `<div class="guest-opts" role="radiogroup" aria-label="When for the extra service">${opts.map(o => `<button type="button" class="pickcard radio" role="radio" data-act="guestMode" data-v="${o.mode}" aria-pressed="${g.mode === o.mode}" aria-checked="${g.mode === o.mode}"><span class="tick" aria-hidden="true">${ic('check')}</span><b>${esc(o.label)}</b><small>${esc(o.sub)}</small></button>`).join('')}</div>${g.mode === 'pick' ? guestWhen() : ''}` : '<p class="muted small">Nothing free around this time. Try another time.</p>'}
    ${S.tried && detailErrors().gmode ? `<p class="field-err">${esc(detailErrors().gmode)}</p>` : ''}</div>`;
}
const addOnLabel = g => g === 'nails' ? 'nails' : 'a hair service';
const guestValid = () => { const l = guestSvcs(); return l.length > 0 && !comboError(info(), l); };
function guestOptions(times) {
  const b = S.bk, pol = policyOf(info()), mins = sum(chosen(), x => x.mins), t = times.find(x => x.time === b.time);
  if (!t || !guestValid()) return [];
  const gs = guestSvcs(), out = [], who = staffWord(gs[0] && gs[0].group);
  const gt = availableTimes(info(), { services: gs, date: b.date, barberId: '' }, S.slots).find(x => x.time === b.time);
  const mainPick = b.barber || t.barbers[0];
  const others = gt ? gt.barbers.filter(id => id !== mainPick) : [];
  if (others.length) out.push({ mode: 'same', time: b.time, barberId: '', label: b.guest.self ? `At the same time, ${fmtTime(b.time)}` : `Same time, ${fmtTime(b.time)}, with another ${who}`, sub: others.length === 1 ? `${barber(others[0])?.name || ''} is free` : `${others.length} are free` });
  const bb = barber(b.barber);
  if (b.guest.self) {
    const next = fromMin(toMin(b.time) + Math.ceil(mins / pol.step) * pol.step);
    const n = availableTimes(info(), { services: gs, date: b.date, barberId: '' }, S.slots).find(x => x.time === next);
    if (n && n.barbers.length) out.push({ mode: 'after', time: next, barberId: '', label: `Right after, ${fmtTime(next)}`, sub: n.barbers.length === 1 ? `With ${barber(n.barbers[0])?.name || ''}` : `${n.barbers.length} are free` });
  } else if (bb && canServe(bb, gs)) {
    const next = fromMin(toMin(b.time) + Math.ceil(mins / pol.step) * pol.step);
    const n = availableTimes(info(), { services: gs, date: b.date, barberId: bb.id }, S.slots).find(x => x.time === next);
    if (n && n.barbers.includes(bb.id)) out.push({ mode: 'after', time: next, barberId: bb.id, label: `Right after, ${fmtTime(next)}, with ${bb.name}`, sub: 'One after the other' });
  }
  // Their own time: any day, any free time, any barber who does their services
  const g = b.guest, gt2 = g.time ? (guestTimes() || []).find(x => x.time === g.time) : null;
  const gb = gt2 && (g.barber && gt2.barbers.includes(g.barber) ? g.barber : gt2.barbers[0]);
  out.push({ mode: 'pick', date: g.date || b.date, time: gb ? g.time : '', barberId: gb || '', label: g.self ? 'Another time' : 'Choose their own time', sub: gb ? `${dayWord(g.date || b.date)}, ${fmtTime(g.time)} with ${barber(gb)?.name || ''}` : g.self ? 'Any day and free time' : 'Any day, any free time, any barber' });
  return out;
}
// Free times for the second person on their chosen day, treating the main booking's chair as taken
function guestTimes() {
  const b = S.bk, g = b.guest, date = g.date || b.date, gs = guestSvcs(), pol = policyOf(info());
  if (!gs.length || !b.time) return [];
  const day = date === b.date ? null : slotsForDay(date);
  if (date !== b.date && !day) return null; // still loading that day
  const slots = { ...S.range.slots, ...(day || {}), ...(date === b.date ? S.slots : {}) };
  const mt = availableTimes(info(), { services: chosen(), date: b.date, barberId: b.barber }, S.slots).find(x => x.time === b.time);
  const mainB = b.barber || (mt && mt.barbers[0]);
  if (mainB && date === b.date) blockTimes(b.time, sum(chosen(), x => x.mins), pol.step).forEach(t => { slots[slotId(mainB, b.date, t)] = { state: 'booked' }; });
  return availableTimes(info(), { services: gs, date, barberId: g.barber }, slots);
}
function guestWhen() {
  const b = S.bk, g = b.guest, gs = guestSvcs(), date = g.date || b.date;
  const bars = (info().barbers || []).filter(x => isServiceStaff(x) && x.active !== false && canServe(x, gs));
  const dates = bookableDates(info());
  const times = guestTimes(), who = staffWord(gs[0] && gs[0].group);
  return `<div class="guest-when">
    <p class="bf-label">Their ${who}</p><div class="bf-row"><button type="button" class="bf-chip" data-act="guestBarber" data-id="" aria-pressed="${!g.barber}"><span class="av any">${ic('scissors')}</span><span>Any</span></button>${bars.map(x => `<button type="button" class="bf-chip" data-act="guestBarber" data-id="${esc(x.id)}" aria-pressed="${g.barber === x.id}">${avatarOf(x)}<span>${esc(x.name)}</span></button>`).join('')}</div>
    <p class="bf-label">Day</p>${monthGrid({ dates: dates.map(d => ({ ...d, off: !!(g.barber && !((barber(g.barber) || {}).days || []).includes(dowOf(d.date))) })), selected: date, act: 'guestDate', month: g.calM || date.slice(0, 7), navAct: 'guestCal', label: 'Their day' })}
    <p class="bf-label">Time</p>${times === null ? '<p class="muted small"><span class="spinner"></span> Checking free times…</p>' : `<div class="times-in">${timeChips(times, g.time, 'guestTime')}</div>`}
  </div>`;
}
// Their own services: For him (Deluxe or Regular haircut + add-ons) or For her
function guestPicker() {
  const g = S.bk.guest, all = svcs().filter(x => (x.group || 'him') === g.group);
  const card = (x, act, radio) => `<button type="button" class="pickcard sm${radio ? ' radio' : ''}" data-act="${act}" data-id="${esc(x.id)}" aria-pressed="${!!g.svc[x.id]}"><span class="tick" aria-hidden="true">${ic('check')}</span><b>${esc(x.name)}</b><small>${dur(x.mins)}</small><span class="p">${esc(priceLabel(x, cur()))}</span></button>`;
  let body;
  if (all.some(x => x.kind === 'base')) {
    const tiers = [...new Set(all.filter(x => x.kind === 'base').map(x => x.tier || ''))];
    const base = all.find(x => x.kind === 'base' && g.svc[x.id]);
    body = `<div class="seg" role="group" aria-label="Haircut level">${tiers.map(t => `<button type="button" data-act="guestTier" data-v="${esc(t)}" aria-pressed="${g.tier === t}">${esc(TIERS[t] || t || 'Haircuts')}</button>`).join('')}</div>
      ${g.tier ? `<div class="pick one-col">${all.filter(x => x.kind === 'base' && (x.tier || '') === g.tier).map(x => card(x, 'guestBase', true)).join('')}</div>
      ${base ? `<p class="small muted" style="margin:4px 0 0">Add extras (optional)</p><div class="pick">${all.filter(x => x.kind !== 'base' && !(base.includes || []).includes(x.id)).map(x => card(x, 'guestSvc')).join('')}</div>` : ''}` : '<p class="muted small">Pick Deluxe or Regular for them.</p>'}`;
  } else body = `<div class="pick">${all.map(x => card(x, 'guestSvc')).join('')}</div>`;
  return `<div class="guest-svc"><div class="tabs sm" role="tablist">${(g.self ? addOnGroups() : groupTabs()).map(([k, l]) => `<button role="tab" type="button" aria-selected="${g.group === k}" data-act="guestGroup" data-v="${k}">${l}</button>`).join('')}</div>${body}</div>`;
}
function guestBox(times) {
  const g = S.bk.guest, pol = policyOf(info());
  if (g.self) return ''; // nails (or hair) for the same client is picked in step 1 and timed in step 3
  if (!g.on) return `<button type="button" class="link-btn add-guest" data-act="guestOn">${ic('user')} Booking for someone else too? Add a second person</button>`;
  const opts = guestOptions(times), gs = guestSvcs();
  return `<div class="guest-box"><div class="row" style="justify-content:space-between"><b>Second person</b><button type="button" class="link-btn" data-act="guestOff">Remove</button></div>
    <div class="field${showErr('gname') && detailErrors().gname ? ' has-err' : ''}"><label for="bk-gname">Their name <span class="req" aria-hidden="true">*</span></label><input id="bk-gname" data-bind="bk.guest.name" data-touch="gname" value="${esc(g.name)}" autocomplete="off" placeholder="e.g. Miguel" required aria-required="true" data-live>${showErr('gname') && detailErrors().gname ? `<p class="field-err">${esc(detailErrors().gname)}</p>` : ''}</div>
    <div><p class="small" style="font-weight:700;margin:0 0 8px">Their services</p>
      <div class="seg" role="group" aria-label="Their services"><button type="button" data-act="guestOwn" data-v="0" aria-pressed="${!g.own}">Same as mine</button><button type="button" data-act="guestOwn" data-v="1" aria-pressed="${g.own}">Choose different</button></div>
      ${g.own ? guestPicker() : `<p class="muted small" style="margin:8px 0 0">${esc(chosen().map(x => x.name).join(', '))}</p>`}</div>
    ${!guestValid() ? (g.own && gs.length ? `<p class="err">${esc(comboError(info(), gs))}</p>` : '') : `<div><p class="small" style="font-weight:700;margin:0 0 8px">When</p>${opts.length ? `<div class="guest-opts" role="radiogroup" aria-label="When">${opts.map(o => `<button type="button" class="pickcard radio" role="radio" data-act="guestMode" data-v="${o.mode}" aria-pressed="${g.mode === o.mode}" aria-checked="${g.mode === o.mode}"><span class="tick" aria-hidden="true">${ic('check')}</span><b>${esc(o.label)}</b><small>${esc(o.sub)}</small></button>`).join('')}</div>${g.mode === 'pick' ? guestWhen() : ''}`
      : `<p class="muted small">No free slot for them at ${fmtTime(S.bk.time)}${g.own ? ' for those services' : ''}. Try another time${g.own ? ' or service' : ''}.</p>`}</div>`}
    ${S.tried && (detailErrors().gsvc || detailErrors().gmode) ? `<p class="field-err">${esc(detailErrors().gsvc || detailErrors().gmode)}</p>` : ''}
    <p class="muted small">Each person booked with a senior barber needs the ${m(pol.deposit)} down payment. Everyone else pays at the shop.</p></div>`;
}
const guestPick = times => { const g = S.bk.guest; if (!g.on) return null; const o = guestOptions(times).find(o => o.mode === g.mode); return o && o.time ? o : null; };
// ---------- next available ----------
function ensureRange() {
  const R = S.range; if (R.loading || Date.now() - R.at < 60e3) return;
  const ds = bookableDates(info()).filter(d => !d.closed).slice(0, 14).map(d => d.date); if (!ds.length) return;
  R.loading = true;
  db.collection('slots').where('date', '>=', ds[0]).where('date', '<=', ds[ds.length - 1]).get()
    .then(s => { R.slots = Object.fromEntries(s.docs.map(x => [x.id, x.data()])); R.at = Date.now(); R.loading = false; renderBooker(); })
    .catch(() => { R.at = Date.now(); R.loading = false; });
}
// Slots for one day outside the 14-day range (the second person can pick any day up to the booking limit)
const dayCache = {};
function slotsForDay(date) {
  const c = dayCache[date];
  if (c && Date.now() - c.at < 60e3) return c.slots;
  if (!c || !c.loading) { dayCache[date] = { ...(c || { slots: null }), loading: true, at: (c && c.at) || 0 };
    db.collection('slots').where('date', '==', date).get().then(s => { dayCache[date] = { slots: Object.fromEntries(s.docs.map(x => [x.id, x.data()])), at: Date.now(), loading: false }; renderBooker(); })
      .catch(() => { dayCache[date] = { slots: {}, at: Date.now(), loading: false }; }); }
  return c ? c.slots : null;
}
function nextFree() {
  const picked = chosen(); if (!picked.length || !S.range.at) return null;
  const bb = barber(S.bk.barber), slots = { ...S.range.slots, ...(S.slotsDate ? S.slots : {}) };
  for (const d of bookableDates(info()).slice(0, 15)) {
    if (d.closed || (bb && !(bb.days || []).includes(dowOf(d.date)))) continue;
    const t = availableTimes(info(), { services: picked, date: d.date, barberId: S.bk.barber }, slots).find(x => x.barbers.length);
    if (t) return { date: d.date, time: t.time, barber: S.bk.barber || t.barbers[0], any: !S.bk.barber };
  }
  return null;
}
const dayWord = d => d === phNow().date ? 'Today' : d === addDays(phNow().date, 1) ? 'Tomorrow' : fmtDate(d);
// ---------- required details (checked before the deposit) ----------
const phoneDigits = v => String(v || '').replace(/\D/g, '');
const validPhone = v => /^(09\d{9}|639\d{9})$/.test(phoneDigits(v));
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
function detailErrors() {
  const b = S.bk, e = {};
  if (b.name.trim().length < 2) e.name = 'Enter your full name.';
  if (!b.phone.trim()) e.phone = 'Enter your mobile number.'; else if (!validPhone(b.phone)) e.phone = 'Enter an 11-digit mobile number, like 0917 123 4567.';
  if (!b.email.trim()) e.email = 'Enter your email. Your confirmation and booking link go there.'; else if (!validEmail(b.email)) e.email = 'Check your email address, like juan@gmail.com.';
  if (b.guest.on) {
    if (!b.guest.self && b.guest.name.trim().length < 2) e.gname = 'Enter the second person’s name.';
    if (!guestValid()) e.gsvc = 'Pick the second person’s services.'; else if (!b.guest.mode) e.gmode = 'Pick when the second person comes.'; else if (b.guest.mode === 'pick' && !guestPick(availableTimes(info(), { services: chosen(), date: b.date, barberId: b.barber }, S.slots))) e.gmode = 'Pick a day and time for the second person.';
  }
  if (!b.consent) e.consent = 'Please agree to the Booking Terms and Privacy Policy.';
  return e;
}
const showErr = k => S.tried || S.touched[k];
function stepState() {
  const b = S.bk, picked = chosen().length > 0 && !comboError(info(), chosen()), when = !!(b.date && b.time);
  const details = when && !Object.keys(detailErrors()).length;
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
  const dates = bookableDates(I).map(d => ({ ...d, off: !d.closed && b.barber && (!(barber(b.barber)?.days || []).includes(dowOf(d.date)) || (barber(b.barber)?.off || []).includes(d.date)) }));
  const times = b.date && picked.length ? availableTimes(I, { services: picked, date: b.date, barberId: b.barber }, S.slots) : [];
  const total = sum(picked, s => s.price), from = picked.some(s => s.priceFrom), mins = sum(picked, s => s.mins);
  const gpk = st.when ? guestPick(times) : null, people = gpk && !b.guest.self ? 2 : 1, due = dueFor(gpk);
  const labels = ['Services', staffWord(b.group, true), 'Date & time', 'Details'];
  const done = [st.picked, st.picked && b.date, st.when, st.details];
  return `<div class="progress" aria-label="Booking progress"><div class="bar-track"><i style="width:${st.n * 25}%"></i></div><ol>${labels.map((l, i) => `<li class="${done[i] ? 'done' : ''}"><span>${done[i] ? ic('check') : i + 1}</span>${l}</li>`).join('')}</ol></div>
  <div class="booker"><div class="steps">
    <section class="step" id="st-1"><div class="step-h"><span class="n ${st.picked ? 'ok' : ''}">${st.picked ? ic('check') : 1}</span><h3>Choose services</h3>${picked.length ? `<span class="done">${picked.length} selected · ${dur(mins)}</span>` : ''}</div>
      ${welcomeBack()}
      ${barberFirst()}
      <div class="tabs" role="tablist">${groupTabs().map(([k, l]) => `<button role="tab" type="button" aria-selected="${b.group === k}" data-act="bkGroup" data-v="${k}">${l}</button>`).join('')}</div>
      ${hasTiers(b.group) ? tierPicker() : `<div class="pick">${svcs().filter(s => (s.group || 'him') === b.group).map(s => svcCard(s)).join('')}</div>${optionsBox(svcs().filter(s => S.bk.svc[s.id]))}`}
      ${picked.length ? addOnPicker() : ''}
    </section>
    <section class="step" id="st-2" ${st.picked ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n ${st.picked ? 'ok' : ''}">${st.picked ? ic('check') : 2}</span><h3>Choose your ${staffWord(b.group)}</h3></div>
      <div class="pick barbers-pick">
        <button type="button" class="pickcard" data-act="bkBarber" data-id="" aria-pressed="${!b.barber}" ${st.picked ? '' : 'disabled'}><span class="av any">${ic('scissors')}</span><b>Any available</b><small>The shop picks your barber</small></button>
        ${bars.map(x => `<button type="button" class="pickcard" data-act="bkBarber" data-id="${esc(x.id)}" aria-pressed="${b.barber === x.id}" ${st.picked ? '' : 'disabled'}><span class="av">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : esc(initials(x.name))}</span><b>${esc(x.name)}</b><small>${esc(x.title || '')}</small>${x.noDeposit ? '<small class="nodep">No down payment</small>' : ''}</button>`).join('')}
      </div>
    </section>
    <section class="step" id="st-3" ${st.picked ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n ${st.when ? 'ok' : ''}">${st.when ? ic('check') : 3}</span><h3>Pick a date and time</h3>${st.when ? `<span class="done">${fmtDate(b.date)}, ${fmtTime(b.time)}</span>` : ''}</div>
      ${st.picked ? nextFreeCard() : ''}
      ${monthGrid({ dates, selected: b.date, act: 'bkDate', month: S.calM, navAct: 'calNav', disabled: !st.picked })}
      ${st.picked && b.date ? (S.slotsLoaded ? `<div class="times-in">${timeChips(times, b.time, 'bkTime')}</div>${b.time ? addOnWhen(times) : ''}${waitlistBox(times)}` : '<p class="muted small"><span class="spinner"></span> Checking free times…</p>') : `<p class="muted small">${st.picked ? 'Pick a date to see free times.' : hasTiers(b.group) ? 'Pick a haircut first.' : 'Choose a service first.'}</p>`}
    </section>
    <section class="step" id="st-4" ${st.when ? '' : 'aria-disabled="true"'}><div class="step-h"><span class="n ${st.details ? 'ok' : ''}">${st.details ? ic('check') : 4}</span><h3>Your details</h3><span class="req-note"><span class="req">*</span> Required</span></div>
      <div class="fgrid">
        ${fieldIn('Full name', 'bk-name', 'name', 'text', 'name')}
        ${fieldIn('Mobile number', 'bk-phone', 'phone', 'tel', 'tel', '0917 123 4567', 'inputmode="tel" maxlength="16"')}
      </div>
      ${fieldIn('Email (for your confirmation and booking link)', 'bk-email', 'email', 'email', 'email', 'you@example.com', 'inputmode="email"')}
      ${bdayBox('bk')}
      ${st.when ? guestBox(times) : ''}
      ${refBox('bk')}
      <div class="field"><label for="bk-notes">Notes (optional)</label><textarea id="bk-notes" data-bind="bk.notes" rows="2" placeholder="Style, reference photo on Facebook, anything we should know">${esc(b.notes)}</textarea></div>
      <label class="consent remember"><input type="checkbox" id="bk-remember" data-bind="bk.remember" ${b.remember ? 'checked' : ''}><span>Remember my details on this phone for next time</span></label>
      <label class="consent${showErr('consent') && !b.consent ? ' has-err' : ''}"><input type="checkbox" id="bk-consent" data-bind="bk.consent" data-touch="consent" data-live required aria-required="true" ${b.consent ? 'checked' : ''}><span>I have read and agree to the <a href="terms.html" target="_blank" rel="noopener">Booking Terms</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>: ${due ? `the ${m(pol.deposit)} down payment isn’t refunded if I cancel or arrive ${pol.lateMinutes}+ minutes late` : `I’ll cancel or move my booking if I can’t come, and my slot may go to a walk-in if I’m ${pol.lateMinutes}+ minutes late`}, and ${esc(I.shop.name)} may use my name, number and email to manage this booking and send reminders. <span class="req" aria-hidden="true">*</span></span></label>
      ${showErr('consent') && !b.consent ? '<p class="field-err">Please agree to the Booking Terms and Privacy Policy.</p>' : ''}
    </section>
  </div>
  <aside class="summary" id="summary" aria-label="Booking summary">
    <div class="summary-top"><h3>Your booking</h3>${picked.length ? `<span class="chip">${ic('clock')}${dur(mins)}</span>` : ''}</div>
    <div class="summary-b">
      <div class="sumrow"><span>${staffWord(b.group, true)}</span><b>${b.barber ? esc(barber(b.barber)?.name || '') : 'Any available (the shop picks)'}</b></div>
      <div class="sumrow"><span>When</span><b>${st.when ? `${fmtDate(b.date)}<br>${fmtTime(b.time)}` : '—'}</b></div>
      ${gpk ? `<div class="sumrow"><span>${b.guest.self ? 'Also' : 'Second person'}</span><b>${b.guest.self ? guestSvcs().map(x => esc(x.name)).join('<br>') : esc(b.guest.name.trim() || 'Guest') + (b.guest.own ? `<br>${guestSvcs().map(x => esc(x.name)).join('<br>')}` : '')}<br>${gpk.date && gpk.date !== b.date ? `${fmtDate(gpk.date)}, ` : ''}${fmtTime(gpk.time)}${guestWho(gpk)}</b></div>` : ''}
      ${bill(picked, gpk, people, due)}
      ${due ? payChoice() : ''}
      <p class="muted small">${!due ? 'No down payment needed with this barber. You pay at the shop after your cut.' : S.pay === 'gcash' ? 'Your slot is held for 30 minutes while you send the payment and upload the screenshot.' : `Your slot is held for ${pol.holdMinutes} minutes while you pay.`}</p>
      ${S.err ? `<p class="err shake" role="alert">${esc(S.err)}</p>` : ''}
      ${st.when && !st.details ? `<p class="muted small" id="pay-missing">${S.tried ? `Still needed: ${esc(Object.keys(detailErrors()).map(k => ({ name: 'your name', phone: 'mobile number', email: 'email', consent: 'agreeing to the terms', gname: 'second person’s name', gsvc: 'their services', gmode: 'when they come' }[k])).join(', '))}.` : 'Fill in your details to continue.'}</p>` : ''}
      <button type="button" class="btn btn-accent btn-lg pay-btn" data-act="pay" ${st.when && !S.busy ? '' : 'disabled'} ${st.details ? '' : 'aria-describedby="pay-missing"'}>${S.busy ? '<span class="spinner"></span> Securing your slot…' : !due ? `Confirm booking ${ic('arrow')}` : S.pay === 'gcash' ? `Book and pay ${m(due)} by GCash ${ic('arrow')}` : `Pay ${m(due)} deposit${due > pol.deposit ? 's' : ''} ${ic('arrow')}`}</button>
      <p class="paynote">${ic('check')} ${!due ? 'Confirmed right away. We send your booking link by email.' : S.pay === 'gcash' ? `Next: send ${m(due)} to our GCash and upload the screenshot. We confirm it as soon as we see it.` : 'Secure payment by PayMongo: GCash, Maya, card or QR Ph'}</p>
    </div>
  </aside></div>`;
}
// ---------- price breakdown, promo code, how to pay ----------
function promoOff(total) {
  const p = S.promo.applied; if (!p || !total) return 0;
  const v = parseFloat(String(p.label).replace(/[^\d.]/g, '')) || 0;
  return Math.min(total, /%/.test(p.label) ? Math.floor(total * v / 100) : v);
}
// Down payment due now: none for junior barbers. An add-on for the same client rides on the main payment.
function dueFor(gpk) {
  const I = info(), b = S.bk, main = depositFor(I, b.barber, chosen());
  if (!gpk) return main;
  const g = depositFor(I, gpk.barberId || '', guestSvcs());
  return main + (b.guest.self ? (main ? 0 : g) : g);
}
function bill(picked, gpk, people, due = dueFor(gpk)) {
  const pol = policyOf(info()), gs = gpk ? guestSvcs() : [], all = [...picked, ...gs];
  const svcTotal = sum(all, x => x.price), from = all.some(x => x.priceFrom), off = promoOff(svcTotal), dep = due;
  const prodList = Object.entries(prodQ()).filter(([, n]) => n > 0).map(([name, n]) => { const p = products().find(x => x.name === name); return p && { ...p, n }; }).filter(Boolean), total = svcTotal + sum(prodList, p => p.price * p.n);
  const line = (l, r, cls = '') => `<div class="bill-row ${cls}"><span>${l}</span><b>${r}</b></div>`;
  if (!picked.length) return `<div class="bill"><p class="muted small">Pick a service to see the price breakdown.</p></div><div class="due"><span>Down payment now</span><b>${dep ? m(dep) : 'None'}</b></div>`;
  return `<div class="bill" aria-label="Price breakdown"><p class="bill-h">Price breakdown</p>
    ${gpk ? `<p class="bill-sub">${esc(S.bk.name.trim().split(' ')[0] || 'You')}</p>` : ''}
    ${picked.map(x => line(esc(x.name), esc(priceLabel(x, cur())))).join('')}
    ${gpk ? `<p class="bill-sub">${S.bk.guest.self ? 'Also for you' : esc(S.bk.guest.name.trim() || 'Second person')}</p>${gs.map(x => line(esc(x.name), esc(priceLabel(x, cur())))).join('')}` : ''}
    ${off ? line(`Promo ${esc(S.promo.applied.code)} (${esc(S.promo.applied.label)})`, '−' + m(off), 'disc') : ''}
    ${prodList.length ? `<p class="bill-sub">Set aside for you (pay at the shop)</p>${prodList.map(p => line(esc(p.name) + (p.n > 1 ? ' ×' + p.n : ''), p.price ? m(p.price * p.n) : 'price at the shop')).join('')}` : ''}
    ${line('Estimated total', (from ? 'from ' : '') + m(total - off), 'tot')}</div>
    ${promoBox()}
    <div class="due"><span>Down payment now${dep > policyOf(info()).deposit ? ' (2 people)' : ''}</span><b>${dep ? m(dep) : 'None, pay at the shop'}</b></div>
    ${line('Pay at the shop', (from ? 'from ' : '') + m(Math.max(0, total - off - dep)), 'rest')}
    ${from ? '<p class="muted small">Prices marked “from” depend on hair length and products. Your barber or stylist confirms the price first.</p>' : ''}`;
}
function promoBox() {
  const P = S.promo;
  if (P.applied) return `<div class="promo-box on">${ic('check')}<span><b>${esc(P.applied.code)}</b> applied · ${esc(P.applied.label)}</span><button type="button" class="link-btn" data-act="promoRemove">Remove</button></div>`;
  if (!P.open) return `<button type="button" class="link-btn promo-open" data-act="promoOpen">Have a promo code?</button>`;
  return `<div class="promo-box"><div class="promo-in"><input id="promo-code" data-bind="promo.code" value="${esc(P.code)}" placeholder="Promo code" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Promo code"><button type="button" class="btn btn-sm" data-act="promoApply" ${P.busy ? 'disabled' : ''}>${P.busy ? '<span class="spinner"></span>' : 'Apply'}</button></div>
    ${P.err ? `<p class="field-err">${esc(P.err)}</p>` : ''}<p class="muted small">Comes off your bill at the shop. The down payment stays the same.</p></div>`;
}
function payChoice() {
  const sh = info().shop; if (!sh.gcashNumber || policyOf(info()).manualGcash === false) return '';
  const o = (v, t, d) => `<button type="button" class="pm" role="radio" data-act="payM" data-v="${v}" aria-checked="${S.pay === v}" aria-pressed="${S.pay === v}"><span class="tick" aria-hidden="true">${ic('check')}</span><b>${t}</b><small>${d}</small></button>`;
  return `<p class="bill-h" style="margin-top:4px">How do you want to pay?</p><div class="paym" role="radiogroup" aria-label="How to pay the down payment">${o('online', 'Pay online', 'GCash, Maya, card or QR Ph. Confirmed right away.')}${o('gcash', 'Send by GCash', 'Send to our number, then upload the screenshot. The shop confirms it.')}</div>`;
}
function welcomeBack() {
  const me = S.me; if (!me || chosen().length) return '';
  const last = me.last || {}, list = (last.svc || []).map(id => svcs().find(x => x.id === id)).filter(Boolean), bb = barber(last.barber);
  return `<div class="welcome"><div><b>Welcome back, ${esc(String(me.name).split(' ')[0])}</b>${list.length ? `<small>Last time: ${esc(list.map(x => x.name).join(' + '))}${bb ? ` with ${esc(bb.name)}` : ''}</small>` : ''}</div>
    <div class="row">${list.length ? `<button type="button" class="btn btn-sm btn-accent" data-act="bookAgain">Book the same again</button>` : ''}${S.last && S.last.id ? `<a class="link-btn" href="booking.html?id=${encodeURIComponent(S.last.id)}&t=${encodeURIComponent(S.last.token)}">My loyalty card</a>` : ''}<button type="button" class="link-btn" data-act="forgetMe">Not ${esc(String(me.name).split(' ')[0])}?</button></div></div>`;
}
// Start with the barber: pick him first, then only his level's haircuts and his free hours show.
function barberFirst() {
  const b = S.bk, chosenB = barber(b.barber), all = (info().barbers || []).filter(x => isServiceStaff(x) && x.active !== false && bookable(x));
  if (chosenB) return `<div class="bf-chosen">${avatarOf(chosenB)}<span>Booking with <b>${esc(chosenB.name)}</b>${chosenB.tiers && chosenB.tiers.length === 1 ? ` · ${esc(TIERS[chosenB.tiers[0]] || '')} haircuts` : ''}</span><button type="button" class="link-btn" data-act="bfClear">Change</button></div>`;
  if (!S.byBarber) return `<button type="button" class="link-btn bf-open" data-act="bfOpen">${ic('scissors')} Have a favorite barber? Choose him first</button>`;
  const groups = [['deluxe', 'Deluxe · senior barbers'], ['regular', 'Regular · junior barbers'], ['her', 'Hair stylists'], ['nails', 'Nails'], ['braids', 'Braids']];
  const inG = (x, k) => ['her', 'nails', 'braids'].includes(k) ? (x.groups || []).includes(k) : (x.groups || ['him']).includes('him') && (x.tiers || []).includes(k);
  return `<div class="bf-pick"><div class="row" style="justify-content:space-between"><b>Choose your barber</b><button type="button" class="link-btn" data-act="bfClose">Close</button></div>
    ${groups.map(([k, l]) => { const xs = all.filter(x => inG(x, k)); return xs.length ? `<p class="bf-label">${esc(l)}</p><div class="bf-row">${xs.map(x => `<button type="button" class="bf-chip" data-act="bfPick" data-id="${esc(x.id)}">${avatarOf(x)}<span>${esc(x.name)}</span></button>`).join('')}</div>` : ''; }).join('')}</div>`;
}
const avatarOf = x => `<span class="av">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : esc(initials(x.name))}</span>`;
function nextFreeCard() {
  ensureRange();
  const n = nextFree(); if (!n) return S.range.at ? '' : '<p class="muted small next-free-wait"><span class="spinner"></span> Finding the earliest free time…</p>';
  const same = S.bk.date === n.date && S.bk.time === n.time, who = barber(n.barber)?.name || '';
  return `<button type="button" class="next-free${same ? ' on' : ''}" data-act="bkNext" data-date="${n.date}" data-time="${n.time}">
    <span class="nf-ic" aria-hidden="true">${ic('clock')}</span><span><small>Next available</small><b>${esc(dayWord(n.date))}, ${fmtTime(n.time)}${who ? ` with ${esc(who)}` : ''}</b></span><span class="nf-go">${same ? 'Selected' : 'Book this'}</span></button>`;
}
// "Included" tags on a service (e.g. Signature Haircut: shampoo and rinse included)
const perks = s => (s.perks || []).length ? `<span class="perks">${s.perks.map(p => `<span class="perk">${ic('check')}${esc(p)}</span>`).join('')}</span>` : '';
function svcCard(s, act = 'bkSvc', extra = {}) {
  return `<button type="button" class="pickcard${extra.radio ? ' radio' : ''}" data-act="${act}" data-id="${esc(s.id)}" aria-pressed="${!!S.bk.svc[s.id]}" ${extra.disabled ? 'disabled' : ''}><span class="tick" aria-hidden="true">${ic('check')}</span><b>${esc(s.name)}</b><small>${extra.note ? esc(extra.note) : `${s.mins ? dur(s.mins) : 'Within the same hour'}${s.desc && s.kind === 'base' && /^Save/.test(s.desc) ? ' · ' + esc(s.desc) : ''}`}</small>${perks(s)}<span class="p">${esc(priceLabel(s, cur()))}</span></button>`;
}
// Men's step 1: one haircut (Deluxe or Regular), then optional add-ons.
// Men's step 1: A) Deluxe or Regular, B) one haircut from that level only, C) optional add-ons.
function tierPicker() {
  const g = S.bk.group, all = svcs().filter(s => (s.group || 'him') === g);
  const bases = all.filter(s => s.kind === 'base'), extras = all.filter(s => s.kind !== 'base');
  const bb = barber(S.bk.barber);
  const tiers = [...new Set(bases.map(s => s.tier || ''))].filter(t => !bb || !(bb.tiers || []).length || !t || bb.tiers.includes(t));
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
function fieldIn(label, id, key, type, ac, ph = '', extra = '') {
  const err = showErr(key) ? detailErrors()[key] : '';
  return `<div class="field${err ? ' has-err' : ''}"><label for="${id}">${esc(label)} <span class="req" aria-hidden="true">*</span></label>
    <input id="${id}" type="${type}" data-bind="bk.${key}" data-touch="${key}" data-live value="${esc(S.bk[key])}" autocomplete="${ac}" required aria-required="true" ${err ? `aria-invalid="true" aria-describedby="${id}-err"` : ''} ${ph ? `placeholder="${esc(ph)}"` : ''} ${extra}>
    ${err ? `<p class="field-err" id="${id}-err">${esc(err)}</p>` : ''}</div>`;
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
  if (i < 0 || !g[i]) { el.hidden = true; el.innerHTML = ''; document.body.style.overflow = ''; popClosed('lb'); return; }
  popOpened('lb');
  el.innerHTML = `<div class="lb" data-act="lbClose" role="dialog" aria-modal="true" aria-label="Photo ${i + 1} of ${g.length}">
    <button type="button" class="pop-back lb-back" data-act="lbClose">${BACK_IC}<span>Back</span></button><button class="lb-btn lb-x" data-act="lbClose" aria-label="Close">${ic('close')}</button>
    ${g.length > 1 ? `<button class="lb-btn lb-prev" data-act="lbStep" data-d="-1" aria-label="Previous photo">${ic('left')}</button><button class="lb-btn lb-next" data-act="lbStep" data-d="1" aria-label="Next photo">${ic('right')}</button>` : ''}
    <figure><img src="${esc(g[i].url)}" alt="${esc(g[i].caption || g[i].style || 'Gallery photo')}">${g[i].caption || g[i].style ? `<figcaption>${esc(g[i].caption || g[i].style)}</figcaption>` : ''}<span class="lb-n">${i + 1} / ${g.length}</span>
    ${barber(g[i].barberId) ? `<button type="button" class="btn btn-accent lb-book" data-act="lookBook" data-i="${i}">Book this look with ${esc(barber(g[i].barberId).name)}</button>` : ''}</figure></div>`;
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
  galTag(el) { S.galTag = el.dataset.v; renderGallery(); },
  prodQty(el) {
    const n = el.dataset.name, q = prodQ(), was = q[n] || 0, now = Math.max(0, Math.min(MAX_PROD, was + (+el.dataset.d)));
    if (now) q[n] = now; else delete q[n];
    if (!was && now) toast(`${n} will be set aside for your visit`);
    const sec = document.querySelector('#products .prod-grid'); if (sec) { sec.innerHTML = products().map(productCard).join(''); revealOnScroll(); }
    renderBooker();
  },
  usePromo(el) { S.promo = { open: true, code: el.dataset.code, applied: null, err: '', busy: false, pending: el.dataset.code }; toast(`Code ${el.dataset.code} will be applied when you pick your service`); goStep(chosen().length ? 3 : 1); maybeApplyPromo(); },
  async copyCode(el) { try { await navigator.clipboard.writeText(el.dataset.code); toast('Code copied'); } catch (_) { toast(el.dataset.code); } },
  lookBook(el) { const g = gallery()[+el.dataset.i]; if (!g) return; S.lb = -1; lightbox(); S.bk.notes = `I’d like this look: ${g.caption || g.style || 'photo from your gallery'}`; ACT.bookWith({ dataset: { id: g.barberId } }); },
  profile(el) { S.profile = el.dataset.id; profile(); },
  pfClose(el, e) { if (e && el.classList.contains('pf-scrim') && e.target !== el) return; S.profile = ''; profile(); },
  payM(el) { S.pay = el.dataset.v; renderBooker(); },
  promoOpen() { S.promo.open = true; renderBooker(); setTimeout(() => $('#promo-code')?.focus(), 50); },
  promoRemove() { S.promo = { open: false, code: '', applied: null, err: '', busy: false }; renderBooker(); },
  async promoApply() {
    const P = S.promo, code = String(P.code || '').trim(); if (!code) { P.err = 'Type a promo code.'; renderBooker(); return; }
    P.busy = true; P.err = ''; renderBooker();
    try {
      const g = S.bk.guest;
      P.applied = await call('checkPromo', { code, serviceIds: chosen().map(x => x.id), guestServiceIds: g.on && g.mode ? guestSvcs().map(x => x.id) : [] });
      P.open = false;
    } catch (e) { P.err = e.message || 'That promo code isn’t valid.'; }
    P.busy = false; renderBooker();
  },
  qPick(el) { S.q.pick = el.dataset.v; schedule(); },
  refRemove(el) { S[el.dataset.k].ref = ''; renderBooker(); schedule(); },
  async joinQueue() {
    const q = S.q; q.err = '';
    if (q.name.trim().length < 2) q.err = 'Enter your name.'; else if (!validPhone(q.phone)) q.err = 'Enter an 11-digit mobile number, like 0917 123 4567.';
    if (q.err) { schedule(); return; }
    const base = q.pick === 'nails' ? svcs().find(x => x.group === 'nails') : svcs().filter(x => x.kind === 'base' && x.tier === q.pick).sort((a, b) => a.price - b.price)[0];
    q.busy = true; schedule();
    try {
      q.done = await call('joinQueue', { name: q.name.trim(), phone: q.phone, birthday: bdayOf(q), serviceIds: base ? [base.id] : [], barberId: q.barber });
      await sendRef(q, q.done);
      try { localStorage.setItem('lastQueue', JSON.stringify({ ...q.done, date: phNow().date })); } catch (_) {}
    } catch (e) { q.err = e.message || 'Couldn’t add you to the queue. Ask the front desk.'; }
    q.busy = false; schedule();
  },
  bookSvc(el) { pickService(el.dataset.id); renderBooker(); ACT.scroll({ dataset: { to: 'book' } }); },
  lightbox(el) { S.lb = +el.dataset.i; lightbox(); },
  lbClose(el, e) { if (e && el.classList.contains('lb') && e.target !== el) return; S.lb = -1; lightbox(); },
  lbStep(el) { const n = gallery().length; S.lb = (S.lb + (+el.dataset.d) + n) % n; lightbox(); },
  bkGroup(el) { if (S.bk.group === el.dataset.v) return; S.bk.group = el.dataset.v; S.bk.tier = ''; S.bk.svc = {}; S.bk.barber = ''; S.bk.time = ''; S.bk.guest = { on: false, mode: '', name: '', own: false, group: 'him', tier: '', svc: {}, date: '', time: '', barber: '' }; renderBooker(); },
  bfOpen() { S.byBarber = true; renderBooker(); },
  bfClose() { S.byBarber = false; renderBooker(); },
  bfClear() { S.bk.barber = ''; S.byBarber = true; S.bk.time = ''; renderBooker(); },
  bfPick(el) {
    const b = barber(el.dataset.id); if (!b) return;
    const g = (b.groups || ['him'])[0];
    if (S.bk.group !== g) { S.bk.group = g; S.bk.svc = {}; S.bk.tier = ''; }
    if ((b.tiers || []).length === 1 && S.bk.tier !== b.tiers[0]) { S.bk.tier = b.tiers[0]; S.bk.svc = {}; }
    if (!canServe(b, chosen())) S.bk.svc = {};
    S.bk.barber = b.id; S.byBarber = false; S.bk.time = '';
    if (S.bk.date && !(b.days || []).includes(dowOf(S.bk.date))) S.bk.date = '';
    renderBooker();
  },
  bookAgain() { if (S.me && applySelection(S.me.last || {})) { renderBooker(); goStep(3); } },
  forgetMe() { forgetMe(); renderBooker(); toast('Your details were removed from this phone'); },
  bkNext(el) { S.bk.date = el.dataset.date; S.bk.time = el.dataset.time; S.err = ''; watchSlots(); renderBooker(); goStep(4); },
  guestOn() { S.bk.guest.on = true; S.bk.guest.group = S.bk.group; const o = guestOptions(availableTimes(info(), { services: chosen(), date: S.bk.date, barberId: S.bk.barber }, S.slots)); if (o.length === 1) S.bk.guest.mode = o[0].mode; renderBooker(); },
  addOnSvc(el) {
    let g = S.bk.guest;
    if (!g.self || g.group !== el.dataset.g) { S.bk.guest = g = { on: true, self: true, mode: '', name: '', own: true, group: el.dataset.g, tier: '', svc: {}, date: '', time: '', barber: '' }; }
    g.svc[el.dataset.id] = !g.svc[el.dataset.id]; g.mode = '';
    if (!Object.values(g.svc).some(Boolean)) ACT.guestOff(); else renderBooker();
  },
  addOnGroup(el) { S.addOnG = el.dataset.v; if (S.bk.guest.self && S.bk.guest.group !== el.dataset.v) ACT.guestOff(); else renderBooker(); },
  guestSelf() { const grp = addOnGroups()[0]; if (!grp) return; S.bk.guest = { on: true, self: true, mode: '', name: '', own: true, group: grp[0], tier: '', svc: {}, date: '', time: '', barber: '' }; renderBooker(); },
  guestOff() { S.bk.guest = { on: false, mode: '', name: '', own: false, group: 'him', tier: '', svc: {}, date: '', time: '', barber: '' }; renderBooker(); },
  guestMode(el) { const g = S.bk.guest; g.mode = el.dataset.v; if (g.mode === 'pick') { g.date = g.date || S.bk.date; ensureRange(); } renderBooker(); },
  guestBarber(el) { const g = S.bk.guest; g.barber = el.dataset.id; g.time = ''; const bb = barber(g.barber); if (bb && !(bb.days || []).includes(dowOf(g.date || S.bk.date))) g.date = ''; renderBooker(); },
  guestDate(el) { const g = S.bk.guest; g.date = el.dataset.v; g.time = ''; ensureRange(); renderBooker(); },
  calNav(el) { S.calM = shiftMonth(el.dataset.m, +el.dataset.v); renderBooker(); },
  guestCal(el) { S.bk.guest.calM = shiftMonth(el.dataset.m, +el.dataset.v); renderBooker(); },
  guestTime(el) { S.bk.guest.time = el.dataset.v; renderBooker(); },
  guestOwn(el) { const g = S.bk.guest; g.own = el.dataset.v === '1'; g.mode = ''; if (g.own && !Object.values(g.svc).some(Boolean)) { g.group = S.bk.group; g.tier = ''; } renderBooker(); },
  guestGroup(el) { const g = S.bk.guest; if (g.group === el.dataset.v) return; g.group = el.dataset.v; g.tier = ''; g.svc = {}; g.mode = ''; renderBooker(); },
  guestTier(el) { const g = S.bk.guest; if (g.tier === el.dataset.v) return; g.tier = el.dataset.v; g.svc = {}; g.mode = ''; renderBooker(); },
  guestBase(el) { const g = S.bk.guest, x = svcs().find(v => v.id === el.dataset.id); if (!x) return; svcs().forEach(v => { if (v.kind === 'base' || (x.includes || []).includes(v.id)) g.svc[v.id] = false; }); g.svc[x.id] = true; g.mode = ''; renderBooker(); },
  guestSvc(el) { const g = S.bk.guest; g.svc[el.dataset.id] = !g.svc[el.dataset.id]; g.mode = ''; renderBooker(); },
  bkTier(el) {
    const t = el.dataset.v; if (S.bk.tier === t) return;
    S.bk.tier = t; S.bk.svc = {}; S.bk.time = ''; S.err = ''; fitBarber(); // switching level starts the haircut over
    const b = barber(S.bk.barber); if (b && (b.tiers || []).length && !b.tiers.includes(t)) S.bk.barber = '';
    renderBooker();
  },
  bkBase(el) { const id = el.dataset.id; if (S.bk.svc[id]) return; pickService(id); renderBooker(); },
  agreeNo() { agreeClose(); },
  agreeYes() { S.agreed = true; agreeClose(); ACT.pay(); },
  bkOpt(el) { S.bk.opt = { ...(S.bk.opt || {}), [el.dataset.id]: el.dataset.v }; renderBooker(); },
  bkSvc(el) { const id = el.dataset.id; if (S.bk.svc[id]) { S.bk.svc[id] = false; S.bk.time = ''; } else pickService(id); renderBooker(); },
  bkBarber(el) { S.bk.barber = el.dataset.id; S.bk.time = ''; S.err = ''; const b = barber(S.bk.barber); if (b && S.bk.date && !(b.days || []).includes(dowOf(S.bk.date))) S.bk.date = firstDate(); watchSlots(); renderBooker(); goStep(3); },
  bkDate(el) { S.bk.date = el.dataset.v; S.bk.time = ''; S.err = ''; S.wl.done = ''; S.wl.err = ''; watchSlots(); renderBooker(); },
  bkTime(el) { S.bk.time = el.dataset.v; S.bk.guest.mode = ''; S.bk.guest.time = ''; S.err = ''; renderBooker(); goStep(4); },
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
    if (S.profile) { S.profile = ''; profile(); }
    const g = (b.groups || ['him'])[0];
    if (S.bk.group !== g) { S.bk.group = g; S.bk.svc = {}; }
    if (!canServe(b, chosen())) S.bk.svc = {};
    if ((b.tiers || []).length === 1 && S.bk.tier !== b.tiers[0]) { S.bk.tier = b.tiers[0]; S.bk.svc = {}; }
    S.bk.barber = b.id; S.bk.time = ''; S.bk.date = firstDate(); watchSlots(); renderBooker();
    ACT.scroll({ dataset: { to: 'book' } });
  },
  async pay() {
    const b = S.bk, when = { date: b.date, time: b.time };
    const errs = detailErrors();
    if (Object.keys(errs).length) {
      S.tried = true; S.err = ''; renderBooker();
      const first = { name: 'bk-name', phone: 'bk-phone', email: 'bk-email', gname: 'bk-gname', consent: 'bk-consent' }[Object.keys(errs)[0]];
      const el = first && document.getElementById(first) || document.querySelector('.guest-box');
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (el.focus) setTimeout(() => el.focus({ preventScroll: true }), 350); }
      return;
    }
    const gp = guestPick(availableTimes(info(), { services: chosen(), date: b.date, barberId: b.barber }, S.slots));
    if (b.guest.on && (!gp || (!b.guest.self && !b.guest.name.trim()))) { S.err = gp ? 'Enter the second person’s name.' : b.guest.self ? `Pick when you’d like ${addOnLabel(b.guest.group)}, or remove it.` : 'Pick when the second person comes, or remove them.'; renderBooker(); return; }
    // Senior barber (down payment): the client reads and ticks the late and cancel rules first
    if (dueFor(gp) > 0 && !S.agreed) { agreePop(); return; }
    S.busy = true; S.err = ''; renderBooker();
    try {
      const r = await call('createBooking', { serviceIds: Object.keys(b.svc).filter(k => b.svc[k]), barberId: b.barber, date: b.date, time: b.time, options: chosenOpts(), name: b.name, phone: b.phone, email: b.email, birthday: bdayOf(b), notes: b.notes, consent: b.consent,
        payMethod: payChoice() ? S.pay : 'online', promo: S.promo.applied ? S.promo.applied.code : '',
        ...(prodNote() ? { notes: [b.notes, `Set aside for me: ${prodNote()}`].filter(Boolean).join(' · ') } : {}),
        ...(gp ? { guest: { name: b.guest.self ? b.name.trim() : b.guest.name.trim(), ...(b.guest.self ? { sameClient: true } : {}), time: gp.time, barberId: gp.barberId, ...(gp.mode === 'pick' && gp.date !== b.date ? { date: gp.date } : {}), ...(b.guest.own ? { serviceIds: guestSvcs().map(x => x.id) } : {}) } } : {}) });
      await sendRef(b, r);
      saveMe();
      try { localStorage.setItem('lastBooking', JSON.stringify({ id: r.id, token: r.token, ...when })); } catch (_) {}
      location.href = r.checkoutUrl;
    } catch (e) {
      S.busy = false; S.err = e.message || 'Something went wrong. Please try again.';
      if (e.code === 'already-exists') b.time = '';
      if (/promo/i.test(S.err)) S.promo = { open: true, code: S.promo.applied ? S.promo.applied.code : '', applied: null, err: S.err, busy: false };
      renderBooker();
    }
  }
};
let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }
function setPath(path, val) { const k = path.split('.'); let o = S; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = val; }
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const f = ACT[el.dataset.act]; if (f) { if (el.tagName === 'A') e.preventDefault(); f(el, e); } });
document.addEventListener('focusout', e => { const k = e.target && e.target.dataset && e.target.dataset.touch; if (k && !S.touched[k]) { S.touched[k] = true; renderBooker(); } });
document.addEventListener('input', e => { const el = e.target; if (!el.dataset || !el.dataset.bind) return; setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.value); S.err = ''; if (el.hasAttribute('data-live')) { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderBooker); } });
document.addEventListener('keydown', e => {
  if (S.profile && e.key === 'Escape') { S.profile = ''; profile(); return; }
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
  db.doc('public/queue').onSnapshot(s => { S.queue = s.exists ? s.data() : null; schedule(); }, () => {});
  setInterval(() => { if (S.queue && !document.hidden) schedule(); }, 60000); // the estimate moves with the clock
  db.doc('public/info').onSnapshot(s => {
    clearTimeout(slow);
    S.info = s.exists ? s.data() : null; S.loaded = true;
    if (!S.urlApplied) {
      S.urlApplied = true;
      S.me = loadMe(); if (S.me) { const bd = cleanBday(S.me.birthday); Object.assign(S.bk, { name: S.me.name || '', phone: S.me.phone || '', email: S.me.email || '', bm: bd ? String(+bd.slice(0, 2)) : '', bd: bd ? String(+bd.slice(3)) : '' }); }
      const q = new URLSearchParams(location.search), svc = (q.get('svc') || '').split(',').filter(Boolean), bid = q.get('barber') || '';
      if ((svc.length || bid) && applySelection({ svc, barber: bid })) { S.fromLink = true; history.replaceState(null, '', location.pathname + '#book'); }
    }
    schedule();
    if (S.fromLink) { S.fromLink = false; setTimeout(() => goStep(chosen().length ? 3 : 1), 300); }
    if (S.walkin && !S.walkinShown) { S.walkinShown = true; try { const lq = JSON.parse(localStorage.getItem('lastQueue') || 'null'); if (lq && lq.date === phNow().date) S.q.done = lq; } catch (_) {} schedule(); setTimeout(() => document.getElementById('walkin')?.scrollIntoView(), 350); }
  }, () => { S.slow = true; schedule(); });
}
