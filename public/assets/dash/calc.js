// Dashboard · Money math with no screen or database code, so it can be tested on its own (tests/unit).
// Checkout totals, split bills, payment methods and payroll cutoffs.
import { pad, sum } from '../shared.js';

export const round2 = n => Math.round(n * 100) / 100;
export const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };

// ---------- checkout ----------
export function posTotals(p) {
  const svc = sum(p.lines.filter(l => l.kind === 'service'), l => l.price * l.qty), prod = sum(p.lines.filter(l => l.kind === 'product'), l => l.price * l.qty);
  const disc = Math.min(num(p.discount), svc + prod), tip = Math.max(0, num(p.tip));
  const total = round2(svc + prod - disc + tip), deposit = Math.min(p.deposit || 0, total);
  return { svc, prod, sub: svc + prod, disc, tip, total, deposit, collect: round2(total - deposit) };
}

// A split bill: the cash part is typed in, the rest goes to the other method. Both parts must be more than zero.
export function splitOf(p, T, fmt = n => `₱${n}`) {
  const total = round2(T.collect), cash = round2(num(p.splitCash)), rest = round2(total - cash);
  if (!(total > 0)) return { ok: false, cash: 0, rest: 0, why: 'Nothing to collect, so there is nothing to split.' };
  if (!(cash > 0)) return { ok: false, cash: 0, rest: total, why: 'Type how much of the bill is paid in cash.' };
  if (rest <= 0) return { ok: false, cash, rest: 0, why: `The cash part must be less than ${fmt(total)}. For all cash, choose Cash.` };
  return { ok: true, cash, rest };
}

// How a sale was paid at the shop. A split bill (part cash, part GCash...) keeps its parts in sale.split: [{ m, amt }]
// and counts in each method, so the cash drawer and Close the day only count the cash part.
export const atShopOf = s => (s.total || 0) - (s.depositCredit || 0);
export const paidParts = s => s.split && s.split.length ? s.split.map(x => [x.m, Number(x.amt) || 0]) : [[s.method || 'Cash', atShopOf(s)]];
export const paidIn = (s, m) => paidParts(s).reduce((t, x) => t + (x[0] === m ? x[1] : 0), 0);
export const usedMethod = (s, m) => paidParts(s).some(x => x[0] === m);

// ---------- payroll cutoffs: 1st–15th and 16th–end of month, written 2026-11-1 / 2026-11-2 ----------
export const cutoffOf = d => `${d.slice(0, 7)}-${+d.slice(8, 10) <= 15 ? 1 : 2}`;
export function cutoffRange(c) { const ym = c.slice(0, 7), half = c.slice(8); const [y, m] = ym.split('-').map(Number), last = new Date(y, m, 0).getDate(); return half === '1' ? [`${ym}-01`, `${ym}-15`] : [`${ym}-16`, `${ym}-${pad(last)}`]; }
export function cutoffShift(c, n) { let [y, m] = c.slice(0, 7).split('-').map(Number), h = +c.slice(8); let k = (y * 12 + m - 1) * 2 + (h - 1) + n; return `${Math.floor(k / 24)}-${pad(Math.floor(k / 2) % 12 + 1)}-${k % 2 + 1}`; }
export const cutoffIdx = c => { const [y, m] = c.slice(0, 7).split('-').map(Number); return (y * 12 + m - 1) * 2 + (+c.slice(8) - 1); };
// what's left to pay on a payslip
export const slipNet = ({ base = 0, comm = 0, dep = 0, tips = 0, fines = 0, adv = [] }) => { const gross = round2(base + comm + dep + tips); return { gross, net: round2(gross - fines - round2(sum(adv, x => x.amount || 0))) }; };
