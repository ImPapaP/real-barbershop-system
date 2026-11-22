// Demo backend: same interface as firebase-backend.js, but everything lives in this browser's localStorage.
// Used for the live preview before Firebase is connected. Payments are skipped; bookings confirm instantly.
import {
  windowOfTime, STARTER, STARTER_STAFF, STARTER_PRODUCTS, publicBarber, comboError, commissionFor, isServiceStaff, rebookLink, slotId, blockTimes, isActiveSlot, availableTimes, policyOf,
  startMs, phNow, addDays, sum, promoCheck, cleanCode, cleanBday, queueItems, accountView, depositFor, cleanOptions, withOption, lateLimit, refundOnCancel,
  lateFine, lateRateOf, shiftStartOf, roleOf, ACCESS, CLOCK_START
} from './shared.js';

// The saved demo is keyed by a fingerprint of the starter data, so changing the menu or team
// (or a browser briefly mixing old and new files) never leaves stale sample data behind.
const SEED_REV = 31; // bump when seed() itself changes
const fingerprint = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const KEY = `rb-demo-${SEED_REV}-${fingerprint(JSON.stringify([STARTER, STARTER_STAFF]))}`, USER_KEY = 'rb-demo-user';
try { Object.keys(localStorage).filter(k => k.startsWith('rb-demo-') && k !== KEY && k !== USER_KEY).forEach(k => localStorage.removeItem(k)); } catch (_) {}
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const listeners = new Set();
let store = new Map();
store = load() || seed();
queueMicrotask(() => { try { writeQueue(); } catch (_) {} });
save();

function load() { try { const s = localStorage.getItem(KEY); return s ? new Map(JSON.parse(s)) : null; } catch (_) { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify([...store])); } catch (_) {} }
function changed() { save(); queueMicrotask(() => listeners.forEach(f => f())); }
window.addEventListener('storage', e => { if (e.key === KEY) { store = load() || store; listeners.forEach(f => f()); } });
export function resetDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem('lastBooking'); } catch (_) {} location.reload(); }

// ---------- sample data ----------
// Neutral placeholder for the sample payment screenshot (a real one is the customer's own phone screenshot).
function sampleProof() { return 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><rect width="360" height="640" fill="#eef1f4"/><rect x="24" y="60" width="312" height="300" rx="16" fill="#fff"/><text x="180" y="120" font-family="Arial" font-size="18" fill="#555" text-anchor="middle">Sample payment screenshot</text><text x="180" y="190" font-family="Arial" font-size="40" font-weight="700" fill="#111" text-anchor="middle">PHP 200.00</text><text x="180" y="240" font-family="Arial" font-size="15" fill="#555" text-anchor="middle">Sent to 0966 368 7856</text><text x="180" y="270" font-family="Arial" font-size="15" fill="#555" text-anchor="middle">Ref. No. 5012 345 678</text><text x="180" y="320" font-family="Arial" font-size="13" fill="#888" text-anchor="middle">Demo only</text></svg>`); }
function seed() {
  const m = new Map(), T = phNow().date, day = n => addDays(T, n);
  let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  m.set('public/info', { ...clone(STARTER), policy: { ...STARTER.policy, onlineBooking: true }, barbers: STARTER_STAFF.filter(isServiceStaff).map(b => publicBarber({ ...b, off: b.id === 'vince' ? [day(5), day(6)] : [] })),
    products: STARTER_PRODUCTS.map((p, i) => ({ id: 'i' + (i + 1), name: p.name, price: p.price || 0, desc: `${p.size} · ${p.desc}`, photo: p.photo, tag: p.tag, inStock: true })),
    happenings: [ // samples so the demo shows the Promos & events section
      { id: 'h_s1', kind: 'promo', title: 'First visit? ₱50 off your cut', text: 'New to REAL Barbers? Use the code when you book online and get ₱50 off your first haircut.', start: '', end: day(30), code: 'WELCOME50', badge: '₱50 OFF', sample: true },
      { id: 'h_s2', kind: 'event', title: 'December: open every day', text: 'We’re open daily from 9 AM to 8 PM all December. Book early for the holidays, slots fill up fast.', start: '', end: day(45), sample: true }
    ] });
  // sample leave: Mac unpaid two days last week, Vince paid leave next week (the website hides those days for him)
  m.set('leaves/l1', { staffId: 'mac', from: day(-6), to: day(-5), paid: false, note: 'Family emergency', at: Date.now() });
  m.set('leaves/l2', { staffId: 'vince', from: day(5), to: day(6), paid: true, note: 'Vacation', at: Date.now() });
  // demo sign-ins: Alex (owner), Airyl (receptionist) and two barbers who see only their own day and pay
  const LOGINS = { alex: ['demo', 'owner'], airyl: ['u_airyl', 'desk'], lyndon: ['u_lyndon', 'staff'], vince: ['u_vince', 'staff'] };
  Object.entries(LOGINS).forEach(([id, [uid, role]]) => m.set('admins/' + uid, { role, staffId: id, name: STARTER_STAFF.find(b => b.id === id).name, email: `${id}@demo.realbarbers` }));
  STARTER_STAFF.forEach(({ id, ...b }) => { const L = LOGINS[id], a = L ? { login: { uid: L[0], email: `${id}@demo.realbarbers`, role: L[1] } } : {}; m.set('staff/' + id, { ...b, since: day(-65), ...a }); });
  m.set('private/pin', { pin: '1234' }); // demo only: the real PIN is stored hashed by the server
  m.set('private/clock', { key: 'demo-clock' });
  // a few sample activity-log entries (the real log fills itself as people use the dashboard)
  [[-1, '09:12', 'u_airyl', 'Airyl', 'desk', 'sale', 'Rang up ₱399 for Carlo Mendoza · Reymart · GCash'], [-1, '11:40', 'u_airyl', 'Airyl', 'desk', 'pin', 'Owner PIN entered: void a sale'], [-1, '11:41', 'u_airyl', 'Airyl', 'desk', 'void', 'Voided a ₱299 sale for a walk-in (11:20 AM, Mac, Cash)'],
    [-1, '15:05', 'demo', 'Alex', 'owner', 'money', 'Added expense: Supplies – blades and talc ₱850 (Cash)'], [-1, '20:32', 'u_airyl', 'Airyl', 'desk', 'close', 'Cash count: counted ₱8,650, expected ₱8,700 (short ₱50)'],
    [-2, '18:10', 'demo', 'Alex', 'owner', 'staff', 'Changed Jay\'s pay: ₱500 a day minimum, or 35% → ₱500 a day minimum, or 40%'], [-2, '19:00', 'demo', 'Alex', 'owner', 'clock', 'Changed Renz\'s time: excused ₱15 late deduction (traffic, accident on Sumulong)']]
    .forEach(([n, hm, by, who, role, kind, text], i) => m.set('activity/s' + i, { at: startMs(day(n), hm), by, who, role, kind, text, sample: true }));
  // time clock: the last 12 days (and this morning), mostly on time, a few late
  { const now = phNow(), pol0 = policyOf(STARTER);
    for (let n = -12; n <= 0; n++) {
      const dt = day(n);
      STARTER_STAFF.forEach(b => {
        if ((b.id === 'mac' && (n === -6 || n === -5)) || rnd() < 0.08) return; // leave / day off
        if (n === 0 && (now.time < '09:05' || ['jay', 'luz'].includes(b.id))) return; // not in yet
        const start = shiftStartOf(b, pol0), r0 = rnd(), late = r0 < 0.18 ? 1 + Math.floor(rnd() * 40) : 0, early = late ? 0 : Math.floor(rnd() * 25);
        const inMin = 9 * 60 + late - early, inHM = `${String(Math.floor(inMin / 60)).padStart(2, '0')}:${String(inMin % 60).padStart(2, '0')}`, L = lateFine(inHM, start, lateRateOf(b));
        const outMin = 20 * 60 + Math.floor(rnd() * 20), outHM = `${Math.floor(outMin / 60)}:${String(outMin % 60).padStart(2, '0')}`;
        m.set(`timeclock/${dt}_${b.id}`, { date: dt, staffId: b.id, in: startMs(dt, inHM), inHM, start, lateMin: L.mins, fine: L.fine, rate: lateRateOf(b), ...(n < 0 ? { out: startMs(dt, outHM), outHM } : {}) });
      });
    } }
  const svc = STARTER.services, him = svc.filter(s => s.group === 'him'), her = svc.filter(s => s.group === 'her');
  const names = ['Marco Reyes', 'Jericho Santos', 'Carlo Mendoza', 'Rafael Cruz', 'Joshua Villanueva', 'Kevin Ramos', 'Miguel Torres', 'Andrea Cruz', 'Bea Lim', 'Dennis Aquino'];
  const bd = n => day(n).slice(5); // sample birthdays: today, in 4 days, in 10 days
  names.forEach((n, i) => m.set(`customers/c${i}`, { name: n, phone: `09170000${String(100 + i)}`, phoneKey: `09170000${String(100 + i)}`, email: '', notes: i === 0 ? '#2 sides, scissor top' : '', createdAt: Date.now() - (90 - i * 7) * 864e5, ...({ 0: { birthday: bd(0) }, 3: { birthday: bd(4) }, 8: { birthday: bd(10) } }[i] || {}) }));
  // sample coupons: Marco has one ready, Jericho used one last week
  m.set('customers/c0', { ...m.get('customers/c0'), coupons: [{ id: 'cpdemo1', kind: 'amount', value: 100, note: 'Sorry for the long wait last visit', expires: day(30), at: Date.now() - 3 * 864e5, by: 'Alex', used: false }] });
  m.set('customers/c1', { ...m.get('customers/c1'), coupons: [{ id: 'cpdemo2', kind: 'percent', value: 20, note: 'Thank you for referring a friend', expires: '', at: Date.now() - 12 * 864e5, by: 'Airyl', used: true, usedAt: Date.now() - 6 * 864e5 }] });
  const RATE = Object.fromEntries(STARTER_STAFF.map(b => [b.id, b.rate])), SB = Object.fromEntries(STARTER_STAFF.map(b => [b.id, b]));
  const COMM = (b, s) => commissionFor(SB[b], [{ kind: 'service', ref: s.id, price: s.price, qty: 1 }], 0, id => svc.find(x => x.id === id)).commission;
  let n = 0; const earned = {}; // barber -> day -> commission + tips, for the seeded weekly payouts
  for (let i = -62; i <= -1; i++) {
    const d = day(i), dw = new Date(d + 'T00:00:00').getDay(), wkend = dw === 0 || dw === 6;
    const cnt = wkend ? 70 + Math.floor(rnd() * 14) : dw === 5 ? 48 + Math.floor(rnd() * 10) : 24 + Math.floor(rnd() * 10); // weekends are packed, weekdays quieter
    // busier afternoons, and on weekends 2–7 PM is the rush
    const HW = wkend ? [1, 2, 3, 4, 4, 9, 12, 14, 14, 12, 5] : dw === 5 ? [1, 2, 3, 4, 4, 5, 6, 8, 9, 8, 5] : [3, 4, 5, 6, 5, 4, 4, 5, 6, 5, 3];
    const hourPick = () => { let t = rnd() * HW.reduce((x, y) => x + y, 0); for (let h = 0; h < HW.length; h++) { t -= HW[h]; if (t <= 0) return 9 + h; } return 18; };
    for (let k = 0; k < cnt; k++) {
      const forHer = rnd() < 0.18, regular = rnd() < 0.5, s = forHer ? pick(her) : regular ? pick(him.filter(x => x.tier === 'regular')) : (rnd() < 0.6 ? svc[0] : pick(him.filter(x => x.tier === 'deluxe')));
      const b = forHer ? 'dave' : s.tier === 'regular' ? pick(['ed', 'renz', 'jay', 'vince', 'mac']) : pick(['reymart', 'lyndon', 'rod', 'angelo']);
      const ci = rnd() < 0.35 && i > -26 ? Math.floor(rnd() * 6) : -1; // clients 6-9 last came 4-5 weeks ago (see below)
      const tip = rnd() < 0.2 ? pick([20, 50, 100]) : 0, dep = rnd() < 0.45 ? 200 : 0;
      const prod = null; // product prices aren't set yet
      const lines = [{ kind: 'service', ref: s.id, name: s.name, price: s.price, qty: 1 }, ...(prod ? [prod] : [])];
      const pt = prod ? prod.price : 0;
      m.set(`sales/x${n++}`, { date: d, time: `${String(hourPick()).padStart(2, '0')}:${rnd() < 0.5 ? '00' : '30'}`, at: Date.now() + i * 864e5,
        customerId: ci >= 0 ? `c${ci}` : '', name: ci >= 0 ? names[ci] : 'Walk-in', barberId: b, lines, svcTotal: s.price, prodTotal: pt, discount: 0, tip,
        total: s.price + pt + tip, depositCredit: dep, method: pick(['Cash', 'Cash', 'GCash', 'Maya']), rate: RATE[b], commission: COMM(b, s) });
      ((earned[b] = earned[b] || {})[i] = (earned[b][i] || 0) + COMM(b, s) + tip);
    }
    // nails (Luz and Liza: ₱500 a day or 40%) and braids (Airyl ₱700 + 70%, Lyndon) so the pay plans have something to show
    const nails = svc.filter(x => x.group === 'nails'), braids = svc.filter(x => x.group === 'braids');
    const extra = [...Array(Math.floor(rnd() * 6))].map(() => [pick(nails), pick(['luz', 'liza'])]).concat(rnd() < 0.3 ? [[pick(braids), rnd() < 0.7 ? 'airyl' : 'lyndon']] : []);
    for (const [s, b] of extra) {
      m.set(`sales/x${n++}`, { date: d, time: `${String(10 + Math.floor(rnd() * 8)).padStart(2, '0')}:00`, at: Date.now() + i * 864e5, customerId: '', name: 'Walk-in', barberId: b,
        lines: [{ kind: 'service', ref: s.id, name: s.name, price: s.price, qty: 1 }], svcTotal: s.price, prodTotal: 0, discount: 0, tip: 0, total: s.price, depositCredit: 0, method: pick(['Cash', 'GCash']), rate: RATE[b], commission: COMM(b, s) });
      ((earned[b] = earned[b] || {})[i] = (earned[b][i] || 0) + COMM(b, s));
    }
  }
  // weekly payouts: daily pay for every day in + commission + tips, paid up to the day before each payday
  let from = -40;
  [-33, -26, -19, -12, -5].forEach((payday, w) => {
    STARTER_STAFF.forEach(b => {
      let amt = 0; for (let i = from; i < payday; i++) { const e = (earned[b.id] || {})[i] || 0; amt += b.payType === 'monthly' ? (b.monthlyPay || 0) / 30 + e : b.payType === 'quota' ? Math.max(b.dailyPay || 0, e) : (b.dailyPay || 0) + e; }
      if (amt) m.set(`payouts/w${w}_${b.id}`, { barberId: b.id, amount: Math.round(amt * 100) / 100, date: day(payday), note: `Week of ${day(from)}`, createdAt: Date.now() + payday * 864e5 });
    });
    from = payday;
  });
  // a few regulars last seen 4-5 weeks ago, so "Due for a trim" has people in it
  [[6, -29], [7, -31], [8, -33], [9, -36], [6, -60], [8, -64]].forEach(([ci, d], k) => m.set(`sales/r${k}`, { date: day(d), time: '15:00', at: Date.now() + d * 864e5, customerId: `c${ci}`, name: names[ci], barberId: 'lyndon',
    lines: [{ kind: 'service', ref: 'h1', name: 'Deluxe Haircut', price: 399, qty: 1 }], svcTotal: 399, prodTotal: 0, discount: 0, tip: 0, total: 399, depositCredit: 0, method: 'Cash', rate: 50, commission: 199 }));
  [['e1', day(-18), 'Rent', 'Shop rent', 25000, 'Bank transfer'], ['e2', day(-12), 'Electricity', 'Meralco bill', 6200, 'GCash'], ['e3', day(-9), 'Water', 'Water bill', 780, 'GCash'],
   ['e4', day(-6), 'Supplies', 'Blades, neck strips, alcohol', 1450, 'Cash'], ['e5', day(-3), 'Stock purchase', 'Liquid Pomade ×12', 3000, 'Cash'], ['e6', day(-1), 'Payment fees', 'PayMongo fees', 380, 'Bank transfer']]
    .forEach(([id, date, cat, desc, amount, method]) => m.set('expenses/' + id, { date, cat, desc, amount, method }));
  STARTER_PRODUCTS.forEach((p, i) => m.set('inventory/i' + (i + 1), { name: p.name, cat: 'Retail', stock: [3, 12, 7][i], reorder: 4, cost: 0, price: p.price || 0, unit: p.unit, log: [],
    web: true, webDesc: `${p.size} · ${p.desc}`, webTag: p.tag, photo: p.photo }));
  [['i4', 'Razor blades (100 pcs)', 'Supply', 1, 2, 450, 0, 'boxes'], ['i5', 'Neck strips', 'Supply', 14, 5, 60, 0, 'rolls'], ['i6', 'Aloe vera gel', 'Supply', 4, 2, 180, 0, 'tubs']]
    .forEach(([id, name, cat, stock, reorder, cost, price, unit]) => m.set('inventory/' + id, { name, cat, stock, reorder, cost, price, unit, log: [] }));
  const appts = [
    [day(0), '10:00', 'reymart', ['h1'], 'online', 'booked', 0], [day(0), '11:00', 'lyndon', ['p1'], 'online', 'booked', 1],
    [day(0), '13:00', 'dave', ['f2', 'f3'], 'online', 'booked', 7], [day(0), '15:00', 'rod', ['h1', 'h5'], 'phone', 'booked', 5],
    [day(0), '17:00', 'angelo', ['h1', 'h2'], 'online', 'booked', 3], [day(0), '12:00', 'mac', ['h9'], 'online', 'booked', 9], [day(1), '16:00', 'ed', ['h8', 'h6'], 'phone', 'booked', 0], [day(0), '14:00', 'renz', ['h9'], 'online', 'booked', 2], [day(0), '16:00', 'vince', ['h8'], 'phone', 'booked', 4], [day(1), '10:00', 'reymart', ['h1'], 'online', 'booked', 2],
    [day(1), '11:00', 'reymart', ['p2'], 'online', 'booked', 6], [day(1), '14:00', 'lyndon', ['h1'], 'phone', 'booked', 4],
    [day(2), '16:00', 'dave', ['f9'], 'online', 'booked', 8]
  ];
  appts.forEach(([date, time, barberId, serviceIds, source, status, ci], i) => {
    const id = `a${i}`;
    m.set('appointments/' + id, { date, time, startAt: startMs(date, time), barberId, serviceIds, mins: 60 * serviceIds.length, source, status, name: names[ci], phone: `09170000${100 + ci}`,
      email: '', customerId: `c${ci}`, code: 'DEMO' + (10 + i), token: 'demo' + i, notify: true, reminders: {},
      deposit: source === 'online' ? { amount: 200, status: 'paid', method: pick(['gcash', 'paymaya', 'card']) } : null, createdAt: Date.now() - 864e5 });
  });
  // past bookings: most came, a few clients often don't (they get a no-show risk flag on their next booking)
  { const hist = { 3: ['noshow', 'done', 'noshow', 'done'], 5: ['noshow', 'done', 'done', 'done'], 9: ['noshow', 'noshow', 'done'] };
    for (let ci = 0; ci < 10; ci++) (hist[ci] || ['done', 'done', 'done']).forEach((st, k) => { const date = day(-7 * (k + 1) - (ci % 3)), time = `${10 + (ci % 8)}:00`;
      m.set(`appointments/h${ci}_${k}`, { date, time, startAt: startMs(date, time), barberId: ['reymart', 'lyndon', 'renz', 'angelo', 'ed', 'rod', 'dave', 'dave', 'dave', 'mac'][ci], serviceIds: ['h1'], mins: 60, source: 'online', status: st, name: names[ci], phone: `09170000${100 + ci}`, email: '', customerId: `c${ci}`, code: `H${ci}${k}`, token: `h${ci}${k}`, deposit: { amount: 200, status: st === 'noshow' ? 'kept' : 'paid', method: 'gcash' }, createdAt: startMs(date, time) - 3 * 864e5 }); }); }
  // cash advances (vale)
  { const t = new Date(Date.now() + 8 * 3600e3), dd = t.getUTCDate(), ym = t.toISOString().slice(0, 7), cur = `${ym}-${dd <= 15 ? 1 : 2}`, prevC = dd <= 15 ? `${new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)).toISOString().slice(0, 7)}-2` : `${ym}-1`;
    m.set('advances/v1', { staffId: 'jay', amount: 1000, date: day(-12), parts: 2, start: prevC, note: 'School fees', at: Date.now() - 12 * 864e5, by: 'Alex' });
    m.set('advances/v2', { staffId: 'renz', amount: 500, date: day(-2), parts: 1, start: cur, note: 'Cash from the drawer', at: Date.now() - 2 * 864e5, by: 'Alex' }); }
  // promo codes, a GCash screenshot waiting for the owner to check, a rated visit and a late client
  m.set('promos/REAL10', { code: 'REAL10', kind: 'percent', value: 10, active: true, expires: '', maxUses: 0, uses: 3, note: 'Sample: 10% off for followers' });
  m.set('promos/WELCOME50', { code: 'WELCOME50', kind: 'amount', value: 50, active: true, expires: day(30), maxUses: 100, uses: 12, note: 'Sample: first visit' });
  m.set('appointments/gc1', { date: day(1), time: '13:00', startAt: startMs(day(1), '13:00'), barberId: 'renz', serviceIds: ['h9'], mins: 45, source: 'online', status: 'pending_payment', payMethod: 'gcash',
    name: 'Paolo Garcia', phone: '09171112222', email: 'paolo@example.com', customerId: '', code: 'GC4X7P', token: 'demogc', notify: true, reminders: {}, holdUntil: startMs(day(1), '13:00'),
    deposit: { amount: 200, status: 'unpaid' }, proof: { status: 'review', at: Date.now() - 25 * 60000, ref: '5012 345 678' }, createdAt: Date.now() - 30 * 60000 });
  m.set('proofs/gc1', { apptId: 'gc1', ref: '5012 345 678', at: Date.now() - 25 * 60000, img: sampleProof() });
  m.set('appointments/rt1', { date: day(-2), time: '15:00', startAt: startMs(day(-2), '15:00'), barberId: 'lyndon', serviceIds: ['h1'], mins: 60, source: 'online', status: 'done', name: names[2], phone: '09170000102', email: '', customerId: 'c2', code: 'RT2K9M', token: 'demort', notify: true, reminders: {},
    deposit: { amount: 200, status: 'paid', method: 'gcash' }, rating: { stars: 5, text: 'Sobrang linis ng fade, and Lyndon took his time. Babalik ako!', at: Date.now() - 864e5 }, createdAt: Date.now() - 3 * 864e5 });
  m.set('waitlist/wl1', { name: 'Kevin Ramos', phone: '09170000105', phoneKey: '09170000105', email: '', date: day(1), window: 'morning', barberId: 'reymart', serviceIds: ['h1'], status: 'waiting', createdAt: Date.now() - 3600e3 });
  m.set('appointments/w1', { date: day(0), time: '09:40', source: 'walk-in', status: 'waiting', name: 'Walk-in', queueNo: 1, serviceIds: ['h1'], barberId: '', createdAt: Date.now() - 12 * 60000 });
  { const a = m.get('appointments/a5'); if (a) m.set('appointments/a5', { ...a, late: { mins: 10, at: Date.now() - 5 * 60000 } }); }
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
function afterWrite(path) { const [col, id] = path.split('/'); if (col === 'appointments') { syncSlots(id); writeQueue(); } changed(); }
// Mirrors the server: today's queue without names, for the website's live wait time
function writeQueue() { const info = store.get('public/info'); if (info) store.set('public/queue', queueItems([...store].filter(([k]) => k.startsWith('appointments/')).map(([, v]) => v), info, phNow().date)); }
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
    barberName: a.anyBarber ? '' : (I.barbers.find(b => b.id === a.barberId) || {}).name || '', anyBarber: !!a.anyBarber, serviceIds: a.serviceIds,
    services: services.map(s => withOption(s, a.options)).map(s => ({ name: s.name, price: s.price, priceFrom: !!s.priceFrom })), name: a.name,
    deposit: { ...(a.deposit || { amount: pol.deposit, status: 'unpaid' }) }, holdUntil: a.holdUntil || 0, checkoutUrl: '',
    canReschedule: a.status === 'booked' && startAt - now >= pol.rescheduleHours * 3600e3 && (a.reschedules || 0) < pol.maxReschedules,
    canCancel: a.status === 'booked' && startAt > now,
    policy: { deposit: pol.deposit, rescheduleHours: pol.rescheduleHours, lateMinutes: lateLimit(a, pol), lateMinutesJunior: pol.lateMinutes, lateMinutesDeposit: pol.lateMinutesDeposit ?? 20, cancelHours: pol.cancelHours ?? 48, holdMinutes: pol.holdMinutes },
    payMethod: a.payMethod || 'online', proof: a.proof ? { status: a.proof.status, at: a.proof.at, note: a.proof.note || '' } : null,
    gcash: a.payMethod === 'gcash' ? { number: I.shop.gcashNumber || '', name: I.shop.gcashName || '' } : null,
    promo: a.promo || null, late: a.late || null, rating: a.rating || null, receipt: a.receipt && a.receipt.id ? { id: a.receipt.id, t: a.receipt.t } : null, refPhoto: a.refPhoto ? { at: a.refPhoto.at, note: a.refPhoto.note || '' } : null, groupOf: a.groupOf || '', source: a.source || 'online', gaveToWalkin: !!a.gaveToWalkin
  };
}
function queueFor(a) {
  if (a.source === 'walk-in' && a.status === 'waiting' && a.date === phNow().date) {
    const w = [...store].filter(([k, v]) => k.startsWith('appointments/') && v.date === a.date && v.source === 'walk-in' && v.status === 'waiting').map(([, v]) => v);
    return { walkin: true, queueNo: a.queueNo || 0, ahead: w.filter(x => (x.queueNo || 0) < (a.queueNo || 0)).length, at: Date.now() };
  }
  if (a.status !== 'booked' || a.date !== phNow().date || !a.barberId) return null;
  const rows = [...store].filter(([k, v]) => k.startsWith('appointments/') && v.date === a.date && v.barberId === a.barberId).map(([, v]) => v);
  const mine = startMs(a.date, a.time);
  return { ahead: rows.filter(x => ['booked', 'waiting', 'inchair'].includes(x.status) && startMs(x.date, x.time || '00:00') < mine).length, inChair: rows.some(x => x.status === 'inchair'), at: Date.now() };
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
    const combo = comboError(I, services); if (combo) fail('invalid-argument', combo);
    const t = availableTimes(I, { services, date: d.date, barberId: d.barberId }, slotsOn(d.date)).find(x => x.time === d.time);
    if (!t || !t.barbers.length) fail('already-exists', 'Sorry, that time was just taken. Please pick another time.');
    // "Any barber": hold the chair of whoever has the fewest visits that day; the shop assigns the barber later
    const load = b => [...store].filter(([k, v]) => k.startsWith('appointments/') && v.date === d.date && v.barberId === b && !['cancelled', 'expired', 'noshow'].includes(v.status)).length;
    const mainB = d.barberId ? t.barbers[0] : [...t.barbers].sort((x, y) => load(x) - load(y))[0];
    const manual = d.payMethod === 'gcash' && !!I.shop.gcashNumber;
    // Book for two: same services, a second barber at the same time or the same barber right after
    let guest = null;
    if (d.guest) {
      if (!String(d.guest.name || '').trim()) fail('invalid-argument', 'Second person: enter their name.');
      const gsv = (d.guest.serviceIds && d.guest.serviceIds.length ? d.guest.serviceIds.map(s => I.services.find(x => x.id === s)).filter(Boolean) : services);
      if (!gsv.length) fail('invalid-argument', 'Second person: pick at least one service.');
      const gc = comboError(I, gsv); if (gc) fail('invalid-argument', 'Second person: ' + gc);
      const gd = d.guest.date || d.date;
      const gt = availableTimes(I, { services: gsv, date: gd, barberId: d.guest.barberId || '' }, slotsOn(gd)).find(x => x.time === d.guest.time);
      const mb = blockTimes(d.time, sum(services, s => s.mins), pol.step), gbl = blockTimes(d.guest.time, sum(gsv, s => s.mins), pol.step);
      const overlaps = gd === d.date && gbl.some(x => mb.includes(x));
      const gb = gt && gt.barbers.find(b => !(overlaps && b === mainB));
      if (!gb) fail('already-exists', 'Sorry, the second person’s slot was just taken. Pick another option for them.');
      guest = { name: d.guest.name.trim(), date: gd, time: d.guest.time, barberId: gb, services: gsv };
    }
    let promo = null;
    const pc = cleanCode(d.promo);
    if (pc) {
      const r = promoCheck(store.get('promos/' + pc), sum([...services, ...(guest ? guest.services : [])], s => s.price), phNow().date);
      if (!r.ok) fail('invalid-argument', r.error);
      promo = { code: pc, off: r.off, label: r.label };
      const p = store.get('promos/' + pc); store.set('promos/' + pc, { ...p, uses: (p.uses || 0) + 1 });
    }
    const id = 'b' + Date.now().toString(36), token = Math.random().toString(36).slice(2, 14);
    const gid = guest ? id + 'g' : '';
    const holdUntil = Date.now() + Math.max(pol.holdMinutes, 30) * 60e3;
    // no down payment for junior barbers (same rule as the server)
    const depMain = depositFor(I, d.barberId || '', services);
    const depGuest = !guest ? 0 : d.guest.sameClient ? (depMain ? 0 : depositFor(I, d.guest.barberId || '', guest.services)) : depositFor(I, d.guest.barberId || '', guest.services);
    const free = depMain + depGuest === 0;
    const st = free ? { status: 'booked', payMethod: 'none' } : manual ? { status: 'pending_payment', payMethod: 'gcash', holdUntil } : { status: 'booked', payMethod: 'online' };
    const depOf = amt => !amt ? { amount: 0, status: 'none' } : manual ? { amount: amt, status: 'unpaid' } : { amount: amt, status: 'paid', method: 'gcash' };
    const dep = depOf(depMain);
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    store.set('appointments/' + id, {
      code, token, source: 'online', ...st, ...(promo ? { promo } : {}), notify: true, name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim(), notes: d.notes || '', customerId: '', ...(cleanBday(d.birthday) ? { birthday: cleanBday(d.birthday) } : {}),
      serviceIds: services.map(s => s.id), options: cleanOptions(I, services.map(s => s.id), d.options), mins: Math.max(pol.step, sum(services, s => s.mins ?? pol.step)), date: d.date, time: d.time, startAt: startMs(d.date, d.time), barberId: mainB, ...(d.barberId ? {} : { anyBarber: true }),
      deposit: dep, reminders: {}, reschedules: 0, createdAt: Date.now(), guests: gid ? [gid] : []
    });
    if (guest) store.set('appointments/' + gid, {
      code: code.slice(0, 5) + '2', token: Math.random().toString(36).slice(2, 14), source: 'online', ...st, notify: false, groupOf: id, bookedBy: d.name.trim(), ...(d.guest.sameClient ? { addOnOf: id } : {}),
      name: guest.name, phone: d.phone.trim(), email: d.email.trim(), notes: d.notes || '', customerId: '',
      serviceIds: guest.services.map(s => s.id), options: cleanOptions(I, guest.services.map(s => s.id), d.options), mins: Math.max(pol.step, sum(guest.services, s => s.mins ?? pol.step)), date: guest.date, time: guest.time, startAt: startMs(guest.date, guest.time), barberId: guest.barberId, ...(d.guest.barberId ? {} : { anyBarber: true }),
      deposit: depGuest ? { ...depOf(depGuest), ...(manual ? {} : { paidWith: id }) } : d.guest.sameClient && depMain ? { amount: 0, status: dep.status, paidWith: id } : { amount: 0, status: 'none' }, reminders: {}, reschedules: 0, createdAt: Date.now()
    });
    afterWrite('appointments/' + id); if (guest) afterWrite('appointments/' + gid);
    return { id, token, checkoutUrl: `booking.html?id=${id}&t=${token}${free ? '&booked=1' : manual ? '' : '&paid=1'}` };
  },
  getBooking(d) {
    const a = byToken(d), I = info(), every = Math.max(0, parseInt(I.shop.loyaltyEvery, 10) || 0);
    let cid = a.customerId;
    if (!cid && a.phone) { const key = String(a.phone).replace(/\D/g, '').replace(/^63/, '0'); const c = [...store].find(([k, v]) => k.startsWith('customers/') && v.phoneKey === key); cid = c ? c[0].split('/')[1] : ''; }
    const visits = cid ? [...store].filter(([k, v]) => k.startsWith('sales/') && v.customerId === cid).length : 0;
    const guests = (a.guests || []).map(gid => { const g = store.get('appointments/' + gid); return g && { id: gid, token: g.token, name: g.name, status: g.status, date: g.date, time: g.time, barberName: g.anyBarber ? '' : (I.barbers.find(b => b.id === g.barberId) || {}).name || '', services: (g.serviceIds || []).map(s => I.services.find(x => x.id === s)).filter(Boolean).map(x => withOption(x, g.options).name), addOn: !!g.addOnOf, prices: (g.serviceIds || []).map(s => I.services.find(x => x.id === s)).filter(Boolean).map(x => { const o = withOption(x, g.options); return { name: o.name, price: o.price, priceFrom: !!x.priceFrom }; }) }; }).filter(Boolean);
    const cut = store.get('cuts/' + d.id);
    return { ...publicView(d.id), loyalty: every ? { every, visits, nextFree: (visits + 1) % every === 0 } : null, guests, rebook: rebookLink('.', a, I), queue: queueFor(a), cutPhoto: a.status === 'done' && cut ? cut.img : '' };
  },
  checkPromo(d) {
    const I = info(), code = cleanCode(d.code); if (!code) fail('invalid-argument', 'Type a promo code.');
    const total = sum([...(d.serviceIds || []), ...(d.guestServiceIds || [])].map(s => I.services.find(x => x.id === s)).filter(Boolean), s => s.price);
    const r = promoCheck(store.get('promos/' + code), total, phNow().date);
    if (!r.ok) fail('invalid-argument', r.error);
    return { code, off: r.off, label: r.label };
  },
  // ----- staff sign-ins, owner PIN, time clock, day summary (mirror functions/index.js) -----
  staffLogin(d, u) {
    const me = adminDoc(u); if (!me || !isBossNow(u) || roleOf(me) !== 'owner') fail('permission-denied', 'Only the owner can manage sign-ins.');
    const k = 'staff/' + d.staffId, b = store.get(k); if (!b) fail('not-found', 'Staff member not found.');
    if (d.remove) { if (b.login) store.delete('admins/' + b.login.uid); const { login, ...rest } = b; store.set(k, rest); actLog(u, 'login', `Removed ${b.name}'s sign-in`); changed(); return { ok: true }; }
    const email = String(d.email || '').trim().toLowerCase(), role = ACCESS[d.role] ? d.role : 'staff';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('invalid-argument', 'Enter a valid email.');
    if ((!b.login || d.password) && String(d.password || '').length < 8) fail('invalid-argument', 'The password needs at least 8 characters.');
    const taken = [...store].find(([key, v]) => key.startsWith('admins/') && v.email === email && (!b.login || key !== 'admins/' + b.login.uid));
    if (taken) fail('failed-precondition', 'That email already has a sign-in.');
    const uid = (b.login && b.login.uid) || 'u_' + d.staffId;
    store.set('admins/' + uid, { role, staffId: d.staffId, name: b.name, email }); store.set(k, { ...b, login: { uid, email, role } });
    actLog(u, 'login', `${b.login ? 'Changed' : 'Gave'} ${b.name} a sign-in (${ACCESS[role]})`); changed(); return { ok: true, uid };
  },
  setPin(d, u) {
    const me = adminDoc(u); if (!me || roleOf(me) !== 'owner') fail('permission-denied', 'Only the owner can set the PIN.');
    if (!/^\d{4}$/.test(String(d.pin || ''))) fail('invalid-argument', 'The PIN is 4 digits.');
    store.set('private/pin', { pin: String(d.pin), fails: 0, lockUntil: 0 }); actLog(u, 'pin', 'Changed the owner PIN'); changed(); return { ok: true };
  },
  pinUnlock(d, u) {
    const me = adminDoc(u); if (!me) fail('permission-denied', 'Sign in first.');
    const p = store.get('private/pin'); if (!p) fail('failed-precondition', 'No owner PIN yet. The owner sets it in Shop setup → Owner PIN.');
    const now = Date.now(); if ((p.lockUntil || 0) > now) fail('resource-exhausted', `Too many wrong tries. Try again in ${Math.ceil((p.lockUntil - now) / 60000)} min.`);
    if (String(d.pin || '') !== p.pin) { const fails = (p.fails || 0) + 1; store.set('private/pin', { ...p, fails: fails >= 5 ? 0 : fails, lockUntil: fails >= 5 ? now + 15 * 60e3 : 0 }); actLog(u, 'pin', 'Wrong owner PIN' + (fails >= 5 ? ' (5 tries: locked 15 minutes)' : '')); changed(); fail('permission-denied', fails >= 5 ? 'Too many wrong tries. Locked for 15 minutes.' : 'Wrong PIN.'); }
    const until = now + 12 * 3600e3; store.set('private/pin', { ...p, fails: 0 }); store.set('elevations/' + u.uid, { until, at: now });
    actLog(u, 'pin', `Owner PIN entered${d.why ? ': ' + String(d.why).slice(0, 80) : ''}`); changed(); return { until };
  },
  pinLock(d, u) { if (u) store.delete('elevations/' + u.uid); changed(); return { ok: true }; },
  clockPunch(d, u) {
    const me = adminDoc(u); if (!me || !me.staffId) fail('permission-denied', 'This sign-in isn’t linked to a staff member. Ask the owner.');
    const key = (store.get('private/clock') || {}).key; if (!key || String(d.k || '') !== key) fail('permission-denied', 'This QR code is old. Scan the one at the shop.');
    const b = store.get('staff/' + me.staffId); if (!b) fail('not-found', 'Staff member not found.');
    const pol = policyOf(info()), now = Date.now(), { date, time } = phNow(now), k = `timeclock/${date}_${me.staffId}`, cur = store.get(k);
    if (d.peek) return { name: b.name, state: !cur ? 'out' : cur.out ? 'done' : 'in', rec: cur || null, start: shiftStartOf(b, pol) };
    if (!cur) {
      const start = shiftStartOf(b, pol), rate = lateRateOf(b), L = lateFine(time, start, rate), rec = { date, staffId: me.staffId, in: now, inHM: time, start, lateMin: L.mins, fine: L.fine, rate };
      store.set(k, rec); actLog(u, 'clock', `${b.name} timed in at ${time}${L.mins ? ` (${L.mins} min late, −₱${L.fine})` : ''}`); changed(); return { action: 'in', name: b.name, rec };
    }
    if (cur.out) fail('failed-precondition', `You already timed out at ${cur.outHM}. Ask the owner if this is wrong.`);
    if (now - cur.in < 2 * 60e3) fail('failed-precondition', `You timed in at ${cur.inHM}. Scan again when you leave.`);
    const rec = { ...cur, out: now, outHM: time }; store.set(k, rec); actLog(u, 'clock', `${b.name} timed out at ${time}`); changed(); return { action: 'out', name: b.name, rec };
  },
  sendDaySummary(d, u) {
    const me = adminDoc(u); if (!me || roleOf(me) === 'staff') fail('permission-denied', 'Only the shop can do this.');
    const to = String((info().shop || {}).ownerPhone || '').replace(/\D/g, ''); if (!to) fail('failed-precondition', 'Add the owner’s mobile number in Shop setup → End-of-day summary.');
    actLog(u, 'close', 'Texted the day summary to the owner'); changed(); return { sms: 'demo', to };
  },
  nextReceiptNo() { const r = store.get('private/receipts') || {}, n = Math.max(1, r.next || 1); store.set('private/receipts', { ...r, next: n + 1 }); changed(); return { no: n }; },
  // Client accounts (mirrors the server). In the demo the code is shown on screen instead of texted.
  requestCode(d) {
    const phone = String(d.phone || '').replace(/\D/g, '').replace(/^63/, '0');
    if (!/^09\d{9}$/.test(phone)) fail('invalid-argument', 'Enter your 11-digit mobile number, like 0917 123 4567.');
    const known = [...store].some(([k, v]) => (k.startsWith('appointments/') && String(v.phone || '').replace(/\D/g, '').replace(/^63/, '0') === phone) || (k.startsWith('customers/') && v.phoneKey === phone));
    if (!known) fail('not-found', 'We don’t have any visits for this number yet. Book first, then you can log in.');
    const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    store.set('otp/' + phone, { code, exp: Date.now() + 10 * 60e3, tries: 0 }); changed();
    return { ok: true, demoCode: code };
  },
  verifyCode(d) {
    const phone = String(d.phone || '').replace(/\D/g, '').replace(/^63/, '0'), code = String(d.code || '').replace(/\D/g, ''), o = store.get('otp/' + phone);
    if (!o || o.exp < Date.now()) fail('deadline-exceeded', 'That code has expired. Ask for a new one.');
    if (o.tries >= 5) fail('resource-exhausted', 'Too many wrong tries. Ask for a new code.');
    if (o.code !== code) { store.set('otp/' + phone, { ...o, tries: o.tries + 1 }); fail('permission-denied', 'That code isn’t right. Check the text and try again.'); }
    store.delete('otp/' + phone);
    const session = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    store.set('clientSessions/' + session, { phone, exp: Date.now() + 30 * 864e5 }); changed();
    return { session };
  },
  myAccount(d) {
    const s = store.get('clientSessions/' + String(d.session || ''));
    if (!s || s.exp < Date.now()) fail('unauthenticated', 'Your login has expired. Please log in again.');
    const key = v => String(v || '').replace(/\D/g, '').replace(/^63/, '0'), all = [...store];
    const customers = all.filter(([k, v]) => k.startsWith('customers/') && v.phoneKey === s.phone).map(([k, v]) => ({ id: k.split('/')[1], ...v }));
    const appts = all.filter(([k, v]) => k.startsWith('appointments/') && key(v.phone) === s.phone).map(([k, v]) => ({ id: k.split('/')[1], ...v }));
    const ids = new Set(customers.map(c => c.id));
    const sales = all.filter(([k, v]) => k.startsWith('sales/') && (ids.has(v.customerId) || key(v.phone) === s.phone)).map(([k, v]) => ({ id: k.split('/')[1], ...v }));
    return accountView({ phone: s.phone, customers, appts, sales, info: info(), today: phNow().date });
  },
  logoutClient(d) { store.delete('clientSessions/' + String(d.session || '')); changed(); return { ok: true }; },
  addRefPhoto(d) {
    const a = byToken(d);
    if (!['pending_payment', 'booked', 'waiting'].includes(a.status)) fail('failed-precondition', 'You can only add a photo before your visit.');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(d.image || '') || d.image.length > 900000) fail('invalid-argument', 'Upload a photo (JPG or PNG).');
    const now = Date.now(), note = String(d.note || '').trim().slice(0, 200);
    store.set('refs/' + d.id, { img: d.image, note, at: now, apptId: d.id });
    store.set('appointments/' + d.id, { ...a, refPhoto: { at: now, note } }); afterWrite('appointments/' + d.id);
    return this.getBooking(d);
  },
  removeRefPhoto(d) {
    const a = byToken(d); store.delete('refs/' + d.id);
    const { refPhoto, ...rest } = a; store.set('appointments/' + d.id, rest); afterWrite('appointments/' + d.id);
    return this.getBooking(d);
  },
  submitProof(d) {
    const a = byToken(d), now = Date.now();
    if (a.payMethod !== 'gcash') fail('failed-precondition', 'This booking is paid online.');
    if (a.status !== 'pending_payment') fail('failed-precondition', a.status === 'booked' ? 'This booking is already confirmed.' : 'This booking can’t take a payment anymore. Please book again.');
    if (!(a.proof && a.proof.status === 'review') && (a.holdUntil || 0) < now) fail('deadline-exceeded', 'The time to send your payment ran out and the slot was released. Please book again.');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(d.image || '') || d.image.length > 900000) fail('invalid-argument', 'Upload a screenshot of your GCash payment (JPG or PNG).');
    const ref = String(d.ref || '').replace(/[^\w\s-]/g, '').slice(0, 40), keep = Math.max(a.holdUntil || 0, startMs(a.date, a.time));
    store.set('proofs/' + d.id, { img: d.image, ref, at: now, apptId: d.id });
    store.set('appointments/' + d.id, { ...a, proof: { status: 'review', at: now, ref }, holdUntil: keep });
    afterWrite('appointments/' + d.id);
    for (const gid of a.guests || []) { const g = store.get('appointments/' + gid); if (g) { store.set('appointments/' + gid, { ...g, holdUntil: keep }); afterWrite('appointments/' + gid); } }
    return publicView(d.id);
  },
  syncFacebookNow() { fail('failed-precondition', 'The demo can’t reach Facebook. This works once the site is live and the Page access token is saved.'); },
  joinQueue(d) {
    const I = info(), t = phNow(), h = I.hours.find(x => x.d === t.dow), toM = s => { const [a, b] = String(s).split(':').map(Number); return a * 60 + b; };
    if (!h || h.closed || t.min < toM(h.open) - 15 || t.min > toM(h.close) - 30) fail('failed-precondition', 'The walk-in queue is closed right now. Book online for another day.');
    const name = String(d.name || '').trim(), phone = String(d.phone || '').replace(/\D/g, '').replace(/^63/, '0');
    if (name.length < 2) fail('invalid-argument', 'Enter your name.');
    if (!/^09\d{9}$/.test(phone)) fail('invalid-argument', 'Enter a valid mobile number, like 0917 123 4567.');
    const today = [...store].filter(([k, v]) => k.startsWith('appointments/') && v.date === t.date && v.source === 'walk-in');
    const mine = today.find(([, v]) => v.phone === phone && v.status === 'waiting');
    if (mine) return { id: mine[0].split('/')[1], token: mine[1].token, queueNo: mine[1].queueNo, again: true };
    const queueNo = Math.max(0, ...today.map(([, v]) => v.queueNo || 0)) + 1, id = 'q' + Date.now().toString(36), token = Math.random().toString(36).slice(2, 14);
    store.set('appointments/' + id, { date: t.date, time: `${String(Math.floor(t.min / 60)).padStart(2, '0')}:${String(t.min % 60).padStart(2, '0')}`, source: 'walk-in', status: 'waiting', name, phone,
      serviceIds: (d.serviceIds || []).filter(x => I.services.some(s => s.id === x)), barberId: I.barbers.some(b => b.id === d.barberId) ? d.barberId : '', queueNo, token, code: 'Q' + queueNo, notify: false, fromQr: true, createdAt: Date.now(), ...(cleanBday(d.birthday) ? { birthday: cleanBday(d.birthday) } : {}) });
    afterWrite('appointments/' + id);
    return { id, token, queueNo };
  },
  runningLate(d) {
    const a = byToken(d), pol = policyOf(info()), now = Date.now(), startAt = startMs(a.date, a.time);
    const mins = Math.max(5, Math.min(30, parseInt(d.mins, 10) || 10));
    if (a.status !== 'booked' || now > startAt + 30 * 60e3 || startAt - now > 3 * 3600e3) fail('failed-precondition', 'You can only tell us this on the day, close to your time.');
    store.set('appointments/' + d.id, { ...a, late: { mins, at: now } }); afterWrite('appointments/' + d.id);
    return publicView(d.id);
  },
  // Same as the server's getReceipt: what the client may see of a sale
  getReceipt(d) {
    const s = store.get('sales/' + String(d.id || ''));
    if (!s || !s.rtoken || s.rtoken !== d.t) fail('not-found', 'Receipt not found. Check the link.');
    const I = info(), sh = I.shop || {}, every = Math.max(0, parseInt(sh.loyaltyEvery, 10) || 0);
    const visits = s.customerId ? [...store].filter(([k, v]) => k.startsWith('sales/') && v.customerId === s.customerId).length : 0;
    return { id: d.id, date: s.date, time: s.time, name: s.name && s.name !== 'Walk-in' ? s.name : '', barberName: (I.barbers.find(b => b.id === s.barberId) || {}).name || '',
      lines: (s.lines || []).map(l => ({ name: l.name, qty: Number(l.qty) || 1, price: Number(l.price) || 0 })), discount: s.discount || 0, discountNote: s.discountNote || '', tip: s.tip || 0, total: s.total || 0,
      depositCredit: s.depositCredit || 0, paidAtShop: Math.max(0, (s.total || 0) - (s.depositCredit || 0)), method: s.method || '', cash: s.cash || 0,
      orNo: s.orNo || '', shop: { name: sh.name || '', wordmark: sh.wordmark || '', address: sh.address || '', phone: sh.phone || '', tagline: sh.tagline || '', tin: sh.tin || '', birPermit: sh.birPermit || '' }, loyalty: every && s.customerId ? { every, visits } : null };
  },
  rateVisit(d) {
    const a = byToken(d);
    if (a.status !== 'done') fail('failed-precondition', 'You can rate your visit after your cut.');
    const rating = { stars: Math.max(1, Math.min(5, parseInt(d.stars, 10) || 0)), text: String(d.text || '').trim().slice(0, 400), at: Date.now() };
    store.set('appointments/' + d.id, { ...a, rating }); afterWrite('appointments/' + d.id);
    return FUNCS.getBooking(d);
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
    const refund = refundOnCancel({ ...a, startAt: a.startAt || startMs(a.date, a.time) }, policyOf(info()));
    store.set('appointments/' + d.id, { ...a, status: 'cancelled', cancelledBy: 'customer', deposit: { ...a.deposit, status: refund ? 'refund_due' : a.deposit && a.deposit.status === 'paid' ? 'kept' : (a.deposit || {}).status || 'unpaid' } });
    afterWrite('appointments/' + d.id);
    return publicView(d.id);
  }
};
const adminDoc = u => u && store.get('admins/' + u.uid) ? { uid: u.uid, ...store.get('admins/' + u.uid) } : null;
const isBossNow = u => { const a = adminDoc(u); return !!a && (roleOf(a) === 'owner' || ((store.get('elevations/' + u.uid) || {}).until || 0) > Date.now()); };
function actLog(u, kind, text) { const a = adminDoc(u); store.set('activity/a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), { at: Date.now(), by: (a && a.uid) || 'server', who: (a && (a.name || a.email)) || 'System', role: a ? roleOf(a) : 'system', kind, text }); }
export async function call(name, data) {
  await new Promise(r => setTimeout(r, 400));
  if (!FUNCS[name]) fail('not-found', 'Unknown function');
  return FUNCS[name](data || {}, user);
}

// ---------- sign-in (demo owner is signed in by default) ----------
const authFns = new Set();
let user = null;
// Demo: any password works. An email of one of the demo sign-ins (alex@ owner, airyl@ receptionist, lyndon@, vince@demo.realbarbers, or one
// the owner adds in Staff → Edit → Sign-in) signs in as that person; any other email is the owner.
const demoUser = email => { const e = String(email || '').trim().toLowerCase(), hit = [...store].find(([k, v]) => k.startsWith('admins/') && v.email && v.email === e); return hit ? { uid: hit[0].slice(7), email: e } : { uid: 'demo', email: e || 'alex@demo.realbarbers' }; };
try { const v = localStorage.getItem(USER_KEY); user = v === 'out' ? null : demoUser(v && v !== 'in' ? v : ''); } catch (_) { user = demoUser(''); }
export function onAuth(fn) { authFns.add(fn); setTimeout(() => fn(user), 0); return () => authFns.delete(fn); }
export async function login(email) { user = demoUser(email); try { localStorage.setItem(USER_KEY, user.email); } catch (_) {} authFns.forEach(f => f(user)); }
export async function logout() { user = null; try { localStorage.setItem(USER_KEY, 'out'); } catch (_) {} authFns.forEach(f => f(null)); }
export async function resetPassword() {}

// ---------- photos (demo: kept as small data URLs in this browser) ----------
export async function uploadImage(blob) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  return { url, path: '' };
}
export async function deleteImage() {}
