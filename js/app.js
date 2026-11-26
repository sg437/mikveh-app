(function () {
  'use strict';
  const { MIKVAOT, RABBIS, CITIES, UPDATES, demo } = window.DATA;
  const SITE = 'https://www.taharat.org.il';
  /* מאפיינים שנגזרים מרשימת השירותים של כל מקווה */
  MIKVAOT.forEach((m) => {
    const sv = m.services;
    m.chabad = sv.some((x) => x.includes('חב'));
    m.access = sv.includes('הנגשה מלאה') ? 'full' : sv.includes('הנגשה חלקית') ? 'partial' : '';
    m.kelim = sv.includes('מקווה כלים'); m.parking = sv.includes('חניה');
    m.full = m.name.startsWith('מקו') ? m.name : 'מקווה ' + m.name;
    m.place = (m.address ? m.address + ', ' : '') + m.city;
    m.status = m.status || 'active'; m.alert = m.alert || '';
  });
  /* תמונות: באפליקציה נטענות מהתיקייה photos; בתצוגה המקדימה מוחלף ב-window.PHOTOS */
  const PHOTOS = window.PHOTOS || { thumb: (id) => Promise.resolve('photos/' + id + '.jpg') };
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
    if (a.lat == null || b.lat == null) return Infinity;
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
  const fmtKm = (d) => (!isFinite(d) ? '' : d < 1 ? Math.round(d * 1000) + (' ' + T('מ׳')) : d < 10 ? d.toFixed(1) + (' ' + T('ק״מ')) : Math.round(d) + (' ' + T('ק״מ')));
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
  const sunsetStr = (date, p) => { if (p.lat == null) return '—'; const s = window.Sun.sunset(date, p.lat, p.lng); return s ? fTime.format(s) : '—'; };
  const telHref = (n) => 'tel:' + n.replace(/[^\d+*]/g, '');
  const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const byId = (id) => MIKVAOT.find((m) => m.id === id);
  const city = (n) => CITIES.find((c) => c.name === n) || CITIES[0];
  /*noT*/ const regionOf = (p) => (p.lat > 32.45 ? 'צפון' : p.lat < 31.55 ? 'דרום' : p.lng > 34.95 && p.lat < 31.95 ? 'ירושלים והסביבה' : 'מרכז');
  const mapsUrl = (m) => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(m.place);
  const wazeUrl = (m) => 'https://waze.com/ul?q=' + encodeURIComponent(m.place) + '&navigate=yes';

  /* שעות הפתיחה: השורה שמתאימה להיום לפי עונה ויום בשבוע */
  /*noT-start*/
  const isWinter = (d) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' }).format(d).includes('GMT+2');
  function hoursToday(m, now = new Date()) {
    if (!m.hours.length) return null;
    const dow = now.getDay(), want = dow === 5 ? 'ערב שבת' : dow === 6 ? 'מוצ"ש' : isWinter(now) ? 'חורף' : 'קיץ';
    const h = m.hours.find((x) => x.label === want) || m.hours.find((x) => !x.label);
    return h ? { label: h.label, value: h.value } : null;
  }
  /*noT-end*/

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
    dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    rows: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    gear: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    gift: '<rect x="4" y="10" width="16" height="10" rx="1"/><path d="M3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/>'
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

  /* ---------- מצב ---------- */
  const today = new Date();
  /*noT-start*/
  const S = {
    tab: 'list', page: null, mode: 'list', q: '', filters: new Set(), mine: store.get('mine', null),
    favs: new Set(store.get('favs', [])),
    loc: store.get('loc', null),            // { lat, lng, label, gps }
    detail: null, sheet: null, sheetData: null,
    mapCity: null, rabbiArea: null, limit: 30,
    bigText: store.get('bigText', false), notify: store.get('notify', false),
    seen: store.get('seen', ''),
    trip: Object.assign({ mode: 'area', city: 'צפת', fromCity: 'ירושלים', radius: 25, from: isoDate(today), to: isoDate(new Date(+today + 3 * 864e5)) }, store.get('trip', {}))
  };
  /*noT-end*/
  /*noT-start*/
  const FILTERS = [
    ['sup', 'בפיקוח המרכז', (m) => m.sup],
    ['photos', 'עם תמונות', (m) => m.photos.length],
    ['chabad', 'בור חב״ד', (m) => m.chabad],
    ['access', 'נגיש', (m) => m.access],
    ['kelim', 'מקווה כלים', (m) => m.kelim],
    ['parking', 'חניה', (m) => m.parking]
  ];
  /*noT-end*/

  /* ---------- רכיבים ---------- */
  const supPill = (m) => (m.sup ? `<span class="pill ok">${icon('shield')}${T('בפיקוח המרכז')}</span>` : `<span class="pill mute">${T('לא בפיקוח המרכז')}</span>`);
  const tags = (m) => [m.status === 'renovation' && `<span class="pill warn"><i></i>${T('בשיפוץ')}</span>`,
    ...[m.chabad && T('בור חב״ד'), m.access === 'full' && T('נגיש'), m.access === 'partial' && T('נגיש חלקית'), m.kelim && T('מקווה כלים')].filter(Boolean).map((t) => `<span class="tag">${t}</span>`)].filter(Boolean).join('');
  const todayLine = (m) => {
    const h = hoursToday(m); if (!h) return '';
    return `<span class="today">${icon('clock')}<span>${h.label ? T(h.label) + ': ' : ''}${esc(h.value)}</span></span>`;
  };
  const thumb = (m) => `<span class="thumb none"${m.photos.length ? ` data-thumb="${m.id}"` : ''}>${window.LOGO.emblem}</span>`;

  function card(m, origin, distText) {
    const dk = origin ? km(origin, m) : Infinity, d = distText || (m.approx && dk < 1 ? '' : fmtKm(dk));
    return `<button class="card" data-act="open" data-id="${m.id}">
      ${thumb(m)}
      <span class="card-main">
        <span class="card-name">${esc(m.full)}</span>
        <span class="card-sub">${esc(m.place)}</span>
        ${m.alert ? `<span class="alertline">${icon('alert')}${esc(m.alert)}</span>` : todayLine(m)}
        <span class="card-tags">${supPill(m)}${tags(m)}</span>
      </span>
      <span class="card-side">${d ? `<span class="dist">${d}</span>` : ''}${S.favs.has(m.id) ? icon('heart', 'fav-on') : ''}</span>
    </button>`;
  }

  function listItems() {
    const q = S.q.trim();
    let items = MIKVAOT.filter((m) => (!q || (m.full + ' ' + m.place).includes(q)) &&
      [...S.filters].every((f) => FILTERS.find((x) => x[0] === f)[2](m)));
    if (S.loc) items = items.slice().sort((a, b) => km(S.loc, a) - km(S.loc, b));
    else items = items.slice().sort((a, b) => a.city.localeCompare(b.city, 'he') || a.name.localeCompare(b.name, 'he'));
    return items;
  }

  function renderList() {
    const items = listItems();
    const el = $('#list'); if (!el) return;
    const feat = S.loc && !S.q.trim() && !S.filters.size ? items.filter((m) => m.photos.length).slice(0, 8) : [];
    if ($('#nearby')) $('#nearby').innerHTML = feat.length ? `<div class="sechead">${T('קרובים אליך')}</div><div class="carousel">${feat.map((m) => `<button class="pcard" data-act="open" data-id="${m.id}">
        <span class="pimg thumb none" data-thumb="${m.id}">${window.LOGO.emblem}${m.approx && km(S.loc, m) < 1 ? '' : `<span class="pdist">${fmtKm(km(S.loc, m))}</span>`}</span>
        <b>${esc(m.full)}</b><small>${esc(m.city)}${m.sup ? ' · ' + T('בפיקוח המרכז') : ''}</small></button>`).join('')}</div>` : '';
    $('#count').textContent = (items.length === MIKVAOT.length ? `${items.length} ${T('מקוואות')}` : `${items.length} ${T('מתוך')} ${MIKVAOT.length} ${T('מקוואות')}`) + ' · ' + (S.loc ? T('מהקרוב לרחוק') : T('לפי עיר'));
    el.innerHTML = items.length ? items.slice(0, S.limit).map((m) => card(m, S.loc)).join('') + (items.length > S.limit ? `<button class="btn ghost wide" data-act="more">${T('הצגת מקוואות נוספים')} (${items.length - S.limit})</button>` : '')
      : `<div class="empty">${T('לא נמצאו מקוואות מתאימים.')}<br><button class="link" data-act="clear">${T('ניקוי החיפוש והסינון')}</button></div>`;
    hydrate();
  }
  /* טעינת התמונות הממוזערות אחרי כל ציור */
  function hydrate() {
    document.querySelectorAll('[data-thumb]:not([data-done])').forEach((el) => {
      el.dataset.done = '1';
      PHOTOS.thumb(el.dataset.thumb).then((url) => {
        if (!url) return;
        if (el.tagName === 'IMG') { el.src = url; return; }
        const im = new Image();
        im.onload = () => { el.style.backgroundImage = `url("${url}")`; el.classList.remove('none'); const sv = el.querySelector('svg'); if (sv) sv.remove(); };
        im.src = url;
      }).catch(() => {});
    });
  }

  const locBar = () => `<button class="locbar" data-act="pickloc">
      ${icon('pin')}<span class="locbar-txt">${S.loc ? `<b>${esc(S.loc.label)}</b>` : ('<b>' + T('בחירת מיקום') + '</b><small>' + T('כדי לראות את המקוואות הקרובים') + '</small>')}</span>
      <span class="locbar-change">${S.loc ? T('שינוי') : T('בחירה')}</span></button>`;

  const shabbatBanner = () => {
    const d = today.getDay();
    return d === 5 ? `<div class="banner">${icon('info')}<span><b>${T('היום ערב שבת.')}</b> ${T('בליל שבת המקוואות פועלים בתיאום מראש בלבד — כדאי להתקשר לפני כן.')}</span></div>`
      : d === 6 ? `<div class="banner">${icon('info')}<span><b>${T('מוצאי שבת.')}</b> ${T('המקוואות נפתחים מאוחר מהרגיל, אחרי צאת השבת.')}</span></div>` : '';
  };

  /* כרטיס שקיעה קטן (בסגנון כרטיס מזג האוויר במפות): שעת השקיעה של היום במיקום הנוכחי */
  const sunChip = () => `<button class="sunchip" data-act="page" data-p="times" aria-label="${T('זמני השקיעה')}">
      ${icon('sun')}<span><b>${S.loc ? sunsetStr(today, S.loc) : '—'}</b><small>${S.loc ? T('שקיעה היום') : T('שקיעה · בחרו מיקום')}</small></span></button>`;

  /* לשונית "מקוואות": חיפוש, ובראש התוצאות מתג רשימה/מפה (המפה היא תצוגה של אותם נתונים, לא יעד נפרד) */
  function viewList() {
    const map = S.mode === 'map';
    return `<section class="hero">
      <div class="hero-row"><h1>${T('מצאו מקווה קרוב')}</h1>${sunChip()}</div>
      <p><b>${MIKVAOT.length}</b> ${T('מקוואות')} · <b>${CITIES.length}</b> ${T('יישובים')}</p>
      <div class="search">${icon('search')}<input id="q" type="search" inputmode="search" autocomplete="off" aria-label="${T('חיפוש מקווה')}" placeholder="${T('חיפוש לפי שם, עיר או רחוב')}" value="${esc(S.q)}">
        <button class="locate" data-act="gps" aria-label="${T('מיון לפי המיקום הנוכחי שלי')}" title="${T('המיקום הנוכחי שלי')}">${icon('target')}</button></div>
      <div class="locline">${icon('pin')}${S.loc
        ? `<span>${T('ממוינים לפי מרחק מ־')}<b>${esc(S.loc.label)}</b></span><button class="locline-btn" data-act="pickloc">${T('שינוי מיקום')}</button>`
        : `<span>${T('הפעילו מיקום כדי לראות קודם את הקרובים')}</span><button class="locline-btn" data-act="pickloc">${T('בחירת עיר')}</button>`}</div>
    </section>
    <div class="pad">
      ${shabbatBanner()}
      ${map ? '' : '<div id="nearby"></div>'}
      <div class="listhead">${map ? `<span>${T('מקוואות לפי יישוב')}</span>` : '<span id="count"></span>'}
        <div class="seg two viewtoggle" role="group" aria-label="${T('תצוגה')}">
          <button class="${map ? '' : 'on'}" data-act="mode" data-m="list" aria-pressed="${!map}">${icon('rows')}${T('רשימה')}</button>
          <button class="${map ? 'on' : ''}" data-act="mode" data-m="map" aria-pressed="${map}">${icon('map')}${T('מפה')}</button></div></div>
      ${map ? viewMap() : `<div class="chips" role="group" aria-label="${T('סינון')}">${FILTERS.map(([k, l]) => `<button class="chip${S.filters.has(k) ? ' on' : ''}" data-act="filter" data-k="${k}" aria-pressed="${S.filters.has(k)}">${T(l)}</button>`).join('')}</div>
      <div id="list" class="list"></div>`}
    </div>`;
  }

  /* ---------- מפה סכמטית ---------- */
  const MAP = { k: 118, lng0: 34.15, lat0: 33.42, w: 190, h: 474 };
  const mx = (lng) => (lng - MAP.lng0) * 0.853 * MAP.k, my = (lat) => (MAP.lat0 - lat) * MAP.k;
  const OUTLINE = [[35.10, 33.09], [35.07, 32.92], [34.99, 32.83], [34.95, 32.82], [34.92, 32.60], [34.85, 32.33], [34.76, 32.07], [34.63, 31.80], [34.54, 31.67], [34.49, 31.60], [34.27, 31.22], [34.56, 30.40], [34.90, 29.50], [34.97, 29.55], [35.15, 30.20], [35.33, 30.80], [35.42, 31.15], [35.50, 31.50], [35.55, 32.00], [35.57, 32.40], [35.62, 32.68], [35.88, 32.75], [35.90, 33.20], [35.80, 33.33], [35.62, 33.26], [35.55, 33.27], [35.50, 33.09]];
  function viewMap() {
    const sel = CITIES.find((c) => c.name === S.mapCity) || (S.loc ? nearestCity(S.loc) : city('ירושלים')); /*noT*/
    const here = MIKVAOT.filter((m) => m.city === sel.name);
    const near = CITIES.filter((c) => c !== sel).map((c) => ({ c, d: km(sel, c) })).sort((a, b) => a.d - b.d).slice(0, 6);
    return `<div class="mapwrap">
        <svg class="map" viewBox="0 0 ${MAP.w} ${MAP.h}" data-act="maptap" role="img" aria-label="${T('מפה סכמטית של הארץ')}">
          <polygon class="land" points="${OUTLINE.map(([g, t]) => mx(g).toFixed(1) + ',' + my(t).toFixed(1)).join(' ')}"/>
          <ellipse class="water" cx="${mx(35.59)}" cy="${my(32.82)}" rx="5" ry="8.5"/>
          <ellipse class="water" cx="${mx(35.48)}" cy="${my(31.5)}" rx="4.5" ry="24"/>
          ${CITIES.map((c) => `<circle class="pt" cx="${mx(c.lng).toFixed(1)}" cy="${my(c.lat).toFixed(1)}" r="${(1.5 + Math.min(c.count, 12) * 0.22).toFixed(1)}"/>`).join('')}
          ${S.loc ? `<circle class="me" cx="${mx(S.loc.lng)}" cy="${my(S.loc.lat)}" r="4"/>` : ''}
          <circle class="sel" cx="${mx(sel.lng).toFixed(1)}" cy="${my(sel.lat).toFixed(1)}" r="6"/>
        </svg>
        <div class="mapside">
          <div class="mapcity">${esc(sel.name)}</div>
          <div class="mapcount">${here.length} ${T('מקוואות')}${S.loc ? ' · ' + fmtKm(km(S.loc, sel)) + (' ' + T('ממך')) : ''}</div>
          ${here.slice(0, 8).map((m) => `<button class="mini" data-act="open" data-id="${m.id}"><b>${esc(m.full)}</b>${supPill(m)}</button>`).join('')}
          ${here.length > 8 ? `<button class="link" data-act="mapall" data-c="${esc(sel.name)}">${T('כל המקוואות ביישוב')} (${here.length})</button>` : ''}
          <div class="lbl">${T('יישובים קרובים')}</div>
          <div class="chips wrap">${near.map((x) => `<button class="chip" data-act="mapcity" data-c="${esc(x.c.name)}">${esc(x.c.name)}</button>`).join('')}</div>
        </div>
      </div>
      <p class="note">${T('לחיצה על המפה בוחרת את היישוב הקרוב לנקודה. כל נקודה היא יישוב שיש בו מקווה.')}</p>`;
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
      ...res.map((x) => `• ${x.m.full}, ${x.m.place}${x.m.phones[0] ? ' — ' + x.m.phones[0] : ''}`), '', T('מתוך מאגר המקוואות של המרכז הארצי למען טהרת המשפחה')].join('\n');
  }
  function viewTrip() {
    const t = S.trip, c = city(t.city), res = tripResults(), route = t.mode === 'route';
    const from = parseDate(t.from), to = parseDate(t.to), days = [];
    for (let d = new Date(from), n = 0; d <= to && n < 14; d = new Date(+d + 864e5), n++) days.push(new Date(d));
    const sel = (label, act, name) => `<div class="field"><span class="lbl">${label}</span><button class="select" data-act="${act}">${icon('pin')}<span>${esc(name)}</span>${icon('back', 'chev down')}</button></div>`;
    return `<div class="pad">
      <p class="lead">${T('רואים מראש אילו מקוואות נמצאים ביעד או בדרך אליו.')}</p>
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
      <div class="listhead"><span>${res.length ? `${res.length} ${T('מקוואות')} ${route ? `${T('בדרך מ')}${esc(t.fromCity)} ${T('ל')}${esc(c.name)}` : (T('באזור') + ' ') + esc(c.name)}` : T('אין מקווה בטווח שנבחר')}</span></div>
      <div class="list">${res.slice(0, 40).map((x) => card(x.m, null, x.label)).join('') || `<div class="empty">${T('נסו להגדיל את המרחק, או פנו לרבנים לקבלת הכוונה.')}<br><button class="link" data-act="tab" data-tab="rabbis">${T('יצירת קשר עם הרבנים')}</button></div>`}</div>
      ${route ? ('<p class="note">' + T('המסלול מחושב בקו ישר בין שני היישובים, בקירוב.') + '</p>') : ''}
      ${res.length ? `<button class="btn wide" data-act="sharetrip">${icon('share')}${T('שיתוף התוכנית')}</button>` : ''}
      ${days.length ? `<h3 class="h3">${T('שקיעה ב')}${esc(c.name)} ${T('בימי הנופש')}</h3>
      <div class="times">${days.map((d) => `<div class="trow"><span>${fDay.format(d)}</span><b>${sunsetStr(d, c)}</b></div>`).join('')}</div>` : ''}
    </div>`;
  }

  function viewTimes() {
    if (!S.loc) return `<div class="pad">${locBar()}<div class="empty">${T('בחרו מיקום כדי לראות את זמן השקיעה המדויק למקום שבו אתם נמצאים.')}</div></div>`;
    const days = Array.from({ length: 7 }, (_, i) => new Date(+today + i * 864e5));
    return `<div class="pad">
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
  const rabbiCard = (r) => `<div class="rabbi">
        <div class="rabbi-head"><div class="rabbi-name">${esc(r.name)}</div></div>
        ${r.role || r.hours ? `<div class="rabbi-sub">${esc([r.role, r.hours].filter(Boolean).join(' · '))}</div>` : ''}
        ${r.phone ? `<div class="numrow"><span class="num big" dir="ltr">${esc(r.phone)}</span><button class="iconbtn sm" data-act="copy" data-v="${esc(r.phone)}" aria-label="${T('העתקת המספר')}">${icon('copy')}</button></div>` : ''}
        <div class="btnrow">
          ${r.phone ? `<a class="btn" href="${telHref(r.phone)}">${icon('phone')}${T('חיוג')}</a>` : ''}
          ${r.whatsapp ? `<a class="btn wa" href="https://wa.me/${esc(r.whatsapp)}" target="_blank" rel="noopener">${icon('chat')}${T('וואטסאפ')}</a>` : ''}
        </div></div>`;
  function viewRabbis() {
    return `<div class="pad">
      <h2 class="h2">${T('שאלה לרב')}</h2>
      <p class="lead">${T('רבני המרכז הארצי למען טהרת המשפחה עונים לשאלות בטלפון ובכתב. הפנייה דיסקרטית.')}</p>
      <div class="list">${RABBIS.map(rabbiCard).join('')}
        <div class="rabbi">
          <div class="rabbi-name">${T('שאלה בכתב')}</div>
          <div class="rabbi-sub">${T('טופס השאלות באתר המרכז, או בדואר אלקטרוני')}</div>
          <div class="numrow"><span class="num" dir="ltr">lf@taharat.org</span><button class="iconbtn sm" data-act="copy" data-v="lf@taharat.org" data-msg="${T('הכתובת הועתקה')}" aria-label="${T('העתקה')}">${icon('copy')}</button></div>
          <div class="btnrow"><a class="btn" href="${SITE}/askrabbie" target="_blank" rel="noopener">${icon('chat')}${T('שליחת שאלה באתר')}</a></div>
        </div>
      </div>
    </div>`;
  }

  /* ---------- עדכונים ואודות ---------- */
  function viewUpdates() {
    return `<div class="pad">
      <label class="switchrow"><span><b>${T('התראות על מקוואות שמורים')}</b><small>${T('שינוי שעות, סגירה זמנית ופתיחה מחדש')}</small></span><input id="notify" type="checkbox" ${S.notify ? 'checked' : ''}><i></i></label>
      ${S.notify ? ('<p class="note">' + T('ההעדפה נשמרה. ההתראות עצמן יופעלו בגרסת החנות.') + '</p>') : ''}
      ${UPDATES.length ? '' : `<div class="empty">${T('אין כרגע עדכונים. הודעות על שינויי שעות וסגירות יופיעו כאן.')}</div>`}
      <div class="list">${UPDATES.map((u) => { const m = u.mikveh && byId(u.mikveh); return `<${m ? `button data-act="open" data-id="${m.id}"` : 'div'} class="update${m && S.favs.has(m.id) ? ' mine' : ''}">
        <span class="update-date">${fDay.format(parseDate(u.date))}${m && S.favs.has(m.id) ? (' · ' + T('מקווה שמור')) : ''}</span>
        <b>${esc(u.title)}</b><span>${esc(u.body)}</span></${m ? 'button' : 'div'}>`; }).join('')}</div>
    </div>`;
  }
  function viewAbout() {
    return `<div class="pad">
      <label class="switchrow"><span><b>${T('טקסט גדול')}</b><small>${T('הגדלת כל הכתב באפליקציה')}</small></span><input id="bigtext" type="checkbox" ${S.bigText ? 'checked' : ''}><i></i></label>
      <div class="field"><span class="lbl">${T('שפה')} · Language</span><div class="seg two"><button class="${LANG === 'he' ? 'on' : ''}" data-act="lang" data-l="he">${T('עברית')}</button><button class="${LANG === 'en' ? 'on' : ''}" data-act="lang" data-l="en">English</button></div></div>
      <h3 class="h3">${T('פרטיות')}</h3>
      <div class="notes"><b>${T('האפליקציה לא אוספת עליכם מידע.')}</b><br>${T('אין הרשמה ואין חשבון. המיקום משמש רק לחישוב מרחקים וזמנים בתוך המכשיר ואינו נשלח לשום מקום. המקוואות השמורים ותוכנית הנופש נשמרים במכשיר בלבד.')} ${T('גם האזור האישי נשמר במכשיר בלבד, מוצפן ונעול בקוד אישי.')}</div>
      <h3 class="h3">${T('על המאגר')}</h3>
      <div class="notes">${T('המאגר כולל את המקוואות המופיעים באתר המרכז הארצי למען טהרת המשפחה. בכל דף מקווה מצוין אם הוא בפיקוח ועד הכשרות של המרכז. המידע נשמר במכשיר וזמין גם בלי קליטה.')}</div>
      <button class="btn ghost wide" data-act="tab" data-tab="rabbis">${icon('chat')}${T('יצירת קשר')}</button>
      <button class="link center" data-act="page" data-p="admin">${T('כניסת מנהלים')}</button>
      ${demo ? ('<p class="demo">' + T('גרסת הדגמה · כל הנתונים לדוגמה בלבד') + '</p>') : ''}
    </div>`;
  }

  /* ---------- אזור מנהלים (הדגמה) ---------- */
  /*noT*/ const DEMAND = [['ים המלח (עין בוקק)', 46], ['קצרין', 31], ['מצפה רמון', 22], ['קיסריה', 17]];
  function viewAdmin() {
    const m = byId(S.adminId) || MIKVAOT[0];
    return `<div class="pad">
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
  /* וואטסאפ: רק למספר נייד ישראלי (05X) של איש הקשר, או לשדה whatsapp מפורש בנתונים */
  const waNumber = (n) => { const d = String(n || '').replace(/\D/g, ''); return /^05\d{8}$/.test(d) ? '972' + d.slice(1) : /^9725\d{8}$/.test(d) ? d : ''; };
  const waOf = (m) => waNumber(m.whatsapp) || waNumber(m.contact && m.contact.whatsapp) || waNumber(m.contact && m.contact.phone);
  const mailOf = (m) => (m.email || (m.contact && m.contact.email) || '').trim();
  const fMin = (n) => (n < 60 ? `${n} ${T('דק׳')}` : `${Math.floor(n / 60)} ${T('ש׳')}` + (n % 60 ? ` ${n % 60} ${T('דק׳')}` : ''));
  /* כמה זמן נשאר עד הסגירה (לפי שורת השעות של היום) וזמן נסיעה משוער */
  function closingInfo(m, now = new Date()) {
    const h = hoursToday(m); if (!h || !window.Hours) return null;
    const weekday = !h.label || h.label === 'חורף' || h.label === 'קיץ';   /*noT*/
    const r = window.Hours.parse(h.value, now, (d) => (m.lat == null ? null : window.Sun.sunset(d, m.lat, m.lng)));
    if (!r) return null;
    if (r.closed) return { cls: 'bad', text: T('סגור היום') };
    if (!weekday && !r.close) return null;
    const left = r.close ? Math.round((r.close - now) / 6e4) : null;
    if (r.close && left <= 0) return { cls: 'bad', text: `${T('נסגר היום ב־')}${fTime.format(r.close)}`, left };
    if (r.open && now < r.open) return { cls: 'wait', text: `${T('נפתח היום ב־')}${fTime.format(r.open)}${r.close ? ` · ${T('עד')} ${fTime.format(r.close)}` : ''}`, left };
    if (r.close) return { cls: left <= 45 ? 'warn' : 'ok', text: `${T('נסגר בעוד')} ${fMin(left)} (${fTime.format(r.close)})`, left };
    return null;
  }
  function etaInfo(m) {
    if (!S.loc || m.lat == null || !window.Hours) return null;
    const min = window.Hours.driveMinutes(km(S.loc, m));
    return min == null || min > 300 ? null : min;
  }
  const mikvehUpdates = (m) => UPDATES.filter((u) => u.mikveh === m.id);

  function viewDetail(m) {
    const fav = S.favs.has(m.id), main = m.phones[0], h = hoursToday(m), ci = closingInfo(m), eta = etaInfo(m), wa = waOf(m), mail = mailOf(m), ups = mikvehUpdates(m);
    const waText = encodeURIComponent(`${T('שלום, פנייה בנוגע ל')}${m.full} (${T('דרך אפליקציית המקוואות')})`);
    const photo = (f) => `${SITE}/cache/w_640,h_427,mode_crop/${encodeURIComponent(f)}`;
    return `<div class="detail" role="dialog" aria-label="${esc(m.full)}">
      <div class="detail-body">
        <div class="dhero">
        ${m.photos.length ? `<div class="gallery"><img data-thumb="${m.id}" alt="${esc(m.full)}" onerror="this.remove()">${m.photos.slice(1).map((f) => `<img src="${photo(f)}" alt="${esc(m.full)}" loading="lazy" onerror="this.remove()">`).join('')}</div>`
          : `<div class="nophoto">${window.LOGO.emblem}</div>`}
          <div class="dhero-bar">
            <button class="fab" data-act="close" aria-label="${T('חזרה')}">${icon('back', 'flip')}</button>
            <span class="row">
              <button class="fab" data-act="share" data-id="${m.id}" aria-label="${T('שיתוף')}">${icon('share')}</button>
              <button class="fab${fav ? ' fav-on' : ''}" data-act="fav" data-id="${m.id}" aria-label="${fav ? T('הסרה מהשמורים') : T('שמירה')}" aria-pressed="${fav}">${icon('heart')}</button>
            </span>
          </div>
        </div>
        <div class="pad dsheet">
          <h2 class="detail-name">${esc(m.full)}</h2>
          <div class="detail-addr">${icon('pin')}<span>${esc(m.place)}${S.loc && m.lat != null ? ` · ${fmtKm(km(S.loc, m))} ${T('ממך')}` : ''}</span></div>
          ${m.status === 'renovation' ? `<div class="card-tags"><span class="pill warn"><i></i>${T('בשיפוץ')}</span>${m.statusNote ? `<span class="statusnote">${esc(m.statusNote)}</span>` : ''}</div>` : ''}
          ${m.alert ? `<div class="banner bad">${icon('alert')}<span>${esc(m.alert)}</span></div>` : ''}

          ${m.sup ? `<div class="cert"><div class="cert-head">${icon('shield')}<span><b>${T('בפיקוח המרכז')}</b><small>${T('מפוקח על ידי ועד הכשרות של המרכז הארצי לטהרת המשפחה')}</small></span></div></div>`
            : `<div class="cert no"><div class="cert-head">${icon('info')}<span><b>${T('לא בפיקוח המרכז')}</b><small>${T('מקווה זה אינו בפיקוח המרכז הארצי לטהרת המשפחה. יש לברר את הכשרות עם הרבנים המקומיים.')}</small></span></div></div>`}

          <div class="actions">
            <a class="act" href="${mapsUrl(m)}" target="_blank" rel="noopener">${icon('pin')}<span>${T('מפות Google')}</span></a>
            <button class="act" data-act="share" data-id="${m.id}">${icon('share')}<span>${T('שיתוף')}</span></button>
            <button class="act${fav ? ' fav-on' : ''}" data-act="fav" data-id="${m.id}">${icon('heart')}<span>${fav ? T('שמור') : T('שמירה')}</span></button>
          </div>

          ${ups.length ? `<h3 class="h3">${T('עדכונים מהמקווה')}</h3>
          <div class="list">${ups.map((u) => `<div class="update mine"><span class="update-date">${fDay.format(parseDate(u.date))}</span><b>${esc(u.title)}</b><span>${esc(u.body)}</span></div>`).join('')}</div>` : ''}

          ${m.hours.length ? `<h3 class="h3">${T('שעות פתיחה')}</h3>
          <div class="spec hours">${ci ? `<div class="closing ${ci.cls}">${icon('clock')}<b>${ci.text}</b></div>` : ''}${m.hours.map((x) => `<div class="${h && x.label === h.label && x.value === h.value ? 'now' : ''}">${x.label ? `<span>${esc(T(x.label))}</span>` : ''}<b>${esc(x.value)}</b></div>`).join('')}
            ${m.lat != null ? `<div class="sunline"><span>${icon('sun')}${T('שקיעה היום במקום')}</span><b>${sunsetStr(today, m)}</b></div>` : ''}</div>` : ''}

          ${m.phones.length || m.contact ? `<h3 class="h3">${T('טלפונים')}</h3>
          <div class="spec">${m.phones.map((n) => `<div><span>${T('המקווה')}</span><span class="numrow"><a class="num" dir="ltr" href="${telHref(n)}">${esc(n)}</a><button class="iconbtn sm" data-act="copy" data-v="${esc(n)}" aria-label="${T('העתקת המספר')}">${icon('copy')}</button></span></div>`).join('')}
            ${m.contact ? `<div><span>${T('איש קשר')}${m.contact.name ? ' · ' + esc(m.contact.name) : ''}</span>${m.contact.phone ? `<span class="numrow"><a class="num" dir="ltr" href="${telHref(m.contact.phone)}">${esc(m.contact.phone)}</a><button class="iconbtn sm" data-act="copy" data-v="${esc(m.contact.phone)}" aria-label="${T('העתקת המספר')}">${icon('copy')}</button></span>` : ''}</div>` : ''}</div>` : ''}
          ${wa || mail ? `<div class="btnrow contactbtns">
            ${wa ? `<a class="btn wa" href="https://wa.me/${wa}?text=${waText}" target="_blank" rel="noopener">${icon('chat')}${T('וואטסאפ ל')}${m.contact && m.contact.name && waNumber(m.contact.phone) === wa ? esc(m.contact.name) : T('מקווה')}</a>` : ''}
            ${mail ? `<a class="btn ghost" href="mailto:${esc(mail)}?subject=${encodeURIComponent(m.full)}">${icon('mail')}${T('מייל')}</a>` : ''}
          </div>` : ''}

          ${m.services.length ? `<h3 class="h3">${T('במקווה')}</h3><div class="chips wrap svc">${m.services.map((x) => `<span class="tag big">${icon('check')}${esc(T(x))}</span>`).join('')}</div>` : ''}

          ${m.notes ? `<h3 class="h3">${T('טוב לדעת')}</h3><p class="notes">${esc(m.notes)}</p>` : ''}

          <div class="btnrow col">
            <button class="btn ghost wide" data-act="tab" data-tab="rabbis">${icon('chat')}${T('שאלה לרב')}</button>
            <button class="btn ghost wide" data-act="report" data-id="${m.id}">${icon('flag')}${T('מצאתם טעות בפרטים? כתבו לנו')}</button>
          </div>
          ${m.sup && window.qrcode ? `<button class="link center" data-act="qr" data-id="${m.id}">${icon('qr')}${T('קוד QR של המקווה')}</button>` : ''}
          <p class="demo">${m.updated ? `${T('עודכן לאחרונה:')} ${esc(m.updated)} · ` : ''}${T('המידע מאתר המרכז')}</p>
        </div>
      </div>
      ${ci || eta ? `<div class="dstatus">${ci ? `<span class="closing ${ci.cls}">${icon('clock')}${ci.text}</span>` : ''}${eta ? `<span class="eta">${icon('nav')}≈ ${fMin(eta)} ${T('נסיעה')}${ci && ci.left != null && ci.left > 0 && eta > ci.left ? ` · <b>${T('ייתכן שלא תספיקו')}</b>` : ''}</span>` : ''}</div>` : ''}
      <div class="dbar">
        <a class="btn" href="${wazeUrl(m)}" target="_blank" rel="noopener">${icon('nav')}${T('ניווט')}</a>
        ${main ? `<a class="btn alt" href="${telHref(main)}">${icon('phone')}${T('חיוג')}</a>` : ''}
      </div>
    </div>`;
  }

  /* ---------- גיליונות ---------- */
  const sheetWrap = (title, body) => `<div class="scrim" data-act="closesheet"></div>
    <div class="sheet" role="dialog" aria-label="${title}">
      <div class="sheet-head"><b>${title}</b><button class="iconbtn" data-act="closesheet" aria-label="${T('סגירה')}">${icon('x')}</button></div>${body}</div>`;
  const cityButtons = (act, q) => {
    const list = (q ? CITIES.filter((c) => c.name.includes(q)) : CITIES.slice().sort((a, b) => b.count - a.count)).slice(0, 30);
    return list.map((c) => `<button data-act="${act}" data-c="${esc(c.name)}">${esc(c.name)}</button>`).join('') || `<p class="lead">${T('לא נמצא יישוב בשם הזה.')}</p>`;
  };
  const sheetCity = (title, act) => sheetWrap(title, `
      ${act === 'setloc' ? `<button class="gps" data-act="gps">${icon('target')}<span><b>${T('המיקום הנוכחי שלי')}</b><small>${T('לפי מיקום המכשיר')}</small></span></button>` : ''}
      <label class="search">${icon('search')}<input id="cityq" data-cact="${act}" type="search" autocomplete="off" placeholder="${T('חיפוש יישוב')}"></label>
      <div class="citygrid" id="citylist">${cityButtons(act, '')}</div>`);
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
      <p class="lead center"><b>${esc(m.full)}</b><br>${T('סריקת הקוד פותחת את דף המקווה ומאמתת שהוא בפיקוח. מיועד לשלט בכניסה.')}</p>`);
  }

  /* ---------- לשונית "השמורים שלי": המקווה שלי בראש, עם מה שצריך היום ---------- */
  function viewFavs() {
    const favs = [...S.favs].map(byId).filter(Boolean);
    if (!favs.length) return `<div class="pad"><h2 class="h2">${T('השמורים שלי')}</h2>
      <div class="empty">${icon('heart')}<br>${T('עוד לא שמרתם מקוואות. בדף המקווה לוחצים על הלב — והמקווה יופיע כאן, עם השעות של היום, הזמן עד הסגירה וחיוג או ניווט בלחיצה.')}<br>
      <button class="link" data-act="tab" data-tab="list">${T('חיפוש מקווה')}</button></div></div>`;
    const mine = favs.find((m) => m.id === S.mine) || favs[0], others = favs.filter((m) => m !== mine);
    const h = hoursToday(mine), ci = closingInfo(mine), eta = etaInfo(mine), main = mine.phones[0];
    return `<div class="pad">
      <h2 class="h2">${T('השמורים שלי')}</h2>
      <div class="mine">
        <span class="mine-lbl">${icon('heart', 'fav-on')}${T('המקווה שלי')}</span>
        <button class="mine-head" data-act="open" data-id="${mine.id}">${thumb(mine)}<span><b>${esc(mine.full)}</b><small>${esc(mine.place)}${S.loc && mine.lat != null ? ' · ' + fmtKm(km(S.loc, mine)) : ''}</small></span></button>
        ${mine.alert ? `<div class="banner bad">${icon('alert')}<span>${esc(mine.alert)}</span></div>` : ''}
        <div class="spec">
          <div><span>${T('היום')}${h && h.label ? ' · ' + esc(T(h.label)) : ''}</span><b>${h ? esc(h.value) : '—'}</b></div>
          ${ci ? `<div class="closing ${ci.cls}">${icon('clock')}<b>${ci.text}</b></div>` : ''}
          ${mine.lat != null ? `<div class="sunline"><span>${icon('sun')}${T('שקיעה היום במקום')}</span><b>${sunsetStr(today, mine)}</b></div>` : ''}
          ${eta ? `<div><span>${T('נסיעה משוערת')}</span><b>≈ ${fMin(eta)}</b></div>` : ''}
        </div>
        <div class="btnrow">
          <a class="btn" href="${wazeUrl(mine)}" target="_blank" rel="noopener">${icon('nav')}${T('ניווט')}</a>
          ${main ? `<a class="btn alt" href="${telHref(main)}">${icon('phone')}${T('חיוג')}</a>` : ''}
        </div>
        <button class="link center" data-act="open" data-id="${mine.id}">${T('כל הפרטים')}</button>
      </div>
      ${others.length ? `<h3 class="h3">${T('שמורים נוספים')}</h3>
      <div class="list">${others.map((m) => `<div class="favrow">${card(m, S.loc)}<button class="link" data-act="setmine" data-id="${m.id}">${T('הגדרה כמקווה שלי')}</button></div>`).join('')}</div>` : ''}
    </div>`;
  }

  /* ---------- האזור האישי: נתונים במכשיר בלבד, מוצפנים ונעולים בקוד אישי (js/vault.js) ---------- */
  const Vault = window.Vault;
  const P = { mode: null, msg: '', bad: false, busy: false };
  const pzReset = () => { P.mode = null; P.msg = ''; P.bad = false; P.busy = false; };
  const fWait = (ms) => (ms < 60000 ? `${Math.ceil(ms / 1000)} ${T('שניות')}` : fMin(Math.ceil(ms / 60000)));
  const pinField = (id, label, auto) => `<label class="field"><span class="lbl">${label}</span><input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="${auto}" dir="ltr"></label>`;
  const pzMsg = () => (P.msg ? `<div class="banner${P.bad ? ' bad' : ''}" role="alert">${icon(P.bad ? 'alert' : 'info')}<span>${esc(P.msg)}</span></div>` : '');
  const pzBtn = (act, label, cls = '') => `<button class="btn wide ${cls}" data-act="${act}" data-primary ${P.busy ? 'disabled' : ''}>${P.busy ? T('רגע…') : label}</button>`;
  function viewPersonal() {
    if (!Vault || !Vault.available()) return `<div class="pad pz"><div class="banner bad">${icon('alert')}<span>${T('הדפדפן או המכשיר הזה אינם מאפשרים אחסון מוצפן, ולכן האזור האישי אינו זמין כאן.')}</span></div></div>`;
    if (P.mode === 'wipe') return `<div class="pad pz">
      <div class="banner bad">${icon('alert')}<span><b>${T('מחיקת האזור האישי')}</b><br>${T('כל המידע שבאזור האישי יימחק מהמכשיר לצמיתות. אי אפשר לשחזר אותו.')}</span></div>
      <button class="btn wide danger" data-act="pzwipe">${T('מחיקה לצמיתות')}</button>
      <button class="btn ghost wide" data-act="pzmode" data-m="">${T('ביטול')}</button></div>`;
    if (!Vault.exists()) return `<div class="pad pz">
      <div class="notes pzprivacy"><b>${icon('lock')}${T('לפני שמתחילים: הפרטיות שלכם')}</b>
        <ul>
          <li><b>${T('הכול נשאר במכשיר הזה בלבד.')}</b> ${T('שום פרט מהאזור האישי אינו נשלח לשרת, לענן, למרכז או לכל גורם אחר.')}</li>
          <li><b>${T('המידע מוצפן ונפתח רק בקוד אישי.')}</b> ${T('הקוד עצמו אינו נשמר בשום מקום, וגם לנו אין גישה אליו או למידע.')}</li>
          <li><b>${T('אין שחזור קוד.')}</b> ${T('אם הקוד נשכח, אפשר רק למחוק את האזור האישי ולהתחיל מחדש.')}</li>
          <li><b>${T('אין גיבוי.')}</b> ${T('מחיקת האפליקציה או נתוני הדפדפן, או מעבר למכשיר אחר, מוחקים את המידע.')}</li>
          <li><b>${T('נעילה אוטומטית.')}</b> ${T('האזור ננעל ביציאה מהמסך או מהאפליקציה.')}</li>
        </ul>
        <small>${T('קוד קצר מגן בעיקר מפני מי שמחזיק את המכשיר לרגע. מומלץ לבחור 6 ספרות או יותר, וקוד שונה מקוד הנעילה של המכשיר.')}</small></div>
      <div class="form">
        ${pinField('pz-new', T('בחירת קוד אישי (4 עד 8 ספרות)'), 'new-password')}
        ${pinField('pz-new2', T('הקלדת הקוד שוב'), 'new-password')}
        ${pzMsg()}
        ${pzBtn('pzsetup', T('הבנתי — יצירת האזור האישי'))}
      </div></div>`;
    if (!Vault.isUnlocked()) return `<div class="pad pz">
      <div class="form">
        <p class="lead">${icon('lock')} ${T('האזור האישי נעול. המידע נשמר במכשיר הזה בלבד.')}</p>
        ${pinField('pz-pin', T('קוד אישי'), 'current-password')}
        ${pzMsg()}
        ${pzBtn('pzunlock', T('פתיחה'))}
      </div>
      <button class="link center" data-act="pzmode" data-m="wipe">${T('שכחתי את הקוד')}</button></div>`;
    if (P.mode === 'change') return `<div class="pad pz">
      <div class="form">
        ${pinField('pz-old', T('הקוד הנוכחי'), 'current-password')}
        ${pinField('pz-new', T('קוד חדש (4 עד 8 ספרות)'), 'new-password')}
        ${pinField('pz-new2', T('הקלדת הקוד החדש שוב'), 'new-password')}
        ${pzMsg()}
        ${pzBtn('pzchange', T('החלפת הקוד'))}
        <button class="btn ghost wide" data-act="pzmode" data-m="">${T('ביטול')}</button>
      </div></div>`;
    return `<div class="pad pz">
      ${pzMsg()}
      <div class="empty">${icon('lock')}<br>${T('האזור האישי פתוח. עדיין אין בו תוכן.')}</div>
      <h3 class="h3">${T('אבטחה ופרטיות')}</h3>
      <div class="notes">${T('המידע באזור האישי נשמר מוצפן במכשיר הזה בלבד ואינו נשלח לשום מקום. אין גיבוי ואין שחזור קוד.')}</div>
      <div class="menu">
        <button data-act="pzlock"><i>${icon('lock')}</i><span><b>${T('נעילה עכשיו')}</b><small>${T('האזור ננעל גם לבד ביציאה מהמסך')}</small></span></button>
        <button data-act="pzmode" data-m="change"><i>${icon('gear')}</i><span><b>${T('החלפת הקוד האישי')}</b></span>${icon('back', 'chev')}</button>
        <button data-act="pzmode" data-m="wipe"><i>${icon('alert')}</i><span><b>${T('מחיקת כל המידע האישי')}</b><small>${T('מחיקה מלאה מהמכשיר, בלי אפשרות שחזור')}</small></span>${icon('back', 'chev')}</button>
      </div></div>`;
  }
  /* פעולות הכספת אסינכרוניות (גזירת המפתח אורכת כשנייה); בזמן העבודה הכפתור מושבת */
  function pzRun(job) {
    if (P.busy) return;
    let run; try { run = Promise.resolve(job()); } catch (e) { run = Promise.reject(e); }   // הקוד נקרא מהשדות לפני שהמסך מצויר מחדש
    P.busy = true; P.msg = ''; P.bad = false; render(true);
    run.then((ok) => { P.busy = false; if (ok) { P.mode = null; P.msg = ok === true ? '' : ok; } }, (e) => {
      P.busy = false; P.bad = true;
      P.msg = e.code === 'wait' ? `${T('יותר מדי ניסיונות. אפשר לנסות שוב בעוד')} ${fWait(e.wait)}.`
        : e.code === 'wrong' ? (e.wait ? `${T('קוד שגוי. אפשר לנסות שוב בעוד')} ${fWait(e.wait)}.` : `${T('קוד שגוי. ניסיונות שנותרו לפני השהיה:')} ${e.triesLeft}`)
        : e.code === 'badpin' ? T('הקוד צריך להיות 4 עד 8 ספרות.')
        : e.code === 'mismatch' ? T('שני הקודים אינם זהים.')
        : e.code === 'storage' ? T('לא ניתן לשמור במכשיר (ייתכן שהאחסון מלא או חסום, למשל בגלישה פרטית).')
        : T('הפעולה נכשלה. נסו שוב.');
    }).then(() => { if (S.page === 'personal') { render(true); const i = $('.pz input'); if (i && P.bad) i.focus(); } });
  }
  const pzNewPin = () => { const a = $('#pz-new').value, b = $('#pz-new2').value; if (!Vault.validPin(a)) throw Object.assign(new Error(), { code: 'badpin' }); if (a !== b) throw Object.assign(new Error(), { code: 'mismatch' }); return a; };
  function pzLock() { if (Vault) Vault.lock(); pzReset(); }

  /* ---------- לשונית "עוד" ---------- */
  function viewMore() {
    const rows = [
      ['personal', 'האזור האישי', 'lock', T('במכשיר בלבד, נעול בקוד אישי')],
      ['times', 'זמני השקיעה', 'sun', S.loc ? T('היום') + ' ' + sunsetStr(today, S.loc) + ' · ' + esc(S.loc.label) : T('לפי המיקום שלך')],
      ['trip', 'תכנון נופש', 'bag', T('מקוואות ביעד ובדרך')],
      ['updates', 'עדכונים', 'bell', UPDATES.length ? UPDATES.length + ' ' + T('הודעות') : T('שינויי שעות וסגירות')],
      ['about', 'אודות והגדרות', 'gear', T('שפה, טקסט גדול, פרטיות')]
    ];
    return `<div class="pad">
      <h2 class="h2">${T('עוד')}</h2>
      <div class="menu">${rows.map(([k, l, ic, sub]) => `<button data-act="page" data-p="${k}">
        <i>${icon(ic)}${k === 'updates' ? '<em class="badge" hidden></em>' : ''}</i><span><b>${T(l)}</b><small>${sub}</small></span>${icon('back', 'chev')}</button>`).join('')}</div>
    </div>`;
  }

  /* ---------- ציור ---------- */
  /* ארבע לשוניות בסרגל התחתון; כל יעד ניווט מופיע במקום אחד בלבד */
  /*noT*/ const TABS = [['list', 'מקוואות', 'search'], ['favs', 'השמורים שלי', 'heart'], ['rabbis', 'שאלה לרב', 'chat'], ['more', 'עוד', 'dots']];
  const TABVIEWS = { list: viewList, favs: viewFavs, rabbis: viewRabbis, more: viewMore };
  /* דפים שנפתחים מתוך "עוד" (עם כפתור חזרה) */
  /*noT*/ const PAGES = { trip: [viewTrip, 'תכנון נופש'], times: [viewTimes, 'זמני השקיעה'], updates: [viewUpdates, 'עדכונים'], about: [viewAbout, 'אודות והגדרות'], personal: [viewPersonal, 'האזור האישי'], admin: [viewAdmin, 'אזור מנהלים'] };
  const unseen = () => UPDATES.length && UPDATES[0].date > S.seen;
  function shell() {
    $('#app').innerHTML = `
      <header class="top"><span class="brand" role="img" aria-label="${T('המרכז הארצי למען טהרת המשפחה')}">${window.LOGO.full}</span></header>
      <main id="view" class="view"></main>
      <nav class="tabs" aria-label="${T('ניווט ראשי')}">${TABS.map(([k, l, ic]) => `<button data-act="tab" data-tab="${k}" id="tab-${k}">${icon(ic)}${k === 'more' ? '<em class="badge" hidden></em>' : ''}<span>${T(l)}</span></button>`).join('')}</nav>
      <div id="overlay"></div><div id="sheet"></div><div id="toast" class="toast" role="status" hidden></div>`;
  }
  const screenKey = () => (S.page ? 'p-' + S.page : S.tab === 'list' ? 'list:' + S.mode : S.tab);
  function pageView() {
    const pg = PAGES[S.page];
    return `<div class="ptop"><button class="iconbtn" data-act="closepage" aria-label="${T('חזרה')}">${icon('back', 'flip')}</button><h2>${T(pg[1])}</h2></div>${pg[0]()}`;
  }
  function render() {
    const v = $('#view'), top = v.scrollTop, key = screenKey(), same = v.dataset.key === key;
    $('#app').classList.toggle('big', S.bigText);
    if (S.page !== 'personal' && Vault && (Vault.isUnlocked() || P.mode || P.msg)) pzLock();   // יציאה מהמסך נועלת
    v.innerHTML = S.page ? pageView() : TABVIEWS[S.tab]();
    v.dataset.key = key;
    if (!S.page && S.tab === 'list') renderList();
    const cur = S.page ? 'more' : S.tab;
    TABS.forEach(([k]) => { const b = $('#tab-' + k); b.classList.toggle('on', k === cur); b.setAttribute('aria-current', k === cur ? 'page' : 'false'); });
    document.querySelectorAll('.tabs .badge, .menu .badge').forEach((b) => { b.hidden = !unseen(); });
    setTimeout(hydrate, 0);
    v.scrollTop = same ? top : 0;
    const m = S.detail && byId(S.detail);
    const ov = $('#overlay'), dTop = ov.querySelector('.detail-body') ? ov.querySelector('.detail-body').scrollTop : 0, dSame = ov.dataset.id === (m ? m.id : '');
    ov.innerHTML = m ? viewDetail(m) : ''; ov.dataset.id = m ? m.id : '';
    if (m && dSame) { ov.querySelector('.detail').style.animation = 'none'; ov.querySelector('.detail-body').scrollTop = dTop; }
    const sh = { city: () => sheetCity(T('איפה אתם נמצאים?'), 'setloc'), tripcity: () => sheetCity(T('לאן נוסעים?'), 'settrip'), tripfrom: () => sheetCity(T('מאיפה יוצאים?'), 'settripfrom'),
      share: () => sheetShare(S.sheetData), report: () => sheetReport(S.sheetData), qr: () => sheetQr(S.sheetData) }[S.sheet];
    $('#sheet').innerHTML = sh ? sh() : '';
  }
  let toastT;
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }

  function nearestCity(p) { return CITIES.reduce((a, c) => (km(p, c) < km(p, a) ? c : a)); }
  /* silent: בקשה אוטומטית בפתיחת האפליקציה — בלי הודעות שגיאה; אם אין הרשאה נשארת בחירת עיר ידנית */
  function useGps(silent) {
    if (!navigator.geolocation) { if (!silent) toast(T('המכשיר לא מאפשר איתור מיקום. בחרו עיר מהרשימה.')); return; }
    if (!silent) toast(T('מאתר מיקום…'));
    try {
      navigator.geolocation.getCurrentPosition((pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }, prev = S.loc;
        S.loc = { ...p, label: (T('המיקום שלי · ליד') + ' ') + nearestCity(p).name, gps: true };
        store.set('loc', S.loc);
        const typing = document.activeElement && document.activeElement.id === 'q';
        if (!silent || (!typing && (!prev || km(prev, p) > 0.2))) { if (!silent) S.sheet = null; render(true); }
        if (!silent) toast(T('המיקום עודכן'));
      }, () => { if (!silent) toast(T('לא התקבל מיקום. בחרו עיר מהרשימה.')); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    } catch (e) { if (!silent) toast(T('לא התקבל מיקום. בחרו עיר מהרשימה.')); }
  }
  function mikvehText(m) {
    const h = hoursToday(m);
    return [m.full, m.place, h ? (h.label ? T(h.label) + ': ' : '') + h.value : '', m.phones[0] ? `${T('טלפון:')} ${m.phones[0]}` : '',
      `${T('ניווט:')} ${mapsUrl(m)}`, '', T('מתוך מאגר המקוואות של המרכז הארצי למען טהרת המשפחה')].filter((x, i) => x || i === 5).join('\n');
  }
  /* מצב המסך בכתובת (#t-favs, #p-times, #m01), כדי שכפתור החזרה של המכשיר וקישורי QR יעבדו.
     מעבר בין לשוניות מחליף את הכתובת; דף מתוך "עוד" ודף מקווה מוסיפים רשומה להיסטוריה */
  const screenHash = () => (S.page ? 'p-' + S.page : S.tab === 'list' ? '' : 't-' + S.tab);
  function applyHash(h) {
    if (byId(h)) { S.detail = h; return; }
    S.detail = null;
    if (h.indexOf('p-') === 0 && PAGES[h.slice(2)]) { S.page = h.slice(2); S.tab = 'more'; return; }
    S.page = null; S.tab = h.indexOf('t-') === 0 && TABVIEWS[h.slice(2)] ? h.slice(2) : 'list';
  }
  function setHash(h, replace) {
    try {
      if (replace) history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : ''));
      else if (location.hash !== '#' + h) location.hash = h;
    } catch (e) { /* */ }
  }
  let pushed = false;
  function goTab(k) {
    if (!TABVIEWS[k]) return;
    if (k === S.tab && !S.page && !S.detail) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.tab = k; S.page = null; S.detail = null; S.sheet = null; pushed = false; setHash(screenHash(), true); render();
  }
  function openPage(p) {
    if (!PAGES[p]) return;
    S.page = p; S.tab = 'more'; S.detail = null; S.sheet = null;
    if (p === 'updates' && UPDATES.length) { S.seen = UPDATES[0].date; store.set('seen', S.seen); }
    setHash('p-' + p); pushed = true; render();
  }
  function closePage() {
    if (pushed) { history.back(); return; }          // חזרה למסך שממנו נפתח הדף
    S.page = null; S.sheet = null; setHash(screenHash(), true); render();
  }
  function openDetail(id) { S.detail = id; S.sheet = null; setHash(id); render(); }
  function closeDetail() { S.detail = null; setHash(screenHash(), true); render(); }
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1), before = screenKey() + '|' + S.detail;
    applyHash(h); if (!S.page) pushed = false;
    if (screenKey() + '|' + S.detail !== before) { S.sheet = null; render(); }
  });

  /* ---------- אירועים ---------- */
  const saveTrip = () => store.set('trip', S.trip);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, d = b.dataset;
    if (a === 'tab') goTab(d.tab);
    else if (a === 'page') openPage(d.p);
    else if (a === 'closepage') closePage();
    else if (a === 'pzmode') { P.mode = d.m || null; P.msg = ''; P.bad = false; render(true); }
    else if (a === 'pzlock') { pzLock(); render(true); }
    else if (a === 'pzwipe') { Vault.wipe(); pzReset(); render(true); toast(T('האזור האישי נמחק מהמכשיר')); }
    else if (a === 'pzsetup') pzRun(() => { const pin = pzNewPin(); return Vault.create(pin, {}).then(() => true); });
    else if (a === 'pzunlock') { const pin = $('#pz-pin').value; pzRun(() => Vault.unlock(pin).then(() => true)); }
    else if (a === 'pzchange') { const old = $('#pz-old').value; pzRun(() => { const pin = pzNewPin(); return Vault.changePin(old, pin).then(() => T('הקוד הוחלף')); }); }
    else if (a === 'mode') { if (S.mode !== d.m) { S.mode = d.m; render(); } }
    else if (a === 'setmine') { S.mine = d.id; store.set('mine', S.mine); render(); toast(T('נקבע כמקווה שלי')); }
    else if (a === 'open') openDetail(d.id);
    else if (a === 'close') closeDetail();
    else if (a === 'fav') { const id = d.id; S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id); store.set('favs', [...S.favs]); render(true); toast(S.favs.has(id) ? T('נשמר ברשימת השמורים') : T('הוסר מהשמורים')); }
    else if (a === 'filter') { const k = d.k; S.filters.has(k) ? S.filters.delete(k) : S.filters.add(k); b.classList.toggle('on'); b.setAttribute('aria-pressed', S.filters.has(k)); S.limit = 30; renderList(); }
    else if (a === 'clear') { S.q = ''; S.filters.clear(); S.limit = 30; render(); }
    else if (a === 'more') { S.limit += 30; renderList(); }
    else if (a === 'mapall') { S.q = d.c; S.filters.clear(); S.limit = 30; S.mode = 'list'; render(); }
    else if (a === 'maptap') {
      const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * MAP.w, y = (e.clientY - r.top) / r.height * MAP.h;
      S.mapCity = CITIES.reduce((best, c) => (Math.hypot(mx(c.lng) - x, my(c.lat) - y) < Math.hypot(mx(best.lng) - x, my(best.lat) - y) ? c : best)).name; render(true);
    }
    else if (a === 'pickloc') { S.sheet = 'city'; render(true); }
    else if (a === 'tripcity' || a === 'tripfrom') { S.sheet = a; render(true); }
    else if (a === 'closesheet') { S.sheet = null; render(true); }
    else if (a === 'gps') useGps(false);
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
  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') {
      S.q = e.target.value; S.limit = 30;
      if (S.mode === 'map') { S.mode = 'list'; render(); const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } else renderList();
    }
    else if (e.target.id === 'cityq') $('#citylist').innerHTML = cityButtons(e.target.dataset.cact, e.target.value.trim()); });
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
    if (e.key === 'Enter' && e.target.matches('.pz input')) { e.preventDefault(); const b = $('.pz [data-primary]'); if (b) b.click(); }
    if (e.key !== 'Escape') return;
    if (S.sheet) { S.sheet = null; render(true); } else if (S.detail) closeDetail(); else if (S.page) closePage();
  });

  /* האפליקציה עוברת לרקע או נסגרת: האזור האישי ננעל */
  const pzAway = () => { if (Vault && Vault.isUnlocked()) { pzLock(); if (S.page === 'personal') render(true); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pzAway(); });
  window.addEventListener('pagehide', pzAway);

  shell();
  applyHash(location.hash.slice(1));
  render();
  /* מיקום אוטומטי בכניסה (אחרי אישור ההרשאה במכשיר): גם רענון שקט של מיקום GPS קודם. מיקום שנבחר ידנית נשמר כמו שהוא */
  if (!S.loc || S.loc.gps) useGps(true);
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
