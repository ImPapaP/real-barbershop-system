// Pure booking logic shared by the Cloud Functions.
// No Firebase imports here, so everything can be unit-tested with plain Node (see ../test).
import crypto from 'node:crypto';

export const TZ = '+08:00'; // Philippine time, no daylight saving
export const DEFAULT_POLICY = {
  deposit: 200,          // pesos, paid online to confirm a booking
  holdMinutes: 15,       // how long a slot is held while the customer pays
  rescheduleHours: 48,   // customers can reschedule up to this many hours before
  lateMinutes: 20,       // shown to customers: this late = cancelled, deposit kept
  leadMinutes: 60,       // earliest booking is this far from now
  bookAheadDays: 30,     // how far ahead customers can book
  step: 30,              // slot grid in minutes
  maxReschedules: 2
};

export const pad = n => String(n).padStart(2, '0');
export const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const startMs = (date, time) => Date.parse(`${date}T${time}:00${TZ}`);
export const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dowOf = date => new Date(`${date}T00:00:00Z`).getUTCDay();
export function phNow(ms = Date.now()) {
  const d = new Date(ms + 8 * 3600e3);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
export const policyOf = info => ({ ...DEFAULT_POLICY, ...(info && info.policy || {}) });
export const slotId = (barberId, date, time) => `${barberId}_${date.replace(/-/g, '')}_${time.replace(':', '')}`;
export function blockTimes(time, mins, step) {
  const n = Math.max(1, Math.ceil(mins / step));
  return Array.from({ length: n }, (_, i) => fromMin(toMin(time) + i * step));
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
export function eligibleBarbers(info, services, date, barberId) {
  const groups = [...new Set(services.map(s => s.group || 'him'))];
  const d = dowOf(date);
  return (info.barbers || [])
    .filter(b => b.active !== false && (b.days || []).includes(d))
    .filter(b => groups.every(g => (b.groups || ['him']).includes(g)))
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
  if (!name) return { ok: false, error: 'Enter your name.' };
  if (!phone) return { ok: false, error: 'Enter a valid mobile number, like 0917 123 4567.' };
  if (!validEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (r.consent !== true) return { ok: false, error: 'Please agree to the booking policy.' };
  if (!ids.length) return { ok: false, error: 'Pick at least one service.' };
  const services = servicesById(info, ids);
  if (services.some(s => !s || s.active === false)) return { ok: false, error: 'One of the services is no longer offered. Refresh the page.' };
  if (new Set(services.map(s => s.group || 'him')).size > 1) return { ok: false, error: 'Book men’s and women’s services separately.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: 'Pick a date and time.' };
  if (toMin(time) % pol.step !== 0) return { ok: false, error: 'Pick one of the listed times.' };
  const today = phNow(now).date;
  if (date < today || date > addDays(today, pol.bookAheadDays)) return { ok: false, error: `You can book up to ${pol.bookAheadDays} days ahead.` };
  const h = hoursFor(info, date);
  if (!h || h.closed) return { ok: false, error: 'The shop is closed that day.' };
  const mins = services.reduce((t, s) => t + (Number(s.mins) || pol.step), 0);
  const start = toMin(time);
  if (start < toMin(h.open) || start + mins > toMin(h.close)) return { ok: false, error: 'That time is outside opening hours.' };
  const at = startMs(date, time);
  if (at < now + pol.leadMinutes * 60e3) return { ok: false, error: `Book at least ${pol.leadMinutes} minutes ahead.` };
  const barberId = String(r.barberId || '');
  const barbers = eligibleBarbers(info, services, date, barberId);
  if (!barbers.length) return { ok: false, error: barberId ? 'That barber isn’t in on that day.' : 'No barber offers that on that day.' };
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

// SMS bodies stay plain text with no links: PH networks may block texts that contain URLs.
export function smsText(kind, b, info) {
  const pol = policyOf(info), when = `${fmtDate(b.date)}, ${fmtTime(b.time)}`, who = b.barberName || 'your barber', shop = shopName(info);
  switch (kind) {
    case 'confirmed': return `${shop}: You're booked with ${who} on ${when}. P${pol.deposit} deposit received. Code ${b.code}. Arriving ${pol.lateMinutes}+ min late cancels the booking. Details sent to your email.`;
    case 'reminder': return `${shop}: Reminder, your appointment with ${who} is tomorrow, ${when}. Code ${b.code}. Need to change it? Use the link in your email.`;
    case 'soon': return `${shop}: See you at ${fmtTime(b.time)} today with ${who}. Please arrive on time. Code ${b.code}.`;
    case 'rescheduled': return `${shop}: Your booking ${b.code} is moved to ${when} with ${who}.`;
    case 'cancelled': return `${shop}: Your booking ${b.code} for ${when} is cancelled.`;
    case 'slot_lost': return `${shop}: We got your P${pol.deposit} deposit, but that time was taken while you paid. We'll call you to rebook. Code ${b.code}.`;
  }
  return '';
}

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
    shop_attention: `Needs attention: ${b.name} paid but the slot was taken`
  };
  const lines = {
    confirmed: [`Hi ${b.name}, you're booked.`, `We received your ₱${pol.deposit} deposit${b.depositMethod ? ' via ' + b.depositMethod : ''}. It goes toward your bill.`],
    reminder: [`Hi ${b.name}, this is a reminder of your appointment tomorrow.`],
    rescheduled: [`Hi ${b.name}, your booking has a new time.`],
    cancelled: [`Hi ${b.name}, your booking is cancelled.`, `The ₱${pol.deposit} deposit isn't refunded for cancellations.`],
    slot_lost: [`Hi ${b.name}, we received your ₱${pol.deposit} deposit, but someone else confirmed that time while you were paying.`, 'The shop will call you to pick a new time or refund your deposit.'],
    shop_new: [`${b.name} (${b.phone}, ${b.email}) booked online and paid the deposit.`],
    shop_cancelled: [`${b.name} (${b.phone}) cancelled their booking online. The deposit is kept.`],
    shop_attention: [`${b.name} (${b.phone}) paid the deposit after their hold expired and the slot was taken. Call them to rebook or refund it in PayMongo.`]
  };
  const forShop = kind.startsWith('shop_');
  const rows = [['Booking code', b.code], ['When', when], ['Barber', b.barberName || 'Any barber'], ['Services', (b.serviceNames || []).join(', ')]];
  const policy = forShop ? '' : `<p style="color:#555;font-size:13px">Arriving ${pol.lateMinutes} minutes late or more cancels the booking and the deposit is kept. You can reschedule up to ${pol.rescheduleHours} hours before your appointment.</p>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;color:#111">
<h2 style="margin:0 0 12px">${esc(shop)}</h2>
${lines[kind].map(l => `<p>${esc(l)}</p>`).join('')}
<table style="border-collapse:collapse;margin:12px 0">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('')}</table>
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${forShop ? 'Open the dashboard' : 'View or change your booking'}</a></p>` : ''}
${policy}
<p style="color:#555;font-size:13px">${esc(info.shop && info.shop.address || '')}<br>${esc(info.shop && info.shop.phone || '')}</p></div>`;
  const text = [...lines[kind], '', ...rows.map(([k, v]) => `${k}: ${v}`), link ? `\n${link}` : ''].join('\n');
  return { subject: `${shop}: ${subjects[kind]}`, html, text };
}
