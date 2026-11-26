const test = require('node:test');
const assert = require('node:assert/strict');
const { createVault, waitFor, KEY, FREE_TRIES } = require('../js/vault.js');

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, raw: m };
}
function make(storage = memStorage(), clock = { t: 1e12 }) {
  return { storage, clock, v: createVault({ storage, iterations: 1000, now: () => clock.t }) };
}
const code = (c) => (e) => e.code === c;

test('יצירה, נעילה ופתיחה בקוד הנכון מחזירות את הנתונים', async () => {
  const { v, storage } = make();
  assert.equal(v.exists(), false);
  await v.create('1234', { a: 1 });
  assert.equal(v.exists(), true); assert.equal(v.isUnlocked(), true);
  await v.save({ a: 2, note: 'פרטי' });
  v.lock();
  assert.equal(v.isUnlocked(), false);
  assert.throws(() => v.get(), code('locked'));
  const again = createVault({ storage, iterations: 1000 });
  await again.unlock('1234');
  assert.deepEqual(again.get(), { a: 2, note: 'פרטי' });
});

test('באחסון אין טקסט גלוי ואין הקוד עצמו', async () => {
  const { v, storage } = make();
  await v.create('827364', { secret: 'מילה-סודית-ייחודית' });
  const raw = storage.getItem(KEY);
  assert.ok(!raw.includes('מילה-סודית-ייחודית'));
  assert.ok(!raw.includes('secret'));
  assert.ok(!raw.includes('827364'));
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['ct', 'fails', 'iter', 'iv', 'salt', 'until', 'v']);
});

test('כל שמירה משתמשת ב־IV חדש', async () => {
  const { v, storage } = make();
  await v.create('1234', { a: 1 });
  const a = JSON.parse(storage.getItem(KEY));
  await v.save({ a: 1 });
  const b = JSON.parse(storage.getItem(KEY));
  assert.notEqual(a.iv, b.iv); assert.notEqual(a.ct, b.ct);
});

test('קוד לא תקין נדחה; אי אפשר ליצור כספת שנייה', async () => {
  const { v } = make();
  for (const p of ['', '123', 'abcd', '12a4', '123456789']) await assert.rejects(v.create(p), code('badpin'));
  await v.create('0000');
  await assert.rejects(v.create('1111'), code('exists'));
});

test('קוד שגוי: ספירת ניסיונות, השהיה מתארכת, ואיפוס אחרי הצלחה', async () => {
  const { v, clock } = make();
  await v.create('1234', { ok: true }); v.lock();
  for (let i = 1; i < FREE_TRIES; i++) {
    await assert.rejects(v.unlock('9999'), (e) => e.code === 'wrong' && e.triesLeft === FREE_TRIES - i && e.wait === 0);
  }
  await assert.rejects(v.unlock('9999'), (e) => e.code === 'wrong' && e.wait === 30000);
  /* בזמן ההשהיה גם הקוד הנכון לא נבדק */
  await assert.rejects(v.unlock('1234'), (e) => e.code === 'wait' && e.wait === 30000);
  clock.t += 30000;
  await assert.rejects(v.unlock('9999'), (e) => e.code === 'wrong' && e.wait === 60000);
  clock.t += 60000;
  await v.unlock('1234');
  assert.deepEqual(v.get(), { ok: true });
  v.lock();
  await assert.rejects(v.unlock('9999'), (e) => e.triesLeft === FREE_TRIES - 1);   // המונה התאפס
});

test('ההשהיה נשמרת גם אחרי פתיחה מחדש של האפליקציה', async () => {
  const { v, storage, clock } = make();
  await v.create('1234'); v.lock();
  for (let i = 0; i < FREE_TRIES; i++) await assert.rejects(v.unlock('0000'));
  const fresh = createVault({ storage, iterations: 1000, now: () => clock.t });
  assert.equal(fresh.waitLeft(), 30000);
  await assert.rejects(fresh.unlock('1234'), code('wait'));
});

test('waitFor: אפס עד הסף, הכפלה, ותקרה של שעה', () => {
  assert.equal(waitFor(0), 0); assert.equal(waitFor(FREE_TRIES - 1), 0);
  assert.equal(waitFor(FREE_TRIES), 30000); assert.equal(waitFor(FREE_TRIES + 2), 120000);
  assert.equal(waitFor(FREE_TRIES + 30), 3600000);
});

test('החלפת קוד: הישן מפסיק לעבוד, החדש פותח את אותם נתונים', async () => {
  const { v } = make();
  await v.create('1234', { keep: 'me' });
  await assert.rejects(v.changePin('1234', '12'), code('badpin'));
  await v.changePin('1234', '567890');
  assert.equal(v.isUnlocked(), true);
  v.lock();
  await assert.rejects(v.unlock('1234'), code('wrong'));
  await v.unlock('567890');
  assert.deepEqual(v.get(), { keep: 'me' });
});

test('החלפת קוד עם קוד נוכחי שגוי נכשלת ומשאירה את הכספת נעולה ושלמה', async () => {
  const { v } = make();
  await v.create('1234', { keep: 'me' });
  await assert.rejects(v.changePin('0000', '5678'), code('wrong'));
  assert.equal(v.isUnlocked(), false);
  await v.unlock('1234');
  assert.deepEqual(v.get(), { keep: 'me' });
});

test('מחיקה מסירה הכול מהמכשיר', async () => {
  const { v, storage } = make();
  await v.create('1234', { a: 1 });
  v.wipe();
  assert.equal(v.exists(), false); assert.equal(v.isUnlocked(), false);
  assert.equal(storage.raw.size, 0);
  await assert.rejects(v.unlock('1234'), code('missing'));
});

test('get מחזיר עותק: שינוי בו לא משנה את הנתונים השמורים', async () => {
  const { v } = make();
  await v.create('1234', { list: [1] });
  v.get().list.push(2);
  assert.deepEqual(v.get(), { list: [1] });
});

test('שמירה נכשלת בבירור כשהכספת נעולה או כשהאחסון לא זמין', async () => {
  const { v } = make();
  await v.create('1234'); v.lock();
  await assert.rejects(v.save({}), code('locked'));
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  await assert.rejects(createVault({ storage: broken, iterations: 1000 }).create('1234'), code('storage'));
});

test('נתונים פגומים באחסון לא נפתחים', async () => {
  const { v, storage } = make();
  await v.create('1234', { a: 1 }); v.lock();
  const rec = JSON.parse(storage.getItem(KEY));
  rec.ct = rec.ct.slice(0, -4) + (rec.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  storage.setItem(KEY, JSON.stringify(rec));
  await assert.rejects(v.unlock('1234'), code('wrong'));
});
