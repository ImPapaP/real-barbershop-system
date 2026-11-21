// Pure booking logic shared by the Cloud Functions.
// No Firebase imports here, so everything can be unit-tested with plain Node (see ../test).
import crypto from 'node:crypto';

export const TZ = '+08:00'; // Philippine time, no daylight saving
export const DEFAULT_POLICY = {
  deposit: 200,          // pesos, paid online to confirm a booking
  holdMinutes: 15,       // how long a slot is held while the customer pays
  rescheduleHours: 48,   // customers can reschedule up to this many hours before
  lateMinutes: 5,        // junior barbers (no down payment): this late = the slot can go to a walk-in; fit in later
  lateMinutesDeposit: 20, // senior barbers (down payment): over this late = deposit kept and the full price is owed
  cancelHours: 48,       // cancel at least this long before to get the down payment back; later = kept, split barber/shop
  leadMinutes: 60,       // earliest booking is this far from now
  bookAheadDays: 365,    // how far ahead customers can book
  step: 60,              // bookings start on the hour; also the slot grid in minutes
  maxReschedules: 2,
  onlineBooking: true,   // the shop can switch online booking off in Shop setup
  rebookDays: 28,        // days after a visit to send a "time for a trim" text (0 = off)
  receiptTexts: true,    // text the client a short receipt after checkout (the full one goes by email)
  lastBooking: '19:00',  // latest start time for online bookings ('' = until the service would end at closing)
  clockStart: '09:00'    // staff time in by this; 9:01 is late (see lateFine)
};

export const pad = n => String(n).padStart(2, '0');
export const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const startMs = (date, time) => Date.parse(`${date}T${time}:00${TZ}`);
export const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dowOf = date => new Date(`${date}T00:00:00Z`).getUTCDay();
export function phNow(ms = Date.now()) {
  const d = new Date(ms + 8 * 3600e3);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), time: d.toISOString().slice(11, 16) };
}
export const policyOf = info => ({ ...DEFAULT_POLICY, ...(info && info.policy || {}) });
export const slotId = (barberId, date, time) => `${barberId}_${date.replace(/-/g, '')}_${time.replace(':', '')}`;
// Grid slots a booking occupies. Start is snapped down and the end up to the grid, so a phone booking
// at 10:30 for 45 min blocks the 10:00 and 11:00 slots.
export function blockTimes(time, mins, step) {
  const s = Math.floor(toMin(time) / step) * step, e = Math.max(s + step, Math.ceil((toMin(time) + mins) / step) * step);
  return Array.from({ length: (e - s) / step }, (_, i) => fromMin(s + i * step));
}
export function isActiveSlot(slot, now) {
  if (!slot) return false;
  return slot.state === 'booked' || (slot.state === 'held' && (slot.holdUntil || 0) > now);
}
export function hoursFor(info, date) { return (info.hours || []).find(h => h.d === dowOf(date)); }
export const servicesById = (info, ids) => (ids || []).map(id => (info.services || []).find(s => s.id === id));

// Normalise a Philippine mobile number to 09XXXXXXXXX, or return '' if it isn't one.
export function normalizePhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('63')) d = '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('9')) d = '0' + d;
  return /^09\d{9}$/.test(d) ? d : '';
}
export const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

// Barbers who can do every selected service, work that day and (if asked) match the chosen barber.
export const canServe = (b, services) => services.every(s => (b.groups || ['him']).includes(s.group || 'him') && (!s.tier || !(b.tiers || []).length || b.tiers.includes(s.tier)));
// Men's bookings: exactly one haircut (Deluxe or Regular), plus add-ons not already inside a promo.
export function comboError(info, services) {
  const g = (services[0] || {}).group || 'him';
  if (!(info.services || []).some(s => (s.group || 'him') === g && s.kind === 'base' && s.active !== false)) return '';
  const bases = services.filter(s => s.kind === 'base');
  if (bases.length !== 1) return bases.length ? 'Pick only one haircut: Deluxe or Regular.' : 'Pick a haircut first: Deluxe or Regular.';
  const dup = services.find(s => (bases[0].includes || []).includes(s.id));
  return dup ? `${dup.name} is already part of ${bases[0].name.split(' · ')[0]}.` : '';
}
export function eligibleBarbers(info, services, date, barberId) {
  const d = dowOf(date);
  return (info.barbers || [])
    .filter(b => b.active !== false && (b.days || []).includes(d) && !(b.off || []).includes(date)) // off = leave days
    .filter(b => canServe(b, services))
    .filter(b => !barberId || b.id === barberId)
    .sort((a, b) => (a.chair || 99) - (b.chair || 99))
    .map(b => b.id);
}

// Validate a booking request from the website. Returns {ok:false,error} or {ok:true, ...normalised}.
export function validateRequest(info, data, now = Date.now()) {
  const pol = policyOf(info);
  const r = data || {};
  const name = String(r.name || '').trim().slice(0, 80);
  const phone = normalizePhone(r.phone);
  const email = String(r.email || '').trim().toLowerCase().slice(0, 120);
  const notes = String(r.notes || '').trim().slice(0, 400);
  const date = String(r.date || '');
  const time = String(r.time || '');
  const ids = Array.isArray(r.serviceIds) ? [...new Set(r.serviceIds.map(String))].slice(0, 6) : [];
  if (pol.onlineBooking === false) return { ok: false, error: 'Online booking is off right now. Please call or message the shop to book.' };
  if (!name) return { ok: false, error: 'Enter your name.' };
  if (!phone) return { ok: false, error: 'Enter a valid mobile number, like 0917 123 4567.' };
  if (!validEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (r.consent !== true) return { ok: false, error: 'Please agree to the booking policy.' };
  if (!ids.length) return { ok: false, error: 'Pick at least one service.' };
  const services = servicesById(info, ids);
  if (services.some(s => !s || s.active === false)) return { ok: false, error: 'One of the services is no longer offered. Refresh the page.' };
  if (new Set(services.map(s => s.group || 'him')).size > 1) return { ok: false, error: 'Book men’s and women’s services separately.' };
  const combo = comboError(info, services); if (combo) return { ok: false, error: combo };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: 'Pick a date and time.' };
  if (toMin(time) % pol.step !== 0) return { ok: false, error: 'Pick one of the listed times.' };
  const today = phNow(now).date;
  if (date < today || date > addDays(today, pol.bookAheadDays)) return { ok: false, error: `You can book up to ${pol.bookAheadDays} days ahead.` };
  const h = hoursFor(info, date);
  if (!h || h.closed) return { ok: false, error: 'The shop is closed that day.' };
  const mins = Math.max(pol.step, services.reduce((t, s) => t + (s.mins === 0 ? 0 : Number(s.mins) || pol.step), 0)); // add-ons with 0 min fit inside the hour
  const start = toMin(time);
  if (start < toMin(h.open) || start + mins > toMin(h.close)) return { ok: false, error: 'That time is outside opening hours.' };
  if (pol.lastBooking && start > toMin(pol.lastBooking)) return { ok: false, error: `The last booking of the day starts at ${fmtTime(pol.lastBooking)}.` };
  const at = startMs(date, time);
  if (at < now + pol.leadMinutes * 60e3) return { ok: false, error: `Book at least ${pol.leadMinutes} minutes ahead.` };
  const barberId = String(r.barberId || '');
  const barbers = eligibleBarbers(info, services, date, barberId);
  if (!barbers.length) {
    const who = (info.barbers || []).find(b => b.id === barberId);
    if (who && !canServe(who, services)) return { ok: false, error: `${who.name || 'That barber'} doesn’t do that haircut. Pick another barber or haircut.` };
    return { ok: false, error: barberId ? 'That barber isn’t in on that day.' : 'No barber offers that on that day.' };
  }
  return { ok: true, name, phone, email, notes, date, time, mins, at, services, serviceIds: ids, barbers, times: blockTimes(time, mins, pol.step), policy: pol };
}

export function apptMins(appt, info) {
  const pol = policyOf(info);
  return Number(appt.mins) || servicesById(info, appt.serviceIds).reduce((t, s) => t + (Number(s && s.mins) || pol.step), 0) || pol.step;
}
// Slots an appointment should occupy right now ([] when it shouldn't block the calendar), as {id, time}.
export function desiredSlots(appt, info) {
  if (!appt) return [];
  if (!['pending_payment', 'booked', 'waiting', 'inchair'].includes(appt.status)) return [];
  if (appt.source === 'walk-in' || !appt.barberId || !appt.date || !appt.time) return [];
  return blockTimes(appt.time, apptMins(appt, info), policyOf(info).step).map(t => ({ id: slotId(appt.barberId, appt.date, t), time: t }));
}
export const desiredBlocks = (appt, info) => desiredSlots(appt, info).map(s => s.id);
export const slotStateFor = status => status === 'pending_payment' ? 'held' : 'booked';

// PayMongo webhook signature: header "t=<ts>,te=<test sig>,li=<live sig>", HMAC-SHA256 of "<t>.<raw body>".
export function verifyPaymongoSignature(header, rawBody, secret, { now = Date.now(), toleranceSec = 600 } = {}) {
  if (!header || !secret) return { ok: false };
  const parts = Object.fromEntries(String(header).split(',').map(p => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const t = parts.t;
  if (!t) return { ok: false };
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return { ok: false, reason: 'stale' };
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const eq = s => !!s && s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected));
  if (eq(parts.li)) return { ok: true, livemode: true };
  if (eq(parts.te)) return { ok: true, livemode: false };
  return { ok: false };
}

export function newToken() { return crypto.randomBytes(18).toString('base64url'); }
export function tokenMatches(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function bookingCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), b => abc[b % abc.length]).join('');
}

// ---------- message text ----------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtTime(t) { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; }
export function fmtDate(date) { const d = new Date(`${date}T00:00:00Z`); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
const shopName = info => (info.shop && info.shop.name) || 'The barbershop';
export const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';

// SMS bodies stay plain text with no links: PH networks may block texts that contain URLs.
export function smsText(kind, b, info) {
  const pol = policyOf(info), when = `${fmtDate(b.date)}, ${fmtTime(b.time)}`, who = b.barberName || 'your barber', shop = shopName(info);
  switch (kind) {
    case 'confirmed': return `${shop}: You're booked with ${who} on ${when}. ${b.depositNone ? 'No down payment needed, pay at the shop.' : `P${pol.deposit} deposit received.`} Code ${b.code}. ${b.depositNone ? `Arriving ${pol.lateMinutes}+ min late, your slot may go to a walk-in.` : `Over ${pol.lateMinutesDeposit ?? 20} min late: deposit kept and full price owed. Cancel ${pol.cancelHours ?? 48}+ hrs before for a refund.`} Details sent to your email.`;
    case 'reminder': return `${shop}: Reminder, your appointment with ${who} is tomorrow, ${when}. Code ${b.code}. Need to change it? Use the link in your email.`;
    case 'soon': return `${shop}: See you at ${fmtTime(b.time)} today with ${who}. Please arrive on time. Code ${b.code}.`;
    case 'rescheduled': return `${shop}: Your booking ${b.code} is moved to ${when} with ${who}.`;
    case 'cancelled': return `${shop}: Your booking ${b.code} for ${when} is cancelled.`;
    case 'slot_lost': return `${shop}: We got your P${pol.deposit} deposit, but that time was taken while you paid. We'll call you to rebook. Code ${b.code}.`;
    case 'rebook': return `${shop}: Hi ${firstName(b.name)}, it's been ${Math.round(pol.rebookDays / 7)} weeks since your last cut. Book online at our website or call ${(info.shop && info.shop.phone) || 'the shop'}.`;
    case 'proof_rejected': return `${shop}: We couldn't confirm your GCash payment for booking ${b.code}. Please call ${(info.shop && info.shop.phone) || 'the shop'} or check your email.`;
    case 'rate': return `${shop}: Thanks for coming in, ${firstName(b.name)}! How was your cut with ${who}? Rate your visit with the link in your email.`;
    case 'slot_open': return `${shop}: A slot just opened on ${fmtDate(b.date)} at ${fmtTime(b.time)}${b.barberName ? ' with ' + b.barberName : ''}. First to book online gets it. Details in your email.`;
  }
  return '';
}

const forShopKind = k => k.startsWith('shop_');
export function emailContent(kind, b, info, link) {
  const pol = policyOf(info), shop = shopName(info), when = `${fmtDate(b.date)} at ${fmtTime(b.time)}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const subjects = {
    confirmed: `Booking confirmed: ${when}`,
    reminder: `Reminder: your appointment tomorrow, ${fmtTime(b.time)}`,
    rescheduled: `Booking moved to ${when}`,
    cancelled: `Booking cancelled: ${when}`,
    slot_lost: 'We received your deposit, but your time was taken',
    shop_new: `New booking: ${b.name}, ${when}`,
    shop_cancelled: `Cancelled: ${b.name}, ${when}`,
    shop_attention: `Needs attention: ${b.name} paid but the slot was taken`,
    rebook: 'Time for a fresh cut?',
    slot_open: `A slot opened: ${when}`,
    proof_rejected: 'We couldn’t confirm your GCash payment',
    rate: 'How was your cut?',
    shop_proof: `GCash screenshot to check: ${b.name}, ${when}`
  };
  const lines = {
    confirmed: [`Hi ${b.name}, you're booked.`, b.depositNone ? 'No down payment needed. You pay the full price at the shop.' : `We received your ₱${pol.deposit} deposit${b.depositMethod ? ' via ' + b.depositMethod : ''}. It goes toward your bill.`],
    reminder: [`Hi ${b.name}, this is a reminder of your appointment tomorrow.`],
    rescheduled: [`Hi ${b.name}, your booking has a new time.`],
    cancelled: [`Hi ${b.name}, your booking is cancelled.`, b.depositStatus === 'refund_due' ? `You cancelled more than ${pol.cancelHours ?? 48} hours before, so we'll send your ₱${pol.deposit} down payment back.` : b.depositNone ? 'There was no down payment on this booking.' : `You cancelled less than ${pol.cancelHours ?? 48} hours before, so the ₱${pol.deposit} down payment isn't refunded.`],
    slot_lost: [`Hi ${b.name}, we received your ₱${pol.deposit} deposit, but someone else confirmed that time while you were paying.`, 'The shop will call you to pick a new time or refund your deposit.'],
    shop_new: [`${b.name} (${b.phone}, ${b.email}) booked online and paid the deposit.`],
    shop_cancelled: [`${b.name} (${b.phone}) cancelled their booking online.`, b.depositStatus === 'refund_due' ? `It was more than ${pol.cancelHours ?? 48} hours ahead: send the ₱${pol.deposit} down payment back, then mark it refunded in the dashboard.` : b.depositNone ? 'No down payment on this booking.' : 'The down payment is kept (half goes to the barber).'],
    shop_attention: [`${b.name} (${b.phone}) paid the deposit after their hold expired and the slot was taken. Call them to rebook or refund it in PayMongo.`],
    rebook: [`Hi ${firstName(b.name)}, it's been about ${Math.round(pol.rebookDays / 7)} weeks since your last visit.`, 'Book your next cut online in a minute.'],
    slot_open: [`Hi ${firstName(b.name)}, you're on our waitlist and a slot just opened.`, 'It goes to whoever books first, so grab it soon.'],
    proof_rejected: [`Hi ${b.name}, we couldn't match your GCash screenshot to a payment, so this booking isn't confirmed yet.`, `Please call or message the shop at ${(info.shop && info.shop.phone) || ''} and we'll sort it out.`],
    rate: [`Hi ${firstName(b.name)}, thanks for coming in.`, `How was your cut with ${b.barberName || 'us'}? It takes 10 seconds and helps the team.`],
    shop_proof: [`${b.name} (${b.phone}) sent a GCash screenshot for their booking. Check it in the dashboard and approve it if the payment came in.`]
  };
  const forShop = forShopKind(kind);
  const rows = kind === 'rebook' ? [] : kind === 'slot_open' ? [['When', when], ['Barber', b.barberName || 'Any barber']]
    : [['Booking code', b.code], ['When', when], ['Barber', b.barberName || 'Any barber'], ['Services', (b.serviceNames || []).join(', ')]];
  const button = forShopKind(kind) ? 'Open the dashboard' : kind === 'rate' ? 'Rate your visit' : ['rebook', 'slot_open'].includes(kind) ? 'Book now' : 'View or change your booking';
  const policy = forShop || ['rebook', 'slot_open', 'rate'].includes(kind) ? '' : `<p style="color:#555;font-size:13px">${b.depositNone ? `If you're ${pol.lateMinutes} minutes late or more, your slot may go to a walk-in. We'll fit you in at the next free time if we can.` : `If you're more than ${pol.lateMinutesDeposit ?? 20} minutes late, the down payment is kept and the full price of your service is still due, for the barber's time. Cancel at least ${pol.cancelHours ?? 48} hours before to get the down payment back.`} You can reschedule up to ${pol.rescheduleHours} hours before your appointment.</p>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;color:#111">
<h2 style="margin:0 0 12px">${esc(shop)}</h2>
${lines[kind].map(l => `<p>${esc(l)}</p>`).join('')}
<table style="border-collapse:collapse;margin:12px 0">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('')}</table>
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${button}</a></p>` : ''}
${policy}
<p style="color:#555;font-size:13px">${esc(info.shop && info.shop.address || '')}<br>${esc(info.shop && info.shop.phone || '')}</p></div>`;
  const text = [...lines[kind], '', ...rows.map(([k, v]) => `${k}: ${v}`), link ? `\n${link}` : ''].join('\n');
  return { subject: `${shop}: ${subjects[kind]}`, html, text };
}

// Which part of the day a time falls in (used by the waitlist).
export const windowOf = t => toMin(t) < 720 ? 'morning' : toMin(t) < 1020 ? 'afternoon' : 'evening';
export const parseSlotId = id => { const p = String(id).split('_'); if (p.length < 3) return null; const hm = p.pop(), d = p.pop(); return { barberId: p.join('_'), date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, time: `${hm.slice(0, 2)}:${hm.slice(2, 4)}` }; };
// Does a freed slot suit a waitlist entry? entry: {barberId, window}
export const waitlistMatches = (entry, slot) => (!entry.barberId || entry.barberId === slot.barberId) && (!entry.window || entry.window === 'any' || entry.window === windowOf(slot.time));

// "Book again" link: same services and barber as a past visit, if they're still on the menu / working.
// site/?svc=h1,h6&barber=lyndon#book  — the website picks them and jumps to the date step.
export function rebookLink(site, visit, info) {
  const svcIds = (visit.serviceIds || (visit.lines || []).filter(l => l.kind === 'service').map(l => l.ref)).filter(id => (info.services || []).some(s => s.id === id && s.active !== false));
  const p = new URLSearchParams();
  if (svcIds.length) p.set('svc', [...new Set(svcIds)].join(','));
  if (visit.barberId && (info.barbers || []).some(b => b.id === visit.barberId && b.active !== false)) p.set('barber', visit.barberId);
  const q = p.toString().replace(/%2C/g, ',');
  return `${String(site).replace(/\/+$/, '')}/${q ? '?' + q : ''}#book`;
}

// ---------- promo codes (same rules as the website, public/assets/shared.js) ----------
export function promoCheck(promo, total, today) {
  if (!promo || promo.active === false) return { ok: false, error: 'That promo code isn’t valid.' };
  if (promo.expires && today > promo.expires) return { ok: false, error: 'That promo code has expired.' };
  if (promo.maxUses && (promo.uses || 0) >= promo.maxUses) return { ok: false, error: 'That promo code has been used up.' };
  if (promo.minSpend && total < promo.minSpend) return { ok: false, error: `That code needs at least ₱${promo.minSpend} in services.` };
  const v = Math.max(0, Number(promo.value) || 0);
  const off = Math.min(total, promo.kind === 'amount' ? v : Math.floor(total * Math.min(v, 100) / 100));
  if (!off) return { ok: false, error: 'That promo code isn’t valid.' };
  return { ok: true, off, label: promo.kind === 'amount' ? `₱${v} off` : `${v}% off` };
}
// Birthday as "MM-DD" (no year). Anything else becomes ''. Feb 29 is allowed.
export function cleanBday(v) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(v || '').trim()); if (!m) return '';
  const mo = +m[1], d = +m[2], max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return max && d >= 1 && d <= max ? `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
}
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
// Payment screenshots are stored as small JPEG data URLs (no Firebase Storage needed).
export const validProofImage = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 900000;

// ---------- receipts ----------
// What the client may see of a sale: no commission, cost or staff pay. `barberName` is passed in.
export function receiptView(id, s, info, barberName = '', visits = 0) {
  const sh = info.shop || {}, every = Math.max(0, parseInt(sh.loyaltyEvery, 10) || 0);
  const lines = (s.lines || []).map(l => ({ name: String(l.name || 'Item'), qty: Number(l.qty) || 1, price: Number(l.price) || 0 }));
  const paidAtShop = Math.max(0, (Number(s.total) || 0) - (Number(s.depositCredit) || 0));
  return {
    id, date: s.date, time: s.time, name: s.name && s.name !== 'Walk-in' ? String(s.name) : '', barberName,
    lines, discount: Number(s.discount) || 0, discountNote: s.discountNote || '', tip: Number(s.tip) || 0, total: Number(s.total) || 0,
    depositCredit: Number(s.depositCredit) || 0, paidAtShop, method: s.method || '', cash: Number(s.cash) || 0,
    orNo: s.orNo || '', shop: { name: sh.name || '', wordmark: sh.wordmark || '', address: sh.address || '', phone: sh.phone || '', tagline: sh.tagline || '', tin: sh.tin || '', birPermit: sh.birPermit || '' },
    loyalty: every && s.customerId ? { every, visits } : null
  };
}
const peso = n => `P${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH')}`;
// Text receipt: no link (PH networks may block texts with URLs), just the essentials
export function receiptSms(r, info) {
  const items = r.lines.map(l => `${l.name}${l.qty > 1 ? ' x' + l.qty : ''} ${peso(l.price * l.qty)}`).join(', ');
  const paid = r.depositCredit ? `${peso(r.paidAtShop)} ${r.method} + ${peso(r.depositCredit)} deposit` : `${peso(r.total)} ${r.method}`;
  return `${shopName(info)} receipt ${fmtDate(r.date)} ${fmtTime(r.time)}: ${items}${r.discount ? `, less ${peso(r.discount)}` : ''}${r.tip ? `, tip ${peso(r.tip)}` : ''}. Total ${peso(r.total)}, paid ${paid}. Thank you!`.slice(0, 450);
}
export function receiptEmail(r, info, link) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const row = (k, v, b) => `<tr><td style="padding:4px 16px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0;text-align:right">${b ? '<b>' : ''}${esc(v)}${b ? '</b>' : ''}</td></tr>`;
  const rows = [...r.lines.map(l => row(`${l.name}${l.qty > 1 ? ' ×' + l.qty : ''}`, peso(l.price * l.qty).replace('P', '₱'))),
    r.discount ? row(`Discount${r.discountNote ? ` (${r.discountNote})` : ''}`, '−' + peso(r.discount).replace('P', '₱')) : '', r.tip ? row('Tip', peso(r.tip).replace('P', '₱')) : '',
    row('Total', peso(r.total).replace('P', '₱'), true), r.depositCredit ? row('Deposit paid online', '−' + peso(r.depositCredit).replace('P', '₱')) : '',
    row(`Paid at the shop (${r.method})`, peso(r.paidAtShop).replace('P', '₱'), true)].join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;color:#111"><h2 style="margin:0 0 4px">${esc(shopName(info))}</h2>
<p style="margin:0 0 12px;color:#555">Receipt · ${esc(fmtDate(r.date))}, ${esc(fmtTime(r.time))}${r.barberName ? ` · with ${esc(r.barberName)}` : ''}</p>
<p>Hi ${esc(firstName(r.name))}, thanks for coming in. Here's your receipt.</p>
<table style="border-collapse:collapse;margin:12px 0;min-width:280px">${rows}</table>
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View receipt</a></p>` : ''}
<p style="color:#555;font-size:13px">${esc(info.shop && info.shop.address || '')}<br>${esc(info.shop && info.shop.phone || '')}</p></div>`;
  return { subject: `${shopName(info)}: Your receipt, ${fmtDate(r.date)}`, html, text: receiptSms(r, info) + (link ? `\n${link}` : '') };
}

// Live walk-in queue for the website, with no names: who is waiting, in the chair, or booked today.
// t: "w" waiting walk-in, "c" in the chair, "b" booked; s = start (minutes after midnight), m = length in minutes.
export function queueItems(appts, info, date) {
  const svcMin = ids => (ids || []).reduce((t, id) => t + (((info.services || []).find(s => s.id === id) || {}).mins || 0), 0) || 40;
  const items = (appts || []).filter(a => a.date === date && ["waiting", "inchair", "booked"].includes(a.status)).map(a => {
    const [h, mm] = String(a.time || "0:0").split(":").map(Number);
    return { t: a.status === "waiting" ? "w" : a.status === "inchair" ? "c" : "b", s: h * 60 + (mm || 0), m: a.mins || svcMin(a.serviceIds), ...(a.startedAt ? { st: a.startedAt } : {}) };
  });
  return { date, items, at: Date.now() };
}

// ---------- client accounts ----------
// What a client sees when they log in with their number: their bookings, visits, receipts and loyalty.
// Same code on the server (functions/src/core.js) and in the demo (public/assets/shared.js).
export function accountView({ phone, customers = [], appts = [], sales = [], info, today }) {
  const svcName = id => ((info.services || []).find(s => s.id === id) || {}).name || 'Service';
  const bName = id => ((info.barbers || []).find(b => b.id === id) || {}).name || '';
  const c = customers.find(x => x.name) || {}, every = Math.max(0, parseInt((info.shop || {}).loyaltyEvery, 10) || 0);
  const cIds = new Set(customers.map(x => x.id));
  const upcoming = appts.filter(a => ['booked', 'pending_payment', 'waiting', 'inchair'].includes(a.status) && a.date >= today)
    .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)).slice(0, 10)
    .map(a => ({ id: a.id, token: a.token || '', date: a.date, time: a.time, status: a.status, source: a.source || '', services: (a.serviceIds || []).map(svcName), barberName: a.anyBarber ? '' : bName(a.barberId), queueNo: a.queueNo || 0 }));
  const paid = sales.filter(s => cIds.has(s.customerId) || (s.phone && s.phone.replace(/\D/g, '').replace(/^63/, '0') === phone))
    .sort((x, y) => (y.date + (y.time || '')).localeCompare(x.date + (x.time || '')));
  const visits = paid.slice(0, 30).map(s => ({ date: s.date, time: s.time || '', services: (s.lines || []).map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')), barberName: bName(s.barberId), total: Number(s.total) || 0,
    receipt: s.rtoken ? { id: s.id, t: s.rtoken } : null }));
  const last = paid[0];
  return {
    name: c.name || (appts[0] && appts[0].name) || '', phone, birthday: c.birthday || '',
    upcoming, visits, visitCount: paid.length,
    coupons: customers.flatMap(x => x.coupons || []).filter(cp => couponLive(cp, today)).map(cp => ({ id: cp.id, label: couponLabel(cp, info.services || [], (info.shop || {}).currency || '₱'), note: cp.note || '', expires: cp.expires || '' })),
    loyalty: every ? { every, visits: paid.length, nextFree: (paid.length + 1) % every === 0 } : null,
    again: last ? { svc: (last.lines || []).filter(l => l.kind === 'service').map(l => l.ref).filter(id => (info.services || []).some(s => s.id === id && s.active !== false)), barber: (info.barbers || []).some(b => b.id === last.barberId) ? last.barberId : '' } : null
  };
}

// Down payment for one person's booking: none when their barber is set to "no down payment" (junior barbers),
// Only senior barbers take one: for "any available", it's needed only when every barber who could take it is a senior. Same rule as the website.
export function depositFor(info, barberId, services) {
  const pol = policyOf(info), bs = info.barbers || [];
  if (barberId) { const b = bs.find(x => x.id === barberId); return b && b.noDeposit ? 0 : pol.deposit; }
  const can = bs.filter(b => b.active !== false && canServe(b, services || []));
  return can.length && can.every(b => !b.noDeposit) ? pol.deposit : 0;
}

// Service options (e.g. polish on a manicure): { serviceId: optionId } on a booking. Keeps only real options
// of services in the booking; withOption folds the pick into the name and price.
export function cleanOptions(info, ids, raw) {
  const out = {}; if (!raw || typeof raw !== "object") return out;
  for (const id of ids || []) { const s = (info.services || []).find(x => x.id === id), o = s && (s.options || []).find(x => x.id === raw[id]); if (o) out[id] = o.id; }
  return out;
}
export const withOption = (s, opts) => { const o = s && (s.options || []).find(x => x.id === (opts || {})[s.id]); return o ? { ...s, name: `${s.name} + ${o.name}`, price: (Number(s.price) || 0) + (Number(o.add) || 0) } : s; };

// Late and cancel rules depend on the barber level. Junior barbers (no down payment): 5 minutes, then the slot can
// go to a walk-in and the client is fitted in at the next free time. Senior barbers (down payment): 20 minutes;
// over that the down payment is kept and the full price is owed. Cancelling 48+ hours before gets the down
// payment back; later, it's kept and split between the barber and the shop.
export const hasDeposit = a => !!(a && a.deposit && a.deposit.status !== 'none' && (a.deposit.amount || 0) > 0);
export const lateLimit = (a, pol) => hasDeposit(a) ? (pol.lateMinutesDeposit ?? 20) : (pol.lateMinutes ?? 5);
export const refundOnCancel = (a, pol, now = Date.now()) => hasDeposit(a) && a.deposit.status === 'paid' && (a.startAt || 0) - now >= (pol.cancelHours ?? 48) * 3600e3;

// ---------- time clock ----------
// 9:01 is late. Each started 15 minutes late costs the person's late rate (seniors ₱50, juniors ₱15):
// 9:01–9:15 → 1 × rate, 9:16–9:30 → 2 × rate, and so on. Times are "HH:MM" in Philippine time.
export const CLOCK_START = '09:00';
export function lateFine(inHM, startHM, rate) {
  const mins = Math.max(0, toMin(inHM) - toMin(startHM || CLOCK_START)), blocks = mins > 0 ? Math.ceil(mins / 15) : 0;
  return { mins, blocks, fine: blocks * Math.max(0, Number(rate) || 0) };
}
export const lateRateOf = b => (b && b.lateFine != null && b.lateFine !== '') ? Math.max(0, Number(b.lateFine) || 0) : (b && (b.role || 'barber') === 'barber' ? ((b.tiers || []).includes('deluxe') ? 50 : 15) : 0);
export const shiftStartOf = (b, pol) => (b && b.shiftStart) || (pol && pol.clockStart) || CLOCK_START;
// Who can do what in the dashboard (admins/{uid}.role). A missing role means owner (accounts made before roles).
export const ACCESS = { owner: 'Owner (everything)', desk: 'Receptionist (bookings, checkout, clients)', staff: 'Own schedule and pay only' };
export const roleOf = a => (a && ACCESS[a.role]) ? a.role : 'owner';

// ---------- client coupons (given in Edit client, used at checkout) ----------
// { id, kind: 'amount' | 'percent' | 'service', value, svcId, note, expires: 'YYYY-MM-DD' | '', at, used, usedAt, saleId }
export const couponLive = (cp, today) => !!cp && !cp.used && (!cp.expires || cp.expires >= today);
export function couponLabel(cp, services = [], cur = '₱') {
  if (!cp) return '';
  if (cp.kind === 'percent') return `${Number(cp.value) || 0}% off`;
  if (cp.kind === 'service') { const s = services.find(x => x.id === cp.svcId); return `Free ${s ? s.name : 'service'}`; }
  return `${cur}${(Number(cp.value) || 0).toLocaleString('en-PH')} off`;
}
