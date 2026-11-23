// Shop dashboard: schedule, checkout, income & expenses, barbers, clients, inventory, setup.
// Sign-in is Firebase Auth; only users listed in the admins/ collection get in (see firestore.rules).
// The code lives in assets/dash/ (one file per area); this file starts it.
// load every area (some only add buttons, forms or pages and export nothing this file uses)
import './dash/state.js';
import './dash/core.js';
import './dash/ops.js';
import './dash/money.js';
import './dash/clients.js';
import './dash/setup.js';
import './dash/modals.js';
import './dash/actions.js';
import './dash/forms.js';
import './dash/access.js';
import './dash/staffapp.js';
import './dash/tables.js';
import './dash/payroll.js';
import './dash/reports.js';
import './dash/data.js';
import './dash/alerts.js';
import { call, db, onAuth } from './fb.js';
import { ACT, CHG, FORM, OWNER_ACTS, S } from './dash/state.js';
import { $, NAV, info, num, render, schedule, toast, trackNav } from './dash/core.js';
import { handleUpload } from './dash/setup.js';
import { closeModal, modalBack } from './dash/modals.js';
import { saveInfo } from './dash/forms.js';
import { isBoss, logAct, myRole, pinModal } from './dash/access.js';
import { startWatches, stopWatches } from './dash/data.js';
import { init as init_core } from './dash/core.js';
import { init as init_setup } from './dash/setup.js';
import { init as init_modals } from './dash/modals.js';
import { init as init_staffapp } from './dash/staffapp.js';
import { init as init_tables } from './dash/tables.js';

init_core();
init_setup();
init_modals();
init_staffapp();
init_tables();

// ================= EVENTS =================
function setPath(path, val) { const k = path.split('.'); let o = S; for (let i = 0; i < k.length - 1; i++) { o = o[k[i]] = o[k[i]] || {}; } o[k[k.length - 1]] = val; }
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return; const fn = ACT[el.dataset.act]; if (!fn) return;
  if (OWNER_ACTS[el.dataset.act] && !isBoss()) { pinModal(OWNER_ACTS[el.dataset.act]); return; } // owner-only: ask for the owner PIN first
  fn(el, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').hidden) modalBack();
  if (e.key === 'Enter' && e.target.matches('tr.click[data-act]')) ACT[e.target.dataset.act](e.target, e);
});
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.bind) return;
  setPath(el.dataset.bind, el.type === 'checkbox' ? el.checked : el.hasAttribute('data-num') ? num(el.value) : el.value);
  if (el.hasAttribute('data-live')) schedule();
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset) return;
  if (el.dataset.upload) { handleUpload(el); return; }
  if (el.dataset.galfield) { const g = (info().gallery || []).map(x => x.id === el.dataset.id ? { ...x, [el.dataset.galfield]: el.value } : x); saveInfo({ gallery: g }).then(ok => ok && toast('Saved')); return; }
  if (el.dataset.caption) { const g = (info().gallery || []).map(x => x.id === el.dataset.caption ? { ...x, caption: el.value.trim().slice(0, 80) } : x); saveInfo({ gallery: g }).then(ok => ok && toast('Caption saved')); return; }
  if (el.dataset.change && CHG[el.dataset.change]) CHG[el.dataset.change](el, e);
});
document.addEventListener('submit', e => { const f = e.target; if (f.dataset && f.dataset.form && FORM[f.dataset.form]) { e.preventDefault(); FORM[f.dataset.form](f, e); } });
const tipEl = $('#tip');
document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) { tipEl.hidden = true; return; } tipEl.textContent = t.dataset.tip; tipEl.hidden = false; });
document.addEventListener('pointermove', e => { if (tipEl.hidden) return; const w = tipEl.offsetWidth, h = tipEl.offsetHeight; let x = e.clientX + 14, y = e.clientY - h - 12; if (x + w > innerWidth - 8) x = e.clientX - w - 14; if (y < 8) y = e.clientY + 18; tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'; });
window.addEventListener('hashchange', () => { if (!$('#modal').hidden) closeModal(true); trackNav(); render(); window.scrollTo(0, 0); });

setInterval(() => { if (S.canAdmin && $('#modal').hidden && !document.activeElement.matches('input,select,textarea')) schedule(); }, 60000);

render();
{
  onAuth(async user => {
    S.user = user; S.canAdmin = false;
    if (user) {
      try { const a = await db.doc(`admins/${user.uid}`).get(); S.canAdmin = a.exists; S.me = a.exists ? { uid: user.uid, ...a.data() } : null; } catch (_) { S.canAdmin = false; S.me = null; }
      try { S.lockOn = myRole() === 'owner' && localStorage.getItem('rb-lock') === '1'; } catch (_) { S.lockOn = false; }
      S.elevUntil = 0; NAV.length = 0; trackNav();
      db.doc(`elevations/${user.uid}`).get().then(e => { if (e.exists) call('pinLock').catch(() => {}); }).catch(() => {}); // a reload locks owner pages again
      if (S.canAdmin) { startWatches(); try { const k = 'rb-in-' + user.uid; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); logAct('signin', 'Signed in'); } } catch (_) {} }
    } else { stopWatches(); S.me = null; }
    S.ready = true; render();
  });
}
