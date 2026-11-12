// Helpers shared by the website, the booking page and the dashboard.
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DEFAULT_POLICY = { deposit: 200, holdMinutes: 15, rescheduleHours: 48, lateMinutes: 20, leadMinutes: 60, bookAheadDays: 30, step: 60, maxReschedules: 2, rebookDays: 28, onlineBooking: true, lastBooking: '19:00' };

export const $ = (s, r = document) => r.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const sum = (a, f) => a.reduce((t, x) => t + (Number(f(x)) || 0), 0);

// Dates are handled as "YYYY-MM-DD" strings in Philippine time, whatever the visitor's own time zone.
export const TZ = '+08:00';
export function phNow(ms = Date.now()) { const d = new Date(ms + 8 * 3600e3); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() }; }
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
export const priceLabel = (s, cur = '₱') => (s.priceFrom ? 'from ' : '') + money(s.price, cur);
export const policyOf = info => ({ ...DEFAULT_POLICY, ...(info && info.policy || {}) });
export const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase();

export function openStatus(info, ms = Date.now()) {
  const now = phNow(ms), hrs = info.hours || [];
  const h = hrs.find(x => x.d === now.dow);
  if (h && !h.closed) {
    if (now.min >= toMin(h.open) && now.min < toMin(h.close)) return { open: true, text: `Open now · until ${fmtTime(h.close)}` };
    if (now.min < toMin(h.open)) return { open: false, text: `Opens today at ${fmtTime(h.open)}` };
  }
  for (let i = 1; i <= 7; i++) { const d = (now.dow + i) % 7; const x = hrs.find(y => y.d === d); if (x && !x.closed) return { open: false, text: `Closed now · opens ${i === 1 ? 'tomorrow' : DAYS_LONG[d]} at ${fmtTime(x.open)}` }; }
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
export function eligibleBarbers(info, services, date, barberId) {
  const d = dowOf(date);
  return (info.barbers || []).filter(b => b.active !== false && (b.days || []).includes(d))
    .filter(b => canServe(b, services))
    .filter(b => !barberId || b.id === barberId)
    .sort((a, b) => (a.chair || 99) - (b.chair || 99));
}
// slots: map of slot id -> slot doc for that date. Returns [{time, barbers:[id]}] for every start time that fits.
export function availableTimes(info, { services, date, barberId, ignoreBookingId }, slots, ms = Date.now()) {
  const pol = policyOf(info);
  const h = (info.hours || []).find(x => x.d === dowOf(date));
  if (!h || h.closed || !services.length) return [];
  const mins = sum(services, s => s.mins || pol.step);
  const bars = eligibleBarbers(info, services, date, barberId);
  const out = [];
  const last = pol.lastBooking ? toMin(pol.lastBooking) : Infinity; // latest start time, e.g. 7:00 PM
  for (let m = toMin(h.open); m + mins <= toMin(h.close) && m <= last; m += pol.step) {
    const t = fromMin(m);
    if (startMs(date, t) < ms + pol.leadMinutes * 60e3) continue;
    const free = bars.filter(b => blockTimes(t, mins, pol.step).every(bt => { const s = slots[slotId(b.id, date, bt)]; return !isActiveSlot(s, ms) || (ignoreBookingId && s.bookingId === ignoreBookingId); }));
    out.push({ time: t, barbers: free.map(b => b.id) });
  }
  return out;
}
export function bookableDates(info, ms = Date.now()) {
  const pol = policyOf(info), today = phNow(ms).date, out = [];
  for (let i = 0; i <= pol.bookAheadDays; i++) {
    const d = addDays(today, i), h = (info.hours || []).find(x => x.d === dowOf(d));
    out.push({ date: d, closed: !h || h.closed });
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
    phone: '0906 567 4507', email: 'r3albarbers@gmail.com', facebook: 'https://www.facebook.com/R3ALBarbers', instagram: 'https://www.instagram.com/real__barbers',
    gcashNumber: '0966 368 7856', gcashName: 'Alexandra C.',
    currency: '₱', loyaltyEvery: 10, heroPhoto: '', googleRating: 5.0, googleCount: 45, ratingSource: 'Setmore'
  },
  announcement: { active: false, text: '', link: '' },
  gallery: [],
  // Real reviews from REAL Barbers' two Setmore pages (5.0 from 30 + 15 reviews)
  reviews: [
    { id: 'rv1', name: 'Miguel A.', rating: 5, source: 'Setmore', text: 'Excellent service! Barber Lyndon is very professional and gives suggestions for better hairstyle. Will book again for future haircuts!' },
    { id: 'rv2', name: 'Jerome Ramos', rating: 5, source: 'Setmore', text: 'Would like to commend Barber Mac for his excellent service.' },
    { id: 'rv3', name: 'Vic Titong', rating: 5, source: 'Setmore', text: 'Good job sir Ed!' },
    { id: 'rv4', name: 'Justin Bonso', rating: 5, source: 'Setmore', text: 'Best barbershop' },
    { id: 'rv5', name: 'Joshua', rating: 5, source: 'Setmore', text: 'Good haircut & service' },
    { id: 'rv6', name: 'Andrei', rating: 5, source: 'Setmore', text: 'Good service' }
  ],
  policy: { ...DEFAULT_POLICY, onlineBooking: false }, // turned on in Shop setup once the paid backend is deployed
  hours: [0, 1, 2, 3, 4, 5, 6].map(d => ({ d, open: '09:00', close: '20:00', closed: false })),
  services: [
    // Men: pick ONE haircut (kind 'base'), Deluxe or Regular, then any add-ons (kind 'extra').
    // tier decides which barbers can take it: deluxe = senior barbers, regular = regular barbers.
    S60('h1', 'Deluxe Haircut', 399, 'him', 'Deluxe', 'Haircut of choice, shampoo and rinse, hot towel, arm and head massage, aloe vera moisturizing treatment and premiere grooming', { mins: 60, kind: 'base', tier: 'deluxe' }),
    S60('p1', 'BL1 · Deluxe Haircut + Beard Sculpting', 600, 'him', 'Deluxe promos', 'Save ₱29', { mins: 75, kind: 'base', tier: 'deluxe', includes: ['h7'] }),
    S60('p2', 'BL2 · Deluxe Haircut + Hair Spa', 900, 'him', 'Deluxe promos', 'Save ₱49', { usesProduct: true, mins: 90, kind: 'base', tier: 'deluxe', includes: ['h2'] }),
    S60('p3', 'BL3 · Deluxe Haircut + Dandruff Control', 1000, 'him', 'Deluxe promos', 'Save ₱49', { usesProduct: true, mins: 90, kind: 'base', tier: 'deluxe', includes: ['h3'] }),
    S60('p4', 'BL4 · Deluxe Haircut + L’Oréal Hair Color', 1100, 'him', 'Deluxe promos', 'Save ₱49', { usesProduct: true, mins: 120, kind: 'base', tier: 'deluxe', includes: ['h4'] }),
    S60('h8', 'Signature Haircut', 299, 'him', 'Regular', 'Any style, shampoo and rinse, hot towel, and grooming with exclusive hair products', { mins: 45, kind: 'base', tier: 'regular' }),
    S60('h9', 'Regular Haircut', 249, 'him', 'Regular', 'Any style, with grooming using exclusive hair products', { mins: 45, kind: 'base', tier: 'regular' }),
    S60('h2', 'Hair Spa', 550, 'him', 'Add-ons', '', { usesProduct: true, mins: 30, kind: 'extra' }),
    S60('h3', 'Dandruff Control', 650, 'him', 'Add-ons', '', { usesProduct: true, mins: 30, kind: 'extra' }),
    S60('h4', 'Hair Color (L’Oréal)', 750, 'him', 'Add-ons', '', { usesProduct: true, mins: 60, kind: 'extra' }),
    S60('h5', 'Basic Hair Art', 549, 'him', 'Add-ons', '', { mins: 30, kind: 'extra' }),
    S60('h6', 'Beard Shave with Cream', 200, 'him', 'Add-ons', '', { mins: 15, kind: 'extra' }),
    S60('h7', 'Beard Sculpting', 230, 'him', 'Add-ons', '', { mins: 20, kind: 'extra' }),
    S60('f1', 'Hair and Makeup', 1500, 'her', 'For her', '', { mins: 90 }),
    S60('f2', 'Women’s Regular Haircut', 275, 'her', 'For her', '', { mins: 45 }),
    S60('f3', 'Blow Dry with Shampoo', 230, 'her', 'For her', '', { mins: 45 }),
    S60('f4', 'Hair Styling', 470, 'her', 'For her', 'Curled or straightened', { mins: 60 }),
    S60('f5', 'Hair Color (Organique)', 1000, 'her', 'Color & treatments', '', { usesProduct: true, mins: 120, priceFrom: true }),
    S60('f6', 'Hair Color (Revlon)', 1200, 'her', 'Color & treatments', '', { usesProduct: true, mins: 120, priceFrom: true }),
    S60('f7', 'Hair Color (L’Oréal)', 1500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 120, priceFrom: true }),
    S60('f8', 'Root Touch Up', 1000, 'her', 'Color & treatments', '', { usesProduct: true, mins: 90 }),
    S60('f9', 'Highlights', 1500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 150, priceFrom: true }),
    S60('f10', 'Balayage', 3000, 'her', 'Color & treatments', '', { usesProduct: true, mins: 180, priceFrom: true }),
    S60('f11', 'Keratin Blow-out', 1500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 120 }),
    S60('f12', 'Nano-Protein Treatment', 2500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 150 }),
    S60('f13', 'Hair Rebond', 1500, 'her', 'Color & treatments', '', { usesProduct: true, mins: 240, priceFrom: true }),
    S60('f14', 'Moroccan Hot Oil Treatment', 450, 'her', 'Color & treatments', '', { usesProduct: true, mins: 45 }),
    S60('f15', 'Semi Di Lino Hot Oil Treatment', 550, 'her', 'Color & treatments', '', { usesProduct: true, mins: 45 }),
    S60('f16', 'Eyebrow Shaping', 120, 'her', 'For her', '', { mins: 15 })
  ],
  barbers: []
};
export const STARTER_STAFF = [
  { id: 'lyndon', name: 'Lyndon', role: 'barber', title: 'Senior barber', specialty: 'Classic cuts and beard sculpting', groups: ['him'], tiers: ['deluxe'], rate: 50, dailyPay: 700, chair: 1 },
  { id: 'rod', name: 'Roderick', role: 'barber', title: 'Senior barber', specialty: 'Hair art and designs', groups: ['him'], tiers: ['deluxe'], rate: 50, dailyPay: 700, chair: 2 },
  { id: 'reymart', name: 'Reymart', role: 'barber', title: 'Senior barber', specialty: 'Fades and deluxe cuts', groups: ['him'], tiers: ['deluxe'], rate: 50, dailyPay: 700, chair: 3 },
  { id: 'angelo', name: 'Angelo', role: 'barber', title: 'Senior barber', specialty: 'Haircuts and hair spa', groups: ['him'], tiers: ['deluxe'], rate: 50, dailyPay: 700, chair: 4 },
  { id: 'ed', name: 'Joe Ed', role: 'barber', title: 'Junior barber', specialty: 'Signature and regular cuts', groups: ['him'], tiers: ['regular'], rate: 60, dailyPay: 500, chair: 5 },
  { id: 'renz', name: 'Renz', role: 'barber', title: 'Junior barber', specialty: 'Signature and regular cuts', groups: ['him'], tiers: ['regular'], rate: 60, dailyPay: 500, chair: 6 },
  { id: 'jay', name: 'Jay', role: 'barber', title: 'Junior barber', specialty: 'Signature and regular cuts', groups: ['him'], tiers: ['regular'], rate: 60, dailyPay: 500, chair: 7 },
  { id: 'vince', name: 'Vince', role: 'barber', title: 'Junior barber', specialty: 'Signature and regular cuts', groups: ['him'], tiers: ['regular'], rate: 60, dailyPay: 500, chair: 8 },
  { id: 'mac', name: 'Mac', role: 'barber', title: 'Junior barber', specialty: 'Signature and regular cuts', groups: ['him'], tiers: ['regular'], rate: 60, dailyPay: 500, chair: 9 },
  { id: 'dave', name: 'Dave', role: 'stylist', title: 'Stylist', specialty: 'Color, rebond and styling', groups: ['her'], rate: 55, dailyPay: 1000, productFee: { threshold: 1500, low: 50, high: 100 }, chair: 10 },
  { id: 'luz', name: 'Luz', role: 'stylist', title: 'Stylist', specialty: 'Hair treatments and styling', groups: ['her'], rate: 60, dailyPay: 0, productFee: { threshold: 1500, low: 50, high: 100 }, chair: 11 },
  { id: 'liza', name: 'Liza', role: 'stylist', title: 'Stylist', specialty: 'Hair treatments and styling', groups: ['her'], rate: 60, dailyPay: 0, productFee: { threshold: 1500, low: 50, high: 100 }, chair: 12 },
  { id: 'alex', name: 'Alex', role: 'reception', title: 'Receptionist', specialty: '', groups: [], rate: 0, dailyPay: 700 },
  { id: 'airyl', name: 'Airyl', role: 'reception', title: 'Receptionist', specialty: '', groups: [], rate: 0, dailyPay: 700 },
].map(b => ({ ...b, phone: '', days: [0, 1, 2, 3, 4, 5, 6], active: true }));
export const publicBarber = b => ({ id: b.id, name: b.name, role: b.role || 'barber', title: b.title || '', specialty: b.specialty || '', groups: b.groups || ['him'], tiers: b.tiers || [], days: b.days || [], chair: b.chair || '', photo: b.photo || '' });

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
