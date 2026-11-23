// Run with: npm test   (inside functions/). Uses only Node's built-in test runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  validateRequest, normalizePhone, blockTimes, slotId, isActiveSlot, desiredBlocks, eligibleBarbers,
  verifyPaymongoSignature, phNow, startMs, smsText, emailContent, cleanBday
} from '../src/core.js';

const info = {
  shop: { name: 'REAL Barbers', address: 'Antipolo', phone: '0906 567 4507' },
  policy: { deposit: 200, holdMinutes: 15, leadMinutes: 60, bookAheadDays: 30, step: 30 },
  hours: [0, 1, 2, 3, 4, 5, 6].map(d => ({ d, open: '09:00', close: '20:00', closed: d === 1 })),
  services: [
    { id: 'cut', name: 'Deluxe Haircut', price: 399, mins: 60, group: 'him', active: true },
    { id: 'beard', name: 'Beard Sculpting', price: 230, mins: 30, group: 'him', active: true },
    { id: 'blow', name: 'Blow Dry', price: 230, mins: 60, group: 'her', active: true },
    { id: 'old', name: 'Old', price: 1, mins: 30, group: 'him', active: false }
  ],
  barbers: [
    { id: 'rey', name: 'Reymart', days: [0, 2, 3, 4, 5, 6], groups: ['him'], chair: 1 },
    { id: 'lyn', name: 'Lyndon', days: [0, 2, 3, 4, 5, 6], groups: ['him'], chair: 2 },
    { id: 'dave', name: 'Dave', days: [0, 2, 3, 4, 5, 6], groups: ['her'], chair: 3 }
  ]
};
// Wed 4 Nov 2026, 10:00 PH time
const NOW = Date.parse('2026-11-04T10:00:00+08:00');
const base = { name: 'Juan', phone: '0917 123 4567', email: 'juan@example.com', consent: true, serviceIds: ['cut'], date: '2026-11-05', time: '14:00' };

test('phone numbers normalise to 09XXXXXXXXX', () => {
  assert.equal(normalizePhone('+63 917 123 4567'), '09171234567');
  assert.equal(normalizePhone('639171234567'), '09171234567');
  assert.equal(normalizePhone('9171234567'), '09171234567');
  assert.equal(normalizePhone('12345'), '');
});

test('PH time helpers', () => {
  assert.deepEqual(phNow(NOW), { date: '2026-11-04', min: 600, time: '10:00' });
  assert.equal(startMs('2026-11-04', '10:00'), NOW);
});

test('valid request picks eligible barbers and blocks', () => {
  const v = validateRequest(info, { ...base, serviceIds: ['cut', 'beard'] }, NOW);
  assert.equal(v.ok, true);
  assert.equal(v.mins, 90);
  assert.deepEqual(v.times, ['14:00', '14:30', '15:00']);
  assert.deepEqual(v.barbers, ['rey', 'lyn']);
});

test('request rules', () => {
  const bad = (patch, msg) => { const v = validateRequest(info, { ...base, ...patch }, NOW); assert.equal(v.ok, false, msg); return v.error; };
  bad({ consent: false }, 'consent');
  bad({ email: 'nope' }, 'email');
  bad({ serviceIds: ['old'] }, 'inactive service');
  bad({ serviceIds: ['cut', 'blow'] }, 'mixed groups');
  bad({ date: '2026-11-09' }, 'closed Monday');
  bad({ time: '19:30' }, 'runs past closing');
  bad({ time: '14:15' }, 'off-grid');
  bad({ date: '2026-11-04', time: '10:30' }, 'inside lead time');
  bad({ date: '2026-12-20' }, 'too far ahead');
  bad({ barberId: 'dave' }, 'barber cannot do men’s cut');
  assert.equal(validateRequest(info, { ...base, date: '2026-11-04', time: '11:00' }, NOW).ok, true);
});

test('eligible barbers respect days and groups', () => {
  assert.deepEqual(eligibleBarbers(info, [info.services[2]], '2026-11-05', ''), ['dave']);
  assert.deepEqual(eligibleBarbers(info, [info.services[0]], '2026-11-05', 'lyn'), ['lyn']);
});

test('slot helpers', () => {
  assert.deepEqual(blockTimes('09:00', 60, 30), ['09:00', '09:30']);
  assert.equal(slotId('rey', '2026-11-05', '09:30'), 'rey_20261105_0930');
  assert.equal(isActiveSlot({ state: 'held', holdUntil: NOW + 1 }, NOW), true);
  assert.equal(isActiveSlot({ state: 'held', holdUntil: NOW - 1 }, NOW), false);
  assert.equal(isActiveSlot({ state: 'booked' }, NOW), true);
  const appt = { status: 'booked', source: 'phone', barberId: 'rey', date: '2026-11-05', time: '09:00', serviceIds: ['cut'] };
  assert.deepEqual(desiredBlocks(appt, info), ['rey_20261105_0900', 'rey_20261105_0930']);
  assert.deepEqual(desiredBlocks({ ...appt, status: 'cancelled' }, info), []);
  assert.deepEqual(desiredBlocks({ ...appt, source: 'walk-in' }, info), []);
});

test('PayMongo signature check', () => {
  const secret = 'whsk_test', body = '{"data":{"id":"evt_1"}}', t = Math.floor(NOW / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.deepEqual(verifyPaymongoSignature(`t=${t},te=${sig},li=`, body, secret, { now: NOW }), { ok: true, livemode: false });
  assert.deepEqual(verifyPaymongoSignature(`t=${t},te=,li=${sig}`, body, secret, { now: NOW }), { ok: true, livemode: true });
  assert.equal(verifyPaymongoSignature(`t=${t},te=${sig},li=`, body + ' ', secret, { now: NOW }).ok, false);
  assert.equal(verifyPaymongoSignature(`t=${t},te=${sig},li=`, body, 'other', { now: NOW }).ok, false);
  assert.equal(verifyPaymongoSignature(`t=${t - 3600},te=${sig},li=`, body, secret, { now: NOW }).ok, false);
});

test('messages', () => {
  const b = { code: 'AB12CD', name: 'Juan', date: '2026-11-05', time: '14:00', barberName: 'Reymart', serviceNames: ['Deluxe Haircut'] };
  const sms = smsText('confirmed', b, info);
  assert.match(sms, /Thu 5 Nov, 2:00 PM/);
  assert.doesNotMatch(sms, /https?:/);
  assert.ok(!/^TEST/i.test(sms));
  const mail = emailContent('confirmed', b, info, 'https://x.web.app/booking.html?id=1&t=2');
  assert.match(mail.subject, /Booking confirmed/);
  assert.match(mail.html, /booking\.html\?id=1&amp;t=2/);
});

import { windowOf, parseSlotId, waitlistMatches } from '../src/core.js';
test('waitlist helpers', () => {
  assert.equal(windowOf('09:30'), 'morning');
  assert.equal(windowOf('13:00'), 'afternoon');
  assert.equal(windowOf('18:30'), 'evening');
  assert.deepEqual(parseSlotId('rey_20261105_1430'), { barberId: 'rey', date: '2026-11-05', time: '14:30' });
  assert.deepEqual(parseSlotId('a_b_20261105_0900'), { barberId: 'a_b', date: '2026-11-05', time: '09:00' });
  const slot = { barberId: 'rey', time: '14:30' };
  assert.equal(waitlistMatches({ barberId: '', window: 'any' }, slot), true);
  assert.equal(waitlistMatches({ barberId: 'lyn', window: 'any' }, slot), false);
  assert.equal(waitlistMatches({ barberId: 'rey', window: 'morning' }, slot), false);
  assert.equal(waitlistMatches({ barberId: 'rey', window: 'afternoon' }, slot), true);
});
test('trim reminder and slot-opened messages', () => {
  const p = { name: 'Juan dela Cruz', date: '2026-11-06', time: '14:30', barberName: 'Reymart' };
  for (const k of ['rebook', 'slot_open']) {
    const sms = smsText(k, p, info);
    assert.ok(sms.length > 20 && !/https?:/.test(sms), k);
    assert.ok(!/^TEST/i.test(sms));
    const mail = emailContent(k, p, info, 'https://x.web.app/#book');
    assert.match(mail.html, /Book now/);
  }
  assert.match(smsText('rebook', p, info), /Hi Juan, it's been 4 weeks/);
  assert.match(smsText('slot_open', p, info), /Fri 6 Nov at 2:30 PM with Reymart/);
});

test('men pick one Deluxe or Regular haircut, plus add-ons, with the right barbers', () => {
  const t = {
    ...info,
    services: [
      { id: 'dlx', name: 'Deluxe Haircut', price: 399, mins: 60, group: 'him', kind: 'base', tier: 'deluxe', active: true },
      { id: 'bl1', name: 'BL1 · Deluxe + Beard', price: 600, mins: 60, group: 'him', kind: 'base', tier: 'deluxe', includes: ['beard'], active: true },
      { id: 'reg', name: 'Regular Haircut', price: 249, mins: 60, group: 'him', kind: 'base', tier: 'regular', active: true },
      { id: 'beard', name: 'Beard Sculpting', price: 230, mins: 30, group: 'him', kind: 'extra', active: true },
      { id: 'blow', name: 'Blow Dry', price: 230, mins: 60, group: 'her', active: true }
    ],
    barbers: [
      { id: 'lyndon', groups: ['him'], tiers: ['deluxe'], days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'mac', groups: ['him'], tiers: ['regular'], days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'dave', groups: ['her'], days: [0, 1, 2, 3, 4, 5, 6] }
    ]
  };
  const go = ids => validateRequest(t, { ...base, serviceIds: ids }, NOW);
  assert.deepEqual(go(['dlx', 'beard']).barbers, ['lyndon']);
  assert.deepEqual(go(['reg', 'beard']).barbers, ['mac']);
  assert.match(go(['beard']).error, /haircut first/);
  assert.match(go(['dlx', 'reg']).error, /only one haircut/);
  assert.match(go(['bl1', 'beard']).error, /already part of BL1/);
  assert.match(validateRequest(t, { ...base, serviceIds: ['reg'], barberId: 'lyndon' }, NOW).error, /doesn’t do that haircut/);
  assert.equal(go(['blow']).ok, true); // women's services have no haircut rule
});

test('no online booking starts after the last booking time (7:00 PM by default)', () => {
  const t = { ...info, hours: [0, 1, 2, 3, 4, 5, 6].map(d => ({ d, open: '09:00', close: '20:00' })), services: [{ id: 'cut', name: 'Eyebrows', price: 120, mins: 15, group: 'him', active: true }], barbers: [{ id: 'mac', groups: ['him'], days: [0, 1, 2, 3, 4, 5, 6] }] };
  const at = time => validateRequest(t, { ...base, serviceIds: ['cut'], barberId: '', time }, NOW);
  assert.equal(at('19:00').ok, true);
  assert.match(at('19:30').error, /last booking of the day starts at 7:00 PM/);
  assert.equal(validateRequest({ ...t, policy: { lastBooking: '' } }, { ...base, serviceIds: ['cut'], barberId: '', time: '19:00' }, NOW).ok, true);
});

test('bookings start on the hour, and phone bookings at :30 block the hours they touch', () => {
  const t = { ...info, policy: { ...info.policy, step: undefined } }; delete t.policy.step;
  assert.equal(validateRequest(t, { ...base, time: '14:00' }, NOW).ok, true);
  assert.match(validateRequest(t, { ...base, time: '14:30' }, NOW).error, /listed times/);
  assert.deepEqual(blockTimes('10:00', 45, 60), ['10:00']);
  assert.deepEqual(blockTimes('10:00', 90, 60), ['10:00', '11:00']);
  assert.deepEqual(blockTimes('10:30', 45, 60), ['10:00', '11:00']);
});

test('"Book again" link keeps the same services and barber, dropping anything no longer offered', async () => {
  const { rebookLink } = await import('../src/core.js');
  const inf = { services: [{ id: 'h1' }, { id: 'h6' }, { id: 'old', active: false }], barbers: [{ id: 'lyndon' }, { id: 'left', active: false }] };
  assert.equal(rebookLink('https://r3albarbers.com/', { serviceIds: ['h1', 'h6'], barberId: 'lyndon' }, inf), 'https://r3albarbers.com/?svc=h1,h6&barber=lyndon#book');
  assert.equal(rebookLink('https://x.app', { lines: [{ kind: 'service', ref: 'h1' }, { kind: 'product', ref: 'p' }, { kind: 'service', ref: 'old' }], barberId: 'left' }, inf), 'https://x.app/?svc=h1#book');
  assert.equal(rebookLink('.', {}, inf), './#book');
});

import { promoCheck, cleanCode, validProofImage } from '../src/core.js';
test('promo codes: percent, amount, expiry, limits', () => {
  assert.deepEqual(promoCheck({ kind: 'percent', value: 10 }, 399, '2026-11-13'), { ok: true, off: 39, label: '10% off' });
  assert.equal(promoCheck({ kind: 'amount', value: 500 }, 399, '2026-11-13').off, 399);
  assert.equal(promoCheck({ kind: 'amount', value: 50, expires: '2026-11-01' }, 399, '2026-11-13').ok, false);
  assert.equal(promoCheck({ kind: 'amount', value: 50, maxUses: 5, uses: 5 }, 399, '2026-11-13').ok, false);
  assert.equal(promoCheck({ kind: 'amount', value: 50, active: false }, 399, '2026-11-13').ok, false);
  assert.equal(promoCheck({ kind: 'amount', value: 50, minSpend: 500 }, 399, '2026-11-13').ok, false);
  assert.equal(cleanCode(' real-10 '), 'REAL10');
});
test('payment screenshots must be small images', () => {
  assert.equal(validProofImage('data:image/jpeg;base64,AAAA'), true);
  assert.equal(validProofImage('data:text/html;base64,AAAA'), false);
  assert.equal(validProofImage('data:image/jpeg;base64,' + 'A'.repeat(900000)), false);
});

test('cleanBday keeps a valid month-day and drops anything else', () => {
  assert.equal(cleanBday('3-7'), '03-07');
  assert.equal(cleanBday('02-29'), '02-29');
  assert.equal(cleanBday('02-30'), '');
  assert.equal(cleanBday('13-01'), '');
  assert.equal(cleanBday('0-5'), '');
  assert.equal(cleanBday(''), '');
});

test('receipts show the client only what they paid, never commission', async () => {
  const { receiptView, receiptSms } = await import('../src/core.js');
  const info = { shop: { name: 'REAL Barbers', loyaltyEvery: 10 } };
  const r = receiptView('s1', { date: '2026-11-16', time: '14:00', name: 'Juan Dela Cruz', customerId: 'c1', lines: [{ name: 'Deluxe Haircut', qty: 1, price: 399, ref: 'h1' }],
    total: 399, depositCredit: 200, method: 'Cash', commission: 199, rate: 50 }, info, 'Reymart', 4);
  assert.equal(r.paidAtShop, 199);
  assert.equal(r.commission, undefined);
  assert.deepEqual(r.loyalty, { every: 10, visits: 4 });
  const t = receiptSms(r, info);
  assert.match(t, /Deluxe Haircut P399/); assert.match(t, /paid P199 Cash \+ P200 deposit/); assert.doesNotMatch(t, /http/);
  assert.equal(receiptView('s2', { name: 'Walk-in', lines: [] }, info).name, '');
});

test('client account shows bookings, paid visits with receipts, loyalty and book-again', async () => {
  const { accountView, queueItems } = await import('../src/core.js');
  const info = { shop: { loyaltyEvery: 5 }, services: [{ id: 'h1', name: 'Deluxe Haircut', mins: 60 }], barbers: [{ id: 'rey', name: 'Reymart' }] };
  const v = accountView({ phone: '09170000100', today: '2026-11-16', info,
    customers: [{ id: 'c0', name: 'Marco Reyes', birthday: '11-16' }],
    appts: [{ id: 'a1', token: 'tk', date: '2026-11-18', time: '10:00', status: 'booked', serviceIds: ['h1'], barberId: 'rey' }, { id: 'a0', date: '2026-11-01', time: '10:00', status: 'done', serviceIds: ['h1'] }],
    sales: [{ id: 's1', customerId: 'c0', date: '2026-11-01', time: '10:30', lines: [{ kind: 'service', ref: 'h1', name: 'Deluxe Haircut', qty: 1 }], barberId: 'rey', total: 399, rtoken: 'rt', commission: 199 }] });
  assert.equal(v.name, 'Marco Reyes');
  assert.equal(v.upcoming.length, 1); assert.equal(v.upcoming[0].barberName, 'Reymart');
  assert.deepEqual(v.visits[0].receipt, { id: 's1', t: 'rt' }); assert.equal(v.visits[0].commission, undefined);
  assert.deepEqual(v.again, { svc: ['h1'], barber: 'rey' });
  assert.equal(v.loyalty.visits, 1);
  const q = queueItems([{ date: '2026-11-16', status: 'waiting', time: '09:40', serviceIds: ['h1'], name: 'Secret' }, { date: '2026-11-16', status: 'done', time: '09:00' }], info, '2026-11-16');
  assert.equal(q.items.length, 1); assert.equal(q.items[0].m, 60); assert.equal(JSON.stringify(q).includes('Secret'), false);
});

test('no down payment for junior barbers, including "any available" when only juniors can do it', async () => {
  const { depositFor } = await import('../src/core.js');
  const info = { policy: { deposit: 200 }, barbers: [{ id: 'rey', tiers: ['deluxe'], groups: ['him'] }, { id: 'jay', tiers: ['regular'], groups: ['him'], noDeposit: true }] };
  const regular = [{ id: 'h9', group: 'him', tier: 'regular' }], deluxe = [{ id: 'h1', group: 'him', tier: 'deluxe' }];
  assert.equal(depositFor(info, 'jay', regular), 0);
  assert.equal(depositFor(info, 'rey', deluxe), 200);
  assert.equal(depositFor(info, '', regular), 0);
  assert.equal(depositFor(info, '', deluxe), 200);
  // any available where a senior and a junior could both do it: no down payment (only seniors take one)
  const both = { ...info, barbers: [...info.barbers, { id: 'lyn', tiers: ['regular', 'deluxe'], groups: ['him'] }] };
  assert.equal(depositFor(both, '', regular), 0);
});

test('late limit and refund depend on whether the booking has a down payment', async () => {
  const { lateLimit, refundOnCancel, cleanOptions, withOption } = await import('../src/core.js');
  const pol = { lateMinutes: 5, lateMinutesDeposit: 20, cancelHours: 48 };
  const senior = { deposit: { amount: 200, status: 'paid' }, startAt: Date.now() + 72 * 3600e3 }, junior = { deposit: { amount: 0, status: 'none' } };
  assert.equal(lateLimit(senior, pol), 20); assert.equal(lateLimit(junior, pol), 5);
  assert.equal(refundOnCancel(senior, pol), true);
  assert.equal(refundOnCancel({ ...senior, startAt: Date.now() + 24 * 3600e3 }, pol), false);
  assert.equal(refundOnCancel(junior, pol), false);
  const info = { services: [{ id: 'n1', name: 'Manicure', price: 160, options: [{ id: 'reg', name: 'Regular polish', add: 30 }] }] };
  assert.deepEqual(cleanOptions(info, ['n1'], { n1: 'reg', x: 'y' }), { n1: 'reg' });
  assert.deepEqual(cleanOptions(info, ['n1'], { n1: 'fake' }), {});
  const s = withOption(info.services[0], { n1: 'reg' }); assert.equal(s.price, 190); assert.equal(s.name, 'Manicure + Regular polish');
});

test('a barber on leave is not offered that day, and 0-minute add-ons fit in the hour', async () => {
  const { eligibleBarbers } = await import('../src/core.js');
  const info = { barbers: [{ id: 'v', days: [0, 1, 2, 3, 4, 5, 6], groups: ['him'], tiers: ['regular'], off: ['2026-12-01'] }] };
  const svc = [{ id: 'h9', group: 'him', tier: 'regular' }];
  assert.deepEqual(eligibleBarbers(info, svc, '2026-12-01'), []);
  assert.deepEqual(eligibleBarbers(info, svc, '2026-12-02'), ['v']);
});

test('late fines: 9:01 is late, each started 15 minutes costs the rate', async () => {
  const { lateFine, lateRateOf } = await import('../src/core.js');
  assert.deepEqual(lateFine('09:00', '09:00', 50), { mins: 0, blocks: 0, fine: 0 });
  assert.deepEqual(lateFine('08:40', '09:00', 50), { mins: 0, blocks: 0, fine: 0 });
  assert.equal(lateFine('09:01', '09:00', 15).fine, 15);
  assert.equal(lateFine('09:15', '09:00', 15).fine, 15);
  assert.equal(lateFine('09:16', '09:00', 15).fine, 30);
  assert.equal(lateFine('09:31', '09:00', 50).fine, 150);
  assert.equal(lateRateOf({ role: 'barber', tiers: ['deluxe'] }), 50);
  assert.equal(lateRateOf({ role: 'barber', tiers: ['regular'] }), 15);
  assert.equal(lateRateOf({ role: 'reception' }), 0);
  assert.equal(lateRateOf({ role: 'reception', lateFine: 20 }), 20);
});

test('client coupons: live until used or expired, labels, shown on My visits', async () => {
  const { couponLive, couponLabel, accountView } = await import('../src/core.js');
  assert.equal(couponLive({ kind: 'amount', value: 100 }, '2026-11-21'), true);
  assert.equal(couponLive({ kind: 'amount', value: 100, used: true }, '2026-11-21'), false);
  assert.equal(couponLive({ kind: 'amount', value: 100, expires: '2026-11-20' }, '2026-11-21'), false);
  assert.equal(couponLabel({ kind: 'percent', value: 20 }), '20% off');
  assert.equal(couponLabel({ kind: 'service', svcId: 'h2' }, [{ id: 'h2', name: 'Hair Spa' }]), 'Free Hair Spa');
  assert.equal(couponLabel({ kind: 'amount', value: 1000 }), '₱1,000 off');
  const v = accountView({ phone: '09170000100', customers: [{ id: 'c1', name: 'Marco', coupons: [{ id: 'k1', kind: 'amount', value: 100, note: 'Sorry for the wait' }, { id: 'k2', kind: 'amount', value: 50, used: true }] }], appts: [], sales: [], info: { services: [], shop: {} }, today: '2026-11-21' });
  assert.deepEqual(v.coupons, [{ id: 'k1', label: '₱100 off', note: 'Sorry for the wait', expires: '' }]);
});

test('owner two-step: where the code went is shown masked', async () => {
  const { maskEmail, maskPhone } = await import('../src/core.js');
  assert.equal(maskEmail('alex.reyes@gmail.com'), 'al••••••@gmail.com');
  assert.equal(maskEmail('al@x.com'), 'al•@x.com');
  assert.equal(maskEmail('nope'), '');
  assert.equal(maskPhone('09171234567'), '0917 ••• 4567');
  assert.equal(maskPhone(''), '');
});

test('split bill on the receipt: each part with its method', async () => {
  const { payLabel, receiptView } = await import('../src/core.js');
  assert.equal(payLabel({ method: 'GCash' }), 'GCash');
  assert.equal(payLabel({ method: 'Split', split: [{ m: 'Cash', amt: 200 }, { m: 'GCash', amt: 1150.5 }] }), 'Cash ₱200 + GCash ₱1,150.5');
  const r = receiptView('s1', { date: '2026-11-23', time: '10:00', total: 399, method: 'Split', split: [{ m: 'Cash', amt: 100 }, { m: 'GCash', amt: 299 }], lines: [] }, { shop: {} });
  assert.equal(r.method, 'Cash ₱100 + GCash ₱299');
  assert.equal(r.paidAtShop, 399);
});

test('system evaluation: answers are checked before saving', async () => {
  const { cleanEvaluation } = await import('../src/core.js');
  const answers = Object.fromEntries(['fs1', 'fs2', 'fs3', 'pe1', 'pe2', 'pe3', 'us1', 'us2', 'us3', 're1'].map(k => [k, 4]));
  assert.equal(cleanEvaluation({ group: 'client', answers, consent: true }).ok, true);
  assert.equal(cleanEvaluation({ group: 'hacker', answers, consent: true }).ok, false);
  assert.equal(cleanEvaluation({ group: 'client', answers }).ok, false); // no consent
  assert.equal(cleanEvaluation({ group: 'client', answers: { fs1: 5 }, consent: true }).ok, false); // too few
  const r = cleanEvaluation({ group: 'it', answers: { ...answers, se1: 5, fs1: 9, bad_key: 5, 'x1': '3' }, name: 'A'.repeat(99), comment: 'ok\u0007', consent: true });
  assert.equal(r.rec.answers.fs1, undefined); assert.equal(r.rec.answers.bad_key, undefined); assert.equal(r.rec.answers.x1, undefined);
  assert.equal(r.rec.name.length, 60); assert.equal(r.rec.comment, 'ok');
});
