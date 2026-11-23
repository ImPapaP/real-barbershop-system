// Dashboard · System evaluation results (Reports page, owner).
// Respondents answer evaluate.html (ISO/IEC 25010 questionnaire); this shows the weighted mean per quality
// characteristic and per statement, with the usual verbal interpretation, and exports everything as CSV.
import { esc } from '../shared.js';
import { qrSvg } from '../qr.js';
import { CHARS, GROUPS, SCALE, interpret, summarize } from '../evaluation.js';
import { ACT, CHG, S } from './state.js';
import { armed, del, render, toast } from './core.js';
import { logAct } from './access.js';
import { REP, exportBtns } from './reports.js';

export const evalUrl = () => new URL('../evaluate.html', location.href).href;
const f2 = v => v == null ? '—' : v.toFixed(2);
const groupName = g => (GROUPS.find(x => x[0] === g) || [g, g])[1];
const SHORT = { owner: 'owner', staff: 'staff', client: 'clients', it: 'IT' };

export function evalPanel() {
  const all = S.evaluations || [], samples = all.filter(r => r.sample).length, g = S.evalGroup || '', R = summarize(all, g), url = evalUrl();
  const itemText = Object.fromEntries(CHARS.flatMap(c => c.items.map(([id, t]) => [id, t])));
  REP.evaluation = [['Characteristic / statement', 'Respondents', 'Weighted mean', 'Standard deviation', 'Interpretation'],
    ...R.chars.flatMap(c => [[c.name, '', c.mean == null ? '' : +c.mean.toFixed(2), c.sd == null ? '' : +c.sd.toFixed(2), c.label],
      ...CHARS.find(x => x.id === c.id).items.map(([id]) => { const it = R.item[id]; return [`   ${id} ${itemText[id]}`, it.n, it.mean == null ? '' : +it.mean.toFixed(2), it.sd == null ? '' : +it.sd.toFixed(2), interpret(it.mean)]; })]),
    ['Overall', R.n, R.overall == null ? '' : +R.overall.toFixed(2), '', R.label]];
  const ids = CHARS.flatMap(c => c.items.map(([id]) => id));
  REP['evaluation-raw'] = [['Respondent', 'Group', 'Date', 'Sample', ...ids, 'Comment'], ...all.filter(r => !g || r.group === g).sort((a, b) => (a.at || 0) - (b.at || 0)).map((r, i) => [i + 1, r.group, new Date(r.at || 0).toISOString().slice(0, 10), r.sample ? 'yes' : '', ...ids.map(id => (r.answers || {})[id] || ''), r.comment || ''])];
  const comments = all.filter(r => (!g || r.group === g) && r.comment).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8);
  return `<section class="panel rep" data-rep="evaluation"><div class="panel-h"><h2>System evaluation (ISO/IEC 25010)</h2>${exportBtns('evaluation')}</div>
    <div class="ev-share">
      <div class="ev-qr" aria-hidden="true">${qrSvg(url, { size: 120, margin: 2 })}</div>
      <div class="stack" style="min-width:0">
        <p class="muted small" style="margin:0">Ask the owner, staff, clients and IT professionals to answer. It takes about 5 minutes on a phone. Scan the code or send the link:</p>
        <p class="ev-link"><code>${esc(url)}</code></p>
        <div class="row"><button type="button" class="btn btn-sm" data-act="evCopy">Copy link</button><a class="btn btn-sm btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">Open the questionnaire</a><button type="button" class="btn btn-sm btn-ghost" data-act="repCsv" data-k="evaluation-raw">Raw answers CSV</button></div>
      </div>
    </div>
    ${samples ? `<div class="notice"><p><b>${samples} sample answer${samples === 1 ? '' : 's'}</b> from the demo ${samples === 1 ? 'is' : 'are'} included. Remove them before collecting real answers, and never report them as results.</p><button type="button" class="btn btn-sm" data-act="evClearSamples">Remove sample answers</button></div>` : ''}
    ${!all.length ? '<p class="muted">No answers yet. Share the link above.</p>' : `
    <div class="row ev-filter"><label for="ev-g" class="muted small">Respondents</label><select id="ev-g" data-change="evGroup"><option value="">Everyone (${all.length})</option>${GROUPS.map(([k, label]) => `<option value="${k}" ${g === k ? 'selected' : ''}>${esc(label)} (${all.filter(r => r.group === k).length})</option>`).join('')}</select></div>
    <div class="acc-kpis">
      <div class="kpi"><span>Overall weighted mean</span><b>${f2(R.overall)}</b><small>${esc(R.label)}</small></div>
      <div class="kpi"><span>Respondents</span><b>${R.n}</b><small>${GROUPS.filter(([k]) => R.groups[k]).map(([k]) => `${R.groups[k]} ${SHORT[k]}`).join(' · ') || '—'}</small></div>
    </div>
    <div class="tbl-wrap"><table class="tbl ev-tbl"><caption class="sr-only">Weighted mean for each ISO/IEC 25010 quality characteristic</caption><thead><tr><th>Quality characteristic</th><th class="r">Weighted mean</th><th class="r">SD</th><th>Interpretation</th></tr></thead><tbody>
      ${R.chars.map(c => `<tr><td><details><summary><b>${esc(c.name)}</b></summary><ul class="ev-items">${CHARS.find(x => x.id === c.id).items.map(([id, t]) => { const it = R.item[id]; return `<li><span>${esc(t)}</span><span class="nowrap">${it.n ? `${f2(it.mean)} · ${esc(interpret(it.mean).split(' (')[0])} · n=${it.n}` : 'not asked'}</span></li>`; }).join('')}</ul></details></td><td class="r"><b>${f2(c.mean)}</b></td><td class="r">${f2(c.sd)}</td><td>${esc(c.label || '—')}</td></tr>`).join('')}
      <tr class="ev-total"><td><b>Overall</b></td><td class="r"><b>${f2(R.overall)}</b></td><td class="r"></td><td><b>${esc(R.label)}</b></td></tr></tbody></table></div>
    <p class="muted small">Scale: ${SCALE.map(([v, w]) => `${v} ${w}`).join(' · ')}. Interpretation of means: 4.21–5.00 Strongly agree (Excellent), 3.41–4.20 Agree (Very good), 2.61–3.40 Neutral (Good), 1.81–2.60 Disagree (Fair), 1.00–1.80 Strongly disagree (Poor). Maintainability and portability, and a few technical statements, are asked only of IT professionals. Tap a characteristic to see each statement.</p>
    ${comments.length ? `<h3 class="acc-h">Latest comments</h3><ul class="ev-comments">${comments.map(r => `<li><p>“${esc(r.comment)}”</p><span class="muted small">${esc(groupName(r.group).split(' (')[0])}${r.sample ? ' · sample' : ''}</span></li>`).join('')}</ul>` : ''}`}
  </section>`;
}

Object.assign(ACT, {
  async evCopy() { try { await navigator.clipboard.writeText(evalUrl()); toast('Link copied'); } catch (_) { toast(evalUrl()); } },
  async evClearSamples(el) {
    if (!armed(el)) return;
    const s = (S.evaluations || []).filter(r => r.sample); let n = 0;
    for (const r of s) if (await del('evaluations', r.id)) n++;
    logAct('settings', `Removed ${n} sample evaluation answers`); toast(`${n} sample answers removed`); render();
  },
});
Object.assign(CHG, { evGroup(el) { S.evalGroup = el.value; render(); } });
