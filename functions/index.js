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
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  validateRequest, policyOf, slotId, isActiveSlot, desiredSlots, slotStateFor, apptMins, startMs,
  verifyPaymongoSignature, rebookLink, newToken, tokenMatches, bookingCode, smsText, emailContent, eligibleBarbers,
  servicesById, blockTimes, phNow, addDays, normalizePhone, validEmail, parseSlotId, waitlistMatches,
  promoCheck, cleanCode, validProofImage
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

// Details used in emails and texts.
function view(id, a, info) {
  return {
    id, code: a.code, name: a.name, phone: a.phone, email: a.email, date: a.date, time: a.time,
    barberName: barberName(info, a.barberId),
    serviceNames: servicesById(info, a.serviceIds).map(s => (s ? s.name : 'Service')),
    depositMethod: a.deposit && a.deposit.method
  };
}

async function notify(kind, id, a, info, { sms = true, email = true, shop = null } = {}) {
  const v = view(id, a, info);
  const smsCfg = { apiKey: SEMAPHORE_API_KEY.value(), sender: SMS_SENDER_NAME.value() };
  const mailCfg = { user: SHOP_EMAIL.value(), pass: GMAIL_APP_PASSWORD.value(), fromName: (info.shop && info.shop.name) || 'Barbershop' };
  const results = {};
  if (sms && a.phone) results.sms = await sendSms(smsCfg, a.phone, smsText(kind, v, info));
  if (email && a.email && a.token) results.email = await sendEmail(mailCfg, a.email, emailContent(kind, v, info, bookingLink(id, a.token)));
  if (shop) results.shop = await sendEmail(mailCfg, SHOP_EMAIL.value(), emailContent(shop, v, info, `${site()}/admin/#schedule`));
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
async function isAdmin(req) { return !!(req.auth && (await db.doc(`admins/${req.auth.uid}`).get()).exists); }

// Loyalty: completed visits for the client behind a booking (matched by customer id, then phone).
async function loyaltyFor(a, info) {
  const every = Math.max(0, parseInt(info.shop && info.shop.loyaltyEvery, 10) || 0);
  if (!every) return null;
  let cid = a.customerId;
  if (!cid && a.phone) { const c = await db.collection('customers').where('phoneKey', '==', normalizePhone(a.phone)).limit(1).get(); cid = c.empty ? '' : c.docs[0].id; }
  const visits = cid ? (await db.collection('sales').where('customerId', '==', cid).count().get()).data().count : 0;
  return { every, visits, nextFree: (visits + 1) % every === 0 };
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
    refs[pick].forEach((r, i) => tx.set(r, { barberId: b, date: v.date, time: v.times[i], state: 'held', holdUntil, bookingId: id }));
    tx.set(apptRef(id), {
      code: bcode, token, source: 'online', status: 'pending_payment', notify: true, payMethod: manual ? 'gcash' : 'online', ...(promo ? { promo } : {}),
      name: v.name, phone: v.phone, email: v.email, notes: v.notes, customerId: '',
      serviceIds: v.serviceIds, mins: v.mins, date: v.date, time: v.time, startAt: v.at, barberId: b,
      blocks: refs[pick].map(r => r.id), holdUntil, guests: gid ? [gid] : [],
      deposit: { amount: pol.deposit, status: 'unpaid' }, reminders: {}, reschedules: 0, createdAt: now
    });
    if (vg) {
      const gb = vg.barbers[gpick];
      grefs[gpick].forEach((r, i) => tx.set(r, { barberId: gb, date: vg.date, time: vg.times[i], state: 'held', holdUntil, bookingId: gid }));
      tx.set(apptRef(gid), {
        code: bookingCode(), token: newToken(), source: 'online', status: 'pending_payment', notify: false, groupOf: id, bookedBy: v.name, payMethod: manual ? 'gcash' : 'online',
        name: vg.name, phone: v.phone, email: v.email, notes: v.notes, customerId: '',
        serviceIds: vg.serviceIds, mins: vg.mins, date: vg.date, time: vg.time, startAt: vg.at, barberId: gb,
        blocks: grefs[gpick].map(r => r.id), holdUntil,
        deposit: { amount: pol.deposit, status: 'unpaid' }, reminders: {}, reschedules: 0, createdAt: now
      });
    }
    if (promo) tx.set(db.doc(`promos/${promo.code}`), { uses: FieldValue.increment(1) }, { merge: true });
    return { barberId: b };
  });
  if (result.taken === 'main') throw new HttpsError('already-exists', 'Sorry, that time was just taken. Please pick another time.');
  if (result.taken === 'guest') throw new HttpsError('already-exists', 'Sorry, the second person’s slot was just taken. Pick another option for them.');
  const barberId = result.barberId, people = vg ? 2 : 1;
  if (manual) return { id, token, checkoutUrl: `booking.html?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}` };

  try {
    const shop = (info.shop && info.shop.name) || 'Barbershop';
    const link = bookingLink(id, token);
    const cs = await createCheckout(PAYMONGO_SECRET_KEY.value(), {
      amount: pol.deposit * people,
      itemName: people > 1 ? `Booking deposits for 2 people · ${bcode}` : `Booking deposit · ${bcode}`,
      description: `${shop}: ${servicesById(info, v.serviceIds).map(s => s.name).join(', ')} with ${barberName(info, barberId)}, ${v.date} ${v.time}`,
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
    const perPerson = guests.length ? (a.deposit && a.deposit.amount) : (amount ?? (a.deposit && a.deposit.amount));
    const deposit = { ...(a.deposit || {}), status: 'paid', method, amount: perPerson, paidAt: now, checkoutId: cs.id || '', paymentId: pay.id || '', livemode: !!sig.livemode };
    for (const gx of guests) {
      const gdep = { ...(gx.a.deposit || {}), status: 'paid', method, amount: perPerson, paidAt: now, checkoutId: cs.id || '', paidWith: id };
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
  const services = servicesById(info, a.serviceIds);
  return {
    id, code: a.code, status: a.status, date: a.date, time: a.time, startAt, mins: a.mins,
    barberId: a.barberId, barberName: barberName(info, a.barberId),
    serviceIds: a.serviceIds, services: services.map(s => s ? { name: s.name, price: s.price, priceFrom: !!s.priceFrom } : { name: 'Service', price: 0 }),
    name: a.name, deposit: { amount: a.deposit && a.deposit.amount, status: a.deposit && a.deposit.status, method: a.deposit && a.deposit.method },
    holdUntil: a.holdUntil || 0,
    checkoutUrl: a.status === 'pending_payment' && (a.holdUntil || 0) > now ? a.checkoutUrl || '' : '',
    canReschedule: a.status === 'booked' && startAt - now >= pol.rescheduleHours * 3600e3 && (a.reschedules || 0) < pol.maxReschedules,
    canCancel: a.status === 'booked' && startAt > now,
    policy: { deposit: pol.deposit, rescheduleHours: pol.rescheduleHours, lateMinutes: pol.lateMinutes, holdMinutes: pol.holdMinutes },
    payMethod: a.payMethod || 'online', proof: a.proof ? { status: a.proof.status, at: a.proof.at, note: a.proof.note || '' } : null,
    gcash: a.payMethod === 'gcash' ? { number: (info.shop && info.shop.gcashNumber) || '', name: (info.shop && info.shop.gcashName) || '' } : null,
    promo: a.promo || null, late: a.late || null, rating: a.rating || null, groupOf: a.groupOf || '', source: a.source || 'online'
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
    guests.push({ id: gid, token: ga.token, name: ga.name, status: ga.status, date: ga.date, time: ga.time, barberName: barberName(info, ga.barberId), services: servicesById(info, ga.serviceIds).filter(Boolean).map(x => x.name) });
  }
  const cut = a.status === 'done' ? await db.doc(`cuts/${id}`).get() : null;
  return { ...publicView(id, a, info), loyalty: await loyaltyFor(a, info), guests, rebook: rebookLink('.', a, info), queue: await queueFor(a), cutPhoto: cut && cut.exists ? cut.data().img || '' : '' };
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

// =============== on the day ===============
// Walk-in QR: someone standing in the shop joins today's queue. No deposit; the front desk calls them in order.
export const joinQueue = onCall(async req => {
  const info = await loadInfo(), now = Date.now(), t = phNow(now);
  const dow = new Date(`${t.date}T00:00:00Z`).getUTCDay(), h = (info.hours || []).find(x => x.d === dow);
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
      token, code: bookingCode(), notify: false, customerId: '', fromQr: true, createdAt: now });
    return { id: ref.id, token, queueNo };
  });
  if (!out.token) throw new HttpsError('already-exists', 'You’re already in the queue. Ask the front desk.');
  return out;
});

export const runningLate = onCall(async req => {
  const { id, a } = await bookingFromToken(req.data);
  const info = await loadInfo(), pol = policyOf(info), now = Date.now();
  const mins = Math.max(5, Math.min(pol.lateMinutes ? pol.lateMinutes - 1 : 30, parseInt(req.data && req.data.mins, 10) || 10));
  const startAt = a.startAt || startMs(a.date, a.time);
  if (a.status !== 'booked' || now > startAt + pol.lateMinutes * 60e3 || startAt - now > 3 * 3600e3) throw new HttpsError('failed-precondition', 'You can only tell us this on the day, close to your time.');
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
  return { ...publicView(id, { ...a, rating }, info), loyalty: await loyaltyFor(a, info), rebook: rebookLink('.', a, info) };
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
    const upd = { status: 'cancelled', cancelledBy: 'customer', cancelledAt: Date.now(), 'deposit.status': a.deposit && a.deposit.status === 'paid' ? 'kept' : (a.deposit && a.deposit.status) || 'unpaid' };
    tx.update(apptRef(id), upd);
    return { ...a, status: 'cancelled' };
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
export const syncSlots = onDocumentWritten({ document: 'appointments/{id}', secrets: NOTIFY_SECRETS }, async event => {
  const id = event.params.id;
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const infoSnap = await db.doc('public/info').get();
  if (!infoSnap.exists) return;
  const info = infoSnap.data();
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
