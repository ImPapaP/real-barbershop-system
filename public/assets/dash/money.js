// Dashboard · Income & expenses and Staff pages.
import { buildXlsx, colName, xlDate, xlTime } from '../xlsx.js';
import { esc, isServiceStaff, sum } from '../shared.js';
import { EXP_CATS, METHODS, PERIODS, S } from './state.js';
import { $, addDays, av, barChart, basePayOn, buckets, chip, field, fmtDate, hbars, icon, info, kpi, methodName, money, netOf, num, opt, pageHead, payExample, payFor, payRule, payStart, payType, periodRange, rangeLabel, roleName, round2, serviceStaff, services, short, shortDate, staffAll, staffById, staffName, summary, svcNames, toast, today } from './core.js';
import { salesTable } from './ops.js';
import { closeModal, openModal } from './modals.js';
import { timePanel } from './staffapp.js';
import { filterDD } from './tables.js';

// ---------- tab: money ----------
export const ICON_DL = '<svg class="ic" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3v10M5.5 8.5L10 13l4.5-4.5M4 16.5h12"/></svg>';
export const fileBase = r => `${info().shop.name.replace(/[^\w-]+/g, '-')}_${r[0] === r[1] ? r[0] : `${r[0]}_to_${r[1]}`}`;
export function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// Rows for every money record in the period, shared by the Excel and CSV exports.
export function exportRows(r) {
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
    services: svcNames(a.serviceIds, a.options), products: '', method: methodName(a.deposit.method), svc: 0, prod: 0, disc: 0, tip: 0,
    total: a.deposit.amount, online: a.deposit.amount, shop: 0, comm: 0
  }));
  const exps = [...s.exps].sort((a, b) => a.date.localeCompare(b.date)).map(e => ({ date: e.date, cat: e.cat, desc: e.desc || '', method: e.method || '', amount: e.amount || 0 }));
  return { s, sales: [...sales, ...kept].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), exps };
}
export function exportXlsx() {
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
    ...payRows.map(({ b, P }) => [`${b.name} (${payRule(b)})`, { v: P.days, s: 'int' }, { v: P.x.length, s: 'int' }, M(P.svc), M(P.base), M(P.comm), M(P.pay),
      P.svc ? { v: `${Math.round(P.pay / P.svc * 100)}%`, s: 'text' } : '–', M(P.svc - P.pay), M(P.tips)]));
  sum1.push([], [{ v: `Exported ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}. Income excludes tips, which go to the barbers. Staff pay = base pay (daily pay, daily-minimum top-ups or monthly salary) + commission on services + half of forfeited down payments.`, s: 'sub' }]);

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

  // Sales book: one row per numbered receipt, in receipt order (for the accountant / BIR books)
  const bookSales = s.sales.filter(x => x.orNo).sort((a, b) => String(a.orNo).localeCompare(String(b.orNo), undefined, { numeric: true }));
  const bRows = bookSales.map(x => [D(x.date), x.orNo, x.name || 'Walk-in', M((x.svcTotal || 0) + (x.prodTotal || 0)), M(-(x.discount || 0)), M((x.total || 0) - (x.tip || 0)), x.method || '', M(x.depositCredit || 0), M((x.total || 0) - (x.depositCredit || 0) - (x.tip || 0))]);
  const bookSh = [...head('Sales book'), ['Date', 'Receipt no.', 'Client', 'Gross sales', 'Discount', 'Net sales', 'Payment', 'Paid online earlier', 'Paid at the shop'].map((t, i) => H(t, i, 3)), ...bRows];
  if (bRows.length) bookSh.push(totalRow(9, 5, 4 + bRows.length, 'Total', [3, 4, 5, 7, 8]));
  else bookSh.push([{ v: 'No numbered receipts in this period. Turn on official receipt numbers in Shop setup.', s: 'sub' }]);
  // Expenses
  const eRows = exps.map(e => [D(e.date), e.cat, e.desc, e.method, M(e.amount)]);
  const expSh = [...head('Expenses'), ['Date', 'Category', 'Description', 'Paid by', 'Amount'].map((t, i) => H(t, i, 4)), ...eRows];
  if (eRows.length) expSh.push(totalRow(5, 5, 4 + eRows.length, 'Total', [4]));

  const blob = buildXlsx([
    { name: 'Summary', cols: [40, 13, 10, 14, 13, 14, 15, 14, 17, 18], rows: sum1 },
    { name: 'Day by day', cols: [18, 10, 15, 14, 15, 15, 15], rows: daily, freeze: 'A5', filter: dRows.length ? `A4:G${4 + dRows.length}` : '' },
    { name: 'Sales', cols: [18, 10, 14, 22, 14, 34, 22, 13, 13, 13, 12, 11, 13, 13, 14, 13], rows: salesSh, freeze: 'A5', filter: sRows.length ? `A4:P${4 + sRows.length}` : '' },
    { name: 'Sales book', cols: [16, 16, 24, 14, 12, 14, 14, 16, 16], rows: bookSh, freeze: 'A5', filter: bRows.length ? `A4:I${4 + bRows.length}` : '' },
    { name: 'Expenses', cols: [18, 18, 36, 16, 15], rows: expSh, freeze: 'A5', filter: eRows.length ? `A4:E${4 + eRows.length}` : '' }
  ], { title: `${shop.name} income and expenses, ${rangeLabel(r)}`, author: shop.name });
  saveBlob(blob, fileBase(r) + '.xlsx');
  toast('Excel file downloaded');
}
export function periodBar() {
  return `<div class="toolbar"><div class="seg" role="group" aria-label="Period">${PERIODS.map(([k, l]) => `<button type="button" data-act="period" data-v="${k}" aria-pressed="${S.period === k}">${l}</button>`).join('')}</div>
  ${S.period === 'custom' ? `<div class="datenav"><input type="date" id="p-from" data-bind="from" data-live value="${esc(S.from || addDays(today(), -6))}" aria-label="From"><span class="muted">to</span><input type="date" id="p-to" data-bind="to" data-live value="${esc(S.to || today())}" aria-label="To"></div>` : ''}</div>`;
}
export function vMoney() {
  const r = periodRange(S.period), s = summary(r), bk = buckets(r);
  const inc = bk.map(b => sum(s.sales.filter(x => b.match(x.date)), netOf) + sum(s.kept.filter(x => b.match(x.date)), x => x.deposit.amount));
  const out = bk.map(b => sum(s.exps.filter(x => b.match(x.date)), e => e.amount));
  const byMethod = METHODS.map(m => ({ label: m, value: sum(s.sales.filter(x => x.method === m), x => (x.total || 0) - (x.depositCredit || 0)) }));
  byMethod.push({ label: 'Online deposits', value: s.deposits + s.keptAmt, tip: 'Paid through PayMongo' });
  const methods = byMethod.filter(x => x.value).sort((a, b) => b.value - a.value);
  const byCat = EXP_CATS.map(c => ({ label: c, value: sum(s.exps.filter(x => x.cat === c), x => x.amount) })).filter(x => x.value).sort((a, b) => b.value - a.value);
  const svcMap = {}; for (const x of s.sales) for (const l of (x.lines || [])) if (l.kind === 'service') { svcMap[l.name] = svcMap[l.name] || { n: 0, v: 0 }; svcMap[l.name].n += l.qty; svcMap[l.name].v += l.qty * l.price; }
  const top = Object.entries(svcMap).map(([k, v]) => ({ label: k, value: v.v, text: `${v.n} × · ${money(v.v)}` })).sort((a, b) => b.value - a.value).slice(0, 6);
  const allSales = [...s.sales].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const sales = allSales.filter(x => (!S.saleBarber || x.barberId === S.saleBarber) && (!S.saleMethod || (x.method || 'Cash') === S.saleMethod));
  const allExps = [...s.exps].sort((a, b) => b.date.localeCompare(a.date)), expCats = [...new Set(allExps.map(e => e.cat))].sort();
  const exps = allExps.filter(e => (!S.expCat || e.cat === S.expCat) && (!S.expMethod || e.method === S.expMethod));
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
  <section class="panel"><div class="panel-h"><h2>Expenses</h2><div class="row">${filterDD('exp', (S.expCat ? 1 : 0) + (S.expMethod ? 1 : 0), `<div class="fdd-grid">${field('Category', `<select id="ex-cat" data-bind="expCat" data-live>${opt('', `All (${allExps.length})`, !S.expCat)}${expCats.map(c => opt(c, c, c === S.expCat)).join('')}</select>`, 'ex-cat')}${field('Paid by', `<select id="ex-m" data-bind="expMethod" data-live>${opt('', 'Any', !S.expMethod)}${METHODS.map(m => opt(m, m, m === S.expMethod)).join('')}</select>`, 'ex-m')}</div>`)}<button class="btn btn-sm" data-act="newExpense">+ Expense</button></div></div>
    ${exps.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Paid by</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${exps.map(e => `<tr><td class="num nowrap">${shortDate(e.date)}</td><td>${esc(e.cat)}</td><td>${esc(e.desc || '')}</td><td>${esc(e.method || '')}</td><td class="r"><b>${money(e.amount, 1)}</b></td><td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="editExpense" data-id="${esc(e.id)}">Edit</button><button class="btn btn-sm btn-danger" data-act="delExpense" data-id="${esc(e.id)}">Delete</button></div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">No expenses in this period. Record rent, bills and supplies with “+ Expense”.</p>'}</section>
  <section class="panel"><div class="panel-h"><h2>Sales</h2><div class="row"><span class="muted small">${sales.length}${sales.length !== allSales.length ? ` of ${allSales.length}` : ''} in this period</span>${filterDD('sales', (S.saleBarber ? 1 : 0) + (S.saleMethod ? 1 : 0), `<div class="fdd-grid">${field('Barber', `<select id="sl-b" data-bind="saleBarber" data-live>${opt('', 'Everyone', !S.saleBarber)}${serviceStaff().map(b => opt(b.id, b.name, b.id === S.saleBarber)).join('')}</select>`, 'sl-b')}${field('Payment', `<select id="sl-m" data-bind="saleMethod" data-live>${opt('', 'Any', !S.saleMethod)}${METHODS.map(m => opt(m, m, m === S.saleMethod)).join('')}</select>`, 'sl-m')}</div>`)}</div></div>${salesTable(sales)}</section>`;
}

// ---------- tab: team ----------
// What the shop pays each barber (daily pay + commission) compared with what his services bring in.
export function keepPanel(list, r) {
  const rows = list.map(b => ({ b, P: payFor(b, r) })).filter(({ P }) => P.days || P.x.length);
  if (!rows.length) return '';
  const T = { svc: sum(rows, x => x.P.svc), paid: sum(rows, x => x.P.pay) }, top = Math.max(1, ...rows.map(x => Math.max(x.P.svc, x.P.pay)));
  const pctOf = P => P.svc ? Math.round(P.pay / P.svc * 100) : null;
  const verdict = P => P.svc - P.pay >= 0 ? `<span class="chip chip-good">+${money(P.svc - P.pay)} for the shop</span>` : `<span class="chip chip-bad">Shop pays ${money(P.pay - P.svc)} more</span>`;
  const bars = P => `<div class="vs"><span class="vs-row"><i class="in" style="width:${P.svc / top * 100}%"></i></span><span class="vs-row"><i class="out ${P.pay > P.svc ? 'bad' : ''}" style="width:${P.pay / top * 100}%"></i></span></div>`;
  return `<section class="panel"><div class="panel-h"><h2>Pay vs what each person brings in</h2><span class="muted small">All barbers: brought in ${money(T.svc)}, paid ${money(T.paid)}</span></div>
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
// Leave: paid leave days count as days in (daily pay or daily minimum; monthly salary unchanged),
// unpaid leave days don't (monthly salary is reduced by that day). Leave days are taken off the booking calendar.
export const leaveDays = l => { let n = 0; for (let d = l.from; d <= (l.to || l.from) && n < 400; d = addDays(d, 1)) n++; return n; };
export function leavePanel(list) {
  const t = today(), all = [...(S.leaves || [])].filter(l => (l.to || l.from) >= addDays(t, -60)).sort((a, b) => b.from.localeCompare(a.from));
  return `<section class="panel"><div class="panel-h"><h2>Leave</h2><button class="btn btn-sm btn-primary" data-act="newLeave">+ Add leave</button></div>
    ${all.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Dates</th><th>Days</th><th>Type</th><th>Note</th><th></th></tr></thead><tbody>${all.map(l => { const b = staffById(l.staffId), now = l.from <= t && t <= (l.to || l.from);
      return `<tr><td><div class="row" style="flex-wrap:nowrap">${b ? av(b) : ''}<b>${esc(b ? b.name : 'Former staff')}</b></div></td><td class="nowrap">${fmtDate(l.from)}${l.to && l.to !== l.from ? ` – ${fmtDate(l.to)}` : ''}${now ? ' ' + chip({ kind: 'info', icon: '•', label: 'Now' }) : ''}</td><td class="r">${leaveDays(l)}</td>
        <td>${chip(l.paid ? { kind: 'good', icon: '₱', label: 'Paid' } : { kind: 'mute', icon: '–', label: 'Unpaid' })}</td><td class="muted small">${esc(l.note || '')}</td><td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="editLeave" data-id="${esc(l.id)}">Edit</button><button class="btn btn-sm btn-ghost" data-act="delLeave" data-id="${esc(l.id)}">Remove</button></div></td></tr>`; }).join('')}</tbody></table></div>`
      : '<p class="empty">No leave recorded. Use “+ Add leave” for vacation, sick days or emergencies.</p>'}
    <p class="muted small" style="margin-top:10px">Paid leave counts as a day in: daily pay, or the daily minimum for people on “daily minimum or commission”. Unpaid leave isn’t paid (a monthly salary goes down by that day). Clients can’t book that person online on leave days.</p></section>`;
}
export function leaveModal(l) {
  const c = l || { from: today(), to: today(), paid: true };
  openModal(l ? 'Edit leave' : 'Add leave', `<form class="stack" data-form="leave" data-id="${esc(c.id || '')}">
    ${field('Staff member', `<select id="m-lstaff" name="staffId" required>${staffAll().filter(b => b.active !== false).map(b => opt(b.id, b.name, b.id === c.staffId)).join('')}</select>`, 'm-lstaff')}
    <div class="fgrid">${field('From', `<input id="m-lfrom" name="from" type="date" value="${esc(c.from)}" required>`, 'm-lfrom')}${field('To', `<input id="m-lto" name="to" type="date" value="${esc(c.to || c.from)}" required>`, 'm-lto')}</div>
    <fieldset class="field"><legend>Type</legend><div class="row"><label class="check"><input type="radio" name="paid" value="1" ${c.paid ? 'checked' : ''}> Paid leave</label><label class="check"><input type="radio" name="paid" value="0" ${c.paid ? '' : 'checked'}> Unpaid leave</label></div></fieldset>
    ${field('Note (optional)', `<input id="m-lnote" name="note" value="${esc(c.note || '')}" maxlength="120" placeholder="e.g. Vacation, sick, family emergency">`, 'm-lnote')}
    <p class="err" id="m-err" role="alert"></p>
    <div class="modal-f"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">Save leave</button></div></form>`);
}
// How each person is paid, with an example and what it came to in this period
export function payRulesPanel(list, r) {
  if (!list.length) return '';
  const typeName = { daily: 'Daily pay + commission', quota: 'Daily minimum or commission', monthly: 'Monthly salary' };
  return `<section class="panel"><div class="panel-h"><h2>How each person is paid</h2><span class="muted small">Change it in Edit → How they’re paid</span></div>
    <div class="tbl-wrap"><table class="tbl pay-rules"><thead><tr><th>Name</th><th>Pay plan</th><th>Example</th><th class="r">This period</th></tr></thead><tbody>
    ${list.map(b => { const P = payFor(b, r), parts = [P.base ? `${money(P.base)} ${P.t === 'quota' ? 'top-up' : P.t === 'monthly' ? 'salary' : 'daily pay'}` : '', P.comm ? `${money(P.comm)} commission` : '', P.dep ? `${money(P.dep)} deposits` : ''].filter(Boolean);
      return `<tr><td><div class="row" style="flex-wrap:nowrap">${av(b)}<div><b>${esc(b.name)}</b><div class="muted small">${esc(b.title || roleName(b))}</div></div></div></td>
      <td><b>${esc(typeName[payType(b)])}</b><div class="muted small">${esc(payRule(b))}${b.productFee ? `. On services with salon products the shop takes ${money(b.productFee.low)} (under ${money(b.productFee.threshold)}) or ${money(b.productFee.high)} first` : ''}</div></td>
      <td class="muted small" style="max-width:340px">${esc(payExample(b))}</td>
      <td class="r"><b>${money(P.pay)}</b><div class="muted small">${parts.length ? esc(parts.join(' + ')) : 'Nothing yet'}</div></td></tr>`; }).join('')}
    </tbody></table></div></section>`;
}
// owed = earned − payouts − cash advances given + advances already taken back on paid payslips
export function owedFor(id) { const b = staffById(id); const earned = b ? payFor(b, [payStart(b), today()]).total : 0; const paid = sum(S.payouts.filter(p => p.barberId === id), p => p.amount); const adv = sum(S.advances.filter(a => a.staffId === id), a => a.amount), back = sum(S.payslips.filter(p => p.staffId === id), p => sum(p.adv || [], x => x.amount)); return round2(earned - paid - adv + back); }
export function vTeam() {
  const r = periodRange(S.period), s = summary(r);
  const list = staffAll().filter(b => S.showArchived || b.active !== false).sort((a, b) => (a.chair || 99) - (b.chair || 99));
  const pays = [...S.payouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  return `${pageHead(rangeLabel(r), 'Staff', `<button class="btn btn-primary" data-act="newStaff">+ Staff member</button>`)}
  ${periodBar()}
  <section class="panel"><div class="panel-h"><h2>Pay and commissions</h2>${filterDD('pay', S.showArchived ? 1 : 0, `<label class="row small"><input type="checkbox" id="t-arch" data-bind="showArchived" data-live ${S.showArchived ? 'checked' : ''}> Show former staff</label>`)}</div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl pay-tbl"><thead><tr><th>Name</th><th class="r">Days</th><th class="r">Base pay</th><th class="r">Sales</th><th class="r">Commission</th><th class="r">Earned</th><th class="r">Owed now</th><th></th></tr></thead><tbody>
    ${list.map(b => { const P = payFor(b, r), owed = owedFor(b.id);
      return `<tr><td><div class="row" style="flex-wrap:nowrap">${av(b)}<div><b>${esc(b.name)}</b>${b.active === false ? ' <span class="muted small">(former)</span>' : ''}<div class="muted small nowrap">${esc(b.title || roleName(b))}${b.chair ? ' · Chair ' + esc(b.chair) : ''}</div><div class="pay-rule">${esc(payRule(b))}${b.productFee ? ' · product fee' : ''}</div></div></div></td>
      <td class="r">${P.days}</td><td class="r">${money(P.base)}${P.t === 'quota' && P.topUps ? `<div class="muted small nowrap">top-up on ${P.topUps} day${P.topUps === 1 ? '' : 's'}</div>` : P.t === 'monthly' ? '<div class="muted small">salary</div>' : ''}${P.dep ? `<div class="muted small nowrap">+ ${money(P.dep)} deposits</div>` : ''}</td><td class="r">${money(P.svc)}<div class="muted small">${P.x.length} client${P.x.length === 1 ? '' : 's'}</div></td><td class="r">${money(P.comm, P.comm % 1 !== 0)}${P.tips ? `<div class="muted small">+ ${money(P.tips)} tips</div>` : ''}</td><td class="r"><b>${money(P.total, P.total % 1 !== 0)}</b>${P.fines ? `<div class="muted small nowrap">−${money(P.fines)} late (${P.lates})</div>` : ''}</td><td class="r"><b class="${owed > 0 ? '' : 'muted'}">${money(owed, owed % 1 !== 0)}</b></td>
      <td><div class="acts acts-col"><button class="btn btn-sm btn-primary" data-act="payStaff" data-id="${esc(b.id)}" ${owed <= 0 ? 'disabled' : ''}>Pay</button><button class="btn btn-sm btn-ghost" data-act="editStaff" data-id="${esc(b.id)}">Edit</button></div></td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="empty">No staff yet. Use “+ Staff member”, or load the starter team in Shop setup.</p>'}
    <p class="muted small" style="margin-top:12px">Earned = base pay + commission (their rate × service sales after discounts) + their half of forfeited down payments + tips. Base pay depends on how each person is paid (see below). A day counts as worked when they had a sale, or it’s one of their days in and they weren’t marked absent in Schedule → Who’s in. “Owed now” is everything earned minus payouts.</p></section>
  ${timePanel(list.filter(b => b.active !== false), r)}
  ${leavePanel(list.filter(b => b.active !== false))}
  ${payRulesPanel(list.filter(b => b.active !== false), r)}
  ${keepPanel(list.filter(b => b.active !== false && isServiceStaff(b)), r)}
  <section class="panel"><div class="panel-h"><h2>Payout history</h2></div>
    ${pays.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Paid on</th><th>Name</th><th>Note</th><th class="r">Amount</th><th></th></tr></thead><tbody>${pays.map(p => `<tr><td class="num">${fmtDate(p.date)}</td><td>${esc(staffName(p.barberId))}</td><td>${esc(p.note || '')}</td><td class="r"><b>${money(p.amount, 1)}</b></td><td><div class="acts"><button class="btn btn-sm btn-danger" data-act="delPayout" data-id="${esc(p.id)}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No payouts recorded yet.</p>'}</section>`;
}
