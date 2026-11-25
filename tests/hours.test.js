/* בדיקות לפענוח שעות הפתיחה. הרצה: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert');
const H = require('../js/hours.js');

// 25.11.2026 — חורף (UTC+2). 15:00 שעון ישראל = 13:00 UTC
const now = new Date(Date.UTC(2026, 10, 25, 13, 0));
const sunset = () => new Date(Date.UTC(2026, 10, 25, 14, 38));   // 16:38
const hm = (d) => d && H.ilParts(d).h + ':' + String(H.ilParts(d).min).padStart(2, '0');
const P = (v) => { const r = H.parse(v, now, sunset); return r && { open: hm(r.open), close: hm(r.close), closed: r.closed }; };

test('טווח מפורש', () => assert.deepStrictEqual(P('19:00-22:00'), { open: '19:00', close: '22:00', closed: undefined }));
test('מהשקיעה עד שעה', () => assert.deepStrictEqual(P('מהשקיעה עד 22:00.'), { open: '16:38', close: '22:00', closed: undefined }));
test('לפני השקיעה + משך', () => assert.deepStrictEqual(P('חצי שעה לפני שקיעה למשך שעה וחצי.'), { open: '16:08', close: '17:38', closed: undefined }));
test('דקות לפני השקיעה', () => assert.deepStrictEqual(P('מ- 10 דקות לפני השקיעה למשך שעה.'), { open: '16:28', close: '17:28', closed: undefined }));
test('שעה לפני השקיעה', () => assert.deepStrictEqual(P('שעה לפני השקיעה עד 22:00.'), { open: '15:38', close: '22:00', closed: undefined }));
test('משך במספר', () => assert.deepStrictEqual(P('מהשקיעה למשך 3 שעות.'), { open: '16:38', close: '19:38', closed: undefined }));
test('שעתיים', () => assert.deepStrictEqual(P('מהשקיעה למשך שעתיים.'), { open: '16:38', close: '18:38', closed: undefined }));
test('עונה: לוקח את החורף', () => assert.deepStrictEqual(P("45 דק' לאחר צאת שבת. בחורף עד 21:30, בקיץ עד 23:00."), { open: null, close: '21:30', closed: undefined }));
test('סגור', () => assert.deepStrictEqual(H.parse('סגור', now, sunset), { closed: true }));
test('בתיאום מראש — אין חישוב', () => assert.strictEqual(H.parse('בתיאום מראש', now, sunset), null));
test('הדלקת נרות — אין חישוב (אין זמן פתיחה ידוע)', () => assert.strictEqual(H.parse('מזמן הדלקת נרות של אותו שבוע למשך 4 שעות.', now, sunset), null));
test('צאת הכוכבים — רק סגירה', () => assert.deepStrictEqual(P('צאת הכוכבים עד 22:00.'), { open: null, close: '22:00', closed: undefined }));
test('זמן נסיעה משוער', () => { assert.strictEqual(H.driveMinutes(Infinity), null); assert.ok(H.driveMinutes(1) >= 3); assert.ok(H.driveMinutes(50) > H.driveMinutes(10)); });
