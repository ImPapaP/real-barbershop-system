#!/usr/bin/env python3
"""Cache-busting for the live preview (GitHub Pages caches files for 10 minutes).

Adds ?v=<content hash> to every script and stylesheet in public/assets, through an import map
in each page, so a browser fetches a file again only when it has changed.
Run from the repo root (or with the public folder as the first argument). The Pages workflow runs it on every publish.
"""
import hashlib, json, pathlib, re, sys

pub = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'public')
assets = sorted(p for p in (pub / 'assets').iterdir() if p.suffix in ('.js', '.css'))
ver = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()[:10] for p in assets}

for page in [pub / 'index.html', pub / 'booking.html', pub / 'admin' / 'index.html']:
    html = page.read_text()
    pre = '../assets/' if page.parent.name == 'admin' else 'assets/'
    key = pre if pre.startswith('.') else './' + pre  # import map keys must look like URLs
    imap = {'imports': {f'{key}{n}': f'{key}{n}?v={v}' for n, v in ver.items() if n.endswith('.js')}}
    block = f'<script type="importmap" id="asset-versions">{json.dumps(imap, separators=(",", ":"))}</script>\n'
    html = re.sub(r'<script type="importmap" id="asset-versions">.*?</script>\n', '', html, flags=re.S)
    # stylesheet and entry script get the version directly
    html = re.sub(rf'href="{re.escape(pre)}styles\.css(\?v=\w+)?"', f'href="{pre}styles.css?v={ver["styles.css"]}"', html)
    m = re.search(rf'<script type="module" src="{re.escape(pre)}(\w[\w-]*\.js)(\?v=\w+)?"></script>', html)
    if m:
        entry = m.group(1)
        html = html.replace(m.group(0), f'{block}<script type="module" src="{pre}{entry}?v={ver[entry]}"></script>')
    page.write_text(html)
    print('stamped', page)
