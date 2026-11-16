// A client's receipt, opened from the link in their receipt email or their booking page.
// receipt.html?id=<sale id>&t=<token written at checkout>
import { db, call, demoBar } from './fb.js';
import { $, esc, STARTER, brand, BACK_IC, receiptHTML } from './shared.js';

const qs = new URLSearchParams(location.search), id = qs.get('id') || '', t = qs.get('t') || '';
let shop = { ...STARTER.shop };
function page(inner) {
  $('#app').innerHTML = `${demoBar ? demoBar('admin/') : ''}<header class="site-head"><div class="wrap head-in"><a class="wordmark" href="./">${brand(shop.wordmark || shop.name)}</a><nav class="site-nav"><a class="btn btn-accent btn-sm" href="./#book">Book again</a></nav></div></header>
  <main class="wrap rc-page"><a class="pop-back page-back-link" href="./" style="justify-self:start">${BACK_IC}<span>Back to the website</span></a>${inner}</main>`;
}
page('<p class="muted"><span class="spinner"></span> Loading your receipt…</p>');
db.doc('public/info').get().then(s => { if (s.exists) shop = { ...shop, ...(s.data().shop || {}) }; }).catch(() => {});
(async () => {
  try {
    const r = await call('getReceipt', { id, t });
    shop = { ...shop, ...(r.shop || {}) };
    document.title = `Receipt · ${shop.name || 'REAL Barbers'}`;
    page(`${receiptHTML(r, shop.currency || '₱')}<div class="rc-actions"><a class="btn btn-accent" href="./#book">Book your next visit</a></div>
      <p class="muted small" style="text-align:center;max-width:420px">Keep this link to see your receipt again. Questions about it? Call or message ${esc(shop.name || 'the shop')}${shop.phone ? ` at ${esc(shop.phone)}` : ''}.</p>`);
  } catch (e) {
    page(`<div class="status-hero"><h1>Receipt not found</h1><p class="muted">${esc(e.message || 'Check the link and try again.')}</p></div>`);
  }
})();
