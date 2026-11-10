// Проверка apps-script/Code.gs в Node с заглушками сервисов Google: заявки, антиспам, подписки, подпись VAPID (ES256).
// Запуск: node tests/apps-script.test.cjs
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const s8 = b => Array.from(b, x => (x > 127 ? x - 256 : x)), u8 = a => Buffer.from(a.map(x => x & 255));
const props = {}, cache = {}, fetched = [];
class Range { constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i] || []; o.push(Array.from({ length: this.nc }, (_, j) => row[this.c - 1 + j] ?? '')); } return o; }
  setValue(v) { this.sh.rows[this.r - 1][this.c - 1] = v; return this; }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (this.sh.rows[this.r - 1 + i] ||= [])[this.c - 1 + j] = x; })); return this; }
  setFontWeight() { return this; } setDataValidation() { return this; } setNumberFormat() { return this; } }
class Sheet { constructor(n) { this.name = n; this.rows = []; }
  appendRow(r) { this.rows.push(r.slice()); } getLastRow() { return this.rows.length; } deleteRow(i) { this.rows.splice(i - 1, 1); }
  getRange(r, c, nr, nc) { return typeof r === 'string' ? new Range(this, 1, 1) : new Range(this, r, c, nr, nc); } setFrozenRows() {} setColumnWidth() {} }
const book = { sheets: {}, getSheetByName(n) { return this.sheets[n] || null; }, insertSheet(n) { return (this.sheets[n] = new Sheet(n)); }, getId: () => 'SHEET1', getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET1' };
const ctx = {
  console, BigInt, Date, Math, JSON, Number, String, Array, isFinite, parseInt, Error,
  Logger: { log: m => (ctx.__log = m) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, MacAlgorithm: { HMAC_SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    newBlob: s => ({ getBytes: () => s8(Buffer.from(s, 'utf8')) }),
    computeDigest: (alg, b) => s8(crypto.createHash('sha256').update(u8(b)).digest()),
    computeHmacSignature: (alg, v, k) => s8(crypto.createHmac('sha256', u8(k)).update(u8(v)).digest()),
    base64EncodeWebSafe: b => u8(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    getUuid: () => crypto.randomUUID(), formatString: (f, a) => f.replace('%s', a),
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: { openById: () => book, getActiveSpreadsheet: () => book, create: () => book,
    newDataValidation: () => ({ requireValueInList() { return this; }, build() { return {}; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
  UrlFetchApp: { fetchAll: reqs => reqs.map(r => { fetched.push(r); return { getResponseCode: () => (r.url.includes('gone') ? 410 : 201), getContentText: () => '' }; }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);

let t0 = Date.now(); ctx.setup(); console.log('setup', Date.now() - t0, 'мс');
assert(props.VAPID_PUBLIC && props.VAPID_PRIVATE && props.MANAGER_KEY, 'ключи созданы');
const pub = Buffer.from(props.VAPID_PUBLIC, 'base64url'); assert.strictEqual(pub.length, 65); assert.strictEqual(pub[0], 4);
t0 = Date.now(); assert(ctx.selfTest(), 'selfTest'); console.log('selfTest', Date.now() - t0, 'мс');
const KEY = props.MANAGER_KEY;
const jwk = { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') };
const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
// сравнение с эталоном Node: подпись нашей реализации проверяется OpenSSL
for (let i = 0; i < 5; i++) {
  const m = 'msg' + i + Math.random(), sig = ctx.sign_(Array.from(Buffer.from(m)), BigInt('0x' + props.VAPID_PRIVATE));
  const raw = Buffer.concat([Buffer.from(sig[0].toString(16).padStart(64, '0'), 'hex'), Buffer.from(sig[1].toString(16).padStart(64, '0'), 'hex')]);
  assert(crypto.verify('sha256', Buffer.from(m), { key: pubKey, dsaEncoding: 'ieee-p1363' }, raw), 'OpenSSL принимает подпись');
}
const req = { name: 'Иван Петров', phone: '8 (925) 111-22-33', company: 'ООО Ромашка', comment: '=HYPERLINK("x")', mode: 'cash', elapsed: 9000,
  items: [{ art: 'VHP612038', name: 'Айссноу', format: '60×120', packs: 10, m2: 14.4, cash: 1390, noncash: 1560, sum: 20016 }, { art: 'VHF600007', name: 'Тест', packs: 2, m2: 2.88, sum: null }],
  totals: { cash: 20016, noncash: 22464, chosen: 20016, packs: 12, m2: 17.28, ask: 1 }, page: 'https://unus777.github.io/almaly-dealers-prototype/' };
// без подписок
let r = post({ action: 'create', request: req }); assert(r.ok && r.no === 'Д2-1001', JSON.stringify(r));
const rows = book.sheets['Заявки'].rows; assert.strictEqual(rows.length, 2); assert.strictEqual(rows[1][4], '+79251112233'); assert.strictEqual(rows[1][14][0], "'", 'защита от формул');
// подписка: без ключа нельзя, с ключом можно
assert(!post({ action: 'subscribe', key: 'bad', endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }).ok);
assert(!post({ action: 'subscribe', key: KEY, endpoint: 'https://evil.example.com/x' }).ok, 'только службы push');
assert(post({ action: 'subscribe', key: KEY, endpoint: 'https://fcm.googleapis.com/fcm/send/abc', device: 'Android' }).ok);
assert(post({ action: 'subscribe', key: KEY, endpoint: 'https://web.push.apple.com/gone-device' }).ok);
r = post({ action: 'create', request: { ...req, phone: '+7 999 000-11-22' } }); assert(r.ok && r.no === 'Д2-1002');
assert.strictEqual(fetched.length, 2, 'push на 2 устройства');
const f = fetched[0], m = /^vapid t=([^,]+), k=(.+)$/.exec(f.headers.Authorization); assert(m, 'заголовок vapid');
assert.strictEqual(m[2], props.VAPID_PUBLIC); assert.strictEqual(f.headers.TTL, '86400');
const [h, p, s] = m[1].split('.'), claims = JSON.parse(Buffer.from(p, 'base64url'));
assert.strictEqual(claims.aud, 'https://fcm.googleapis.com'); assert(claims.exp - Date.now() / 1000 < 24 * 3600 && claims.exp > Date.now() / 1000);
assert(crypto.verify('sha256', Buffer.from(h + '.' + p), { key: pubKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'JWT подписан верно');
assert.strictEqual(JSON.parse(Buffer.from(fetched[1].headers.Authorization.match(/t=([^.]+\.[^.]+)/)[1].split('.')[1], 'base64url')).aud, 'https://web.push.apple.com');
assert.strictEqual(book.sheets['Подписки'].rows.length, 2, 'отписанное устройство (410) удалено');
// notice / list / status
const n = post({ action: 'notice', key: KEY }); assert(n.ok && n.notices[0].title === 'Новая заявка Д2-1002' && /Иван Петров · \+79990001122 · 20 016 ₽ нал \+ по запросу/.test(n.notices[0].body), JSON.stringify(n));
const L = post({ action: 'list', key: KEY }); assert(L.ok && L.items.length === 2 && L.items[0].no === 'Д2-1002' && L.items[0].items.length === 2);
assert(post({ action: 'status', key: KEY, no: 'Д2-1001', status: 'В работе' }).ok); assert.strictEqual(rows[1][2], 'В работе');
assert(!post({ action: 'status', key: KEY, no: 'Д2-1001', status: 'abc' }).ok);
assert(!post({ action: 'list', key: '' }).ok, 'список без ключа закрыт');
// антиспам и проверки
const before = rows.length;
assert(post({ action: 'create', request: { ...req, hp: 'http://spam' } }).ok); assert(post({ action: 'create', request: { ...req, elapsed: 300 } }).ok);
assert.strictEqual(rows.length, before, 'honeypot и слишком быстрая отправка не пишутся');
assert(!post({ action: 'create', request: { ...req, phone: '123' } }).ok); assert(!post({ action: 'create', request: { ...req, items: [] } }).ok);
for (let i = 0; i < 4; i++) post({ action: 'create', request: { ...req, phone: '+7 900 555-55-55' } });
assert(!post({ action: 'create', request: { ...req, phone: '+7 900 555-55-55' } }).ok, 'лимит заявок с одного номера');
assert(JSON.parse(ctx.doGet({}).text).vapid === props.VAPID_PUBLIC);
console.log('apps-script: все проверки пройдены ✓');
