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

/* ---------- ЦЕНЫ (прототип, localStorage) ---------- */
const KEY = 'almaly_v3_prices', MKEY = 'almaly_v3_mode';
let store; try { store = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
store = store && store.items ? store : { rule: { x: 12, round: 10 }, items: {} };
const saveStore = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
const roundTo = (v, r) => Math.round(v / r + 1e-9) * r;
const ruleCalc = cash => roundTo(cash * (1 + store.rule.x / 100), store.rule.round);
// Демо-цена: в data.json поля цены нет → значение с пометкой «пример»
function exampleCash(t) { let p = t.format === '60×120' ? 1390 : 1090; if (/карвинг/i.test(t.surface)) p += 100; else if (/Глянец|Сатин/.test(t.surface)) p += 50; return p; }
function price(t) {
  const it = store.items[t.art];
  if (it && it.cash > 0) return { cash: +it.cash, noncash: it.auto !== false ? ruleCalc(+it.cash) : (+it.noncash || null), example: false };
  const c = exampleCash(t); return { cash: c, noncash: ruleCalc(c), example: true };
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
function setChip() { if (cur < 0) return; const t = byArt[HERO[cur].art], p = price(t); $('#chipPrice').textContent = `${mode === 'cash' ? 'Наличные' : 'Безнал'} ${fmt(p[mode])} / м²${p.example ? ' · пример' : ''}`; }
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
const grid = $('#grid'), maxFree = Math.max(...T.map(t => t.free), 1);
const filters = { format: 'all', surface: 'all', isNew: false, inStock: false, q: '' };
[...new Set(T.map(t => t.surface))].sort().forEach(s => $('#surf').insertAdjacentHTML('beforeend', `<option value="${esc(s)}">${esc(s)}</option>`));
function priceBlock(t) {
  const p = price(t), pk = t.m2pack;
  const one = (m, label) => `<div class="price${mode === m ? ' active' : ''}" data-m="${m}"><div class="lbl"><span>${label}</span>${p.example ? '<span class="ex">пример</span>' : ''}</div><b class="pv" data-v="${p[m] || 0}">${fmt(p[m])}</b><span class="per">за м² · <span class="pp">${pk && p[m] ? fmt(p[m] * pk) : '—'}</span> уп.</span></div>`;
  return one('cash', 'Наличные') + one('noncash', 'Безнал с НДС');
}
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
  <div class="stockrow"><span>Свободно <b>${fmtN(t.free, 0)} м²</b></span><span>Мск ${fmtN(t.msk, 0)} · Тверь ${fmtN(t.tver, 0)}</span></div><div class="stockbar"><i style="--w:${Math.max(2, t.free / maxFree * 100).toFixed(1)}%"></i></div>
  <div class="prices">${priceBlock(t)}</div>
  <div class="card-actions"><button type="button" class="btn ghost" data-open>Подробнее</button><button type="button" class="btn primary" data-add>В заявку</button></div></div>`;
  return el;
}
const frag = document.createDocumentFragment(); T.forEach(t => frag.appendChild(card(t))); grid.appendChild(frag);
$$('.card', grid).forEach(observe);
function refreshPrices() {
  $$('.card', grid).forEach(c => {
    const t = byArt[c.dataset.art], p = price(t);
    $$('.price', c).forEach(b => {
      const m = b.dataset.m; b.classList.toggle('active', m === mode);
      const pv = $('.pv', b); if (+pv.dataset.v !== (p[m] || 0)) { tweenNum(pv, p[m] || 0, { suffix: ' ₽' }); $('.pp', b).textContent = t.m2pack && p[m] ? fmt(p[m] * t.m2pack) : '—'; }
      const ex = $('.ex', b); if (ex && !p.example) ex.remove(); if (!ex && p.example) $('.lbl', b).insertAdjacentHTML('beforeend', '<span class="ex">пример</span>');
    });
  });
}
function applyFilters(animate = true) {
  const cards = $$('.card', grid), first = new Map();
  if (animate && !RM) cards.forEach(c => { if (!c.classList.contains('hide')) { const r = c.getBoundingClientRect(); if (r.bottom > -200 && r.top < innerHeight + 200) first.set(c, r); } });
  const q = filters.q.trim().toLowerCase(), sort = $('#sort').value;
  const list = T.slice().sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ru') : sort === 'price' ? price(a)[mode] - price(b)[mode] : sort === 'price-desc' ? price(b)[mode] - price(a)[mode] : (!!(b.card || b.face) - !!(a.card || a.face)) || (b.free - a.free));
  let n = 0;
  list.forEach(t => {
    const c = grid.querySelector(`[data-art="${t.art}"]`);
    const ok = (filters.format === 'all' || t.format === filters.format) && (filters.surface === 'all' || t.surface === filters.surface) && (!filters.isNew || t.is_new) && (!filters.inStock || t.free > 0) && (!q || (t.name + ' ' + t.art).toLowerCase().includes(q));
    c.classList.toggle('hide', !ok); if (ok) n++; grid.appendChild(c);
  });
  $('#found').textContent = `Показано ${n} из ${T.length}`; $('#empty').hidden = n > 0;
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
  $('#modalBody').innerHTML = `<div class="pd"><div class="pd-gal"><div class="pd-main" id="pdMain">${mainHTML}</div><div class="pd-thumbs">${thumbs}</div></div>
  <div class="pd-info"><p class="eyebrow">${t.art}${t.is_new ? ' · новинка' : ''}</p><h2 id="pdTitle">${esc(t.name)}</h2>
  <div class="prices">${priceBlock(t)}</div>
  <div class="specs"><div><small>Формат</small>${t.format} см</div><div><small>Поверхность</small>${t.surface}</div><div><small>Упаковка</small>${esc(t.packing)}</div><div><small>Паллет</small>${esc(t.pallet)}</div><div><small>Свободно в Москве</small>${fmtN(t.msk, 2)} м²</div><div><small>Свободно в Твери</small>${fmtN(t.tver, 2)} м²</div></div>
  <div class="calc"><div class="calc-row"><label for="calcM2">Площадь объекта</label><input class="num-in" type="number" id="calcM2" value="50" min="1" inputmode="decimal"> м² <span>+ 5% запас</span></div><div class="calc-out" id="calcOut"></div>
  <button type="button" class="btn primary wide" id="calcAdd"><span>Добавить в заявку</span><i aria-hidden="true">→</i></button></div></div></div>`;
  const out = $('#calcOut'), inp = $('#calcM2');
  const calc = () => { const need = Math.max(0, +inp.value || 0) * 1.05, packs = t.m2pack ? Math.ceil(need / t.m2pack) : 0, m2 = packs * (t.m2pack || 0), p = price(t);
    out.innerHTML = ['cash', 'noncash'].map(m => `<div class="price${m === mode ? ' active' : ''}"><div class="lbl"><span>${m === 'cash' ? 'Наличные' : 'Безнал с НДС'}</span>${p.example ? '<span class="ex">пример</span>' : ''}</div><b>${fmt((p[m] || 0) * m2)}</b><span class="per">${packs} уп. · ${fmtN(m2, 2)} м²</span></div>`).join(''); return packs; };
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
function addToCart(t, packs, from) {
  const ex = cart.find(c => c.art === t.art); if (ex) ex.packs += packs; else cart.push({ art: t.art, packs });
  const b = $('#cartCount'); b.textContent = cart.length; b.classList.add('has'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  if (from && t.icon && !RM) { const r = from.getBoundingClientRect(), to = $('#cartBtn').getBoundingClientRect(), f = document.createElement('img'); f.className = 'fly'; f.src = t.icon; f.alt = ''; document.body.appendChild(f);
    const x0 = r.left + r.width / 2 - 28, y0 = r.top + r.height / 2 - 28, x1 = to.left + to.width / 2 - 28, y1 = to.top + to.height / 2 - 28;
    f.animate([{ transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 1 }, { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 80}px) scale(.8) rotate(10deg)`, opacity: 1, offset: .5 }, { transform: `translate(${x1}px,${y1}px) scale(.3) rotate(25deg)`, opacity: .2 }], { duration: 850, easing: 'cubic-bezier(.5,0,.3,1)' }).onfinish = () => f.remove(); }
  toast(`${t.name}: ${packs} уп. в заявке`); renderCart();
}
const CART_EMPTY = '<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 5h2.2l2 10.2h10.1l2-7.4H7"/><circle cx="9.5" cy="19.3" r="1.3"/><circle cx="16.8" cy="19.3" r="1.3"/></svg>Заявка пока пустая.<br>Добавьте плитку из каталога.</div>';
function renderCart() {
  const L = $('#cartList');
  if (!cart.length) { L.innerHTML = CART_EMPTY; $('#cartTotal').innerHTML = ''; return; }
  L.innerHTML = cart.map(c => { const t = byArt[c.art]; return `<div class="ci" data-art="${t.art}"><img src="${t.icon}" alt=""><div><b>${esc(t.name)}</b><br><small>${t.art} · ${t.format}</small><br><span class="stepper"><button type="button" data-d="-1" aria-label="Меньше">−</button><input type="number" min="1" value="${c.packs}" aria-label="Упаковок"><button type="button" data-d="1" aria-label="Больше">+</button></span><span class="m2">уп. · ${fmtN(c.packs * (t.m2pack || 0), 2)} м²</span></div><button type="button" class="del" aria-label="Убрать">×</button></div>`; }).join('');
  renderTotals();
}
function renderTotals() {
  if (!cart.length) return;
  const sum = m => cart.reduce((s, c) => { const t = byArt[c.art]; return s + (price(t)[m] || 0) * c.packs * (t.m2pack || 0); }, 0), anyEx = cart.some(c => price(byArt[c.art]).example);
  $('#cartTotal').innerHTML = `<div class="tot${mode === 'cash' ? ' active' : ''}"><span>Итого, наличные</span><b>${fmt(sum('cash'))}</b></div><div class="tot${mode === 'noncash' ? ' active' : ''}"><span>Итого, безнал с НДС</span><b>${fmt(sum('noncash'))}</b></div>${anyEx ? '<p class="lead" style="font-size:12px;margin:6px 0 0">Часть цен — «пример», демонстрационные значения.</p>' : ''}<button type="button" class="btn primary wide" id="sendCart"><span>Отправить менеджеру</span><i aria-hidden="true">→</i></button>`;
  $('#sendCart').onclick = () => toast('В прототипе заявка никуда не отправляется');
}
const cartList = $('#cartList');
const setPacks = (row, v) => { const c = cart.find(x => x.art === row.dataset.art), t = byArt[c.art]; c.packs = Math.max(1, Math.round(v) || 1); $('input', row).value = c.packs; $('.m2', row).textContent = `уп. · ${fmtN(c.packs * (t.m2pack || 0), 2)} м²`; renderTotals(); };
cartList.addEventListener('click', e => { const row = e.target.closest('.ci'); if (!row) return;
  const d = e.target.closest('[data-d]'); if (d) setPacks(row, +$('input', row).value + +d.dataset.d);
  if (e.target.closest('.del')) { row.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(30px)' }], { duration: 250 }).onfinish = () => { cart = cart.filter(c => c.art !== row.dataset.art); const b = $('#cartCount'); b.textContent = cart.length; b.classList.toggle('has', cart.length > 0); renderCart(); }; } });
cartList.addEventListener('change', e => { const row = e.target.closest('.ci'); if (row && e.target.matches('input')) setPacks(row, +e.target.value); });
const drawer = $('#drawer');
const openDrawer = () => { renderCart(); drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); };
function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
$('#cartBtn').onclick = openDrawer; $('#ctaCart').onclick = openDrawer;
drawer.addEventListener('click', e => { if (e.target === drawer || e.target.closest('[data-close-drawer]')) closeDrawer(); });

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
function roomPrice() { const el = $('#roomPrice'); if (!el || !roomSel) return; el.innerHTML = `<div class="prices">${priceBlock(roomSel)}</div>`; }
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

/* ---------- АДМИН: ввод цен ---------- */
const admin = $('#admin'), rows = $('#adminRows');
$('#ruleX').value = store.rule.x; $('#ruleRound').value = store.rule.round;
function rowHTML(t) {
  const it = store.items[t.art] || {}, auto = it.auto !== false, ex = exampleCash(t);
  return `<tr data-art="${t.art}"><td>${t.icon ? `<img src="${t.icon}" alt="" loading="lazy">` : ''}</td><td class="nm"><b>${esc(t.name)}</b><br><span>${t.art} · ${t.format} · ${t.surface}</span></td>
  <td><span class="pin"><input type="number" min="0" step="10" inputmode="numeric" class="in-cash" value="${it.cash || ''}" placeholder="пример ${ex}" aria-label="Наличные, ${esc(t.name)}"></span></td>
  <td><label class="switch" title="Безнал по правилу"><input type="checkbox" class="in-auto" ${auto ? 'checked' : ''} aria-label="Безнал по правилу"><span></span></label></td>
  <td><span class="pin"><input type="number" min="0" step="10" inputmode="numeric" class="in-non" value="${it.cash ? (auto ? ruleCalc(+it.cash) : (it.noncash || '')) : ''}" placeholder="пример ${ruleCalc(ex)}" ${auto ? 'disabled' : ''} aria-label="Безнал, ${esc(t.name)}"></span><span class="saved">✓ сохранено</span></td>
  <td class="pk"></td></tr>`;
}
function updRow(tr) { const t = byArt[tr.dataset.art], p = price(t); $('.pk', tr).innerHTML = t.m2pack ? `${fmt(p.cash * t.m2pack)} / ${fmt(p.noncash * t.m2pack)}${p.example ? ' <span class="ex">пример</span>' : ''}` : '—'; }
function renderAdmin() { rows.innerHTML = T.map(rowHTML).join(''); $$('tr', rows).forEach(updRow); }
const afterPriceChange = () => { refreshPrices(); setChip(); roomPrice(); renderTotals(); };
rows.addEventListener('input', e => {
  const tr = e.target.closest('tr'); if (!tr) return; const art = tr.dataset.art, it = store.items[art] || (store.items[art] = { auto: true }), non = $('.in-non', tr);
  if (e.target.classList.contains('in-cash')) it.cash = Math.max(0, +e.target.value || 0);
  if (e.target.classList.contains('in-non')) it.noncash = Math.max(0, +e.target.value || 0);
  if (e.target.classList.contains('in-auto')) { it.auto = e.target.checked; non.disabled = it.auto; if (!it.auto && !it.noncash && it.cash) it.noncash = ruleCalc(it.cash); }
  if (it.auto) non.value = it.cash ? ruleCalc(it.cash) : '';
  saveStore(); updRow(tr); const s = $('.saved', tr); s.classList.add('on'); clearTimeout(s.h); s.h = setTimeout(() => s.classList.remove('on'), 1200);
  afterPriceChange();
});
$('#ruleApply').onclick = () => {
  store.rule.x = Math.max(0, +$('#ruleX').value || 0); store.rule.round = +$('#ruleRound').value || 1; saveStore(); let n = 0;
  $$('tr', rows).forEach(tr => { const t = byArt[tr.dataset.art], it = store.items[t.art], i = $('.in-non', tr);
    if (it && it.cash && it.auto !== false) { i.value = ruleCalc(it.cash); i.classList.add('flash'); setTimeout(() => i.classList.remove('flash'), 700); n++; }
    i.placeholder = 'пример ' + ruleCalc(exampleCash(t)); updRow(tr); });
  afterPriceChange(); toast(`Безнал = нал + ${fmtN(store.rule.x, 1).replace(',0', '')}%: пересчитано ${n} арт.`);
};
$('#resetBtn').onclick = () => { if (!confirm('Очистить все введённые цены в этом браузере?')) return; store.items = {}; saveStore(); renderAdmin(); afterPriceChange(); toast('Цены очищены — снова показываются примеры'); };
$('#exportBtn').onclick = () => {
  const o = $('#exportOut'), list = T.filter(t => store.items[t.art] && store.items[t.art].cash).map(t => { const p = price(t); return { art: t.art, name: t.name, price: { cash: p.cash, noncash: p.noncash, unit: 'м2', noncash_with_vat: true } }; });
  o.hidden = false; o.textContent = '// Так цены лягут в data.json → tiles[].price (в прототипе ничего не сохраняется на сайт)\n' + JSON.stringify(list.length ? list : [{ art: 'VHP612038', name: 'Айссноу', price: { cash: '…', noncash: '…', unit: 'м2', noncash_with_vat: true } }], null, 2);
  o.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'nearest' });
};
$('#adminQ').addEventListener('input', e => { const q = e.target.value.toLowerCase(); $$('tr', rows).forEach(tr => { const t = byArt[tr.dataset.art]; tr.style.display = !q || (t.art + ' ' + t.name).toLowerCase().includes(q) ? '' : 'none'; }); });
function route() { const open = location.hash === '#admin'; admin.classList.toggle('open', open); admin.setAttribute('aria-hidden', !open); document.body.style.overflow = open ? 'hidden' : ''; if (open && !rows.children.length) renderAdmin(); }
function closeAdmin() { history.pushState('', '', location.pathname + location.search); route(); }
$('#adminClose').onclick = e => { e.preventDefault(); closeAdmin(); };
addEventListener('hashchange', route);
renderAdmin(); route();

setMode(mode); renderCart();
document.fonts && document.fonts.ready.then(placePill);
})();
