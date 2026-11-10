# Алмалы Керамик — второй дилерский сайт

Рабочий сайт для дилеров: каталог керамогранита, живые остатки, цены за наличный и безналичный расчёт (с НДС),
3D-примерочная, заявка менеджеру с push-уведомлением. Статический сайт на GitHub Pages (ветка `main`, корень).

**Настройка — в [SETUP.md](SETUP.md).**

## Файлы
| Файл | Назначение |
|---|---|
| `index.html`, `style.css`, `app.js` | сайт: каталог, цены, калькулятор, заявка, редактор цен `#admin` |
| `config.js` | репозиторий, контакты, адрес Apps Script `REQUESTS_URL` (секретов нет) |
| `prices.json` | цены за м²: `{"<артикул>": {"cash":…, "noncash":…, "unit":"м2"}, "_rule": {"noncashPct":12, "round":10}}`. `"auto": false` — безнал вписан вручную |
| `data.js` | каталог (генерирует `tools/sync.py` из главного сайта, вручную не править) |
| `img/<арт>/*_t.jpg` | превью производителя (копия из главного сайта) |
| `img2/<арт>/` | чистые кадры без надписей: `card-*` интерьер 4:5, `face-*` фактура, `tile.jpg` текстура для 3D, `hero-*` первый экран |
| `photos-manifest.json` | откуда вырезан каждый кадр (файл, рамка, git sha исходника, метод, флаги качества) |
| `manager.html`, `manager.js`, `manager.css`, `sw.js`, `manager.webmanifest`, `icons/` | страница заявок менеджера (PWA) и service worker уведомлений |
| `apps-script/Code.gs` | Google Apps Script: таблица «Заявки дилерский сайт 2», антиспам, подписки, push (VAPID ES256 на BigInt) |
| `.github/workflows/sync.yml`, `tools/sync.py`, `tools/photolib.py` | синхронизация с главным сайтом каждые 30 минут |
| `room.bundle.js`, `src/room.src.js`, `vendor/` | 3D-примерочная (three.js) |
| `tests/` | проверки: `node tests/apps-script.test.cjs`, `node tests/site.test.mjs` (headless Chrome) |

## Как устроены данные
- **Остатки** — `app.js` при открытии страницы читает `data.json` главного сайта (CORS открыт) и обновляет цифры. В `data.js` лежит запасная копия, её обновляет синхронизация.
- **Каталог и фото** — `tools/sync.py` берёт снимок главного репозитория по коммиту (`docs/data.json`, `docs/img`) через GitHub API. Уже отобранные кадры остаются, пока исходный файл не изменился (сравнивается git blob sha). Новые фото обрабатываются автоматически (OCR-маска текста → окно без надписей). `--no-ocr` пропускает этот шаг.
- **Цены** — `prices.json` читается при каждом открытии (`?t=…`, без кэша). Редактор пишет его через `PUT /repos/…/contents/prices.json` с проверкой sha: если файл успели изменить, правки накладываются на свежую версию.
- **Заявки** — POST `text/plain` в Apps Script (без preflight) → строка в таблице → push без содержимого на подписанные устройства → service worker забирает текст (`action: notice`) по ключу менеджера.

## Разработка
```bash
python3 -m http.server 8765        # http://localhost:8765/
npm i && npm test                  # проверки (нужен Chrome: CHROME=/путь/к/chrome)
python3 tools/sync.py              # синхронизация вручную (pip install -r tools/requirements.txt)
npm run build:room                 # пересборка 3D-комнаты
```
