// Dashboard · Form submissions (data-form).
import { DAYS_LONG, STARTER, cleanCode, defaultFaq, fmtTime, isServiceStaff, lateFine, lateRateOf, phoneKey, publicBarber, startMs, sum, toMin } from '../shared.js';
import { FORM, S } from './state.js';
import { $, addDays, bdayFrom, delta, ensureCustomer, fmtDate, info, mark, matchCustomer, money, newId, nowHM, num, patch, payRule, payType, pol, put, render, round2, services, short, staffById, staffName, svcMins, toast, today } from './core.js';
import { MODAL, closeModal, modalErr } from './modals.js';
import { isBoss, logAct, meName } from './access.js';
import { closeDayModal, dayData } from './staffapp.js';

// ================= FORMS =================
export async function saveInfo(partial) {
  if (S.infoMissing) return put('public', 'info', { ...JSON.parse(JSON.stringify(STARTER)), ...partial });
  return patch('public', 'info', partial);
}
export const faqOwn = () => JSON.parse(JSON.stringify(Array.isArray(info().faq) && info().faq.length ? info().faq : defaultFaq(info())));
// Barbers on the website, with their average rating from booked clients
// Upcoming leave days, so the website doesn't offer those days (max 1 year, 200 days)
export function leaveDates(id) { const out = [], t = today(), end = addDays(t, 365); (S.leaves || []).filter(l => l.staffId === id && (l.to || l.from) >= t).forEach(l => { for (let d = l.from < t ? t : l.from; d <= (l.to || l.from) && d <= end && out.length < 200; d = addDays(d, 1)) out.push(d); }); return [...new Set(out)].sort(); }
export async function syncPublicBarbers() {
  if (!isBoss()) return;
  const rated = S.appointments.filter(a => a.rating && a.barberId);
  await saveInfo({ barbers: S.staff.filter(b => b.active !== false && isServiceStaff(b)).sort((a, b) => (a.chair || 99) - (b.chair || 99)).map(b => {
    const r = rated.filter(a => a.barberId === b.id);
    return publicBarber({ ...b, off: leaveDates(b.id), rating: r.length ? Math.round(sum(r, a => a.rating.stars) / r.length * 10) / 10 : 0, ratingCount: r.length });
  }) });
}
Object.assign(FORM, {
  async closing(f) {
    const fd = new FormData(f), d = f.dataset.date, v = k => { const x = String(fd.get(k) || '').trim(); return x === '' ? null : round2(num(x)); };
    const rec = { date: d, float: v('float') || 0, counted: v('counted'), note: String(fd.get('note') || '').trim(), at: Date.now(), by: meName() };
    if (await put('closings', d, rec)) {
      toast('Cash count saved');
      setTimeout(() => { const D = dayData(d); logAct('close', `Cash count for ${fmtDate(d)}: ${rec.counted == null ? 'not counted' : `counted ${money(rec.counted)}, expected ${money(D.expected)}${D.diff ? ` (${D.diff > 0 ? 'extra' : 'short'} ${money(Math.abs(D.diff))})` : ' (matches)'}`}`); if (f.dataset.close && MODAL.cur) closeDayModal(d); }, 300);
    }
  },
  async fb(f) {
    const fd = new FormData(f), token = String(fd.get('token') || '').trim(), pageId = String(fd.get('pageId') || '').trim();
    const show = fd.has('show'); let ok = true;
    if (token || pageId !== ((S.fbCfg || {}).pageId || '')) ok = await put('private', 'facebook', { ...(S.fbCfg || {}), ...(token ? { token } : {}), pageId, lastError: '' });
    if (ok && show !== (info().fbShow !== false)) ok = await saveInfo({ fbShow: show });
    if (ok) { S.fbCfg = undefined; toast(token ? 'Token saved. Tap “Sync now” to pull photos.' : 'Saved'); render(); }
  },
  async happen(f) {
    const fd = new FormData(f), i = +f.dataset.i, g = k => String(fd.get(k) || '').trim();
    if (!g('title')) return modalErr(f, 'Give it a title.');
    if (g('start') && g('end') && g('end') < g('start')) return modalErr(f, 'The end date is before the start date.');
    const link = g('link'); if (link && !/^https?:\/\//.test(link)) return modalErr(f, 'The link should start with https://');
    const list = [...(info().happenings || [])], old = i >= 0 ? list[i] : {};
    const h = { id: old.id || newId(), kind: g('kind') === 'event' ? 'event' : 'promo', title: g('title'), text: g('text'), start: g('start'), end: g('end'), code: g('code'), badge: g('badge'), link, linkLabel: g('linkLabel'), image: S.happenImg || '' };
    if (i >= 0) list[i] = h; else list.unshift(h);
    if (await saveInfo({ happenings: list })) { closeModal(); toast(i >= 0 ? 'Saved' : 'Posted on the website'); }
  },

  async promo(f) {
    const fd = new FormData(f), code = f.dataset.id || cleanCode(fd.get('code')), kind = String(fd.get('kind')), value = Math.max(0, num(fd.get('value')));
    if (!code || code.length < 3) return modalErr(f, 'Use at least 3 letters or numbers for the code.');
    if (!f.dataset.id && S.promos.some(x => x.id === code)) return modalErr(f, 'That code already exists.');
    if (!value || (kind === 'percent' && value > 100)) return modalErr(f, kind === 'percent' ? 'Enter a percent from 1 to 100.' : 'Enter the peso amount.');
    const old = S.promos.find(x => x.id === code) || {};
    const data = { code, kind, value, minSpend: Math.max(0, num(fd.get('minSpend'))), expires: String(fd.get('expires') || ''), maxUses: Math.max(0, parseInt(fd.get('maxUses'), 10) || 0), active: fd.has('active'), note: String(fd.get('note') || '').trim().slice(0, 80), uses: old.uses || 0 };
    if (await put('promos', code, data)) { closeModal(); toast(`${code} saved`); }
  },
  async faq(f) {
    const fd = new FormData(f), q = String(fd.get('q') || '').trim(), a = String(fd.get('a') || '').trim(), i = +f.dataset.i;
    if (!q || !a) return modalErr(f, 'Enter the question and the answer.');
    const list = faqOwn(); if (i >= 0) list[i] = { q, a }; else list.push({ q, a });
    if (await saveInfo({ faq: list })) { closeModal(); toast('FAQ saved'); }
  },
  async appt(f) {
    const fd = new FormData(f), mode = f.dataset.mode, id = f.dataset.id || newId();
    const name = String(fd.get('name') || '').trim(), phone = String(fd.get('phone') || '').trim(), svc = fd.getAll('svc');
    if (!name || name.toLowerCase() === 'walk-in') return modalErr(f, mode === 'walkin' ? 'Enter the walk-in’s name. They’re saved as a client so their visits count.' : 'Enter the client’s name.');
    const birthday = bdayFrom(fd);
    if ((fd.get('bm') ? 1 : 0) + (fd.get('bd') ? 1 : 0) === 1) return modalErr(f, 'Pick both the birthday month and day, or leave both empty.');
    if (!svc.length) return modalErr(f, 'Pick at least one service.');
    const custId = mode === 'edit' ? ((S.appointments.find(x => x.id === id) || {}).customerId || (matchCustomer(name, phone) || {}).id || '') : await ensureCustomer(name, phone, '', true, birthday);
    if (mode === 'edit' && custId && birthday) await patch('customers', custId, { birthday });
    const base = { name, phone, phoneKey: phoneKey(phone), ...(birthday ? { birthday } : {}), serviceIds: svc, mins: svcMins(svc), barberId: String(fd.get('barberId') || ''), notes: String(fd.get('notes') || '').trim(), customerId: custId || '' };
    if (fd.has('date')) { const t = String(fd.get('time')); if (t && toMin(t) % pol().step !== 0) return modalErr(f, `Use a time on the ${pol().step}-minute mark, like 2:00 or 2:30.`); }
    let ok;
    if (mode === 'walkin') {
      const qn = Math.max(0, ...S.appointments.filter(a => a.date === today() && a.source === 'walk-in').map(a => a.queueNo || 0)) + 1;
      ok = await put('appointments', id, { ...base, date: today(), time: nowHM(), status: 'waiting', source: 'walk-in', queueNo: qn, notify: false, createdAt: Date.now() });
      if (ok) toast(`${base.name} is #${qn} in the queue`);
    } else if (mode === 'edit') {
      const a = S.appointments.find(x => x.id === id) || {};
      const upd = { ...base, notify: fd.has('notify') };
      if (fd.has('date')) { upd.date = String(fd.get('date')); upd.time = String(fd.get('time')); upd.startAt = startMs(upd.date, upd.time); if (a.date !== upd.date || a.time !== upd.time) upd.reminders = {}; }
      if (fd.has('status')) upd.status = String(fd.get('status'));
      if (a.anyBarber) upd.anyBarber = upd.barberId === a.barberId; // picking someone else in Edit counts as assigning
      if (fd.has('deposit')) upd['deposit.status'] = String(fd.get('deposit'));
      ok = await patch('appointments', id, upd); if (ok) toast('Visit updated');
    } else {
      const date = String(fd.get('date')), time = String(fd.get('time'));
      if (!date || !time) return modalErr(f, 'Pick a date and time.');
      ok = await put('appointments', id, { ...base, date, time, startAt: startMs(date, time), status: 'booked', source: 'phone', notify: fd.has('notify') && !!phone, reminders: {}, createdAt: Date.now() });
      if (ok) { toast(`Booked ${base.name} · ${fmtDate(date)} ${fmtTime(time)}`); S.schedDate = date; }
    }
    if (ok) closeModal();
  },
  async expense(f) {
    const fd = new FormData(f), amt = num(fd.get('amount'));
    if (amt <= 0) return modalErr(f, 'Enter an amount above zero.');
    const data = { date: String(fd.get('date')), cat: String(fd.get('cat')), desc: String(fd.get('desc') || '').trim(), amount: round2(amt), method: String(fd.get('method')) };
    const ok = f.dataset.id ? await patch('expenses', f.dataset.id, data) : await put('expenses', newId(), { ...data, createdAt: Date.now() });
    if (ok) { logAct('money', `${f.dataset.id ? 'Changed' : 'Added'} expense: ${data.cat}${data.desc ? ' – ' + data.desc : ''} ${money(data.amount, 1)} (${data.method})`); closeModal(); toast(f.dataset.id ? 'Expense updated' : `Expense added · ${money(data.amount, 1)}`); }
  },
  async leave(f) {
    const fd = new FormData(f), from = String(fd.get('from') || ''), to = String(fd.get('to') || from), staffId = String(fd.get('staffId') || '');
    if (!staffId || !from) return modalErr(f, 'Pick the staff member and the first day.');
    if (to < from) return modalErr(f, '“To” is before “From”.');
    const data = { staffId, from, to, paid: fd.get('paid') === '1', note: String(fd.get('note') || '').trim(), at: Date.now() };
    const ok = f.dataset.id ? await patch('leaves', f.dataset.id, data) : await put('leaves', newId(), data);
    if (ok) { logAct('staff', `${f.dataset.id ? 'Changed' : 'Added'} ${data.paid ? 'paid' : 'unpaid'} leave for ${staffName(staffId)}: ${fmtDate(from)}${to !== from ? ' – ' + fmtDate(to) : ''}`); closeModal(); toast(`${data.paid ? 'Paid' : 'Unpaid'} leave saved for ${staffName(staffId)}`); setTimeout(syncPublicBarbers, 400); }
  },
  async staff(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim(), role = String(fd.get('role') || 'barber'), svcRole = isServiceStaff({ role });
    const rate = svcRole ? num(fd.get('rate')) : 0;
    if (!name) return modalErr(f, 'Enter a name.');
    if (rate < 0 || rate > 100) return modalErr(f, 'Commission must be between 0 and 100%.');
    const groups = svcRole ? fd.getAll('groups') : []; if (svcRole && !groups.length) return modalErr(f, 'Pick which services they take bookings for.');
    const shifts = {}; for (const d of [0, 1, 2, 3, 4, 5, 6]) if (fd.has('in-' + d)) { const a = String(fd.get('start-' + d) || ''), b = String(fd.get('end-' + d) || ''); if (!a || !b || toMin(b) <= toMin(a)) return modalErr(f, `${DAYS_LONG[d]}: the shift must end after it starts.`); shifts[d] = [a, b]; }
    const productFee = svcRole && fd.has('pf') ? { threshold: Math.max(0, num(fd.get('pfThreshold'))), low: Math.max(0, num(fd.get('pfLow'))), high: Math.max(0, num(fd.get('pfHigh'))) } : null;
    const data = { name, title: String(fd.get('title') || '').trim(), phone: String(fd.get('phone') || '').trim(), specialty: String(fd.get('specialty') || '').trim(), bio: String(fd.get('bio') || '').trim().slice(0, 300), role, rate, productFee, noDeposit: svcRole && fd.has('noDeposit'), dailyPay: Math.max(0, Number(fd.get('dailyPay')) || 0), payType: ['quota', 'monthly'].includes(fd.get('payType')) ? fd.get('payType') : 'daily', monthlyPay: Math.max(0, Number(fd.get('monthlyPay')) || 0), groups, tiers: svcRole ? fd.getAll('tiers') : [], chair: fd.get('chair') ? +fd.get('chair') : '', shifts, days: Object.keys(shifts).map(Number).sort(), lateFine: String(fd.get('lateFine') ?? '').trim() === '' ? null : Math.max(0, num(fd.get('lateFine'))), shiftStart: '' };
    const id = f.dataset.id, old = id ? staffById(id) : null;
    const ok = id ? await patch('staff', id, { ...data, active: fd.has('active') }) : await put('staff', newId(), { ...data, active: true, since: today() });
    if (ok) {
      const was = old ? payRule(old) : '', now = payRule({ ...old, ...data });
      logAct('staff', !old ? `Added ${name} (${now})` : was !== now ? `Changed ${name}'s pay: ${was} → ${now}` : (old.lateFine ?? '') !== (data.lateFine ?? '') ? `Changed ${name}'s late deduction to ${money(lateRateOf(data))} per 15 min` : `Edited ${name}`);
      closeModal(); toast(id ? `${name} updated` : `${name} added`); setTimeout(syncPublicBarbers, 400);
    }
  },
  async payout(f) {
    const fd = new FormData(f), amt = num(fd.get('amount')), bid = f.dataset.id;
    if (amt <= 0) return modalErr(f, 'Enter an amount above zero.');
    if (await put('payouts', newId(), { barberId: bid, amount: round2(amt), date: String(fd.get('date') || today()), note: String(fd.get('note') || '').trim(), createdAt: Date.now() })) { logAct('money', `Paid ${staffName(bid)} ${money(amt, 1)}`); closeModal(); toast(`Paid ${staffName(bid)} ${money(amt, 1)}`); }
  },
  async client(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim();
    if (!name) return modalErr(f, 'Enter a name.');
    const data = { name, phone: String(fd.get('phone') || '').trim(), phoneKey: phoneKey(fd.get('phone')), notes: String(fd.get('notes') || '').trim(), noReminders: fd.has('noReminders'), birthday: bdayFrom(fd) };
    if ((fd.get('bm') ? 1 : 0) + (fd.get('bd') ? 1 : 0) === 1) return modalErr(f, 'Pick both the birthday month and day, or leave both empty.');
    const ok = f.dataset.id ? await patch('customers', f.dataset.id, data) : await put('customers', newId(), { ...data, createdAt: Date.now() });
    if (ok) { closeModal(); toast(f.dataset.id ? 'Client updated' : `${name} added`); }
  },
  async item(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim();
    if (!name) return modalErr(f, 'Enter the item name.');
    const data = { name, cat: String(fd.get('cat')), unit: String(fd.get('unit') || '').trim(), reorder: Math.max(0, parseInt(fd.get('reorder'), 10) || 0), stock: parseInt(fd.get('stock'), 10) || 0, cost: round2(num(fd.get('cost'))), price: round2(num(fd.get('price'))),
      web: String(fd.get('cat')) === 'Retail' && fd.has('web'), webDesc: String(fd.get('webDesc') || '').trim().slice(0, 160), webTag: String(fd.get('webTag') || '').trim().slice(0, 18), photo: S.itemImg || '' };
    const ok = f.dataset.id ? await patch('inventory', f.dataset.id, data) : await put('inventory', newId(), { ...data, log: [] });
    if (ok) { closeModal(); toast(f.dataset.id ? 'Item updated' : `${name} added`); }
  },
  async adjust(f) {
    const fd = new FormData(f), i = S.inventory.find(x => x.id === f.dataset.id), q = parseInt(fd.get('qty'), 10) || 0;
    if (!i || q <= 0) return;
    const dir = f.dataset.dir, delta = dir === 'in' ? q : -q, note = String(fd.get('note') || '').trim() || (dir === 'in' ? 'Received' : 'Used in shop');
    if (await patch('inventory', i.id, { stock: (i.stock || 0) + delta, log: [...(i.log || []), { at: Date.now(), delta, note }].slice(-20) })) {
      if (dir === 'in' && fd.has('expense') && (i.cost || 0) > 0) await put('expenses', newId(), { date: today(), cat: 'Stock purchase', desc: `${i.name} ×${q}${note !== 'Received' ? ' · ' + note : ''}`, amount: round2(q * (i.cost || 0)), method: 'Cash', createdAt: Date.now() });
      closeModal(); toast(`${i.name}: ${(i.stock || 0) + delta} ${i.unit || ''} in stock`);
    }
  },
  async service(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim(), price = num(fd.get('price'));
    if (!name) return modalErr(f, 'Enter the service name.');
    if (price < 0) return modalErr(f, 'Enter a price.');
    const rawMins = parseInt(fd.get('mins'), 10); // 0 = an add-on done inside the same hour
    const mins = rawMins === 0 ? 0 : Math.max(pol().step, Math.round((rawMins || 60) / pol().step) * pol().step);
    const data = { name, cat: String(fd.get('cat') || '').trim() || 'Services', group: String(fd.get('group')), price: round2(price), mins, desc: String(fd.get('desc') || '').trim(), perks: String(fd.get('perks') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4), options: String(fd.get('options') || '').split('\n').map(l => l.split('|').map(x => x.trim())).filter(([n]) => n).slice(0, 6).map(([n, a], i) => ({ id: 'o' + (i + 1), name: n.slice(0, 40), add: Math.max(0, Number(String(a || '0').replace(/[^\d.]/g, '')) || 0) })), usesProduct: fd.has('usesProduct'), kind: String(fd.get('kind') || ''), tier: String(fd.get('tier') || ''), priceFrom: fd.has('priceFrom'), active: fd.has('active') };
    const list = services().map(s => ({ ...s }));
    if (f.dataset.id) { const k = list.findIndex(s => s.id === f.dataset.id); if (k >= 0) list[k] = { ...list[k], ...data }; } else list.push({ id: newId(), ...data });
    if (await saveInfo({ services: list })) { const was = f.dataset.id && services().find(s => s.id === f.dataset.id); logAct('price', was ? (was.price !== data.price ? `Changed the price of ${name}: ${money(was.price)} → ${money(data.price)}` : `Edited the service ${name}`) : `Added the service ${name} at ${money(data.price)}`); closeModal(); toast(f.dataset.id ? 'Service updated' : `${name} added`); }
  },
  async shop(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim();
    if (!name) { toast('Enter the shop name.', 'bad'); return; }
    const g = k => String(fd.get(k) || '').trim();
    const shop = { ...info().shop, name, wordmark: g('wordmark'), tagline: g('tagline'), about: g('about'), address: g('address'), phone: g('phone'), facebook: g('facebook'), instagram: g('instagram'), messenger: g('messenger'), directions: g('directions'), gcashNumber: g('gcashNumber'), gcashName: g('gcashName'), currency: g('currency') || '₱', loyaltyEvery: Math.max(0, parseInt(fd.get('loyaltyEvery'), 10) || 0), loyaltyMidAt: Math.max(0, parseInt(fd.get('loyaltyMidAt'), 10) || 0), loyaltyMidPct: Math.min(100, Math.max(0, num(fd.get('loyaltyMidPct')))), loyaltyFreeService: g('loyaltyFreeService'), legalName: g('legalName'), dpoName: g('dpoName'), dpoEmail: g('dpoEmail'), orEnabled: fd.has('orEnabled'), orPrefix: g('orPrefix'), tin: g('tin'), birPermit: g('birPermit'), ownerPhone: g('ownerPhone') };
    const orNext = parseInt(fd.get('orNext'), 10); if (orNext > 0) { await put('private', 'receipts', { next: orNext, at: Date.now() }); S.orNext = orNext; }
    if (shop.facebook && !/^https:\/\//.test(shop.facebook)) shop.facebook = 'https://' + shop.facebook.replace(/^http:\/\//, '');
    if (await saveInfo({ shop })) { logAct('price', 'Changed the shop details'); toast('Shop details saved'); }
  },
  async hours(f) {
    const fd = new FormData(f);
    const hours = [0, 1, 2, 3, 4, 5, 6].map(d => ({ d, open: String(fd.get('open-' + d) || '09:00'), close: String(fd.get('close-' + d) || '20:00'), closed: fd.has('closed-' + d) }));
    if (hours.some(h => !h.closed && toMin(h.close) <= toMin(h.open))) { toast('Closing time must be after opening time.', 'bad'); return; }
    if (await saveInfo({ hours })) { logAct('price', 'Changed the opening hours'); toast('Hours saved'); }
  },
  async special(f) { // holiday hours
    const fd = new FormData(f), date = String(fd.get('date') || ''), closed = fd.has('closed'), open = String(fd.get('open') || ''), close = String(fd.get('close') || ''), label = String(fd.get('label') || '').trim().slice(0, 40);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Pick the date.', 'bad'); return; }
    if (!closed && (!open || !close || toMin(close) <= toMin(open))) { toast('Closing time must be after opening time.', 'bad'); return; }
    const list = (info().specialHours || []).filter(x => x.date !== date).concat([closed ? { date, closed: true, label } : { date, open, close, label }]).sort((a, b) => a.date.localeCompare(b.date));
    if (await saveInfo({ specialHours: list })) { logAct('price', `Set ${date}${label ? ` (${label})` : ''}: ${closed ? 'closed' : `${open}–${close}`}`); toast('Holiday hours saved'); f.reset(); }
  },
  async announce(f) {
    const fd = new FormData(f), text = String(fd.get('text') || '').trim(); let link = String(fd.get('link') || '').trim();
    if (link && !/^https:\/\//.test(link)) link = 'https://' + link.replace(/^http:\/\//, '');
    if (await saveInfo({ announcement: { text, link, active: fd.has('active') && !!text } })) toast(fd.has('active') && text ? 'Announcement is showing on the website' : 'Announcement saved (hidden)');
  },
  async rating(f) {
    const fd = new FormData(f), r = String(fd.get('rating') || '').trim();
    if (await saveInfo({ shop: { ...info().shop, googleRating: r === '' ? '' : Math.min(5, Math.max(0, num(r))), googleCount: parseInt(fd.get('count'), 10) || 0, googleUrl: String(fd.get('url') || '').trim(), ratingSource: String(fd.get('source') || 'Google') } })) toast('Rating saved');
  },
  async review(f) {
    const fd = new FormData(f), name = String(fd.get('name') || '').trim(), text = String(fd.get('text') || '').trim();
    if (!name || !text) return modalErr(f, 'Enter the name and the review.');
    const list = [...(info().reviews || [])], data = { name, text, rating: +fd.get('rating'), source: String(fd.get('source')) };
    if (f.dataset.id) { const k = list.findIndex(x => x.id === f.dataset.id); if (k >= 0) list[k] = { ...list[k], ...data }; } else list.unshift({ id: newId(), ...data });
    if (await saveInfo({ reviews: list })) { closeModal(); toast('Review saved'); }
  },
  async policy(f) {
    const fd = new FormData(f), n = (k, min, max) => Math.min(max, Math.max(min, parseInt(fd.get(k), 10) || 0));
    const policy = { ...pol(), deposit: n('deposit', 100, 100000), holdMinutes: n('holdMinutes', 5, 60), rescheduleHours: n('rescheduleHours', 0, 168), lateMinutes: n('lateMinutes', 0, 120), lateMinutesDeposit: n('lateMinutesDeposit', 0, 120), cancelHours: n('cancelHours', 0, 336), leadMinutes: n('leadMinutes', 0, 1440), bookAheadDays: n('bookAheadDays', 1, 365), birthdayDays: n('birthdayDays', 0, 31), rebookDays: n('rebookDays', 0, 120), manualGcash: fd.has('manualGcash'), receiptTexts: fd.has('receiptTexts'), lastBooking: /^\d{2}:\d{2}$/.test(String(fd.get('lastBooking') || '')) ? String(fd.get('lastBooking')) : '', onlineBooking: fd.has('onlineBooking') };
    if (await saveInfo({ policy })) { logAct('price', 'Changed the online booking rules'); toast('Booking rules saved'); }
  }
});
