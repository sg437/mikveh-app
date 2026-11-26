/* כספת האזור האישי: נתונים אישיים נשמרים במכשיר בלבד, מוצפנים בקוד אישי (PIN).
   אין שרת, אין ענן ואין שחזור קוד. המפתח נגזר מהקוד (PBKDF2) וקיים בזיכרון רק כשהכספת פתוחה;
   ב־localStorage נשמר רק טקסט מוצפן (AES-GCM). הקוד עצמו אינו נשמר בשום מקום. */
(function () {
  'use strict';
  const KEY = 'mk.vault';
  const ITER = 600000;                    // PBKDF2-SHA256
  const FREE_TRIES = 5;                   // ניסיונות שגויים לפני השהיה
  const BASE_WAIT = 30000, MAX_WAIT = 3600000;
  const PIN_RE = /^\d{4,8}$/;

  const b64 = (buf) => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
  const unb64 = (s) => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const err = (code, extra) => Object.assign(new Error(code), { code }, extra);
  /* משך ההשהיה אחרי מספר ניסיונות שגויים רצופים */
  const waitFor = (fails) => (fails < FREE_TRIES ? 0 : Math.min(MAX_WAIT, BASE_WAIT * 2 ** (fails - FREE_TRIES)));

  function createVault(opt = {}) {
    const storage = opt.storage, cr = opt.crypto || globalThis.crypto, now = opt.now || (() => Date.now()), iter = opt.iterations || ITER;
    let key = null, data = null;

    const read = () => { try { const v = storage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
    const write = (rec) => {
      try { storage.setItem(KEY, JSON.stringify(rec)); } catch (e) { throw err('storage'); }
      if (storage.getItem(KEY) == null) throw err('storage');
    };
    async function derive(pin, salt, n) {
      const base = await cr.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
      return cr.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: n }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    async function seal(k, value) {
      const iv = cr.getRandomValues(new Uint8Array(12));           // IV חדש בכל שמירה
      const ct = await cr.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(value)));
      return { iv: b64(iv), ct: b64(ct) };
    }
    const clone = (v) => JSON.parse(JSON.stringify(v));

    const api = {
      available: () => !!(storage && cr && cr.subtle),
      exists: () => !!read(),
      isUnlocked: () => !!key,
      validPin: (pin) => PIN_RE.test(String(pin)),
      /* כמה זמן (מ"ש) נותר עד שמותר לנסות שוב קוד */
      waitLeft() { const r = read(); return r && r.until ? Math.max(0, r.until - now()) : 0; },
      async create(pin, initial = {}) {
        if (read()) throw err('exists');
        if (!api.validPin(pin)) throw err('badpin');
        const salt = cr.getRandomValues(new Uint8Array(16)), k = await derive(String(pin), salt, iter);
        write(Object.assign({ v: 1, salt: b64(salt), iter, fails: 0, until: 0 }, await seal(k, initial)));
        key = k; data = clone(initial);
      },
      async unlock(pin) {
        const rec = read();
        if (!rec) throw err('missing');
        const left = api.waitLeft();
        if (left > 0) throw err('wait', { wait: left });
        let value;
        try {
          const k = await derive(String(pin), unb64(rec.salt), rec.iter);
          const plain = await cr.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, k, unb64(rec.ct));
          value = JSON.parse(new TextDecoder().decode(plain)); key = k;
        } catch (e) {
          rec.fails = (rec.fails || 0) + 1;
          const w = waitFor(rec.fails); rec.until = w ? now() + w : 0;
          write(rec);
          throw err('wrong', { wait: w, triesLeft: Math.max(0, FREE_TRIES - rec.fails) });
        }
        if (rec.fails || rec.until) { rec.fails = 0; rec.until = 0; write(rec); }
        data = value;
      },
      lock() { key = null; data = null; },
      get() { if (!key) throw err('locked'); return clone(data); },
      async save(value) {
        if (!key) throw err('locked');
        const rec = read(); if (!rec) throw err('missing');
        write(Object.assign(rec, await seal(key, value)));
        data = clone(value);
      },
      async changePin(oldPin, newPin) {
        if (!api.validPin(newPin)) throw err('badpin');
        api.lock(); await api.unlock(oldPin);
        const value = data, salt = cr.getRandomValues(new Uint8Array(16)), k = await derive(String(newPin), salt, iter);
        write(Object.assign({ v: 1, salt: b64(salt), iter, fails: 0, until: 0 }, await seal(k, value)));
        key = k;
      },
      /* מחיקה מלאה ובלתי הפיכה של כל הנתונים האישיים מהמכשיר */
      wipe() { api.lock(); try { storage.removeItem(KEY); } catch (e) { /* */ } }
    };
    return api;
  }

  const out = { createVault, waitFor, KEY, FREE_TRIES };
  if (typeof window !== 'undefined') {
    let ls = null; try { ls = window.localStorage; } catch (e) { /* אין אחסון */ }
    window.Vault = Object.assign(createVault({ storage: ls }), out);
  }
  if (typeof module !== 'undefined') module.exports = out;
})();
