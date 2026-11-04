// Helpers shared by the website, the booking page and the dashboard.
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DEFAULT_POLICY = { deposit: 200, holdMinutes: 15, rescheduleHours: 48, lateMinutes: 20, leadMinutes: 60, bookAheadDays: 30, step: 30, maxReschedules: 2 };

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
export const blockTimes = (time, mins, step) => Array.from({ length: Math.max(1, Math.ceil(mins / step)) }, (_, i) => fromMin(toMin(time) + i * step));
export const isActiveSlot = (s, now) => !!s && (s.state === 'booked' || (s.state === 'held' && (s.holdUntil || 0) > now));
export function eligibleBarbers(info, services, date, barberId) {
  const groups = [...new Set(services.map(s => s.group || 'him'))], d = dowOf(date);
  return (info.barbers || []).filter(b => b.active !== false && (b.days || []).includes(d))
    .filter(b => groups.every(g => (b.groups || ['him']).includes(g)))
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
  for (let m = toMin(h.open); m + mins <= toMin(h.close); m += pol.step) {
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
const S60 = (id, name, price, group, cat, desc = '', extra = {}) => ({ id, name, price, mins: 60, group, cat, desc, active: true, ...extra });
export const STARTER = {
  shop: {
    name: 'REAL Barbers', wordmark: 'R3AL BARBERS', tagline: 'Best looks realized.',
    about: 'Deluxe haircuts with shampoo, hot towel and massage, beard sculpting, hair spa and color. Plus a full salon menu for her.',
    address: 'Cristimar Ave cor. L. Sumulong Memorial Circle, San Roque, Antipolo, Rizal',
    phone: '0906 567 4507', email: 'r3albarbers@gmail.com', facebook: 'https://www.facebook.com/R3ALBarbers',
    currency: '₱', loyaltyEvery: 10
  },
  policy: { ...DEFAULT_POLICY },
  hours: [0, 1, 2, 3, 4, 5, 6].map(d => ({ d, open: '09:00', close: '20:00', closed: false })),
  services: [
    S60('h1', 'Deluxe Haircut', 399, 'him', 'For him', 'Shampoo, hot towel, massage and aloe vera treatment'),
    S60('h2', 'Hair Spa', 550, 'him', 'For him', 'No haircut'),
    S60('h3', 'Dandruff Control', 650, 'him', 'For him', 'No haircut'),
    S60('h4', 'Hair Color (L’Oréal)', 750, 'him', 'For him', 'No haircut'),
    S60('h5', 'Basic Hair Art', 549, 'him', 'For him', 'No haircut'),
    S60('h6', 'Beard Shave with Cream', 200, 'him', 'For him'),
    S60('h7', 'Beard Sculpting', 230, 'him', 'For him'),
    S60('p1', 'Deluxe Haircut + Beard Sculpting', 600, 'him', 'Promos'),
    S60('p2', 'Deluxe Haircut + Hair Spa', 900, 'him', 'Promos'),
    S60('p3', 'Deluxe Haircut + Dandruff Control', 1000, 'him', 'Promos'),
    S60('p4', 'Deluxe Haircut + L’Oréal Hair Color', 1100, 'him', 'Promos'),
    S60('f1', 'Hair and Makeup', 1500, 'her', 'For her'),
    S60('f2', 'Women’s Regular Haircut', 275, 'her', 'For her'),
    S60('f3', 'Blow Dry with Shampoo', 230, 'her', 'For her'),
    S60('f4', 'Hair Styling', 470, 'her', 'For her', 'Curled or straightened'),
    S60('f5', 'Hair Color (Organique)', 1000, 'her', 'Color & treatments', '', { priceFrom: true }),
    S60('f6', 'Hair Color (Revlon)', 1200, 'her', 'Color & treatments', '', { priceFrom: true }),
    S60('f7', 'Hair Color (L’Oréal)', 1500, 'her', 'Color & treatments', '', { priceFrom: true }),
    S60('f8', 'Root Touch Up', 1000, 'her', 'Color & treatments'),
    S60('f9', 'Highlights', 1500, 'her', 'Color & treatments', '', { priceFrom: true }),
    S60('f10', 'Balayage', 3000, 'her', 'Color & treatments', '', { priceFrom: true }),
    S60('f11', 'Keratin Blow-out', 1500, 'her', 'Color & treatments'),
    S60('f12', 'Nano-Protein Treatment', 2500, 'her', 'Color & treatments'),
    S60('f13', 'Hair Rebond', 1500, 'her', 'Color & treatments', '', { priceFrom: true }),
    S60('f14', 'Moroccan Hot Oil Treatment', 450, 'her', 'Color & treatments'),
    S60('f15', 'Semi Di Lino Hot Oil Treatment', 550, 'her', 'Color & treatments'),
    S60('f16', 'Eyebrow Shaping', 120, 'her', 'For her')
  ],
  barbers: []
};
export const STARTER_STAFF = [
  { id: 'reymart', name: 'Reymart', title: 'Senior barber', specialty: 'Fades and deluxe cuts', groups: ['him'], rate: 50, chair: 1 },
  { id: 'lyndon', name: 'Lyndon', title: 'Senior barber', specialty: 'Classic cuts and beard sculpting', groups: ['him'], rate: 50, chair: 2 },
  { id: 'rod', name: 'Rod', title: 'Barber', specialty: 'Hair art and designs', groups: ['him'], rate: 50, chair: 3 },
  { id: 'angelo', name: 'Angelo', title: 'Barber', specialty: 'Haircuts and hair spa', groups: ['him'], rate: 50, chair: 4 },
  { id: 'dave', name: 'Dave', title: 'Stylist', specialty: 'Color, rebond and styling', groups: ['her'], rate: 50, chair: 5 }
].map(b => ({ ...b, phone: '', days: [0, 1, 2, 3, 4, 5, 6], active: true }));
export const publicBarber = b => ({ id: b.id, name: b.name, title: b.title || '', specialty: b.specialty || '', groups: b.groups || ['him'], days: b.days || [], chair: b.chair || '' });
