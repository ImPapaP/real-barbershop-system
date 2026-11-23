// Unit tests for the no-show model, forecast scoring and the evaluation questionnaire math.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { featuresOf, dataset, train, predict, auc, confusion, fitNoShow, scoreForecasts, reasons, FEATURES } from '../../public/assets/dash/ml.js';
import { CHARS, itemsFor, interpret, summarize, ALL_IDS } from '../../public/assets/evaluation.js';

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// bookings where no-shows really depend on history and down payments, like a real shop
function shop(n = 600) {
  const clients = Array.from({ length: 40 }, (_, i) => ({ phone: '0917' + (1000000 + i), skip: rnd() < 0.2 ? 0.55 : 0.06 })), out = [];
  for (let i = 0; i < n; i++) {
    const c = clients[Math.floor(rnd() * clients.length)], day = new Date(Date.UTC(2026, 6, 1) + Math.floor(i / 10) * 864e5).toISOString().slice(0, 10), dep = rnd() < 0.5;
    const p = Math.min(0.95, c.skip * (dep ? 0.4 : 1.4));
    out.push({ id: 'a' + i, date: day, time: '14:00', source: 'online', status: rnd() < p ? 'noshow' : 'done', phone: c.phone, createdAt: Date.parse(day) - 2 * 864e5, deposit: dep ? { status: 'paid' } : null });
  }
  return out;
}
const key = a => a.phone;

test('no-show features use only what was known before the visit', () => {
  const prior = [{ status: 'noshow' }, { status: 'done' }];
  const x = featuresOf({ date: '2026-11-21', time: '18:00', source: 'phone', createdAt: Date.parse('2026-11-14T10:00:00+08:00'), startAt: Date.parse('2026-11-21T18:00:00+08:00') }, prior);
  assert.equal(x.length, FEATURES.length);
  assert.ok(Math.abs(x[0] - 1.3 / 4) < 1e-9); // (1 no-show + 0.3) / (2 visits + 2)
  assert.equal(x[1], 0);                       // not a first booking
  assert.equal(x[3], 0);                       // no down payment
  assert.deepEqual(x.slice(4), [1, 1, 1]);    // by phone, Saturday, 6 PM
  const rows = dataset([{ id: 'x', date: '2026-01-01', time: '10:00', status: 'noshow', source: 'online', phone: '1' }, { id: 'y', date: '2026-01-08', time: '10:00', status: 'done', source: 'online', phone: '1' }], key, '2026-02-01');
  assert.equal(rows[0].x[1], 1); assert.equal(rows[1].x[1], 0); // the second booking knows about the first no-show
});
test('logistic regression learns the pattern and beats guessing on unseen bookings', () => {
  const M = fitNoShow(shop(), key, '2027-01-01');
  assert.equal(M.ready, true);
  assert.ok(M.eval.auc > 0.7, `AUC ${M.eval.auc}`);
  const w = Object.fromEntries(FEATURES.map((f, j) => [f[0], M.model.w[j]]));
  assert.ok(w.rate > 0, 'past no-shows should raise risk'); assert.ok(w.deposit < 0, 'a down payment should lower risk');
  const risky = predict(M.model, [0.5, 0, Math.log1p(2), 0, 0, 0, 0]), safe = predict(M.model, [0.05, 0, Math.log1p(2), 1, 0, 0, 0]);
  assert.ok(risky > safe);
  assert.ok(reasons(M.model, [0.5, 0, Math.log1p(2), 0, 0, 0, 0]).includes('often missed past bookings'));
});
test('the model waits for enough history', () => {
  const M = fitNoShow(shop(40), key, '2027-01-01'); assert.equal(M.ready, false);
});
test('AUC and confusion matrix', () => {
  assert.equal(auc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0]), 1);
  assert.equal(auc([0.1, 0.2, 0.8, 0.9], [1, 1, 0, 0]), 0);
  assert.equal(auc([0.5, 0.5], [1, 0]), 0.5);
  assert.deepEqual(confusion([0.9, 0.6, 0.3, 0.1], [1, 0, 1, 0], 0.5), { tp: 1, fp: 1, tn: 1, fn: 1, accuracy: 0.5, precision: 0.5, recall: 0.5 });
  const m = train([[0], [1], [0], [1]], [0, 1, 0, 1]); assert.ok(predict(m, [1]) > 0.5 && predict(m, [0]) < 0.5);
});
test('forecast scoring: mean absolute error and % off, days with no sales skipped', () => {
  const s = scoreForecasts([{ actual: 10, model: 12, lastWeek: 8, avg7: 10 }, { actual: 20, model: 18, lastWeek: 25, avg7: 10 }, { actual: 0, model: 5, lastWeek: 5, avg7: 5 }]);
  assert.equal(s.model.mae, 2); assert.equal(s.model.n, 2); assert.ok(Math.abs(s.model.mape - 0.15) < 1e-9);
  assert.equal(s.lastWeek.mae, 3.5); assert.equal(s.avg7.mae, 5);
});
test('evaluation: statements per group, interpretation and weighted means', () => {
  assert.equal(new Set(ALL_IDS).size, ALL_IDS.length, 'statement ids are unique');
  assert.equal(CHARS.length, 8);
  assert.ok(itemsFor('it').length > itemsFor('client').length);
  assert.ok(!itemsFor('client').some(i => i.char === 'ma'), 'maintainability is for IT only');
  assert.equal(interpret(4.21), 'Strongly agree (Excellent)'); assert.equal(interpret(4.2), 'Agree (Very good)');
  assert.equal(interpret(2.61), 'Neutral (Good)'); assert.equal(interpret(1.8), 'Strongly disagree (Poor)');
  const R = summarize([{ group: 'client', answers: { fs1: 5, fs2: 4, fs3: 3 } }, { group: 'it', answers: { fs1: 3, fs2: 4, fs3: 5, ma1: 4 } }]);
  assert.equal(R.n, 2); assert.equal(R.item.fs1.mean, 4); assert.equal(R.chars.find(c => c.id === 'fs').mean, 4);
  assert.equal(R.chars.find(c => c.id === 'ma').mean, 4); assert.equal(R.overall, 4); assert.equal(R.label, 'Agree (Very good)');
  assert.equal(summarize([{ group: 'client', answers: { fs1: 5 } }, { group: 'it', answers: { fs1: 1 } }], 'client').item.fs1.mean, 5);
});
test('dashboard modules have no duplicate top-level names (a duplicate stops the whole dashboard loading)', () => {
  const dir = new URL('../../public/assets/dash/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const names = [...readFileSync(new URL(f, dir), 'utf8').matchAll(/^(?:export )?(?:const|let|function|async function|class) ([\w$]+)/gm)].map(m => m[1]);
    const dup = names.filter((n, i) => names.indexOf(n) !== i); assert.deepEqual(dup, [], `${f}: ${dup}`);
  }
});
