/* פענוח שעות הפתיחה (טקסט חופשי מאתר המרכז) לשעת פתיחה ושעת סגירה של היום — ללא תלות ברשת.
   מטפל רק בניסוחים חד־משמעיים: שעה מפורשת ("עד 22:00", "19:00-22:00"), פתיחה ביחס לשקיעה
   ("מהשקיעה", "חצי שעה לפני שקיעה") ומשך ("למשך שעתיים"). כל השאר מחזיר null — עדיף לא להציג מאשר להטעות. */
(function () {
  const TZ = 'Asia/Jerusalem';

  /** חלקי התאריך והשעה בישראל */
  function ilParts(d) {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZoneName: 'short' })
      .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, winter: /GMT\+2/.test(p.timeZoneName) };
  }
  /** Date של שעה (ש:ד) לפי שעון ישראל, באותו יום של ref */
  function ilTime(ref, h, min) {
    const p = ilParts(ref), off = p.winter ? 2 : 3;
    return new Date(Date.UTC(p.y, p.m - 1, p.d, h - off, min));
  }

  const NUM = { 'אחת': 1, 'שתיים': 2, 'שלוש': 3, 'ארבע': 4, 'חמש': 5 };
  /** משך בדקות מתוך "למשך ..." */
  function duration(s) {
    const m = s.match(/למשך\s+([^.,]*)/); if (!m) return null;
    const t = m[1].trim();
    let base = null;
    if (/^שעתיים/.test(t)) base = 120;
    else if (/^שעה/.test(t)) base = 60;
    else { const n = t.match(/^(\d+(?:\.\d+)?|אחת|שתיים|שלוש|ארבע|חמש)\s+שעות/); if (n) base = (NUM[n[1]] || parseFloat(n[1])) * 60; }
    if (base == null) return null;
    if (/^\S+(\s+\S+)?\s+וחצי/.test(t)) base += 30;
    else if (/^\S+(\s+\S+)?\s+ורבע/.test(t)) base += 15;
    return base;
  }
  /** פתיחה ביחס לשקיעה, בדקות (שלילי = לפני השקיעה) */
  function sunsetOffset(s) {
    if (/^(מ|מזמן\s+)?(ה)?שקיע/.test(s)) return 0;
    let m = s.match(/^(?:מ-?\s*)?(\d+)\s*דק(?:ות|')?\s+לפני\s+(?:ה)?שקיע/); if (m) return -m[1];
    if (/^(מ)?חצי שעה לפני\s+(ה)?שקיע/.test(s)) return -30;
    if (/^(מ)?רבע שעה לפני\s+(ה)?שקיע/.test(s)) return -15;
    if (/^(מ)?שעה לפני\s+(ה)?שקיע/.test(s)) return -60;
    return null;
  }
  /** אם הטקסט מפרט חורף וקיץ — רק הקטע של העונה הנוכחית */
  function seasonPart(s, winter) {
    if (!(/חורף/.test(s) && /קיץ/.test(s))) return s;
    const want = winter ? 'חורף' : 'קיץ', other = winter ? 'קיץ' : 'חורף';
    const i = s.indexOf(want), j = s.indexOf(other, i);
    return j > i ? s.slice(i, j) : s.slice(i);
  }

  /**
   * value: שורת השעות של היום (טקסט). now: Date. sunsetFn(date) → Date של השקיעה במקווה (או null).
   * מחזיר { closed: true } ליום סגור, { open, close } (Date או null), או null כשאין מה לחשב.
   */
  function parse(value, now, sunsetFn) {
    if (!value) return null;
    const s0 = String(value).trim();
    if (/^סגור/.test(s0)) return { closed: true };
    const s = seasonPart(s0, ilParts(now).winter);
    let open = null, close = null;
    const rng = s.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (rng) { open = ilTime(now, +rng[1], +rng[2]); close = ilTime(now, +rng[3], +rng[4]); }
    else {
      const off = sunsetOffset(s0.replace(/^[-–\s]+/, ''));
      if (off != null && sunsetFn) { const ss = sunsetFn(now); if (ss) open = new Date(+ss + off * 6e4); }
      const until = s.match(/עד\s+(?:השעה\s+)?(\d{1,2}):(\d{2})/);
      if (until) close = ilTime(now, +until[1], +until[2]);
      else if (open) { const dur = duration(s); if (dur != null) close = new Date(+open + dur * 6e4); }
    }
    if (close && open && close <= open) close = new Date(+close + 864e5);   // אחרי חצות
    return open || close ? { open, close } : null;
  }

  /** זמן נסיעה משוער בדקות לפי מרחק אווירי (ק"מ). הערכה גסה בלבד: מקדם דרך 1.3 ומהירות ממוצעת לפי אורך הנסיעה */
  function driveMinutes(km) {
    if (!isFinite(km)) return null;
    const road = km * 1.3, speed = road < 8 ? 30 : road < 40 ? 50 : 75;
    const min = road / speed * 60 + 3;
    return min < 20 ? Math.max(3, Math.round(min)) : Math.round(min / 5) * 5;   // דיוק מדומה לא עוזר: מעגלים ל־5 דקות
  }

  const api = { parse, driveMinutes, ilParts, ilTime };
  if (typeof window !== 'undefined') window.Hours = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
