// Dashboard · Prediction models, with no screen or database code so they can be tested on their own (tests/unit).
//
// No-show model: logistic regression learned from the shop's own past bookings. For each finished booking
// (came or no-show) it looks only at what was known before the visit: the client's past no-shows and visits,
// how far ahead they booked, whether they paid a down payment, how they booked, the day and the hour.
// It trains on the older bookings and is scored on the newest ones it has never seen (a time-based split),
// so the accuracy shown is an honest estimate for future bookings.
//
// Forecast scoring: compares the sales forecast with two simple guesses (same weekday last week, and the
// average of the last 7 days) on the same days, so the forecast has to beat them to be worth using.

export const FEATURES = [
  // key, what it measures, words for a reason when the value is high / when it's low
  ['rate', 'Past no-show rate', 'often missed past bookings', 'usually comes'],
  ['first', 'First booking with the shop', 'first booking with the shop', 'a returning client'],
  ['lead', 'Days booked ahead', 'booked far ahead', 'booked close to the day'],
  ['deposit', 'Paid a down payment', 'paid a down payment', 'no down payment'],
  ['phone', 'Booked by phone or chat', 'booked by phone or chat', 'booked online'],
  ['weekend', 'Weekend visit', 'weekend visit', 'weekday visit'],
  ['evening', 'Evening visit (5 PM or later)', 'evening visit', 'daytime visit'],
];
const DAY = 864e5;
const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
const dowOf = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const startOf = a => a.startAt || Date.parse(`${a.date}T${a.time || '12:00'}:00+08:00`);
const paidDeposit = a => !!((a.deposit && a.deposit.status === 'paid') || (a.proof && a.proof.status === 'approved'));

// the numbers the model sees for one booking, given that client's earlier finished bookings
export function featuresOf(a, prior) {
  const n = prior.length, missed = prior.filter(x => x.status === 'noshow').length;
  const lead = a.createdAt ? Math.max(0, (startOf(a) - a.createdAt) / DAY) : 1;
  return [
    (missed + 0.3) / (n + 2),           // past no-show rate, pulled toward the usual ~15% when there is little history
    n === 0 ? 1 : 0,
    Math.log1p(Math.min(lead, 60)),
    paidDeposit(a) ? 1 : 0,
    a.source === 'phone' ? 1 : 0,
    [0, 6].includes(dowOf(a.date)) ? 1 : 0,
    (+String(a.time || '12').slice(0, 2)) >= 17 ? 1 : 0,
  ];
}

// every finished booking (not walk-ins), oldest first, with its features and whether it was a no-show
export function dataset(appts, keyOf, beforeYmd) {
  const done = appts.filter(a => a.source !== 'walk-in' && ['done', 'noshow'].includes(a.status) && a.date < beforeYmd && keyOf(a))
    .sort((x, y) => startOf(x) - startOf(y));
  const byClient = new Map(), rows = [];
  for (const a of done) {
    const k = keyOf(a), prior = byClient.get(k) || [];
    rows.push({ id: a.id, x: featuresOf(a, prior), y: a.status === 'noshow' ? 1 : 0, rule: ruleScore(prior) });
    prior.push(a); byClient.set(k, prior);
  }
  return rows;
}

// the old rule (missed 2+ and 30%+ = high, 20%+ = some), as a score, to compare against
export function ruleScore(prior) {
  const n = prior.length, ns = prior.filter(x => x.status === 'noshow').length; if (!ns) return 0;
  const r = ns / n; return ns >= 2 && r >= 0.3 ? 1 : r >= 0.2 ? 0.5 : 0;
}

// logistic regression by gradient descent on standardized features, with a little L2 so it doesn't overreact
export function train(X, y, { iters = 600, lr = 0.3, l2 = 0.01 } = {}) {
  const k = X[0].length, n = X.length;
  const mean = Array(k).fill(0), sd = Array(k).fill(0);
  X.forEach(r => r.forEach((v, j) => { mean[j] += v / n; }));
  X.forEach(r => r.forEach((v, j) => { sd[j] += (v - mean[j]) ** 2 / n; }));
  for (let j = 0; j < k; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = X.map(r => r.map((v, j) => (v - mean[j]) / sd[j]));
  const base = y.reduce((s, v) => s + v, 0) / n;
  let b = Math.log((base + 1e-6) / (1 - base + 1e-6)); const w = Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const gw = Array(k).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) { const p = sigmoid(b + Z[i].reduce((s, v, j) => s + v * w[j], 0)), e = p - y[i]; gb += e; for (let j = 0; j < k; j++) gw[j] += e * Z[i][j]; }
    b -= lr * gb / n; for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
  }
  return { w, b, mean, sd, base };
}
export const predict = (m, x) => sigmoid(m.b + x.reduce((s, v, j) => s + (v - m.mean[j]) / m.sd[j] * m.w[j], 0));
// which features pushed this booking's risk up the most, in plain words
export function reasons(m, x, top = 2) {
  return x.map((v, j) => ({ j, hi: v > m.mean[j], c: (v - m.mean[j]) / m.sd[j] * m.w[j] })).filter(r => r.c > 0.15).sort((p, q) => q.c - p.c).slice(0, top).map(r => FEATURES[r.j][r.hi ? 2 : 3]);
}

// area under the ROC curve: the chance a real no-show gets a higher score than someone who came (0.5 = guessing)
export function auc(scores, y) {
  const pos = [], neg = []; scores.forEach((s, i) => (y[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  let wins = 0; for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}
export function confusion(scores, y, thr) {
  const c = { tp: 0, fp: 0, tn: 0, fn: 0 };
  scores.forEach((s, i) => { const hit = s >= thr; if (hit && y[i]) c.tp++; else if (hit) c.fp++; else if (y[i]) c.fn++; else c.tn++; });
  const n = scores.length || 1;
  return { ...c, accuracy: (c.tp + c.tn) / n, precision: c.tp + c.fp ? c.tp / (c.tp + c.fp) : null, recall: c.tp + c.fn ? c.tp / (c.tp + c.fn) : null };
}

// train on the oldest 75%, score on the newest 25%, then retrain on everything for use on upcoming bookings
export const MIN_ROWS = 80, MIN_NOSHOWS = 10;
export function fitNoShow(appts, keyOf, todayYmd, thr = 0.25) {
  const rows = dataset(appts, keyOf, todayYmd), pos = rows.filter(r => r.y).length;
  if (rows.length < MIN_ROWS || pos < MIN_NOSHOWS) return { ready: false, rows: rows.length, noshows: pos };
  const cut = Math.floor(rows.length * 0.75), tr = rows.slice(0, cut), te = rows.slice(cut);
  const m1 = train(tr.map(r => r.x), tr.map(r => r.y)), ys = te.map(r => r.y), ps = te.map(r => predict(m1, r.x));
  const model = train(rows.map(r => r.x), rows.map(r => r.y));
  return {
    ready: true, rows: rows.length, noshows: pos, train: tr.length, test: te.length, thr, model,
    eval: { auc: auc(ps, ys), ...confusion(ps, ys, thr), testNoshows: ys.filter(Boolean).length },
    rule: { auc: auc(te.map(r => r.rule), ys), ...confusion(te.map(r => r.rule), ys, 0.5) },
    usual: { accuracy: 1 - ys.filter(Boolean).length / ys.length }, // always guessing "they'll come"
  };
}

// forecast vs simple guesses. days: [{ actual, model, lastWeek, avg7 }] → mean absolute error and % error for each
export function scoreForecasts(days) {
  const out = {};
  for (const k of ['model', 'lastWeek', 'avg7']) {
    const ok = days.filter(d => d.actual > 0 && d[k] != null);
    out[k] = ok.length ? { mae: ok.reduce((s, d) => s + Math.abs(d[k] - d.actual), 0) / ok.length, mape: ok.reduce((s, d) => s + Math.abs(d[k] - d.actual) / d.actual, 0) / ok.length, n: ok.length } : null;
  }
  return out;
}
