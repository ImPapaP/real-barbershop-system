// Dashboard · Live data from the database (watchers) and the website product list.
import { db } from '../fb.js';
import { S, unsubs } from './state.js';
import { addDays, info, schedule, today } from './core.js';
import { saveInfo } from './forms.js';
import { checkAlerts, resetAlerts } from './alerts.js';
import { bossWatches, isBoss, myRole, startOwnWatches, stopBossWatches } from './access.js';

// ================= DATA =================
// Products on the website: retail items marked "Show on website". Only name, price, description, photo and
// whether it's in stock go public (never cost or stock counts). Kept in step whenever inventory changes.
export let productsSig = '';
export function syncProducts() {
  if (!S.info || !S.loaded.inventory || !isBoss()) return;
  const list = S.inventory.filter(i => i.cat === 'Retail' && i.web).sort((a, b) => (a.webOrder || 0) - (b.webOrder || 0) || a.name.localeCompare(b.name))
    .map(i => ({ id: i.id, name: i.name, price: i.price || 0, desc: i.webDesc || '', photo: i.photo || '', tag: i.webTag || '', inStock: (i.stock || 0) > 0 }));
  const sig = JSON.stringify(list);
  if (sig === productsSig || sig === JSON.stringify(info().products || [])) { productsSig = sig; return; }
  productsSig = sig; saveInfo({ products: list });
}
export function watchCol(key, q) {
  unsubs.push(q.onSnapshot(snap => { S[key] = snap.docs.map(d => ({ id: d.id, ...d.data() })); S.loaded[key] = true; if (key === 'inventory') syncProducts(); if (key === 'appointments') checkAlerts(); schedule(); },
    err => { console.error(key, err); S.loaded[key] = true; S.slow = true; schedule(); }));
}
export function stopWatches() { while (unsubs.length) { try { unsubs.pop()(); } catch (_) {} } stopBossWatches(); S.loaded = {}; resetAlerts(); }
export function startWatches() {
  stopWatches();
  if (myRole() === 'staff') return startOwnWatches();
  const since = addDays(today(), -400);
  const slow = setTimeout(() => { S.slow = true; schedule(); }, 10000);
  unsubs.push(db.doc('public/info').onSnapshot(s => { clearTimeout(slow); S.info = s.exists ? s.data() : null; S.infoMissing = !s.exists; schedule(); }, () => { S.slow = true; schedule(); }));
  watchCol('staff', db.collection('staff'));
  watchCol('appointments', db.collection('appointments').where('date', '>=', addDays(today(), -120)));
  watchCol('sales', db.collection('sales').where('date', '>=', since));
  watchCol('expenses', db.collection('expenses').where('date', '>=', since));
  watchCol('customers', db.collection('customers'));
  watchCol('inventory', db.collection('inventory'));
  watchCol('leaves', db.collection('leaves'));
  watchCol('timeclock', db.collection('timeclock').where('date', '>=', addDays(today(), -120)));
  bossWatches();
  watchCol('attendance', db.collection('attendance'));
  watchCol('promos', db.collection('promos'));
  watchCol('closings', db.collection('closings'));
  watchCol('waitlist', db.collection('waitlist').where('date', '>=', addDays(today(), -7)));
}
