#!/usr/bin/env python3
"""מאחד את האפליקציה לדף אחד לתצוגה מקדימה, ואורז את התמונות הממוזערות לקובצי JSON.
שימוש: python3 tools/build-preview.py <תיקיית פלט>"""
import base64, io, json, os, re, sys
from PIL import Image

out = sys.argv[1]; os.makedirs(out, exist_ok=True)
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
r = lambda f: open(os.path.join(root, f), encoding='utf8').read()

data = json.loads(re.search(r'window\.DATA = (.*);\s*$', r('js/data.js'), re.S).group(1))
have = [m for m in data['MIKVAOT'] if m['photos'] and os.path.exists(os.path.join(root, 'photos', m['id'] + '.jpg'))]
have.sort(key=lambda m: (m['lat'] or 0, m['lng'] or 0))          # שכנים גאוגרפיים באותו קובץ
CH = 8; size = -(-len(have) // CH) if have else 1; index = {}
for old in os.listdir(out):
    if old.startswith('thumbs-'): os.remove(os.path.join(out, old))
for c in range(CH):
    part = have[c * size:(c + 1) * size]
    if not part: continue
    chunk = {}
    for m in part:
        im = Image.open(os.path.join(root, 'photos', m['id'] + '.jpg')).convert('RGB'); im.thumbnail((300, 200))
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=58, optimize=True)
        chunk[m['id']] = base64.b64encode(buf.getvalue()).decode(); index[m['id']] = c
    json.dump(chunk, open(os.path.join(out, 'thumbs-%d.json' % c), 'w'), separators=(',', ':'))

loader = """window.PHOTOS = (function () {
  var index = %s, cache = {};
  return { thumb: function (id) {
    var c = index[id]; if (c === undefined) return Promise.resolve('');
    cache[c] = cache[c] || fetch('thumbs-' + c + '.json').then(function (r) { return r.json(); });
    return cache[c].then(function (j) { return j[id] ? 'data:image/jpeg;base64,' + j[id] : ''; });
  } };
})();""" % json.dumps(index, separators=(',', ':'))

page = """<title>מאגר המקוואות</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&display=swap">
<style>
%s
</style>
<div id="app"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script src="data.js"></script>
<script>
%s
%s
</script>
""" % (r('css/styles.css'), loader, '\n'.join(r(f) for f in ['js/i18n.js', 'js/logo.js', 'js/sun.js', 'js/app.js']))
open(os.path.join(out, 'mikvaot.html'), 'w', encoding='utf8').write(page)
open(os.path.join(out, 'data.js'), 'w', encoding='utf8').write(r('js/data.js'))
print(len(have), 'thumbs;', {f: os.path.getsize(os.path.join(out, f)) // 1024 for f in sorted(os.listdir(out)) if f.startswith(('thumbs-', 'data.js', 'mikvaot.html'))})
