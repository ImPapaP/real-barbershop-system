// Dashboard · Roles and access, owner PIN, activity log.
import { db, demo, login } from '../fb.js';
import { esc, fmtTime, pad, roleOf } from '../shared.js';
import { DESK_TABS, OWNER_TABS, S, STAFF_TABS, TABS, bossUnsubs, unsubs } from './state.js';
import { $, chip, field, icon, inR, info, money, newId, opt, pageHead, periodRange, rangeLabel, schedule, short, shortDate, today, ymd } from './core.js';
import { periodBar } from './money.js';
import { openModal } from './modals.js';
import { filterDD } from './tables.js';
import { watchCol } from './data.js';

// ================= ACCESS, OWNER PIN, ACTIVITY LOG =================
// Roles come from admins/{uid}.role (Staff → Edit → Sign-in). firestore.rules enforces the same limits.
export function myRole() { return roleOf(S.me); }
export function isBoss() { return (myRole() === 'owner' && !S.lockOn) || (S.elevUntil || 0) > Date.now(); }
export function allowedTabs() {
  if (myRole() === 'staff') return STAFF_TABS;
  return isBoss() ? TABS.map(t => t[0]).filter(t => !STAFF_TABS.includes(t)) : DESK_TABS;
}
export function navTabs() {
  if (myRole() === 'staff') return TABS.filter(t => STAFF_TABS.includes(t[0]));
  const boss = isBoss();
  return TABS.filter(t => !STAFF_TABS.includes(t[0])).map(([id, l]) => [id, l, !boss && OWNER_TABS.includes(id)]);
}
export const ROLE_LABEL = { owner: 'Owner', desk: 'Receptionist', staff: 'Staff' };
export const meName = () => (S.me && S.me.name) || (S.user && S.user.email) || '';
export function whoChip() { return `<div class="who-chip"><b>${esc(meName())}</b><small>${ROLE_LABEL[myRole()]}${S.lockOn ? ' · this device is locked' : ''}</small></div>`; }
export function elevBanner() {
  if (!((S.elevUntil || 0) > Date.now())) return '';
  return `<div class="banner elev"><span>${icon('lock')} <b>Owner PIN entered.</b> Owner pages and actions are open. Tap Lock when the owner is done.</span><button class="btn btn-sm" data-act="lockNow">Lock</button></div>`;
}
export function pinForm(why, inline) {
  return `<form class="stack pin-form" data-form="pin" data-why="${esc(why)}">
    ${field('Owner PIN', `<input id="${inline ? 'pg-pin' : 'm-pin'}" name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" class="pin-in" placeholder="••••" required>`, inline ? 'pg-pin' : 'm-pin')}
    ${demo ? '<p class="hint">Demo PIN: 1234</p>' : ''}<p class="err" id="${inline ? 'pg-err' : 'm-err'}" hidden></p>
    <button class="btn btn-primary" type="submit" ${S.pinBusy ? 'disabled' : ''}>${S.pinBusy ? 'Checking…' : 'Unlock'}</button></form>`;
}
export function vLocked(tab) {
  const label = (TABS.find(t => t[0] === tab) || [, 'This page'])[1];
  return `<div class="center locked-page"><div class="panel stack" style="width:min(100%,380px);text-align:left">
    <div class="lock-big">${icon('lock')}</div><h1 style="font:400 26px/1.1 var(--f-slab)">${esc(label)} is for the owner</h1>
    <p class="muted">Ask the owner to type their PIN. Owner pages and actions stay open on this ${myRole() === 'owner' ? 'locked device' : 'sign-in'} until someone taps Lock or signs out, and it’s noted in the activity log.</p>
    ${pinForm('open ' + label, true)}</div></div>`;
}
export function pinModal(why) {
  openModal('Owner PIN needed', `<div class="stack"><p>Only the owner can <b>${esc(why)}</b>. Ask the owner to type their PIN.</p>${pinForm(why)}</div>`);
  setTimeout(() => $('#m-pin')?.focus(), 60);
}
export function bossWatches() {
  if (bossUnsubs.length) return;
  if (myRole() !== 'owner' && !((S.elevUntil || 0) > Date.now())) { S.payouts = []; S.loaded.payouts = true; return; }
  const w = (key, q) => bossUnsubs.push(q.onSnapshot(snap => { S[key] = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.loaded[key] = true; schedule(); }, err => { console.error(key, err); S.loaded[key] = true; schedule(); }));
  w('payouts', db.collection('payouts'));
  w('activity', db.collection('activity').where('at', '>=', Date.now() - 90 * 864e5));
  w('payslips', db.collection('payslips'));
  w('advances', db.collection('advances'));
}
export function stopBossWatches() { while (bossUnsubs.length) { try { bossUnsubs.pop()(); } catch (_) {} } }
// Staff see only their own records (the queries match firestore.rules)
export function startOwnWatches() {
  const id = (S.me && S.me.staffId) || '__none';
  ['expenses', 'customers', 'inventory', 'waitlist', 'promos', 'closings'].forEach(k => { S[k] = []; S.loaded[k] = true; });
  unsubs.push(db.doc('public/info').onSnapshot(s => { S.info = s.exists ? s.data() : null; schedule(); }, () => {}));
  unsubs.push(db.doc('staff/' + id).onSnapshot(s => { S.staff = s.exists ? [{ id: s.id, ...s.data() }] : []; S.loaded.staff = true; schedule(); }, () => { S.loaded.staff = true; schedule(); }));
  watchCol('appointments', db.collection('appointments').where('barberId', '==', id));
  watchCol('sales', db.collection('sales').where('barberId', '==', id));
  watchCol('payouts', db.collection('payouts').where('barberId', '==', id));
  watchCol('attendance', db.collection('attendance').where('barberId', '==', id));
  watchCol('leaves', db.collection('leaves').where('staffId', '==', id));
  watchCol('timeclock', db.collection('timeclock').where('staffId', '==', id));
  watchCol('payslips', db.collection('payslips').where('staffId', '==', id));
  watchCol('advances', db.collection('advances').where('staffId', '==', id));
}
// Activity log: who did what and when (owner reads it in Activity log; nobody can edit or delete entries)
export function logAct(kind, text, extra = {}) {
  if (!S.user || !S.canAdmin) return;
  db.collection('activity').doc(newId()).set({ at: Date.now(), by: S.user.uid, who: meName(), role: myRole(), kind, text: String(text).slice(0, 300), ...extra }).catch(e => console.warn('activity', e));
}
export const ACT_KINDS = { sale: 'Sales', void: 'Voids & refunds', money: 'Expenses & payouts', staff: 'Staff & pay', clock: 'Time clock', visit: 'Visits', price: 'Prices & settings', close: 'Closing the day', pin: 'Owner PIN', login: 'Sign-ins', signin: 'Sign-ins', client: 'Clients' };
export function vActivity() {
  const r = periodRange(S.period), q = (S.actQ || '').trim().toLowerCase();
  const all = [...S.activity].filter(a => inR(ymd(new Date(a.at)), r)).sort((a, b) => b.at - a.at);
  const people = [...new Set(all.map(a => a.who))].sort();
  const list = all.filter(a => (!S.actWho || a.who === S.actWho) && (!S.actKind || ACT_KINDS[a.kind] === ACT_KINDS[S.actKind]) && (!q || (a.text + ' ' + a.who).toLowerCase().includes(q)));
  const days = [...new Set(list.map(a => ymd(new Date(a.at))))];
  const kinds = [...new Set(Object.values(ACT_KINDS))];
  return `${pageHead(rangeLabel(r), 'Activity log', '')}
  ${periodBar()}
  <section class="panel">
    <div class="filters"><input type="search" id="ac-q" data-bind="actQ" data-live value="${esc(S.actQ || '')}" placeholder="Search, e.g. void, 399, Marco" aria-label="Search the log">
      ${filterDD('act', (S.actWho ? 1 : 0) + (S.actKind ? 1 : 0), `<div class="fdd-grid"><select id="ac-who" data-bind="actWho" data-live aria-label="Person">${opt('', `Everyone (${people.length})`, !S.actWho)}${people.map(p => opt(p, p, p === S.actWho)).join('')}</select>
      <select id="ac-kind" data-bind="actKind" data-live aria-label="Type">${opt('', 'Everything', !S.actKind)}${kinds.map(k => opt(Object.keys(ACT_KINDS).find(x => ACT_KINDS[x] === k), k, S.actKind && ACT_KINDS[S.actKind] === k)).join('')}</select></div>`)}</div>
    ${list.length ? `<ul class="list act-list pg">${list.map((a, k) => { const t = new Date(a.at), d = ymd(t), first = k === 0 || ymd(new Date(list[k - 1].at)) !== d;
      return `<li class="act-${esc(a.kind)}"><span class="act-time tnum"><b class="act-day">${d === today() ? 'Today' : shortDate(d)}</b>${fmtTime(`${pad(t.getHours())}:${pad(t.getMinutes())}`)}</span><div class="grow"><b>${esc(a.who || 'Someone')}</b> <span class="muted small">${esc(ROLE_LABEL[a.role] || (a.role === 'system' ? 'System' : ''))}</span><div class="sub">${esc(a.text)}</div></div>${['void', 'pin'].includes(a.kind) || /wrong pin|deleted|voided|short/i.test(a.text) ? chip({ kind: 'warn', icon: '!', label: ACT_KINDS[a.kind] || 'Check' }) : ''}</li>`; }).join('')}</ul>`
      : `<p class="empty">${all.length ? 'Nothing matches these filters.' : 'Nothing recorded in this period yet. Sales, voids, refunds, payouts, price and pay changes, time in/out and the owner PIN all show here.'}</p>`}
    <p class="muted small" style="margin-top:12px">Kept for 90 days on this screen. Entries can’t be edited or deleted, not even by the owner.</p></section>`;
}
