// Dashboard · Working without internet.
// The data is kept on this device (Firestore offline copy) and the page itself by sw.js, so the dashboard opens and
// checkout keeps working offline. Changes made offline are counted here, shown in a bar at the top, and sent when the
// connection is back. Official receipt numbers come from the server, so offline sales get one when the internet returns.
import { call, synced } from '../fb.js';
import { S } from './state.js';
import { info, patch, schedule, toast } from './core.js';
import { myRole } from './access.js';

let pending = 0, bar = null;
export const isOffline = () => navigator.onLine === false;
export function noteWrite() { if (isOffline()) { pending++; draw(); } }
function draw() {
  if (!bar) { bar = document.createElement('div'); bar.id = 'netbar'; bar.className = 'netbar'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite'); document.body.prepend(bar); }
  const off = isOffline();
  bar.hidden = !off && !bar.dataset.syncing;
  bar.classList.toggle('syncing', !off);
  bar.innerHTML = off
    ? `<b>Offline.</b> <span>Checkout and changes still work and are saved on this device${pending ? ` · <b>${pending}</b> waiting to send` : ''}. They send by themselves when the internet is back.</span>`
    : `<b>Back online.</b> <span>Sending ${pending} saved change${pending === 1 ? '' : 's'}…</span>`;
  document.documentElement.classList.toggle('is-offline', off);
}
// sales rung up offline have no receipt number yet: get one for each, oldest first
export async function fillReceiptNos() {
  if (isOffline() || !(info().shop || {}).orEnabled || myRole() === 'staff') return 0;
  const todo = S.sales.filter(s => s.orPending && !s.orNo).sort((a, b) => (a.at || 0) - (b.at || 0)); let n = 0;
  for (const s of todo) {
    try { const r = await call('nextReceiptNo', {}); await patch('sales', s.id, { orNo: `${info().shop.orPrefix || ''}${String(r.no).padStart(6, '0')}`, orPending: false }); n++; }
    catch (_) { break; }
  }
  return n;
}
async function backOnline() {
  bar && (bar.dataset.syncing = '1'); draw();
  try { await synced(); } catch (_) {}
  const n = pending; pending = 0; if (bar) delete bar.dataset.syncing; draw();
  const ors = await fillReceiptNos();
  if (n || ors) toast(`Back online · ${n ? `${n} change${n === 1 ? '' : 's'} sent` : 'all saved'}${ors ? ` · ${ors} receipt number${ors === 1 ? '' : 's'} given` : ''}`);
  schedule();
}
export function init() {
  window.addEventListener('offline', () => { draw(); schedule(); });
  window.addEventListener('online', backOnline);
  draw(); setTimeout(fillReceiptNos, 8000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
