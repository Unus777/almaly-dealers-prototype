"""Обработка фото для второго дилерского сайта (порт tools/*.py прототипа v3).

Чистые кадры без надписей маркетплейса:
  card-*  — интерьер 4:5 без текста (окно ищется по маске OCR);
  face-*  — квадрат чистой фактуры (без текста, швов и фона) или целая плитка с белого фона;
  tile.jpg — текстура для 3D-примерочной.
Используется только для НОВЫХ артикулов / новых фото: уже отобранные вручную кадры (photos-manifest.json)
сохраняются, пока исходный файл в главном сайте не изменился (git blob sha).
"""
import numpy as np, cv2
from PIL import Image, ImageChops, ImageFilter

_ocr = None
def _engine():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR  # тяжёлый импорт — только когда реально нужен
        _ocr = RapidOCR()
    return _ocr

def text_boxes(path):
    """Рамки текстовых блоков (детектор RapidOCR) — в двух масштабах, как в прототипе (ocr.json + ocr_full.json)."""
    im = cv2.imread(path); h, w = im.shape[:2]; boxes = []
    for s in (960 / max(h, w), 1.0):
        sm = cv2.resize(im, (max(1, int(w * s)), max(1, int(h * s)))) if s != 1.0 else im
        res, _ = _engine()(sm, use_det=True, use_cls=False, use_rec=False)
        for b in (res or []):
            pts = np.array(b if not isinstance(b[0][0], list) else b[0]) / s
            x0, y0 = pts.min(0); x1, y1 = pts.max(0); boxes.append([int(x0), int(y0), int(x1), int(y1)])
    return {'w': w, 'h': h, 'boxes': boxes}

def _median_filter(a, k):
    p = np.pad(a, k // 2, mode='edge'); return np.median(np.lib.stride_tricks.sliding_window_view(p, k), axis=1)

def _textmask(o, sc):
    w, h = o['w'], o['h']; m = np.zeros((int(h * sc) + 1, int(w * sc) + 1), np.uint8)
    for x0, y0, x1, y1 in o['boxes']:
        bh = y1 - y0
        X0 = max(0, x0 - 0.05 * w); X1 = min(w, x1 + 0.05 * w); Y0 = max(0, y0 - max(0.09 * h, bh * 2.5)); Y1 = min(h, y1 + 0.03 * h)
        m[int(Y0 * sc):int(Y1 * sc) + 1, int(X0 * sc):int(X1 * sc) + 1] = 1
    return m

def _best_window(mask, ar, minfrac):
    H, W = mask.shape; ii = cv2.integral(mask)
    for hh in np.arange(1.0, minfrac - 1e-6, -0.02):
        wh = int(H * hh); ww = int(wh * ar)
        if ww > W: ww = W; wh = int(ww / ar)
        best = None
        for y in range(0, H - wh + 1, max(1, H // 60)):
            for x in range(0, W - ww + 1, max(1, W // 60)):
                if ii[y + wh, x + ww] - ii[y, x + ww] - ii[y + wh, x] + ii[y, x] == 0:
                    c = abs((x + ww / 2) / W - .5) + abs((y + wh / 2) / H - .58) * .7
                    if best is None or c < best[0]: best = (c, x, y, ww, wh)
        if best: return best[1:]
    return None

def product_shot(path):
    """Фото «плитка на светлом однотонном фоне» (карточка товара/инфографика): минимум 3 стороны — светлые и ровные."""
    a = np.asarray(Image.open(path).convert('L').resize((200, 200)), np.float32)
    sides = [a[:6], a[-6:], a[:, :6], a[:, -6:]]
    return sum(1 for x in sides if x.mean() > 185 and x.std() < 14) >= 3 or sum(1 for x in sides if x.mean() > 240 and x.std() < 3) >= 2

def _bg_level(path):
    a = np.asarray(Image.open(path).convert('L').resize((200, 200)), np.float32)
    e = np.concatenate([a[:4].ravel(), a[-4:].ravel(), a[:, :4].ravel(), a[:, -4:].ravel()])
    return float(np.median(e))

def trim(im, thr=10):
    """Обрезка однотонного поля вокруг плитки (цвет фона — медиана рамки), минус 2,5 % по краям."""
    a = np.asarray(im.convert('RGB'), np.float32); h, w = a.shape[:2]
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = np.median(border, 0); diff = np.abs(a - bg).max(2)
    m = cv2.medianBlur((diff > thr).astype(np.uint8) * 255, 5)
    rows, cols = np.where(m.any(1))[0], np.where(m.any(0))[0]
    if not len(rows) or not len(cols): return im, None
    x0, x1, y0, y1 = cols[0], cols[-1] + 1, rows[0], rows[-1] + 1
    bw, bh = x1 - x0, y1 - y0
    if bw * bh > .97 * w * h: return im, None
    box = (x0 + int(bw * .025), y0 + int(bh * .025), x1 - int(bw * .025), y1 - int(bh * .025))
    return im.crop(box), [int(box[0]), int(box[1]), int(box[2] - box[0]), int(box[3] - box[1])]

def find_interior(path, o):
    sc = 240 / o['h']; m = _textmask(o, sc); b = _best_window(m, 0.8, 0.45)
    return dict(box=[int(v / sc) for v in b], frac=round(b[3] / m.shape[0], 3)) if b else None

def find_face(path, o, start=0.8):
    im = cv2.imread(path); w, h = o['w'], o['h']; sc = 200 / h
    sm = cv2.resize(im, (int(w * sc), int(h * sc)), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(sm, cv2.COLOR_BGR2LAB).astype(np.float32)
    tm = _textmask(o, sc)[:sm.shape[0], :sm.shape[1]]; H, W = sm.shape[:2]
    for frac in np.arange(start, 0.24, -0.03):
        s = int(min(H, W) * frac); best = None
        for y in range(0, H - s + 1, max(2, H // 40)):
            for x in range(0, W - s + 1, max(2, W // 40)):
                if tm[y:y + s, x:x + s].any(): continue
                win = lab[y:y + s, x:x + s]; bl = cv2.resize(win, (6, 6), interpolation=cv2.INTER_AREA)
                sL = bl[..., 0].std(); sab = bl[..., 1:].std(axis=(0, 1)).max()
                g = cv2.resize(win[..., 0], (24, 24), interpolation=cv2.INTER_AREA); gx = np.abs(np.diff(g, axis=1)).max(); gy = np.abs(np.diff(g, axis=0)).max()
                if not (sL < 7 and sab < 3 and max(gx, gy) < 38): continue
                L = win[..., 0]; cp = L.mean(0); rp = L.mean(1)
                hp = max(np.abs(cp - _median_filter(cp, 11)).max(), np.abs(rp - _median_filter(rp, 11)).max())
                if hp > 3.2: continue
                score = sL + sab * 2 + max(gx, gy) * .25 + hp * 2
                if best is None or score < best[0]: best = (score, x, y, s)
        if best:
            _, x, y, s = best; return dict(box=[int(x / sc), int(y / sc), int(s / sc), int(s / sc)], px=int(s / sc))
    return None

def full_tile(path, o, fmt):
    """Плитка целиком на однотонном фоне, без текста внутри: идеальная фактура для комнаты.
    Если пропорции не совпали с форматом (тень, ракурс) — берём центральный квадрат плитки."""
    if not product_shot(path): return None
    im, box = trim(Image.open(path).convert('RGB'))
    if not box: return None
    x, y, w, h = box
    for x0, y0, x1, y1 in o['boxes']:
        if x0 < x + w and x1 > x and y0 < y + h and y1 > y: return None
    if min(w, h) < 300: return None
    if _bg_level(path) < 245:  # светлая плитка на сером фоне: край по маске ненадёжен — только центр
        s = int(min(w, h) * .72); return dict(box=[x + (w - s) // 2, y + (h - s) // 2, s, s], full=False)
    fw, fh = [int(v) for v in fmt.split('×')]; want = min(fw, fh) / max(fw, fh); ar = w / h
    if abs(ar - want) / want < .12 or abs(ar - 1 / want) / want < .12: return dict(box=box, full=True)
    s = int(min(w, h) * .88); return dict(box=[x + (w - s) // 2, y + (h - s) // 2, s, s], full=False)

def grade(im, strength=.6):
    a = np.asarray(im).astype(np.float32); L = a.mean(2); lo, hi = np.percentile(L, .4), np.percentile(L, 99.6)
    hi = max(hi, 235) if hi > 225 else hi  # не «выжигать» светлые мраморы
    s = min(1.18, 250 / max(1, hi - lo)); lo = min(lo, 255 - 250 / s) if s > 1 else 0
    b = (a - lo) * s; a = a + (b - a) * strength
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def save(im, base, rel, sizes):
    """base — путь на диске без расширения, rel — тот же путь относительно корня сайта."""
    out = {}
    for w in sorted(set(min(w, im.width) for w in sizes), reverse=True):
        r = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS) if w != im.width else im.copy()
        r = r.filter(ImageFilter.UnsharpMask(1.1, 40, 2))
        r.save(f'{base}-{r.width}.webp', 'WEBP', quality=82, method=5); r.save(f'{base}-{r.width}.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
        out[str(r.width)] = f'{rel}-{r.width}'
    return out

def export_face(im, d, rel):
    im = grade(im, .5); files = save(im, f'{d}/face', f'{rel}/face', [1000, 520])
    t2 = im.copy(); t2.thumbnail((1400, 1400)); t2.save(f'{d}/tile.jpg', quality=88)
    return files, f'{rel}/tile.jpg', [im.width, im.height]

def export_card(im, d, rel):
    im = im.resize((round(im.height * .8), im.height)) if abs(im.width / im.height - .8) > .01 else im
    im = grade(im, .35); return save(im, f'{d}/card', f'{rel}/card', [900, 560]), [im.width, im.height]
