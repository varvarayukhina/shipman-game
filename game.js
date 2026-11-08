/* Движок: главы идут цепочкой, каждая задаёт свои шаги (steps). Содержание дела лежит в chapter1.js ... chapter3.js. */
(() => {
  // Две игры (дела): ?game=2 открывает вторую. У каждой свой ключ сохранения.
  const GAMES = { 1: [window.CH1, window.CH2, window.CH3, window.CH4], 2: [window.V1, window.V2, window.V3, window.V4] };
  const GAME = GAMES[new URLSearchParams(location.search).get('game')] ? new URLSearchParams(location.search).get('game') : '1';
  const CHS = GAMES[GAME];
  const app = document.getElementById('app');
  const START_HOURS = 24;

  // Имя врача скрыто до финала. В текстах глав стоят метки ⟦имя⟧ и ⟦полное⟧ (к метке можно дописывать падежное окончание).
  // ?name=real показывает настоящее имя везде.
  const REAL = new URLSearchParams(location.search).get('name') === 'real';
  const NAME = REAL ? 'Шипман' : 'Саймон';
  const FULL = REAL ? 'Гарольд Шипман' : 'Говард Саймон';
  const named = (html) => html.replaceAll('⟦имя⟧', NAME).replaceAll('⟦полное⟧', FULL);

  const blank = (ch, hours) => ({
    ch, step: CHS[ch].steps[0], hours,
    seen: new Set(), found: new Set(), round: 0, open: null, picks: [], log: [],
    placed: {}, tlMsg: '', flags: new Set(), auditDone: false, audit: { ok: 0, wrong: 0, total: 0 },
  });
  // Прогресс лежит в localStorage этого браузера: у каждого игрока свой, между устройствами не переносится.
  const KEY = GAME === '1' ? 'shipman-proto-v1' : `shipman-proto-v1-g${GAME}`;
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S, (k, v) => (v instanceof Set ? { set: [...v] } : v))); }
    catch (e) { console.warn('progress not saved:', e.message); }
  };
  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const o = JSON.parse(raw, (k, v) => (v && !Array.isArray(v) && v.set ? new Set(v.set) : v));
      const c = CHS[o.ch];
      return c && c.steps.includes(o.step) && o.round <= (c.interview || []).length ? o : null;
    } catch (e) { console.warn('progress not loaded:', e.message); return null; }
  };
  let S = load() || blank(0, CHS[0].startHours ?? START_HOURS);

  const C = () => CHS[S.ch];

  // Платная часть: пока оплаты нет, полный доступ включается ссылкой ?full=1 (?full=0 выключает). Это только вид, не защита.
  const ACCESS = 'shipman-proto-access';
  const hasAccess = () => {
    try {
      const q = new URLSearchParams(location.search).get('full');
      if (q === '1') localStorage.setItem(ACCESS, '1');
      if (q === '0') localStorage.removeItem(ACCESS);
      return localStorage.getItem(ACCESS) === '1';
    } catch (e) { console.warn('access flag unavailable:', e.message); return false; }
  };
  const PAYWALL = false; // true: после главы 1 показывается экран «платно»; false: все главы открыты (версия для оценки)
  const gated = () => PAYWALL && !!C().gate && !hasAccess();
  const total = (c) => (c.interview || []).filter((q) => !q.locked).length;
  const body = (d) => (typeof d.html === 'function' ? d.html(S) : d.html);
  const paper = (d) => `<article class="paper paper--${d.kind}">${body(d)}</article>`;
  const scene = (step, inner) => `<section class="scene" style="--bg:url(${C().img[step] || C().img.desk})">${inner}</section>`;

  const bar = () => {
    const c = C();
    return `
    <header class="bar">
      <span class="bar__item"><b>${c.name}</b><span class="bar__t">${c.title}</span></span>
      <span class="bar__item"><b>${c.clock.label}</b> <span class="num">${S.hours}</span> ч</span>
      ${c.interview ? `<span class="bar__item"><b>Противоречий</b> <span class="num">${S.found.size}</span> из ${total(c)}</span>` : ''}
    </header>`;
  };

  const chip = (id, attrs = '') => {
    const d = C().documents[id];
    return `
    <button class="chip chip--${d.kind}" data-id="${id}" ${attrs}>
      <span class="chip__t">${d.title}</span>
      <span class="chip__s">${d.short}</span>
    </button>`;
  };

  const logHtml = () => S.log.map((l) => {
    if (l.who === 'mark') return `<p class="mark"><span class="stamp">${l.text}</span></p>`;
    if (l.who === 'loss') return `<p class="loss">${l.text}</p>`;
    if (l.who === 'note') return `<p class="note">[${l.text}]</p>`;
    return `<p class="${l.who}"><b>${l.name}:</b> ${l.text}</p>`;
  }).join('');

  const views = {
    cover: () => scene('cover', `
      <div class="stage stage--center">
        <article class="paper paper--typed paper--memo">${C().cover.html}</article>
        <button class="btn" data-act="forward">${C().cover.button}</button>
      </div>`),

    reveal: () => scene('reveal', `
      <div class="stage stage--center">
        <article class="paper paper--typed paper--memo">${C().reveal.html}</article>
        <button class="btn" data-act="forward">Разбор дела</button>
      </div>`),

    intro: () => scene('intro', `
      <div class="stage stage--center">
        <article class="paper paper--typed paper--memo">${C().intro.html}</article>
        <button class="btn" data-act="forward">${C().intro.button}</button>
      </div>`),

    desk: () => {
      const c = C();
      const ids = Object.keys(c.documents);
      const ready = S.seen.size >= c.minRead;
      return scene('desk', `
        ${bar()}
        <div class="desk">
          <ul class="sheets" aria-label="Материалы дела">
            ${ids.map((id) => `<li>${chip(id, `data-act="open" aria-pressed="${S.open === id}"`)}${S.seen.has(id) ? '<span class="seen">прочитано</span>' : ''}</li>`).join('')}
          </ul>
          <div class="reader">
            ${S.open ? paper(c.documents[S.open]) : `<article class="paper paper--typed"><p>${c.deskHint}</p></article>`}
          </div>
        </div>
        <footer class="dock">
          <button class="btn" data-act="forward" ${ready ? '' : 'disabled'}>${c.deskNext}${ready ? '' : `: прочитано ${S.seen.size} из ${c.minRead}`}</button>
        </footer>`);
    },

    timeline: () => {
      const T = C().timeline;
      const placed = new Set(Object.values(S.placed));
      const free = T.events.filter((e) => !placed.has(e.id));
      const ready = T.slots.every((s, i) => s.locked || S.placed[i]);
      return scene('timeline', `
        ${bar()}
        <div class="tl">
          <article class="paper paper--form" aria-label="${T.title}">
            <h2>${T.title}</h2>
            <p>${T.hint}</p>
            ${S.picks[0] ? `<p class="tl__pick" role="status">Выбрано: <b>${T.events.find((e) => e.id === S.picks[0]).text}</b></p>` : ''}
            <ol class="slots">
              ${T.slots.map((s, i) => {
                const ev = S.placed[i] && T.events.find((e) => e.id === S.placed[i]);
                const inner = s.locked
                  ? `<span class="slot__body">${s.locked}</span>`
                  : ev
                    ? `<span class="slot__body"><b>${ev.text}</b><span class="slot__src">${ev.src}</span></span>`
                    : `<button class="slot__btn" data-act="slot" data-i="${i}" ${S.picks[0] ? '' : 'disabled'}>${S.picks[0] ? 'Поставить сюда' : 'Выбери событие'}</button>`;
                return `<li class="slot${ev ? ' slot--set' : ''}${s.locked ? ' slot--gap' : ''}"><span class="slot__t">${s.t}</span>${inner}</li>`;
              }).join('')}
            </ol>
            <p class="tl__msg" role="status">${S.tlMsg}</p>
          </article>
          ${free.length ? `<div class="tray">
            <p class="tray__t">События: осталось ${free.length}</p>
            <div class="tray__chips">
              ${free.map((e) => `<button class="chip" data-act="card" data-id="${e.id}" aria-pressed="${S.picks[0] === e.id}"><span class="chip__t">${e.text}</span></button>`).join('')}
            </div>
          </div>` : ''}
        </div>
        <footer class="dock">
          <button class="btn" data-act="forward" ${ready ? '' : 'disabled'}>Дальше${ready ? '' : ': расставлены не все события'}</button>
        </footer>`);
    },

    audit: () => {
      const A = C().audit;
      const done = S.auditDone;
      const verdict = (r, on) => (r.hit ? (on ? 'Верно' : 'Пропущена') : (on ? `Лишняя, −${A.missCost} ч` : A.none));
      return scene('audit', `
        ${bar()}
        <div class="audit">
          <article class="paper paper--printout">
            <h2>${A.title}</h2>
            <p>${A.hint}</p>
            <table class="log log--pick">
              <caption>${A.caption}</caption>
              <thead><tr><th>Отметка</th>${A.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
              <tbody>
                ${A.rows.map((r, i) => {
                  const on = S.flags.has(i);
                  const cls = done ? (r.hit ? (on ? 'ok' : 'miss') : (on ? 'bad' : '')) : (on ? 'on' : '');
                  return `<tr class="${cls}"><td><button class="pick" data-act="flag" data-i="${i}" aria-pressed="${on}" ${done ? 'disabled' : ''}>${done ? verdict(r, on) : (on ? 'Отмечена' : 'Отметить')}</button></td>${r.cells.map((cell, k) => `<td data-l="${A.head[k]}">${cell}</td>`).join('')}</tr>`;
                }).join('')}
              </tbody>
            </table>
            ${done ? `<p class="audit__res" role="status">${A.okLine(S.audit.ok, S.audit.total)}${S.audit.wrong ? ` Лишних отметок: ${S.audit.wrong}, потеряно ${S.audit.wrong * A.missCost} ч.` : ''}</p>` : ''}
          </article>
        </div>
        <footer class="dock">
          ${done
            ? '<button class="btn" data-act="forward">Вызвать на допрос</button>'
            : `<button class="btn" data-act="submit" ${S.flags.size ? '' : 'disabled'}>${A.submit}${S.flags.size ? `: отмечено ${S.flags.size}` : ''}</button>`}
        </footer>`);
    },

    interview: () => {
      const c = C();
      const q = c.interview[S.round];
      const ids = Object.keys(c.documents);
      const n = S.picks.length;
      const label = q.multi
        ? `Предъявить${n ? ` (${n})` : ''}`
        : `Предъявить${n ? `: ${c.documents[S.picks[0]].title}` : ''}`;
      return scene('interview', `
        ${bar()}
        <div class="room">
          <article class="paper paper--transcript" aria-label="Протокол допроса">
            <h2>${c.transcriptTitle}</h2>
            ${logHtml()}
            <p class="sh"><b>${c.suspect}:</b> ${q.say}</p>
          </article>
          <div class="tray">
            ${q.locked
              ? `<p class="tray__t">Вопрос ${S.round + 1} из ${c.interview.length}</p><p class="tray__p">${q.lockedNote}</p>`
              : `<p class="tray__t">${q.prompt || 'Что предъявляешь?'} Вопрос ${S.round + 1} из ${c.interview.length}</p>
                 <div class="tray__chips">${ids.map((id) => chip(id, `data-act="pick" aria-pressed="${S.picks.includes(id)}"`)).join('')}</div>`}
          </div>
        </div>
        <footer class="dock">
          ${q.locked
            ? `<button class="btn" data-act="accept">${q.accept}</button>`
            : `<button class="btn" data-act="present" ${n ? '' : 'disabled'}>${label}</button>
               <button class="btn btn--quiet" data-act="skip">Пропустить вопрос</button>`}
        </footer>`);
    },

    turn: () => scene('turn', `
      ${bar()}
      <div class="stage stage--center">
        ${paper(C().turn)}
        <button class="btn" data-act="forward">${C().turn.button}</button>
      </div>`),

    solution: () => scene('solution', `
      <div class="stage stage--center">
        <article class="paper paper--typed paper--memo">${C().solution.html}</article>
        ${C().solution.next ? `<a class="btn" href="${C().solution.next.href}">${C().solution.next.label}</a>` : ''}
        <button class="btn btn--quiet" data-act="restart">Сыграть сначала</button>
      </div>`),

    end: () => {
      const c = C();
      const next = CHS[S.ch + 1];
      return scene('end', `
        <div class="stage stage--center">
          <article class="paper paper--typed paper--memo">${c.end.html(S.found.size, total(c), S.hours, S)}${c.end.real ? `<p class="real"><span class="stamp">Это было на самом деле</span> ${c.end.real}</p>` : ''}</article>
          ${next && gated() ? `<article class="paper paper--form paywall"><h2>${c.gate.title}</h2>${c.gate.html}</article>` : ''}
          ${next && !gated() ? `<button class="btn" data-act="nextch">Дальше: ${next.name}, «${next.title}»</button>` : ''}
          ${!next && c.solution ? `<button class="btn" data-act="forward">${c.endNext}</button>` : ''}
          <button class="btn btn--quiet" data-act="restart">Сыграть сначала</button>
        </div>`);
    },
  };

  const go = (step) => { S.step = step; render(); window.scrollTo(0, 0); };
  const forward = () => { const st = C().steps; go(st[st.indexOf(S.step) + 1]); };

  function render() {
    app.innerHTML = named(views[S.step]());
    const t = document.querySelector('.paper--transcript');
    if (t) t.scrollTop = t.scrollHeight;
    save();
  }

  const toView = (sel) => { if (matchMedia('(max-width: 899px)').matches) document.querySelector(sel)?.scrollIntoView({ block: 'start' }); };
  const reply = (name, text, who) => S.log.push({ name, text, who });
  const next = () => { S.round += 1; S.picks = []; S.round >= C().interview.length ? forward() : render(); };
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  const acts = {
    forward,
    open: (el) => {
      S.open = el.dataset.id; S.seen.add(S.open); render();
      if (matchMedia('(max-width: 899px)').matches) document.querySelector('.reader').scrollIntoView({ block: 'start' });
    },
    card: (el) => { S.picks = S.picks[0] === el.dataset.id ? [] : [el.dataset.id]; render(); if (S.picks[0]) toView('.slots'); },
    slot: (el) => {
      const T = C().timeline;
      const i = +el.dataset.i;
      const ev = T.events.find((e) => e.id === S.picks[0]);
      if (!ev) return;
      if (ev.slot === i) { S.placed[i] = ev.id; S.tlMsg = `Верно. Источник: ${ev.src}.`; }
      else { S.hours = Math.max(0, S.hours - T.missCost); S.tlMsg = `Мимо. Потеряно ${T.missCost} ч.`; }
      S.picks = [];
      if (T.slots.every((s, k) => s.locked || S.placed[k])) S.tlMsg = T.done;
      render();
      toView('.tray');
    },
    flag: (el) => { const i = +el.dataset.i; S.flags.has(i) ? S.flags.delete(i) : S.flags.add(i); render(); },
    submit: () => {
      const A = C().audit;
      let ok = 0, wrong = 0, n = 0;
      A.rows.forEach((r, i) => { if (r.hit) n += 1; if (S.flags.has(i)) { r.hit ? ok += 1 : wrong += 1; } });
      S.audit = { ok, wrong, total: n };
      S.hours = Math.max(0, S.hours - wrong * A.missCost);
      S.auditDone = true;
      render();
    },
    pick: (el) => {
      const id = el.dataset.id;
      if (C().interview[S.round].multi) S.picks = S.picks.includes(id) ? S.picks.filter((x) => x !== id) : [...S.picks, id];
      else S.picks = S.picks[0] === id ? [] : [id];
      render();
    },
    present: () => {
      const c = C();
      const q = c.interview[S.round];
      reply(c.suspect, q.say, 'sh');
      reply('Следователь', `Предъявляю: ${S.picks.map((id) => c.documents[id].title).join(', ')}.`, 'cop');
      const ok = q.multi ? sameSet(S.picks, q.needs) : q.needs.includes(S.picks[0]);
      if (ok) {
        S.found.add(S.round);
        reply(c.suspect, q.hit, 'sh');
        if (q.note) reply('', q.note, 'note');
        reply('', q.stamp || 'Противоречие зафиксировано', 'mark');
      } else {
        S.hours = Math.max(0, S.hours - c.clock.missCost);
        reply(c.suspect, q.miss, 'sh');
        reply('', `Мимо. Потеряно ${c.clock.missCost} ч.`, 'loss');
      }
      next();
    },
    skip: () => {
      const q = C().interview[S.round];
      reply(C().suspect, q.say, 'sh'); reply('Следователь', 'Переходим к следующему вопросу.', 'cop');
      next();
    },
    accept: () => {
      const q = C().interview[S.round];
      reply(C().suspect, q.say, 'sh'); reply('', q.lockedLog, 'loss');
      next();
    },
    nextch: () => {
      if (gated()) return;
      S = blank(S.ch + 1, CHS[S.ch + 1].startHours ?? S.hours);
      go('intro');
    },
    restart: () => { S = blank(0, CHS[0].startHours ?? START_HOURS); go(S.step); },
  };

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && !el.disabled) acts[el.dataset.act](el);
  });

  render();
})();
