/**
 * Заявки второго дилерского сайта Алмалы Керамик → Google-таблица + push-уведомления менеджеру.
 *
 * Сайт (index.html) шлёт POST {action:'create', request:{…}} — без ключа, как обычная форма.
 * Страница менеджера (manager.html) работает с ключом менеджера: список заявок, статусы, подписка на push.
 *
 * Push без содержимого (как в калькуляторе ozon-unit-calc): скрипт только «будит» телефон менеджера,
 * а service worker сам забирает текст уведомления по action:'notice'. Поэтому шифрование не нужно,
 * а подпись VAPID (ES256, P-256) считается прямо здесь на BigInt. Ключи создаёт setup() и хранит
 * в «Свойствах скрипта» — в репозиторий сайта они не попадают.
 *
 * Установка — см. SETUP.md, шаг 1. Коротко: вставить файл → запустить setup() → «Развернуть» → веб-приложение
 * (Выполнять от: меня, Доступ: все) → адрес …/exec вставить в config.js сайта (REQUESTS_URL).
 */

var SHEET_NAME = 'Заявки дилерский сайт 2';
var TAB_REQ = 'Заявки', TAB_SUBS = 'Подписки';
var HEAD = ['№', 'Дата', 'Статус', 'Имя', 'Телефон', 'Компания / ИНН', 'Расчёт', 'Позиции', 'Упаковок', 'м²',
  'Сумма нал, ₽', 'Сумма безнал, ₽', 'Итого по выбранному, ₽', 'Позиций по запросу', 'Комментарий', 'Страница', 'Данные (JSON)'];
var SUBS_HEAD = ['Endpoint', 'Устройство', 'Добавлено', 'Последний push', 'Ответ службы'];
var STATUSES = ['Новая', 'В работе', 'Счёт выставлен', 'Закрыта', 'Спам'];
var VAPID_SUB = 'mailto:almaliceramic@mail.ru';   // контакт для служб push (Apple/Google требуют mailto: или https:)

/* ======================= установка ======================= */

/** Запустите один раз из редактора (▶ setup). Повторный запуск безопасен: ничего не пересоздаёт. */
function setup() {
  var P = PropertiesService.getScriptProperties();
  var ss = book_();
  sheet_(ss, TAB_REQ, HEAD); sheet_(ss, TAB_SUBS, SUBS_HEAD);
  if (!P.getProperty('VAPID_PRIVATE')) {
    var d = randomScalar_(), Q = toAffine_(mul_(d, G_));
    P.setProperty('VAPID_PRIVATE', hex_(d));
    P.setProperty('VAPID_PUBLIC', b64u_([4].concat(be32_(Q[0]), be32_(Q[1]))));
  }
  if (!P.getProperty('MANAGER_KEY')) P.setProperty('MANAGER_KEY', b64u_(sha256_(Utilities.getUuid() + Utilities.getUuid() + Date.now())).slice(0, 24));
  if (!P.getProperty('SEQ')) P.setProperty('SEQ', '1000');
  var msg = 'Готово.\nТаблица: ' + ss.getUrl() + '\nКЛЮЧ МЕНЕДЖЕРА (введите на странице manager.html, никому не пересылайте): ' +
    P.getProperty('MANAGER_KEY') + '\nДальше: Развернуть → Новое развёртывание → Веб-приложение (от моего имени, доступ: все).';
  Logger.log(msg); return msg;
}

/** Новый ключ менеджера (если старый попал к посторонним). Подписки устройств сохраняются. */
function rotateManagerKey() {
  PropertiesService.getScriptProperties().setProperty('MANAGER_KEY', b64u_(sha256_(Utilities.getUuid() + Date.now())).slice(0, 24));
  Logger.log('Новый ключ менеджера: ' + PropertiesService.getScriptProperties().getProperty('MANAGER_KEY'));
}

/** Проверка подписи VAPID и отправка тестового push на все подписанные устройства (▶ из редактора). */
function testPush() {
  Logger.log('Подпись ES256: ' + (selfTest() ? 'OK' : 'ОШИБКА'));
  Logger.log(JSON.stringify(notifyAll_({ no: 'ТЕСТ', title: 'Проверка уведомлений', body: 'Если вы это видите — push работает' })));
}

/* ======================= веб-приложение ======================= */

function doGet(e) {
  var P = PropertiesService.getScriptProperties();
  return json_({ ok: true, service: 'almaly-dealers-2', vapid: P.getProperty('VAPID_PUBLIC') || null, ready: !!P.getProperty('VAPID_PUBLIC') });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var a = body.action;
    if (a === 'create') return json_(create_(body.request || {}));
    if (a === 'vapid') return json_({ ok: true, vapid: PropertiesService.getScriptProperties().getProperty('VAPID_PUBLIC') });
    if (!checkKey_(body.key)) return json_({ ok: false, error: 'неверный ключ менеджера' });
    if (a === 'list') return json_({ ok: true, items: list_(+body.limit || 100), statuses: STATUSES });
    if (a === 'status') return json_(setStatus_(String(body.no || ''), String(body.status || '')));
    if (a === 'subscribe') return json_(subscribe_(String(body.endpoint || ''), String(body.device || '')));
    if (a === 'unsubscribe') return json_(unsubscribe_(String(body.endpoint || '')));
    if (a === 'notice') return json_({ ok: true, notices: notices_() });
    if (a === 'test_push') return json_({ ok: true, result: notifyAll_({ no: 'ТЕСТ', title: 'Проверка уведомлений', body: 'Push работает — новые заявки будут приходить сюда' }) });
    return json_({ ok: false, error: 'неизвестное действие' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'ошибка сервера: ' + (err && err.message || err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function checkKey_(k) { var K = PropertiesService.getScriptProperties().getProperty('MANAGER_KEY'); return !!K && typeof k === 'string' && k === K; }

/* ======================= заявки ======================= */

function str_(v, max) {  // обрезка + защита от формул в таблице
  var s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function num_(v) { var n = Number(v); return isFinite(n) && n >= 0 && n < 1e11 ? Math.round(n * 100) / 100 : ''; }
function normPhone_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && /^[78]/.test(d)) return '+7' + d.slice(1);
  if (d.length === 10 && d[0] === '9') return '+7' + d;
  if (/^\s*\+/.test(String(v)) && d.length >= 10 && d.length <= 15) return '+' + d;
  return null;
}
function rub_(n) { return n === '' || n == null ? '' : Utilities.formatString('%s ₽', String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')); }

function create_(r) {
  // антиспам: скрытое поле и слишком быстрая отправка — молча «принимаем», но не сохраняем
  if (r.hp) return { ok: true, no: '—' };
  if (+r.elapsed > 0 && +r.elapsed < 1500) return { ok: true, no: '—' };
  var name = str_(r.name, 80), phone = normPhone_(r.phone);
  if (name.length < 2) return { ok: false, error: 'укажите имя' };
  if (!phone) return { ok: false, error: 'проверьте номер телефона' };
  var items = (Array.isArray(r.items) ? r.items : []).slice(0, 60).map(function (it) {
    return { art: str_(it.art, 24), name: str_(it.name, 80), format: str_(it.format, 12), packs: Math.max(0, Math.round(+it.packs || 0)),
      m2: num_(it.m2), cash: num_(it.cash), noncash: num_(it.noncash), sum: num_(it.sum) };
  }).filter(function (it) { return it.art && it.packs > 0; });
  if (!items.length) return { ok: false, error: 'в заявке нет позиций' };
  var C = CacheService.getScriptCache(), pk = 'rl_' + phone.replace(/\D/g, ''), n1 = +(C.get(pk) || 0), n2 = +(C.get('rl_all') || 0);
  if (n1 >= 4) return { ok: false, error: 'с этого номера уже отправлено несколько заявок — менеджер свяжется с вами. Срочно: +7 499 390-78-88' };
  if (n2 >= 40) return { ok: false, error: 'сервис перегружен, попробуйте через 10 минут или позвоните +7 499 390-78-88' };
  C.put(pk, String(n1 + 1), 600); C.put('rl_all', String(n2 + 1), 600);

  var t = r.totals || {}, mode = r.mode === 'noncash' ? 'noncash' : 'cash';
  var text = items.map(function (it, i) { return (i + 1) + ') ' + it.name + ' ' + it.art + ' — ' + it.packs + ' уп., ' + it.m2 + ' м² — ' + (it.sum ? rub_(it.sum) : 'по запросу'); }).join('\n');
  var ask = items.filter(function (it) { return !it.sum; }).length;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var no;
  try {
    var P = PropertiesService.getScriptProperties(), seq = +(P.getProperty('SEQ') || 1000) + 1; P.setProperty('SEQ', String(seq));
    no = 'Д2-' + seq;
    var sh = sheet_(book_(), TAB_REQ, HEAD);
    sh.appendRow([no, new Date(), STATUSES[0], name, phone, str_(r.company, 120), mode === 'cash' ? 'Наличные' : 'Безнал с НДС', text,
      items.reduce(function (s, it) { return s + it.packs; }, 0), num_(t.m2), num_(t.cash), num_(t.noncash), ask === items.length ? '' : num_(t.chosen), ask,
      str_(r.comment, 1000), str_(r.page, 200), JSON.stringify({ items: items, totals: t, mode: mode }).slice(0, 45000)]);
  } finally { lock.releaseLock(); }
  var sum = ask === items.length ? 'цена по запросу' : rub_(num_(t.chosen)) + (mode === 'cash' ? ' нал' : ' безнал') + (ask ? ' + по запросу' : '');
  try { notifyAll_({ no: no, title: 'Новая заявка ' + no, body: name + ' · ' + phone + ' · ' + sum + '\n' + items.length + ' поз.: ' + items.map(function (it) { return it.name; }).slice(0, 3).join(', ') }); }
  catch (err) { console.error('push', err); }   // заявка уже в таблице — ошибка push не мешает клиенту
  return { ok: true, no: no };
}

function list_(limit) {
  var sh = sheet_(book_(), TAB_REQ, HEAD), n = sh.getLastRow() - 1; if (n < 1) return [];
  var k = Math.min(n, Math.max(1, Math.min(500, limit))), rows = sh.getRange(sh.getLastRow() - k + 1, 1, k, HEAD.length).getValues();
  return rows.reverse().map(function (x) {
    var extra = {}; try { extra = JSON.parse(x[16] || '{}'); } catch (e) {}
    return { no: x[0], date: x[1] instanceof Date ? x[1].toISOString() : String(x[1]), status: x[2], name: x[3], phone: x[4], company: x[5], mode: x[6],
      text: x[7], packs: x[8], m2: x[9], cash: x[10], noncash: x[11], chosen: x[12], ask: x[13], comment: x[14], items: extra.items || [] };
  });
}

function setStatus_(no, status) {
  if (STATUSES.indexOf(status) < 0) return { ok: false, error: 'неизвестный статус' };
  var sh = sheet_(book_(), TAB_REQ, HEAD), n = sh.getLastRow() - 1; if (n < 1) return { ok: false, error: 'заявка не найдена' };
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === no) { sh.getRange(i + 2, 3).setValue(status); return { ok: true }; }
  return { ok: false, error: 'заявка не найдена' };
}

/* ======================= подписки и push ======================= */

var PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com|windows\.com)\//i;

function subscribe_(endpoint, device) {
  if (!PUSH_HOSTS.test(endpoint) || endpoint.length > 1000) return { ok: false, error: 'неподдерживаемая служба уведомлений' };
  var sh = sheet_(book_(), TAB_SUBS, SUBS_HEAD), n = sh.getLastRow() - 1, rows = n > 0 ? sh.getRange(2, 1, n, 1).getValues() : [];
  for (var i = 0; i < rows.length; i++) if (rows[i][0] === endpoint) { sh.getRange(i + 2, 2).setValue(str_(device, 120)); return { ok: true, devices: rows.length }; }
  sh.appendRow([endpoint, str_(device, 120), new Date(), '', '']);
  return { ok: true, devices: rows.length + 1 };
}
function unsubscribe_(endpoint) {
  var sh = sheet_(book_(), TAB_SUBS, SUBS_HEAD), n = sh.getLastRow() - 1; if (n < 1) return { ok: true };
  var rows = sh.getRange(2, 1, n, 1).getValues();
  for (var i = rows.length - 1; i >= 0; i--) if (rows[i][0] === endpoint) sh.deleteRow(i + 2);
  return { ok: true };
}

function notices_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('NOTICES') || '[]'); } catch (e) { return []; } }

/** Сохраняет текст уведомления (его заберёт service worker) и будит все подписанные устройства. */
function notifyAll_(note) {
  var P = PropertiesService.getScriptProperties();
  var list = notices_(); list.unshift({ no: note.no, title: note.title, body: note.body, ts: Date.now() });
  P.setProperty('NOTICES', JSON.stringify(list.slice(0, 10)));
  var pub = P.getProperty('VAPID_PUBLIC'), d = P.getProperty('VAPID_PRIVATE');
  if (!pub || !d) return { sent: 0, error: 'нет ключей — запустите setup()' };
  var sh = sheet_(book_(), TAB_SUBS, SUBS_HEAD), n = sh.getLastRow() - 1; if (n < 1) return { sent: 0, devices: 0 };
  var rows = sh.getRange(2, 1, n, 1).getValues().map(function (r) { return r[0]; });
  var reqs = rows.map(function (ep) {
    return { url: ep, method: 'post', payload: '', muteHttpExceptions: true, followRedirects: false,
      headers: { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + vapidJwt_(audience_(ep), d) + ', k=' + pub } };
  });
  var res = UrlFetchApp.fetchAll(reqs), sent = 0, gone = [], now = new Date();
  res.forEach(function (r, i) {
    var code = r.getResponseCode(); if (code >= 200 && code < 300) sent++;
    if (code === 404 || code === 410) gone.push(i + 2);
    sh.getRange(i + 2, 4, 1, 2).setValues([[now, code + (code >= 300 ? ' ' + String(r.getContentText()).slice(0, 120) : '')]]);
  });
  gone.reverse().forEach(function (row) { sh.deleteRow(row); });   // устройство отписалось или переустановило приложение
  return { sent: sent, devices: rows.length, removed: gone.length };
}

function audience_(ep) { var m = /^(https:\/\/[^\/]+)/.exec(ep); return m[1]; }

/** VAPID JWT (RFC 8292), ES256. Кэш 6 ч на службу push, срок жизни токена 12 ч. */
function vapidJwt_(aud, dHex) {
  var C = CacheService.getScriptCache(), ck = 'jwt_' + aud.replace(/[^a-z0-9]/gi, '').slice(0, 200), hit = C.get(ck);
  if (hit) return hit;
  var data = b64u_(bytes_(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' +
    b64u_(bytes_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUB })));
  var sig = sign_(bytes_(data), BigInt('0x' + dHex)), jwt = data + '.' + b64u_(be32_(sig[0]).concat(be32_(sig[1])));
  C.put(ck, jwt, 6 * 3600);
  return jwt;
}

/* ======================= ECDSA P-256 на BigInt ======================= */

var P_ = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
var N_ = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
var B_ = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
var G_ = [BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'), BigInt(1)];
var Z0_ = BigInt(0), Z1_ = BigInt(1), Z2_ = BigInt(2), Z3_ = BigInt(3), Z4_ = BigInt(4), Z8_ = BigInt(8);

function mod_(a, m) { var r = a % m; return r < Z0_ ? r + m : r; }
function pow_(b, e, m) { var r = Z1_; b = mod_(b, m); while (e > Z0_) { if (e & Z1_) r = r * b % m; b = b * b % m; e >>= Z1_; } return r; }
function inv_(a, m) { return pow_(mod_(a, m), m - Z2_, m); }
function dbl_(A) {
  var X = A[0], Y = A[1], Z = A[2]; if (Z === Z0_ || Y === Z0_) return [Z1_, Z1_, Z0_];
  var delta = Z * Z % P_, gamma = Y * Y % P_, beta = X * gamma % P_, alpha = mod_(Z3_ * (X - delta) * (X + delta), P_);
  var X3 = mod_(alpha * alpha - Z8_ * beta, P_), Z3 = mod_((Y + Z) * (Y + Z) - gamma - delta, P_), Y3 = mod_(alpha * (Z4_ * beta - X3) - Z8_ * gamma * gamma, P_);
  return [X3, Y3, Z3];
}
function add_(A, B) {
  if (A[2] === Z0_) return B; if (B[2] === Z0_) return A;
  var Z1s = A[2] * A[2] % P_, Z2s = B[2] * B[2] % P_;
  var U1 = A[0] * Z2s % P_, U2 = B[0] * Z1s % P_, S1 = A[1] * Z2s % P_ * B[2] % P_, S2 = B[1] * Z1s % P_ * A[2] % P_;
  if (U1 === U2) return S1 === S2 ? dbl_(A) : [Z1_, Z1_, Z0_];
  var H = mod_(U2 - U1, P_), R = mod_(S2 - S1, P_), H2 = H * H % P_, H3 = H2 * H % P_, U1H2 = U1 * H2 % P_;
  var X3 = mod_(R * R - H3 - Z2_ * U1H2, P_), Y3 = mod_(R * (U1H2 - X3) - S1 * H3, P_), Z3 = H * A[2] % P_ * B[2] % P_;
  return [X3, Y3, Z3];
}
function mul_(k, A) { var R = [Z1_, Z1_, Z0_], bits = k.toString(2); for (var i = 0; i < bits.length; i++) { R = dbl_(R); if (bits[i] === '1') R = add_(R, A); } return R; }
function toAffine_(A) { var zi = inv_(A[2], P_), zi2 = zi * zi % P_; return [A[0] * zi2 % P_, A[1] * zi2 % P_ * zi % P_]; }
function onCurve_(x, y) { return mod_(y * y - (x * x * x - Z3_ * x + B_), P_) === Z0_; }

/** Подпись ES256: k по RFC 6979 (детерминированный, без генератора случайных чисел). Возвращает [r, s]. */
function sign_(msg, d) {
  var h = sha256_(msg), e = BigInt('0x' + hex_(h)), x = be32_(d), h1 = be32_(mod_(e, N_));
  var V = [], K = []; for (var i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = hmac_(K, V.concat([0], x, h1)); V = hmac_(K, V);
  K = hmac_(K, V.concat([1], x, h1)); V = hmac_(K, V);
  for (var guard = 0; guard < 100; guard++) {
    V = hmac_(K, V); var k = BigInt('0x' + hex_(V));
    if (k > Z0_ && k < N_) {
      var R = toAffine_(mul_(k, G_)), r = mod_(R[0], N_);
      if (r !== Z0_) { var s = mod_(inv_(k, N_) * (e + r * d), N_); if (s !== Z0_) return [r, s]; }
    }
    K = hmac_(K, V.concat([0])); V = hmac_(K, V);
  }
  throw new Error('ECDSA: не удалось подобрать k');
}
function verify_(msg, sig, Q) {
  var e = BigInt('0x' + hex_(sha256_(msg))), r = sig[0], s = sig[1]; if (r <= Z0_ || r >= N_ || s <= Z0_ || s >= N_) return false;
  var w = inv_(s, N_), X = add_(mul_(mod_(e * w, N_), G_), mul_(mod_(r * w, N_), [Q[0], Q[1], Z1_]));
  return X[2] !== Z0_ && mod_(toAffine_(X)[0], N_) === r;
}
/** Самопроверка: открытый ключ на кривой и подпись проверяется. */
function selfTest() {
  var P = PropertiesService.getScriptProperties(), d = BigInt('0x' + P.getProperty('VAPID_PRIVATE')), Q = toAffine_(mul_(d, G_));
  var m = bytes_('almaly-self-test-' + Date.now()), ok = onCurve_(Q[0], Q[1]) && verify_(m, sign_(m, d), Q) &&
    b64u_([4].concat(be32_(Q[0]), be32_(Q[1]))) === P.getProperty('VAPID_PUBLIC');
  Logger.log('selfTest: ' + ok); return ok;
}
function randomScalar_() {
  for (;;) {
    var seed = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random() + Math.random();
    var k = BigInt('0x' + hex_(sha256_(bytes_(seed))));
    if (k > Z0_ && k < N_) return k;
  }
}

/* ======================= байты (в Apps Script байты знаковые −128…127) ======================= */
function u8_(a) { return a.map(function (b) { return b & 255; }); }
function s8_(a) { return a.map(function (b) { b &= 255; return b > 127 ? b - 256 : b; }); }
function bytes_(s) { return u8_(Utilities.newBlob(String(s)).getBytes()); }
function sha256_(b) { return u8_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, typeof b === 'string' ? s8_(bytes_(b)) : s8_(b))); }
function hmac_(key, msg) { return u8_(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, s8_(msg), s8_(key))); }
function b64u_(b) { return Utilities.base64EncodeWebSafe(s8_(b)).replace(/=+$/, ''); }
function hex_(v) {
  if (typeof v === 'bigint') { var h = v.toString(16); while (h.length < 64) h = '0' + h; return h; }
  return v.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function be32_(v) { var h = hex_(v), out = []; for (var i = 0; i < 64; i += 2) out.push(parseInt(h.substr(i, 2), 16)); return out; }

/* ======================= таблица ======================= */
function book_() {
  var P = PropertiesService.getScriptProperties(), id = P.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = null; try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (!ss) ss = SpreadsheetApp.create(SHEET_NAME);
  P.setProperty('SHEET_ID', ss.getId());
  return ss;
}
function sheet_(ss, name, head) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    if (name === TAB_REQ) {
      sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
      sh.getRange('B2:B').setNumberFormat('dd.MM.yyyy HH:mm'); sh.setColumnWidth(8, 420);
    }
  }
  return sh;
}
