// Demo backend: same interface as firebase-backend.js, but everything lives in this browser's localStorage.
// Used for the live preview before Firebase is connected. Payments are skipped; bookings confirm instantly.
import {
  windowOfTime, STARTER, STARTER_STAFF, publicBarber, slotId, blockTimes, isActiveSlot, availableTimes, policyOf,
  startMs, phNow, addDays, sum
} from './shared.js';

const KEY = 'rb-demo-v3', USER_KEY = 'rb-demo-user';
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const listeners = new Set();
let store = new Map();
store = load() || seed();
save();

function load() { try { const s = localStorage.getItem(KEY); return s ? new Map(JSON.parse(s)) : null; } catch (_) { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify([...store])); } catch (_) {} }
function changed() { save(); queueMicrotask(() => listeners.forEach(f => f())); }
window.addEventListener('storage', e => { if (e.key === KEY) { store = load() || store; listeners.forEach(f => f()); } });
export function resetDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem('lastBooking'); } catch (_) {} location.reload(); }

// ---------- sample data ----------
function seed() {
  const m = new Map(), T = phNow().date, day = n => addDays(T, n);
  let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  m.set('public/info', { ...clone(STARTER), policy: { ...STARTER.policy, onlineBooking: true }, barbers: STARTER_STAFF.map(publicBarber) });
  STARTER_STAFF.forEach(({ id, ...b }) => m.set('staff/' + id, { ...b, since: '2024-01-15' }));
  m.set('admins/demo', { role: 'owner' });
  const svc = STARTER.services, him = svc.filter(s => s.group === 'him'), her = svc.filter(s => s.group === 'her' && !s.priceFrom);
  const names = ['Marco Reyes', 'Jericho Santos', 'Carlo Mendoza', 'Rafael Cruz', 'Joshua Villanueva', 'Kevin Ramos', 'Miguel Torres', 'Andrea Cruz', 'Bea Lim', 'Dennis Aquino'];
  names.forEach((n, i) => m.set(`customers/c${i}`, { name: n, phone: `09170000${String(100 + i)}`, phoneKey: `09170000${String(100 + i)}`, email: '', notes: i === 0 ? '#2 sides, scissor top' : '', createdAt: Date.now() - (90 - i * 7) * 864e5 }));
  let n = 0;
  for (let i = -40; i <= -1; i++) {
    const d = day(i), cnt = 9 + Math.floor(rnd() * 8);
    for (let k = 0; k < cnt; k++) {
      const forHer = rnd() < 0.15, s = forHer ? pick(her) : (rnd() < 0.45 ? svc[0] : pick(him));
      const b = forHer ? 'dave' : pick(['reymart', 'lyndon', 'rod', 'angelo']);
      const ci = rnd() < 0.35 && i > -26 ? Math.floor(rnd() * 6) : -1; // clients 6-9 last came 4-5 weeks ago (see below)
      const tip = rnd() < 0.2 ? pick([20, 50, 100]) : 0, dep = rnd() < 0.45 ? 200 : 0;
      const prod = rnd() < 0.08 ? { kind: 'product', ref: 'i1', name: 'Clay pomade', price: 450, qty: 1 } : null;
      const lines = [{ kind: 'service', ref: s.id, name: s.name, price: s.price, qty: 1 }, ...(prod ? [prod] : [])];
      const pt = prod ? prod.price : 0;
      m.set(`sales/x${n++}`, { date: d, time: `${String(9 + Math.floor(rnd() * 10)).padStart(2, '0')}:${rnd() < 0.5 ? '00' : '30'}`, at: Date.now() + i * 864e5,
        customerId: ci >= 0 ? `c${ci}` : '', name: ci >= 0 ? names[ci] : 'Walk-in', barberId: b, lines, svcTotal: s.price, prodTotal: pt, discount: 0, tip,
        total: s.price + pt + tip, depositCredit: dep, method: pick(['Cash', 'Cash', 'GCash', 'Maya']), rate: 50, commission: s.price / 2 });
    }
  }
  // a few regulars last seen 4-5 weeks ago, so "Due for a trim" has people in it
  [[6, -29], [7, -31], [8, -33], [9, -36], [6, -60], [8, -64]].forEach(([ci, d], k) => m.set(`sales/r${k}`, { date: day(d), time: '15:00', at: Date.now() + d * 864e5, customerId: `c${ci}`, name: names[ci], barberId: 'lyndon',
    lines: [{ kind: 'service', ref: 'h1', name: 'Deluxe Haircut', price: 399, qty: 1 }], svcTotal: 399, prodTotal: 0, discount: 0, tip: 0, total: 399, depositCredit: 0, method: 'Cash', rate: 50, commission: 199.5 }));
  [['e1', day(-18), 'Rent', 'Shop rent', 25000, 'Bank transfer'], ['e2', day(-12), 'Electricity', 'Meralco bill', 6200, 'GCash'], ['e3', day(-9), 'Water', 'Water bill', 780, 'GCash'],
   ['e4', day(-6), 'Supplies', 'Blades, neck strips, alcohol', 1450, 'Cash'], ['e5', day(-3), 'Stock purchase', 'Clay pomade ×12', 3000, 'Cash'], ['e6', day(-1), 'Payment fees', 'PayMongo fees', 380, 'Bank transfer']]
    .forEach(([id, date, cat, desc, amount, method]) => m.set('expenses/' + id, { date, cat, desc, amount, method }));
  [['i1', 'Clay pomade', 'Retail', 3, 5, 250, 450, 'jars'], ['i2', 'Hair tonic', 'Retail', 12, 4, 90, 180, 'bottles'], ['i3', 'Beard oil', 'Retail', 7, 3, 150, 280, 'bottles'],
   ['i4', 'Razor blades (100 pcs)', 'Supply', 1, 2, 450, 0, 'boxes'], ['i5', 'Neck strips', 'Supply', 14, 5, 60, 0, 'rolls'], ['i6', 'Aloe vera gel', 'Supply', 4, 2, 180, 0, 'tubs']]
    .forEach(([id, name, cat, stock, reorder, cost, price, unit]) => m.set('inventory/' + id, { name, cat, stock, reorder, cost, price, unit, log: [] }));
  const appts = [
    [day(0), '10:00', 'reymart', ['h1'], 'online', 'booked', 0], [day(0), '11:00', 'lyndon', ['p1'], 'online', 'booked', 1],
    [day(0), '13:00', 'dave', ['f2', 'f3'], 'online', 'booked', 7], [day(0), '15:00', 'rod', ['h5'], 'phone', 'booked', 5],
    [day(0), '17:00', 'angelo', ['h2'], 'online', 'booked', 3], [day(1), '10:00', 'reymart', ['h1'], 'online', 'booked', 2],
    [day(1), '11:00', 'reymart', ['p2'], 'online', 'booked', 6], [day(1), '14:00', 'lyndon', ['h1'], 'phone', 'booked', 4],
    [day(2), '16:00', 'dave', ['f9'], 'online', 'booked', 8]
  ];
  appts.forEach(([date, time, barberId, serviceIds, source, status, ci], i) => {
    const id = `a${i}`;
    m.set('appointments/' + id, { date, time, startAt: startMs(date, time), barberId, serviceIds, mins: 60 * serviceIds.length, source, status, name: names[ci], phone: `09170000${100 + ci}`,
      email: '', customerId: `c${ci}`, code: 'DEMO' + (10 + i), token: 'demo' + i, notify: true, reminders: {},
      deposit: source === 'online' ? { amount: 200, status: 'paid', method: pick(['gcash', 'paymaya', 'card']) } : null, createdAt: Date.now() - 864e5 });
  });
  m.set('waitlist/wl1', { name: 'Kevin Ramos', phone: '09170000105', phoneKey: '09170000105', email: '', date: day(1), window: 'morning', barberId: 'reymart', serviceIds: ['h1'], status: 'waiting', createdAt: Date.now() - 3600e3 });
  m.set('appointments/w1', { date: day(0), time: '09:40', source: 'walk-in', status: 'waiting', name: 'Walk-in', queueNo: 1, serviceIds: ['h1'], barberId: '', createdAt: Date.now() - 12 * 60000 });
  store = m;
  for (const k of [...m.keys()]) if (k.startsWith('appointments/')) syncSlots(k.split('/')[1]);
  return m;
}

// Mirrors the syncSlots Cloud Function: every active booking claims its time slots.
function syncSlots(id) {
  const freed = [];
  for (const [k, v] of [...store]) if (k.startsWith('slots/') && v.bookingId === id) { store.delete(k); freed.push(v); }
  if (freed.length) queueMicrotask(() => notifyWaitlist(freed));
  const a = store.get('appointments/' + id), info = store.get('public/info');
  if (!a || !info || !['pending_payment', 'booked', 'waiting', 'inchair'].includes(a.status) || a.source === 'walk-in' || !a.barberId || !a.date || !a.time) return;
  const pol = policyOf(info), mins = a.mins || sum((a.serviceIds || []).map(s => info.services.find(x => x.id === s)).filter(Boolean), s => s.mins) || pol.step;
  for (const t of blockTimes(a.time, mins, pol.step)) {
    const sid = 'slots/' + slotId(a.barberId, a.date, t), cur = store.get(sid);
    if (cur && cur.bookingId !== id && isActiveSlot(cur, Date.now())) continue;
    store.set(sid, { barberId: a.barberId, date: a.date, time: t, state: a.status === 'pending_payment' ? 'held' : 'booked', holdUntil: a.holdUntil || 0, bookingId: id });
  }
}

// Mirrors notifyWaitlist: freed slots go to the first matching waitlist entries (marked "texted" in the demo).
function notifyWaitlist(freed) {
  const now = Date.now(), pol = policyOf(store.get('public/info') || STARTER);
  const open = freed.filter(x => startMs(x.date, x.time) > now + pol.leadMinutes * 60e3);
  let changedAny = false;
  for (const [k, w] of [...store].filter(([k]) => k.startsWith('waitlist/')).sort((a, b) => a[1].createdAt - b[1].createdAt)) {
    if (w.status !== 'waiting') continue;
    const slot = open.filter(x => x.date === w.date).sort((a, b) => a.time.localeCompare(b.time)).find(x => (!w.barberId || w.barberId === x.barberId) && (!w.window || w.window === 'any' || w.window === windowOfTime(x.time)));
    if (!slot) continue;
    const b = (store.get('public/info').barbers || []).find(y => y.id === slot.barberId);
    store.set(k, { ...w, status: 'notified', notifiedAt: now, notifiedSlot: `${slot.time} ${b ? b.name : ''}`.trim() }); changedAny = true;
  }
  if (changedAny) changed();
}

// ---------- database (same shape as firebase-backend.js) ----------
const snapDoc = path => { const d = store.get(path); return { id: path.split('/').pop(), exists: d !== undefined, data: () => clone(d), metadata: { fromCache: false, hasPendingWrites: false } }; };
function runQuery(path, filters) {
  const depth = path.split('/').length + 1;
  let docs = [...store.keys()].filter(k => k.startsWith(path + '/') && k.split('/').length === depth).map(snapDoc);
  for (const [f, op, v] of filters) docs = docs.filter(d => { const x = (d.data() || {})[f]; return op === '==' ? x === v : op === '!=' ? x !== v : op === '>=' ? x >= v : op === '>' ? x > v : op === '<=' ? x <= v : op === '<' ? x < v : true; });
  return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false } };
}
function afterWrite(path) { const [col, id] = path.split('/'); if (col === 'appointments') syncSlots(id); changed(); }
function setDeep(obj, key, val) { const ks = key.split('.'); let o = obj; ks.slice(0, -1).forEach(k => { o = o[k] = (o[k] && typeof o[k] === 'object') ? o[k] : {}; }); o[ks.at(-1)] = val; }
function docRef(path) {
  return {
    id: path.split('/').pop(), path,
    get: async () => snapDoc(path),
    set: async data => { store.set(path, clone(data)); afterWrite(path); },
    update: async data => { if (!store.has(path)) throw Object.assign(new Error('Not found'), { code: 'not-found' }); const cur = clone(store.get(path)); for (const [k, v] of Object.entries(data)) setDeep(cur, k, clone(v)); store.set(path, cur); afterWrite(path); },
    delete: async () => { store.delete(path); afterWrite(path); },
    onSnapshot: next => { const f = () => next(snapDoc(path)); listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); }
  };
}
function queryRef(path, filters = []) {
  return {
    path,
    where: (f, op, v) => queryRef(path, [...filters, [f, op, v]]),
    orderBy: () => queryRef(path, filters), limit: () => queryRef(path, filters),
    doc: id => docRef(`${path}/${id || Date.now().toString(36) + Math.random().toString(36).slice(2, 10)}`),
    get: async () => runQuery(path, filters),
    onSnapshot: next => { const f = () => next(runQuery(path, filters)); listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); }
  };
}
export const db = { doc: docRef, collection: p => queryRef(p) };

// ---------- booking functions (mirror functions/index.js, minus payments and messages) ----------
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const info = () => store.get('public/info');
const slotsOn = date => Object.fromEntries([...store].filter(([k, v]) => k.startsWith('slots/') && v.date === date).map(([k, v]) => [k.slice(6), v]));
function publicView(id) {
  const a = store.get('appointments/' + id), I = info(), pol = policyOf(I), now = Date.now();
  const startAt = startMs(a.date, a.time), services = (a.serviceIds || []).map(s => I.services.find(x => x.id === s)).filter(Boolean);
  return {
    id, code: a.code, status: a.status, date: a.date, time: a.time, startAt, mins: a.mins, barberId: a.barberId,
    barberName: (I.barbers.find(b => b.id === a.barberId) || {}).name || '', serviceIds: a.serviceIds,
    services: services.map(s => ({ name: s.name, price: s.price, priceFrom: !!s.priceFrom })), name: a.name,
    deposit: { ...(a.deposit || { amount: pol.deposit, status: 'unpaid' }) }, holdUntil: a.holdUntil || 0, checkoutUrl: '',
    canReschedule: a.status === 'booked' && startAt - now >= pol.rescheduleHours * 3600e3 && (a.reschedules || 0) < pol.maxReschedules,
    canCancel: a.status === 'booked' && startAt > now,
    policy: { deposit: pol.deposit, rescheduleHours: pol.rescheduleHours, lateMinutes: pol.lateMinutes, holdMinutes: pol.holdMinutes }
  };
}
function byToken(d) { const a = store.get('appointments/' + (d && d.id)); if (!a || a.token !== d.token) fail('not-found', 'Booking not found. Check the link in your email.'); return a; }
const FUNCS = {
  createBooking(d) {
    const I = info(), pol = policyOf(I);
    if (!String(d.name || '').trim()) fail('invalid-argument', 'Enter your name.');
    if (String(d.phone || '').replace(/\D/g, '').length < 10) fail('invalid-argument', 'Enter a valid mobile number, like 0917 123 4567.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(d.email || '').trim())) fail('invalid-argument', 'Enter a valid email address.');
    if (!d.consent) fail('invalid-argument', 'Please agree to the booking policy.');
    const services = (d.serviceIds || []).map(s => I.services.find(x => x.id === s)).filter(Boolean);
    if (!services.length) fail('invalid-argument', 'Pick at least one service.');
    const t = availableTimes(I, { services, date: d.date, barberId: d.barberId }, slotsOn(d.date)).find(x => x.time === d.time);
    if (!t || !t.barbers.length) fail('already-exists', 'Sorry, that time was just taken. Please pick another time.');
    const id = 'b' + Date.now().toString(36), token = Math.random().toString(36).slice(2, 14);
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    store.set('appointments/' + id, {
      code, token, source: 'online', status: 'booked', notify: true, name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim(), notes: d.notes || '', customerId: '',
      serviceIds: services.map(s => s.id), mins: sum(services, s => s.mins), date: d.date, time: d.time, startAt: startMs(d.date, d.time), barberId: t.barbers[0],
      deposit: { amount: pol.deposit, status: 'paid', method: 'gcash' }, reminders: {}, reschedules: 0, createdAt: Date.now()
    });
    afterWrite('appointments/' + id);
    return { id, token, checkoutUrl: `booking.html?id=${id}&t=${token}&paid=1` };
  },
  getBooking(d) {
    const a = byToken(d), I = info(), every = Math.max(0, parseInt(I.shop.loyaltyEvery, 10) || 0);
    let cid = a.customerId;
    if (!cid && a.phone) { const key = String(a.phone).replace(/\D/g, '').replace(/^63/, '0'); const c = [...store].find(([k, v]) => k.startsWith('customers/') && v.phoneKey === key); cid = c ? c[0].split('/')[1] : ''; }
    const visits = cid ? [...store].filter(([k, v]) => k.startsWith('sales/') && v.customerId === cid).length : 0;
    return { ...publicView(d.id), loyalty: every ? { every, visits, nextFree: (visits + 1) % every === 0 } : null };
  },
  joinWaitlist(d) {
    const phone = String(d.phone || '').replace(/\D/g, '').replace(/^63/, '0');
    if (!String(d.name || '').trim()) fail('invalid-argument', 'Enter your name.');
    if (!/^09\d{9}$/.test(phone)) fail('invalid-argument', 'Enter a valid mobile number, like 0917 123 4567.');
    if (!d.consent) fail('invalid-argument', 'Please agree to be contacted about this.');
    const mine = [...store].filter(([k, v]) => k.startsWith('waitlist/') && v.phoneKey === phone && v.status === 'waiting');
    if (mine.some(([, v]) => v.date === d.date)) fail('already-exists', 'You’re already on the waitlist for that day.');
    store.set('waitlist/w' + Date.now().toString(36), { name: d.name.trim(), phone, phoneKey: phone, email: String(d.email || '').trim(), date: d.date, window: d.window || 'any', barberId: d.barberId || '', serviceIds: d.serviceIds || [], status: 'waiting', createdAt: Date.now() });
    changed(); return { ok: true };
  },
  sendTrimReminder(d) {
    const k = 'customers/' + d.customerId, c = store.get(k); if (!c) fail('not-found', 'Client not found.');
    store.set(k, { ...c, rebookSentFor: d.lastVisit, rebookSentAt: Date.now() }); changed();
    return { sms: !!c.phone, email: !!c.email };
  },
  rescheduleBooking(d) {
    const a = byToken(d), I = info();
    if (!publicView(d.id).canReschedule) fail('failed-precondition', `Bookings can only be moved up to ${policyOf(I).rescheduleHours} hours before the appointment.`);
    const services = a.serviceIds.map(s => I.services.find(x => x.id === s)).filter(Boolean);
    const t = availableTimes(I, { services, date: d.date, barberId: d.barberId, ignoreBookingId: d.id }, slotsOn(d.date)).find(x => x.time === d.time);
    if (!t || !t.barbers.length) fail('already-exists', 'That time is taken. Please pick another.');
    store.set('appointments/' + d.id, { ...a, date: d.date, time: d.time, startAt: startMs(d.date, d.time), barberId: t.barbers[0], reschedules: (a.reschedules || 0) + 1, reminders: {} });
    afterWrite('appointments/' + d.id);
    return publicView(d.id);
  },
  cancelBooking(d) {
    const a = byToken(d);
    if (!publicView(d.id).canCancel) fail('failed-precondition', 'This booking can’t be cancelled online. Please call the shop.');
    store.set('appointments/' + d.id, { ...a, status: 'cancelled', cancelledBy: 'customer', deposit: { ...a.deposit, status: 'kept' } });
    afterWrite('appointments/' + d.id);
    return publicView(d.id);
  }
};
export async function call(name, data) {
  await new Promise(r => setTimeout(r, 400));
  if (!FUNCS[name]) fail('not-found', 'Unknown function');
  return FUNCS[name](data || {});
}

// ---------- sign-in (demo owner is signed in by default) ----------
const authFns = new Set();
let user = null;
try { user = localStorage.getItem(USER_KEY) === 'out' ? null : { uid: 'demo', email: 'owner@demo.realbarbers' }; } catch (_) { user = { uid: 'demo', email: 'owner@demo.realbarbers' }; }
export function onAuth(fn) { authFns.add(fn); setTimeout(() => fn(user), 0); return () => authFns.delete(fn); }
export async function login(email) { user = { uid: 'demo', email: email || 'owner@demo.realbarbers' }; try { localStorage.setItem(USER_KEY, 'in'); } catch (_) {} authFns.forEach(f => f(user)); }
export async function logout() { user = null; try { localStorage.setItem(USER_KEY, 'out'); } catch (_) {} authFns.forEach(f => f(null)); }
export async function resetPassword() {}

// ---------- photos (demo: kept as small data URLs in this browser) ----------
export async function uploadImage(blob) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  return { url, path: '' };
}
export async function deleteImage() {}
