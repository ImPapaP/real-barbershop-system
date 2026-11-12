// Shop dashboard: schedule, checkout, income & expenses, barbers, clients, inventory, setup.
// Sign-in is Firebase Auth; only users listed in the admins/ collection get in (see firestore.rules).
import { db, demo, demoBar, resetDemo, login, logout, resetPassword, onAuth, uploadImage, deleteImage, call } from './fb.js';
import { buildXlsx, xlDate, xlTime, colName } from './xlsx.js';
import { esc, pad, DAYS, DAYS_LONG, MONTHS, toMin, sum, fmtTime, priceLabel, STARTER, STARTER_STAFF, publicBarber, DEFAULT_POLICY, startMs, resizeImage, initials, phoneKey, morph, brand, LOGO_LG, commissionOf } from './shared.js';

// ---------- constants ----------
const METHODS = ['Cash', 'GCash', 'Maya', 'Card', 'Bank transfer'];
const EXP_CATS = ['Rent', 'Electricity', 'Water', 'Internet', 'Supplies', 'Stock purchase', 'Wages', 'Maintenance', 'Marketing', 'Permits & taxes', 'Payment fees', 'Other'];
const TABS = [['overview', 'Overview'], ['schedule', 'Schedule'], ['checkout', 'Checkout'], ['money', 'Income & expenses'], ['team', 'Barbers'], ['clients', 'Clients'], ['stock', 'Inventory'], ['website', 'Website'], ['setup', 'Shop setup']];
const APPT = {
  pending_payment: { label: 'Awaiting deposit', kind: 'warn', icon: '◷' },
  booked: { label: 'Booked', kind: 'info', icon: '◷' },
  waiting: { label: 'Waiting', kind: 'warn', icon: '●' },
  inchair: { label: 'In chair', kind: 'accent', icon: '✂' },
  done: { label: 'Done', kind: 'good', icon: '✓' },
  noshow: { label: 'No-show', kind: 'bad', icon: '✕' },
  cancelled: { label: 'Cancelled', kind: 'mute', icon: '–' },
  expired: { label: 'Hold expired', kind: 'mute', icon: '–' },
  needs_attention: { label: 'Paid, slot taken', kind: 'bad', icon: '!' }
};
const STATUS_CHOICES = ['booked', 'waiting', 'inchair', 'done', 'noshow', 'cancelled'];
const PERIODS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['30d', 'Last 30 days'], ['year', 'This year'], ['custom', 'Custom']];
const COLS = ['staff', 'appointments', 'sales', 'expenses', 'customers', 'inventory', 'payouts', 'waitlist', 'attendance'];
const METHOD_NAMES = { gcash: 'GCash', paymaya: 'Maya', card: 'Card', qrph: 'QR Ph', grab_pay: 'GrabPay' };

// ---------- state ----------
const S = {
  ready: false, user: null, canAdmin: false, loginErr: '', loginBusy: false, loginMsg: '',
  info: null, infoMissing: false, slow: false,
  staff: [], appointments: [], sales: [], expenses: [], customers: [], inventory: [], payouts: [], waitlist: [], attendance: [], loaded: {}, reminding: '',
  schedDate: '', schedBarber: '', showExpired: false, period: 'month', from: '', to: '',
  clientQ: '', clientSort: 'recent', stockFilter: 'all', showArchived: false, pos: null, busy: false, uploading: ''
};
const unsubs = [];

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const newId = () => db.collection('x').doc().id;
const round2 = n => Math.round(n * 100) / 100;
const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
const normPhone = p => String(p || '').replace(/\D/g, '').replace(/^63/, '0');
function fmtDate(s, withYear) { if (!s) return ''; const d = parseYmd(s); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`; }
function shortDate(s) { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
const info = () => S.info || STARTER;
const pol = () => ({ ...DEFAULT_POLICY, ...(info().policy || {}) });
const cur = () => info().shop.currency || '₱';
function money(n, dp) { const v = Number(n) || 0; return (v < 0 ? '−' : '') + cur() + Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: dp ? 2 : 0, maximumFractionDigits: dp ? 2 : 0 }); }
function short(n) { const v = Math.abs(n); if (v >= 1e6) return cur() + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (v >= 1e3) return cur() + (n / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k'; return cur() + Math.round(n); }
const chip = meta => `<span class="chip chip-${meta.kind}"><b aria-hidden="true">${meta.icon}</b>${esc(meta.label)}</span>`;
const field = (label, input, id) => `<div class="field">${id ? `<label for="${id}">${esc(label)}</label>` : `<label>${esc(label)}</label>`}${input}</div>`;
const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
const services = () => info().services || [];
const activeServices = () => services().filter(s => s.active !== false);
const svcById = id => services().find(s => s.id === id);
const svcNames = ids => (ids || []).map(id => svcById(id)?.name || 'Removed service').join(', ');
const svcMins = ids => sum((ids || []).map(svcById).filter(Boolean), s => s.mins || pol().step) || pol().step;
const staffAll = () => S.staff;
const activeStaff = () => staffAll().filter(b => b.active !== false).sort((a, b) => (a.chair || 99) - (b.chair || 99) || a.name.localeCompare(b.name));
const staffById = id => staffAll().find(b => b.id === id);
const staffName = id => id ? (staffById(id)?.name || 'Former barber') : 'Any barber';
const av = b => b && b.photo ? `<img class="avatar" src="${esc(b.photo)}" alt="">` : `<span class="avatar" aria-hidden="true">${esc(initials(b ? b.name : '?'))}</span>`;
const custById = id => S.customers.find(c => c.id === id);
const methodName = k => METHOD_NAMES[k] || k || 'Online';
const depositPaid = a => a && a.deposit && a.deposit.status === 'paid' ? (a.deposit.amount || 0) : 0;
function depositChip(a) {
  const d = a.deposit || {};
  if (d.status === 'paid') return chip({ kind: 'good', icon: '✓', label: `${money(d.amount)} ${methodName(d.method)}` });
  if (d.status === 'kept') return chip({ kind: 'mute', icon: '•', label: `${money(d.amount)} kept` });
  if (d.status === 'refunded') return chip({ kind: 'mute', icon: '↩', label: 'Refunded' });
  return '';
}

const ICONS = {
  overview: '<path d="M3 3h6v6H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 11h6v6H3z"/>',
  schedule: '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/>',
  checkout: '<path d="M5 2h10v16l-2.5-1.5L10 18l-2.5-1.5L5 18z"/><path d="M8 6h4M8 9h4M8 12h2"/>',
  money: '<path d="M3 17h14"/><path d="M4 13l4-4 3 3 5-6"/>',
  team: '<circle cx="6" cy="14.5" r="2.5"/><circle cx="14" cy="14.5" r="2.5"/><path d="M7.6 12.6L15 3M12.4 12.6L5 3"/>',
  clients: '<circle cx="10" cy="7" r="3.2"/><path d="M3.5 17c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/>',
  stock: '<path d="M3 6l7-3 7 3v8l-7 3-7-3z"/><path d="M3 6l7 3 7-3M10 9v8"/>',
  setup: '<path d="M4 5h12M4 10h12M4 15h12"/><circle cx="8" cy="5" r="1.8"/><circle cx="13" cy="10" r="1.8"/><circle cx="7" cy="15" r="1.8"/>',
  site: '<path d="M3 9l7-6 7 6v8H3z"/><path d="M8 17v-5h4v5"/>',
  website: '<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><circle cx="7" cy="8" r="1.6"/><path d="M3 15l4.5-4.5 3 3L13 11l4.5 4.5"/>',
  out: '<path d="M8 4H4v12h4M12 6l4 4-4 4M16 10H8"/>'
};
const icon = n => `<svg class="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const mark = () => `<span class="wordmark" style="font-size:20px">${brand(info().shop.wordmark || info().shop.name, 'sm')}</span>`

// ---------- feedback & writes ----------
let toastT;
function toast(msg, kind) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (kind === 'bad' ? ' bad' : ''); t.hidden = false; void t.offsetWidth; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
function errText(e) {
  const c = String(e && e.code || '');
  if (c.includes('permission-denied')) return 'You don’t have permission to change shop records.';
  if (c.includes('resource-exhausted')) return 'Too many changes at once. Wait a moment and try again.';
  return 'That didn’t save. Check your connection and try again.';
}
async function put(col, id, data) { try { await db.collection(col).doc(id).set(data); return true; } catch (e) { console.error(e); toast(errText(e), 'bad'); return false; } }
async function patch(col, id, data) { try { await db.collection(col).doc(id).update(data); return true; } catch (e) { console.error(e); toast(errText(e), 'bad'); return false; } }
async function del(col, id) { try { await db.collection(col).doc(id).delete(); return true; } catch (e) { console.error(e); toast(errText(e), 'bad'); return false; } }
function armed(el) { if (el.dataset.armed) return true; const t = el.textContent; el.dataset.armed = '1'; el.textContent = 'Tap again to confirm'; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = t; } }, 3500); return false; }

// ---------- routing & render ----------
function route() { const h = location.hash.replace('#', ''); return TABS.some(t => t[0] === h) ? h : 'overview'; }
let raf = 0;
function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
function render() {
  const a = document.activeElement, id = a && a.id; let s = null, e = null;
  try { s = a.selectionStart; e = a.selectionEnd; } catch (_) {}
  const tab = route(), all = COLS.every(c => S.loaded[c]);
  S.enter = S.canAdmin && (tab !== S.lastTab || (all && !S.wasLoaded)); S.lastTab = tab; if (all) S.wasLoaded = true;
  if (S.enter || !$('#app').firstElementChild) $('#app').innerHTML = view(); else morph($('#app'), view());
  if (id && !$('#modal').contains(a)) { const n = document.getElementById(id); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (s != null) n.setSelectionRange(s, e); } catch (_) {} } }
  const cl = S.customers.map(c => `<option value="${esc(c.name)}">${esc(c.phone || '')}</option>`).join('');
  if (cl !== S.custListHtml) { S.custListHtml = cl; $('#cust-list').innerHTML = cl; }
}
function view() { return demoBar() + inner(); }
function inner() {
  if (!S.ready) return `<div class="center"><div><span class="spinner"></span><p class="muted">Opening the dashboard…</p></div></div>`;
  if (!S.user) return loginView();
  if (!S.canAdmin) return gate('No dashboard access', `You’re signed in as ${S.user.email}, but this account isn’t an admin yet. Add its user ID to the admins collection (README, step 4).`, true);
  const tab = route();
  const attention = S.appointments.filter(a => a.status === 'needs_attention' || (a.conflict && ['booked', 'pending_payment'].includes(a.status))).length;
  const low = S.inventory.filter(i => i.stock <= i.reorder).length;
  const badges = { schedule: attention, stock: low };
  return `<div class="admin">
    <aside class="side">
      <a href="#overview" style="text-decoration:none;color:inherit" aria-label="Dashboard home">${mark()}</a>
      <nav class="side-nav" aria-label="Dashboard">${TABS.map(([id, l]) => `<a href="#${id}" ${id === tab ? 'aria-current="page"' : ''}>${icon(id)}<span class="lbl">${l}</span>${badges[id] ? `<span class="badge" aria-label="${badges[id]} need attention">${badges[id]}</span>` : ''}</a>`).join('')}</nav>
      <div class="side-foot"><a class="btn btn-sm btn-ghost" href="../" target="_blank" rel="noopener">${icon('site')}<span class="lbl">Website</span></a><button class="btn btn-sm btn-ghost" data-act="logout">${icon('out')}<span class="lbl">Sign out</span></button></div>
    </aside>
    <main class="main"><div class="main-in${S.enter ? ' enter' : ''}">${loadingNote()}${S.infoMissing ? setupBanner() : ''}${TAB_VIEWS[tab]()}</div></main>
  </div>`;
}
function gate(title, msg, signOut) { return `<div class="center"><div><img class="logo-hero" src="${LOGO_LG}" alt="" width="180" height="180"><h1 style="font:400 30px/1.1 var(--f-slab)">${esc(title)}</h1><p class="muted">${esc(msg)}</p>${signOut ? '<button class="btn" data-act="logout">Sign out</button>' : ''}</div></div>`; }
function loginView() {
  return `<div class="center"><form class="panel stack" data-form="login" style="width:min(100%,380px);text-align:left">
    <img class="logo-hero" src="${LOGO_LG}" alt="${esc(info().shop.name)}" width="180" height="180"><h1 style="font:400 28px/1.1 var(--f-slab);text-align:center">Staff sign in</h1>
    ${field('Email', `<input id="l-email" name="email" type="email" autocomplete="username" required>`, 'l-email')}
    ${field('Password', `<input id="l-pass" name="pass" type="password" autocomplete="current-password" required>`, 'l-pass')}
    ${demo ? '<p class="hint">Demo: any email and password signs you in.</p>' : ''}${S.loginErr ? `<p class="err" role="alert">${esc(S.loginErr)}</p>` : ''}${S.loginMsg ? `<p class="hint">${esc(S.loginMsg)}</p>` : ''}
    <button class="btn btn-primary btn-lg" type="submit" ${S.loginBusy ? 'disabled' : ''}>${S.loginBusy ? 'Signing in…' : 'Sign in'}</button>
    <button type="button" class="btn btn-ghost btn-sm" data-act="forgot">Forgot password?</button>
  </form></div>`;
}
function loadingNote() {
  if (!COLS.some(c => !S.loaded[c])) return '';
  return `<div class="banner" role="status"><span>${S.slow ? 'Shop records can’t be reached right now. What you see may be incomplete.' : 'Loading shop records…'}</span></div>`;
}
function setupBanner() { return `<div class="banner"><span><b>Set up your shop.</b> Load the REAL Barbers starter menu and team, then edit them in Shop setup. The website takes bookings once this is saved.</span><button class="btn btn-sm btn-primary" data-act="initInfo">Load starter menu</button></div>`; }
function pageHead(eyebrow, title, actions) { return `<header class="page-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1></div><div class="actions">${actions || ''}</div></header>`; }

// ---------- metrics ----------
function periodRange(p) {
  const t = today(), d = parseYmd(t);
  switch (p) {
    case 'today': return [t, t];
    case 'week': { const s = addDays(t, -((d.getDay() + 6) % 7)); return [s, addDays(s, 6)]; }
    case 'month': return [t.slice(0, 8) + '01', ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
    case 'lastmonth': return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
    case '30d': return [addDays(t, -29), t];
    case 'year': return [t.slice(0, 4) + '-01-01', t.slice(0, 4) + '-12-31'];
    case 'custom': { const a = S.from || addDays(t, -6), b = S.to || t; return a <= b ? [a, b] : [b, a]; }
  }
  return [t, t];
}
const inR = (d, r) => d >= r[0] && d <= r[1];
const netOf = s => (s.total || 0) - (s.tip || 0);

// ---------- barber pay: guaranteed daily pay + commission ----------
// For each day worked a barber earns their guaranteed daily pay (e.g. ₱700 Deluxe, ₱500 Regular),
// plus their commission rate (e.g. 60%) of every service they did, after discounts. The shop keeps the rest.
// A day counts as worked when they rang up a sale that day, or when it's one of their scheduled days and
// they weren't marked absent (Schedule → Who's in). Days are only counted from the first day the shop
// used this system (its first sale) or the barber's start date, whichever is later, and never in the future.
let payCache = { ref: null };
function payIndex() {
  if (payCache.ref === S.sales && payCache.att === S.attendance) return payCache;
  const saleDays = new Set(S.sales.map(x => `${x.date}_${x.barberId}`));
  const first = S.sales.reduce((m, x) => (!m || x.date < m ? x.date : m), '') || today();
  const marks = new Map(S.attendance.map(a => [a.id, a.present]));
  return (payCache = { ref: S.sales, att: S.attendance, saleDays, first, marks });
}
const payStart = b => { const f = payIndex().first; return b.since && b.since > f ? b.since : f; };
const scheduledIn = (b, d) => (b.days || []).includes(parseYmd(d).getDay()) && b.active !== false && d >= payStart(b);
function workedOn(b, d) {
  const P = payIndex();
  if (d > today() || d < payStart(b)) return false;
  if (P.saleDays.has(`${d}_${b.id}`)) return true;
  const m = P.marks.get(`${d}_${b.id}`);
  return m === undefined ? scheduledIn(b, d) : m;
}
function daysIn(r) { const out = [], end = r[1] < today() ? r[1] : today(); for (let d = r[0]; d <= end; d = addDays(d, 1)) out.push(d); return out; }
function payFor(b, r) {
  const x = S.sales.filter(v => v.barberId === b.id && inR(v.date, r));
  const worked = daysIn(r).filter(d => workedOn(b, d)), days = worked.length, daily = Number(b.dailyPay) || 0;
  const comm = round2(sum(x, v => v.commission)), tips = sum(x, v => v.tip), base = days * daily;
  const svcOf = v => Math.max(0, (v.svcTotal || 0) - (v.discount || 0)), svc = sum(x, svcOf);
  // Does he earn his keep? The shop's share of his services (100% − his rate) has to cover his daily pay.
  const keepRate = Math.max(0, 1 - (Number(b.rate) || 0) / 100), share = round2(svc - comm);
  const need = keepRate ? daily / keepRate : 0; // services needed per day to cover the daily pay
  const covered = worked.filter(d => sum(x.filter(v => v.date === d), svcOf) * keepRate >= daily - 0.005).length;
  return { x, days, daily, base, comm, tips, svc, share, need, covered, net: round2(share - base), fills: round2(Math.max(0, base - share)),
    perDay: days ? svc / days : 0, pay: round2(base + comm), total: round2(base + comm + tips) };
}
const basePayOn = d => sum(staffAll(), b => workedOn(b, d) ? Number(b.dailyPay) || 0 : 0);
function summary(r) {
  const sales = S.sales.filter(s => inR(s.date, r)), exps = S.expenses.filter(e => inR(e.date, r));
  const kept = S.appointments.filter(a => inR(a.date, r) && a.deposit && a.deposit.status === 'kept');
  const keptAmt = sum(kept, a => a.deposit.amount);
  const net = sum(sales, netOf), comm = sum(sales, s => s.commission), exp = sum(exps, e => e.amount);
  const base = sum(daysIn(r), basePayOn), staffPay = round2(comm + base);
  return {
    sales, exps, kept, keptAmt, net, comm, base, staffPay, exp, tips: sum(sales, s => s.tip), disc: sum(sales, s => s.discount),
    svc: sum(sales, s => s.svcTotal), prod: sum(sales, s => s.prodTotal), deposits: sum(sales, s => s.depositCredit),
    income: net + keptAmt, profit: round2(net + keptAmt - comm - base - exp), count: sales.length, avg: sales.length ? net / sales.length : 0
  };
}
function rangeLabel(r) { return r[0] === r[1] ? fmtDate(r[0], true) : `${fmtDate(r[0])} – ${fmtDate(r[1], true)}`; }
function buckets(r) {
  const days = Math.round((parseYmd(r[1]) - parseYmd(r[0])) / 864e5) + 1;
  if (days <= 62) { const out = []; for (let i = 0; i < days; i++) { const d = addDays(r[0], i); out.push({ key: d, label: shortDate(d), tip: fmtDate(d), match: x => x === d }); } return out; }
  const out = []; let y = +r[0].slice(0, 4), m = +r[0].slice(5, 7);
  while (`${y}-${pad(m)}` <= r[1].slice(0, 7)) { const k = `${y}-${pad(m)}`; out.push({ key: k, label: MONTHS[m - 1], tip: `${MONTHS[m - 1]} ${y}`, match: x => x.slice(0, 7) === k }); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
function niceScale(v) { if (!(v > 0)) v = 100; const raw = v / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; const n = Math.max(1, Math.ceil(v / step - 1e-9)); return { max: step * n, ticks: Array.from({ length: n + 1 }, (_, i) => i * step) }; }
function barChart(bk, series) {
  const { max, ticks } = niceScale(Math.max(...series.flatMap(s => s.values), 0));
  const every = Math.ceil(bk.length / 10);
  const cols = bk.map((b, i) => `<div class="col" data-tip="${esc(b.tip + '\n' + series.map(s => `${s.name}: ${money(s.values[i])}`).join('\n'))}">${series.map(s => `<i class="bar ${s.cls}" style="height:${(s.values[i] / max * 100).toFixed(2)}%"></i>`).join('')}</div>`).join('');
  return `${series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:var(--${s.cls})"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}
  <div class="chart"><div class="plot" role="img" aria-label="${esc(series.map(s => s.name).join(' and '))} chart">
    ${ticks.map(t => `<div class="gl" style="bottom:${(t / max * 100).toFixed(2)}%"><span>${short(t)}</span></div>`).join('')}
    <div class="cols">${cols}</div></div>
    <div class="xl" aria-hidden="true">${bk.map((b, i) => `<span>${i % every === 0 ? esc(b.label) : ''}</span>`).join('')}</div></div>
  <details class="tbl-view"><summary>View as table</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Period</th>${series.map(s => `<th class="r">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>
    ${bk.map((b, i) => `<tr><td>${esc(b.tip)}</td>${series.map(s => `<td class="r">${money(s.values[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function hbars(rows, cls) {
  if (!rows.length) return '<p class="empty">Nothing recorded in this period.</p>';
  const max = Math.max(...rows.map(r => r.value), 1);
  return `<div class="hbars">${rows.map(r => `<div class="hb" data-tip="${esc(r.label + '\n' + (r.tip || money(r.value)))}"><span class="lb">${esc(r.label)}</span><span class="track"><span class="fill ${cls || ''}" style="display:block;width:${(r.value / max * 100).toFixed(1)}%"></span></span><span class="vl">${r.text || money(r.value)}</span></div>`).join('')}</div>`;
}
function delta(curv, prev, label) {
  if (!prev) return `<span class="d">${esc(label)}: ${money(prev)}</span>`;
  const p = (curv - prev) / prev * 100, up = p >= 0;
  return `<span class="d"><span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%</span> vs ${esc(label)}</span>`;
}
const kpi = (k, v, d) => `<div class="kpi"><span class="k">${esc(k)}</span><span class="v">${v}</span>${d || ''}</div>`;

// ---------- customers ----------
function custStats() {
  const m = {};
  for (const s of S.sales) { if (!s.customerId) continue; const x = m[s.customerId] || (m[s.customerId] = { visits: 0, spent: 0, last: '', barbers: {} }); x.visits++; x.spent += netOf(s); if (s.date > x.last) x.last = s.date; if (s.barberId) x.barbers[s.barberId] = (x.barbers[s.barberId] || 0) + 1; }
  return m;
}
function usualBarber(st) { if (!st) return ''; const e = Object.entries(st.barbers).sort((a, b) => b[1] - a[1])[0]; return e ? staffName(e[0]) : ''; }
const loyaltyN = () => Math.max(0, parseInt(info().shop.loyaltyEvery, 10) || 0);
function matchCustomer(name, phone) {
  const p = normPhone(phone);
  if (p.length >= 7) { const c = S.customers.find(c => normPhone(c.phone) === p); if (c) return c; }
  const n = String(name || '').trim().toLowerCase(); if (!n || n === 'walk-in') return null;
  return S.customers.find(c => c.name.trim().toLowerCase() === n) || null;
}
async function ensureCustomer(name, phone, email, save) {
  const found = matchCustomer(name, phone);
  if (found) return found.id;
  if (!save || !String(name || '').trim() || name.trim().toLowerCase() === 'walk-in') return '';
  const id = newId();
  return await put('customers', id, { name: name.trim(), phone: String(phone || '').trim(), phoneKey: phoneKey(phone), email: email || '', notes: '', createdAt: Date.now() }) ? id : '';
}

// ---------- appointments ----------
const apptsOn = d => S.appointments.filter(a => a.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
const visible = a => S.showExpired || a.status !== 'expired';
function apptRow(a, compact) {
  const canCheckout = ['booked', 'waiting', 'inchair'].includes(a.status);
  const actions = `${canCheckout ? `<button class="btn btn-sm btn-primary" data-act="checkoutAppt" data-id="${esc(a.id)}">Checkout</button>` : ''}${a.status === 'done' && a.saleId ? `<button class="btn btn-sm" data-act="showSale" data-id="${esc(a.saleId)}">Receipt</button>` : ''}`;
  const flag = a.conflict && ['booked', 'pending_payment'].includes(a.status) ? ' ' + chip({ kind: 'bad', icon: '!', label: 'Overlaps another booking' }) : '';
  if (compact) return `<li>${a.barberId ? av(staffById(a.barberId)) : ''}<span class="t">${a.source === 'walk-in' ? `#${esc(a.queueNo || '')}` : fmtTime(a.time)}</span><div class="grow"><b>${esc(a.name || 'Walk-in')}</b><div class="sub">${esc(svcNames(a.serviceIds))} · ${esc(staffName(a.barberId))}</div></div>${chip(APPT[a.status] || APPT.booked)}</li>`;
  const choices = STATUS_CHOICES.includes(a.status) ? STATUS_CHOICES : [a.status, ...STATUS_CHOICES];
  return `<tr>
    <td class="num nowrap"><b>${a.source === 'walk-in' ? `Walk-in #${esc(a.queueNo || '')}` : fmtTime(a.time)}</b>${a.source === 'walk-in' ? `<div class="muted small">arrived ${fmtTime(a.time)}</div>` : ''}</td>
    <td><b>${esc(a.name || 'Walk-in')}</b>${a.code ? ` <span class="muted small">${esc(a.code)}</span>` : ''}${a.phone ? `<div class="muted small">${esc(a.phone)}</div>` : ''}</td>
    <td>${esc(svcNames(a.serviceIds))}${a.notes ? `<div class="muted small">${esc(a.notes)}</div>` : ''}${flag}</td>
    <td>${esc(staffName(a.barberId))}</td>
    <td><span class="muted small">${a.source === 'online' ? 'Online' : a.source === 'walk-in' ? 'Walk-in' : 'Phone / in person'}</span><div>${depositChip(a)}</div></td>
    <td><select data-change="apptStatus" data-id="${esc(a.id)}" aria-label="Status for ${esc(a.name || 'walk-in')}">${choices.map(k => opt(k, (APPT[k] || APPT.booked).label, k === a.status)).join('')}</select></td>
    <td><div class="acts">${actions}<button class="btn btn-sm btn-ghost" data-act="editAppt" data-id="${esc(a.id)}">Edit</button></div></td>
  </tr>`;
}

// ---------- tab: overview ----------
function vOverview() {
  const t = today(), s = summary([t, t]), nowT = nowHM(), lw = summary([addDays(t, -7), addDays(t, -7)]);
  lw.net = sum(lw.sales.filter(x => (x.time || '') <= nowT), netOf);
  const appts = apptsOn(t), waiting = appts.filter(a => a.status === 'waiting').length, inchair = appts.filter(a => a.status === 'inchair').length;
  const upcoming = appts.filter(a => a.status === 'booked');
  const r14 = [addDays(t, -13), t], bk = buckets(r14);
  const vals = bk.map(b => sum(S.sales.filter(x => b.match(x.date)), netOf));
  const m = summary(periodRange('month')), wk = summary(periodRange('week'));
  const byB = activeStaff().map(b => ({ label: b.name, value: sum(wk.sales.filter(x => x.barberId === b.id), netOf), tip: `${wk.sales.filter(x => x.barberId === b.id).length} clients this week` })).sort((a, b) => b.value - a.value);
  const low = S.inventory.filter(i => i.stock <= i.reorder).sort((a, b) => a.stock - b.stock);
  const issues = S.appointments.filter(a => a.status === 'needs_attention' || (a.conflict && ['booked', 'pending_payment'].includes(a.status)));
  const onlineToday = appts.filter(a => a.source === 'online' && a.status !== 'expired').length;
  return `${pageHead(fmtDate(t, true), 'Overview', `<button class="btn" data-act="newWalkin">+ Walk-in</button><button class="btn" data-act="newBooking">+ Booking</button><a class="btn btn-primary" href="#checkout">${icon('checkout')}Checkout</a>`)}
  <section class="kpis" aria-label="Today">
    ${kpi('Sales today', money(s.net), delta(s.net, lw.net, 'this time last ' + DAYS[parseYmd(t).getDay()]))}
    ${kpi('Clients served', s.count, `<span class="d">${upcoming.length} more booked today · ${onlineToday} online</span>`)}
    ${kpi('Average ticket', money(s.avg), `<span class="d">Tips today ${money(s.tips)}</span>`)}
    ${kpi('In the shop now', `${waiting + inchair}`, `<span class="d">${inchair} in chair · ${waiting} waiting</span>`)}
  </section>
  <div class="grid2">
    <section class="panel"><div class="panel-h"><h2>Sales, last 14 days</h2><a class="btn btn-sm btn-ghost" href="#money">Full report</a></div>${barChart(bk, [{ name: 'Sales', values: vals, cls: 's1' }])}</section>
    <section class="panel"><div class="panel-h"><h2>Today’s chairs</h2><a class="btn btn-sm btn-ghost" href="#schedule">Schedule</a></div>
      ${appts.filter(a => !['cancelled', 'expired'].includes(a.status)).length ? `<ul class="list">${appts.filter(a => !['cancelled', 'expired'].includes(a.status)).map(a => apptRow(a, true)).join('')}</ul>` : '<p class="empty">No bookings or walk-ins yet today.</p>'}</section>
  </div>
  <div class="grid3">
    <section class="panel"><div class="panel-h"><h2>This month</h2></div>
      <div class="totals" style="font-size:14px">
        <div><span>Sales</span><b>${money(m.net)}</b></div>
        ${m.keptAmt ? `<div><span>Kept deposits</span><span>${money(m.keptAmt)}</span></div>` : ''}
        <div><span>Barbers’ daily pay</span><span>${money(-m.base)}</span></div>
        <div><span>Barber commissions</span><span>${money(-m.comm)}</span></div>
        <div><span>Expenses</span><span>${money(-m.exp)}</span></div>
        <div style="border-top:1px solid var(--line-2);padding-top:8px"><b>Net profit</b><b class="${m.profit >= 0 ? 'up' : 'down'}">${money(m.profit)}</b></div>
      </div></section>
    <section class="panel"><div class="panel-h"><h2>Barbers this week</h2></div>${hbars(byB)}</section>
    <section class="panel"><div class="panel-h"><h2>Needs attention</h2></div>
      <ul class="list">
        ${issues.map(a => `<li><span class="grow"><b>${esc(a.name)}</b><span class="sub" style="display:block">${a.status === 'needs_attention' ? 'Paid deposit but the slot was taken. Call to rebook or refund.' : 'Booking overlaps another one'} · ${fmtDate(a.date)} ${fmtTime(a.time)}</span></span><button class="btn btn-sm" data-act="editAppt" data-id="${esc(a.id)}">Open</button></li>`).join('')}
        ${low.slice(0, 4).map(i => `<li><span class="grow"><b>${esc(i.name)}</b><span class="sub" style="display:block">${i.stock} ${esc(i.unit || 'left')} · reorder at ${i.reorder}</span></span>${chip(i.stock <= 0 ? { kind: 'bad', icon: '✕', label: 'Out' } : { kind: 'warn', icon: '!', label: 'Low' })}</li>`).join('')}
        ${!issues.length && !low.length ? '<li class="muted">All clear. No booking problems and nothing to restock.</li>' : ''}
      </ul></section>
  </div>`;
}

// ---------- tab: schedule ----------
// Who's in: decides which days count for guaranteed daily pay. Scheduled days count unless marked absent.
function whosIn(d) {
  const P = payIndex(), staff = activeStaff().sort((a, b) => (a.chair || 99) - (b.chair || 99));
  if (!staff.length) return '';
  const future = d > today();
  return `<section class="panel"><div class="panel-h"><h2>Who’s in</h2><span class="muted small">${future ? 'Mark day-offs ahead of time.' : 'Tap to mark someone absent or in on their day off.'} Each day in earns the barber’s daily pay.</span></div>
    <div class="whos">${staff.map(b => {
      const sold = P.saleDays.has(`${d}_${b.id}`), mark = P.marks.get(`${d}_${b.id}`), on = sold || (mark === undefined ? (b.days || []).includes(parseYmd(d).getDay()) : mark);
      const note = sold ? 'Has sales' : mark === undefined ? (on ? 'Scheduled' : 'Day off') : (on ? 'Came in' : 'Absent');
      return `<button type="button" class="who${on ? ' on' : ''}" data-act="toggleIn" data-id="${esc(b.id)}" aria-pressed="${on}" ${sold ? 'disabled' : ''} title="${esc(note)}">${av(b)}<span><b>${esc(b.name)}</b><small>${note}${on && b.dailyPay ? ' · ' + money(b.dailyPay) : ''}</small></span></button>`;
    }).join('')}</div></section>`;
}
function vSchedule() {
  if (!S.schedDate) S.schedDate = today();
  const d = S.schedDate, isToday = d === today();
  const all = apptsOn(d);
  let appts = all.filter(visible);
  if (S.schedBarber) appts = appts.filter(a => a.barberId === S.schedBarber || (!a.barberId && S.schedBarber === '__any'));
  const queue = isToday ? all.filter(a => a.status === 'waiting').sort((a, b) => (a.queueNo || 0) - (b.queueNo || 0)) : [];
  const counts = Object.keys(APPT).map(k => [k, all.filter(a => a.status === k).length]).filter(x => x[1]);
  const expiredN = all.filter(a => a.status === 'expired').length;
  const issues = S.appointments.filter(a => a.status === 'needs_attention');
  return `${pageHead(isToday ? 'Today' : fmtDate(d, true), 'Schedule', `<button class="btn" data-act="newWalkin">+ Walk-in</button><button class="btn btn-primary" data-act="newBooking">+ Booking</button>`)}
  ${issues.length ? `<section class="panel"><div class="panel-h"><h2>Paid, but the slot was taken</h2><span class="muted small">Call these clients to rebook, or refund them in PayMongo</span></div><div class="tbl-wrap"><table class="tbl"><tbody>
    ${issues.map(a => `<tr><td class="num nowrap"><b>${fmtDate(a.date)}</b><div class="muted small">${fmtTime(a.time)}</div></td><td><b>${esc(a.name)}</b><div class="muted small">${esc(a.phone)} · ${esc(a.email || '')}</div></td><td>${esc(svcNames(a.serviceIds))}</td><td>${depositChip(a)}</td><td><div class="acts"><button class="btn btn-sm btn-primary" data-act="editAppt" data-id="${esc(a.id)}">Rebook</button></div></td></tr>`).join('')}
  </tbody></table></div></section>` : ''}
  ${isToday ? `<section class="panel"><div class="panel-h"><h2>Walk-in queue</h2><span class="muted small">Served in order of arrival</span></div>
    ${queue.length ? `<ul class="list">${queue.map(a => `<li><span class="qno">#${esc(a.queueNo || '')}</span><div class="grow"><b>${esc(a.name || 'Walk-in')}</b><div class="sub">${esc(svcNames(a.serviceIds))} · waiting ${Math.max(0, Math.round((Date.now() - (a.createdAt || Date.now())) / 60000))} min</div></div>
      <select data-change="apptBarber" data-id="${esc(a.id)}" aria-label="Barber for #${esc(a.queueNo || '')}" style="width:auto">${opt('', 'Any barber', !a.barberId)}${activeStaff().map(b => opt(b.id, b.name, b.id === a.barberId)).join('')}</select>
      <button class="btn btn-sm btn-primary" data-act="startAppt" data-id="${esc(a.id)}">Start</button></li>`).join('')}</ul>` : '<p class="empty">Nobody waiting. Add a walk-in when someone arrives.</p>'}</section>` : ''}
  ${whosIn(d)}
  ${waitlistPanel(d)}
  <section class="panel">
    <div class="toolbar" style="margin-bottom:14px">
      <div class="datenav"><button class="btn btn-sm" data-act="dayShift" data-n="-1" aria-label="Previous day">‹</button><input type="date" id="sch-date" data-bind="schedDate" data-live value="${esc(d)}" aria-label="Date"><button class="btn btn-sm" data-act="dayShift" data-n="1" aria-label="Next day">›</button>${isToday ? '' : '<button class="btn btn-sm btn-ghost" data-act="dayToday">Today</button>'}</div>
      <div class="row"><select id="sch-barber" data-bind="schedBarber" data-live style="width:auto" aria-label="Filter by barber">${opt('', 'All barbers', !S.schedBarber)}${activeStaff().map(b => opt(b.id, b.name, b.id === S.schedBarber)).join('')}${opt('__any', 'Unassigned', S.schedBarber === '__any')}</select>
      ${expiredN ? `<label class="row small"><input type="checkbox" id="sch-exp" data-bind="showExpired" data-live ${S.showExpired ? 'checked' : ''}> Show ${expiredN} unpaid hold${expiredN > 1 ? 's' : ''}</label>` : ''}</div>
    </div>
    ${counts.length ? `<div class="row" style="margin-bottom:12px">${counts.map(([k, n]) => chip({ ...APPT[k], label: `${n} ${APPT[k].label.toLowerCase()}` })).join('')}</div>` : ''}
    ${appts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Client</th><th>Services</th><th>Barber</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>${appts.map(a => apptRow(a)).join('')}</tbody></table></div>` : `<p class="empty">Nothing scheduled ${isToday ? 'today' : 'on this day'}. Online bookings appear here as soon as the deposit is paid.</p>`}
  </section>`;
}

function waitlistPanel(d) {
  const list = S.waitlist.filter(w => w.date === d).sort((a, b) => a.createdAt - b.createdAt);
  if (!list.length) return '';
  const WIN = { any: 'Any time', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  return `<section class="panel"><div class="panel-h"><h2>Waitlist</h2><span class="muted small">Texted automatically, in order, when a matching slot opens</span></div><ul class="list">${list.map((w, i) => `<li><span class="qno" style="font-size:20px;width:34px">${i + 1}</span><div class="grow"><b>${esc(w.name)}</b> <span class="muted small">${esc(w.phone)}</span><div class="sub">${esc(WIN[w.window] || 'Any time')} · ${esc(w.barberId ? staffName(w.barberId) : 'Any barber')}${(w.serviceIds || []).length ? ' · ' + esc(svcNames(w.serviceIds)) : ''}</div></div>
    ${w.status === 'notified' ? chip({ kind: 'good', icon: '✓', label: `Texted${w.notifiedSlot ? ': ' + w.notifiedSlot : ''}` }) : chip({ kind: 'warn', icon: '◷', label: 'Waiting' })}<button class="btn btn-sm btn-ghost" data-act="delWait" data-id="${esc(w.id)}">Remove</button></li>`).join('')}</ul></section>`;
}

// ---------- tab: checkout ----------
function blankPos() { return { lines: [], name: '', phone: '', barberId: '', discount: '', discountNote: '', tip: '', method: 'Cash', cash: '', apptId: '', deposit: 0, depositMethod: '', pick: 'services', save: true }; }
function posTotals(p) {
  const svc = sum(p.lines.filter(l => l.kind === 'service'), l => l.price * l.qty), prod = sum(p.lines.filter(l => l.kind === 'product'), l => l.price * l.qty);
  const disc = Math.min(num(p.discount), svc + prod), tip = Math.max(0, num(p.tip));
  const total = round2(svc + prod - disc + tip), deposit = Math.min(p.deposit || 0, total);
  return { svc, prod, sub: svc + prod, disc, tip, total, deposit, collect: round2(total - deposit) };
}
function vCheckout() {
  if (!S.pos) S.pos = blankPos();
  const p = S.pos, T = posTotals(p), cust = matchCustomer(p.name, p.phone), st = cust ? custStats()[cust.id] : null, N = loyaltyN();
  const visitNo = (st ? st.visits : 0) + 1;
  const loyal = cust && N ? (visitNo % N === 0 ? `<p class="hint"><b>Free cut due.</b> This is ${esc(cust.name)}’s visit #${visitNo}.</p>` : `<p class="hint">${esc(cust.name)} · visit #${visitNo} · ${N - (visitNo % N)} more to a free cut</p>`) : '';
  const prods = S.inventory.filter(i => i.cat === 'Retail');
  const appt = p.apptId ? S.appointments.find(a => a.id === p.apptId) : null;
  const recent = S.sales.filter(s => s.date === today()).sort((a, b) => (b.at || 0) - (a.at || 0));
  const needBarber = p.lines.some(l => l.kind === 'service') && !p.barberId;
  const change = p.method === 'Cash' && num(p.cash) > 0 ? num(p.cash) - T.collect : null;
  const groups = [...new Set(activeServices().map(s => s.cat || 'Services'))];
  return `${pageHead(appt ? `For ${appt.name || 'walk-in'} · ${appt.source === 'walk-in' ? 'walk-in #' + (appt.queueNo || '') : fmtTime(appt.time)}` : 'Ring up a sale', 'Checkout', p.lines.length || p.name ? `<button class="btn" data-act="posClear">Clear ticket</button>` : '')}
  <div class="pos">
    <section class="panel">
      <div class="panel-h"><div class="seg" role="group" aria-label="Item type"><button type="button" data-act="posPick" data-v="services" aria-pressed="${p.pick === 'services'}">Services</button><button type="button" data-act="posPick" data-v="products" aria-pressed="${p.pick === 'products'}">Products</button></div><span class="muted small">Tap to add to the ticket</span></div>
      ${p.pick === 'services'
        ? groups.map(g => `<p class="eyebrow" style="margin:6px 0 8px">${esc(g)}</p><div class="tiles" style="margin-bottom:12px">${activeServices().filter(s => (s.cat || 'Services') === g).map(s => `<button type="button" class="tile" data-act="posAdd" data-kind="service" data-ref="${esc(s.id)}"><b>${esc(s.name)}</b><small>${esc(s.mins)} min</small><span>${esc(priceLabel(s, cur()))}</span></button>`).join('')}</div>`).join('')
        : prods.length ? `<div class="tiles">${prods.map(i => `<button type="button" class="tile" data-act="posAdd" data-kind="product" data-ref="${esc(i.id)}" ${i.stock <= 0 ? 'disabled' : ''}><b>${esc(i.name)}</b><small>${i.stock <= 0 ? 'Out of stock' : i.stock + ' in stock'}</small><span>${money(i.price)}</span></button>`).join('')}</div>` : '<p class="empty">No retail products yet. Add them in Inventory with type “Retail”.</p>'}
    </section>
    <section>
      <div class="ticket">
        <div class="row" style="justify-content:space-between"><h2>Ticket</h2><span class="muted small num">${fmtDate(today())} · ${fmtTime(nowHM())}</span></div>
        <div class="fgrid">
          ${field('Client', `<input id="pos-name" data-bind="pos.name" data-live list="cust-list" value="${esc(p.name)}" placeholder="Walk-in" autocomplete="off">`, 'pos-name')}
          ${field('Phone', `<input id="pos-phone" data-bind="pos.phone" data-live value="${esc(p.phone)}" inputmode="tel" placeholder="Optional">`, 'pos-phone')}
        </div>
        ${loyal}
        ${field('Barber', `<select id="pos-barber" data-bind="pos.barberId" data-live>${opt('', 'Choose barber', !p.barberId)}${activeStaff().map(b => opt(b.id, `${b.name} · ${b.rate || 0}%`, b.id === p.barberId)).join('')}</select>`, 'pos-barber')}
        <div class="lines">${p.lines.length ? p.lines.map((l, i) => `<div class="line"><span class="nm">${esc(l.name)}</span><span class="qty"><button type="button" data-act="posQty" data-i="${i}" data-d="-1" aria-label="One less">−</button><span>${l.qty}</span><button type="button" data-act="posQty" data-i="${i}" data-d="1" aria-label="One more">+</button></span><span class="num">${money(l.price * l.qty)}</span><button type="button" class="icon-btn" data-act="posDel" data-i="${i}" aria-label="Remove ${esc(l.name)}">✕</button></div>`).join('') : '<p class="muted small" style="padding:10px 0">No items yet. Tap a service or product.</p>'}</div>
        <p class="muted small">For “from” prices, change the amount with the price field after adding.</p>
        ${p.lines.length ? `<div class="fgrid">${p.lines.map((l, i) => l.kind === 'service' ? field(`Price: ${l.name}`, `<input id="pos-price-${i}" data-bind="pos.lines.${i}.price" data-live inputmode="decimal" value="${esc(l.price)}">`, `pos-price-${i}`) : '').join('')}</div>` : ''}
        <div class="fgrid">
          ${field('Discount (' + cur() + ')', `<input id="pos-disc" data-bind="pos.discount" data-live inputmode="decimal" value="${esc(p.discount)}" placeholder="0">`, 'pos-disc')}
          ${field('Tip for barber (' + cur() + ')', `<input id="pos-tip" data-bind="pos.tip" data-live inputmode="decimal" value="${esc(p.tip)}" placeholder="0">`, 'pos-tip')}
        </div>
        <div class="row"><button type="button" class="btn btn-sm" data-act="posDisc" data-v="sc">Senior / PWD 20%</button><button type="button" class="btn btn-sm" data-act="posDisc" data-v="student">Student 10%</button><button type="button" class="btn btn-sm" data-act="posDisc" data-v="free">Loyalty free cut</button>${p.discountNote ? `<span class="muted small">${esc(p.discountNote)}</span>` : ''}</div>
        <div class="totals">
          <div><span>Services</span><span>${money(T.svc, 1)}</span></div>
          ${T.prod ? `<div><span>Products</span><span>${money(T.prod, 1)}</span></div>` : ''}
          ${T.disc ? `<div><span>Discount</span><span>${money(-T.disc, 1)}</span></div>` : ''}
          ${T.tip ? `<div><span>Tip</span><span>${money(T.tip, 1)}</span></div>` : ''}
          <div><b>Total</b><b>${money(T.total, 1)}</b></div>
          ${T.deposit ? `<div><span>Deposit paid online (${esc(methodName(p.depositMethod))})</span><span>${money(-T.deposit, 1)}</span></div>` : ''}
          <div class="grand"><span>${T.deposit ? 'Collect now' : 'Total'}</span><span>${money(T.collect, 1)}</span></div>
        </div>
        <div class="seg" role="group" aria-label="Payment method">${METHODS.map(x => `<button type="button" data-act="posMethod" data-v="${esc(x)}" aria-pressed="${p.method === x}">${esc(x)}</button>`).join('')}</div>
        ${p.method === 'Cash' ? `<div class="fgrid">${field('Cash received', `<input id="pos-cash" data-bind="pos.cash" data-live inputmode="decimal" value="${esc(p.cash)}" placeholder="${T.collect}">`, 'pos-cash')}<div class="field"><label>Change</label><p style="font:800 26px/1.4 var(--f-display)" class="${change != null && change < 0 ? 'down' : ''}">${change == null ? '—' : change < 0 ? 'Short ' + money(-change, 1) : money(change, 1)}</p></div></div>` : ''}
        <label class="row small"><input type="checkbox" id="pos-save" data-bind="pos.save" ${p.save ? 'checked' : ''}> Save new client to the client list</label>
        ${needBarber ? '<p class="err">Choose the barber who did the service.</p>' : ''}
        <button type="button" class="btn btn-accent btn-lg" data-act="posComplete" ${!p.lines.length || needBarber || S.busy ? 'disabled' : ''}>Complete sale · ${money(T.collect, 1)}</button>
      </div>
    </section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Today’s sales</h2><span class="muted small">${recent.length} sale${recent.length === 1 ? '' : 's'} · ${money(sum(recent, netOf))}</span></div>${salesTable(recent.slice(0, 30))}</section>`;
}
function salesTable(list, more) {
  if (!list.length) return '<p class="empty">No sales yet. Completed checkouts show up here.</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Client</th><th>Barber</th><th>Items</th><th>Paid by</th><th class="r">Tip</th><th class="r">Total</th><th></th></tr></thead><tbody>
    ${list.map(s => `<tr><td class="num nowrap">${shortDate(s.date)} <span class="muted small">${fmtTime(s.time)}</span></td><td>${esc(s.name || 'Walk-in')}</td><td>${esc(staffName(s.barberId))}</td><td class="small">${esc((s.lines || []).map(l => l.qty > 1 ? `${l.name} ×${l.qty}` : l.name).join(', '))}</td><td>${esc(s.method)}${s.depositCredit ? `<div class="muted small">+ ${money(s.depositCredit)} deposit</div>` : ''}</td><td class="r">${s.tip ? money(s.tip) : '—'}</td><td class="r"><b>${money(s.total, 1)}</b></td>
      <td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="showSale" data-id="${esc(s.id)}">Receipt</button><button class="btn btn-sm btn-danger" data-act="voidSale" data-id="${esc(s.id)}">Void</button></div></td></tr>`).join('')}
  </tbody></table></div>${more ? `<p class="muted small" style="margin-top:10px">${esc(more)}</p>` : ''}`;
}

// ---------- tab: money ----------
const ICON_DL = '<svg class="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3v10M5.5 8.5L10 13l4.5-4.5M4 16.5h12"/></svg>';
const fileBase = r => `${info().shop.name.replace(/[^\w-]+/g, '-')}_${r[0] === r[1] ? r[0] : `${r[0]}_to_${r[1]}`}`;
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// Rows for every money record in the period, shared by the Excel and CSV exports.
function exportRows(r) {
  const s = summary(r);
  const lineNames = (x, kind) => (x.lines || []).filter(l => l.kind === kind).map(l => l.qty > 1 ? `${l.name} ×${l.qty}` : l.name).join(', ');
  const sales = [...s.sales].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).map(x => ({
    type: 'Sale', date: x.date, time: x.time || '', client: x.name || 'Walk-in', barber: staffName(x.barberId),
    services: lineNames(x, 'service'), products: lineNames(x, 'product'), method: x.method || '',
    svc: x.svcTotal || 0, prod: x.prodTotal || 0, disc: -(x.discount || 0), tip: x.tip || 0, total: x.total || 0,
    online: x.depositCredit || 0, shop: (x.total || 0) - (x.depositCredit || 0), comm: x.commission || 0
  }));
  const kept = [...s.kept].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(a => ({
    type: a.status === 'no_show' ? 'Kept deposit (no-show)' : 'Kept deposit', date: a.date, time: a.time || '', client: a.name || '', barber: staffName(a.barberId),
    services: svcNames(a.serviceIds), products: '', method: methodName(a.deposit.method), svc: 0, prod: 0, disc: 0, tip: 0,
    total: a.deposit.amount, online: a.deposit.amount, shop: 0, comm: 0
  }));
  const exps = [...s.exps].sort((a, b) => a.date.localeCompare(b.date)).map(e => ({ date: e.date, cat: e.cat, desc: e.desc || '', method: e.method || '', amount: e.amount || 0 }));
  return { s, sales: [...sales, ...kept].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), exps };
}
function exportXlsx() {
  const r = periodRange(S.period), { s, sales, exps } = exportRows(r), shop = info().shop;
  const M = v => ({ v: Math.round(v * 100) / 100, s: 'money' }), D = d => ({ v: xlDate(d), s: 'date' });
  const H = (t, i, numFrom) => ({ v: t, s: i >= numFrom ? 'headR' : 'head' });
  const totalRow = (n, first, last, label, moneyCols, intCols = []) => Array.from({ length: n }, (_, c) => {
    if (c === 0) return { v: label, s: 'label' };
    const L = colName(c);
    if (moneyCols.includes(c)) return { f: `SUBTOTAL(9,${L}${first}:${L}${last})`, s: 'total' };
    if (intCols.includes(c)) return { f: `SUBTOTAL(9,${L}${first}:${L}${last})`, s: 'intB' };
    return { v: '', s: 'label' };
  });
  const head = (t) => [[{ v: shop.name, s: 'title' }], [{ v: `${t} · ${rangeLabel(r)}`, s: 'sub' }], []];

  // Summary
  const sum1 = [...head('Income & expenses'),
    [{ v: 'Overview', s: 'section' }, { v: 'Amount', s: 'sectionR' }],
    ['Service sales', M(s.svc)], ['Product sales', M(s.prod)], ['Discounts given', M(-s.disc)], ['Deposits kept (no-shows, cancellations)', M(s.keptAmt)],
    [{ v: 'Income (excl. tips)', s: 'label' }, { v: s.income, s: 'total' }],
    ['Barbers’ guaranteed daily pay', M(-s.base)], ['Barber commissions', M(-s.comm)], ['Expenses', M(-s.exp)],
    [{ v: 'Net profit', s: 'label' }, { v: s.profit, s: 'total' }], [],
    ['Clients served', { v: s.count, s: 'int' }], ['Average ticket', M(s.avg)], ['Tips collected for barbers', M(s.tips)], ['Paid online as deposits', M(s.deposits + s.keptAmt)], []];
  const byMethod = METHODS.map(m => [m, sum(s.sales.filter(x => x.method === m), x => (x.total || 0) - (x.depositCredit || 0))]);
  byMethod.push(['Online deposits (PayMongo)', s.deposits + s.keptAmt]);
  sum1.push([{ v: 'Payments received', s: 'section' }, { v: '', s: 'section' }], ...byMethod.filter(x => x[1]).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, M(v)]), []);
  const byCat = EXP_CATS.map(c => [c, sum(s.exps.filter(x => x.cat === c), x => x.amount)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
  sum1.push([{ v: 'Expenses by category', s: 'section' }, { v: '', s: 'section' }], ...(byCat.length ? byCat.map(([k, v]) => [k, M(v)]) : [['No expenses']]), []);
  const payRows = staffAll().map(b => ({ b, P: payFor(b, r) })).filter(({ P }) => P.days || P.x.length).sort((a, b) => b.P.total - a.P.total);
  sum1.push(['By barber', 'Days worked', 'Clients', 'Brings in', 'Daily pay', 'Commission', 'Shop pays him', 'Pay % of sales', 'Left for the shop', 'Tips (from clients)'].map((t, i) => ({ v: t, s: i ? 'sectionR' : 'section' })),
    ...payRows.map(({ b, P }) => [`${b.name} (${money(P.daily)}/day + ${b.rate || 0}%)`, { v: P.days, s: 'int' }, { v: P.x.length, s: 'int' }, M(P.svc), M(P.base), M(P.comm), M(P.pay),
      P.svc ? { v: `${Math.round(P.pay / P.svc * 100)}%`, s: 'text' } : '–', M(P.svc - P.pay), M(P.tips)]));
  sum1.push([], [{ v: `Exported ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}. Income excludes tips, which go to the barbers. Barber pay = guaranteed daily pay for each day worked + commission on services.`, s: 'sub' }]);

  // Daily
  const days = [], end = r[1] < today() ? r[1] : today(); for (let d = r[0]; d <= end; d = addDays(d, 1)) days.push(d); // no future days
  const dRows = days.map(d => {
    const ds = s.sales.filter(x => x.date === d), inc = sum(ds, netOf) + sum(s.kept.filter(a => a.date === d), a => a.deposit.amount);
    const ex = sum(s.exps.filter(e => e.date === d), e => e.amount), cm = sum(ds, x => x.commission), bp = basePayOn(d);
    return [D(d), { v: ds.length, s: 'int' }, M(inc), M(bp), M(cm), M(ex), { v: Math.round((inc - bp - cm - ex) * 100) / 100, s: 'money' }];
  }).filter(x => x[1].v || x[2].v || x[5].v || days.length <= 31) // long periods skip days with nothing recorded
    .map((x, i) => { x[6].f = `C${i + 5}-D${i + 5}-E${i + 5}-F${i + 5}`; return x; });
  const daily = [...head('Day by day'), ['Date', 'Clients', 'Income', 'Daily pay', 'Commissions', 'Expenses', 'Profit'].map((t, i) => H(t, i, 1)), ...dRows];
  if (dRows.length) daily.push(totalRow(7, 5, 4 + dRows.length, 'Total', [2, 3, 4, 5, 6], [1]));

  // Sales
  const SH = ['Date', 'Time', 'Type', 'Client', 'Barber', 'Services', 'Products', 'Payment', 'Services ₱', 'Products ₱', 'Discount', 'Tip', 'Total', 'Paid online', 'Paid at shop', 'Commission'];
  const sRows = sales.map(x => [D(x.date), x.time ? { v: xlTime(x.time), s: 'time' } : '', x.type, x.client, x.barber, x.services, x.products, x.method, M(x.svc), M(x.prod), M(x.disc), M(x.tip), M(x.total), M(x.online), M(x.shop), M(x.comm)]);
  const salesSh = [...head('Sales'), SH.map((t, i) => H(t, i, 8)), ...sRows];
  if (sRows.length) salesSh.push(totalRow(SH.length, 5, 4 + sRows.length, 'Total', [8, 9, 10, 11, 12, 13, 14, 15]));

  // Expenses
  const eRows = exps.map(e => [D(e.date), e.cat, e.desc, e.method, M(e.amount)]);
  const expSh = [...head('Expenses'), ['Date', 'Category', 'Description', 'Paid by', 'Amount'].map((t, i) => H(t, i, 4)), ...eRows];
  if (eRows.length) expSh.push(totalRow(5, 5, 4 + eRows.length, 'Total', [4]));

  const blob = buildXlsx([
    { name: 'Summary', cols: [40, 13, 10, 14, 13, 14, 15, 14, 17, 18], rows: sum1 },
    { name: 'Day by day', cols: [18, 10, 15, 14, 15, 15, 15], rows: daily, freeze: 'A5', filter: dRows.length ? `A4:G${4 + dRows.length}` : '' },
    { name: 'Sales', cols: [18, 10, 14, 22, 14, 34, 22, 13, 13, 13, 12, 11, 13, 13, 14, 13], rows: salesSh, freeze: 'A5', filter: sRows.length ? `A4:P${4 + sRows.length}` : '' },
    { name: 'Expenses', cols: [18, 18, 36, 16, 15], rows: expSh, freeze: 'A5', filter: eRows.length ? `A4:E${4 + eRows.length}` : '' }
  ], { title: `${shop.name} income and expenses, ${rangeLabel(r)}`, author: shop.name });
  saveBlob(blob, fileBase(r) + '.xlsx');
  toast('Excel file downloaded');
}
function periodBar() {
  return `<div class="toolbar"><div class="seg" role="group" aria-label="Period">${PERIODS.map(([k, l]) => `<button type="button" data-act="period" data-v="${k}" aria-pressed="${S.period === k}">${l}</button>`).join('')}</div>
  ${S.period === 'custom' ? `<div class="datenav"><input type="date" id="p-from" data-bind="from" data-live value="${esc(S.from || addDays(today(), -6))}" aria-label="From"><span class="muted">to</span><input type="date" id="p-to" data-bind="to" data-live value="${esc(S.to || today())}" aria-label="To"></div>` : ''}</div>`;
}
function vMoney() {
  const r = periodRange(S.period), s = summary(r), bk = buckets(r);
  const inc = bk.map(b => sum(s.sales.filter(x => b.match(x.date)), netOf) + sum(s.kept.filter(x => b.match(x.date)), x => x.deposit.amount));
  const out = bk.map(b => sum(s.exps.filter(x => b.match(x.date)), e => e.amount));
  const byMethod = METHODS.map(m => ({ label: m, value: sum(s.sales.filter(x => x.method === m), x => (x.total || 0) - (x.depositCredit || 0)) }));
  byMethod.push({ label: 'Online deposits', value: s.deposits + s.keptAmt, tip: 'Paid through PayMongo' });
  const methods = byMethod.filter(x => x.value).sort((a, b) => b.value - a.value);
  const byCat = EXP_CATS.map(c => ({ label: c, value: sum(s.exps.filter(x => x.cat === c), x => x.amount) })).filter(x => x.value).sort((a, b) => b.value - a.value);
  const svcMap = {}; for (const x of s.sales) for (const l of (x.lines || [])) if (l.kind === 'service') { svcMap[l.name] = svcMap[l.name] || { n: 0, v: 0 }; svcMap[l.name].n += l.qty; svcMap[l.name].v += l.qty * l.price; }
  const top = Object.entries(svcMap).map(([k, v]) => ({ label: k, value: v.v, text: `${v.n} × · ${money(v.v)}` })).sort((a, b) => b.value - a.value).slice(0, 6);
  const sales = [...s.sales].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const exps = [...s.exps].sort((a, b) => b.date.localeCompare(a.date));
  return `${pageHead(rangeLabel(r), 'Income & expenses', `<button class="btn" data-act="exportXlsx">${ICON_DL}Download Excel</button><button class="btn btn-ghost" data-act="exportCsv">CSV</button><button class="btn btn-primary" data-act="newExpense">+ Expense</button>`)}
  ${periodBar()}
  <section class="kpis">
    ${kpi('Income', money(s.income), `<span class="d">${s.count} clients · avg ticket ${money(s.avg)}</span>`)}
    ${kpi('Expenses', money(s.exp), `<span class="d">${s.exps.length} entries</span>`)}
    ${kpi('Barber pay', money(s.staffPay), `<span class="d">Daily pay ${money(s.base)} + commission ${money(s.comm)}</span>`)}
    ${kpi('Net profit', `<span class="${s.profit >= 0 ? '' : 'down'}">${money(s.profit)}</span>`, `<span class="d">Income − barber pay − expenses</span>`)}
  </section>
  <section class="panel"><div class="panel-h"><h2>Income vs expenses</h2><span class="muted small">${bk[0] && bk[0].key.length === 7 ? 'By month' : 'By day'} · income excludes tips</span></div>${barChart(bk, [{ name: 'Income', values: inc, cls: 's1' }, { name: 'Expenses', values: out, cls: 's2' }])}</section>
  <div class="grid3">
    <section class="panel"><div class="panel-h"><h2>Payments received</h2></div>${hbars(methods)}</section>
    <section class="panel"><div class="panel-h"><h2>Top services</h2></div>${hbars(top)}</section>
    <section class="panel"><div class="panel-h"><h2>Where money went</h2></div>${hbars(byCat, 's2')}</section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Breakdown</h2></div><div class="totals" style="max-width:540px;font-size:14px">
    <div><span>Service sales</span><span>${money(s.svc, 1)}</span></div><div><span>Product sales</span><span>${money(s.prod, 1)}</span></div>
    <div><span>Discounts given</span><span>${money(-s.disc, 1)}</span></div><div><span>Deposits kept (no-shows, cancellations)</span><span>${money(s.keptAmt, 1)}</span></div>
    <div><b>Income (excl. tips)</b><b>${money(s.income, 1)}</b></div>
    <div><span>Barbers’ guaranteed daily pay</span><span>${money(-s.base, 1)}</span></div>
    <div><span>Barber commissions</span><span>${money(-s.comm, 1)}</span></div><div><span>Expenses</span><span>${money(-s.exp, 1)}</span></div>
    <div style="border-top:1px solid var(--line-2);padding-top:8px"><b>Net profit</b><b class="${s.profit >= 0 ? 'up' : 'down'}">${money(s.profit, 1)}</b></div>
    <div class="muted"><span>Of income, paid online as deposits</span><span>${money(s.deposits + s.keptAmt, 1)}</span></div>
    <div class="muted"><span>Tips collected for barbers</span><span>${money(s.tips, 1)}</span></div></div>
    <p class="muted small" style="margin-top:10px">PayMongo deducts its fees before paying out. Record them as a “Payment fees” expense from your PayMongo payout report.</p></section>
  <section class="panel"><div class="panel-h"><h2>Expenses</h2><button class="btn btn-sm" data-act="newExpense">+ Expense</button></div>
    ${exps.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Paid by</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${exps.map(e => `<tr><td class="num nowrap">${shortDate(e.date)}</td><td>${esc(e.cat)}</td><td>${esc(e.desc || '')}</td><td>${esc(e.method || '')}</td><td class="r"><b>${money(e.amount, 1)}</b></td><td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="editExpense" data-id="${esc(e.id)}">Edit</button><button class="btn btn-sm btn-danger" data-act="delExpense" data-id="${esc(e.id)}">Delete</button></div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">No expenses in this period. Record rent, bills and supplies with “+ Expense”.</p>'}</section>
  <section class="panel"><div class="panel-h"><h2>Sales</h2><span class="muted small">${sales.length} in this period</span></div>${salesTable(sales.slice(0, 100), sales.length > 100 ? `Showing the latest 100 of ${sales.length}. Export CSV for the full list.` : '')}</section>`;
}

// ---------- tab: team ----------
// What the shop pays each barber (daily pay + commission) compared with what his services bring in.
function keepPanel(list, r) {
  const rows = list.map(b => ({ b, P: payFor(b, r) })).filter(({ P }) => P.days || P.x.length);
  if (!rows.length) return '';
  const T = { svc: sum(rows, x => x.P.svc), paid: sum(rows, x => x.P.pay) }, top = Math.max(1, ...rows.map(x => Math.max(x.P.svc, x.P.pay)));
  const pctOf = P => P.svc ? Math.round(P.pay / P.svc * 100) : null;
  const verdict = P => P.svc - P.pay >= 0 ? `<span class="chip chip-good">+${money(P.svc - P.pay)} for the shop</span>` : `<span class="chip chip-bad">Shop pays ${money(P.pay - P.svc)} more</span>`;
  const bars = P => `<div class="vs"><span class="vs-row"><i class="in" style="width:${P.svc / top * 100}%"></i></span><span class="vs-row"><i class="out ${P.pay > P.svc ? 'bad' : ''}" style="width:${P.pay / top * 100}%"></i></span></div>`;
  return `<section class="panel"><div class="panel-h"><h2>Pay vs what each barber brings in</h2><span class="muted small">All barbers: brought in ${money(T.svc)}, paid ${money(T.paid)}</span></div>
    <p class="muted small" style="margin:-4px 0 14px"><span class="key in"></span>Brings in: his service sales after discounts. <span class="key out"></span>Shop pays him: daily pay + commission (tips come from clients, so they’re left out). Whatever is left pays for rent, bills and profit.</p>
    <div class="tbl-wrap keep-tbl"><table class="tbl"><thead><tr><th>Name</th><th class="r">Brings in</th><th class="r">Daily pay</th><th class="r">Commission</th><th class="r">Shop pays him</th><th style="width:160px"></th><th class="r">Pay is</th><th class="r">Result</th></tr></thead><tbody>
    ${rows.sort((x, y) => (x.P.svc - x.P.pay) - (y.P.svc - y.P.pay)).map(({ b, P }) => `<tr><td><div class="row" style="flex-wrap:nowrap">${av(b)}<div><b>${esc(b.name)}</b><div class="muted small nowrap">${P.days} days · ${P.x.length} clients · ${esc(b.rate || 0)}/${esc(100 - (Number(b.rate) || 0))}</div></div></div></td>
      <td class="r"><b>${money(P.svc)}</b></td><td class="r">${money(P.base)}</td><td class="r">${money(P.comm)}</td><td class="r"><b>${money(P.pay)}</b></td>
      <td>${bars(P)}</td><td class="r">${pctOf(P) === null ? '–' : `<span class="${P.pay > P.svc ? 'down' : ''}">${pctOf(P)}%</span><div class="muted small">of sales</div>`}</td><td class="r">${verdict(P)}</td></tr>`).join('')}
    </tbody></table></div>
    <ul class="keep-cards">${rows.map(({ b, P }) => `<li><div class="row" style="flex-wrap:nowrap">${av(b)}<div class="grow"><b>${esc(b.name)}</b><div class="muted small">${P.days} days · ${P.x.length} clients</div></div>${verdict(P)}</div>
      ${bars(P)}
      <div class="keep-nums"><span><small>Brings in</small><b>${money(P.svc)}</b></span><span><small>Shop pays him</small><b>${money(P.pay)}</b></span><span><small>Pay is</small><b class="${P.pay > P.svc ? 'down' : ''}">${pctOf(P) === null ? '–' : pctOf(P) + '% of sales'}</b></span></div>
      <p class="muted small" style="margin:0">${money(P.base)} daily pay + ${money(P.comm)} commission</p></li>`).join('')}</ul>
    <p class="muted small" style="margin-top:12px">A barber pays for himself once his services pass his daily pay ÷ the shop’s % each day: ${[...new Map(rows.filter(x => x.P.daily).map(x => [`${x.P.daily}_${x.b.rate}`, x])).values()].sort((x, y) => x.P.daily - y.P.daily).map(({ b, P }) => `${money(P.need)} a day on ${money(P.daily)}/day + ${esc(b.rate || 0)}%`).join(', ')}.</p></section>`;
}
function owedFor(id) { const b = staffById(id); const earned = b ? payFor(b, [payStart(b), today()]).total : 0; const paid = sum(S.payouts.filter(p => p.barberId === id), p => p.amount); return round2(earned - paid); }
function vTeam() {
  const r = periodRange(S.period), s = summary(r);
  const list = staffAll().filter(b => S.showArchived || b.active !== false).sort((a, b) => (a.chair || 99) - (b.chair || 99));
  const pays = [...S.payouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  return `${pageHead(rangeLabel(r), 'Barbers', `<button class="btn btn-primary" data-act="newStaff">+ Barber or stylist</button>`)}
  ${periodBar()}
  <section class="panel"><div class="panel-h"><h2>Pay and commissions</h2><label class="row small"><input type="checkbox" id="t-arch" data-bind="showArchived" data-live ${S.showArchived ? 'checked' : ''}> Show former staff</label></div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th class="r">Days worked</th><th class="r">Daily pay</th><th class="r">Clients</th><th class="r">Service sales</th><th class="r">Commission</th><th class="r">Tips</th><th class="r">Earned</th><th class="r">Owed now</th><th></th></tr></thead><tbody>
    ${list.map(b => { const P = payFor(b, r), owed = owedFor(b.id);
      return `<tr><td><div class="row" style="flex-wrap:nowrap">${av(b)}<div><b>${esc(b.name)}</b>${b.active === false ? ' <span class="muted small">(former)</span>' : ''}<div class="muted small nowrap">${esc(b.title || '')}${b.chair ? ' · Chair ' + esc(b.chair) : ''}</div><div class="muted small nowrap">${money(P.daily)}/day + ${esc(b.rate || 0)}%</div></div></div></td>
      <td class="r">${P.days}</td><td class="r">${money(P.base)}</td><td class="r">${P.x.length}</td><td class="r">${money(P.svc)}</td><td class="r">${money(P.comm, 1)}</td><td class="r">${money(P.tips)}</td><td class="r"><b>${money(P.total, 1)}</b></td><td class="r"><b class="${owed > 0 ? '' : 'muted'}">${money(owed, 1)}</b></td>
      <td><div class="acts"><button class="btn btn-sm btn-primary" data-act="payStaff" data-id="${esc(b.id)}" ${owed <= 0 ? 'disabled' : ''}>Pay</button><button class="btn btn-sm btn-ghost" data-act="editStaff" data-id="${esc(b.id)}">Edit</button></div></td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="empty">No staff yet. Use “+ Barber or stylist”, or load the starter team in Shop setup.</p>'}
    <p class="muted small" style="margin-top:12px">Earned = guaranteed daily pay for each day worked + commission (their rate × service sales after discounts) + tips. A day counts as worked when they had a sale, or it’s one of their days in and they weren’t marked absent in Schedule → Who’s in. “Owed now” is everything earned minus payouts.</p></section>
  ${keepPanel(list.filter(b => b.active !== false), r)}
  <section class="panel"><div class="panel-h"><h2>Payout history</h2></div>
    ${pays.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Paid on</th><th>Name</th><th>Note</th><th class="r">Amount</th><th></th></tr></thead><tbody>${pays.map(p => `<tr><td class="num">${fmtDate(p.date)}</td><td>${esc(staffName(p.barberId))}</td><td>${esc(p.note || '')}</td><td class="r"><b>${money(p.amount, 1)}</b></td><td><div class="acts"><button class="btn btn-sm btn-danger" data-act="delPayout" data-id="${esc(p.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No payouts recorded yet.</p>'}</section>`;
}

// ---------- tab: clients ----------
function vClients() {
  const st = custStats(), N = loyaltyN(), q = S.clientQ.trim().toLowerCase();
  let list = S.customers.map(c => ({ ...c, st: st[c.id] || { visits: 0, spent: 0, last: '', barbers: {} } }));
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || normPhone(c.phone).includes(normPhone(q) || '§'));
  const sorts = { recent: (a, b) => (b.st.last || '').localeCompare(a.st.last || ''), spend: (a, b) => b.st.spent - a.st.spent, visits: (a, b) => b.st.visits - a.st.visits, name: (a, b) => a.name.localeCompare(b.name) };
  list.sort(sorts[S.clientSort] || sorts.recent);
  const lapsed = S.customers.filter(c => st[c.id] && st[c.id].last && st[c.id].last < addDays(today(), -45)).length;
  const due = dueForTrim(st);
  return `${pageHead(`${S.customers.length} clients`, 'Clients', `<button class="btn btn-primary" data-act="newClient">+ Client</button>`)}
  <section class="kpis">
    ${kpi('Clients on file', S.customers.length)}
    ${kpi('New this month', S.customers.filter(c => c.createdAt && ymd(new Date(c.createdAt)) >= periodRange('month')[0]).length)}
    ${kpi('Haven’t been back in 45+ days', lapsed, '<span class="d">Worth a message</span>')}
  </section>
  ${pol().rebookDays ? `<section class="panel"><div class="panel-h"><h2>Due for a trim</h2><span class="muted small">Last visit ${pol().rebookDays}+ days ago, nothing booked. Texts go out automatically at 10 AM on day ${pol().rebookDays}.</span></div>
    ${due.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${due.slice(0, 12).map(({ c, last, days }) => { const sent = (c.rebookSentFor || '') >= last; return `<tr><td><div class="row" style="flex-wrap:nowrap"><span class="avatar">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><div class="muted small">${esc(c.phone || 'No phone')}</div></div></div></td><td class="num">${days} days since ${shortDate(last)}</td><td>${sent ? chip({ kind: 'good', icon: '✓', label: 'Reminded' }) : c.noReminders ? chip({ kind: 'mute', icon: '–', label: 'Opted out' }) : ''}</td>
      <td><div class="acts">${!sent && !c.noReminders && (c.phone || c.email) ? `<button class="btn btn-sm btn-primary" data-act="remind" data-id="${esc(c.id)}" data-last="${esc(last)}" ${S.reminding === c.id ? 'disabled' : ''}>${S.reminding === c.id ? 'Sending…' : 'Send reminder'}</button>` : ''}<button class="btn btn-sm btn-ghost" data-act="openClient" data-id="${esc(c.id)}">Open</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">Nobody is due right now.</p>'}</section>` : ''}
  <section class="panel">
    <div class="toolbar" style="margin-bottom:12px"><input type="search" id="c-q" data-bind="clientQ" data-live value="${esc(S.clientQ)}" placeholder="Search name or phone" aria-label="Search clients">
      <select id="c-sort" data-bind="clientSort" data-live style="width:auto" aria-label="Sort">${[['recent', 'Last visit'], ['spend', 'Top spenders'], ['visits', 'Most visits'], ['name', 'Name']].map(([k, l]) => opt(k, 'Sort: ' + l, k === S.clientSort)).join('')}</select></div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Client</th><th class="r">Visits</th><th class="r">Spent</th><th>Last visit</th>${N ? `<th>Loyalty (every ${N})</th>` : ''}<th>Usual barber</th></tr></thead><tbody>
      ${list.map(c => { const prog = c.st.visits % (N || 1); return `<tr class="click" data-act="openClient" data-id="${esc(c.id)}" tabindex="0"><td><b>${esc(c.name)}</b><div class="muted small">${esc(c.phone || 'No phone')}</div></td><td class="r">${c.st.visits}</td><td class="r">${money(c.st.spent)}</td><td class="num">${c.st.last ? fmtDate(c.st.last) : '<span class="muted">—</span>'}</td>
        ${N ? `<td><span class="meter" aria-label="${prog} of ${N} visits">${N <= 12 ? Array.from({ length: N }, (_, i) => `<i class="${i < prog ? 'on' : ''}"></i>`).join('') : `${prog}/${N}`}</span></td>` : ''}<td>${esc(usualBarber(c.st))}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<p class="empty">${q ? 'No client matches that search.' : 'No clients yet. They’re added at checkout, or use “+ Client”.'}</p>`}
  </section>`;
}

function dueForTrim(st) {
  const n = pol().rebookDays; if (!n) return [];
  const from = addDays(today(), -(n + 30)), to = addDays(today(), -n);
  return S.customers.map(c => ({ c, s: st[c.id] })).filter(x => x.s && x.s.last >= from && x.s.last <= to)
    .filter(({ c }) => !S.appointments.some(a => a.date >= today() && ['booked', 'pending_payment'].includes(a.status) && (a.customerId === c.id || (c.phoneKey && phoneKey(a.phone) === c.phoneKey))))
    .map(({ c, s }) => ({ c, last: s.last, days: Math.round((parseYmd(today()) - parseYmd(s.last)) / 864e5) })).sort((a, b) => a.days - b.days);
}

// ---------- tab: stock ----------
function stockChip(i) { return i.stock <= 0 ? chip({ kind: 'bad', icon: '✕', label: 'Out' }) : i.stock <= i.reorder ? chip({ kind: 'warn', icon: '!', label: 'Low' }) : chip({ kind: 'good', icon: '✓', label: 'OK' }); }
function vStock() {
  const all = [...S.inventory].sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || a.name.localeCompare(b.name));
  const f = S.stockFilter, list = all.filter(i => f === 'all' || (f === 'low' ? i.stock <= i.reorder : i.cat === f));
  const low = all.filter(i => i.stock <= i.reorder).length;
  return `${pageHead(`${all.length} items`, 'Inventory', `<button class="btn btn-primary" data-act="newItem">+ Item</button>`)}
  <section class="kpis">
    ${kpi('Low or out of stock', low, low ? '<span class="d">Reorder soon</span>' : '<span class="d">All stocked</span>')}
    ${kpi('Stock value at cost', money(sum(all, i => Math.max(0, i.stock) * (i.cost || 0))))}
    ${kpi('Retail value on shelf', money(sum(all.filter(i => i.cat === 'Retail'), i => Math.max(0, i.stock) * (i.price || 0))))}
  </section>
  <section class="panel">
    <div class="toolbar" style="margin-bottom:12px"><div class="seg" role="group" aria-label="Filter">${[['all', 'All'], ['Retail', 'Retail'], ['Supply', 'Shop supplies'], ['low', 'Low stock']].map(([k, l]) => `<button type="button" data-act="stockFilter" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div></div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Type</th><th class="r">In stock</th><th class="r">Reorder at</th><th class="r">Cost</th><th class="r">Price</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(i => `<tr><td><b>${esc(i.name)}</b><div class="stockbar" aria-hidden="true"><i style="width:${Math.min(100, Math.max(0, i.stock) / Math.max(1, (i.reorder || 1) * 3) * 100).toFixed(0)}%"></i></div></td><td>${i.cat === 'Retail' ? 'Retail' : 'Shop supply'}</td><td class="r"><b>${i.stock}</b> <span class="muted small">${esc(i.unit || '')}</span></td><td class="r">${i.reorder}</td><td class="r">${money(i.cost || 0)}</td><td class="r">${i.cat === 'Retail' ? money(i.price || 0) : '—'}</td><td>${stockChip(i)}</td>
        <td><div class="acts"><button class="btn btn-sm" data-act="adjust" data-id="${esc(i.id)}" data-dir="in">Receive</button><button class="btn btn-sm" data-act="adjust" data-id="${esc(i.id)}" data-dir="out">Use</button><button class="btn btn-sm btn-ghost" data-act="editItem" data-id="${esc(i.id)}">Edit</button></div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">No items here. Add pomades, blades and other supplies with “+ Item”.</p>'}
    <p class="muted small" style="margin-top:12px">Retail products sold at checkout come off stock automatically. Record shop supplies you open with “Use”.</p>
  </section>`;
}

// ---------- tab: setup ----------
function vSetup() {
  const I = info(), sh = I.shop, p = pol();
  return `${pageHead('Your shop', 'Shop setup', '')}
  <div class="grid2e">
    <section class="panel"><div class="panel-h"><h2>Shop details</h2></div>
      <form class="stack" data-form="shop">
        <div class="fgrid">${field('Shop name', `<input id="sh-name" name="name" value="${esc(sh.name)}" required>`, 'sh-name')}${field('Logo text', `<input id="sh-wm" name="wordmark" value="${esc(sh.wordmark || '')}">`, 'sh-wm')}</div>
        ${field('Headline on the website', `<input id="sh-tag" name="tagline" value="${esc(sh.tagline)}">`, 'sh-tag')}
        ${field('Short description', `<textarea id="sh-about" name="about" rows="2">${esc(sh.about)}</textarea>`, 'sh-about')}
        ${field('Address', `<input id="sh-addr" name="address" value="${esc(sh.address)}">`, 'sh-addr')}
        <div class="fgrid">${field('Phone', `<input id="sh-phone" name="phone" value="${esc(sh.phone)}">`, 'sh-phone')}${field('Facebook page', `<input id="sh-fb" name="facebook" value="${esc(sh.facebook || '')}">`, 'sh-fb')}</div>
        ${field('Instagram', `<input id="sh-ig" name="instagram" value="${esc(sh.instagram || '')}" placeholder="https://www.instagram.com/...">`, 'sh-ig')}
        <div class="fgrid">${field('GCash number for down payments', `<input id="sh-gcash" name="gcashNumber" value="${esc(sh.gcashNumber || '')}" inputmode="tel">`, 'sh-gcash')}${field('GCash account name', `<input id="sh-gname" name="gcashName" value="${esc(sh.gcashName || '')}">`, 'sh-gname')}</div>
        <div class="fgrid">${field('Currency symbol', `<input id="sh-cur" name="currency" value="${esc(sh.currency || '₱')}" maxlength="4">`, 'sh-cur')}${field('Free cut every N visits (0 = off)', `<input id="sh-loy" name="loyaltyEvery" type="number" min="0" max="50" value="${esc(sh.loyaltyEvery ?? 10)}">`, 'sh-loy')}</div>
        <div class="modal-f"><button class="btn btn-primary" type="submit">Save details</button></div>
      </form></section>
    <section class="panel"><div class="panel-h"><h2>Opening hours</h2></div>
      <form class="stack" data-form="hours">
        <div class="tbl-wrap"><table class="tbl"><tbody>${[1, 2, 3, 4, 5, 6, 0].map(d => { const h = I.hours.find(x => x.d === d) || { open: '09:00', close: '20:00', closed: false }; return `<tr><td><b>${DAYS_LONG[d]}</b></td><td><input type="time" id="h-open-${d}" name="open-${d}" value="${esc(h.open)}" aria-label="${DAYS_LONG[d]} opens"></td><td><input type="time" id="h-close-${d}" name="close-${d}" value="${esc(h.close)}" aria-label="${DAYS_LONG[d]} closes"></td><td><label class="row small"><input type="checkbox" id="h-closed-${d}" name="closed-${d}" ${h.closed ? 'checked' : ''}> Closed</label></td></tr>`; }).join('')}</tbody></table></div>
        <div class="modal-f"><button class="btn btn-primary" type="submit">Save hours</button></div>
      </form></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Online booking rules</h2></div>
    <form class="stack" data-form="policy">
      <div class="fgrid three">
        ${field('Deposit (' + cur() + ')', `<input id="po-dep" name="deposit" type="number" min="100" step="1" value="${esc(p.deposit)}">`, 'po-dep')}
        ${field('Hold slot while paying (min)', `<input id="po-hold" name="holdMinutes" type="number" min="5" max="60" value="${esc(p.holdMinutes)}">`, 'po-hold')}
        ${field('Reschedule up to (hours before)', `<input id="po-res" name="rescheduleHours" type="number" min="0" max="168" value="${esc(p.rescheduleHours)}">`, 'po-res')}
        ${field('Late arrival cancels after (min)', `<input id="po-late" name="lateMinutes" type="number" min="0" max="120" value="${esc(p.lateMinutes)}">`, 'po-late')}
        ${field('Earliest booking from now (min)', `<input id="po-lead" name="leadMinutes" type="number" min="0" max="1440" value="${esc(p.leadMinutes)}">`, 'po-lead')}
        ${field('Book up to (days ahead)', `<input id="po-ahead" name="bookAheadDays" type="number" min="1" max="90" value="${esc(p.bookAheadDays)}">`, 'po-ahead')}
        ${field('Last booking starts at', `<input id="po-last" name="lastBooking" type="time" step="1800" value="${esc(p.lastBooking ?? '19:00')}">`, 'po-last', 'Online bookings can’t start later than this. Leave empty to allow any time that finishes by closing.')}
        ${field('“Time for a trim” text after (days, 0 = off)', `<input id="po-rebook" name="rebookDays" type="number" min="0" max="120" value="${esc(p.rebookDays ?? 28)}">`, 'po-rebook')}
      </div>
      <label class="consent"><input type="checkbox" id="po-online" name="onlineBooking" ${p.onlineBooking ? 'checked' : ''}><span><b>Take online bookings with a deposit.</b> Turn this on only after the booking backend and PayMongo are set up (checklist part 2). While it’s off, the website asks customers to call or message the shop instead.</span></label>
      <p class="muted small">PayMongo needs at least ₱100 per payment. The website shows these rules to customers before they pay.</p>
      <div class="modal-f"><button class="btn btn-primary" type="submit">Save rules</button></div>
    </form></section>
  <section class="panel"><div class="panel-h"><h2>Services & prices</h2><button class="btn btn-sm btn-primary" data-act="newService">+ Service</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Service</th><th>For</th><th>Category</th><th class="r">Minutes</th><th class="r">Price</th><th>On website</th><th></th></tr></thead><tbody>
      ${services().map(s => `<tr><td><b>${esc(s.name)}</b><div class="muted small">${esc(s.desc || '')}</div></td><td>${s.group === 'her' ? 'Her' : 'Him'}${s.tier ? ` · ${s.tier === 'deluxe' ? 'Deluxe' : 'Regular'}` : ''}${s.kind === 'extra' ? ' · Add-on' : ''}</td><td>${esc(s.cat || '')}</td><td class="r">${esc(s.mins)}</td><td class="r"><b>${esc(priceLabel(s, cur()))}</b></td><td>${s.active !== false ? chip({ kind: 'good', icon: '✓', label: 'Shown' }) : chip({ kind: 'mute', icon: '–', label: 'Hidden' })}</td><td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="editService" data-id="${esc(s.id)}">Edit</button><button class="btn btn-sm btn-danger" data-act="delService" data-id="${esc(s.id)}">Remove</button></div></td></tr>`).join('')}
    </tbody></table></div></section>
  <section class="panel"><div class="panel-h"><h2>Who can use this dashboard</h2></div>
    <p class="muted" style="max-width:72ch">Anyone with a sign-in whose user ID is in the <b>admins</b> collection in Firebase. To add a staff account: create the user in Firebase console → Authentication, copy their User UID, then add a document with that ID in Firestore → admins. README step 3 has the details.</p></section>`;
}

// ---------- tab: website (photos, gallery, announcement, reviews) ----------
const stars = n => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
function vWebsite() {
  const I = info(), sh = I.shop, gal = I.gallery || [], revs = I.reviews || [], an = I.announcement || {};
  const upBtn = (kind, label, multiple) => `<label class="btn btn-sm btn-primary upload">${S.uploading === kind ? '<span class="spinner"></span> Uploading…' : esc(label)}<input type="file" accept="image/*" data-upload="${kind}" ${multiple ? 'multiple' : ''} hidden></label>`;
  return `${pageHead('What customers see', 'Website', `<a class="btn" href="../" target="_blank" rel="noopener">${icon('site')}View website</a>`)}
  <div class="grid2e">
    <section class="panel"><div class="panel-h"><h2>Homepage photo</h2>${upBtn('hero', sh.heroPhoto ? 'Replace photo' : 'Upload photo')}</div>
      ${sh.heroPhoto ? `<div class="hero-thumb" style="background-image:url('${esc(sh.heroPhoto)}')"></div><div class="row" style="margin-top:10px"><button class="btn btn-sm btn-danger" data-act="removeHero">Remove photo</button><span class="muted small">Shown full-width behind the headline.</span></div>`
        : '<p class="empty">No photo yet. A wide shot of the shop front or interior works best (landscape, well lit).</p>'}</section>
    <section class="panel"><div class="panel-h"><h2>Announcement bar</h2>${an.active && an.text ? chip({ kind: 'good', icon: '●', label: 'Showing' }) : chip({ kind: 'mute', icon: '–', label: 'Hidden' })}</div>
      <form class="stack" data-form="announce">
        ${field('Message across the top of the website', `<input id="an-text" name="text" value="${esc(an.text || '')}" maxlength="140" placeholder="e.g. Open on All Saints’ Day, 9 AM – 5 PM">`, 'an-text')}
        ${field('Link (optional)', `<input id="an-link" name="link" value="${esc(an.link || '')}" placeholder="https://www.facebook.com/R3ALBarbers">`, 'an-link')}
        <label class="row small"><input type="checkbox" name="active" ${an.active ? 'checked' : ''}> Show it on the website</label>
        <div class="modal-f"><button class="btn btn-primary" type="submit">Save</button></div>
      </form></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Gallery</h2><div class="row"><span class="muted small">${gal.length} photo${gal.length === 1 ? '' : 's'} · first 12 show on the website</span>${upBtn('gallery', '+ Add photos', true)}</div></div>
    ${gal.length ? `<div class="gal-admin">${gal.map((g, i) => `<figure><img src="${esc(g.url)}" alt="${esc(g.caption || 'Gallery photo')}" loading="lazy"><figcaption>
      <input id="gc-${esc(g.id)}" data-caption="${esc(g.id)}" value="${esc(g.caption || '')}" placeholder="Caption, e.g. Mid fade by Reymart" aria-label="Caption">
      <span class="row"><button class="icon-btn" data-act="galMove" data-id="${esc(g.id)}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">←</button><button class="icon-btn" data-act="galMove" data-id="${esc(g.id)}" data-d="1" ${i === gal.length - 1 ? 'disabled' : ''} aria-label="Move later">→</button><button class="btn btn-sm btn-danger" data-act="galDel" data-id="${esc(g.id)}">Remove</button></span></figcaption></figure>`).join('')}</div>`
      : '<p class="empty">No photos yet. Add finished cuts, color work and the shop itself. They’re resized automatically.</p>'}</section>
  <div class="grid2e">
    <section class="panel"><div class="panel-h"><h2>Reviews</h2><button class="btn btn-sm btn-primary" data-act="newReview">+ Review</button></div>
      <p class="muted small" style="margin-bottom:10px">Copy real reviews customers left on Google, Facebook or Setmore, with their permission. Only add reviews people actually wrote.</p>
      ${revs.length ? `<ul class="list">${revs.map(r => `<li><div class="grow"><b>${esc(r.name)}</b> <span class="stars" aria-label="${r.rating} stars">${stars(r.rating)}</span><div class="sub">${esc(r.text)}</div></div><button class="btn btn-sm btn-ghost" data-act="editReview" data-id="${esc(r.id)}">Edit</button></li>`).join('')}</ul>` : '<p class="empty">No reviews yet. The section stays hidden on the website until you add one.</p>'}</section>
    <section class="panel"><div class="panel-h"><h2>Star rating</h2></div>
      <form class="stack" data-form="rating">
        ${field('Where the rating is from', `<select id="gr-s" name="source">${['Google', 'Setmore', 'Facebook'].map(o => `<option ${(sh.ratingSource || 'Google') === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`, 'gr-s')}
        <div class="fgrid">${field('Rating (out of 5)', `<input id="gr-r" name="rating" type="number" min="0" max="5" step="0.1" value="${esc(sh.googleRating ?? '')}">`, 'gr-r')}${field('Number of reviews', `<input id="gr-n" name="count" type="number" min="0" value="${esc(sh.googleCount ?? '')}">`, 'gr-n')}</div>
        ${field('Link to the reviews', `<input id="gr-u" name="url" value="${esc(sh.googleUrl || '')}" placeholder="For example the Google Maps share link">`, 'gr-u')}
        <p class="muted small">Shown in the homepage header. Update it now and then; leave the rating blank to hide it.</p>
        <div class="modal-f"><button class="btn btn-primary" type="submit">Save</button></div>
      </form></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Team photos</h2><a class="btn btn-sm btn-ghost" href="#team">Edit team</a></div>
    <div class="team-admin">${activeStaff().map(b => `<div class="tm">${b.photo ? `<img src="${esc(b.photo)}" alt="${esc(b.name)}">` : `<span class="mono">${esc(initials(b.name))}</span>`}<b>${esc(b.name)}</b><label class="btn btn-sm upload">${S.uploading === 'staff-' + b.id ? '<span class="spinner"></span>' : b.photo ? 'Replace' : 'Upload'}<input type="file" accept="image/*" data-upload="staff-${esc(b.id)}" hidden></label></div>`).join('') || '<p class="empty">Add your team first in Barbers.</p>'}</div></section>`;
}
function reviewModal(r) {
  const c = r || { rating: 5, source: 'Google' };
  openModal(r ? 'Edit review' : 'Add review', `<form class="stack" data-form="review" data-id="${esc(c.id || '')}">
    <div class="fgrid three">${field('Customer name', `<input id="rv-name" name="name" value="${esc(c.name || '')}" required>`, 'rv-name')}${field('Stars', `<select id="rv-r" name="rating">${[5, 4, 3, 2, 1].map(n => opt(n, `${n} ★`, +c.rating === n)).join('')}</select>`, 'rv-r')}${field('Where it was posted', `<select id="rv-s" name="source">${['Google', 'Facebook', 'In person'].map(x => opt(x, x, x === c.source)).join('')}</select>`, 'rv-s')}</div>
    ${field('Review', `<textarea id="rv-t" name="text" rows="4" maxlength="400" required>${esc(c.text || '')}</textarea>`, 'rv-t')}
    <p class="err" id="m-err" hidden></p>${mFoot(r ? 'Save changes' : 'Add review', r ? `<button type="button" class="btn btn-danger" data-act="delReview" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
async function handleUpload(input) {
  const kind = input.dataset.upload, files = [...input.files]; if (!files.length) return;
  S.uploading = kind; render();
  try {
    const big = kind === 'hero' ? 1920 : kind.startsWith('staff-') ? 800 : 1600, small = demo ? (kind === 'hero' ? 1280 : 900) : big;
    const done = [];
    for (const f of files.slice(0, 20)) { const blob = await resizeImage(f, small, demo ? 0.72 : 0.82); done.push(await uploadImage(blob, kind === 'hero' ? 'hero' : kind.startsWith('staff-') ? 'team' : 'gallery')); }
    if (kind === 'hero') { const old = info().shop.heroPhotoPath; await saveInfo({ shop: { ...info().shop, heroPhoto: done[0].url, heroPhotoPath: done[0].path } }); deleteImage(old); toast('Homepage photo updated'); }
    else if (kind === 'gallery') { await saveInfo({ gallery: [...(info().gallery || []), ...done.map(d => ({ id: newId(), url: d.url, path: d.path, caption: '' }))] }); toast(`${done.length} photo${done.length > 1 ? 's' : ''} added`); }
    else { const id = kind.slice(6), b = staffById(id); if (b) { await patch('staff', id, { photo: done[0].url, photoPath: done[0].path }); deleteImage(b.photoPath); setTimeout(syncPublicBarbers, 400); toast(`${b.name}’s photo updated`); } }
  } catch (e) { console.error(e); toast(/quota|exceeded/i.test(e.message || e.name) ? 'The demo can’t store more photos in this browser. Remove some first.' : /^storage\//.test(e.code || '') ? 'Photo uploads need Firebase Storage, which comes with the Blaze plan (checklist part 2).' : (e.message || 'Upload failed. Try again.'), 'bad'); }
  S.uploading = ''; input.value = ''; render();
}

const TAB_VIEWS = { overview: vOverview, schedule: vSchedule, checkout: vCheckout, money: vMoney, team: vTeam, clients: vClients, stock: vStock, website: vWebsite, setup: vSetup };

// ================= MODALS =================
function openModal(title, body, wide) {
  const m = $('#modal');
  m.innerHTML = `<div class="scrim" data-act="scrim"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="modal-h"><h2 id="mt">${esc(title)}</h2><button type="button" class="icon-btn" data-act="closeModal" aria-label="Close">✕</button></div><div class="modal-b">${body}</div></div></div>`;
  m.hidden = false;
  setTimeout(() => { const f = m.querySelector('input:not([type=checkbox]),select,textarea'); if (f) f.focus(); }, 30);
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
const svcChecks = sel => { const groups = [...new Set(activeServices().map(s => s.cat || 'Services'))]; return groups.map(g => `<p class="eyebrow" style="margin:4px 0">${esc(g)}</p><div class="checks">${activeServices().filter(s => (s.cat || 'Services') === g).map(s => `<label class="check"><input type="checkbox" name="svc" value="${esc(s.id)}" ${(sel || []).includes(s.id) ? 'checked' : ''}>${esc(s.name)}<span class="p">${esc(priceLabel(s, cur()))}</span></label>`).join('')}</div>`).join(''); };
const barberSelect = (name, sel, anyLabel) => `<select name="${name}" id="m-${name}">${anyLabel ? opt('', anyLabel, !sel) : ''}${activeStaff().map(b => opt(b.id, b.name, b.id === sel)).join('')}</select>`;
const mFoot = (label, extra) => `<div class="modal-f">${extra || ''}<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">${esc(label)}</button></div>`;

function apptModal(a, mode) {
  const c = a || {}, walk = mode === 'walkin' || c.source === 'walk-in', d = c.deposit || {};
  openModal(a ? 'Edit visit' : walk ? 'Add walk-in' : 'New booking', `<form class="stack" data-form="appt" data-id="${esc(c.id || '')}" data-mode="${mode}">
    ${c.status === 'needs_attention' ? '<p class="hint"><b>This client paid but lost the slot.</b> Pick a new time, set the status to Booked and save. Or refund the deposit in PayMongo and mark it refunded below.</p>' : ''}
    <div class="fgrid">${field('Client name', `<input id="m-name" name="name" list="cust-list" value="${esc(c.name || '')}" autocomplete="off" ${walk ? 'placeholder="Walk-in"' : 'required'}>`, 'm-name')}${field('Phone', `<input id="m-phone" name="phone" inputmode="tel" value="${esc(c.phone || '')}">`, 'm-phone')}</div>
    <fieldset class="field"><legend>Services</legend>${svcChecks(c.serviceIds)}</fieldset>
    <div class="fgrid${walk ? '' : ' three'}">${field('Barber', barberSelect('barberId', c.barberId, 'Any barber'), 'm-barberId')}
      ${walk ? '' : field('Date', `<input type="date" id="m-date" name="date" value="${esc(c.date || S.schedDate || today())}" required>`, 'm-date') + field('Time', `<input type="time" id="m-time" name="time" value="${esc(c.time || '')}" step="1800" required>`, 'm-time')}</div>
    ${a && !walk ? field('Status', `<select id="m-status" name="status">${(STATUS_CHOICES.includes(c.status) ? STATUS_CHOICES : [c.status, ...STATUS_CHOICES]).map(k => opt(k, APPT[k].label, k === c.status)).join('')}</select>`, 'm-status') : ''}
    ${d.status && d.status !== 'unpaid' ? field(`Online deposit (${money(d.amount)} via ${methodName(d.method)})`, `<select id="m-dep" name="deposit">${opt('paid', 'Paid · counts toward the bill', d.status === 'paid')}${opt('kept', 'Kept · no-show or late cancellation', d.status === 'kept')}${opt('refunded', 'Refunded in PayMongo', d.status === 'refunded')}</select>`, 'm-dep') : ''}
    ${field('Notes', `<textarea id="m-notes" name="notes" rows="2">${esc(c.notes || '')}</textarea>`, 'm-notes')}
    ${walk ? '' : `<label class="row small"><input type="checkbox" name="notify" ${c.notify !== false ? 'checked' : ''}> Text the client reminders (needs a mobile number)</label>`}
    <p class="err" id="m-err" hidden></p>
    ${mFoot(a ? 'Save changes' : walk ? 'Add to queue' : 'Save booking', a ? `<button type="button" class="btn btn-danger" data-act="delAppt" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>` : '')}
  </form>`);
}
function expenseModal(e) {
  const c = e || { date: today(), method: 'Cash' };
  openModal(e ? 'Edit expense' : 'Add expense', `<form class="stack" data-form="expense" data-id="${esc(c.id || '')}">
    <div class="fgrid">${field('Date', `<input type="date" id="m-edate" name="date" value="${esc(c.date)}" required>`, 'm-edate')}${field('Category', `<select id="m-ecat" name="cat">${EXP_CATS.map(x => opt(x, x, x === c.cat)).join('')}</select>`, 'm-ecat')}</div>
    ${field('Description', `<input id="m-edesc" name="desc" value="${esc(c.desc || '')}" placeholder="e.g. Meralco bill, October">`, 'm-edesc')}
    <div class="fgrid">${field('Amount (' + cur() + ')', `<input id="m-eamt" name="amount" inputmode="decimal" value="${esc(c.amount || '')}" required>`, 'm-eamt')}${field('Paid by', `<select id="m-emeth" name="method">${METHODS.map(x => opt(x, x, x === c.method)).join('')}</select>`, 'm-emeth')}</div>
    <p class="err" id="m-err" hidden></p>${mFoot(e ? 'Save changes' : 'Add expense')}</form>`);
}
function staffModal(b) {
  const c = b || { rate: 60, dailyPay: 500, days: [0, 1, 2, 3, 4, 5, 6], groups: ['him'], tiers: ['regular'], active: true };
  openModal(b ? `Edit ${b.name}` : 'Add barber or stylist', `<form class="stack" data-form="staff" data-id="${esc(c.id || '')}">
    <div class="fgrid">${field('Name', `<input id="m-sname" name="name" value="${esc(c.name || '')}" required>`, 'm-sname')}${field('Title', `<input id="m-stitle" name="title" value="${esc(c.title || '')}" placeholder="Senior barber, Stylist">`, 'm-stitle')}</div>
    <div class="fgrid">${field('Specialty (shown on website)', `<input id="m-sspec" name="specialty" value="${esc(c.specialty || '')}">`, 'm-sspec')}${field('Phone', `<input id="m-sphone" name="phone" value="${esc(c.phone || '')}">`, 'm-sphone')}</div>
    <div class="fgrid">${field('Guaranteed daily pay (₱)', `<input id="m-sdaily" name="dailyPay" type="number" min="0" step="any" value="${esc(c.dailyPay ?? 0)}" required>`, 'm-sdaily', 'Paid for every day worked, even with no clients')}${field('Commission on services (%)', `<input id="m-srate" name="rate" type="number" min="0" max="100" value="${esc(c.rate ?? 60)}" required>`, 'm-srate', 'On top of the daily pay, rounded down to the peso. The shop keeps the rest. Seniors 50, juniors 60.')}${field('Chair number', `<input id="m-schair" name="chair" type="number" min="1" max="20" value="${esc(c.chair || '')}">`, 'm-schair')}</div>
    <fieldset class="field"><legend>Takes bookings for</legend><div class="row">${[['him', 'Men’s services'], ['her', 'Women’s services']].map(([k, l]) => `<label class="check"><input type="checkbox" name="groups" value="${k}" ${(c.groups || ['him']).includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></fieldset>
    <fieldset class="field"><legend>Men’s haircuts they do</legend><div class="row">${[['deluxe', 'Deluxe (senior barber)'], ['regular', 'Regular']].map(([k, l]) => `<label class="check"><input type="checkbox" name="tiers" value="${k}" ${(c.tiers || []).includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div><p class="muted small">Online, clients can only book this barber for these haircuts. Add-ons work with either.</p></fieldset>
    <fieldset class="field"><legend>Days in</legend><div class="row">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="check"><input type="checkbox" name="days" value="${d}" ${(c.days || []).includes(d) ? 'checked' : ''}>${DAYS[d]}</label>`).join('')}</div></fieldset>
    ${b ? `<label class="row small"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> Currently working here (unticked: hidden from the website and booking)</label>` : ''}
    <p class="err" id="m-err" hidden></p>${mFoot(b ? 'Save changes' : 'Add')}</form>`);
}
function itemModal(i) {
  const c = i || { cat: 'Retail', stock: 0, reorder: 3, unit: 'pcs' };
  openModal(i ? 'Edit item' : 'Add item', `<form class="stack" data-form="item" data-id="${esc(c.id || '')}">
    ${field('Item name', `<input id="m-iname" name="name" value="${esc(c.name || '')}" required>`, 'm-iname')}
    <div class="fgrid three">${field('Type', `<select id="m-icat" name="cat">${opt('Retail', 'Retail (sold to clients)', c.cat === 'Retail')}${opt('Supply', 'Shop supply', c.cat === 'Supply')}</select>`, 'm-icat')}${field('Unit', `<input id="m-iunit" name="unit" value="${esc(c.unit || '')}" placeholder="pcs, box, bottle">`, 'm-iunit')}${field('Reorder at', `<input id="m-ireo" name="reorder" type="number" min="0" value="${esc(c.reorder)}">`, 'm-ireo')}</div>
    <div class="fgrid three">${field('In stock', `<input id="m-istock" name="stock" type="number" value="${esc(c.stock)}">`, 'm-istock')}${field('Cost each (' + cur() + ')', `<input id="m-icost" name="cost" inputmode="decimal" value="${esc(c.cost || '')}">`, 'm-icost')}${field('Selling price (' + cur() + ')', `<input id="m-iprice" name="price" inputmode="decimal" value="${esc(c.price || '')}">`, 'm-iprice')}</div>
    <p class="err" id="m-err" hidden></p>${mFoot(i ? 'Save changes' : 'Add item', i ? `<button type="button" class="btn btn-danger" data-act="delItem" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
function adjustModal(i, dir) {
  openModal(dir === 'in' ? `Receive ${i.name}` : `Use ${i.name}`, `<form class="stack" data-form="adjust" data-id="${esc(i.id)}" data-dir="${dir}">
    <p class="muted">Now in stock: <b style="color:var(--ink)">${i.stock} ${esc(i.unit || '')}</b></p>
    <div class="fgrid">${field('Quantity', `<input id="m-aqty" name="qty" type="number" min="1" value="1" required>`, 'm-aqty')}${field('Note', `<input id="m-anote" name="note" placeholder="${dir === 'in' ? 'Supplier, receipt no.' : 'Opened for chair 2'}">`, 'm-anote')}</div>
    ${dir === 'in' ? `<label class="row small"><input type="checkbox" name="expense" checked> Also record as a “Stock purchase” expense at ${money(i.cost || 0)} each</label>` : ''}
    ${(i.log || []).length ? `<div><p class="eyebrow" style="margin-bottom:6px">Recent changes</p><ul class="list small">${(i.log || []).slice(-5).reverse().map(l => `<li><span class="grow">${esc(l.note || '')}</span><span class="muted">${l.at ? fmtDate(ymd(new Date(l.at))) : ''}</span><b class="num ${l.delta > 0 ? 'up' : 'down'}">${l.delta > 0 ? '+' : ''}${l.delta}</b></li>`).join('')}</ul></div>` : ''}
    ${mFoot(dir === 'in' ? 'Add to stock' : 'Take from stock')}</form>`);
}
function serviceModal(s) {
  const c = s || { cat: 'For him', group: 'him', mins: 60, active: true };
  const cats = [...new Set(services().map(x => x.cat).filter(Boolean))];
  openModal(s ? 'Edit service' : 'Add service', `<form class="stack" data-form="service" data-id="${esc(c.id || '')}">
    <div class="fgrid">${field('Service name', `<input id="m-vname" name="name" value="${esc(c.name || '')}" required>`, 'm-vname')}${field('Menu section', `<input id="m-vcat" name="cat" list="svc-cats" value="${esc(c.cat || '')}"><datalist id="svc-cats">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`, 'm-vcat')}</div>
    <div class="fgrid three">${field('For', `<select id="m-vgroup" name="group">${opt('him', 'Him', c.group !== 'her')}${opt('her', 'Her', c.group === 'her')}</select>`, 'm-vgroup')}${field('Price (' + cur() + ')', `<input id="m-vprice" name="price" inputmode="decimal" value="${esc(c.price ?? '')}" required>`, 'm-vprice')}${field('Minutes', `<input id="m-vmins" name="mins" type="number" min="30" step="30" value="${esc(c.mins)}">`, 'm-vmins')}</div>
    <div class="fgrid">${field('Booking type (men)', `<select id="m-vkind" name="kind">${opt('', 'Regular service', !c.kind)}${opt('base', 'Haircut (client picks one)', c.kind === 'base')}${opt('extra', 'Add-on to a haircut', c.kind === 'extra')}</select>`, 'm-vkind')}${field('Haircut level', `<select id="m-vtier" name="tier">${opt('', 'Any barber', !c.tier)}${opt('deluxe', 'Deluxe (senior barbers)', c.tier === 'deluxe')}${opt('regular', 'Regular barbers', c.tier === 'regular')}</select>`, 'm-vtier')}</div>
    ${field('Description', `<input id="m-vdesc" name="desc" value="${esc(c.desc || '')}">`, 'm-vdesc')}
    <label class="row small"><input type="checkbox" name="priceFrom" ${c.priceFrom ? 'checked' : ''}> Show as “from” price (final price depends on hair length)</label>
    <label class="row small"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> Show on website and at checkout</label>
    <p class="err" id="m-err" hidden></p>${mFoot(s ? 'Save changes' : 'Add service')}</form>`);
}
function clientModal(c) {
  const x = c || {};
  openModal(c ? 'Edit client' : 'Add client', `<form class="stack" data-form="client" data-id="${esc(x.id || '')}">
    <div class="fgrid">${field('Name', `<input id="m-cname" name="name" value="${esc(x.name || '')}" required>`, 'm-cname')}${field('Phone', `<input id="m-cphone" name="phone" inputmode="tel" value="${esc(x.phone || '')}">`, 'm-cphone')}</div>
    ${field('Notes', `<textarea id="m-cnotes" name="notes" rows="3" placeholder="Usual cut, guard number, preferences">${esc(x.notes || '')}</textarea>`, 'm-cnotes')}
    <label class="row small"><input type="checkbox" name="noReminders" ${x.noReminders ? 'checked' : ''}> Don’t send this client “time for a trim” texts</label>
    <p class="err" id="m-err" hidden></p>${mFoot(c ? 'Save changes' : 'Add client', c ? `<button type="button" class="btn btn-danger" data-act="delClient" data-id="${esc(x.id)}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
function clientDrawer(c) {
  const st = custStats()[c.id] || { visits: 0, spent: 0, last: '', barbers: {} }, N = loyaltyN();
  const hist = S.sales.filter(s => s.customerId === c.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const next = S.appointments.filter(a => (a.customerId === c.id || (c.phone && normPhone(a.phone) === normPhone(c.phone))) && a.date >= today() && a.status === 'booked').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  openModal(c.name, `<div class="stack">
    <div class="kpis">${kpi('Visits', st.visits)}${kpi('Spent', money(st.spent))}${kpi('Last visit', st.last ? shortDate(st.last) : '—')}</div>
    <p class="row"><b>${esc(c.phone || 'No phone')}</b>${c.email ? `<span class="muted">${esc(c.email)}</span>` : ''}${usualBarber(st) ? `<span class="muted">· Usually with ${esc(usualBarber(st))}</span>` : ''}</p>
    ${N ? `<p class="hint">${(st.visits + 1) % N === 0 ? `<b>Next visit is free</b> (visit #${st.visits + 1}).` : `${N - ((st.visits + 1) % N)} more visit${N - ((st.visits + 1) % N) === 1 ? '' : 's'} after the next one to a free cut.`}</p>` : ''}
    ${next ? `<p class="note">Next booking: <b>${fmtDate(next.date)} at ${fmtTime(next.time)}</b> with ${esc(staffName(next.barberId))}</p>` : ''}
    ${c.notes ? `<div class="note">${esc(c.notes)}</div>` : ''}
    <div><p class="eyebrow" style="margin-bottom:6px">Visit history</p>${hist.length ? `<ul class="list">${hist.slice(0, 15).map(s => `<li><span class="t">${shortDate(s.date)}</span><span class="grow"><span>${esc((s.lines || []).map(l => l.name).join(', '))}</span><span class="sub" style="display:block">${esc(staffName(s.barberId))} · ${esc(s.method)}</span></span><b class="num">${money(s.total)}</b></li>`).join('')}</ul>` : '<p class="empty">No visits recorded yet.</p>'}</div>
    <div class="modal-f"><button type="button" class="btn" data-act="editClient" data-id="${esc(c.id)}">Edit client</button><button type="button" class="btn btn-primary" data-act="checkoutClient" data-id="${esc(c.id)}">Start checkout</button></div>
  </div>`, true);
}
function payModal(b) {
  const owed = owedFor(b.id);
  openModal(`Pay ${b.name}`, `<form class="stack" data-form="payout" data-id="${esc(b.id)}">
    <p class="muted">Owed now: <b style="color:var(--ink)">${money(owed, 1)}</b> (daily pay, commission and tips, minus earlier payouts)</p>
    <div class="fgrid">${field('Amount (' + cur() + ')', `<input id="m-pamt" name="amount" inputmode="decimal" value="${owed > 0 ? owed : ''}" required>`, 'm-pamt')}${field('Date paid', `<input type="date" id="m-pdate" name="date" value="${today()}">`, 'm-pdate')}</div>
    ${field('Note', `<input id="m-pnote" name="note" placeholder="e.g. Weekly pay, cash">`, 'm-pnote')}
    <p class="err" id="m-err" hidden></p>${mFoot('Record payout')}</form>`);
}
function receiptModal(s) {
  const shop = info().shop;
  openModal('Receipt', `<div class="receipt">
    <div style="justify-content:center;font:800 22px/1 var(--f-display);text-transform:uppercase">${esc(shop.wordmark || shop.name)}</div>
    <div style="justify-content:center" class="muted">${esc(shop.address)}</div><hr>
    <div><span>${fmtDate(s.date, true)}</span><span>${fmtTime(s.time)}</span></div>
    <div><span>Client</span><span>${esc(s.name || 'Walk-in')}</span></div><div><span>Barber</span><span>${esc(staffName(s.barberId))}</span></div><hr>
    ${(s.lines || []).map(l => `<div><span>${esc(l.name)}${l.qty > 1 ? ' ×' + l.qty : ''}</span><span>${money(l.price * l.qty, 1)}</span></div>`).join('')}<hr>
    ${s.discount ? `<div><span>Discount${s.discountNote ? ' (' + esc(s.discountNote) + ')' : ''}</span><span>${money(-s.discount, 1)}</span></div>` : ''}
    ${s.tip ? `<div><span>Tip</span><span>${money(s.tip, 1)}</span></div>` : ''}
    <div style="font-weight:700;font-size:16px"><span>TOTAL</span><span>${money(s.total, 1)}</span></div>
    ${s.depositCredit ? `<div><span>Deposit paid online</span><span>${money(-s.depositCredit, 1)}</span></div><div><span>Paid at shop (${esc(s.method)})</span><span>${money(s.total - s.depositCredit, 1)}</span></div>` : `<div><span>Paid by</span><span>${esc(s.method)}</span></div>`}
    ${s.cash ? `<div><span>Cash received</span><span>${money(s.cash, 1)}</span></div><div><span>Change</span><span>${money(s.cash - (s.total - (s.depositCredit || 0)), 1)}</span></div>` : ''}
    ${loyaltyLine(s)}
    <hr><div style="justify-content:center" class="muted">${esc(shop.tagline || 'Thank you!')}</div>
  </div><div class="modal-f" style="margin-top:14px"><button type="button" class="btn btn-primary" data-act="closeModal">Done</button></div>`);
}
function loyaltyLine(s) {
  const N = loyaltyN(); if (!N || !s.customerId) return '';
  const visits = S.sales.filter(x => x.customerId === s.customerId && x.id !== s.id).length + 1, left = N - (visits % N);
  return `<hr><div style="justify-content:center;flex-direction:column;align-items:center;gap:6px"><span class="meter">${Array.from({ length: Math.min(N, 12) }, (_, i) => `<i class="${i < (visits % N || (visits ? N : 0)) ? 'on' : ''}"></i>`).join('')}</span><span>${visits % N === 0 ? 'Free visit used. A new loyalty card starts next time' : `Visit ${visits % N} of ${N} · ${left === 1 ? 'next visit is free' : left - 1 + ' more to a free cut'}`}</span></div>`;
}
function modalErr(f, msg) { const e = f.querySelector('#m-err'); if (e) { e.textContent = msg; e.hidden = false; } }

// ================= ACTIONS =================
const ACT = {
  resetDemo,
  scrim(el, e) { if (e.target === el) closeModal(); },
  closeModal,
  async logout() { stopWatches(); await logout(); },
  async forgot() { const email = $('#l-email')?.value.trim(); if (!email) { S.loginErr = 'Type your email first, then tap “Forgot password?”.'; render(); return; } try { await resetPassword(email); S.loginErr = ''; S.loginMsg = 'Password reset email sent. Check your inbox.'; } catch (e) { S.loginErr = 'Couldn’t send the reset email. Check the address.'; } render(); },
  newBooking() { apptModal(null, 'booking'); },
  newWalkin() { apptModal(null, 'walkin'); },
  editAppt(el) { const a = S.appointments.find(x => x.id === el.dataset.id); if (a) apptModal(a, 'edit'); },
  async delAppt(el) { if (!armed(el)) return; if (await del('appointments', el.dataset.id)) { closeModal(); toast('Visit deleted'); } },
  dayShift(el) { S.schedDate = addDays(S.schedDate || today(), +el.dataset.n); render(); },
  dayToday() { S.schedDate = today(); render(); },
  async startAppt(el) { await patch('appointments', el.dataset.id, { status: 'inchair' }); },
  checkoutAppt(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); if (!a) return;
    const p = blankPos(); p.apptId = a.id; p.name = a.name || ''; p.phone = a.phone || ''; p.barberId = a.barberId || '';
    p.deposit = depositPaid(a); p.depositMethod = a.deposit && a.deposit.method;
    p.lines = (a.serviceIds || []).map(svcById).filter(Boolean).map(s => ({ kind: 'service', ref: s.id, name: s.name, price: s.price, qty: 1 }));
    S.pos = p; closeModal(); location.hash = '#checkout';
  },
  checkoutClient(el) { const c = custById(el.dataset.id); if (!c) return; const p = blankPos(); p.name = c.name; p.phone = c.phone || ''; S.pos = p; closeModal(); location.hash = '#checkout'; },
  posPick(el) { S.pos.pick = el.dataset.v; render(); },
  posAdd(el) {
    const p = S.pos, kind = el.dataset.kind, ref = el.dataset.ref;
    const src = kind === 'service' ? svcById(ref) : S.inventory.find(i => i.id === ref); if (!src) return;
    const ex = p.lines.find(l => l.kind === kind && l.ref === ref);
    if (ex) ex.qty++; else p.lines.push({ kind, ref, name: src.name, price: Number(src.price) || 0, qty: 1 });
    render();
  },
  posQty(el) { const l = S.pos.lines[+el.dataset.i]; if (!l) return; l.qty = Math.max(1, l.qty + (+el.dataset.d)); render(); },
  posDel(el) { S.pos.lines.splice(+el.dataset.i, 1); render(); },
  posMethod(el) { S.pos.method = el.dataset.v; render(); },
  posDisc(el) {
    const p = S.pos, T = posTotals(p), v = el.dataset.v;
    if (v === 'sc') { p.discount = String(round2(T.sub * 0.2)); p.discountNote = 'Senior / PWD 20%'; }
    if (v === 'student') { p.discount = String(round2(T.sub * 0.1)); p.discountNote = 'Student 10%'; }
    if (v === 'free') { p.discount = String(Math.max(0, ...p.lines.filter(l => l.kind === 'service').map(l => l.price))); p.discountNote = 'Loyalty free cut'; }
    render();
  },
  posClear() { S.pos = blankPos(); render(); },
  async posComplete(el) {
    const p = S.pos, T = posTotals(p); if (!p.lines.length || S.busy) return;
    if (p.lines.some(l => l.kind === 'service') && !p.barberId) { toast('Choose the barber first.', 'bad'); return; }
    S.busy = true; el.disabled = true;
    try {
      const appt = p.apptId ? S.appointments.find(a => a.id === p.apptId) : null;
      const customerId = (appt && appt.customerId) || await ensureCustomer(p.name, p.phone, appt && appt.email, p.save);
      const b = staffById(p.barberId), rate = Number(b && b.rate) || 0;
      const commission = commissionOf(T.svc - T.disc, rate); // rounded down: the shop gets the extra centavos
      const id = newId();
      const sale = {
        date: today(), time: nowHM(), at: Date.now(), customerId, name: p.name.trim() || 'Walk-in', phone: p.phone.trim(), barberId: p.barberId,
        lines: p.lines.map(l => ({ ...l, price: Number(l.price) || 0 })), svcTotal: T.svc, prodTotal: T.prod, discount: T.disc, discountNote: T.disc ? (p.discountNote || '') : '',
        tip: T.tip, total: T.total, depositCredit: T.deposit, method: p.method, cash: p.method === 'Cash' ? num(p.cash) : 0, apptId: p.apptId || '', rate, commission
      };
      if (!await put('sales', id, sale)) return;
      for (const l of p.lines.filter(x => x.kind === 'product')) {
        const it = S.inventory.find(i => i.id === l.ref); if (!it) continue;
        await patch('inventory', it.id, { stock: (it.stock || 0) - l.qty, log: [...(it.log || []), { at: Date.now(), delta: -l.qty, note: `Sold to ${sale.name}` }].slice(-20) });
      }
      if (p.apptId) await patch('appointments', p.apptId, { status: 'done', saleId: id, customerId: customerId || '' });
      S.pos = blankPos();
      toast(`Sale saved · ${money(sale.total, 1)}`); receiptModal({ id, ...sale });
    } finally { S.busy = false; render(); }
  },
  showSale(el) { const s = S.sales.find(x => x.id === el.dataset.id); if (s) receiptModal(s); },
  async voidSale(el) { if (!armed(el)) return; const s = S.sales.find(x => x.id === el.dataset.id); if (await del('sales', el.dataset.id)) { if (s && s.apptId) await patch('appointments', s.apptId, { status: 'inchair', saleId: '' }); toast('Sale voided. Product stock wasn’t changed back.'); } },
  period(el) { S.period = el.dataset.v; render(); },
  newExpense() { expenseModal(null); },
  editExpense(el) { const e = S.expenses.find(x => x.id === el.dataset.id); if (e) expenseModal(e); },
  async delExpense(el) { if (!armed(el)) return; if (await del('expenses', el.dataset.id)) toast('Expense deleted'); },
  exportXlsx() { try { exportXlsx(); } catch (e) { console.error(e); toast('Couldn’t create the Excel file. Try CSV instead.'); } },
  exportCsv() {
    // Dates are written as text like "Thu 12 Nov 2026" so spreadsheet apps don't reformat them or show ####.
    const r = periodRange(S.period), { sales, exps } = exportRows(r);
    const dt = d => fmtDate(d, true).replace(',', '');
    const rows = [['Date', 'Time', 'Type', 'Client / description', 'Barber / category', 'Services', 'Products', 'Payment', 'Services', 'Products', 'Discount', 'Tip', 'Total', 'Paid online', 'Paid at shop', 'Commission']];
    for (const x of sales) rows.push([dt(x.date), x.time ? fmtTime(x.time) : '', x.type, x.client, x.barber, x.services, x.products, x.method, x.svc, x.prod, x.disc, x.tip, x.total, x.online, x.shop, x.comm]);
    for (const e of exps) rows.push([dt(e.date), '', 'Expense', e.desc, e.cat, '', '', e.method, '', '', '', '', -e.amount, '', '', '']);
    const csv = '\ufeff' + rows.map(row => row.map(v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\r\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileBase(r) + '.csv');
  },
  newStaff() { staffModal(null); },
  editStaff(el) { const b = staffById(el.dataset.id); if (b) staffModal(b); },
  payStaff(el) { const b = staffById(el.dataset.id); if (b) payModal(b); },
  async toggleIn(el) {
    const b = staffById(el.dataset.id), d = S.schedDate || today(); if (!b) return;
    const id = `${d}_${b.id}`, on = el.getAttribute('aria-pressed') === 'true', def = (b.days || []).includes(parseYmd(d).getDay());
    const ok = !on === def ? await del('attendance', id) : await put('attendance', id, { date: d, barberId: b.id, present: !on, at: Date.now() });
    if (ok) toast(`${b.name}: ${!on ? 'in' : 'absent'} on ${fmtDate(d)}`);
  },
  async delPayout(el) { if (!armed(el)) return; if (await del('payouts', el.dataset.id)) toast('Payout deleted'); },
  newClient() { clientModal(null); },
  async remind(el) {
    S.reminding = el.dataset.id; render();
    try { const r = await call('sendTrimReminder', { customerId: el.dataset.id, lastVisit: el.dataset.last }); toast(r.sms || r.email ? `Reminder sent${r.sms ? ' by text' : ''}${r.sms && r.email ? ' and' : ''}${r.email ? ' email' : ''}` : 'Reminder recorded. Texts and emails aren’t connected yet.'); }
    catch (e) { toast(e.message || 'Couldn’t send the reminder.', 'bad'); }
    S.reminding = ''; render();
  },
  async delWait(el) { if (!armed(el)) return; if (await del('waitlist', el.dataset.id)) toast('Removed from the waitlist'); },
  openClient(el) { const c = custById(el.dataset.id); if (c) clientDrawer(c); },
  editClient(el) { const c = custById(el.dataset.id); if (c) clientModal(c); },
  async delClient(el) { if (!armed(el)) return; if (await del('customers', el.dataset.id)) { closeModal(); toast('Client deleted. Their past sales stay in reports.'); } },
  stockFilter(el) { S.stockFilter = el.dataset.v; render(); },
  newItem() { itemModal(null); },
  editItem(el) { const i = S.inventory.find(x => x.id === el.dataset.id); if (i) itemModal(i); },
  adjust(el) { const i = S.inventory.find(x => x.id === el.dataset.id); if (i) adjustModal(i, el.dataset.dir); },
  async delItem(el) { if (!armed(el)) return; if (await del('inventory', el.dataset.id)) { closeModal(); toast('Item deleted'); } },
  removeHero(el) { if (!armed(el)) return; const old = info().shop.heroPhotoPath; saveInfo({ shop: { ...info().shop, heroPhoto: '', heroPhotoPath: '' } }).then(ok => { if (ok) { deleteImage(old); toast('Homepage photo removed'); } }); },
  galMove(el) { const g = [...(info().gallery || [])], i = g.findIndex(x => x.id === el.dataset.id), j = i + (+el.dataset.d); if (i < 0 || j < 0 || j >= g.length) return; [g[i], g[j]] = [g[j], g[i]]; saveInfo({ gallery: g }); },
  async galDel(el) { if (!armed(el)) return; const g = info().gallery || [], x = g.find(y => y.id === el.dataset.id); if (await saveInfo({ gallery: g.filter(y => y.id !== el.dataset.id) })) { deleteImage(x && x.path); toast('Photo removed'); } },
  newReview() { reviewModal(null); },
  editReview(el) { const r = (info().reviews || []).find(x => x.id === el.dataset.id); if (r) reviewModal(r); },
  async delReview(el) { if (!armed(el)) return; if (await saveInfo({ reviews: (info().reviews || []).filter(x => x.id !== el.dataset.id) })) { closeModal(); toast('Review deleted'); } },
  newService() { serviceModal(null); },
  editService(el) { const s = svcById(el.dataset.id); if (s) serviceModal(s); },
  async delService(el) { if (!armed(el)) return; if (await saveInfo({ services: services().filter(s => s.id !== el.dataset.id) })) toast('Service removed. Past sales keep its name.'); },
  async initInfo(el) {
    el.disabled = true;
    const staff = S.staff.length ? S.staff : STARTER_STAFF;
    if (!S.staff.length) for (const b of STARTER_STAFF) { const { id, ...rest } = b; await put('staff', id, { ...rest, since: today() }); }
    if (await put('public', 'info', { ...JSON.parse(JSON.stringify(STARTER)), barbers: staff.filter(b => b.active !== false).map(publicBarber) })) toast('Starter menu and team saved. Edit them in Shop setup and Barbers.');
  }
};
const CHG = {
  async apptStatus(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); const st = el.value; const upd = { status: st };
    if (a && a.deposit && ['noshow', 'cancelled'].includes(st) && a.deposit.status === 'paid') { upd['deposit.status'] = 'kept'; toast(`Deposit of ${money(a.deposit.amount)} marked as kept.`); }
    if (a && a.deposit && ['booked', 'waiting', 'inchair'].includes(st) && a.deposit.status === 'kept') upd['deposit.status'] = 'paid';
    await patch('appointments', el.dataset.id, upd);
  },
  async apptBarber(el) { await patch('appointments', el.dataset.id, { barberId: el.value }); }
};

// ================= FORMS =================
async function saveInfo(partial) {
  if (S.infoMissing) return put('public', 'info', { ...JSON.parse(JSON.stringify(STARTER)), ...partial });
  return patch('public', 'info', partial);
}
async function syncPublicBarbers() { await saveInfo({ barbers: S.staff.filter(b => b.active !== false).sort((a, b) => (a.chair || 99) - (b.chair || 99)).map(publicBarber) }); }
const FORM = {
  async login(f) {
    const fd = new FormData(f); S.loginBusy = true; S.loginErr = ''; S.loginMsg = ''; render();
    try { await login(String(fd.get('email')).trim(), String(fd.get('pass'))); }
    catch (e) { S.loginErr = /invalid|wrong|not-found|credential/i.test(e.code || e.message) ? 'Wrong email or password.' : /too-many/i.test(e.code || '') ? 'Too many attempts. Wait a few minutes and try again.' : 'Couldn’t sign in. Check your connection.'; }
    S.loginBusy = false; render();
  },
  async appt(f) {
    const fd = new FormData(f), mode = f.dataset.mode, id = f.dataset.id || newId();
    const name = String(fd.get('name') || '').trim(), phone = String(fd.get('phone') || '').trim(), svc = fd.getAll('svc');
    if (mode !== 'walkin' && !name) return modalErr(f, 'Enter the client’s name.');
    if (!svc.length) return modalErr(f, 'Pick at least one service.');
    const cust = matchCustomer(name, phone);
    const base = { name: name || 'Walk-in', phone, serviceIds: svc, mins: svcMins(svc), barberId: String(fd.get('barberId') || ''), notes: String(fd.get('notes') || '').trim(), customerId: cust ? cust.id : '' };
    if (fd.has('date')) { const t = String(fd.get('time')); if (t && toMin(t) % pol().step !== 0) return modalErr(f, `Use a time on the ${pol().step}-minute mark, like 2:00 or 2:30.`); }
    let ok;
    if (mode === 'walkin') {
      const qn = Math.max(0, ...S.appointments.filter(a => a.date === today() && a.source === 'walk-in').map(a => a.queueNo || 0)) + 1;
      ok = await put('appointments', id, { ...base, date: today(), time: nowHM(), status: 'waiting', source: 'walk-in', queueNo: qn, notify: false, createdAt: Date.now() });
      if (ok) toast(`${base.name} is #${qn} in the queue`);
    } else if (mode === 'edit') {
      const a = S.appointments.find(x => x.id === id) || {};
      const upd = { ...base, notify: fd.has('notify') };
      if (fd.has('date')) { upd.date = String(fd.get('date')); upd.time = String(fd.get('time')); upd.startAt = startMs(upd.date, upd.time); if (a.date !== upd.date || a.time !== upd.time) upd.reminders = {}; }
      if (fd.has('status')) upd.status = String(fd.get('status'));
      if (fd.has('deposit')) upd['deposit.status'] = String(fd.get('deposit'));
      ok = await patch('appointments', id, upd); if (ok) toast('Visit updated');
    } else {
      const date = String(fd.get('date')), time = String(fd.get('time'));
      if (!date || !time) return modalErr(f, 'Pick a date and time.');
      ok = await put('appointments', id, { ...base, date, time, startAt: startMs(date, time), status: 'booked', source: 'phone', notify: fd.has('notify') && !!phone, reminders: {}, createdAt: Date.now() });
      if (ok) { toast(`Booked ${base.name} · ${fmtDate(date)} ${fmtTime(time)}`); S.schedDate = date; }
    }
    if (ok) closeModal();
  },
  async expense(f) {
    const fd = new FormData(f), amt = num(fd.get('amount'));
    if (amt <= 0) return modalErr(f, 'Enter an amount above zero.');
    const data = { date: String(fd.get('date')), cat: String(fd.get('cat')), desc: String(fd.get('desc') || '').trim(), amount: round2(amt), method: String(fd.get('method')) };
    const ok = f.dataset.id ? await patch('expenses', f.dataset.id, data) : await put('expenses', newId(), { ...data, createdAt: Date.now() });
    if (ok) { closeModal(); toast(f.dataset.id ? 'Expense updated' : `Expense added · ${money(data.amount, 1)}`); }
  },
  async staff(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim(), rate = num(fd.get('rate'));
    if (!name) return modalErr(f, 'Enter a name.');
    if (rate < 0 || rate > 100) return modalErr(f, 'Commission must be between 0 and 100%.');
    const groups = fd.getAll('groups'); if (!groups.length) return modalErr(f, 'Pick men’s or women’s services (or both).');
    const data = { name, title: String(fd.get('title') || '').trim(), phone: String(fd.get('phone') || '').trim(), specialty: String(fd.get('specialty') || '').trim(), rate, dailyPay: Math.max(0, Number(fd.get('dailyPay')) || 0), groups, tiers: fd.getAll('tiers'), chair: fd.get('chair') ? +fd.get('chair') : '', days: fd.getAll('days').map(Number).sort() };
    const id = f.dataset.id;
    const ok = id ? await patch('staff', id, { ...data, active: fd.has('active') }) : await put('staff', newId(), { ...data, active: true, since: today() });
    if (ok) { closeModal(); toast(id ? `${name} updated` : `${name} added`); setTimeout(syncPublicBarbers, 400); }
  },
  async payout(f) {
    const fd = new FormData(f), amt = num(fd.get('amount')), bid = f.dataset.id;
    if (amt <= 0) return modalErr(f, 'Enter an amount above zero.');
    if (await put('payouts', newId(), { barberId: bid, amount: round2(amt), date: String(fd.get('date') || today()), note: String(fd.get('note') || '').trim(), createdAt: Date.now() })) { closeModal(); toast(`Paid ${staffName(bid)} ${money(amt, 1)}`); }
  },
  async client(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim();
    if (!name) return modalErr(f, 'Enter a name.');
    const data = { name, phone: String(fd.get('phone') || '').trim(), phoneKey: phoneKey(fd.get('phone')), notes: String(fd.get('notes') || '').trim(), noReminders: fd.has('noReminders') };
    const ok = f.dataset.id ? await patch('customers', f.dataset.id, data) : await put('customers', newId(), { ...data, createdAt: Date.now() });
    if (ok) { closeModal(); toast(f.dataset.id ? 'Client updated' : `${name} added`); }
  },
  async item(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim();
    if (!name) return modalErr(f, 'Enter the item name.');
    const data = { name, cat: String(fd.get('cat')), unit: String(fd.get('unit') || '').trim(), reorder: Math.max(0, parseInt(fd.get('reorder'), 10) || 0), stock: parseInt(fd.get('stock'), 10) || 0, cost: round2(num(fd.get('cost'))), price: round2(num(fd.get('price'))) };
    const ok = f.dataset.id ? await patch('inventory', f.dataset.id, data) : await put('inventory', newId(), { ...data, log: [] });
    if (ok) { closeModal(); toast(f.dataset.id ? 'Item updated' : `${name} added`); }
  },
  async adjust(f) {
    const fd = new FormData(f), i = S.inventory.find(x => x.id === f.dataset.id), q = parseInt(fd.get('qty'), 10) || 0;
    if (!i || q <= 0) return;
    const dir = f.dataset.dir, delta = dir === 'in' ? q : -q, note = String(fd.get('note') || '').trim() || (dir === 'in' ? 'Received' : 'Used in shop');
    if (await patch('inventory', i.id, { stock: (i.stock || 0) + delta, log: [...(i.log || []), { at: Date.now(), delta, note }].slice(-20) })) {
      if (dir === 'in' && fd.has('expense') && (i.cost || 0) > 0) await put('expenses', newId(), { date: today(), cat: 'Stock purchase', desc: `${i.name} ×${q}${note !== 'Received' ? ' · ' + note : ''}`, amount: round2(q * (i.cost || 0)), method: 'Cash', createdAt: Date.now() });
      closeModal(); toast(`${i.name}: ${(i.stock || 0) + delta} ${i.unit || ''} in stock`);
    }
  },
  async service(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim(), price = num(fd.get('price'));
    if (!name) return modalErr(f, 'Enter the service name.');
    if (price < 0) return modalErr(f, 'Enter a price.');
    const mins = Math.max(pol().step, Math.round((parseInt(fd.get('mins'), 10) || 60) / pol().step) * pol().step);
    const data = { name, cat: String(fd.get('cat') || '').trim() || 'Services', group: String(fd.get('group')), price: round2(price), mins, desc: String(fd.get('desc') || '').trim(), kind: String(fd.get('kind') || ''), tier: String(fd.get('tier') || ''), priceFrom: fd.has('priceFrom'), active: fd.has('active') };
    const list = services().map(s => ({ ...s }));
    if (f.dataset.id) { const k = list.findIndex(s => s.id === f.dataset.id); if (k >= 0) list[k] = { ...list[k], ...data }; } else list.push({ id: newId(), ...data });
    if (await saveInfo({ services: list })) { closeModal(); toast(f.dataset.id ? 'Service updated' : `${name} added`); }
  },
  async shop(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim();
    if (!name) { toast('Enter the shop name.', 'bad'); return; }
    const g = k => String(fd.get(k) || '').trim();
    const shop = { ...info().shop, name, wordmark: g('wordmark'), tagline: g('tagline'), about: g('about'), address: g('address'), phone: g('phone'), facebook: g('facebook'), instagram: g('instagram'), gcashNumber: g('gcashNumber'), gcashName: g('gcashName'), currency: g('currency') || '₱', loyaltyEvery: Math.max(0, parseInt(fd.get('loyaltyEvery'), 10) || 0) };
    if (shop.facebook && !/^https:\/\//.test(shop.facebook)) shop.facebook = 'https://' + shop.facebook.replace(/^http:\/\//, '');
    if (await saveInfo({ shop })) toast('Shop details saved');
  },
  async hours(f) {
    const fd = new FormData(f);
    const hours = [0, 1, 2, 3, 4, 5, 6].map(d => ({ d, open: String(fd.get('open-' + d) || '09:00'), close: String(fd.get('close-' + d) || '20:00'), closed: fd.has('closed-' + d) }));
    if (hours.some(h => !h.closed && toMin(h.close) <= toMin(h.open))) { toast('Closing time must be after opening time.', 'bad'); return; }
    if (await saveInfo({ hours })) toast('Hours saved');
  },
  async announce(f) {
    const fd = new FormData(f), text = String(fd.get('text') || '').trim(); let link = String(fd.get('link') || '').trim();
    if (link && !/^https:\/\//.test(link)) link = 'https://' + link.replace(/^http:\/\//, '');
    if (await saveInfo({ announcement: { text, link, active: fd.has('active') && !!text } })) toast(fd.has('active') && text ? 'Announcement is showing on the website' : 'Announcement saved (hidden)');
  },
  async rating(f) {
    const fd = new FormData(f), r = String(fd.get('rating') || '').trim();
    if (await saveInfo({ shop: { ...info().shop, googleRating: r === '' ? '' : Math.min(5, Math.max(0, num(r))), googleCount: parseInt(fd.get('count'), 10) || 0, googleUrl: String(fd.get('url') || '').trim(), ratingSource: String(fd.get('source') || 'Google') } })) toast('Rating saved');
  },
  async review(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim(), text = String(fd.get('text') || '').trim();
    if (!name || !text) return modalErr(f, 'Enter the name and the review.');
    const list = [...(info().reviews || [])], data = { name, text, rating: +fd.get('rating'), source: String(fd.get('source')) };
    if (f.dataset.id) { const k = list.findIndex(x => x.id === f.dataset.id); if (k >= 0) list[k] = { ...list[k], ...data }; } else list.unshift({ id: newId(), ...data });
    if (await saveInfo({ reviews: list })) { closeModal(); toast('Review saved'); }
  },
  async policy(f) {
    const fd = new FormData(f), n = (k, min, max) => Math.min(max, Math.max(min, parseInt(fd.get(k), 10) || 0));
    const policy = { ...pol(), deposit: n('deposit', 100, 100000), holdMinutes: n('holdMinutes', 5, 60), rescheduleHours: n('rescheduleHours', 0, 168), lateMinutes: n('lateMinutes', 0, 120), leadMinutes: n('leadMinutes', 0, 1440), bookAheadDays: n('bookAheadDays', 1, 90), rebookDays: n('rebookDays', 0, 120), lastBooking: /^\d{2}:\d{2}$/.test(String(fd.get('lastBooking') || '')) ? String(fd.get('lastBooking')) : '', onlineBooking: fd.has('onlineBooking') };
    if (await saveInfo({ policy })) toast('Booking rules saved');
  }
};

// ================= EVENTS =================
function setPath(path, val) { const k = path.split('.'); let o = S; for (let i = 0; i < k.length - 1; i++) { o = o[k[i]] = o[k[i]] || {}; } o[k[k.length - 1]] = val; }
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el) return; const fn = ACT[el.dataset.act]; if (fn) fn(el, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  if (e.key === 'Enter' && e.target.matches('tr.click[data-act]')) ACT[e.target.dataset.act](e.target, e);
});
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.bind) return;
  setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.hasAttribute('data-num') ? num(el.value) : el.value);
  if (el.hasAttribute('data-live')) schedule();
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset) return;
  if (el.dataset.upload) { handleUpload(el); return; }
  if (el.dataset.caption) { const g = (info().gallery || []).map(x => x.id === el.dataset.caption ? { ...x, caption: el.value.trim().slice(0, 80) } : x); saveInfo({ gallery: g }).then(ok => ok && toast('Caption saved')); return; }
  if (el.dataset.change && CHG[el.dataset.change]) CHG[el.dataset.change](el, e);
});
document.addEventListener('submit', e => { const f = e.target; if (f.dataset && f.dataset.form && FORM[f.dataset.form]) { e.preventDefault(); FORM[f.dataset.form](f, e); } });
const tipEl = $('#tip');
document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) { tipEl.hidden = true; return; } tipEl.textContent = t.dataset.tip; tipEl.hidden = false; });
document.addEventListener('pointermove', e => { if (tipEl.hidden) return; const w = tipEl.offsetWidth, h = tipEl.offsetHeight; let x = e.clientX + 14, y = e.clientY - h - 12; if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y < 8) y = e.clientY + 18; tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'; });
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

// ================= DATA =================
function watchCol(key, q) {
  unsubs.push(q.onSnapshot(snap => { S[key] = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.loaded[key] = true; schedule(); },
    err => { console.error(key, err); S.loaded[key] = true; S.slow = true; schedule(); }));
}
function stopWatches() { while (unsubs.length) { try { unsubs.pop()(); } catch (_) {} } S.loaded = {}; }
function startWatches() {
  stopWatches();
  const since = addDays(today(), -400);
  const slow = setTimeout(() => { S.slow = true; schedule(); }, 10000);
  unsubs.push(db.doc('public/info').onSnapshot(s => { clearTimeout(slow); S.info = s.exists ? s.data() : null; S.infoMissing = !s.exists; schedule(); }, () => { S.slow = true; schedule(); }));
  watchCol('staff', db.collection('staff'));
  watchCol('appointments', db.collection('appointments').where('date', '>=', addDays(today(), -120)));
  watchCol('sales', db.collection('sales').where('date', '>=', since));
  watchCol('expenses', db.collection('expenses').where('date', '>=', since));
  watchCol('customers', db.collection('customers'));
  watchCol('inventory', db.collection('inventory'));
  watchCol('payouts', db.collection('payouts'));
  watchCol('attendance', db.collection('attendance'));
  watchCol('waitlist', db.collection('waitlist').where('date', '>=', addDays(today(), -7)));
}
setInterval(() => { if (S.canAdmin && $('#modal').hidden && !document.activeElement.matches('input,select,textarea')) schedule(); }, 60000);

render();
{
  onAuth(async user => {
    S.user = user; S.canAdmin = false;
    if (user) {
      try { const a = await db.doc(`admins/${user.uid}`).get(); S.canAdmin = a.exists; } catch (_) { S.canAdmin = false; }
      if (S.canAdmin) startWatches();
    } else stopWatches();
    S.ready = true; render();
  });
}
