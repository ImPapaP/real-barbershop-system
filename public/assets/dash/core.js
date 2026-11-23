// Dashboard · Helpers, saving to the database, routing and drawing, metrics, staff pay and pay plans, clients, appointment rows.
import { DAYS, DEFAULT_POLICY, LOGO_LG, MONTHS, ROLES, STARTER, bdayDays, bdaySelects, brand, canServe, cleanBday, esc, fmtTime, hasDeposit, initials, isServiceStaff, lateLimit, morph, pad, phoneKey, startMs, sum, themeBtn, toMin, withOption } from '../shared.js';
import { db, demoBar, login, logout } from '../fb.js';
import { APPT, COLS, METHOD_NAMES, OWNER_TABS, S, STATUS_CHOICES, TABS, TAB_VIEWS } from './state.js';
import { CP, cpClose, siteUrl } from './setup.js';
import { allowedTabs, elevBanner, isBoss, myRole, navTabs, vLocked, whoChip } from './access.js';
import { finesIn } from './staffapp.js';
import { applyPaging } from './tables.js';
import { riskChip } from './reports.js';
import { alertBtn } from './alerts.js';
import { noteWrite } from './offline.js';

// ---------- helpers ----------
export const $ = (s, r = document) => r.querySelector(s);
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const newId = () => db.collection('x').doc().id;
export const round2 = n => Math.round(n * 100) / 100;
export const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
export const normPhone = p => String(p || '').replace(/\D/g, '').replace(/^63/, '0');
export function fmtDate(s, withYear) { if (!s) return ''; const d = parseYmd(s); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`; }
export function shortDate(s) { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export const info = () => S.info || STARTER;
export const pol = () => ({ ...DEFAULT_POLICY, ...(info().policy || {}) });
export const cur = () => info().shop.currency || '₱';
export function money(n, dp) { const v = Number(n) || 0; return (v < 0 ? '−' : '') + cur() + Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: dp ? 2 : 0, maximumFractionDigits: dp ? 2 : 0 }); }
export function short(n) { const v = Math.abs(n); if (v >= 1e6) return cur() + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (v >= 1e3) return cur() + (n / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k'; return cur() + Math.round(n); }
export const chip = meta => `<span class="chip chip-${meta.kind}"><b aria-hidden="true">${meta.icon}</b>${esc(meta.label)}</span>`;
export const field = (label, input, id) => `<div class="field">${id ? `<label for="${id}">${esc(label)}</label>` : `<label>${esc(label)}</label>`}${input}</div>`;
export const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
export const services = () => info().services || [];
export const activeServices = () => services().filter(s => s.active !== false);
export const svcById = id => services().find(s => s.id === id);
export const svcNames = (ids, opts) => (ids || []).map(id => { const v = svcById(id); return v ? withOption(v, opts).name : 'Removed service'; }).join(', ');
export const svcMins = ids => Math.max(pol().step, sum((ids || []).map(svcById).filter(Boolean), s => s.mins ?? pol().step));
export const staffAll = () => S.staff;
export const activeStaff = () => staffAll().filter(b => b.active !== false).sort((a, b) => (a.chair || 99) - (b.chair || 99) || a.name.localeCompare(b.name));
export const serviceStaff = () => activeStaff().filter(isServiceStaff); // takes bookings and sales
export const roleName = b => ROLES[b.role || 'barber'] || 'Staff';
export const staffById = id => staffAll().find(b => b.id === id);
export const staffName = id => id ? (staffById(id)?.name || 'Former barber') : 'Any barber';
export const av = b => b && b.photo ? `<img class="avatar" src="${esc(siteUrl(b.photo))}" alt="">` : `<span class="avatar" aria-hidden="true">${esc(initials(b ? b.name : '?'))}</span>`;
export const custById = id => S.customers.find(c => c.id === id);
export const methodName = k => METHOD_NAMES[k] || k || 'Online';
// How a sale was paid at the shop. A split bill (part cash, part GCash...) keeps its parts in sale.split: [{ m, amt }]
// and counts in each method, so the cash drawer and Close the day only count the cash part.
export const atShopOf = s => (s.total || 0) - (s.depositCredit || 0);
export const paidParts = s => s.split && s.split.length ? s.split.map(x => [x.m, Number(x.amt) || 0]) : [[s.method || 'Cash', atShopOf(s)]];
export const paidIn = (s, m) => paidParts(s).reduce((t, x) => t + (x[0] === m ? x[1] : 0), 0);
export const usedMethod = (s, m) => paidParts(s).some(x => x[0] === m);
export const payLabel = s => s.split && s.split.length ? s.split.map(x => `${x.m} ${money(x.amt)}`).join(' + ') : (s.method || 'Cash');
export const depositPaid = a => a && a.deposit && a.deposit.status === 'paid' ? (a.deposit.amount || 0) : 0;
// GCash screenshot payments waiting for the owner to check
export const toReview = () => S.appointments.filter(a => a.status === 'pending_payment' && a.payMethod === 'gcash' && a.proof && a.proof.status === 'review' && !a.groupOf).sort((a, b) => a.proof.at - b.proof.at);
export const groupOf = a => [a, ...S.appointments.filter(x => x.groupOf === a.id)];
export function proofImg(id) {
  if (S.proofImgs[id] === undefined) { S.proofImgs[id] = ''; db.doc(`proofs/${id}`).get().then(d => { S.proofImgs[id] = d.exists ? d.data().img || 'none' : 'none'; schedule(); }).catch(() => { S.proofImgs[id] = 'none'; schedule(); }); }
  return S.proofImgs[id];
}
export function proofsPanel(compact) {
  const list = toReview(); if (!list.length) return '';
  return `<section class="panel proofs"><div class="panel-h"><h2>GCash screenshots to check</h2><span class="muted small">Match each one with your GCash history, then approve it to confirm the booking</span></div>
    <div class="proof-list">${list.map(a => { const img = proofImg(a.id), ppl = groupOf(a).length, amt = (a.deposit && a.deposit.amount || pol().deposit) * ppl;
      return `<article class="proof">
        <button type="button" class="proof-img" data-act="viewProof" data-id="${esc(a.id)}" aria-label="View screenshot from ${esc(a.name)}">${img && img !== 'none' ? `<img src="${esc(img)}" alt="">` : img === 'none' ? '<span class="muted small">No image</span>' : '<span class="spinner"></span>'}</button>
        <div class="grow"><b>${esc(a.name)}</b> <span class="muted small">${esc(a.phone || '')}</span>
          <div class="sub">${fmtDate(a.date)} · ${fmtTime(a.time)} · ${esc(svcNames(a.serviceIds, a.options))} · ${esc(staffName(a.barberId))}${ppl > 1 ? ` · +${ppl - 1} more person` : ''}</div>
          <div class="proof-meta"><span>Expect <b>${money(amt)}</b></span>${a.proof.ref ? `<span>Ref. <b>${esc(a.proof.ref)}</b></span>` : ''}<span class="muted">Sent ${ago(a.proof.at)}</span></div>
          <div class="acts"><button class="btn btn-sm btn-primary" data-act="approveProof" data-id="${esc(a.id)}">Approve</button><button class="btn btn-sm btn-danger" data-act="rejectProof" data-id="${esc(a.id)}">Reject</button>${compact ? '' : `<button class="btn btn-sm btn-ghost" data-act="viewProof" data-id="${esc(a.id)}">View</button>`}</div></div>
      </article>`; }).join('')}</div></section>`;
}
export const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`; };
// 5-minute rule: a booked client who hasn't arrived this many minutes after their time can lose the slot to a walk-in
// Late after the grace period for this booking: 5 min for junior barbers (no down payment), 20 min for seniors
export const minsLate = a => Math.round((Date.now() - startMs(a.date, a.time)) / 60000);
export const isLateNow = a => a.status === 'booked' && a.source !== 'walk-in' && a.date === today() && a.time && Date.now() >= startMs(a.date, a.time) + lateLimit(a, pol()) * 60e3;
export const owesLateFee = a => isLateNow(a) && hasDeposit(a);
export const waitingWalkins = () => S.appointments.filter(x => x.source === 'walk-in' && x.status === 'waiting' && x.date === today()).sort((x, y) => (x.queueNo || 0) - (y.queueNo || 0));
export const lateChip = a => isLateNow(a) ? ' ' + chip({ kind: 'bad', icon: '⏱', label: `${minsLate(a)} min late${hasDeposit(a) ? ' · full price owed' : ''}` }) : a.late && a.date === today() && ['booked', 'waiting'].includes(a.status) ? ' ' + chip({ kind: 'warn', icon: '⏱', label: `${a.late.mins} min late` }) : '';
export function depositChip(a) {
  const d = a.deposit || {};
  if (a.status === 'pending_payment' && a.payMethod === 'gcash') return a.proof && a.proof.status === 'review' ? chip({ kind: 'warn', icon: '!', label: 'GCash screenshot to check' }) : chip({ kind: 'mute', icon: '◷', label: 'Waiting for GCash' });
  if (d.status === 'paid') return chip({ kind: 'good', icon: '✓', label: `${money(d.amount)} ${methodName(d.method)}` });
  if (d.status === 'kept') return chip({ kind: 'mute', icon: '•', label: `${money(d.amount)} kept` });
  if (d.status === 'refunded') return chip({ kind: 'mute', icon: '↩', label: 'Refunded' });
  if (d.status === 'refund_due') return `${chip({ kind: 'warn', icon: '↩', label: `Send back ${money(d.amount)}` })} <button type="button" class="link-btn small" data-act="markRefunded" data-id="${esc(a.id)}">Mark refunded</button>`;
  if (d.status === 'none' && a.source === 'online') return chip({ kind: 'mute', icon: '–', label: 'No down payment' });
  return '';
}

export const ICONS = {
  back: '<path d="M12.5 4.5 7 10l5.5 5.5"/>',
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
  out: '<path d="M8 4H4v12h4M12 6l4 4-4 4M16 10H8"/>',
  filter: '<path d="M3 5h14M6 10h8M8.5 15h3"/>',
  payroll: '<path d="M5 2.5h10v15l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3z"/><path d="M7.5 7h5M7.5 10h5M7.5 13h3"/>',
  reports: '<path d="M3 17h14M5.5 14V9M10 14V4.5M14.5 14v-7"/>',
  lock: '<rect x="4" y="9" width="12" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  activity: '<path d="M3 10h3l2-5 4 10 2-5h3"/>',
  me: '<circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3 2"/>',
  mypay: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><circle cx="10" cy="10" r="2.2"/><path d="M5.5 8v4M14.5 8v4"/>'
};
export const icon = n => `<svg class="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
export const mark = () => `<span class="wordmark" style="font-size:20px">${brand(info().shop.wordmark || info().shop.name, 'sm')}</span>`

// ---------- feedback & writes ----------
export let toastT;
export function toast(msg, kind) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (kind === 'bad' ? ' bad' : ''); t.hidden = false; void t.offsetWidth; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
export function errText(e) {
  const c = String(e && e.code || '');
  if (c.includes('permission-denied')) return 'You don’t have permission to change shop records.';
  if (c.includes('resource-exhausted')) return 'Too many changes at once. Wait a moment and try again.';
  return 'That didn’t save. Check your connection and try again.';
}
export async function put(col, id, data) { noteWrite(); try { await db.collection(col).doc(id).set(data); return true; } catch (e) { console.error(e); toast(errText(e), 'bad'); return false; } }
export async function patch(col, id, data) { noteWrite(); try { await db.collection(col).doc(id).update(data); return true; } catch (e) { console.error(e); toast(errText(e), 'bad'); return false; } }
export async function del(col, id) { noteWrite(); try { await db.collection(col).doc(id).delete(); return true; } catch (e) { console.error(e); toast(errText(e), 'bad'); return false; } }
export function armed(el) { if (el.dataset.armed) return true; const t = el.textContent; el.dataset.armed = '1'; el.textContent = 'Tap again to confirm'; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = t; } }, 3500); return false; }

// ---------- routing & render ----------
export function route() {
  const h = location.hash.replace('#', ''), ok = allowedTabs();
  if (ok.includes(h)) return h;
  if (myRole() !== 'staff' && OWNER_TABS.includes(h)) return h; // shows the owner-PIN lock screen
  return ok[0];
}
export let raf = 0;
export function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
export function render() {
  const a = document.activeElement, id = a && a.id; let s = null, e = null;
  try { s = a.selectionStart; e = a.selectionEnd; } catch (_) {}
  const tab = route(), all = COLS.every(c => S.loaded[c]);
  S.enter = S.canAdmin && (tab !== S.lastTab || (all && !S.wasLoaded)); S.lastTab = tab; if (all) S.wasLoaded = true;
  if (S.enter || !$('#app').firstElementChild) $('#app').innerHTML = view(); else morph($('#app'), view());
  applyPaging();
  if (id && !$('#modal').contains(a)) { const n = document.getElementById(id); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (s != null) n.setSelectionRange(s, e); } catch (_) {} } }
  if (CP.input && !document.body.contains(CP.input)) cpClose();
}
export function view() { return demoBar() + inner(); }
export function inner() {
  if (!S.ready) return `<div class="center"><div><span class="spinner"></span><p class="muted">Opening the dashboard…</p></div></div>`;
  if (!S.user) { location.replace('login.html' + (location.hash && location.hash !== '#' ? '?next=' + encodeURIComponent(location.hash) : '')); return '<div class="center"><span class="spinner"></span></div>'; } // signed out: the staff sign-in page
  if (!S.canAdmin) return gate('No dashboard access', `You’re signed in as ${S.user.email}, but this account has no dashboard access yet. Ask the owner to give you a sign-in in Staff → Edit → Sign-in.`, true);
  const tab = route();
  const attention = S.appointments.filter(a => a.status === 'needs_attention' || (a.conflict && ['booked', 'pending_payment'].includes(a.status))).length;
  const low = S.inventory.filter(i => i.stock <= i.reorder).length;
  const badges = { schedule: attention, stock: low };
  return `<div class="admin">
    <aside class="side">
      <a href="#${allowedTabs()[0]}" style="text-decoration:none;color:inherit" aria-label="Dashboard home">${mark()}</a>
      <nav class="side-nav" aria-label="Dashboard">${navTabs().map(([id, l, locked]) => `<a href="#${id}" ${id === tab ? 'aria-current="page"' : ''}${locked ? ' class="locked"' : ''}>${icon(id)}<span class="lbl">${l}</span>${locked ? `<span class="lock-ic" aria-label="Needs the owner PIN">${icon('lock')}</span>` : badges[id] ? `<span class="badge" aria-label="${badges[id]} need attention">${badges[id]}</span>` : ''}</a>`).join('')}</nav>
      <div class="side-foot">${whoChip()}${themeBtn('btn btn-sm btn-ghost', true)}${alertBtn()}<a class="btn btn-sm btn-ghost" href="../" target="_blank" rel="noopener">${icon('site')}<span class="lbl">Website</span></a><button class="btn btn-sm btn-ghost" data-act="logout">${icon('out')}<span class="lbl">Sign out</span></button></div>
    </aside>
    <main class="main"><div class="main-in${S.enter ? ' enter' : ''}">${loadingNote()}${S.infoMissing && isBoss() ? setupBanner() : ''}${elevBanner()}${OWNER_TABS.includes(tab) && !isBoss() ? vLocked(tab) : TAB_VIEWS[tab]()}</div></main>
  </div>`;
}
export function gate(title, msg, signOut) { return `<div class="center"><div><img class="logo-hero" src="${LOGO_LG}" alt="" width="180" height="180"><h1 style="font:400 30px/1.1 var(--f-slab)">${esc(title)}</h1><p class="muted">${esc(msg)}</p>${signOut ? '<button class="btn" data-act="logout">Sign out</button>' : ''}</div></div>`; }
export function loadingNote() {
  if (!COLS.some(c => !S.loaded[c])) return '';
  return `<div class="banner" role="status"><span>${S.slow ? 'Shop records can’t be reached right now. What you see may be incomplete.' : 'Loading shop records…'}</span></div>`;
}
export function setupBanner() { return `<div class="banner"><span><b>Set up your shop.</b> Load the REAL Barbers starter menu and team, then edit them in Shop setup. The website takes bookings once this is saved.</span><button class="btn btn-sm btn-primary" data-act="initInfo">Load starter menu</button></div>`; }
// Pages: a Back button returns to the page you came from (or Overview)
export const NAV = [];
export function trackNav() { const t = route(); if (NAV.length > 1 && NAV[NAV.length - 2] === t) NAV.pop(); else if (NAV[NAV.length - 1] !== t) NAV.push(t); }
export const backTo = () => { const t = NAV.length > 1 ? NAV[NAV.length - 2] : allowedTabs()[0]; return (TABS.find(x => x[0] === t) || [, 'Overview'])[1]; };
export function pageHead(eyebrow, title, actions) { const showBack = route() !== allowedTabs()[0] || NAV.length > 1; return `<header class="page-head"><div>${showBack ? `<button type="button" class="back-btn page-back" data-act="pageBack">${icon('back')}<span>Back to ${esc(backTo())}</span></button>` : ''}<p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1></div><div class="actions">${actions || ''}</div></header>`; }

// ---------- metrics ----------
export function periodRange(p) {
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
export const inR = (d, r) => d >= r[0] && d <= r[1];
export const netOf = s => (s.total || 0) - (s.tip || 0);

// ---------- staff pay ----------
// Each person's pay plan (see "pay plans" below) decides the base: barbers get ₱700 / ₱500 or their 50% / 40%
// commission, whichever is higher. Commission is their rate of every service they did, after discounts.
// A day counts as worked when they rang up a sale that day, or when it's one of their scheduled days and
// they weren't marked absent (Schedule → Who's in). Days are only counted from the first day the shop
// used this system (its first sale) or the barber's start date, whichever is later, and never in the future.
export let payCache = { ref: null };
export function payIndex() {
  if (payCache.ref === S.sales && payCache.att === S.attendance && payCache.lv === S.leaves && payCache.tc === S.timeclock) return payCache;
  const saleDays = new Set(S.sales.map(x => `${x.date}_${x.barberId}`));
  const commDay = new Map(); S.sales.forEach(x => { const k = `${x.date}_${x.barberId}`; commDay.set(k, (commDay.get(k) || 0) + (Number(x.commission) || 0)); });
  const first = S.sales.reduce((m, x) => (!m || x.date < m ? x.date : m), '') || today();
  const marks = new Map(S.attendance.map(a => [a.id, a.present]));
  const clock = new Map(S.timeclock.map(t => [`${t.date}_${t.staffId}`, t]));
  return (payCache = { ref: S.sales, att: S.attendance, lv: S.leaves, tc: S.timeclock, saleDays, first, marks, commDay, clock });
}
export const payStart = b => { const f = payIndex().first; return b.since && b.since > f ? b.since : f; };
export const scheduledIn = (b, d) => (b.days || []).includes(parseYmd(d).getDay()) && b.active !== false && d >= payStart(b);
// Leave (Staff → Leave): a paid leave day counts as a day in (daily pay / daily minimum, no commission); an unpaid one doesn't
export const leaveOn = (b, d) => (S.leaves || []).find(l => l.staffId === b.id && l.from <= d && d <= (l.to || l.from));
export function workedOn(b, d) {
  const P = payIndex();
  if (d > today() || d < payStart(b)) return false;
  if (P.saleDays.has(`${d}_${b.id}`) || P.clock.has(`${d}_${b.id}`)) return true; // rang up a sale, or timed in
  const lv = leaveOn(b, d); if (lv) return !!lv.paid;
  const m = P.marks.get(`${d}_${b.id}`);
  return m === undefined ? scheduledIn(b, d) : m;
}
// ---------- pay plans ----------
// How each person is paid (Staff → Edit → How they're paid):
//  daily   – daily pay for each day worked + commission on their services      (barbers; Airyl ₱700 + 70% of braids)
//  quota   – a daily minimum OR their commission, whichever is higher; on a slow day the shop tops up to the minimum
//            (Luz and Liza: ₱500 or 40%. ₱2,000 of services → ₱800. ₱320 → ₱128 commission + ₱372 from the shop = ₱500)
//  monthly – a fixed monthly salary, spread over the days of the month         (Alex: ₱20,000 a month)
// On top of any plan: half of a forfeited down payment goes to the barber of that booking (late cancel / over 20 min late).
export const payType = b => ['quota', 'monthly'].includes(b.payType) ? b.payType : 'daily';
export const monthDays = d => new Date(+d.slice(0, 4), +d.slice(5, 7), 0).getDate();
export const commOn = (b, d) => payIndex().commDay.get(`${d}_${b.id}`) || 0;
// What the shop pays on day d besides commission
export function basePayFor(b, d) {
  const t = payType(b), amt = Number(b.dailyPay) || 0;
  if (t === 'monthly') { const lv = leaveOn(b, d); return d <= today() && d >= payStart(b) && b.active !== false && !(lv && !lv.paid) ? round2((Number(b.monthlyPay) || 0) / monthDays(d)) : 0; }
  if (!workedOn(b, d)) return 0;
  return t === 'quota' ? round2(Math.max(0, amt - commOn(b, d))) : amt;
}
export const DEPOSIT_SHARE = 0.5; // barber's half of a forfeited down payment
export const keptFor = (b, r) => S.appointments.filter(a => a.barberId === b.id && inR(a.date, r) && a.deposit && a.deposit.status === 'kept');
// Plain-words pay rule, used on the Staff page, the edit form and exports
export function payRule(b) {
  const t = payType(b), rate = Number(b.rate) || 0, amt = Number(b.dailyPay) || 0, of = isServiceStaff(b) ? ' of their services' : '';
  if (t === 'monthly') return `${money(Number(b.monthlyPay) || 0)} a month${rate ? ` + ${rate}%${of}` : ''}`;
  if (t === 'quota') return `${money(amt)} a day minimum, or ${rate}%${of} if that’s more`;
  return `${money(amt)} a day${rate ? ` + ${rate}%${of}` : ''}`;
}
export function payExample(b) {
  const t = payType(b), rate = Number(b.rate) || 0, amt = Number(b.dailyPay) || 0, c = v => Math.floor(v * rate / 100);
  if (t === 'monthly') return `About ${money(round2((Number(b.monthlyPay) || 0) / 30))} a day, paid whether or not there are clients.`;
  if (t === 'quota') { const hi = amt && rate ? Math.ceil(amt * 100 / rate / 1000) * 1000 : 2000, lo = Math.round(hi * 0.16 / 10) * 10 || 320; // ₱500 / 40% → the owner's own examples: ₱2,000 and ₱320
    return rate ? `Services of ${money(hi)} → ${money(c(hi))} (${rate}%). Services of ${money(lo)} → ${money(c(lo))} commission + ${money(Math.max(0, amt - c(lo)))} from the shop = ${money(Math.max(amt, c(lo)))}.` : `Always ${money(amt)} a day worked.`; }
  return rate ? `A day with ${money(1000)} of services → ${money(amt)} + ${money(c(1000))} = ${money(amt + c(1000))}.` : `${money(amt)} for every day worked.`;
}
export function daysIn(r) { const out = [], end = r[1] < today() ? r[1] : today(); for (let d = r[0]; d <= end; d = addDays(d, 1)) out.push(d); return out; }
export function payFor(b, r) {
  const x = S.sales.filter(v => v.barberId === b.id && inR(v.date, r));
  const t = payType(b), worked = daysIn(r).filter(d => t === 'monthly' ? basePayFor(b, d) > 0 : workedOn(b, d)), days = worked.length;
  const comm = round2(sum(x, v => v.commission)), tips = sum(x, v => v.tip), base = round2(sum(worked, d => basePayFor(b, d)));
  const daily = t === 'monthly' ? (days ? round2(base / days) : 0) : Number(b.dailyPay) || 0;
  const topUps = t === 'quota' ? worked.filter(d => basePayFor(b, d) > 0).length : 0;
  const dep = round2(sum(keptFor(b, r), a => (a.deposit.amount || 0) * DEPOSIT_SHARE));
  const lateRecs = S.timeclock.filter(t => t.staffId === b.id && inR(t.date, r) && !t.waived && (t.fine || 0) > 0), fines = round2(sum(lateRecs, t => t.fine)); // late deductions
  const svcOf = v => Math.max(0, (v.svcTotal || 0) - (v.discount || 0)), svc = sum(x, svcOf);
  // Does he earn his keep? The shop's share of his services (100% − his rate) has to cover his daily pay.
  const keepRate = Math.max(0, 1 - (Number(b.rate) || 0) / 100), share = round2(svc - comm);
  const need = keepRate ? daily / keepRate : 0; // services needed per day to cover the daily pay
  const covered = worked.filter(d => sum(x.filter(v => v.date === d), svcOf) * keepRate >= daily - 0.005).length;
  return { x, t, days, daily, base, comm, dep, topUps, tips, svc, share, need, covered, net: round2(share - base), fills: round2(Math.max(0, base - share)),
    perDay: days ? svc / days : 0, fines, lates: lateRecs.length, pay: round2(base + comm + dep - fines), total: round2(base + comm + dep + tips - fines) };
}
export const basePayOn = d => sum(staffAll(), b => basePayFor(b, d));
export function summary(r) {
  const sales = S.sales.filter(s => inR(s.date, r)), exps = S.expenses.filter(e => inR(e.date, r));
  const kept = S.appointments.filter(a => inR(a.date, r) && a.deposit && a.deposit.status === 'kept');
  const keptAmt = sum(kept, a => a.deposit.amount);
  const net = sum(sales, netOf), comm = sum(sales, s => s.commission), exp = sum(exps, e => e.amount);
  const depShare = round2(sum(kept.filter(a => a.barberId), a => (a.deposit.amount || 0) * DEPOSIT_SHARE));
  const base = sum(daysIn(r), basePayOn), staffPay = round2(comm + base + depShare - finesIn(r));
  return {
    sales, exps, kept, keptAmt, net, comm, base, staffPay, exp, tips: sum(sales, s => s.tip), disc: sum(sales, s => s.discount),
    svc: sum(sales, s => s.svcTotal), prod: sum(sales, s => s.prodTotal), deposits: sum(sales, s => s.depositCredit),
    depShare, income: net + keptAmt, profit: round2(net + keptAmt - comm - base - depShare - exp), count: sales.length, avg: sales.length ? net / sales.length : 0
  };
}
export function rangeLabel(r) { return r[0] === r[1] ? fmtDate(r[0], true) : `${fmtDate(r[0])} – ${fmtDate(r[1], true)}`; }
export function buckets(r) {
  const days = Math.round((parseYmd(r[1]) - parseYmd(r[0])) / 864e5) + 1;
  if (days <= 62) { const out = []; for (let i = 0; i < days; i++) { const d = addDays(r[0], i); out.push({ key: d, label: shortDate(d), tip: fmtDate(d), match: x => x === d }); } return out; }
  const out = []; let y = +r[0].slice(0, 4), m = +r[0].slice(5, 7);
  while (`${y}-${pad(m)}` <= r[1].slice(0, 7)) { const k = `${y}-${pad(m)}`; out.push({ key: k, label: MONTHS[m - 1], tip: `${MONTHS[m - 1]} ${y}`, match: x => x.slice(0, 7) === k }); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
export function niceScale(v) { if (!(v > 0)) v = 100; const raw = v / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; const n = Math.max(1, Math.ceil(v / step - 1e-9)); return { max: step * n, ticks: Array.from({ length: n + 1 }, (_, i) => i * step) }; }
export function barChart(bk, series) {
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
export function hbars(rows, cls) {
  if (!rows.length) return '<p class="empty">Nothing recorded in this period.</p>';
  const max = Math.max(...rows.map(r => r.value), 1);
  return `<div class="hbars">${rows.map(r => `<div class="hb" data-tip="${esc(r.label + '\n' + (r.tip || money(r.value)))}"><span class="lb">${esc(r.label)}</span><span class="track"><span class="fill ${cls || ''}" style="display:block;width:${(r.value / max * 100).toFixed(1)}%"></span></span><span class="vl">${r.text || money(r.value)}</span></div>`).join('')}</div>`;
}
export function delta(curv, prev, label) {
  if (!prev) return `<span class="d">${esc(label)}: ${money(prev)}</span>`;
  const p = (curv - prev) / prev * 100, up = p >= 0;
  return `<span class="d"><span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%</span> vs ${esc(label)}</span>`;
}
export const kpi = (k, v, d) => `<div class="kpi"><span class="k">${esc(k)}</span><span class="v">${v}</span>${d || ''}</div>`;

// ---------- customers ----------
export function custStats() {
  const m = {};
  for (const s of S.sales) { if (!s.customerId) continue; const x = m[s.customerId] || (m[s.customerId] = { visits: 0, spent: 0, last: '', barbers: {} }); x.visits++; x.spent += netOf(s); if (s.date > x.last) x.last = s.date; if (s.barberId) x.barbers[s.barberId] = (x.barbers[s.barberId] || 0) + 1; }
  return m;
}
export function usualBarber(st) { if (!st) return ''; const e = Object.entries(st.barbers).sort((a, b) => b[1] - a[1])[0]; return e ? staffName(e[0]) : ''; }
export const loyaltyN = () => Math.max(0, parseInt(info().shop.loyaltyEvery, 10) || 0);
export function matchCustomer(name, phone) {
  const p = normPhone(phone);
  if (p.length >= 7) { const c = S.customers.find(c => normPhone(c.phone) === p); if (c) return c; }
  const n = String(name || '').trim().toLowerCase(); if (!n || n === 'walk-in') return null;
  return S.customers.find(c => c.name.trim().toLowerCase() === n) || null;
}
export async function ensureCustomer(name, phone, email, save, birthday) {
  const found = matchCustomer(name, phone), bd = cleanBday(birthday);
  if (found) { if (bd && found.birthday !== bd) await patch('customers', found.id, { birthday: bd }); return found.id; }
  if (!save || !String(name || '').trim() || name.trim().toLowerCase() === 'walk-in') return '';
  const id = newId();
  return await put('customers', id, { name: name.trim(), phone: String(phone || '').trim(), phoneKey: phoneKey(phone), email: email || '', notes: '', ...(bd ? { birthday: bd } : {}), createdAt: Date.now() }) ? id : '';
}
export const bdayPromoText = () => { const sv = svcById(pol().birthdaySvc || 'h8'); return sv ? `Birthday promo: ${sv.name} for ${money(pol().birthdayPrice || 0)} (usually ${money(sv.price)}).` : 'Birthday promo.'; };
// Birthdays: the client's (or the one given on the booking) and how close it is
export const custOf = a => (a.customerId && S.customers.find(c => c.id === a.customerId)) || matchCustomer(a.name, a.phone);
export const bdayFor = a => cleanBday(a.birthday) || cleanBday((custOf(a) || {}).birthday);
export const bdayWhen = n => n === 0 ? 'today' : n > 0 ? `in ${n} day${n === 1 ? '' : 's'}` : `${-n} day${n === -1 ? '' : 's'} ago`;
export const refChip = a => a.refPhoto ? ` <button type="button" class="chip chip-info chip-btn" data-act="viewRef" data-id="${esc(a.id)}" title="See the cut they want"><b aria-hidden="true">▣</b>Photo</button>` : '';
export const bdayChip = a => { const n = bdayDays(bdayFor(a), a.date || today()); return n === 0 ? ' ' + chip({ kind: 'info', icon: '★', label: 'Birthday today' }) : ''; };
export const bdayField = v => `<div class="field"><label for="m-bday-m">Birthday <span class="opt">(optional · for the free birthday haircut)</span></label>${bdaySelects(v || '', 'm-bday', part => `name="b${part}"`)}</div>`;
export const bdayFrom = fd => cleanBday(`${fd.get('bm') || ''}-${fd.get('bd') || ''}`);

// ---------- appointments ----------
export const apptsOn = d => S.appointments.filter(a => a.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
export const visible = a => S.showExpired || a.status !== 'expired';
// "Any barber" bookings from the website: the system only holds a chair; the shop picks who does the cut
export const ACTIVE_ST = ['booked', 'pending_payment', 'waiting', 'inchair'];
export const needsBarber = a => !!a.anyBarber && ACTIVE_ST.includes(a.status);
export function freeBarbersFor(a) {
  const svcs = (a.serviceIds || []).map(svcById).filter(Boolean), start = toMin(a.time || '00:00'), end = start + (a.mins || svcMins(a.serviceIds || []) || 30);
  const dow = new Date(a.date + 'T00:00:00').getDay();
  return serviceStaff().filter(b => (b.days || [0, 1, 2, 3, 4, 5, 6]).includes(dow) && (!svcs.length || canServe(b, svcs)) && !S.appointments.some(o => o.id !== a.id && o.date === a.date && o.barberId === b.id && ACTIVE_ST.includes(o.status) && o.source !== 'walk-in'
    && toMin(o.time) < end && toMin(o.time) + (o.mins || 30) > start));
}
export const assignSelect = a => { const free = freeBarbersFor(a); return `<select class="assign-sel" data-change="assignBarber" data-id="${esc(a.id)}" aria-label="Assign a barber for ${esc(a.name || '')}"><option value="">Assign barber…</option>${free.map(b => opt(b.id, b.name + (b.id === a.barberId ? ' (chair held)' : ''), false)).join('')}${free.length ? '' : '<option value="" disabled>No one free at this time</option>'}</select>`; };
export function apptRow(a, compact) {
  const canCheckout = ['booked', 'waiting', 'inchair'].includes(a.status);
  const giveAway = (isLateNow(a) && waitingWalkins().length ? `<button class="btn btn-sm btn-danger" data-act="giveSlot" data-id="${esc(a.id)}">Give slot to walk-in</button>` : '')
    + (owesLateFee(a) ? `<button class="btn btn-sm btn-primary" data-act="servedLate" data-id="${esc(a.id)}" title="They came more than ${lateLimit(a, pol())} min late and got their service: full price, down payment kept">Served late</button><button class="btn btn-sm" data-act="lateFee" data-id="${esc(a.id)}" title="They didn’t come or weren’t served: charge the service as a late fee">No-show: late fee</button>` : '');
  const actions = `${giveAway}${canCheckout ? `<button class="btn btn-sm btn-primary" data-act="checkoutAppt" data-id="${esc(a.id)}">Checkout</button>` : ''}${a.status === 'done' && a.saleId ? `<button class="btn btn-sm" data-act="showSale" data-id="${esc(a.saleId)}">Receipt</button>` : ''}`;
  const flag = a.conflict && ['booked', 'pending_payment'].includes(a.status) ? ' ' + chip({ kind: 'bad', icon: '!', label: 'Overlaps another booking' }) : '';
  if (compact) return `<li>${a.barberId ? av(staffById(a.barberId)) : ''}<span class="t">${a.source === 'walk-in' ? `#${esc(a.queueNo || '')}` : fmtTime(a.time)}</span><div class="grow"><b>${esc(a.name || 'Walk-in')}</b>${lateChip(a)}${bdayChip(a)}${refChip(a)}${riskChip(a)}<div class="sub">${esc(svcNames(a.serviceIds, a.options))} · ${needsBarber(a) ? '<b class="needs-b">Any barber, assign one</b>' : esc(staffName(a.barberId))}</div></div>${chip(APPT[a.status] || APPT.booked)}</li>`;
  const choices = STATUS_CHOICES.includes(a.status) ? STATUS_CHOICES : [a.status, ...STATUS_CHOICES];
  return `<tr>
    <td class="num nowrap"><b>${a.source === 'walk-in' ? `Walk-in #${esc(a.queueNo || '')}` : fmtTime(a.time)}</b>${a.source === 'walk-in' ? `<div class="muted small">arrived ${fmtTime(a.time)}</div>` : ''}</td>
    <td><b>${esc(a.name || 'Walk-in')}</b>${a.code ? ` <span class="muted small">${esc(a.code)}</span>` : ''}${lateChip(a)}${bdayChip(a)}${refChip(a)}${riskChip(a)}${a.promo ? ' ' + chip({ kind: 'info', icon: '%', label: `${a.promo.code} −${money(a.promo.off)}` }) : ''}${a.phone ? `<div class="muted small">${esc(a.phone)}</div>` : ''}</td>
    <td>${esc(svcNames(a.serviceIds, a.options))}${a.notes ? `<div class="muted small">${esc(a.notes)}</div>` : ''}${flag}</td>
    <td>${needsBarber(a) ? `<div class="assign"><span class="chip chip-warn"><b aria-hidden="true">?</b>Any barber</span>${assignSelect(a)}</div>` : esc(staffName(a.barberId))}</td>
    <td><span class="muted small">${a.source === 'online' ? 'Online' : a.source === 'walk-in' ? 'Walk-in' : 'Phone / in person'}</span><div>${depositChip(a)}</div></td>
    <td><select data-change="apptStatus" data-id="${esc(a.id)}" aria-label="Status for ${esc(a.name || 'walk-in')}">${choices.map(k => opt(k, (APPT[k] || APPT.booked).label, k === a.status)).join('')}</select></td>
    <td><div class="acts">${actions}<button class="btn btn-sm btn-ghost" data-act="editAppt" data-id="${esc(a.id)}">Edit</button></div></td>
  </tr>`;
}


// runs once, from admin.js, in the same order as before the split
export function init() {
  trackNav();
}
