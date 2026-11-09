/* Движок: главы идут цепочкой, каждая задаёт свои шаги (steps). Содержание дела лежит в chapter1.js ... chapter3.js. */
(() => {
  // Две игры (дела): ?game=2 открывает вторую. У каждой свой ключ сохранения.
  const GAMES = {
    1: [window.CH1, window.CH2, window.CH3, window.CH4],
    2: [window.V1, window.V2, window.V3, window.V4],
    3: [window.W1, window.W2, window.W3, window.W4].filter(Boolean),
    4: [window.Z1, window.Z2, window.Z3].filter(Boolean),
  };
  const app = document.getElementById('app');
  const ASKED = new URLSearchParams(location.search).get('game');
  const saveKey = (n) => (n === '1' ? 'shipman-proto-v1' : `shipman-proto-v1-g${n}`);

  // Каталог: главная страница без ?game. Прогресс читаем из localStorage каждой игры.
  function catalog() {
    const prog = (n) => { try { const raw = localStorage.getItem(saveKey(n)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
    const cards = Object.keys(GAMES).filter((n) => GAMES[n][0] && GAMES[n][0].meta).map((n) => {
      const m = GAMES[n][0].meta;
      const st = prog(n);
      const label = !st ? 'Начать' : st.step === 'solution' ? 'Пройдено. Сыграть снова' : `Продолжить: глава ${st.ch + 1}`;
      return `
        <article class="case">
          <img src="${m.img}" width="1672" height="941" alt="${m.alt}">
          <div class="case__body">
            <p class="case__tag">${m.tag}</p>
            <h2>Дело №${n}. ${m.title}</h2>
            <p>${m.teaser}</p>
            <a class="btn" href="?game=${n}">${label}</a>
          </div>
        </article>`;
    }).join('');
    document.title = 'Дела. Игры-расследования';
    app.innerHTML = `
      <section class="scene" style="--bg:url(img/case-desk.jpg)">
        <div class="catalog">
          <header class="paper paper--typed paper--memo catalog__head">
            <h1>ДЕЛА</h1>
            <p>Детективные игры по настоящим делам. Вы следователь: читаете документы, допрашиваете, собираете доказательства. Имена и названия изменены. Какое это было дело, откроется в конце.</p>
          </header>
          <div class="cases">${cards}</div>
        </div>
      </section>`;
  }
  if (!GAMES[ASKED]) { catalog(); return; }
  const GAME = ASKED;
  const CHS = GAMES[GAME];
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
    placed: {}, tlMsg: '', say: '', flags: new Set(), auditDone: false, audit: { ok: 0, wrong: 0, total: 0 },
    opener: { pick: null, done: false, ok: false }, choice: { pick: null, done: false, ok: false }, cross: { asked: [] }, lab: { phase: 'tests', run: [], pick: [], done: false, ok: false }, misses: 0, partial: [], deadline: null, closed: false, notice: '', noticeNext: '',
  });
  // Прогресс лежит в localStorage этого браузера: у каждого игрока свой, между устройствами не переносится.
  const KEY = saveKey(GAME);
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
      // старые сохранения без новых полей дополняем значениями по умолчанию
      if (!c || !c.steps.includes(o.step) || o.round > (c.interview || []).length) return null;
      // содержание глав обновляли: расстановка событий, которой нет в хронологии, сбрасывается
      const T = c.timeline;
      if (T && Object.entries(o.placed || {}).some(([i, id]) => !T.slots[i] || T.slots[i].locked || !T.events.some((e) => e.id === id))) { o.placed = {}; o.tlMsg = ''; }
      return { ...blank(o.ch, o.hours), ...o };
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
  const total = (c) => (c.opener ? 1 : 0) + (c.choice ? 1 : 0) + (c.lab ? 1 : 0) + (c.interview || []).filter((q) => !q.locked).length;
  const unit = () => (C().clock && C().clock.unit) || 'ч';

  // Таймер чтения («архив закрывается»). Дедлайн хранится временем, обновление страницы его не сбрасывает.
  // «Без таймера» (доступность): кнопка на столе, выбор запоминается.
  const NOTIMER = 'shipman-no-timer';
  const noTimer = () => { try { return localStorage.getItem(NOTIMER) === '1'; } catch (e) { return false; } };
  const left = () => Math.max(0, Math.ceil(((S.deadline || 0) - Date.now()) / 1000));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const timerOn = () => S.step === 'desk' && !!C().timed && !noTimer() && !S.closed;
  const notice = () => (S.notice ? `<p class="notice" role="status">${S.notice}</p>` : '');
  const body = (d) => (typeof d.html === 'function' ? d.html(S) : d.html);
  const paper = (d) => `<article class="paper paper--${d.kind}">${body(d)}</article>`;
  const scene = (step, inner) => `<section class="scene" style="--bg:url(${C().img[step] || C().img.desk})">${inner}</section>`;

  const bar = () => {
    const c = C();
    return `
    <header class="bar">
      <span class="bar__item"><b>${c.name}</b><span class="bar__t">${c.title}</span></span>
      <span class="bar__item"><b>${c.clock.label}</b> <span class="num">${S.hours}</span> ${unit()}</span>
      ${timerOn() && S.deadline ? `<span class="bar__item"><b>${c.timedLabel}</b> <span class="num" id="countdown" role="timer">${fmt(left())}</span></span>` : ''}
      ${c.interview || c.opener || c.choice || c.lab ? `<span class="bar__item"><b>${c.scoreLabel || 'Противоречий'}</b> <span class="num">${S.found.size}</span> из ${total(c)}</span>` : ''}
    </header>`;
  };

  const chip = (id, attrs = '', note = '') => {
    const d = C().documents[id];
    return `
    <button class="chip chip--${d.kind}" data-id="${id}" ${attrs}>
      <span class="chip__t">${d.title}</span>
      <span class="chip__s">${note || d.short}</span>
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
        <a class="btn btn--quiet" href="./">Все дела</a>
      </div>`),

    reveal: () => scene('reveal', `
      <div class="stage stage--center">
        <article class="paper paper--typed paper--memo">${C().reveal.html}</article>
        <button class="btn" data-act="forward">Разбор дела</button>
      </div>`),

    opener: () => {
      const O = C().opener;
      const st = S.opener;
      return scene('opener', `
        ${bar()}
        <div class="room">
          <article class="paper paper--transcript" aria-label="Первый вопрос">
            <h2>${O.title}</h2>
            <p class="sr-only" role="status">${S.say || ''}</p>
            <p>${O.prompt}</p>
            ${st.done ? `<p class="mark"><span class="stamp">${st.ok ? (O.stamp || 'Противоречие зафиксировано') : 'Мимо'}</span></p><p>${st.ok ? O.hit : O.miss}</p>` : ''}
          </article>
          <div class="tray">
            <p class="tray__t">Выбери одну бумагу из папки</p>
            <div class="tray__chips">
              ${O.options.map((o, i) => `<button class="chip" data-act="opick" data-i="${i}" aria-pressed="${st.pick === i}" ${st.done ? 'disabled' : ''}><span class="chip__t">${o.title}</span><span class="chip__s">${o.text}</span></button>`).join('')}
            </div>
          </div>
        </div>
        <footer class="dock">
          ${st.done
            ? '<button class="btn" data-act="forward">Дальше</button>'
            : `<button class="btn" data-act="oanswer" ${st.pick === null ? 'disabled' : ''}>Ответить${st.pick === null ? '' : `: ${O.options[st.pick].title}`}</button>`}
        </footer>`);
    },

    choice: () => {
      const K = C().choice;
      const st = S.choice;
      const o = st.pick === null ? null : K.options[st.pick];
      return scene('choice', `
        ${bar()}
        ${notice()}
        <div class="room">
          <article class="paper paper--transcript" aria-label="${K.title}">
            <h2>${K.title}</h2>
            <p class="sr-only" role="status">${S.say || ''}</p>
            <p>${K.prompt}</p>
            ${st.done ? `<p class="mark"><span class="stamp">${o.ok ? (K.stamp || 'Верный ход') : (K.badStamp || 'Не сработало')}</span></p><p>${o.out}</p>` : ''}
          </article>
          <div class="tray">
            <p class="tray__t">${K.ask || 'Выбери, как поступить'}</p>
            <div class="tray__chips">
              ${K.options.map((x, i) => `<button class="chip" data-act="ckpick" data-i="${i}" aria-pressed="${st.pick === i}" ${st.done ? 'disabled' : ''}><span class="chip__t">${x.title}</span><span class="chip__s">${x.text}</span></button>`).join('')}
            </div>
          </div>
        </div>
        <footer class="dock">
          ${st.done
            ? '<button class="btn" data-act="forward">Дальше</button>'
            : `<button class="btn" data-act="ckanswer" ${st.pick === null ? 'disabled' : ''}>Решить${st.pick === null ? '' : `: ${K.options[st.pick].title}`}</button>`}
        </footer>`);
    },

    lab: () => {
      const L = C().lab;
      const st = S.lab;
      const ran = L.tests.filter((t) => st.run.includes(t.id));
      const basis = st.phase === 'basis';
      const canMore = L.tests.some((t) => !st.run.includes(t.id) && t.cost <= S.hours);
      const needN = Math.min(L.need, st.run.length);
      return scene('lab', `
        ${bar()}
        ${notice()}
        <div class="room">
          <article class="paper paper--printout" aria-label="${L.title}">
            <h2>${L.title}</h2>
            <p class="sr-only" role="status">${S.say || ''}</p>
            <p>${st.done ? (st.ok ? L.okText : L.badText) : (basis ? L.basisHint : L.hint)}</p>
            ${ran.length ? `<table class="log"><caption>Журнал лаборатории</caption><thead><tr><th>Проба</th><th>Результат</th></tr></thead><tbody>${ran.map((t) => `<tr${st.done && st.pick.includes(t.id) ? ' class="flag"' : ''}><td data-l="Проба">${t.name}</td><td data-l="Результат">${t.result}</td></tr>`).join('')}</tbody></table>` : '<p>Журнал пока пуст.</p>'}
          </article>
          <div class="tray">
            ${st.done ? '' : basis
              ? `<p class="tray__t">Что лежит в основе заключения? Выбери ${needN}. Выбрано: ${st.pick.length}.</p>
                 <div class="tray__chips">${ran.map((t) => `<button class="chip" data-act="labpick" data-id="${t.id}" aria-pressed="${st.pick.includes(t.id)}"><span class="chip__t">${t.name}</span><span class="chip__s">${t.short}</span></button>`).join('')}</div>`
              : `<p class="tray__t">Пробы. Осталось ${S.hours} ${unit()}.</p>
                 <div class="tray__chips">${L.tests.map((t) => { const used = st.run.includes(t.id); const cant = !used && t.cost > S.hours; return `<button class="chip" data-act="labrun" data-id="${t.id}" ${used || cant ? 'disabled' : ''}><span class="chip__t">${t.name}</span><span class="chip__s">${used ? 'проведена' : cant ? 'не хватает времени' : `${t.cost} ${unit()}`}</span></button>`; }).join('')}</div>`}
          </div>
        </div>
        <footer class="dock">
          ${st.done
            ? '<button class="btn" data-act="forward">Дальше</button>'
            : basis
              ? `<button class="btn" data-act="labsubmit" ${st.pick.length === needN ? '' : 'disabled'}>Подписать заключение</button>${canMore ? '<button class="btn btn--quiet" data-act="labback">Назад к пробам</button>' : ''}`
              : `<button class="btn" data-act="labbasis" ${st.run.length >= L.need || !canMore ? '' : 'disabled'}>${st.run.length >= L.need || !canMore ? 'К заключению' : `Проведи ещё пробы: ${st.run.length} из ${L.need}`}</button>`}
        </footer>`);
    },

    cross: () => {
      const K = C().cross;
      const asked = S.cross.asked;
      const left = K.picks - asked.length;
      const free = K.questions.filter((q) => !asked.includes(q.id));
      return scene('cross', `
        ${bar()}
        ${notice()}
        <div class="room">
          <article class="paper paper--transcript" aria-label="${K.title}">
            <h2>${K.title}</h2>
            <p class="sr-only" role="status">${S.say || ''}</p>
            <p>${K.prompt}</p>
            ${logHtml()}
          </article>
          <div class="tray">
            ${left > 0
              ? `<p class="tray__t">${K.ask || 'Что спросить свидетеля?'} Вопросов осталось: ${left}.</p>
                 <div class="tray__chips">${free.map((q) => `<button class="chip" data-act="qpick" data-id="${q.id}" aria-pressed="${S.picks[0] === q.id}"><span class="chip__t">${q.text}</span></button>`).join('')}</div>`
              : `<p class="tray__t">Вопросы закончились.</p><p class="tray__p">${K.after || 'Суд просит вас сесть.'}</p>`}
          </div>
        </div>
        <footer class="dock">
          ${left > 0
            ? `<button class="btn" data-act="qask" ${S.picks[0] ? '' : 'disabled'}>Задать вопрос</button><button class="btn btn--quiet" data-act="forward">Закончить допрос</button>`
            : '<button class="btn" data-act="forward">Дальше</button>'}
        </footer>`);
    },

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
          ${timerOn() ? '<button class="btn btn--quiet" data-act="notimer">Без таймера</button>' : ''}
        </footer>`);
    },

    timeline: () => {
      const T = C().timeline;
      const placed = new Set(Object.values(S.placed));
      const free = T.events.filter((e) => !placed.has(e.id));
      const ready = T.slots.every((s, i) => s.locked || S.placed[i]);
      return scene('timeline', `
        ${bar()}
        ${notice()}
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
      const verdict = (r, on) => (r.hit ? (on ? 'Верно' : 'Пропущена') : (on ? `Лишняя, −${A.missCost} ${unit()}` : A.none));
      return scene('audit', `
        ${bar()}
        ${notice()}
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
            ${done ? `<p class="audit__res" role="status">${A.okLine(S.audit.ok, S.audit.total)}${S.audit.wrong ? ` Лишних отметок: ${S.audit.wrong}, потеряно ${S.audit.wrong * A.missCost} ${unit()}.` : ''}</p>` : ''}
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
      const max = c.maxMisses || 3;
      return scene('interview', `
        ${bar()}
        ${notice()}
        <div class="room">
          <article class="paper paper--transcript" aria-label="Протокол допроса">
            <h2>${c.transcriptTitle}</h2>
            <p class="sr-only" role="status">${S.say || ''}</p>
            ${logHtml()}
            <p class="sh"><b>${c.suspect}:</b> ${q.say}</p>
          </article>
          <div class="tray">
            ${q.locked
              ? `<p class="tray__t">Вопрос ${S.round + 1} из ${c.interview.length}</p><p class="tray__p">${q.lockedNote}</p>`
              : `<p class="tray__t">${q.prompt || 'Что предъявляешь?'} Вопрос ${S.round + 1} из ${c.interview.length}. Промахов: ${S.misses} из ${max}.</p>
                 <div class="tray__chips">${ids.map((id) => { const lost = c.timed && S.closed && !S.seen.has(id); return chip(id, lost ? 'disabled' : `data-act="pick" aria-pressed="${S.picks.includes(id)}"`, lost ? 'не успели прочитать' : ''); }).join('')}</div>`}
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
      ${notice()}
      <div class="stage stage--center">
        ${paper(C().turn)}
        <button class="btn" data-act="forward">${C().turn.button}</button>
      </div>`),

    solution: () => scene('solution', `
      <div class="stage stage--center">
        <article class="paper paper--typed paper--memo">${C().solution.html}</article>
        ${C().solution.next ? `<a class="btn" href="${C().solution.next.href}">${C().solution.next.label}</a>` : ''}
        <a class="btn btn--quiet" href="./">Все дела</a>
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

  const go = (step) => { S.step = step; S.picks = []; S.notice = S.noticeNext || ''; S.noticeNext = ''; render(); window.scrollTo(0, 0); };
  const forward = () => { const st = C().steps; go(st[st.indexOf(S.step) + 1]); };

  function render() {
    if (timerOn() && !S.deadline) S.deadline = Date.now() + C().timed * 1000;
    app.innerHTML = named(views[S.step]());
    const t = document.querySelector('.paper--transcript');
    if (t) t.scrollTop = t.scrollHeight;
    save();
  }

  const toView = (sel) => { if (matchMedia('(max-width: 899px)').matches) document.querySelector(sel)?.scrollIntoView({ block: 'start' }); };
  const reply = (name, text, who) => S.log.push({ name, text, who });
  // Допрос обрывается, если вышли часы или набралось слишком много промахов: ошибки имеют цену.
  const cutWhy = () => {
    const c = C();
    if (S.misses >= (c.maxMisses || 3)) return c.cut?.misses || 'Адвокат прекращает допрос: слишком много промахов. Оставшиеся вопросы не заданы.';
    if (S.hours <= 0) return c.clock.out || 'Время вышло. Допрос окончен.';
    return null;
  };
  const next = () => {
    const len = C().interview.length;
    S.round += 1; S.picks = [];
    if (S.round < len) { const why = cutWhy(); if (why) { S.noticeNext = why; S.round = len; } }
    S.round >= len ? forward() : render();
  };
  function timeUp() {
    const c = C();
    S.closed = true; S.deadline = null;
    S.noticeNext = `${c.timedOut} Прочитано ${S.seen.size} из ${Object.keys(c.documents).length}. Непрочитанное на допросе недоступно.`;
    forward();
  }
  setInterval(() => {
    if (!timerOn() || !S.deadline) return;
    const l = left();
    const el = document.getElementById('countdown');
    if (el) el.textContent = fmt(l);
    if (l <= 0) timeUp();
  }, 1000);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  const acts = {
    forward,
    open: (el) => {
      S.open = el.dataset.id; S.seen.add(S.open); render();
      if (matchMedia('(max-width: 899px)').matches) document.querySelector('.reader').scrollIntoView({ block: 'start' });
    },
    opick: (el) => { S.opener.pick = +el.dataset.i; render(); },
    oanswer: () => {
      const O = C().opener;
      const ok = !!O.options[S.opener.pick].ok;
      S.opener.done = true; S.opener.ok = ok;
      if (ok) S.found.add('o'); else S.hours = Math.max(0, S.hours - (O.missCost ?? 1));
      S.say = ok ? 'Верно.' : 'Мимо.';
      render();
    },
    notimer: () => { try { localStorage.setItem(NOTIMER, '1'); } catch (e) { console.warn(e.message); } S.deadline = null; render(); },
    ckpick: (el) => { S.choice.pick = +el.dataset.i; render(); },
    ckanswer: () => {
      const K = C().choice;
      const o = K.options[S.choice.pick];
      S.choice.done = true; S.choice.ok = !!o.ok;
      if (o.ok) S.found.add('k');
      S.hours = Math.max(0, S.hours + (o.d !== undefined ? o.d : -(o.cost ?? (o.ok ? 0 : K.missCost ?? 2))));
      S.say = o.ok ? 'Верный ход.' : 'Не сработало.';
      render();
    },
    labrun: (el) => {
      const t = C().lab.tests.find((x) => x.id === el.dataset.id);
      if (!t || S.lab.run.includes(t.id) || t.cost > S.hours) return;
      S.lab.run.push(t.id); S.hours -= t.cost;
      S.say = `Проба проведена, потрачено ${t.cost} ${unit()}.`;
      render();
    },
    labbasis: () => { S.lab.phase = 'basis'; S.lab.pick = []; render(); },
    labback: () => { S.lab.phase = 'tests'; S.lab.pick = []; render(); },
    labpick: (el) => {
      const id = el.dataset.id; const need = Math.min(C().lab.need, S.lab.run.length);
      if (S.lab.pick.includes(id)) S.lab.pick = S.lab.pick.filter((x) => x !== id);
      else if (S.lab.pick.length < need) S.lab.pick = [...S.lab.pick, id];
      render();
    },
    labsubmit: () => {
      const L = C().lab;
      const picks = S.lab.pick.map((id) => L.tests.find((t) => t.id === id));
      const ok = picks.length === L.need && picks.every((t) => t.proof);
      S.lab.done = true; S.lab.ok = ok;
      if (ok) S.found.add('l'); else S.hours = Math.max(0, S.hours - (L.missCost ?? 3));
      S.say = ok ? 'Заключение принято.' : 'Заключение оспорено.';
      render();
    },
    qpick: (el) => { S.picks = S.picks[0] === el.dataset.id ? [] : [el.dataset.id]; render(); },
    qask: () => {
      const K = C().cross;
      const q = K.questions.find((x) => x.id === S.picks[0]);
      if (!q || S.cross.asked.includes(q.id)) return;
      S.cross.asked.push(q.id);
      reply('Адвокат', q.text, 'cop');
      reply(K.witness, q.say, 'sh');
      if (q.note) reply('', q.note, 'note');
      reply('', q.d >= 0 ? `Ответ в вашу пользу, +${q.d} ${unit()}` : `Ответ против вас, ${q.d} ${unit()}`, q.d >= 0 ? 'mark' : 'loss');
      S.hours = Math.max(0, S.hours + q.d);
      S.say = q.d >= 0 ? 'Ответ в вашу пользу.' : 'Ответ против вас.';
      S.picks = [];
      render();
    },
    card: (el) => { S.picks = S.picks[0] === el.dataset.id ? [] : [el.dataset.id]; render(); if (S.picks[0]) toView('.slots'); },
    slot: (el) => {
      const T = C().timeline;
      const i = +el.dataset.i;
      const ev = T.events.find((e) => e.id === S.picks[0]);
      if (!ev) return;
      if (ev.slot === i) { S.placed[i] = ev.id; S.tlMsg = `Верно. Источник: ${ev.src}.`; }
      else { S.hours = Math.max(0, S.hours - T.missCost); S.tlMsg = `Мимо. Потеряно ${T.missCost} ${unit()}.`; }
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
      const id = S.picks[0];
      reply(c.suspect, q.say, 'sh');
      reply('Следователь', `Предъявляю: ${S.picks.map((x) => c.documents[x].title).join(', ')}.`, 'cop');
      const ok = q.multi ? sameSet(S.picks, q.needs) : q.needs.includes(id);
      const trap = !ok && !q.multi && q.traps?.[id];
      const part = !ok && !q.multi && q.partial?.[id] && !S.partial.includes(`${S.round}:${id}`);
      if (part) {
        // почти попал: вопрос остаётся открытым, цены нет, второй раз тот же документ уже промах
        S.partial.push(`${S.round}:${id}`);
        reply(c.suspect, q.partial[id].say, 'sh');
        reply('', q.partial[id].note, 'note');
        S.say = 'Почти. Можно предъявить ещё один документ.';
        S.picks = [];
        render();
        return;
      }
      if (ok) {
        S.found.add(S.round);
        reply(c.suspect, q.hit, 'sh');
        if (q.note) reply('', q.note, 'note');
        reply('', q.stamp || 'Противоречие зафиксировано', 'mark');
        S.say = 'Противоречие зафиксировано.';
      } else {
        const cost = trap ? (trap.cost ?? 4) : c.clock.missCost;
        S.hours = Math.max(0, S.hours - cost);
        S.misses += 1;
        reply(c.suspect, trap ? trap.say : q.miss, 'sh');
        if (trap && trap.note) reply('', trap.note, 'note');
        reply('', trap ? `Бумага сработала против вас. Потеряно ${cost} ${unit()}.` : `Мимо. Потеряно ${cost} ${unit()}.`, 'loss');
        S.say = `${trap ? 'Бумага сработала против вас.' : 'Мимо.'} Потеряно ${cost} ${unit()}.`;
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
    restart: () => { if (!confirm('Начать это дело сначала? Прогресс будет стёрт.')) return; S = blank(0, CHS[0].startHours ?? START_HOURS); go(S.step); },
  };

  // Двойной щелчок по «Решить» или «Дальше»: вторая половина попадала бы на новую кнопку и пропускала результат ответа.
  const COMMIT = new Set(['forward', 'nextch', 'oanswer', 'ckanswer', 'labsubmit', 'submit', 'present', 'skip', 'accept', 'qask']);
  let lastCommit = 0;
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (Date.now() - lastCommit < 350) return;
    const sel = `[data-act="${el.dataset.act}"]${el.dataset.id ? `[data-id="${el.dataset.id}"]` : ''}${el.dataset.i ? `[data-i="${el.dataset.i}"]` : ''}`;
    const was = `${S.ch}:${S.step}`;
    acts[el.dataset.act](el);
    if (COMMIT.has(el.dataset.act)) lastCommit = Date.now();
    // render() пересобирает страницу целиком: возвращаем фокус, иначе клавиатура и скринридер теряют место
    const same = document.querySelector(sel);
    if (was === `${S.ch}:${S.step}` && same && !same.disabled) same.focus({ preventScroll: true });
    else { const h = document.querySelector('h1, h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
  });

  render();
})();
