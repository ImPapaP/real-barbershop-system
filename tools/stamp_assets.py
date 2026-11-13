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

build = hashlib.sha256(''.join(f'{n}{v}' for n, v in sorted(ver.items())).encode()).hexdigest()[:10]
pages = [pub / 'index.html', pub / 'booking.html', pub / 'terms.html', pub / 'privacy.html', pub / 'admin' / 'index.html']
# Build id covers the pages' own markup too (minus the stamp itself)
strip = lambda h: re.sub(r'<meta name="build"[^>]*>\n?|<script id="fresh">.*?</script>\n?', '', re.sub(r'\?v=\w+', '', h), flags=re.S)
build = hashlib.sha256((build + ''.join(strip(p.read_text()) for p in pages)).encode()).hexdigest()[:10]
# GitHub Pages lets browsers keep a page for 10 minutes. This tiny check fetches the page fresh once;
# if a newer build is live it refreshes the browser's copy and reloads (at most once per build).
FRESH = ('<script id="fresh">(function(){var b=document.querySelector(\'meta[name=build]\').content;'
         'try{if(sessionStorage.getItem("fresh-tried")===b)return}catch(e){}'
         'fetch(location.href,{cache:"reload"}).then(function(r){return r.text()}).then(function(t){'
         'var m=/<meta name="build" content="(\\w+)"/.exec(t);if(m&&m[1]!==b){try{sessionStorage.setItem("fresh-tried",b)}catch(e){}location.reload()}'
         '}).catch(function(){})})()</script>')
for page in pages:
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
    html = re.sub(r'<meta name="build"[^>]*>\n?|<script id="fresh">.*?</script>\n?', '', html, flags=re.S)
    html = html.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<meta name="build" content="{build}">\n{FRESH}', 1)
    page.write_text(html)
    print('stamped', page)
