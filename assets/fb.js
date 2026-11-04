// Picks the backend for every page.
// With firebase-config.js filled in, pages use Firebase. Without it, they run in demo mode:
// sample data kept in this browser only, no payments, no emails or texts.
import { firebaseConfig } from './firebase-config.js';

export const configured = !String(firebaseConfig.apiKey || '').startsWith('PASTE');
export const demo = !configured;
const B = await import(demo ? './demo-backend.js' : './firebase-backend.js');
export const { db, call, login, logout, resetPassword, onAuth } = B;
export const resetDemo = B.resetDemo || (() => {});

export function demoBar(adminLink) {
  if (!demo) return '';
  return `<div class="demo-bar"><div class="wrap"><span><b>Demo</b> · Sample data, saved only in this browser. Payments, emails and texts are skipped.</span>
    <span class="row">${adminLink ? `<a class="btn btn-sm" href="${adminLink}">Open the dashboard</a>` : ''}<button type="button" class="btn btn-sm" data-act="resetDemo">Reset demo</button></span></div></div>`;
}
