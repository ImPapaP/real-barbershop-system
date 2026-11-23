// Dashboard · Payroll, payslips and cash advances.
import { MONTHS, esc, pad, sum } from '../shared.js';
import { S } from './state.js';
import { $, activeStaff, av, chip, cur, daysIn, field, fmtDate, icon, info, kpi, leaveOn, money, opt, pageHead, payFor, payRule, payType, roleName, round2, services, shortDate, staffAll, staffName, toast, today } from './core.js';
import { saveBlob } from './money.js';
import { mFoot, openModal } from './modals.js';
import { myRole } from './access.js';
import { cutoffOf, cutoffRange, cutoffShift, cutoffIdx, slipNet } from './calc.js';
export { cutoffOf, cutoffRange, cutoffShift, cutoffIdx };

// ================= PAYROLL, PAYSLIPS, CASH ADVANCES =================
// Cutoffs: the 1st–15th and the 16th–end of month. A payslip is worked out live from the pay rules until the
// owner marks it paid; then it's saved (payslips/{cutoff}_{staffId}) with a payout for the net amount.
// Cash advances (vale): advances/{id} { staffId, amount, date, parts, start (cutoff), note }. Each payslip from
// the start cutoff takes back amount ÷ parts (catching up if a cutoff was skipped) until it's all back.
export const cutoffLabel = c => { const [a, b] = cutoffRange(c); return `${MONTHS[+a.slice(5, 7) - 1]} ${+a.slice(8)}–${+b.slice(8)}, ${a.slice(0, 4)}`; };
export const slipFor = (c, id) => S.payslips.find(p => p.id === `${c}_${id}`);
// how much of each advance this cutoff takes back
export function advanceDue(staffId, c) {
  const paidSlips = S.payslips.filter(p => p.staffId === staffId && p.cutoff !== c);
  return S.advances.filter(a => a.staffId === staffId && cutoffIdx(a.start) <= cutoffIdx(c)).map(a => {
    const back = round2(sum(paidSlips, p => ((p.adv || []).find(x => x.id === a.id) || {}).amount || 0)), left = round2(a.amount - back);
    const parts = Math.max(1, +a.parts || 1), per = round2(a.amount / parts), dueSoFar = Math.min(a.amount, round2(per * (cutoffIdx(c) - cutoffIdx(a.start) + 1)));
    const amount = round2(Math.max(0, Math.min(left, dueSoFar - back)));
    return { id: a.id, amount, left, a };
  }).filter(x => x.amount > 0);
}
export function leaveCount(b, r) { const ds = daysIn(r); let paid = 0, unpaid = 0; ds.forEach(d => { const lv = leaveOn(b, d); if (lv) lv.paid ? paid++ : unpaid++; }); return { paid, unpaid }; }
// the payslip: a saved one, or worked out now
export function payslip(b, c) {
  const saved = slipFor(c, b.id); if (saved) return saved;
  const r = cutoffRange(c), P = payFor(b, r), lv = leaveCount(b, r), adv = advanceDue(b.id, c);
  const { gross, net } = slipNet({ base: P.base, comm: P.comm, dep: P.dep, tips: P.tips, fines: P.fines || 0, adv });
  return { id: `${c}_${b.id}`, cutoff: c, staffId: b.id, name: b.name, title: b.title || roleName(b), payType: P.t, rule: payRule(b), from: r[0], to: r[1],
    days: P.days, daily: P.daily, base: P.base, topUps: P.topUps || 0, svc: round2(P.svc), rate: Number(b.rate) || 0, comm: P.comm, dep: P.dep, tips: round2(P.tips), clients: P.x.length,
    paidLeave: lv.paid, unpaidLeave: lv.unpaid, lates: P.lates || 0, fines: P.fines || 0, adv: adv.map(x => ({ id: x.id, amount: x.amount, note: x.a.note || '', left: round2(x.left - x.amount) })),
    gross, net, draft: true };
}
export function vPayroll() {
  const c = S.cutoff || (S.cutoff = cutoffShift(cutoffOf(today()), -1)); // default: the last cutoff that has ended
  const list = staffAll().filter(b => b.active !== false || slipFor(c, b.id)).sort((a, b) => (a.chair || 99) - (b.chair || 99));
  const slips = list.map(b => [b, payslip(b, c)]), r = cutoffRange(c), ended = r[1] < today();
  const tot = k => round2(sum(slips, ([, s]) => s[k] || 0)), paidN = slips.filter(([, s]) => !s.draft).length;
  const opts = Array.from({ length: 12 }, (_, i) => cutoffShift(cutoffOf(today()), -i));
  return `${pageHead(cutoffLabel(c), 'Payroll', `<div class="row"><button class="btn" data-act="cutPrev" aria-label="Earlier cutoff">‹</button><select id="pr-cut" data-change="cutPick" aria-label="Cutoff" style="width:auto">${opts.map(o => opt(o, cutoffLabel(o), o === c)).join('')}${opts.includes(c) ? '' : opt(c, cutoffLabel(c), true)}</select><button class="btn" data-act="cutNext" aria-label="Later cutoff" ${c >= cutoffOf(today()) ? 'disabled' : ''}>›</button></div>`)}
  ${ended ? '' : `<div class="banner">${icon('cal')} This cutoff isn’t over yet (ends ${fmtDate(r[1])}). The numbers keep changing until then.</div>`}
  <div class="kpis"><div class="kpi"><span class="k">Gross pay</span><span class="v">${money(tot('gross'))}</span></div><div class="kpi"><span class="k">Late deductions</span><span class="v">−${money(tot('fines'))}</span></div><div class="kpi"><span class="k">Cash advances taken back</span><span class="v">−${money(round2(sum(slips, ([, s]) => sum(s.adv || [], x => x.amount))))}</span></div><div class="kpi"><span class="k">Net to pay</span><span class="v">${money(tot('net'))}</span><span class="d">${paidN} of ${slips.length} paid</span></div></div>
  <section class="panel"><div class="panel-h"><h2>Payslips</h2><div class="row">${paidN < slips.length && ended ? `<button class="btn btn-sm btn-primary" data-act="payAll">Mark all paid</button>` : ''}<button class="btn btn-sm" data-act="exportPayroll">Export Excel</button></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th class="r">Days</th><th class="r">Base pay</th><th class="r">Commission</th><th class="r">Tips</th><th class="r">Leave</th><th class="r">Late</th><th class="r">Vale</th><th class="r">Net pay</th><th>Status</th><th></th></tr></thead><tbody>
    ${slips.map(([b, s]) => { const advT = round2(sum(s.adv || [], x => x.amount));
      return `<tr><td><div class="row" style="flex-wrap:nowrap">${av(b)}<div><b>${esc(b.name)}</b><div class="muted small">${esc(s.title || '')}</div></div></div></td><td class="r">${s.days}</td>
      <td class="r">${money(s.base)}${s.payType === 'quota' && s.topUps ? `<div class="muted small">top-up ${s.topUps} day${s.topUps > 1 ? 's' : ''}</div>` : ''}</td><td class="r">${money(s.comm)}${s.dep ? `<div class="muted small">+ ${money(s.dep)} kept DP</div>` : ''}</td><td class="r">${s.tips ? money(s.tips) : '—'}</td>
      <td class="r small">${s.paidLeave ? `${s.paidLeave} paid` : ''}${s.paidLeave && s.unpaidLeave ? '<br>' : ''}${s.unpaidLeave ? `${s.unpaidLeave} unpaid` : ''}${!s.paidLeave && !s.unpaidLeave ? '—' : ''}</td>
      <td class="r">${s.fines ? `−${money(s.fines)}` : '—'}</td><td class="r">${advT ? `−${money(advT)}` : '—'}</td><td class="r"><b>${money(s.net)}</b></td>
      <td>${s.draft ? chip({ kind: ended ? 'warn' : 'mute', icon: ended ? '!' : '…', label: ended ? 'Not paid' : 'Running' }) : chip({ kind: 'good', icon: '✓', label: `Paid ${shortDate(s.paidOn)}` })}</td>
      <td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="viewSlip" data-id="${esc(b.id)}">Payslip</button>${s.draft ? (ended ? `<button class="btn btn-sm btn-primary" data-act="paySlip" data-id="${esc(b.id)}">Mark paid</button>` : '') : `<button class="btn btn-sm btn-ghost" data-act="unpaySlip" data-id="${esc(b.id)}">Undo</button>`}</div></td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="muted small" style="margin-top:10px">Net pay = base pay + commission + their half of kept down payments + tips − late deductions − cash advance taken back. Marking a payslip paid saves it (it won’t change after that), records the payout, and the staff member sees it in My pay.</p></section>
  ${advancesPanel()}`;
}
export function advancesPanel() {
  const list = [...S.advances].sort((a, b) => b.date.localeCompare(a.date));
  const backOf = a => round2(sum(S.payslips.filter(p => p.staffId === a.staffId), p => ((p.adv || []).find(x => x.id === a.id) || {}).amount || 0));
  return `<section class="panel"><div class="panel-h"><h2>Cash advances (vale)</h2><button class="btn btn-sm btn-primary" data-act="newAdvance">+ Cash advance</button></div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Name</th><th class="r">Amount</th><th>Taken back</th><th class="r">Still owed</th><th>Note</th><th></th></tr></thead><tbody>${list.map(a => { const back = backOf(a), left = round2(a.amount - back), parts = Math.max(1, +a.parts || 1);
      return `<tr><td class="nowrap">${fmtDate(a.date)}</td><td><b>${esc(staffName(a.staffId))}</b></td><td class="r">${money(a.amount)}</td>
        <td class="small">${parts === 1 ? 'All on the next payslip' : `${money(round2(a.amount / parts))} × ${parts} payslips`}<div class="muted">from ${esc(cutoffLabel(a.start))}</div><div class="meter-line"><i style="width:${Math.min(100, back / a.amount * 100).toFixed(0)}%"></i></div></td>
        <td class="r">${left > 0 ? `<b>${money(left)}</b>` : chip({ kind: 'good', icon: '✓', label: 'Paid back' })}</td><td class="muted small">${esc(a.note || '')}</td>
        <td><div class="acts">${back ? '' : `<button class="btn btn-sm btn-ghost" data-act="delAdvance" data-id="${esc(a.id)}">Delete</button>`}</div></td></tr>`; }).join('')}</tbody></table></div>`
      : '<p class="empty">No cash advances. Record one when a staff member borrows against their pay; it comes off their next payslip(s) automatically.</p>'}</section>`;
}
export function advanceModal() {
  const c0 = cutoffOf(today());
  openModal('Cash advance (vale)', `<form class="stack" data-form="advance">
    <div class="fgrid">${field('Staff member', `<select id="m-avstaff" name="staffId" required>${activeStaff().map(b => opt(b.id, b.name)).join('')}</select>`, 'm-avstaff')}${field(`Amount (${cur()})`, '<input id="m-avamt" name="amount" inputmode="decimal" required placeholder="e.g. 1000">', 'm-avamt')}</div>
    <div class="fgrid">${field('Date given', `<input id="m-avdate" name="date" type="date" value="${today()}" max="${today()}">`, 'm-avdate')}${field('Take it back', `<select id="m-avparts" name="parts">${[[1, 'All on the next payslip'], [2, 'Over 2 payslips'], [3, 'Over 3 payslips'], [4, 'Over 4 payslips'], [6, 'Over 6 payslips']].map(([v, l]) => opt(v, l, v === 1)).join('')}</select>`, 'm-avparts')}</div>
    ${field('Starting with the payslip for', `<select id="m-avstart" name="start">${[0, 1, 2].map(n => cutoffShift(c0, n)).map((c, i) => opt(c, cutoffLabel(c) + (i === 0 ? ' (this cutoff)' : ''), i === 0)).join('')}</select>`, 'm-avstart')}
    ${field('Note', '<input id="m-avnote" name="note" maxlength="100" placeholder="e.g. Tuition, cash from the drawer">', 'm-avnote')}
    <p class="err" id="m-err" hidden></p>${mFoot('Save advance')}</form>`);
}
export function slipHTML(s) {
  const sh = info().shop, row = (l, v, cls = '') => `<div class="ps-row ${cls}"><span>${l}</span><b>${v}</b></div>`;
  const advT = round2(sum(s.adv || [], x => x.amount));
  const baseLabel = s.payType === 'monthly' ? `Salary (${s.days} day${s.days === 1 ? '' : 's'})` : s.payType === 'quota' ? `Daily minimum top-ups (${s.topUps || 0} day${s.topUps === 1 ? '' : 's'})` : `Daily pay (${s.days} × ${money(s.daily || 0)})`;
  return `<div class="payslip" id="payslip">
    <div class="ps-head"><div><b class="ps-shop">${esc(sh.name)}</b><div class="ps-sub">${esc(sh.address || '')}</div></div><div class="ps-tag">PAYSLIP</div></div>
    <div class="ps-meta"><div><span>Employee</span><b>${esc(s.name)}</b><small>${esc(s.title || '')}</small></div><div><span>Pay period</span><b>${esc(cutoffLabel(s.cutoff))}</b><small>${s.draft ? 'Not paid yet' : `Paid ${fmtDate(s.paidOn)}${s.method ? ' · ' + esc(s.method) : ''}`}</small></div></div>
    <p class="ps-rule">${esc(s.rule || '')}</p>
    <div class="ps-sec"><h4>Earnings</h4>${row(baseLabel, money(s.base))}${row(`Commission (${s.rate}% of ${money(s.svc)} services · ${s.clients} client${s.clients === 1 ? '' : 's'})`, money(s.comm))}${s.dep ? row('Share of kept down payments', money(s.dep)) : ''}${row('Tips', money(s.tips))}${row('Gross pay', money(s.gross), 'tot')}</div>
    <div class="ps-sec"><h4>Deductions</h4>${row(`Late (${s.lates || 0} time${s.lates === 1 ? '' : 's'})`, s.fines ? '−' + money(s.fines) : money(0))}${(s.adv || []).length ? s.adv.map(x => row(`Cash advance${x.note ? ' · ' + esc(x.note) : ''}${x.left > 0 ? ` (${money(x.left)} left)` : ' (paid off)'}`, '−' + money(x.amount))).join('') : row('Cash advance', money(0))}${row('Total deductions', '−' + money(round2((s.fines || 0) + advT)), 'tot')}</div>
    <div class="ps-sec ps-att"><h4>Attendance</h4>${row('Days in', s.days)}${row('Paid leave', `${s.paidLeave || 0} day${s.paidLeave === 1 ? '' : 's'}`)}${row('Unpaid leave', `${s.unpaidLeave || 0} day${s.unpaidLeave === 1 ? '' : 's'}`)}</div>
    <div class="ps-net"><span>NET PAY</span><b>${money(s.net)}</b></div>
    <p class="ps-foot">${s.draft ? 'Preview: this payslip can still change until it’s marked paid.' : `Ref ${esc(s.id)} · issued by ${esc(s.paidBy || '')}`}</p></div>`;
}
export function slipModal(b, c) {
  const s = payslip(b, c), mine = myRole() === 'staff';
  openModal(`Payslip · ${b.name}`, `<div class="stack">${slipHTML(s)}
    <div class="modal-f"><button type="button" class="btn btn-ghost" data-act="slipImg" data-id="${esc(b.id)}" data-c="${esc(c)}">Save as image</button><button type="button" class="btn btn-ghost" data-act="slipPrint" data-id="${esc(b.id)}" data-c="${esc(c)}">Print / PDF</button>${!mine && s.draft && cutoffRange(c)[1] < today() ? `<button type="button" class="btn btn-primary" data-act="paySlip" data-id="${esc(b.id)}">Mark paid</button>` : ''}</div></div>`, true);
}
// Images of a payslip or a report: html-to-image (MIT, bundled in assets/vendor, loaded only when needed)
export let h2iP = null;
export const loadH2I = () => h2iP || (h2iP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('../assets/vendor/html-to-image.js', location.href).href; s.onload = () => res(window.htmlToImage); s.onerror = () => { h2iP = null; rej(new Error('Couldn’t load the image tool.')); }; document.head.appendChild(s); }));
export async function nodeToPng(el, name) {
  const h2i = await loadH2I(), bg = getComputedStyle(document.body).backgroundColor || '#fff';
  const opts = { backgroundColor: bg, pixelRatio: 2, cacheBust: true };
  let blob; try { blob = await h2i.toBlob(el, opts); } catch (_) { blob = await h2i.toBlob(el, { ...opts, skipFonts: true }); }
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && innerWidth < 760 && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (_) {} }
  saveBlob(blob, name);
}
export function printNode(el, title) {
  const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print.', 'bad'); return; }
  const css = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => `<link rel="stylesheet" href="${l.href}">`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${css}<style>body{background:#fff;padding:24px}.payslip{margin:0 auto;box-shadow:none}@page{size:A5;margin:10mm}</style></head><body>${el.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
  w.document.close();
}
