#!/usr/bin/env python3
"""בונה את js/data.js מתוך נתוני האתר taharat.org.il.
שימוש: python3 tools/build-data.py <תיקיית עבודה>
בתיקיית העבודה: parsed.json (דפי המקוואות אחרי ניתוח), citygeo.json (קואורדינטות יישובים),
addrgeo.json (קואורדינטות לפי כתובת, אם יש)."""
import json, os, re, sys, collections

work = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
load = lambda f, d=None: json.load(open(os.path.join(work, f), encoding='utf8')) if os.path.exists(os.path.join(work, f)) else d
parsed, citygeo, addrgeo = load('parsed.json'), load('citygeo.json', {}), load('addrgeo.json', {})

def clean(s): return re.sub(r'\s+', ' ', s or '').strip()

out = []
for r in sorted(parsed, key=lambda r: int(r['id'])):
    rows = r['rows']
    parts = [clean(p) for p in rows.get('כתובת', '').split(',')]
    city = parts[-1]; street = clean(', '.join(parts[:-1]))
    if street == city: street = ''
    g = addrgeo.get(r['id']); approx = False
    if not g:
        c = citygeo.get(city); g = [c['lat'], c['lng']] if c else None; approx = True
    hours = []
    for h in r['hours']:
        m = re.match(r'^(חורף|קיץ|ערב שבת|מוצ"ש):\s*(.*)$', h)
        hours.append({'label': m.group(1), 'value': clean(m.group(2))} if m else {'label': '', 'value': clean(h)})
    hours = [h for h in hours if h['value']]
    ct = r['contacts'][0] if r['contacts'] else []
    contact = {'name': clean(ct[0]) if ct else '', 'phone': clean(ct[1]) if len(ct) > 1 else ''}
    rec = {
        'id': 'm' + r['id'], 'name': clean(rows.get('שם המקווה', '')), 'city': city, 'address': street,
        'lat': round(g[0], 5) if g else None, 'lng': round(g[1], 5) if g else None, 'approx': approx,
        'sup': rows.get('כשרות', '').startswith('מפוקח'),
        'phones': [clean(p) for p in r['phones'] if clean(p)],
        'contact': contact if contact['name'] or contact['phone'] else None,
        'hours': hours, 'services': [clean(s) for s in r['services']], 'notes': clean(rows.get('הערות', '')),
        'photos': [p.split('/')[-1] for p in r['photos']], 'updated': r.get('updated', ''),
    }
    out.append(rec)

by_city = collections.defaultdict(list)
for m in out:
    if m['lat'] is not None: by_city[m['city']].append(m)
cities = [{'name': c, 'lat': round(sum(m['lat'] for m in ms) / len(ms), 5), 'lng': round(sum(m['lng'] for m in ms) / len(ms), 5), 'count': len(ms)} for c, ms in sorted(by_city.items())]

data = {
    'demo': False,
    'MIKVAOT': out,
    'UPDATES': [],
    'RABBIS': [{'name': 'מוקד המרכז הארצי למען טהרת המשפחה', 'area': 'ארצי', 'role': 'מענה טלפוני', 'hours': '', 'phone': '*3046', 'whatsapp': ''}],
    'CITIES': cities,
}
js = '/* נוצר אוטומטית על ידי tools/build-data.py מתוך אתר המרכז (taharat.org.il). אין לערוך ידנית. */\nwindow.DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('},{"id"', '},\n{"id"') + ';\n'
open(os.path.join(root, 'js', 'data.js'), 'w', encoding='utf8').write(js)
print(len(out), 'mikvaot,', len(cities), 'cities,', sum(1 for m in out if m['lat'] is None), 'without coordinates,', sum(1 for m in out if not m['approx']), 'street-level,', len(js) // 1024, 'KB')
