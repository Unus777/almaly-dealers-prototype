(() => {
'use strict';
const CFG = self.SITE_CONFIG || {}, $ = s => document.querySelector(s);
const KKEY = 'almaly_d2_mkey';
let KEY = ''; try { KEY = localStorage.getItem(KKEY) || ''; } catch (e) {}
let items = [], statuses = ['Новая', 'В работе', 'Счёт выставлен', 'Закрыта', 'Спам'], filter = 'Новая', VAPID = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rub = n => n === '' || n == null || isNaN(n) ? '' : new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3200); }
async function api(payload) {
  const r = await fetch(CFG.REQUESTS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const d = await r.json().catch(() => ({ ok: false, error: 'неверный ответ сервера' }));
  if (!d.ok) { const e = new Error(d.error || 'ошибка'); e.auth = /ключ/.test(d.error || ''); throw e; }
  return d;
}

/* ---------- вход ---------- */
function show(which) { $('#login').hidden = which !== 'login'; $('#app').hidden = which !== 'app'; $('#refresh').hidden = which !== 'app'; }
$('#login').addEventListener('submit', async e => {
  e.preventDefault(); const k = $('#key').value.trim(); if (!k) return;
  $('#loginBtn').classList.add('busy'); $('#loginErr').hidden = true;
  try { KEY = k; await load(); try { localStorage.setItem(KKEY, k); } catch (x) {} show('app'); initPush(); }
  catch (err) { KEY = ''; $('#loginErr').hidden = false; $('#loginErr').textContent = 'Не удалось войти: ' + err.message; }
  finally { $('#loginBtn').classList.remove('busy'); }
});
$('#logout').onclick = async () => {
  if (!confirm('Выйти и отключить уведомления на этом устройстве?')) return;
  try { await pushOff(true); } catch (e) {}
  try { localStorage.removeItem(KKEY); } catch (e) {} KEY = ''; show('login');
};

/* ---------- список заявок ---------- */
async function load() {
  const d = await api({ action: 'list', key: KEY, limit: 200 }); items = d.items || []; if (d.statuses) statuses = d.statuses;
  render(); badge();
  $('#meta').textContent = `Обновлено ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · всего ${items.length}`;
}
function badge() { const n = items.filter(x => x.status === 'Новая').length; try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) {} document.title = (n ? `(${n}) ` : '') + 'Заявки — Алмалы Керамик'; }
function render() {
  const counts = {}; items.forEach(x => counts[x.status] = (counts[x.status] || 0) + 1);
  $('#chips').innerHTML = ['Все', ...statuses].map(s => `<button type="button" role="tab" data-s="${esc(s)}" class="${s === filter ? 'on' : ''}" aria-selected="${s === filter}">${esc(s)}<b>${s === 'Все' ? items.length : counts[s] || 0}</b></button>`).join('');
  const q = $('#q').value.trim().toLowerCase();
  const list = items.filter(x => (filter === 'Все' || x.status === filter) && (!q || [x.no, x.name, x.phone, x.company, x.text, x.comment].join(' ').toLowerCase().includes(q)));
  const hl = decodeURIComponent(location.hash.slice(1));
  $('#list').innerHTML = list.length ? list.map((x, i) => {
    const d = new Date(x.date), when = isNaN(d) ? esc(x.date) : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const tel = String(x.phone).replace(/[^+\d]/g, ''), sum = x.chosen ? rub(x.chosen) : 'по запросу';
    return `<article class="rq${x.status === 'Новая' ? ' new' : ''}${x.no === hl ? ' hl' : ''}" id="rq-${esc(x.no)}" style="animation-delay:${Math.min(i, 8) * 40}ms">
      <div class="rq-top"><div><div class="rq-no">№ ${esc(x.no)} · ${when}</div><h3>${esc(x.name)}</h3></div><div class="rq-sum">${esc(sum)}<small>${esc(x.mode)}${+x.ask ? ` · ${x.ask} поз. по запросу` : ''}</small></div></div>
      ${x.company ? `<p class="rq-c">🏢 ${esc(x.company)}</p>` : ''}
      <div class="rq-items">${esc(x.text)}</div>
      ${x.comment ? `<p class="rq-c">💬 ${esc(String(x.comment).replace(/^'/, ''))}</p>` : ''}
      <div class="rq-act"><a class="btn primary sm" href="tel:${esc(tel)}">Позвонить ${esc(x.phone)}</a><a class="btn ghost sm" href="https://wa.me/${esc(tel.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>
        <select data-no="${esc(x.no)}" aria-label="Статус заявки ${esc(x.no)}">${statuses.map(s => `<option${s === x.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
    </article>`;
  }).join('') : `<p class="empty">${items.length ? 'Нет заявок с таким фильтром' : 'Заявок пока нет — как только клиент отправит заявку с сайта, она появится здесь'}</p>`;
  if (hl) { const el = document.getElementById('rq-' + hl); if (el) el.scrollIntoView({ block: 'center' }); }
}
$('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { filter = b.dataset.s; render(); } });
$('#q').addEventListener('input', render);
$('#list').addEventListener('change', async e => {
  const s = e.target.closest('select'); if (!s) return; const x = items.find(i => i.no === s.dataset.no), old = x.status; x.status = s.value; s.disabled = true;
  try { await api({ action: 'status', key: KEY, no: x.no, status: s.value }); toast(`№ ${x.no}: ${s.value}`); render(); badge(); }
  catch (err) { x.status = old; s.value = old; toast('Не сохранилось: ' + err.message); } finally { s.disabled = false; }
});
$('#refresh').onclick = () => load().then(() => toast('Список обновлён')).catch(err => toast(err.message));
document.addEventListener('visibilitychange', () => { if (!document.hidden && KEY) load().catch(() => {}); });
setInterval(() => { if (!document.hidden && KEY) load().catch(() => {}); }, 60000);
addEventListener('hashchange', render);

/* ---------- push-уведомления ---------- */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64 = s => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t + '='.repeat((4 - t.length % 4) % 4)), c => c.charCodeAt(0)); };
const swUrl = () => 'sw.js?k=' + encodeURIComponent(KEY);
const device = () => { const u = navigator.userAgent; return (isIOS ? 'iPhone/iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'устройство') + (standalone ? ' · приложение' : ' · браузер') + ' · ' + new Date().toLocaleDateString('ru-RU'); };
function pushUI(state, text) {
  const box = $('#push'); box.classList.toggle('on', state === 'on'); $('#pushState').textContent = text;
  $('#pushOn').hidden = !(state === 'off' || state === 'error'); $('#pushTest').hidden = $('#pushOff').hidden = state !== 'on';
  $('#iosHelp').hidden = state !== 'ios';
}
async function currentSub() { const reg = await navigator.serviceWorker.getRegistration('./'); return reg && await reg.pushManager.getSubscription(); }
async function initPush() {
  if (isIOS && !standalone) return pushUI('ios', 'На iPhone уведомления работают только в приложении с экрана «Домой».');
  if (!supported) return pushUI('none', 'Этот браузер не поддерживает push-уведомления. Откройте страницу в Chrome, Edge, Firefox или Safari (macOS 13+ / iOS 16.4+).');
  api({ action: 'vapid' }).then(d => VAPID = d.vapid).catch(() => {});
  if (Notification.permission === 'denied') return pushUI('error', 'Уведомления запрещены в настройках браузера для этого сайта. Разрешите их и обновите страницу.');
  try {
    const sub = await currentSub();
    if (sub && Notification.permission === 'granted') {
      await navigator.serviceWorker.register(swUrl(), { scope: './' });  // обновить ключ в адресе service worker
      api({ action: 'subscribe', key: KEY, endpoint: sub.endpoint, device: device() }).catch(() => {});
      return pushUI('on', 'Включены на этом устройстве. Новая заявка придёт уведомлением с именем, телефоном и суммой.');
    }
  } catch (e) {}
  pushUI('off', 'Выключены на этом устройстве. Нажмите кнопку — браузер спросит разрешение.');
}
$('#pushOn').onclick = async () => {
  const btn = $('#pushOn'); btn.classList.add('busy');
  try {
    const perm = await Notification.requestPermission();  // первым делом — iOS требует вызова прямо по нажатию
    if (perm !== 'granted') throw new Error('разрешение не дано — включите уведомления для сайта в настройках браузера');
    const reg = await navigator.serviceWorker.register(swUrl(), { scope: './' });
    await navigator.serviceWorker.ready;
    if (!VAPID) VAPID = (await api({ action: 'vapid' })).vapid;
    if (!VAPID) throw new Error('в Apps Script нет ключей — запустите setup()');
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))) !== btoa(String.fromCharCode(...b64(VAPID)))) { await sub.unsubscribe(); sub = null; }
    sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) });
    const r = await api({ action: 'subscribe', key: KEY, endpoint: sub.endpoint, device: device() });
    pushUI('on', `Включены. Устройств с уведомлениями: ${r.devices}.`); toast('Уведомления включены — нажмите «Проверить»');
  } catch (err) { pushUI('error', 'Не получилось включить: ' + err.message); }
  finally { btn.classList.remove('busy'); }
};
$('#pushTest').onclick = async () => {
  const b = $('#pushTest'); b.classList.add('busy');
  try { const d = await api({ action: 'test_push', key: KEY }); toast(d.result && d.result.sent ? `Отправлено на устройств: ${d.result.sent}` : 'Служба push не приняла уведомление — включите заново'); }
  catch (err) { toast('Ошибка: ' + err.message); } finally { b.classList.remove('busy'); }
};
async function pushOff(silent) {
  const sub = await currentSub(); if (sub) { try { await api({ action: 'unsubscribe', key: KEY, endpoint: sub.endpoint }); } catch (e) {} await sub.unsubscribe(); }
  if (!silent) { pushUI('off', 'Выключены на этом устройстве.'); toast('Уведомления отключены'); }
}
$('#pushOff').onclick = () => pushOff(false).catch(err => toast(err.message));

/* ---------- старт ---------- */
if (!CFG.REQUESTS_URL) { $('#noApi').hidden = false; show('none'); }
else if (!KEY) show('login');
else { show('app'); $('#list').innerHTML = '<div class="skel"></div><div class="skel"></div>'; load().then(initPush).catch(err => { if (err.auth) { KEY = ''; try { localStorage.removeItem(KKEY); } catch (e) {} show('login'); $('#loginErr').hidden = false; $('#loginErr').textContent = 'Ключ больше не подходит — введите новый'; } else { $('#list').innerHTML = `<p class="empty">Не удалось загрузить заявки: ${esc(err.message)}</p>`; initPush(); } }); }
})();
