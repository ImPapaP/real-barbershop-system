// Dashboard · Overview, Schedule (with the end-of-day check) and Checkout pages.
import { DAYS, bdayDays, cleanBday, esc, fmtTime, lateLimit, priceLabel, sum } from '../shared.js';
import { APPT, METHODS, S } from './state.js';
import { $, activeServices, activeStaff, addDays, ago, apptRow, apptsOn, assignSelect, av, barChart, bdayPromoText, bdayWhen, buckets, chip, cur, custStats, delta, depositChip, field, fmtDate, hbars, icon, info, isLateNow, kpi, leaveOn, loyaltyN, mark, matchCustomer, methodName, money, needsBarber, netOf, normPhone, nowHM, num, opt, pageHead, parseYmd, payIndex, periodRange, pol, proofsPanel, refChip, round2, schedule, serviceStaff, services, shortDate, staffById, staffName, summary, svcNames, today, visible } from './core.js';
import { isBoss } from './access.js';
import { clockLine } from './staffapp.js';
import { cpLabel, filterDD, liveCoupons } from './tables.js';
import { riskOf } from './reports.js';

// ---------- tab: overview ----------
export function vOverview() {
  const t = today(), s = summary([t, t]), nowT = nowHM(), lw = summary([addDays(t, -7), addDays(t, -7)]);
  lw.net = sum(lw.sales.filter(x => (x.time || '') <= nowT), netOf);
  const appts = apptsOn(t), waiting = appts.filter(a => a.status === 'waiting').length, inchair = appts.filter(a => a.status === 'inchair').length;
  const upcoming = appts.filter(a => a.status === 'booked');
  const r14 = [addDays(t, -13), t], bk = buckets(r14);
  const vals = bk.map(b => sum(S.sales.filter(x => b.match(x.date)), netOf));
  const m = summary(periodRange('month')), wk = summary(periodRange('week'));
  const byB = serviceStaff().map(b => ({ label: b.name, value: sum(wk.sales.filter(x => x.barberId === b.id), netOf), tip: `${wk.sales.filter(x => x.barberId === b.id).length} clients this week` })).sort((a, b) => b.value - a.value);
  const low = S.inventory.filter(i => i.stock <= i.reorder).sort((a, b) => a.stock - b.stock);
  const issues = S.appointments.filter(a => a.status === 'needs_attention' || (a.conflict && ['booked', 'pending_payment'].includes(a.status)));
  const lates = appts.filter(a => a.late && ['booked', 'waiting'].includes(a.status));
  const onlineToday = appts.filter(a => a.source === 'online' && a.status !== 'expired').length;
  return `${pageHead(fmtDate(t, true), 'Overview', `<button class="btn" data-act="closeDay">Close the day</button><button class="btn" data-act="newWalkin">+ Walk-in</button><button class="btn" data-act="newBooking">+ Booking</button><a class="btn btn-primary" href="#checkout">${icon('checkout')}Checkout</a>`)}
  ${proofsPanel(true)}
  <section class="kpis" aria-label="Today">
    ${kpi('Sales today', money(s.net), delta(s.net, lw.net, 'this time last ' + DAYS[parseYmd(t).getDay()]))}
    ${kpi('Clients served', s.count, `<span class="d">${upcoming.length} more booked today · ${onlineToday} online</span>`)}
    ${kpi('Average ticket', money(s.avg), `<span class="d">Tips today ${money(s.tips)}</span>`)}
    ${kpi('In the shop now', `${waiting + inchair}`, `<span class="d">${inchair} in chair · ${waiting} waiting</span>`)}
  </section>
  <div class="grid2">
    <section class="panel"><div class="panel-h"><h2>Sales, last 14 days</h2><a class="btn btn-sm btn-ghost" href="#money">Full report</a></div>${barChart(bk, [{ name: 'Sales', values: vals, cls: 's1' }])}</section>
    ${(() => { const risky = S.appointments.filter(a => a.date >= today() && a.date <= addDays(today(), 2) && !a.confirmed && riskOf(a)).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
      return risky.length ? `<section class="panel risk-panel"><div class="panel-h"><h2>Text to confirm</h2><span class="muted small">Next 3 days</span></div><ul class="list">${risky.map(a => { const R0 = riskOf(a); return `<li>${av(staffById(a.barberId))}<span class="t">${a.date === today() ? fmtTime(a.time) : DAYS[parseYmd(a.date).getDay()] + ' ' + fmtTime(a.time)}</span><div class="grow"><b>${esc(a.name)}</b><div class="sub">Missed ${R0.ns} of ${R0.n} bookings${a.confirmAsked ? ' · text sent' : ''}</div></div><button class="btn btn-sm" data-act="confirmText" data-id="${esc(a.id)}">Text</button></li>`; }).join('')}</ul></section>` : ''; })()}
    <section class="panel"><div class="panel-h"><h2>Today’s chairs</h2><a class="btn btn-sm btn-ghost" href="#schedule">Schedule</a></div>
      ${appts.filter(a => !['cancelled', 'expired'].includes(a.status)).length ? `<ul class="list pg">${appts.filter(a => !['cancelled', 'expired'].includes(a.status)).map(a => apptRow(a, true)).join('')}</ul>` : '<p class="empty">No bookings or walk-ins yet today.</p>'}</section>
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
        ${S.appointments.filter(a => needsBarber(a) && a.date >= today()).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)).slice(0, 5).map(a => `<li><span class="grow"><b>${esc(a.name)}</b><span class="sub" style="display:block">Booked “any barber” · ${fmtDate(a.date)} ${fmtTime(a.time)} · ${esc(svcNames(a.serviceIds, a.options))}</span></span>${assignSelect(a)}</li>`).join('')}
        ${lates.map(a => `<li><span class="grow"><b>${esc(a.name)}</b><span class="sub" style="display:block">Running ${a.late.mins} min late for ${fmtTime(a.time)} with ${esc(staffName(a.barberId))} · told us ${ago(a.late.at)}</span></span>${chip({ kind: 'warn', icon: '⏱', label: 'Late' })}</li>`).join('')}
        ${low.slice(0, 4).map(i => `<li><span class="grow"><b>${esc(i.name)}</b><span class="sub" style="display:block">${i.stock} ${esc(i.unit || 'left')} · reorder at ${i.reorder}</span></span>${chip(i.stock <= 0 ? { kind: 'bad', icon: '✕', label: 'Out' } : { kind: 'warn', icon: '!', label: 'Low' })}</li>`).join('')}
        ${!issues.length && !low.length && !lates.length && !S.appointments.some(a => needsBarber(a) && a.date >= today()) ? '<li class="muted">All clear. No booking problems and nothing to restock.</li>' : ''}
      </ul></section>
  </div>`;
}

// ---------- tab: schedule ----------
// Who's in: decides which days count for guaranteed daily pay. Scheduled days count unless marked absent.
export function whosIn(d) {
  const P = payIndex(), staff = activeStaff().sort((a, b) => (a.chair || 99) - (b.chair || 99));
  if (!staff.length) return '';
  const future = d > today();
  return `<section class="panel"><div class="panel-h"><h2>Who’s in</h2><span class="muted small">${future ? 'Mark day-offs ahead of time.' : 'Tap to mark someone absent or in on their day off.'} Each day in earns the barber’s daily pay.</span></div>
    <div class="whos">${staff.map(b => {
      const lv = leaveOn(b, d), sold = P.saleDays.has(`${d}_${b.id}`), mark = P.marks.get(`${d}_${b.id}`), on = sold || (!lv && (mark === undefined ? (b.days || []).includes(parseYmd(d).getDay()) : mark));
      const tc = P.clock.get(`${d}_${b.id}`), isOn = on || !!tc;
      const note = tc ? clockLine(tc) : sold ? 'Has sales' : lv ? (lv.paid ? 'Paid leave' : 'Unpaid leave') : mark === undefined ? (on ? (d === today() ? 'Scheduled · not timed in' : 'Scheduled') : 'Day off') : (on ? 'Came in' : 'Absent');
      return `<button type="button" class="who${isOn ? ' on' : ''}${tc && tc.lateMin && !tc.waived ? ' late' : ''}" data-act="toggleIn" data-id="${esc(b.id)}" aria-pressed="${isOn}" ${sold || tc ? 'disabled' : ''} title="${esc(note)}">${av(b)}<span><b>${esc(b.name)}</b><small>${esc(note)}${isOn && b.dailyPay && isBoss() && !tc ? ' · ' + money(b.dailyPay) : ''}</small></span></button>`;
    }).join('')}</div></section>`;
}
export function vSchedule() {
  if (!S.schedDate) S.schedDate = today();
  const d = S.schedDate, isToday = d === today();
  const all = apptsOn(d);
  const base = all.filter(visible);
  // filters: barber, where the booking came from, what state it's in, and a search
  const q = S.schedQ.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  const srcOf = a => a.source === 'online' ? 'online' : a.source === 'walk-in' ? 'walkin' : 'phone';
  const byBarber = a => !S.schedBarber || a.barberId === S.schedBarber || (!a.barberId && S.schedBarber === '__any');
  const bySrc = a => !S.schedSrc || srcOf(a) === S.schedSrc;
  const byQ = a => !q || (a.name || '').toLowerCase().includes(q) || (a.code || '').toLowerCase().includes(q) || (qd.length >= 3 && normPhone(a.phone).includes(qd)) || svcNames(a.serviceIds, a.options).toLowerCase().includes(q);
  const STATUS_F = [['', 'All', () => true], ['booked', 'Booked', a => a.status === 'booked' || a.status === 'pending_payment'], ['assign', 'Needs a barber', a => needsBarber(a)], ['late', 'Running late', a => isLateNow(a)], ['waiting', 'Waiting', a => a.status === 'waiting'], ['inchair', 'In chair', a => a.status === 'inchair'],
    ['done', 'Done', a => a.status === 'done'], ['unpaid', 'Done, no payment', a => a.status === 'done' && !a.saleId], ['noshow', 'No-show', a => a.status === 'noshow'], ['cancelled', 'Cancelled', a => a.status === 'cancelled']];
  const pre = base.filter(a => byBarber(a) && bySrc(a) && byQ(a)), sf = STATUS_F.find(x => x[0] === S.schedStatus) || STATUS_F[0];
  const appts = pre.filter(sf[2]);
  const statusChips = STATUS_F.map(([k, l, fn]) => [k, l, pre.filter(fn).length]).filter(([k, , n]) => !k || n || k === S.schedStatus);
  const anyFilter = S.schedBarber || S.schedSrc || q || S.schedStatus;
  const dayCount = dd => S.appointments.filter(a => a.date === dd && !['cancelled', 'expired'].includes(a.status)).length;
  const strip = Array.from({ length: 7 }, (_, i) => addDays(today(), i));
  const queue = isToday ? all.filter(a => a.status === 'waiting').sort((a, b) => (a.queueNo || 0) - (b.queueNo || 0)) : [];
  const counts = Object.keys(APPT).map(k => [k, all.filter(a => a.status === k).length]).filter(x => x[1]);
  const expiredN = all.filter(a => a.status === 'expired').length;
  const issues = S.appointments.filter(a => a.status === 'needs_attention');
  return `${pageHead(isToday ? 'Today' : fmtDate(d, true), 'Schedule', `${d <= today() ? `<button class="btn" data-act="closeDay" data-d="${d}">Close the day</button>` : ''}<button class="btn" data-act="walkinQr">Walk-in QR</button><button class="btn" data-act="newWalkin">+ Walk-in</button><button class="btn btn-primary" data-act="newBooking">+ Booking</button>`)}
  ${proofsPanel()}
  ${issues.length ? `<section class="panel"><div class="panel-h"><h2>Paid, but the slot was taken</h2><span class="muted small">Call these clients to rebook, or refund them in PayMongo</span></div><div class="tbl-wrap"><table class="tbl"><tbody>
    ${issues.map(a => `<tr><td class="num nowrap"><b>${fmtDate(a.date)}</b><div class="muted small">${fmtTime(a.time)}</div></td><td><b>${esc(a.name)}</b><div class="muted small">${esc(a.phone)} · ${esc(a.email || '')}</div></td><td>${esc(svcNames(a.serviceIds, a.options))}</td><td>${depositChip(a)}</td><td><div class="acts"><button class="btn btn-sm btn-primary" data-act="editAppt" data-id="${esc(a.id)}">Rebook</button></div></td></tr>`).join('')}
  </tbody></table></div></section>` : ''}
  ${isToday ? `<section class="panel"><div class="panel-h"><h2>Walk-in queue</h2><span class="muted small">Served in order of arrival</span></div>
    ${queue.length ? `<ul class="list">${queue.map(a => `<li><span class="qno">#${esc(a.queueNo || '')}</span><div class="grow"><b>${esc(a.name || 'Walk-in')}</b>${a.fromQr ? ` ${chip({ kind: 'info', icon: '▦', label: 'Joined by QR' })}` : ''}${refChip(a)}<div class="sub">${a.phone ? esc(a.phone) + ' · ' : ''}${esc(svcNames(a.serviceIds, a.options) || 'Not sure yet')} · waiting ${Math.max(0, Math.round((Date.now() - (a.createdAt || Date.now())) / 60000))} min</div></div>
      <select data-change="apptBarber" data-id="${esc(a.id)}" aria-label="Barber for #${esc(a.queueNo || '')}" style="width:auto">${opt('', 'Any barber', !a.barberId)}${serviceStaff().map(b => opt(b.id, b.name, b.id === a.barberId)).join('')}</select>
      <button class="btn btn-sm btn-primary" data-act="startAppt" data-id="${esc(a.id)}">Start</button></li>`).join('')}</ul>` : '<p class="empty">Nobody waiting. Add a walk-in when someone arrives.</p>'}</section>` : ''}
  ${whosIn(d)}
  ${waitlistPanel(d)}
  <section class="panel">
    <div class="toolbar" style="margin-bottom:14px">
      <div class="datenav"><button class="btn btn-sm" data-act="dayShift" data-n="-1" aria-label="Previous day">‹</button>
        <div class="daystrip" role="group" aria-label="Pick a day">${strip.map((dd, i) => { const n = dayCount(dd); return `<button type="button" class="daychip" data-act="dayPick" data-d="${dd}" aria-pressed="${dd === d}"><span>${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYS[new Date(dd + 'T00:00:00').getDay()] + ' ' + (+dd.slice(8))}</span><b>${n || '–'}</b></button>`; }).join('')}</div>
        <button class="btn btn-sm" data-act="dayShift" data-n="1" aria-label="Next day">›</button>
        <input type="date" id="sch-date" data-bind="schedDate" data-live value="${esc(d)}" aria-label="Pick any date" class="date-pick">
        ${strip.includes(d) ? '' : `<span class="chip chip-info"><b aria-hidden="true">◷</b>${esc(fmtDate(d))}</span><button class="btn btn-sm btn-ghost" data-act="dayToday">Back to today</button>`}</div>
    </div>
    <div class="filters">
      <input type="search" id="sch-q" data-bind="schedQ" data-live value="${esc(S.schedQ)}" placeholder="Search name, phone or code" aria-label="Search this day">
      ${filterDD('sched', (S.schedBarber ? 1 : 0) + (S.schedSrc ? 1 : 0) + (S.schedStatus ? 1 : 0), `<div class="fdd-grid"><select id="sch-barber" data-bind="schedBarber" data-live aria-label="Filter by barber">${opt('', `All barbers (${base.length})`, !S.schedBarber)}${serviceStaff().map(b => { const n = base.filter(a => a.barberId === b.id).length; return opt(b.id, `${b.name}${n ? ` (${n})` : ''}`, b.id === S.schedBarber); }).join('')}${opt('__any', `Unassigned (${base.filter(a => !a.barberId).length})`, S.schedBarber === '__any')}</select>
      <select id="sch-src" data-bind="schedSrc" data-live aria-label="Filter by how they booked">${[['', 'All bookings'], ['online', 'Online'], ['walkin', 'Walk-ins'], ['phone', 'Phone / in person']].map(([k, l]) => opt(k, l, k === S.schedSrc)).join('')}</select></div><p class="fdd-h">Status</p><div class="seg-chips" role="group" aria-label="Filter by status">${statusChips.map(([k, l, n]) => `<button type="button" class="fchip${k === 'late' || k === 'unpaid' || k === 'assign' ? ' warn' : ''}" data-act="schedStatus" data-v="${k}" aria-pressed="${k === S.schedStatus}">${esc(l)}<b>${n}</b></button>`).join('')}
      ${expiredN ? `<label class="row small exp-toggle"><input type="checkbox" id="sch-exp" data-bind="showExpired" data-live ${S.showExpired ? 'checked' : ''}> Show ${expiredN} unpaid hold${expiredN > 1 ? 's' : ''}</label>` : ''}</div>`)}
    </div>
    ${anyFilter ? `<p class="filter-note">Showing <b>${appts.length}</b> of ${base.length} · <button type="button" class="link-btn" data-act="schedClear">Clear filters</button></p>` : ''}
    ${appts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Client</th><th>Services</th><th>Barber</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>${appts.map(a => apptRow(a)).join('')}</tbody></table></div>`
      : anyFilter ? `<p class="empty">No visits match these filters. <button type="button" class="link-btn" data-act="schedClear">Clear filters</button></p>` : `<p class="empty">Nothing scheduled ${isToday ? 'today' : 'on this day'}. Online bookings appear here as soon as the deposit is paid.</p>`}
  </section>
  ${d <= today() ? dayCheck(d) : ''}`;
}

// ---------- end-of-day check: every visit paid, and the cash drawer matches ----------
export function dayCheck(d) {
  const visits = apptsOn(d).filter(a => !['expired', 'pending_payment', 'needs_attention'].includes(a.status));
  const saleOf = a => a.saleId && S.sales.find(s => s.id === a.saleId);
  const walk = visits.filter(a => a.source === 'walk-in'), booked = visits.filter(a => a.source !== 'walk-in');
  const paid = visits.filter(a => a.status === 'done' && saleOf(a));
  const unpaid = visits.filter(a => a.status === 'done' && !saleOf(a));
  const inChair = visits.filter(a => a.status === 'inchair'), waiting = visits.filter(a => a.status === 'waiting');
  const left = walk.filter(a => ['cancelled', 'noshow'].includes(a.status));
  const sales = S.sales.filter(s => s.date === d), loose = sales.filter(s => !s.apptId);
  const byMethod = METHODS.map(m => [m, sum(sales.filter(s => (s.method || 'Cash') === m), s => (s.total || 0) - (s.depositCredit || 0))]).filter(x => x[1]);
  const cashIn = sum(sales.filter(s => (s.method || 'Cash') === 'Cash'), s => (s.total || 0) - (s.depositCredit || 0));
  const cashOut = sum(S.expenses.filter(e => e.date === d && e.method === 'Cash'), e => e.amount || 0);
  const c = S.closings.find(x => x.id === d) || {}, expected = round2((c.float || 0) + cashIn - cashOut), diff = c.counted == null ? null : round2(c.counted - expected);
  const flagged = [...unpaid.map(a => [a, 'Marked done, no payment recorded']), ...(d < today() ? inChair.map(a => [a, 'Still “in chair”: was it paid?']) : [])];
  const row = (l, v, cls = '') => `<div class="${cls}"><span>${l}</span><b>${v}</b></div>`;
  return `<section class="panel daycheck"><div class="panel-h"><h2>Day check: ${d === today() ? 'today' : fmtDate(d)}</h2>${flagged.length ? chip({ kind: 'bad', icon: '!', label: `${flagged.length} to check` }) : chip({ kind: 'good', icon: '✓', label: 'Every finished visit is paid' })}</div>
    <p class="muted small" style="margin-bottom:12px">A visit is only “Done” after it’s rung up in Checkout, so every finished visit has a payment. Anything that slipped through shows here.</p>
    <div class="dc-grid">
      <div class="dc-box"><h3>Walk-ins</h3><div class="totals">${row('Came in', walk.length)}${row('Served and paid', walk.filter(a => paid.includes(a)).length)}${row('Waiting or in the chair', walk.filter(a => ['waiting', 'inchair'].includes(a.status)).length)}${row('Left without a cut', left.length)}${row('Rung up without the queue', loose.length)}</div></div>
      <div class="dc-box"><h3>Bookings</h3><div class="totals">${row('Booked', booked.length)}${row('Served and paid', booked.filter(a => paid.includes(a)).length)}${row('Missed or cancelled', booked.filter(a => ['noshow', 'cancelled'].includes(a.status)).length)}${row('Still to come', booked.filter(a => a.status === 'booked').length)}</div></div>
      <div class="dc-box"><h3>Money in</h3><div class="totals">${byMethod.length ? byMethod.map(([m, v]) => row(m, money(v))).join('') : row('No sales yet', '—')}${row('Total', money(sum(byMethod, x => x[1])), 'tot')}</div><p class="muted small">Down payments made online are not counted again here.</p></div>
    </div>
    ${flagged.length ? `<h3 class="dc-h">To check</h3><ul class="list">${flagged.map(([a, why]) => `<li><div class="grow"><b>${esc(a.name || 'Walk-in')}</b>${a.queueNo ? ` <span class="muted small">#${esc(a.queueNo)}</span>` : ''}<div class="sub">${fmtTime(a.time)} · ${esc(svcNames(a.serviceIds, a.options) || 'Service not set')} · ${esc(staffName(a.barberId))} · ${why}</div></div><button class="btn btn-sm btn-primary" data-act="checkoutAppt" data-id="${esc(a.id)}">Ring up payment</button></li>`).join('')}</ul>` : ''}
    <h3 class="dc-h">Cash drawer</h3>
    <form class="dc-cash" data-form="closing" data-date="${d}">
      <div class="fgrid three">${field('Starting cash (float)', `<input id="cl-float" name="float" inputmode="decimal" value="${esc(c.float ?? '')}" placeholder="0">`, 'cl-float')}${field('Cash counted at closing', `<input id="cl-count" name="counted" inputmode="decimal" value="${esc(c.counted ?? '')}" placeholder="Count the drawer">`, 'cl-count')}${field('Note', `<input id="cl-note" name="note" value="${esc(c.note || '')}" placeholder="e.g. ₱500 change from the bank">`, 'cl-note')}</div>
      <div class="totals" style="font-size:14px">${row('Starting cash', money(c.float || 0))}${row('+ Cash sales', money(cashIn))}${row('− Cash expenses', money(cashOut))}${row('Should be in the drawer', money(expected), 'tot')}${diff == null ? '' : row(diff === 0 ? 'Matches' : diff > 0 ? 'Extra cash' : 'Short', diff === 0 ? '✓' : money(Math.abs(diff)), diff === 0 ? 'ok' : 'bad')}</div>
      <div class="row"><button class="btn btn-primary btn-sm" type="submit">${c.at ? 'Update the count' : 'Save the count'}</button>${c.at ? `<span class="muted small">Saved ${ago(c.at)}${c.by ? ' by ' + esc(c.by) : ''}</span>` : ''}</div>
    </form></section>`;
}
export function waitlistPanel(d) {
  const list = S.waitlist.filter(w => w.date === d).sort((a, b) => a.createdAt - b.createdAt);
  if (!list.length) return '';
  const WIN = { any: 'Any time', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  return `<section class="panel"><div class="panel-h"><h2>Waitlist</h2><span class="muted small">Texted automatically, in order, when a matching slot opens</span></div><ul class="list">${list.map((w, i) => `<li><span class="qno" style="font-size:20px;width:34px">${i + 1}</span><div class="grow"><b>${esc(w.name)}</b> <span class="muted small">${esc(w.phone)}</span><div class="sub">${esc(WIN[w.window] || 'Any time')} · ${esc(w.barberId ? staffName(w.barberId) : 'Any barber')}${(w.serviceIds || []).length ? ' · ' + esc(svcNames(w.serviceIds)) : ''}</div></div>
    ${w.status === 'notified' ? chip({ kind: 'good', icon: '✓', label: `Texted${w.notifiedSlot ? ': ' + w.notifiedSlot : ''}` }) : chip({ kind: 'warn', icon: '◷', label: 'Waiting' })}<button class="btn btn-sm btn-ghost" data-act="delWait" data-id="${esc(w.id)}">Remove</button></li>`).join('')}</ul></section>`;
}

// ---------- tab: checkout ----------
export function blankPos() { return { lines: [], name: '', phone: '', barberId: '', discount: '', discountNote: '', tip: '', method: 'Cash', cash: '', apptId: '', deposit: 0, depositMethod: '', pick: 'services', save: true }; }
export function posTotals(p) {
  const svc = sum(p.lines.filter(l => l.kind === 'service'), l => l.price * l.qty), prod = sum(p.lines.filter(l => l.kind === 'product'), l => l.price * l.qty);
  const disc = Math.min(num(p.discount), svc + prod), tip = Math.max(0, num(p.tip));
  const total = round2(svc + prod - disc + tip), deposit = Math.min(p.deposit || 0, total);
  return { svc, prod, sub: svc + prod, disc, tip, total, deposit, collect: round2(total - deposit) };
}
// Birthday within a week of today (the client's on file, or the one given on the booking): days away, or null
export function posBday(p) {
  const appt = p.apptId ? S.appointments.find(a => a.id === p.apptId) : null, c = matchCustomer(p.name, p.phone);
  const n = bdayDays(cleanBday(appt && appt.birthday) || cleanBday(c && c.birthday), today());
  return n !== null && Math.abs(n) <= 7 ? n : null;
}
export function vCheckout() {
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
          ${field('Client', `<input id="pos-name" data-bind="pos.name" data-live data-cust role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cust-pop" value="${esc(p.name)}" placeholder="Walk-in" autocomplete="off">`, 'pos-name')}
          ${field('Phone', `<input id="pos-phone" data-bind="pos.phone" data-live value="${esc(p.phone)}" inputmode="tel" placeholder="Optional">`, 'pos-phone')}
        </div>
        ${p.servedLate ? `<p class="hint"><b>Served late.</b> More than ${lateLimit(appt || {}, pol())} minutes late for a senior barber: the client pays the full price, and the down payment isn’t taken off (it’s kept, half to the barber).</p>` : ''}
        ${p.lateFee ? `<p class="hint"><b>Late fee.</b> More than ${lateLimit(appt || {}, pol())} minutes late for a senior barber: the down payment is kept (half goes to the barber) and the client pays the full price of the service for the barber’s time.</p>` : ''}
        ${appt && appt.refPhoto ? `<button type="button" class="btn btn-sm" data-act="viewRef" data-id="${esc(appt.id)}" style="justify-self:start">See the cut they want (photo)</button>` : ''}
        ${cust && liveCoupons(cust).length ? `<div class="hint cp-hint"><b>${esc(cust.name)} has ${liveCoupons(cust).length > 1 ? 'coupons' : 'a coupon'}:</b><div class="row">${liveCoupons(cust).map(cp => `<button type="button" class="btn btn-sm${p.couponId === cp.id ? ' btn-primary' : ''}" data-act="posCoupon" data-id="${esc(cp.id)}">${p.couponId === cp.id ? '✓ ' : 'Use '}${esc(cpLabel(cp))}</button>`).join('')}</div></div>` : ''}
        ${loyal}${posBday(p) !== null ? `<p class="hint"><b>Birthday ${bdayWhen(posBday(p))}.</b> ${esc(bdayPromoText())} Tap “Birthday promo” below.</p>` : ''}
        ${field('Barber', `<select id="pos-barber" data-bind="pos.barberId" data-live>${opt('', 'Choose barber', !p.barberId)}${serviceStaff().map(b => opt(b.id, `${b.name} · ${b.rate || 0}%`, b.id === p.barberId)).join('')}</select>`, 'pos-barber')}
        <div class="lines">${p.lines.length ? p.lines.map((l, i) => `<div class="line"><span class="nm">${esc(l.name)}</span>${l.kind === 'service' ? '<span class="qty"></span>' : `<span class="qty"><button type="button" data-act="posQty" data-i="${i}" data-d="-1" aria-label="One less">−</button><span>${l.qty}</span><button type="button" data-act="posQty" data-i="${i}" data-d="1" aria-label="One more">+</button></span>`}<span class="num">${money(l.price * l.qty)}</span><button type="button" class="icon-btn" data-act="posDel" data-i="${i}" aria-label="Remove ${esc(l.name)}">✕</button></div>`).join('') : '<p class="muted small" style="padding:10px 0">No items yet. Tap a service or product.</p>'}</div>
        <p class="muted small">For “from” prices, change the amount with the price field after adding.</p>
        ${p.lines.length ? `<div class="fgrid">${p.lines.map((l, i) => l.kind === 'service' ? field(`Price: ${l.name}`, `<input id="pos-price-${i}" data-bind="pos.lines.${i}.price" data-live inputmode="decimal" value="${esc(l.price)}">`, `pos-price-${i}`) : '').join('')}</div>` : ''}
        <div class="fgrid">
          ${field('Discount (' + cur() + ')', `<input id="pos-disc" data-bind="pos.discount" data-live inputmode="decimal" value="${esc(p.discount)}" placeholder="0">`, 'pos-disc')}
          ${field('Tip for barber (' + cur() + ')', `<input id="pos-tip" data-bind="pos.tip" data-live inputmode="decimal" value="${esc(p.tip)}" placeholder="0">`, 'pos-tip')}
        </div>
        <div class="row"><button type="button" class="btn btn-sm" data-act="posDisc" data-v="sc">Senior / PWD 20%</button><button type="button" class="btn btn-sm" data-act="posDisc" data-v="student">Student 10%</button><button type="button" class="btn btn-sm" data-act="posDisc" data-v="free">Loyalty free cut</button>${posBday(p) !== null ? `<button type="button" class="btn btn-sm" data-act="posDisc" data-v="bday">Birthday promo</button>` : ''}${p.discountNote ? `<span class="muted small">${esc(p.discountNote)}</span>` : ''}</div>
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
export function salesTable(list, more) {
  if (!list.length) return '<p class="empty">No sales yet. Completed checkouts show up here.</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Client</th><th>Barber</th><th>Items</th><th>Paid by</th><th class="r">Tip</th><th class="r">Total</th><th></th></tr></thead><tbody>
    ${list.map(s => `<tr><td class="num nowrap">${shortDate(s.date)} <span class="muted small">${fmtTime(s.time)}</span></td><td>${esc(s.name || 'Walk-in')}</td><td>${esc(staffName(s.barberId))}</td><td class="small">${esc((s.lines || []).map(l => l.qty > 1 ? `${l.name} ×${l.qty}` : l.name).join(', '))}</td><td>${esc(s.method)}${s.depositCredit ? `<div class="muted small">+ ${money(s.depositCredit)} deposit</div>` : ''}</td><td class="r">${s.tip ? money(s.tip) : '—'}</td><td class="r"><b>${money(s.total, 1)}</b></td>
      <td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="showSale" data-id="${esc(s.id)}">Receipt</button><button class="btn btn-sm btn-danger" data-act="voidSale" data-id="${esc(s.id)}">Void</button></div></td></tr>`).join('')}
  </tbody></table></div>${more ? `<p class="muted small" style="margin-top:10px">${esc(more)}</p>` : ''}`;
}
