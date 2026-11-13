import { EXERCISES, GROUPS, plural, shuffle, el } from './exercises.js';

const VERSION = '1.0.0';
const app = document.getElementById('app');
const BYID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

/* ---------------- storage ---------------- */
const KEY = 'focus.v1';
const data = load();
const prefs = data.prefs;
function load() {
  const d = { results: [], prefs: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.results)) d.results = p.results;
      if (p.prefs && typeof p.prefs === 'object') d.prefs = p.prefs;
    }
  } catch (e) { /* пусто — начинаем с нуля */ }
  return d;
}
function save() {
  try {
    if (data.results.length > 8000) data.results = data.results.slice(-6000);
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* хранилище недоступно */ }
}
const setPref = (k, v) => { prefs[k] = v; save(); };

const keyFor = (ex) => (ex.key ? ex.key(prefs) : ex.id);
const resultsFor = (key) => data.results.filter((r) => r.k === key);
const isBetter = (ex, a, b) => (ex.better === 'lower' ? a < b : a > b);
function bestOf(ex, key) {
  const rs = resultsFor(key);
  if (!rs.length) return null;
  return rs.reduce((b, r) => (isBetter(ex, r.v, b) ? r.v : b), rs[0].v);
}

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function msByDay() {
  const m = new Map();
  for (const r of data.results) { const k = dayKey(r.t); m.set(k, (m.get(k) || 0) + (r.d || 0)); }
  return m;
}
function streak() {
  const days = new Set(data.results.map((r) => dayKey(r.t)));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const mins = (ms) => Math.round(ms / 60000);
const fmtDur = (ms) => {
  const m = mins(ms);
  if (ms > 0 && m < 1) return 'меньше минуты';
  return `${m} ${plural(m, ['минута', 'минуты', 'минут'])}`;
};
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- theme ---------------- */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = prefs.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.getElementById('theme-color')?.setAttribute('content', bg || '#F2F4F6');
}
mq.addEventListener?.('change', applyTheme);

/* ---------------- icons ---------------- */
const ICON = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
};

/* ---------------- sparkline ---------------- */
function sparkline(vals, better, w = 96, h = 30) {
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1, pad = 4;
  const pts = vals.map((v, i) => {
    let f = (v - min) / span;
    if (max === min) f = 0.5;
    if (better === 'lower') f = 1 - f; // вверх = лучше
    return [pad + (i * (w - pad * 2)) / (vals.length - 1), pad + (1 - f) * (h - pad * 2)];
  });
  const [lx, ly] = pts[pts.length - 1];
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"/></svg>`;
}

/* ---------------- routing ---------------- */
let disposeScreen = null;
function mount(node, dispose) {
  if (disposeScreen) { const d = disposeScreen; disposeScreen = null; d(); }
  app.replaceChildren(node);
  disposeScreen = dispose || null;
}
function nav(route, mode = 'push') {
  if (mode === 'push') history.pushState(route, '');
  else history.replaceState(route, '');
  render(route);
}
const back = () => history.back();
window.addEventListener('popstate', (e) => render(e.state || { s: 'home' }));

function render(r) {
  if (r.s === 'home' || r.s === 'stats') free = null;
  if (r.s === 'home') mount(Home());
  else if (r.s === 'stats') mount(Stats());
  else if (r.s === 'summary') mount(Summary());
  else if (r.s === 'ex') {
    const ex = BYID[r.id];
    if (!ex) return nav({ s: 'home' }, 'replace');
    mountExercise(ex, !!(r.free && free));
  } else mount(Home());
}

/* ---------------- free training ---------------- */
let free = null;
function startFree(min) {
  free = { target: min ? min * 60000 : 0, start: Date.now(), log: [], queue: [], last: null };
  nav({ s: 'ex', id: takeFree(), free: true }, 'push');
}
function refill() {
  const ids = shuffle(EXERCISES.filter((e) => !e.solo).map((e) => e.id));
  if (ids[0] === free.last) [ids[0], ids[1]] = [ids[1], ids[0]];
  free.queue.push(...ids);
}
function peekFree() { if (!free.queue.length) refill(); return free.queue[0]; }
function takeFree() { const id = peekFree(); free.queue.shift(); free.last = id; return id; }
const freeOver = () => free && free.target && Date.now() - free.start >= free.target;
function nextFree() {
  if (freeOver()) return nav({ s: 'summary' }, 'replace');
  nav({ s: 'ex', id: takeFree(), free: true }, 'replace');
}
const freeLabel = () => `Тренировка ${clock(Date.now() - free.start)}${free.target ? ` из ${free.target / 60000} мин` : ''}`;

/* ---------------- home ---------------- */
const FREE_CHOICES = [{ v: 3, l: '3 мин' }, { v: 5, l: '5 мин' }, { v: 10, l: '10 мин' }, { v: 20, l: '20 мин' }, { v: 0, l: 'Без лимита' }];

function Home() {
  const today = msByDay().get(dayKey(Date.now())) || 0;
  const st = streak();
  let todayText = today > 0 ? `Сегодня ${fmtDur(today)}` : 'Сегодня ещё без тренировки';
  if (st > 1) todayText += `, ${st} ${plural(st, ['день', 'дня', 'дней'])} подряд`;
  const sel = prefs.freeMin ?? 5;

  const row = (ex) => {
    const best = bestOf(ex, keyFor(ex));
    return `<li><button class="ex-row" type="button" data-ex="${ex.id}">
      <span class="ex-glyph" aria-hidden="true">${ex.glyph}</span>
      <span class="ex-text"><span class="ex-name">${ex.name}</span><span class="ex-blurb">${ex.blurb}</span></span>
      <span class="ex-best">${best != null ? ex.fmt(best) : ''}</span></button></li>`;
  };

  const node = el(`<section class="screen"><div class="scroll"><div class="wrap">
    <header class="home-head">
      <div><h1 class="logo">Фокус</h1><p class="today">${todayText}</p></div>
      <button class="icon-btn" type="button" data-stats aria-label="Статистика">${ICON.chart}</button>
    </header>
    <section class="free" aria-labelledby="free-title">
      <h2 class="free-title" id="free-title">Тренировка по кругу</h2>
      <p class="free-text">Упражнения идут одно за другим, по минуте на каждое. Выбери время или тренируйся без лимита.</p>
      <div class="seg" role="group" aria-label="Длительность">${FREE_CHOICES.map((c) => `<button type="button" data-min="${c.v}" aria-pressed="${c.v === sel}">${c.l}</button>`).join('')}</div>
      <button class="btn btn-go btn-lg" type="button" data-free>Начать тренировку</button>
    </section>
    ${GROUPS.map((g) => `<section class="group"><h2 class="group-title">${g.name}</h2><p class="group-note">${g.note}</p>
      <ul class="ex-list">${EXERCISES.filter((e) => e.group === g.id).map(row).join('')}</ul></section>`).join('')}
  </div></div></section>`);

  node.querySelector('[data-stats]').onclick = () => nav({ s: 'stats' });
  node.querySelectorAll('[data-min]').forEach((b) => {
    b.onclick = () => {
      setPref('freeMin', +b.dataset.min);
      node.querySelectorAll('[data-min]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    };
  });
  node.querySelector('[data-free]').onclick = () => startFree(prefs.freeMin ?? 5);
  node.querySelectorAll('[data-ex]').forEach((b) => { b.onclick = () => nav({ s: 'ex', id: b.dataset.ex }); });
  return node;
}

/* ---------------- exercise runner ---------------- */
function makeRun(ui, onDone) {
  const timers = new Set(), rafs = new Set(), offs = [], cleanups = [];
  let alive = true;
  const dispose = () => {
    if (!alive) return;
    alive = false;
    timers.forEach(clearTimeout); rafs.forEach(cancelAnimationFrame);
    offs.forEach((f) => f()); cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  };
  const ctx = {
    prefs,
    setPref,
    timeout(fn, ms) { const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms); timers.add(id); return id; },
    clearTimeout(id) { clearTimeout(id); timers.delete(id); },
    raf(fn) { const id = requestAnimationFrame((t) => { rafs.delete(id); if (alive) fn(t); }); rafs.add(id); return id; },
    on(node, type, fn, opts) { node.addEventListener(type, fn, opts); offs.push(() => node.removeEventListener(type, fn, opts)); },
    onCleanup(fn) { cleanups.push(fn); },
    progress: ui.setBar,
    status: (t) => { ui.status.textContent = t; },
    buzz(p) { if (prefs.vibrate !== false && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* ignore */ } } },
    countdown(sec, onEnd) {
      const t0 = performance.now();
      const tick = () => {
        const f = (performance.now() - t0) / 1000 / sec;
        if (f >= 1) { ui.setBar(1); onEnd(); return; }
        ui.setBar(f); ctx.timeout(tick, 100);
      };
      tick();
    },
    wakeLock() {
      if (!('wakeLock' in navigator)) return;
      let lock = null;
      navigator.wakeLock.request('screen').then((l) => { if (alive) lock = l; else l.release(); }).catch(() => {});
      cleanups.push(() => lock && lock.release());
    },
    done(res) { if (!alive) return; dispose(); onDone(res); },
  };
  return { ctx, dispose };
}

function mountExercise(ex, inFree) {
  const scr = el(`<section class="screen">
    <header class="topbar">
      <button class="icon-btn" type="button" data-close aria-label="Закрыть">${ICON.close}</button>
      <div class="topbar-mid"><div class="topbar-title">${ex.name}</div><div class="topbar-sub" data-sub></div></div>
      <div class="topbar-status" data-status></div>
    </header>
    <div class="bar"><span data-bar></span></div>
    <div class="ex-body" data-body></div>
  </section>`);
  const body = scr.querySelector('[data-body]'), barEl = scr.querySelector('[data-bar]');
  const statusEl = scr.querySelector('[data-status]'), sub = scr.querySelector('[data-sub]');
  const setBar = (f) => { barEl.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`; };
  let run = null, cdTimer = null;
  const intervals = [];
  scr.querySelector('[data-close]').onclick = back;
  if (inFree) { const upd = () => { if (free) sub.textContent = freeLabel(); }; upd(); intervals.push(setInterval(upd, 1000)); }
  mount(scr, () => { run?.dispose(); clearTimeout(cdTimer); intervals.forEach(clearInterval); });
  showIntro();

  function showIntro() {
    run?.dispose(); run = null;
    setBar(0); statusEl.textContent = '';
    const best = bestOf(ex, keyFor(ex));
    const how = typeof ex.how === 'function' ? ex.how(prefs) : ex.how;
    const opts = (ex.options || []).map((o) => {
      const cur = prefs[o.pref] ?? o.def;
      return `<div class="opt"><div class="opt-label">${o.label}</div><div class="seg" role="group" aria-label="${o.label}">${o.choices.map((c) =>
        `<button type="button" data-pref="${o.pref}" data-v="${esc(c.v)}" aria-pressed="${c.v === cur}">${c.label}</button>`).join('')}</div></div>`;
    }).join('');
    const node = el(`<div class="scroll"><div class="wrap intro">
      <div class="intro-glyph" aria-hidden="true">${ex.glyph}</div>
      <h1 class="intro-title">${ex.name}</h1>
      ${how.map((p) => `<p class="how">${p}</p>`).join('')}
      ${opts}
      <p class="intro-best">${best != null ? `Твой рекорд: ${ex.fmt(best)}` : 'Пока без результатов'}</p>
      <div class="actions">
        <button class="btn btn-primary btn-lg" type="button" data-start>Начать</button>
        ${inFree ? '<button class="btn btn-ghost" type="button" data-skip>Пропустить</button><button class="btn btn-ghost" type="button" data-end>Закончить тренировку</button>' : ''}
      </div></div></div>`);
    node.querySelectorAll('[data-pref]').forEach((b) => {
      b.onclick = () => {
        const o = ex.options.find((x) => x.pref === b.dataset.pref);
        const c = o.choices.find((x) => String(x.v) === b.dataset.v);
        setPref(o.pref, c.v); showIntro();
      };
    });
    node.querySelector('[data-start]').onclick = countdownThenStart;
    node.querySelector('[data-skip]')?.addEventListener('click', nextFree);
    node.querySelector('[data-end]')?.addEventListener('click', endFree);
    body.replaceChildren(node);
  }

  function countdownThenStart() {
    setBar(0); statusEl.textContent = '';
    const cd = el('<div class="countdown" aria-live="assertive"><span></span></div>');
    body.replaceChildren(cd);
    const span = cd.firstElementChild;
    let n = 3;
    const step = () => {
      if (n === 0) return startRun();
      span.textContent = n;
      span.classList.remove('pop'); void span.offsetWidth; span.classList.add('pop');
      n--; cdTimer = setTimeout(step, 600);
    };
    step();
  }

  function startRun() {
    const stage = el(`<div class="stage stage-${ex.id}"></div>`);
    body.replaceChildren(stage);
    const t0 = performance.now();
    run = makeRun({ setBar, status: statusEl }, (res) => { run = null; finish(res, performance.now() - t0); });
    try { ex.start(stage, run.ctx); }
    catch (err) { console.error(err); run.dispose(); run = null; showIntro(); }
  }

  function finish(res, dur) {
    const key = res.key || keyFor(ex);
    const prev = bestOf(ex, key);
    const record = prev != null && isBetter(ex, res.value, prev);
    data.results.push({ e: ex.id, k: key, v: res.value, t: Date.now(), d: Math.round(dur) });
    save();
    if (inFree && free) free.log.push({ id: ex.id, v: res.value, record });
    showResult(res, key, prev, record);
  }

  function showResult(res, key, prev, record) {
    setBar(1); statusEl.textContent = '';
    const hist = resultsFor(key).slice(-12).map((r) => r.v);
    let kicker = '';
    if (record) kicker = '<span class="pill pill-go">Новый рекорд</span>';
    else if (prev == null) kicker = 'Первый результат';
    const prevLine = prev == null ? '' : `<p class="result-prev">${record ? `Прошлый рекорд: ${ex.fmt(prev)}` : `Рекорд: ${ex.fmt(prev)}`}</p>`;
    let actions;
    if (inFree && free) {
      const over = freeOver();
      actions = `<button class="btn btn-go btn-lg" type="button" data-next>${over ? 'Итоги тренировки' : `Дальше: ${BYID[peekFree()].name}`}</button>
        ${over ? '<button class="btn btn-ghost" type="button" data-more>Ещё одно упражнение</button>' : '<button class="btn btn-ghost" type="button" data-end>Закончить тренировку</button>'}`;
    } else {
      actions = `<button class="btn btn-primary btn-lg" type="button" data-again>Ещё раз</button>
        <button class="btn btn-ghost" type="button" data-list>Все упражнения</button>`;
    }
    const node = el(`<div class="scroll"><div class="wrap result">
      <p class="result-kicker">${kicker}</p>
      <div class="result-value">${ex.fmt(res.value)}</div>
      ${prevLine}
      <ul class="result-lines">${(res.lines || []).map((l) => `<li>${l}</li>`).join('')}</ul>
      ${hist.length >= 2 ? `<div class="result-trend"><div class="trend-label">Последние ${hist.length} ${plural(hist.length, ['результат', 'результата', 'результатов'])}, вверх — лучше</div>${sparkline(hist, ex.better, 280, 56)}</div>` : ''}
      <div class="actions">${actions}</div></div></div>`);
    node.querySelector('[data-again]')?.addEventListener('click', countdownThenStart);
    node.querySelector('[data-list]')?.addEventListener('click', back);
    node.querySelector('[data-next]')?.addEventListener('click', () => (freeOver() ? nav({ s: 'summary' }, 'replace') : nextFree()));
    node.querySelector('[data-end]')?.addEventListener('click', endFree);
    node.querySelector('[data-more]')?.addEventListener('click', () => nav({ s: 'ex', id: takeFree(), free: true }, 'replace'));
    body.replaceChildren(node);
    node.querySelector('.btn')?.focus({ preventScroll: true });
  }
}

function endFree() {
  if (free && free.log.length) nav({ s: 'summary' }, 'replace');
  else back();
}

/* ---------------- summary ---------------- */
function Summary() {
  if (!free) { queueMicrotask(back); return el('<section class="screen"></section>'); }
  const f = free;
  const dur = Date.now() - f.start;
  const recs = f.log.filter((x) => x.record).length;
  const node = el(`<section class="screen">
    <header class="topbar"><button class="icon-btn" type="button" data-close aria-label="Закрыть">${ICON.close}</button>
      <div class="topbar-mid"><div class="topbar-title">Итоги</div></div><div></div></header>
    <div class="scroll"><div class="wrap result">
      <p class="result-kicker">${recs ? `<span class="pill pill-go">${recs} ${plural(recs, ['рекорд', 'рекорда', 'рекордов'])}</span>` : 'Тренировка закончена'}</p>
      <div class="result-value">${clock(dur)}</div>
      <p class="result-prev">${f.log.length} ${plural(f.log.length, ['упражнение', 'упражнения', 'упражнений'])}</p>
      <ul class="sum-list" style="margin-top:20px">${f.log.map((x) => {
        const ex = BYID[x.id];
        return `<li><span>${ex.name}</span><span class="sum-v">${ex.fmt(x.v)}${x.record ? '<span class="sum-rec">рекорд</span>' : ''}</span></li>`;
      }).join('')}</ul>
      <div class="actions"><button class="btn btn-primary btn-lg" type="button" data-home>На главную</button></div>
    </div></div></section>`);
  node.querySelector('[data-close]').onclick = back;
  node.querySelector('[data-home]').onclick = back;
  return node;
}

/* ---------------- stats ---------------- */
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function weekChart(byDay) {
  const days = [];
  for (let k = 6; k >= 0; k--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - k); days.push(d); }
  const vals = days.map((d) => byDay.get(dayKey(d)) || 0);
  const max = Math.max(...vals, 5 * 60000);
  const W = 336, step = W / 7, bw = 22, top = 8, baseY = 106;
  const bars = days.map((d, i) => {
    const v = vals[i], hgt = v ? Math.max(4, ((baseY - top) * v) / max) : 0;
    const x = i * step + (step - bw) / 2, y = baseY - hgt, r = Math.min(4, hgt);
    const path = hgt ? `<path class="bar-mark${i === 6 ? ' today' : ''}" data-i="${i}" d="M${x} ${baseY}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y + r}V${baseY}Z"/>` : '';
    return `${path}<text class="lbl${i === 6 ? ' today' : ''}" x="${(i * step + step / 2).toFixed(1)}" y="126" text-anchor="middle">${WD[d.getDay()]}</text>
      <rect class="hit" data-i="${i}" x="${i * step}" y="0" width="${step}" height="132"><title>${d.getDate()} ${MONTHS[d.getMonth()]}: ${fmtDur(v)}</title></rect>`;
  }).join('');
  return { days, vals, svg: `<svg viewBox="0 0 ${W} 132" role="img" aria-label="Минуты тренировок за последние 7 дней"><line class="base" x1="0" x2="${W}" y1="${baseY + 0.5}" y2="${baseY + 0.5}"/>${bars}</svg>` };
}

function Stats() {
  const byDay = msByDay();
  const today = byDay.get(dayKey(Date.now())) || 0;
  const wk = weekChart(byDay);
  const weekMs = wk.vals.reduce((a, b) => a + b, 0);
  const st = streak();
  const caption = (i) => `${wk.days[i].getDate()} ${MONTHS[wk.days[i].getMonth()]}: ${wk.vals[i] ? fmtDur(wk.vals[i]) : 'без тренировки'}`;

  const rows = [];
  for (const ex of EXERCISES) {
    const keys = [...new Set(data.results.filter((r) => r.e === ex.id).map((r) => r.k))];
    if (!keys.length) keys.push(keyFor(ex));
    for (const k of keys) {
      const rs = resultsFor(k);
      let name = ex.name;
      if (k.startsWith('schulte-')) { const n = k.split('-')[1]; name += ` ${n}×${n}`; }
      if (k === 'corsi-back') name += ', обратный';
      const meta = rs.length ? `Рекорд ${ex.fmt(bestOf(ex, k))}, последний ${ex.fmt(rs[rs.length - 1].v)}, ${rs.length} ${plural(rs.length, ['раз', 'раза', 'раз'])}` : 'Ещё не пробовал';
      rows.push(`<button class="st-row" type="button" data-ex="${ex.id}"><span class="st-row-name">${name}</span>
        ${rs.length >= 2 ? sparkline(rs.slice(-20).map((r) => r.v), ex.better) : '<span class="st-row-empty"></span>'}
        <span class="st-row-meta">${meta}</span></button>`);
    }
  }

  const seg = (pref, choices, cur) => `<div class="seg" role="group">${choices.map(([v, l]) => `<button type="button" data-set="${pref}" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;

  const node = el(`<section class="screen">
    <header class="topbar"><button class="icon-btn" type="button" data-close aria-label="Назад">${ICON.back}</button>
      <div class="topbar-mid"><div class="topbar-title">Статистика</div></div><div></div></header>
    <div class="scroll"><div class="wrap">
      <div class="kpis">
        <div><div class="kpi-value">${st}</div><div class="kpi-label">${plural(st, ['день', 'дня', 'дней'])} подряд</div></div>
        <div><div class="kpi-value">${mins(today)}</div><div class="kpi-label">мин сегодня</div></div>
        <div><div class="kpi-value">${mins(weekMs)}</div><div class="kpi-label">мин за 7 дней</div></div>
      </div>
      <section class="section week"><h2 class="sec-title">Минуты по дням</h2>
        ${wk.svg}<p class="week-caption" data-cap>${caption(6)}</p></section>
      <section class="section"><h2 class="sec-title">Упражнения</h2><p class="sec-note">Линия идёт вверх, когда результат становится лучше.</p>${rows.join('')}</section>
      <section class="section"><h2 class="sec-title" style="margin-bottom:14px">Настройки</h2>
        <div class="setting"><div class="setting-label">Тема</div>${seg('theme', [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']], prefs.theme || 'auto')}</div>
        <div class="setting"><div class="setting-label">Вибрация при ошибке</div>${seg('vibrate', [['on', 'Включена'], ['off', 'Выключена']], prefs.vibrate === false ? 'off' : 'on')}</div>
        <div class="setting"><div class="setting-label">Данные</div><div class="data-actions">
          <button class="btn btn-ghost" type="button" data-export>Сохранить копию в файл</button>
          <button class="btn btn-ghost" type="button" data-import>Загрузить копию из файла</button>
          <button class="btn btn-danger" type="button" data-reset>Стереть все результаты</button>
          <input type="file" accept="application/json,.json" data-file hidden>
        </div></div>
        <p class="diag" data-diag></p>
      </section>
    </div></div><div class="inset-probe" data-probe></div></section>`);

  node.querySelector('[data-close]').onclick = back;
  node.querySelectorAll('.st-row').forEach((b) => { b.onclick = () => nav({ s: 'ex', id: b.dataset.ex }); });
  const cap = node.querySelector('[data-cap]');
  node.querySelectorAll('.week .hit').forEach((h) => {
    h.addEventListener('click', () => {
      const i = +h.dataset.i;
      node.querySelectorAll('.bar-mark').forEach((b) => b.classList.toggle('sel', +b.dataset.i === i));
      cap.textContent = caption(i);
    });
  });
  node.querySelectorAll('[data-set]').forEach((b) => {
    b.onclick = () => {
      const p = b.dataset.set, v = b.dataset.v;
      if (p === 'theme') { setPref('theme', v === 'auto' ? undefined : v); applyTheme(); }
      if (p === 'vibrate') setPref('vibrate', v === 'on');
      node.querySelectorAll(`[data-set="${p}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    };
  });
  node.querySelector('[data-export]').onclick = () => {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `focus-${dayKey(Date.now())}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const file = node.querySelector('[data-file]');
  node.querySelector('[data-import]').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const p = JSON.parse(await f.text());
      if (!Array.isArray(p.results)) throw new Error('bad');
      if (!confirm(`В файле ${p.results.length} результатов. Заменить ими текущие данные?`)) return;
      data.results = p.results;
      Object.keys(prefs).forEach((k) => delete prefs[k]);
      Object.assign(prefs, p.prefs || {});
      save(); applyTheme(); nav({ s: 'stats' }, 'replace');
    } catch (e) { alert('Этот файл не похож на копию данных Фокуса. Выбери файл, сохранённый кнопкой «Сохранить копию в файл».'); }
  };
  node.querySelector('[data-reset]').onclick = () => {
    if (!confirm('Стереть все результаты и рекорды? Это нельзя отменить.')) return;
    data.results = []; save(); nav({ s: 'stats' }, 'replace');
  };
  requestAnimationFrame(() => {
    const probe = node.querySelector('[data-probe]');
    const cs = probe && getComputedStyle(probe);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    node.querySelector('[data-diag]').textContent =
      `Версия ${VERSION}, ${standalone ? 'установлено' : 'в браузере'}, экран ${screen.width}×${screen.height}, окно ${innerWidth}×${innerHeight}, отступы ${cs ? parseInt(cs.paddingTop) : 0}/${cs ? parseInt(cs.paddingBottom) : 0}`;
  });
  return node;
}

/* ---------------- boot ---------------- */
applyTheme();
// После перезагрузки всегда кладём главную под текущий экран, чтобы «назад» не выкидывал из приложения.
const start = history.state && history.state.s ? history.state : { s: 'home' };
history.replaceState({ s: 'home' }, '');
if (start.s === 'home' || start.s === 'summary') render({ s: 'home' });
else nav({ ...start, free: false }, 'push');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
