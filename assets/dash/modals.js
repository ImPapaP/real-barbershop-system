// Dashboard · Pop-up forms (modals).
import { DAYS, PRODUCT_FEE, ROLES, bdayDays, esc, fmtBday, fmtTime, lateFine, lateRateOf, priceLabel } from '../shared.js';
import { db, demo } from '../fb.js';
import { APPT, EXP_CATS, METHODS, S, STATUS_CHOICES } from './state.js';
import { $, activeServices, bdayField, bdayPromoText, bdayWhen, cur, custById, custOf, custStats, field, fmtDate, icon, info, kpi, loyaltyN, mark, methodName, money, normPhone, num, opt, paidIn, payExample, payLabel, payRule, payType, pol, services, serviceStaff, shortDate, staffName, today, usualBarber, ymd } from './core.js';
import { owedFor } from './money.js';
import { cpClose, payFormSync, siteUrl } from './setup.js';
import { loginFields } from './staffapp.js';
import { applyPaging, couponFields, cpLabel, liveCoupons } from './tables.js';

// ================= MODALS =================
// Pop-up boxes keep a trail: opening one from another (client → Edit client) lets "Back" return to the first.
// The phone's back button (and the browser's) closes or steps back too.
export const MODAL = { stack: [], cur: null, hist: false, skipPop: false, hash: '' };
export function drawModal() {
  const { title, body, wide } = MODAL.cur, m = $('#modal'), back = MODAL.stack.length ? MODAL.stack[MODAL.stack.length - 1].title : '';
  m.innerHTML = `<div class="scrim" data-act="scrim"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="modal-h"><button type="button" class="back-btn" data-act="modalBack" aria-label="${back ? 'Back to ' + esc(back) : 'Back'}">${icon('back')}<span>Back</span></button><h2 id="mt">${esc(title)}</h2><button type="button" class="icon-btn" data-act="closeModal" aria-label="Close">✕</button></div><div class="modal-b">${body}</div></div></div>`;
  m.hidden = false; applyPaging();
  const sf = m.querySelector('form[data-form=staff]'); if (sf) payFormSync(sf);
  // keyboard and screen readers: move focus into the pop-up (first field, else the pop-up itself)
  setTimeout(() => { const f = m.querySelector('.modal-b input:not([type=checkbox]):not([type=hidden]),.modal-b select,.modal-b textarea'); if (f) f.focus(); else { const d = m.querySelector('.modal'); if (d) { d.tabIndex = -1; d.focus(); } } }, 30);
}
// remember what opened the pop-up so focus can go back there when it closes
function rememberOpener() {
  const a = document.activeElement; if (!a || a === document.body || $('#modal').contains(a)) { MODAL.opener = null; return; }
  MODAL.opener = { el: a, act: a.dataset && a.dataset.act, id: a.dataset && a.dataset.id };
}
function restoreFocus() {
  const o = MODAL.opener; MODAL.opener = null; if (!o) return;
  setTimeout(() => {
    let el = o.el && o.el.isConnected ? o.el : null; // the page may have redrawn: find the same button again
    if (!el && o.act) el = document.querySelector(`[data-act="${CSS.escape(o.act)}"]${o.id ? `[data-id="${CSS.escape(o.id)}"]` : ''}`);
    if (el) el.focus({ preventScroll: true });
  }, 40);
}
// Tab and Shift+Tab stay inside the open pop-up
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return; const m = $('#modal'); if (!m || m.hidden) return;
  const f = [...m.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
  if (!f.length) return; const first = f[0], last = f[f.length - 1];
  if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && (document.activeElement === first || document.activeElement === m.querySelector('.modal'))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
export function openModal(title, body, wide) {
  const open = !$('#modal').hidden && MODAL.cur;
  if (open && MODAL.cur.title !== title) MODAL.stack.push(MODAL.cur);
  if (!open) { rememberOpener(); MODAL.stack = []; if (!MODAL.hist) { history.pushState({ rbModal: 1 }, ''); MODAL.hist = true; MODAL.hash = location.hash; } }
  MODAL.cur = { title, body, wide }; drawModal();
}
export function modalBack() { cpClose(); if (MODAL.stack.length) { MODAL.cur = MODAL.stack.pop(); drawModal(); } else closeModal(); }
// keepHist: we're navigating away, so don't step the browser back
export function closeModal(keepHist) {
  cpClose(); const m = $('#modal'); m.hidden = true; m.innerHTML = ''; MODAL.cur = null; MODAL.stack = []; restoreFocus();
  if (MODAL.hist) { MODAL.hist = false; if (keepHist === true) history.replaceState(null, ''); else { MODAL.skipPop = true; history.back(); } }
}
export const svcChecks = sel => { const groups = [...new Set(activeServices().map(s => s.cat || 'Services'))]; return groups.map(g => `<p class="eyebrow" style="margin:4px 0">${esc(g)}</p><div class="checks">${activeServices().filter(s => (s.cat || 'Services') === g).map(s => `<label class="check"><input type="checkbox" name="svc" value="${esc(s.id)}" ${(sel || []).includes(s.id) ? 'checked' : ''}>${esc(s.name)}<span class="p">${esc(priceLabel(s, cur()))}</span></label>`).join('')}</div>`).join(''); };
export const barberSelect = (name, sel, anyLabel) => `<select name="${name}" id="m-${name}">${anyLabel ? opt('', anyLabel, !sel) : ''}${serviceStaff().map(b => opt(b.id, b.name, b.id === sel)).join('')}</select>`;
export const mFoot = (label, extra) => `<div class="modal-f">${extra || ''}<button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">${esc(label)}</button></div>`;

export function apptModal(a, mode) {
  const c = a || {}, walk = mode === 'walkin' || c.source === 'walk-in', d = c.deposit || {};
  openModal(a ? 'Edit visit' : walk ? 'Add walk-in' : 'New booking', `<form class="stack" data-form="appt" data-id="${esc(c.id || '')}" data-mode="${mode}">
    ${c.status === 'needs_attention' ? '<p class="hint"><b>This client paid but lost the slot.</b> Pick a new time, set the status to Booked and save. Or refund the deposit in PayMongo and mark it refunded below.</p>' : ''}
    <div class="fgrid">${field('Client name', `<input id="m-name" name="name" data-cust role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cust-pop" value="${esc(c.name || '')}" autocomplete="off" required placeholder="${walk ? 'Saved as a client' : ''}">`, 'm-name')}${field('Phone', `<input id="m-phone" name="phone" inputmode="tel" value="${esc(c.phone || '')}" placeholder="Optional">`, 'm-phone')}</div>
    ${bdayField(c.birthday || (a ? (custOf(c) || {}).birthday : ''))}
    <fieldset class="field"><legend>Services</legend>${svcChecks(c.serviceIds)}</fieldset>
    <div class="fgrid${walk ? '' : ' three'}">${field('Barber', barberSelect('barberId', c.barberId, 'Any barber'), 'm-barberId')}
      ${walk ? '' : field('Date', `<input type="date" id="m-date" name="date" value="${esc(c.date || S.schedDate || today())}" required>`, 'm-date') + field('Time', `<input type="time" id="m-time" name="time" value="${esc(c.time || '')}" step="1800" required>`, 'm-time')}</div>
    ${a && !walk ? field('Status', `<select id="m-status" name="status">${(STATUS_CHOICES.includes(c.status) ? STATUS_CHOICES : [c.status, ...STATUS_CHOICES]).map(k => opt(k, APPT[k].label, k === c.status)).join('')}</select>`, 'm-status') : ''}
    ${d.status && d.status !== 'unpaid' ? field(`Online deposit (${money(d.amount)} via ${methodName(d.method)})`, `<select id="m-dep" name="deposit">${opt('paid', 'Paid · counts toward the bill', d.status === 'paid')}${opt('kept', 'Kept · no-show or late cancellation', d.status === 'kept')}${opt('refunded', 'Refunded in PayMongo', d.status === 'refunded')}</select>`, 'm-dep') : ''}
    ${field('Notes', `<textarea id="m-notes" name="notes" rows="2">${esc(c.notes || '')}</textarea>`, 'm-notes')}
    ${c.proof ? `<div class="field"><label>GCash screenshot</label><div class="row"><button type="button" class="btn btn-sm" data-act="viewProof" data-id="${esc(c.id)}">View screenshot</button><span class="muted small">${c.proof.status === 'approved' ? 'Approved' : c.proof.status === 'rejected' ? 'Rejected' : 'Waiting for you to check'}${c.proof.ref ? ` · Ref. ${esc(c.proof.ref)}` : ''}</span></div></div>` : ''}
    ${d.status === 'paid' && d.paymentId ? `<p class="muted small">Paid online through PayMongo · payment ${esc(d.paymentId)}</p>` : ''}
    ${a && c.status === 'done' ? cutField(c) : ''}
    ${walk ? '' : `<label class="row small"><input type="checkbox" name="notify" ${c.notify !== false ? 'checked' : ''}> Text the client reminders (needs a mobile number)</label>`}
    <p class="err" id="m-err" hidden></p>
    ${mFoot(a ? 'Save changes' : walk ? 'Add to queue' : 'Save booking', a ? `<button type="button" class="btn btn-danger" data-act="delAppt" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>` : '')}
  </form>`);
}
export function expenseModal(e) {
  const c = e || { date: today(), method: 'Cash' };
  openModal(e ? 'Edit expense' : 'Add expense', `<form class="stack" data-form="expense" data-id="${esc(c.id || '')}">
    <div class="fgrid">${field('Date', `<input type="date" id="m-edate" name="date" value="${esc(c.date)}" required>`, 'm-edate')}${field('Category', `<select id="m-ecat" name="cat">${EXP_CATS.map(x => opt(x, x, x === c.cat)).join('')}</select>`, 'm-ecat')}</div>
    ${field('Description', `<input id="m-edesc" name="desc" value="${esc(c.desc || '')}" placeholder="e.g. Meralco bill, October">`, 'm-edesc')}
    <div class="fgrid">${field('Amount (' + cur() + ')', `<input id="m-eamt" name="amount" inputmode="decimal" value="${esc(c.amount || '')}" required>`, 'm-eamt')}${field('Paid by', `<select id="m-emeth" name="method">${METHODS.map(x => opt(x, x, x === c.method)).join('')}</select>`, 'm-emeth')}</div>
    <p class="err" id="m-err" hidden></p>${mFoot(e ? 'Save changes' : 'Add expense')}</form>`);
}
export function cutField(c) {
  if (S.cutImgs[c.id] === undefined) { S.cutImgs[c.id] = ''; db.doc(`cuts/${c.id}`).get().then(d => { S.cutImgs[c.id] = d.exists ? d.data().img : 'none'; const el = document.getElementById('cut-' + c.id); if (el) el.outerHTML = cutField(c); }).catch(() => {}); }
  const img = S.cutImgs[c.id];
  return `<div class="field" id="cut-${esc(c.id)}"><label>Photo of the cut</label><div class="row">${img && img !== 'none' ? `<img class="cut-thumb" src="${esc(img)}" alt="Photo of the cut">` : ''}
    <label class="btn btn-sm upload">${S.uploading === 'cut-' + c.id ? '<span class="spinner"></span> Saving…' : img && img !== 'none' ? 'Replace photo' : 'Add photo'}<input type="file" accept="image/*" data-upload="cut-${esc(c.id)}" hidden></label>
    ${img && img !== 'none' ? `<button type="button" class="btn btn-sm btn-ghost" data-act="cutToGallery" data-id="${esc(c.id)}">Add to gallery</button>` : ''}</div>
    <p class="muted small">The client sees it on their booking page, so they can ask for the same cut next time.</p></div>`;
}
export function staffModal(b) {
  const c = b || { role: 'barber', payType: 'quota', rate: 40, dailyPay: 500, days: [0, 1, 2, 3, 4, 5, 6], groups: ['him'], tiers: ['regular'], active: true };
  const f = c.productFee || PRODUCT_FEE;
  openModal(b ? `Edit ${b.name}` : 'Add staff member', `<form class="stack staff-form" data-form="staff" data-id="${esc(c.id || '')}">
    <div class="fgrid">${field('Name', `<input id="m-sname" name="name" value="${esc(c.name || '')}" required>`, 'm-sname')}${field('Role', `<select id="m-srole" name="role">${Object.entries(ROLES).map(([k, l]) => opt(k, l, (c.role || 'barber') === k)).join('')}</select>`, 'm-srole')}</div>
    <div class="fgrid">${field('Title', `<input id="m-stitle" name="title" value="${esc(c.title || '')}" placeholder="Senior barber, Stylist">`, 'm-stitle')}${field('Phone', `<input id="m-sphone" name="phone" value="${esc(c.phone || '')}">`, 'm-sphone')}</div>
    <div class="svc-only">${field('Specialty (shown on website)', `<input id="m-sspec" name="specialty" value="${esc(c.specialty || '')}">`, 'm-sspec')}
      ${field('Short bio for their profile (optional)', `<textarea id="m-sbio" name="bio" rows="2" maxlength="300" placeholder="e.g. 8 years behind the chair. Known for clean skin fades and textured crops.">${esc(c.bio || '')}</textarea>`, 'm-sbio')}</div>
    <fieldset class="field pay-plan"><legend>How they’re paid</legend>
      <div class="seg-pick" role="radiogroup">${[['daily', 'Daily pay + commission', 'A set amount every day worked, plus their % of services'], ['quota', 'Daily minimum or commission', 'Whichever is higher; the shop tops up slow days'], ['monthly', 'Monthly salary', 'A fixed amount each month']].map(([k, l, d]) => `<label class="pp-opt"><input type="radio" name="payType" value="${k}" ${payType(c) === k ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
      <div class="fgrid">${field(payType(c) === 'quota' ? 'Daily minimum (₱)' : 'Daily pay (₱)', `<input id="m-sdaily" name="dailyPay" type="number" min="0" step="any" value="${esc(c.dailyPay ?? 0)}">`, 'm-sdaily')}${field('Monthly salary (₱)', `<input id="m-smonth" name="monthlyPay" type="number" min="0" step="any" value="${esc(c.monthlyPay ?? 0)}">`, 'm-smonth')}${field('Commission on their services (%)', `<input id="m-srate" name="rate" type="number" min="0" max="100" value="${esc(c.rate ?? 0)}">`, 'm-srate')}</div>
      <p class="hint pp-explain" id="pay-explain">${esc(payRule(c))}. ${esc(payExample(c))}</p>
      <p class="muted small" style="margin:0">Half of a forfeited down payment (late cancel, or over 20 minutes late) also goes to the barber of that booking.</p>
    </fieldset>
    <label class="row small svc-only"><input type="checkbox" id="m-snodep" name="noDeposit" ${c.noDeposit ? 'checked' : ''}> No down payment for online bookings with ${esc(c.name || 'this person')} (clients pay everything at the shop)</label>
    <fieldset class="field svc-only"><legend>Product fee</legend>
      <label class="row small"><input type="checkbox" name="pf" ${c.productFee ? 'checked' : ''}> On services that use salon products, the shop takes a fixed amount first, then the rest is split</label>
      <div class="fgrid three">${field('Service price from (₱)', `<input id="m-pft" name="pfThreshold" type="number" min="0" value="${esc(f.threshold)}">`, 'm-pft')}${field('Shop gets below that (₱)', `<input id="m-pfl" name="pfLow" type="number" min="0" value="${esc(f.low)}">`, 'm-pfl')}${field('Shop gets from that up (₱)', `<input id="m-pfh" name="pfHigh" type="number" min="0" value="${esc(f.high)}">`, 'm-pfh')}</div>
      <p class="muted small">Example with ₱50 / ₱100 at ₱1,500 and 55%: a ₱1,200 color → shop ₱50 first, then 55% of ₱1,150 = ₱632 for the stylist. Services without products are a straight split. Mark which services use products in Shop setup → Services.</p></fieldset>
    <fieldset class="field svc-only"><legend>Takes bookings for</legend><div class="row">${[['him', 'Men’s services'], ['her', 'Women’s services'], ['nails', 'Nails'], ['braids', 'Braids']].map(([k, l]) => `<label class="check"><input type="checkbox" name="groups" value="${k}" ${(c.groups || ['him']).includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div></fieldset>
    <fieldset class="field svc-only barber-only"><legend>Men’s haircuts they do</legend><div class="row">${[['deluxe', 'Deluxe (senior barber)'], ['regular', 'Regular']].map(([k, l]) => `<label class="check"><input type="checkbox" name="tiers" value="${k}" ${(c.tiers || []).includes(k) ? 'checked' : ''}>${l}</label>`).join('')}</div><p class="muted small">Online, clients can only book this barber for these haircuts. Add-ons work with either.</p></fieldset>
    <div class="fgrid">${field('Late deduction per 15 minutes (₱)', `<input id="m-slate" name="lateFine" type="number" min="0" step="1" value="${esc(c.lateFine ?? '')}" placeholder="${lateRateOf({ ...c, lateFine: null })}">`, 'm-slate')}${field('Time in by (empty = shop’s time)', `<input id="m-sshift" name="shiftStart" type="time" value="${esc(c.shiftStart || '')}">`, 'm-sshift')}</div>
    <fieldset class="field"><legend>Days in</legend><div class="row">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="check"><input type="checkbox" name="days" value="${d}" ${(c.days || []).includes(d) ? 'checked' : ''}>${DAYS[d]}</label>`).join('')}</div></fieldset>
    <p class="muted small support-only">Receptionists and maintenance staff don’t take bookings or earn commission. They get their daily pay for each day in (Schedule → Who’s in).</p>
    ${b ? `<label class="row small"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> Currently working here (unticked: hidden from the website and booking)</label>` : ''}
    ${loginFields(b)}
    <p class="err" id="m-err" hidden></p>${mFoot(b ? 'Save changes' : 'Add')}</form>`);
}
export function itemModal(i) {
  const c = i || { cat: 'Retail', stock: 0, reorder: 3, unit: 'pcs' };
  S.itemImg = c.photo || '';
  openModal(i ? 'Edit item' : 'Add item', `<form class="stack" data-form="item" data-id="${esc(c.id || '')}">
    ${field('Item name', `<input id="m-iname" name="name" value="${esc(c.name || '')}" required>`, 'm-iname')}
    <div class="fgrid three">${field('Type', `<select id="m-icat" name="cat">${opt('Retail', 'Retail (sold to clients)', c.cat === 'Retail')}${opt('Supply', 'Shop supply', c.cat === 'Supply')}</select>`, 'm-icat')}${field('Unit', `<input id="m-iunit" name="unit" value="${esc(c.unit || '')}" placeholder="pcs, box, bottle">`, 'm-iunit')}${field('Reorder at', `<input id="m-ireo" name="reorder" type="number" min="0" value="${esc(c.reorder)}">`, 'm-ireo')}</div>
    <div class="fgrid three">${field('In stock', `<input id="m-istock" name="stock" type="number" value="${esc(c.stock)}">`, 'm-istock')}${field('Cost each (' + cur() + ')', `<input id="m-icost" name="cost" inputmode="decimal" value="${esc(c.cost || '')}">`, 'm-icost')}${field('Selling price (' + cur() + ')', `<input id="m-iprice" name="price" inputmode="decimal" value="${esc(c.price || '')}">`, 'm-iprice')}</div>
    <div class="web-only stack">
      <label class="row small"><input type="checkbox" name="web" ${c.web ? 'checked' : ''}> <b>Show on the website</b> under “Our products” (name, price, photo, in stock or not)</label>
      ${field('Short description for the website', `<textarea id="m-idesc" name="webDesc" rows="2" maxlength="160" placeholder="e.g. Matte finish, strong hold. Washes out easily.">${esc(c.webDesc || '')}</textarea>`, 'm-idesc')}
      <div class="fgrid">${field('Tag (optional)', `<input id="m-itag" name="webTag" value="${esc(c.webTag || '')}" maxlength="18" placeholder="e.g. Best seller, New">`, 'm-itag')}
      <div class="field"><label>Photo</label><div class="row" id="it-img">${S.itemImg ? `<img class="cut-thumb" src="${esc(siteUrl(S.itemImg))}" alt="">` : ''}<label class="btn btn-sm upload">${S.itemImg ? 'Replace' : 'Add photo'}<input type="file" accept="image/*" data-upload="item" hidden></label></div></div></div>
    </div>
    <p class="err" id="m-err" hidden></p>${mFoot(i ? 'Save changes' : 'Add item', i ? `<button type="button" class="btn btn-danger" data-act="delItem" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
export function adjustModal(i, dir) {
  openModal(dir === 'in' ? `Receive ${i.name}` : `Use ${i.name}`, `<form class="stack" data-form="adjust" data-id="${esc(i.id)}" data-dir="${dir}">
    <p class="muted">Now in stock: <b style="color:var(--ink)">${i.stock} ${esc(i.unit || '')}</b></p>
    <div class="fgrid">${field('Quantity', `<input id="m-aqty" name="qty" type="number" min="1" value="1" required>`, 'm-aqty')}${field('Note', `<input id="m-anote" name="note" placeholder="${dir === 'in' ? 'Supplier, receipt no.' : 'Opened for chair 2'}">`, 'm-anote')}</div>
    ${dir === 'in' ? `<label class="row small"><input type="checkbox" name="expense" checked> Also record as a “Stock purchase” expense at ${money(i.cost || 0)} each</label>` : ''}
    ${(i.log || []).length ? `<div><p class="eyebrow" style="margin-bottom:6px">Recent changes</p><ul class="list small">${(i.log || []).slice(-5).reverse().map(l => `<li><span class="grow">${esc(l.note || '')}</span><span class="muted">${l.at ? fmtDate(ymd(new Date(l.at))) : ''}</span><b class="num ${l.delta > 0 ? 'up' : 'down'}">${l.delta > 0 ? '+' : ''}${l.delta}</b></li>`).join('')}</ul></div>` : ''}
    ${mFoot(dir === 'in' ? 'Add to stock' : 'Take from stock')}</form>`);
}
export function serviceModal(s) {
  const c = s || { cat: 'For him', group: 'him', mins: 60, active: true };
  const cats = [...new Set(services().map(x => x.cat).filter(Boolean))];
  openModal(s ? 'Edit service' : 'Add service', `<form class="stack" data-form="service" data-id="${esc(c.id || '')}">
    <div class="fgrid">${field('Service name', `<input id="m-vname" name="name" value="${esc(c.name || '')}" required>`, 'm-vname')}${field('Menu section', `<input id="m-vcat" name="cat" list="svc-cats" value="${esc(c.cat || '')}"><datalist id="svc-cats">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`, 'm-vcat')}</div>
    <div class="fgrid three">${field('For', `<select id="m-vgroup" name="group">${opt('him', 'Him', !c.group || c.group === 'him')}${opt('her', 'Her', c.group === 'her')}${opt('nails', 'Nails', c.group === 'nails')}${opt('braids', 'Braids', c.group === 'braids')}</select>`, 'm-vgroup')}${field('Price (' + cur() + ')', `<input id="m-vprice" name="price" inputmode="decimal" value="${esc(c.price ?? '')}" required>`, 'm-vprice')}${field('Minutes', `<input id="m-vmins" name="mins" type="number" min="30" step="30" value="${esc(c.mins)}">`, 'm-vmins')}</div>
    <div class="fgrid">${field('Booking type (men)', `<select id="m-vkind" name="kind">${opt('', 'Regular service', !c.kind)}${opt('base', 'Haircut (client picks one)', c.kind === 'base')}${opt('extra', 'Add-on to a haircut', c.kind === 'extra')}</select>`, 'm-vkind')}${field('Haircut level', `<select id="m-vtier" name="tier">${opt('', 'Any barber', !c.tier)}${opt('deluxe', 'Deluxe (senior barbers)', c.tier === 'deluxe')}${opt('regular', 'Regular barbers', c.tier === 'regular')}</select>`, 'm-vtier')}</div>
    ${field('Description', `<input id="m-vdesc" name="desc" value="${esc(c.desc || '')}">`, 'm-vdesc')}
    ${field('Included tags (optional, separate with commas)', `<input id="m-vperks" name="perks" value="${esc((c.perks || []).join(', '))}" placeholder="e.g. Shampoo and rinse included">`, 'm-vperks')}
    ${field('Options clients pick, one per line: name | extra price (optional)', `<textarea id="m-vopts" name="options" rows="3" placeholder="Regular polish | 30&#10;L’Oréal/Orly polish | 50">${esc((c.options || []).map(o => `${o.name} | ${o.add}`).join('\n'))}</textarea>`, 'm-vopts')}
    <label class="row small"><input type="checkbox" name="usesProduct" ${c.usesProduct ? 'checked' : ''}> Uses salon products (color, rebond, treatments): staff with a product fee give the shop that amount first</label>
    <label class="row small"><input type="checkbox" name="priceFrom" ${c.priceFrom ? 'checked' : ''}> Show as “from” price (final price depends on hair length)</label>
    <label class="row small"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> Show on website and at checkout</label>
    <p class="err" id="m-err" hidden></p>${mFoot(s ? 'Save changes' : 'Add service')}</form>`);
}
export function clientModal(c) {
  const x = c || {};
  openModal(c ? 'Edit client' : 'Add client', `<form class="stack" data-form="client" data-id="${esc(x.id || '')}">
    <div class="fgrid">${field('Name', `<input id="m-cname" name="name" value="${esc(x.name || '')}" required>`, 'm-cname')}${field('Phone', `<input id="m-cphone" name="phone" inputmode="tel" value="${esc(x.phone || '')}">`, 'm-cphone')}</div>
    ${bdayField(x.birthday)}
    ${field('Notes', `<textarea id="m-cnotes" name="notes" rows="3" placeholder="Usual cut, guard number, preferences">${esc(x.notes || '')}</textarea>`, 'm-cnotes')}
    <label class="row small"><input type="checkbox" name="noReminders" ${x.noReminders ? 'checked' : ''}> Don’t send this client “time for a trim” texts</label>
    ${couponFields(c)}
    <p class="err" id="m-err" hidden></p>${mFoot(c ? 'Save changes' : 'Add client', c ? `<button type="button" class="btn btn-danger" data-act="delClient" data-id="${esc(x.id)}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
export function clientDrawer(c) {
  const st = custStats()[c.id] || { visits: 0, spent: 0, last: '', barbers: {} }, N = loyaltyN();
  const hist = S.sales.filter(s => s.customerId === c.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const next = S.appointments.filter(a => (a.customerId === c.id || (c.phone && normPhone(a.phone) === normPhone(c.phone))) && a.date >= today() && a.status === 'booked').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  openModal(c.name, `<div class="stack">
    <div class="kpis">${kpi('Visits', st.visits)}${kpi('Spent', money(st.spent))}${kpi('Last visit', st.last ? shortDate(st.last) : '—')}</div>
    <p class="row"><b>${esc(c.phone || 'No phone')}</b>${c.email ? `<span class="muted">${esc(c.email)}</span>` : ''}${usualBarber(st) ? `<span class="muted">· Usually with ${esc(usualBarber(st))}</span>` : ''}</p>
    ${c.birthday ? (n => `<p class="${Math.abs(n) <= 7 ? 'hint' : 'muted small'}">Birthday: <b>${esc(fmtBday(c.birthday))}</b>${Math.abs(n) <= 7 ? ` · ${bdayWhen(n)}. ${esc(bdayPromoText())}` : ''}</p>`)(bdayDays(c.birthday, today())) : ''}
    ${N ? `<p class="hint">${(st.visits + 1) % N === 0 ? `<b>Next visit is free</b> (visit #${st.visits + 1}).` : `${N - ((st.visits + 1) % N)} more visit${N - ((st.visits + 1) % N) === 1 ? '' : 's'} after the next one to a free cut.`}</p>` : ''}
    ${next ? `<p class="note">Next booking: <b>${fmtDate(next.date)} at ${fmtTime(next.time)}</b> with ${esc(staffName(next.barberId))}</p>` : ''}
    ${c.notes ? `<div class="note">${esc(c.notes)}</div>` : ''}
    ${liveCoupons(c).length ? `<p class="hint"><b>Coupon${liveCoupons(c).length > 1 ? 's' : ''} ready:</b> ${liveCoupons(c).map(cp => esc(cpLabel(cp)) + (cp.note ? ` <span class="muted">(${esc(cp.note)})</span>` : '')).join(', ')}. Used at checkout.</p>` : ''}
    <div><p class="eyebrow" style="margin-bottom:6px">Visit history</p>${hist.length ? `<ul class="list pg">${hist.map(s => `<li><span class="t">${shortDate(s.date)}</span><span class="grow"><span>${esc((s.lines || []).map(l => l.name).join(', '))}</span><span class="sub" style="display:block">${esc(staffName(s.barberId))} · ${esc(payLabel(s))}</span></span><b class="num">${money(s.total)}</b></li>`).join('')}</ul>` : '<p class="empty">No visits recorded yet.</p>'}</div>
    <div class="modal-f"><button type="button" class="btn" data-act="editClient" data-id="${esc(c.id)}">Edit client</button><button type="button" class="btn btn-primary" data-act="checkoutClient" data-id="${esc(c.id)}">Start checkout</button></div>
  </div>`, true);
}
export function payModal(b) {
  const owed = owedFor(b.id);
  openModal(`Pay ${b.name}`, `<form class="stack" data-form="payout" data-id="${esc(b.id)}">
    <p class="muted">Owed now: <b style="color:var(--ink)">${money(owed, 1)}</b> (daily pay, commission and tips, minus earlier payouts)</p>
    <div class="fgrid">${field('Amount (' + cur() + ')', `<input id="m-pamt" name="amount" inputmode="decimal" value="${owed > 0 ? owed : ''}" required>`, 'm-pamt')}${field('Date paid', `<input type="date" id="m-pdate" name="date" value="${today()}">`, 'm-pdate')}</div>
    ${field('Note', `<input id="m-pnote" name="note" placeholder="e.g. Weekly pay, cash">`, 'm-pnote')}
    <p class="err" id="m-err" hidden></p>${mFoot('Record payout')}</form>`);
}
export const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
export const receiptUrl = s => new URL(`../receipt.html?id=${encodeURIComponent(s.id)}&t=${encodeURIComponent(s.rtoken)}`, location.href).href;
// How the receipt reaches the client: their booking page, a text, an email, or a link staff send themselves
export function receiptSend(s, fresh) {
  if (!s.rtoken) return `<div class="rc-send"><button type="button" class="btn btn-sm" data-act="rcMakeLink" data-id="${esc(s.id)}">Make a receipt link for the client</button></div>`;
  const appt = s.apptId ? S.appointments.find(a => a.id === s.apptId) : null, email = (appt && appt.email) || (custById(s.customerId) || {}).email || '';
  const texts = pol().receiptTexts !== false && s.phone, sent = s.receiptSent || {};
  const items = [appt && appt.token ? `<b aria-hidden="true">✓</b><span>On their booking page</span>` : '',
    texts ? `<b aria-hidden="true">✓</b><span>${fresh ? 'Texting' : sent.sms ? 'Texted' : 'Text to'} ${esc(s.phone)}</span>` : '',
    email ? `<b aria-hidden="true">✓</b><span>${fresh ? 'Emailing' : sent.email ? 'Emailed' : 'Email to'} ${esc(email)}</span>` : ''].filter(Boolean);
  const url = receiptUrl(s), sms = `sms:${encodeURIComponent(s.phone || '')}?body=${encodeURIComponent(`${info().shop.name || 'REAL Barbers'} receipt: ${url}`)}`;
  return `<div class="rc-send"><p class="eyebrow">Send to client</p>
    ${items.length ? `<ul class="rc-sent">${items.map(x => `<li>${x}</li>`).join('')}</ul>` : `<p class="muted small">No phone or email on this sale. Copy the link and send it on Messenger.</p>`}
    ${demo && fresh && (texts || email) ? '<p class="muted small">Demo: nothing is actually sent.</p>' : ''}
    <div class="row"><button type="button" class="btn btn-sm" data-act="rcCopy" data-url="${esc(url)}">Copy receipt link</button>${s.phone ? `<a class="btn btn-sm" href="${esc(sms)}">Text it from this phone</a>` : ''}<a class="btn btn-sm btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">Open</a></div></div>`;
}
export function receiptModal(s, fresh) {
  const shop = info().shop;
  openModal('Receipt', `<div class="receipt">
    <div style="justify-content:center;font:800 22px/1 var(--f-display);text-transform:uppercase">${esc(shop.wordmark || shop.name)}</div>
    <div style="justify-content:center" class="muted">${esc(shop.address)}</div>${shop.tin ? `<div style="justify-content:center" class="muted">TIN ${esc(shop.tin)}</div>` : ''}<hr>
    ${s.orNo ? `<div style="font-weight:700"><span>Official receipt</span><span>${esc(s.orNo)}</span></div>` : s.orPending ? `<div><span>Official receipt</span><span>Number given when back online</span></div>` : ''}
    <div><span>${fmtDate(s.date, true)}</span><span>${fmtTime(s.time)}</span></div>
    <div><span>Client</span><span>${esc(s.name || 'Walk-in')}</span></div><div><span>Barber</span><span>${esc(staffName(s.barberId))}</span></div><hr>
    ${(s.lines || []).map(l => `<div><span>${esc(l.name)}${l.qty > 1 ? ' ×' + l.qty : ''}</span><span>${money(l.price * l.qty, 1)}</span></div>`).join('')}<hr>
    ${s.discount ? `<div><span>Discount${s.discountNote ? ' (' + esc(s.discountNote) + ')' : ''}</span><span>${money(-s.discount, 1)}</span></div>` : ''}
    ${s.tip ? `<div><span>Tip</span><span>${money(s.tip, 1)}</span></div>` : ''}
    <div style="font-weight:700;font-size:16px"><span>TOTAL</span><span>${money(s.total, 1)}</span></div>
    ${s.depositCredit ? `<div><span>Deposit paid online</span><span>${money(-s.depositCredit, 1)}</span></div><div><span>Paid at shop (${esc(payLabel(s))})</span><span>${money(s.total - s.depositCredit, 1)}</span></div>` : `<div><span>Paid by</span><span>${esc(payLabel(s))}</span></div>`}
    ${s.cash ? `<div><span>Cash received</span><span>${money(s.cash, 1)}</span></div><div><span>Change</span><span>${money(s.cash - paidIn(s, 'Cash'), 1)}</span></div>` : ''}
    ${loyaltyLine(s)}
    <hr><div style="justify-content:center;flex-direction:column;align-items:center;text-align:center" class="muted">${esc(shop.tagline || 'Thank you!')}${shop.birPermit ? `<small>${esc(shop.birPermit)}</small>` : ''}</div>
  </div>${receiptSend(s, fresh)}<div class="modal-f" style="margin-top:14px"><button type="button" class="btn btn-primary" data-act="closeModal">Done</button></div>`);
}
export function loyaltyLine(s) {
  const N = loyaltyN(); if (!N || !s.customerId) return '';
  const visits = S.sales.filter(x => x.customerId === s.customerId && x.id !== s.id).length + 1, left = N - (visits % N);
  return `<hr><div style="justify-content:center;flex-direction:column;align-items:center;gap:6px"><span class="meter">${Array.from({ length: Math.min(N, 12) }, (_, i) => `<i class="${i < (visits % N || (visits ? N : 0)) ? 'on' : ''}"></i>`).join('')}</span><span>${visits % N === 0 ? 'Free visit used. A new loyalty card starts next time' : `Visit ${visits % N} of ${N} · ${left === 1 ? 'next visit is free' : left - 1 + ' more to a free cut'}`}</span></div>`;
}
export function modalErr(f, msg) { const e = f.querySelector('#m-err'); if (e) { e.textContent = msg; e.hidden = false; } }


// runs once, from admin.js, in the same order as before the split
export function init() {
  window.addEventListener('popstate', () => {
    if (MODAL.skipPop) { MODAL.skipPop = false; return; }
    if (!MODAL.hist) return;
    if (location.hash !== MODAL.hash) { MODAL.hist = false; closeModal(true); return; } // a link changed the page
    if (MODAL.stack.length) { MODAL.cur = MODAL.stack.pop(); drawModal(); history.pushState({ rbModal: 1 }, ''); }
    else { MODAL.hist = false; closeModal(true); }
  });
}
