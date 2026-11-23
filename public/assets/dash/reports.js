// Dashboard · No-show risk, Reports and the forecast.
import { DAYS, DAYS_LONG, esc, fmtTime, pad, phoneKey, sum } from '../shared.js';
import { buildXlsx } from '../xlsx.js';
import { ACT, CHG, FORM, S, TAB_VIEWS } from './state.js';
import { $, addDays, armed, av, barChart, chip, cur, daysIn, del, field, fmtDate, hbars, icon, inR, info, kpi, leaveOn, money, netOf, newId, num, pageHead, parseYmd, patch, periodRange, put, rangeLabel, render, round2, serviceStaff, services, shortDate, staffAll, staffById, staffName, toast, today, ymd } from './core.js';
import { periodBar, saveBlob } from './money.js';
import { stars } from './setup.js';
import { MODAL, closeModal, modalErr, openModal } from './modals.js';
import { logAct, meName } from './access.js';
import { advanceModal, cutoffLabel, cutoffOf, cutoffShift, nodeToPng, payslip, printNode, slipFor, slipModal, vPayroll } from './payroll.js';

// ================= NO-SHOW RISK =================
// From each client's past bookings (not walk-ins): how many they missed. Shown on upcoming bookings so the shop
// can text them to confirm first. Two or more misses and 30%+ of bookings = high; any miss and 20%+ = medium.
export const clientKey = x => x.customerId || phoneKey(x.phone || '') || '';
export function riskOf(a) {
  if (!a || a.source === 'walk-in' || !['booked', 'pending_payment'].includes(a.status) || a.date < today()) return null;
  const k = clientKey(a); if (!k) return null;
  const past = S.appointments.filter(x => x.id !== a.id && x.source !== 'walk-in' && x.date < today() && ['done', 'noshow'].includes(x.status) && clientKey(x) === k);
  const ns = past.filter(x => x.status === 'noshow').length, n = past.length; if (!ns) return null;
  const rate = ns / n, level = ns >= 2 && rate >= 0.3 ? 'high' : rate >= 0.2 ? 'medium' : null;
  return level ? { ns, n, rate, level } : null;
}
export function riskChip(a) {
  const R = riskOf(a); if (!R) return '';
  if (a.confirmed) return ' ' + chip({ kind: 'good', icon: '✓', label: 'Confirmed by text' });
  return ` <span class="risk risk-${R.level}" title="Missed ${R.ns} of their last ${R.n} bookings">${R.level === 'high' ? 'High' : 'Some'} no-show risk · missed ${R.ns} of ${R.n}</span><button type="button" class="btn btn-sm btn-ghost risk-btn" data-act="confirmText" data-id="${esc(a.id)}">Text to confirm</button>`;
}
export function confirmModal(a) {
  const sh = info().shop, msg = `Hi ${String(a.name || '').split(' ')[0]}! This is ${sh.name}. Just confirming your booking ${a.date === today() ? 'today' : 'on ' + fmtDate(a.date)} at ${fmtTime(a.time)} with ${staffName(a.barberId)}. Reply YES to confirm, or let us know if you can’t make it. Thank you!`;
  const R = riskOf(a) || { ns: 0, n: 0 };
  openModal('Text to confirm', `<div class="stack"><p><b>${esc(a.name)}</b> missed ${R.ns} of their last ${R.n} bookings. Send a quick text before the visit; if they don’t answer, you can give the slot to a walk-in.</p>
    <div class="field"><label for="cf-msg">Message</label><textarea id="cf-msg" rows="4">${esc(msg)}</textarea></div>
    <p class="muted small">Number: <b>${esc(a.phone || 'none')}</b></p>
    <div class="modal-f"><button type="button" class="btn btn-ghost" data-act="cfCopy">Copy message</button>${a.phone ? `<a class="btn" data-act="cfSms" data-id="${esc(a.id)}" href="sms:${esc(a.phone)}?body=${encodeURIComponent(msg)}">Open in Messages</a>` : ''}<button type="button" class="btn btn-primary" data-act="markConfirmed" data-id="${esc(a.id)}">They confirmed</button></div></div>`);
}

// ================= REPORTS =================
export const prevRange = r => { const n = Math.round((parseYmd(r[1]) - parseYmd(r[0])) / 864e5) + 1; return [addDays(r[0], -n), addDays(r[0], -1)]; };
export const salesIn = r => S.sales.filter(s => inR(s.date, r));
export function reportData(r) {
  const sales = salesIn(r), firstSeen = new Map();
  S.sales.forEach(s => { const k = clientKey(s); if (k && (!firstSeen.has(k) || s.date < firstSeen.get(k))) firstSeen.set(k, s.date); });
  const keys = [...new Set(sales.map(clientKey).filter(Boolean))], returning = keys.filter(k => firstSeen.get(k) < r[0]).length;
  const appts = S.appointments.filter(a => inR(a.date, r) && a.source !== 'walk-in' && ['done', 'noshow'].includes(a.status));
  const ns = appts.filter(a => a.status === 'noshow').length;
  return { sales, total: round2(sum(sales, netOf)), count: sales.length, avg: sales.length ? sum(sales, netOf) / sales.length : 0, keys: keys.length, returning, repeat: keys.length ? returning / keys.length : 0, appts, ns, nsRate: appts.length ? ns / appts.length : 0 };
}
export const pct = v => `${Math.round(v * 100)}%`;
export function dPct(cur, prev, invert) {
  if (!prev) return '<span class="d">no earlier data</span>';
  const p = (cur - prev) / prev * 100, good = invert ? p <= 0 : p >= 0;
  return `<span class="d"><span class="${good ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%</span> vs before</span>`;
}
export function heatmap(cells, max, hours) {
  const dows = [1, 2, 3, 4, 5, 6, 0];
  return `<div class="tbl-wrap"><div class="heat" style="--cols:${hours.length}"><span></span>${hours.map(h => `<span class="hh">${h % 12 || 12}${h < 12 ? 'a' : 'p'}</span>`).join('')}
    ${dows.map(d => `<span class="hd">${DAYS[d]}</span>${hours.map(h => { const v = cells[d][h] || 0, k = max ? v / max : 0; return `<span class="hc" style="--k:${k.toFixed(2)}" data-tip="${esc(`${DAYS_LONG[d]} ${fmtTime(pad(h) + ':00')}\nabout ${v.toFixed(1)} client${v === 1 ? '' : 's'}`)}">${v >= 0.5 ? v.toFixed(v < 10 ? 1 : 0) : ''}</span>`; }).join('')}`).join('')}</div></div>
    <div class="heat-key"><span>Quiet</span><i></i><span>Busy</span></div>`;
}
// average clients per hour by weekday, over the range
export function hourCells(sales, r) {
  const occ = Array(7).fill(0); daysIn(r).forEach(d => occ[parseYmd(d).getDay()]++);
  const cells = Array.from({ length: 7 }, () => ({}));
  sales.forEach(s => { if (!s.time) return; const d = parseYmd(s.date).getDay(), h = +s.time.slice(0, 2); cells[d][h] = (cells[d][h] || 0) + 1; });
  cells.forEach((c, d) => Object.keys(c).forEach(h => { c[h] = occ[d] ? c[h] / occ[d] : 0; }));
  return cells;
}
export const shopHours = () => { const hs = info().hours || []; let a = 24, b = 0; hs.forEach(x => { if (x && !x.closed && x.open) { a = Math.min(a, +x.open.slice(0, 2)); b = Math.max(b, +String(x.close || '20:00').slice(0, 2)); } }); if (a >= b) { a = 9; b = 20; } return Array.from({ length: b - a }, (_, i) => a + i); };
export function exportBtns(key) { return `<div class="row exp-btns"><button type="button" class="btn btn-sm btn-ghost" data-act="repCsv" data-k="${key}">CSV</button><button type="button" class="btn btn-sm btn-ghost" data-act="repImg" data-k="${key}">Image</button></div>`; }
export const REP = {}; // CSV rows per section, filled while drawing
export function vReports() {
  const r = periodRange(S.period), pr = prevRange(r), D = reportData(r), P = reportData(pr);
  // barbers
  const barbers = serviceStaff().map(b => { const x = D.sales.filter(s => s.barberId === b.id), keys = [...new Set(x.map(clientKey).filter(Boolean))];
    const fs = new Map(); S.sales.forEach(s => { if (s.barberId === b.id) { const k = clientKey(s); if (k && (!fs.has(k) || s.date < fs.get(k))) fs.set(k, s.date); } });
    const ap = D.appts.filter(a => a.barberId === b.id), ns = ap.filter(a => a.status === 'noshow').length, rated = S.appointments.filter(a => a.barberId === b.id && a.rating && inR(a.date, r));
    return { b, clients: x.length, sales: round2(sum(x, s => (s.svcTotal || 0) - (s.discount || 0))), avg: x.length ? sum(x, netOf) / x.length : 0, repeat: keys.length ? keys.filter(k => fs.get(k) < r[0]).length / keys.length : 0, ns, booked: ap.length, stars: rated.length ? sum(rated, a => a.rating.stars) / rated.length : 0 }; })
    .filter(x => x.clients || x.booked).sort((a, b) => b.sales - a.sales);
  REP.barbers = [['Barber', 'Clients', 'Service sales', 'Average ticket', 'Returning clients %', 'Bookings', 'No-shows', 'No-show %', 'Average stars'], ...barbers.map(x => [x.b.name, x.clients, x.sales, round2(x.avg), Math.round(x.repeat * 100), x.booked, x.ns, x.booked ? Math.round(x.ns / x.booked * 100) : 0, x.stars ? +x.stars.toFixed(1) : ''])];
  // services
  const svcMap = new Map(); D.sales.forEach(s => (s.lines || []).filter(l => l.kind === 'service').forEach(l => { const o = svcMap.get(l.name) || { n: 0, rev: 0 }; o.n += Number(l.qty) || 1; o.rev += (Number(l.price) || 0) * (Number(l.qty) || 1); svcMap.set(l.name, o); }));
  const svcs = [...svcMap].map(([name, o]) => ({ name, ...o })).sort((a, b) => b.rev - a.rev);
  REP.services = [['Service', 'Times done', 'Revenue'], ...svcs.map(x => [x.name, x.n, round2(x.rev)])];
  // busiest
  const hours = shopHours(), cells = hourCells(D.sales, r), max = Math.max(0.0001, ...cells.flatMap(c => Object.values(c)));
  const dayTot = [1, 2, 3, 4, 5, 6, 0].map(d => ({ d, v: sum(Object.values(cells[d]), x => x) }));
  REP.hours = [['Day', ...hours.map(h => fmtTime(pad(h) + ':00'))], ...[1, 2, 3, 4, 5, 6, 0].map(d => [DAYS_LONG[d], ...hours.map(h => +(cells[d][h] || 0).toFixed(2))])];
  // month vs last month
  const ym = today().slice(0, 7), lm = addDays(ym + '-01', -1).slice(0, 7), dim = new Date(+lm.slice(0, 4), +lm.slice(5, 7), 0).getDate();
  const byDom = m => { const a = Array(31).fill(0); S.sales.forEach(s => { if (s.date.slice(0, 7) === m) a[+s.date.slice(8) - 1] += netOf(s); }); return a.map(round2); };
  const cm = byDom(ym), pm = byDom(lm), dToday = +today().slice(8), bk = Array.from({ length: 31 }, (_, i) => ({ key: i, label: String(i + 1), tip: `Day ${i + 1}`, match: () => false }));
  const cmTo = round2(sum(cm.slice(0, dToday), x => x)), pmTo = round2(sum(pm.slice(0, dToday), x => x));
  REP.month = [['Day of month', `This month (${ym})`, `Last month (${lm})`], ...bk.map((b, i) => [i + 1, cm[i], i < dim ? pm[i] : ''])];
  // discounts
  const grp = new Map(); D.sales.filter(s => (s.discount || 0) > 0).forEach(s => { const k = String(s.discountNote || 'Other discount').split(/[:(]/)[0].trim() || 'Other discount'; const o = grp.get(k) || { n: 0, amt: 0, sales: 0 }; o.n++; o.amt += s.discount; o.sales += netOf(s); grp.set(k, o); });
  const disc = [...grp].map(([k, o]) => ({ k, ...o })).sort((a, b) => b.amt - a.amt), couponsGiven = S.customers.flatMap(c => c.coupons || []).filter(cp => inR(ymd(new Date(cp.at || 0)), r)).length;
  REP.discounts = [['Discount', 'Times used', 'Total discount', 'Sales with it'], ...disc.map(x => [x.k, x.n, round2(x.amt), round2(x.sales)])];
  return `${pageHead(rangeLabel(r), 'Reports', '')}
  ${periodBar()}
  <div class="kpis">${kpi('Sales', money(D.total), dPct(D.total, P.total))}${kpi('Clients served', D.count, dPct(D.count, P.count))}${kpi('Average ticket', money(D.avg), dPct(D.avg, P.avg))}${kpi('Returning clients', pct(D.repeat), `<span class="d">${D.returning} of ${D.keys} known clients came before</span>`)}${kpi('No-show rate', pct(D.nsRate), `<span class="d">${D.ns} of ${D.appts.length} bookings · before: ${pct(P.nsRate)}</span>`)}</div>
  ${forecastPanel()}
  <section class="panel rep" data-rep="month"><div class="panel-h"><h2>This month vs last month</h2>${exportBtns('month')}</div>
    <p class="muted small">Days 1–${dToday}: <b>${money(cmTo)}</b> this month vs <b>${money(pmTo)}</b> last month ${dPct(cmTo, pmTo)}</p>
    ${barChart(bk, [{ name: 'This month', cls: 's1', values: cm }, { name: 'Last month', cls: 's2', values: pm }])}</section>
  <div class="grid2e">
  <section class="panel rep" data-rep="barbers"><div class="panel-h"><h2>Best barbers</h2>${exportBtns('barbers')}</div>${hbars(barbers.slice(0, 8).map(x => ({ label: x.b.name, value: x.sales, tip: `${money(x.sales)} · ${x.clients} clients` })))}</section>
  <section class="panel rep" data-rep="services"><div class="panel-h"><h2>Best services</h2>${exportBtns('services')}</div>${hbars(svcs.slice(0, 8).map(x => ({ label: x.name, value: x.rev, tip: `${money(x.rev)} · done ${x.n}×` })))}</section></div>
  <section class="panel"><div class="panel-h"><h2>Barbers: returning clients and no-shows</h2></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Barber</th><th class="r">Clients</th><th class="r">Service sales</th><th class="r">Avg ticket</th><th class="r">Returning</th><th class="r">No-show rate</th><th class="r">Stars</th></tr></thead><tbody>
    ${barbers.map(x => `<tr><td><div class="row" style="flex-wrap:nowrap">${av(x.b)}<b>${esc(x.b.name)}</b></div></td><td class="r">${x.clients}</td><td class="r">${money(x.sales)}</td><td class="r">${money(x.avg)}</td><td class="r">${pct(x.repeat)}</td><td class="r">${x.booked ? `${pct(x.ns / x.booked)} <span class="muted small">(${x.ns}/${x.booked})</span>` : '—'}</td><td class="r">${x.stars ? '★ ' + x.stars.toFixed(1) : '—'}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="panel rep" data-rep="hours"><div class="panel-h"><h2>Busiest hours and days</h2>${exportBtns('hours')}</div>
    <p class="muted small">Average clients started each hour. Busiest day: <b>${DAYS_LONG[dayTot.slice().sort((a, b) => b.v - a.v)[0].d]}</b>. Quietest: <b>${DAYS_LONG[dayTot.slice().sort((a, b) => a.v - b.v)[0].d]}</b>.</p>${heatmap(cells, max, hours)}</section>
  <section class="panel rep" data-rep="discounts"><div class="panel-h"><h2>Coupons, promos and discounts</h2>${exportBtns('discounts')}</div>
    <p class="muted small">${couponsGiven} coupon${couponsGiven === 1 ? '' : 's'} given to clients in this period · ${D.sales.filter(s => s.couponId).length} used at checkout.</p>
    ${disc.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Discount</th><th class="r">Times used</th><th class="r">Total discount</th><th class="r">Sales with it</th></tr></thead><tbody>${disc.map(x => `<tr><td><b>${esc(x.k)}</b></td><td class="r">${x.n}</td><td class="r">${money(x.amt)}</td><td class="r">${money(x.sales)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No discounts in this period.</p>'}</section>`;
}

// ================= FORECAST =================
// Same-weekday average over the last 8 weeks, times the recent trend (last 4 weeks ÷ the 4 before, kept between
// 0.8 and 1.25). Capacity = barbers working that day × 1 client an hour. 80%+ of capacity = busy, 30% or less = slow.
export function forecastModel(asOf = today()) {
  const from = addDays(asOf, -56), win = S.sales.filter(s => s.date >= from && s.date < asOf);
  const a4 = sum(win.filter(s => s.date >= addDays(asOf, -28)), netOf), b4 = sum(win.filter(s => s.date < addDays(asOf, -28)), netOf);
  const trend = b4 > 0 ? Math.min(1.25, Math.max(0.8, a4 / b4)) : 1;
  const occ = Array(7).fill(0); for (let i = 1; i <= 56; i++) occ[parseYmd(addDays(asOf, -i)).getDay()]++;
  const cnt = Array(7).fill(0), rev = Array(7).fill(0), cells = Array.from({ length: 7 }, () => ({}));
  const barberSale = s => { const b = staffById(s.barberId); return !b || (b.role || 'barber') === 'barber'; };
  win.forEach(s => { const d = parseYmd(s.date).getDay(); cnt[d]++; rev[d] += netOf(s); if (s.time && barberSale(s)) { const h = +s.time.slice(0, 2); cells[d][h] = (cells[d][h] || 0) + 1; } });
  cells.forEach((c, d) => Object.keys(c).forEach(h => { c[h] = occ[d] ? c[h] / occ[d] * trend : 0; }));
  return { trend, cells, clients: cnt.map((n, d) => occ[d] ? n / occ[d] * trend : 0), sales: rev.map((v, d) => occ[d] ? v / occ[d] * trend : 0), weeks: 8 };
}
export const workingOn = d => serviceStaff().filter(b => b.active !== false && (b.role || 'barber') === 'barber' && (b.days || [0, 1, 2, 3, 4, 5, 6]).includes(parseYmd(d).getDay()) && !leaveOn(b, d)); // barbers: haircuts are most of the demand
export function runs(hours, test) { const out = []; let st = null; hours.forEach((h, i) => { if (test(h)) { if (st === null) st = h; } else if (st !== null) { out.push([st, hours[i - 1] + 1]); st = null; } }); if (st !== null) out.push([st, hours[hours.length - 1] + 1]); return out; }
export const hrLabel = (a, b) => { const f = h => `${h % 12 || 12}${h < 12 ? ' AM' : ' PM'}`; return `${f(a).replace(/ (AM|PM)$/, (a < 12) === (b < 12) ? '' : ' $1')}–${f(b)}`; };
export function forecastPanel() {
  const M = forecastModel(), hours = shopHours(), days = Array.from({ length: 7 }, (_, i) => addDays(today(), i));
  const tips = [];
  const rows = days.map(d => { const dow = parseYmd(d).getDay(), cap = workingOn(d).length || 1, c = M.cells[dow];
    const busy = runs(hours, h => (c[h] || 0) / cap >= 0.8), slow = runs(hours, h => (c[h] || 0) / cap <= 0.3).filter(([a, b]) => b - a >= 2 && b - a <= 4);
    const booked = S.appointments.filter(a => a.date === d && !['cancelled', 'expired', 'noshow'].includes(a.status)).length;
    busy.forEach(([a, b]) => tips.push({ kind: 'busy', d, text: `<b>${DAYS_LONG[dow]} ${hrLabel(a, b)}</b> is usually full: about ${(sum(hours.filter(h => h >= a && h < b), h => c[h] || 0) / (b - a)).toFixed(1)} clients an hour for ${cap} barber${cap === 1 ? '' : 's'}. Add a barber, or avoid giving a day off then.` }));
    if (dow >= 1 && dow <= 4) slow.slice(0, 1).forEach(([a, b]) => tips.push({ kind: 'slow', d, text: `<b>${DAYS_LONG[dow]} ${hrLabel(a, b)}</b> is usually slow. A good time for a promo, breaks or training.` }));
    return { d, dow, cap, clients: M.clients[dow], sales: M.sales[dow], booked, busy };
  });
  // how close the forecast has been: the last 14 days, each forecast only from data before that day
  const back = Array.from({ length: 14 }, (_, i) => addDays(today(), -(i + 1))).map(d => { const m = forecastModel(d), act = S.sales.filter(s => s.date === d).length, f = m.clients[parseYmd(d).getDay()]; return act ? Math.abs(f - act) / act : null; }).filter(v => v !== null);
  const mape = back.length ? sum(back, x => x) / back.length : null;
  REP.forecast = [['Date', 'Expected clients', 'Expected sales', 'Booked so far', 'Barbers working', 'Busy hours'], ...rows.map(x => [x.d, +x.clients.toFixed(1), round2(x.sales), x.booked, x.cap, x.busy.map(([a, b]) => hrLabel(a, b)).join(', ')])];
  return `<section class="panel rep" data-rep="forecast"><div class="panel-h"><h2>Next 7 days forecast</h2>${exportBtns('forecast')}</div>
    ${tips.length ? `<ul class="fc-tips">${tips.sort((x, y) => (x.kind === 'busy' ? 0 : 1) - (y.kind === 'busy' ? 0 : 1)).slice(0, 6).map(t => `<li class="fc-${t.kind}"><span>${t.kind === 'busy' ? '▲' : '▽'}</span><div>${t.text}</div></li>`).join('')}</ul>` : '<p class="muted">No busy or slow stretches expected this week.</p>'}
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Day</th><th class="r">Expected clients</th><th class="r">Expected sales</th><th class="r">Booked so far</th><th class="r">Barbers</th><th>Busy hours</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td class="nowrap"><b>${x.d === today() ? 'Today' : DAYS[x.dow] + ' ' + shortDate(x.d)}</b></td><td class="r">${Math.round(x.clients * 0.85)}–${Math.round(x.clients * 1.15)}</td><td class="r">${money(Math.round(x.sales / 100) * 100)}</td><td class="r">${x.booked}</td><td class="r">${x.cap}</td><td class="small">${x.busy.length ? x.busy.map(([a, b]) => hrLabel(a, b)).join(', ') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small" style="margin-top:10px">How it works: the average for the same weekday over the last ${M.weeks} weeks, adjusted for the recent trend (${M.trend >= 1 ? '+' : ''}${Math.round((M.trend - 1) * 100)}% vs the 4 weeks before). Busy = 80%+ of what the barbers working that day can take (one client an hour each).${mape !== null ? ` Over the last 14 days it was off by about <b>${Math.round(mape * 100)}%</b> on average.` : ''}</p></section>`;
}
Object.assign(ACT, {
  cutPrev() { S.cutoff = cutoffShift(S.cutoff, -1); render(); },
  cutNext() { S.cutoff = cutoffShift(S.cutoff, 1); render(); },
  viewSlip(el) { const b = staffById(el.dataset.id); if (b) slipModal(b, el.dataset.c || S.cutoff); },
  async paySlip(el) {
    const b = staffById(el.dataset.id), c = S.cutoff; if (!b) return;
    const s = payslip(b, c); if (!s.draft) return;
    const rec = { ...s, draft: false, paidOn: today(), paidAt: Date.now(), paidBy: meName(), method: 'Cash' }; delete rec.id;
    if (await put('payslips', `${c}_${b.id}`, rec)) {
      await put('payouts', `ps_${c}_${b.id}`, { barberId: b.id, amount: rec.net, date: today(), note: `Payslip ${cutoffLabel(c)}`, payslip: `${c}_${b.id}`, createdAt: Date.now() });
      logAct('money', `Paid ${b.name}'s payslip for ${cutoffLabel(c)}: ${money(rec.net, 1)} net${rec.fines ? `, −${money(rec.fines)} late` : ''}${(rec.adv || []).length ? `, −${money(sum(rec.adv, x => x.amount))} cash advance` : ''}`);
      if (MODAL.cur) closeModal(); toast(`${b.name}: payslip marked paid`);
    }
  },
  async payAll(el) {
    if (!armed(el)) return; const c = S.cutoff; let n = 0;
    for (const b of staffAll().filter(x => x.active !== false)) { const s = payslip(b, c); if (!s.draft) continue; const rec = { ...s, draft: false, paidOn: today(), paidAt: Date.now(), paidBy: meName(), method: 'Cash' }; delete rec.id;
      if (await put('payslips', `${c}_${b.id}`, rec)) { await put('payouts', `ps_${c}_${b.id}`, { barberId: b.id, amount: rec.net, date: today(), note: `Payslip ${cutoffLabel(c)}`, payslip: `${c}_${b.id}`, createdAt: Date.now() }); n++; } }
    logAct('money', `Marked ${n} payslips paid for ${cutoffLabel(c)}`); toast(`${n} payslip${n === 1 ? '' : 's'} marked paid`);
  },
  async unpaySlip(el) {
    if (!armed(el)) return; const b = staffById(el.dataset.id), c = S.cutoff, id = `${c}_${b.id}`;
    if (await del('payslips', id)) { await del('payouts', `ps_${id}`); logAct('money', `Undid ${b.name}'s paid payslip for ${cutoffLabel(c)}`); toast('Payslip back to not paid'); }
  },
  async slipImg(el) { const n = $('#payslip'); if (!n) return; el.disabled = true; try { await nodeToPng(n, `payslip-${el.dataset.c}-${el.dataset.id}.png`); } catch (e) { toast(e.message || 'Couldn’t make the image.', 'bad'); } el.disabled = false; },
  slipPrint(el) { const n = $('#payslip'); if (n) printNode(n, `Payslip ${el.dataset.id} ${el.dataset.c}`); },
  exportPayroll() {
    const c = S.cutoff, rows = [['Name', 'Days', 'Base pay', 'Commission', 'Kept down payments', 'Tips', 'Paid leave days', 'Unpaid leave days', 'Late deductions', 'Cash advance', 'Gross', 'Net pay', 'Status']];
    staffAll().filter(b => b.active !== false || slipFor(c, b.id)).forEach(b => { const s = payslip(b, c); rows.push([b.name, s.days, s.base, s.comm, s.dep, s.tips, s.paidLeave, s.unpaidLeave, s.fines, round2(sum(s.adv || [], x => x.amount)), s.gross, s.net, s.draft ? 'Not paid' : 'Paid ' + s.paidOn]); });
    saveBlob(buildXlsx([{ name: 'Payroll', cols: [18, 7, 11, 11, 12, 9, 10, 10, 11, 11, 11, 11, 14], rows, freeze: 'A2' }]), `payroll-${c}.xlsx`);
  },
  newAdvance() { advanceModal(); },
  async delAdvance(el) { if (!armed(el)) return; const a = S.advances.find(x => x.id === el.dataset.id); if (a && await del('advances', a.id)) { logAct('money', `Deleted ${staffName(a.staffId)}'s ${money(a.amount)} cash advance`); toast('Cash advance deleted'); } },
  confirmText(el) { const a = S.appointments.find(x => x.id === el.dataset.id); if (a) confirmModal(a); },
  async cfCopy() { const t = $('#cf-msg'); try { await navigator.clipboard.writeText(t.value); toast('Message copied'); } catch (_) { t.select(); } },
  cfSms(el) { const a = S.appointments.find(x => x.id === el.dataset.id); if (a) { patch('appointments', a.id, { confirmAsked: Date.now() }); logAct('visit', `Texted ${a.name} to confirm their booking (${fmtDate(a.date)} ${fmtTime(a.time)})`); } },
  async markConfirmed(el) { const a = S.appointments.find(x => x.id === el.dataset.id); if (a && await patch('appointments', a.id, { confirmed: Date.now() })) { logAct('visit', `${a.name} confirmed their booking (${fmtDate(a.date)} ${fmtTime(a.time)})`); closeModal(); toast('Marked as confirmed'); } },
  repCsv(el) { const rows = REP[el.dataset.k]; if (!rows) return; const csv = rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n'); saveBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), `${el.dataset.k}-${periodRange(S.period).join('_')}.csv`); },
  async repImg(el) { const p = el.closest('.rep'); if (!p) return; el.disabled = true; p.classList.add('snap'); try { await nodeToPng(p, `${el.dataset.k}-${today()}.png`); } catch (e) { toast(e.message || 'Couldn’t make the image.', 'bad'); } p.classList.remove('snap'); el.disabled = false; }
});
Object.assign(CHG, { cutPick(el) { S.cutoff = el.value; render(); } });
Object.assign(FORM, {
  async advance(f) {
    const fd = new FormData(f), staffId = String(fd.get('staffId') || ''), amt = num(fd.get('amount'));
    if (!staffById(staffId)) return modalErr(f, 'Pick the staff member.'); if (!(amt > 0)) return modalErr(f, 'Enter the amount.');
    const rec = { staffId, amount: round2(amt), date: String(fd.get('date') || today()), parts: Math.max(1, +fd.get('parts') || 1), start: String(fd.get('start') || cutoffOf(today())), note: String(fd.get('note') || '').trim(), at: Date.now(), by: meName() };
    if (await put('advances', newId(), rec)) { logAct('money', `Gave ${staffName(staffId)} a ${money(rec.amount)} cash advance${rec.parts > 1 ? ` (taken back over ${rec.parts} payslips)` : ''}${rec.note ? ` · ${rec.note}` : ''}`); closeModal(); toast('Cash advance saved'); }
  }
});
Object.assign(TAB_VIEWS, { payroll: vPayroll, reports: vReports });
