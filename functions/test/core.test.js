// Run with: npm test   (inside functions/). Uses only Node's built-in test runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  validateRequest, normalizePhone, blockTimes, slotId, isActiveSlot, desiredBlocks, eligibleBarbers,
  verifyPaymongoSignature, phNow, startMs, smsText, emailContent
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
  assert.deepEqual(phNow(NOW), { date: '2026-11-04', min: 600 });
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
