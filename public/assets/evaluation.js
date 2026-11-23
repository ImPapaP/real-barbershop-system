// System evaluation questionnaire based on ISO/IEC 25010 (software product quality), used by evaluate.html
// (respondents answer) and the dashboard's Reports page (results). No screen or database code: tests/unit runs it.
//
// The 8 quality characteristics of ISO/IEC 25010:2011, each with plain-language statements rated on a
// 5-point Likert scale. Statements marked `it` are asked only of IT professionals (they need technical judgement).

export const SCALE = [
  [5, 'Strongly agree'], [4, 'Agree'], [3, 'Neutral'], [2, 'Disagree'], [1, 'Strongly disagree'],
];
export const GROUPS = [
  ['owner', 'Owner or manager'], ['staff', 'Staff (barber, stylist or receptionist)'], ['client', 'Client'], ['it', 'IT professional or instructor'],
];
export const CHARS = [
  { id: 'fs', name: 'Functional suitability', items: [
    ['fs1', 'The system has the features the shop needs: booking, checkout, staff, pay and reports.'],
    ['fs2', 'Totals, commissions, pay and change are computed correctly.'],
    ['fs3', 'The system helps finish tasks like booking or checkout in fewer steps.'] ] },
  { id: 'pe', name: 'Performance efficiency', items: [
    ['pe1', 'Pages open and respond quickly.'],
    ['pe2', 'The system stays fast even with many bookings and sales.'],
    ['pe3', 'The system works well on an ordinary phone and mobile data.'] ] },
  { id: 'co', name: 'Compatibility', items: [
    ['co1', 'The system works on phones, tablets and computers, and in different browsers.'],
    ['co2', 'It works with the services the shop uses: GCash and card payments, text messages and email.'],
    ['co3', 'Data can be exported to Excel or CSV for use in other programs.', 'it'] ] },
  { id: 'us', name: 'Usability', items: [
    ['us1', 'The system is easy to learn without training.'],
    ['us2', 'Screens, labels and buttons are clear and easy to understand.'],
    ['us3', 'It is easy to correct a mistake, and the system warns before risky actions.'],
    ['us4', 'The design is pleasant to look at and use, in light and dark mode.'],
    ['us5', 'People who use a keyboard or a screen reader can use the system.', 'it'] ] },
  { id: 're', name: 'Reliability', items: [
    ['re1', 'The system works without errors or crashes.'],
    ['re2', 'The system keeps working when the internet is slow or drops, and catches up after.'],
    ['re3', 'Data is not lost, and backups can be restored.'] ] },
  { id: 'se', name: 'Security', items: [
    ['se1', 'Each person only sees and changes what their role allows.'],
    ['se2', 'Client and payment information is kept private.'],
    ['se3', 'Important actions are recorded and can be traced to the person who did them.'],
    ['se4', 'Sign-in is protected (passwords, the owner’s two-step code, the owner PIN).', 'it'] ] },
  { id: 'ma', name: 'Maintainability', it: true, items: [
    ['ma1', 'The code is organized into clear parts that can be changed separately.', 'it'],
    ['ma2', 'Changes can be checked with the automated tests.', 'it'],
    ['ma3', 'The documentation explains how to set up, run and change the system.', 'it'] ] },
  { id: 'po', name: 'Portability', it: true, items: [
    ['po1', 'The system is easy to install and put online.', 'it'],
    ['po2', 'It can move to another domain or hosting account with little effort.', 'it'],
    ['po3', 'Users only need a web browser, nothing to install.', 'it'] ] },
];
export const itemsFor = group => CHARS.flatMap(c => c.items.filter(([, , it]) => group === 'it' || !it).map(([id, text]) => ({ id, text, char: c.id })));
export const charsFor = group => CHARS.filter(c => group === 'it' || !c.it).map(c => ({ ...c, items: c.items.filter(([, , it]) => group === 'it' || !it) }));
export const ALL_IDS = CHARS.flatMap(c => c.items.map(([id]) => id));

// The usual verbal interpretation of a 5-point weighted mean (equal intervals of 0.8)
export function interpret(mean) {
  if (mean == null || isNaN(mean)) return '';
  return mean >= 4.21 ? 'Strongly agree (Excellent)' : mean >= 3.41 ? 'Agree (Very good)' : mean >= 2.61 ? 'Neutral (Good)' : mean >= 1.81 ? 'Disagree (Fair)' : 'Strongly disagree (Poor)';
}
const mean = xs => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
const sd = xs => { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1)); };

// Weighted mean per statement, per characteristic (mean of its statements' answers) and overall
// (mean of the characteristic means), from a list of responses { group, answers: { id: 1-5 } }.
export function summarize(responses, group = '') {
  const rs = responses.filter(r => !group || r.group === group);
  const item = {}; for (const id of ALL_IDS) { const v = rs.map(r => r.answers && r.answers[id]).filter(x => x >= 1 && x <= 5); item[id] = { n: v.length, mean: mean(v), sd: sd(v), counts: [5, 4, 3, 2, 1].map(k => v.filter(x => x === k).length) }; }
  const chars = CHARS.map(c => { const v = c.items.flatMap(([id]) => rs.map(r => r.answers && r.answers[id]).filter(x => x >= 1 && x <= 5)); const m = mean(v); return { id: c.id, name: c.name, n: v.length, mean: m, sd: sd(v), label: interpret(m) }; });
  const answered = chars.filter(c => c.mean != null), overall = mean(answered.map(c => c.mean));
  const groups = Object.fromEntries(GROUPS.map(([g]) => [g, rs.filter(r => r.group === g).length]));
  return { n: rs.length, groups, item, chars, overall, label: interpret(overall) };
}
