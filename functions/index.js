// REAL Barbers booking backend (Firebase Cloud Functions, 2nd gen).
//
// Booking lifecycle:
//   createBooking      website -> holds the slot(s) for 15 min, creates a PayMongo checkout
//   paymongoWebhook    PayMongo -> deposit paid: confirm booking, email + text the customer
//   expireHolds        every 5 min: unpaid holds expire and the slots open again
//   sendReminders      every 30 min: day-before email + text, 2-hour text
//   getBooking / rescheduleBooking / cancelBooking   the customer's booking link
//   syncSlots          keeps the public slot calendar in step with every appointment change,
//                      and texts waitlisted customers when a time frees up
//   joinWaitlist       website -> join the waitlist for a full day
//   sendRebookReminders daily: "time for a trim" text to clients last seen N days ago
//   sendTrimReminder   dashboard -> send that text to one client now
//   checkPromo         website -> check a promo code before booking
//   submitProof        booking link -> upload a GCash screenshot (pay-by-GCash bookings); the shop approves it
//   runningLate        booking link -> tell the shop you're running a few minutes late
//   rateVisit          booking link -> rate the visit after checkout
//   joinQueue          walk-in QR poster in the shop -> join today's walk-in queue (no deposit)
//   syncFacebookPhotos every 3 hours -> newest Facebook page photos into the website gallery
//   syncFacebookNow    dashboard -> the same, right away
//   staffLogin         owner -> create, change or remove a staff member's dashboard sign-in and access level
//   submitEvaluation  saves one system evaluation questionnaire (evaluate.html)
//   twoFaStatus / twoFaSend / twoFaVerify / twoFaForget  owner two-step sign-in (a code by email or text on a new device)
//   setPin / pinUnlock / pinLock  owner PIN: unlock owner-only actions on a receptionist or staff account until Lock or sign-out
//   clockPunch         staff phone, after scanning the shop's time-clock QR -> time in / time out
//   sendDaySummary     dashboard -> text the end-of-day summary to the owner
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import crypto from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import {
  validateRequest, policyOf, slotId, isActiveSlot, desiredSlots, slotStateFor, apptMins, startMs,
  verifyPaymongoSignature, rebookLink, newToken, tokenMatches, bookingCode, smsText, emailContent, eligibleBarbers,
  servicesById, blockTimes, phNow, addDays, normalizePhone, validEmail, parseSlotId, waitlistMatches,
  maskEmail, maskPhone, cleanEvaluation, promoCheck, cleanCode, validProofImage, cleanBday, receiptView, receiptSms, receiptEmail, queueItems, accountView, depositFor, cleanOptions, withOption, hasDeposit, lateLimit, refundOnCancel,
  lateFine, lateRateOf, shiftStartOf, roleOf, ACCESS, loyaltyFor, hoursFor
} from './src/core.js';
import { createCheckout, expireCheckout, sendSms, sendEmail } from './src/providers.js';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });

// ---------- configuration (see README: "Connect payments, SMS and email") ----------
const PAYMONGO_SECRET_KEY = defineSecret('PAYMONGO_SECRET_KEY');
const PAYMONGO_WEBHOOK_SECRET = defineSecret('PAYMONGO_WEBHOOK_SECRET');
const SEMAPHORE_API_KEY = defineSecret('SEMAPHORE_API_KEY');
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');
const SITE_URL = defineString('SITE_URL', { description: 'Your website address, e.g. https://realbarbers.web.app' });
const SHOP_EMAIL = defineString('SHOP_EMAIL', { description: 'Gmail address that sends emails and receives booking alerts' });
const SMS_SENDER_NAME = defineString('SMS_SENDER_NAME', { default: '', description: 'Approved Semaphore sender name (leave blank to use your default)' });
const PAYMENT_METHODS = defineString('PAYMENT_METHODS', { default: 'gcash,paymaya,card,qrph', description: 'Comma-separated PayMongo payment methods enabled on your account' });
const NOTIFY_SECRETS = [SEMAPHORE_API_KEY, GMAIL_APP_PASSWORD];

const site = () => SITE_URL.value().replace(/\/+$/, '');
const bookingLink = (id, token) => `${site()}/booking.html?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
const apptRef = id => db.doc(`appointments/${id}`);
const slotRef = id => db.doc(`slots/${id}`);

async function loadInfo() {
  const s = await db.doc('public/info').get();
  if (!s.exists) throw new HttpsError('failed-precondition', 'Online booking isn’t set up yet. Please call the shop.');
  return s.data();
}
const barberName = (info, id) => ((info.barbers || []).find(b => b.id === id) || {}).name || '';
// "Any barber" bookings show no name to the client until the shop assigns someone
const apptBarber = (info, a) => a.anyBarber ? '' : barberName(info, a.barberId);

// Details used in emails and texts.
function view(id, a, info) {
  return {
    id, code: a.code, name: a.name, phone: a.phone, email: a.email, date: a.date, time: a.time,
    barberName: apptBarber(info, a),
    serviceNames: servicesById(info, a.serviceIds).map(s => (s ? withOption(s, a.options).name : 'Service')),
    depositMethod: a.deposit && a.deposit.method, depositStatus: (a.deposit && a.deposit.status) || '', depositNone: !!(a.deposit && a.deposit.status === 'none')
  };
}

async function notify(kind, id, a, info, { sms = true, email = true, shop = null } = {}) {
  const v = view(id, a, info);
  const smsCfg = { apiKey: SEMAPHORE_API_KEY.value(), sender: SMS_SENDER_NAME.value() };
  const mailCfg = { user: SHOP_EMAIL.value(), pass: GMAIL_APP_PASSWORD.value(), fromName: (info.shop && info.shop.name) || 'Barbershop' };
  const results = {};
  if (sms && a.phone) results.sms = await sendSms(smsCfg, a.phone, smsText(kind, v, info));
  if (email && a.email && a.token) results.email = await sendEmail(mailCfg, a.email, emailContent(kind, v, info, bookingLink(id, a.token)));
  if (shop) results.shop = await sendEmail(mailCfg, SHOP_EMAIL.value(), emailContent(shop, v, info, `${site()}/r3al-hq-7m2k/#schedule`));
  await apptRef(id).update({ notices: FieldValue.arrayUnion({ at: Date.now(), kind, ...results }) }).catch(() => {});
  return results;
}

// Messages to people who aren't tied to one booking (trim reminders, waitlist).
async function sendTo(kind, person, info, link, { email = true } = {}) {
  const smsCfg = { apiKey: SEMAPHORE_API_KEY.value(), sender: SMS_SENDER_NAME.value() };
  const mailCfg = { user: SHOP_EMAIL.value(), pass: GMAIL_APP_PASSWORD.value(), fromName: (info.shop && info.shop.name) || 'Barbershop' };
  const out = {};
  if (person.phone) out.sms = await sendSms(smsCfg, normalizePhone(person.phone) || person.phone, smsText(kind, person, info));
  if (email && person.email) out.email = await sendEmail(mailCfg, person.email, emailContent(kind, person, info, link));
  return out;
}
async function isAdmin(req) {
  if (!req.auth) return false; const s = await db.doc(`admins/${req.auth.uid}`).get(); if (!s.exists) return false;
  return roleOf(s.data()) !== 'owner' || await twoOk(req); // the owner's account counts only after its two-step code
}

// Loyalty: completed visits for the client behind a booking (matched by customer id, then phone).
async function loyaltyOf(a, info) {
  if (!loyaltyFor(info, 0)) return null;
  let cid = a.customerId;
  if (!cid && a.phone) { const c = await db.collection('customers').where('phoneKey', '==', normalizePhone(a.phone)).limit(1).get(); cid = c.empty ? '' : c.docs[0].id; }
  const visits = cid ? (await db.collection('sales').where('customerId', '==', cid).count().get()).data().count : 0;
  return loyaltyFor(info, visits);
}

async function bookingFromToken(data) {
  const id = String(data && data.id || ''), token = String(data && data.token || '');
  if (!id || !token || id.includes('/')) throw new HttpsError('not-found', 'Booking not found.');
  const s = await apptRef(id).get();
  if (!s.exists || !tokenMatches(token, s.data().token || '')) throw new HttpsError('not-found', 'Booking not found. Check the link in your email.');
  return { id, a: s.data() };
}

// =============== website: create a booking ===============
export const createBooking = onCall({ secrets: [PAYMONGO_SECRET_KEY] }, async req => {
  const info = await loadInfo();
  const now = Date.now();
  const v = validateRequest(info, req.data, now);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const pol = v.policy;
  // Book for two: a second person with the same services or their own: same time with another barber, right
  // after with the same barber, or any day and time they choose. One checkout pays both deposits.
  const g = req.data && req.data.guest;
  let vg = null;
  if (g) {
    const gsvc = Array.isArray(g.serviceIds) && g.serviceIds.length ? g.serviceIds.slice(0, 10) : req.data.serviceIds; // their own services, or the same
    vg = validateRequest(info, { ...req.data, serviceIds: gsvc, name: g.name, barberId: g.barberId || '', date: g.date || req.data.date, time: g.time }, now);
    if (!vg.ok) throw new HttpsError('invalid-argument', `Second person: ${vg.error}`);
  }

  // Same client adding a service of another kind (e.g. nails with a haircut): one person, one down payment
  const sameClient = !!(vg && req.data.guest && req.data.guest.sameClient);
  // Pay online (PayMongo checkout) or send to the shop's GCash and upload a screenshot for the shop to check.
  const manual = req.data && req.data.payMethod === 'gcash' && !!(info.shop && info.shop.gcashNumber) && pol.manualGcash !== false;
  // Promo code: checked here again (the website check is only a preview). Comes off the bill at the shop.
  let promo = null;
  const code = cleanCode(req.data && req.data.promo);
  if (code) {
    const ps = await db.doc(`promos/${code}`).get();
    const total = [...servicesById(info, v.serviceIds), ...(vg ? servicesById(info, vg.serviceIds) : [])].reduce((t, x) => t + (x ? x.price : 0), 0);
    const r = promoCheck(ps.exists ? ps.data() : null, total, phNow(now).date);
    if (!r.ok) throw new HttpsError('invalid-argument', r.error);
    promo = { code, off: r.off, label: r.label };
  }

  // One unpaid booking per phone number at a time, so nobody can tie up the calendar.
  const open = await db.collection('appointments').where('phone', '==', v.phone).where('status', '==', 'pending_payment').get();
  if (open.docs.some(d => (d.data().holdUntil || 0) > now)) {
    throw new HttpsError('resource-exhausted', `You already have a booking waiting for payment. Finish paying, or try again in ${pol.holdMinutes} minutes.`);
  }

  // "Any barber": try the barbers with the fewest visits that day first, so it isn't always the first chair.
  // The booking is flagged anyBarber and the shop assigns the barber from the dashboard.
  const anyMain = !req.data.barberId, anyGuest = !!(vg && !(g && g.barberId));
  if (anyMain || anyGuest) {
    const day = await db.collection('appointments').where('date', 'in', [...new Set([v.date, vg ? vg.date : v.date])]).get();
    const load = {}; day.docs.forEach(x => { const a = x.data(); if (!['cancelled', 'expired', 'noshow'].includes(a.status)) load[`${a.date}|${a.barberId}`] = (load[`${a.date}|${a.barberId}`] || 0) + 1; });
    const byLoad = (date, list) => [...list].sort((p, q) => (load[`${date}|${p}`] || 0) - (load[`${date}|${q}`] || 0));
    if (anyMain) v.barbers = byLoad(v.date, v.barbers);
    if (anyGuest) vg.barbers = byLoad(vg.date, vg.barbers);
  }
  // Down payments: none for junior barbers (staff set to "no down payment"). An add-on for the same client
  // rides on the main booking's payment. With nothing to pay, the booking is confirmed straight away.
  const depMain = depositFor(info, req.data.barberId || '', servicesById(info, v.serviceIds));
  const depGuest = !vg ? 0 : sameClient ? (depMain ? 0 : depositFor(info, (g && g.barberId) || '', servicesById(info, vg.serviceIds))) : depositFor(info, (g && g.barberId) || '', servicesById(info, vg.serviceIds));
  const due = depMain + depGuest, free = due === 0;
  const id = db.collection('appointments').doc().id, gid = vg ? db.collection('appointments').doc().id : '';
  const token = newToken(), bcode = bookingCode();
  const holdUntil = now + (manual ? Math.max(pol.holdMinutes, 30) : pol.holdMinutes) * 60e3; // GCash transfers get 30 minutes
  const result = await db.runTransaction(async tx => {
    const refs = v.barbers.map(b => v.times.map(t => slotRef(slotId(b, v.date, t))));
    const grefs = vg ? vg.barbers.map(b => vg.times.map(t => slotRef(slotId(b, vg.date, t)))) : [];
    const uniq = [...new Map([...refs.flat(), ...grefs.flat()].map(r => [r.path, r])).values()];
    const snaps = await tx.getAll(...uniq);
    const busy = new Set(uniq.filter((r, i) => isActiveSlot(snaps[i].exists ? snaps[i].data() : null, now)).map(r => r.path));
    const pick = refs.findIndex(rs => rs.every(r => !busy.has(r.path)));
    if (pick < 0) return { taken: 'main' };
    refs[pick].forEach(r => busy.add(r.path));
    const gpick = vg ? grefs.findIndex(rs => rs.every(r => !busy.has(r.path))) : -1;
    if (vg && gpick < 0) return { taken: 'guest' };
    const b = v.barbers[pick];
    refs[pick].forEach((r, i) => tx.set(r, { barberId: b, date: v.date, time: v.times[i], state: free ? 'booked' : 'held', holdUntil: free ? 0 : holdUntil, bookingId: id }));
    tx.set(apptRef(id), {
      code: bcode, token, source: 'online', status: free ? 'booked' : 'pending_payment', notify: true, payMethod: free ? 'none' : manual ? 'gcash' : 'online', ...(promo ? { promo } : {}),
      name: v.name, phone: v.phone, email: v.email, notes: v.notes, customerId: '', ...(cleanBday(req.data.birthday) ? { birthday: cleanBday(req.data.birthday) } : {}),
      serviceIds: v.serviceIds, options: cleanOptions(info, v.serviceIds, req.data.options), mins: v.mins, date: v.date, time: v.time, startAt: v.at, barberId: b, ...(anyMain ? { anyBarber: true } : {}),
      blocks: refs[pick].map(r => r.id), holdUntil: free ? 0 : holdUntil, guests: gid ? [gid] : [],
      deposit: depMain ? { amount: depMain, status: 'unpaid' } : { amount: 0, status: 'none' }, reminders: {}, reschedules: 0, createdAt: now
    });
    if (vg) {
      const gb = vg.barbers[gpick];
      grefs[gpick].forEach((r, i) => tx.set(r, { barberId: gb, date: vg.date, time: vg.times[i], state: free ? 'booked' : 'held', holdUntil: free ? 0 : holdUntil, bookingId: gid }));
      tx.set(apptRef(gid), {
        code: bookingCode(), token: newToken(), source: 'online', status: free ? 'booked' : 'pending_payment', notify: false, groupOf: id, bookedBy: v.name, payMethod: free ? 'none' : manual ? 'gcash' : 'online', ...(sameClient ? { addOnOf: id } : {}),
        name: vg.name, phone: v.phone, email: v.email, notes: v.notes, customerId: '',
        serviceIds: vg.serviceIds, options: cleanOptions(info, vg.serviceIds, req.data.options), mins: vg.mins, date: vg.date, time: vg.time, startAt: vg.at, barberId: gb, ...(anyGuest ? { anyBarber: true } : {}),
        blocks: grefs[gpick].map(r => r.id), holdUntil: free ? 0 : holdUntil,
        deposit: depGuest ? { amount: depGuest, status: 'unpaid' } : { amount: 0, status: 'none' }, reminders: {}, reschedules: 0, createdAt: now
      });
    }
    if (promo) tx.set(db.doc(`promos/${promo.code}`), { uses: FieldValue.increment(1) }, { merge: true });
    return { barberId: b };
  });
  if (result.taken === 'main') throw new HttpsError('already-exists', 'Sorry, that time was just taken. Please pick another time.');
  if (result.taken === 'guest') throw new HttpsError('already-exists', 'Sorry, the second person’s slot was just taken. Pick another option for them.');
  const barberId = result.barberId, people = (depMain ? 1 : 0) + (depGuest ? 1 : 0);
  if (free) { // nothing to pay: confirmed now, so tell the client and the shop like a paid booking
    const a = (await apptRef(id).get()).data();
    await notify('confirmed', id, a, info, { shop: 'shop_new' }).catch(e => logger.error('Confirm message failed', e.message));
    return { id, token, checkoutUrl: `booking.html?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}&booked=1` };
  }
  if (manual) return { id, token, checkoutUrl: `booking.html?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}` };

  try {
    const shop = (info.shop && info.shop.name) || 'Barbershop';
    const link = bookingLink(id, token);
    const cs = await createCheckout(PAYMONGO_SECRET_KEY.value(), {
      amount: due,
      itemName: people > 1 ? `Booking deposits for 2 people · ${bcode}` : `Booking deposit · ${bcode}`,
      description: `${shop}: ${servicesById(info, v.serviceIds).map(s => s.name).join(', ')} with ${anyMain ? 'any available barber' : barberName(info, barberId)}, ${v.date} ${v.time}`,
      reference: id,
      methods: PAYMENT_METHODS.value().split(',').map(s => s.trim()).filter(Boolean),
      successUrl: `${link}&paid=1`,
      cancelUrl: `${link}&cancelled=1`,
      billing: { name: v.name, email: v.email, phone: v.phone }
    });
    await apptRef(id).update({ 'deposit.checkoutId': cs.id, checkoutUrl: cs.url });
    return { id, token, checkoutUrl: cs.url };
  } catch (e) {
    logger.error('Checkout creation failed', e.message);
    await apptRef(id).update({ status: 'expired', expiredReason: 'payment_setup_failed' });
    throw new HttpsError('unavailable', 'Online payment isn’t available right now. Please call the shop to book.');
  }
});

// =============== PayMongo: deposit paid ===============
export const paymongoWebhook = onRequest({ secrets: [PAYMONGO_WEBHOOK_SECRET, ...NOTIFY_SECRETS] }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
  const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  const sig = verifyPaymongoSignature(req.get('Paymongo-Signature'), raw, PAYMONGO_WEBHOOK_SECRET.value());
  if (!sig.ok) { logger.warn('Rejected webhook with bad signature'); res.status(401).send('Invalid signature'); return; }
  let evt;
  try { evt = JSON.parse(raw); } catch { res.status(400).send('Bad JSON'); return; }
  const type = evt && evt.data && evt.data.attributes && evt.data.attributes.type;
  if (type !== 'checkout_session.payment.paid') { res.status(200).send('Ignored'); return; }

  const cs = evt.data.attributes.data || {};
  const attrs = cs.attributes || {};
  const id = attrs.reference_number || (attrs.metadata && attrs.metadata.bookingId);
  const pay = (attrs.payments || [])[0] || {};
  const payAttrs = pay.attributes || {};
  const method = attrs.payment_method_used || (payAttrs.source && payAttrs.source.type) || 'online';
  const amount = payAttrs.amount ? payAttrs.amount / 100 : null;
  if (!id || String(id).includes('/')) { res.status(200).send('No booking reference'); return; }

  const outcome = await db.runTransaction(async tx => {
    const [s, infoSnap] = await tx.getAll(apptRef(id), db.doc('public/info'));
    if (!s.exists) return { kind: 'missing' };
    const a = s.data(), info = infoSnap.data();
    if (a.deposit && a.deposit.status === 'paid') return { kind: 'duplicate' };
    const slots = desiredSlots({ ...a, status: 'booked' }, info);
    const snaps = slots.length ? await tx.getAll(...slots.map(x => slotRef(x.id))) : [];
    const now = Date.now();
    const taken = snaps.some(x => x.exists && isActiveSlot(x.data(), now) && x.data().bookingId !== id);
    // A second person booked in the same checkout is confirmed (or flagged) together with this booking.
    const gsnaps = (a.guests || []).length ? await tx.getAll(...a.guests.map(apptRef)) : [];
    const guests = [];
    for (const gs of gsnaps) {
      if (!gs.exists) continue;
      const ga = gs.data(), gslots = desiredSlots({ ...ga, status: 'booked' }, info);
      const gss = gslots.length ? await tx.getAll(...gslots.map(x => slotRef(x.id))) : [];
      guests.push({ id: gs.id, a: ga, slots: gslots, taken: gss.some(x => x.exists && isActiveSlot(x.data(), now) && x.data().bookingId !== gs.id) });
    }
    // each booking keeps its own amount (a junior barber's booking in the same payment has none)
    const perPerson = guests.length ? (a.deposit && a.deposit.amount) : (amount ?? (a.deposit && a.deposit.amount));
    const deposit = { ...(a.deposit || {}), status: a.deposit && a.deposit.status === 'none' ? 'none' : 'paid', method, amount: perPerson, paidAt: now, checkoutId: cs.id || '', paymentId: pay.id || '', livemode: !!sig.livemode };
    for (const gx of guests) {
      const gnone = gx.a.deposit && gx.a.deposit.status === 'none';
      const gdep = { ...(gx.a.deposit || {}), status: gnone ? 'none' : 'paid', method, amount: gnone ? 0 : (gx.a.deposit && gx.a.deposit.amount) || perPerson, paidAt: now, checkoutId: cs.id || '', paidWith: id };
      if (gx.taken || ['cancelled', 'noshow', 'done'].includes(gx.a.status)) { tx.update(apptRef(gx.id), { deposit: gdep, status: 'needs_attention' }); continue; }
      gx.slots.forEach(x => tx.set(slotRef(x.id), { barberId: gx.a.barberId, date: gx.a.date, time: x.time, state: 'booked', holdUntil: 0, bookingId: gx.id }));
      tx.update(apptRef(gx.id), { deposit: gdep, status: 'booked', blocks: gx.slots.map(x => x.id) });
    }
    if (taken || ['cancelled', 'noshow', 'done'].includes(a.status)) {
      tx.update(apptRef(id), { deposit, status: 'needs_attention' });
      return { kind: 'slot_lost', a: { ...a, deposit }, info };
    }
    slots.forEach(x => tx.set(slotRef(x.id), { barberId: a.barberId, date: a.date, time: x.time, state: 'booked', holdUntil: 0, bookingId: id }));
    tx.update(apptRef(id), { deposit, status: 'booked', blocks: slots.map(x => x.id) });
    return { kind: 'confirmed', a: { ...a, deposit }, info };
  });

  if (outcome.kind === 'confirmed') await notify('confirmed', id, outcome.a, outcome.info, { shop: 'shop_new' });
  if (outcome.kind === 'slot_lost') await notify('slot_lost', id, outcome.a, outcome.info, { shop: 'shop_attention' });
  logger.info('Webhook handled', { id, outcome: outcome.kind });
  res.status(200).send('OK');
});

// =============== customer booking link ===============
function publicView(id, a, info) {
  const pol = policyOf(info), now = Date.now();
  const startAt = a.startAt || startMs(a.date, a.time);
  const services = servicesById(info, a.serviceIds).map(s => withOption(s, a.options));
  return {
    id, code: a.code, status: a.status, date: a.date, time: a.time, startAt, mins: a.mins,
    barberId: a.barberId, barberName: apptBarber(info, a), anyBarber: !!a.anyBarber,
    serviceIds: a.serviceIds, services: services.map(s => s ? { name: s.name, price: s.price, priceFrom: !!s.priceFrom } : { name: 'Service', price: 0 }),
    name: a.name, deposit: { amount: a.deposit && a.deposit.amount, status: a.deposit && a.deposit.status, method: a.deposit && a.deposit.method },
    holdUntil: a.holdUntil || 0,
    checkoutUrl: a.status === 'pending_payment' && (a.holdUntil || 0) > now ? a.checkoutUrl || '' : '',
    canReschedule: a.status === 'booked' && startAt - now >= pol.rescheduleHours * 3600e3 && (a.reschedules || 0) < pol.maxReschedules,
    canCancel: a.status === 'booked' && startAt > now,
    policy: { deposit: pol.deposit, rescheduleHours: pol.rescheduleHours, lateMinutes: lateLimit(a, pol), lateMinutesJunior: pol.lateMinutes, lateMinutesDeposit: pol.lateMinutesDeposit ?? 20, cancelHours: pol.cancelHours ?? 48, holdMinutes: pol.holdMinutes },
    payMethod: a.payMethod || 'online', proof: a.proof ? { status: a.proof.status, at: a.proof.at, note: a.proof.note || '' } : null,
    gcash: a.payMethod === 'gcash' ? { number: (info.shop && info.shop.gcashNumber) || '', name: (info.shop && info.shop.gcashName) || '' } : null,
    promo: a.promo || null, late: a.late || null, rating: a.rating || null, receipt: a.receipt && a.receipt.id ? { id: a.receipt.id, t: a.receipt.t } : null, refPhoto: a.refPhoto ? { at: a.refPhoto.at, note: a.refPhoto.note || '' } : null, groupOf: a.groupOf || '', source: a.source || 'online', gaveToWalkin: !!a.gaveToWalkin
  };
}
// Live queue on the day: clients still ahead of you with the same barber (or, for walk-ins, in the queue).
async function queueFor(a) {
  if (a.source === 'walk-in' && a.status === 'waiting' && a.date === phNow().date) {
    const q = await db.collection('appointments').where('date', '==', a.date).where('status', '==', 'waiting').get();
    return { walkin: true, queueNo: a.queueNo || 0, ahead: q.docs.filter(d => d.data().source === 'walk-in' && (d.data().queueNo || 0) < (a.queueNo || 0)).length, at: Date.now() };
  }
  if (a.status !== 'booked' || a.date !== phNow().date || !a.barberId) return null;
  const q = await db.collection('appointments').where('date', '==', a.date).where('barberId', '==', a.barberId).get();
  const mine = a.startAt || startMs(a.date, a.time);
  const rows = q.docs.map(d => d.data());
  const ahead = rows.filter(x => ['booked', 'waiting', 'inchair'].includes(x.status) && (x.startAt || startMs(x.date, x.time || '00:00')) < mine).length;
  return { ahead, inChair: rows.some(x => x.status === 'inchair'), at: Date.now() };
}

export const getBooking = onCall(async req => {
  const { id, a } = await bookingFromToken(req.data);
  const info = await loadInfo();
  const guests = [];
  for (const gid of a.guests || []) {
    const gs = await apptRef(gid).get(); if (!gs.exists) continue;
    const ga = gs.data();
    guests.push({ id: gid, token: ga.token, name: ga.name, status: ga.status, date: ga.date, time: ga.time, barberName: apptBarber(info, ga), services: servicesById(info, ga.serviceIds).filter(Boolean).map(x => withOption(x, ga.options).name), addOn: !!ga.addOnOf, prices: servicesById(info, ga.serviceIds).filter(Boolean).map(x => { const o = withOption(x, ga.options); return { name: o.name, price: o.price, priceFrom: !!x.priceFrom }; }) });
  }
  const cut = a.status === 'done' ? await db.doc(`cuts/${id}`).get() : null;
  return { ...publicView(id, a, info), loyalty: await loyaltyOf(a, info), guests, rebook: rebookLink('.', a, info), queue: await queueFor(a), cutPhoto: cut && cut.exists ? cut.data().img || '' : '' };
});

// =============== promo codes ===============
export const checkPromo = onCall(async req => {
  const info = await loadInfo(), code = cleanCode(req.data && req.data.code);
  if (!code) throw new HttpsError('invalid-argument', 'Type a promo code.');
  const ids = [...(Array.isArray(req.data.serviceIds) ? req.data.serviceIds : []), ...(Array.isArray(req.data.guestServiceIds) ? req.data.guestServiceIds : [])].slice(0, 20);
  const total = servicesById(info, ids).reduce((t, x) => t + (x ? x.price : 0), 0);
  const ps = await db.doc(`promos/${code}`).get();
  const r = promoCheck(ps.exists ? ps.data() : null, total, phNow().date);
  if (!r.ok) throw new HttpsError('invalid-argument', r.error);
  return { code, off: r.off, label: r.label };
});

// =============== pay by GCash: the customer uploads a screenshot, the shop checks it ===============
export const submitProof = onCall({ secrets: NOTIFY_SECRETS }, async req => {
  const { id, a } = await bookingFromToken(req.data);
  const info = await loadInfo(), now = Date.now();
  if (a.payMethod !== 'gcash') throw new HttpsError('failed-precondition', 'This booking is paid online.');
  if (a.status !== 'pending_payment') throw new HttpsError('failed-precondition', a.status === 'booked' ? 'This booking is already confirmed.' : 'This booking can’t take a payment anymore. Please book again.');
  if (!(a.proof && a.proof.status === 'review') && (a.holdUntil || 0) < now) throw new HttpsError('deadline-exceeded', 'The time to send your payment ran out and the slot was released. Please book again.');
  const img = req.data && req.data.image, ref = String(req.data && req.data.ref || '').replace(/[^\w\s-]/g, '').slice(0, 40);
  if (!validProofImage(img)) throw new HttpsError('invalid-argument', 'Upload a screenshot of your GCash payment (JPG or PNG).');
  const startAt = a.startAt || startMs(a.date, a.time), keep = Math.max(a.holdUntil || 0, startAt);
  await db.doc(`proofs/${id}`).set({ img, ref, at: now, apptId: id });
  await apptRef(id).update({ proof: { status: 'review', at: now, ref }, holdUntil: keep }); // keep the slot held until the shop checks it
  for (const gid of a.guests || []) await apptRef(gid).update({ holdUntil: keep }).catch(() => {});
  await notify('shop_proof', id, a, info, { sms: false, email: false, shop: 'shop_proof' }).catch(e => logger.error('Shop alert failed', e.message));
  return publicView(id, { ...a, proof: { status: 'review', at: now, ref }, holdUntil: keep }, info);
});

// =============== client accounts ===============
// Log in with a mobile number and a 6-digit code sent by text. Only numbers that already have a booking,
// a visit or a client record can get a code (texts cost money). Codes last 10 minutes, 5 tries;
// a login lasts 30 days. otp/ and clientSessions/ are only read and written here.
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
async function knownNumber(phone) {
  const [a, b, c] = await Promise.all([db.collection('appointments').where('phone', '==', phone).limit(1).get(), db.collection('appointments').where('phoneKey', '==', phone).limit(1).get(), db.collection('customers').where('phoneKey', '==', phone).limit(1).get()]);
  return !a.empty || !b.empty || !c.empty;
}
export const requestCode = onCall({ secrets: NOTIFY_SECRETS }, async req => {
  const phone = normalizePhone(req.data && req.data.phone);
  if (!phone) throw new HttpsError('invalid-argument', 'Enter your 11-digit mobile number, like 0917 123 4567.');
  const ref = db.doc(`otp/${phone}`), cur = await ref.get(), now = Date.now(), o = cur.exists ? cur.data() : {};
  if (o.sentAt && now - o.sentAt < 60e3) throw new HttpsError('resource-exhausted', 'We just sent a code. Wait a minute before asking for another.');
  const day = new Date(now + 8 * 3600e3).toISOString().slice(0, 10), sentToday = o.day === day ? o.count || 0 : 0;
  if (sentToday >= 5) throw new HttpsError('resource-exhausted', 'Too many codes today. Try again tomorrow, or call the shop.');
  if (!(await knownNumber(phone))) throw new HttpsError('not-found', 'We don’t have any visits for this number yet. Book first, then you can log in.');
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0'), info = await loadInfo();
  await ref.set({ hash: sha(code + phone), exp: now + 10 * 60e3, tries: 0, sentAt: now, day, count: sentToday + 1 });
  await sendSms({ apiKey: SEMAPHORE_API_KEY.value(), sender: SMS_SENDER_NAME.value() }, phone, `${(info.shop && info.shop.name) || 'REAL Barbers'}: Your login code is ${code}. It expires in 10 minutes. Don't share it with anyone.`);
  return { ok: true };
});
export const verifyCode = onCall(async req => {
  const phone = normalizePhone(req.data && req.data.phone), code = String(req.data && req.data.code || '').replace(/\D/g, '');
  if (!phone || code.length !== 6) throw new HttpsError('invalid-argument', 'Enter the 6-digit code from the text.');
  const ref = db.doc(`otp/${phone}`), snap = await ref.get(), o = snap.exists ? snap.data() : null, now = Date.now();
  if (!o || !o.hash || o.exp < now) throw new HttpsError('deadline-exceeded', 'That code has expired. Ask for a new one.');
  if ((o.tries || 0) >= 5) throw new HttpsError('resource-exhausted', 'Too many wrong tries. Ask for a new code.');
  if (sha(code + phone) !== o.hash) { await ref.update({ tries: (o.tries || 0) + 1 }); throw new HttpsError('permission-denied', 'That code isn’t right. Check the text and try again.'); }
  await ref.update({ hash: FieldValue.delete(), exp: 0 });
  const session = newToken();
  await db.doc(`clientSessions/${sha(session)}`).set({ phone, exp: now + 30 * 864e5, at: now });
  return { session };
});
async function sessionPhone(data) {
  const t = String(data && data.session || ''); if (!t) throw new HttpsError('unauthenticated', 'Please log in again.');
  const s = await db.doc(`clientSessions/${sha(t)}`).get();
  if (!s.exists || s.data().exp < Date.now()) throw new HttpsError('unauthenticated', 'Your login has expired. Please log in again.');
  return s.data().phone;
}
export const myAccount = onCall(async req => {
  const phone = await sessionPhone(req.data), info = await loadInfo();
  const custs = (await db.collection('customers').where('phoneKey', '==', phone).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  // website bookings store the number cleaned up; ones typed in the dashboard keep a phoneKey
  const appts = [...new Map([...(await db.collection('appointments').where('phone', '==', phone).get()).docs, ...(await db.collection('appointments').where('phoneKey', '==', phone).get()).docs].map(d => [d.id, { id: d.id, ...d.data() }])).values()];
  const byCust = custs.length ? (await db.collection('sales').where('customerId', 'in', custs.slice(0, 10).map(c => c.id)).get()).docs : [];
  const byPhone = [...(await db.collection('sales').where('phone', '==', phone).get()).docs, ...(await db.collection('sales').where('phoneKey', '==', phone).get()).docs];
  const sales = [...new Map([...byCust, ...byPhone].map(d => [d.id, { id: d.id, ...d.data() }])).values()];
  return accountView({ phone, customers: custs, appts, sales, info, today: phNow().date });
});
export const logoutClient = onCall(async req => {
  const t = String(req.data && req.data.session || ''); if (t) await db.doc(`clientSessions/${sha(t)}`).delete().catch(() => {});
  return { ok: true };
});

// =============== reference photo ===============
// The client shows the cut they want: one photo per booking, seen only by the shop (refs/ is admin-only).
export const addRefPhoto = onCall(async req => {
  const { id, a } = await bookingFromToken(req.data);
  if (!['pending_payment', 'booked', 'waiting'].includes(a.status)) throw new HttpsError('failed-precondition', 'You can only add a photo before your visit.');
  const img = req.data && req.data.image, note = String(req.data && req.data.note || '').trim().slice(0, 200);
  if (!validProofImage(img)) throw new HttpsError('invalid-argument', 'Upload a photo (JPG or PNG).');
  const now = Date.now();
  await db.doc(`refs/${id}`).set({ img, note, at: now, apptId: id });
  await apptRef(id).update({ refPhoto: { at: now, note } });
  return publicView(id, { ...a, refPhoto: { at: now, note } }, await loadInfo());
});
export const removeRefPhoto = onCall(async req => {
  const { id, a } = await bookingFromToken(req.data);
  await db.doc(`refs/${id}`).delete().catch(() => {});
  await apptRef(id).update({ refPhoto: FieldValue.delete() });
  const { refPhoto, ...rest } = a;
  return publicView(id, rest, await loadInfo());
});

// =============== on the day ===============
// Walk-in QR: someone standing in the shop joins today's queue. No deposit; the front desk calls them in order.
export const joinQueue = onCall(async req => {
  const info = await loadInfo(), now = Date.now(), t = phNow(now);
  const h = hoursFor(info, t.date); // holiday hours count too
  const toM = s => { const [a, b] = String(s).split(':').map(Number); return a * 60 + b; };
  if (!h || h.closed || t.min < toM(h.open) - 15 || t.min > toM(h.close) - 30) throw new HttpsError('failed-precondition', 'The walk-in queue is closed right now. Book online for another day.');
  const name = String(req.data && req.data.name || '').trim().slice(0, 60), phone = normalizePhone(req.data && req.data.phone);
  if (name.length < 2) throw new HttpsError('invalid-argument', 'Enter your name.');
  if (!phone) throw new HttpsError('invalid-argument', 'Enter a valid mobile number, like 0917 123 4567.');
  const serviceIds = (Array.isArray(req.data.serviceIds) ? req.data.serviceIds : []).filter(id => (info.services || []).some(s => s.id === id && s.active !== false)).slice(0, 5);
  const barberId = (info.barbers || []).some(b => b.id === req.data.barberId) ? req.data.barberId : '';
  const ref = db.collection('appointments').doc(), token = newToken();
  const out = await db.runTransaction(async tx => {
    const q = await tx.get(db.collection('appointments').where('date', '==', t.date).where('source', '==', 'walk-in'));
    const mine = q.docs.find(d => d.data().phone === phone && d.data().status === 'waiting');
    if (mine) return { id: mine.id, token: mine.data().token, queueNo: mine.data().queueNo, again: true };
    const queueNo = Math.max(0, ...q.docs.map(d => d.data().queueNo || 0)) + 1;
    tx.set(ref, { date: t.date, time: `${String(Math.floor(t.min / 60)).padStart(2, '0')}:${String(t.min % 60).padStart(2, '0')}`, source: 'walk-in', status: 'waiting', name, phone, serviceIds, barberId, queueNo,
      token, code: bookingCode(), notify: false, customerId: '', fromQr: true, createdAt: now, ...(cleanBday(req.data.birthday) ? { birthday: cleanBday(req.data.birthday) } : {}) });
    return { id: ref.id, token, queueNo };
  });
  if (!out.token) throw new HttpsError('already-exists', 'You’re already in the queue. Ask the front desk.');
  return out;
});

export const runningLate = onCall(async req => {
  const { id, a } = await bookingFromToken(req.data);
  const info = await loadInfo(), pol = policyOf(info), now = Date.now();
  const mins = Math.max(5, Math.min(30, parseInt(req.data && req.data.mins, 10) || 10));
  const startAt = a.startAt || startMs(a.date, a.time);
  if (a.status !== 'booked' || now > startAt + 30 * 60e3 || startAt - now > 3 * 3600e3) throw new HttpsError('failed-precondition', 'You can only tell us this on the day, close to your time.');
  await apptRef(id).update({ late: { mins, at: now } });
  return publicView(id, { ...a, late: { mins, at: now } }, info);
});

// =============== after the visit ===============
export const rateVisit = onCall(async req => {
  const { id, a } = await bookingFromToken(req.data);
  const info = await loadInfo();
  if (a.status !== 'done') throw new HttpsError('failed-precondition', 'You can rate your visit after your cut.');
  const stars = Math.max(1, Math.min(5, parseInt(req.data && req.data.stars, 10) || 0));
  const text = String(req.data && req.data.text || '').trim().slice(0, 400);
  const rating = { stars, text, at: Date.now() };
  await apptRef(id).update({ rating });
  return { ...publicView(id, { ...a, rating }, info), loyalty: await loyaltyOf(a, info), rebook: rebookLink('.', a, info) };
});

// =============== waitlist ===============
export const joinWaitlist = onCall(async req => {
  const info = await loadInfo(), pol = policyOf(info), d = req.data || {};
  const name = String(d.name || '').trim().slice(0, 80), phone = normalizePhone(d.phone), email = String(d.email || '').trim().toLowerCase().slice(0, 120);
  const date = String(d.date || ''), win = ['any', 'morning', 'afternoon', 'evening'].includes(d.window) ? d.window : 'any';
  const barberId = String(d.barberId || ''), serviceIds = Array.isArray(d.serviceIds) ? d.serviceIds.map(String).slice(0, 6) : [];
  if (!name) throw new HttpsError('invalid-argument', 'Enter your name.');
  if (!phone) throw new HttpsError('invalid-argument', 'Enter a valid mobile number, like 0917 123 4567.');
  if (email && !validEmail(email)) throw new HttpsError('invalid-argument', 'Check your email address.');
  const today = phNow().date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addDays(today, pol.bookAheadDays)) throw new HttpsError('invalid-argument', 'Pick a date within the booking window.');
  if (d.consent !== true) throw new HttpsError('invalid-argument', 'Please agree to be contacted about this.');
  const mine = (await db.collection('waitlist').where('phoneKey', '==', phone).get()).docs.map(x => x.data()).filter(x => x.status === 'waiting' && x.date >= today);
  if (mine.some(x => x.date === date)) throw new HttpsError('already-exists', 'You’re already on the waitlist for that day.');
  if (mine.length >= 3) throw new HttpsError('resource-exhausted', 'You can be on the waitlist for up to 3 days at a time.');
  await db.collection('waitlist').add({ name, phone, phoneKey: phone, email, date, window: win, barberId, serviceIds, status: 'waiting', createdAt: Date.now() });
  return { ok: true };
});

async function notifyWaitlist(freed, info) {
  const pol = policyOf(info), now = Date.now();
  const open = freed.filter(x => startMs(x.date, x.time) > now + pol.leadMinutes * 60e3);
  if (!open.length) return;
  for (const date of [...new Set(open.map(x => x.date))]) {
    const entries = (await db.collection('waitlist').where('date', '==', date).get()).docs.filter(x => x.data().status === 'waiting').sort((a, b) => a.data().createdAt - b.data().createdAt);
    let sent = 0;
    for (const e of entries) {
      if (sent >= 5) break;
      const w = e.data(), slot = open.filter(x => x.date === date).sort((a, b) => a.time.localeCompare(b.time)).find(x => waitlistMatches(w, x));
      if (!slot) continue;
      const person = { name: w.name, phone: w.phone, email: w.email, date, time: slot.time, barberName: barberName(info, slot.barberId) };
      const res = await sendTo('slot_open', person, info, `${site()}/#book`);
      await e.ref.update({ status: 'notified', notifiedAt: now, notifiedSlot: `${slot.time} ${person.barberName}`.trim(), result: res });
      sent++;
    }
  }
}

// =============== "time for a trim" reminders ===============
async function hasUpcoming(customerId, phone) {
  const now = Date.now();
  if (customerId) { const q = await db.collection('appointments').where('customerId', '==', customerId).where('date', '>=', phNow().date).get(); if (q.docs.some(x => ['booked', 'pending_payment'].includes(x.data().status))) return true; }
  if (phone) { const q = await db.collection('appointments').where('phone', '==', phone).where('status', '==', 'booked').get(); if (q.docs.some(x => (x.data().startAt || 0) > now)) return true; }
  return false;
}
async function remindOne(ref, c, lastVisit, info) {
  const last = (await db.collection('sales').where('customerId', '==', ref.id).orderBy('date', 'desc').limit(1).get()).docs[0];
  const link = last ? rebookLink(site(), last.data(), info) : `${site()}/#book`; // "Book now" = same cut, same barber
  const res = await sendTo('rebook', { name: c.name, phone: c.phone, email: c.email }, info, link);
  await ref.update({ rebookSentFor: lastVisit, rebookSentAt: Date.now() });
  return res;
}
export const sendRebookReminders = onSchedule({ schedule: 'every day 10:00', timeZone: 'Asia/Manila', secrets: NOTIFY_SECRETS }, async () => {
  const info = await loadInfo(), days = policyOf(info).rebookDays;
  if (!days) return;
  const target = addDays(phNow().date, -days);
  const ids = [...new Set((await db.collection('sales').where('date', '==', target).get()).docs.map(x => x.data().customerId).filter(Boolean))];
  let n = 0;
  for (const id of ids) {
    const ref = db.doc(`customers/${id}`), snap = await ref.get(); if (!snap.exists) continue;
    const c = snap.data();
    if (c.noReminders || !c.phone || (c.rebookSentFor || '') >= target) continue;
    const later = await db.collection('sales').where('customerId', '==', id).where('date', '>', target).limit(1).get();
    if (!later.empty || await hasUpcoming(id, normalizePhone(c.phone))) continue;
    await remindOne(ref, c, target, info); n++;
  }
  logger.info(`Trim reminders sent: ${n}`);
});
export const sendTrimReminder = onCall({ secrets: NOTIFY_SECRETS }, async req => {
  if (!(await isAdmin(req))) throw new HttpsError('permission-denied', 'Only admins can send reminders.');
  const id = String(req.data && req.data.customerId || '');
  const ref = db.doc(`customers/${id}`), snap = id ? await ref.get() : null;
  if (!snap || !snap.exists) throw new HttpsError('not-found', 'Client not found.');
  const c = snap.data();
  if (!c.phone && !c.email) throw new HttpsError('failed-precondition', 'This client has no phone or email on file.');
  const last = String(req.data.lastVisit || phNow().date);
  return await remindOne(ref, c, last, await loadInfo());
});

export const rescheduleBooking = onCall({ secrets: NOTIFY_SECRETS }, async req => {
  const { id } = await bookingFromToken(req.data);
  const info = await loadInfo();
  const now = Date.now(), pol = policyOf(info);
  const date = String(req.data.date || ''), time = String(req.data.time || ''), wanted = String(req.data.barberId || '');
  const result = await db.runTransaction(async tx => {
    const s = await tx.get(apptRef(id));
    const a = s.data();
    const pv = publicView(id, a, info);
    if (!pv.canReschedule) throw new HttpsError('failed-precondition', `Bookings can only be moved up to ${pol.rescheduleHours} hours before the appointment.`);
    const v = validateRequest(info, { name: a.name, phone: a.phone, email: a.email, consent: true, serviceIds: a.serviceIds, date, time, barberId: wanted }, now);
    if (!v.ok) throw new HttpsError('invalid-argument', v.error);
    const old = desiredSlots(a, info).map(x => slotRef(x.id));
    const refs = v.barbers.map(b => v.times.map(t => slotRef(slotId(b, v.date, t))));
    const snaps = await tx.getAll(...refs.flat(), ...old);
    const oldSnaps = snaps.splice(refs.flat().length);
    let k = 0;
    const free = refs.map(rs => rs.map(() => snaps[k++]).every(x => !(x.exists && isActiveSlot(x.data(), now) && x.data().bookingId !== id)));
    const pick = free.indexOf(true);
    if (pick < 0) throw new HttpsError('already-exists', 'That time is taken. Please pick another.');
    const b = v.barbers[pick], newIds = refs[pick].map(r => r.id);
    oldSnaps.filter(x => x.exists && x.data().bookingId === id && !newIds.includes(x.id)).forEach(x => tx.delete(x.ref));
    refs[pick].forEach((r, i) => tx.set(r, { barberId: b, date: v.date, time: v.times[i], state: 'booked', holdUntil: 0, bookingId: id }));
    const upd = { date: v.date, time: v.time, startAt: v.at, barberId: b, mins: v.mins, blocks: newIds, reschedules: (a.reschedules || 0) + 1, reminders: {} };
    tx.update(apptRef(id), upd);
    return { ...a, ...upd };
  });
  await notify('rescheduled', id, result, info);
  return publicView(id, result, info);
});

export const cancelBooking = onCall({ secrets: NOTIFY_SECRETS }, async req => {
  const { id } = await bookingFromToken(req.data);
  const info = await loadInfo();
  const result = await db.runTransaction(async tx => {
    const a = (await tx.get(apptRef(id))).data();
    if (!publicView(id, a, info).canCancel) throw new HttpsError('failed-precondition', 'This booking can’t be cancelled online. Please call the shop.');
    const pol = policyOf(info), refund = refundOnCancel({ ...a, startAt: a.startAt || startMs(a.date, a.time) }, pol);
    const upd = { status: 'cancelled', cancelledBy: 'customer', cancelledAt: Date.now(), 'deposit.status': refund ? 'refund_due' : a.deposit && a.deposit.status === 'paid' ? 'kept' : (a.deposit && a.deposit.status) || 'unpaid' };
    tx.update(apptRef(id), upd);
    return { ...a, status: 'cancelled', deposit: { ...(a.deposit || {}), status: upd['deposit.status'] } };
  });
  await notify('cancelled', id, result, info, { shop: 'shop_cancelled' });
  return publicView(id, result, info);
});

// =============== background jobs ===============
export const expireHolds = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Asia/Manila', secrets: [PAYMONGO_SECRET_KEY] }, async () => {
  const now = Date.now();
  const q = await db.collection('appointments').where('status', '==', 'pending_payment').where('holdUntil', '<', now).limit(200).get();
  for (const d of q.docs) {
    const expired = await db.runTransaction(async tx => {
      const s = await tx.get(d.ref);
      if (!s.exists || s.data().status !== 'pending_payment') return false;
      tx.update(d.ref, { status: 'expired', expiredReason: 'not_paid' });
      return true;
    });
    if (expired) await expireCheckout(PAYMONGO_SECRET_KEY.value(), d.data().deposit && d.data().deposit.checkoutId);
  }
  if (q.size) logger.info(`Expired ${q.size} unpaid holds`);
});

export const sendReminders = onSchedule({ schedule: 'every 30 minutes', timeZone: 'Asia/Manila', secrets: NOTIFY_SECRETS }, async () => {
  const now = Date.now(), H = 3600e3;
  const info = await loadInfo();
  const q = await db.collection('appointments').where('status', '==', 'booked').where('startAt', '>', now).where('startAt', '<=', now + 26 * H).get();
  for (const d of q.docs) {
    const a = d.data();
    if (!a.notify) continue;
    const left = a.startAt - now, r = a.reminders || {};
    if (!r.day && left <= 24 * H && left > 3 * H) {
      await d.ref.update({ 'reminders.day': true });
      await notify('reminder', d.id, a, info);
    } else if (!r.soon && left <= 2 * H) {
      await d.ref.update({ 'reminders.soon': true });
      await notify('soon', d.id, a, info, { email: false });
    }
  }
});

// Keeps slots/ in step with appointments, including bookings the shop adds by phone in the dashboard.
// Online bookings already claim their slots inside a transaction, so for those this is usually a no-op.
// =============== receipts ===============
const receiptLink = (id, t) => `${site()}/receipt.html?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`;
async function receiptFor(id, s, info) {
  const visits = s.customerId ? (await db.collection('sales').where('customerId', '==', s.customerId).count().get()).data().count : 0;
  return receiptView(id, s, info, barberName(info, s.barberId), visits);
}
// The receipt page and the "Your receipt" card on the booking page. The token is written by the dashboard at checkout.
export const getReceipt = onCall(async req => {
  const id = String(req.data && req.data.id || ''), t = String(req.data && req.data.t || '');
  if (!id || !t || id.includes('/')) throw new HttpsError('not-found', 'Receipt not found.');
  const s = await db.doc(`sales/${id}`).get();
  if (!s.exists || !s.data().rtoken || !tokenMatches(t, s.data().rtoken)) throw new HttpsError('not-found', 'Receipt not found. Check the link.');
  return receiptFor(id, s.data(), await loadInfo());
});
// After every checkout: text the client a short receipt and email the full one (when we have their email).
export const sendReceipt = onDocumentCreated({ document: 'sales/{id}', secrets: NOTIFY_SECRETS }, async event => {
  const s = event.data && event.data.data(); if (!s || !s.rtoken) return;
  const info = await loadInfo(), pol = policyOf(info);
  if (pol.receipts === false) return;
  let email = '';
  if (s.apptId) { const a = await apptRef(s.apptId).get(); email = a.exists ? a.data().email || '' : ''; }
  if (!email && s.customerId) { const c = await db.doc(`customers/${s.customerId}`).get(); email = c.exists ? c.data().email || '' : ''; }
  if (!s.phone && !email) return;
  const r = await receiptFor(event.params.id, s, info), link = receiptLink(event.params.id, s.rtoken);
  const smsCfg = { apiKey: SEMAPHORE_API_KEY.value(), sender: SMS_SENDER_NAME.value() };
  const mailCfg = { user: SHOP_EMAIL.value(), pass: GMAIL_APP_PASSWORD.value(), fromName: (info.shop && info.shop.name) || 'Barbershop' };
  const out = {};
  if (s.phone && pol.receiptTexts !== false) out.sms = await sendSms(smsCfg, normalizePhone(s.phone) || s.phone, receiptSms(r, info));
  if (email) out.email = await sendEmail(mailCfg, email, receiptEmail(r, info, link));
  await event.data.ref.update({ receiptSent: { at: Date.now(), ...out } }).catch(() => {});
});

// Today's queue without names (public/queue), so the website can show the live walk-in wait
async function writeQueue(info) {
  const date = phNow().date, snap = await db.collection('appointments').where('date', '==', date).get();
  await db.doc('public/queue').set(queueItems(snap.docs.map(d => d.data()), info, date));
}
export const syncSlots = onDocumentWritten({ document: 'appointments/{id}', secrets: NOTIFY_SECRETS }, async event => {
  const id = event.params.id;
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const infoSnap = await db.doc('public/info').get();
  if (!infoSnap.exists) return;
  const info = infoSnap.data();
  if ([before && before.date, after && after.date].includes(phNow().date)) await writeQueue(info).catch(e => logger.warn('queue', e));
  const want = desiredSlots(after, info);
  const have = (after ? after.blocks : before && before.blocks) || [];
  const startAt = after && after.date && after.time ? startMs(after.date, after.time) : null;
  const mins = after ? apptMins(after, info) : null;
  const sameBlocks = want.length === have.length && want.every(x => have.includes(x.id));
  const state = after ? slotStateFor(after.status) : 'booked';

  let freed = [];
  await db.runTransaction(async tx => {
    freed = [];
    const ids = [...new Set([...have, ...want.map(x => x.id)])];
    const snaps = ids.length ? await tx.getAll(...ids.map(slotRef)) : [];
    const byId = Object.fromEntries(snaps.map(s => [s.id, s.exists ? s.data() : null]));
    const now = Date.now();
    // release slots we no longer need
    for (const sid of have) if (!want.some(x => x.id === sid) && byId[sid] && byId[sid].bookingId === id) { tx.delete(slotRef(sid)); const p = parseSlotId(sid); if (p) freed.push(p); }
    // claim the ones we need, unless someone else holds them
    const claimed = []; let conflict = false;
    for (const x of want) {
      const cur = byId[x.id];
      if (cur && cur.bookingId !== id && isActiveSlot(cur, now)) { conflict = true; continue; }
      claimed.push(x.id);
      const holdUntil = state === 'held' ? (after.holdUntil || 0) : 0;
      if (!cur || cur.bookingId !== id || cur.state !== state || (cur.holdUntil || 0) !== holdUntil) {
        tx.set(slotRef(x.id), { barberId: after.barberId, date: after.date, time: x.time, state, holdUntil, bookingId: id });
      }
    }
    if (!after) return;
    // Only write back what changed, so this trigger never loops on its own updates.
    const upd = {};
    const claimedSame = claimed.length === have.length && claimed.every(x => have.includes(x));
    if (!claimedSame) upd.blocks = claimed;
    if (!!after.conflict !== conflict) upd.conflict = conflict;
    if (startAt && after.startAt !== startAt) upd.startAt = startAt;
    if (mins && !after.mins) upd.mins = mins;
    if (Object.keys(upd).length) tx.update(apptRef(id), upd);
  });
  // Any slot that just opened (cancellation, reschedule, expired hold) is offered to the waitlist for that day.
  if (freed.length) await notifyWaitlist(freed, info).catch(e => logger.error('Waitlist notify failed', e.message));
  // Messages that follow a change the shop made in the dashboard
  if (before && after && after.notify) {
    const was = before.status, now = after.status, say = (k, o) => notify(k, id, after, info, o).catch(e => logger.error(k, e.message));
    if (was === 'pending_payment' && now === 'booked' && after.payMethod === 'gcash') await say('confirmed', { shop: null }); // GCash screenshot approved
    else if (after.proof && after.proof.status === 'rejected' && !(before.proof && before.proof.status === 'rejected')) await say('proof_rejected');
    else if (was !== 'done' && now === 'done' && !after.rating) await say('rate'); // "How was your cut?"
  }
});

// =============== Facebook page photos -> website gallery ===============
// The owner pastes a Page access token in Dashboard → Website → Facebook photos (stored in private/facebook,
// which only admins and this server can read). Photo links from Facebook expire after a while, so they are
// refreshed on every run.
async function pullFacebookPhotos() {
  const ref = db.doc('private/facebook'), cfg = (await ref.get()).data() || {};
  if (!cfg.token) return { ok: false, reason: 'not-connected' };
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.pageId || 'me')}/photos?type=uploaded&fields=images,name,created_time,link&limit=24&access_token=${encodeURIComponent(cfg.token)}`;
  const r = await fetch(url), j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const msg = (j.error && j.error.message) || `Facebook answered ${r.status}`;
    await ref.set({ lastError: msg, lastTry: Date.now() }, { merge: true });
    throw new HttpsError('failed-precondition', `Facebook: ${msg}`);
  }
  const photos = (j.data || []).map(p => {
    const imgs = (p.images || []).slice().sort((a, b) => b.width - a.width), img = imgs.find(i => i.width <= 1080) || imgs[0];
    return img && { id: `fb_${p.id}`, url: img.source, caption: String(p.name || '').split('\n')[0].slice(0, 120), at: Date.parse(p.created_time) || 0, link: p.link || '' };
  }).filter(Boolean);
  await db.doc('public/info').set({ fbPhotos: photos, fbSyncedAt: Date.now() }, { merge: true });
  await ref.set({ lastOk: Date.now(), lastError: '', count: photos.length }, { merge: true });
  return { ok: true, count: photos.length };
}
export const syncFacebookPhotos = onSchedule({ schedule: 'every 3 hours', timeZone: 'Asia/Manila' }, async () => {
  await pullFacebookPhotos().catch(e => logger.error('Facebook photo sync failed', e.message));
});
// =============== weekly backup ===============
// Every Sunday at 3 AM: all the shop's records (no photos) as one JSON file in Cloud Storage, backups/YYYY-MM-DD.json.
// The last 12 are kept. Download them in the Firebase console → Storage → backups.
const BACKUP_COLS = ['staff', 'appointments', 'sales', 'expenses', 'customers', 'inventory', 'payouts', 'waitlist', 'attendance', 'promos', 'closings', 'leaves', 'timeclock', 'activity', 'payslips', 'advances'];
export const weeklyBackup = onSchedule({ schedule: '0 3 * * 0', timeZone: 'Asia/Manila', timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const out = { at: new Date().toISOString(), info: (await db.doc('public/info').get()).data() || null };
  for (const c of BACKUP_COLS) out[c] = (await db.collection(c).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const bucket = getStorage().bucket(), name = `backups/${phNow().date}.json`;
  await bucket.file(name).save(JSON.stringify(out), { contentType: 'application/json', resumable: false });
  const [files] = await bucket.getFiles({ prefix: 'backups/' });
  const old = files.filter(f => /\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(12);
  await Promise.all(old.map(f => f.delete().catch(() => {})));
  await db.doc('private/backup').set({ last: Date.now(), file: name, counts: Object.fromEntries(BACKUP_COLS.map(c => [c, out[c].length])) });
});

// =============== official receipt numbers ===============
// One number per sale, in order, with no gaps or repeats even from two phones at once (private/receipts.next).
export const nextReceiptNo = onCall(async req => {
  if (!(await isAdmin(req))) throw new HttpsError('permission-denied', 'Only the shop can do this.');
  const ref = db.doc('private/receipts');
  const no = await db.runTransaction(async tx => { const s = await tx.get(ref), n = Math.max(1, (s.exists && s.data().next) || 1); tx.set(ref, { next: n + 1, at: Date.now() }, { merge: true }); return n; });
  return { no };
});
export const syncFacebookNow = onCall(async req => {
  if (!(await isAdmin(req))) throw new HttpsError('permission-denied', 'Only the shop can do this.');
  return pullFacebookPhotos();
});

// =============== staff accounts, owner PIN, activity log ===============
// admins/{uid}: { role: 'owner' | 'desk' | 'staff', staffId, name, email }. A missing role means owner.
// The owner PIN unlocks owner-only actions on another account until Lock or sign-out (pinLock), with a 12-hour safety cap: elevations/{uid}.until,
// which firestore.rules checks. Every sensitive change is written to activity/ (read by the owner only).
async function adminOf(req) { if (!req.auth) return null; const s = await db.doc(`admins/${req.auth.uid}`).get(); return s.exists ? { uid: req.auth.uid, ...s.data() } : null; }
async function bossOf(req) {
  const a = await adminOf(req); if (!a) return null;
  if (roleOf(a) === 'owner' && await twoOk(req)) return a;
  const e = await db.doc(`elevations/${a.uid}`).get();
  return e.exists && (e.data().until || 0) > Date.now() ? a : null;
}
async function logActivity(a, kind, text, extra = {}) {
  try { await db.collection('activity').add({ at: Date.now(), by: (a && a.uid) || 'server', who: (a && (a.name || a.email)) || 'System', role: a ? roleOf(a) : 'system', kind, text: String(text).slice(0, 300), ...extra }); }
  catch (e) { logger.warn('activity log failed', e.message); }
}
const pinHash = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');

export const staffLogin = onCall(async req => {
  const me = await bossOf(req); if (!me || roleOf(me) !== 'owner') throw new HttpsError('permission-denied', 'Only the owner can manage sign-ins.');
  const d = req.data || {}, staffId = String(d.staffId || ''), sRef = db.doc(`staff/${staffId}`), st = staffId ? await sRef.get() : null;
  if (!st || !st.exists) throw new HttpsError('not-found', 'Staff member not found.');
  const b = st.data(), cur = b.login || null, auth = getAuth();
  if (d.remove) {
    if (cur && cur.uid) { await db.doc(`admins/${cur.uid}`).delete(); try { await auth.deleteUser(cur.uid); } catch (_) {} }
    await sRef.update({ login: FieldValue.delete() });
    await logActivity(me, 'login', `Removed ${b.name}'s sign-in`);
    return { ok: true };
  }
  const email = String(d.email || '').trim().toLowerCase(), role = ACCESS[d.role] ? d.role : 'staff', pass = String(d.password || '');
  if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Enter a valid email.');
  if ((!cur || pass) && pass.length < 8) throw new HttpsError('invalid-argument', 'The password needs at least 8 characters.');
  let uid = cur && cur.uid;
  try {
    if (uid) await auth.updateUser(uid, { email, ...(pass ? { password: pass } : {}), displayName: b.name });
    else { let u; try { u = await auth.getUserByEmail(email); await auth.updateUser(u.uid, { password: pass, displayName: b.name }); } catch (_) { u = await auth.createUser({ email, password: pass, displayName: b.name }); } uid = u.uid; }
  } catch (e) { throw new HttpsError('failed-precondition', e.code === 'auth/email-already-exists' ? 'That email already has a sign-in.' : 'Couldn’t save the sign-in. ' + (e.message || '')); }
  await db.doc(`admins/${uid}`).set({ role, staffId, name: b.name, email, at: Date.now() });
  await sRef.update({ login: { uid, email, role } });
  await logActivity(me, 'login', `${cur ? 'Changed' : 'Gave'} ${b.name} a sign-in (${ACCESS[role]})`);
  return { ok: true, uid };
});

export const setPin = onCall(async req => {
  const me = await adminOf(req); if (!me || roleOf(me) !== 'owner' || !(await twoOk(req))) throw new HttpsError('permission-denied', 'Only the owner can set the PIN.');
  const pin = String(req.data && req.data.pin || '');
  if (!/^\d{4}$/.test(pin)) throw new HttpsError('invalid-argument', 'The PIN is 4 digits.');
  const salt = crypto.randomBytes(16).toString('hex');
  await db.doc('private/pin').set({ hash: pinHash(pin, salt), salt, fails: 0, lockUntil: 0, at: Date.now() });
  await logActivity(me, 'pin', 'Changed the owner PIN');
  return { ok: true };
});
export const pinUnlock = onCall(async req => {
  const me = await adminOf(req); if (!me) throw new HttpsError('permission-denied', 'Sign in first.');
  const ref = db.doc('private/pin'), s = await ref.get();
  if (!s.exists) throw new HttpsError('failed-precondition', 'No owner PIN yet. The owner sets it in Shop setup → Owner PIN.');
  const p = s.data(), now = Date.now();
  if ((p.lockUntil || 0) > now) throw new HttpsError('resource-exhausted', `Too many wrong tries. Try again in ${Math.ceil((p.lockUntil - now) / 60000)} min.`);
  const ok = crypto.timingSafeEqual(Buffer.from(pinHash(String(req.data && req.data.pin || ''), p.salt), 'hex'), Buffer.from(p.hash, 'hex'));
  if (!ok) {
    const fails = (p.fails || 0) + 1;
    await ref.update({ fails: fails >= 5 ? 0 : fails, lockUntil: fails >= 5 ? now + 15 * 60e3 : 0 });
    await logActivity(me, 'pin', 'Wrong owner PIN' + (fails >= 5 ? ' (5 tries: locked 15 minutes)' : ''));
    throw new HttpsError('permission-denied', fails >= 5 ? 'Too many wrong tries. Locked for 15 minutes.' : 'Wrong PIN.');
  }
  const until = now + 12 * 3600e3, why = String(req.data && req.data.why || '').slice(0, 80);
  await ref.update({ fails: 0 });
  await db.doc(`elevations/${me.uid}`).set({ until, at: now });
  await logActivity(me, 'pin', `Owner PIN entered${why ? ': ' + why : ''}`);
  return { until };
});

export const pinLock = onCall(async req => {
  if (!req.auth) return { ok: true };
  await db.doc(`elevations/${req.auth.uid}`).delete().catch(() => {});
  return { ok: true };
});

// =============== system evaluation (ISO/IEC 25010 questionnaire, evaluate.html) ===============
// Anyone with the link can answer once per visit; at most 10 per network per day so the results can't be flooded.
export const submitEvaluation = onCall(async req => {
  const c = cleanEvaluation(req.data); if (!c.ok) throw new HttpsError('invalid-argument', c.why);
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), ip = (req.rawRequest && (req.rawRequest.headers['x-forwarded-for'] || req.rawRequest.ip || '')).toString().split(',')[0].trim();
  const lim = db.doc(`evalLimits/${sha(ip + day).slice(0, 32)}`);
  await db.runTransaction(async t => { const s = await t.get(lim), n = s.exists ? s.data().n || 0 : 0; if (n >= 10) throw new HttpsError('resource-exhausted', 'Too many answers from this network today. Try again tomorrow.'); t.set(lim, { n: n + 1, day }); });
  await db.collection('evaluations').add({ ...c.rec, at: Date.now() });
  return { ok: true };
});

// =============== owner two-step sign-in ===============
// The owner's account needs a 6-digit code (by email, or by text to the owner's mobile) the first time it signs in on a
// device. twofa/{uid}: { ok: <auth_time of the verified sign-in>, hash, exp, tries, sentAt, day, count, devices: [{ h, exp, at }] }
// firestore.rules only give owner powers when twofa/{uid}.ok matches the sign-in's auth_time, so a stolen password alone isn't enough.
// "Remember this device" keeps a random token on that device (only its hash is stored) for 30 days.
const twoRef = uid => db.doc(`twofa/${uid}`);
const authTime = req => Number(req.auth && req.auth.token && req.auth.token.auth_time) || 0;
async function ownerNeedsTwo(req) {
  const me = await adminOf(req); if (!me) throw new HttpsError('permission-denied', 'Sign in first.');
  return { me, owner: roleOf(me) === 'owner' };
}
async function twoOk(req) { const s = await twoRef(req.auth.uid).get(); return s.exists && s.data().ok === authTime(req) && authTime(req) > 0; }
export const twoFaStatus = onCall(async req => {
  const { me, owner } = await ownerNeedsTwo(req); if (!owner) return { ok: true };
  const ref = twoRef(me.uid), snap = await ref.get(), t = snap.exists ? snap.data() : {}, now = Date.now(), at = authTime(req);
  if (at && t.ok === at) return { ok: true };
  const dev = String(req.data && req.data.device || '');
  if (dev && (t.devices || []).some(d => d.h === sha(dev) && d.exp > now)) { await ref.set({ ok: at, okAt: now }, { merge: true }); return { ok: true, device: true }; }
  const info = await loadInfo(), phone = normalizePhone((info.shop || {}).ownerPhone || '');
  return { ok: false, email: maskEmail(req.auth.token.email || me.email || ''), phone: phone ? maskPhone(phone) : '' };
});
export const twoFaSend = onCall({ secrets: NOTIFY_SECRETS }, async req => {
  const { me, owner } = await ownerNeedsTwo(req); if (!owner) throw new HttpsError('failed-precondition', 'Only the owner’s account uses a code.');
  const via = req.data && req.data.via === 'sms' ? 'sms' : 'email', ref = twoRef(me.uid), snap = await ref.get(), o = snap.exists ? snap.data() : {}, now = Date.now();
  if (o.sentAt && now - o.sentAt < 45e3) throw new HttpsError('resource-exhausted', 'A code was just sent. Wait a few seconds before asking for another.');
  const day = new Date(now + 8 * 3600e3).toISOString().slice(0, 10), sentToday = o.day === day ? o.count || 0 : 0;
  if (sentToday >= 8) throw new HttpsError('resource-exhausted', 'Too many codes today. Try again tomorrow.');
  const info = await loadInfo(), shopName = (info.shop && info.shop.name) || 'REAL Barbers', code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  let sent = false, to = '';
  if (via === 'sms') {
    const phone = normalizePhone((info.shop || {}).ownerPhone || '');
    if (!phone) throw new HttpsError('failed-precondition', 'No owner mobile number yet. Use email, then add it in Shop setup → Shop details.');
    sent = await sendSms({ apiKey: SEMAPHORE_API_KEY.value(), sender: SMS_SENDER_NAME.value() }, phone, `${shopName} dashboard code: ${code}. It expires in 10 minutes. Don't share it with anyone.`); to = maskPhone(phone);
  } else {
    const email = req.auth.token.email || me.email || '';
    sent = await sendEmail({ user: SHOP_EMAIL.value(), pass: GMAIL_APP_PASSWORD.value(), fromName: shopName }, email, {
      subject: `${shopName} dashboard code: ${code}`,
      text: `Your sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't just sign in to the dashboard, change your password now.`,
      html: `<p>Your sign-in code is</p><p style="font:700 28px/1.2 monospace;letter-spacing:4px">${code}</p><p>It expires in 10 minutes.</p><p style="color:#666">If you didn’t just sign in to the dashboard, change your password now.</p>` }); to = maskEmail(email);
  }
  if (!sent) throw new HttpsError('unavailable', via === 'sms' ? 'Couldn’t send the text. Try email instead.' : 'Couldn’t send the email. Try a text instead.');
  await ref.set({ hash: sha(code + me.uid), exp: now + 10 * 60e3, tries: 0, sentAt: now, day, count: sentToday + 1 }, { merge: true });
  return { ok: true, to };
});
export const twoFaVerify = onCall(async req => {
  const { me, owner } = await ownerNeedsTwo(req); if (!owner) return { ok: true };
  const code = String(req.data && req.data.code || '').replace(/\D/g, ''), ref = twoRef(me.uid), snap = await ref.get(), o = snap.exists ? snap.data() : {}, now = Date.now();
  if (code.length !== 6) throw new HttpsError('invalid-argument', 'Enter the 6-digit code.');
  if (!o.hash || o.exp < now) throw new HttpsError('deadline-exceeded', 'That code has expired. Ask for a new one.');
  if ((o.tries || 0) >= 5) throw new HttpsError('resource-exhausted', 'Too many wrong tries. Ask for a new code.');
  if (!crypto.timingSafeEqual(Buffer.from(sha(code + me.uid), 'hex'), Buffer.from(o.hash, 'hex'))) {
    await ref.update({ tries: (o.tries || 0) + 1 });
    await logActivity(me, 'login', 'Wrong two-step code');
    throw new HttpsError('permission-denied', 'That code isn’t right. Check it and try again.');
  }
  const upd = { ok: authTime(req), okAt: now, hash: FieldValue.delete(), exp: 0, tries: 0 };
  let device = '';
  if (req.data && req.data.remember) { device = newToken() + newToken(); upd.devices = [...(o.devices || []).filter(d => d.exp > now).slice(-4), { h: sha(device), exp: now + 30 * 864e5, at: now }]; }
  await ref.set(upd, { merge: true });
  await logActivity(me, 'login', `Two-step sign-in passed${device ? ' · device remembered for 30 days' : ''}`);
  return { ok: true, device };
});
export const twoFaForget = onCall(async req => {
  const { me, owner } = await ownerNeedsTwo(req); if (!owner || !(await twoOk(req))) throw new HttpsError('permission-denied', 'Only the owner can do this.');
  await twoRef(me.uid).set({ devices: [] }, { merge: true });
  await logActivity(me, 'login', 'Signed out every remembered device (two-step)');
  return { ok: true };
});

// =============== time clock ===============
// The shop prints a QR (Shop setup → Time clock) that opens clock.html?k=<key>. A signed-in staff member taps
// "Time in" / "Time out"; the server stamps Philippine time, works out lateness (9:01 is late) and the fine.
// timeclock/{date}_{staffId}: { date, staffId, in, inHM, out, outHM, start, lateMin, fine, rate, away }
const distM = (a, b) => { const R = 6371e3, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); };
export const clockPunch = onCall(async req => {
  const me = await adminOf(req); if (!me || !me.staffId) throw new HttpsError('permission-denied', 'This sign-in isn’t linked to a staff member. Ask the owner.');
  const d = req.data || {}, key = (await db.doc('private/clock').get()).data() || {};
  if (!key.key || !tokenMatches(String(d.k || ''), key.key)) throw new HttpsError('permission-denied', 'This QR code is old. Scan the one at the shop.');
  const st = await db.doc(`staff/${me.staffId}`).get(); if (!st.exists) throw new HttpsError('not-found', 'Staff member not found.');
  const b = st.data(), info = await loadInfo(), pol = policyOf(info), now = Date.now(), { date, time } = phNow(now);
  const ref = db.doc(`timeclock/${date}_${me.staffId}`), cur = (await ref.get()).data();
  const shop = info.shop || {}, here = Number.isFinite(+d.lat) && Number.isFinite(+d.lng) ? { lat: +d.lat, lng: +d.lng } : null;
  const dist = here && Number.isFinite(+shop.lat) && Number.isFinite(+shop.lng) && shop.lat !== '' ? distM(here, { lat: +shop.lat, lng: +shop.lng }) : null;
  const away = dist != null && dist > 300;
  if (d.peek) return { name: b.name, state: !cur ? 'out' : cur.out ? 'done' : 'in', rec: cur || null, start: shiftStartOf(b, pol, date) };
  if (!cur) {
    const start = shiftStartOf(b, pol, date), rate = lateRateOf(b), L = lateFine(time, start, rate);
    const rec = { date, staffId: me.staffId, in: now, inHM: time, start, lateMin: L.mins, fine: L.fine, rate, ...(dist != null ? { inDist: dist } : {}), ...(away ? { away: true } : {}) };
    await ref.set(rec);
    await logActivity(me, 'clock', `${b.name} timed in at ${time}${L.mins ? ` (${L.mins} min late, −₱${L.fine})` : ''}${away ? ` · ${dist} m from the shop` : ''}`);
    return { action: 'in', name: b.name, rec };
  }
  if (cur.out) throw new HttpsError('failed-precondition', `You already timed out at ${cur.outHM}. Ask the owner if this is wrong.`);
  if (now - cur.in < 2 * 60e3) throw new HttpsError('failed-precondition', `You timed in at ${cur.inHM}. Scan again when you leave.`);
  const upd = { out: now, outHM: time, ...(dist != null ? { outDist: dist } : {}), ...(away ? { awayOut: true } : {}) };
  await ref.update(upd);
  await logActivity(me, 'clock', `${b.name} timed out at ${time}${away ? ` · ${dist} m from the shop` : ''}`);
  return { action: 'out', name: b.name, rec: { ...cur, ...upd } };
});

// =============== end-of-day summary ===============
export const sendDaySummary = onCall({ secrets: NOTIFY_SECRETS }, async req => {
  const me = await adminOf(req); if (!me || roleOf(me) === 'staff') throw new HttpsError('permission-denied', 'Only the shop can do this.');
  const info = await loadInfo(), to = normalizePhone((info.shop || {}).ownerPhone || '');
  if (!to) throw new HttpsError('failed-precondition', 'Add the owner’s mobile number in Shop setup → End-of-day summary.');
  const text = String(req.data && req.data.text || '').slice(0, 900);
  if (!text) throw new HttpsError('invalid-argument', 'Nothing to send.');
  const smsCfg = { apiKey: SEMAPHORE_API_KEY.value(), sender: SMS_SENDER_NAME.value() };
  const r = await sendSms(smsCfg, to, text);
  await logActivity(me, 'close', `Texted the day summary to the owner`);
  return { sms: r, to };
});
