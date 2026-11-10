// Service worker страницы менеджера: push без содержимого → текст забираем из Apps Script (action:'notice').
// Ключ менеджера приходит в адресе регистрации: sw.js?k=… (только на устройстве менеджера).
// Кэша и перехвата запросов нет: сайт всегда грузится из сети.
const SW_VERSION = 'd2-1';
importScripts('config.js?v=d2-1');
const CFG = self.SITE_CONFIG || {};
const KEY = new URL(self.location).searchParams.get('k') || '';
const ICON = 'icons/icon-192.png', BADGE = 'icons/badge-96.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function api(payload) {
  const r = await fetch(CFG.REQUESTS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const d = await r.json(); if (!d.ok) throw new Error(d.error || 'ошибка'); return d;
}
// какие уведомления уже показаны — чтобы два быстрых push не дублировали одну заявку
async function shown(add) {
  const c = await caches.open('d2-meta'), k = new Request('shown.json'), r = await c.match(k);
  let list = r ? await r.json().catch(() => []) : [];
  if (add) { list = [...add, ...list].slice(0, 50); await c.put(k, new Response(JSON.stringify(list))); }
  return list;
}
async function onPush() {
  let notes = [];
  try {
    const d = await api({ action: 'notice', key: KEY }), seen = await shown();
    notes = (d.notices || []).filter(n => Date.now() - n.ts < 15 * 60 * 1000 && !seen.includes(n.no + ':' + n.ts)).slice(0, 3);
    if (!notes.length && d.notices && d.notices[0]) notes = [d.notices[0]];
    await shown(notes.map(n => n.no + ':' + n.ts));
  } catch (e) {}
  if (!notes.length) notes = [{ title: 'Новая заявка', body: 'Откройте, чтобы посмотреть', no: '' }];  // iOS требует показать уведомление всегда
  for (const n of notes.reverse()) {
    await self.registration.showNotification(n.title || 'Новая заявка', {
      body: n.body || '', tag: 'd2-' + (n.no || 'new'), renotify: true, requireInteraction: true, vibrate: [300, 120, 300, 120, 500],
      icon: ICON, badge: BADGE, timestamp: n.ts || Date.now(), data: { url: 'manager.html' + (n.no && n.no !== 'ТЕСТ' ? '#' + encodeURIComponent(n.no) : '') },
    });
  }
  try { const d = await api({ action: 'list', key: KEY, limit: 60 }); const k = d.items.filter(x => x.status === 'Новая').length; if (self.navigator.setAppBadge) k ? self.navigator.setAppBadge(k) : self.navigator.clearAppBadge(); } catch (e) {}
}
self.addEventListener('push', e => e.waitUntil(onPush()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'manager.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async ws => {
    const w = ws.find(x => x.url.split('#')[0].endsWith('manager.html'));
    if (w) { try { await w.focus(); } catch (x) {} try { return await w.navigate(url); } catch (x) { return; } }
    return self.clients.openWindow(url);
  }));
});

// служба push сменила подписку (бывает в Firefox/Chrome) — переподписываемся сами
self.addEventListener('pushsubscriptionchange', e => e.waitUntil((async () => {
  const { vapid } = await api({ action: 'vapid' });
  const raw = Uint8Array.from(atob(vapid.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - vapid.length % 4) % 4)), c => c.charCodeAt(0));
  const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
  await api({ action: 'subscribe', key: KEY, endpoint: sub.endpoint, device: 'обновлённая подписка' });
})()));
