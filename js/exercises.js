// Упражнения. Каждое получает stage (DOM-узел) и ctx (таймеры, прогресс, завершение).
// Все таймеры и обработчики создаются только через ctx, чтобы при выходе всё гасло.

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function plural(n, f) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return f[2];
  if (b === 1) return f[0];
  if (b >= 2 && b <= 4) return f[1];
  return f[2];
}
const points = (n) => `${n} ${plural(n, ['очко', 'очка', 'очков'])}`;

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const now = () => performance.now();
const stamp = (e) => (e && e.timeStamp > 0 && e.timeStamp < 1e11 ? e.timeStamp : now());

// Быстрое нажатие: pointerdown для пальца/мыши, Enter/Space для клавиатуры.
function tap(ctx, node, fn) {
  ctx.on(node, 'pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    fn(stamp(e), e);
  });
  ctx.on(node, 'keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) fn(now(), e);
    }
  });
}
function keys(ctx, map) {
  ctx.on(window, 'keydown', (e) => {
    const fn = map[e.key];
    // Если фокус на кнопке, Enter/Space уже обработал её собственный обработчик.
    if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof HTMLButtonElement) return;
    if (fn && !e.repeat) { e.preventDefault(); fn(now()); }
  });
}
function flash(ctx, node, kind, ms = 260) {
  node.dataset.flash = kind;
  ctx.timeout(() => { if (node.dataset.flash === kind) node.dataset.flash = ''; }, ms);
}

const arrow = (d) =>
  `<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="${d === 'L' ? 'M20 12H5M11 5l-7 7 7 7' : 'M4 12h15M13 5l7 7-7 7'}"/></svg>`;

/* ================================================================ */

const reaction = {
  id: 'reaction', group: 'speed', name: 'Реакция',
  blurb: 'Нажми, как только экран станет зелёным',
  how: [
    'Экран красный — жди. Как только он станет зелёным, нажми на него как можно быстрее.',
    'Пять попыток. Если нажмёшь раньше времени, попытка повторится.',
  ],
  better: 'lower',
  fmt: (v) => `${Math.round(v)} мс`,
  glyph: `<svg viewBox="0 0 44 44"><path class="g-red" d="M22 7a15 15 0 0 0 0 30z"/><path class="g-green" d="M22 7a15 15 0 0 1 0 30z"/></svg>`,
  start(stage, ctx) {
    const N = 5, times = [];
    let i = 0, early = 0, state = '', t0 = 0, tid = null;
    const pad = el(`<button class="rx" type="button"><span class="rx-big"></span><span class="rx-sub"></span></button>`);
    stage.append(pad);
    const big = pad.querySelector('.rx-big'), sub = pad.querySelector('.rx-sub');
    const set = (s, b, t = '') => { state = s; pad.dataset.state = s; big.textContent = b; sub.textContent = t; };

    const next = () => {
      if (i >= N) return finish();
      ctx.status(`${i + 1} из ${N}`);
      set('wait', 'Жди зелёный');
      tid = ctx.timeout(go, rnd(1200, 4200));
    };
    const go = () => { set('go', 'Жми!'); t0 = now(); };
    const press = (ts) => {
      if (state === 'wait') {
        ctx.clearTimeout(tid); early++; ctx.buzz(90);
        set('early', 'Рано', 'Нажми, чтобы повторить');
      } else if (state === 'go') {
        const rt = Math.max(1, Math.round(ts - t0));
        times.push(rt); i++; ctx.progress(i / N);
        set('show', `${rt} мс`, rt < 250 ? 'Отлично' : rt < 330 ? 'Хорошо' : '');
        ctx.timeout(next, 900);
      } else if (state === 'early') next();
    };
    tap(ctx, pad, press);
    keys(ctx, { ' ': press });
    next();

    function finish() {
      const med = Math.round(median(times));
      ctx.done({
        value: med,
        lines: [`Лучшая попытка: ${Math.min(...times)} мс`, `Медиана пяти попыток: ${med} мс`, `Фальстартов: ${early}`],
      });
    }
  },
};

const gonogo = {
  id: 'gonogo', group: 'speed', name: 'Стоп-сигнал',
  blurb: 'Жми на зелёный, удержись на красном',
  how: [
    'Появляется круг. Зелёный — нажми как можно быстрее. Красный — не нажимай.',
    'Чем быстрее реагируешь, тем больше очков. Нажатие на красный стоит дороже, чем медленный ответ.',
  ],
  better: 'higher',
  fmt: (v) => points(v),
  glyph: `<svg viewBox="0 0 44 44"><circle class="g-green" cx="14" cy="22" r="8"/><circle class="g-red" cx="30" cy="22" r="8"/></svg>`,
  start(stage, ctx) {
    const N = 40;
    const seq = shuffle(Array.from({ length: N }, (_, k) => (k < 11 ? 'nogo' : 'go')));
    let i = 0, W = 900, pts = 0, hits = 0, misses = 0, fas = 0, crs = 0, cur = null, t0 = 0, tid = null;
    const rts = [];
    const pad = el(`<button class="gng" type="button" aria-label="Нажать"><span class="gng-dot"></span></button>`);
    stage.append(pad);
    const dot = pad.firstElementChild;

    const trial = () => { if (i >= N) return finish(); ctx.timeout(show, rnd(450, 950)); };
    const show = () => { cur = seq[i]; dot.dataset.kind = cur; t0 = now(); tid = ctx.timeout(expire, W); };
    const end = () => { dot.dataset.kind = ''; cur = null; i++; ctx.progress(i / N); ctx.status(`${Math.max(0, pts)}`); trial(); };
    const expire = () => {
      if (cur === 'go') { misses++; pts -= 20; W = Math.min(1100, W + 40); flash(ctx, pad, 'miss'); }
      else { crs++; pts += 10; }
      end();
    };
    const press = (ts) => {
      if (!cur) return;
      ctx.clearTimeout(tid);
      if (cur === 'go') {
        const rt = ts - t0; rts.push(rt); hits++;
        pts += Math.max(10, Math.round((1000 - rt) / 10));
        W = Math.max(450, W - 15);
      } else { fas++; pts -= 50; ctx.buzz(120); flash(ctx, pad, 'fa'); }
      end();
    };
    tap(ctx, pad, press);
    keys(ctx, { ' ': press });
    ctx.status('0');
    trial();

    function finish() {
      ctx.done({
        value: Math.max(0, pts),
        lines: [
          `Точность: ${pct(hits + crs, N)}%`,
          `Средняя реакция на зелёный: ${Math.round(mean(rts))} мс`,
          `Нажал на красный: ${fas} из 11`,
          `Пропустил зелёный: ${misses}`,
        ],
      });
    }
  },
};

const periphery = {
  id: 'periphery', group: 'speed', name: 'Периферия',
  blurb: 'Замечай сразу центр и край поля зрения',
  how: [
    'Смотри в центр на крестик. На мгновение появятся фигура в центре и закрашенный треугольник где-то на краю, среди пустых контуров.',
    'Потом ответь, что было в центре и где был треугольник. Время показа подстраивается: отвечаешь верно — картинка мелькает быстрее.',
    'Это упражнение на «поле внимания» — у него самые долгие подтверждённые эффекты среди тренировок скорости восприятия.',
  ],
  better: 'lower',
  fmt: (v) => `${Math.round(v)} мс`,
  glyph: `<svg viewBox="0 0 44 44"><circle class="g-ink" cx="22" cy="22" r="4"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
    const a = (k * Math.PI) / 4, x = 22 + 15 * Math.cos(a), y = 22 + 15 * Math.sin(a);
    return `<circle class="${k === 1 ? 'g-ink' : 'g-mute'}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${k === 1 ? 3.2 : 2.4}"/>`;
  }).join('')}</svg>`,
  start(stage, ctx) {
    const TRIALS = 12;
    let D = Math.min(600, Math.max(17, ctx.prefs.periD || 400));
    const D0 = D, used = [];
    let i = 0, right = 0, centerAns = null, cur = null;
    const node = el(`<div class="uf"><svg class="uf-svg" viewBox="0 0 100 100" role="img" aria-label="Поле"></svg><div class="uf-ask"></div></div>`);
    stage.append(node);
    const svg = node.querySelector('svg'), ask = node.querySelector('.uf-ask');

    const ring = (r, off = 0) => Array.from({ length: 8 }, (_, k) => {
      const a = ((k * 45 + off - 90) * Math.PI) / 180;
      return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
    });
    const OUT = ring(39), MID = ring(24, 22.5);
    const tri = (x, y, s, cls) => `<path class="${cls}" d="M${x} ${y - s}L${x + s * 0.92} ${y + s * 0.62}L${x - s * 0.92} ${y + s * 0.62}Z"/>`;
    const fixation = `<path class="u-fix" d="M47 50h6M50 47v6"/>`;
    const centerShape = (c) => (c === 'circle' ? `<circle class="u-ink" cx="50" cy="50" r="5"/>` : `<rect class="u-ink" x="45.5" y="45.5" width="9" height="9"/>`);
    const mask = () => {
      let s = '';
      for (let k = 0; k < 70; k++) {
        const x = rnd(4, 96), y = rnd(4, 96), a = rnd(0, Math.PI), l = rnd(3, 7);
        s += `<path class="u-mask" d="M${(x - l * Math.cos(a)).toFixed(1)} ${(y - l * Math.sin(a)).toFixed(1)}L${(x + l * Math.cos(a)).toFixed(1)} ${(y + l * Math.sin(a)).toFixed(1)}"/>`;
      }
      return s;
    };

    const trial = () => {
      if (i >= TRIALS) return finish();
      ctx.status(`${i + 1} из ${TRIALS}`);
      cur = { c: pick(['circle', 'square']), t: Math.floor(Math.random() * 8) };
      ask.innerHTML = `<p class="hint">Смотри в центр</p>`;
      svg.innerHTML = fixation;
      ctx.timeout(present, 700);
    };
    const present = () => {
      let s = centerShape(cur.c);
      OUT.forEach(([x, y], k) => { s += k === cur.t ? tri(x, y, 4.6, 'u-ink') : tri(x, y, 4.2, 'u-out'); });
      MID.forEach(([x, y]) => { s += tri(x, y, 4.2, 'u-out'); });
      used.push(D);
      ctx.raf((t0) => {
        svg.innerHTML = s;
        const tick = (t) => {
          if (t - t0 >= D - 4) { svg.innerHTML = mask(); ctx.timeout(askCenter, 320); }
          else ctx.raf(tick);
        };
        ctx.raf(tick);
      });
    };
    const askCenter = () => {
      svg.innerHTML = '';
      ask.innerHTML = `<p class="hint">Что было в центре?</p><div class="pair">
        <button class="shape-btn" type="button" data-c="circle" aria-label="Круг"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg></button>
        <button class="shape-btn" type="button" data-c="square" aria-label="Квадрат"><svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="15" height="15"/></svg></button></div>`;
      ask.querySelectorAll('button').forEach((b) => tap(ctx, b, () => { if (centerAns) return; centerAns = b.dataset.c; askPlace(); }));
      centerAns = null;
    };
    const askPlace = () => {
      ask.innerHTML = `<p class="hint">Где был закрашенный треугольник?</p>`;
      svg.innerHTML = fixation + OUT.map(([x, y], k) => `<circle class="u-slot" data-k="${k}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7"/>`).join('');
      let answered = false;
      svg.querySelectorAll('.u-slot').forEach((c) => tap(ctx, c, () => {
        if (answered) return; answered = true;
        const k = +c.dataset.k, okC = centerAns === cur.c, okP = k === cur.t;
        svg.querySelector(`[data-k="${cur.t}"]`).classList.add('right');
        if (!okP) c.classList.add('wrong');
        const ok = okC && okP;
        if (ok) { right++; D = Math.max(17, D * 0.85); }
        else { D = Math.min(600, D * 1.25); ctx.buzz(60); }
        ask.innerHTML = `<p class="hint">${ok ? 'Верно' : !okC && !okP ? 'Ошибка в центре и на краю' : !okC ? 'В центре был ' + (cur.c === 'circle' ? 'круг' : 'квадрат') : 'Треугольник был в зелёном кружке'}</p>`;
        i++; ctx.progress(i / TRIALS);
        ctx.timeout(trial, ok ? 550 : 1100);
      }));
    };
    trial();

    function finish() {
      const tail = used.slice(-6);
      const thr = Math.round(Math.exp(mean(tail.map(Math.log))));
      ctx.setPref('periD', Math.round(D));
      ctx.done({
        value: thr,
        lines: [
          `Верных ответов: ${right} из ${TRIALS}`,
          `Время показа в начале: ${Math.round(D0)} мс, в конце: ${Math.round(D)} мс`,
          'Результат — время показа, при котором ты стабильно успеваешь заметить. Меньше — лучше.',
        ],
      });
    }
  },
};

const flanker = {
  id: 'flanker', group: 'control', name: 'Стрелки',
  blurb: 'Куда смотрит средняя стрелка',
  how: [
    'В ряду пять стрелок. Нажми ту сторону, куда смотрит средняя, не обращая внимания на соседей.',
    '45 секунд. Ошибка отнимает очко.',
  ],
  better: 'higher',
  fmt: (v) => points(v),
  glyph: `<svg viewBox="0 0 44 44"><g class="g-line">${[6, 14, 22, 30, 38].map((x, k) => `<path d="${k === 2 ? `M${x + 2} 16l-4 6 4 6` : `M${x - 2} 16l4 6-4 6`}"/>`).join('')}</g></svg>`,
  start(stage, ctx) {
    let ok = 0, bad = 0, cur = null, t0 = 0;
    const rtC = [], rtI = [];
    const node = el(`<div class="fl"><div class="fl-arrows" aria-live="off"></div>
      <div class="pair"><button class="pad-btn" type="button" data-d="L" aria-label="Влево">${arrow('L')}</button><button class="pad-btn" type="button" data-d="R" aria-label="Вправо">${arrow('R')}</button></div></div>`);
    stage.append(node);
    const row = node.querySelector('.fl-arrows');
    const next = () => {
      row.innerHTML = '';
      ctx.timeout(() => {
        const d = pick(['L', 'R']), cong = Math.random() < 0.5, f = cong ? d : d === 'L' ? 'R' : 'L';
        row.innerHTML = arrow(f) + arrow(f) + arrow(d) + arrow(f) + arrow(f);
        cur = { d, cong }; t0 = now();
      }, 180);
    };
    const answer = (d, ts) => {
      if (!cur) return;
      const rt = ts - t0;
      if (d === cur.d) { ok++; (cur.cong ? rtC : rtI).push(rt); }
      else { bad++; ctx.buzz(80); flash(ctx, node, 'bad'); }
      cur = null; ctx.status(`${Math.max(0, ok - bad)}`); next();
    };
    node.querySelectorAll('.pad-btn').forEach((b) => tap(ctx, b, (ts) => answer(b.dataset.d, ts)));
    keys(ctx, { ArrowLeft: (ts) => answer('L', ts), ArrowRight: (ts) => answer('R', ts) });
    ctx.status('0');
    next();
    ctx.countdown(45, () => {
      const lines = [`Верно: ${ok}, ошибок: ${bad}`, `Средняя реакция: ${Math.round(mean([...rtC, ...rtI]))} мс`];
      if (rtC.length > 2 && rtI.length > 2) {
        const cost = Math.round(mean(rtI) - mean(rtC));
        lines.push(cost > 0 ? `Соседние стрелки замедляют тебя на ${cost} мс` : 'Соседние стрелки тебя совсем не сбивают');
      }
      ctx.done({ value: Math.max(0, ok - bad), lines });
    });
  },
};

const STROOP = [
  { w: 'КРАСНЫЙ', n: 'Красный', c: 'red' },
  { w: 'СИНИЙ', n: 'Синий', c: 'blue' },
  { w: 'ЗЕЛЁНЫЙ', n: 'Зелёный', c: 'green' },
  { w: 'ЖЁЛТЫЙ', n: 'Жёлтый', c: 'yellow' },
];
const stroop = {
  id: 'stroop', group: 'control', name: 'Цвет слова',
  blurb: 'Называй цвет букв, а не слово',
  how: [
    'Появляется название цвета, написанное другим цветом. Нажми кнопку с цветом букв, а не с тем, что написано.',
    '45 секунд. Ошибка отнимает очко.',
  ],
  better: 'higher',
  fmt: (v) => points(v),
  glyph: `<svg viewBox="0 0 44 44"><rect class="g-ink" x="4" y="9" width="36" height="26" rx="7"/><path d="M13 17h18M22 17v12" stroke="#5B9BFF" stroke-width="3.4" stroke-linecap="round" fill="none"/></svg>`,
  start(stage, ctx) {
    let ok = 0, bad = 0, cur = null, t0 = 0;
    const rts = [];
    const node = el(`<div class="st"><div class="st-card"><span class="st-word"></span></div>
      <div class="st-btns">${STROOP.map((s, k) => `<button class="st-btn" type="button" data-k="${k}"><span class="sw bg-${s.c}"></span>${s.n}</button>`).join('')}</div></div>`);
    stage.append(node);
    const word = node.querySelector('.st-word');
    const next = () => {
      word.textContent = ''; word.className = 'st-word';
      ctx.timeout(() => {
        const w = Math.floor(Math.random() * 4);
        let ink = w;
        if (Math.random() < 0.75) while (ink === w) ink = Math.floor(Math.random() * 4);
        word.textContent = STROOP[w].w; word.className = `st-word c-${STROOP[ink].c}`;
        cur = ink; t0 = now();
      }, 160);
    };
    const answer = (k, ts) => {
      if (cur === null) return;
      if (k === cur) { ok++; rts.push(ts - t0); }
      else { bad++; ctx.buzz(80); flash(ctx, node, 'bad'); }
      cur = null; ctx.status(`${Math.max(0, ok - bad)}`); next();
    };
    node.querySelectorAll('.st-btn').forEach((b) => tap(ctx, b, (ts) => answer(+b.dataset.k, ts)));
    keys(ctx, { 1: (ts) => answer(0, ts), 2: (ts) => answer(1, ts), 3: (ts) => answer(2, ts), 4: (ts) => answer(3, ts) });
    ctx.status('0');
    next();
    ctx.countdown(45, () => ctx.done({
      value: Math.max(0, ok - bad),
      lines: [`Верно: ${ok}, ошибок: ${bad}`, `Точность: ${pct(ok, ok + bad)}%`, `Средняя реакция: ${Math.round(mean(rts))} мс`],
    }));
  },
};

const schulte = {
  id: 'schulte', group: 'control', name: 'Таблица Шульте',
  blurb: 'Найди все числа по порядку',
  how: [
    'Нажимай числа по порядку от 1 до последнего как можно быстрее.',
    'Старайся держать взгляд ближе к центру таблицы и находить числа боковым зрением.',
  ],
  options: [{ pref: 'schulteSize', label: 'Размер таблицы', def: 5, choices: [3, 4, 5, 6, 7].map((n) => ({ v: n, label: `${n}×${n}` })) }],
  key: (p) => `schulte-${p.schulteSize || 5}`,
  better: 'lower',
  fmt: (v) => `${v.toFixed(1).replace('.', ',')} с`,
  glyph: `<svg viewBox="0 0 44 44"><rect class="g-line" x="6" y="6" width="32" height="32" rx="4"/><path class="g-line-mute" d="M16.7 6v32M27.3 6v32M6 16.7h32M6 27.3h32"/><rect class="g-green" x="18" y="18" width="8" height="8" rx="1.5"/></svg>`,
  start(stage, ctx) {
    const n = ctx.prefs.schulteSize || 5, total = n * n;
    const nums = shuffle(Array.from({ length: total }, (_, k) => k + 1));
    let target = 1, errors = 0;
    const node = el(`<div class="sc"><p class="sc-target">Найди <b>1</b></p><div class="sc-grid" style="--n:${n}">${nums.map((v) => `<button class="sc-cell" type="button" data-v="${v}">${v}</button>`).join('')}</div></div>`);
    stage.append(node);
    const label = node.querySelector('.sc-target b');
    const t0 = now();
    ctx.status(`${n}×${n}`);
    node.querySelectorAll('.sc-cell').forEach((c) => tap(ctx, c, () => {
      const v = +c.dataset.v;
      if (v === target) {
        c.classList.add('ok'); ctx.timeout(() => c.classList.remove('ok'), 180);
        ctx.progress(target / total);
        target++;
        if (target > total) {
          const sec = Math.round((now() - t0) / 100) / 10;
          return ctx.done({ value: sec, key: `schulte-${n}`, lines: [`Таблица ${n}×${n}`, `Ошибочных нажатий: ${errors}`, `В среднем ${((sec / total) * 1000).toFixed(0)} мс на одно число`] });
        }
        label.textContent = target;
      } else if (v > target - 1) {
        errors++; ctx.buzz(60);
        c.classList.add('bad'); ctx.timeout(() => c.classList.remove('bad'), 220);
      }
    }));
  },
};

const nback = {
  id: 'nback', group: 'memory', name: 'N назад',
  blurb: 'Совпадает ли клетка с той, что была N шагов назад',
  how: (p) => {
    const n = p.nbackN || 2;
    return [
      `Клетки загораются по одной. Нажми «Совпадение», если клетка та же, что была ${n === 1 ? 'на прошлом шаге' : `${n} ${plural(n, ['шаг', 'шага', 'шагов'])} назад`}.`,
      'Уровень подстраивается сам: почти без ошибок — N растёт, много ошибок — снижается.',
    ];
  },
  options: [{ pref: 'nbackN', label: 'Уровень N', def: 2, choices: [1, 2, 3, 4, 5, 6].map((n) => ({ v: n, label: `${n}` })) }],
  better: 'higher',
  fmt: (v) => `N = ${v}`,
  glyph: `<svg viewBox="0 0 44 44">${[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => `<rect class="${r === 0 && c === 2 ? 'g-ink' : 'g-mute'}" x="${5 + c * 12}" y="${5 + r * 12}" width="10" height="10" rx="2.5"/>`)).join('')}</svg>`,
  start(stage, ctx) {
    const N = ctx.prefs.nbackN || 2, T = 20 + N, POS = [0, 1, 2, 3, 5, 6, 7, 8];
    const targets = new Set(shuffle(Array.from({ length: T - N }, (_, k) => k + N)).slice(0, Math.round((T - N) * 0.3)));
    const seq = [];
    for (let k = 0; k < T; k++) {
      if (k >= N && targets.has(k)) seq.push(seq[k - N]);
      else { let p; do p = pick(POS); while (k >= N && p === seq[k - N]); seq.push(p); }
    }
    let i = -1, responded = false, hits = 0, misses = 0, fas = 0;
    const node = el(`<div class="nb"><p class="nb-level">N = ${N}</p><div class="nb-grid">${Array.from({ length: 9 }, (_, k) => `<div class="nb-cell${k === 4 ? ' center' : ''}"></div>`).join('')}</div><button class="nb-btn" type="button">Совпадение</button></div>`);
    stage.append(node);
    const cells = node.querySelectorAll('.nb-cell'), btn = node.querySelector('.nb-btn');
    const step = () => {
      if (i >= N && targets.has(i) && !responded) { misses++; flash(ctx, btn, 'miss', 350); }
      i++;
      if (i >= T) return finish();
      responded = false;
      ctx.status(`${i + 1} из ${T}`); ctx.progress(i / T);
      const c = cells[seq[i]];
      c.classList.add('on');
      ctx.timeout(() => c.classList.remove('on'), 650);
      ctx.timeout(step, 2500);
    };
    const press = () => {
      if (i < N || responded || i >= T) return;
      responded = true;
      if (targets.has(i)) { hits++; flash(ctx, btn, 'ok'); }
      else { fas++; ctx.buzz(80); flash(ctx, btn, 'bad'); }
    };
    tap(ctx, btn, press);
    keys(ctx, { ' ': press, m: press, 'ь': press });
    ctx.timeout(step, 600);

    function finish() {
      const errors = misses + fas;
      const nextN = errors <= 2 ? Math.min(9, N + 1) : errors >= 6 ? Math.max(1, N - 1) : N;
      ctx.setPref('nbackN', nextN);
      ctx.done({
        value: N,
        lines: [
          `Совпадений поймано: ${hits} из ${targets.size}`,
          `Лишних нажатий: ${fas}`,
          nextN > N ? `Отлично. Следующий раунд: N = ${nextN}` : nextN < N ? `Многовато ошибок. Следующий раунд: N = ${nextN}` : `Следующий раунд снова N = ${N}. Для повышения нужно не больше двух ошибок.`,
        ],
      });
    }
  },
};

const CORSI = [[14, 16], [48, 10], [82, 20], [24, 48], [58, 42], [86, 54], [12, 82], [46, 78], [78, 86]];
const corsi = {
  id: 'corsi', group: 'memory', name: 'Квадраты',
  blurb: 'Повтори порядок, в котором загорались квадраты',
  how: (p) => [
    'Квадраты загораются по очереди. Когда закончат, нажми их в том же порядке.',
    p.corsiDir === 'back' ? 'Сейчас включён обратный порядок: нажимай с последнего к первому.' : 'Каждый раз, когда получается, цепочка становится на один квадрат длиннее. Две ошибки подряд на одной длине — конец раунда.',
  ],
  options: [{ pref: 'corsiDir', label: 'Порядок', def: 'fwd', choices: [{ v: 'fwd', label: 'Прямой' }, { v: 'back', label: 'Обратный' }] }],
  key: (p) => (p.corsiDir === 'back' ? 'corsi-back' : 'corsi'),
  better: 'higher',
  fmt: (v) => `${v} ${plural(v, ['квадрат', 'квадрата', 'квадратов'])}`,
  glyph: `<svg viewBox="0 0 44 44"><rect class="g-mute" x="4" y="6" width="10" height="10" rx="2.5"/><rect class="g-green" x="22" y="4" width="10" height="10" rx="2.5"/><rect class="g-mute" x="12" y="22" width="10" height="10" rx="2.5"/><rect class="g-green" x="30" y="24" width="10" height="10" rx="2.5"/><rect class="g-mute" x="6" y="34" width="8" height="8" rx="2"/></svg>`,
  start(stage, ctx) {
    const back = ctx.prefs.corsiDir === 'back';
    let L = 3, fails = 0, best = 0, seq = [], pos = 0, lock = true;
    const node = el(`<div class="co" data-lock="1"><p class="hint">Смотри</p><div class="co-board">${CORSI.map(([x, y], k) => `<button class="co-block" type="button" data-k="${k}" aria-label="Квадрат ${k + 1}" style="left:${x - 8.5}%;top:${y - 8.5}%"></button>`).join('')}</div></div>`);
    stage.append(node);
    const hint = node.querySelector('.hint'), blocks = node.querySelectorAll('.co-block');
    const lockSet = (v) => { lock = v; node.dataset.lock = v ? '1' : '0'; };
    const round = () => {
      lockSet(true); hint.textContent = 'Смотри';
      ctx.status(`Длина ${L}`); ctx.progress((L - 3) / 7);
      seq = shuffle([...Array(9).keys()]).slice(0, L);
      let k = 0;
      const show = () => {
        if (k >= L) { lockSet(false); pos = 0; hint.textContent = back ? 'Повтори с конца' : 'Повтори'; return; }
        const b = blocks[seq[k]]; b.classList.add('lit');
        ctx.timeout(() => { b.classList.remove('lit'); k++; ctx.timeout(show, 250); }, 600);
      };
      ctx.timeout(show, 700);
    };
    blocks.forEach((b) => tap(ctx, b, () => {
      if (lock) return;
      const k = +b.dataset.k, want = back ? seq[L - 1 - pos] : seq[pos];
      if (k === want) {
        b.classList.add('tap'); ctx.timeout(() => b.classList.remove('tap'), 200);
        pos++;
        if (pos === L) {
          lockSet(true); best = L; fails = 0; hint.textContent = 'Верно';
          if (L >= 9) return ctx.timeout(finish, 600);
          L++; ctx.timeout(round, 800);
        }
      } else {
        lockSet(true); ctx.buzz(100);
        b.classList.add('bad'); blocks[want].classList.add('lit');
        hint.textContent = 'Не тот квадрат';
        ctx.timeout(() => {
          b.classList.remove('bad'); blocks[want].classList.remove('lit');
          fails++;
          if (fails >= 2) finish(); else round();
        }, 1000);
      }
    }));
    round();

    function finish() {
      ctx.done({
        value: best,
        key: back ? 'corsi-back' : 'corsi',
        lines: [
          best ? `Самая длинная повторённая цепочка: ${best}` : 'Цепочку из трёх пока повторить не удалось — попробуй ещё раз',
          back ? 'Обратный порядок' : 'Прямой порядок',
          'У большинства взрослых получается 5–7 квадратов.',
        ],
      });
    }
  },
};

const breath = {
  id: 'breath', group: 'calm', name: 'Счёт дыханий', solo: true,
  blurb: 'Считай выдохи до девяти, не сбиваясь',
  how: [
    'Сядь удобно и дыши как обычно. На каждом выдохе касайся круга. На девятом выдохе нажми «Девятый» и начни счёт заново.',
    'Счёт не показывается — держи его в голове. Если поймал себя на том, что отвлёкся и забыл цифру, нажми «Сбился». Это не ошибка, а и есть тренировка.',
  ],
  options: [{ pref: 'breathMin', label: 'Длительность', def: 5, choices: [3, 5, 10, 15].map((m) => ({ v: m, label: `${m} мин` })) }],
  better: 'higher',
  fmt: (v) => `${v}%`,
  glyph: `<svg viewBox="0 0 44 44"><circle class="g-line-mute" cx="22" cy="22" r="17"/><circle class="g-line-mute" cx="22" cy="22" r="11"/><circle class="g-ink" cx="22" cy="22" r="5"/></svg>`,
  start(stage, ctx) {
    const min = ctx.prefs.breathMin || 5;
    let c = 0, ok = 0, err = 0, resets = 0;
    const node = el(`<div class="br"><button class="br-circle" type="button">Выдох</button>
      <div class="pair"><button class="btn btn-primary" type="button" data-nine>Девятый</button><button class="btn btn-ghost" type="button" data-reset>Сбился</button></div></div>`);
    stage.append(node);
    const circle = node.querySelector('.br-circle');
    const pulse = () => { circle.classList.remove('pulse'); void circle.offsetWidth; circle.classList.add('pulse'); };
    tap(ctx, circle, () => { pulse(); c++; if (c >= 9) { err++; c = 0; } });
    tap(ctx, node.querySelector('[data-nine]'), () => { pulse(); if (c === 8) ok++; else err++; c = 0; ctx.status(`${ok + err}`); });
    tap(ctx, node.querySelector('[data-reset]'), () => { resets++; c = 0; });
    ctx.wakeLock();
    ctx.countdown(min * 60, () => {
      const total = ok + err;
      ctx.done({
        value: pct(ok, total),
        lines: [
          `Циклов из девяти выдохов: ${total}, верно: ${ok}`,
          `Сбился и начал заново: ${resets} ${plural(resets, ['раз', 'раза', 'раз'])}`,
          `Длительность: ${min} мин`,
        ],
      });
    });
  },
};

export const GROUPS = [
  { id: 'speed', name: 'Скорость', note: 'Как быстро ты замечаешь и реагируешь' },
  { id: 'control', name: 'Контроль внимания', note: 'Держать цель и не отвлекаться на помехи' },
  { id: 'memory', name: 'Рабочая память', note: 'Сколько ты удерживаешь в голове одновременно' },
  { id: 'calm', name: 'Устойчивость', note: 'Внимание, которое не уплывает в мысли' },
];

export const EXERCISES = [reaction, gonogo, periphery, flanker, stroop, schulte, nback, corsi, breath];
