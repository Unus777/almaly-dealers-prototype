(() => {
'use strict';
const T = window.TILES || [], HERO = window.HERO || [];
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const fmt = n => n == null || isNaN(n) ? '—' : nf0.format(Math.round(n)) + ' ₽';
const fmtN = (n, d = 0) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const byArt = Object.fromEntries(T.map(t => [t.art, t]));
const big = set => set && set[set.length - 1][1], small = set => set && set[0][1];
T.forEach(t => { t.icon = t.face ? small(t.face) + '.jpg' : t.card ? small(t.card) + '.jpg' : ''; });

/* ---------- изображения: <picture> с WebP и srcset ---------- */
function pic(set, sizes, alt, eager) {
  if (!set) return '';
  const ss = ext => set.map(([w, p]) => `${p}.${ext} ${w}w`).join(', ');
  return `<picture><source type="image/webp" srcset="${ss('webp')}" sizes="${sizes}"><img src="${set[0][1]}.jpg" srcset="${ss('jpg')}" sizes="${sizes}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
}

/* ---------- ЦЕНЫ: prices.json в репозитории сайта (общие для всех) ---------- */
const CFG = self.SITE_CONFIG || {}, CT = CFG.CONTACTS || {};
const MKEY = 'almaly_d2_mode', CART_KEY = 'almaly_d2_cart';
const DEF_RULE = { noncashPct: 12, round: 10 };
let PR = { _rule: { ...DEF_RULE } }, CUR = PR, pricesReady = false;
const roundTo = (v, r) => Math.round(v / r + 1e-9) * r;
const ruleOf = (P = CUR) => ({ ...DEF_RULE, ...(P._rule || {}) });
const ruleCalc = (cash, r = ruleOf()) => roundTo(cash * (1 + (+r.noncashPct || 0) / 100), +r.round || 1);
function price(t, P = CUR) {
  const it = P[t.art];
  if (!it) return { cash: null, noncash: null, none: true };
  const cash = +it.cash > 0 ? +it.cash : null;
  let noncash = it.auto === false ? (+it.noncash > 0 ? +it.noncash : null) : (cash ? ruleCalc(cash, ruleOf(P)) : null);
  return { cash, noncash, none: !cash && !noncash };
}
function cleanPrices(o) {  // защита от битого файла: только числа > 0
  const out = { _rule: { ...DEF_RULE, ...((o && o._rule) || {}) } };
  if (o && o._updated) out._updated = o._updated;
  for (const [k, v] of Object.entries(o || {})) if (!k.startsWith('_') && v && typeof v === 'object') {
    const it = {}; if (+v.cash > 0) it.cash = +v.cash; if (+v.noncash > 0) it.noncash = +v.noncash; if (v.auto === false) it.auto = false; it.unit = v.unit || 'м2';
    if (it.cash || it.noncash) out[k] = it;
  }
  return out;
}
async function loadPrices(tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch('prices.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      return cleanPrices(await r.json());
    } catch (e) { if (i === tries - 1) return null; await new Promise(r => setTimeout(r, 1200)); }
  }
}
let mode = 'cash'; try { if (localStorage.getItem(MKEY) === 'noncash') mode = 'noncash'; } catch (e) {}

/* ---------- утилиты анимации ---------- */
function tweenNum(el, to, o = {}) {
  const from = parseFloat(el.dataset.v || 0), d = o.dec || 0, dur = RM ? 0 : (o.dur || 650), t0 = performance.now(), pre = o.prefix || '', suf = o.suffix || '';
  el.dataset.v = to; cancelAnimationFrame(el._raf);
  const step = now => { const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 4); el.textContent = pre + fmtN(from + (to - from) * e, d) + suf; if (k < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2600); }

/* ---------- прокрутка: nav, прогресс, параллакс (rAF) ---------- */
const nav = $('#nav'), prog = $('#progress'), slidesEl = $('#heroSlides');
let ticking = false;
function onScroll() {
  ticking = false; const y = scrollY;
  nav.classList.toggle('scrolled', y > 30);
  const h = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
  if (!RM && y < innerHeight * 1.1) slidesEl.style.transform = `translate3d(0,${y * .28}px,0)`;
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

/* ---------- HERO ---------- */
const dots = $('#heroDots');
HERO.forEach((h, i) => {
  const d = document.createElement('div'); d.className = 'hero-slide'; d.style.setProperty('--ox', [62, 40, 55, 70, 45][i % 5] + '%');
  d.innerHTML = pic(h.set, '100vw', '', i === 0); slidesEl.appendChild(d);
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Слайд ' + (i + 1) + ': ' + byArt[h.art].name); b.onclick = () => showSlide(i, true); dots.appendChild(b);
});
let cur = -1, timer;
function showSlide(i, manual) {
  const ss = $$('.hero-slide'), ds = $$('#heroDots button'); if (!ss.length) return;
  ss.forEach((s, k) => s.classList.toggle('on', k === i));
  ds.forEach((s, k) => { s.classList.remove('on'); if (k === i) { void s.offsetWidth; s.classList.add('on'); } });
  cur = i; const t = byArt[HERO[i].art], chip = $('#heroChip');
  chip.classList.add('swap');
  setTimeout(() => { $('#chipImg').src = t.icon; $('#chipArt').textContent = `${t.art} · ${t.format} · ${t.surface}`; $('#chipName').textContent = t.name; setChip(); chip.classList.remove('swap'); }, manual || cur === 0 && !timer ? 120 : 450);
  clearTimeout(timer); if (!RM) timer = setTimeout(() => showSlide((cur + 1) % HERO.length), 7000);
}
function setChip() { if (cur < 0) return; const t = byArt[HERO[cur].art], p = price(t); $('#chipPrice').textContent = !pricesReady ? '' : p[mode] ? `${mode === 'cash' ? 'Наличные' : 'Безнал'} ${fmt(p[mode])} / м²` : 'Цена по запросу'; }
(() => { const h = $('#heroTitle'), w = h.dataset.text.split(' '); h.innerHTML = w.map((x, i) => `<span class="w${i >= w.length - 2 ? ' accent' : ''}" style="--i:${i}"><span>${esc(x)}</span></span>`).join(''); h.setAttribute('aria-label', h.dataset.text); })();
showSlide(0);
if (FINE && !RM) { const inner = $('.hero-inner'), chip = $('#heroChip'); let px = 0, py = 0, tx = 0, ty = 0, run = false;
  const loop = () => { px += (tx - px) * .07; py += (ty - py) * .07; inner.style.transform = `translate3d(${px * -16}px,${py * -10}px,0)`; chip.style.translate = `${px * 22}px ${py * 16}px`; run = Math.abs(tx - px) + Math.abs(ty - py) > .001; if (run) requestAnimationFrame(loop); };
  $('.hero').addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; if (!run) { run = true; requestAnimationFrame(loop); } }); }

/* ---------- MARQUEE, счётчики ---------- */
const mq = ['Отгрузка в день заказа', 'Ежедневно, без выходных', 'Склад с ж/д тупиком в Твери', 'Склад в Москве', 'Своя доставка', 'Личный менеджер', 'Водопоглощение 0,2%', 'PEI IV', 'Свой дизайн от 1000 м² — от 20 дней'];
$('#marquee').innerHTML = [...mq, ...mq].map(s => `<span>${s}</span>`).join('');
$('#cntArts').dataset.to = T.length;
$('#cntStock').dataset.to = Math.round(T.reduce((s, t) => s + t.free, 0));
// резервируем ширину счётчиков, чтобы не было сдвига вёрстки
$$('.count').forEach(c => { c.textContent = (c.dataset.prefix || '') + fmtN(+c.dataset.to, +(c.dataset.dec || 0)) + (c.dataset.suffix || ''); c.style.minWidth = c.offsetWidth + 'px'; c.style.display = 'inline-block'; c.textContent = (c.dataset.prefix || '') + '0' + (c.dataset.suffix || ''); });

/* ---------- REVEAL ---------- */
const runCount = c => tweenNum(c, +c.dataset.to, { dec: +(c.dataset.dec || 0), prefix: c.dataset.prefix || '', suffix: c.dataset.suffix || '', dur: 1900 });
const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; const el = e.target; el.classList.add('in'); io.unobserve(el); $$('.count', el).forEach(runCount); }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
const observe = el => { if (RM) { el.classList.add('in'); $$('.count', el).forEach(c => { c.textContent = (c.dataset.prefix || '') + fmtN(+c.dataset.to, +(c.dataset.dec || 0)) + (c.dataset.suffix || ''); }); } else io.observe(el); };
$$('.reveal').forEach(observe);

/* ---------- переключатель НАЛ / БЕЗНАЛ ---------- */
const pill = $('.paytoggle-pill');
function placePill() { const b = $(`.paytoggle button[data-mode="${mode}"]`); pill.style.width = b.offsetWidth + 'px'; pill.style.transform = `translateX(${b.offsetLeft}px)`; }
function setMode(m, user) {
  mode = m; try { localStorage.setItem(MKEY, m); } catch (e) {}
  $$('.paytoggle button').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === m));
  placePill(); refreshPrices(); setChip(); renderTotals(); roomPrice();
  if ($('#sort').value.startsWith('price')) applyFilters();
  if (user) toast(m === 'cash' ? 'Показываем цены за наличный расчёт' : 'Показываем цены по безналу (с НДС)');
}
$('.paytoggle').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.mode !== mode) setMode(b.dataset.mode, true); });
addEventListener('resize', placePill);

/* ---------- КАТАЛОГ ---------- */
const grid = $('#grid'); let maxFree = Math.max(...T.map(t => t.free), 1);
const stockHTML = t => `<div class="stockrow"><span>${t.free > 0 ? `Свободно <b>${fmtN(t.free, 0)} м²</b>` : '<b>Под заказ</b>'}</span><span>Мск ${fmtN(t.msk, 0)} · Тверь ${fmtN(t.tver, 0)}</span></div><div class="stockbar"><i style="--w:${Math.max(2, t.free / maxFree * 100).toFixed(1)}%"></i></div>`;
const filters = { format: 'all', surface: 'all', isNew: false, inStock: false, q: '' };
[...new Set(T.map(t => t.surface))].sort().forEach(s => $('#surf').insertAdjacentHTML('beforeend', `<option value="${esc(s)}">${esc(s)}</option>`));
function priceBlock(t) {
  if (!pricesReady) return '<div class="price skel"><div class="lbl"><span>Наличные</span></div><b>&nbsp;</b><span class="per">&nbsp;</span></div><div class="price skel"><div class="lbl"><span>Безнал с НДС</span></div><b>&nbsp;</b><span class="per">&nbsp;</span></div>';
  const p = price(t), pk = t.m2pack;
  if (p.none) return `<div class="price ask wide active"><div class="lbl"><span>Цена</span></div><b>по запросу</b><span class="per">менеджер пришлёт расчёт за нал и безнал</span></div>`;
  const one = (m, label) => p[m]
    ? `<div class="price${mode === m ? ' active' : ''}" data-m="${m}"><div class="lbl"><span>${label}</span></div><b class="pv" data-v="0">${fmt(p[m])}</b><span class="per">за м² · <span class="pp">${pk ? fmt(p[m] * pk) : '—'}</span> уп.</span></div>`
    : `<div class="price ask${mode === m ? ' active' : ''}" data-m="${m}"><div class="lbl"><span>${label}</span></div><b>по запросу</b><span class="per">уточнит менеджер</span></div>`;
  return one('cash', 'Наличные') + one('noncash', 'Безнал с НДС');
}
const priceSig = t => { const p = price(t); return pricesReady ? `${p.cash}|${p.noncash}` : 'skel'; };
const CARD_SIZES = '(max-width:640px) 92vw, (max-width:1000px) 46vw, 340px';
function mediaHTML(t) {
  if (!t.card && !t.face) return `<div class="noph"><b>${esc(t.name)}</b><span>Фото готовится</span></div>`;
  const main = t.card || t.face, alt = t.card && t.face ? t.face : null;
  return `<div class="main">${pic(main, CARD_SIZES, `${t.name}${t.card ? ' в интерьере' : ' — фактура'}`)}</div>${alt ? `<div class="alt">${pic(alt, CARD_SIZES, `Фактура ${t.name}`)}</div><div class="swatch-chip"><img src="${t.icon}" alt="" loading="lazy" decoding="async"></div>` : ''}`;
}
function card(t) {
  const el = document.createElement('article'); el.className = 'card'; el.dataset.art = t.art;
  el.innerHTML = `<div class="card-media" data-open role="button" tabindex="0" aria-label="Подробнее: ${esc(t.name)}">${mediaHTML(t)}<div class="card-tags">${t.is_new ? '<span class="tag new">Новинка</span>' : ''}<span class="tag">${t.format}</span>${t.free <= 0 ? '<span class="tag out">Под заказ</span>' : ''}${t.card && t.face ? '<span class="tag view">Фактура</span>' : ''}</div></div>
  <div class="card-body"><div class="card-art">${t.art}</div><h3>${esc(t.name)}</h3><div class="card-meta">${t.surface}${t.m2pack ? ' · ' + fmtN(t.m2pack, 2) + ' м² в упаковке' : ''}</div>
  <div class="stock">${stockHTML(t)}</div>
  <div class="prices" data-sig="${priceSig(t)}">${priceBlock(t)}</div>
  <div class="card-actions"><button type="button" class="btn ghost" data-open>Подробнее</button><button type="button" class="btn primary" data-add>В заявку</button></div></div>`;
  return el;
}
const frag = document.createDocumentFragment(); T.forEach(t => frag.appendChild(card(t))); grid.appendChild(frag);
$$('.card', grid).forEach(observe);
function refreshPrices() {
  $$('.prices[data-sig]').forEach(box => {
    const c = box.closest('[data-art]'), t = c && byArt[c.dataset.art]; if (!t) return;
    const sig = priceSig(t);
    if (box.dataset.sig !== sig) {
      const old = {}; $$('.price[data-m] .pv', box).forEach(pv => old[pv.closest('.price').dataset.m] = +pv.dataset.v || 0);
      box.dataset.sig = sig; box.innerHTML = priceBlock(t); const p = price(t);
      $$('.price[data-m] .pv', box).forEach(pv => { const m = pv.closest('.price').dataset.m; pv.dataset.v = old[m] || 0; tweenNum(pv, p[m], { suffix: ' ₽', dur: 900 }); });
    }
    $$('.price[data-m]', box).forEach(b => b.classList.toggle('active', b.dataset.m === mode));
  });
}
function applyFilters(animate = true) {
  const cards = $$('.card', grid), first = new Map();
  if (animate && !RM) cards.forEach(c => { if (!c.classList.contains('hide')) { const r = c.getBoundingClientRect(); if (r.bottom > -200 && r.top < innerHeight + 200) first.set(c, r); } });
  const q = filters.q.trim().toLowerCase(), sort = $('#sort').value;
  const list = T.slice().sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ru') : sort === 'price' ? (price(a)[mode] || 1e12) - (price(b)[mode] || 1e12) : sort === 'price-desc' ? (price(b)[mode] || -1) - (price(a)[mode] || -1) : (!!(b.card || b.face) - !!(a.card || a.face)) || (b.free - a.free));
  let n = 0;
  list.forEach(t => {
    const c = grid.querySelector(`[data-art="${t.art}"]`);
    const ok = !t.gone && (filters.format === 'all' || t.format === filters.format) && (filters.surface === 'all' || t.surface === filters.surface) && (!filters.isNew || t.is_new) && (!filters.inStock || t.free > 0) && (!q || (t.name + ' ' + t.art).toLowerCase().includes(q));
    c.classList.toggle('hide', !ok); if (ok) n++; grid.appendChild(c);
  });
  $('#found').textContent = `Показано ${n} из ${T.filter(t => !t.gone).length}`; $('#empty').hidden = n > 0;
  if (!animate || RM) return;
  let k = 0;
  $$('.card:not(.hide)', grid).forEach(c => {
    const l = c.getBoundingClientRect(); if (l.top > innerHeight + 100 || l.bottom < -100) { c.classList.add('in'); return; }
    const f = first.get(c); c.classList.add('in');
    if (f) { const dx = f.left - l.left, dy = f.top - l.top; if (Math.abs(dx) + Math.abs(dy) > 1) c.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' }); }
    else c.animate([{ opacity: 0, translate: '0 24px', scale: .96 }, { opacity: 1, translate: '0 0', scale: 1 }], { duration: 600, delay: Math.min(k++, 8) * 45, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
  });
}
$('#fmtSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; filters.format = b.dataset.v; $$('#fmtSeg button').forEach(x => x.classList.toggle('on', x === b)); applyFilters(); });
$('#surf').addEventListener('change', e => { filters.surface = e.target.value; applyFilters(); });
for (const [id, k] of [['fNew', 'isNew'], ['fStock', 'inStock']]) $('#' + id).addEventListener('click', e => { filters[k] = !filters[k]; e.currentTarget.setAttribute('aria-pressed', filters[k]); applyFilters(); });
let qt; $('#q').addEventListener('input', e => { filters.q = e.target.value; clearTimeout(qt); qt = setTimeout(applyFilters, 180); });
$('#sort').addEventListener('change', () => applyFilters());
applyFilters(false);
// 3D-наклон и блик (rAF)
if (FINE && !RM) { let tc = null, ev = null, pend = false;
  grid.addEventListener('pointermove', e => { ev = e; if (!pend) { pend = true; requestAnimationFrame(() => { pend = false; const c = ev.target.closest('.card'); if (!c) return; if (tc && tc !== c) reset(tc); tc = c;
    const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    c.style.setProperty('--ry', ((x - .5) * 7).toFixed(2) + 'deg'); c.style.setProperty('--rx', ((.5 - y) * 5).toFixed(2) + 'deg'); c.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); c.style.setProperty('--gy', (y * 100).toFixed(1) + '%'); }); } });
  const reset = c => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); };
  grid.addEventListener('pointerleave', () => { if (tc) reset(tc); tc = null; });
  grid.addEventListener('pointerout', e => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { reset(c); if (tc === c) tc = null; } }); }
grid.addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; const t = byArt[c.dataset.art];
  if (e.target.closest('[data-add]')) addToCart(t, 10, e.target.closest('[data-add]')); else if (e.target.closest('[data-open]')) openProduct(t); });
grid.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card-media')) { e.preventDefault(); openProduct(byArt[e.target.closest('.card').dataset.art]); } });

/* ---------- карточка товара ---------- */
const modal = $('#modal'); let lastFocus = null;
function openProduct(t) {
  const clean = []; if (t.card) clean.push({ set: t.card, label: 'В интерьере' }); if (t.face) clean.push({ set: t.face, label: 'Фактура' });
  const thumbs = clean.map((g, i) => `<button type="button" class="${i ? '' : 'on'}" data-i="${i}" aria-label="${g.label}"><img src="${small(g.set)}.jpg" alt=""></button>`).join('')
    + (t.orig.length ? `<span class="sep">производитель</span>` + t.orig.map(o => `<button type="button" data-o="${o}" aria-label="Фото производителя"><img src="${o}" alt="" loading="lazy"></button>`).join('') : '');
  const mainHTML = clean.length ? pic(clean[0].set, '(max-width:1000px) 100vw, 560px', t.name, true) : (t.orig[0] ? `<img src="${t.orig[0]}" alt="">` : `<div class="noph"><b>${esc(t.name)}</b><span>Фото готовится</span></div>`);
  $('#modalBody').innerHTML = `<div class="pd" data-art="${t.art}"><div class="pd-gal"><div class="pd-main" id="pdMain">${mainHTML}</div><div class="pd-thumbs">${thumbs}</div></div>
  <div class="pd-info"><p class="eyebrow">${t.art}${t.is_new ? ' · новинка' : ''}</p><h2 id="pdTitle">${esc(t.name)}</h2>
  <div class="prices" data-sig="${priceSig(t)}">${priceBlock(t)}</div>
  <div class="specs"><div><small>Формат</small>${t.format} см</div><div><small>Поверхность</small>${t.surface}</div><div><small>Упаковка</small>${esc(t.packing)}</div><div><small>Паллет</small>${esc(t.pallet)}</div><div><small>Свободно в Москве</small>${fmtN(t.msk, 2)} м²</div><div><small>Свободно в Твери</small>${fmtN(t.tver, 2)} м²</div></div>
  <div class="calc"><div class="calc-row"><label for="calcM2">Площадь объекта</label><input class="num-in" type="number" id="calcM2" value="50" min="1" inputmode="decimal"> м² <span>+ 5% запас</span></div><div class="calc-out" id="calcOut"></div>
  <button type="button" class="btn primary wide" id="calcAdd"><span>Добавить в заявку</span><i aria-hidden="true">→</i></button></div></div></div>`;
  const out = $('#calcOut'), inp = $('#calcM2');
  const calc = () => { const need = Math.max(0, +inp.value || 0) * 1.05, packs = t.m2pack ? Math.ceil(need / t.m2pack) : 0, m2 = packs * (t.m2pack || 0), p = price(t);
    out.innerHTML = p.none || !pricesReady ? `<div class="price ask wide active"><div class="lbl"><span>${packs} уп. · ${fmtN(m2, 2)} м²</span></div><b>Цена по запросу</b><span class="per">добавьте в заявку — менеджер пришлёт расчёт</span></div>`
      : ['cash', 'noncash'].map(m => `<div class="price${m === mode ? ' active' : ''}${p[m] ? '' : ' ask'}"><div class="lbl"><span>${m === 'cash' ? 'Наличные' : 'Безнал с НДС'}</span></div><b>${p[m] ? fmt(p[m] * m2) : 'по запросу'}</b><span class="per">${packs} уп. · ${fmtN(m2, 2)} м²</span></div>`).join(''); return packs; };
  out.calc = calc;
  inp.oninput = calc; calc();
  $('#calcAdd').onclick = e => { addToCart(t, calc(), e.currentTarget); closeModal(); };
  $$('.pd-thumbs button').forEach(b => b.onclick = () => { $$('.pd-thumbs button').forEach(x => x.classList.toggle('on', x === b));
    $('#pdMain').innerHTML = b.dataset.o ? `<img src="${b.dataset.o}" alt="Фото производителя">` : pic(clean[+b.dataset.i].set, '(max-width:1000px) 100vw, 560px', t.name, true); });
  lastFocus = document.activeElement; modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; setTimeout(() => $('.x', modal).focus({ preventScroll: true }), 50);
}
function closeModal() { if (!modal.classList.contains('open')) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; lastFocus && lastFocus.focus({ preventScroll: true }); }
modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDrawer(); if (location.hash === '#admin') closeAdmin(); } });

/* ---------- ЗАЯВКА (в упаковках) ---------- */
let cart = [];
try { cart = (JSON.parse(localStorage.getItem(CART_KEY)) || []).filter(c => byArt[c.art] && c.packs > 0); } catch (e) {}
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} };
function setBadge() { const b = $('#cartCount'); b.textContent = cart.length; b.classList.toggle('has', cart.length > 0); }
function addToCart(t, packs, from) {
  packs = Math.max(1, packs | 0);
  const ex = cart.find(c => c.art === t.art); if (ex) ex.packs += packs; else cart.push({ art: t.art, packs });
  saveCart(); const b = $('#cartCount'); setBadge(); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  if (from && t.icon && !RM) { const r = from.getBoundingClientRect(), to = $('#cartBtn').getBoundingClientRect(), f = document.createElement('img'); f.className = 'fly'; f.src = t.icon; f.alt = ''; document.body.appendChild(f);
    const x0 = r.left + r.width / 2 - 28, y0 = r.top + r.height / 2 - 28, x1 = to.left + to.width / 2 - 28, y1 = to.top + to.height / 2 - 28;
    f.animate([{ transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 1 }, { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 80}px) scale(.8) rotate(10deg)`, opacity: 1, offset: .5 }, { transform: `translate(${x1}px,${y1}px) scale(.3) rotate(25deg)`, opacity: .2 }], { duration: 850, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => f.remove(); }
  toast(`${t.name}: ${packs} уп. в заявке`); renderCart();
}
const CART_EMPTY = '<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 5h2.2l2 10.2h10.1l2-7.4H7"/><circle cx="9.5" cy="19.3" r="1.3"/><circle cx="16.8" cy="19.3" r="1.3"/></svg>Заявка пока пустая.<br>Добавьте плитку из каталога.</div>';
function renderCart() {
  const L = $('#cartList'); setBadge();
  if (!cart.length) { L.innerHTML = CART_EMPTY; $('#cartTotal').innerHTML = ''; if (cartStep === 'form') showStep('list'); return; }
  L.innerHTML = cart.map(c => { const t = byArt[c.art], p = price(t); return `<div class="ci" data-art="${t.art}"><img src="${t.icon}" alt=""><div><b>${esc(t.name)}</b><br><small>${t.art} · ${t.format}${pricesReady && p.none ? ' · цена по запросу' : ''}</small><br><span class="stepper"><button type="button" data-d="-1" aria-label="Меньше">−</button><input type="number" min="1" value="${c.packs}" aria-label="Упаковок"><button type="button" data-d="1" aria-label="Больше">+</button></span><span class="m2">уп. · ${fmtN(c.packs * (t.m2pack || 0), 2)} м²</span></div><button type="button" class="del" aria-label="Убрать">×</button></div>`; }).join('');
  renderTotals();
}
function cartCalc() {
  let cash = 0, noncash = 0, ask = 0, packs = 0, m2 = 0; const items = cart.map(c => {
    const t = byArt[c.art], p = price(t), q = c.packs * (t.m2pack || 0); packs += c.packs; m2 += q;
    if (!p[mode]) ask++; if (p.cash) cash += p.cash * q; if (p.noncash) noncash += p.noncash * q;
    return { art: t.art, name: t.name, format: t.format, surface: t.surface, packs: c.packs, m2: Math.round(q * 100) / 100, cash: p.cash, noncash: p.noncash, sum: p[mode] ? Math.round(p[mode] * q) : null };
  });
  return { items, cash: Math.round(cash), noncash: Math.round(noncash), chosen: Math.round(mode === 'cash' ? cash : noncash), ask, packs, m2: Math.round(m2 * 100) / 100 };
}
function totalsHTML(k) {
  const all = k.ask === k.items.length;
  if (all) return `<div class="tot active"><span>Итого</span><b>по запросу</b></div><p class="cart-note">Цены на эти позиции уточнит менеджер — он пришлёт расчёт за наличный и безналичный расчёт.</p>`;
  const any = mode => cart.some(c => price(byArt[c.art])[mode]);
  return `<div class="tot${mode === 'cash' ? ' active' : ''}"><span>Итого, наличные</span><b>${any('cash') ? fmt(k.cash) : 'по запросу'}</b></div><div class="tot${mode === 'noncash' ? ' active' : ''}"><span>Итого, безнал с НДС</span><b>${any('noncash') ? fmt(k.noncash) : 'по запросу'}</b></div>${k.ask ? `<p class="cart-note">Без ${k.ask} ${plural(k.ask, 'позиции', 'позиций', 'позиций')} с ценой по запросу — их стоимость добавит менеджер.</p>` : ''}`;
}
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
function renderTotals() {
  if (!cart.length) return;
  const k = cartCalc();
  $('#cartTotal').innerHTML = totalsHTML(k) + `<button type="button" class="btn primary wide" id="sendCart"><span>Оформить заявку</span><i aria-hidden="true">→</i></button>`;
  $('#sendCart').onclick = () => showStep('form');
  if (cartStep === 'form') $('#rqSummary').innerHTML = summaryHTML(k);
}
const cartList = $('#cartList');
const setPacks = (row, v) => { const c = cart.find(x => x.art === row.dataset.art), t = byArt[c.art]; c.packs = Math.max(1, Math.round(v) || 1); saveCart(); $('input', row).value = c.packs; $('.m2', row).textContent = `уп. · ${fmtN(c.packs * (t.m2pack || 0), 2)} м²`; renderTotals(); };
cartList.addEventListener('click', e => { const row = e.target.closest('.ci'); if (!row) return;
  const d = e.target.closest('[data-d]'); if (d) setPacks(row, +$('input', row).value + +d.dataset.d);
  if (e.target.closest('.del')) { row.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(30px)' }], { duration: 250 }).onfinish = () => { cart = cart.filter(c => c.art !== row.dataset.art); saveCart(); renderCart(); }; } });
cartList.addEventListener('change', e => { const row = e.target.closest('.ci'); if (row && e.target.matches('input')) setPacks(row, +e.target.value); });
const drawer = $('#drawer');
const openDrawer = () => { if (cartStep === 'done') showStep('list'); renderCart(); drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); };
function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
$('#cartBtn').onclick = openDrawer; $('#ctaCart').onclick = openDrawer;
drawer.addEventListener('click', e => { if (e.target === drawer || e.target.closest('[data-close-drawer]')) closeDrawer(); });

/* ---------- ОТПРАВКА ЗАЯВКИ: Google Apps Script → таблица + push менеджеру ---------- */
let cartStep = 'list', formOpenedAt = 0, sending = false;
const form = $('#cartForm'), doneBox = $('#cartDone');
function showStep(step) {
  cartStep = step;
  $('#cartList').hidden = $('#cartTotal').hidden = step !== 'list'; form.hidden = step !== 'form'; doneBox.hidden = step !== 'done';
  $('#drawerTitle').textContent = step === 'form' ? 'Оформление' : step === 'done' ? 'Готово' : 'Заявка';
  if (step === 'form') {
    formOpenedAt = Date.now(); $('#rqSummary').innerHTML = summaryHTML(cartCalc());
    $$('input[name="rqMode"]', form).forEach(r => r.checked = r.value === mode);
    $('#rqErr').hidden = true; setTimeout(() => $('#rqName').focus({ preventScroll: true }), 350);
  }
  const box = step === 'form' ? form : step === 'done' ? doneBox : $('#cartList');
  if (!RM) box.animate([{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
}
const summaryHTML = k => `<div class="rq-sum"><span>${k.items.length} ${plural(k.items.length, 'позиция', 'позиции', 'позиций')} · ${fmtN(k.packs)} уп. · ${fmtN(k.m2, 2)} м²</span><b>${k.ask === k.items.length ? 'Цена по запросу' : fmt(k.chosen) + (k.ask ? ' + по запросу' : '')}</b></div>`;
form.addEventListener('change', e => { if (e.target.name === 'rqMode' && e.target.value !== mode) setMode(e.target.value, true); });
$('#rqBack').onclick = () => showStep('list');
function normPhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && /^[78]/.test(d)) return '+7' + d.slice(1);
  if (d.length === 10 && d[0] === '9') return '+7' + d;
  if (/^\s*\+/.test(v) && d.length >= 10 && d.length <= 15) return '+' + d;
  return null;
}
function fieldErr(id, msg) { const f = $('#' + id).closest('.fld'); f.classList.toggle('bad', !!msg); $('.fe', f).textContent = msg || ''; return !msg; }
$('#rqPhone').addEventListener('blur', e => { if (e.target.value.trim()) { const p = normPhone(e.target.value); fieldErr('rqPhone', p ? '' : 'Проверьте номер: например, +7 925 123-45-67'); if (p) e.target.value = p.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2-$3-$4'); } });
$$('#rqName,#rqPhone').forEach(i => i.addEventListener('input', () => i.closest('.fld').classList.remove('bad')));
function requestText(r, k) {
  const L = [`Заявка с дилерского сайта${r.no ? ' № ' + r.no : ''}`, `Имя: ${r.name}`, `Телефон: ${r.phone}`];
  if (r.company) L.push(`Компания / ИНН: ${r.company}`);
  L.push(`Расчёт: ${r.mode === 'cash' ? 'наличные' : 'безнал с НДС'}`, '');
  k.items.forEach((it, i) => L.push(`${i + 1}) ${it.name} ${it.art} (${it.format}) — ${it.packs} уп., ${fmtN(it.m2, 2)} м² — ${it.sum ? fmt(it.sum) : 'цена по запросу'}`));
  L.push('', `Итого: ${k.ask === k.items.length ? 'по запросу' : fmt(k.chosen) + (k.ask ? ' + позиции по запросу' : '')}`);
  if (r.comment) L.push(`Комментарий: ${r.comment}`);
  return L.join('\n');
}
const prettyPhone = p => String(p).replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2-$3-$4');
const waLink = text => `https://wa.me/${CT.whatsapp}?text=${encodeURIComponent(text)}`;
const telLink = p => 'tel:' + String(p || '').replace(/[^+\d]/g, '');
form.addEventListener('submit', async e => {
  e.preventDefault(); if (sending) return;
  const name = $('#rqName').value.trim(), phone = normPhone($('#rqPhone').value);
  const ok = [fieldErr('rqName', name.length >= 2 ? '' : 'Как к вам обращаться?'), fieldErr('rqPhone', phone ? '' : $('#rqPhone').value.trim() ? 'Проверьте номер: например, +7 925 123-45-67' : 'Нужен телефон для связи')].every(Boolean);
  if (!ok) { $('.fld.bad input', form).focus(); return; }
  const k = cartCalc();
  const r = { name, phone, company: $('#rqCompany').value.trim(), comment: $('#rqComment').value.trim(), mode, items: k.items,
    totals: { cash: k.cash, noncash: k.noncash, chosen: k.chosen, packs: k.packs, m2: k.m2, ask: k.ask }, page: location.href.split('#')[0],
    hp: $('#rqWebsite').value, elapsed: Date.now() - formOpenedAt };
  if (!CFG.REQUESTS_URL) return fallback(r, k, 'Онлайн-приём заявок ещё настраивается. Отправьте заявку в WhatsApp или позвоните — менеджер ответит сразу.');
  sending = true; const btn = $('#rqSend'); btn.disabled = true; btn.classList.add('busy'); $('#rqErr').hidden = true;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25000);
    const res = await fetch(CFG.REQUESTS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'create', request: r }), signal: ctl.signal });
    clearTimeout(to);
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) throw new Error(d.error || 'сервер не принял заявку');
    r.no = d.no; done(r, k);
  } catch (err) {
    const msg = !navigator.onLine ? 'Нет интернета — заявка не ушла. Проверьте связь и нажмите «Отправить» ещё раз.' : err.name === 'AbortError' ? 'Сервер долго не отвечает. Попробуйте ещё раз или отправьте заявку в WhatsApp.' : `Не удалось отправить: ${err.message}. Попробуйте ещё раз или отправьте в WhatsApp.`;
    const box = $('#rqErr'); box.hidden = false;
    box.innerHTML = `<p>${esc(msg)}</p><div class="rq-alt"><a class="btn ghost sm" href="${waLink(requestText(r, k))}" target="_blank" rel="noopener">WhatsApp</a><a class="btn ghost sm" href="${telLink(CT.phone)}">Позвонить</a></div>`;
  } finally { sending = false; btn.disabled = false; btn.classList.remove('busy'); }
});
function done(r, k) {
  try { const mine = JSON.parse(localStorage.getItem('almaly_d2_sent') || '[]'); mine.unshift({ no: r.no, at: new Date().toISOString(), sum: k.chosen, mode: r.mode, n: k.items.length }); localStorage.setItem('almaly_d2_sent', JSON.stringify(mine.slice(0, 20))); } catch (e) {}
  doneBox.innerHTML = `<div class="rq-done"><div class="done-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 21l7.5 7.5L31 13"/></svg></div><h4>Заявка${r.no ? ' № ' + esc(r.no) : ''} отправлена</h4><p>Спасибо, ${esc(r.name)}! Менеджер проверит остатки и свяжется с вами по номеру ${esc(prettyPhone(r.phone))}.</p><p class="cart-note">Срочно? <a href="${telLink(CT.phone)}">${esc(CT.phone)}</a> · <a href="${waLink(requestText(r, k))}" target="_blank" rel="noopener">WhatsApp</a></p><button type="button" class="btn ghost wide" data-close-drawer>Вернуться в каталог</button></div>`;
  cart = []; saveCart(); setBadge(); form.reset(); showStep('done'); $('#cartList').innerHTML = CART_EMPTY; $('#cartTotal').innerHTML = '';
}
function fallback(r, k, msg) {
  const box = $('#rqErr'); box.hidden = false;
  box.innerHTML = `<p>${esc(msg)}</p><div class="rq-alt"><a class="btn primary sm" href="${waLink(requestText(r, k))}" target="_blank" rel="noopener">Отправить в WhatsApp</a><a class="btn ghost sm" href="${telLink(CT.phone)}">${esc(CT.phone)}</a></div>`;
}

/* ---------- ПРИМЕРОЧНАЯ ---------- */
const roomT = T.filter(t => t.tile);
let roomSel = byArt.VHP600822 && byArt.VHP600822.tile ? byArt.VHP600822 : roomT[0], roomMode = 'floor', R = null, roomImgs = {};
$('#swatches').innerHTML = roomT.map(t => `<button type="button" class="sw" data-art="${t.art}" title="${esc(t.name)} · ${t.format} · ${t.surface}"><img src="${t.icon}" alt="" loading="lazy" decoding="async"><span>${esc(t.name)}</span></button>`).join('');
function loadImg(src) { return roomImgs[src] || (roomImgs[src] = new Promise((ok, no) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = no; i.src = src; })); }
async function applyRoom() {
  const t = roomSel;
  $('#roomLabel').innerHTML = `<small>${t.art} · ${t.format} · ${t.surface}</small>${esc(t.name)}`;
  $$('.sw').forEach(s => s.classList.toggle('on', s.dataset.art === t.art));
  const fs = big(t.face); $('#loupeImg').src = fs + '.jpg'; $('#loupe').style.backgroundImage = `url("${fs}.jpg")`;
  roomPrice();
  const img = await loadImg(t.tile); if (roomSel !== t) return;
  if (R) { R.setTile(img, { format: t.format, surface: t.surface, full: t.tileFull }); R.layoutPreview($('#layoutCv')); }
  else drawLayoutFallback(img, t);
}
function drawLayoutFallback(img, t) { const cv = $('#layoutCv'), x = cv.getContext('2d'); x.fillStyle = '#b9b2a7'; x.fillRect(0, 0, cv.width, cv.height); const [a, b] = t.format.split('×').map(Number), tw = cv.width / 4, th = tw * Math.min(a, b) / Math.max(a, b);
  for (let j = 0; j * th < cv.height; j++) for (let i = -1; i * tw < cv.width; i++) x.drawImage(img, i * tw + (j % 2 ? tw / 2 : 0) + 1, j * th + 1, tw - 2, th - 2); }
function roomPrice() { const el = $('#roomPrice'); if (!el || !roomSel) return; el.dataset.art = roomSel.art; el.innerHTML = `<div class="prices" data-sig="${priceSig(roomSel)}">${priceBlock(roomSel)}</div>`; }
$('#swatches').addEventListener('click', e => { const b = e.target.closest('.sw'); if (b) { roomSel = byArt[b.dataset.art]; applyRoom(); } });
$('#swPrev').onclick = () => $('#swatches').scrollBy({ left: -440, behavior: 'smooth' }); $('#swNext').onclick = () => $('#swatches').scrollBy({ left: 440, behavior: 'smooth' });
$('#roomModes').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; roomMode = b.dataset.m; $$('#roomModes button').forEach(x => x.classList.toggle('on', x === b)); R && R.setMode(roomMode); });
$('#patSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('#patSeg button').forEach(x => x.classList.toggle('on', x === b)); if (R) { R.setPattern(b.dataset.p); R.layoutPreview($('#layoutCv')); } });
$('#groutDots').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('#groutDots button').forEach(x => x.classList.toggle('on', x === b)); if (R) { R.setGrout(b.dataset.c); R.layoutPreview($('#layoutCv')); } });
$('#groutW').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('#groutW button').forEach(x => x.classList.toggle('on', x === b)); if (R) { R.setGroutMM(+b.dataset.w); R.layoutPreview($('#layoutCv')); } });
$('#roomAdd').onclick = e => addToCart(roomSel, 10, e.currentTarget);
const lb = $('#loupeBox'), lp = $('#loupe');
lb.addEventListener('pointermove', e => { const r = lb.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, Z = 3.2;
  lp.style.setProperty('--lx', (x - 75) + 'px'); lp.style.setProperty('--ly', (y - 75) + 'px'); lp.style.backgroundSize = `${r.width * Z}px ${r.height * Z}px`; lp.style.backgroundPosition = `${-(x * Z - 75)}px ${-(y * Z - 75)}px`; });
// three.js-сцена грузится лениво, когда секция близко
let roomStarted = false;
function startRoom() {
  if (roomStarted) return; roomStarted = true;
  const s = document.createElement('script'); s.src = 'room.bundle.js'; s.async = true;
  s.onload = () => { try { R = window.AlmalyRoom.createRoom($('#roomGl'), { preserve: /[?&]shot/.test(location.search), low: /[?&]low/.test(location.search) }); } catch (err) { R = null; }
    if (!R) { $('#roomLoading').innerHTML = 'Трёхмерный просмотр недоступен на этом устройстве — смотрите фактуру и схему раскладки справа.'; }
    applyRoom().then(() => { if (R) { setTimeout(() => { $('#roomGl').classList.add('ready'); $('#roomLoading').classList.add('hide'); }, 350); } }); };
  s.onerror = () => { $('#roomLoading').textContent = 'Не удалось загрузить 3D-просмотр.'; applyRoom(); };
  document.body.appendChild(s);
}
new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { startRoom(); o.disconnect(); } }, { rootMargin: '900px 0px' }).observe($('#room'));
applyRoom();

/* ---------- кнопки: магнит и волна ---------- */
if (FINE && !RM) $$('.magnetic').forEach(b => { b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * .2).toFixed(1) + 'px'); b.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * .3).toFixed(1) + 'px'); });
  b.addEventListener('pointerleave', () => { b.style.setProperty('--mx', '0px'); b.style.setProperty('--my', '0px'); }); });
document.addEventListener('pointerdown', e => { const b = e.target.closest('.btn'); if (!b || RM) return; const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), sp = document.createElement('span');
  sp.className = 'ripple'; sp.style.width = sp.style.height = s + 'px'; sp.style.left = e.clientX - r.left - s / 2 + 'px'; sp.style.top = e.clientY - r.top - s / 2 + 'px'; b.appendChild(sp); setTimeout(() => sp.remove(), 700); });

/* ---------- АДМИН: цены → prices.json через GitHub API (токен только в этом браузере) ---------- */
const admin = $('#admin'), rows = $('#adminRows'), TKEY = 'almaly_d2_gh';
const GH = { token: '', sha: null };
let draft = null, dirty = new Set(), ruleDirty = false;
try { GH.token = sessionStorage.getItem(TKEY) || localStorage.getItem(TKEY) || ''; } catch (e) {}
const GH_HINT = { 401: 'токен не подходит или истёк — создайте новый', 403: 'у токена нет права Contents: Read and write на этот репозиторий', 404: `токен не видит репозиторий ${CFG.REPO} — выберите его в настройках токена` };
async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${CFG.REPO}${path}`, { ...opts, cache: 'no-store', headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) } });
  const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(GH_HINT[r.status] || d.message || `код ${r.status}`); e.status = r.status; throw e; }
  return d;
}
const b64enc = t => btoa(unescape(encodeURIComponent(t))), b64dec = b => decodeURIComponent(escape(atob(String(b).replace(/\s/g, ''))));
async function readRemote() {
  try { const f = await gh(`/contents/prices.json?ref=${CFG.BRANCH || 'main'}&t=${Date.now()}`); return { data: cleanPrices(JSON.parse(b64dec(f.content))), sha: f.sha }; }
  catch (e) { if (e.status === 404 && !/репозиторий/.test(e.message)) return { data: cleanPrices({}), sha: null }; throw e; }
}
function serialize(P) {
  const o = { _rule: ruleOf(P), _updated: new Date().toISOString() };
  Object.keys(P).filter(k => !k.startsWith('_')).sort().forEach(k => { const it = P[k], x = {};
    if (it.cash) x.cash = it.cash; if (it.auto === false) { x.auto = false; if (it.noncash) x.noncash = it.noncash; } else if (it.cash) x.noncash = ruleCalc(it.cash, ruleOf(P)); x.unit = 'м2';
    if (x.cash || x.noncash) o[k] = x; });
  return JSON.stringify(o, null, 1) + '\n';
}
const clone = o => JSON.parse(JSON.stringify(o));
function setStatus() {
  const n = dirty.size + (ruleDirty ? 1 : 0), st = $('#adminState');
  st.textContent = n ? `Не сохранено: ${dirty.size} арт.${ruleDirty ? ' и правило безнала' : ''}` : 'Все цены сохранены на сайте';
  st.classList.toggle('warn', !!n); $('#saveBtn').disabled = !n; $('#revertBtn').disabled = !n;
}
function rowHTML(t) {
  const it = draft[t.art] || {}, auto = it.auto !== false;
  return `<tr data-art="${t.art}"><td>${t.icon ? `<img src="${t.icon}" alt="" loading="lazy">` : ''}</td><td class="nm"><b>${esc(t.name)}</b><br><span>${t.art} · ${t.format} · ${t.surface}</span></td>
  <td><span class="pin"><input type="number" min="0" step="10" inputmode="numeric" class="in-cash" value="${it.cash || ''}" placeholder="по запросу" aria-label="Наличные, ${esc(t.name)}"></span></td>
  <td><label class="switch" title="Безнал по правилу"><input type="checkbox" class="in-auto" ${auto ? 'checked' : ''} aria-label="Безнал по правилу"><span></span></label></td>
  <td><span class="pin"><input type="number" min="0" step="10" inputmode="numeric" class="in-non" value="${auto ? (it.cash ? ruleCalc(+it.cash, ruleOf(draft)) : '') : (it.noncash || '')}" placeholder="${auto ? 'по правилу' : 'по запросу'}" ${auto ? 'disabled' : ''} aria-label="Безнал, ${esc(t.name)}"></span><span class="saved">изменено</span></td>
  <td class="pk"></td></tr>`;
}
function updRow(tr) { const t = byArt[tr.dataset.art], p = price(t, draft); tr.classList.toggle('dirty', dirty.has(t.art)); $('.pk', tr).innerHTML = p.none ? '<span class="dim">по запросу</span>' : t.m2pack ? `${p.cash ? fmt(p.cash * t.m2pack) : '—'} / ${p.noncash ? fmt(p.noncash * t.m2pack) : '—'}` : '—'; }
function renderAdmin() { $('#ruleX').value = ruleOf(draft).noncashPct; $('#ruleRound').value = ruleOf(draft).round; rows.innerHTML = T.map(rowHTML).join(''); $$('tr', rows).forEach(updRow); setStatus(); $('#adminQ').dispatchEvent(new Event('input')); }
const afterPriceChange = () => { refreshPrices(); setChip(); roomPrice(); renderTotals(); };
rows.addEventListener('input', e => {
  const tr = e.target.closest('tr'); if (!tr) return; const art = tr.dataset.art, it = draft[art] || (draft[art] = { unit: 'м2' }), non = $('.in-non', tr);
  if (e.target.classList.contains('in-cash')) { const v = Math.max(0, Math.round(+e.target.value || 0)); if (v) it.cash = v; else delete it.cash; }
  if (e.target.classList.contains('in-non')) { const v = Math.max(0, Math.round(+e.target.value || 0)); if (v) it.noncash = v; else delete it.noncash; }
  if (e.target.classList.contains('in-auto')) { if (e.target.checked) { delete it.auto; delete it.noncash; } else { it.auto = false; if (!it.noncash && it.cash) it.noncash = ruleCalc(it.cash, ruleOf(draft)); non.value = it.noncash || ''; } non.disabled = e.target.checked; non.placeholder = e.target.checked ? 'по правилу' : 'по запросу'; }
  if (it.auto !== false) non.value = it.cash ? ruleCalc(it.cash, ruleOf(draft)) : '';
  if (!it.cash && !it.noncash) delete draft[art];
  const key = x => x ? `${x.cash || ''}|${x.auto === false ? 'm' + (x.noncash || '') : 'a'}` : '';
  const same = key(draft[art]) === key(PR[art]);
  if (same) dirty.delete(art); else dirty.add(art);
  updRow(tr); setStatus(); afterPriceChange();
});
$('#ruleApply').onclick = () => {
  const x = Math.max(0, Math.min(100, +$('#ruleX').value || 0)), r = +$('#ruleRound').value || 1;
  draft._rule = { noncashPct: x, round: r }; ruleDirty = JSON.stringify(ruleOf(draft)) !== JSON.stringify(ruleOf(PR)); let n = 0;
  $$('tr', rows).forEach(tr => { const it = draft[tr.dataset.art], i = $('.in-non', tr);
    if (it && it.cash && it.auto !== false) { i.value = ruleCalc(it.cash, ruleOf(draft)); i.classList.add('flash'); setTimeout(() => i.classList.remove('flash'), 700); n++; } updRow(tr); });
  setStatus(); afterPriceChange(); toast(`Безнал = нал + ${fmtN(x, 1).replace(',0', '')}%: пересчитано ${n} арт. Не забудьте «Сохранить на сайт»`);
};
$('#revertBtn').onclick = () => { if (!confirm('Отменить несохранённые изменения цен?')) return; draft = clone(PR); CUR = draft; dirty.clear(); ruleDirty = false; renderAdmin(); afterPriceChange(); };
$('#saveBtn').onclick = async () => {
  const btn = $('#saveBtn'), arts = [...dirty]; btn.disabled = true; btn.classList.add('busy');
  try {
    for (let i = 0; i < 4; i++) {
      const remote = await readRemote(), next = clone(remote.data);  // накладываем свои правки на свежую версию
      for (const a of arts) { if (draft[a]) next[a] = clone(draft[a]); else delete next[a]; }
      if (ruleDirty || !remote.sha) next._rule = ruleOf(draft);
      const names = arts.slice(0, 4).map(a => (byArt[a] || {}).name || a).join(', ');
      try {
        const res = await gh('/contents/prices.json', { method: 'PUT', body: JSON.stringify({ message: `Цены: ${names}${arts.length > 4 ? ` и ещё ${arts.length - 4}` : ''}${ruleDirty ? (arts.length ? '; ' : '') + 'правило безнала' : ''}`.replace('Цены: ;', 'Цены:'), content: b64enc(serialize(next)), branch: CFG.BRANCH || 'main', ...(remote.sha ? { sha: remote.sha } : {}) }) });
        GH.sha = res.content && res.content.sha; PR = cleanPrices(next); draft = clone(PR); CUR = draft; dirty.clear(); ruleDirty = false;
        renderAdmin(); afterPriceChange(); toast('Сохранено. У всех посетителей цены обновятся через 1–2 минуты'); return;
      } catch (e) { if (![409, 422].includes(e.status) || i === 3) throw e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
    }
  } catch (e) { toast('Не сохранилось: ' + e.message); setStatus(); }
  finally { btn.classList.remove('busy'); setStatus(); }
};
async function adminLogin(token, remember) {
  GH.token = token; const st = $('#loginErr'); st.hidden = true; $('#loginBtn').classList.add('busy');
  try {
    const repo = await gh(''); if (repo.permissions && repo.permissions.push === false) throw new Error('у этого аккаунта нет права записи в репозиторий');
    const remote = await readRemote(); PR = remote.data; GH.sha = remote.sha; draft = clone(PR); CUR = draft; dirty.clear(); ruleDirty = false;
    try { (remember ? localStorage : sessionStorage).setItem(TKEY, token); (remember ? sessionStorage : localStorage).removeItem(TKEY); } catch (e) {}
    $('#adminLogin').hidden = true; $('#adminMain').hidden = false; renderAdmin(); afterPriceChange();
  } catch (e) {
    GH.token = ''; st.hidden = false; st.textContent = 'Не удалось войти: ' + e.message;
    if (e.status === 401) try { localStorage.removeItem(TKEY); sessionStorage.removeItem(TKEY); } catch (x) {}
    $('#adminLogin').hidden = false; $('#adminMain').hidden = true;
  } finally { $('#loginBtn').classList.remove('busy'); }
}
$('#adminLogin').addEventListener('submit', e => { e.preventDefault(); const t = $('#ghToken').value.trim(); if (!t) { $('#loginErr').hidden = false; $('#loginErr').textContent = 'Вставьте токен GitHub'; return; } adminLogin(t, $('#ghRemember').checked); });
$('#logoutBtn').onclick = () => { if (dirty.size && !confirm('Есть несохранённые цены. Выйти без сохранения?')) return; try { localStorage.removeItem(TKEY); sessionStorage.removeItem(TKEY); } catch (e) {} GH.token = ''; dirty.clear(); ruleDirty = false; CUR = PR; draft = null; $('#ghToken').value = ''; $('#adminMain').hidden = true; $('#adminLogin').hidden = false; afterPriceChange(); };
$('#adminQ').addEventListener('input', e => { const q = e.target.value.toLowerCase(); $$('tr', rows).forEach(tr => { const t = byArt[tr.dataset.art]; tr.style.display = !q || (t.art + ' ' + t.name).toLowerCase().includes(q) ? '' : 'none'; }); });
addEventListener('beforeunload', e => { if (dirty.size || ruleDirty) { e.preventDefault(); e.returnValue = ''; } });
let adminOpen = false;
function route() {
  const open = location.hash === '#admin';
  if (open === adminOpen) return; adminOpen = open;
  admin.classList.toggle('open', open); admin.setAttribute('aria-hidden', !open); document.body.style.overflow = open ? 'hidden' : '';
  if (open) { closeDrawer(); closeModal(); if (GH.token && !draft) adminLogin(GH.token, !!localStorage.getItem(TKEY)); else if (draft) renderAdmin(); setTimeout(() => { const i = $('#ghToken'); if (!GH.token && i) i.focus({ preventScroll: true }); }, 300); }
}
function closeAdmin() {
  if ((dirty.size || ruleDirty) && !confirm('Есть несохранённые цены. Закрыть без сохранения?')) { history.replaceState('', '', '#admin'); return; }
  if (dirty.size || ruleDirty) { draft = clone(PR); CUR = draft; dirty.clear(); ruleDirty = false; afterPriceChange(); }
  history.pushState('', '', location.pathname + location.search); route();
}
$('#adminClose').onclick = e => { e.preventDefault(); closeAdmin(); };
addEventListener('hashchange', () => { if (adminOpen && location.hash !== '#admin' && (dirty.size || ruleDirty)) { closeAdmin(); return; } route(); });

/* ---------- живые остатки из главного дилерского сайта ---------- */
async function liveStock() {
  if (!CFG.MASTER_DATA) return;
  try {
    const d = await fetch(CFG.MASTER_DATA, { cache: 'no-cache' }).then(r => { if (!r.ok) throw 0; return r.json(); });
    const M = Object.fromEntries((d.tiles || []).map(x => [x.art, x])); if (Object.keys(M).length < 5) return;
    let changed = 0;
    T.forEach(t => { const m = M[t.art];
      if (!m) { if (!t.gone) { t.gone = true; changed++; } return; }
      const s = m.stock || {}, msk = Math.round(Math.max(0, (s.msk || 0) - (s.msk_res || 0)) * 100) / 100, tver = Math.round(Math.max(0, (s.tver || 0) - (s.tver_res || 0)) * 100) / 100;
      if (msk !== t.msk || tver !== t.tver) { t.msk = msk; t.tver = tver; t.free = Math.round((msk + tver) * 100) / 100; changed++; } });
    if (!changed) return;
    maxFree = Math.max(...T.map(t => t.free), 1);
    $$('.card', grid).forEach(c => { const t = byArt[c.dataset.art]; $('.stock', c).innerHTML = stockHTML(t); const tg = $('.tag.out', c); if (t.free <= 0 && !tg) $('.card-tags', c).insertAdjacentHTML('beforeend', '<span class="tag out">Под заказ</span>'); else if (t.free > 0 && tg) tg.remove(); });
    const cs = $('#cntStock'); cs.dataset.to = Math.round(T.filter(t => !t.gone).reduce((a, t) => a + t.free, 0)); if (cs.dataset.v) tweenNum(cs, +cs.dataset.to, { suffix: ' м²' });
    applyFilters(false);
  } catch (e) { /* главный сайт недоступен — остаются остатки из data.js */ }
}

route();
setMode(mode); renderCart();
loadPrices().then(p => { if (p) { PR = p; if (!draft) CUR = PR; } pricesReady = true; afterPriceChange(); renderCart(); });
liveStock();
document.fonts && document.fonts.ready.then(placePill);
})();
