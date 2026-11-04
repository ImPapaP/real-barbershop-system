// Outside services: PayMongo (payments), Semaphore (SMS) and Gmail (email).
import nodemailer from 'nodemailer';
import * as logger from 'firebase-functions/logger';

// ---------- PayMongo ----------
const PAYMONGO = 'https://api.paymongo.com/v1';
const basic = key => 'Basic ' + Buffer.from(`${key}:`).toString('base64');

export async function createCheckout(key, o) {
  const res = await fetch(`${PAYMONGO}/checkout_sessions`, {
    method: 'POST',
    headers: { Authorization: basic(key), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data: { attributes: {
      // PayMongo amounts are in centavos: ₱200 = 20000
      line_items: [{ name: o.itemName, amount: Math.round(o.amount * 100), currency: 'PHP', quantity: 1 }],
      payment_method_types: o.methods,
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
      description: o.description,
      reference_number: o.reference,
      send_email_receipt: true,
      show_description: true,
      show_line_items: true,
      billing: o.billing,
      metadata: { bookingId: o.reference }
    } } })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PayMongo ${res.status}: ${JSON.stringify(body.errors || body)}`);
  return { id: body.data.id, url: body.data.attributes.checkout_url };
}

export async function expireCheckout(key, id) {
  if (!id) return;
  try {
    await fetch(`${PAYMONGO}/checkout_sessions/${encodeURIComponent(id)}/expire`, { method: 'POST', headers: { Authorization: basic(key), Accept: 'application/json' } });
  } catch (e) { logger.warn('Could not expire checkout session', id, e.message); }
}

// ---------- Semaphore SMS ----------
export async function sendSms({ apiKey, sender }, number, message) {
  if (!apiKey || apiKey === 'none' || !number || !message) return false;
  const body = new URLSearchParams({ apikey: apiKey, number, message });
  if (sender) body.set('sendername', sender);
  try {
    const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', body });
    if (!res.ok) { logger.error('SMS failed', res.status, await res.text().catch(() => '')); return false; }
    return true;
  } catch (e) { logger.error('SMS failed', e.message); return false; }
}

// ---------- Gmail ----------
let transport = null, transportUser = '';
export async function sendEmail({ user, pass, fromName }, to, msg) {
  if (!user || !pass || pass === 'none' || !to) return false;
  if (!transport || transportUser !== user) {
    transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    transportUser = user;
  }
  try {
    await transport.sendMail({ from: `"${String(fromName || '').replace(/"/g, '')}" <${user}>`, to, subject: msg.subject, html: msg.html, text: msg.text });
    return true;
  } catch (e) { logger.error('Email failed', e.message); return false; }
}
