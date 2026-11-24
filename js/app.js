(function () {
  'use strict';
  const { MIKVAOT, RABBIS, CITIES, UPDATES, demo } = window.DATA;
  const I18N = window.I18N || {};
  let LANG = 'he';
  const T = (s) => (LANG === 'he' ? s : (I18N[LANG] && I18N[LANG][s]) || s);
  const APP_URL = 'https://example.org/app';   // יוחלף בכתובת האמיתית של האפליקציה
  document.documentElement.lang = 'he';
  document.documentElement.dir = 'rtl';

  /* ---------- עזרים ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mk.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mk.' + k, JSON.stringify(v)); } catch (e) { /* אין אחסון */ } }
  };
  const km = (a, b) => {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  /* מרחק נקודה מקטע ישר (בק"מ) ומיקום יחסי לאורכו */
  const alongRoute = (p, a, b) => {
    const kx = 111.3 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), ky = 111.3;
    const ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky, px = p.lng * kx, py = p.lat * ky;
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
    return { d: Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))), t };
  };
  const fmtKm = (d) => (d < 1 ? Math.round(d * 1000) + (' ' + T('מ׳')) : d < 10 ? d.toFixed(1) + (' ' + T('ק״מ')) : Math.round(d) + (' ' + T('ק״מ')));
  const TZ = 'Asia/Jerusalem';
  const fTime = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  let fDay, fDate, fHeb;
  function setLang(l) {
    LANG = I18N[l] || l === 'he' ? l : 'he';
    const loc = LANG === 'he' ? 'he-IL' : 'en-GB';
    document.documentElement.lang = LANG; document.documentElement.dir = LANG === 'he' ? 'rtl' : 'ltr';
    fDay = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'numeric' });
    fDate = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'numeric', year: 'numeric' });
    try { fHeb = new Intl.DateTimeFormat(loc + '-u-ca-hebrew', { day: 'numeric', month: 'long' }); } catch (e) { fHeb = null; }
  }
  setLang(store.get('lang', 'he'));
  const sunsetStr = (date, p) => { const s = window.Sun.sunset(date, p.lat, p.lng); return s ? fTime.format(s) : '—'; };
  const telHref = (n) => 'tel:' + n.replace(/[^\d+]/g, '');
  const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const byId = (id) => MIKVAOT.find((m) => m.id === id);
  const city = (n) => CITIES.find((c) => c.name === n) || CITIES[0];
  /*noT*/ const regionOf = (p) => (p.lat > 32.45 ? 'צפון' : p.lat < 31.55 ? 'דרום' : p.lng > 34.95 && p.lat < 31.95 ? 'ירושלים והסביבה' : 'מרכז');
  const mapsUrl = (m) => `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;

  /* שעות הפתיחה להיום, מחושבות מהשקיעה במקום */
  function hoursToday(m, now = new Date()) {
    if (m.status !== 'active') return null;
    const dow = now.getDay();
    if (dow === 5) return { text: T('ליל שבת · בתיאום מראש בלבד'), special: true };
    const ss = window.Sun.sunset(now, m.lat, m.lng); if (!ss) return null;
    const open = new Date(+ss + (m.openAfterSunset + (dow === 6 ? 50 : 0)) * 6e4), close = new Date(+open + m.openMinutes * 6e4);
    return { open, close, range: fTime.format(open) + '–' + fTime.format(close), openNow: now >= open && now < close, later: now < open, motzash: dow === 6 };
  }

  const I = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
    nav: '<path d="m3 11 18-8-8 18-2-8-8-2z"/>',
    sun: '<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 6v3M5.5 9.5l2 2M18.5 9.5l-2 2M2 22h20"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    back: '<path d="m9 6 6 6-6 6"/>',
    list: '<path d="M4 7c2-2 4-2 6 0s4 2 6 0 3-1 4 0M4 13c2-2 4-2 6 0s4 2 6 0 3-1 4 0M4 19c2-2 4-2 6 0s4 2 6 0 3-1 4 0"/>',
    bag: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6"/>',
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z"/><path d="m9 12 2.2 2.2L15 10"/>',
    qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 14h2M14 18v2M18 18h2v2"/>',
    flag: '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
    alert: '<path d="M12 4 3 20h18L12 4zM12 10v5M12 17.5v.5"/>',
    gift: '<rect x="4" y="10" width="16" height="10" rx="1"/><path d="M3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/>'
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

  /* ---------- מצב ---------- */
  const today = new Date();
  /*noT-start*/
  const S = {
    tab: 'list', q: '', filters: new Set(),
    favs: new Set(store.get('favs', [])),
    loc: store.get('loc', null),            // { lat, lng, label, gps }
    detail: null, sheet: null, sheetData: null,
    mapCity: null, rabbiArea: null,
    bigText: store.get('bigText', false), notify: store.get('notify', false),
    seen: store.get('seen', ''),
    trip: Object.assign({ mode: 'area', city: 'צפת', fromCity: 'ירושלים', radius: 25, from: isoDate(today), to: isoDate(new Date(+today + 3 * 864e5)) }, store.get('trip', {}))
  };
  /*noT-end*/
  /*noT-start*/
  const FILTERS = [
    ['fav', 'שמורים', (m) => S.favs.has(m.id)],
    ['open', 'פתוח עכשיו', (m) => (hoursToday(m) || {}).openNow],
    ['active', 'פעיל', (m) => m.status === 'active'],
    ['chabad', 'בור חב״ד', (m) => m.chabad],
    ['chazon', 'לשיטת חזו״א', (m) => m.chazonIsh],
    ['filter', 'עם פילטר', (m) => m.filter],
    ['access', 'נגיש', (m) => m.accessible],
    ['booking', 'הזמנת תור', (m) => m.booking && m.booking.type !== 'none'],
    ['kelim', 'מקווה כלים', (m) => m.kelim]
  ];

  /*noT-end*/

  /* ---------- רכיבים ---------- */
  const statusPill = (m) => {
    if (m.status !== 'active') return ('<span class="pill warn"><i></i>' + T('בשיפוץ') + '</span>');
    const h = hoursToday(m);
    return h && h.openNow ? ('<span class="pill ok"><i></i>' + T('פתוח עכשיו') + '</span>') : ('<span class="pill ok"><i></i>' + T('פעיל') + '</span>');
  };
  const tags = (m) => [m.chabad && T('בור חב״ד'), m.chazonIsh && T('חזו״א'), m.filter && T('פילטר'), m.accessible && T('נגיש')].filter(Boolean)
    .map((t) => `<span class="tag">${t}</span>`).join('');
  const todayLine = (m) => {
    if (m.status !== 'active') return m.statusNote ? `<span class="today warnc">${esc(m.statusNote)}</span>` : '';
    const h = hoursToday(m); if (!h) return '';
    return `<span class="today">${icon('clock')}${h.special ? h.text : `${h.motzash ? T('מוצ״ש') : T('היום')} <bdi dir="ltr">${h.range}</bdi>`}</span>`;
  };

  function card(m, origin, distText) {
    const d = distText || (origin ? fmtKm(km(origin, m)) : '');
    return `<button class="card" data-act="open" data-id="${m.id}">
      <span class="card-main">
        <span class="card-name">${esc(m.name)}</span>
        <span class="card-sub">${esc(m.city)} · ${esc(m.address)}</span>
        ${m.alert ? `<span class="alertline">${icon('alert')}${esc(m.alert)}</span>` : todayLine(m)}
        <span class="card-tags">${statusPill(m)}${tags(m)}</span>
      </span>
      <span class="card-side">${d ? `<span class="dist">${d}</span>` : ''}${S.favs.has(m.id) ? icon('heart', 'fav-on') : ''}${icon('back', 'chev')}</span>
    </button>`;
  }

  function listItems() {
    const q = S.q.trim();
    let items = MIKVAOT.filter((m) => (!q || (m.name + ' ' + m.city + ' ' + m.address).includes(q)) &&
      [...S.filters].every((f) => FILTERS.find((x) => x[0] === f)[2](m)));
    if (S.loc) items = items.slice().sort((a, b) => km(S.loc, a) - km(S.loc, b));
    else items = items.slice().sort((a, b) => a.city.localeCompare(b.city, 'he') || a.name.localeCompare(b.name, 'he'));
    return items;
  }

  function renderList() {
    const items = listItems();
    const el = $('#list'); if (!el) return;
    $('#count').textContent = items.length === MIKVAOT.length ? `${items.length} ${T('מקוואות בפיקוח')}` : `${items.length} ${T('מתוך')} ${MIKVAOT.length} ${T('מקוואות')}`;
    $('#sortnote').textContent = S.loc ? T('מהקרוב לרחוק') : T('לפי עיר');
    el.innerHTML = items.length ? items.map((m) => card(m, S.loc)).join('')
      : `<div class="empty">${S.filters.has('fav') && !S.favs.size ? T('עוד לא שמרתם מקוואות. לחיצה על הלב בדף המקווה שומרת אותו כאן.') : T('לא נמצאו מקוואות מתאימים.')}<br><button class="link" data-act="clear">${T('ניקוי החיפוש והסינון')}</button></div>`;
  }

  const locBar = () => `<button class="locbar" data-act="pickloc">
      ${icon('pin')}<span class="locbar-txt">${S.loc ? `<b>${esc(S.loc.label)}</b>` : ('<b>' + T('בחירת מיקום') + '</b><small>' + T('כדי לראות את המקוואות הקרובים') + '</small>')}</span>
      <span class="locbar-change">${S.loc ? T('שינוי') : T('בחירה')}</span></button>`;

  const shabbatBanner = () => {
    const d = today.getDay();
    return d === 5 ? `<div class="banner">${icon('info')}<span><b>${T('היום ערב שבת.')}</b> ${T('בליל שבת המקוואות פועלים בתיאום מראש בלבד — כדאי להתקשר לפני כן.')}</span></div>`
      : d === 6 ? `<div class="banner">${icon('info')}<span><b>${T('מוצאי שבת.')}</b> ${T('המקוואות נפתחים מאוחר מהרגיל, אחרי צאת השבת.')}</span></div>` : '';
  };

  function viewList() {
    return `<div class="pad">
      ${locBar()}${shabbatBanner()}
      <label class="search">${icon('search')}<input id="q" type="search" inputmode="search" autocomplete="off" placeholder="${T('חיפוש לפי שם, עיר או רחוב')}" value="${esc(S.q)}"></label>
      <div class="chips" role="group" aria-label="${T('סינון')}">${FILTERS.map(([k, l]) => `<button class="chip${S.filters.has(k) ? ' on' : ''}" data-act="filter" data-k="${k}" aria-pressed="${S.filters.has(k)}">${k === 'fav' ? icon('heart') : ''}${T(l)}</button>`).join('')}</div>
      <div class="listhead"><span id="count"></span><span id="sortnote"></span></div>
      <div id="list" class="list"></div>
      ${demo ? ('<p class="demo">' + T('הנתונים המוצגים הם נתוני הדגמה בלבד.') + '</p>') : ''}
    </div>`;
  }

  /* ---------- מפה סכמטית ---------- */
  const MAP = { k: 118, lng0: 34.15, lat0: 33.42, w: 190, h: 474 };
  const mx = (lng) => (lng - MAP.lng0) * 0.853 * MAP.k, my = (lat) => (MAP.lat0 - lat) * MAP.k;
  const OUTLINE = [[35.10, 33.09], [35.07, 32.92], [34.99, 32.83], [34.95, 32.82], [34.92, 32.60], [34.85, 32.33], [34.76, 32.07], [34.63, 31.80], [34.54, 31.67], [34.49, 31.60], [34.27, 31.22], [34.56, 30.40], [34.90, 29.50], [34.97, 29.55], [35.15, 30.20], [35.33, 30.80], [35.42, 31.15], [35.50, 31.50], [35.55, 32.00], [35.57, 32.40], [35.62, 32.68], [35.88, 32.75], [35.90, 33.20], [35.80, 33.33], [35.62, 33.26], [35.55, 33.27], [35.50, 33.09]];
  function viewMap() {
    const groups = {};
    MIKVAOT.forEach((m) => { (groups[m.city] = groups[m.city] || []).push(m); });
    const names = Object.keys(groups);
    const sel = groups[S.mapCity] ? S.mapCity : (S.loc ? names.reduce((a, n) => (km(S.loc, city(n)) < km(S.loc, city(a)) ? n : a)) : 'ירושלים'); /*noT*/
    const pts = names.map((n) => { const g = groups[n]; return { n, c: g.length, x: mx(g.reduce((s, m) => s + m.lng, 0) / g.length), y: my(g.reduce((s, m) => s + m.lat, 0) / g.length) }; })
      .sort((a, b) => (a.n === sel) - (b.n === sel));
    return `<div class="pad">
      <h2 class="h2">${T('מפת המקוואות')}</h2>
      <div class="mapwrap">
        <svg class="map" viewBox="0 0 ${MAP.w} ${MAP.h}" role="group" aria-label="${T('מפה סכמטית של הארץ')}">
          <polygon class="land" points="${OUTLINE.map(([g, t]) => mx(g).toFixed(1) + ',' + my(t).toFixed(1)).join(' ')}"/>
          <ellipse class="water" cx="${mx(35.59)}" cy="${my(32.82)}" rx="5" ry="8.5"/>
          <ellipse class="water" cx="${mx(35.48)}" cy="${my(31.5)}" rx="4.5" ry="24"/>
          ${S.loc ? `<circle class="me" cx="${mx(S.loc.lng)}" cy="${my(S.loc.lat)}" r="4"/>` : ''}
          ${pts.map((p) => `<g class="dot${p.n === sel ? ' on' : ''}" data-act="mapcity" data-c="${esc(p.n)}" tabindex="0" role="button" aria-label="${esc(p.n)}, ${p.c} ${T('מקוואות')}">
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.n === sel ? 11 : 8.5}"/><text x="${p.x.toFixed(1)}" y="${(p.y + 3.6).toFixed(1)}">${p.c}</text></g>`).join('')}
        </svg>
        <div class="mapside">
          <div class="mapcity">${esc(sel)}</div>
          <div class="mapcount">${groups[sel].length} ${T('מקוואות')}${S.loc ? ' · ' + fmtKm(km(S.loc, city(sel))) + (' ' + T('ממך')) : ''}</div>
          ${groups[sel].map((m) => `<button class="mini" data-act="open" data-id="${m.id}"><b>${esc(m.name)}</b>${m.status === 'active' ? todayLine(m) : ('<span class="today warnc">' + T('בשיפוץ') + '</span>')}</button>`).join('')}
          <p class="note">${T('לחיצה על עיגול מציגה את המקוואות ביישוב. המספר הוא מספר המקוואות.')}</p>
        </div>
      </div>
    </div>`;
  }

  /* ---------- נופש ---------- */
  function tripResults() {
    const t = S.trip, c = city(t.city);
    if (t.mode === 'route') {
      const a = city(t.fromCity);
      return MIKVAOT.map((m) => ({ m, r: alongRoute(m, a, c) })).filter((x) => x.r.d <= t.radius).sort((x, y) => x.r.t - y.r.t)
        .map((x) => ({ m: x.m, label: x.r.d < 1 ? T('על המסלול') : fmtKm(x.r.d) + (' ' + T('מהמסלול')) }));
    }
    return MIKVAOT.map((m) => ({ m, d: km(c, m) })).filter((x) => x.d <= t.radius).sort((x, y) => x.d - y.d).map((x) => ({ m: x.m, label: fmtKm(x.d) }));
  }
  function tripText() {
    const t = S.trip, res = tripResults();
    return [`${T('תוכנית נופש:')} ${t.mode === 'route' ? t.fromCity + ' ← ' + t.city : t.city}`, `${fDay.format(parseDate(t.from))} – ${fDay.format(parseDate(t.to))}`, '',
      ...res.map((x) => `• ${x.m.name}, ${x.m.address}, ${x.m.city} — ${x.m.phones[0].number}${x.m.status !== 'active' ? (' (' + T('בשיפוץ)')) : ''}`), '', T('מתוך מאגר המקוואות שבפיקוח טהרת המשפחה')].join('\n');
  }
  function viewTrip() {
    const t = S.trip, c = city(t.city), res = tripResults(), route = t.mode === 'route';
    const from = parseDate(t.from), to = parseDate(t.to), days = [];
    for (let d = new Date(from), n = 0; d <= to && n < 14; d = new Date(+d + 864e5), n++) days.push(new Date(d));
    const sel = (label, act, name) => `<div class="field"><span class="lbl">${label}</span><button class="select" data-act="${act}">${icon('pin')}<span>${esc(name)}</span>${icon('back', 'chev down')}</button></div>`;
    return `<div class="pad">
      <h2 class="h2">${T('תכנון נופש')}</h2>
      <p class="lead">${T('רואים מראש אילו מקוואות בפיקוח נמצאים ביעד או בדרך אליו.')}</p>
      <div class="form">
        <div class="seg two"><button class="${route ? '' : 'on'}" data-act="tripmode" data-m="area">${T('סביב היעד')}</button><button class="${route ? 'on' : ''}" data-act="tripmode" data-m="route">${T('לאורך הדרך')}</button></div>
        ${route ? sel(T('יוצאים מ־'), 'tripfrom', t.fromCity) : ''}
        ${sel(T('יעד'), 'tripcity', c.name)}
        <div class="field"><span class="lbl">${route ? T('מרחק מרבי מהמסלול') : T('מרחק נסיעה מרבי')}</span>
          <div class="seg">${[10, 25, 50].map((r) => `<button class="${t.radius === r ? 'on' : ''}" data-act="radius" data-r="${r}">${T('עד')} ${r} ${T('ק״מ')}</button>`).join('')}</div></div>
        <div class="row2">
          <label class="field"><span class="lbl">${T('מתאריך')}</span><input id="tfrom" type="date" value="${esc(t.from)}"></label>
          <label class="field"><span class="lbl">${T('עד תאריך')}</span><input id="tto" type="date" value="${esc(t.to)}" min="${esc(t.from)}"></label>
        </div>
      </div>
      <div class="listhead"><span>${res.length ? `${res.length} ${T('מקוואות')} ${route ? `${T('בדרך מ')}${esc(t.fromCity)} ${T('ל')}${esc(c.name)}` : (T('באזור') + ' ') + esc(c.name)}` : T('אין מקווה בפיקוח בטווח שנבחר')}</span></div>
      <div class="list">${res.map((x) => card(x.m, null, x.label)).join('') || `<div class="empty">${T('נסו להגדיל את המרחק, או פנו לרבנים לקבלת הכוונה.')}<br><button class="link" data-act="tab" data-tab="rabbis">${T('יצירת קשר עם הרבנים')}</button></div>`}</div>
      ${route ? ('<p class="note">' + T('המסלול מחושב בקו ישר בין שני היישובים, בקירוב.') + '</p>') : ''}
      ${res.length ? `<button class="btn wide" data-act="sharetrip">${icon('share')}${T('שיתוף התוכנית')}</button>` : ''}
      ${days.length ? `<h3 class="h3">${T('שקיעה ב')}${esc(c.name)} ${T('בימי הנופש')}</h3>
      <div class="times">${days.map((d) => `<div class="trow"><span>${fDay.format(d)}</span><b>${sunsetStr(d, c)}</b></div>`).join('')}</div>` : ''}
    </div>`;
  }

  function viewTimes() {
    if (!S.loc) return `<div class="pad"><h2 class="h2">${T('זמני השקיעה')}</h2>${locBar()}<div class="empty">${T('בחרו מיקום כדי לראות את זמן השקיעה המדויק למקום שבו אתם נמצאים.')}</div></div>`;
    const days = Array.from({ length: 7 }, (_, i) => new Date(+today + i * 864e5));
    return `<div class="pad">
      <h2 class="h2">${T('זמני השקיעה')}</h2>
      ${locBar()}
      <div class="sunhero">
        <span class="sunhero-lbl">${icon('sun')} ${T('שקיעה היום')}</span>
        <span class="sunhero-time">${sunsetStr(today, S.loc)}</span>
        <span class="sunhero-date">${fDay.format(today)}${fHeb ? ' · ' + fHeb.format(today) : ''}</span>
      </div>
      <h3 class="h3">${T('השבוע הקרוב')}</h3>
      <div class="times">${days.map((d, i) => `<div class="trow"><span>${i === 0 ? T('היום') : fDay.format(d)}${fHeb ? `<small>${fHeb.format(d)}</small>` : ''}</span><b>${sunsetStr(d, S.loc)}</b></div>`).join('')}</div>
      <p class="note">${T('שקיעה מישורית בגובה פני הים, מחושבת לפי המיקום שנבחר. ייתכן הפרש של דקות אחדות מלוח הזמנים המקומי. למעשה יש לנהוג לפי הוראת הרבנים.')}</p>
    </div>`;
  }

  /* ---------- רבנים ---------- */
  /*noT*/ const AREAS = ['הכול', 'ירושלים והסביבה', 'מרכז', 'צפון', 'דרום'];
  const rabbiCard = (r) => `<div class="rabbi">
        <div class="rabbi-head"><div class="rabbi-name">${esc(r.name)}</div><span class="tag">${esc(T(r.area))}</span></div>
        <div class="rabbi-sub">${esc(r.role)} · ${esc(r.hours)}</div>
        ${r.phone ? `<div class="numrow"><span class="num" dir="ltr">${esc(r.phone)}</span><button class="iconbtn sm" data-act="copy" data-v="${esc(r.phone)}" aria-label="${T('העתקת המספר')}">${icon('copy')}</button></div>` : ''}
        <div class="btnrow">
          ${r.phone ? `<a class="btn" href="${telHref(r.phone)}">${icon('phone')}${T('חיוג')}</a>` : ''}
          ${r.whatsapp ? `<a class="btn wa" href="https://wa.me/${esc(r.whatsapp)}" target="_blank" rel="noopener">${icon('chat')}${T('וואטסאפ')}</a>` : ''}
        </div></div>`;
  function viewRabbis() {
    /*noT*/ const area = S.rabbiArea || (S.loc ? regionOf(S.loc) : 'הכול');
    /*noT*/ const list = RABBIS.filter((r) => area === 'הכול' || r.area === area || r.area === 'ארצי');
    return `<div class="pad">
      <h2 class="h2">${T('רבני טהרת המשפחה')}</h2>
      <p class="lead">${T('מענה לשאלות בטלפון או בוואטסאפ, לפי אזור. הפנייה דיסקרטית.')}</p>
      <div class="chips" role="group" aria-label="${T('אזור')}">${AREAS.map((a) => `<button class="chip${a === area ? ' on' : ''}" data-act="rarea" data-a="${a}">${T(a)}</button>`).join('')}</div>
      <div class="list">${list.map(rabbiCard).join('')}</div>
      ${demo ? ('<p class="demo">' + T('שמות ומספרים להדגמה בלבד.') + '</p>') : ''}
    </div>`;
  }

  /* ---------- עדכונים ואודות ---------- */
  function viewUpdates() {
    return `<div class="pad">
      <h2 class="h2">${T('עדכונים')}</h2>
      <label class="switchrow"><span><b>${T('התראות על מקוואות שמורים')}</b><small>${T('שינוי שעות, סגירה זמנית ופתיחה מחדש')}</small></span><input id="notify" type="checkbox" ${S.notify ? 'checked' : ''}><i></i></label>
      ${S.notify ? ('<p class="note">' + T('ההעדפה נשמרה. ההתראות עצמן יופעלו בגרסת החנות.') + '</p>') : ''}
      <div class="list">${UPDATES.map((u) => { const m = u.mikveh && byId(u.mikveh); return `<${m ? `button data-act="open" data-id="${m.id}"` : 'div'} class="update${m && S.favs.has(m.id) ? ' mine' : ''}">
        <span class="update-date">${fDay.format(parseDate(u.date))}${m && S.favs.has(m.id) ? (' · ' + T('מקווה שמור')) : ''}</span>
        <b>${esc(u.title)}</b><span>${esc(u.body)}</span></${m ? 'button' : 'div'}>`; }).join('')}</div>
    </div>`;
  }
  function viewAbout() {
    return `<div class="pad">
      <h2 class="h2">${T('אודות והגדרות')}</h2>
      <label class="switchrow"><span><b>${T('טקסט גדול')}</b><small>${T('הגדלת כל הכתב באפליקציה')}</small></span><input id="bigtext" type="checkbox" ${S.bigText ? 'checked' : ''}><i></i></label>
      <div class="field"><span class="lbl">${T('שפה')} · Language</span><div class="seg two"><button class="${LANG === 'he' ? 'on' : ''}" data-act="lang" data-l="he">${T('עברית')}</button><button class="${LANG === 'en' ? 'on' : ''}" data-act="lang" data-l="en">English</button></div></div>
      <h3 class="h3">${T('פרטיות')}</h3>
      <div class="notes"><b>${T('האפליקציה לא אוספת עליכם מידע.')}</b><br>${T('אין הרשמה ואין חשבון. המיקום משמש רק לחישוב מרחקים וזמנים בתוך המכשיר ואינו נשלח לשום מקום. המקוואות השמורים ותוכנית הנופש נשמרים במכשיר בלבד.')}</div>
      <h3 class="h3">${T('על המאגר')}</h3>
      <div class="notes">${T('כל המקוואות המופיעים כאן נמצאים בפיקוח טהרת המשפחה. בכל דף מקווה מופיעים מועד הביקורת האחרונה ותוקף הפיקוח. המידע נשמר במכשיר וזמין גם בלי קליטה.')}</div>
      <button class="btn ghost wide" data-act="tab" data-tab="rabbis">${icon('chat')}${T('יצירת קשר')}</button>
      <button class="link center" data-act="tab" data-tab="admin">${T('כניסת מנהלים')}</button>
      ${demo ? ('<p class="demo">' + T('גרסת הדגמה · כל הנתונים לדוגמה בלבד') + '</p>') : ''}
    </div>`;
  }

  /* ---------- אזור מנהלים (הדגמה) ---------- */
  /*noT*/ const DEMAND = [['ים המלח (עין בוקק)', 46], ['קצרין', 31], ['מצפה רמון', 22], ['קיסריה', 17]];
  function viewAdmin() {
    const m = byId(S.adminId) || MIKVAOT[0];
    return `<div class="pad">
      <h2 class="h2">${T('אזור מנהלים')}</h2>
      <div class="banner">${icon('info')}<span>${T('הדגמה בלבד: העדכון חל במכשיר הזה ונעלם ברענון. בגרסה המלאה כל אחראי ייכנס בקוד אישי, והעדכון יופיע מיד אצל כולם.')}</span></div>
      <div class="form">
        <label class="field"><span class="lbl">${T('מקווה')}</span><select id="adm-m">${MIKVAOT.map((x) => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.city)}</option>`).join('')}</select></label>
        <div class="field"><span class="lbl">${T('סטטוס')}</span><div class="seg two"><button class="${m.status === 'active' ? 'on' : ''}" data-act="admstatus" data-s="active">${T('פעיל')}</button><button class="${m.status !== 'active' ? 'on' : ''}" data-act="admstatus" data-s="renovation">${T('בשיפוץ')}</button></div></div>
        <label class="field"><span class="lbl">${T('הודעה דחופה לציבור (ריק = אין הודעה)')}</span><textarea id="adm-alert" rows="2" placeholder="${T('לדוגמה: הערב סגור עקב תקלה')}">${esc(m.alert)}</textarea></label>
        <button class="btn wide" data-act="admsave">${T('עדכון המקווה')}</button>
        <button class="btn ghost wide" data-act="open" data-id="${m.id}">${T('צפייה בדף המקווה')}</button>
      </div>
      <h3 class="h3">${T('ביקוש: חיפושים בלי מקווה קרוב (30 יום, נתוני דוגמה)')}</h3>
      <div class="times">${DEMAND.map(([n, c]) => `<div class="trow"><span>${n}</span><b>${c}</b></div>`).join('')}</div>
    </div>`;
  }

  /* ---------- דף מקווה ---------- */
  function viewDetail(m) {
    const fav = S.favs.has(m.id), main = (m.phones[0] || {}).number, h = hoursToday(m);
    const yes = (v) => (v ? `<b class="yes">${icon('check')}${T('יש')}</b>` : ('<b class="no">' + T('אין') + '</b>'));
    const book = m.booking || { type: 'none' };
    const rabbi = RABBIS.find((r) => r.area === regionOf(m));
    return `<div class="detail" role="dialog" aria-label="${esc(m.name)}">
      <div class="detail-top">
        <button class="iconbtn" data-act="close" aria-label="${T('חזרה')}">${icon('back', 'flip')}</button>
        <span class="detail-top-title">${T('פרטי המקווה')}</span>
        <span class="row">
          <button class="iconbtn" data-act="share" data-id="${m.id}" aria-label="${T('שיתוף')}">${icon('share')}</button>
          <button class="iconbtn${fav ? ' fav-on' : ''}" data-act="fav" data-id="${m.id}" aria-label="${fav ? T('הסרה מהשמורים') : T('שמירה')}" aria-pressed="${fav}">${icon('heart')}</button>
        </span>
      </div>
      <div class="detail-body">
        <div class="gallery">${(m.photos.length ? m.photos.map((p) => `<img src="${esc(p)}" alt="${esc(m.name)}">`) : ['', '', '']
          .map((_, i) => `<div class="ph ph${i}"><span>${i === 0 ? T('תמונות המקווה יתווספו כאן') : ''}</span></div>`)).join('')}</div>
        <div class="pad">
          <h2 class="detail-name">${esc(m.name)}</h2>
          <div class="detail-addr">${esc(m.address)}, ${esc(m.city)}${S.loc ? ` · ${fmtKm(km(S.loc, m))} ${T('ממך')}` : ''}</div>
          <div class="card-tags">${statusPill(m)}${m.statusNote ? `<span class="statusnote">${esc(m.statusNote)}</span>` : ''}</div>
          ${m.alert ? `<div class="banner bad">${icon('alert')}<span>${esc(m.alert)}</span></div>` : ''}
          ${h && !m.alert ? `<div class="todaybox${h.openNow ? ' open' : ''}">${icon('clock')}<span><small>${h.special ? T('הערב') : h.openNow ? T('פתוח עכשיו') : h.later ? T('ייפתח הערב') : T('היה פתוח היום')}</small><b>${h.special ? h.text : `<bdi dir="ltr">${h.range}</bdi>`}</b></span><span class="todaybox-sun">${icon('sun')}${T('שקיעה')} ${sunsetStr(today, m)}</span></div>` : ''}

          <div class="actions">
            <a class="act primary" href="https://waze.com/ul?ll=${m.lat},${m.lng}&navigate=yes" target="_blank" rel="noopener">${icon('nav')}<span>Waze</span></a>
            <a class="act" href="${mapsUrl(m)}" target="_blank" rel="noopener">${icon('pin')}<span>${T('מפות Google')}</span></a>
            ${main ? `<a class="act" href="${telHref(main)}">${icon('phone')}<span>${T('חיוג')}</span></a>` : ''}
            <button class="act" data-act="share" data-id="${m.id}">${icon('share')}<span>${T('שיתוף')}</span></button>
          </div>

          ${book.type === 'link' ? `<a class="btn wide" href="${esc(book.value)}" target="_blank" rel="noopener">${icon('cal')}${T('הזמנת תור באתר')}</a>`
            : book.type === 'phone' ? `<a class="btn wide" href="${telHref(book.value)}">${icon('cal')}${T('הזמנת תור בטלפון')} <span dir="ltr">${esc(book.value)}</span></a>`
            : m.status === 'active' ? ('<div class="infobox">' + T('אין צורך בהזמנת תור.') + '</div>') : ''}
          ${m.donateUrl ? `<a class="btn sunbtn wide" href="${esc(m.donateUrl)}" target="_blank" rel="noopener">${icon('gift')}${T('השתתפות בשיפוץ המקווה')}</a>` : ''}

          <h3 class="h3">${T('פיקוח')}</h3>
          <div class="cert">
            <div class="cert-head">${icon('shield')}<span><b>${T('בפיקוח טהרת המשפחה')}</b><small>${T('בתוקף עד')} ${fDate.format(parseDate(m.validUntil))}</small></span></div>
            <div class="spec flat">
              <div><span>${T('ביקורת אחרונה')}</span><b>${fDate.format(parseDate(m.lastInspection))}</b></div>
              <div><span>${T('הרב המפקח')}</span><b>${esc(m.supervisor)}</b></div>
            </div>
            ${window.qrcode ? `<button class="link" data-act="qr" data-id="${m.id}">${icon('qr')}${T('קוד QR של המקווה')}</button>` : ''}
          </div>

          <h3 class="h3">${T('פרטי המקווה')}</h3>
          <div class="spec">
            <div><span>${T('בור חב״ד (בור על גבי בור)')}</span>${yes(m.chabad)}</div>
            <div><span>${T('לשיטת החזון איש')}</span>${yes(m.chazonIsh)}</div>
            <div><span>${T('פילטר (מערכת סינון)')}</span>${yes(m.filter)}</div>
            <div><span>${T('מקווה כלים')}</span>${yes(m.kelim)}</div>
          </div>

          <h3 class="h3">${T('מידע מעשי')}</h3>
          <div class="spec">
            <div><span>${T('נגישות')}</span><b class="${m.accessible ? 'yes' : ''}">${m.accessible ? icon('check') : ''}${esc(m.accessNote)}</b></div>
            ${m.price ? `<div><span>${T('מחיר')}</span><b>${m.price} ₪</b></div><div><span>${T('תשלום')}</span><b>${esc(m.payment.join(', '))}</b></div>` : ''}
            <div><span>${T('חניה')}</span><b>${esc(m.parking)}</b></div>
          </div>

          <h3 class="h3">${T('שעות פתיחה')}</h3>
          <div class="spec">${m.hours.map((x) => `<div><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>

          <h3 class="h3">${T('טלפונים')}</h3>
          <div class="spec">${m.phones.map((p) => `<div><span>${esc(p.label)}</span><span class="numrow"><a class="num" dir="ltr" href="${telHref(p.number)}">${esc(p.number)}</a><button class="iconbtn sm" data-act="copy" data-v="${esc(p.number)}" aria-label="${T('העתקת המספר')}">${icon('copy')}</button></span></div>`).join('')}</div>

          ${m.notes ? `<h3 class="h3">${T('טוב לדעת')}</h3><p class="notes">${esc(m.notes)}</p>` : ''}

          ${rabbi ? `<h3 class="h3">${T('רב האזור לשאלות')}</h3>${rabbiCard(rabbi)}` : ''}
          <button class="btn ghost wide" data-act="report" data-id="${m.id}">${icon('flag')}${T('משהו לא תקין? דיווח למפקחים')}</button>
        </div>
      </div>
    </div>`;
  }

  /* ---------- גיליונות ---------- */
  const sheetWrap = (title, body) => `<div class="scrim" data-act="closesheet"></div>
    <div class="sheet" role="dialog" aria-label="${title}">
      <div class="sheet-head"><b>${title}</b><button class="iconbtn" data-act="closesheet" aria-label="${T('סגירה')}">${icon('x')}</button></div>${body}</div>`;
  const sheetCity = (title, act) => sheetWrap(title, `
      ${act === 'setloc' ? `<button class="gps" data-act="gps">${icon('target')}<span><b>${T('המיקום הנוכחי שלי')}</b><small>${T('לפי מיקום המכשיר')}</small></span></button>` : ''}
      <div class="citygrid">${CITIES.map((c) => `<button data-act="${act}" data-c="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>`);
  const sheetShare = (d) => sheetWrap(d.title, `
      <pre class="sharetext" id="sharetext">${esc(d.text)}</pre>
      <div class="btnrow"><a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(d.text)}" target="_blank" rel="noopener">${icon('chat')}${T('וואטסאפ')}</a>
      <button class="btn" data-act="copy" data-v="${esc(d.text)}" data-msg="${T('הטקסט הועתק')}">${icon('copy')}${T('העתקה')}</button></div>
      ${navigator.share ? `<button class="btn ghost wide" data-act="nativeshare">${icon('share')}${T('אפליקציה אחרת')}</button>` : ''}`);
  /*noT*/ const REPORT_KINDS = ['ניקיון', 'תקלה במקום', 'שעות לא נכונות', 'פרט שגוי באפליקציה', 'אחר'];
  const sheetReport = (d) => sheetWrap(T('דיווח למפקחים'), `
      <p class="lead">${T('הדיווח מגיע לצוות הפיקוח בלבד ואינו מתפרסם.')} ${esc(byId(d.id).name)}.</p>
      <div class="chips wrap">${REPORT_KINDS.map((k) => `<button class="chip${d.kind === k ? ' on' : ''}" data-act="rkind" data-k="${k}">${T(k)}</button>`).join('')}</div>
      <label class="field"><span class="lbl">${T('מה קרה? (לא חובה)')}</span><textarea id="rtext" rows="3" placeholder="${T('תיאור קצר')}">${esc(d.text || '')}</textarea></label>
      <label class="field"><span class="lbl">${T('טלפון לחזרה (לא חובה)')}</span><input id="rphone" type="tel" inputmode="tel" dir="ltr" value="${esc(d.phone || '')}"></label>
      <button class="btn wide" data-act="sendreport" ${d.kind ? '' : 'disabled'}>${T('שליחת הדיווח')}</button>`);
  function sheetQr(d) {
    const m = byId(d.id), q = window.qrcode(0, 'M'); q.addData(APP_URL + '#' + m.id); q.make();
    return sheetWrap(T('קוד QR של המקווה'), `<div class="qrbox">${q.createSvgTag({ cellSize: 5, margin: 2, scalable: true })}</div>
      <p class="lead center"><b>${esc(m.name)}</b><br>${T('סריקת הקוד פותחת את דף המקווה ומאמתת שהוא בפיקוח. מיועד לשלט בכניסה.')}</p>`);
  }

  /* ---------- ציור ---------- */
  /*noT*/ const TABS = [['list', 'מקוואות', 'list'], ['map', 'מפה', 'map'], ['trip', 'נופש', 'bag'], ['times', 'שקיעה', 'sun'], ['rabbis', 'רבנים', 'chat']];
  const VIEWS = { list: viewList, map: viewMap, trip: viewTrip, times: viewTimes, rabbis: viewRabbis, updates: viewUpdates, about: viewAbout, admin: viewAdmin };
  const unseen = () => UPDATES.length && UPDATES[0].date > S.seen;
  function shell() {
    $('#app').innerHTML = `
      <header class="top"><button class="brand" data-act="tab" data-tab="list"><span class="logo">${icon('list')}</span><span><b>${T('מאגר המקוואות')}</b><small>${T('מקוואות בפיקוח טהרת המשפחה')}</small></span></button>
        <span class="row"><button class="iconbtn" id="bell" data-act="tab" data-tab="updates" aria-label="${T('עדכונים')}">${icon('bell')}<i class="badge" hidden></i></button>
        <button class="iconbtn" data-act="tab" data-tab="about" aria-label="${T('אודות והגדרות')}">${icon('info')}</button></span></header>
      <main id="view" class="view"></main>
      <nav class="tabs" aria-label="${T('ניווט ראשי')}">${TABS.map(([k, l, ic]) => `<button data-act="tab" data-tab="${k}" id="tab-${k}">${icon(ic)}<span>${T(l)}</span></button>`).join('')}</nav>
      <div id="overlay"></div><div id="sheet"></div><div id="toast" class="toast" role="status" hidden></div>`;
  }
  function render(keepScroll) {
    const v = $('#view'), top = v.scrollTop;
    $('#app').classList.toggle('big', S.bigText);
    v.innerHTML = VIEWS[S.tab]();
    TABS.forEach(([k]) => { const b = $('#tab-' + k); b.classList.toggle('on', k === S.tab); b.setAttribute('aria-current', k === S.tab ? 'page' : 'false'); });
    $('#bell .badge').hidden = !unseen();
    if (S.tab === 'list') renderList();
    v.scrollTop = keepScroll ? top : 0;
    const m = S.detail && byId(S.detail);
    const ov = $('#overlay'), dTop = ov.querySelector('.detail-body') ? ov.querySelector('.detail-body').scrollTop : 0, same = ov.dataset.id === (m ? m.id : '');
    ov.innerHTML = m ? viewDetail(m) : ''; ov.dataset.id = m ? m.id : '';
    if (m && same) { ov.querySelector('.detail').style.animation = 'none'; ov.querySelector('.detail-body').scrollTop = dTop; }
    const sh = { city: () => sheetCity(T('איפה אתם נמצאים?'), 'setloc'), tripcity: () => sheetCity(T('לאן נוסעים?'), 'settrip'), tripfrom: () => sheetCity(T('מאיפה יוצאים?'), 'settripfrom'),
      share: () => sheetShare(S.sheetData), report: () => sheetReport(S.sheetData), qr: () => sheetQr(S.sheetData) }[S.sheet];
    $('#sheet').innerHTML = sh ? sh() : '';
  }
  let toastT;
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }

  function nearestCity(p) { return CITIES.reduce((a, c) => (km(p, c) < km(p, a) ? c : a)); }
  function useGps() {
    if (!navigator.geolocation) return toast(T('המכשיר לא מאפשר איתור מיקום. בחרו עיר מהרשימה.'));
    toast(T('מאתר מיקום…'));
    navigator.geolocation.getCurrentPosition((pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      S.loc = { ...p, label: (T('המיקום שלי · ליד') + ' ') + nearestCity(p).name, gps: true };
      store.set('loc', S.loc); S.sheet = null; render(); toast(T('המיקום עודכן'));
    }, () => toast(T('לא התקבל מיקום. בחרו עיר מהרשימה.')), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  function mikvehText(m) {
    const h = hoursToday(m);
    return [m.name, `${m.address}, ${m.city}`, m.status !== 'active' ? T('כרגע בשיפוץ') + (m.statusNote ? ' · ' + m.statusNote : '') : h && h.range ? (T('היום:') + ' \u2066') + h.range + '\u2069' : '',
      (T('טלפון:') + ' ') + m.phones[0].number, (T('ניווט:') + ' ') + mapsUrl(m), '', T('מתוך מאגר המקוואות שבפיקוח טהרת המשפחה')].filter((x, i) => x || i === 5).join('\n');
  }
  /* דף מקווה נפתח דרך הכתובת (#m01), כדי שכפתור החזרה של המכשיר וקישורי QR יעבדו */
  function openDetail(id) { S.detail = id; S.sheet = null; try { if (location.hash !== '#' + id) location.hash = id; } catch (e) { /* */ } render(true); }
  function closeDetail() { S.detail = null; try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ } render(true); }
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); const next = byId(id) ? id : null; if (next !== S.detail) { S.detail = next; S.sheet = null; render(true); } });

  /* ---------- אירועים ---------- */
  const saveTrip = () => store.set('trip', S.trip);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, d = b.dataset;
    if (a === 'tab') {
      S.tab = d.tab; S.sheet = null;
      if (S.tab === 'updates' && UPDATES.length) { S.seen = UPDATES[0].date; store.set('seen', S.seen); }
      if (S.detail) closeDetail(); else render();
    }
    else if (a === 'open') openDetail(d.id);
    else if (a === 'close') closeDetail();
    else if (a === 'fav') { const id = d.id; S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id); store.set('favs', [...S.favs]); render(true); toast(S.favs.has(id) ? T('נשמר ברשימת השמורים') : T('הוסר מהשמורים')); }
    else if (a === 'filter') { const k = d.k; S.filters.has(k) ? S.filters.delete(k) : S.filters.add(k); b.classList.toggle('on'); b.setAttribute('aria-pressed', S.filters.has(k)); renderList(); }
    else if (a === 'clear') { S.q = ''; S.filters.clear(); render(); }
    else if (a === 'pickloc') { S.sheet = 'city'; render(true); }
    else if (a === 'tripcity' || a === 'tripfrom') { S.sheet = a; render(true); }
    else if (a === 'closesheet') { S.sheet = null; render(true); }
    else if (a === 'gps') useGps();
    else if (a === 'setloc') { const c = city(d.c); S.loc = { lat: c.lat, lng: c.lng, label: c.name }; store.set('loc', S.loc); S.sheet = null; S.mapCity = null; S.rabbiArea = null; render(true); }
    else if (a === 'settrip') { S.trip.city = d.c; saveTrip(); S.sheet = null; render(true); }
    else if (a === 'settripfrom') { S.trip.fromCity = d.c; saveTrip(); S.sheet = null; render(true); }
    else if (a === 'tripmode') { S.trip.mode = d.m; saveTrip(); render(true); }
    else if (a === 'radius') { S.trip.radius = +d.r; saveTrip(); render(true); }
    else if (a === 'mapcity') { S.mapCity = d.c; render(true); }
    else if (a === 'rarea') { S.rabbiArea = d.a; render(true); }
    else if (a === 'share') { const m = byId(d.id); S.sheet = 'share'; S.sheetData = { title: T('שיתוף המקווה'), text: mikvehText(m) }; render(true); }
    else if (a === 'sharetrip') { S.sheet = 'share'; S.sheetData = { title: T('שיתוף תוכנית הנופש'), text: tripText() }; render(true); }
    else if (a === 'nativeshare') { navigator.share({ text: S.sheetData.text }).catch(() => {}); }
    else if (a === 'qr') { S.sheet = 'qr'; S.sheetData = { id: d.id }; render(true); }
    else if (a === 'report') { S.sheet = 'report'; S.sheetData = { id: d.id, kind: '' }; render(true); }
    else if (a === 'rkind') { S.sheetData.kind = d.k; S.sheetData.text = $('#rtext').value; S.sheetData.phone = $('#rphone').value; render(true); }
    else if (a === 'sendreport') { S.sheet = null; render(true); toast(T('בגרסת ההדגמה הדיווח אינו נשלח. בגרסה המלאה הוא יגיע ישירות לצוות הפיקוח.'), 5000); }
    else if (a === 'lang') { store.set('lang', d.l); setLang(d.l); shell(); render(); }
    else if (a === 'admstatus') { const m = byId(S.adminId) || MIKVAOT[0]; m.alert = $('#adm-alert').value.trim(); m.status = d.s; render(true); }
    else if (a === 'admsave') { const m = byId(S.adminId) || MIKVAOT[0]; m.alert = $('#adm-alert').value.trim(); render(true); toast(T('המקווה עודכן במכשיר זה (הדגמה)')); }
    else if (a === 'copy') {
      const v = d.v, msg = d.msg || T('המספר הועתק');
      Promise.resolve().then(() => navigator.clipboard.writeText(v)).then(() => toast(msg), () => {
        const el = $('#sharetext'); if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast(T('הטקסט סומן — אפשר להעתיק')); } else toast(v);
      });
    }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'q') { S.q = e.target.value; renderList(); } });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'tfrom' || t.id === 'tto') {
      if (!t.value) return;
      S.trip[t.id === 'tfrom' ? 'from' : 'to'] = t.value;
      if (S.trip.to < S.trip.from) S.trip.to = S.trip.from;
      saveTrip(); render(true);
    } else if (t.id === 'bigtext') { S.bigText = t.checked; store.set('bigText', S.bigText); render(true); }
    else if (t.id === 'adm-m') { S.adminId = t.value; render(true); }
    else if (t.id === 'notify') { S.notify = t.checked; store.set('notify', S.notify); render(true); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('g[data-act]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if (e.key !== 'Escape') return;
    if (S.sheet) { S.sheet = null; render(true); } else if (S.detail) closeDetail();
  });

  shell();
  if (byId(location.hash.slice(1))) S.detail = location.hash.slice(1);
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
