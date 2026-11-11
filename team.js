/* Движок игры для компании: у каждого своя роль и свои бумаги, ответы вводит ведущий. Без сервера: прогресс лежит в localStorage этого телефона.
   Содержание лежит в team1.js (window.T1).
   Бумаги лежат в папках, папки в ящиках картотеки; бумагу можно отметить звёздочкой, отправить в чат или запросить у другого игрока ссылкой. */
(() => {
  const T = window.T1;
  const app = document.getElementById('app');
  const KEY = 'shipman-team-1';
  const N = T.rounds.length;
  const POINTS = { ok1: 2, ok2: 1, shown: 0 };
  const BG = ['img/lift-shaft.jpg', 'img/vault-wall.jpg', 'img/night-street.jpg', 'img/street-1998.jpg', 'img/interview-room.jpg', 'img/cemetery-tent.jpg'];
  const bgOf = (i) => BG[i] || 'img/case-desk.jpg';
  const role = (id) => T.roles.find((r) => r.id === id);
  const blank = () => ({ view: 'lobby', role: null, round: 0, max: 0, tries: {}, res: {}, hist: {}, pick: [null, null, null], open: 0, fav: [], drawer: null, ask: null, in: null, note: '', spoil: false, ucode: '' });

  const sheetsOf = (rid, roleId) => (T.rounds[rid] && T.rounds[rid].sheets[roleId]) || [];
  // Вопросы трёх видов: pick (выбрать ответ из трёх в каждой части), order (расставить события по порядку), who (назвать человека из списка).
  const kindOf = (r) => r.kind || 'pick';
  const freshPick = (r) => (kindOf(r) === 'order' ? [] : r.parts.map(() => null));
  // Код между вопросами: ведущий видит его после ответа и называет вслух, у остальных без него следующий вопрос не открывается. Сервера нет, поэтому код считается из номера вопроса.
  const code = (i) => String((((i + 1) * 37) % 90) + 10);

  const load = () => {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!o || (o.role && !role(o.role))) return null;
      const s = { ...blank(), ...o };
      s.round = Math.min(Math.max(0, s.round | 0), N - 1);
      s.max = Math.min(Math.max(s.round, s.max | 0), N - 1);
      s.fav = Array.isArray(s.fav) ? s.fav.filter((k) => typeof k === 'string') : [];
      const r = T.rounds[s.round]; const k = kindOf(r);
      const okPick = Array.isArray(s.pick) && (k === 'order'
        ? s.pick.every((v) => Number.isInteger(v) && r.events[v]) && new Set(s.pick).size === s.pick.length
        : s.pick.length === r.parts.length && s.pick.every((v, i) => v === null || (k === 'who' ? r.names[v] !== undefined : !!r.parts[i].options[v])));
      if (!okPick) s.pick = freshPick(r);
      s.ucode = '';
      if (!s.role) s.view = 'lobby';
      if (s.view === 'cab' && !s.role) s.view = 'lobby';
      return s;
    } catch (e) { console.warn('progress not loaded:', e.message); return null; }
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('progress not saved:', e.message); } };
  let S = load() || blank();

  const R = () => T.rounds[S.round];
  const emptyPick = () => freshPick(R());
  const isLead = () => !!role(S.role).lead;
  const score = () => Object.values(S.res).reduce((a, k) => a + (POINTS[k] || 0), 0);
  const names = (ids) => [].concat(ids).map((i) => role(i).name).join(', ');
  const rightOrder = (seq) => seq.filter((v, k) => R().events[v].at === k).length;
  const rightWho = (seq) => seq.filter((v, k) => R().names[v] === R().parts[k].who).length;
  const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); };
  const pageUrl = () => location.href.split(/[?#]/)[0];

  // ссылка вида ?role=sc&round=2&sheet=1&from=lead: «запрос бумаги». Открывает телефон владельца на нужной бумаге.
  const q = new URLSearchParams(location.search);
  const asked = q.get('role');
  if (asked && role(asked) && S.role && S.role !== asked) {
    S.note = `Это ссылка для роли «${role(asked).name}». На этом телефоне роль «${role(S.role).name}», она не изменена.`;
    if (window.history && history.replaceState) history.replaceState(null, '', pageUrl());
  } else if (asked && role(asked)) {
    S.role = asked;
    if (S.view === 'lobby') S.view = 'round';
    const rid = Number.parseInt(q.get('round'), 10);
    const sh = Number.parseInt(q.get('sheet'), 10);
    const from = q.get('from');
    if (Number.isInteger(rid) && rid >= 0 && rid < N) {
      S.round = rid; S.max = Math.max(S.max, rid); S.pick = emptyPick(); S.view = 'round'; S.drawer = null; S.ask = null;
      if (Number.isInteger(sh) && sheetsOf(rid, asked)[sh]) {
        S.open = sh;
        S.in = from && role(from) && from !== asked ? { from, rid, i: sh } : null;
      }
    }
    if (window.history && history.replaceState) history.replaceState(null, '', pageUrl());
  }

  const favKey = (rid, i) => `${S.role}:${rid}:${i}`;
  const isFav = (rid, i) => S.fav.includes(favKey(rid, i));
  const favItems = () => S.fav.map((k) => k.split(':')).filter((p) => p[0] === S.role)
    .map((p) => ({ rid: +p[1], i: +p[2] })).filter((x) => sheetsOf(x.rid, S.role)[x.i])
    .sort((a, b) => a.rid - b.rid || a.i - b.i)
    .map((x) => ({ ...x, ...sheetsOf(x.rid, S.role)[x.i] }));
  const itemsOf = (rid) => sheetsOf(rid, S.role).map((s, i) => ({ rid, i, ...s }));

  // Паспорт команды: итог без ответов, чтобы им делиться. ■ с первой попытки, ▲ со второй, □ не угадали.
  const MARK = { ok1: '■', ok2: '▲' };
  const passportText = () => `Дело №5 «${T.title}»\nВопросы: ${T.rounds.map((r, i) => MARK[S.res[i]] || '□').join(' ')}\nОчки команды: ${score()} из ${N * 2}`;
  const passportHtml = () => `<article class="paper paper--form passport" aria-label="Паспорт команды"><h2>Паспорт команды</h2><p class="passport__t">Дело №5 «${T.title}»</p>
    <ul class="passport__rows"><li><span class="passport__l">Вопросы</span> <span class="passport__sq" role="img" aria-label="с первой попытки: ${T.rounds.filter((r, i) => S.res[i] === 'ok1').length}, со второй: ${T.rounds.filter((r, i) => S.res[i] === 'ok2').length}, не угадали: ${T.rounds.filter((r, i) => !MARK[S.res[i]]).length}">${T.rounds.map((r, i) => `<i class="${S.res[i] === 'ok1' ? 'on' : S.res[i] === 'ok2' ? 'mid' : 'off'}"></i>`).join('')}</span></li>
    <li><span class="passport__l">Очки</span> <b>${score()} из ${N * 2}</b></li></ul>
    <p class="passport__key">Закрашено: с первой попытки. Половина: со второй. Пусто: не угадали.</p>
    <div class="fld__acts"><button class="btn" data-act="share">Поделиться</button><button class="btn btn--quiet" data-act="shareimg">Сохранить картинку</button></div></article>`;
  const passportImage = async () => {
    try { await document.fonts.load('700 56px "Anonymous Pro"'); } catch (e) { console.warn('font not ready:', e.message); }
    const W = 1080, H = 1350; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#16120e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ebe7da'; g.fillRect(70, 90, W - 140, 1070);
    g.fillStyle = '#7a1515'; g.font = '700 92px "Anonymous Pro", monospace'; g.fillText('ПАСПОРТ КОМАНДЫ', 110, 220);
    g.fillStyle = '#15120e'; g.font = '700 56px "Anonymous Pro", monospace'; g.fillText(`Дело №5 «${T.title}»`, 120, 310); g.fillRect(120, 345, W - 240, 6);
    g.font = '700 54px Arimo, Arial, sans-serif'; g.fillText('Вопросы', 120, 470);
    const sz = 100, gap = 18;
    T.rounds.forEach((r, i) => {
      const x = 120 + i * (sz + gap); const k = S.res[i];
      g.fillStyle = '#ebe7da'; g.fillRect(x, 500, sz, sz);
      if (k === 'ok1') { g.fillStyle = '#2f6b2f'; g.fillRect(x, 500, sz, sz); } else if (k === 'ok2') { g.fillStyle = '#b8862a'; g.fillRect(x, 550, sz, 50); }
      g.strokeStyle = '#15120e'; g.lineWidth = 7; g.strokeRect(x, 500, sz, sz);
    });
    g.fillStyle = '#15120e'; g.font = '700 54px Arimo, Arial, sans-serif'; g.fillText('Очки команды', 120, 780);
    g.font = '700 150px "Anonymous Pro", monospace'; g.fillText(`${score()} из ${N * 2}`, 120, 940);
    g.save(); g.translate(660, 1100); g.rotate(-0.12); g.strokeStyle = '#7a1515'; g.fillStyle = '#7a1515'; g.lineWidth = 8; g.font = '700 64px "Anonymous Pro", monospace';
    const tw = g.measureText('ПРОЙДЕНО').width; g.strokeRect(-20, -62, tw + 40, 90); g.fillText('ПРОЙДЕНО', 0, 0); g.restore();
    g.fillStyle = '#ebe7da'; g.font = '700 46px Arimo, Arial, sans-serif'; g.fillText('Командное дело для 3–5 человек', 70, H - 110);
    g.font = '400 42px Arimo, Arial, sans-serif'; g.fillText(location.host || 'detective', 70, H - 50);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  };

  const scene = (img, inner) => `<section class="scene" style="--bg:url(${img})">${inner}</section>`;

  const bar = () => `
    <header class="bar">
      <span class="bar__item"><b>${T.title}</b></span>
      <span class="bar__item"><b>Вопрос</b> <span class="num">${S.round + 1}</span> из ${N}</span>
      <span class="bar__item"><b>Роль</b> ${role(S.role).name}</span>
      ${isLead() ? `<span class="bar__item"><b>Очки</b> <span class="num">${score()}</span> из ${N * 2}</span>` : ''}
    </header>`;

  const codeLine = () => (S.round < N - 1 ? `<p class="code">Код для команды: <b class="num">${code(S.round)}</b>. Назовите его вслух: без него у остальных следующий вопрос не откроется.</p>` : '');
  const resultHtml = () => {
    const r = R(); const k = S.res[S.round]; const hist = S.hist[S.round] || []; const kind = kindOf(r);
    let bad = ''; let good = '';
    if (kind === 'pick') {
      // пояснения к неверным выбранным частям показываем, когда вопрос закрыт
      bad = [...new Set(hist.flatMap((h) => h.map((v, i) => (r.parts[i].options[v].ok ? '' : r.parts[i].options[v].fb))).filter(Boolean))].map((f) => `<p class="loss">${f}</p>`).join('');
      good = r.parts.map((p) => `${p.ask} ${p.options.find((o) => o.ok).t}.`).join(' ');
    } else if (kind === 'order') {
      good = `Верный порядок: ${[...r.events].sort((a, b) => a.at - b.at).map((e, i) => `${i + 1}. ${e.t}`).join(' ')}`;
    } else {
      good = r.parts.map((p, i) => `${i + 1}. ${p.who}.`).join(' ');
    }
    if (k === 'ok1' || k === 'ok2') return `${bad}<p class="mark"><span class="stamp">Верно</span></p><p>${r.why}</p>${codeLine()}`;
    if (k === 'shown') return `${bad}<p class="mark"><span class="stamp">Попытки кончились</span></p><p>Верный ответ. ${good}</p><p>${r.why}</p>${codeLine()}`;
    if (hist.length) {
      const last = hist[hist.length - 1];
      const n = kind === 'order' ? ` На своём месте: ${rightOrder(last)} из ${r.events.length}.` : kind === 'who' ? ` Верных имён: ${rightWho(last)} из ${r.parts.length}.` : '';
      return `<p class="loss">Не сходится.${n} Осталась одна попытка.</p>`;
    }
    return '';
  };

  // Лоток ответа: у ведущего кнопки, у остальных то же содержание без кнопок, чтобы подсказывать по своим листам.
  const roleTag = (r, cls = 'chip__s') => `<span class="${cls}">Лист: ${names(r)}</span>`;
  const trayHtml = (r, lead, done) => {
    const kind = kindOf(r);
    if (kind === 'order') {
      const n = r.events.length;
      return `<p class="tray__t">${lead ? `Нажимайте события в порядке времени. Выбрано ${S.pick.length} из ${n}.` : 'События без порядка. Ведущий расставляет их, вы подсказываете по своим листам.'}</p>
        <div class="tray__chips">${r.events.map((e, i) => { const k = S.pick.indexOf(i); return lead
          ? `<button class="chip" data-act="opick" data-i="${i}" aria-pressed="${k >= 0}" ${done ? 'disabled' : ''}><span class="chip__t">${k >= 0 ? `${k + 1}. ` : ''}${e.t}</span>${roleTag(e.role)}</button>`
          : `<div class="chip chip--flat"><span class="chip__t">${e.t}</span>${roleTag(e.role)}</div>`; }).join('')}</div>
        ${lead && S.pick.length && !done ? '<button class="btn btn--quiet" data-act="oclear">Сбросить порядок</button>' : ''}`;
    }
    if (kind === 'who') {
      return r.parts.map((p, k) => `<p class="tray__t">${k + 1}. ${p.ask} ${roleTag(p.role, 'ask__need')}</p>
        ${lead
          ? `<div class="tray__chips tray__chips--names">${r.names.map((nm, i) => `<button class="chip" data-act="pick" data-k="${k}" data-i="${i}" aria-pressed="${S.pick[k] === i}" ${done ? 'disabled' : ''}><span class="chip__t">${nm}</span></button>`).join('')}</div>`
          : (k === 0 ? `<p class="tray__p">Имена на выбор: ${r.names.join(', ')}. Выбирает ведущий.</p>` : '')}`).join('');
    }
    return lead
      ? r.parts.map((p, k) => `<p class="tray__t">${k + 1}. ${p.ask}</p>
         <div class="tray__chips">${p.options.map((o, i) => `<button class="chip" data-act="pick" data-k="${k}" data-i="${i}" aria-pressed="${S.pick[k] === i}" ${done ? 'disabled' : ''}><span class="chip__t">${o.t}</span></button>`).join('')}</div>`).join('')
      : `<p class="tray__t">Три части ответа. Выбирает ведущий. К следующему вопросу переходите по коду, который он назовёт.</p>
         ${r.parts.map((p, k) => `<p class="tray__p"><b>${k + 1}. ${p.ask}</b></p><ul>${p.options.map((o) => `<li>${o.t}</li>`).join('')}</ul>`).join('')}`;
  };
  const readyToAnswer = () => (kindOf(R()) === 'order' ? S.pick.length === R().events.length : !S.pick.some((v) => v === null));
  const pickedCount = () => (kindOf(R()) === 'order' ? `${S.pick.length} из ${R().events.length}` : `${S.pick.filter((v) => v !== null).length} из ${R().parts.length}`);

  // Папка: вкладки-бумаги, лист с канцелярской скрепкой, звёздочка и отправка в чат.
  const folder = (items, open, withRound = false) => {
    if (!items.length) return '<article class="paper paper--form fld__empty"><p>Здесь бумаг нет. Слушайте других и задавайте вопросы.</p></article>';
    const n = Math.min(open, items.length - 1);
    const cur = items[n];
    const fav = isFav(cur.rid, cur.i);
    return `<div class="fld">
      <div class="fld__tabs">${items.map((x, k) => `<button class="fld__tab" data-act="sheet" data-n="${k}" aria-pressed="${k === n}">${withRound ? `${x.rid + 1}. ` : ''}${x.title}</button>`).join('')}</div>
      <div class="fld__body">
        <article class="paper paper--typed fld__paper">${cur.html}</article>
        <div class="fld__acts">
          <button class="btn btn--quiet" data-act="fav" data-r="${cur.rid}" data-i="${cur.i}" aria-pressed="${fav}">${fav ? '★ В избранном' : '☆ В избранное'}</button>
          <button class="btn btn--quiet" data-act="send" data-r="${cur.rid}" data-i="${cur.i}">Отправить в чат</button>
        </div>
      </div>
    </div>`;
  };
  const note = () => (S.note ? `<p class="req__note" role="status">${S.note}</p>` : '');

  // «Попросить у других»: бумаги чужих ролей видны только названиями. Просьба уходит ссылкой, которая открывает телефон владельца на этой бумаге.
  const askBlock = () => {
    const others = T.roles.filter((x) => x.id !== S.role && sheetsOf(S.round, x.id).length);
    const need = R().needs;
    const sel = S.ask && sheetsOf(S.round, S.ask.role)[S.ask.i];
    return `<section class="ask" aria-label="Попросить бумагу у другого игрока">
      <h2 class="ask__h">Попросить бумагу у другого игрока</h2>
      ${others.map((x) => `<div class="ask__row">
          <p class="ask__who"><b>${x.name}</b>${need.includes(x.id) ? ' <span class="ask__need">нужны для вопроса</span>' : ''}</p>
          <div class="ask__tabs">${sheetsOf(S.round, x.id).map((s, i) => `<button class="ask__tab" data-act="ask" data-role="${x.id}" data-i="${i}" aria-pressed="${!!S.ask && S.ask.role === x.id && S.ask.i === i}">${s.title}</button>`).join('')}</div>
        </div>`).join('')}
      ${sel ? `<div class="req">
          <p><b>${role(S.ask.role).name}</b>, покажи «${sel.title}».</p>
          <p class="req__s">Отправьте просьбу в чат ссылкой: у владельца откроется эта бумага. Или просто скажите вслух.</p>
          <div class="fld__acts"><button class="btn" data-act="sendask">Отправить просьбу</button><button class="btn btn--quiet" data-act="askclose">Скажу вслух</button></div>
          ${note()}
        </div>` : ''}
    </section>`;
  };

  const incoming = () => {
    if (!S.in || S.in.rid !== S.round) return '';
    const s = sheetsOf(S.in.rid, S.role)[S.in.i];
    if (!s) return '';
    return `<div class="req req--in" role="status">
      <p><b>${role(S.in.from).name}</b> просит показать бумагу «${s.title}». Она открыта ниже.</p>
      <div class="fld__acts"><button class="btn" data-act="send" data-r="${S.in.rid}" data-i="${S.in.i}">Отправить в чат</button><button class="btn btn--quiet" data-act="inclose">Прочту вслух</button></div>
      ${note()}
    </div>`;
  };

  const views = {
    lobby: () => scene('img/case-desk.jpg', `
      <div class="stage stage--center">
        <article class="paper paper--typed paper--memo">${T.intro}</article>
        <article class="paper paper--form"><h2>Как играть</h2><ol>${T.how.map((h) => `<li>${h}</li>`).join('')}</ol></article>
        <div class="tray" style="width:min(100%, 640px)">
          <p class="tray__t">${S.role ? `Сейчас вы: ${role(S.role).name}. Выберите роль, чтобы продолжить.` : 'Выберите свою роль'}</p>
          <div class="tray__chips">${T.roles.map((x) => `<button class="chip" data-act="role" data-id="${x.id}" aria-pressed="${S.role === x.id}"><span class="chip__t">${x.name}</span><span class="chip__s">${x.short}</span></button>`).join('')}</div>
        </div>
        <a class="btn btn--quiet" href="./">Все дела</a>
      </div>`),

    round: () => {
      const r = R(); const lead = isLead();
      const done = !!S.res[S.round];
      return scene(bgOf(S.round), `
        ${bar()}
        <div class="room">
          ${S.note && !S.in && !S.ask ? `<p class="req__note" role="status">${S.note}</p>` : ''}
          <article class="paper paper--transcript" aria-label="Вопрос">
            <h2>${S.round + 1}. ${r.title}</h2>
            <p>${r.q}</p>
            <p><b>Нужны бумаги:</b> ${names(r.needs)}.</p>
            <div role="status" aria-live="polite">${lead ? resultHtml() : ''}</div>
          </article>
          <div class="tray">
            ${trayHtml(r, lead, done)}
          </div>
        </div>
        <div class="files">
          ${incoming()}
          <h2 class="files__h">Моя папка: ${r.title}</h2>
          ${folder(itemsOf(S.round), S.open)}
          ${askBlock()}
          <div class="files__nav">
            <button class="btn btn--quiet" data-act="cab">Картотека${S.fav.some((k) => k.startsWith(`${S.role}:`)) ? ' ★' : ''}</button>
            <button class="btn btn--quiet" data-act="lobby">Сменить роль</button>
          </div>
        </div>
        <footer class="dock">
          ${lead
            ? (done
              ? `<button class="btn" data-act="next">${S.round === N - 1 ? 'К итогу' : 'Следующий вопрос'}</button>`
              : `<button class="btn" data-act="answer" ${readyToAnswer() ? '' : 'disabled'}>Ответить${readyToAnswer() ? '' : `: выбрано ${pickedCount()}`}</button>`)
            : (S.round === N - 1
              ? '<button class="btn" data-act="next">К итогу</button>'
              : `<div class="unlock"><label class="unlock__l" for="unlock-code">Код от ведущего</label><input class="unlock__in" id="unlock-code" inputmode="numeric" autocomplete="off" maxlength="2" aria-describedby="unlock-help"><button class="btn" data-act="unlock">Следующий вопрос</button></div>
                 <p class="unlock__help" id="unlock-help" role="status">${S.ucode === 'bad' ? 'Код не подошёл. Спросите ведущего ещё раз.' : 'Код появляется у ведущего после ответа.'}</p>`)}
          ${S.round > 0 ? '<button class="btn btn--quiet" data-act="back">Назад</button>' : ''}
        </footer>`);
    },

    // Картотека: ящик на каждый вопрос и ящик «Избранное». Ящики будущих вопросов закрыты.
    cab: () => {
      const favList = favItems();
      const d = S.drawer;
      let inner;
      if (d === null) {
        inner = `<article class="paper paper--form"><h2>Картотека</h2><p>Ящик на каждый вопрос. В каждом ваша папка. Звёздочка на бумаге кладёт её в «Избранное».</p></article>
          <div class="cab">
            ${T.rounds.map((r, i) => {
              const locked = i > S.max; const n = sheetsOf(i, S.role).length;
              return `<button class="drawer" data-act="drawer" data-i="${i}" ${locked ? 'disabled' : ''}><span class="drawer__label"><span class="drawer__n">№${i + 1}</span><span class="drawer__t">${r.title}</span><span class="drawer__s">${locked ? 'ещё закрыт' : `бумаг: ${n}`}</span></span></button>`;
            }).join('')}
            <button class="drawer drawer--fav" data-act="drawer" data-i="fav"><span class="drawer__label"><span class="drawer__n">★</span><span class="drawer__t">Избранное</span><span class="drawer__s">бумаг: ${favList.length}</span></span></button>
          </div>`;
      } else if (d === 'fav') {
        inner = `<article class="paper paper--form"><h2>Избранное</h2><p>${favList.length ? 'Бумаги, которые вы отметили звёздочкой.' : 'Пока пусто. Откройте бумагу и нажмите «В избранное».'}</p></article>
          ${favList.length ? folder(favList, S.open, true) : ''}`;
      } else {
        inner = `<article class="paper paper--form"><h2>Ящик №${d + 1}. ${T.rounds[d].title}</h2><p>Ваша папка: ${role(S.role).name}.</p></article>${folder(itemsOf(d), S.open)}`;
      }
      return scene(bgOf(S.drawer === null || S.drawer === 'fav' ? S.round : S.drawer), `
        ${bar()}
        <div class="stage cab-stage">
          ${inner}
          ${note()}
          <div class="files__nav">
            ${d === null ? '' : '<button class="btn btn--quiet" data-act="cab">Назад в шкаф</button>'}
            <button class="btn" data-act="toround">К вопросу ${S.round + 1}</button>
          </div>
        </div>`);
    },

    end: () => {
      const lead = isLead(); const total = score();
      const v = T.verdict.find((x) => total >= x.min);
      return scene('img/vault-wall.jpg', `
        <div class="stage stage--center">
          <article class="paper paper--typed paper--memo">
            ${lead
              ? `<h1>ИТОГ</h1><p>Очки команды: ${total} из ${N * 2}.</p><p>${v.text}</p>
                 <ul>${T.rounds.map((r, i) => `<li>${i + 1}. ${r.title}: ${{ ok1: 'с первой попытки', ok2: 'со второй попытки', shown: 'не угадали' }[S.res[i]] || 'не отвечали'}</li>`).join('')}</ul>`
              : `<h1>ИТОГ</h1><p>Очки команды знает ведущий. Попросите его зачитать итог вслух.</p>`}
          </article>
          ${lead ? `${note()}${passportHtml()}` : ''}
          ${lead || S.spoil ? `<article class="paper paper--typed paper--memo">${T.solution}</article>` : `<article class="paper paper--form"><h2>Разбор дела</h2><p>Разбор и настоящие имена читает ведущий вслух, когда команда ответила на все вопросы.</p><button class="btn btn--quiet" data-act="spoil">Показать разбор на этом телефоне</button></article>`}
          <button class="btn btn--quiet" data-act="back">Назад к вопросам</button>
          <a class="btn btn--quiet" href="./">Все дела</a>
          <button class="btn btn--quiet" data-act="restart">Сыграть сначала</button>
        </div>`);
    },
  };

  let rendering = false;
  function render() {
    try { app.innerHTML = views[S.view](); }
    catch (e) {
      console.error('render failed:', e);
      if (rendering) throw e;
      rendering = true;
      const r = S.role; S = blank(); S.role = r; S.view = r ? 'round' : 'lobby'; S.note = 'Сохранение устарело после обновления дела. Игра начата заново.';
      app.innerHTML = views[S.view]();
      rendering = false;
    }
    save();
  }

  const reset = () => { S.pick = emptyPick(); S.open = 0; S.note = ''; S.ask = null; S.drawer = null; S.ucode = ''; };
  const go = (view) => { S.view = view; reset(); render(); window.scrollTo(0, 0); };

  // Отправка текста в чат: меню «Поделиться» телефона, а если его нет, копирование. Итог показываем игроку, ничего не глотаем.
  const share = async (text, url) => {
    try {
      if (navigator.share) { await navigator.share(url ? { text, url } : { text }); S.note = ''; return; }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('share failed:', e && e.message);
    }
    try { await navigator.clipboard.writeText(url ? `${text} ${url}` : text); S.note = 'Скопировано. Вставьте в чат.'; }
    catch (e) { console.warn('copy failed:', e && e.message); S.note = 'Не вышло отправить. Скажите вслух или перепишите.'; }
  };

  const acts = {
    role: (el) => { S.role = el.dataset.id; go('round'); },
    lobby: () => go('lobby'),
    sheet: (el) => { S.open = +el.dataset.n; render(); },
    fav: (el) => {
      const k = favKey(+el.dataset.r, +el.dataset.i);
      S.fav = S.fav.includes(k) ? S.fav.filter((x) => x !== k) : [...S.fav, k];
      if (S.view === 'cab' && S.drawer === 'fav') S.open = Math.max(0, Math.min(S.open, favItems().length - 1));
      render();
    },
    send: async (el) => {
      const rid = +el.dataset.r; const s = sheetsOf(rid, S.role)[+el.dataset.i];
      if (!s) return;
      await share(`${role(S.role).name}. Бумага «${s.title}». ${plain(s.html)}`);
      render();
    },
    ask: (el) => { S.ask = { role: el.dataset.role, i: +el.dataset.i }; S.note = ''; render(); },
    askclose: () => { S.ask = null; S.note = ''; render(); },
    sendask: async () => {
      if (!S.ask) return;
      const s = sheetsOf(S.round, S.ask.role)[S.ask.i];
      const url = `${pageUrl()}?role=${S.ask.role}&round=${S.round}&sheet=${S.ask.i}&from=${S.role}`;
      await share(`${role(S.role).name} просит: ${role(S.ask.role).name}, покажи бумагу «${s.title}». Откройте ссылку:`, url);
      render();
    },
    inclose: () => { S.in = null; S.note = ''; render(); },
    cab: () => { S.view = 'cab'; S.drawer = null; S.open = 0; S.note = ''; S.ask = null; render(); window.scrollTo(0, 0); },
    drawer: (el) => { S.drawer = el.dataset.i === 'fav' ? 'fav' : +el.dataset.i; S.open = 0; S.note = ''; render(); window.scrollTo(0, 0); },
    toround: () => { S.view = 'round'; S.open = 0; S.note = ''; S.drawer = null; render(); window.scrollTo(0, 0); },
    pick: (el) => { if (!S.res[S.round]) { S.pick[+el.dataset.k] = +el.dataset.i; render(); } },
    opick: (el) => { if (S.res[S.round]) return; const i = +el.dataset.i; S.pick = S.pick.includes(i) ? S.pick.filter((x) => x !== i) : [...S.pick, i]; render(); },
    oclear: () => { if (!S.res[S.round]) { S.pick = []; render(); } },
    unlock: () => {
      const inp = document.getElementById('unlock-code'); const v = ((inp && inp.value) || '').trim();
      if (v !== code(S.round)) { S.ucode = 'bad'; render(); const again = document.getElementById('unlock-code'); if (again) { again.value = v; again.focus(); } return; }
      S.ucode = ''; acts.next();
    },
    answer: () => {
      if (!readyToAnswer() || S.res[S.round]) return;
      const r = R(); const kind = kindOf(r);
      (S.hist[S.round] = S.hist[S.round] || []).push([...S.pick]);
      S.tries[S.round] = (S.tries[S.round] || 0) + 1;
      const ok = kind === 'order' ? rightOrder(S.pick) === r.events.length : kind === 'who' ? rightWho(S.pick) === r.parts.length : S.pick.every((v, i) => r.parts[i].options[v].ok);
      if (ok) S.res[S.round] = S.tries[S.round] === 1 ? 'ok1' : 'ok2';
      else if (S.tries[S.round] >= 2) S.res[S.round] = 'shown';
      S.pick = emptyPick();
      render();
    },
    next: () => {
      if (isLead() && !S.res[S.round]) return;
      if (S.round === N - 1) go('end');
      else { S.round += 1; S.max = Math.max(S.max, S.round); S.in = null; reset(); render(); window.scrollTo(0, 0); }
    },
    back: () => {
      if (S.view === 'end') { go('round'); return; }
      if (S.round > 0) { S.round -= 1; S.in = null; reset(); render(); window.scrollTo(0, 0); }
    },
    share: async () => {
      const url = pageUrl();
      await share(passportText(), url);
      if (!S.note) S.note = '';
      render();
    },
    shareimg: async () => {
      const blob = await passportImage();
      if (!blob) { S.note = 'Не вышло создать картинку. Сделайте скриншот паспорта.'; render(); return; }
      const file = new File([blob], 'passport.png', { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } }
      catch (e) { if (e && e.name === 'AbortError') return; console.warn('share image failed:', e && e.message); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'passport.png'; document.body.appendChild(a); a.click(); a.remove();
      S.note = 'Картинка сохранена на устройство.'; render();
    },
    spoil: () => { if (!confirm('В разборе настоящие имена и ответы на все вопросы. Показать на этом телефоне?')) return; S.spoil = true; render(); },
    restart: () => {
      if (!confirm('Начать игру сначала? Прогресс на этом телефоне будет стёрт, избранное тоже.')) return;
      const r = S.role; S = blank(); S.role = r; go('lobby');
    },
  };

  // Двойной щелчок по «Ответить» или «Следующий вопрос» не должен пропускать результат.
  const COMMIT = new Set(['answer', 'next', 'back', 'unlock']);
  let lastCommit = 0;
  app.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'unlock-code') { e.preventDefault(); const b = document.querySelector('[data-act="unlock"]'); if (b) b.click(); } });
  app.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (Date.now() - lastCommit < 350) return;
    const was = `${S.view}:${S.round}:${S.drawer}`;
    const res = acts[el.dataset.act](el);
    if (res && res.then) await res;
    if (COMMIT.has(el.dataset.act)) lastCommit = Date.now();
    if (was !== `${S.view}:${S.round}:${S.drawer}`) { const h = document.querySelector('h1, h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
    else {
      const d = el.dataset;
      const sel = `[data-act="${d.act}"]${d.k ? `[data-k="${d.k}"]` : ''}${d.i ? `[data-i="${d.i}"]` : ''}${d.n ? `[data-n="${d.n}"]` : ''}${d.id ? `[data-id="${d.id}"]` : ''}${d.role ? `[data-role="${d.role}"]` : ''}${d.r ? `[data-r="${d.r}"]` : ''}`;
      const same = document.querySelector(sel);
      if (same && !same.disabled) same.focus({ preventScroll: true });
    }
  });

  render();
})();
