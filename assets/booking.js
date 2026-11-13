// "Your booking" page, opened from the confirmation email or after paying on PayMongo.
// Shows the booking status and lets the customer reschedule or cancel within the policy.
import { db, call, demoBar, resetDemo } from './fb.js';
import { $, esc, money, priceLabel, fmtTime, fmtDate, DAYS, MONTHS, dowOf, sum, policyOf, availableTimes, bookableDates, timeChips, STARTER, icsFor, brand, LOGO_LG, resizeImage, phNow } from './shared.js';
import { L, lang, setLang } from './i18n.js';

const q = new URLSearchParams(location.search);
const ID = q.get('id') || '', TOKEN = q.get('t') || '';
const S = {
  b: null, info: null, err: '', loading: true, polls: 0, mode: 'view', busy: false,
  rs: { date: '', time: '', barber: '' }, slots: {}, slotsDate: '', slotsLoaded: false, unsub: null,
  justPaid: q.get('paid') === '1', paymentCancelled: q.get('cancelled') === '1',
  proof: { file: null, preview: '', ref: '', err: '', busy: false }, late: { busy: false, err: '' }, rate: { stars: 0, text: '', busy: false, err: '' }
};
const info = () => S.info || STARTER;
const m = n => money(n, info().shop.currency || '₱');

function render() { const a = document.activeElement, id = a && a.id; $('#app').innerHTML = L(shell(body())); if (id) document.getElementById(id)?.focus({ preventScroll: true }); }
function shell(inner) {
  const shop = info().shop;
  return `${demoBar('admin/')}<header class="site-head"><div class="wrap head-in"><a class="wordmark" href="./">${brand(shop.wordmark || shop.name)}</a><nav class="site-nav"><div class="lang" role="group" aria-label="Language"><button type="button" data-act="lang" data-v="en" aria-pressed="${lang() === 'en'}">EN</button><button type="button" data-act="lang" data-v="tl" aria-pressed="${lang() === 'tl'}">TL</button></div><a class="btn btn-sm" href="./#book">Book again</a></nav></div></header>
  <main class="sec"><div class="wrap" style="max-width:760px;display:grid;gap:18px">${inner}</div></main>
  <footer class="site-foot"><div class="wrap"><span>${esc(shop.name)} · ${esc(shop.phone)}</span><span>${esc(shop.address)}</span></div></footer>`;
}
const chipHTML = (kind, icon, label) => `<span class="chip chip-${kind}"><b aria-hidden="true">${icon}</b>${esc(label)}</span>`;

function details(b) {
  const total = sum(b.services, s => s.price), from = b.services.some(s => s.priceFrom);
  return `<section class="ticket-card"><div class="tc-top"><b>${fmtDate(b.date)} · ${fmtTime(b.time)}</b><span class="code" aria-label="Booking code">${esc(b.code)}</span></div>
    <div class="tc-body totals" style="font-family:var(--f-body);font-size:15px;gap:10px">
      <div><span class="muted">When</span><b>${fmtDate(b.date, true)}, ${fmtTime(b.time)}</b></div>
      <div><span class="muted">${b.services.some(s => /hair and makeup|balayage|rebond/i.test(s.name)) ? 'Stylist' : 'Barber'}</span><b>${esc(b.barberName || 'To be assigned')}</b></div>
      <div><span class="muted">Services</span><b style="text-align:right">${b.services.map(s => `${esc(s.name)} · ${esc(priceLabel(s, info().shop.currency || '₱'))}`).join('<br>')}</b></div>
      <div><span class="muted">Deposit</span><b>${b.deposit.status === 'paid' ? `${m(b.deposit.amount)} paid${b.deposit.method ? ' via ' + esc(methodName(b.deposit.method)) : ''}` : b.deposit.status === 'kept' ? `${m(b.deposit.amount)} kept` : b.deposit.status === 'refunded' ? 'Refunded' : b.proof && b.proof.status === 'review' ? 'GCash screenshot sent · checking' : 'Not paid'}</b></div>
    </div>
    ${b.promo ? `<div class="tc-body totals" style="font-family:var(--f-body);font-size:15px;padding-top:0"><div><span class="muted">Promo ${esc(b.promo.code)}</span><b>−${m(b.promo.off)} at the shop</b></div></div>` : ''}
    ${b.deposit.status === 'paid' ? `<div class="tc-cut" aria-hidden="true"></div><div class="tc-body totals" style="font-family:var(--f-body)"><div><span>Pay at the shop</span><b style="font:800 26px/1 var(--f-display)">${from ? 'from ' : ''}${m(Math.max(0, total - (b.promo ? b.promo.off : 0) - (b.deposit.amount || 0)))}</b></div></div>` : ''}
    </section>`;
}
// A second person booked in the same go (book for two): shown on the main booking, with their own link.
function guestsCard(b) {
  const gs = b.guests || []; if (!gs.length) return '';
  const word = { booked: 'Confirmed', pending_payment: 'Waiting for deposit', cancelled: 'Cancelled', expired: 'Not confirmed', needs_attention: 'We’ll call you', done: 'Completed', noshow: 'Missed' };
  return `<section class="panel"><div class="panel-h"><h2>Also booked</h2></div>${gs.map(g => `<div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
    <div><b>${esc(g.name)}</b><div class="muted small">${(g.services || []).length ? esc(g.services.join(' + ')) + '<br>' : ''}${fmtDate(g.date)}, ${fmtTime(g.time)} with ${esc(g.barberName || 'a barber')} · ${esc(word[g.status] || g.status)}</div></div>
    <a class="btn btn-sm" href="booking.html?id=${encodeURIComponent(g.id)}&t=${encodeURIComponent(g.token)}">Their booking</a></div>`).join('')}</section>`;
}
function loyaltyCard(b) {
  const L = b.loyalty; if (!L || !L.every) return '';
  const pos = L.visits % L.every, next = (L.visits + 1) % L.every === 0, left = L.every - ((L.visits + 1) % L.every);
  return `<section class="loyalty"><div><p class="eyebrow">Loyalty card</p><h2>${next ? 'Your next cut is free' : `${pos} of ${L.every} visits`}</h2><p class="muted small">${next ? 'Show this page at checkout.' : `${left} more visit${left === 1 ? '' : 's'} after this one and you get a free cut.`} Visits count once your cut is rung up at the shop.</p></div>
    <div class="stamps" aria-hidden="true">${Array.from({ length: Math.min(L.every, 12) }, (_, i) => `<span class="${i < pos ? 'on' : ''}${i === L.every - 1 ? ' free' : ''}" style="--i:${i}">${i === L.every - 1 ? 'FREE' : i < pos ? '✓' : i + 1}</span>`).join('')}</div></section>`;
}
const methodName = k => ({ gcash: 'GCash', paymaya: 'Maya', card: 'card', qrph: 'QR Ph', grab_pay: 'GrabPay' }[k] || k);
// ---------- pay by GCash: send, then upload the screenshot ----------
function gcashPay(b) {
  const pol = b.policy, ppl = 1 + (b.guests || []).length, amt = pol.deposit * ppl, P = S.proof, g = b.gcash || {};
  if (b.proof && b.proof.status === 'review') return `<div class="status-hero">${chipHTML('info', '◷', 'Checking your payment')}<h1>Got your screenshot</h1>
    <p class="muted">We’re matching it with our GCash. You’ll get a text and email once your booking is confirmed, usually within the hour during shop hours. Your slot${ppl > 1 ? 's stay' : ' stays'} reserved meanwhile.</p></div>${details(b)}${guestsCard(b)}`;
  const left = Math.max(0, Math.ceil((b.holdUntil - Date.now()) / 60000));
  if (!left) return `<div class="status-hero">${chipHTML('mute', '–', 'Not confirmed')}<h1>Your hold ran out</h1><p class="muted">The screenshot didn’t arrive within the time limit, so the slot was released. Already paid? Call <b>${esc(info().shop.phone)}</b> and we’ll sort it out.</p><a class="btn btn-accent btn-lg" href="${esc(b.rebook || './#book')}">Book again</a></div>`;
  return `<div class="status-hero">${chipHTML('warn', '●', 'Waiting for deposit')}<h1>Pay by GCash</h1><p class="muted">Your slot${ppl > 1 ? 's are' : ' is'} held for ${left} more minute${left === 1 ? '' : 's'}. Send the down payment, then upload the screenshot here.</p></div>
    <section class="panel gcash-steps">
      <ol class="steps-ol">
        <li><span>Open GCash and send <b class="big">${m(amt)}</b>${ppl > 1 ? ' (2 people)' : ''} to<br><b class="big">${esc(g.number)}</b>${g.name ? ` · ${esc(g.name)}` : ''} <button type="button" class="btn btn-sm btn-ghost" data-act="copy" data-text="${esc(String(g.number).replace(/\s/g, ''))}">Copy number</button></span></li>
        <li><span>Take a screenshot of the receipt that shows the amount and reference number.</span></li>
        <li><span>Upload it below. We confirm it and text you.</span></li>
      </ol>
      <label class="drop${P.preview ? ' has' : ''}" for="proof-file">${P.preview ? `<img src="${P.preview}" alt="Your screenshot">` : '<b>Choose screenshot</b><small>JPG or PNG from your gallery</small>'}<input id="proof-file" type="file" accept="image/*" hidden></label>
      <div class="field"><label for="proof-ref">GCash reference number (optional)</label><input id="proof-ref" inputmode="numeric" value="${esc(P.ref)}" placeholder="e.g. 5012 345 678" maxlength="20"></div>
      ${P.err ? `<p class="err" role="alert">${esc(P.err)}</p>` : ''}
      <button type="button" class="btn btn-accent btn-lg" data-act="sendProof" ${P.file && !P.busy ? '' : 'disabled'}>${P.busy ? '<span class="spinner"></span> Uploading…' : 'Upload screenshot'}</button>
      <p class="muted small">Wrong amount or no screenshot means the booking isn’t confirmed. Questions? Call ${esc(info().shop.phone)}.</p>
    </section>${details(b)}${guestsCard(b)}`;
}
// ---------- on the day: live queue and "running late" ----------
function todayCards(b) {
  if (b.date !== phNow().date) return '';
  const Q = b.queue, pol = b.policy, mins = Math.round((b.startAt - Date.now()) / 60000);
  const queue = Q ? `<section class="panel live"><div class="panel-h"><h2>${Q.ahead ? `${Q.ahead} ahead of you` : 'You’re next'}</h2><span class="live-dot">Live</span></div>
    <p class="muted small">${Q.ahead ? `${esc(b.barberName)} has ${Q.ahead} client${Q.ahead === 1 ? '' : 's'} before you today${Q.inChair ? ', one in the chair now' : ''}.` : `${esc(b.barberName)} has no one else booked before you.`} Updated ${new Date(Q.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}.</p></section>` : '';
  const canLate = mins <= 180 && mins > -pol.lateMinutes;
  const late = !canLate ? '' : b.late ? `<section class="panel"><div class="panel-h"><h2>We know you’re running late</h2></div><p class="muted small">You told us about ${b.late.mins} minutes. Please be here before ${fmtTime(addMin(b.time, pol.lateMinutes))}: ${pol.lateMinutes} minutes late or more cancels the booking.</p></section>`
    : `<section class="panel"><div class="panel-h"><h2>Running late?</h2></div><p class="muted small" style="margin-bottom:10px">Let us know so we can plan. ${pol.lateMinutes} minutes late or more cancels the booking.</p>
      <div class="row">${[5, 10, 15].filter(n => n < pol.lateMinutes).map(n => `<button type="button" class="btn" data-act="late" data-v="${n}" ${S.late.busy ? 'disabled' : ''}>${n} min late</button>`).join('')}</div>${S.late.err ? `<p class="err">${esc(S.late.err)}</p>` : ''}</section>`;
  return queue + late;
}
const addMin = (t, n) => { const [h, mm] = t.split(':').map(Number), x = h * 60 + mm + n; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
// ---------- after the visit: rate it, see the cut ----------
function rateCard(b) {
  const shop = info().shop;
  if (b.rating) return `<section class="panel"><div class="panel-h"><h2>Thanks for the rating!</h2><span class="stars" aria-label="${b.rating.stars} stars">${'★'.repeat(b.rating.stars)}<span>${'★'.repeat(5 - b.rating.stars)}</span></span></div>
    ${b.rating.text ? `<p class="muted">“${esc(b.rating.text)}”</p>` : ''}${b.rating.stars >= 4 && shop.googleUrl ? `<p class="small" style="margin-top:10px">Would you post it on ${esc(shop.ratingSource || 'Google')} too? It helps other people find us. <a href="${esc(shop.googleUrl)}" target="_blank" rel="noopener">Leave a review</a></p>` : ''}</section>`;
  const R = S.rate;
  return `<section class="panel rate"><div class="panel-h"><h2>How was your cut?</h2></div>
    <div class="rate-stars" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" data-act="rateStar" data-v="${n}" aria-checked="${R.stars === n}" aria-label="${n} star${n > 1 ? 's' : ''}" class="${n <= R.stars ? 'on' : ''}">★</button>`).join('')}</div>
    <div class="field"><label for="rate-text">Anything to tell ${esc(b.barberName || 'us')}? (optional)</label><textarea id="rate-text" rows="2" maxlength="400" placeholder="What you liked, what we can do better">${esc(R.text)}</textarea></div>
    ${R.err ? `<p class="err">${esc(R.err)}</p>` : ''}<button type="button" class="btn btn-accent" data-act="sendRate" ${R.stars && !R.busy ? '' : 'disabled'}>${R.busy ? '<span class="spinner"></span>' : 'Send rating'}</button>
    <p class="muted small" style="margin-top:8px">The shop may show good ratings on the website with your first name.</p></section>`;
}
const cutCard = b => b.cutPhoto ? `<section class="panel"><div class="panel-h"><h2>Your cut</h2></div><img class="cut-photo" src="${b.cutPhoto}" alt="Photo of your haircut"><p class="muted small" style="margin-top:8px">Show this next time to get the same cut.</p></section>` : '';
// ---------- walk-in ticket (joined from the QR poster) ----------
function walkinView(b) {
  const Q = b.queue;
  if (b.status === 'inchair') return `<div class="status-hero">${chipHTML('good', '✂', 'In the chair')}<h1>You’re up, ${esc(String(b.name).split(' ')[0])}</h1><p class="muted">Enjoy your cut.</p></div>`;
  if (b.status !== 'waiting') return `<div class="status-hero">${chipHTML('mute', '–', b.status === 'done' ? 'Completed' : 'Not in the queue')}<h1>${b.status === 'done' ? 'Thanks for visiting' : 'You’re no longer in the queue'}</h1><a class="btn btn-accent" href="./#book">Book your next cut</a></div>${b.status === 'done' ? rateCard(b) + cutCard(b) + loyaltyCard(b) : ''}`;
  return `<div class="status-hero walkin-ticket"><p class="eyebrow">Walk-in queue · ${fmtDate(b.date)}</p><div class="qbig" aria-label="Queue number">#${esc(Q ? Q.queueNo : '')}</div>
    <h1>${Q && Q.ahead ? `${Q.ahead} ahead of you` : 'You’re next'}</h1><p class="muted">Stay close to the shop. We’ll call your name. This page updates by itself.</p><span class="live-dot">Live</span></div>`;
}

function body() {
  if (!ID || !TOKEN) return `<div class="status-hero"><h1>Booking not found</h1><p class="muted">Open the link from your confirmation email.</p></div>`;
  if (S.loading) return `<div class="center"><div><span class="spinner"></span><p class="muted">Loading your booking…</p></div></div>`;
  if (!S.b) return `<div class="status-hero"><h1>Booking not found</h1><p class="muted">${esc(S.err || 'Check the link in your email, or call the shop.')}</p></div>`;
  const b = S.b, pol = b.policy;
  if (S.mode === 'reschedule') return rescheduleView(b);
  if (b.source === 'walk-in' || (b.queue && b.queue.walkin)) return walkinView(b);
  if (S.mode === 'cancel') return `<div class="status-hero"><h1>Cancel this booking?</h1><p class="muted">Your ${m(pol.deposit)} deposit isn’t refunded when you cancel.${b.canReschedule ? ' You can move the booking to another time instead.' : ''}</p></div>
    ${details(b)}${S.err ? `<p class="err">${esc(S.err)}</p>` : ''}
    <div class="row"><button class="btn btn-danger" data-act="doCancel" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spinner"></span> Cancelling…' : 'Yes, cancel my booking'}</button>${b.canReschedule ? '<button class="btn" data-act="mode" data-v="reschedule">Reschedule instead</button>' : ''}<button class="btn btn-ghost" data-act="mode" data-v="view">Keep my booking</button></div>`;

  switch (b.status) {
    case 'pending_payment': {
      if (b.payMethod === 'gcash') return gcashPay(b);
      if (S.justPaid && S.polls < 20) return `<div class="status-hero">${chipHTML('info', '◷', 'Confirming payment')}<h1>Almost done</h1><p class="muted"><span class="spinner"></span> We’re confirming your payment with PayMongo. This usually takes a few seconds.</p></div>${details(b)}`;
      const left = Math.max(0, Math.ceil((b.holdUntil - Date.now()) / 60000));
      const ppl = 1 + (b.guests || []).length;
      return `<div class="status-hero">${chipHTML('warn', '●', 'Waiting for deposit')}<h1>${S.paymentCancelled ? 'Payment not finished' : 'Finish your booking'}</h1>
        <p class="muted">Your slot${ppl > 1 ? 's are' : ' is'} held for ${left} more minute${left === 1 ? '' : 's'}. Pay the ${m(pol.deposit * ppl)} deposit${ppl > 1 ? 's for 2 people' : ''} to confirm.</p>
        ${b.checkoutUrl ? `<a class="btn btn-accent btn-lg" href="${esc(b.checkoutUrl)}">Pay ${m(pol.deposit * ppl)} deposit${ppl > 1 ? 's' : ''}</a>` : ''}</div>${details(b)}${guestsCard(b)}`;
    }
    case 'booked': return `<div class="status-hero">${S.justPaid ? '<span class="success-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' : chipHTML('good', '✓', 'Confirmed')}<h1>${S.justPaid ? 'You’re booked!' : 'See you ' + fmtDate(b.date)}</h1>
        <p class="muted">${fmtTime(b.time)} with ${esc(b.barberName || 'your barber')}. Please arrive on time: ${pol.lateMinutes} minutes late or more cancels the booking and the deposit is kept.</p></div>
        ${todayCards(b)}
        ${details(b)}
        ${guestsCard(b)}
        ${loyaltyCard(b)}
        <div class="actions-row"><button class="btn btn-primary" data-act="ics">Add to calendar</button><a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info().shop.name + ' ' + info().shop.address)}" target="_blank" rel="noopener">Get directions</a><button class="btn btn-ghost" data-act="copyCode">Copy booking code</button></div>
        <section class="panel"><div class="panel-h"><h2>Need to change it?</h2></div>
          <p class="muted small" style="margin-bottom:12px">${b.canReschedule ? `You can reschedule online up to ${pol.rescheduleHours} hours before your appointment.` : `Online rescheduling closes ${pol.rescheduleHours} hours before your appointment. Call the shop if you need help.`}</p>
          <div class="row">${b.canReschedule ? '<button class="btn btn-primary" data-act="mode" data-v="reschedule">Reschedule</button>' : ''}${b.canCancel ? '<button class="btn btn-danger" data-act="mode" data-v="cancel">Cancel booking</button>' : ''}<span class="muted small">Shop: <b>${esc(info().shop.phone)}</b></span></div></section>`;
    case 'expired': return `<div class="status-hero">${chipHTML('mute', '–', 'Not confirmed')}<h1>Your hold ran out</h1><p class="muted">The deposit wasn’t paid within ${pol.holdMinutes} minutes, so the slot was released. No money was taken.</p><a class="btn btn-accent btn-lg" href="${esc(b.rebook || './#book')}">Book again</a></div>`;
    case 'cancelled': return `<div class="status-hero">${chipHTML('mute', '–', 'Cancelled')}<h1>${b.proof && b.proof.status === 'rejected' ? 'We couldn’t confirm your payment' : 'Booking cancelled'}</h1><p class="muted">${b.proof && b.proof.status === 'rejected' ? `We couldn’t match your GCash screenshot to a payment, so this booking for ${fmtDate(b.date)}, ${fmtTime(b.time)} isn’t confirmed. If you did pay, call <b>${esc(info().shop.phone)}</b> and we’ll fix it.` : `This booking for ${fmtDate(b.date)}, ${fmtTime(b.time)} is cancelled.`}</p><a class="btn btn-accent" href="${esc(b.rebook || './#book')}">Make a new booking</a></div>${details(b)}`;
    case 'needs_attention': return `<div class="status-hero">${chipHTML('warn', '!', 'We’ll call you')}<h1>We got your deposit</h1><p class="muted">Someone confirmed the same time while you were paying. The shop will call you to pick a new time or refund your deposit. You can also call <b>${esc(info().shop.phone)}</b>.</p></div>${details(b)}`;
    case 'done': return `<div class="status-hero">${chipHTML('good', '✓', 'Completed')}<h1>Thanks for visiting</h1><p class="muted">See you on your next cut.</p><a class="btn btn-accent" href="${esc(b.rebook || './#book')}">Book the same again</a><p class="muted small" style="margin-top:8px">Same service and barber, you just pick the day.</p></div>${rateCard(b)}${cutCard(b)}${loyaltyCard(b)}`;
    case 'noshow': return `<div class="status-hero">${chipHTML('bad', '✕', 'Missed')}<h1>We missed you</h1><p class="muted">This appointment was marked as missed and the deposit was kept, per the booking policy.</p><a class="btn btn-accent" href="${esc(b.rebook || './#book')}">Book again</a></div>`;
    default: return `<div class="status-hero">${chipHTML('info', '◷', 'In progress')}<h1>${fmtDate(b.date)}, ${fmtTime(b.time)}</h1></div>${details(b)}`;
  }
}

function rescheduleView(b) {
  const I = info(), r = S.rs, services = (I.services || []).filter(s => b.serviceIds.includes(s.id));
  const group = (services[0] && services[0].group) || 'him';
  const bars = (I.barbers || []).filter(x => (x.groups || ['him']).includes(group));
  const times = r.date ? availableTimes(I, { services, date: r.date, barberId: r.barber, ignoreBookingId: b.id }, S.slots) : [];
  return `<div class="status-hero"><h1>Pick a new time</h1><p class="muted">Currently ${fmtDate(b.date)}, ${fmtTime(b.time)} with ${esc(b.barberName)}. Your deposit carries over.</p></div>
  <section class="step"><div class="step-h"><span class="n">1</span><h3>${group === 'her' ? 'Stylist' : 'Barber'}</h3></div>
    <div class="pick"><button type="button" class="pickcard" data-act="rsBarber" data-id="" aria-pressed="${!r.barber}"><b>Any available</b></button>${bars.map(x => `<button type="button" class="pickcard" data-act="rsBarber" data-id="${esc(x.id)}" aria-pressed="${r.barber === x.id}"><b>${esc(x.name)}</b><small>${esc(x.title || '')}</small></button>`).join('')}</div></section>
  <section class="step"><div class="step-h"><span class="n">2</span><h3>Date and time</h3>${r.date && r.time ? `<span class="done">${fmtDate(r.date)}, ${fmtTime(r.time)}</span>` : ''}</div>
    <div class="dates">${bookableDates(I).map(d => { const x = new Date(`${d.date}T00:00:00Z`); const off = r.barber && !((bars.find(y => y.id === r.barber) || {}).days || []).includes(dowOf(d.date)); return `<button type="button" class="dchip" data-act="rsDate" data-v="${d.date}" aria-pressed="${d.date === r.date}" ${d.closed || off ? 'disabled' : ''}><small>${DAYS[x.getUTCDay()]}</small><b>${x.getUTCDate()}</b><span>${d.closed ? 'Closed' : MONTHS[x.getUTCMonth()]}</span></button>`; }).join('')}</div>
    ${r.date ? (S.slotsLoaded ? timeChips(times, r.time, 'rsTime') : '<p class="muted small"><span class="spinner"></span> Checking free times…</p>') : '<p class="muted small">Pick a date.</p>'}</section>
  ${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}
  <div class="row"><button class="btn btn-primary btn-lg" data-act="doReschedule" ${r.date && r.time && !S.busy ? '' : 'disabled'}>${S.busy ? '<span class="spinner"></span> Moving…' : 'Move my booking'}</button><button class="btn btn-ghost" data-act="mode" data-v="view">Back</button></div>`;
}

function watchSlots() {
  const d = S.rs.date; if (!d || d === S.slotsDate) return;
  if (S.unsub) S.unsub();
  S.slotsDate = d; S.slots = {}; S.slotsLoaded = false;
  S.unsub = db.collection('slots').where('date', '==', d).onSnapshot(s => { S.slots = Object.fromEntries(s.docs.map(x => [x.id, x.data()])); S.slotsLoaded = true; render(); }, () => { S.slotsLoaded = true; render(); });
}

async function load() {
  try {
    const [b, inf] = await Promise.all([call('getBooking', { id: ID, token: TOKEN }), db.doc('public/info').get()]);
    S.b = b; S.info = inf.exists ? inf.data() : null; S.err = '';
  } catch (e) { S.err = e.message; }
  S.loading = false; render();
  if (S.b && S.justPaid && S.b.status === 'pending_payment' && S.b.payMethod !== 'gcash' && S.polls < 20) { S.polls++; setTimeout(load, 3000); }
  // live updates: walk-in queue every 30 s, the day's queue every minute, a screenshot under review every minute
  clearTimeout(S.refresh);
  const b = S.b;
  if (b && S.mode === 'view' && ((b.queue && b.queue.walkin) || (b.status === 'booked' && b.date === phNow().date) || (b.proof && b.proof.status === 'review' && b.status === 'pending_payment'))) S.refresh = setTimeout(quiet, b.queue && b.queue.walkin ? 30000 : 60000);
}
async function quiet() { if (document.activeElement && document.activeElement.matches('input,textarea')) { S.refresh = setTimeout(quiet, 30000); return; } await load(); }
const fileToData = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

const ACT = {
  resetDemo,
  lang(el) { setLang(el.dataset.v); render(); },
  async copy(el) { try { await navigator.clipboard.writeText(el.dataset.text); toast('Copied'); } catch (_) { toast(el.dataset.text); } },
  async sendProof() {
    const P = S.proof; P.ref = $('#proof-ref')?.value || P.ref; P.busy = true; P.err = ''; render();
    try {
      let blob = await resizeImage(P.file, 1280, 0.72), data = await fileToData(blob);
      if (data.length > 880000) { blob = await resizeImage(P.file, 960, 0.6); data = await fileToData(blob); }
      S.b = { ...S.b, ...(await call('submitProof', { id: ID, token: TOKEN, image: data, ref: P.ref })) };
      toast('Screenshot sent. We’ll confirm it soon.');
    } catch (e) { P.err = e.message || 'Upload failed. Try again.'; }
    P.busy = false; render(); load();
  },
  async late(el) {
    S.late.busy = true; S.late.err = ''; render();
    try { S.b = { ...S.b, ...(await call('runningLate', { id: ID, token: TOKEN, mins: +el.dataset.v })) }; toast('Thanks, the shop knows.'); }
    catch (e) { S.late.err = e.message; }
    S.late.busy = false; render();
  },
  rateStar(el) { S.rate.stars = +el.dataset.v; S.rate.text = $('#rate-text')?.value || S.rate.text; render(); },
  async sendRate() {
    const R = S.rate; R.text = $('#rate-text')?.value || ''; R.busy = true; R.err = ''; render();
    try { S.b = { ...S.b, ...(await call('rateVisit', { id: ID, token: TOKEN, stars: R.stars, text: R.text })) }; }
    catch (e) { R.err = e.message; }
    R.busy = false; render();
  },
  ics() {
    const b = S.b, shop = info().shop;
    const data = icsFor({ title: `${shop.name}: ${b.services.map(s => s.name).join(', ')}`, date: b.date, time: b.time, mins: b.mins, location: shop.address, description: `With ${b.barberName}. Booking code ${b.code}. Arrive on time; ${b.policy.lateMinutes}+ minutes late cancels the booking.` });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'text/calendar' })); a.download = `booking-${b.code}.ics`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  async copyCode() { try { await navigator.clipboard.writeText(S.b.code); toast('Booking code copied'); } catch (_) { toast(S.b.code); } },
  mode(el) { S.mode = el.dataset.v; S.err = ''; if (S.mode === 'reschedule') { S.rs = { date: '', time: '', barber: S.b.barberId || '' }; } render(); },
  rsBarber(el) { S.rs.barber = el.dataset.id; S.rs.time = ''; render(); },
  rsDate(el) { S.rs.date = el.dataset.v; S.rs.time = ''; watchSlots(); render(); },
  rsTime(el) { S.rs.time = el.dataset.v; S.err = ''; render(); },
  async doReschedule() {
    S.busy = true; S.err = ''; render();
    try { S.b = await call('rescheduleBooking', { id: ID, token: TOKEN, ...S.rs, barberId: S.rs.barber }); S.mode = 'view'; toast('Booking moved. We sent you a confirmation.'); }
    catch (e) { S.err = e.message; if (e.code === 'already-exists') S.rs.time = ''; }
    S.busy = false; render();
  },
  async doCancel() {
    S.busy = true; S.err = ''; render();
    try { S.b = await call('cancelBooking', { id: ID, token: TOKEN }); S.mode = 'view'; }
    catch (e) { S.err = e.message; }
    S.busy = false; render();
  }
};
let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 3000); }
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const f = ACT[el.dataset.act]; if (f) f(el, e); });
document.addEventListener('change', async e => {
  if (e.target.id !== 'proof-file') return;
  const f = e.target.files && e.target.files[0]; if (!f) return;
  if (!/^image\//.test(f.type)) { S.proof.err = 'Choose an image (a screenshot from your gallery).'; render(); return; }
  S.proof.ref = $('#proof-ref')?.value || S.proof.ref;
  S.proof.file = f; S.proof.err = ''; S.proof.preview = await fileToData(await resizeImage(f, 600, 0.7)); render();
});

render();
if (ID && TOKEN) load();
