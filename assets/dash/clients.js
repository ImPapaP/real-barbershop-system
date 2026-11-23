// Dashboard · Clients and Inventory pages.
import { bdayDays, esc, fmtBday, initials, phoneKey, sum } from '../shared.js';
import { S } from './state.js';
import { $, addDays, ago, bdayPromoText, bdayWhen, chip, custStats, field, fmtDate, icon, info, kpi, loyaltyN, money, normPhone, num, opt, pageHead, parseYmd, periodRange, pol, shortDate, today, usualBarber, ymd } from './core.js';
import { filterDD, liveCoupons } from './tables.js';

// ---------- tab: clients ----------
export function vClients() {
  const st = custStats(), N = loyaltyN(), q = S.clientQ.trim().toLowerCase();
  let list = S.customers.map(c => ({ ...c, st: st[c.id] || { visits: 0, spent: 0, last: '', barbers: {} } }));
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || normPhone(c.phone).includes(normPhone(q) || '§'));
  const sorts = { recent: (a, b) => (b.st.last || '').localeCompare(a.st.last || ''), spend: (a, b) => b.st.spent - a.st.spent, visits: (a, b) => b.st.visits - a.st.visits, name: (a, b) => a.name.localeCompare(b.name) };
  const TAGS = { regular: c => c.st.visits >= (pol().regularVisits || 3), coupon: c => liveCoupons(c).length > 0, bday: c => { const n = bdayDays(c.birthday, today()); return n !== null && n >= 0 && n <= 14; }, lapsed: c => !!c.st.last && c.st.last < addDays(today(), -45), new: c => c.st.visits <= 1 };
  if (S.clientTag && TAGS[S.clientTag]) list = list.filter(TAGS[S.clientTag]);
  list.sort(sorts[S.clientSort] || sorts.recent);
  const lapsed = S.customers.filter(c => st[c.id] && st[c.id].last && st[c.id].last < addDays(today(), -45)).length;
  const due = dueForTrim(st);
  const bdays = S.customers.map(c => ({ c, n: bdayDays(c.birthday, today()) })).filter(x => x.n !== null && x.n >= -1 && x.n <= 14).sort((a, b) => a.n - b.n);
  return `${pageHead(`${S.customers.length} clients`, 'Clients', `<button class="btn btn-primary" data-act="newClient">+ Client</button>`)}
  <section class="kpis">
    ${kpi('Clients on file', S.customers.length)}
    ${kpi('New this month', S.customers.filter(c => c.createdAt && ymd(new Date(c.createdAt)) >= periodRange('month')[0]).length)}
    ${kpi('Haven’t been back in 45+ days', lapsed, '<span class="d">Worth a message</span>')}
  </section>
  ${bdays.length ? `<section class="panel"><div class="panel-h"><h2>Birthdays coming up</h2><span class="muted small">Next 2 weeks. ${esc(bdayPromoText())}</span></div>
    <ul class="list">${bdays.map(({ c, n }) => `<li class="click" data-act="openClient" data-id="${esc(c.id)}" tabindex="0"><span class="avatar">${esc(initials(c.name))}</span><div class="grow"><b>${esc(c.name)}</b><div class="sub">${esc(fmtBday(c.birthday))} · ${esc(c.phone || 'No phone')}</div></div>${n === 0 ? chip({ kind: 'info', icon: '★', label: 'Today' }) : `<span class="muted small">${bdayWhen(n)}</span>`}</li>`).join('')}</ul></section>` : ''}
  ${pol().rebookDays ? `<section class="panel"><div class="panel-h"><h2>Due for a trim</h2><span class="muted small">Last visit ${pol().rebookDays}+ days ago, nothing booked. Texts go out automatically at 10 AM on day ${pol().rebookDays}.</span></div>
    ${due.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${due.slice(0, 12).map(({ c, last, days }) => { const sent = (c.rebookSentFor || '') >= last; return `<tr><td><div class="row" style="flex-wrap:nowrap"><span class="avatar">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><div class="muted small">${esc(c.phone || 'No phone')}</div></div></div></td><td class="num">${days} days since ${shortDate(last)}</td><td>${sent ? chip({ kind: 'good', icon: '✓', label: 'Reminded' }) : c.noReminders ? chip({ kind: 'mute', icon: '–', label: 'Opted out' }) : ''}</td>
      <td><div class="acts">${!sent && !c.noReminders && (c.phone || c.email) ? `<button class="btn btn-sm btn-primary" data-act="remind" data-id="${esc(c.id)}" data-last="${esc(last)}" ${S.reminding === c.id ? 'disabled' : ''}>${S.reminding === c.id ? 'Sending…' : 'Send reminder'}</button>` : ''}<button class="btn btn-sm btn-ghost" data-act="openClient" data-id="${esc(c.id)}">Open</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">Nobody is due right now.</p>'}</section>` : ''}
  <section class="panel">
    <div class="toolbar" style="margin-bottom:12px"><input type="search" id="c-q" data-bind="clientQ" data-live value="${esc(S.clientQ)}" placeholder="Search name or phone" aria-label="Search clients">
      ${filterDD('clients', (S.clientTag ? 1 : 0) + (S.clientSort && S.clientSort !== 'recent' ? 1 : 0), `<div class="fdd-grid">${field('Show', `<select id="c-tag" data-bind="clientTag" data-live>${[['', 'All clients'], ['regular', 'Regulars'], ['coupon', 'Has a coupon'], ['bday', 'Birthday in the next 2 weeks'], ['lapsed', 'No visit in 45+ days'], ['new', 'New (0–1 visits)']].map(([k, l]) => opt(k, l, k === (S.clientTag || ''))).join('')}</select>`, 'c-tag')}${field('Sort by', `<select id="c-sort" data-bind="clientSort" data-live>${[['recent', 'Last visit'], ['spend', 'Top spenders'], ['visits', 'Most visits'], ['name', 'Name']].map(([k, l]) => opt(k, l, k === S.clientSort)).join('')}</select>`, 'c-sort')}</div>`)}</div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Client</th><th class="r">Visits</th><th class="r">Spent</th><th>Last visit</th>${N ? `<th>Loyalty (every ${N})</th>` : ''}<th>Usual barber</th></tr></thead><tbody>
      ${list.map(c => { const prog = c.st.visits % (N || 1); return `<tr class="click" data-act="openClient" data-id="${esc(c.id)}" tabindex="0"><td><b>${esc(c.name)}</b>${c.st.visits >= (pol().regularVisits || 3) ? ' ' + chip({ kind: 'good', icon: '★', label: 'Regular' }) : ''}${liveCoupons(c).length ? ' ' + chip({ kind: 'info', icon: '%', label: 'Coupon' }) : ''}<div class="muted small">${esc(c.phone || 'No phone')}</div></td><td class="r">${c.st.visits}</td><td class="r">${money(c.st.spent)}</td><td class="num">${c.st.last ? fmtDate(c.st.last) : '<span class="muted">—</span>'}</td>
        ${N ? `<td><span class="meter" aria-label="${prog} of ${N} visits">${N <= 12 ? Array.from({ length: N }, (_, i) => `<i class="${i < prog ? 'on' : ''}"></i>`).join('') : `${prog}/${N}`}</span></td>` : ''}<td>${esc(usualBarber(c.st))}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<p class="empty">${q || S.clientTag ? 'No client matches that search or filter.' : 'No clients yet. They’re added at checkout, or use “+ Client”.'}</p>`}
  </section>`;
}

export function dueForTrim(st) {
  const n = pol().rebookDays; if (!n) return [];
  const from = addDays(today(), -(n + 30)), to = addDays(today(), -n);
  return S.customers.map(c => ({ c, s: st[c.id] })).filter(x => x.s && x.s.last >= from && x.s.last <= to)
    .filter(({ c }) => !S.appointments.some(a => a.date >= today() && ['booked', 'pending_payment'].includes(a.status) && (a.customerId === c.id || (c.phoneKey && phoneKey(a.phone) === c.phoneKey))))
    .map(({ c, s }) => ({ c, last: s.last, days: Math.round((parseYmd(today()) - parseYmd(s.last)) / 864e5) })).sort((a, b) => a.days - b.days);
}

// ---------- tab: stock ----------
export function stockChip(i) { return i.stock <= 0 ? chip({ kind: 'bad', icon: '✕', label: 'Out' }) : i.stock <= i.reorder ? chip({ kind: 'warn', icon: '!', label: 'Low' }) : chip({ kind: 'good', icon: '✓', label: 'OK' }); }
export function vStock() {
  const all = [...S.inventory].sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || a.name.localeCompare(b.name));
  const f = S.stockFilter, sq = (S.stockQ || '').trim().toLowerCase(), list = all.filter(i => (f === 'all' || (f === 'low' ? i.stock <= i.reorder : i.cat === f)) && (!sq || i.name.toLowerCase().includes(sq)));
  const low = all.filter(i => i.stock <= i.reorder).length;
  return `${pageHead(`${all.length} items`, 'Inventory', `<button class="btn btn-primary" data-act="newItem">+ Item</button>`)}
  <section class="kpis">
    ${kpi('Low or out of stock', low, low ? '<span class="d">Reorder soon</span>' : '<span class="d">All stocked</span>')}
    ${kpi('Stock value at cost', money(sum(all, i => Math.max(0, i.stock) * (i.cost || 0))))}
    ${kpi('Retail value on shelf', money(sum(all.filter(i => i.cat === 'Retail'), i => Math.max(0, i.stock) * (i.price || 0))))}
  </section>
  <section class="panel">
    <div class="toolbar" style="margin-bottom:12px"><input type="search" id="st-q" data-bind="stockQ" data-live value="${esc(S.stockQ || '')}" placeholder="Search items" aria-label="Search items">${filterDD('stock', f !== 'all' ? 1 : 0, `<div class="seg seg-col" role="group" aria-label="Show">${[['all', 'All items'], ['Retail', 'Retail (sold to clients)'], ['Supply', 'Shop supplies'], ['low', 'Low or out of stock']].map(([k, l]) => `<button type="button" data-act="stockFilter" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>`)}</div>
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Type</th><th class="r">In stock</th><th class="r">Reorder at</th><th class="r">Cost</th><th class="r">Price</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(i => `<tr><td><b>${esc(i.name)}</b><div class="stockbar" aria-hidden="true"><i style="width:${Math.min(100, Math.max(0, i.stock) / Math.max(1, (i.reorder || 1) * 3) * 100).toFixed(0)}%"></i></div></td><td>${i.cat === 'Retail' ? 'Retail' : 'Shop supply'}</td><td class="r"><b>${i.stock}</b> <span class="muted small">${esc(i.unit || '')}</span></td><td class="r">${i.reorder}</td><td class="r">${money(i.cost || 0)}</td><td class="r">${i.cat === 'Retail' ? money(i.price || 0) : '—'}</td><td>${stockChip(i)}</td>
        <td><div class="acts"><button class="btn btn-sm" data-act="adjust" data-id="${esc(i.id)}" data-dir="in">Receive</button><button class="btn btn-sm" data-act="adjust" data-id="${esc(i.id)}" data-dir="out">Use</button><button class="btn btn-sm btn-ghost" data-act="editItem" data-id="${esc(i.id)}">Edit</button></div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">No items here. Add pomades, blades and other supplies with “+ Item”.</p>'}
    <p class="muted small" style="margin-top:12px">Retail products sold at checkout come off stock automatically. Record shop supplies you open with “Use”.</p>
  </section>`;
}
