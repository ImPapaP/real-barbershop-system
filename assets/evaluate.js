// System evaluation page (evaluate.html): a short ISO/IEC 25010 questionnaire for the owner, staff, clients and
// IT professionals. Unlisted: share the link or the QR code from Reports → System evaluation.
// Answers go to the server (Cloud Function submitEvaluation); nothing is saved on this phone except a "done" flag.
import { db, call, demoBar } from './fb.js';
import { $, esc, STARTER, brand } from './shared.js';
import { SCALE, GROUPS, charsFor } from './evaluation.js';

const S = { group: '', answers: {}, name: '', comment: '', consent: false, busy: false, err: '', done: false, shop: STARTER.shop };
try { S.done = localStorage.getItem('rb-eval-done') === '1'; } catch (_) {}

function form() {
  const chars = S.group ? charsFor(S.group) : [], total = chars.reduce((s, c) => s + c.items.length, 0), answered = chars.reduce((s, c) => s + c.items.filter(([id]) => S.answers[id]).length, 0);
  return `<form id="ev-form" class="ev" novalidate>
    <fieldset class="ev-sec"><legend><h2>1. About you</h2></legend>
      <p class="muted small">Pick the one that fits you best. IT professionals get a few extra technical statements.</p>
      <div class="ev-groups" role="radiogroup" aria-label="You are">${GROUPS.map(([g, label]) => `<label class="ev-group"><input type="radio" name="group" value="${g}" ${S.group === g ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>
      <label class="ev-field" for="ev-name"><span>Name <span class="muted">(optional)</span></span><input id="ev-name" maxlength="60" autocomplete="name" value="${esc(S.name)}"></label>
    </fieldset>
    ${S.group ? `<p class="ev-how">For each statement, choose how much you agree. <b>5</b> = strongly agree, <b>1</b> = strongly disagree.</p>
    ${chars.map((c, ci) => `<fieldset class="ev-sec"><legend><h2>${ci + 2}. ${esc(c.name)}</h2></legend>
      ${c.items.map(([id, text]) => `<div class="ev-q${S.err && !S.answers[id] ? ' ev-miss' : ''}" id="q-${id}"><p id="t-${id}">${esc(text)}</p>
        <div class="ev-scale" role="radiogroup" aria-labelledby="t-${id}">${SCALE.map(([v, w]) => `<label><input type="radio" name="${id}" value="${v}" ${S.answers[id] === v ? 'checked' : ''}><span><b>${v}</b><small>${esc(w)}</small></span></label>`).join('')}</div></div>`).join('')}
    </fieldset>`).join('')}
    <fieldset class="ev-sec"><legend><h2>${chars.length + 2}. Anything else?</h2></legend>
      <label class="ev-field" for="ev-comment"><span>Comments or suggestions <span class="muted">(optional)</span></span><textarea id="ev-comment" rows="4" maxlength="800">${esc(S.comment)}</textarea></label>
      <label class="ev-consent"><input type="checkbox" id="ev-consent" ${S.consent ? 'checked' : ''}> I agree that my answers may be used for evaluating this system and in a school research paper. They are reported as totals, and my name (if given) is never published. (Data Privacy Act of 2012)</label>
    </fieldset>
    ${S.err ? `<p class="ev-err" role="alert">${esc(S.err)}</p>` : ''}
    <div class="ev-submit"><span class="muted small" aria-live="polite">${answered} of ${total} answered</span><button class="btn btn-accent" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Sending…' : 'Send my answers'}</button></div>` : ''}
  </form>`;
}
function render() {
  const sh = S.shop;
  $('#app').innerHTML = `${demoBar ? demoBar('') : ''}<header class="site-head"><div class="wrap head-in"><a class="wordmark" href="./">${brand(sh.wordmark || sh.name)}</a></div></header>
  <main class="wrap legal ev-main"><p class="eyebrow">${esc(sh.name)}</p><h1>System evaluation</h1>
    ${S.done ? `<div class="ev-thanks" role="status"><h2>Thank you!</h2><p>Your answers were sent. They help us improve the booking website and the shop’s system.</p><p><a href="./">Back to the website</a> · <button type="button" class="btn-link" id="ev-again">Answer for someone else on this phone</button></p></div>`
      : `<p class="ev-lead">Help us rate the ${esc(sh.name)} booking website and shop system. It takes about 5 minutes. There are no right or wrong answers.</p>${form()}`}
  </main>`;
}
function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500); }

document.addEventListener('change', e => {
  const el = e.target;
  if (el.name === 'group') { S.group = el.value; S.err = ''; render(); return; }
  if (el.type === 'radio' && el.name) { S.answers[el.name] = +el.value; const q = el.closest('.ev-q'); if (q) q.classList.remove('ev-miss'); const c = document.querySelector('.ev-submit .muted'); if (c) { const chars = charsFor(S.group); c.textContent = `${chars.reduce((s, x) => s + x.items.filter(([id]) => S.answers[id]).length, 0)} of ${chars.reduce((s, x) => s + x.items.length, 0)} answered`; } }
  if (el.id === 'ev-consent') S.consent = el.checked;
});
document.addEventListener('input', e => { if (e.target.id === 'ev-name') S.name = e.target.value; if (e.target.id === 'ev-comment') S.comment = e.target.value; });
document.addEventListener('click', e => { if (e.target.id === 'ev-again') { try { localStorage.removeItem('rb-eval-done'); } catch (_) {} Object.assign(S, { done: false, group: '', answers: {}, name: '', comment: '', consent: false }); render(); } });
document.addEventListener('submit', async e => {
  if (e.target.id !== 'ev-form') return; e.preventDefault();
  const ids = charsFor(S.group).flatMap(c => c.items.map(([id]) => id)), missing = ids.filter(id => !S.answers[id]);
  if (missing.length) { S.err = `Please answer every statement (${missing.length} left).`; render(); const q = document.getElementById('q-' + missing[0]); if (q) { q.scrollIntoView({ block: 'center' }); const r = q.querySelector('input'); if (r) r.focus({ preventScroll: true }); } return; }
  if (!S.consent) { S.err = 'Please tick the agreement box to send your answers.'; render(); const c = $('#ev-consent'); if (c) c.focus(); return; }
  S.busy = true; S.err = ''; render();
  try {
    const answers = Object.fromEntries(ids.map(id => [id, S.answers[id]]));
    await call('submitEvaluation', { group: S.group, answers, name: S.name.trim(), comment: S.comment.trim(), consent: true });
    S.done = true; try { localStorage.setItem('rb-eval-done', '1'); } catch (_) {}
    render(); window.scrollTo(0, 0);
  } catch (er) { S.busy = false; S.err = er.message || 'Couldn’t send. Check your internet and try again.'; render(); toast(S.err); }
});
render();
db.doc('public/info').get().then(s => { if (s.exists) { S.shop = { ...STARTER.shop, ...(s.data().shop || {}) }; render(); } }).catch(() => {});
