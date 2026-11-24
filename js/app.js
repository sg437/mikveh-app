(function () {
  'use strict';
  const { MIKVAOT, RABBIS, CITIES, demo } = window.DATA;
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
  const fmtKm = (d) => (d < 1 ? Math.round(d * 1000) + ' מ׳' : d < 10 ? d.toFixed(1) + ' ק״מ' : Math.round(d) + ' ק״מ');
  const TZ = 'Asia/Jerusalem';
  const fTime = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const fDay = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
  let fHeb; try { fHeb = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long' }); } catch (e) { fHeb = null; }
  const sunsetStr = (date, p) => { const s = window.Sun.sunset(date, p.lat, p.lng); return s ? fTime.format(s) : '—'; };
  const telHref = (n) => 'tel:' + n.replace(/[^\d+]/g, '');
  const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

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
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

  /* ---------- מצב ---------- */
  const today = new Date();
  const S = {
    tab: 'list',
    q: '',
    filters: new Set(),
    favs: new Set(store.get('favs', [])),
    loc: store.get('loc', null),            // { lat, lng, label, gps }
    detail: null,
    sheet: null,                            // 'city' | 'tripcity'
    trip: store.get('trip', { city: 'צפת', radius: 25, from: isoDate(today), to: isoDate(new Date(+today + 3 * 864e5)) })
  };
  const FILTERS = [
    ['active', 'פעיל כעת', (m) => m.status === 'active'],
    ['chabad', 'בור חב״ד', (m) => m.chabad],
    ['chazon', 'לשיטת חזו״א', (m) => m.chazonIsh],
    ['filter', 'עם פילטר', (m) => m.filter],
    ['booking', 'הזמנת תור', (m) => m.booking && m.booking.type !== 'none'],
    ['fav', 'שמורים', (m) => S.favs.has(m.id)]
  ];

  /* ---------- רכיבים ---------- */
  const statusPill = (m) => m.status === 'active'
    ? '<span class="pill ok"><i></i>פעיל</span>'
    : '<span class="pill warn"><i></i>בשיפוץ</span>';
  const tags = (m) => [m.chabad && 'בור חב״ד', m.chazonIsh && 'חזו״א', m.filter && 'פילטר'].filter(Boolean)
    .map((t) => `<span class="tag">${t}</span>`).join('');

  function card(m, origin) {
    const d = origin ? fmtKm(km(origin, m)) : '';
    return `<button class="card" data-act="open" data-id="${m.id}">
      <span class="card-main">
        <span class="card-name">${esc(m.name)}</span>
        <span class="card-sub">${esc(m.city)} · ${esc(m.address)}</span>
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
    $('#count').textContent = items.length === MIKVAOT.length ? `${items.length} מקוואות בפיקוח` : `${items.length} מתוך ${MIKVAOT.length} מקוואות`;
    $('#sortnote').textContent = S.loc ? 'מהקרוב לרחוק' : 'לפי עיר';
    el.innerHTML = items.length ? items.map((m) => card(m, S.loc)).join('')
      : `<div class="empty">לא נמצאו מקוואות מתאימים.<br><button class="link" data-act="clear">ניקוי החיפוש והסינון</button></div>`;
  }

  const locBar = () => `<button class="locbar" data-act="pickloc">
      ${icon('pin')}<span class="locbar-txt">${S.loc ? `<b>${esc(S.loc.label)}</b>` : '<b>בחירת מיקום</b><small>כדי לראות את המקוואות הקרובים</small>'}</span>
      <span class="locbar-change">${S.loc ? 'שינוי' : 'בחירה'}</span></button>`;

  function viewList() {
    return `<div class="pad">
      ${locBar()}
      <label class="search">${icon('search')}<input id="q" type="search" inputmode="search" autocomplete="off" placeholder="חיפוש לפי שם, עיר או רחוב" value="${esc(S.q)}"></label>
      <div class="chips" role="group" aria-label="סינון">${FILTERS.map(([k, l]) => `<button class="chip${S.filters.has(k) ? ' on' : ''}" data-act="filter" data-k="${k}" aria-pressed="${S.filters.has(k)}">${l}</button>`).join('')}</div>
      <div class="listhead"><span id="count"></span><span id="sortnote"></span></div>
      <div id="list" class="list"></div>
      ${demo ? '<p class="demo">הנתונים המוצגים הם נתוני הדגמה בלבד.</p>' : ''}
    </div>`;
  }

  function viewTrip() {
    const t = S.trip, c = CITIES.find((x) => x.name === t.city) || CITIES[0];
    const near = MIKVAOT.map((m) => ({ m, d: km(c, m) })).filter((x) => x.d <= t.radius).sort((a, b) => a.d - b.d);
    const from = parseDate(t.from), to = parseDate(t.to);
    const days = [];
    for (let d = new Date(from), n = 0; d <= to && n < 14; d = new Date(+d + 864e5), n++) days.push(new Date(d));
    return `<div class="pad">
      <h2 class="h2">תכנון נופש</h2>
      <p class="lead">בוחרים יעד ותאריכים, ורואים מראש אילו מקוואות בפיקוח נמצאים באזור.</p>
      <div class="form">
        <div class="field"><span class="lbl">יעד</span>
          <button class="select" data-act="tripcity">${icon('pin')}<span>${esc(c.name)}</span>${icon('back', 'chev down')}</button></div>
        <div class="field"><span class="lbl">מרחק נסיעה מרבי</span>
          <div class="seg">${[10, 25, 50].map((r) => `<button class="${t.radius === r ? 'on' : ''}" data-act="radius" data-r="${r}">עד ${r} ק״מ</button>`).join('')}</div></div>
        <div class="row2">
          <label class="field"><span class="lbl">מתאריך</span><input id="tfrom" type="date" value="${esc(t.from)}"></label>
          <label class="field"><span class="lbl">עד תאריך</span><input id="tto" type="date" value="${esc(t.to)}" min="${esc(t.from)}"></label>
        </div>
      </div>
      <div class="listhead"><span>${near.length ? `${near.length} מקוואות באזור ${esc(c.name)}` : 'אין מקווה בפיקוח בטווח שנבחר'}</span></div>
      <div class="list">${near.map((x) => card(x.m, c)).join('') || `<div class="empty">נסו להגדיל את המרחק, או פנו לרבנים לקבלת הכוונה.<br><button class="link" data-act="tab" data-tab="rabbis">יצירת קשר עם הרבנים</button></div>`}</div>
      ${days.length ? `<h3 class="h3">שקיעה ב${esc(c.name)} בימי הנופש</h3>
      <div class="times">${days.map((d) => `<div class="trow"><span>${fDay.format(d)}</span><b>${sunsetStr(d, c)}</b></div>`).join('')}</div>` : ''}
    </div>`;
  }

  function viewTimes() {
    if (!S.loc) return `<div class="pad"><h2 class="h2">זמני השקיעה</h2>${locBar()}<div class="empty">בחרו מיקום כדי לראות את זמן השקיעה המדויק למקום שבו אתם נמצאים.</div></div>`;
    const days = Array.from({ length: 7 }, (_, i) => new Date(+today + i * 864e5));
    return `<div class="pad">
      <h2 class="h2">זמני השקיעה</h2>
      ${locBar()}
      <div class="sunhero">
        <span class="sunhero-lbl">${icon('sun')} שקיעה היום</span>
        <span class="sunhero-time">${sunsetStr(today, S.loc)}</span>
        <span class="sunhero-date">${fDay.format(today)}${fHeb ? ' · ' + fHeb.format(today) : ''}</span>
      </div>
      <h3 class="h3">השבוע הקרוב</h3>
      <div class="times">${days.map((d, i) => `<div class="trow"><span>${i === 0 ? 'היום' : fDay.format(d)}${fHeb ? `<small>${fHeb.format(d)}</small>` : ''}</span><b>${sunsetStr(d, S.loc)}</b></div>`).join('')}</div>
      <p class="note">שקיעה מישורית בגובה פני הים, מחושבת לפי המיקום שנבחר. ייתכן הפרש של דקות אחדות מלוח הזמנים המקומי. למעשה יש לנהוג לפי הוראת הרבנים.</p>
    </div>`;
  }

  function viewRabbis() {
    return `<div class="pad">
      <h2 class="h2">רבני טהרת המשפחה</h2>
      <p class="lead">מענה לשאלות בטלפון או בוואטסאפ. הפנייה דיסקרטית.</p>
      <div class="list">${RABBIS.map((r) => `<div class="rabbi">
        <div class="rabbi-name">${esc(r.name)}</div>
        <div class="rabbi-sub">${esc(r.role)} · ${esc(r.hours)}</div>
        ${r.phone ? `<div class="numrow"><span class="num" dir="ltr">${esc(r.phone)}</span><button class="iconbtn" data-act="copy" data-v="${esc(r.phone)}" aria-label="העתקת המספר">${icon('copy')}</button></div>` : ''}
        <div class="btnrow">
          ${r.phone ? `<a class="btn" href="${telHref(r.phone)}">${icon('phone')}חיוג</a>` : ''}
          ${r.whatsapp ? `<a class="btn wa" href="https://wa.me/${esc(r.whatsapp)}" target="_blank" rel="noopener">${icon('chat')}וואטסאפ</a>` : ''}
        </div></div>`).join('')}</div>
      ${demo ? '<p class="demo">שמות ומספרים להדגמה בלבד.</p>' : ''}
    </div>`;
  }

  function viewDetail(m) {
    const fav = S.favs.has(m.id);
    const main = (m.phones[0] || {}).number;
    const yes = (v) => (v ? `<b class="yes">${icon('check')}יש</b>` : '<b class="no">אין</b>');
    const book = m.booking || { type: 'none' };
    return `<div class="detail" role="dialog" aria-label="${esc(m.name)}">
      <div class="detail-top">
        <button class="iconbtn" data-act="close" aria-label="חזרה">${icon('back', 'flip')}</button>
        <span class="detail-top-title">פרטי המקווה</span>
        <button class="iconbtn${fav ? ' fav-on' : ''}" data-act="fav" data-id="${m.id}" aria-label="${fav ? 'הסרה מהשמורים' : 'שמירה'}" aria-pressed="${fav}">${icon('heart')}</button>
      </div>
      <div class="detail-body">
        <div class="gallery">${(m.photos.length ? m.photos.map((p) => `<img src="${esc(p)}" alt="${esc(m.name)}">`) : ['', '', '']
          .map((_, i) => `<div class="ph ph${i}"><span>${i === 0 ? 'תמונות המקווה יתווספו כאן' : ''}</span></div>`)).join('')}</div>
        <div class="pad">
          <h2 class="detail-name">${esc(m.name)}</h2>
          <div class="detail-addr">${esc(m.address)}, ${esc(m.city)}${S.loc ? ` · ${fmtKm(km(S.loc, m))} ממך` : ''}</div>
          <div class="card-tags">${statusPill(m)}${m.statusNote ? `<span class="statusnote">${esc(m.statusNote)}</span>` : ''}</div>

          <div class="actions">
            <a class="act primary" href="https://waze.com/ul?ll=${m.lat},${m.lng}&navigate=yes" target="_blank" rel="noopener">${icon('nav')}<span>Waze</span></a>
            <a class="act" href="https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}" target="_blank" rel="noopener">${icon('pin')}<span>מפות Google</span></a>
            ${main ? `<a class="act" href="${telHref(main)}">${icon('phone')}<span>חיוג</span></a>` : ''}
          </div>

          ${book.type === 'link' ? `<a class="btn wide" href="${esc(book.value)}" target="_blank" rel="noopener">${icon('cal')}הזמנת תור באתר</a>`
            : book.type === 'phone' ? `<a class="btn wide" href="${telHref(book.value)}">${icon('cal')}הזמנת תור בטלפון <span dir="ltr">${esc(book.value)}</span></a>`
            : m.status === 'active' ? '<div class="infobox">אין צורך בהזמנת תור.</div>' : ''}

          <h3 class="h3">פרטי המקווה</h3>
          <div class="spec">
            <div><span>בור חב״ד (בור על גבי בור)</span>${yes(m.chabad)}</div>
            <div><span>לשיטת החזון איש</span>${yes(m.chazonIsh)}</div>
            <div><span>פילטר (מערכת סינון)</span>${yes(m.filter)}</div>
          </div>

          <h3 class="h3">שעות פתיחה</h3>
          <div class="spec">${m.hours.map((h) => `<div><span>${esc(h.label)}</span><b>${esc(h.value)}</b></div>`).join('')}
            <div class="sunline"><span>${icon('sun')}שקיעה היום במקום</span><b>${sunsetStr(today, m)}</b></div></div>

          <h3 class="h3">טלפונים</h3>
          <div class="spec">${m.phones.map((p) => `<div><span>${esc(p.label)}</span><span class="numrow"><a class="num" dir="ltr" href="${telHref(p.number)}">${esc(p.number)}</a><button class="iconbtn sm" data-act="copy" data-v="${esc(p.number)}" aria-label="העתקת המספר">${icon('copy')}</button></span></div>`).join('')}</div>

          ${m.notes ? `<h3 class="h3">טוב לדעת</h3><p class="notes">${esc(m.notes)}</p>` : ''}
          <button class="btn ghost wide" data-act="tab" data-tab="rabbis">${icon('chat')}שאלה לרבני טהרת המשפחה</button>
        </div>
      </div>
    </div>`;
  }

  function sheetCity(title, act) {
    return `<div class="scrim" data-act="closesheet"></div>
    <div class="sheet" role="dialog" aria-label="${title}">
      <div class="sheet-head"><b>${title}</b><button class="iconbtn" data-act="closesheet" aria-label="סגירה">${icon('x')}</button></div>
      ${act === 'setloc' ? `<button class="gps" data-act="gps">${icon('target')}<span><b>המיקום הנוכחי שלי</b><small>לפי ה־GPS של המכשיר</small></span></button>` : ''}
      <div class="citygrid">${CITIES.map((c) => `<button data-act="${act}" data-c="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>
    </div>`;
  }

  /* ---------- ציור ---------- */
  const TABS = [['list', 'מקוואות', 'list'], ['trip', 'נופש', 'bag'], ['times', 'שקיעה', 'sun'], ['rabbis', 'רבנים', 'chat']];
  function shell() {
    $('#app').innerHTML = `
      <header class="top"><div class="brand"><span class="logo">${icon('list')}</span><span><b>מאגר המקוואות</b><small>מקוואות בפיקוח טהרת המשפחה</small></span></div></header>
      <main id="view" class="view"></main>
      <nav class="tabs" aria-label="ניווט ראשי">${TABS.map(([k, l, ic]) => `<button data-act="tab" data-tab="${k}" id="tab-${k}">${icon(ic)}<span>${l}</span></button>`).join('')}</nav>
      <div id="overlay"></div><div id="sheet"></div><div id="toast" class="toast" role="status" hidden></div>`;
  }
  function render(keepScroll) {
    const v = $('#view'), top = v.scrollTop;
    v.innerHTML = { list: viewList, trip: viewTrip, times: viewTimes, rabbis: viewRabbis }[S.tab]();
    TABS.forEach(([k]) => { const b = $('#tab-' + k); b.classList.toggle('on', k === S.tab); b.setAttribute('aria-current', k === S.tab ? 'page' : 'false'); });
    if (S.tab === 'list') renderList();
    v.scrollTop = keepScroll ? top : 0;
    const m = S.detail && MIKVAOT.find((x) => x.id === S.detail);
    $('#overlay').innerHTML = m ? viewDetail(m) : '';
    $('#sheet').innerHTML = S.sheet === 'city' ? sheetCity('איפה אתם נמצאים?', 'setloc') : S.sheet === 'tripcity' ? sheetCity('לאן נוסעים?', 'settrip') : '';
  }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

  function nearestCity(p) { return CITIES.reduce((a, c) => (km(p, c) < km(p, a) ? c : a)); }
  function useGps() {
    if (!navigator.geolocation) return toast('המכשיר לא מאפשר איתור מיקום. בחרו עיר מהרשימה.');
    toast('מאתר מיקום…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      S.loc = { ...p, label: 'המיקום שלי · ליד ' + nearestCity(p).name, gps: true };
      store.set('loc', S.loc); S.sheet = null; render(); toast('המיקום עודכן');
    }, () => toast('לא התקבל מיקום. בחרו עיר מהרשימה.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  /* ---------- אירועים ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'tab') { S.tab = b.dataset.tab; S.detail = null; S.sheet = null; render(); }
    else if (a === 'open') { S.detail = b.dataset.id; render(true); }
    else if (a === 'close') { S.detail = null; render(true); }
    else if (a === 'fav') { const id = b.dataset.id; S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id); store.set('favs', [...S.favs]); render(true); toast(S.favs.has(id) ? 'נשמר ברשימה שלך' : 'הוסר מהשמורים'); }
    else if (a === 'filter') { const k = b.dataset.k; S.filters.has(k) ? S.filters.delete(k) : S.filters.add(k); b.classList.toggle('on'); b.setAttribute('aria-pressed', S.filters.has(k)); renderList(); }
    else if (a === 'clear') { S.q = ''; S.filters.clear(); render(); }
    else if (a === 'pickloc') { S.sheet = 'city'; render(true); }
    else if (a === 'tripcity') { S.sheet = 'tripcity'; render(true); }
    else if (a === 'closesheet') { S.sheet = null; render(true); }
    else if (a === 'gps') useGps();
    else if (a === 'setloc') { const c = CITIES.find((x) => x.name === b.dataset.c); S.loc = { lat: c.lat, lng: c.lng, label: c.name }; store.set('loc', S.loc); S.sheet = null; render(true); }
    else if (a === 'settrip') { S.trip.city = b.dataset.c; store.set('trip', S.trip); S.sheet = null; render(true); }
    else if (a === 'radius') { S.trip.radius = +b.dataset.r; store.set('trip', S.trip); render(true); }
    else if (a === 'copy') {
      const v = b.dataset.v;
      Promise.resolve().then(() => navigator.clipboard.writeText(v)).then(() => toast('המספר הועתק'), () => toast(v));
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') { S.q = e.target.value; renderList(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'tfrom' || e.target.id === 'tto') {
      if (!e.target.value) return;
      S.trip[e.target.id === 'tfrom' ? 'from' : 'to'] = e.target.value;
      if (S.trip.to < S.trip.from) S.trip.to = S.trip.from;
      store.set('trip', S.trip); render(true);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (S.sheet) { S.sheet = null; render(true); } else if (S.detail) { S.detail = null; render(true); }
  });

  shell(); render();
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
