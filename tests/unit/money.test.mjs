// Unit tests for the money math the shop relies on. Run from the repo root:  node --test tests/unit
// No install needed (Node's own test runner). The same functions run in the dashboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { posTotals, splitOf, paidIn, paidParts, usedMethod, cutoffOf, cutoffRange, cutoffShift, slipNet } from '../../public/assets/dash/calc.js';
import { commissionFor, lateFine, couponLive, couponLabel, depositFor, hasDeposit, money } from '../../public/assets/shared.js';

const svc = (price, qty = 1) => ({ kind: 'service', price, qty }), prod = (price, qty = 1) => ({ kind: 'product', price, qty });

test('checkout: totals with discount, tip and an online deposit', () => {
  const T = posTotals({ lines: [svc(399), prod(250, 2)], discount: '100', tip: '50', deposit: 200 });
  assert.deepEqual([T.svc, T.prod, T.disc, T.tip, T.total, T.deposit, T.collect], [399, 500, 100, 50, 849, 200, 649]);
});
test('checkout: discount never goes below zero and a deposit never exceeds the bill', () => {
  const T = posTotals({ lines: [svc(200)], discount: '999', tip: '-5', deposit: 500 });
  assert.equal(T.total, 0); assert.equal(T.tip, 0); assert.equal(T.collect, 0);
  assert.equal(posTotals({ lines: [svc(1200)], discount: '1,000' }).total, 200); // typed with a comma
});
test('split bill: cash part plus the rest equals what to collect', () => {
  const T = posTotals({ lines: [svc(399)] });
  assert.deepEqual(splitOf({ splitCash: '100' }, T), { ok: true, cash: 100, rest: 299 });
  assert.equal(splitOf({ splitCash: '' }, T).ok, false);
  assert.equal(splitOf({ splitCash: '399' }, T).ok, false); // all cash is not a split
  assert.equal(splitOf({ splitCash: '500' }, T).ok, false);
  assert.equal(splitOf({ splitCash: '50' }, posTotals({ lines: [] })).ok, false);
});
test('split bill: the cash drawer counts only the cash part', () => {
  const sales = [
    { total: 399, method: 'Cash' },
    { total: 600, depositCredit: 200, method: 'GCash' },
    { total: 399, method: 'Split', split: [{ m: 'Cash', amt: 100 }, { m: 'GCash', amt: 299 }] },
    { total: 250 } // older sales with no method were cash
  ];
  const by = m => sales.reduce((t, s) => t + paidIn(s, m), 0);
  assert.equal(by('Cash'), 399 + 100 + 250);
  assert.equal(by('GCash'), 400 + 299);
  assert.equal(by('Cash') + by('GCash'), sales.reduce((t, s) => t + s.total - (s.depositCredit || 0), 0)); // nothing lost or doubled
  assert.equal(usedMethod(sales[2], 'GCash'), true);
  assert.deepEqual(paidParts(sales[1]), [['GCash', 400]]);
});
test('barber commission: product fee first, then the split, discount shared by services', () => {
  const b = { rate: 50 }, lookup = () => null;
  assert.equal(commissionFor(b, [svc(400)], 0, lookup).commission, 200);
  assert.equal(commissionFor(b, [svc(400)], 100, lookup).commission, 150);
  assert.equal(commissionFor(b, [prod(300)], 0, lookup).commission, 0);
});
test('late deductions: 9:01 is late, per started 15 minutes', () => {
  assert.equal(lateFine('09:00', '09:00', 15).fine, 0);
  assert.equal(lateFine('09:01', '09:00', 15).fine, 15);
  assert.equal(lateFine('09:16', '09:00', 50).fine, 100);
});
test('coupons: live until used or expired', () => {
  assert.equal(couponLive({ kind: 'amount', value: 100 }, '2026-11-23'), true);
  assert.equal(couponLive({ kind: 'amount', value: 100, used: true }, '2026-11-23'), false);
  assert.equal(couponLive({ kind: 'amount', value: 100, expires: '2026-11-22' }, '2026-11-23'), false);
  assert.equal(couponLabel({ kind: 'percent', value: 10 }), '10% off');
});
test('payroll cutoffs and payslip net pay', () => {
  assert.equal(cutoffOf('2026-11-15'), '2026-11-1');
  assert.equal(cutoffOf('2026-11-16'), '2026-11-2');
  assert.deepEqual(cutoffRange('2026-02-2'), ['2026-02-16', '2026-02-28']);
  assert.deepEqual(cutoffRange('2028-02-2'), ['2028-02-16', '2028-02-29']); // leap year
  assert.equal(cutoffShift('2026-01-1', -1), '2025-12-2');
  assert.equal(cutoffShift('2026-12-2', 1), '2027-01-1');
  assert.deepEqual(slipNet({ base: 3000, comm: 2450.5, dep: 200, tips: 150, fines: 65, adv: [{ amount: 500 }, { amount: 250 }] }), { gross: 5800.5, net: 4985.5 });
});
test('bookings: down payment rules', () => {
  const info = { policy: { deposit: 200 }, barbers: [{ id: 'a', active: true, services: [] }, { id: 'b', active: true, noDeposit: true, services: [] }] };
  assert.equal(depositFor(info, 'a', []), 200);
  assert.equal(depositFor(info, 'b', []), 0);
  assert.equal(typeof hasDeposit, 'function');
  assert.equal(money(1234.5, '₱', true), '₱1,234.50');
});
