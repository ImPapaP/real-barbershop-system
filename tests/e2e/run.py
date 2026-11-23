#!/usr/bin/env python3
"""End-to-end tests for the website and dashboard, in demo mode (no Firebase needed).

Run from the repo root:
    pip install playwright && python -m playwright install chromium   # once
    python tests/e2e/run.py            # all tests
    python tests/e2e/run.py checkout   # only tests whose name contains "checkout"

It serves public/ on a free local port, opens Chromium and walks through what the shop does every day:
booking online, the booking alert, checkout (cash and split bill), coupons, payslips, the owner's two-step
code, offline checkout, and a keyboard / screen-reader check. Exit code 1 if anything fails.
"""
import asyncio, functools, http.server, os, re, socket, sys, threading, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2] / 'public'
DASH = 'r3al-hq-7m2k'

def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{port}/'

BASE = serve(); D = BASE + DASH + '/'
TESTS, results = [], []
def t(fn): TESTS.append(fn); return fn
def check(cond, msg):
    if not cond: raise AssertionError(msg)

# ---------- helpers ----------
STORE = "Object.keys(localStorage).find(k=>{try{return localStorage[k].includes('\"public/info\"')}catch(e){return false}})"
async def store_get(pg, prefix):
    return await pg.evaluate(f"""p => {{ const m=new Map(JSON.parse(localStorage[{STORE}])); return [...m].filter(([k])=>k.startsWith(p)).map(([k,v])=>({{_id:k.split('/')[1],...v}})); }}""", prefix)
async def store_edit(pg, js):  # js gets m (Map of the demo database); runs in a second tab so the dashboard hears it
    p2 = await pg.context.new_page(); await p2.goto(BASE + 'terms.html'); await p2.wait_for_timeout(500)
    await p2.evaluate(f"() => {{ const K={STORE}; const m=new Map(JSON.parse(localStorage[K])); {js}; localStorage[K]=JSON.stringify([...m]); }}")
    await p2.close(); await pg.wait_for_timeout(900)
async def sign_in(pg, email):
    await pg.goto(D + 'login.html'); await pg.wait_for_timeout(600)
    await pg.evaluate("localStorage.setItem('rb-demo-user','out')"); await pg.goto(D + 'login.html'); await pg.wait_for_timeout(1000)
    await pg.fill('#si-email', email); await pg.fill('#si-pass', 'x'); await pg.click('#si-form button[type=submit]'); await pg.wait_for_timeout(1600)
    if await pg.locator('#tf-form').count():
        await pg.click('[data-act=tfSend][data-via=email]'); await pg.wait_for_timeout(300)
        code = re.search(r'(\d{6})', await pg.locator('#tf-help').inner_text()).group(1)
        await pg.fill('#tf-code', code); await pg.click('#tf-form button[type=submit]'); await pg.wait_for_timeout(1600)
async def ring_up(pg, n_items=1):
    await pg.goto(D + '#checkout'); await pg.wait_for_timeout(900)
    for i in range(n_items): await pg.locator('[data-act=posAdd]').nth(i).click(); await pg.wait_for_timeout(150)
    sel = pg.locator('select[data-bind="pos.barberId"]').first
    if await sel.count(): await sel.select_option(index=1)
async def latest_sale(pg):
    sales = await store_get(pg, 'sales/'); return sorted(sales, key=lambda s: s.get('at') or 0)[-1]

# ---------- tests ----------
@t
async def booking_online_and_alert(c):
    desk = await c.new_page(); await sign_in(desk, 'airyl@demo.realbarbers'); await desk.goto(D + '#schedule'); await desk.wait_for_timeout(1200)
    await desk.mouse.click(600, 300)
    site = await c.new_page(); await site.goto(BASE); await site.wait_for_timeout(1500)
    r = await site.evaluate("""async () => { const fb = await import('./assets/fb.js'); const i = (await fb.db.doc('public/info').get()).data();
      const svc = i.services.find(s => s.active !== false && !s.addOn) || i.services[0];
      for (let k = 1; k <= 10; k++) { const d = new Date(Date.now() + 8*3600e3 + k*864e5).toISOString().slice(0,10);
        for (const time of ['10:00','11:00','13:00','14:00','15:00','16:00','17:00']) {
          try { return { ok: true, ...(await fb.call('createBooking', { serviceIds: [svc.id], barberId: '', date: d, time, name: 'Test Client', phone: '09171230000', email: 'test@example.com', consent: true, payMethod: 'online' })), d, time }; } catch (e) { if (!/taken|closed|past|available|time/i.test(e.message)) return { ok: false, err: e.message }; } } }
      return { ok: false, err: 'no free time found' }; }""")
    check(r.get('ok'), f"booking failed: {r.get('err')}")
    appt = [a for a in await store_get(site, 'appointments/') if a.get('name') == 'Test Client']
    check(appt and appt[0]['date'] == r['d'], 'booking not saved')
    # paid online in demo → the booking is real: mark it booked from another tab and the desk hears it
    await store_edit(desk, f"const a=m.get('appointments/{appt[0]['_id']}'); a.status='booked'; m.set('appointments/{appt[0]['_id']}', a)")
    await desk.wait_for_timeout(800)
    titles = await desk.locator('.alert-txt b').all_inner_texts()
    check(any('online booking' in x.lower() for x in titles), f'no booking alert, saw {titles}')

@t
async def checkout_cash(c):
    pg = await c.new_page(); await sign_in(pg, 'airyl@demo.realbarbers'); await ring_up(pg)
    await pg.fill('#pos-cash', '1000'); await pg.wait_for_timeout(300)
    await pg.locator('[data-act=posComplete]').click(); await pg.wait_for_timeout(900)
    s = await latest_sale(pg)
    check(s['method'] == 'Cash' and s['cash'] == 1000 and s['total'] > 0, f'bad cash sale {s}')
    check('Change' in await pg.locator('#modal').inner_text(), 'receipt has no change line')

@t
async def checkout_split_bill(c):
    pg = await c.new_page(); await sign_in(pg, 'airyl@demo.realbarbers'); await ring_up(pg)
    await pg.locator('[data-act=posMethod][data-v=Split]').click(); await pg.wait_for_timeout(200)
    check(await pg.locator('[data-act=posComplete]').is_disabled(), 'complete should wait for the cash part')
    await pg.fill('#pos-scash', '100'); await pg.wait_for_timeout(300)
    await pg.locator('[data-act=posComplete]').click(); await pg.wait_for_timeout(900)
    s = await latest_sale(pg)
    check(s['method'] == 'Split' and s['split'][0] == {'m': 'Cash', 'amt': 100} and round(s['split'][0]['amt'] + s['split'][1]['amt'], 2) == round(s['total'] - (s.get('depositCredit') or 0), 2), f'bad split {s}')
    await pg.keyboard.press('Escape'); await pg.goto(D + '#schedule'); await pg.wait_for_timeout(900)
    txt = await pg.locator('.daycheck').inner_text()
    check('Cash' in txt and 'GCash' in txt, 'day check missing methods')

@t
async def coupon_used_at_checkout(c):
    pg = await c.new_page(); await sign_in(pg, 'airyl@demo.realbarbers')
    cust = (await store_get(pg, 'customers/'))[0]
    await store_edit(pg, f"const x=m.get('customers/{cust['_id']}'); x.coupons=[...(x.coupons||[]),{{id:'cpTEST',kind:'amount',value:100,note:'Test',used:false}}]; m.set('customers/{cust['_id']}', x)")
    await ring_up(pg)
    await pg.fill('#pos-name', cust['name']); await pg.fill('#pos-phone', cust.get('phone') or ''); await pg.wait_for_timeout(600)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
    btn = pg.locator('[data-act=posCoupon][data-id=cpTEST]'); check(await btn.count(), 'coupon not offered at checkout')
    await btn.click(); await pg.wait_for_timeout(300)
    await pg.locator('[data-act=posComplete]').click(); await pg.wait_for_timeout(1000)
    s = await latest_sale(pg); check(s.get('discount') == 100 and s.get('couponId') == 'cpTEST', f'coupon not applied {s}')
    x = [k for k in await store_get(pg, 'customers/') if k['_id'] == cust['_id']][0]
    check([cp for cp in x['coupons'] if cp['id'] == 'cpTEST'][0].get('used') is True, 'coupon not marked used')

@t
async def payslips_add_up(c):
    pg = await c.new_page(); await sign_in(pg, 'alex@demo.realbarbers'); await pg.goto(D + '#payroll'); await pg.wait_for_timeout(1500)
    rows = await pg.evaluate("""() => [...document.querySelectorAll('.tbl tbody tr')].map(tr => [...tr.cells].map(td => td.innerText.trim())).filter(r => r.length >= 10)""")
    check(len(rows) > 2, 'no payslips')
    n = lambda v: 0 if v in ('', '—') else float(re.sub(r'[^\d.]', '', v.split('\n')[0]) or 0) * (-1 if v.strip().startswith(('−', '-')) else 1)
    for r in rows:  # Name, Days, Base, Commission(+DP), Tips, Leave, Late, Vale, Net
        dp = re.search(r'\+ ₱([\d,.]+) kept DP', r[3]); dpv = float(dp.group(1).replace(',', '')) if dp else 0
        gross = n(r[2]) + n(r[3]) + dpv + n(r[4]); net = gross + n(r[6]) + n(r[7])
        check(abs(net - n(r[8])) < 1.01, f'payslip for {r[0].splitlines()[0]} does not add up: {r}')

@t
async def owner_two_step(c):
    pg = await c.new_page()
    await pg.goto(D + 'login.html'); await pg.wait_for_timeout(600); await pg.evaluate("localStorage.setItem('rb-demo-user','out'); Object.keys(localStorage).filter(k=>k.startsWith('rb-2fa-')).forEach(k=>localStorage.removeItem(k))")
    await pg.goto(D + 'login.html'); await pg.wait_for_timeout(1000)
    await pg.fill('#si-email', 'alex@demo.realbarbers'); await pg.fill('#si-pass', 'x'); await pg.click('#si-form button[type=submit]'); await pg.wait_for_timeout(1600)
    check(await pg.locator('#tf-form').count() == 1, 'owner was not asked for a code')
    await pg.goto(D + '#money'); await pg.wait_for_timeout(1600)
    check('login.html' in pg.url, 'dashboard opened without the code')
    await pg.click('[data-act=tfSend][data-via=email]'); await pg.wait_for_timeout(300)
    await pg.fill('#tf-code', '000000'); await pg.click('#tf-form button[type=submit]'); await pg.wait_for_timeout(400)
    check('isn’t right' in await pg.locator('.si-err').inner_text(), 'wrong code accepted')
    code = re.search(r'(\d{6})', await pg.locator('#tf-help').inner_text()).group(1)
    await pg.fill('#tf-code', code); await pg.click('#tf-form button[type=submit]'); await pg.wait_for_timeout(1800)
    check(pg.url.endswith('#money'), f'not sent to the page asked for: {pg.url}')

@t
async def offline_checkout_syncs(c):
    pg = await c.new_page(); await sign_in(pg, 'airyl@demo.realbarbers')
    await store_edit(pg, "const i=m.get('public/info'); i.shop.orEnabled=true; i.shop.orPrefix='OR-'; m.set('public/info', i)")
    await pg.goto(D + '#checkout'); await pg.wait_for_timeout(2000); await pg.reload(); await pg.wait_for_timeout(1500)
    await c.set_offline(True); await pg.wait_for_timeout(300)
    check(await pg.locator('#netbar').is_visible(), 'no offline bar')
    await ring_up(pg); await pg.locator('[data-act=posComplete]').click(); await pg.wait_for_timeout(900)
    s = await latest_sale(pg); check(s.get('orPending') and not s.get('orNo'), 'offline sale should wait for its receipt number')
    await pg.keyboard.press('Escape'); await pg.reload(); await pg.wait_for_timeout(2000)
    check(await pg.locator('.page-head').count(), 'dashboard did not open offline')
    await c.set_offline(False); await pg.wait_for_timeout(2500)
    s = [x for x in await store_get(pg, 'sales/') if x['_id'] == s['_id']][0]
    check(s.get('orNo', '').startswith('OR-') and not s.get('orPending'), f'receipt number not given after reconnect {s}')

@t
async def keyboard_and_screen_reader(c):
    pg = await c.new_page(); await sign_in(pg, 'alex@demo.realbarbers'); await pg.goto(D + '#schedule'); await pg.wait_for_timeout(1200)
    await pg.keyboard.press('Tab'); first = await pg.evaluate("document.activeElement.textContent.trim()")
    check('Skip to' in first, f'first Tab should reach the skip link, got {first!r}')
    await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
    check(await pg.evaluate("document.activeElement.id") == 'main', 'skip link does not move focus to the page')
    # a pop-up: focus goes in, Tab stays inside, Escape closes and focus returns to the button
    await pg.locator('[data-act=newBooking]').first.focus(); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
    check(await pg.evaluate("document.querySelector('#modal').contains(document.activeElement)"), 'focus did not move into the pop-up')
    check(await pg.evaluate("!!document.querySelector('#modal [role=dialog][aria-modal=true][aria-labelledby]')"), 'pop-up is not announced as a dialog')
    for _ in range(40): await pg.keyboard.press('Tab')
    check(await pg.evaluate("document.querySelector('#modal').contains(document.activeElement)"), 'Tab escaped the pop-up')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    check(await pg.evaluate("document.activeElement && document.activeElement.dataset.act") == 'newBooking', 'focus did not return to the button')
    missing = await pg.evaluate("""() => [...document.querySelectorAll('button, a[href], input, select, textarea')].filter(e => e.offsetParent && !(e.getAttribute('aria-label') || e.textContent.trim() || e.title || (e.labels && e.labels.length) || e.getAttribute('aria-labelledby') || e.placeholder)).map(e => e.outerHTML.slice(0, 80))""")
    check(not missing, f'controls with no name: {missing[:5]}')

# WCAG contrast for every visible piece of text: 4.5:1, or 3:1 for large text (24px, or 18.7px bold)
@t
async def evaluation_survey_and_results(c):
    pg = await c.new_page(); await pg.goto(BASE + 'evaluate.html'); await pg.wait_for_timeout(1200)
    await pg.locator('input[name=group][value=staff]').check(); await pg.wait_for_timeout(200)
    qs = await pg.evaluate("[...document.querySelectorAll('.ev-q')].map(q=>q.id.slice(2))")
    check(len(qs) >= 15 and not any(q.startswith('ma') for q in qs), f'staff should get the non-technical statements, got {qs}')
    await pg.click('.ev-submit button'); await pg.wait_for_timeout(200)
    check('answer every' in await pg.locator('.ev-err').inner_text(), 'missing answers not caught')
    for q in qs: await pg.locator(f'input[name={q}][value="4"]').check()
    await pg.locator('#ev-consent').check(); await pg.click('.ev-submit button'); await pg.wait_for_timeout(800)
    check(await pg.locator('.ev-thanks').count(), 'no thank-you after sending')
    saved = [e for e in await store_get(pg, 'evaluations/') if not e.get('sample')]
    check(len(saved) == 1 and saved[0]['group'] == 'staff' and set(saved[0]['answers'].values()) == {4}, f'answers not saved right: {saved}')
    d = await c.new_page(); await sign_in(d, 'alex@demo.realbarbers'); await d.goto(D + '#reports'); await d.wait_for_timeout(1500)
    sec = d.locator('[data-rep=evaluation]'); check(await sec.count(), 'no evaluation panel on Reports')
    await d.select_option('#ev-g', 'staff'); await d.wait_for_timeout(400)
    check('staff' in (await sec.locator('.kpi').nth(1).inner_text()), 'group filter did not apply')
    btn = sec.locator('[data-act=evClearSamples]'); await btn.click(); await btn.click(); await d.wait_for_timeout(1200)
    left = await store_get(d, 'evaluations/'); check(len(left) == 1 and not left[0].get('sample'), f'samples not removed: {len(left)} left')
    await d.select_option('#ev-g', ''); await d.wait_for_timeout(300)
    k = await d.locator('[data-rep=evaluation] .kpi').first.inner_text(); check('4.00' in k and 'Agree (Very good)' in k, f'overall mean wrong: {k}')

@t
async def no_show_model(c):
    pg = await c.new_page(); await sign_in(pg, 'alex@demo.realbarbers'); await pg.goto(D + '#reports'); await pg.wait_for_timeout(1800)
    sec = pg.locator('[data-rep=accuracy]'); check(await sec.count(), 'no accuracy panel')
    txt = await sec.inner_text()
    auc = float(re.search(r'Tells no-shows apart \(AUC\)\s*([\d.]+)', txt).group(1)); check(auc > 0.6, f'model AUC too low: {auc}')
    check('Learned model' in txt and 'Old rule' in txt, 'comparison table missing')
    await pg.goto(D + '#schedule'); await pg.wait_for_timeout(1200)
    tags = await pg.locator('.risk').all_inner_texts()
    check(any(re.search(r'\d+% chance', t) for t in tags), f'risk tags should show the model chance, got {tags}')

CONTRAST_JS = """() => {
  const rgb = s => { const m = s.match(/[\\d.]+/g); if (!m) return [0,0,0,0]; const v = m.map(Number); if (s.startsWith('color(')) { const [r,g,b,al] = v; return [r*255, g*255, b*255, al === undefined ? 1 : al]; } return v; }; // rgb() or color(srgb ...) from color-mix
  const lum = ([r,g,b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
  const mix = (top, bot) => { const a = top[3] === undefined ? 1 : top[3]; return [0,1,2].map(i => top[i]*a + bot[i]*(1-a)); };
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null; const c = rgb(cs.backgroundColor); if (c[3] === undefined || c[3] > 0) stack.push(c); if (c[3] === undefined || c[3] >= 1) break; }
    let out = [255,255,255]; const root = rgb(getComputedStyle(document.body).backgroundColor); out = root.slice(0,3); for (let i = stack.length - 1; i >= 0; i--) out = mix(stack[i], out); return out; };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode, el = n.parentElement; if (!el || seen.has(el) || !n.textContent.trim()) continue; seen.add(el);
    if (el.closest('[aria-hidden=true],.sr-only,[hidden],svg,option,.skip-link,.demo-bar,.stars')) continue; // .stars: a graphic with a text label (3:1 rule, checked by eye)
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (el.closest('button:disabled,[disabled],.locked')) continue; // disabled controls are exempt
    const bg = bgOf(el); if (!bg) continue; // text on a photo: checked by eye
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    if (op < 0.95) continue; // still fading in (page animations); see the wait above
    const fc = rgb(cs.color), fg = mix([fc[0],fc[1],fc[2], (fc[3] === undefined ? 1 : fc[3]) * op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = size >= 24 || (bold && size >= 18.66);
    if (ratio < (large ? 3 : 4.5) - 0.05) bad.push(`${ratio.toFixed(2)} "${n.textContent.trim().slice(0, 40)}" <${el.tagName.toLowerCase()} class="${el.className}">`);
  }
  return [...new Set(bad)];
}"""
@t
async def contrast_both_themes(c):
    pg = await c.new_page(); await sign_in(pg, 'alex@demo.realbarbers')
    tabs = await pg.evaluate("[...document.querySelectorAll('.side-nav a')].map(a=>a.getAttribute('href').slice(1))")
    problems = []
    for theme in ('light', 'dark'):
        await pg.evaluate(f"localStorage.setItem('rb-theme','{theme}')")
        await pg.reload(); await pg.wait_for_timeout(1500)  # the theme is read when the page loads
        for tab in tabs:
            await pg.goto(D + '#' + tab); await pg.wait_for_timeout(1400)
            problems += [f'[{theme}] {tab}: {x}' for x in await pg.evaluate(CONTRAST_JS)]
        await pg.goto(D + 'login.html'); await pg.wait_for_timeout(800)
        problems += [f'[{theme}] login: {x}' for x in await pg.evaluate(CONTRAST_JS)]
    for scheme in ('light', 'dark'):  # the public site follows the device setting
        await pg.emulate_media(color_scheme=scheme)
        for page in ['', 'booking.html', 'account.html', 'terms.html', 'privacy.html', 'evaluate.html']:
            await pg.goto(BASE + page); await pg.wait_for_timeout(900)
            await pg.evaluate('document.querySelectorAll("[data-reveal],.reveal").forEach(e=>e.classList.add("in","shown","is-in"))'); await pg.mouse.wheel(0, 20000); await pg.wait_for_timeout(900)
            problems += [f'[{scheme}] /{page}: {x}' for x in await pg.evaluate(CONTRAST_JS)]
    if problems and os.environ.get('RB_REPORT'): pathlib.Path(os.environ['RB_REPORT']).write_text('\n'.join(problems))
    check(not problems, f'{len(problems)} low-contrast texts:\n  ' + '\n  '.join(problems[:60]))

NAMES_JS = """() => {
  const vis = e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';
  const named = e => (e.getAttribute('aria-label') || '').trim() || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))) || e.textContent.trim() || e.title || (e.labels && e.labels.length) || (e.querySelector && e.querySelector('img[alt]:not([alt=""])')) || (e.type === 'submit' || e.type === 'button' ? e.value : '');
  const out = [];
  document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]').forEach(e => { if (vis(e) && !named(e)) out.push('no name: ' + e.outerHTML.slice(0, 90)); });
  document.querySelectorAll('img').forEach(e => { if (vis(e) && !e.hasAttribute('alt')) out.push('img without alt: ' + e.outerHTML.slice(0, 90)); });
  const ids = {}; document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; }); Object.entries(ids).filter(([, n]) => n > 1).forEach(([id]) => out.push('duplicate id: ' + id));
  if (!document.documentElement.lang) out.push('page has no lang');
  if (!document.querySelector('h1')) out.push('page has no h1');
  return out;
}"""
@t
async def names_and_labels(c):
    pg = await c.new_page(); await sign_in(pg, 'alex@demo.realbarbers')
    tabs = await pg.evaluate("[...document.querySelectorAll('.side-nav a')].map(a=>a.getAttribute('href').slice(1))")
    problems = []
    for tab in tabs:
        await pg.goto(D + '#' + tab); await pg.wait_for_timeout(900)
        problems += [f'{tab}: {x}' for x in await pg.evaluate(NAMES_JS)]
    check(await pg.evaluate("document.querySelector('#toast').getAttribute('role')") in ('status', 'alert'), 'toast messages are not announced')
    await pg.evaluate("localStorage.setItem('rb-demo-user','out')")  # signed out, so the sign-in page stays put
    for page in ['', 'booking.html', 'account.html', 'terms.html', 'privacy.html', 'evaluate.html', DASH + '/login.html']:
        await pg.goto(BASE + page); await pg.wait_for_timeout(1000)
        problems += [f'/{page}: {x}' for x in await pg.evaluate(NAMES_JS)]
    problems = sorted(set(problems))
    check(not problems, f'{len(problems)} problems:\n  ' + '\n  '.join(problems[:60]))

async def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ''
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for fn in TESTS:
            if only and only not in fn.__name__: continue
            c = await b.new_context(viewport={'width': 1366, 'height': 900}); errs = []
            c.on('weberror', lambda e: errs.append(str(e.error)))
            try:
                await fn(c); check(not errs, f'page errors: {errs[:3]}'); results.append((fn.__name__, None)); print('ok  ', fn.__name__)
            except Exception as e:
                results.append((fn.__name__, e)); print('FAIL', fn.__name__, '-', str(e)[:4000])
            await c.close()
        await b.close()
    bad = [r for r in results if r[1]]
    print(f'\n{len(results) - len(bad)} passed, {len(bad)} failed'); sys.exit(1 if bad else 0)

asyncio.run(main())
