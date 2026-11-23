// Dashboard · New booking alerts: a chime and a pop-up on the front desk / owner screen when
//  - a client books online,
//  - a client sends a GCash screenshot to check,
//  - a client joins the walk-in queue with the shop QR.
// Things already there when the dashboard opens don't ring; only what arrives while it's open.
import { esc, fmtTime } from '../shared.js';
import { ACT, S } from './state.js';
import { fmtDate, render, staffName, toast } from './core.js';
import { myRole } from './access.js';

const seen = new Set();
let primed = false, ctx = null, unread = 0;
const baseTitle = document.title;
const soundOn = () => { try { return localStorage.getItem('rb-alert-sound') !== 'off'; } catch (_) { return true; } };

// what counts as news, and how to describe it
function eventsOf(a) {
  const out = [];
  if (a.groupOf) return out; // a friend added to someone's booking rings once, with the main booking
  // online: ring once it's a real booking (free, or paid online); one waiting on a GCash screenshot rings for the screenshot instead
  if (a.source === 'online' && a.status !== 'pending_payment' && !(a.proof && a.proof.status === 'approved')) out.push({ key: `${a.id}:new`, kind: 'booking', title: 'New online booking', a });
  if (a.proof && a.proof.status === 'review') out.push({ key: `${a.id}:proof:${a.proof.at || 0}`, kind: 'proof', title: 'GCash screenshot to check', a });
  if (a.source === 'walk-in' && a.fromQr) out.push({ key: `${a.id}:qr`, kind: 'walkin', title: `Walk-in joined the queue${a.queueNo ? ` · #${a.queueNo}` : ''}`, a });
  return out;
}

export function checkAlerts() {
  const r = myRole(); if (r !== 'owner' && r !== 'desk') return; // barbers don't get the desk's alerts
  if (!S.loaded.appointments) return;
  const fresh = [];
  for (const a of S.appointments) for (const ev of eventsOf(a)) if (!seen.has(ev.key)) { seen.add(ev.key); if (primed) fresh.push(ev); }
  primed = true;
  if (fresh.length) { fresh.slice(-3).forEach(show); chime(); }
}
export function resetAlerts() { seen.clear(); primed = false; }

function detail(a) {
  const when = a.source === 'walk-in' ? 'Today, waiting now' : `${fmtDate(a.date)} · ${fmtTime(a.time)}`;
  const who = a.barberId ? staffName(a.barberId) : 'Any barber';
  return `${esc(a.name || 'Client')} · ${esc(when)} · ${esc(who)}`;
}
function stack() {
  let s = document.getElementById('alerts');
  if (!s) { s = document.createElement('div'); s.id = 'alerts'; s.className = 'alerts'; s.setAttribute('role', 'region'); s.setAttribute('aria-label', 'New booking alerts'); document.body.appendChild(s); }
  return s;
}
function show(ev) {
  const s = stack(), a = ev.a, el = document.createElement('div');
  const icon = { booking: '✓', proof: '₱', walkin: '#' }[ev.kind];
  el.className = `alert alert-${ev.kind}`; el.setAttribute('role', 'alert');
  el.innerHTML = `<b class="alert-ic" aria-hidden="true">${icon}</b><div class="alert-txt"><b>${esc(ev.title)}</b><span>${detail(a)}</span></div>
    <div class="alert-btns"><a class="btn btn-sm btn-primary" href="#schedule">${ev.kind === 'proof' ? 'Check it' : 'Open'}</a>
    <button type="button" class="btn btn-sm btn-ghost alert-x" aria-label="Dismiss">✕</button></div>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.alert-x').onclick = close;
  el.querySelector('a').onclick = () => { if (a.date) S.schedDate = a.date; close(); };
  s.prepend(el); while (s.children.length > 4) s.lastChild.remove();
  setTimeout(close, 60000); // stays a minute, so someone who stepped away still sees it
  if (document.hidden) { unread++; document.title = `(${unread}) ${ev.title} · ${baseTitle}`; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { unread = 0; document.title = baseTitle; } });

// a short two-note chime (no sound file to download). Browsers allow sound only after the first tap or key on the page.
function unlock() { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (_) {} }
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, unlock, { once: false, passive: true }));
function chime() {
  if (!soundOn() || !ctx) return;
  try {
    const t0 = ctx.currentTime;
    [[880, 0], [1320, 0.16]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.5);
      o.connect(g).connect(ctx.destination); o.start(t0 + d); o.stop(t0 + d + 0.55);
    });
  } catch (_) {}
}
export function setAlertSound(on) { try { localStorage.setItem('rb-alert-sound', on ? 'on' : 'off'); } catch (_) {} if (on) { unlock(); chime(); } }
export { soundOn as alertSoundOn };

// the bell in the side menu: alert sound on / off (this device only)
export function alertBtn() {
  const r = myRole(); if (r !== 'owner' && r !== 'desk') return '';
  const on = soundOn();
  return `<button type="button" class="btn btn-sm btn-ghost" data-act="alertSound" aria-pressed="${on}" title="Booking alert sound: ${on ? 'on' : 'off'}"><span aria-hidden="true">${on ? '🔔' : '🔕'}</span><span class="lbl">Alert sound ${on ? 'on' : 'off'}</span></button>`;
}
Object.assign(ACT, {
  alertSound() { const on = !soundOn(); setAlertSound(on); toast(on ? 'Alert sound on' : 'Alert sound off'); render(); },
});
