// Dashboard · Shop setup, backups, Facebook photos, promos and promo codes, walk-in QR, Website page, client search.
import { DAYS_LONG, bdayDays, cleanBday, defaultFaq, esc, initials, priceLabel, resizeImage, sum } from '../shared.js';
import { call, db, deleteImage, demo, uploadImage } from '../fb.js';
import { drawBanner } from '../banner.js';
import { qrSvg } from '../qr.js';
import { S, STYLES, TAB_VIEWS } from './state.js';
import { $, ago, bdayWhen, chip, cur, custStats, field, fmtDate, icon, info, mark, money, newId, normPhone, opt, pageHead, patch, payExample, payRule, payType, pol, put, render, schedule, serviceStaff, services, short, shortDate, staffById, staffName, summary, toast, today } from './core.js';
import { vCheckout, vOverview, vSchedule } from './ops.js';
import { vMoney, vTeam } from './money.js';
import { vClients, vStock } from './clients.js';
import { cutField, mFoot, openModal } from './modals.js';
import { saveInfo, syncPublicBarbers } from './forms.js';
import { clockSetupPanel, pinPanel, signinsPanel } from './staffapp.js';

// ---------- tab: setup ----------
// ---------- backups ----------
// Download everything now (a JSON file that holds every record, and an Excel file of clients, sales and bookings).
// The server also saves a copy every Sunday at 3 AM (see weeklyBackup); the last one shows here.
export const BACKUP_COLS = ['staff', 'appointments', 'sales', 'expenses', 'customers', 'inventory', 'payouts', 'waitlist', 'attendance', 'promos', 'closings', 'leaves', 'timeclock', 'activity', 'payslips', 'advances'];
export function backupPanel() {
  if (S.backupInfo === undefined) { S.backupInfo = null; db.doc('private/backup').get().then(d => { S.backupInfo = d.exists ? d.data() : false; schedule(); }).catch(() => { S.backupInfo = false; }); }
  const b = S.backupInfo;
  return `<section class="panel"><div class="panel-h"><h2>Backups</h2></div>
    <p class="muted small" style="max-width:72ch">Keep a copy of the shop’s records somewhere safe. ${demo ? 'In the demo there is no automatic backup.' : b ? `Last automatic backup: <b>${new Date(b.last).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</b> (Firebase console → Storage → ${esc(b.file)}). A new one is saved every Sunday at 3 AM; the last 12 are kept.` : 'The automatic weekly backup starts once the backend is deployed (every Sunday at 3 AM).'}</p>
    <div class="row"><button class="btn btn-primary" data-act="backupJson" ${S.backingUp ? 'disabled' : ''}>${S.backingUp ? 'Preparing…' : 'Download full backup'}</button><button class="btn" data-act="backupXlsx" ${S.backingUp ? 'disabled' : ''}>Download clients, sales and bookings (Excel)</button></div></section>`;
}
export async function allRecords() {
  const out = { at: new Date().toISOString(), shop: info().shop.name, info: info() };
  for (const c of BACKUP_COLS) { try { out[c] = (await db.collection(c).get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (_) { out[c] = []; } }
  return out;
}
export function vSetup() {
  const I = info(), sh = I.shop, p = pol();
  return `${pageHead('Your shop', 'Shop setup', '')}
  <div class="grid2e">
    <section class="panel"><div class="panel-h"><h2>Shop details</h2></div>
      <form class="stack" data-form="shop">
        <div class="fgrid">${field('Shop name', `<input id="sh-name" name="name" value="${esc(sh.name)}" required>`, 'sh-name')}${field('Logo text', `<input id="sh-wm" name="wordmark" value="${esc(sh.wordmark || '')}">`, 'sh-wm')}</div>
        ${field('Headline on the website', `<input id="sh-tag" name="tagline" value="${esc(sh.tagline)}">`, 'sh-tag')}
        ${field('Short description', `<textarea id="sh-about" name="about" rows="2">${esc(sh.about)}</textarea>`, 'sh-about')}
        ${field('Address', `<input id="sh-addr" name="address" value="${esc(sh.address)}">`, 'sh-addr')}
        ${field('Owner’s mobile (gets the end-of-day summary by text; not shown on the website)', `<input id="sh-owner" name="ownerPhone" type="tel" inputmode="tel" value="${esc(sh.ownerPhone || '')}" placeholder="0917 123 4567">`, 'sh-owner')}
        <div class="fgrid">${field('Phone', `<input id="sh-phone" name="phone" value="${esc(sh.phone)}">`, 'sh-phone')}${field('Facebook page', `<input id="sh-fb" name="facebook" value="${esc(sh.facebook || '')}">`, 'sh-fb')}</div>
        <div class="fgrid">${field('Instagram', `<input id="sh-ig" name="instagram" value="${esc(sh.instagram || '')}" placeholder="https://www.instagram.com/...">`, 'sh-ig')}${field('Messenger link (optional)', `<input id="sh-msg" name="messenger" value="${esc(sh.messenger || '')}" placeholder="Made from your Facebook page if empty">`, 'sh-msg')}</div>
        ${field('How to find us (shown under the map)', `<textarea id="sh-dir" name="directions" rows="2" maxlength="240" placeholder="e.g. Ground floor, beside the escalator. Jeepneys to Antipolo Cathedral stop in front.">${esc(sh.directions || '')}</textarea>`, 'sh-dir')}
        <div class="fgrid">${field('GCash number for down payments', `<input id="sh-gcash" name="gcashNumber" value="${esc(sh.gcashNumber || '')}" inputmode="tel">`, 'sh-gcash')}${field('GCash account name', `<input id="sh-gname" name="gcashName" value="${esc(sh.gcashName || '')}">`, 'sh-gname')}</div>
        <fieldset class="field"><legend>Official receipts (BIR)</legend>
          <label class="row small"><input type="checkbox" id="sh-or" name="orEnabled" ${sh.orEnabled ? 'checked' : ''}> Number every receipt in order (official receipt numbers)</label>
          <div class="fgrid three">${field('Number starts with', `<input id="sh-orp" name="orPrefix" value="${esc(sh.orPrefix || 'OR-')}" maxlength="10">`, 'sh-orp')}${field('Next number', `<input id="sh-orn" name="orNext" type="number" min="1" placeholder="${esc(S.orNext || 1)}">`, 'sh-orn')}${field('TIN', `<input id="sh-tin" name="tin" value="${esc(sh.tin || '')}" placeholder="000-000-000-000">`, 'sh-tin')}</div>
          ${field('Line printed on receipts (e.g. BIR permit / ATP number)', `<input id="sh-permit" name="birPermit" value="${esc(sh.birPermit || '')}" maxlength="120">`, 'sh-permit')}
          <p class="muted small" style="margin:0">Leave “Next number” empty to keep counting. Ask the shop’s accountant which details BIR needs on your receipts; this system isn’t a BIR-accredited cash register.</p></fieldset>
        <div class="fgrid">${field('Currency symbol', `<input id="sh-cur" name="currency" value="${esc(sh.currency || '₱')}" maxlength="4">`, 'sh-cur')}${field('Free cut every N visits (0 = off)', `<input id="sh-loy" name="loyaltyEvery" type="number" min="0" max="50" value="${esc(sh.loyaltyEvery ?? 10)}">`, 'sh-loy')}</div>
        <div class="modal-f"><button class="btn btn-primary" type="submit">Save details</button></div>
      </form></section>
    <section class="panel"><div class="panel-h"><h2>Opening hours</h2></div>
      <form class="stack" data-form="hours">
        <div class="tbl-wrap"><table class="tbl"><tbody>${[1, 2, 3, 4, 5, 6, 0].map(d => { const h = I.hours.find(x => x.d === d) || { open: '09:00', close: '20:00', closed: false }; return `<tr><td><b>${DAYS_LONG[d]}</b></td><td><input type="time" id="h-open-${d}" name="open-${d}" value="${esc(h.open)}" aria-label="${DAYS_LONG[d]} opens"></td><td><input type="time" id="h-close-${d}" name="close-${d}" value="${esc(h.close)}" aria-label="${DAYS_LONG[d]} closes"></td><td><label class="row small"><input type="checkbox" id="h-closed-${d}" name="closed-${d}" ${h.closed ? 'checked' : ''}> Closed</label></td></tr>`; }).join('')}</tbody></table></div>
        <div class="modal-f"><button class="btn btn-primary" type="submit">Save hours</button></div>
      </form></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Online booking rules</h2></div>
    <form class="stack" data-form="policy">
      <div class="fgrid three">
        ${field('Deposit (' + cur() + ')', `<input id="po-dep" name="deposit" type="number" min="100" step="1" value="${esc(p.deposit)}">`, 'po-dep')}
        ${field('Hold slot while paying (min)', `<input id="po-hold" name="holdMinutes" type="number" min="5" max="60" value="${esc(p.holdMinutes)}">`, 'po-hold')}
        ${field('Reschedule up to (hours before)', `<input id="po-res" name="rescheduleHours" type="number" min="0" max="168" value="${esc(p.rescheduleHours)}">`, 'po-res')}
        ${field('Junior barbers: slot can go to a walk-in after (min late)', `<input id="po-late" name="lateMinutes" type="number" min="0" max="120" value="${esc(p.lateMinutes)}">`, 'po-late')}${field('Senior barbers: down payment kept and full price owed after (min late)', `<input id="po-late2" name="lateMinutesDeposit" type="number" min="0" max="120" value="${esc(p.lateMinutesDeposit ?? 20)}">`, 'po-late2')}${field('Down payment back if they cancel at least (hours before)', `<input id="po-cancel" name="cancelHours" type="number" min="0" max="336" value="${esc(p.cancelHours ?? 48)}">`, 'po-cancel')}
        ${field('Earliest booking from now (min)', `<input id="po-lead" name="leadMinutes" type="number" min="0" max="1440" value="${esc(p.leadMinutes)}">`, 'po-lead')}
        ${field('Book up to (days ahead)', `<input id="po-ahead" name="bookAheadDays" type="number" min="1" max="365" value="${esc(p.bookAheadDays)}">`, 'po-ahead')}
        ${field('Last booking starts at', `<input id="po-last" name="lastBooking" type="time" step="3600" value="${esc(p.lastBooking ?? '19:00')}">`, 'po-last', 'Online bookings can’t start later than this. Leave empty to allow any time that finishes by closing.')}
        ${field('“Time for a trim” text after (days, 0 = off)', `<input id="po-rebook" name="rebookDays" type="number" min="0" max="120" value="${esc(p.rebookDays ?? 28)}">`, 'po-rebook')}
      </div>
      <label class="consent"><input type="checkbox" id="po-online" name="onlineBooking" ${p.onlineBooking ? 'checked' : ''}><span><b>Take online bookings with a deposit.</b> Turn this on only after the booking backend and PayMongo are set up (checklist part 2). While it’s off, the website asks customers to call or message the shop instead.</span></label>
      <label class="consent"><input type="checkbox" id="po-gcash" name="manualGcash" ${p.manualGcash !== false ? 'checked' : ''}><span><b>Also let customers pay by GCash screenshot.</b> They send the down payment to your GCash number above and upload the screenshot. The booking is confirmed when you approve it on the Schedule.</span></label>
      <label class="consent"><input type="checkbox" id="po-rcpt" name="receiptTexts" ${p.receiptTexts !== false ? 'checked' : ''}><span><b>Text clients a short receipt after checkout.</b> The full receipt is emailed when we have their email, and it shows on their booking page. Each text costs about ₱0.50.</span></label>
      <p class="muted small">PayMongo needs at least ₱100 per payment. The website shows these rules to customers before they pay.</p>
      <div class="modal-f"><button class="btn btn-primary" type="submit">Save rules</button></div>
    </form></section>
  <section class="panel"><div class="panel-h"><h2>Services & prices</h2><button class="btn btn-sm btn-primary" data-act="newService">+ Service</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Service</th><th>For</th><th>Category</th><th class="r">Minutes</th><th class="r">Price</th><th>On website</th><th></th></tr></thead><tbody>
      ${services().map(s => `<tr><td><b>${esc(s.name)}</b><div class="muted small">${esc(s.desc || '')}</div></td><td>${s.group === 'her' ? 'Her' : 'Him'}${s.tier ? ` · ${s.tier === 'deluxe' ? 'Deluxe' : 'Regular'}` : ''}${s.kind === 'extra' ? ' · Add-on' : ''}</td><td>${esc(s.cat || '')}</td><td class="r">${esc(s.mins)}</td><td class="r"><b>${esc(priceLabel(s, cur()))}</b></td><td>${s.active !== false ? chip({ kind: 'good', icon: '✓', label: 'Shown' }) : chip({ kind: 'mute', icon: '–', label: 'Hidden' })}</td><td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="editService" data-id="${esc(s.id)}">Edit</button><button class="btn btn-sm btn-danger" data-act="delService" data-id="${esc(s.id)}">Remove</button></div></td></tr>`).join('')}
    </tbody></table></div></section>
  ${promosPanel()}
  ${signinsPanel()}
  <div class="grid2e">${pinPanel()}${clockSetupPanel()}</div>
  ${backupPanel()}`;
}

export const siteUrl = u => /^(https?:|data:|blob:|\/)/.test(u || '') ? u : '../' + u; // site images are relative to the website, one folder up
// ---------- Facebook photos ----------
export function fbPanel() {
  const I = info(), fb = I.fbPhotos || [], c = S.fbCfg;
  if (c === undefined) { S.fbCfg = null; db.doc('private/facebook').get().then(d => { S.fbCfg = d.exists ? d.data() : {}; schedule(); }).catch(() => { S.fbCfg = {}; schedule(); }); }
  const cfg = S.fbCfg || {}, on = !!cfg.token;
  return `<section class="panel"><div class="panel-h"><h2>Facebook photos</h2>${on ? chip(cfg.lastError ? { kind: 'bad', icon: '!', label: 'Sync problem' } : { kind: 'good', icon: '✓', label: 'Connected' }) : chip({ kind: 'mute', icon: '–', label: 'Not connected' })}</div>
    <p class="muted small" style="margin-bottom:10px">When connected, the newest photos from your Facebook page appear first in “Fresh from the chair”, refreshed every 3 hours. Your own uploads below stay too.</p>
    ${on ? `<div class="totals" style="font-size:14px;margin-bottom:10px"><div><span>Last synced</span><b>${cfg.lastOk ? ago(cfg.lastOk) : 'Not yet'}</b></div><div><span>Photos pulled</span><b>${fb.length}</b></div>${cfg.lastError ? `<div><span>Problem</span><span class="err">${esc(cfg.lastError)}</span></div>` : ''}</div>` : ''}
    ${fb.length ? `<div class="fb-strip">${fb.slice(0, 8).map(g => `<img src="${esc(g.url)}" alt="${esc(g.caption || 'Facebook photo')}" loading="lazy">`).join('')}</div>` : ''}
    <form class="stack" data-form="fb">
      <div class="fgrid">${field('Page access token', `<input id="fb-token" name="token" type="password" autocomplete="off" placeholder="${on ? 'Saved. Paste a new one to replace it' : 'Paste it from Meta for Developers'}">`, 'fb-token')}${field('Page ID (optional)', `<input id="fb-page" name="pageId" value="${esc(cfg.pageId || '')}" placeholder="Leave empty to use the token’s page">`, 'fb-page')}</div>
      <label class="row small"><input type="checkbox" name="show" ${I.fbShow !== false ? 'checked' : ''}> Show Facebook photos on the website</label>
      <div class="row"><button class="btn btn-primary btn-sm" type="submit">Save</button>${on ? '<button type="button" class="btn btn-sm" data-act="fbSync">Sync now</button>' : ''}</div>
      <p class="muted small">How to get the token: see “Facebook photos” in your Go-Live Checklist. It takes about 10 minutes, once.</p>
    </form></section>`;
}
// ---------- promos & events (shown on the website) ----------
export function happenPanel() {
  const list = info().happenings || [], t = today();
  return `<section class="panel"><div class="panel-h"><h2>Promos &amp; events</h2><button class="btn btn-sm btn-primary" data-act="newHappen">+ Add</button></div>
    <p class="muted small" style="margin-bottom:10px">Shown on the website under “Promos &amp; events”. They hide by themselves after the end date. Link a promo code so customers can book with it in one tap.</p>
    ${list.length ? `<ul class="list">${list.map((h, i) => { const over = h.end && h.end < t; return `<li><div class="grow"><b>${esc(h.title)}</b> ${chip(h.kind === 'event' ? { kind: 'info', icon: '◷', label: 'Event' } : { kind: 'good', icon: '%', label: 'Promo' })}${over ? ' ' + chip({ kind: 'mute', icon: '–', label: 'Ended' }) : ''}${h.sample ? ' <span class="muted small">(sample)</span>' : ''}
      <div class="sub">${h.start && h.end ? `${fmtDate(h.start)} – ${fmtDate(h.end)}` : h.start ? `From ${fmtDate(h.start)}` : h.end ? `Until ${fmtDate(h.end)}` : 'No end date'}${h.code ? ` · Code ${esc(h.code)}` : ''}</div></div><div class="acts"><button class="btn btn-sm btn-ghost" data-act="dlBanner" data-i="${i}" ${h.image ? 'disabled title="Uses your own picture"' : ''}>Download banner</button><button class="btn btn-sm btn-ghost" data-act="editHappen" data-i="${i}">Edit</button></div></li>`; }).join('')}</ul>`
      : '<p class="empty">Nothing posted yet. Add a holiday promo, a new service or an event.</p>'}</section>`;
}
export function happenModal(i) {
  const h = i >= 0 ? (info().happenings || [])[i] : { kind: 'promo' };
  S.happenImg = h.image || '';
  openModal(i >= 0 ? 'Edit promo or event' : 'Add promo or event', `<form class="stack" data-form="happen" data-i="${i}">
    <div class="seg" role="group" aria-label="Type"><label><input type="radio" name="kind" value="promo" ${h.kind !== 'event' ? 'checked' : ''}> Promo</label><label><input type="radio" name="kind" value="event" ${h.kind === 'event' ? 'checked' : ''}> Event</label></div>
    ${field('Title', `<input id="hp-title" name="title" value="${esc(h.title || '')}" maxlength="80" required placeholder="e.g. Back-to-school cuts ₱199">`, 'hp-title')}
    ${field('Details', `<textarea id="hp-text" name="text" rows="3" maxlength="300" placeholder="What it is, who it’s for, any rules">${esc(h.text || '')}</textarea>`, 'hp-text')}
    <div class="fgrid">${field('Starts (optional)', `<input id="hp-start" name="start" type="date" value="${esc(h.start || '')}">`, 'hp-start')}${field('Ends (optional)', `<input id="hp-end" name="end" type="date" value="${esc(h.end || '')}">`, 'hp-end')}</div>
    ${field('Big text on the banner (optional)', `<input id="hp-badge" name="badge" value="${esc(h.badge || '')}" maxlength="14" placeholder="e.g. ₱50 OFF, 10% OFF, FREE">`, 'hp-badge')}
    ${field('Promo code (optional)', `<select id="hp-code" name="code">${opt('', 'None', !h.code)}${S.promos.filter(p => p.active !== false).map(p => opt(p.id, `${p.id} · ${p.kind === 'amount' ? money(p.value) : p.value + '%'} off`, h.code === p.id)).join('')}</select>`, 'hp-code')}
    <div class="fgrid">${field('Or a link (optional)', `<input id="hp-link" name="link" value="${esc(h.link || '')}" placeholder="e.g. your Facebook post">`, 'hp-link')}${field('Link button text', `<input id="hp-ll" name="linkLabel" value="${esc(h.linkLabel || '')}" placeholder="Learn more">`, 'hp-ll')}</div>
    <div class="field"><label>Picture (optional)</label><div class="row" id="hp-img">${S.happenImg ? `<img class="cut-thumb" src="${esc(siteUrl(S.happenImg))}" alt="">` : ''}<label class="btn btn-sm upload">${S.happenImg ? 'Replace' : 'Add picture'}<input type="file" accept="image/*" data-upload="happen" hidden></label>${S.happenImg ? '<button type="button" class="btn btn-sm btn-ghost" data-act="happenImgOff">Remove</button>' : ''}</div></div>
    <div class="field"><label>Banner</label><canvas id="hp-banner" class="banner-prev" width="1200" height="630" aria-label="Banner preview"></canvas><p class="muted small">Made for you from the details above. With your own picture added, the picture shows instead.</p></div>
    <p class="err" id="m-err" hidden></p>${mFoot(i >= 0 ? 'Save' : 'Post it', i >= 0 ? `<button type="button" class="btn btn-danger" data-act="delHappen" data-i="${i}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}

// ---------- promo codes ----------
export function promosPanel() {
  const list = [...S.promos].sort((a, b) => (b.active !== false) - (a.active !== false) || a.id.localeCompare(b.id)), t = today();
  const state = x => x.active === false ? chip({ kind: 'mute', icon: '–', label: 'Off' }) : x.expires && t > x.expires ? chip({ kind: 'mute', icon: '–', label: 'Expired' }) : x.maxUses && (x.uses || 0) >= x.maxUses ? chip({ kind: 'mute', icon: '–', label: 'Used up' }) : chip({ kind: 'good', icon: '✓', label: 'Active' });
  return `<section class="panel"><div class="panel-h"><h2>Promo codes</h2><button class="btn btn-sm btn-primary" data-act="newPromo">+ Promo code</button></div>
    <p class="muted small" style="margin-bottom:10px">Customers type the code when they book online. The discount comes off the bill at checkout (it fills in automatically); the down payment stays the same.</p>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Discount</th><th class="r">Used</th><th>Ends</th><th>Status</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td><b class="mono">${esc(x.id)}</b>${x.note ? `<div class="muted small">${esc(x.note)}</div>` : ''}</td><td>${x.kind === 'amount' ? money(x.value) + ' off' : x.value + '% off'}${x.minSpend ? `<div class="muted small">from ${money(x.minSpend)}</div>` : ''}</td><td class="r">${x.uses || 0}${x.maxUses ? ' / ' + x.maxUses : ''}</td><td>${x.expires ? fmtDate(x.expires) : '—'}</td><td>${state(x)}</td><td><div class="acts"><button class="btn btn-sm btn-ghost" data-act="editPromo" data-id="${esc(x.id)}">Edit</button></div></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">No promo codes yet. Make one for a Facebook post, a holiday or first-timers.</p>'}</section>`;
}
export function promoModal(x) {
  const c = x || { kind: 'percent', value: 10, active: true };
  openModal(x ? `Edit ${x.id}` : 'New promo code', `<form class="stack" data-form="promo" data-id="${esc(c.id || '')}">
    <div class="fgrid">${field('Code', `<input id="pr-code" name="code" value="${esc(c.id || '')}" ${x ? 'readonly' : 'required'} maxlength="20" placeholder="e.g. REAL10" style="text-transform:uppercase">`, 'pr-code')}${field('Note (only you see this)', `<input id="pr-note" name="note" value="${esc(c.note || '')}" placeholder="e.g. Facebook post, November">`, 'pr-note')}</div>
    <div class="fgrid three">${field('Type', `<select id="pr-kind" name="kind">${opt('percent', 'Percent off', c.kind !== 'amount')}${opt('amount', 'Peso amount off', c.kind === 'amount')}</select>`, 'pr-kind')}${field('Value', `<input id="pr-val" name="value" type="number" min="1" step="1" value="${esc(c.value)}" required>`, 'pr-val')}${field('Minimum services total (₱)', `<input id="pr-min" name="minSpend" type="number" min="0" value="${esc(c.minSpend || '')}">`, 'pr-min')}</div>
    <div class="fgrid">${field('Last day (optional)', `<input id="pr-exp" name="expires" type="date" value="${esc(c.expires || '')}">`, 'pr-exp')}${field('Max uses (0 = no limit)', `<input id="pr-max" name="maxUses" type="number" min="0" value="${esc(c.maxUses || 0)}">`, 'pr-max')}</div>
    <label class="row small"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> Customers can use it</label>
    <p class="err" id="m-err" hidden></p>${mFoot(x ? 'Save changes' : 'Create code', x ? `<button type="button" class="btn btn-danger" data-act="delPromo" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
// ---------- walk-in QR poster ----------
export const walkinUrl = () => new URL('../?walkin=1', location.href).href;
export function qrModal() {
  const url = walkinUrl();
  openModal('Walk-in QR code', `<div class="stack qr-modal"><div class="qr-box">${qrSvg(url, { size: 240 })}</div>
    <p>Customers in the shop scan this to join the walk-in queue on their phone. They show up in <b>Schedule → Walk-in queue</b> with their number and name. No down payment.</p>
    <p class="muted small mono" style="word-break:break-all">${esc(url)}</p>
    <div class="modal-f"><button type="button" class="btn" data-act="copyQrLink">Copy link</button><button type="button" class="btn btn-primary" data-act="printQr">Print poster</button></div></div>`);
}
export function printPoster() {
  const sh = info().shop, w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print the poster.', 'bad'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Walk-in QR · ${esc(sh.name)}</title><style>
    @page{size:A4;margin:0}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;display:grid;place-items:center;min-height:100vh;text-align:center}
    .p{width:180mm;padding:16mm 0}.logo{width:42mm;height:42mm;object-fit:contain}h1{font-size:40pt;margin:6mm 0 2mm;letter-spacing:-.5pt}p{font-size:16pt;margin:2mm 0;color:#333}
    .qr{margin:8mm auto;width:110mm;height:110mm}.qr svg{width:100%;height:100%}.s{font-size:13pt;color:#555;margin-top:6mm}</style></head><body><div class="p">
    <img class="logo" src="${new URL('../assets/logo.png', location.href).href}" alt=""><h1>Walk-in? Join the queue</h1><p>Scan with your phone camera. No down payment.</p>
    <div class="qr">${qrSvg(walkinUrl(), { size: 400 })}</div><p><b>${esc(sh.name)}</b></p><p class="s">We call names in order. Clients with a booking go first at their time.</p></div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

// ---------- tab: website (photos, gallery, announcement, reviews) ----------
export const stars = n => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
export function vWebsite() {
  const I = info(), sh = I.shop, gal = I.gallery || [], revs = I.reviews || [], an = I.announcement || {};
  const upBtn = (kind, label, multiple) => `<label class="btn btn-sm btn-primary upload">${S.uploading === kind ? '<span class="spinner"></span> Uploading…' : esc(label)}<input type="file" accept="image/*" data-upload="${kind}" ${multiple ? 'multiple' : ''} hidden></label>`;
  return `${pageHead('What customers see', 'Website', `<a class="btn" href="../" target="_blank" rel="noopener">${icon('site')}View website</a>`)}
  <div class="grid2e">
    <section class="panel"><div class="panel-h"><h2>Homepage photo</h2>${upBtn('hero', sh.heroPhoto ? 'Replace photo' : 'Upload photo')}</div>
      ${sh.heroPhoto ? `<div class="hero-thumb" style="background-image:url('${esc(sh.heroPhoto)}')"></div><div class="row" style="margin-top:10px"><button class="btn btn-sm btn-danger" data-act="removeHero">Remove photo</button><span class="muted small">Shown full-width behind the headline.</span></div>`
        : '<p class="empty">No photo yet. A wide shot of the shop front or interior works best (landscape, well lit).</p>'}</section>
    <section class="panel"><div class="panel-h"><h2>Announcement bar</h2>${an.active && an.text ? chip({ kind: 'good', icon: '●', label: 'Showing' }) : chip({ kind: 'mute', icon: '–', label: 'Hidden' })}</div>
      <form class="stack" data-form="announce">
        ${field('Message across the top of the website', `<input id="an-text" name="text" value="${esc(an.text || '')}" maxlength="140" placeholder="e.g. Open on All Saints’ Day, 9 AM – 5 PM">`, 'an-text')}
        ${field('Link (optional)', `<input id="an-link" name="link" value="${esc(an.link || '')}" placeholder="https://www.facebook.com/R3ALBarbers">`, 'an-link')}
        <label class="row small"><input type="checkbox" name="active" ${an.active ? 'checked' : ''}> Show it on the website</label>
        <div class="modal-f"><button class="btn btn-primary" type="submit">Save</button></div>
      </form></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Fresh from the chair</h2><div class="row"><span class="muted small">${gal.length} photo${gal.length === 1 ? '' : 's'} · newest first, the first 12 show on the website</span>${upBtn('gallery', '+ Add photos', true)}</div></div>
    ${gal.length ? `<div class="gal-admin">${gal.map((g, i) => `<figure><img src="${esc(siteUrl(g.url))}" alt="${esc(g.caption || 'Gallery photo')}" loading="lazy"><figcaption>
      <input id="gc-${esc(g.id)}" data-caption="${esc(g.id)}" value="${esc(g.caption || '')}" placeholder="Caption, e.g. Mid fade by Reymart" aria-label="Caption">
      <span class="fgrid gal-meta"><select data-galfield="style" data-id="${esc(g.id)}" aria-label="Style">${opt('', 'Style…', !g.style)}${STYLES.map(x => opt(x, x, g.style === x)).join('')}</select><select data-galfield="barberId" data-id="${esc(g.id)}" aria-label="Barber">${opt('', 'Barber…', !g.barberId)}${serviceStaff().map(b => opt(b.id, b.name, g.barberId === b.id)).join('')}</select></span>
      <span class="row"><button class="icon-btn" data-act="galMove" data-id="${esc(g.id)}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">←</button><button class="icon-btn" data-act="galMove" data-id="${esc(g.id)}" data-d="1" ${i === gal.length - 1 ? 'disabled' : ''} aria-label="Move later">→</button><button class="btn btn-sm btn-danger" data-act="galDel" data-id="${esc(g.id)}">Remove</button></span></figcaption></figure>`).join('')}</div>`
      : '<p class="empty">No photos yet. Add finished cuts, color work and the shop itself. They’re resized automatically.</p>'}
    ${gal.length ? '<p class="muted small" style="margin-top:10px">Tag the style and barber: customers can filter the gallery by style, and tap “Book this look” to book that barber.</p>' : ''}</section>
  ${happenPanel()}
  ${fbPanel()}
  ${ratingsPanel()}
  ${faqPanel()}
  <div class="grid2e">
    <section class="panel"><div class="panel-h"><h2>Reviews</h2><button class="btn btn-sm btn-primary" data-act="newReview">+ Review</button></div>
      <p class="muted small" style="margin-bottom:10px">Copy real reviews customers left on Google, Facebook or Setmore, with their permission. Only add reviews people actually wrote.</p>
      ${revs.length ? `<ul class="list">${revs.map(r => `<li><div class="grow"><b>${esc(r.name)}</b> <span class="stars" aria-label="${r.rating} stars">${stars(r.rating)}</span><div class="sub">${esc(r.text)}</div></div><button class="btn btn-sm btn-ghost" data-act="editReview" data-id="${esc(r.id)}">Edit</button></li>`).join('')}</ul>` : '<p class="empty">No reviews yet. The section stays hidden on the website until you add one.</p>'}</section>
    <section class="panel"><div class="panel-h"><h2>Star rating</h2></div>
      <form class="stack" data-form="rating">
        ${field('Where the rating is from', `<select id="gr-s" name="source">${['Google', 'Setmore', 'Facebook'].map(o => `<option ${(sh.ratingSource || 'Google') === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`, 'gr-s')}
        <div class="fgrid">${field('Rating (out of 5)', `<input id="gr-r" name="rating" type="number" min="0" max="5" step="0.1" value="${esc(sh.googleRating ?? '')}">`, 'gr-r')}${field('Number of reviews', `<input id="gr-n" name="count" type="number" min="0" value="${esc(sh.googleCount ?? '')}">`, 'gr-n')}</div>
        ${field('Link to the reviews', `<input id="gr-u" name="url" value="${esc(sh.googleUrl || '')}" placeholder="For example the Google Maps share link">`, 'gr-u')}
        <p class="muted small">Shown in the homepage header. Update it now and then; leave the rating blank to hide it.</p>
        <div class="modal-f"><button class="btn btn-primary" type="submit">Save</button></div>
      </form></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Team photos</h2><a class="btn btn-sm btn-ghost" href="#team">Edit team</a></div>
    <div class="team-admin">${serviceStaff().map(b => `<div class="tm">${b.photo ? `<img src="${esc(siteUrl(b.photo))}" alt="${esc(b.name)}">` : `<span class="mono">${esc(initials(b.name))}</span>`}<b>${esc(b.name)}</b><label class="btn btn-sm upload">${S.uploading === 'staff-' + b.id ? '<span class="spinner"></span>' : b.photo ? 'Replace' : 'Upload'}<input type="file" accept="image/*" data-upload="staff-${esc(b.id)}" hidden></label></div>`).join('') || '<p class="empty">Add your team first in Barbers.</p>'}</div></section>`;
}
// Ratings customers left on their booking page after a visit
export function ratingsPanel() {
  const rated = S.appointments.filter(a => a.rating).sort((a, b) => b.rating.at - a.rating.at), revs = info().reviews || [];
  const avg = rated.length ? sum(rated, a => a.rating.stars) / rated.length : 0;
  return `<section class="panel"><div class="panel-h"><h2>Ratings from customers</h2>${rated.length ? `<span class="muted small"><b>${avg.toFixed(1)} ★</b> average from ${rated.length} visit${rated.length === 1 ? '' : 's'}</span>` : ''}</div>
    <p class="muted small" style="margin-bottom:10px">After checkout, customers get a text and email asking how their cut was. Their ratings land here. Show the good ones on the website with one tap; each barber’s average shows on their profile.</p>
    ${rated.length ? `<ul class="list">${rated.slice(0, 20).map(a => { const on = revs.some(r => r.id === 'r_' + a.id); return `<li><div class="grow"><b>${esc(a.name)}</b> <span class="stars" aria-label="${a.rating.stars} stars">${stars(a.rating.stars)}</span> <span class="muted small">${esc(staffName(a.barberId))} · ${fmtDate(a.date)}</span>${a.rating.text ? `<div class="sub">“${esc(a.rating.text)}”</div>` : ''}</div>
      ${on ? chip({ kind: 'good', icon: '✓', label: 'On website' }) : a.rating.text && a.rating.stars >= 4 ? `<button class="btn btn-sm" data-act="showRating" data-id="${esc(a.id)}">Show on website</button>` : ''}</li>`; }).join('')}</ul>
      <div class="row" style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-act="syncRatings">Update barber ratings on the website</button></div>` : '<p class="empty">No ratings yet. They come in after customers’ visits are checked out.</p>'}</section>`;
}
export function faqPanel() {
  const own = Array.isArray(info().faq) && info().faq.length, list = own ? info().faq : defaultFaq(info());
  return `<section class="panel"><div class="panel-h"><h2>Questions (FAQ)</h2><button class="btn btn-sm btn-primary" data-act="newFaq">+ Question</button></div>
    <p class="muted small" style="margin-bottom:10px">${own ? 'Shown on the website under “Good to know”.' : 'The website shows these suggested answers, written from your booking rules. Edit any of them to make the list your own.'}</p>
    <ul class="list">${list.map((f, i) => `<li><div class="grow"><b>${esc(f.q)}</b><div class="sub">${esc(f.a)}</div></div><div class="acts"><button class="icon-btn" data-act="faqMove" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="btn btn-sm btn-ghost" data-act="editFaq" data-i="${i}">Edit</button></div></li>`).join('')}</ul></section>`;
}
export function faqModal(i) {
  const list = Array.isArray(info().faq) && info().faq.length ? info().faq : defaultFaq(info()), c = i >= 0 ? list[i] : { q: '', a: '' };
  openModal(i >= 0 ? 'Edit question' : 'Add question', `<form class="stack" data-form="faq" data-i="${i}">
    ${field('Question', `<input id="fq-q" name="q" value="${esc(c.q)}" maxlength="120" required>`, 'fq-q')}
    ${field('Answer', `<textarea id="fq-a" name="a" rows="4" maxlength="600" required>${esc(c.a)}</textarea>`, 'fq-a')}
    <p class="err" id="m-err" hidden></p>${mFoot(i >= 0 ? 'Save' : 'Add', i >= 0 ? `<button type="button" class="btn btn-danger" data-act="delFaq" data-i="${i}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
export function reviewModal(r) {
  const c = r || { rating: 5, source: 'Google' };
  openModal(r ? 'Edit review' : 'Add review', `<form class="stack" data-form="review" data-id="${esc(c.id || '')}">
    <div class="fgrid three">${field('Customer name', `<input id="rv-name" name="name" value="${esc(c.name || '')}" required>`, 'rv-name')}${field('Stars', `<select id="rv-r" name="rating">${[5, 4, 3, 2, 1].map(n => opt(n, `${n} ★`, +c.rating === n)).join('')}</select>`, 'rv-r')}${field('Where it was posted', `<select id="rv-s" name="source">${['Google', 'Facebook', 'In person'].map(x => opt(x, x, x === c.source)).join('')}</select>`, 'rv-s')}</div>
    ${field('Review', `<textarea id="rv-t" name="text" rows="4" maxlength="400" required>${esc(c.text || '')}</textarea>`, 'rv-t')}
    <p class="err" id="m-err" hidden></p>${mFoot(r ? 'Save changes' : 'Add review', r ? `<button type="button" class="btn btn-danger" data-act="delReview" data-id="${esc(c.id)}" style="margin-right:auto">Delete</button>` : '')}</form>`);
}
// Promo/event banner preview: redrawn as the owner types
export function happenPreview() {
  const f = document.querySelector('form[data-form=happen]'), c = document.getElementById('hp-banner'); if (!f || !c) return;
  const fd = new FormData(f), g = k => String(fd.get(k) || '').trim();
  drawBanner(c, { kind: g('kind') || 'promo', title: g('title') || 'Your title here', text: g('text'), start: g('start'), end: g('end'), code: g('code'), badge: g('badge') }, info().shop);
}
// ---------- client search (name fields in Add walk-in, New booking and Checkout) ----------
// Type a name or number: matching clients show with their phone, visits and birthday. Picking one fills the
// phone (and birthday) too. Arrow keys + Enter work; Esc closes.
export const CP = { input: null, items: [], i: -1 };
export function cpMatches(q) {
  const st = custStats(), t = q.trim().toLowerCase(), digits = t.replace(/\D/g, '');
  let list = S.customers.map(c => ({ c, st: st[c.id] || { visits: 0, last: '' } }));
  if (t) list = list.filter(({ c }) => c.name.toLowerCase().includes(t) || (digits.length >= 3 && normPhone(c.phone).includes(digits)))
    .sort((a, b) => (b.c.name.toLowerCase().startsWith(t) - a.c.name.toLowerCase().startsWith(t)) || (b.st.last || '').localeCompare(a.st.last || ''));
  else list.sort((a, b) => (b.st.last || '').localeCompare(a.st.last || ''));
  return list.slice(0, t ? 6 : 5);
}
export const cpMark = (text, q) => { const t = q.trim(); const i = t ? text.toLowerCase().indexOf(t.toLowerCase()) : -1; return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + t.length))}</mark>${esc(text.slice(i + t.length))}`; };
export function cpOpen(input) {
  const q = input.value, list = cpMatches(q), exact = list.some(({ c }) => c.name.trim().toLowerCase() === q.trim().toLowerCase());
  CP.input = input; CP.items = list; if (CP.i >= list.length) CP.i = list.length - 1;
  let pop = document.getElementById('cust-pop');
  if (!pop) { pop = document.createElement('div'); pop.id = 'cust-pop'; pop.className = 'cust-pop'; pop.setAttribute('role', 'listbox'); document.body.appendChild(pop); }
  const meta = ({ c, st }) => { const n = bdayDays(c.birthday, today()); return [st.visits ? `${st.visits} visit${st.visits === 1 ? '' : 's'}` : 'New', st.last ? `last ${shortDate(st.last)}` : '', n !== null && Math.abs(n) <= 7 ? `★ birthday ${bdayWhen(n)}` : ''].filter(Boolean).join(' · '); };
  const addRow = exact ? '' : `<button type="button" class="cp-new cp-add" data-cpnew tabindex="-1"><b class="cp-plus" aria-hidden="true">+</b><span><span>${q.trim() ? `Add <b>${esc(q.trim())}</b> as a new client` : '<b>Add new client</b>'}</span><small>${q.trim() ? 'Saved to your client list when you save' : 'Type their full name, then their phone'}</small></span></button>`;
  pop.innerHTML = `${addRow}${list.length ? `<p class="cp-h">${q.trim() ? 'Matching clients' : 'Recent clients'}</p>` : ''}
    ${list.map((x, i) => `<button type="button" class="cp-item${i === CP.i ? ' on' : ''}" role="option" aria-selected="${i === CP.i}" data-cp="${i}" tabindex="-1"><span class="avatar">${esc(initials(x.c.name))}</span><span class="cp-t"><b>${cpMark(x.c.name, q)}</b><small>${x.c.phone ? cpMark(x.c.phone, q.replace(/\D/g, '').length >= 3 ? q : '') : 'No phone'}</small></span><span class="cp-m">${esc(meta(x))}</span></button>`).join('')}
`;
  const r = input.getBoundingClientRect(), w = Math.max(r.width, Math.min(360, innerWidth - 24));
  pop.style.width = w + 'px'; pop.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
  // right under the field; above it only when there's clearly more room there
  pop.style.maxHeight = ''; const below = innerHeight - r.bottom - 12, above = r.top - 12, h = pop.scrollHeight;
  if (h > below && above > below) { pop.style.top = ''; pop.style.bottom = (innerHeight - r.top + 4) + 'px'; pop.style.maxHeight = Math.min(above, 460) + 'px'; }
  else { pop.style.bottom = ''; pop.style.top = (r.bottom + 4) + 'px'; pop.style.maxHeight = Math.max(160, Math.min(below, 460)) + 'px'; }
  pop.hidden = false; input.setAttribute('aria-expanded', String(!pop.hidden));
}
export function cpAddNew() {
  const input = CP.input; if (!input) return;
  const f = input.closest('form'), ph = f ? f.querySelector('[name=phone]') : document.getElementById('pos-phone');
  if (!input.value.trim()) { cpClose(); input.placeholder = 'New client’s full name'; input.dataset.adding = '1'; input.focus(); CP.input = input; return; }
  if (f) { // a new person: clear anything filled from a client picked earlier
    if (ph && ph.value && S.customers.some(c => c.phone && normPhone(c.phone) === normPhone(ph.value))) ph.value = '';
  }
  cpClose(); if (ph) ph.focus();
}
export function cpClose() { const pop = document.getElementById('cust-pop'); if (pop) pop.hidden = true; if (CP.input) CP.input.setAttribute('aria-expanded', 'false'); CP.input = null; CP.i = -1; }
export function cpPick(i) {
  const x = CP.items[i], input = CP.input; if (!x || !input) return;
  const c = x.c, form = input.closest('form');
  input.value = c.name;
  if (input.id === 'pos-name') { S.pos.name = c.name; S.pos.phone = c.phone || ''; cpClose(); render(); return; }
  if (form) {
    const ph = form.querySelector('[name=phone]'); if (ph && c.phone) ph.value = c.phone;
    const bd = cleanBday(c.birthday), bm = form.querySelector('[name=bm]'), bdd = form.querySelector('[name=bd]');
    if (bd && bm && bdd) { bm.value = String(+bd.slice(0, 2)); bdd.value = String(+bd.slice(3)); }
  }
  cpClose(); input.focus();
}
// Opens when staff tap the field or start typing, not when a pop-up puts the cursor there by itself
// Staff form: keep the pay explanation in step with what's typed
export function payFormSync(f) {
  const fd = new FormData(f), b = { payType: fd.get('payType'), dailyPay: fd.get('dailyPay'), monthlyPay: fd.get('monthlyPay'), rate: fd.get('rate'), role: fd.get('role') }, t = payType(b);
  const ex = f.querySelector('#pay-explain'); if (ex) ex.textContent = `${payRule(b)}. ${payExample(b)}`;
  const l = f.querySelector('label[for=m-sdaily]'); if (l) l.textContent = t === 'quota' ? 'Daily minimum (₱)' : 'Daily pay (₱)';
  f.querySelector('#m-sdaily')?.closest('.field')?.toggleAttribute('hidden', t === 'monthly');
  f.querySelector('#m-smonth')?.closest('.field')?.toggleAttribute('hidden', t !== 'monthly');
}
// Picking a promo code fills the banner's big text with its discount
export function autoBadge() {
  const code = document.getElementById('hp-code'), b = document.getElementById('hp-badge'); if (!code || !b || (b.value && !b.dataset.auto)) return;
  const p = S.promos.find(x => x.id === code.value); b.value = p ? (p.kind === 'amount' ? `₱${p.value} OFF` : `${p.value}% OFF`) : ''; b.dataset.auto = '1';
}
export async function handleUpload(input) {
  const kind = input.dataset.upload, files = [...input.files]; if (!files.length) return;
  if (kind === 'item') {
    const w = document.getElementById('it-img'); if (w) w.innerHTML = '<span class="spinner"></span> Uploading…';
    try { const up = await uploadImage(await resizeImage(files[0], 900, 0.8), 'products'); S.itemImg = up.url; }
    catch (e) { toast(/^storage\//.test(e.code || '') ? 'Photo uploads need Firebase Storage (Blaze plan, checklist part 2).' : 'Couldn’t upload the photo.', 'bad'); }
    if (w) w.innerHTML = `${S.itemImg ? `<img class="cut-thumb" src="${esc(siteUrl(S.itemImg))}" alt="">` : ''}<label class="btn btn-sm upload">${S.itemImg ? 'Replace' : 'Add photo'}<input type="file" accept="image/*" data-upload="item" hidden></label>`;
    return;
  }
  if (kind === 'happen') {
    const w = document.getElementById('hp-img'); if (w) w.innerHTML = '<span class="spinner"></span> Uploading…';
    try { const up = await uploadImage(await resizeImage(files[0], 1200, demo ? 0.7 : 0.8), 'gallery'); S.happenImg = up.url; }
    catch (e) { toast(/^storage\//.test(e.code || '') ? 'Picture uploads need Firebase Storage (Blaze plan, checklist part 2).' : 'Couldn’t upload the picture.', 'bad'); }
    if (w) w.innerHTML = `${S.happenImg ? `<img class="cut-thumb" src="${esc(siteUrl(S.happenImg))}" alt="">` : ''}<label class="btn btn-sm upload">${S.happenImg ? 'Replace' : 'Add picture'}<input type="file" accept="image/*" data-upload="happen" hidden></label>${S.happenImg ? '<button type="button" class="btn btn-sm btn-ghost" data-act="happenImgOff">Remove</button>' : ''}`;
    return;
  }
  if (kind.startsWith('cut-')) { // small JPEG kept in Firestore, so it works without Firebase Storage
    const id = kind.slice(4), a = S.appointments.find(x => x.id === id);
    try {
      const blob = await resizeImage(files[0], 900, 0.7), img = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
      if (await put('cuts', id, { img, at: Date.now(), barberId: (a && a.barberId) || '' })) { S.cutImgs[id] = img; await patch('appointments', id, { hasCutPhoto: true }); toast('Photo saved. The client can see it on their booking page.'); }
    } catch (e) { toast(e.message || 'Couldn’t save the photo.', 'bad'); }
    const el = document.getElementById('cut-' + id); if (el && a) el.outerHTML = cutField(a);
    return;
  }
  S.uploading = kind; render();
  try {
    const big = kind === 'hero' ? 1920 : kind.startsWith('staff-') ? 800 : 1600, small = demo ? (kind === 'hero' ? 1280 : 900) : big;
    const done = [];
    for (const f of files.slice(0, 20)) { const blob = await resizeImage(f, small, demo ? 0.72 : 0.82); done.push(await uploadImage(blob, kind === 'hero' ? 'hero' : kind.startsWith('staff-') ? 'team' : 'gallery')); }
    if (kind === 'hero') { const old = info().shop.heroPhotoPath; await saveInfo({ shop: { ...info().shop, heroPhoto: done[0].url, heroPhotoPath: done[0].path } }); deleteImage(old); toast('Homepage photo updated'); }
    else if (kind === 'gallery') { await saveInfo({ gallery: [...done.map(d => ({ id: newId(), url: d.url, path: d.path, caption: '' })), ...(info().gallery || [])] }); toast(`${done.length} photo${done.length > 1 ? 's' : ''} added`); }
    else { const id = kind.slice(6), b = staffById(id); if (b) { await patch('staff', id, { photo: done[0].url, photoPath: done[0].path }); deleteImage(b.photoPath); setTimeout(syncPublicBarbers, 400); toast(`${b.name}’s photo updated`); } }
  } catch (e) { console.error(e); toast(/quota|exceeded/i.test(e.message || e.name) ? 'The demo can’t store more photos in this browser. Remove some first.' : /^storage\//.test(e.code || '') ? 'Photo uploads need Firebase Storage, which comes with the Blaze plan (checklist part 2).' : (e.message || 'Upload failed. Try again.'), 'bad'); }
  S.uploading = ''; input.value = ''; render();
}

Object.assign(TAB_VIEWS, { overview: vOverview, schedule: vSchedule, checkout: vCheckout, money: vMoney, team: vTeam, clients: vClients, stock: vStock, website: vWebsite, setup: vSetup });


// runs once, from admin.js, in the same order as before the split
export function init() {
  document.addEventListener('click', e => { if (e.target.matches && e.target.matches('[data-cust]') && CP.input === e.target && e.clientX > e.target.getBoundingClientRect().right - 40) { cpClose(); return; } if (e.target.matches && e.target.matches('[data-cust]') && CP.input !== e.target) { const el = e.target; CP.i = -1; cpOpen(el); setTimeout(() => CP.input === el && cpOpen(el), 280); } }); // again once the pop-up has finished opening
  document.addEventListener('input', e => { if (e.target.matches && e.target.matches('[data-cust]')) { CP.i = -1; cpOpen(e.target); } });
  document.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('[data-cust]') && e.key === 'ArrowDown' && CP.input !== e.target) { e.preventDefault(); CP.i = 0; cpOpen(e.target); return; }
    if (!CP.input || e.target !== CP.input) return;
    const pop = document.getElementById('cust-pop'); if (!pop || pop.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = CP.items.length; if (!n) return; CP.i = (CP.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; cpOpen(CP.input); }
    else if (e.key === 'Enter' && CP.i >= 0) { e.preventDefault(); cpPick(CP.i); }
    else if (e.key === 'Escape') { e.stopPropagation(); cpClose(); }
  }, true);
  document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('[data-cpnew]')) { e.preventDefault(); cpAddNew(); return; } const b = e.target.closest && e.target.closest('[data-cp]'); if (b) { e.preventDefault(); cpPick(+b.dataset.cp); return; } if (CP.input && !e.target.closest('#cust-pop') && e.target !== CP.input) cpClose(); });
  document.addEventListener('focusout', e => { if (e.target === CP.input) setTimeout(() => { if (CP.input && document.activeElement !== CP.input) cpClose(); }, 120); });
  addEventListener('resize', () => CP.input && cpOpen(CP.input));
  document.addEventListener('scroll', e => { if (CP.input && !(e.target.closest && e.target.closest('#cust-pop'))) cpOpen(CP.input); }, true);
  document.addEventListener('input', e => { const f = e.target.closest && e.target.closest('form[data-form=staff]'); if (f) payFormSync(f); });
  document.addEventListener('change', e => { const f = e.target.closest && e.target.closest('form[data-form=staff]'); if (f) payFormSync(f); });
  document.addEventListener('input', e => { if (e.target.closest('form[data-form=happen]')) { if (e.target.id === 'hp-code') autoBadge(); happenPreview(); } });
  document.addEventListener('change', e => { if (e.target.closest('form[data-form=happen]')) { if (e.target.id === 'hp-code') autoBadge(); happenPreview(); } });
}
