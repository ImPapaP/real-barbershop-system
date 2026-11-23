// Dashboard · Time clock, My day / My pay, closing the day, owner PIN and sign-in settings.
import { ACCESS, CLOCK_START, esc, fmtTime, lateFine, lateRateOf, pad, shiftStartOf, startMs, sum } from '../shared.js';
import { call, db, demo, login } from '../fb.js';
import { qrSvg } from '../qr.js';
import { ACT, APPT, CHG, FORM, METHODS, S, TAB_VIEWS } from './state.js';
import { $, activeStaff, addDays, apptsOn, armed, av, chip, del, field, fmtDate, icon, info, inR, kpi, leaveOn, mark, money, num, opt, pageHead, paidIn, payExample, payFor, payIndex, payRule, periodRange, pol, put, rangeLabel, refChip, render, round2, schedule, services, short, shortDate, staffAll, staffById, staffName, summary, svcNames, toast, today } from './core.js';
import { owedFor, periodBar } from './money.js';
import { MODAL, closeModal, mFoot, modalErr, newToken, openModal, staffModal } from './modals.js';
import { saveInfo } from './forms.js';
import { bossWatches, logAct, meName, myRole, stopBossWatches, vActivity } from './access.js';
import { filterDD } from './tables.js';
import { cutoffLabel, cutoffOf, cutoffShift, payslip } from './payroll.js';

// ================= TIME CLOCK =================
// Staff time in and out on their own phone by scanning the shop's QR (clock.html, Cloud Function clockPunch).
// 9:01 is late; each started 15 minutes late costs their late rate (seniors ₱50, juniors ₱15), taken off their pay.
export const clockOf = (b, d) => payIndex().clock.get(`${d}_${b.id}`);
export const finesIn = (r, id) => round2(sum(S.timeclock.filter(t => inR(t.date, r) && (!id || t.staffId === id) && !t.waived), t => Number(t.fine) || 0));
export const hoursOf = t => t.in && t.out ? Math.max(0, (t.out - t.in) / 3600e3) : 0;
export const hrs = h => h ? `${Math.floor(h)}h ${pad(Math.round((h % 1) * 60))}m` : '—';
export function clockLine(t) {
  if (!t) return '';
  return `In ${fmtTime(t.inHM)}${t.outHM ? ` · out ${fmtTime(t.outHM)}` : ''}${t.lateMin ? ` · ${t.lateMin} min late${t.waived ? ' (excused)' : t.fine ? ` −${money(t.fine)}` : ''}` : ''}`;
}
export function timePanel(list, r) {
  const ids = new Set(list.map(b => b.id)), recs = S.timeclock.filter(t => inR(t.date, r) && ids.has(t.staffId) && (!S.timeWho || t.staffId === S.timeWho) && (!S.timeLate || t.lateMin > 0)).sort((a, b) => b.date.localeCompare(a.date) || (a.inHM || '').localeCompare(b.inHM || ''));
  const late = recs.filter(t => t.lateMin > 0), fines = round2(sum(late.filter(t => !t.waived), t => t.fine || 0));
  const open = recs.filter(t => !t.out && t.date < today());
  return `<section class="panel"><div class="panel-h"><h2>Time in and out</h2><div class="row">${filterDD('time', (S.timeWho ? 1 : 0) + (S.timeLate ? 1 : 0), `<div class="fdd-grid">${field('Person', `<select id="tm-who" data-bind="timeWho" data-live>${opt('', 'Everyone', !S.timeWho)}${list.map(b => opt(b.id, b.name, b.id === S.timeWho)).join('')}</select>`, 'tm-who')}</div><label class="row small"><input type="checkbox" id="tm-late" data-bind="timeLate" data-live ${S.timeLate ? 'checked' : ''}> Late only</label>`)}<button class="btn btn-sm" data-act="clockQr">Time clock QR</button><button class="btn btn-sm btn-primary" data-act="newTime">+ Add time</button></div></div>
    <div class="kpis kpis-sm"><div class="kpi"><small>Times in</small><b>${recs.length}</b></div><div class="kpi"><small>Late</small><b>${late.length}</b></div><div class="kpi"><small>Late deductions</small><b>${money(fines)}</b></div><div class="kpi"><small>Forgot to time out</small><b class="${open.length ? 'down' : ''}">${open.length}</b></div></div>
    ${recs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Name</th><th>In</th><th>Out</th><th class="r">Hours</th><th>Late</th><th class="r">Deduction</th><th></th></tr></thead><tbody>${recs.map(t => { const b = staffById(t.staffId);
      return `<tr><td class="nowrap">${fmtDate(t.date)}</td><td><b>${esc(b ? b.name : 'Former staff')}</b></td><td class="nowrap tnum">${fmtTime(t.inHM)}${t.away ? ` ${chip({ kind: 'warn', icon: '!', label: `${t.inDist} m away` })}` : ''}</td><td class="nowrap tnum">${t.outHM ? fmtTime(t.outHM) : t.date < today() ? chip({ kind: 'warn', icon: '?', label: 'No time out' }) : '<span class="muted">—</span>'}</td>
        <td class="r">${hrs(hoursOf(t))}</td><td>${t.lateMin ? chip({ kind: t.waived ? 'mute' : 'bad', icon: '◷', label: `${t.lateMin} min` }) : '<span class="muted small">On time</span>'}</td><td class="r">${t.fine ? (t.waived ? `<s class="muted">${money(t.fine)}</s> <span class="muted small">excused</span>` : `<b>−${money(t.fine)}</b>`) : ''}</td>
        <td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="editTime" data-id="${esc(t.id)}">Edit</button></div></td></tr>`; }).join('')}</tbody></table></div>`
      : '<p class="empty">No times yet. Print the time clock QR and put it by the door. Staff scan it on their phone when they come in and when they leave.</p>'}
    <p class="muted small" style="margin-top:10px">Starts at ${fmtTime(pol().clockStart || CLOCK_START)}: one minute after is late. Each started 15 minutes late is taken off their pay (seniors ${money(50)}, juniors ${money(15)}; change it per person in Edit → Late deduction). Timing in also counts as a day in for daily pay. Excuse a late day with Edit.</p></section>`;
}
export function timeModal(t) {
  const c = t || { date: today(), inHM: pol().clockStart || CLOCK_START, outHM: '' };
  openModal(t ? 'Edit time record' : 'Add a time record', `<form class="stack" data-form="time" data-id="${esc(c.id || '')}">
    ${t ? `<p><b>${esc(staffName(c.staffId))}</b> · ${fmtDate(c.date, true)}</p>` : `<div class="fgrid">${field('Staff member', `<select id="m-tstaff" name="staffId" required>${activeStaff().map(b => opt(b.id, b.name, b.id === c.staffId)).join('')}</select>`, 'm-tstaff')}${field('Date', `<input id="m-tdate" name="date" type="date" value="${esc(c.date)}" max="${today()}" required>`, 'm-tdate')}</div>`}
    <div class="fgrid">${field('Time in', `<input id="m-tin" name="inHM" type="time" value="${esc(c.inHM || '')}" required>`, 'm-tin')}${field('Time out', `<input id="m-tout" name="outHM" type="time" value="${esc(c.outHM || '')}">`, 'm-tout')}</div>
    <label class="row small"><input type="checkbox" name="waived" ${c.waived ? 'checked' : ''}> Excuse being late (no deduction)</label>
    ${field('Reason (shows in the activity log)', `<input id="m-tnote" name="note" value="${esc(c.note || '')}" maxlength="120" placeholder="e.g. Forgot to time out, traffic from an accident">`, 'm-tnote')}
    <p class="muted small">The deduction is worked out again from the time in and their late rate.</p>
    <p class="err" id="m-err" hidden></p>${mFoot(t ? 'Save' : 'Add', t ? `<button type="button" class="btn btn-danger" data-act="delTime" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
export const clockUrl = () => S.clockKey ? new URL(`../clock.html?k=${encodeURIComponent(S.clockKey)}`, location.href).href : '';
export async function loadClockKey() {
  if (S.clockKey !== undefined) return;
  S.clockKey = null;
  try { const d = await db.doc('private/clock').get(); if (d.exists && d.data().key) S.clockKey = d.data().key; else { S.clockKey = newToken(); await put('private', 'clock', { key: S.clockKey, at: Date.now() }); } } catch (_) { S.clockKey = ''; }
  schedule();
}
export function clockModal() {
  loadClockKey();
  const url = clockUrl();
  openModal('Time clock QR', `<div class="stack qr-modal">${url ? `<div class="qr-box">${qrSvg(url, { size: 240 })}</div>` : '<p class="muted"><span class="spinner"></span> Getting the code…</p>'}
    <p>Put this by the door. Staff scan it with their phone when they come in and when they leave, signed in with their own account. It stamps the time on the server, so the phone’s clock doesn’t matter.</p>
    <p class="muted small">Someone took a photo of it? Make a new code. The old one stops working.</p>
    <div class="modal-f"><button type="button" class="btn btn-ghost" data-act="newClockKey">Make a new code</button><button type="button" class="btn btn-primary" data-act="printClock" ${url ? '' : 'disabled'}>Print poster</button></div></div>`);
}
export function printClockPoster() {
  const sh = info().shop, url = clockUrl(), w = window.open('', '_blank'); if (!w || !url) { toast('Allow pop-ups to print the poster.', 'bad'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Time clock · ${esc(sh.name)}</title><style>
    @page{size:A4;margin:0}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;display:grid;place-items:center;min-height:100vh;text-align:center}
    .p{width:180mm;padding:16mm 0}.logo{width:38mm;height:38mm;object-fit:contain}h1{font-size:40pt;margin:6mm 0 2mm}p{font-size:16pt;margin:2mm 0;color:#333}
    .qr{margin:8mm auto;width:105mm;height:105mm}.qr svg{width:100%;height:100%}.s{font-size:13pt;color:#555;margin-top:6mm}</style></head><body><div class="p">
    <img class="logo" src="${new URL('../assets/logo.png', location.href).href}" alt=""><h1>Staff time clock</h1><p>Scan when you come in and when you leave.</p>
    <div class="qr">${qrSvg(url, { size: 400 })}</div><p><b>${esc(sh.name)}</b> · staff only</p><p class="s">Time in by ${fmtTime(pol().clockStart || CLOCK_START)}. Late is counted from one minute after.</p></div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}
export function clockSetupPanel() {
  const p = pol(), sh = info().shop;
  return `<section class="panel"><div class="panel-h"><h2>Time clock</h2><button class="btn btn-sm" data-act="clockQr">Show QR</button></div>
    <form class="stack" data-form="clockset">
      <div class="fgrid three">${field('Time in by', `<input id="ck-start" name="clockStart" type="time" value="${esc(p.clockStart || CLOCK_START)}">`, 'ck-start')}${field('Shop location (latitude)', `<input id="ck-lat" name="lat" inputmode="decimal" value="${esc(sh.lat ?? '')}" placeholder="optional">`, 'ck-lat')}${field('Longitude', `<input id="ck-lng" name="lng" inputmode="decimal" value="${esc(sh.lng ?? '')}" placeholder="optional">`, 'ck-lng')}</div>
      <p class="muted small">One minute after this time is late. With the shop’s location set, a time in from more than 300 m away is flagged. <button type="button" class="link-btn" data-act="useLocation">Use this phone’s location</button> (do it inside the shop).</p>
      <div class="modal-f"><button class="btn btn-primary" type="submit">Save</button></div></form></section>`;
}

// ================= STAFF: MY DAY, MY PAY =================
export function vMe() {
  const b = staffAll()[0], t = today();
  if (!b) return `${pageHead('', 'My day', '')}<p class="empty">This sign-in isn’t linked to a staff member yet. Ask the owner.</p>`;
  const tc = clockOf(b, t), mine = S.appointments.filter(a => a.barberId === b.id && !['cancelled', 'expired', 'pending_payment'].includes(a.status));
  const todays = mine.filter(a => a.date === t).sort((x, y) => (x.time || '').localeCompare(y.time || '')), next = mine.filter(a => a.date > t && a.date <= addDays(t, 7)).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  const lv = leaveOn(b, t), first = b.name.split(' ')[0];
  const row = a => `<li><span class="act-time tnum">${a.source === 'walk-in' ? '#' + esc(a.queueNo || '') : fmtTime(a.time)}</span><div class="grow"><b>${esc(a.name || 'Walk-in')}</b>${refChip(a)}<div class="sub">${esc(svcNames(a.serviceIds, a.options) || 'Not set')}${a.notes ? ' · ' + esc(a.notes) : ''}</div></div>${chip(APPT[a.status] || APPT.booked)}</li>`;
  return `${pageHead(fmtDate(t, true), `Hi, ${first}`, '')}
  <section class="panel me-clock"><div class="panel-h"><h2>Time clock</h2>${tc ? (tc.lateMin && !tc.waived ? chip({ kind: 'bad', icon: '◷', label: `${tc.lateMin} min late` }) : chip({ kind: 'good', icon: '✓', label: 'On time' })) : ''}</div>
    ${lv ? `<p>You’re on ${lv.paid ? 'paid' : 'unpaid'} leave today${lv.note ? ` (${esc(lv.note)})` : ''}.</p>` : tc ? `<p class="clock-big">${esc(clockLine(tc))}</p>${tc.outHM ? '' : '<p class="muted small">Scan the time clock QR again when you leave.</p>'}` : `<p class="clock-big muted">Not timed in yet</p><p class="muted small">Scan the time clock QR by the door with your phone camera. Time in by ${fmtTime(shiftStartOf(b, pol()))}; each started 15 minutes late is ${money(lateRateOf(b))} off your pay.</p>`}</section>
  <section class="panel"><div class="panel-h"><h2>Today</h2><span class="muted small">${todays.length} client${todays.length === 1 ? '' : 's'}</span></div>${todays.length ? `<ul class="list">${todays.map(row).join('')}</ul>` : '<p class="empty">No bookings with you today yet. Walk-ins show here when the front desk assigns them to you.</p>'}</section>
  <section class="panel"><div class="panel-h"><h2>Next 7 days</h2></div>${next.length ? next.reduce((h, a, i, arr) => h + (i === 0 || arr[i - 1].date !== a.date ? `${i ? '</ul>' : ''}<h3 class="dc-h">${fmtDate(a.date)}</h3><ul class="list">` : '') + row(a) + (i === arr.length - 1 ? '</ul>' : ''), '') : '<p class="empty">Nothing booked with you yet.</p>'}</section>`;
}
export function vMyPay() {
  const b = staffAll()[0]; if (!b) return vMe();
  const r = periodRange(S.period), P = payFor(b, r), owed = owedFor(b.id);
  const recs = S.timeclock.filter(t => inR(t.date, r)).sort((x, y) => y.date.localeCompare(x.date));
  const sales = P.x.slice().sort((x, y) => (y.date + (y.time || '')).localeCompare(x.date + (x.time || '')));
  const pays = S.payouts.slice().sort((x, y) => y.date.localeCompare(x.date));
  return `${pageHead(rangeLabel(r), 'My pay', '')}
  ${periodBar()}
  <div class="kpis kpis-sm"><div class="kpi"><small>Days in</small><b>${P.days}</b></div><div class="kpi"><small>${P.t === 'monthly' ? 'Salary' : P.t === 'quota' ? 'Daily minimum top-ups' : 'Daily pay'}</small><b>${money(P.base)}</b></div><div class="kpi"><small>Commission</small><b>${money(P.comm)}</b></div><div class="kpi"><small>Tips</small><b>${money(P.tips)}</b></div>${P.fines ? `<div class="kpi"><small>Late deductions</small><b class="down">−${money(P.fines)}</b></div>` : ''}<div class="kpi"><small>Earned</small><b>${money(P.total)}</b></div><div class="kpi"><small>Owed to you now</small><b>${money(owed)}</b></div></div>
  ${(() => { const mine = S.payslips.slice().sort((a, b) => b.cutoff.localeCompare(a.cutoff)), cur0 = cutoffOf(today()), prev = cutoffShift(cur0, -1), advLeft = round2(sum(S.advances, a => a.amount) - sum(S.payslips, p => sum(p.adv || [], x => x.amount)));
    return `<section class="panel"><div class="panel-h"><h2>Payslips</h2>${advLeft > 0 ? `<span class="muted small">Cash advance still to pay back: <b>${money(advLeft)}</b></span>` : ''}</div><ul class="list pg">
      ${mine.some(x => x.cutoff === prev) ? '' : `<li><span class="grow"><b>${esc(cutoffLabel(prev))}</b><span class="sub" style="display:block">Not paid yet · preview</span></span><b>${money(payslip(b, prev).net)}</b><button class="btn btn-sm" data-act="viewSlip" data-id="${esc(b.id)}" data-c="${prev}">View</button></li>`}
      ${mine.map(x => `<li><span class="grow"><b>${esc(cutoffLabel(x.cutoff))}</b><span class="sub" style="display:block">Paid ${fmtDate(x.paidOn)}</span></span><b>${money(x.net)}</b><button class="btn btn-sm" data-act="viewSlip" data-id="${esc(b.id)}" data-c="${x.cutoff}">View</button></li>`).join('')}</ul></section>`; })()}
  <section class="panel"><div class="panel-h"><h2>How you’re paid</h2></div><p>${esc(payRule(b))}.</p><p class="muted small">${esc(payExample(b))}${lateRateOf(b) ? ` Late (after ${fmtTime(shiftStartOf(b, pol()))}): ${money(lateRateOf(b))} for each started 15 minutes.` : ''}</p></section>
  <section class="panel"><div class="panel-h"><h2>Your clients</h2><span class="muted small">${sales.length} · ${money(P.svc)} in services</span></div>
    ${sales.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Client</th><th>Services</th><th class="r">Commission</th><th class="r">Tip</th></tr></thead><tbody>${sales.map(x => `<tr><td class="nowrap">${shortDate(x.date)} <span class="muted small">${x.time ? fmtTime(x.time) : ''}</span></td><td>${esc(x.name || 'Walk-in')}</td><td class="muted small">${esc((x.lines || []).filter(l => l.kind === 'service').map(l => l.name).join(', '))}</td><td class="r">${money(x.commission || 0)}</td><td class="r">${x.tip ? money(x.tip) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No clients in this period.</p>'}</section>
  <div class="grid2e">
  <section class="panel"><div class="panel-h"><h2>Time in and out</h2></div>${recs.length ? `<ul class="list pg">${recs.map(t => `<li><span class="grow"><b>${fmtDate(t.date)}</b><span class="sub" style="display:block">${esc(clockLine(t))}</span></span></li>`).join('')}</ul>` : '<p class="empty">No times in this period.</p>'}</section>
  <section class="panel"><div class="panel-h"><h2>Paid to you</h2></div>${pays.length ? `<ul class="list pg">${pays.map(p => `<li><span class="grow"><b>${fmtDate(p.date)}</b>${p.note ? `<span class="sub" style="display:block">${esc(p.note)}</span>` : ''}</span><b>${money(p.amount, 1)}</b></li>`).join('')}</ul>` : '<p class="empty">No payouts yet.</p>'}</section></div>`;
}

// ================= CLOSING THE DAY =================
// One tap at closing: money by payment type, the cash drawer, each barber's clients, sales, tips and no-shows,
// who was late. "Text to owner" sends it to the owner's mobile (Shop setup → Shop details) through Semaphore.
export function dayData(d) {
  const sales = S.sales.filter(s => s.date === d), appts = apptsOn(d), exps = S.expenses.filter(e => e.date === d);
  const atShop = s => (s.total || 0) - (s.depositCredit || 0);
  const methods = METHODS.map(m => [m, round2(sum(sales, s => paidIn(s, m)))]).filter(x => x[1]);
  const online = round2(sum(sales, s => s.depositCredit || 0));
  const cashIn = round2(sum(sales, s => paidIn(s, 'Cash'))), cashOut = round2(sum(exps.filter(e => e.method === 'Cash'), e => e.amount || 0));
  const c = S.closings.find(x => x.id === d) || {}, expected = round2((c.float || 0) + cashIn - cashOut), diff = c.counted == null ? null : round2(c.counted - expected);
  const barbers = activeStaff().map(b => { const x = sales.filter(s => s.barberId === b.id), tc = clockOf(b, d);
    return { b, clients: x.length, sales: round2(sum(x, s => (s.svcTotal || 0) + (s.prodTotal || 0) - (s.discount || 0))), tips: round2(sum(x, s => s.tip || 0)), noshow: appts.filter(a => a.barberId === b.id && a.status === 'noshow').length, tc }; })
    .filter(r => r.clients || r.noshow || r.tc);
  const total = round2(sum(sales, s => (s.total || 0) - (s.tip || 0))), tips = round2(sum(sales, s => s.tip || 0));
  const visits = { served: sales.length, walk: appts.filter(a => a.source === 'walk-in' && a.status === 'done').length, noshow: appts.filter(a => a.status === 'noshow').length, cancelled: appts.filter(a => a.status === 'cancelled').length, unpaid: appts.filter(a => a.status === 'done' && !a.saleId).length };
  const late = barbers.filter(r => r.tc && r.tc.lateMin), noOut = barbers.filter(r => r.tc && !r.tc.outHM);
  return { d, sales, methods, online, cashIn, cashOut, c, expected, diff, barbers, total, tips, visits, late, noOut, expTotal: round2(sum(exps, e => e.amount || 0)) };
}
// Plain text for the owner's SMS (P instead of ₱ keeps it a normal-length text)
export function daySummaryText(D) {
  const P = n => 'P' + Math.round(n).toLocaleString('en-PH'), sh = info().shop;
  const lines = [`${sh.name} · ${fmtDate(D.d)}`, `Sales ${P(D.total)}${D.methods.length ? ' (' + D.methods.map(([m, v]) => `${m} ${P(v)}`).join(', ') + ')' : ''}${D.online ? ` + ${P(D.online)} paid online earlier` : ''}`,
    `Clients ${D.visits.served} · No-shows ${D.visits.noshow} · Cancelled ${D.visits.cancelled}${D.visits.unpaid ? ` · ${D.visits.unpaid} done but not paid` : ''}`,
    D.diff == null ? `Drawer should have ${P(D.expected)} (not counted yet)` : `Drawer ${P(D.expected)} expected, ${P(D.c.counted)} counted${D.diff ? ` (${D.diff > 0 ? 'extra' : 'short'} ${P(Math.abs(D.diff))})` : ' (matches)'}`,
    `Tips ${P(D.tips)}${D.expTotal ? ` · Expenses ${P(D.expTotal)}` : ''}`,
    D.barbers.filter(r => r.clients).length ? 'Per barber: ' + D.barbers.filter(r => r.clients).map(r => `${r.b.name} ${r.clients}/${P(r.sales)}${r.noshow ? ` ${r.noshow}NS` : ''}`).join(', ') : '',
    D.late.length ? 'Late: ' + D.late.map(r => `${r.b.name} ${r.tc.lateMin}m${r.tc.fine && !r.tc.waived ? ` (-${P(r.tc.fine)})` : ''}`).join(', ') : 'Late: nobody',
    D.noOut.length && D.d < today() ? 'No time out: ' + D.noOut.map(r => r.b.name).join(', ') : ''];
  return lines.filter(Boolean).join('\n');
}
export function closeDayModal(d = today()) {
  const D = dayData(d), row = (l, v, cls = '') => `<div class="${cls}"><span>${l}</span><b>${v}</b></div>`, sh = info().shop;
  openModal(`Close the day · ${d === today() ? 'today' : fmtDate(d)}`, `<div class="stack close-day">
    <div class="kpis kpis-sm"><div class="kpi"><small>Sales</small><b>${money(D.total)}</b></div><div class="kpi"><small>Clients</small><b>${D.visits.served}</b></div><div class="kpi"><small>Tips</small><b>${money(D.tips)}</b></div><div class="kpi"><small>No-shows</small><b class="${D.visits.noshow ? 'down' : ''}">${D.visits.noshow}</b></div></div>
    ${D.visits.unpaid ? `<p class="hint bad-hint"><b>${D.visits.unpaid} visit${D.visits.unpaid > 1 ? 's are' : ' is'} marked done without a payment.</b> Ring ${D.visits.unpaid > 1 ? 'them' : 'it'} up in Schedule before closing.</p>` : ''}
    <div class="grid2e">
      <div class="dc-box"><h3>Money in</h3><div class="totals">${D.methods.length ? D.methods.map(([m, v]) => row(m, money(v))).join('') : row('No sales', '—')}${row('Total at the shop', money(sum(D.methods, x => x[1])), 'tot')}${D.online ? row('Paid online earlier (down payments)', money(D.online)) : ''}</div></div>
      <form class="dc-box" data-form="closing" data-date="${d}" data-close="1"><h3>Cash drawer</h3>
        <div class="fgrid">${field('Starting cash', `<input id="cd-float" name="float" inputmode="decimal" value="${esc(D.c.float ?? '')}" placeholder="0">`, 'cd-float')}${field('Cash counted now', `<input id="cd-count" name="counted" inputmode="decimal" value="${esc(D.c.counted ?? '')}" placeholder="Count the drawer">`, 'cd-count')}</div>
        <input type="hidden" name="note" value="${esc(D.c.note || '')}">
        <div class="totals">${row('+ Cash sales', money(D.cashIn))}${row('− Cash expenses', money(D.cashOut))}${row('Should be in the drawer', money(D.expected), 'tot')}${D.diff == null ? '' : row(D.diff === 0 ? 'Matches' : D.diff > 0 ? 'Extra cash' : 'Short', D.diff === 0 ? '✓' : money(Math.abs(D.diff)), D.diff === 0 ? 'ok' : 'bad')}</div>
        <button class="btn btn-sm btn-primary" type="submit">${D.c.at ? 'Update the count' : 'Save the count'}</button></form>
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Staff</th><th>Time</th><th class="r">Clients</th><th class="r">Sales</th><th class="r">Tips</th><th class="r">No-shows</th></tr></thead><tbody>
      ${D.barbers.length ? D.barbers.map(r => `<tr><td><b>${esc(r.b.name)}</b></td><td class="small">${r.tc ? esc(clockLine(r.tc)) : '<span class="muted">No time in</span>'}</td><td class="r">${r.clients}</td><td class="r">${money(r.sales)}</td><td class="r">${r.tips ? money(r.tips) : ''}</td><td class="r">${r.noshow || ''}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">Nobody yet.</td></tr>'}</tbody></table></div>
    <details class="sms-prev"><summary>Text for the owner</summary><pre>${esc(daySummaryText(D))}</pre></details>
    <p class="muted small">${sh.ownerPhone ? `Sends to ${esc(sh.ownerPhone)}.` : 'Add the owner’s mobile number in Shop setup → Shop details to text this.'}</p>
    <div class="modal-f"><button type="button" class="btn btn-ghost" data-act="copyDay" data-d="${d}">Copy</button><button type="button" class="btn btn-primary" data-act="textDay" data-d="${d}" ${sh.ownerPhone ? '' : 'disabled'}>Text to owner</button></div></div>`, true);
}

// ================= OWNER PIN & SIGN-INS (Shop setup, Staff → Edit) =================
export function pinPanel() {
  if (S.pinSet === undefined) { S.pinSet = null; db.doc('private/pin').get().then(d => { S.pinSet = d.exists; schedule(); }).catch(() => { S.pinSet = false; }); }
  return `<section class="panel"><div class="panel-h"><h2>Owner PIN</h2>${S.pinSet ? chip({ kind: 'good', icon: '✓', label: 'Set' }) : S.pinSet === false ? chip({ kind: 'warn', icon: '!', label: 'Not set' }) : ''}</div>
    <p class="muted small" style="max-width:72ch">The receptionist needs the owner PIN to void a sale, mark a refund, delete a client or a visit, or open owner pages. It opens them until someone taps Lock or signs out and goes in the activity log. 5 wrong tries lock it for 15 minutes.</p>
    <form class="stack" data-form="setpin"><div class="fgrid three">${field(S.pinSet ? 'New 4-digit PIN' : '4-digit PIN', `<input id="pn-a" name="a" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="new-password" required>`, 'pn-a')}${field('Type it again', `<input id="pn-b" name="b" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="new-password" required>`, 'pn-b')}<div class="field" style="align-self:end"><button class="btn btn-primary" type="submit">${S.pinSet ? 'Change PIN' : 'Set PIN'}</button></div></div><p class="err" id="pn-err" hidden></p></form>
    ${myRole() === 'owner' ? `<label class="consent"><input type="checkbox" id="pn-lock" data-change="lockDevice" ${S.lockOn ? 'checked' : ''}><span><b>Lock owner pages on this device.</b> For a shared phone or tablet signed in as the owner: income, staff pay, settings and voids ask for the PIN. Only this device is locked.</span></label>` : ''}</section>`;
}
// Owner two-step sign-in: always on for the owner's account. Here the owner can sign out every remembered device.
export function twoStepPanel() {
  if (myRole() !== 'owner') return '';
  return `<section class="panel"><div class="panel-h"><h2>Two-step sign-in</h2>${chip({ kind: 'good', icon: '✓', label: 'On for the owner' })}</div>
    <p class="muted small" style="max-width:72ch">On a new phone or computer, the owner’s account asks for a 6-digit code sent by email${info().shop && info().shop.ownerPhone ? ' or by text to the owner’s mobile' : ' (add the owner’s mobile in Shop details to also get it by text)'}. A device marked “remember” skips the code for 30 days. If a phone is lost or the password leaks, change the password and sign out every remembered device.</p>
    <div class="row"><button type="button" class="btn btn-sm" data-act="twoFaForget">Sign out every remembered device</button></div></section>`;
}
Object.assign(ACT, {
  async twoFaForget(el) { if (!armed(el)) return; try { await call('twoFaForget', {}); try { Object.keys(localStorage).filter(k => k.startsWith('rb-2fa-')).forEach(k => localStorage.removeItem(k)); } catch (_) {} toast('Every remembered device will need a code next time'); } catch (e) { toast(e.message || 'Couldn’t do that. Try again.', 'bad'); } },
});
export function signinsPanel() {
  const withLogin = staffAll().filter(b => b.login);
  return `<section class="panel"><div class="panel-h"><h2>Who can use this dashboard</h2><a class="btn btn-sm btn-ghost" href="#team">Staff</a></div>
    <p class="muted small" style="max-width:72ch">Give each person their own sign-in in <b>Staff → Edit → Sign-in</b>. <b>Receptionist</b>: bookings, walk-ins, checkout, clients and the cash count, but no income pages, pay or settings. <b>Own schedule and pay</b>: barbers see their own clients, time in/out and pay, nothing else.</p>
    ${withLogin.length ? `<ul class="list">${withLogin.map(b => `<li>${av(b)}<div class="grow"><b>${esc(b.name)}</b><div class="sub">${esc(b.login.email)} · ${esc(ACCESS[b.login.role] || '')}</div></div><button class="btn btn-sm btn-ghost" data-act="editStaff" data-id="${esc(b.id)}">Edit</button></li>`).join('')}</ul>` : '<p class="empty">No staff sign-ins yet. Only the owner can sign in.</p>'}</section>`;
}
export function loginFields(b) {
  if (!b) return '<p class="muted small">Save first, then give them a sign-in here.</p>';
  const L = b.login;
  return `<fieldset class="field login-set"><legend>Sign-in</legend>
    ${L ? `<p class="small">Signs in as <b>${esc(L.email)}</b> · ${esc(ACCESS[L.role] || '')}</p>` : '<p class="muted small">No sign-in yet. Give them one so they can time in and see their own day and pay.</p>'}
    <div class="fgrid three">${field('Email', `<input id="m-lgemail" type="email" value="${esc(L ? L.email : '')}" autocomplete="off">`, 'm-lgemail')}${field(L ? 'New password (optional)' : 'Password (8+ characters)', `<input id="m-lgpass" type="text" autocomplete="new-password" placeholder="${L ? 'Leave empty to keep' : ''}">`, 'm-lgpass')}${field('Access', `<select id="m-lgrole">${Object.entries(ACCESS).map(([k, l]) => opt(k, l, (L ? L.role : (b.role === 'reception' ? 'desk' : 'staff')) === k)).join('')}</select>`, 'm-lgrole')}</div>
    <div class="row"><button type="button" class="btn btn-sm btn-primary" data-act="saveLogin" data-id="${esc(b.id)}">${L ? 'Update sign-in' : 'Create sign-in'}</button>${L ? `<button type="button" class="btn btn-sm btn-ghost" data-act="removeLogin" data-id="${esc(b.id)}">Remove sign-in</button>` : ''}<span class="muted small" id="m-lgmsg"></span></div></fieldset>`;
}

// ================= ACTIONS & FORMS for the above =================
Object.assign(ACT, {
  allMine() { S.allMine = true; render(); },
  lockNow() { S.elevUntil = 0; if (myRole() !== 'owner') stopBossWatches(); call('pinLock').catch(() => {}); toast('Owner pages locked'); render(); },
  clockQr() { clockModal(); },
  printClock() { printClockPoster(); },
  async newClockKey(el) { if (!armed(el)) return; S.clockKey = newToken(); if (await put('private', 'clock', { key: S.clockKey, at: Date.now() })) { logAct('clock', 'Made a new time clock QR code (the old one stopped working)'); toast('New code made. Print the new poster.'); clockModal(); } },
  newTime() { timeModal(null); },
  editTime(el) { const t = S.timeclock.find(x => x.id === el.dataset.id); if (t) timeModal(t); },
  async delTime(el) { if (!armed(el)) return; const t = S.timeclock.find(x => x.id === el.dataset.id); if (t && await del('timeclock', t.id)) { logAct('clock', `Deleted ${staffName(t.staffId)}'s time record for ${fmtDate(t.date)}`); closeModal(); toast('Time record deleted'); } },
  useLocation() {
    if (!navigator.geolocation) { toast('This phone can’t share its location.', 'bad'); return; }
    navigator.geolocation.getCurrentPosition(p => { const a = $('#ck-lat'), b = $('#ck-lng'); if (a && b) { a.value = p.coords.latitude.toFixed(6); b.value = p.coords.longitude.toFixed(6); toast('Location filled in. Tap Save.'); } }, () => toast('Couldn’t get the location. Allow location for this site.', 'bad'), { enableHighAccuracy: true, timeout: 10000 });
  },
  closeDay(el) { closeDayModal(el.dataset.d || today()); },
  async copyDay(el) { const t = daySummaryText(dayData(el.dataset.d)); try { await navigator.clipboard.writeText(t); toast('Summary copied'); } catch (_) { toast('Couldn’t copy. Select the text instead.', 'bad'); } },
  async textDay(el) {
    el.disabled = true;
    try { const r = await call('sendDaySummary', { text: daySummaryText(dayData(el.dataset.d)), date: el.dataset.d }); toast(demo ? `Demo: not actually sent (would text ${r.to})` : `Texted to ${r.to}`); }
    catch (e) { toast(e.message || 'Couldn’t send the text.', 'bad'); }
    el.disabled = false;
  },
  async saveLogin(el) {
    const b = staffById(el.dataset.id), msg = $('#m-lgmsg'); if (!b) return;
    const data = { staffId: b.id, email: $('#m-lgemail').value.trim(), password: $('#m-lgpass').value, role: $('#m-lgrole').value };
    el.disabled = true; if (msg) msg.textContent = 'Saving…';
    try { await call('staffLogin', data); if (msg) msg.textContent = ''; toast(`Sign-in saved for ${b.name}`); setTimeout(() => { const nb = staffById(b.id); if (nb && MODAL.cur) staffModal(nb); }, 300); }
    catch (e) { if (msg) msg.textContent = e.message || 'Couldn’t save the sign-in.'; }
    el.disabled = false;
  },
  async removeLogin(el) { if (!armed(el)) return; const b = staffById(el.dataset.id); try { await call('staffLogin', { staffId: b.id, remove: true }); toast(`${b.name} can’t sign in any more`); setTimeout(() => { const nb = staffById(b.id); if (nb && MODAL.cur) staffModal(nb); }, 300); } catch (e) { toast(e.message || 'Couldn’t remove it.', 'bad'); } }
});
Object.assign(CHG, {
  lockDevice(el) { S.lockOn = el.checked; try { localStorage.setItem('rb-lock', el.checked ? '1' : '0'); } catch (_) {} if (el.checked) S.elevUntil = 0; logAct('pin', el.checked ? 'Locked owner pages on a device' : 'Unlocked owner pages on a device'); toast(el.checked ? 'Owner pages locked on this device' : 'This device is no longer locked'); render(); }
});
Object.assign(FORM, {
  async pin(f) {
    const pin = String(new FormData(f).get('pin') || '').trim(), err = f.querySelector('.err');
    if (!/^\d{4}$/.test(pin)) { if (err) { err.textContent = 'The PIN is 4 digits.'; err.hidden = false; } return; }
    S.pinBusy = true; render();
    try { const r = await call('pinUnlock', { pin, why: f.dataset.why || '' }); S.elevUntil = r.until; if (!$('#modal').hidden && $('#modal').contains(f)) closeModal(); bossWatches(); toast('Unlocked. Tap Lock when the owner is done.'); }
    catch (e) { const er = document.querySelector('form[data-form="pin"] .err'); if (er) { er.textContent = e.message || 'Wrong PIN.'; er.hidden = false; } const i = document.querySelector('form[data-form="pin"] input[name=pin]'); if (i) { i.value = ''; i.focus(); } }
    S.pinBusy = false; render();
  },
  async setpin(f) {
    const fd = new FormData(f), a = String(fd.get('a') || ''), b = String(fd.get('b') || ''), err = $('#pn-err');
    const show = m => { err.textContent = m; err.hidden = false; };
    if (!/^\d{4}$/.test(a)) return show('The PIN is 4 digits.'); if (a !== b) return show('The two PINs don’t match.');
    if (['0000', '1111', '1234', '4321', '2580'].includes(a) && !demo) return show('Pick a PIN that’s harder to guess.');
    try { await call('setPin', { pin: a }); S.pinSet = true; f.reset(); err.hidden = true; toast('Owner PIN saved'); render(); } catch (e) { show(e.message || 'Couldn’t save the PIN.'); }
  },
  async time(f) {
    const fd = new FormData(f), t = f.dataset.id ? S.timeclock.find(x => x.id === f.dataset.id) : null;
    const staffId = t ? t.staffId : String(fd.get('staffId') || ''), date = t ? t.date : String(fd.get('date') || ''), b = staffById(staffId);
    const inHM = String(fd.get('inHM') || ''), outHM = String(fd.get('outHM') || ''), waived = fd.has('waived'), note = String(fd.get('note') || '').trim();
    if (!b || !date || !inHM) return modalErr(f, 'Pick the person, the date and the time in.');
    if (outHM && outHM <= inHM) return modalErr(f, 'Time out has to be after time in.');
    if (!t && S.timeclock.some(x => x.id === `${date}_${staffId}`)) return modalErr(f, `${b.name} already has a time record that day. Edit that one.`);
    const start = (t && t.start) || shiftStartOf(b, pol()), rate = t && t.rate != null ? t.rate : lateRateOf(b), L = lateFine(inHM, start, rate);
    const rec = { ...(t || {}), date, staffId, inHM, in: startMs(date, inHM), start, rate, lateMin: L.mins, fine: L.fine, waived, note, edited: { by: meName(), at: Date.now() } };
    if (outHM) { rec.outHM = outHM; rec.out = startMs(date, outHM); } else { delete rec.outHM; delete rec.out; }
    delete rec.id;
    if (await put('timeclock', `${date}_${staffId}`, rec)) {
      const what = !t ? `Added a time record for ${b.name} on ${fmtDate(date)}: in ${fmtTime(inHM)}${outHM ? ', out ' + fmtTime(outHM) : ''}`
        : [t.inHM !== inHM ? `time in ${fmtTime(t.inHM)} → ${fmtTime(inHM)}` : '', (t.outHM || '') !== outHM ? `time out ${t.outHM ? fmtTime(t.outHM) : 'none'} → ${outHM ? fmtTime(outHM) : 'none'}` : '', !!t.waived !== waived ? (waived ? `excused ${money(L.fine)} late deduction` : 'removed the excuse') : ''].filter(Boolean).join(', ');
      logAct('clock', t ? `Changed ${b.name}'s time on ${fmtDate(date)}: ${what || 'no change'}${note ? ` (${note})` : ''}` : what + (note ? ` (${note})` : ''));
      closeModal(); toast('Time saved');
    }
  },
  async clockset(f) {
    const fd = new FormData(f), st = String(fd.get('clockStart') || CLOCK_START), la = String(fd.get('lat') || '').trim(), ln = String(fd.get('lng') || '').trim();
    const lat = la === '' ? '' : num(la), lng = ln === '' ? '' : num(ln);
    if ((lat !== '' && Math.abs(lat) > 90) || (lng !== '' && Math.abs(lng) > 180)) { toast('That location doesn’t look right.', 'bad'); return; }
    if (await saveInfo({ policy: { ...pol(), clockStart: st }, shop: { ...info().shop, lat, lng } })) { logAct('price', `Time clock: time in by ${fmtTime(st)}`); toast('Time clock saved'); }
  }
});
Object.assign(TAB_VIEWS, { activity: vActivity, me: vMe, mypay: vMyPay });


// runs once, from admin.js, in the same order as before the split
export function init() {
  setInterval(() => {
    if (!S.elevUntil) return;
    if (S.elevUntil <= Date.now()) { S.elevUntil = 0; if (myRole() !== 'owner') stopBossWatches(); toast('Owner pages locked'); render(); return; }
  }, 1000);
}
