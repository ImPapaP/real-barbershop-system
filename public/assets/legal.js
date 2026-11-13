// Booking Terms and Privacy Policy. Filled in from the shop's own settings (deposit, late rule, contact),
// so they stay in line with what the booking form says.
import { db, demoBar } from './fb.js';
import { $, esc, money, policyOf, STARTER, brand } from './shared.js';

const PAGE = document.body.dataset.page;
const UPDATED = '13 November 2026';

function terms(I) {
  const sh = I.shop, p = policyOf(I), m = n => money(n, sh.currency || '₱');
  return { title: 'Booking Terms', lead: `These terms apply when you book an appointment at ${sh.name} online, by phone or through Facebook. By ticking “I agree” when you book, you accept them.`, sections: [
    ['1. Your booking', [`A booking is for <b>one person</b> and the services you picked. Booking for someone else too? Add them as a second person, or make a separate booking.`, `You need a valid mobile number and email. We send your confirmation, booking link and reminders there.`, `Prices on the website are in Philippine pesos. Prices shown as “starts at” depend on hair length and the products used; your barber or stylist will tell you the final price before starting.`]],
    ['2. Down payment', [`Online bookings need a <b>${m(p.deposit)} down payment per person</b> to confirm the slot. Your slot is held for ${p.holdMinutes} minutes while you pay; if payment isn’t finished, the slot is released and nothing is charged.`, `The down payment is deducted from your bill at the shop.`, `Payments are processed by PayMongo (GCash, Maya, cards, QR Ph). We never see or store your card or e-wallet details.`]],
    ['3. Arriving late', [`Please arrive on time. Arriving <b>${p.lateMinutes} minutes late or more</b> cancels the booking, and the down payment is not refunded.`]],
    ['4. Rescheduling and cancelling', [`You can reschedule online up to <b>${p.rescheduleHours} hours</b> before your appointment, using the link in your confirmation email, up to ${p.maxReschedules} times.`, `If you cancel, or don’t come (no-show), the down payment is not refunded.`, `If we have to cancel or move your appointment (for example, your barber is sick), we’ll contact you to rebook, or refund your down payment in full.`]],
    ['5. If a slot is taken while you pay', [`Rarely, a payment arrives after your hold ran out and someone else took the time. We’ll call you to pick a new time or refund you in full.`]],
    ['6. At the shop', [`Tell your barber or stylist about allergies, scalp conditions or recent chemical treatments before your service. Results of color and chemical treatments depend on your hair’s condition.`, `Please treat our staff and other clients with respect. We may refuse service in case of abusive behavior.`]],
    ['7. Changes to these terms', [`We may update these terms. The version on this page when you book is the one that applies to that booking.`]],
    ['8. Contact', [`${esc(sh.name)}, ${esc(sh.address)}. Phone ${esc(sh.phone)}${sh.email ? `, email <a href="mailto:${esc(sh.email)}">${esc(sh.email)}</a>` : ''}.`]]
  ]};
}
function privacy(I) {
  const sh = I.shop;
  return { title: 'Privacy Policy', lead: `${sh.name} respects your privacy. This policy explains what personal information we collect when you book, why, and your rights under the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).`, sections: [
    ['1. What we collect', [`<b>When you book:</b> your name, mobile number, email, the services, barber, date and time you pick, and any notes you write. If you add a second person, their name and services.`, `<b>When you pay:</b> the payment status, method and amount from PayMongo. We don’t receive your card or e-wallet details.`, `<b>At the shop:</b> your visits, services and what you paid, so we can keep your loyalty stamps and history.`]],
    ['2. Why we use it', [`To confirm and manage your booking, and send your confirmation, booking link and reminders by text and email.`, `To keep your loyalty stamps and visit history, and remind you when it’s time for your next cut (you can opt out any time).`, `To tell you when a slot you waitlisted for opens up.`, `For our own records, such as bookkeeping. We don’t sell your information or use it for third-party advertising.`]],
    ['3. Who we share it with', [`Only the services that run the booking system for us: Google Firebase (hosting and database), PayMongo (payments), Semaphore (text messages) and Gmail (emails). They process your information for us and under their own security standards.`, `We may share information if the law requires it.`]],
    ['4. How long we keep it', [`Booking and visit records are kept while you are a client and for up to 5 years after your last visit for our records, then deleted. You can ask us to delete them sooner (see your rights below).`]],
    ['5. Cookies and storage on your phone', [`This website doesn’t use advertising or tracking cookies, or analytics.`, `If you tick “Remember my details on this phone”, your name, number, email and last booking are saved <b>only in your own browser</b>, so the form is filled in next time. Tap “Not you?” on the booking form, or clear your browser’s site data, to remove them.`, `Your browser also keeps a short note of your latest booking so you can get back to it, and the site loads fonts from Google Fonts, which sees your device’s IP address.`]],
    ['6. Your rights', [`Under the Data Privacy Act you can: ask what information we hold about you; ask us to correct it; ask us to delete it or stop using it; object to reminders; and complain to the National Privacy Commission (<a href="https://privacy.gov.ph" target="_blank" rel="noopener">privacy.gov.ph</a>).`, `To use any of these rights, contact us below. We’ll reply within 15 days.`]],
    ['7. Security', [`Your booking can only be opened with the private link sent to you. Only authorized staff can sign in to our dashboard. No system is perfectly secure, but we take reasonable steps to protect your information.`]],
    ['8. Contact', [`${esc(sh.name)}, ${esc(sh.address)}. Phone ${esc(sh.phone)}${sh.email ? `, email <a href="mailto:${esc(sh.email)}">${esc(sh.email)}</a>` : ''}.`]]
  ]};
}
function render(I) {
  const doc = (PAGE === 'privacy' ? privacy : terms)(I), sh = I.shop;
  document.title = `${doc.title} · ${sh.name}`;
  $('#app').innerHTML = `${demoBar ? demoBar('admin/') : ''}<header class="site-head"><div class="wrap head-in"><a class="wordmark" href="./">${brand(sh.wordmark || sh.name)}</a><nav class="site-nav"><a class="btn btn-accent btn-sm" href="./#book">Book now</a></nav></div></header>
  <main class="wrap legal"><p class="eyebrow">${esc(sh.name)}</p><h1>${esc(doc.title)}</h1><p class="muted small">Last updated ${UPDATED}</p><p class="legal-lead">${esc(doc.lead)}</p>
    ${doc.sections.map(([h, ps]) => `<section><h2>${esc(h)}</h2>${ps.map(t => `<p>${t}</p>`).join('')}</section>`).join('')}
    <p class="muted small" style="margin-top:28px">See also: ${PAGE === 'privacy' ? '<a href="terms.html">Booking Terms</a>' : '<a href="privacy.html">Privacy Policy</a>'} · <a href="./">Back to the website</a></p></main>`;
}
render({ ...STARTER });
db.doc('public/info').get().then(s => { if (s.exists) render({ ...STARTER, ...s.data(), shop: { ...STARTER.shop, ...(s.data().shop || {}) } }); }).catch(() => {});
