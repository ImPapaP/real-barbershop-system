// Small QR code generator (byte mode, error correction M, versions 1-10) for the walk-in poster.
// Based on the QR Code spec (ISO/IEC 18004); returns an SVG string. No libraries needed.
const ECC_M = { // [ec codewords per block, blocks in group 1, data cw per block g1, blocks g2, data cw per block g2]
  1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44]
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

// GF(256) arithmetic for Reed-Solomon
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const gmul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); g.forEach((c, j) => { ng[j] ^= c; ng[j + 1] ^= gmul(c, EXP[i]); }); g = ng; } return g; }
function rsEncode(data, n) {
  const g = rsGen(n), res = new Array(n).fill(0);
  for (const d of data) { const f = d ^ res[0]; res.shift(); res.push(0); if (f) for (let i = 0; i < n; i++) res[i] ^= gmul(g[i + 1], f); }
  return res;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 0;
  for (let v = 1; v <= 10; v++) { const e = ECC_M[v], cap = e[1] * e[2] + e[3] * e[4]; if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap * 8) { ver = v; break; } }
  if (!ver) throw new Error('Text too long for this QR code');
  const [ecn, b1, d1, b2, d2] = ECC_M[ver], capBytes = b1 * d1 + b2 * d2;
  // data bits
  const bits = [], put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, capBytes * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; data.length < capBytes; p++) data.push(p % 2 ? 0x11 : 0xec);
  // blocks + interleave
  const blocks = []; let k = 0;
  for (let i = 0; i < b1; i++) { blocks.push(data.slice(k, k + d1)); k += d1; }
  for (let i = 0; i < b2; i++) { blocks.push(data.slice(k, k + d2)); k += d2; }
  const ecs = blocks.map(b => rsEncode(b, ecn)), out = [];
  for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
  for (let i = 0; i < ecn; i++) ecs.forEach(e => out.push(e[i]));
  // matrix
  const n = ver * 4 + 17, M = Array.from({ length: n }, () => new Array(n).fill(null)), F = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, v) => { M[r][c] = v; F[r][c] = true; };
  const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const y = r + i, x = c + j; if (y < 0 || x < 0 || y >= n || x >= n) continue; const on = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)); set(y, x, on); } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[ver];
  const last = al[al.length - 1];
  for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1); }
  for (let i = 0; i < 9; i++) { if (!F[8][i]) set(8, i, false); if (!F[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { if (!F[8][n - 1 - i]) set(8, n - 1 - i, false); if (!F[n - 1 - i][8]) set(n - 1 - i, 8, false); }
  set(n - 8, 8, true); // dark module
  if (ver >= 7) { let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25); const vb = (ver << 12) | rem; for (let i = 0; i < 18; i++) { const b = ((vb >> i) & 1) === 1, a = Math.floor(i / 3), c = n - 11 + (i % 3); set(a, c, b); set(c, a, b); } }
  // place data, zigzag
  const dbits = []; out.forEach(b => { for (let i = 7; i >= 0; i--) dbits.push((b >> i) & 1); });
  let bi = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? n - 1 - vert : vert;
      if (!F[y][x]) { M[y][x] = bi < dbits.length ? dbits[bi] === 1 : false; bi++; }
    }
  }
  // masks: pick the one with the lowest penalty
  const MASKS = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0, (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];
  const fmtBits = mask => { const d = (0 << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537); return ((d << 10) | rem) ^ 0x5412; }; // ECC M = 00
  const withMask = mask => {
    const G = M.map((row, r) => row.map((v, c) => F[r][c] ? v : v !== MASKS[mask](r, c)));
    const fb = fmtBits(mask);
    const bit = i => ((fb >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) G[i][8] = bit(i);
    G[7][8] = bit(6); G[8][8] = bit(7); G[8][7] = bit(8);
    for (let i = 9; i < 15; i++) G[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) G[8][n - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) G[n - 15 + i][8] = bit(i);
    G[n - 8][8] = true;
    return G;
  };
  const penalty = G => {
    let p = 0;
    for (let r = 0; r < n; r++) for (const line of [G[r], G.map(row => row[r])]) { let run = 1; for (let i = 1; i < n; i++) { if (line[i] === line[i - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = G[r][c]; if (v === G[r][c + 1] && v === G[r + 1][c] && v === G[r + 1][c + 1]) p += 3; }
    const pat = [true, false, true, true, true, false, true];
    for (let r = 0; r < n; r++) for (let c = 0; c <= n - 7; c++) for (const get of [i => G[r][c + i], i => G[c + i][r]]) {
      if (pat.every((v, i) => get(i) === v)) { const before = c >= 4 && [1, 2, 3, 4].every(i => !get(-i)), after = c + 11 <= n && [7, 8, 9, 10].every(i => !get(i)); if (before || after) p += 40; }
    }
    const dark = G.flat().filter(Boolean).length; p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  };
  let best = null, bestP = Infinity;
  for (let m = 0; m < 8; m++) { const G = withMask(m), p = penalty(G); if (p < bestP) { bestP = p; best = G; } }
  return best;
}

export function qrSvg(text, { size = 240, margin = 4, dark = '#000', light = '#fff' } = {}) {
  const G = qrMatrix(text), n = G.length, t = n + margin * 2;
  let d = '';
  G.forEach((row, r) => row.forEach((v, c) => { if (v) d += `M${c + margin} ${r + margin}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${t}" height="${t}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
