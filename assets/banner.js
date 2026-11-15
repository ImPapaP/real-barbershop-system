// Generated banners for promos and events, in the shop's look: dark brick wall, the badge lit on the
// right, a big slab headline. Drawn on a canvas so the same picture shows on the website and downloads
// as a PNG (1200 × 630, the size Facebook uses for shared posts).
import { LOGO_LG, fmtDate } from './shared.js';

export const BANNER_W = 1200, BANNER_H = 630;
let logo = null;
const loadLogo = () => logo || (logo = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = LOGO_LG; }));
const SLAB = '"Alfa Slab One","Rockwell Extra Bold",Rockwell,Georgia,serif', BODY = '"Instrument Sans","Segoe UI",system-ui,sans-serif', MARK = 'Montserrat,"Helvetica Neue",Arial,sans-serif';

// Big text on the banner: the discount for a promo ("₱50 OFF"), otherwise the title
export const bannerBadge = h => String(h.badge || '').trim();

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (ctx.measureText(l + '…').width > maxW && l.length) l = l.slice(0, -1); lines[maxLines - 1] = l.replace(/\s+\S*$/, '') + '…'; }
  return lines;
}
function fit(ctx, text, font, size, maxW, min) { let s = size; ctx.font = font(s); while (ctx.measureText(text).width > maxW && s > min) { s -= 4; ctx.font = font(s); } return s; }

export async function drawBanner(canvas, h, shop = {}) {
  const W = BANNER_W, H = BANNER_H, ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  try { await document.fonts.ready; } catch (_) {}
  const img = await loadLogo(), ev = h.kind === 'event';
  // brick wall
  ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);
  const bw = 120, bh = 50;
  for (let y = 0, r = 0; y < H; y += bh, r++) for (let x = r % 2 ? -bw / 2 : 0; x < W; x += bw) {
    const n = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    ctx.fillStyle = `rgba(255,255,255,${0.03 + n * 0.035})`; ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
  }
  // light on the badge, dark behind the words
  let g = ctx.createRadialGradient(W * 0.78, H * 0.48, 20, W * 0.78, H * 0.48, 520);
  g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(0.55, 'rgba(255,255,255,.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(8,8,10,.94)'); g.addColorStop(0.5, 'rgba(8,8,10,.7)'); g.addColorStop(0.75, 'rgba(8,8,10,.1)'); g.addColorStop(1, 'rgba(8,8,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // the badge
  if (img) {
    ctx.save(); ctx.translate(W * 0.8, H * 0.5); ctx.rotate(-6 * Math.PI / 180);
    ctx.shadowColor = 'rgba(255,255,255,.55)'; ctx.shadowBlur = 50; ctx.globalAlpha = 0.95;
    const s = 470; ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
  }
  // kicker pill
  const L = 70; let y = 78;
  ctx.font = `800 22px ${MARK}`; const kick = ev ? 'EVENT' : 'PROMO', kw = ctx.measureText(kick).width + 36;
  ctx.fillStyle = '#f3f5fa'; roundRect(ctx, L, y, kw, 42, 21); ctx.fill();
  ctx.fillStyle = '#0b0b0d'; ctx.textBaseline = 'middle'; ctx.fillText(kick, L + 18, y + 22);
  const when = ev ? (h.start && h.end && h.start !== h.end ? `${fmtDate(h.start)} – ${fmtDate(h.end)}` : h.start ? fmtDate(h.start) : h.end ? `Until ${fmtDate(h.end)}` : '') : h.end ? `Until ${fmtDate(h.end)}` : '';
  if (when) { ctx.font = `600 24px ${BODY}`; ctx.fillStyle = 'rgba(243,245,250,.8)'; ctx.fillText(when, L + kw + 18, y + 22); }
  ctx.textBaseline = 'alphabetic';
  // headline: the discount, or the title
  const big = bannerBadge(h) || h.title || '', maxW = 640;
  y = 150;
  // biggest size where the headline fits in two lines
  let bs = bannerBadge(h) ? 150 : 104, bigLines;
  for (; ; bs -= 4) {
    ctx.font = `400 ${bs}px ${SLAB}`;
    const words = big.toUpperCase().split(/\s+/), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    if ((lines.length <= 2 && lines.every(l => ctx.measureText(l).width <= maxW)) || bs <= 44) { bigLines = lines.slice(0, 2); break; }
  }
  ctx.fillStyle = '#f3f5fa'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24;
  for (const l of bigLines) { y += bs * 0.95; ctx.fillText(l, L, y); }
  ctx.shadowBlur = 0;
  // title under a discount
  if (bannerBadge(h) && h.title) {
    ctx.font = `700 40px ${BODY}`; ctx.fillStyle = '#f3f5fa';
    for (const l of wrap(ctx, h.title, maxW, 2)) { y += 52; ctx.fillText(l, L, y); }
  } else if (h.text) {
    ctx.font = `500 30px ${BODY}`; ctx.fillStyle = 'rgba(243,245,250,.85)';
    for (const l of wrap(ctx, h.text, maxW, 2)) { y += 42; ctx.fillText(l, L, y); }
  }
  // code
  if (h.code) {
    y += 34;
    ctx.font = `800 30px ${MARK}`; const cw = ctx.measureText(h.code).width, lw = 92, bx = L, by = y, bwid = cw + lw + 48;
    ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(243,245,250,.75)'; roundRect(ctx, bx, by, bwid, 64, 12); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `700 18px ${BODY}`; ctx.fillStyle = 'rgba(243,245,250,.7)'; ctx.textBaseline = 'middle'; ctx.fillText('CODE', bx + 24, by + 33);
    ctx.font = `800 30px ${MARK}`; ctx.fillStyle = '#f3f5fa'; ctx.fillText(h.code, bx + 24 + lw - 12, by + 33); ctx.textBaseline = 'alphabetic';
  }
  // footer
  ctx.font = `800 24px ${MARK}`; ctx.fillStyle = '#f3f5fa';
  const name = String(shop.name || 'REAL Barbers').toUpperCase(), nw = ctx.measureText(name).width;
  ctx.fillText(name, L, H - 52);
  ctx.font = `500 22px ${BODY}`; ctx.fillStyle = 'rgba(243,245,250,.7)';
  ctx.fillText(h.code ? '·  Book online and use the code' : '·  Book online', L + nw + 16, H - 52);
  return canvas;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// Website: fill every <canvas data-banner> on the page
export function paintBanners(list, shop) {
  document.querySelectorAll('canvas[data-banner]').forEach(c => { const h = list.find(x => x.id === c.dataset.banner); if (h) drawBanner(c, h, shop); });
}
export async function bannerBlob(h, shop) { const c = document.createElement('canvas'); await drawBanner(c, h, shop); return new Promise(res => c.toBlob(res, 'image/png')); }
