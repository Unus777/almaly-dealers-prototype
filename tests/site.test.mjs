// Проверка сайта в headless Chromium (1440 и 390): ошибки консоли, цены из prices.json, «Цена по запросу»,
// редактор цен с подменённым GitHub API, отправка заявки в подменённый Apps Script, страница менеджера и push-UI.
// Запуск из корня сайта: node tests/site.test.mjs   (нужен Chrome: CHROME=/путь/к/chrome)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert';
const PORT = 8000 + Math.floor(Math.random() * 900), BASE = `http://127.0.0.1:${PORT}/`;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
mkdirSync('tests/shots', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const VAPID = Buffer.from(crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' }).x, 'base64url');  // заглушка
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys(); const VAPID_PUB = ecdh.getPublicKey().toString('base64url');
const PRICES = { _rule: { noncashPct: 12, round: 10 }, VHP612038: { cash: 1390, noncash: 1560, unit: 'м2' }, VHF612802: { auto: false, noncash: 1800, unit: 'м2' } };
const errors = [], results = [];  // ожидаемые (подменённые) 401/500 и «Push API в инкогнито» не считаются ошибками
const ok = m => { results.push('✓ ' + m); console.log('✓', m); };

async function page(vp, { gas = true, prices = PRICES, gasReply } = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'ru-RU', ...(vp.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); p.sent = []; p.gh = [];
  p.on('console', m => { if (m.type() === 'error' && !/push service|AbortError: Registration failed|DOMException|Push API in incognito|status of 401|status of 500/.test(m.text())) errors.push(`[${vp.width}] ${m.text()}`); });
  p.on('pageerror', e => errors.push(`[${vp.width}] pageerror ${e.message}`));
  if (gas) await p.route('**/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("REQUESTS_URL: ''", `REQUESTS_URL: '${GAS}'`) }); });
  if (prices) await p.route('**/prices.json*', r => r.fulfill({ json: prices }));
  await p.route('https://script.google.com/**', async r => {
    const b = JSON.parse(r.request().postData() || '{}'); p.sent.push(b);
    const reply = gasReply ? gasReply(b) : b.action === 'create' ? { ok: true, no: 'Д2-1001' } : { ok: true };
    r.fulfill(typeof reply === 'number' ? { status: reply, body: 'err' } : { json: reply, headers: { 'access-control-allow-origin': '*' } });
  });
  let remote = { ...PRICES }, sha = 'sha1';
  await p.route('https://api.github.com/**', async r => {
    const u = new URL(r.request().url()), m = r.request().method(); p.gh.push(m + ' ' + u.pathname);
    if (r.request().headers().authorization !== 'Bearer github_pat_TEST') return r.fulfill({ status: 401, json: { message: 'Bad credentials' } });
    if (u.pathname === '/repos/Unus777/almaly-dealers-prototype') return r.fulfill({ json: { full_name: 'Unus777/almaly-dealers-prototype', permissions: { push: true } } });
    if (u.pathname.endsWith('/contents/prices.json') && m === 'GET') return r.fulfill({ json: { sha, content: Buffer.from(JSON.stringify(remote)).toString('base64') } });
    if (u.pathname.endsWith('/contents/prices.json') && m === 'PUT') { const b = JSON.parse(r.request().postData()); p.put = b; if (b.sha !== sha) return r.fulfill({ status: 409, json: { message: 'sha mismatch' } }); remote = JSON.parse(Buffer.from(b.content, 'base64').toString()); sha = 'sha2'; return r.fulfill({ status: 200, json: { content: { sha } } }); }
    r.fulfill({ status: 404, json: {} });
  });
  return p;
}
const settle = p => p.waitForTimeout(1200);

// ---------- 1440: каталог и цены ----------
let p = await page({ width: 1440, height: 900 });
await p.goto(BASE, { waitUntil: 'networkidle' }); await settle(p);
const body = await p.textContent('body');
assert(!/ПРИМЕР|Прототип|прототип|пример/.test(body), 'нет пометок прототипа'); ok('нет «Прототип» и «пример»');
const c1 = p.locator('.card[data-art="VHP612038"] .prices');
assert.match(await c1.textContent(), /1\s390\s₽[\s\S]*1\s560\s₽/); ok('цена нал 1 390 ₽ и безнал 1 560 ₽ из prices.json');
assert.match(await p.locator('.card[data-art="VHF612802"] .prices').textContent(), /по запросу[\s\S]*1\s800\s₽/); ok('только безнал задан вручную → нал «по запросу»');
const asks = await p.locator('.grid .card .price.ask.wide').count(); assert(asks > 80); ok(`без цены: «Цена по запросу» (${asks} карточек)`);
await p.screenshot({ path: 'tests/shots/1440-top.png' });
await p.locator('#catalog').scrollIntoViewIfNeeded(); await p.waitForTimeout(900); await p.screenshot({ path: 'tests/shots/1440-catalog.png' });
await p.click('.paytoggle button[data-mode="noncash"]'); await p.waitForTimeout(700);
assert(await p.locator('.card[data-art="VHP612038"] .price[data-m="noncash"].active').count() === 1); ok('переключатель нал/безнал');
// заявка
await p.locator('.card[data-art="VHP612038"] [data-add]').click(); await p.locator('.card[data-art="VHF600007"] [data-add]').click();
await p.click('#cartBtn'); await p.waitForTimeout(700);
assert.match(await p.textContent('#cartTotal'), /безнал с НДС\s*22\s464\s₽/); ok('итог безнал в заявке (10 уп. × 1,44 м² × 1 560 = 22 464 ₽)');
assert.match(await p.textContent('#cartTotal'), /по запросу — их стоимость добавит менеджер/); ok('пометка о позициях по запросу');
await p.click('#sendCart'); await p.waitForTimeout(500);
await p.click('#rqSend'); assert(await p.locator('.fld.bad').count() === 2); ok('пустая форма — подсказки у имени и телефона');
await p.fill('#rqName', 'Тест Клиент'); await p.fill('#rqPhone', '12345'); await p.click('#rqSend');
assert.match(await p.textContent('.fld.bad .fe'), /Проверьте номер/); ok('неверный телефон отклонён');
await p.fill('#rqPhone', '8 925 111 22 33'); await p.fill('#rqCompany', 'ООО Тест, ИНН 7700000000'); await p.fill('#rqComment', 'Доставка на объект');
await p.screenshot({ path: 'tests/shots/1440-form.png' });
await p.click('#rqSend'); await p.waitForSelector('.rq-done', { timeout: 8000 });
const cr = p.sent.find(x => x.action === 'create').request;
assert.strictEqual(cr.phone, '+79251112233'); assert.strictEqual(cr.mode, 'noncash'); assert.strictEqual(cr.items.length, 2);
assert.strictEqual(cr.items[0].sum, 22464); assert.strictEqual(cr.items[1].sum, null); assert.strictEqual(cr.hp, ''); assert(cr.elapsed > 1000);
ok('заявка ушла в Apps Script: телефон +7…, безнал, 2 позиции, сумма 22 464 ₽, вторая — по запросу');
assert.match(await p.textContent('.rq-done'), /Д2-1001/); ok('экран «Заявка № Д2-1001 отправлена»');
await p.waitForTimeout(900); await p.screenshot({ path: 'tests/shots/1440-sent.png' });
assert.strictEqual(await p.textContent('#cartCount'), '0'); ok('корзина очищена после отправки');
// админка
await p.goto(BASE + '#admin'); await p.waitForTimeout(800);
assert(await p.isVisible('#adminLogin')); await p.screenshot({ path: 'tests/shots/1440-admin-login.png' });
await p.fill('#ghToken', 'wrong'); await p.click('#loginBtn'); await p.waitForSelector('#loginErr:not([hidden])');
assert.match(await p.textContent('#loginErr'), /токен не подходит/); ok('неверный токен → понятная ошибка');
await p.fill('#ghToken', 'github_pat_TEST'); await p.click('#loginBtn'); await p.waitForSelector('#adminMain:not([hidden])');
const row = p.locator('#adminRows tr[data-art="VHP612038"]');
await row.locator('.in-cash').fill('1500'); await p.waitForTimeout(200);
assert.strictEqual(await row.locator('.in-non').inputValue(), '1680'); ok('безнал по правилу: 1500 + 12% → 1680');
await p.locator('#adminRows tr[data-art="VHF600007"] .in-cash').fill('990');
assert.match(await p.textContent('#adminState'), /Не сохранено: 2/); await p.screenshot({ path: 'tests/shots/1440-admin.png' });
await p.click('#saveBtn'); await p.waitForFunction(() => /Все цены сохранены/.test(document.querySelector('#adminState').textContent), null, { timeout: 8000 });
const saved = JSON.parse(Buffer.from(p.put.content, 'base64').toString());
assert.deepStrictEqual(saved.VHP612038, { cash: 1500, noncash: 1680, unit: 'м2' }); assert.deepStrictEqual(saved.VHF600007, { cash: 990, noncash: 1110, unit: 'м2' });
assert.deepStrictEqual(saved.VHF612802, { auto: false, noncash: 1800, unit: 'м2' }); assert.strictEqual(p.put.sha, 'sha1'); assert.match(p.put.message, /^Цены: /);
ok('prices.json закоммичен через GitHub API (PUT с sha), чужие цены сохранены');
assert(!JSON.stringify(saved).includes('github_pat')); ok('токена нет в prices.json');
await p.click('#adminClose'); await p.waitForTimeout(800);
assert.match(await p.locator('.card[data-art="VHP612038"] .prices').textContent(), /1\s500\s₽/); ok('после сохранения сайт показывает новую цену');
// ошибка сервера заявок
const p2 = await page({ width: 1440, height: 900 }, { gasReply: b => (b.action === 'create' ? 500 : { ok: true }) });
await p2.goto(BASE, { waitUntil: 'networkidle' }); await settle(p2);
await p2.locator('.card[data-art="VHP612038"] [data-add]').click(); await p2.click('#cartBtn'); await p2.click('#sendCart');
await p2.fill('#rqName', 'Тест'); await p2.fill('#rqPhone', '+7 925 111-22-33'); await p2.waitForTimeout(1600); await p2.click('#rqSend');
await p2.waitForSelector('#rqErr:not([hidden])'); assert(await p2.locator('#rqErr a[href^="https://wa.me/79253907888"]').count() === 1);
ok('сбой сервера → сообщение + WhatsApp и звонок'); await p2.screenshot({ path: 'tests/shots/1440-send-error.png' });
// адрес Apps Script не настроен
const p3 = await page({ width: 1440, height: 900 }, { gas: false, prices: null });
await p3.goto(BASE, { waitUntil: 'networkidle' }); await settle(p3);
await p3.locator('.card[data-art="VHP612038"] [data-add]').click(); await p3.click('#cartBtn'); await p3.click('#sendCart');
await p3.fill('#rqName', 'Тест'); await p3.fill('#rqPhone', '+7 925 111-22-33'); await p3.click('#rqSend');
assert.match(await p3.textContent('#rqErr'), /ещё настраивается/); assert(p3.sent.length === 0); ok('без REQUESTS_URL → «Отправить в WhatsApp» / звонок');
assert(await p3.locator('.card .price.ask.wide').count() > 85); ok('реальный prices.json (пустой) → все «Цена по запросу»');
// 3D-примерочная
await p3.locator('#room').scrollIntoViewIfNeeded(); await p3.waitForSelector('#roomGl.ready', { timeout: 20000 }).catch(() => {});
ok('3D-комната: ' + (await p3.locator('#roomGl.ready').count() ? 'загрузилась' : 'не загрузилась (WebGL в headless)'));
await p3.screenshot({ path: 'tests/shots/1440-room.png' });

// ---------- 390 ----------
const m = await page({ width: 390, height: 844 });
await m.goto(BASE, { waitUntil: 'networkidle' }); await settle(m);
assert(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); ok('390: нет горизонтальной прокрутки');
await m.screenshot({ path: 'tests/shots/390-top.png' });
await m.locator('#catalog').scrollIntoViewIfNeeded(); await m.waitForTimeout(900); await m.screenshot({ path: 'tests/shots/390-catalog.png' });
await m.locator('.card[data-art="VHP612038"] [data-add]').click(); await m.click('#cartBtn'); await m.waitForTimeout(600); await m.click('#sendCart'); await m.waitForTimeout(600);
await m.screenshot({ path: 'tests/shots/390-form.png' });
await m.goto(BASE + '#admin'); await m.waitForTimeout(700); await m.screenshot({ path: 'tests/shots/390-admin-login.png' });

// ---------- страница менеджера ----------
const LIST = { ok: true, statuses: ['Новая', 'В работе', 'Счёт выставлен', 'Закрыта', 'Спам'], items: [
  { no: 'Д2-1002', date: new Date().toISOString(), status: 'Новая', name: 'Иван Петров', phone: '+79251112233', company: 'ООО Ромашка', mode: 'Безнал с НДС', text: '1) Айссноу VHP612038 — 10 уп., 14.4 м² — 22 464 ₽', chosen: 22464, ask: 0, comment: 'Доставка в Химки' },
  { no: 'Д2-1001', date: new Date(Date.now() - 3600e3).toISOString(), status: 'В работе', name: 'Анна', phone: '+79990001122', company: '', mode: 'Наличные', text: '1) Тест VHF600007 — 2 уп. — цена по запросу', chosen: '', ask: 1, comment: '' }] };
const gasMgr = b => b.action === 'list' ? (b.key === 'KEY123' ? LIST : { ok: false, error: 'неверный ключ менеджера' }) : b.action === 'vapid' ? { ok: true, vapid: VAPID_PUB } : { ok: true, devices: 1 };
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const g = await page(vp, { gasReply: gasMgr }); await g.context().grantPermissions(['notifications'], { origin: BASE.slice(0, -1) });
  await g.goto(BASE + 'manager.html'); await g.waitForSelector('#login:not([hidden])');
  await g.fill('#key', 'bad'); await g.click('#loginBtn'); await g.waitForSelector('#loginErr:not([hidden])');
  await g.fill('#key', 'KEY123'); await g.click('#loginBtn'); await g.waitForSelector('#app:not([hidden])'); await g.waitForTimeout(1500);
  assert.strictEqual(await g.locator('.rq').count(), 1); assert.match(await g.textContent('#list'), /Иван Петров/);
  assert(await g.isVisible('#pushOn') || await g.isVisible('#pushOff')); ok(`${vp.width}: менеджер — вход по ключу, список «Новая», кнопка «Включить уведомления»`);
  await g.screenshot({ path: `tests/shots/${vp.width}-manager.png`, fullPage: true });
  await g.click('#pushOn'); await g.waitForTimeout(2500);
  const st = await g.textContent('#pushState'); ok(`${vp.width}: после нажатия — «${st.trim()}»`);
  await g.locator('#list select').first().selectOption('В работе'); await g.waitForTimeout(400);
  assert(g.sent.some(x => x.action === 'status' && x.status === 'В работе' && x.key === 'KEY123')); ok(`${vp.width}: смена статуса уходит в Apps Script`);
  await g.screenshot({ path: `tests/shots/${vp.width}-manager-push.png` });
}
// iPhone в Safari (не с экрана «Домой») → инструкция
const ctxI = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' });
const ip = await ctxI.newPage(); ip.on('pageerror', e => errors.push('[ios] ' + e.message));
await ip.route('**/config.js*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("REQUESTS_URL: ''", `REQUESTS_URL: '${GAS}'`) }); });
await ip.route('https://script.google.com/**', r => r.fulfill({ json: gasMgr(JSON.parse(r.request().postData())) }));
await ip.addInitScript(() => localStorage.setItem('almaly_d2_mkey', 'KEY123'));
await ip.goto(BASE + 'manager.html'); await ip.waitForSelector('#iosHelp:not([hidden])', { timeout: 6000 });
ok('iPhone в Safari: показана инструкция «На экран Домой»'); await ip.screenshot({ path: 'tests/shots/390-manager-ios.png', fullPage: true });

await browser.close(); srv.kill();
console.log(errors.length ? '\nОШИБКИ КОНСОЛИ:\n' + errors.join('\n') : '\nОшибок консоли нет');
console.log(`Итого проверок: ${results.length}`);
process.exit(errors.length ? 1 : 0);
