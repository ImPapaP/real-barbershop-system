// Dashboard · Table pages, filter dropdowns, drag to scroll, client coupons.
import { couponLabel, couponLive, esc } from '../shared.js';
import { ACT, CHG, S } from './state.js';
import { $, armed, chip, cur, field, fmtDate, icon, info, matchCustomer, money, num, opt, patch, render, round2, route, services, shortDate, summary, svcById, toast, today, ymd } from './core.js';
import { posTotals } from './ops.js';
import { MODAL, clientModal } from './modals.js';
import { logAct, meName } from './access.js';

// ================= TABLES: PAGES, FILTER DROPDOWNS, DRAG TO SCROLL =================
// Every table (and lists marked .pg) shows one page at a time instead of a long scroll. It runs after each
// render: rows outside the page are hidden and a pager is added under the table. The page resets when the
// number of rows changes (a new search or filter).
export const PG = {};
export const pgSize = () => { try { const v = +localStorage.getItem('rb-pgsize'); if (v) return v; } catch (_) {} return innerWidth < 640 ? 10 : 15; };
export function pagerHTML(key, page, pages, from, to, total) {
  const nums = [], add = n => nums.push(n);
  for (let n = 0; n < pages; n++) if (n === 0 || n === pages - 1 || Math.abs(n - page) <= 1) add(n); else if (nums[nums.length - 1] !== '…') add('…');
  return `<span class="pg-info">${from}–${to} of ${total}</span><div class="pg-btns">
    <button type="button" class="pg-b" data-act="pgGo" data-k="${esc(key)}" data-p="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="Previous page">‹</button>
    ${nums.map(n => n === '…' ? '<span class="pg-gap">…</span>' : `<button type="button" class="pg-b${n === page ? ' on' : ''}" data-act="pgGo" data-k="${esc(key)}" data-p="${n}" ${n === page ? 'aria-current="page"' : ''}>${n + 1}</button>`).join('')}
    <button type="button" class="pg-b" data-act="pgGo" data-k="${esc(key)}" data-p="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''} aria-label="Next page">›</button></div>
    <label class="pg-size">Rows <select data-change="pgSize" aria-label="Rows per page">${[10, 15, 25, 50].map(n => `<option ${n === pgSize() ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
}
export function applyPaging() {
  const size = pgSize(), tab = route();
  document.querySelectorAll('#app table.tbl, #modal table.tbl, #app ul.pg, #modal ul.pg').forEach((t, i) => {
    if (t.closest('[data-nopage]')) return;
    const isList = t.tagName === 'UL', rows = isList ? [...t.children] : [...(t.tBodies[0] ? t.tBodies[0].rows : [])];
    const host = isList ? t : (t.closest('.tbl-wrap') || t);
    const old = host.nextElementSibling && host.nextElementSibling.classList.contains('pager') ? host.nextElementSibling : null;
    if (rows.length <= size) { rows.forEach(r => { r.hidden = false; }); if (old) old.remove(); return; }
    const panel = t.closest('.panel, .modal');
    const key = t.dataset.pg || `${t.closest('#modal') ? 'm' : tab}:${(panel && panel.querySelector('h2, h3, .eyebrow') || {}).textContent || ''}:${i}`;
    const st = PG[key] || (PG[key] = { page: 0, n: rows.length });
    if (st.n !== rows.length) { st.page = 0; st.n = rows.length; }
    const pages = Math.ceil(rows.length / size); st.page = Math.min(Math.max(0, st.page), pages - 1);
    const a = st.page * size, b = Math.min(rows.length, a + size);
    rows.forEach((r, k) => { r.hidden = k < a || k >= b; });
    const html = pagerHTML(key, st.page, pages, a + 1, b, rows.length);
    if (old) { if (old.dataset.h !== html) { old.innerHTML = html; old.dataset.h = html; } }
    else { const d = document.createElement('div'); d.className = 'pager'; d.innerHTML = html; d.dataset.h = html; host.after(d); }
  });
  document.querySelectorAll('.tbl-wrap').forEach(w => w.classList.toggle('can-drag', w.scrollWidth > w.clientWidth + 4));
}
// Filters live in a dropdown button; it stays open while you change them
export const DD = {};
export function filterDD(key, active, body) {
  return `<details class="fdd" data-dd="${esc(key)}" ${DD[key] ? 'open' : ''}><summary class="btn btn-sm fdd-btn">${icon('filter')}<span>Filters</span>${active ? `<span class="fdd-n">${active}</span>` : ''}</summary>
    <div class="fdd-pop">${body}${active ? `<button type="button" class="link-btn small" data-act="ddClear" data-k="${esc(key)}">Clear filters</button>` : ''}</div></details>`;
}
export const DD_CLEAR = {
  sched: () => { S.schedBarber = ''; S.schedSrc = ''; S.schedStatus = ''; },
  clients: () => { S.clientSort = 'recent'; S.clientTag = ''; },
  act: () => { S.actWho = ''; S.actKind = ''; },
  sales: () => { S.saleBarber = ''; S.saleMethod = ''; },
  exp: () => { S.expCat = ''; S.expMethod = ''; },
  stock: () => { S.stockFilter = 'all'; },
  time: () => { S.timeWho = ''; S.timeLate = false; },
  pay: () => { S.showArchived = false; }
};
// Drag a wide table sideways with the mouse (phones and trackpads already scroll it)

// ================= CLIENT COUPONS =================
export const cpLabel = cp => couponLabel(cp, services(), cur());
export const liveCoupons = c => ((c && c.coupons) || []).filter(cp => couponLive(cp, today()));
export function couponAmount(cp, T, p) {
  if (cp.kind === 'percent') return round2(T.sub * Math.min(100, Number(cp.value) || 0) / 100);
  if (cp.kind === 'service') { const l = p.lines.find(x => x.kind === 'service' && x.ref === cp.svcId); return l ? Number(l.price) || 0 : 0; }
  return Math.min(T.sub, Number(cp.value) || 0);
}
export function couponRows(c) {
  const list = [...(c.coupons || [])].sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!list.length) return '<p class="muted small">No coupons yet.</p>';
  return `<ul class="list cp-list">${list.map(cp => { const live = couponLive(cp, today()), exp = cp.expires && cp.expires < today();
    return `<li><span class="cp-tag${live ? '' : ' off'}">${esc(cpLabel(cp))}</span><span class="grow"><span class="sub" style="display:block">${esc(cp.note || 'No note')}${cp.expires ? ` · until ${shortDate(cp.expires)}` : ''}</span></span>
      ${cp.used ? chip({ kind: 'mute', icon: '✓', label: `Used ${cp.usedAt ? shortDate(ymd(new Date(cp.usedAt))) : ''}` }) : exp ? chip({ kind: 'mute', icon: '–', label: 'Expired' }) : chip({ kind: 'good', icon: '●', label: 'Ready' })}
      ${cp.used ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-act="delCoupon" data-c="${esc(c.id)}" data-id="${esc(cp.id)}">Remove</button>`}</li>`; }).join('')}</ul>`;
}
export function couponFields(c) {
  if (!c) return '';
  return `<fieldset class="field cp-set"><legend>Coupons</legend>${couponRows(c)}
    <div class="fgrid three">${field('Type', `<select id="m-cpkind" data-change="cpKind">${opt('amount', `${cur()} amount off`, true)}${opt('percent', 'Percent off')}${opt('service', 'Free service')}</select>`, 'm-cpkind')}
      <div id="cp-v">${field(`Amount (${cur()})`, '<input id="m-cpval" inputmode="decimal" placeholder="e.g. 100">', 'm-cpval')}</div>
      ${field('Valid until (optional)', `<input id="m-cpexp" type="date" min="${today()}">`, 'm-cpexp')}</div>
    ${field('Reason (the client sees it)', '<input id="m-cpnote" maxlength="80" placeholder="e.g. Sorry for the long wait, Thank you for referring a friend">', 'm-cpnote')}
    <div class="row"><button type="button" class="btn btn-sm btn-primary" data-act="giveCoupon" data-id="${esc(c.id)}">Give coupon</button><span class="muted small">Used once, at checkout. It shows on their “My visits” page.</span></div></fieldset>`;
}

Object.assign(ACT, {
  pgGo(el) { const st = PG[el.dataset.k]; if (!st) return; st.page = +el.dataset.p; applyPaging(); const pg = el.closest('.pager'), host = pg && pg.previousElementSibling; if (host && host.getBoundingClientRect().top < 0) host.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
  ddClear(el) { (DD_CLEAR[el.dataset.k] || (() => {}))(); render(); },
  async giveCoupon(el) {
    const c = S.customers.find(x => x.id === el.dataset.id); if (!c) return;
    const kind = $('#m-cpkind').value, note = $('#m-cpnote').value.trim(), expires = $('#m-cpexp').value || '';
    const raw = kind === 'service' ? $('#m-cpsvc').value : $('#m-cpval').value, value = kind === 'service' ? 0 : num(raw);
    if (kind !== 'service' && !(value > 0)) { toast('Enter how much the coupon is worth.', 'bad'); $('#m-cpval')?.focus(); return; }
    if (kind === 'percent' && value > 100) { toast('A percent coupon can’t be more than 100%.', 'bad'); return; }
    const cp = { id: 'cp' + Date.now().toString(36), kind, value: round2(value), ...(kind === 'service' ? { svcId: raw } : {}), note, expires, at: Date.now(), by: meName(), used: false };
    if (await patch('customers', c.id, { coupons: [...(c.coupons || []), cp] })) { logAct('client', `Gave ${c.name} a coupon: ${cpLabel(cp)}${note ? ` (${note})` : ''}${expires ? `, until ${fmtDate(expires)}` : ''}`); toast(`Coupon given to ${c.name}`); setTimeout(() => { const n = S.customers.find(x => x.id === c.id); if (n && MODAL.cur) clientModal(n); }, 250); }
  },
  async delCoupon(el) {
    if (!armed(el)) return; const c = S.customers.find(x => x.id === el.dataset.c); if (!c) return; const cp = (c.coupons || []).find(x => x.id === el.dataset.id);
    if (await patch('customers', c.id, { coupons: (c.coupons || []).filter(x => x.id !== el.dataset.id) })) { logAct('client', `Removed ${c.name}'s coupon: ${cp ? cpLabel(cp) : ''}`); toast('Coupon removed'); setTimeout(() => { const n = S.customers.find(x => x.id === c.id); if (n && MODAL.cur) clientModal(n); }, 250); }
  },
  posCoupon(el) {
    const p = S.pos, c = matchCustomer(p.name, p.phone), cp = c && liveCoupons(c).find(x => x.id === el.dataset.id); if (!cp) return;
    if (cp.kind === 'service') { const sv = svcById(cp.svcId); if (sv && !p.lines.some(l => l.kind === 'service' && l.ref === sv.id)) p.lines.push({ kind: 'service', ref: sv.id, name: sv.name, price: Number(sv.price) || 0, qty: 1 }); }
    const amt = couponAmount(cp, posTotals(p), p);
    p.discount = String(amt); p.discountNote = `Coupon: ${cpLabel(cp)}${cp.note ? ' (' + cp.note + ')' : ''}`; p.couponId = cp.id; p.couponCust = c.id;
    render();
  }
});
Object.assign(CHG, {
  pgSize(el) { try { localStorage.setItem('rb-pgsize', el.value); } catch (_) {} Object.values(PG).forEach(st => { st.page = 0; }); applyPaging(); },
  cpKind(el) { const v = el.value, box = $('#cp-v'); if (!box) return;
    box.innerHTML = v === 'service' ? field('Service', `<select id="m-cpsvc">${services().filter(sv => sv.active !== false).map(sv => opt(sv.id, `${sv.name} (${money(sv.price)})`)).join('')}</select>`, 'm-cpsvc') : field(v === 'percent' ? 'Percent off' : `Amount (${cur()})`, `<input id="m-cpval" inputmode="decimal" placeholder="${v === 'percent' ? 'e.g. 20' : 'e.g. 100'}">`, 'm-cpval'); }
});

// runs once, from admin.js, in the same order as before the split
export function init() {
  document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.fdd')) DD[d.dataset.dd] = d.open; }, true);
  document.addEventListener('click', e => { if (e.target.closest('details.fdd')) return; document.querySelectorAll('details.fdd[open]').forEach(d => { d.open = false; DD[d.dataset.dd] = false; }); });
  {
    let drag = null;
    document.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const w = e.target.closest('.tbl-wrap, .daystrip'); if (!w || w.scrollWidth <= w.clientWidth + 4) return;
      if (e.target.closest('button, a, input, select, textarea, label, summary')) return;
      drag = { w, x: e.clientX, left: w.scrollLeft, moved: false };
    });
    document.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; drag.w.classList.add('dragging'); }
      if (drag.moved) { drag.w.scrollLeft = drag.left - dx; e.preventDefault(); }
    });
    const end = () => { if (!drag) return; const d = drag; drag = null; d.w.classList.remove('dragging'); if (d.moved) { const stop = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 50); } };
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  }
}
