#!/usr/bin/env python3
"""Синхронизация второго дилерского сайта с главным (almaliceramicc/almaly-dealers).

Берёт из главного репозитория (только чтение, один снимок по коммиту main):
  docs/data.json — артикулы, названия, формат, упаковка, остатки;
  docs/img/<арт>/<фото>_t.jpg — превью производителя → img/<арт>/ ;
  docs/img/<арт>/<фото>.jpg — исходники для чистых кадров → img2/<арт>/ (только при необходимости).
Пишет data.js, photos-manifest.json, tools/sync-state.json. Файлы перезаписываются только при изменении,
поэтому, если в главном сайте ничего не поменялось, git diff пустой и коммита не будет.

Чистые кадры (img2): уже отобранные (вручную в прототипе или раньше этим скриптом) сохраняются,
пока исходный файл в главном репозитории не изменился (git blob sha). Для новых артикулов,
новых фото у артикулов без кадров и изменённых исходников запускается авто-подбор с OCR (photolib.py).
Флаг --no-ocr: не запускать OCR (новые артикулы будут с фото производителя, без чистых кадров).

Запуск: python3 tools/sync.py [--no-ocr] [--dry-run]   (из корня сайта)
"""
import json, os, re, sys, shutil, time, hashlib, tempfile, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER_REPO = os.environ.get('MASTER_REPO', 'almaliceramicc/almaly-dealers')
MASTER_BRANCH = os.environ.get('MASTER_BRANCH', 'main')
TOKEN = os.environ.get('GITHUB_TOKEN', '')
NO_OCR = '--no-ocr' in sys.argv
DRY = '--dry-run' in sys.argv
MAN_PATH = os.path.join(ROOT, 'photos-manifest.json')
STATE_PATH = os.path.join(ROOT, 'tools', 'sync-state.json')
DATA_PATH = os.path.join(ROOT, 'data.js')
log = lambda *a: print(*a, flush=True)

def http(url, api=False, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'almaly-dealers-2-sync'})
            if api:
                req.add_header('Accept', 'application/vnd.github+json')
                if TOKEN: req.add_header('Authorization', f'Bearer {TOKEN}')
            with urllib.request.urlopen(req, timeout=60) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 410) or i == tries - 1: raise
        except Exception:
            if i == tries - 1: raise
        time.sleep(2 * (i + 1))

def write_if_changed(path, text):
    old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
    if old == text: return False
    if not DRY:
        with open(path, 'w', encoding='utf-8') as f: f.write(text)
    return True

def dump(o): return json.dumps(o, ensure_ascii=False, indent=1, sort_keys=True) + '\n'

def main():
    commit = json.loads(http(f'https://api.github.com/repos/{MASTER_REPO}/commits/{MASTER_BRANCH}', api=True))['sha']
    tree = json.loads(http(f'https://api.github.com/repos/{MASTER_REPO}/git/trees/{commit}?recursive=1', api=True))
    if tree.get('truncated'): raise SystemExit('Дерево главного репозитория обрезано API — нужен другой способ (git clone)')
    blob = {x['path']: x['sha'] for x in tree['tree'] if x['type'] == 'blob'}
    raw = lambda p: http(f'https://raw.githubusercontent.com/{MASTER_REPO}/{commit}/{p}')
    tiles = json.loads(raw('docs/data.json'))['tiles']
    if len(tiles) < 5: raise SystemExit(f'В data.json главного сайта всего {len(tiles)} артикулов — похоже на ошибку, ничего не меняю')
    log(f'главный сайт: коммит {commit[:7]}, артикулов {len(tiles)}')

    man = json.load(open(MAN_PATH, encoding='utf-8')) if os.path.exists(MAN_PATH) else {}
    state = json.load(open(STATE_PATH, encoding='utf-8')) if os.path.exists(STATE_PATH) else {'files': {}}
    files = state.setdefault('files', {})
    tmp = tempfile.mkdtemp(); changes = []

    def src_ok(art, comp):  # исходник отобранного кадра всё ещё тот же
        if not comp: return False
        p = f"docs/img/{art}/{comp['src']}"; sha = blob.get(p)
        if not sha: return False
        if 'sha' not in comp: comp['sha'] = sha  # первая синхронизация: считаем текущий файл исходником
        return comp['sha'] == sha

    def fetch_src(art, name):
        p = os.path.join(tmp, art, name + '.jpg')
        if not os.path.exists(p):
            os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'wb').write(raw(f'docs/img/{art}/{name}.jpg'))
        return p

    arts = set()
    out = []
    for t in tiles:
        art = t['art']; arts.add(art)
        if not re.fullmatch(r'[A-Za-z0-9_-]+', art): log('пропуск: странный артикул', art); continue
        photos = [p for p in t.get('photos', []) if f'docs/img/{art}/{p}.jpg' in blob]
        # ---- превью производителя img/<арт>/<p>_t.jpg
        want = {}
        for p in photos:
            sp = f'docs/img/{art}/{p}_t.jpg'
            if sp in blob: want[f'img/{art}/{p}_t.jpg'] = blob[sp]
        for rel, sha in want.items():
            disk = os.path.join(ROOT, rel)
            if files.get(rel) != sha or not os.path.exists(disk):
                if not DRY:
                    os.makedirs(os.path.dirname(disk), exist_ok=True); open(disk, 'wb').write(raw('docs/' + rel.replace('_t.jpg', '_t.jpg')))
                files[rel] = sha; changes.append('+' + rel)
        d = os.path.join(ROOT, 'img', art)
        if os.path.isdir(d):
            for f in os.listdir(d):
                rel = f'img/{art}/{f}'
                if rel not in want:
                    if not DRY: os.remove(os.path.join(d, f))
                    files.pop(rel, None); changes.append('-' + rel)
        # ---- чистые кадры img2
        rec = man.get(art) or {'flags': []}
        rec.update(name=t['name'], format=t['format'], surface=t['surface'])
        face_ok, card_ok = src_ok(art, rec.get('face')), src_ok(art, rec.get('card'))
        if rec.get('face') and not face_ok: rec.pop('face'); changes.append(f'фактура {art}: исходник изменился')
        if rec.get('card') and not card_ok: rec.pop('card'); changes.append(f'интерьер {art}: исходник изменился')
        sig = hashlib.sha1(json.dumps([[p, blob[f'docs/img/{art}/{p}.jpg']] for p in photos]).encode()).hexdigest()[:12]
        if photos and (not rec.get('face') or not rec.get('card')) and rec.get('sig') != sig and not NO_OCR:
            changes.append(f'авто-подбор кадров {art}'); auto(art, t, photos, rec, fetch_src)
            rec['sig'] = sig
        rec['flags'] = flags(rec, photos)
        man[art] = rec
        out.append(record(t, rec, list(want)))
    # ---- снятые с каталога артикулы
    for art in [a for a in man if not a.startswith('_') and a not in arts]:
        man.pop(art); changes.append(f'артикул {art} удалён из главного сайта')
        for base in ('img', 'img2'):
            p = os.path.join(ROOT, base, art)
            if os.path.isdir(p) and not DRY: shutil.rmtree(p)
        for rel in [r for r in files if r.startswith(f'img/{art}/')]: files.pop(rel)
    # ---- слайды первого экрана: только с действующими исходниками
    hero = [h for h in man.get('_hero', []) if h['art'] in arts and src_ok(h['art'], h)]
    man['_hero'] = hero
    hero_out = [dict(art=h['art'], set=sset(h['files'])) for h in hero]
    if not hero_out:  # запасной вариант — интерьеры с наибольшим остатком
        hero_out = [dict(art=r['art'], set=r['card']) for r in sorted(out, key=lambda r: -r['free']) if r['card']][:5]
    js = ('/* Сгенерировано tools/sync.py из главного дилерского сайта. Цены — в prices.json. */\n'
          'window.TILES=' + json.dumps(out, ensure_ascii=False) + ';\nwindow.HERO=' + json.dumps(hero_out, ensure_ascii=False) + ';\n')
    c1 = write_if_changed(DATA_PATH, js)
    c2 = write_if_changed(MAN_PATH, dump(man))
    state['master'] = MASTER_REPO
    c3 = write_if_changed(STATE_PATH, dump(state))
    shutil.rmtree(tmp, ignore_errors=True)
    for c in changes: log(' ', c)
    log('итог:', 'data.js обновлён' if c1 else 'data.js без изменений', '| фото:', len(changes), 'изм.', '| manifest' if c2 else '', '| state' if c3 else '')

def sset(files): return sorted([[int(w), p] for w, p in files.items()])

def record(t, m, orig):
    s = t['stock']; mm = re.search(r'([\d,]+)\s*м2', t['packing']); pc = re.search(r'уп-(\d+)шт', t['packing'])
    msk = round(max(0, s.get('msk', 0) - s.get('msk_res', 0)), 2); tver = round(max(0, s.get('tver', 0) - s.get('tver_res', 0)), 2)
    face = m.get('face')
    return dict(art=t['art'], name=t['name'], format=t['format'], surface=t['surface'], packing=t['packing'], pallet=t['pallet'], is_new=bool(t.get('is_new')),
                m2pack=float(mm.group(1).replace(',', '.')) if mm else None, pcs=int(pc.group(1)) if pc else None, msk=msk, tver=tver, free=round(msk + tver, 2),
                flags=m.get('flags', []), card=sset(m['card']['files']) if m.get('card') else None, face=sset(face['files']) if face else None,
                tile=face['tile'] if face else None, tileFull=bool(face and face.get('full')), orig=orig)

def flags(rec, photos):
    f = []
    if not photos: return ['нет фото в каталоге']
    if not rec.get('face'): f.append('нет чистого кадра фактуры')
    elif min(rec['face'].get('px', [999, 999])) < 420: f.append(f"фактура малого размера ({min(rec['face']['px'])} px)")
    if not rec.get('card'): f.append('нет интерьера без текста')
    elif rec['card'].get('px', [0, 999])[1] < 700: f.append(f"интерьер малого размера ({rec['card']['px'][1]} px)")
    if rec.get('auto'): f.append('кадры подобраны автоматически')
    return f

def auto(art, t, photos, rec, fetch_src):
    """Авто-подбор недостающих кадров (интерьер 4:5 и фактура) по OCR-маске текста."""
    import photolib as L
    from PIL import Image
    d = os.path.join(ROOT, 'img2', art); rel = f'img2/{art}'
    if not DRY: os.makedirs(d, exist_ok=True)
    info = {}
    for p in photos:
        path = fetch_src(art, p)
        try: info[p] = (path, L.text_boxes(path))
        except Exception as e: log('  OCR не смог', art, p, e)
    if not rec.get('face'):
        best = None
        for p, (path, o) in info.items():  # 1) целая плитка на белом фоне
            ft = L.full_tile(path, o, t['format'])
            if ft and (not best or ft['full']):
                best = (p, ft['box'], ft['full'], 'авто: целая плитка (обрезка фона)' if ft['full'] else 'авто: центр плитки с однотонного фона')
                if ft['full']: break
        if not best:
            cands = []
            for p, (path, o) in info.items():  # 2) квадрат чистой фактуры
                f = L.find_face(path, o)
                if f: cands.append((f['px'], p, f['box']))
            if cands:
                px, p, box = max(cands); best = (p, box, False, 'авто: квадрат без текста/швов/фона')
        if best and not DRY:
            p, (x, y, w, h), full, method = best
            im = Image.open(info[p][0]).convert('RGB').crop((x, y, x + w, y + h))
            fl, tile, px = L.export_face(im, d, rel)
            rec['face'] = dict(src=f'{p}.jpg', sha=None, box=[x, y, w, h], method=method, full=full, px=px, files=fl, tile=tile)
            rec['auto'] = True
    if not rec.get('card'):
        cands = []
        for p, (path, o) in info.items():
            if L.product_shot(path): continue  # карточки товара / инфографика — не интерьер
            b = L.find_interior(path, o)
            if b: cands.append((b['frac'], p, b['box']))
        if cands and not DRY:
            frac, p, (x, y, w, h) = max(cands)
            im = Image.open(info[p][0]).convert('RGB').crop((x, y, x + w, y + h))
            fl, px = L.export_card(im, d, rel)
            rec['card'] = dict(src=f'{p}.jpg', sha=None, box=[x, y, w, h], method='авто: окно 4:5 без текста (OCR)', px=px, files=fl)
            rec['auto'] = True
    for k in ('face', 'card'):  # sha исходника — чтобы в следующий раз не пересчитывать
        if rec.get(k) and rec[k].get('sha') is None: rec[k].pop('sha')
    # лишние старые файлы img2/<арт>, на которые больше нет ссылок
    keep = {os.path.basename(v) for k in ('face', 'card') if rec.get(k) for v in rec[k]['files'].values()}
    if os.path.isdir(d) and not DRY:
        for f in os.listdir(d):
            stem = f.rsplit('.', 1)[0]
            if f != 'tile.jpg' and stem not in keep and not stem.startswith('hero'): os.remove(os.path.join(d, f))

if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main()
