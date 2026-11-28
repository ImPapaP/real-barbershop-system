// Helpers shared by the website, the booking page and the dashboard.
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DEFAULT_POLICY = { deposit: 200, holdMinutes: 15, rescheduleHours: 48, lateMinutes: 5, lateMinutesDeposit: 20, cancelHours: 48, leadMinutes: 60, bookAheadDays: 60, birthdayDays: 0, juniorStopMins: 120, step: 60, maxReschedules: 2, rebookDays: 28, onlineBooking: true, receiptTexts: true, birthdaySvc: 'h8', birthdayPrice: 249, regularVisits: 3, lastBooking: '19:00', clockStart: '09:00' };

export const $ = (s, r = document) => r.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const sum = (a, f) => a.reduce((t, x) => t + (Number(f(x)) || 0), 0);

// Dates are handled as "YYYY-MM-DD" strings in Philippine time, whatever the visitor's own time zone.
export const TZ = '+08:00';
export function phNow(ms = Date.now()) { const d = new Date(ms + 8 * 3600e3); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), time: d.toISOString().slice(11, 16), dow: d.getUTCDay() }; }
export const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dowOf = date => new Date(`${date}T00:00:00Z`).getUTCDay();
export const startMs = (date, time) => Date.parse(`${date}T${time}:00${TZ}`);
export function fmtTime(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; }
export function fmtDate(s, withYear) { if (!s) return ''; const d = new Date(`${s}T00:00:00Z`); return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ' ' + d.getUTCFullYear() : ''}`; }
export function shortDate(s) { const d = new Date(`${s}T00:00:00Z`); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
export function money(n, cur = '₱', dp = false) {
  const v = Number(n) || 0;
  return (v < 0 ? '−' : '') + cur + Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: dp ? 2 : 0, maximumFractionDigits: 2 });
}
export const priceLabel = (s, cur = '₱') => (s.priceFrom ? 'starts at ' : '') + money(s.price, cur);
export const policyOf = info => ({ ...DEFAULT_POLICY, ...(info && info.policy || {}) });
export const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase();

export function openStatus(info, ms = Date.now()) {
  const now = phNow(ms), h = hoursFor(info, now.date);
  if (h && !h.closed) {
    if (now.min >= toMin(h.open) && now.min < toMin(h.close)) return { open: true, text: `Open now · until ${fmtTime(h.close)}` };
    if (now.min < toMin(h.open)) return { open: false, text: `Opens today at ${fmtTime(h.open)}` };
  }
  for (let i = 1; i <= 7; i++) { const dt = addDays(now.date, i), x = hoursFor(info, dt); if (x && !x.closed) return { open: false, text: `Closed now${h && h.closed && h.label ? ` (${h.label})` : ''} · opens ${i === 1 ? 'tomorrow' : DAYS_LONG[dowOf(dt)]} at ${fmtTime(x.open)}` }; }
  return { open: false, text: 'Closed' };
}

// ---------- availability (mirrors the checks in functions/src/core.js) ----------
export const slotId = (barberId, date, time) => `${barberId}_${date.replace(/-/g, '')}_${time.replace(':', '')}`;
export function blockTimes(time, mins, step) { // snapped to the grid, like core.js
  const s = Math.floor(toMin(time) / step) * step, e = Math.max(s + step, Math.ceil((toMin(time) + mins) / step) * step);
  return Array.from({ length: (e - s) / step }, (_, i) => fromMin(s + i * step));
}
export const isActiveSlot = (s, now) => !!s && (s.state === 'booked' || (s.state === 'held' && (s.holdUntil || 0) > now));
// ---------- haircut tiers (mirrors functions/src/core.js) ----------
export const TIERS = { deluxe: 'Deluxe', regular: 'Regular' };
// A barber with no tiers set can take every tier (older data). Add-ons have no tier.
export const canServe = (b, services) => services.every(s => (b.groups || ['him']).includes(s.group || 'him') && (!s.tier || !(b.tiers || []).length || b.tiers.includes(s.tier)));
// Men's bookings: exactly one haircut (Deluxe or Regular), plus add-ons that aren't already in a promo.
export function comboError(info, services) {
  const g = (services[0] || {}).group || 'him';
  if (!(info.services || []).some(s => (s.group || 'him') === g && s.kind === 'base' && s.active !== false)) return '';
  const bases = services.filter(s => s.kind === 'base');
  if (bases.length !== 1) return bases.length ? 'Pick only one haircut: Deluxe or Regular.' : 'Pick a haircut first: Deluxe or Regular.';
  const dup = services.find(s => (bases[0].includes || []).includes(s.id));
  return dup ? `${dup.name} is already part of ${bases[0].name.split(' · ')[0]}.` : '';
}
// ---------- opening hours and staff shifts (mirrors functions/src/core.js) ----------
// info.specialHours: [{ date: 'YYYY-MM-DD', closed: true } or { date, open, close }, label] for holidays; else the weekday's hours.
export function hoursFor(info, date) {
  const sp = (info.specialHours || []).find(x => x.date === date), h = (info.hours || []).find(x => x.d === dowOf(date));
  return sp ? { ...(h || {}), ...sp, closed: !!sp.closed } : h;
}
// staff.shifts: { 0: ['11:00', '20:00'], 1: ['09:00', '18:00'], ... } (0 = Sunday). A weekday without a shift is a day off.
// Older records without shifts use `days` with the shop's hours.
export function shiftOf(b, date, info = {}) {
  const d = dowOf(date);
  if (b.shifts && Object.keys(b.shifts).length) { const s = b.shifts[d]; return s && s[0] && s[1] ? { start: s[0], end: s[1] } : null; }
  if (!(b.days || []).includes(d)) return null;
  const h = hoursFor(info, date) || {}; return { start: b.shiftStart || h.open || '09:00', end: h.close || '20:00' };
}
export const daysFromShifts = shifts => Object.keys(shifts || {}).filter(k => shifts[k] && shifts[k][0]).map(Number).sort();
// Junior barbers take bookings until 2 hours before their shift ends (the last hour is for walk-ins);
// everyone else until the service would end with their shift.
export const isJunior = b => (b.role || 'barber') === 'barber' && (b.tiers || []).length > 0 && !(b.tiers || []).includes('deluxe');
export function lastStartFor(b, shift, mins, pol) { const end = toMin(shift.end); return isJunior(b) ? Math.min(end - mins, end - (pol.juniorStopMins ?? 120)) : end - mins; }
export function inShift(b, date, time, mins, info, pol) { const s = shiftOf(b, date, info); if (!s) return false; const m = toMin(time); return m >= toMin(s.start) && m <= lastStartFor(b, s, mins, pol); }
export function eligibleBarbers(info, services, date, barberId) {
  return (info.barbers || []).filter(b => b.active !== false && shiftOf(b, date, info) && !(b.off || []).includes(date)) // off = leave days
    .filter(b => canServe(b, services))
    .filter(b => !barberId || b.id === barberId)
    .sort((a, b) => (a.chair || 99) - (b.chair || 99));
}
// slots: map of slot id -> slot doc for that date. Returns [{time, barbers:[id]}] for every start time that fits.
export function availableTimes(info, { services, date, barberId, ignoreBookingId }, slots, ms = Date.now()) {
  const pol = policyOf(info);
  const h = hoursFor(info, date);
  if (!h || h.closed || !services.length) return [];
  const mins = Math.max(pol.step, sum(services, s => (s.mins ?? pol.step))); // add-ons with 0 min fit inside the hour
  const bars = eligibleBarbers(info, services, date, barberId);
  const out = [];
  const last = pol.lastBooking ? toMin(pol.lastBooking) : Infinity; // latest start time, e.g. 7:00 PM
  for (let m = toMin(h.open); m + mins <= toMin(h.close) && m <= last; m += pol.step) {
    const t = fromMin(m);
    if (startMs(date, t) < ms + pol.leadMinutes * 60e3) continue;
    const free = bars.filter(b => inShift(b, date, t, mins, info, pol) && blockTimes(t, mins, pol.step).every(bt => { const s = slots[slotId(b.id, date, bt)]; return !isActiveSlot(s, ms) || (ignoreBookingId && s.bookingId === ignoreBookingId); }));
    out.push({ time: t, barbers: free.map(b => b.id) });
  }
  return out;
}
export function bookableDates(info, ms = Date.now()) {
  const pol = policyOf(info), today = phNow(ms).date, out = [];
  for (let i = 0; i <= pol.bookAheadDays; i++) {
    const d = addDays(today, i), h = hoursFor(info, d);
    out.push({ date: d, closed: !h || h.closed, label: h && h.label ? h.label : '' });
  }
  return out;
}
export function timeChips(times, selected, actName = 'pickTime') {
  if (!times.length) return '<p class="empty">No times left on this day. Try another date.</p>';
  const groups = [['Morning', t => toMin(t) < 720], ['Afternoon', t => toMin(t) >= 720 && toMin(t) < 1020], ['Evening', t => toMin(t) >= 1020]];
  return groups.map(([label, f]) => {
    const list = times.filter(x => f(x.time)); if (!list.length) return '';
    return `<div class="tgroup"><p class="eyebrow">${label}</p><div class="chips">${list.map(x => `<button type="button" class="tchip" data-act="${actName}" data-v="${x.time}" aria-pressed="${x.time === selected}" ${x.barbers.length ? '' : 'disabled'}>${fmtTime(x.time)}</button>`).join('')}</div></div>`;
  }).join('');
}

// ---------- starter menu: REAL Barbers, Antipolo (from their Setmore page; edit in Shop setup) ----------
const S60 = (id, name, price, group, cat, desc = '', extra = {}) => ({ id, name, price, mins: 60, group, cat, desc, active: true, ...extra }); // mins: how long it takes; sets how long the chair is blocked
export const STARTER = {
  shop: {
    name: 'REAL Barbers', wordmark: 'R3AL BARBERS', tagline: 'Best looks realized.',
    about: 'Deluxe haircuts with shampoo, hot towel and massage, beard sculpting, hair spa and color. Plus a full salon menu for her.',
    address: 'C&B Circle Mall, cor. L. Sumulong Memorial Circle, Antipolo, Rizal 1870',
    phone: '0906 567 4507', email: 'r3albarbers@gmail.com', facebook: 'https://www.facebook.com/R3ALBarbers', googleUrl: 'https://share.google/erBDaygzMDDSmdahv',
    directions: 'Ground floor of C&B Circle Mall, in front of Unciano Colleges. Free parking at the side of the building and in the basement.', instagram: 'https://www.instagram.com/real__barbers',
    gcashNumber: '0966 368 7856', gcashName: 'AL******A C.', ownerPhone: '0906 567 4507', legalName: 'R3AL BARBERS', dpoName: 'Alexandra Cabang', dpoEmail: 'r3albarbers@gmail.com',
    currency: '₱', loyaltyEvery: 12, loyaltyMidAt: 6, loyaltyMidPct: 20, loyaltyFreeService: 'h9', heroPhoto: '', googleRating: 5.0, googleCount: 45, ratingSource: 'Setmore'
  },
  announcement: { active: false, text: '', link: '' },
  gallery: [
    { id: 'cut1', url: 'assets/gallery/cut1.jpg', style: 'Color', caption: 'Textured crop and burgundy color' },
    { id: 'cut2', url: 'assets/gallery/cut2.jpg', style: 'Crop', caption: 'Textured crop, low taper' },
    { id: 'cut3', url: 'assets/gallery/cut3.jpg', style: 'Fade', caption: 'Short crop, mid fade' },
    { id: 'cut4', url: 'assets/gallery/cut4.jpg', style: 'Fade', caption: 'Crop with drop fade' },
    { id: 'cut5', url: 'assets/gallery/cut5.jpg', style: 'Crop', caption: 'Textured fringe' },
    { id: 'cut6', url: 'assets/gallery/cut6.jpg', style: 'Taper', caption: 'Crop with low taper' }
  ],
  // Real reviews from REAL Barbers' two Setmore pages (5.0 from 30 + 15 reviews)
  reviews: [
    { id: 'rv1', name: 'Miguel A.', rating: 5, source: 'Setmore', text: 'Excellent service! Barber Lyndon is very professional and gives suggestions for better hairstyle. Will book again for future haircuts!' },
    { id: 'rv2', name: 'Jerome R.', rating: 5, source: 'Setmore', text: 'Would like to commend Barber Mac for his excellent service.' },
    { id: 'rv3', name: 'Vic T.', rating: 5, source: 'Setmore', text: 'Good job sir Ed!' },
    { id: 'rv4', name: 'Justin B.', rating: 5, source: 'Setmore', text: 'Best barbershop' },
    { id: 'rv5', name: 'Joshua', rating: 5, source: 'Setmore', text: 'Good haircut & service' },
    { id: 'rv6', name: 'Andrei', rating: 5, source: 'Setmore', text: 'Good service' }
  ],
  policy: { ...DEFAULT_POLICY, onlineBooking: false }, // turned on in Shop setup once the paid backend is deployed
  hours: [0, 1, 2, 3, 4, 5, 6].map(d => ({ d, open: '09:00', close: '20:00', closed: false })),
  // holiday hours (owner, Nov 2026)
  specialHours: [
    { date: '2026-12-24', open: '09:00', close: '15:00', label: 'Christmas Eve' },
    { date: '2026-12-25', closed: true, label: 'Christmas Day' },
    { date: '2026-12-26', closed: true, label: 'Closed' },
    { date: '2026-12-31', open: '09:00', close: '15:00', label: 'New Year’s Eve' },
    { date: '2027-01-01', closed: true, label: 'New Year’s Day' },
    { date: '2027-01-02', closed: true, label: 'Closed' }
  ],
  services: [
    // Men: pick ONE haircut (kind 'base'), Deluxe or Regular, then any add-ons (kind 'extra').
    // tier decides which barbers can take it: deluxe = senior barbers, regular = regular barbers.
    S60('h1', 'Deluxe Haircut', 399, 'him', 'Deluxe', 'Haircut of choice, shampoo and rinse, hot towel, arm and head massage, aloe vera moisturizing treatment and premiere grooming', { mins: 60, kind: 'base', tier: 'deluxe' }),
    S60('p1', 'BL1 · Deluxe Haircut + Beard Sculpting', 600, 'him', 'Deluxe promos', 'Save ₱29', { mins: 60, kind: 'base', tier: 'deluxe', includes: ['h7'] }),
    S60('p2', 'BL2 · Deluxe Haircut + Hair Spa', 900, 'him', 'Deluxe promos', 'Save ₱49', { usesProduct: true, mins: 60, kind: 'base', tier: 'deluxe', includes: ['h2'] }),
    S60('p3', 'BL3 · Deluxe Haircut + Dandruff Control', 1000, 'him', 'Deluxe promos', 'Save ₱49', { usesProduct: true, mins: 60, kind: 'base', tier: 'deluxe', includes: ['h3'] }),
    S60('p4', 'BL4 · Deluxe Haircut + L’Oréal Hair Color', 1100, 'him', 'Deluxe promos', 'Save ₱49', { usesProduct: true, mins: 60, kind: 'base', tier: 'deluxe', includes: ['h4'] }),
    S60('h8', 'Signature Haircut', 299, 'him', 'Regular', 'Any style, hot towel, and grooming with exclusive hair products', { mins: 60, kind: 'base', tier: 'regular', perks: ['Shampoo and rinse included'] }),
    S60('h9', 'Regular Haircut', 249, 'him', 'Regular', 'Any style, with grooming using exclusive hair products', { mins: 60, kind: 'base', tier: 'regular' }),
    S60('h2', 'Hair Spa', 550, 'him', 'Add-ons', '', { usesProduct: true, mins: 0, kind: 'extra' }),
    S60('h3', 'Dandruff Control', 650, 'him', 'Add-ons', '', { usesProduct: true, mins: 0, kind: 'extra' }),
    S60('h4', 'Hair Color (L’Oréal)', 750, 'him', 'Add-ons', '', { usesProduct: true, mins: 0, kind: 'extra' }),
    S60('h5', 'Basic Hair Art', 150, 'him', 'Add-ons', '', { mins: 0, kind: 'extra' }),
    S60('h6', 'Beard Shave with Cream', 200, 'him', 'Add-ons', '', { mins: 0, kind: 'extra' }),
    S60('h7', 'Beard Sculpting', 230, 'him', 'Add-ons', '', { mins: 0, kind: 'extra' }),
    S60('f1', 'Hair and Makeup', 1500, 'her', 'For her', '', { mins: 90 }),
    S60('f2', 'Women’s Regular Haircut', 275, 'her', 'For her', '', { mins: 60 }),
    S60('f3', 'Blow Dry with Shampoo', 230, 'her', 'For her', '', { mins: 60 }),
    S60('f4', 'Hair Styling', 470, 'her', 'For her', 'Curled or straightened', { mins: 60 }),
    S60('f5', 'Hair Color (Organique)', 1000, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60, priceFrom: true }),
    S60('f6', 'Hair Color (Revlon)', 1200, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60, priceFrom: true }),
    S60('f7', 'Hair Color (L’Oréal)', 1500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60, priceFrom: true }),
    S60('f8', 'Root Touch Up', 1000, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60 }),
    S60('f9', 'Highlights', 1500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60, priceFrom: true }),
    S60('f10', 'Balayage', 3000, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60, priceFrom: true }),
    S60('f11', 'Keratin Blow-out', 1500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60 }),
    S60('f12', 'Nano-Protein Treatment', 2500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60 }),
    S60('f13', 'Hair Rebond', 1500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60, priceFrom: true }),
    S60('f14', 'Moroccan Hot Oil Treatment', 450, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60 }),
    S60('f15', 'Semi Di Lino Hot Oil Treatment', 550, 'her', 'Color & treatments', '', { usesProduct: true, mins: 60 }),
    S60('f16', 'Eyebrow Shaping', 120, 'her', 'For her', '', { mins: 60 }),
    S60('f17', 'Hair Perming', 1300, 'her', 'Color & treatments', 'For men and women. Final price depends on hair length.', { usesProduct: true, mins: 60, priceFrom: true }),
    // Nails (REAL Barbers' menu from the owner, Nov 2026). Polish is an option the client picks; it changes the price.
    S60('n1', 'Manicure', 160, 'nails', 'Nails', 'Clean and shape', { options: [{ id: 'reg', name: 'Regular polish', add: 30 }, { id: 'orly', name: 'L’Oréal/Orly polish', add: 50 }] }),
    S60('n2', 'Pedicure', 180, 'nails', 'Nails', 'Clean and shape', { options: [{ id: 'reg', name: 'Regular polish', add: 30 }, { id: 'orly', name: 'L’Oréal/Orly polish', add: 50 }] }),
    S60('n3', 'Gel Manicure', 450, 'nails', 'Gel', 'Long-lasting gel polish', { usesProduct: true, mins: 120 }),
    S60('n4', 'Gel Pedicure', 550, 'nails', 'Gel', 'Long-lasting gel polish', { usesProduct: true, mins: 120 }),
    S60('n5', 'Gel Polish Removal (done here)', 150, 'nails', 'Gel', 'For gel done at REAL Barbers', { mins: 120 }),
    S60('n6', 'Gel Polish Removal (done elsewhere)', 200, 'nails', 'Gel', 'For gel done at another salon', { mins: 120 }),
    S60('n7', 'Foot Spa', 350, 'nails', 'Spa', 'Soak, scrub and massage'),
    S60('dn1', 'DN1 · Manicure and Pedicure', 320, 'nails', 'Promo packages', '', { mins: 120, options: [{ id: 'reg', name: 'Regular polish', add: 60 }, { id: 'orly', name: 'L’Oréal/Orly polish', add: 100 }, { id: 'gel', name: 'Gel polish', add: 630 }] }),
    S60('dn2', 'DN2 · Pedicure and Foot Spa', 500, 'nails', 'Promo packages', '', { mins: 120, options: [{ id: 'reg', name: 'Regular polish', add: 30 }, { id: 'orly', name: 'L’Oréal/Orly polish', add: 50 }, { id: 'gel', name: 'Gel polish', add: 370 }] }),
    S60('dn3', 'DN3 · Manicure, Pedicure and Foot Spa', 660, 'nails', 'Promo packages', '', { mins: 120, options: [{ id: 'reg', name: 'Regular polish', add: 50 }, { id: 'orly', name: 'L’Oréal/Orly polish', add: 50 }, { id: 'gel', name: 'Gel polish', add: 640 }] }),
    // Braids (Airyl and Lyndon). Prices start here; the final price depends on length and style.
    S60('b1', 'Top Head Braids', 1000, 'braids', 'Braids', '', { mins: 120, priceFrom: true }),
    S60('b2', 'Full Head Braids', 1300, 'braids', 'Braids', '', { mins: 180, priceFrom: true }),
    S60('b3', 'Braid Extensions', 2000, 'braids', 'Braids', '', { mins: 240, priceFrom: true, usesProduct: true })
  ],
  barbers: []
};
// The shop's own REAL Barbers products, shown on the website. Prices are 0 until the owner sets them
// (owner's prices, Nov 2026).
export const STARTER_PRODUCTS = [
  { id: 'liquid-pomade', name: 'Liquid Pomade', price: 380, size: '100 ml', unit: 'bottles', desc: 'Firm hold, medium shine. Pump bottle, easy to work through the hair and washes out clean.', tag: '', photo: 'assets/products/liquid-pomade.jpg' },
  { id: 'styling-powder', name: 'Styling Powder', price: 250, size: '20 g', unit: 'bottles', desc: 'Firm hold, matte finish. Adds volume and texture at the roots.', tag: '', photo: 'assets/products/styling-powder.jpg' },
  { id: 'sea-salt-spray', name: 'Sea Salt Spray', price: 370, size: '100 ml', unit: 'bottles', desc: 'Medium hold, medium shine. Spray on damp hair for a loose, textured look.', tag: '', photo: 'assets/products/sea-salt-spray.jpg' }
];
// Weekly shifts from the owner's schedule (Nov 2026), Sunday first. '' = day off.
const A = '09:00-18:00', B = '10:00-19:00', C = '11:00-20:00', X = '';
const WEEK = {
  lyndon: [B, X, B, B, B, B, B], rod: [B, B, B, B, X, B, B], reymart: [B, B, X, B, B, B, B], angelo: [B, B, B, X, B, B, B],
  ed: [C, A, A, X, C, A, C], renz: [C, A, X, A, C, A, A], jay: [B, C, A, A, X, C, A], vince: [A, X, C, A, A, C, '10:00-19:00'],
  mac: ['09:00-20:00', C, C, C, A, X, C], dave: [B, X, B, B, B, B, B], liza: [C, C, B, X, A, A, A], luz: [A, A, X, B, C, C, C],
  airyl: [B, B, B, B, X, B, B], alex: ['09:00-20:00', '09:00-20:00', X, '09:00-20:00', '09:00-20:00', '09:00-20:00', '09:00-20:00']
};
const shiftsOf = id => Object.fromEntries((WEEK[id] || []).map((v, d) => [d, v ? v.split('-') : null]).filter(([, v]) => v));
export const STARTER_STAFF = [
  { id: 'lyndon', photo: 'assets/staff/lyndon.jpg', name: 'Lyndon', role: 'barber', title: 'Senior barber', specialty: 'Classic and modern cuts, and braids', groups: ['him', 'braids'], tiers: ['deluxe'], payType: 'quota', rate: 50, dailyPay: 700, lateFine: 50, chair: 1 },
  { id: 'rod', photo: 'assets/staff/rod.jpg', name: 'Roderick', role: 'barber', title: 'Senior barber', specialty: 'Classic cuts and fades', groups: ['him'], tiers: ['deluxe'], payType: 'quota', rate: 50, dailyPay: 700, lateFine: 50, chair: 2 },
  { id: 'reymart', photo: 'assets/staff/reymart.jpg', name: 'Reymart', role: 'barber', title: 'Senior barber', specialty: 'Classic cuts and fades', groups: ['him'], tiers: ['deluxe'], payType: 'quota', rate: 50, dailyPay: 700, lateFine: 50, chair: 3 },
  { id: 'angelo', photo: 'assets/staff/angelo.jpg', name: 'Angelo', role: 'barber', title: 'Senior barber', specialty: 'Classic and modern cuts', groups: ['him'], tiers: ['deluxe'], payType: 'quota', rate: 50, dailyPay: 700, lateFine: 50, chair: 4 },
  { id: 'ed', photo: 'assets/staff/ed.jpg', name: 'Joe Ed', role: 'barber', title: 'Junior barber', specialty: 'Classic and modern cuts', groups: ['him'], tiers: ['regular'], payType: 'quota', rate: 40, dailyPay: 500, lateFine: 15, noDeposit: true, chair: 5 },
  { id: 'renz', photo: 'assets/staff/renz.jpg', name: 'Renz', role: 'barber', title: 'Junior barber', specialty: 'Classic cuts and fades', groups: ['him'], tiers: ['regular'], payType: 'quota', rate: 40, dailyPay: 500, lateFine: 15, noDeposit: true, chair: 6 },
  { id: 'jay', photo: 'assets/staff/jay.jpg', name: 'Jay', role: 'barber', title: 'Junior barber', specialty: 'Classic cuts and fades', groups: ['him'], tiers: ['regular'], payType: 'quota', rate: 40, dailyPay: 500, lateFine: 15, noDeposit: true, chair: 7 },
  { id: 'vince', photo: 'assets/staff/vince.jpg', name: 'Vince', role: 'barber', title: 'Junior barber', specialty: 'Classic cuts and fades', groups: ['him'], tiers: ['regular'], payType: 'quota', rate: 40, dailyPay: 500, lateFine: 15, noDeposit: true, chair: 8 },
  { id: 'mac', photo: 'assets/staff/mac.jpg', name: 'Mac', role: 'barber', title: 'Junior barber', specialty: 'Classic cuts and fades', groups: ['him'], tiers: ['regular'], payType: 'quota', rate: 40, dailyPay: 500, lateFine: 15, noDeposit: true, chair: 9 },
  { id: 'dave', photo: 'assets/staff/dave.jpg', name: 'Dave', role: 'stylist', title: 'Stylist', specialty: 'Women’s services: hair color, rebonding, styling and perming', groups: ['her'], rate: 45, dailyPay: 1000, productFee: { threshold: 1500, low: 50, high: 100 }, noDeposit: true, lateFine: 50, chair: 10 },
  { id: 'luz', photo: 'assets/staff/luz.jpg', name: 'Luz', role: 'nails', title: 'Nail technician', specialty: 'Nail care', groups: ['nails'], payType: 'quota', rate: 40, dailyPay: 500, noDeposit: true, lateFine: 15, chair: 11 },
  { id: 'liza', photo: 'assets/staff/liza.jpg', name: 'Liza', role: 'nails', title: 'Nail technician', specialty: 'Nail care', groups: ['nails'], payType: 'quota', rate: 40, dailyPay: 500, noDeposit: true, lateFine: 15, chair: 12 },
  { id: 'alex', name: 'Alex', role: 'reception', title: 'Owner', specialty: '', groups: [], payType: 'monthly', monthlyPay: 20000, rate: 0, dailyPay: 0, lateFine: 15 },
  { id: 'airyl', name: 'Airyl', role: 'stylist', title: 'Receptionist · braids', specialty: 'Braids', groups: ['braids'], rate: 70, dailyPay: 700, noDeposit: true, lateFine: 15, chair: 13 },
].map(b => { const shifts = shiftsOf(b.id); return { ...b, phone: '', shifts, days: daysFromShifts(shifts), active: true }; });
export const publicBarber = b => ({ id: b.id, name: b.name, noDeposit: !!b.noDeposit, off: b.off || [], shifts: b.shifts || null, role: b.role || 'barber', title: b.title || '', specialty: b.specialty || '', groups: b.groups || ['him'], tiers: b.tiers || [], days: b.days || [], chair: b.chair || '', photo: b.photo || '', bio: b.bio || '', rating: b.rating || 0, ratingCount: b.ratingCount || 0 });

// Shrinks a photo in the browser before upload: longest side `max` px, JPEG. Returns a Blob.
export async function resizeImage(file, max = 1600, quality = 0.82) {
  if (!/^image\//.test(file.type)) throw new Error('That file isn’t an image.');
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image couldn’t be opened. Try a JPG or PNG.')); i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}

// Scroll-in animation: elements with .reveal fade up the first time they enter the screen.
// Content below the fold starts hidden only when JS runs and motion is allowed, so nothing is lost without JS.
export function revealOnScroll(root = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const io = revealOnScroll.io || (revealOnScroll.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealOnScroll.io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }));
  root.querySelectorAll('.reveal:not(.seen)').forEach(el => {
    el.classList.add('seen');
    if (el.getBoundingClientRect().top < innerHeight) { el.classList.add('in'); return; }
    el.classList.add('pre'); io.observe(el);
  });
}

// .ics calendar file for a booking (Philippine time).
export function icsFor({ title, date, time, mins, location, description }) {
  const toUtc = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = startMs(date, time), end = start + (mins || 60) * 60e3;
  const e = s => String(s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//REAL Barbers//Booking//EN', 'BEGIN:VEVENT', `UID:${start}-${Math.random().toString(36).slice(2)}@realbarbers`,
    `DTSTAMP:${toUtc(Date.now())}`, `DTSTART:${toUtc(start)}`, `DTEND:${toUtc(end)}`, `SUMMARY:${e(title)}`, `LOCATION:${e(location)}`, `DESCRIPTION:${e(description)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Haircut in 2 hours', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export const windowOfTime = t => toMin(t) < 720 ? 'morning' : toMin(t) < 1020 ? 'afternoon' : 'evening';
export const phoneKey = p => String(p || '').replace(/\D/g, '').replace(/^63/, '0');

// Updates `el` in place to match `html`, touching only what changed. The element being typed in is never replaced,
// so the cursor, the phone keyboard and any half-typed word stay put. Event handling is delegated, so nothing is lost.
export function morph(el, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(el, tpl.content);
}
function morphChildren(from, to) {
  const a = [...from.childNodes], b = [...to.childNodes];
  for (let i = 0; i < b.length; i++) {
    const f = a[i], t = b[i];
    if (!f) { from.appendChild(t); continue; }
    if (f.nodeType !== t.nodeType || f.nodeName !== t.nodeName || (f.nodeType === 1 && (f.id || t.id) && f.id !== t.id)) { from.replaceChild(t, f); continue; }
    if (f.nodeType === 3 || f.nodeType === 8) { if (f.nodeValue !== t.nodeValue) f.nodeValue = t.nodeValue; continue; }
    if (f.nodeType === 1) morphEl(f, t);
  }
  for (let i = a.length - 1; i >= b.length; i--) if (a[i].parentNode === from) from.removeChild(a[i]);
}
function morphEl(f, t) {
  const active = f === document.activeElement;
  for (const { name } of [...f.attributes]) if (!t.hasAttribute(name) && !(name === 'open' && f.tagName === 'DETAILS')) f.removeAttribute(name);
  for (const { name, value } of [...t.attributes]) if (f.getAttribute(name) !== value) f.setAttribute(name, value);
  const tag = f.tagName;
  if (tag === 'INPUT') {
    if (f.type === 'checkbox' || f.type === 'radio') { if (f.checked !== t.hasAttribute('checked')) f.checked = t.hasAttribute('checked'); }
    else if (!active && f.type !== 'file' && f.value !== (t.getAttribute('value') || '')) f.value = t.getAttribute('value') || '';
    return;
  }
  if (tag === 'TEXTAREA') { if (!active && f.value !== t.value) f.value = t.value; return; }
  morphChildren(f, t);
  if (tag === 'SELECT') { const sel = t.querySelector('option[selected]'); const v = sel ? sel.value : (f.options[0] && f.options[0].value); if (!active && v != null && f.value !== v) f.value = v; }
}

// ---------- brand: the shop's badge logo + the wordmark with the mirrored E from the logo ----------
export const LOGO = new URL('./logo-192.png', import.meta.url).href;
// Client-facing receipt (booking page and receipt page). `r` comes from getReceipt.
export function receiptHTML(r, cur = '₱') {
  const m = n => money(n, cur, true), sh = r.shop || {}, row = (k, v, cls = '') => `<div class="${cls}"><span>${k}</span><span>${v}</span></div>`;
  // loyalty card after this visit (same rules as the dashboard)
  const L = r.loyalty && r.loyalty.every ? r.loyalty : null, LS = L ? loyaltyState(L, L.visits) : null, onCard = L ? (LS.k || (L.visits ? L.every : 0)) : 0, got = L ? loyaltyReward(L, L.visits) : null;
  return `<div class="receipt rcpt">
    <div class="rc-shop">${esc(sh.wordmark || sh.name || 'Receipt')}</div>${sh.address ? `<div class="rc-mid muted">${esc(sh.address)}</div>` : ''}${sh.tin ? `<div class="rc-mid muted">TIN ${esc(sh.tin)}</div>` : ''}<hr>
    ${r.orNo ? row('<b>Official receipt</b>', `<b>${esc(r.orNo)}</b>`) : ''}
    ${row(esc(fmtDate(r.date, true)), esc(fmtTime(r.time)))}${r.name ? row('Client', esc(r.name)) : ''}${r.barberName ? row('Barber', esc(r.barberName)) : ''}<hr>
    ${(r.lines || []).map(l => row(`${esc(l.name)}${l.qty > 1 ? ' ×' + l.qty : ''}`, m(l.price * l.qty))).join('')}<hr>
    ${r.discount ? row(`Discount${r.discountNote ? ' (' + esc(r.discountNote) + ')' : ''}`, '−' + m(r.discount)) : ''}${r.tip ? row('Tip', m(r.tip)) : ''}
    ${row('TOTAL', m(r.total), 'rc-tot')}
    ${r.depositCredit ? row('Deposit paid online', '−' + m(r.depositCredit)) : ''}${row(`Paid at the shop${r.method ? ' (' + esc(r.method) + ')' : ''}`, m(r.paidAtShop))}
    ${L ? `<hr><div class="rc-mid rc-loy"><span class="meter">${Array.from({ length: Math.min(L.every, 12) }, (_, i) => `<i class="${i < onCard ? 'on' : ''}"></i>`).join('')}</span><span>${got && got.kind === 'free' ? 'Free visit used. A new card starts next time' : `Visit ${onCard} of ${L.every}${got ? ` (${got.label})` : ''} · ${esc(LS.line.replace(/^Your next visit: /, 'next visit: '))}`}</span></div>` : ''}
    <hr><div class="rc-mid muted">${esc(sh.tagline || 'Thank you!')}${sh.phone ? `<br>${esc(sh.phone)}` : ''}${sh.birPermit ? `<br><small>${esc(sh.birPermit)}</small>` : ''}</div></div>`;
}
export const BACK_IC = '<svg class="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>';
export const LOGO_LG = new URL('./logo.png', import.meta.url).href;
// "R3AL BARBERS" / "REAL BARBERS" -> R + mirrored E + AL BARBERS, like the badge
export function wordmarkText(text) {
  const t = String(text || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return t.replace(/\bR(?:3|E)AL\b/i, m => `${m[0]}<span class="mirror-e" aria-hidden="true">E</span><span class="sr">E</span>${m.slice(2)}`);
}
export const brand = (text, cls = '') => `<img class="logo-mark ${cls}" src="${LOGO}" alt="" width="40" height="40"><span class="wm-text">${wordmarkText(text)}</span>`;

// Barber's commission: rate × services after discounts, rounded DOWN to the whole peso; the shop gets the
// rest. 50% of ₱399 → barber ₱199, shop ₱200.
export const commissionOf = (svcAfterDiscount, rate) => Math.floor(Math.max(0, svcAfterDiscount) * (Number(rate) || 0) / 100 + 1e-9);

// 45 -> "45 min", 60 -> "1 hr", 90 -> "1 hr 30 min", 120 -> "2 hrs"
export function dur(mins) {
  const m = Math.round(Number(mins) || 0), h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${m} min`;
  return `${h} hr${h > 1 ? 's' : ''}${r ? ` ${r} min` : ''}`;
}

// ---------- staff roles ----------
// Service staff take bookings and earn commission. Support staff (receptionist, maintenance) only get daily pay.
export const ROLES = { barber: 'Barber', stylist: 'Hair stylist', nails: 'Nail technician', reception: 'Receptionist', maintenance: 'Maintenance' };
export const SERVICE_ROLES = ['barber', 'stylist', 'nails'];
export const isServiceStaff = b => SERVICE_ROLES.includes((b && b.role) || 'barber');

// ---------- commission ----------
// For services that use salon products, staff with a product fee give the shop a fixed amount first
// (e.g. ₱50 on a service under ₱1,500, ₱100 from ₱1,500 up). What's left is split by their rate.
// The staff share is rounded DOWN to the whole peso; the shop keeps the rest.
export const PRODUCT_FEE = { threshold: 1500, low: 50, high: 100 };
export function productFeeFor(staff, svc, unitPrice) {
  const f = staff && staff.productFee; if (!f || !svc || !svc.usesProduct) return 0;
  return unitPrice >= (f.threshold ?? 1500) ? (f.high ?? 100) : (f.low ?? 50);
}
// lines: [{ kind: 'service', ref, price, qty }], discount: pesos off the bill (taken from services first), lookup: id -> service
export function commissionFor(staff, lines, discount, lookup) {
  const svcLines = (lines || []).filter(l => l.kind === 'service');
  const total = svcLines.reduce((t, l) => t + l.price * (l.qty || 1), 0); if (!total) return { commission: 0, fees: 0 };
  const disc = Math.min(Math.max(0, discount || 0), total);
  let base = 0, fees = 0;
  for (const l of svcLines) {
    const q = l.qty || 1, gross = l.price * q, fee = productFeeFor(staff, lookup(l.ref), l.price) * q;
    fees += fee; base += Math.max(0, gross - disc * gross / total - fee);
  }
  return { commission: commissionOf(base, staff ? staff.rate : 0), fees };
}

// Same as functions/src/core.js rebookLink: site/?svc=h1,h6&barber=lyndon#book
export function rebookLink(site, visit, info) {
  const svcIds = (visit.serviceIds || (visit.lines || []).filter(l => l.kind === 'service').map(l => l.ref)).filter(id => (info.services || []).some(s => s.id === id && s.active !== false));
  const p = new URLSearchParams();
  if (svcIds.length) p.set('svc', [...new Set(svcIds)].join(','));
  if (visit.barberId && (info.barbers || []).some(b => b.id === visit.barberId && b.active !== false)) p.set('barber', visit.barberId);
  const q = p.toString().replace(/%2C/g, ',');
  return `${String(site).replace(/\/+$/, '')}/${q ? '?' + q : ''}#book`;
}

// ---------- promo codes ----------
// promo: { code, kind: 'percent' | 'amount', value, active, expires: 'YYYY-MM-DD' | '', maxUses, uses, minSpend }
// Returns { ok, off, label } or { ok: false, error }. The discount comes off the service total at the shop, never the deposit.
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
export const fmtBday = b => { const v = cleanBday(b); return v ? `${MONTHS_LONG[+v.slice(0, 2) - 1]} ${+v.slice(3)}` : ''; };
// Days from `date` (YYYY-MM-DD) to the nearest birthday: 0 = today, 3 = in three days, -2 = two days ago
export function bdayDays(b, date) {
  const v = cleanBday(b); if (!v || !date) return null;
  const y = +date.slice(0, 4), base = Date.parse(date + 'T00:00:00Z');
  const at = yr => { const ok = v !== '02-29' || (yr % 4 === 0 && (yr % 100 !== 0 || yr % 400 === 0)); return Date.parse(`${yr}-${ok ? v : '02-28'}T00:00:00Z`); };
  return [y - 1, y, y + 1].map(yr => Math.round((at(yr) - base) / 864e5)).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
}
// Month + day pickers. `attr(part)` returns the attributes for each select (name=… or data-bind=…)
export function bdaySelects(value, idBase, attr) {
  const [mo, d] = String(value || '').split('-').map(x => parseInt(x, 10) || 0); // a half-picked value keeps its part
  return `<div class="bday-in"><select id="${idBase}-m" ${attr('m')} aria-label="Birthday month"><option value="">Month</option>${MONTHS_LONG.map((n, i) => `<option value="${i + 1}" ${mo === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <select id="${idBase}-d" ${attr('d')} aria-label="Birthday day"><option value="">Day</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${d === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>`;
}
export const BDAY_TITLE = 'Birthday treat: Signature Haircut for ₱249';
export const BDAY_HINT = 'Tell us your birthday (just the month and day). On your birthday, our Signature Haircut with shampoo and rinse is ₱249 instead of ₱299.';
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
// Messenger link from the Facebook page address (facebook.com/R3ALBarbers -> m.me/R3ALBarbers)
export function messengerLink(shop) {
  if (shop.messenger) return shop.messenger;
  const m = /facebook\.com\/(?!profile\.php)([A-Za-z0-9.\-]+)/.exec(shop.facebook || '');
  return m ? `https://m.me/${m[1]}` : '';
}
// Suggested FAQ, built from the shop's own rules. The owner can edit it in Dashboard → Website.
export function defaultFaq(info) {
  const p = policyOf(info), sh = info.shop || {}, peso = n => `₱${n}`;
  const deluxe = (info.barbers || []).filter(b => (b.tiers || []).includes('deluxe')).map(b => b.name);
  return [
    { q: 'How do I book?', a: `Pick your service, barber and time on this page, then pay the ${peso(p.deposit)} down payment to lock in your slot. Your confirmation comes by text and email.` },
    { q: 'Can I walk in without a booking?', a: 'Yes, walk-ins are welcome when a chair is free. At the shop, scan the QR code at the front desk to join the queue. Clients with a booking go first at their time.' },
    { q: 'How do I pay the down payment?', a: `Online with GCash, Maya, card or QR Ph${sh.gcashNumber ? `, or send it to our GCash (${sh.gcashNumber}) and upload the screenshot` : ''}. It’s deducted from your bill at the shop.` },
    { q: 'What’s the difference between Deluxe and Regular?', a: `Deluxe haircuts are with our senior barbers${deluxe.length ? ` (${deluxe.join(', ')})` : ''} and include shampoo, hot towel and massage. Regular haircuts are with our junior barbers.` },
    { q: 'What if I’m running late?', a: `Please come on time. With a junior barber you have ${p.lateMinutes} minutes; after that your slot may go to a walk-in and we’ll fit you in at the next free time. With a senior barber you have ${p.lateMinutesDeposit ?? 20} minutes; after that the down payment is kept and the full price of your service is still due, for the barber’s time. Running late? Tap “Running late” on your booking page so we know.` },
    { q: 'Can I reschedule or cancel?', a: `You can reschedule online up to ${p.rescheduleHours} hours before your appointment, using the link in your confirmation. Cancel at least ${p.cancelHours ?? 48} hours before and we’ll send your down payment back. Later than that, it isn’t refunded. Only bookings with senior barbers have a down payment.` },
    { q: 'Can I book for someone else too?', a: 'Yes. In “Your details”, add a second person. They can have the same or different services, at the same time with another barber, right after you, or any time you pick. Each person with a senior barber needs the down payment.' },
    { q: 'Do you have promo codes?', a: 'When we run a promo, we post the code on our Facebook and Instagram. Type it in “Have a promo code?” when you book. It comes off your bill at the shop.' }
  ];
}

// Month calendar for picking a booking date. dates: [{date, closed, off}] (what bookableDates returns,
// plus off = barber's day off). month: 'YYYY-MM' being shown. Arrows step a month at a time.
export function monthGrid({ dates, selected, act, month, navAct, disabled = false, label = 'Date' }) {
  if (!dates.length) return '<p class="muted small">No dates open for booking.</p>';
  const by = Object.fromEntries(dates.map(d => [d.date, d])), first = dates[0].date.slice(0, 7), last = dates[dates.length - 1].date.slice(0, 7);
  const m = month && month >= first && month <= last ? month : (selected || dates[0].date).slice(0, 7);
  const [y, mo] = m.split('-').map(Number), start = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const today = dates[0].date, cells = [];
  for (let i = 0; i < start; i++) cells.push('<span class="cal-x" aria-hidden="true"></span>');
  for (let d = 1; d <= days; d++) {
    const iso = `${m}-${String(d).padStart(2, '0')}`, x = by[iso], can = x && !x.closed && !x.off && !disabled;
    const why = !x ? '' : x.closed ? ` (closed${x.label && x.label !== 'Closed' ? ', ' + x.label : ''})` : x.off ? ' (day off)' : '';
    cells.push(`<button type="button" class="cal-d${iso === today ? ' today' : ''}${x && (x.closed || x.off) ? ' shut' : ''}" data-act="${act}" data-v="${iso}" aria-pressed="${iso === selected}" aria-label="${fmtDate(iso)}${why}" ${can ? '' : 'disabled'}>${d}</button>`);
  }
  return `<div class="cal" role="group" aria-label="${label}">
    <div class="cal-h"><button type="button" class="cal-nav" data-act="${navAct}" data-v="-1" data-m="${m}" aria-label="Previous month" ${m <= first ? 'disabled' : ''}>‹</button><b>${MONTHS_LONG[mo - 1]} ${y}</b><button type="button" class="cal-nav" data-act="${navAct}" data-v="1" data-m="${m}" aria-label="Next month" ${m >= last ? 'disabled' : ''}>›</button></div>
    <div class="cal-w" aria-hidden="true">${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(w => `<span>${w}</span>`).join('')}</div>
    <div class="cal-g">${cells.join('')}</div></div>`;
}
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number), d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

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

// Rough walk-in wait from the live queue: chairs free now, people waiting, about 40 min a cut.
// Returns null when the shop is closed; mins 0 means a chair is free now.
export function queueEstimate(q, info, ms = Date.now()) {
  if (!openStatus(info, ms).open) return null;
  const t = phNow(ms), now = t.min, items = q && q.date === t.date ? q.items || [] : [];
  const chairs = Math.max(1, (info.barbers || []).filter(b => { const sh = shiftOf(b, t.date, info); return sh && now >= toMin(sh.start) && now < toMin(sh.end) && (b.groups || ['him']).includes('him') && !(b.off || []).includes(t.date); }).length);
  const busy = items.filter(i => i.t === 'c' || (i.t === 'b' && i.s <= now && now < i.s + i.m)).length;
  const waiting = items.filter(i => i.t === 'w'), free = Math.max(0, chairs - busy);
  if (waiting.length < free) return { mins: 0, waiting: waiting.length, chairs };
  const avg = waiting.length ? Math.round(waiting.reduce((x, i) => x + (i.m || 40), 0) / waiting.length) : 40;
  const turns = Math.ceil((waiting.length - free + 1) / chairs), mins = Math.min(180, Math.max(10, Math.round(turns * avg / 5) * 5));
  return { mins, waiting: waiting.length, chairs };
}

// ---------- loyalty card (mirrors functions/src/core.js) ----------
// shop.loyaltyEvery: visits per card (0 = no card). loyaltyMidAt + loyaltyMidPct: one visit on the card gets a discount.
// loyaltyFreeService: the service the last visit of the card gets free ('' = their haircut).
// Owner, Nov 2026: 12 visits; visit 6 gets 20% off, visit 12 is a free Regular Haircut.
export function loyaltyPlan(shop = {}, services = []) {
  const every = Math.max(0, parseInt(shop.loyaltyEvery, 10) || 0); if (!every) return null;
  const at = Math.max(0, parseInt(shop.loyaltyMidAt, 10) || 0), pct = Math.max(0, Math.min(100, Number(shop.loyaltyMidPct) || 0)), sv = services.find(x => x.id === shop.loyaltyFreeService);
  return { every, midAt: at > 0 && at < every && pct > 0 ? at : 0, midPct: pct, freeId: sv ? sv.id : '', freeName: sv ? sv.name : 'haircut' };
}
// the reward on visit number n (1 = first visit ever), or null
export function loyaltyReward(L, n) {
  if (!L || !L.every || n < 1) return null;
  const k = (n - 1) % L.every + 1;
  if (k === L.every) return { kind: 'free', k, label: `free ${L.freeName || 'haircut'}` };
  if (L.midAt && k === L.midAt) return { kind: 'percent', k, value: L.midPct, label: `${L.midPct}% off` };
  return null;
}
// where a client stands after `visits` paid visits: stamps on the card now, the reward on the next visit, the next reward
export function loyaltyState(L, visits) {
  const k = visits % L.every, next = loyaltyReward(L, visits + 1);
  let ahead = null; for (let i = 1; i <= L.every; i++) { const r = loyaltyReward(L, visits + i); if (r) { ahead = { in: i, ...r }; break; } }
  const line = next ? `Your next visit: ${next.label}` : ahead ? `${ahead.in - 1} more visit${ahead.in - 1 === 1 ? '' : 's'}, then ${ahead.label}` : '';
  return { k, next, ahead, line };
}
// the stamps on a card: done ones ticked, the reward visits labelled
export const loyaltyStamps = (L, done, tag = 'span') => Array.from({ length: Math.min(L.every, 12) }, (_, i) => { const r = loyaltyReward(L, i + 1); return `<${tag} class="${i < done ? 'on' : ''}${r ? ` rw rw-${r.kind}` : ''}" style="--i:${i}">${r ? (r.kind === 'free' ? 'FREE' : `${r.value}%`) : i < done ? '✓' : i + 1}</${tag}>`; }).join('');
export const loyaltySummary = L => !L ? '' : [L.midAt ? `visit ${L.midAt} gets ${L.midPct}% off` : '', `visit ${L.every} is a free ${L.freeName || 'haircut'}`].filter(Boolean).join(', and ');

// ---------- client accounts ----------
// What a client sees when they log in with their number: their bookings, visits, receipts and loyalty.
// Same code on the server (functions/src/core.js) and in the demo (public/assets/shared.js).
export function accountView({ phone, customers = [], appts = [], sales = [], info, today }) {
  const svcName = id => ((info.services || []).find(s => s.id === id) || {}).name || 'Service';
  const bName = id => ((info.barbers || []).find(b => b.id === id) || {}).name || '';
  const c = customers.find(x => x.name) || {}, plan = loyaltyPlan(info.shop || {}, info.services || []);
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
    loyalty: plan ? { ...plan, visits: paid.length, nextFree: (loyaltyReward(plan, paid.length + 1) || {}).kind === 'free' } : null,
    again: last ? { svc: (last.lines || []).filter(l => l.kind === 'service').map(l => l.ref).filter(id => (info.services || []).some(s => s.id === id && s.active !== false)), barber: (info.barbers || []).some(b => b.id === last.barberId) ? last.barberId : '' } : null
  };
}

// Down payment for one person's booking: none when their barber is set to "no down payment" (junior barbers),
// Only senior barbers take one: for "any available", it's needed only when every barber who could take it is a senior. Same rule as the server.
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
// time-in for the late rule: that day's shift start when the person has shifts, else their usual time, else the shop's
export const shiftStartOf = (b, pol, date) => (b && date && b.shifts && b.shifts[dowOf(date)] && b.shifts[dowOf(date)][0]) || (b && b.shiftStart) || (pol && pol.clockStart) || CLOCK_START;
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

// ---------- light and dark mode ----------
// Dashboard only (pages marked data-themed): the choice is saved on the device ('rb-theme': 'light' | 'dark').
// With no choice, and always on the public website, pages follow the device's own setting.
// The dashboard pages' <head> applies the saved choice before anything draws (tools/stamp_assets.py), so there's no flash.
const SUN = '<svg class="th-ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.8v2.1M10 16.1v2.1M1.8 10h2.1M16.1 10h2.1M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5"/></svg>';
const MOON = '<svg class="th-ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1z"/></svg>';
export function getTheme() { try { const t = localStorage.getItem('rb-theme'); return t === 'dark' || t === 'light' ? t : 'system'; } catch (_) { return 'system'; } }
export function effectiveTheme() { const t = getTheme(); if (t !== 'system') return t; try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (_) { return 'light'; } }
const themeInner = withLabel => { const d = effectiveTheme() === 'dark'; return `${d ? SUN : MOON}${withLabel ? `<span class="lbl">${d ? 'Light mode' : 'Dark mode'}</span>` : ''}`; };
export function themeBtn(cls = '', withLabel = false) {
  const d = effectiveTheme() === 'dark';
  return `<button type="button" class="theme-btn ${cls}" data-act="theme" data-lbl="${withLabel ? 1 : ''}" aria-label="Switch to ${d ? 'light' : 'dark'} mode" title="Switch to ${d ? 'light' : 'dark'} mode">${themeInner(withLabel)}</button>`;
}
export function applyTheme(t) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = effectiveTheme() === 'dark' ? '#0b0b0c' : '#f3f3f1';
  document.querySelectorAll('[data-act="theme"]').forEach(b => { const d = effectiveTheme() === 'dark'; b.innerHTML = themeInner(!!b.dataset.lbl); b.setAttribute('aria-label', `Switch to ${d ? 'light' : 'dark'} mode`); b.title = b.getAttribute('aria-label'); });
}
if (typeof window !== 'undefined' && !window.__rbTheme && document.documentElement.dataset.themed) {
  window.__rbTheme = 1;
  applyTheme(getTheme());
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="theme"]'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('rb-theme', next); } catch (_) {}
    document.documentElement.classList.add('theme-anim'); applyTheme(next); setTimeout(() => document.documentElement.classList.remove('theme-anim'), 400);
  }, true);
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getTheme() === 'system') applyTheme('system'); }); } catch (_) {}
}
