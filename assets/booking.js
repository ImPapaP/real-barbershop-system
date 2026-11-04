// "Your booking" page, opened from the confirmation email or after paying on PayMongo.
// Shows the booking status and lets the customer reschedule or cancel within the policy.
import { db, call, demoBar, resetDemo } from './fb.js';
import { $, esc, money, priceLabel, fmtTime, fmtDate, DAYS, MONTHS, dowOf, sum, policyOf, availableTimes, bookableDates, timeChips, STARTER, icsFor } from './shared.js';

const q = new URLSearchParams(location.search);
const ID = q.get('id') || '', TOKEN = q.get('t') || '';
const S = {
  b: null, info: null, err: '', loading: true, polls: 0, mode: 'view', busy: false,
  rs: { date: '', time: '', barber: '' }, slots: {}, slotsDate: '', slotsLoaded: false, unsub: null,
  justPaid: q.get('paid') === '1', paymentCancelled: q.get('cancelled') === '1'
};
const info = () => S.info || STARTER;
const m = n => money(n, info().shop.currency || '₱');

function render() { $('#app').innerHTML = shell(body()); }
function shell(inner) {
  const shop = info().shop;
  return `${demoBar('admin/')}<header class="site-head"><div class="wrap head-in"><a class="wordmark" href="./"><span class="mark" aria-hidden="true">R3</span>${esc(shop.wordmark || shop.name)}</a><nav class="site-nav"><a class="btn btn-sm" href="./#book">Book again</a></nav></div></header>
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
      <div><span class="muted">Deposit</span><b>${b.deposit.status === 'paid' ? `${m(b.deposit.amount)} paid${b.deposit.method ? ' via ' + esc(methodName(b.deposit.method)) : ''}` : b.deposit.status === 'kept' ? `${m(b.deposit.amount)} kept` : b.deposit.status === 'refunded' ? 'Refunded' : 'Not paid'}</b></div>
    </div>
    ${b.deposit.status === 'paid' ? `<div class="tc-cut" aria-hidden="true"></div><div class="tc-body totals" style="font-family:var(--f-body)"><div><span>Pay at the shop</span><b style="font:800 26px/1 var(--f-display)">${from ? 'from ' : ''}${m(Math.max(0, total - (b.deposit.amount || 0)))}</b></div></div>` : ''}
    </section>`;
}
const methodName = k => ({ gcash: 'GCash', paymaya: 'Maya', card: 'card', qrph: 'QR Ph', grab_pay: 'GrabPay' }[k] || k);

function body() {
  if (!ID || !TOKEN) return `<div class="status-hero"><h1>Booking not found</h1><p class="muted">Open the link from your confirmation email.</p></div>`;
  if (S.loading) return `<div class="center"><div><span class="spinner"></span><p class="muted">Loading your booking…</p></div></div>`;
  if (!S.b) return `<div class="status-hero"><h1>Booking not found</h1><p class="muted">${esc(S.err || 'Check the link in your email, or call the shop.')}</p></div>`;
  const b = S.b, pol = b.policy;
  if (S.mode === 'reschedule') return rescheduleView(b);
  if (S.mode === 'cancel') return `<div class="status-hero"><h1>Cancel this booking?</h1><p class="muted">Your ${m(pol.deposit)} deposit isn’t refunded when you cancel.${b.canReschedule ? ' You can move the booking to another time instead.' : ''}</p></div>
    ${details(b)}${S.err ? `<p class="err">${esc(S.err)}</p>` : ''}
    <div class="row"><button class="btn btn-danger" data-act="doCancel" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spinner"></span> Cancelling…' : 'Yes, cancel my booking'}</button>${b.canReschedule ? '<button class="btn" data-act="mode" data-v="reschedule">Reschedule instead</button>' : ''}<button class="btn btn-ghost" data-act="mode" data-v="view">Keep my booking</button></div>`;

  switch (b.status) {
    case 'pending_payment': {
      if (S.justPaid && S.polls < 20) return `<div class="status-hero">${chipHTML('info', '◷', 'Confirming payment')}<h1>Almost done</h1><p class="muted"><span class="spinner"></span> We’re confirming your payment with PayMongo. This usually takes a few seconds.</p></div>${details(b)}`;
      const left = Math.max(0, Math.ceil((b.holdUntil - Date.now()) / 60000));
      return `<div class="status-hero">${chipHTML('warn', '●', 'Waiting for deposit')}<h1>${S.paymentCancelled ? 'Payment not finished' : 'Finish your booking'}</h1>
        <p class="muted">Your slot is held for ${left} more minute${left === 1 ? '' : 's'}. Pay the ${m(pol.deposit)} deposit to confirm it.</p>
        ${b.checkoutUrl ? `<a class="btn btn-accent btn-lg" href="${esc(b.checkoutUrl)}">Pay ${m(pol.deposit)} deposit</a>` : ''}</div>${details(b)}`;
    }
    case 'booked': return `<div class="status-hero">${S.justPaid ? '<span class="success-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' : chipHTML('good', '✓', 'Confirmed')}<h1>${S.justPaid ? 'You’re booked!' : 'See you ' + fmtDate(b.date)}</h1>
        <p class="muted">${fmtTime(b.time)} with ${esc(b.barberName || 'your barber')}. Please arrive on time: ${pol.lateMinutes} minutes late or more cancels the booking and the deposit is kept.</p></div>
        ${details(b)}
        <div class="actions-row"><button class="btn btn-primary" data-act="ics">Add to calendar</button><a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info().shop.name + ' ' + info().shop.address)}" target="_blank" rel="noopener">Get directions</a><button class="btn btn-ghost" data-act="copyCode">Copy booking code</button></div>
        <section class="panel"><div class="panel-h"><h2>Need to change it?</h2></div>
          <p class="muted small" style="margin-bottom:12px">${b.canReschedule ? `You can reschedule online up to ${pol.rescheduleHours} hours before your appointment.` : `Online rescheduling closes ${pol.rescheduleHours} hours before your appointment. Call the shop if you need help.`}</p>
          <div class="row">${b.canReschedule ? '<button class="btn btn-primary" data-act="mode" data-v="reschedule">Reschedule</button>' : ''}${b.canCancel ? '<button class="btn btn-danger" data-act="mode" data-v="cancel">Cancel booking</button>' : ''}<span class="muted small">Shop: <b>${esc(info().shop.phone)}</b></span></div></section>`;
    case 'expired': return `<div class="status-hero">${chipHTML('mute', '–', 'Not confirmed')}<h1>Your hold ran out</h1><p class="muted">The deposit wasn’t paid within ${pol.holdMinutes} minutes, so the slot was released. No money was taken.</p><a class="btn btn-accent btn-lg" href="./#book">Book again</a></div>`;
    case 'cancelled': return `<div class="status-hero">${chipHTML('mute', '–', 'Cancelled')}<h1>Booking cancelled</h1><p class="muted">This booking for ${fmtDate(b.date)}, ${fmtTime(b.time)} is cancelled.</p><a class="btn btn-accent" href="./#book">Make a new booking</a></div>${details(b)}`;
    case 'needs_attention': return `<div class="status-hero">${chipHTML('warn', '!', 'We’ll call you')}<h1>We got your deposit</h1><p class="muted">Someone confirmed the same time while you were paying. The shop will call you to pick a new time or refund your deposit. You can also call <b>${esc(info().shop.phone)}</b>.</p></div>${details(b)}`;
    case 'done': return `<div class="status-hero">${chipHTML('good', '✓', 'Completed')}<h1>Thanks for visiting</h1><p class="muted">See you on your next cut.</p><a class="btn btn-accent" href="./#book">Book again</a></div>`;
    case 'noshow': return `<div class="status-hero">${chipHTML('bad', '✕', 'Missed')}<h1>We missed you</h1><p class="muted">This appointment was marked as missed and the deposit was kept, per the booking policy.</p><a class="btn btn-accent" href="./#book">Book again</a></div>`;
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
  if (S.b && S.justPaid && S.b.status === 'pending_payment' && S.polls < 20) { S.polls++; setTimeout(load, 3000); }
}

const ACT = {
  resetDemo,
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

render();
if (ID && TOKEN) load();
