// Dashboard · Button actions (data-act) and change handlers (data-change).
import { STARTER, STARTER_PRODUCTS, STARTER_STAFF, canServe, commissionFor, esc, fmtBday, fmtTime, isServiceStaff, phoneKey, publicBarber, startMs, sum, withOption } from '../shared.js';
import { bannerBlob } from '../banner.js';
import { buildXlsx } from '../xlsx.js';
import { call, db, deleteImage, logout, resetDemo, resetPassword, uploadImage } from '../fb.js';
import { ACT, APPT, CHG, S } from './state.js';
import { $, addDays, ago, armed, custById, del, delta, depositPaid, ensureCustomer, fmtDate, groupOf, info, loyaltyNow, money, NAV, newId, nowHM, num, parseYmd, patch, payLabel, periodRange, pol, put, render, round2, services, staffById, staffName, svcById, svcNames, toast, today, waitingWalkins, ymd } from './core.js';
import { blankPos, posTotals, splitOf } from './ops.js';
import { isOffline } from './offline.js';
import { exportRows, exportXlsx, fileBase, leaveModal, saveBlob } from './money.js';
import { BACKUP_COLS, allRecords, faqModal, happenModal, happenPreview, printPoster, promoModal, qrModal, reviewModal, walkinUrl } from './setup.js';
import { MODAL, adjustModal, apptModal, clientDrawer, clientModal, closeModal, expenseModal, itemModal, modalBack, newToken, openModal, payModal, receiptModal, serviceModal, staffModal } from './modals.js';
import { faqOwn, saveInfo, syncPublicBarbers } from './forms.js';
import { allowedTabs, logAct } from './access.js';
import { stopWatches } from './data.js';

// ================= ACTIONS =================
Object.assign(ACT, {
  resetDemo,
  scrim(el, e) { if (e.target === el) closeModal(); },
  closeModal,
  modalBack,
  pageBack() { if (NAV.length > 1) history.back(); else location.hash = '#' + allowedTabs()[0]; },
  async logout() { if (S.elevUntil) { S.elevUntil = 0; await call('pinLock').catch(() => {}); } stopWatches(); try { sessionStorage.removeItem('rb-in-' + (S.user && S.user.uid)); } catch (_) {} await logout(); },
  async forgot() { const email = $('#l-email')?.value.trim(); if (!email) { S.loginErr = 'Type your email first, then tap “Forgot password?”.'; render(); return; } try { await resetPassword(email); S.loginErr = ''; S.loginMsg = 'Password reset email sent. Check your inbox.'; } catch (e) { S.loginErr = 'Couldn’t send the reset email. Check the address.'; } render(); },
  newBooking() { apptModal(null, 'booking'); },
  newWalkin() { apptModal(null, 'walkin'); },
  async viewProof(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); if (!a) return;
    let img = S.proofImgs[a.id];
    if (!img) { try { const d = await db.doc(`proofs/${a.id}`).get(); img = S.proofImgs[a.id] = d.exists ? d.data().img : 'none'; } catch (_) { img = 'none'; } }
    const review = a.status === 'pending_payment' && a.proof && a.proof.status === 'review', ppl = groupOf(a).length;
    openModal(`Screenshot from ${a.name}`, `<div class="stack"><div class="proof-full">${img && img !== 'none' ? `<img src="${esc(img)}" alt="GCash screenshot from ${esc(a.name)}">` : '<p class="empty">No screenshot found.</p>'}</div>
      <div class="totals" style="font-size:14px"><div><span>Expected</span><b>${money((a.deposit && a.deposit.amount || pol().deposit) * ppl)}</b></div>${a.proof && a.proof.ref ? `<div><span>Reference no.</span><b>${esc(a.proof.ref)}</b></div>` : ''}<div><span>Booking</span><span>${fmtDate(a.date)} · ${fmtTime(a.time)} · ${esc(staffName(a.barberId))}</span></div><div><span>Sent</span><span>${a.proof ? ago(a.proof.at) : ''}</span></div></div>
      ${review ? `<p class="muted small">Check your GCash app for a payment with this amount and reference number before approving.</p><div class="modal-f"><button type="button" class="btn btn-danger" data-act="rejectProof" data-id="${esc(a.id)}" style="margin-right:auto">Reject</button><button type="button" class="btn" data-act="closeModal">Close</button><button type="button" class="btn btn-primary" data-act="approveProof" data-id="${esc(a.id)}">Approve and confirm booking</button></div>` : ''}</div>`, true);
  },
  async approveProof(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); if (!a) return;
    const now = Date.now(), dep = x => ({ ...(x.deposit || {}), amount: (x.deposit && x.deposit.amount) || pol().deposit, status: 'paid', method: 'gcash', paidAt: now, ref: (a.proof && a.proof.ref) || '', ...(x.id !== a.id ? { paidWith: a.id } : {}) });
    let ok = true;
    for (const x of groupOf(a)) ok = (await patch('appointments', x.id, { status: 'booked', deposit: dep(x), ...(x.id === a.id ? { proof: { ...a.proof, status: 'approved', decidedAt: now, by: (S.user && S.user.email) || '' } } : {}) })) && ok;
    if (ok) { closeModal(); toast(`${a.name}’s booking is confirmed. They’ll get a text and email.`); }
  },
  async rejectProof(el) {
    if (!armed(el)) return;
    const a = S.appointments.find(x => x.id === el.dataset.id); if (!a) return;
    const now = Date.now();
    for (const x of groupOf(a)) await patch('appointments', x.id, { status: 'cancelled', cancelledBy: 'shop', ...(x.id === a.id ? { proof: { ...a.proof, status: 'rejected', decidedAt: now, by: (S.user && S.user.email) || '' } } : {}) });
    closeModal(); toast('Rejected. The slot is open again and the client is told to call the shop.');
  },
  walkinQr() { qrModal(); },
  giveSlot(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id), q = waitingWalkins(); if (!a) return;
    const svcOk = w => { const b = staffById(a.barberId); return !b || !(w.serviceIds || []).length || canServe(b, (w.serviceIds || []).map(svcById).filter(Boolean)); };
    openModal('Give the slot to a walk-in', `<div class="stack"><p><b>${esc(a.name)}</b> was booked at ${fmtTime(a.time)} with ${esc(staffName(a.barberId))} and is ${Math.round((Date.now() - startMs(a.date, a.time)) / 60000)} minutes late. Pick who takes the chair:</p>
      <ul class="list">${q.map((w, i) => `<li><div class="grow"><b>#${esc(w.queueNo || '')} ${esc(w.name || 'Walk-in')}</b><div class="sub">${esc(svcNames(w.serviceIds) || 'Not sure yet')} · waiting ${Math.max(0, Math.round((Date.now() - (w.createdAt || Date.now())) / 60000))} min${svcOk(w) ? '' : ' · ' + esc(staffName(a.barberId)) + ' doesn’t do this service'}</div></div><button class="btn btn-sm ${i === 0 ? 'btn-primary' : ''}" data-act="giveSlotTo" data-id="${esc(a.id)}" data-w="${esc(w.id)}" ${svcOk(w) ? '' : 'disabled'}>Give to ${esc((w.name || 'walk-in').split(' ')[0])}</button></li>`).join('')}</ul>
      <p class="muted small">${esc(a.name)}’s booking is marked as missed${a.deposit && a.deposit.status === 'paid' ? ` and the ${money(a.deposit.amount)} down payment is kept` : ''}. If they still come, you can fit them in later as a walk-in.</p></div>`);
  },
  async giveSlotTo(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id), w = S.appointments.find(x => x.id === el.dataset.w); if (!a || !w) return;
    const dep = a.deposit && a.deposit.status === 'paid' ? { deposit: { ...a.deposit, status: 'kept' } } : {};
    const ok = await patch('appointments', a.id, { status: 'noshow', gaveToWalkin: w.id, ...dep }) && await patch('appointments', w.id, { barberId: a.barberId, status: 'inchair', tookSlotOf: a.id });
    if (ok) { closeModal(); toast(`${w.name || 'The walk-in'} is in ${staffName(a.barberId)}’s chair`); }
  },
  printQr() { printPoster(); },
  async copyQrLink() { try { await navigator.clipboard.writeText(walkinUrl()); toast('Link copied'); } catch (_) { toast(walkinUrl()); } },
  newPromo() { promoModal(null); },
  editPromo(el) { const x = S.promos.find(p => p.id === el.dataset.id); if (x) promoModal(x); },
  async delPromo(el) { if (!armed(el)) return; if (await del('promos', el.dataset.id)) { closeModal(); toast('Promo code deleted'); } },
  async showRating(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); if (!a || !a.rating) return;
    const parts = String(a.name || 'Client').trim().split(/\s+/), name = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    const list = [{ id: 'r_' + a.id, name, text: a.rating.text, rating: a.rating.stars, source: 'Booked online' }, ...(info().reviews || []).filter(r => r.id !== 'r_' + a.id)];
    if (await saveInfo({ reviews: list })) { toast('Showing on the website'); syncPublicBarbers(); }
  },
  async syncRatings() { await syncPublicBarbers(); toast('Barber ratings updated on the website'); },
  newFaq() { faqModal(-1); },
  newHappen() { happenModal(-1); setTimeout(happenPreview, 30); },
  editHappen(el) { happenModal(+el.dataset.i); setTimeout(happenPreview, 30); },
  async delHappen(el) { if (!armed(el)) return; const list = [...(info().happenings || [])]; list.splice(+el.dataset.i, 1); if (await saveInfo({ happenings: list })) { closeModal(); toast('Removed from the website'); } },
  async fbSync(el) {
    el.disabled = true; el.innerHTML = '<span class="spinner"></span> Syncing…';
    try { const r = await call('syncFacebookNow', {}); toast(r.ok ? `${r.count} photos pulled from Facebook` : 'Save the Page access token first.'); }
    catch (e) { toast(e.message || 'Couldn’t reach Facebook.', 'bad'); }
    S.fbCfg = undefined; render();
  },
  async dlBanner(el) {
    const h = (info().happenings || [])[+el.dataset.i]; if (!h) return;
    const blob = await bannerBlob(h, info().shop), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${(h.title || 'promo').replace(/[^\w]+/g, '-').toLowerCase()}-banner.png`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Banner downloaded. Post it on Facebook or Instagram.');
  },
  happenImgOff() { S.happenImg = ''; const w = document.getElementById('hp-img'); if (w) w.innerHTML = '<label class="btn btn-sm upload">Add picture<input type="file" accept="image/*" data-upload="happen" hidden></label>'; },

  editFaq(el) { faqModal(+el.dataset.i); },
  async delFaq(el) { if (!armed(el)) return; const list = faqOwn(); list.splice(+el.dataset.i, 1); if (await saveInfo({ faq: list })) { closeModal(); toast('Question removed'); } },
  async faqMove(el) { const list = faqOwn(), i = +el.dataset.i, j = i + (+el.dataset.d); if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; await saveInfo({ faq: list }); },
  async cutToGallery(el) {
    const img = S.cutImgs[el.dataset.id]; if (!img || img === 'none') return;
    try { const blob = await (await fetch(img)).blob(), up = await uploadImage(blob, 'gallery'), a = S.appointments.find(x => x.id === el.dataset.id);
      await saveInfo({ gallery: [{ id: newId(), url: up.url, path: up.path, caption: '', barberId: a ? a.barberId || '' : '' }, ...(info().gallery || [])] }); toast('Added to the gallery. Tag the style in Website.'); }
    catch (e) { toast(/^storage\//.test(e.code || '') ? 'Gallery uploads need Firebase Storage (Blaze plan, checklist part 2).' : 'Couldn’t add it. Try again.', 'bad'); }
  },
  editAppt(el) { const a = S.appointments.find(x => x.id === el.dataset.id); if (a) apptModal(a, 'edit'); },
  async delAppt(el) { if (!armed(el)) return; const a = S.appointments.find(x => x.id === el.dataset.id); if (await del('appointments', el.dataset.id)) { logAct('visit', `Deleted the visit of ${a ? a.name || 'a walk-in' : ''}${a ? ` (${fmtDate(a.date)}${a.time ? ' ' + fmtTime(a.time) : ''})` : ''}`); closeModal(); toast('Visit deleted'); } },
  dayShift(el) { S.schedDate = addDays(S.schedDate || today(), +el.dataset.n); render(); },
  dayToday() { S.schedDate = today(); render(); },
  dayPick(el) { S.schedDate = el.dataset.d; render(); },
  schedStatus(el) { S.schedStatus = S.schedStatus === el.dataset.v ? '' : el.dataset.v; render(); },
  schedClear() { Object.assign(S, { schedQ: '', schedStatus: '', schedSrc: '', schedBarber: '' }); render(); },
  async startAppt(el) { await patch('appointments', el.dataset.id, { status: 'inchair', startedAt: Date.now() }); },
  // Senior barber booking over 20 min late: the down payment is kept and the full price is owed for the barber's time
  lateFee(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); if (!a) return;
    const p = blankPos(); p.apptId = a.id; p.lateFee = true; p.name = a.name || ''; p.phone = a.phone || ''; p.barberId = a.barberId || '';
    p.deposit = 0; p.discountNote = '';
    p.lines = (a.serviceIds || []).map(svcById).filter(Boolean).map(s => withOption(s, a.options)).map(s => ({ kind: 'service', ref: s.id, name: `Late fee: ${s.name}`, price: s.price, qty: 1 }));
    S.pos = p; closeModal(true); location.hash = '#checkout';
  },
  // Came more than 20 min late but still got the cut: they pay the full price and the down payment isn't credited (kept, split with the barber)
  servedLate(el) {
    ACT.checkoutAppt(el); const p = S.pos; if (!p || p.apptId !== el.dataset.id) return;
    p.deposit = 0; p.servedLate = true; render();
  },
  async backupJson() {
    S.backingUp = true; render();
    try { const all = await allRecords(); saveBlob(new Blob([JSON.stringify(all, null, 1)], { type: 'application/json' }), `real-barbers-backup-${today()}.json`); toast(`Backup downloaded · ${BACKUP_COLS.reduce((n, c) => n + all[c].length, 0)} records`); }
    catch (e) { toast('Couldn’t make the backup. Try again.'); }
    S.backingUp = false; render();
  },
  async backupXlsx() {
    S.backingUp = true; render();
    try {
      const all = await allRecords(), H = t => ({ v: t, s: 'head' });
      const cust = [['Name', 'Phone', 'Email', 'Birthday', 'Notes', 'Added'].map(H), ...all.customers.map(c => [c.name || '', c.phone || '', c.email || '', c.birthday ? fmtBday(c.birthday) : '', c.notes || '', c.createdAt ? ymd(new Date(c.createdAt)) : ''])];
      const sal = [['Date', 'Time', 'Receipt no.', 'Client', 'Staff', 'Items', 'Discount', 'Tip', 'Total', 'Paid online', 'Payment', 'Commission'].map(H), ...all.sales.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).map(x => [x.date, x.time || '', x.orNo || '', x.name || 'Walk-in', staffName(x.barberId), (x.lines || []).map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(', '), { v: x.discount || 0, s: 'money' }, { v: x.tip || 0, s: 'money' }, { v: x.total || 0, s: 'money' }, { v: x.depositCredit || 0, s: 'money' }, payLabel(x), { v: x.commission || 0, s: 'money' }])];
      const bk = [['Date', 'Time', 'Code', 'Client', 'Phone', 'Email', 'Services', 'Staff', 'Status', 'How booked', 'Down payment'].map(H), ...all.appointments.sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || ''))).map(a => [a.date || '', a.time || '', a.code || '', a.name || '', a.phone || '', a.email || '', svcNames(a.serviceIds, a.options), a.anyBarber ? 'Any (to assign)' : staffName(a.barberId), (APPT[a.status] || {}).label || a.status || '', a.source || '', a.deposit ? `${a.deposit.amount || 0} ${a.deposit.status || ''}` : ''])];
      saveBlob(buildXlsx([{ name: 'Clients', cols: [24, 16, 26, 14, 30, 12], rows: cust, freeze: 'A2' }, { name: 'Sales', cols: [12, 8, 14, 22, 14, 40, 11, 9, 11, 12, 12, 12], rows: sal, freeze: 'A2' }, { name: 'Bookings', cols: [12, 8, 10, 22, 15, 24, 34, 16, 14, 12, 14], rows: bk, freeze: 'A2' }], { title: `${info().shop.name} records ${today()}`, author: info().shop.name }), `real-barbers-records-${today()}.xlsx`);
      toast('Excel file downloaded');
    } catch (e) { console.error(e); toast('Couldn’t make the file. Try again.'); }
    S.backingUp = false; render();
  },
  newLeave() { leaveModal(); },
  editLeave(el) { const l = (S.leaves || []).find(x => x.id === el.dataset.id); if (l) leaveModal(l); },
  async delLeave(el) { const l = (S.leaves || []).find(x => x.id === el.dataset.id); if (!l) return; if (await del('leaves', l.id)) { logAct('staff', `Removed ${l.paid ? 'paid' : 'unpaid'} leave for ${staffName(l.staffId)} (${fmtDate(l.from)})`); toast('Leave removed'); setTimeout(syncPublicBarbers, 400); } },
  async markRefunded(el) { const a = S.appointments.find(x => x.id === el.dataset.id); if (a && await patch('appointments', a.id, { deposit: { ...a.deposit, status: 'refunded', refundedAt: Date.now() } })) { logAct('void', `Marked ${money(a.deposit.amount)} down payment refunded to ${a.name}`); toast('Marked as refunded'); } },
  checkoutAppt(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); if (!a) return;
    const p = blankPos(); p.apptId = a.id; p.name = a.name || ''; p.phone = a.phone || ''; p.barberId = a.barberId || '';
    p.deposit = depositPaid(a); p.depositMethod = a.deposit && a.deposit.method;
    p.lines = (a.serviceIds || []).map(svcById).filter(Boolean).map(s => withOption(s, a.options)).map(s => ({ kind: 'service', ref: s.id, name: s.name, price: s.price, qty: 1 }));
    // products the client asked us to set aside on the website ("Set aside for me: Liquid Pomade ×2; Sea Salt Spray")
    const aside = /Set aside for me: ([^·]+)/.exec(a.notes || '');
    if (aside) aside[1].split(';').map(x => x.trim()).filter(Boolean).forEach(x => {
      const m2 = /^(.*?)(?: ×(\d+))?$/.exec(x), it = S.inventory.find(i => i.name.toLowerCase() === m2[1].trim().toLowerCase());
      if (it) p.lines.push({ kind: 'product', ref: it.id, name: it.name, price: Number(it.price) || 0, qty: Math.max(1, Math.min(+(m2[2] || 1), it.stock > 0 ? it.stock : 1)) });
    });
    if (a.promo) { p.discount = String(a.promo.off); p.discountNote = `Promo ${a.promo.code}`; }
    S.pos = p; closeModal(true); location.hash = '#checkout';
  },
  checkoutClient(el) { const c = custById(el.dataset.id); if (!c) return; const p = blankPos(); p.name = c.name; p.phone = c.phone || ''; S.pos = p; closeModal(true); location.hash = '#checkout'; },
  posPick(el) { S.pos.pick = el.dataset.v; render(); },
  posAdd(el) {
    const p = S.pos, kind = el.dataset.kind, ref = el.dataset.ref;
    const src = kind === 'service' ? svcById(ref) : S.inventory.find(i => i.id === ref); if (!src) return;
    const ex = p.lines.find(l => l.kind === kind && l.ref === ref);
    // a service is done once per ticket (no quantity); products can be more than one
    if (ex && kind === 'service') { toast(`${src.name} is already on the ticket`); return; }
    if (ex) ex.qty++; else p.lines.push({ kind, ref, name: src.name, price: Number(src.price) || 0, qty: 1 });
    render();
  },
  posQty(el) { const l = S.pos.lines[+el.dataset.i]; if (!l) return; l.qty = Math.max(1, l.qty + (+el.dataset.d)); render(); },
  posDel(el) { S.pos.lines.splice(+el.dataset.i, 1); render(); },
  posMethod(el) { S.pos.method = el.dataset.v; render(); },
  posDisc(el) {
    const p = S.pos, T = posTotals(p), v = el.dataset.v;
    if (v === 'sc') { p.discount = String(round2(T.sub * 0.2)); p.discountNote = 'Senior / PWD 20%'; }
    if (v === 'student') { p.discount = String(round2(T.sub * 0.1)); p.discountNote = 'Student 10%'; }
    if (v === 'free') { // the card's free service (Regular Haircut), else their priciest service
      const L = loyaltyNow(), sv = L && L.freeId ? svcById(L.freeId) : null;
      if (sv && !p.lines.some(l => l.kind === 'service' && l.ref === sv.id)) p.lines.push({ kind: 'service', ref: sv.id, name: sv.name, price: Number(sv.price) || 0, qty: 1 });
      p.discount = String(sv ? Number(sv.price) || 0 : Math.max(0, ...p.lines.filter(l => l.kind === 'service').map(l => l.price))); p.discountNote = `Loyalty: free ${sv ? sv.name : 'cut'}`;
    }
    if (v === 'loyal') { const L = loyaltyNow(), pct = L ? L.midPct : 0; p.discount = String(round2(sum(p.lines.filter(l => l.kind === 'service'), l => l.price * l.qty) * pct / 100)); p.discountNote = `Loyalty ${pct}% off (visit ${L ? L.midAt : ''})`; }
    if (v === 'bday') { // birthday promo: Signature Haircut (shampoo and rinse) at the Regular price
      const sv = svcById(pol().birthdaySvc || 'h8'); if (!sv) { toast('Set the birthday promo service in Shop setup'); return; }
      if (!p.lines.some(l => l.kind === 'service' && l.ref === sv.id)) p.lines.push({ kind: 'service', ref: sv.id, name: sv.name, price: Number(sv.price) || 0, qty: 1 });
      p.discount = String(Math.max(0, (Number(sv.price) || 0) - (Number(pol().birthdayPrice) || 0))); p.discountNote = `Birthday promo: ${sv.name} for ${money(pol().birthdayPrice || 0)}`;
    }
    render();
  },
  posClear() { S.pos = blankPos(); render(); },
  async posComplete(el) {
    const p = S.pos, T = posTotals(p); if (!p.lines.length || S.busy) return;
    if (p.lines.some(l => l.kind === 'service') && !p.barberId) { toast('Choose the barber first.', 'bad'); return; }
    const sp = p.method === 'Split' ? splitOf(p, T) : null; if (sp && !sp.ok) { toast(sp.why, 'bad'); return; }
    S.busy = true; el.disabled = true;
    try {
      const appt = p.apptId ? S.appointments.find(a => a.id === p.apptId) : null;
      const customerId = await ensureCustomer(p.name, p.phone, appt && appt.email, p.save || !!(appt && appt.birthday), appt && appt.birthday) || (appt && appt.customerId) || '';
      const b = staffById(p.barberId), rate = Number(b && b.rate) || 0;
      const { commission, fees: productFees } = commissionFor(b, p.lines, T.disc, svcById); // product fee first, then the split, rounded down
      const id = newId(), rtoken = newToken();
      // official receipt number, from the counter on the server so two phones never get the same one
      let orNo = '';
      const orLater = info().shop.orEnabled && isOffline(); // offline: the receipt number comes when the internet is back
      if (info().shop.orEnabled && !orLater) { try { const r = await call('nextReceiptNo', {}); orNo = `${info().shop.orPrefix || ''}${String(r.no).padStart(6, '0')}`; } catch (e) { toast('Couldn’t get a receipt number. The sale is saved without one.'); } }
      const sale = {
        date: today(), time: nowHM(), at: Date.now(), customerId, name: p.name.trim() || 'Walk-in', phone: p.phone.trim(), phoneKey: phoneKey(p.phone), barberId: p.barberId,
        lines: p.lines.map(l => ({ ...l, price: Number(l.price) || 0 })), svcTotal: T.svc, prodTotal: T.prod, discount: T.disc, discountNote: T.disc ? (p.discountNote || '') : '',
        tip: T.tip, total: T.total, depositCredit: T.deposit, ...(p.couponId && T.disc ? { couponId: p.couponId } : {}), method: p.method, cash: p.method === 'Cash' || sp ? num(p.cash) : 0, ...(sp ? { split: [{ m: 'Cash', amt: sp.cash }, { m: p.split2 || 'GCash', amt: sp.rest }] } : {}), apptId: p.apptId || '', rate, commission, productFees, rtoken, ...(orNo ? { orNo } : {}), ...(orLater ? { orPending: true } : {}), ...(p.lateFee ? { lateFee: true } : {}), ...(p.servedLate ? { servedLate: true } : {})
      };
      if (!await put('sales', id, sale)) return;
      for (const l of p.lines.filter(x => x.kind === 'product')) {
        const it = S.inventory.find(i => i.id === l.ref); if (!it) continue;
        await patch('inventory', it.id, { stock: (it.stock || 0) - l.qty, log: [...(it.log || []), { at: Date.now(), delta: -l.qty, note: `Sold to ${sale.name}` }].slice(-20) });
      }
      if (p.apptId && p.lateFee) { const la = S.appointments.find(x => x.id === p.apptId) || {}; await patch('appointments', p.apptId, { status: 'noshow', lateFeeSale: id, saleId: id, customerId: customerId || '', receipt: { id, t: rtoken }, ...(la.deposit && la.deposit.status === 'paid' ? { deposit: { ...la.deposit, status: 'kept' } } : {}) }); }
      else if (p.apptId) { const sa = S.appointments.find(x => x.id === p.apptId) || {}; await patch('appointments', p.apptId, { status: 'done', saleId: id, customerId: customerId || '', receipt: { id, t: rtoken }, ...(p.servedLate ? { servedLate: true, ...(sa.deposit && sa.deposit.status === 'paid' ? { deposit: { ...sa.deposit, status: 'kept' } } : {}) } : {}) }); }
      if (p.couponId && p.couponCust && T.disc) { const cc = S.customers.find(x => x.id === p.couponCust); if (cc) await patch('customers', cc.id, { coupons: (cc.coupons || []).map(x => x.id === p.couponId ? { ...x, used: true, usedAt: Date.now(), saleId: id } : x) }); }
      logAct('sale', `Rang up ${money(sale.total, 1)} for ${sale.name} · ${staffName(sale.barberId)} · ${payLabel(sale)}${sale.discount ? ` · ${money(sale.discount)} discount${sale.discountNote ? ' (' + sale.discountNote + ')' : ''}` : ''}${sale.orNo ? ' · ' + sale.orNo : ''}${sale.servedLate ? ' · served late' : ''}${sale.lateFee ? ' · late fee' : ''}`, { amount: sale.total, ref: id });
      S.pos = blankPos();
      toast(`Sale saved · ${money(sale.total, 1)}`); receiptModal({ id, ...sale }, true);
    } finally { S.busy = false; render(); }
  },
  async viewRef(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); if (!a) return; const rk = a.id + ':' + ((a.refPhoto && a.refPhoto.at) || ''); // a replaced photo gets a new key
    const show = img => openModal('Reference photo', `<div class="stack"><p><b>${esc(a.name || 'Walk-in')}</b> · ${a.source === 'walk-in' ? 'walk-in #' + esc(a.queueNo || '') : `${fmtDate(a.date)} ${fmtTime(a.time)}`} · ${esc(svcNames(a.serviceIds, a.options))} · ${esc(staffName(a.barberId))}</p>
      ${img ? `<img class="ref-full" src="${esc(img)}" alt="The cut ${esc(a.name || 'the client')} wants">` : img === false ? '<p class="muted">The client removed this photo.</p>' : '<p class="muted"><span class="spinner"></span> Loading…</p>'}${a.refPhoto && a.refPhoto.note ? `<p class="note">${esc(a.refPhoto.note)}</p>` : ''}
      <p class="muted small">Sent by the client with their booking. Only the shop can see it.</p></div>`, true);
    show(S.refImgs[rk]);
    if (!S.refImgs[rk]) { try { const d = await db.doc(`refs/${a.id}`).get(); S.refImgs[rk] = d.exists ? d.data().img : false; } catch (_) { S.refImgs[rk] = false; } if (MODAL.cur && MODAL.cur.title === 'Reference photo') show(S.refImgs[rk]); }
  },
  showSale(el) { const s = S.sales.find(x => x.id === el.dataset.id); if (s) receiptModal(s); },
  async rcMakeLink(el) { const s = S.sales.find(x => x.id === el.dataset.id); if (!s) return; const rtoken = newToken(); if (await patch('sales', s.id, { rtoken })) { if (s.apptId) await patch('appointments', s.apptId, { receipt: { id: s.id, t: rtoken } }); receiptModal({ ...s, rtoken }); } },
  async rcCopy(el) { try { await navigator.clipboard.writeText(el.dataset.url); toast('Receipt link copied'); } catch (_) { prompt('Copy this link', el.dataset.url); } },
  async voidSale(el) { if (!armed(el)) return; const s = S.sales.find(x => x.id === el.dataset.id); if (await del('sales', el.dataset.id)) { logAct('void', `Voided a ${money(s ? s.total : 0, 1)} sale for ${s ? s.name || 'Walk-in' : ''}${s ? ` (${fmtDate(s.date)} ${s.time ? fmtTime(s.time) : ''}, ${staffName(s.barberId)}, ${s.method || 'Cash'})` : ''}`); if (s && s.apptId) await patch('appointments', s.apptId, { status: 'inchair', saleId: '' }); toast('Sale voided. Product stock wasn’t changed back.'); } },
  period(el) { S.period = el.dataset.v; render(); },
  newExpense() { expenseModal(null); },
  editExpense(el) { const e = S.expenses.find(x => x.id === el.dataset.id); if (e) expenseModal(e); },
  async delExpense(el) { if (!armed(el)) return; const x = S.expenses.find(e => e.id === el.dataset.id); if (await del('expenses', el.dataset.id)) { logAct('money', `Deleted expense: ${x ? `${x.cat} ${money(x.amount, 1)} on ${fmtDate(x.date)}` : ''}`); toast('Expense deleted'); } },
  exportXlsx() { try { exportXlsx(); } catch (e) { console.error(e); toast('Couldn’t create the Excel file. Try CSV instead.'); } },
  exportCsv() {
    // Dates are written as text like "Thu 12 Nov 2026" so spreadsheet apps don't reformat them or show ####.
    const r = periodRange(S.period), { sales, exps } = exportRows(r);
    const dt = d => fmtDate(d, true).replace(',', '');
    const rows = [['Date', 'Time', 'Type', 'Client / description', 'Barber / category', 'Services', 'Products', 'Payment', 'Services', 'Products', 'Discount', 'Tip', 'Total', 'Paid online', 'Paid at shop', 'Commission']];
    for (const x of sales) rows.push([dt(x.date), x.time ? fmtTime(x.time) : '', x.type, x.client, x.barber, x.services, x.products, x.method, x.svc, x.prod, x.disc, x.tip, x.total, x.online, x.shop, x.comm]);
    for (const e of exps) rows.push([dt(e.date), '', 'Expense', e.desc, e.cat, '', '', e.method, '', '', '', '', -e.amount, '', '', '']);
    const csv = '\ufeff' + rows.map(row => row.map(v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\r\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileBase(r) + '.csv');
  },
  newStaff() { staffModal(null); },
  editStaff(el) { const b = staffById(el.dataset.id); if (b) staffModal(b); },
  payStaff(el) { const b = staffById(el.dataset.id); if (b) payModal(b); },
  async toggleIn(el) {
    const b = staffById(el.dataset.id), d = S.schedDate || today(); if (!b) return;
    const id = `${d}_${b.id}`, on = el.getAttribute('aria-pressed') === 'true', def = (b.days || []).includes(parseYmd(d).getDay());
    const ok = !on === def ? await del('attendance', id) : await put('attendance', id, { date: d, barberId: b.id, present: !on, at: Date.now() });
    if (ok) { logAct('staff', `Marked ${b.name} ${!on ? 'in' : 'absent'} on ${fmtDate(d)}`); toast(`${b.name}: ${!on ? 'in' : 'absent'} on ${fmtDate(d)}`); }
  },
  async delPayout(el) { if (!armed(el)) return; const p = S.payouts.find(x => x.id === el.dataset.id); if (await del('payouts', el.dataset.id)) { logAct('money', `Deleted a ${money(p ? p.amount : 0, 1)} payout to ${staffName(p && p.barberId)} (${p ? fmtDate(p.date) : ''})`); toast('Payout deleted'); } },
  newClient() { clientModal(null); },
  async remind(el) {
    S.reminding = el.dataset.id; render();
    try { const r = await call('sendTrimReminder', { customerId: el.dataset.id, lastVisit: el.dataset.last }); toast(r.sms || r.email ? `Reminder sent${r.sms ? ' by text' : ''}${r.sms && r.email ? ' and' : ''}${r.email ? ' email' : ''}` : 'Reminder recorded. Texts and emails aren’t connected yet.'); }
    catch (e) { toast(e.message || 'Couldn’t send the reminder.', 'bad'); }
    S.reminding = ''; render();
  },
  async delWait(el) { if (!armed(el)) return; if (await del('waitlist', el.dataset.id)) toast('Removed from the waitlist'); },
  openClient(el) { const c = custById(el.dataset.id); if (c) clientDrawer(c); },
  editClient(el) { const c = custById(el.dataset.id); if (c) clientModal(c); },
  async delClient(el) { if (!armed(el)) return; const c = S.customers.find(x => x.id === el.dataset.id); if (await del('customers', el.dataset.id)) { logAct('client', `Deleted client ${c ? c.name : ''}`); closeModal(); toast('Client deleted. Their past sales stay in reports.'); } },
  stockFilter(el) { S.stockFilter = el.dataset.v; render(); },
  newItem() { itemModal(null); },
  editItem(el) { const i = S.inventory.find(x => x.id === el.dataset.id); if (i) itemModal(i); },
  adjust(el) { const i = S.inventory.find(x => x.id === el.dataset.id); if (i) adjustModal(i, el.dataset.dir); },
  async delItem(el) { if (!armed(el)) return; if (await del('inventory', el.dataset.id)) { closeModal(); toast('Item deleted'); } },
  removeHero(el) { if (!armed(el)) return; const old = info().shop.heroPhotoPath; saveInfo({ shop: { ...info().shop, heroPhoto: '', heroPhotoPath: '' } }).then(ok => { if (ok) { deleteImage(old); toast('Homepage photo removed'); } }); },
  galMove(el) { const g = [...(info().gallery || [])], i = g.findIndex(x => x.id === el.dataset.id), j = i + (+el.dataset.d); if (i < 0 || j < 0 || j >= g.length) return; [g[i], g[j]] = [g[j], g[i]]; saveInfo({ gallery: g }); },
  async galDel(el) { if (!armed(el)) return; const g = info().gallery || [], x = g.find(y => y.id === el.dataset.id); if (await saveInfo({ gallery: g.filter(y => y.id !== el.dataset.id) })) { deleteImage(x && x.path); toast('Photo removed'); } },
  newReview() { reviewModal(null); },
  editReview(el) { const r = (info().reviews || []).find(x => x.id === el.dataset.id); if (r) reviewModal(r); },
  async delReview(el) { if (!armed(el)) return; if (await saveInfo({ reviews: (info().reviews || []).filter(x => x.id !== el.dataset.id) })) { closeModal(); toast('Review deleted'); } },
  newService() { serviceModal(null); },
  editService(el) { const s = svcById(el.dataset.id); if (s) serviceModal(s); },
  async delService(el) { if (!armed(el)) return; const sv = services().find(s => s.id === el.dataset.id); logAct('price', `Removed the service ${sv ? sv.name : ''}`); if (await saveInfo({ services: services().filter(s => s.id !== el.dataset.id) })) toast('Service removed. Past sales keep its name.'); },
  async initInfo(el) {
    el.disabled = true;
    const staff = S.staff.length ? S.staff : STARTER_STAFF;
    if (!S.staff.length) for (const b of STARTER_STAFF) { const { id, ...rest } = b; await put('staff', id, { ...rest, since: today() }); }
    // the shop's own products, ready to show on the website once the owner sets price and stock
    if (!S.inventory.length) for (const p of STARTER_PRODUCTS) await put('inventory', p.id, { name: p.name, cat: 'Retail', stock: 0, reorder: 3, cost: 0, price: p.price || 0, unit: p.unit, log: [], web: true, webDesc: `${p.size} · ${p.desc}`, webTag: p.tag, photo: p.photo });
    if (await put('public', 'info', { ...JSON.parse(JSON.stringify(STARTER)), barbers: staff.filter(b => b.active !== false && isServiceStaff(b)).map(publicBarber) })) toast('Starter menu and team saved. Edit them in Shop setup and Barbers.');
  }
});
Object.assign(CHG, {
  async apptStatus(el) {
    const a = S.appointments.find(x => x.id === el.dataset.id); const st = el.value; const upd = { status: st };
    // A visit only becomes "Done" through checkout, so every finished visit has a payment on record
    if (a && st === 'done' && !a.saleId) { el.value = a.status; toast('Ring up the payment to finish this visit.'); ACT.checkoutAppt({ dataset: { id: a.id } }); return; }
    if (a && a.deposit && ['noshow', 'cancelled'].includes(st) && a.deposit.status === 'paid') { upd['deposit.status'] = 'kept'; toast(`Deposit of ${money(a.deposit.amount)} marked as kept.`); }
    if (a && a.deposit && ['booked', 'waiting', 'inchair'].includes(st) && a.deposit.status === 'kept') upd['deposit.status'] = 'paid';
    if (await patch('appointments', el.dataset.id, upd) && a && ['noshow', 'cancelled'].includes(st)) logAct('visit', `Marked ${a.name || 'a walk-in'} ${st === 'noshow' ? 'no-show' : 'cancelled'} (${fmtDate(a.date)}${a.time ? ' ' + fmtTime(a.time) : ''}, ${staffName(a.barberId)})`);
  },
  async apptBarber(el) { await patch('appointments', el.dataset.id, { barberId: el.value }); },
  async assignBarber(el) { if (!el.value) return; const a = S.appointments.find(x => x.id === el.dataset.id); if (await patch('appointments', el.dataset.id, { barberId: el.value, anyBarber: false })) toast(`${staffName(el.value)} is doing ${(a && a.name) || 'this'}’s ${a && a.source === 'walk-in' ? 'visit' : 'booking'}`); }
});
