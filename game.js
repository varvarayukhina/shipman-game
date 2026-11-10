/* Движок: главы идут цепочкой, каждая задаёт свои шаги (steps). Содержание дела лежит в chapter1.js ... chapter3.js. */
(() => {
  // Две игры (дела): ?game=2 открывает вторую. У каждой свой ключ сохранения.
  const GAMES = {
    1: [window.CH1, window.CH2, window.CH3, window.CH4],
    2: [window.V1, window.V2, window.V3, window.V4],
    3: [window.W1, window.W2, window.W3, window.W4].filter(Boolean),
    4: [window.Z1, window.Z2, window.Z3].filter(Boolean),
    5: [window.T1].filter(Boolean),
  };
  const app = document.getElementById('app');
  const ASKED = new URLSearchParams(location.search).get('game');
  const saveKey = (n) => (n === '1' ? 'shipman-proto-v1' : `shipman-proto-v1-g${n}`);

  // Каталог: главная страница без ?game. Прогресс читаем из localStorage каждой игры.
  function catalog() {
    const prog = (n) => { try { const raw = localStorage.getItem(saveKey(n)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
    const cards = Object.keys(GAMES).filter((n) => GAMES[n][0] && GAMES[n][0].meta).map((n, i) => {
      const m = GAMES[n][0].meta;
      const st = prog(n);
      const label = m.href ? 'Играть командой' : !st ? 'Начать' : st.step === 'solution' ? 'Пройдено. Сыграть снова' : `Продолжить: глава ${st.ch + 1}`;
      const chapters = GAMES[n].length;
      const facts = [m.time, m.href ? '' : `${chapters} ${chapters === 1 ? 'глава' : chapters < 5 ? 'главы' : 'глав'}`].filter(Boolean).join(' · ');
      return `
        <article class="case">
          <img src="${m.img}" width="1672" height="941" alt="${m.alt}" ${i ? 'loading="lazy"' : ''}>
          <div class="case__body">
            <p class="case__tag">${m.tag}</p>
            <h2>Дело №${n}. ${m.title}</h2>
            <p>${m.teaser}</p>
            ${facts ? `<p class="case__facts">${facts}</p>` : ''}
            <a class="btn" href="${m.href || `?game=${n}`}">${label}</a>
          </div>
        </article>`;
    }).join('');
    document.title = 'Дела. Игры-расследования';
    app.innerHTML = `
      <section class="scene" style="--bg:url(img/case-desk.jpg)">
        <div class="catalog">
          <header class="paper paper--typed paper--memo catalog__head">
            <h1>ДЕЛА</h1>
            <p>Детективные игры по настоящим делам. Имена изменены, какое это было дело, откроется в конце.</p>
            <ol class="catalog__how"><li><b>1</b>Читаете бумаги</li><li><b>2</b>Допрашиваете</li><li><b>3</b>Доказываете</li></ol>
            <p class="case__facts">${Object.keys(GAMES).length} дел · от 20 минут до часа · прогресс сохраняется на устройстве</p>
          </header>
          <div class="cases">${cards}</div>
        </div>
      </section>`;
  }
  if (ASKED && GAMES[ASKED] && GAMES[ASKED][0].team) { location.replace('team.html'); return; }
  if (!GAMES[ASKED]) { catalog(); return; }
  const GAME = ASKED;
  const CHS = GAMES[GAME];
  // «Ваша версия»: у глав с описанием guess этот шаг идёт перед поворотом
  CHS.forEach((c) => {
    if (!c.guess || c.steps.includes('guess')) return;
    const i = c.steps.indexOf('turn');
    if (i > -1) { c.steps.splice(i, 0, 'guess'); c.img = { ...c.img, guess: c.img.guess || c.img.interview || c.img.turn || c.img.desk }; }
  });
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
    placed: {}, ver: {}, tlFails: 0, guess: { pick: null, done: false }, inbox: { got: [], toast: null }, recap: false, seenAt: 0, dos: { on: false, tab: 'fav', doc: null }, fav: new Set(), room: null, drawer: null, tlMsg: '', say: '', flags: new Set(), auditDone: false, audit: { ok: 0, wrong: 0, total: 0 },
    opener: { pick: null, done: false, ok: false }, choice: { pick: null, done: false, ok: false }, cross: { asked: [] }, lab: { phase: 'tests', run: [], pick: [], done: false, ok: false }, misses: 0, partial: [], deadline: null, closed: false, notice: '', noticeNext: '',
  });
  // Прогресс лежит в localStorage этого браузера: у каждого игрока свой, между устройствами не переносится.
  const KEY = saveKey(GAME);
  const save = () => {
    S.seenAt = Date.now();
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
      if (T && Object.entries(o.placed || {}).some(([i, id]) => !T.slots[i] || T.slots[i].locked || !T.events.some((e) => e.id === id))) { o.placed = {}; o.ver = {}; o.tlMsg = ''; }
      // раньше в слот попадала только верная карточка: старая расстановка считается проверенной
      if (!o.ver) o.ver = Object.fromEntries(Object.keys(o.placed || {}).map((i) => [i, 1]));
      o.ver = Object.fromEntries(Object.keys(o.ver).filter((i) => (o.placed || {})[i]).map((i) => [i, 1]));
      o.dos = { on: false, tab: 'fav', doc: null };
      // вернулись после перерыва: покажем «Вы остановились здесь»
      o.recap = !!o.seenAt && Date.now() - o.seenAt > 30 * 60 * 1000 && !['cover', 'intro'].includes(o.step);
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
  const unitEnd = () => `${unit().replace(/\.$/, '')}.`; // единица в конце предложения: «2 дн.» а не «2 дн..»

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
  const fileTag = () => `<span class="file-tag">${C().name} · ${C().title}</span>`;
  const attach = (src, html) => (src && !/<(figure|img)\b/.test(html) ? `<figure class="photo photo--attach"><img src="${src}" width="1400" height="788" alt=""></figure>` : '');
  const scene = (step, inner) => `<section class="scene" style="--bg:url(${C().img[step] || C().img.desk})">${inner}</section>`;

  // Картотека: комнаты → ящики → папки (бумаги). Описание лежит в archive.js; без него все бумаги в одном ящике.
  const DRAWER_MARK = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
  const rooms = () => {
    const c = C();
    const all = Object.keys(c.documents);
    const base = c.archive ? c.archive.rooms : [{ id: 'main', name: 'Материалы дела', img: c.img.desk, drawers: [{ id: 'all', name: 'Материалы дела', docs: all }] }];
    const listed = new Set(base.flatMap((r) => r.drawers.flatMap((d) => d.docs)));
    const rest = all.filter((id) => !listed.has(id));
    return rest.length ? base.map((r, i) => (i ? r : { ...r, drawers: [...r.drawers, { id: 'rest', name: 'Прочее', docs: rest }] })) : base;
  };
  const curRoom = () => rooms().find((r) => r.id === S.room) || rooms()[0];
  const favIds = () => [...S.fav].filter((id) => C().documents[id]);
  // Бумага с иллюстрацией и звёздочкой: одинаково на столе и в досье
  const docHtml = (id) => {
    const d = C().documents[id];
    const fig = d.img ? `<figure class="photo fld__fig"><img src="${d.img.src}" width="1400" height="788" loading="lazy" alt="${d.img.alt}"><figcaption>${d.img.cap}</figcaption></figure>` : '';
    return `${fig}<article class="paper paper--${d.kind} fld__paper">${body(d)}</article>
      <div class="fld__acts"><button class="btn btn--quiet" data-act="fav" data-id="${id}" aria-pressed="${S.fav.has(id)}">${S.fav.has(id) ? '★ В избранном' : '☆ В избранное'}</button></div>`;
  };
  // Что игрок уже нашёл: для вкладки «Что известно» в досье
  const knownList = () => {
    const c = C(); const out = [];
    if (c.opener && S.opener.done && S.opener.ok) out.push({ h: c.opener.title, t: c.opener.hit });
    if (c.guess && S.guess.done) out.push({ h: 'Ваша версия', t: c.guess.options[S.guess.pick].title });
    (c.interview || []).forEach((q, i) => { if (!q.locked && S.found.has(i)) out.push({ h: `Допрос, вопрос ${i + 1}`, t: q.note || q.hit }); });
    if (c.lab && S.lab.done && S.lab.ok) out.push({ h: c.lab.title, t: c.lab.okText });
    if (c.choice && S.choice.done && S.choice.ok) out.push({ h: c.choice.title, t: c.choice.options[S.choice.pick].out });
    return out;
  };
  const dossierHtml = () => {
    if (!S.dos.on) return '';
    const c = C(); const favs = favIds();
    const canRead = (id) => !(c.timed && S.closed && !S.seen.has(id));
    const tab = S.dos.tab;
    const ids = tab === 'fav' ? favs : tab === 'all' ? Object.keys(c.documents).filter(canRead) : [];
    const open = ids.includes(S.dos.doc) ? S.dos.doc : (ids[0] || null);
    let inner;
    if (tab === 'inbox') {
      const inb = inboxList();
      const cur = inb.find((m) => m.id === S.dos.doc) || inb[inb.length - 1];
      inner = `<div class="fld"><div class="fld__tabs">${inb.map((m) => `<button class="fld__tab" data-act="dmsg" data-id="${m.id}" aria-pressed="${cur && cur.id === m.id}"><span class="fld__tt">${KIND[m.kind] || 'Сообщение'}</span><span class="fld__ts">${m.from}</span></button>`).join('')}</div><div class="fld__body">${cur ? msgHtml(cur) : ''}</div></div>`;
    } else if (tab === 'known') {
      const k = knownList();
      inner = k.length ? `<ol class="known">${k.map((x) => `<li><b>${x.h}.</b> ${x.t}</li>`).join('')}</ol>` : '<article class="paper paper--form"><p>Пока ничего не найдено. Противоречия появятся здесь, когда вы их зафиксируете.</p></article>';
    } else if (!ids.length) {
      inner = `<article class="paper paper--form"><p>${tab === 'fav' ? 'Избранного пока нет. Откройте бумагу во вкладке «Все бумаги» и нажмите «В избранное».' : 'Бумаг нет.'}</p></article>`;
    } else {
      inner = `<div class="fld">
          <div class="fld__tabs">${ids.map((id) => `<button class="fld__tab" data-act="dopen" data-id="${id}" aria-pressed="${open === id}"><span class="fld__tt">${S.seen.has(id) ? '✓ ' : ''}${c.documents[id].title}</span><span class="fld__ts">${c.documents[id].short}</span></button>`).join('')}</div>
          <div class="fld__body">${open ? docHtml(open) : '<article class="paper paper--form fld__empty"><p>Выбери папку.</p></article>'}</div>
        </div>`;
    }
    const inb = inboxList();
    const T = [['fav', `Избранное${favs.length ? ` (${favs.length})` : ''}`], ['all', 'Все бумаги'], ['known', 'Что известно'], ...(inb.length ? [['inbox', `Входящие (${inb.length})`]] : [])];
    return `<div class="dossier" role="dialog" aria-modal="true" aria-labelledby="dossier-h">
      <div class="dossier__sheet">
        <div class="dossier__head"><h2 id="dossier-h" tabindex="-1">Досье</h2><button class="btn btn--quiet" data-act="dclose">Закрыть</button></div>
        <nav class="rooms" aria-label="Разделы досье">${T.map(([id, name]) => `<button class="rooms__btn" data-act="dtab" data-id="${id}" aria-pressed="${tab === id}">${name}</button>`).join('')}</nav>
        ${inner}
      </div>
    </div>`;
  };

  // Входящие: SMS, звонки и кадры камер приходят уведомлением и лежат в досье
  const inboxList = () => (C().inbox || []).filter((m) => S.inbox.got.includes(m.id));
  const KIND = { sms: 'SMS', call: 'Звонок', cctv: 'Камера' };
  const msgHtml = (m) => {
    const head = `<p class="msg__meta"><b>${KIND[m.kind] || 'Сообщение'}</b> · ${m.from}${m.when ? ` · ${m.when}` : ''}</p>`;
    if (m.kind === 'cctv') {
      return `<article class="msg msg--cctv">${head}<figure class="cctv"><img src="${m.img}" width="1400" height="788" loading="lazy" alt="${m.alt || ''}"><span class="cctv__cam">${m.cam || 'КАМЕРА'}</span><span class="cctv__time"><i class="cctv__rec" aria-hidden="true"></i>${m.when || ''}</span></figure><p>${m.text}</p></article>`;
    }
    if (m.kind === 'call') {
      return `<article class="msg msg--call">${head}<p class="msg__text">${m.text}</p>${m.audio ? `<audio controls preload="none" src="${m.audio}"></audio>` : ''}</article>`;
    }
    return `<article class="msg msg--sms">${head}<p class="msg__bubble">${m.text}</p></article>`;
  };
  const fireInbox = (evt) => {
    S.inbox.toast = null;
    (C().inbox || []).forEach((m) => { if (m.on === evt && !S.inbox.got.includes(m.id)) { S.inbox.got.push(m.id); S.inbox.toast = m.id; } });
  };
  const toastHtml = () => {
    const m = S.inbox.toast && (C().inbox || []).find((x) => x.id === S.inbox.toast);
    if (!m || S.dos.on || S.recap) return '';
    return `<div class="toast" role="status"><button class="toast__main" data-act="toast" data-id="${m.id}"><b>Входящее: ${KIND[m.kind] || 'сообщение'}</b> ${m.from}</button><button class="toast__x" data-act="tclose" aria-label="Закрыть уведомление">×</button></div>`;
  };
  const STEP_NOW = { desk: 'читаете бумаги', timeline: 'собираете хронологию', audit: 'проверяете таблицу', interview: 'допрос', guess: 'записываете версию', lab: 'работа в лаборатории', choice: 'выбираете ход', cross: 'допрос свидетеля', opener: 'первый вопрос', turn: 'поворот главы', end: 'финал главы' };
  const recapHtml = () => {
    if (!S.recap) return '';
    const c = C(); const k = knownList();
    const q = S.step === 'interview' ? (c.interview || [])[S.round] : null;
    return `<div class="dossier" role="dialog" aria-modal="true" aria-labelledby="recap-h">
      <div class="dossier__sheet">
        <div class="dossier__head"><h2 id="recap-h" tabindex="-1">Вы остановились здесь</h2></div>
        <article class="paper paper--form"><p><b>${c.name}, «${c.title}».</b> Сейчас: ${STEP_NOW[S.step] || 'дело'}${q && !q.locked ? `, вопрос ${S.round + 1} из ${c.interview.length}` : ''}.</p>${q && !q.locked ? `<p>Он сказал: «${q.say}»</p>` : ''}</article>
        <h3 class="dossier__sub">Ранее в деле</h3>
        ${k.length ? `<ol class="known">${k.map((x) => `<li><b>${x.h}.</b> ${x.t}</li>`).join('')}</ol>` : '<article class="paper paper--form"><p>Пока ничего не зафиксировано. Бумаги ждут вас в картотеке.</p></article>'}
        <div class="fld__acts"><button class="btn" data-act="rclose">Продолжить</button>${S.step === 'desk' ? '' : '<button class="btn btn--quiet" data-act="rdossier">Открыть досье</button>'}</div>
      </div>
    </div>`;
  };

  // Паспорт прохождения: короткий итог без спойлеров, чтобы им делиться
  const passportRows = () => {
    const c = C(); const rows = [];
    const qs = (c.interview || []).map((q, i) => ({ q, i })).filter((x) => !x.q.locked);
    if (qs.length) rows.push({ label: 'Допрос', cells: qs.map((x) => (S.found.has(x.i) ? 1 : 0)) });
    if (c.audit) rows.push({ label: 'Таблица', text: `${S.audit.ok} из ${S.audit.total}` });
    if (c.timeline) rows.push({ label: 'Хронология', text: S.tlFails ? `проверок с ошибкой: ${S.tlFails}` : 'с первой проверки' });
    if (c.guess && S.guess.done) { const o = c.guess.options[S.guess.pick]; rows.push({ label: 'Версия', text: o.skip ? 'без версии' : o.ok ? 'подтвердилась' : 'не подтвердилась' }); }
    rows.push({ label: c.clock.label, text: `${S.hours} ${unit()}` });
    return rows;
  };
  const passportTitle = () => { const m = (GAMES[GAME][0] || {}).meta; return `Дело №${GAME}${m && m.title ? ` «${m.title}»` : ''}, ${C().name.toLowerCase()}`; };
  const passportText = () => `${passportTitle()}\n${passportRows().map((r) => `${r.label}: ${r.cells ? r.cells.map((x) => (x ? '■' : '□')).join(' ') : r.text}`).join('\n')}`;
  const passportHtml = () => `<article class="paper paper--form passport" aria-label="Паспорт прохождения"><h2>Паспорт прохождения</h2><p class="passport__t">${passportTitle()}</p>
    <ul class="passport__rows">${passportRows().map((r) => `<li><span class="passport__l">${r.label}</span> ${r.cells ? `<span class="passport__sq" role="img" aria-label="${r.cells.filter(Boolean).length} из ${r.cells.length}">${r.cells.map((x) => `<i class="${x ? 'on' : 'off'}"></i>`).join('')}</span>` : `<b>${r.text}</b>`}</li>`).join('')}</ul>
    <div class="fld__acts"><button class="btn" data-act="share">Поделиться</button><button class="btn btn--quiet" data-act="shareimg">Сохранить картинку</button></div></article>`;
  const passportImage = async () => {
    try { await document.fonts.load('700 56px "Anonymous Pro"'); } catch (e) { console.warn('font not ready:', e.message); }
    const W = 1080, H = 1350; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#16120e'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ebe7da'; g.fillRect(70, 90, W - 140, 1070);
    g.fillStyle = '#7a1515'; g.font = '700 92px "Anonymous Pro", monospace'; g.fillText('ПАСПОРТ ДЕЛА', 120, 220);
    g.fillStyle = '#15120e'; g.font = '700 52px "Anonymous Pro", monospace';
    const t = passportTitle(); g.fillText(t.length > 30 ? `${t.slice(0, 29)}…` : t, 120, 305);
    g.fillRect(120, 340, W - 240, 6);
    const rows = passportRows(); const top = 400; const step = Math.min(220, (1100 - top) / rows.length);
    rows.forEach((r, k) => {
      const y = top + k * step + 64;
      g.fillStyle = '#15120e'; g.font = '700 54px Arimo, Arial, sans-serif'; g.fillText(r.label, 120, y);
      if (r.cells) {
        const sz = Math.min(96, (W - 240 - 60) / r.cells.length - 14);
        r.cells.forEach((x, i) => { g.fillStyle = x ? '#2f6b2f' : '#ebe7da'; g.fillRect(120 + i * (sz + 14), y + 24, sz, sz); g.strokeStyle = '#15120e'; g.lineWidth = 6; g.strokeRect(120 + i * (sz + 14), y + 24, sz, sz); });
      } else { g.font = '400 56px Arimo, Arial, sans-serif'; g.fillStyle = '#15120e'; g.fillText(r.text, 120, y + 76); }
    });
    g.save(); g.translate(680, 1100); g.rotate(-0.12); g.strokeStyle = '#7a1515'; g.fillStyle = '#7a1515'; g.lineWidth = 8;
    g.font = '700 64px "Anonymous Pro", monospace'; const st = 'ПРОЙДЕНО'; const tw = g.measureText(st).width;
    g.strokeRect(-20, -62, tw + 40, 90); g.fillText(st, 0, 0); g.restore();
    g.fillStyle = '#ebe7da'; g.font = '700 46px Arimo, Arial, sans-serif'; g.fillText('Детективные игры по реальным делам', 70, H - 110);
    g.font = '400 42px Arimo, Arial, sans-serif'; g.fillText(location.host || 'detective', 70, H - 50);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  };

  // Разбор главы: что игрок понял верно, что пропустил и где это лежало
  const debriefHtml = () => {
    const c = C(); const it = [];
    const add = (ok, head, text) => it.push(`<li class="debrief__item"><span class="debrief__mark debrief__mark--${ok ? 'ok' : 'miss'}">${ok ? 'Верно' : 'Пропущено'}</span> <b>${head}.</b> ${text}</li>`);
    if (c.opener) add(S.opener.ok, c.opener.title, S.opener.ok ? c.opener.hit : c.opener.miss);
    if (c.guess && S.guess.done) {
      const o = c.guess.options[S.guess.pick];
      it.push(`<li class="debrief__item"><span class="debrief__mark debrief__mark--${o.skip ? 'skip' : o.ok ? 'ok' : 'miss'}">${o.skip ? 'Без версии' : o.ok ? 'Подтвердилась' : 'Не подтвердилась'}</span> <b>Ваша версия: «${o.title}».</b> ${o.skip ? c.guess.skip : o.ok ? c.guess.hit : c.guess.miss}</li>`);
    }
    if (c.timeline) add(true, c.timeline.title, S.tlFails ? `Порядок собран, проверок с ошибкой: ${S.tlFails}.` : 'Порядок собран с первой проверки.');
    if (c.audit) {
      const rows = c.audit.rows;
      const missed = rows.filter((r, i) => r.hit && !S.flags.has(i)).map((r) => r.cells.join(', '));
      const extra = rows.filter((r, i) => !r.hit && S.flags.has(i)).length;
      add(!missed.length && !extra, c.audit.title, `Найдено ${S.audit.ok} из ${S.audit.total}${extra ? `, лишних отметок: ${extra}` : ''}.${missed.length ? ` Пропущено: ${missed.join('; ')}.` : ''}`);
    }
    (c.interview || []).forEach((q, i) => {
      if (q.locked) return;
      const found = S.found.has(i);
      const docs = q.needs.map((id) => `«${c.documents[id].title}»`).join(', ');
      add(found, `Допрос, вопрос ${i + 1}`, found ? (q.note || q.hit) : `Он сказал: «${q.say}» Опровергала это бумага ${docs}.`);
    });
    if (c.choice && S.choice.done) { const o = c.choice.options[S.choice.pick]; add(!!o.ok, c.choice.title, o.out); }
    if (c.lab && S.lab.done) add(S.lab.ok, c.lab.title, S.lab.ok ? c.lab.okText : c.lab.badText);
    if (c.cross) {
      const asked = c.cross.questions.filter((q) => S.cross.asked.includes(q.id));
      add(asked.filter((q) => q.d >= 0).length >= asked.filter((q) => q.d < 0).length, c.cross.title, `Вопросов задано ${asked.length}: в вашу пользу ${asked.filter((q) => q.d >= 0).length}, против ${asked.filter((q) => q.d < 0).length}.`);
    }
    if (!it.length) return '';
    return `<article class="paper paper--form debrief"><h2>Разбор главы</h2><ul class="debrief__list">${it.join('')}</ul>
      <p class="debrief__total">${c.clock.label}: ${S.hours} ${unitEnd()} Промахов на допросе: ${S.misses}.</p></article>`;
  };

  const bar = () => {
    const c = C();
    return `
    <header class="bar">
      <span class="bar__item"><b>${c.name}</b><span class="bar__t">${c.title}</span></span>
      <span class="bar__item"><b>${c.clock.label}</b> <span class="num">${S.hours}</span> ${unit()}</span>
      ${timerOn() && S.deadline ? `<span class="bar__item"><b>${c.timedLabel}</b> <span class="num" id="countdown" role="timer">${fmt(left())}</span></span>` : ''}
      ${c.interview || c.opener || c.choice || c.lab ? `<span class="bar__item"><b>${c.scoreLabel || 'Противоречий'}</b> <span class="num">${S.found.size}</span> из ${total(c)}</span>` : ''}
      ${S.step === 'desk' || S.step === 'opener' ? '' : `<button class="bar__btn" data-act="dossier">Досье${favIds().length ? ` ★${favIds().length}` : ''}</button>`}
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
              : `<p class="tray__t">Пробы. Осталось ${S.hours} ${unitEnd()}</p>
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
        <article class="paper paper--typed paper--memo">${fileTag()}${attach(C().img.intro, C().intro.html)}${C().intro.html}</article>
        <button class="btn" data-act="forward">${C().intro.button}</button>
      </div>`),

    desk: () => {
      const c = C();
      const R = rooms();
      const room = curRoom();
      const favs = favIds();
      const dr = S.drawer === 'fav' ? { id: 'fav', name: 'Избранное', docs: favs } : room.drawers.find((d) => d.id === S.drawer);
      const mark = (d) => (d.id === 'fav' ? '★' : DRAWER_MARK[room.drawers.indexOf(d)] || '·');
      const ready = S.seen.size >= c.minRead;
      let inner;
      if (!dr) {
        inner = `<div class="cab" aria-label="Картотека: ${room.name}">
            ${room.drawers.map((d) => `<button class="drawer" data-act="drawer" data-id="${d.id}"><span class="drawer__label"><span class="drawer__n">Ящик ${mark(d)}</span><span class="drawer__t">${d.name}</span><span class="drawer__s">прочитано ${d.docs.filter((id) => S.seen.has(id)).length}/${d.docs.length}</span></span></button>`).join('')}
            ${favs.length ? `<button class="drawer drawer--fav" data-act="drawer" data-id="fav"><span class="drawer__label"><span class="drawer__n">★</span><span class="drawer__t">Избранное</span><span class="drawer__s">бумаг: ${favs.length}</span></span></button>` : ''}
          </div>
          <article class="paper paper--typed"><p>${c.deskHint}</p></article>`;
      } else {
        const open = dr.docs.includes(S.open) ? S.open : null;
        const d = open && c.documents[open];
        inner = `<div class="fld">
            <div class="fld__tabs">${dr.docs.map((id) => `<button class="fld__tab" data-act="open" data-id="${id}" aria-pressed="${open === id}"><span class="fld__tt">${S.seen.has(id) ? '✓ ' : ''}${c.documents[id].title}</span><span class="fld__ts">${c.documents[id].short}</span></button>`).join('')}</div>
            <div class="fld__body">
              ${d ? docHtml(open)
                : `<article class="paper paper--form fld__empty"><h2>Ящик ${mark(dr)}. ${dr.name}</h2><p>${dr.docs.length ? 'Выбери папку.' : 'Здесь пока пусто. Открой бумагу и нажми «В избранное».'}</p></article>`}
            </div>
          </div>
          <div class="files__nav"><button class="btn btn--quiet" data-act="cab">Назад в шкаф</button></div>`;
      }
      return `<section class="scene" style="--bg:url(${room.img || c.img.desk})">
        ${bar()}
        <div class="archive">
          ${R.length > 1 ? `<nav class="rooms" aria-label="Комнаты">${R.map((r) => `<button class="rooms__btn" data-act="room" data-id="${r.id}" aria-pressed="${r.id === room.id}">${r.id === room.id ? '' : '→ '}${r.name}</button>`).join('')}</nav>` : ''}
          ${inner}
        </div>
        <footer class="dock">
          <button class="btn" data-act="forward" ${ready ? '' : 'disabled'}>${c.deskNext}${ready ? '' : `: прочитано ${S.seen.size} из ${c.minRead}`}</button>
          ${timerOn() ? '<button class="btn btn--quiet" data-act="notimer">Без таймера</button>' : ''}
        </footer>
      </section>`;
    },

    timeline: () => {
      const T = C().timeline;
      const placed = new Set(Object.values(S.placed));
      const free = T.events.filter((e) => !placed.has(e.id));
      const toPlace = T.slots.filter((s, i) => !s.locked && !S.placed[i]).length;
      const allFilled = toPlace === 0;
      const allVer = T.slots.every((s, i) => s.locked || S.ver[i]);
      const nVer = T.slots.filter((s, i) => !s.locked && S.ver[i]).length;
      const nAll = T.slots.filter((s) => !s.locked).length;
      return scene('timeline', `
        ${bar()}
        ${notice()}
        <div class="tl">
          <article class="paper paper--form" aria-label="${T.title}">
            <h2>${T.title}</h2>
            <p>${T.hint}</p>
            <p>Когда все слоты заполнены, нажми «Проверить порядок»: верные карточки закрепятся, неверные вернутся в лоток. Первая проверка с ошибкой бесплатная, дальше каждая стоит ${T.missCost}&nbsp;${unitEnd()}</p>
            <p class="tl__msg" role="status">${S.tlMsg || `Закреплено ${nVer} из ${nAll}.`}</p>
            ${S.picks[0] ? `<p class="tl__pick" role="status">Выбрано: <b>${T.events.find((e) => e.id === S.picks[0]).text}</b>${S.tlFails ? ` Время ищи в: ${T.events.find((e) => e.id === S.picks[0]).src}.` : ''}</p>` : ''}
            <ol class="slots">
              ${T.slots.map((s, i) => {
                const ev = S.placed[i] && T.events.find((e) => e.id === S.placed[i]);
                const ok = !!S.ver[i];
                const inner = s.locked
                  ? `<span class="slot__body">${s.locked}</span>`
                  : ev
                    ? `<span class="slot__body"><b>${ev.text}</b>${ok ? `<span class="slot__src">Верно. Источник: ${ev.src}</span>` : `<button class="slot__btn slot__btn--undo" data-act="unplace" data-i="${i}">Убрать карточку</button>`}</span>`
                    : `<button class="slot__btn" data-act="slot" data-i="${i}" ${S.picks[0] ? '' : 'disabled'}>${S.picks[0] ? 'Поставить сюда' : 'Выбери событие'}</button>`;
                return `<li class="slot${ev ? ' slot--set' : ''}${ok ? ' slot--ok' : ''}${s.locked ? ' slot--gap' : ''}"><span class="slot__t">${s.t}</span>${inner}</li>`;
              }).join('')}
            </ol>
          </article>
          ${free.length ? `<div class="tray">
            <p class="tray__t">События: осталось ${free.length}</p>
            <div class="tray__chips">
              ${free.map((e) => `<button class="chip" data-act="card" data-id="${e.id}" aria-pressed="${S.picks[0] === e.id}"><span class="chip__t">${e.text}</span></button>`).join('')}
            </div>
          </div>` : ''}
        </div>
        <footer class="dock">
          ${allVer
            ? '<button class="btn" data-act="forward">Дальше</button>'
            : `<button class="btn" data-act="check" ${allFilled ? '' : 'disabled'}>Проверить порядок${allFilled ? '' : `: осталось поставить ${toPlace}`}</button>`}
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

    guess: () => {
      const G = C().guess;
      const st = S.guess;
      const o = st.pick === null ? null : G.options[st.pick];
      return scene('guess', `
        ${bar()}
        ${notice()}
        <div class="room">
          <article class="paper paper--transcript" aria-label="${G.title || 'Ваша версия'}">
            <h2>${G.title || 'Ваша версия'}</h2>
            <p class="sr-only" role="status">${S.say || ''}</p>
            <p>${G.prompt}</p>
            ${st.done ? `<p class="mark"><span class="stamp">Записано</span></p><p>${G.saved || 'Версия записана в блокнот. Посмотрим, подтвердится ли она.'}</p>` : ''}
          </article>
          <div class="tray">
            <p class="tray__t">${st.done ? 'Ваша версия' : 'Выбери версию. Это не стоит часов.'}</p>
            <div class="tray__chips">
              ${G.options.map((x, i) => `<button class="chip" data-act="gpick" data-i="${i}" aria-pressed="${st.pick === i}" ${st.done ? 'disabled' : ''}><span class="chip__t">${x.title}</span>${x.text ? `<span class="chip__s">${x.text}</span>` : ''}</button>`).join('')}
            </div>
          </div>
        </div>
        <footer class="dock">
          ${st.done
            ? '<button class="btn" data-act="forward">Дальше</button>'
            : `<button class="btn" data-act="ganswer" ${st.pick === null ? 'disabled' : ''}>Записать версию${o ? `: ${o.title}` : ''}</button>`}
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
          <article class="paper paper--typed paper--memo">${fileTag()}${c.end.html(S.found.size, total(c), S.hours, S)}${c.end.real ? `<p class="real"><span class="stamp">Это было на самом деле</span> ${c.end.real}</p>` : ''}</article>
          ${notice()}
          ${passportHtml()}
          ${debriefHtml()}
          ${next && gated() ? `<article class="paper paper--form paywall"><h2>${c.gate.title}</h2>${c.gate.html}</article>` : ''}
          ${next && !gated() ? `<button class="btn" data-act="nextch">Дальше: ${next.name}, «${next.title}»</button>` : ''}
          ${!next && c.solution ? `<button class="btn" data-act="forward">${c.endNext}</button>` : ''}
          <a class="btn btn--quiet" href="./">Сохранить и выйти</a>
          <p class="stage__note">Прогресс сохраняется на этом устройстве сам.</p>
          <button class="btn btn--quiet" data-act="restart">Сыграть сначала</button>
        </div>`);
    },
  };

  const go = (step) => { S.step = step; S.picks = []; S.notice = S.noticeNext || ''; S.noticeNext = ''; fireInbox(`step:${step}`); render(); window.scrollTo(0, 0); };
  const forward = () => { const st = C().steps; go(st[st.indexOf(S.step) + 1]); };

  function render() {
    if (timerOn() && !S.deadline) S.deadline = Date.now() + C().timed * 1000;
    app.innerHTML = named(views[S.step]() + dossierHtml() + recapHtml() + toastHtml());
    document.body.classList.toggle('has-dossier', S.dos.on || S.recap);
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
      if (matchMedia('(max-width: 899px)').matches) document.querySelector('.fld__body')?.scrollIntoView({ block: 'start' });
    },
    dossier: () => { S.dos = { on: true, tab: favIds().length ? 'fav' : 'all', doc: null }; render(); document.getElementById('dossier-h')?.focus(); },
    toast: (el) => { S.inbox.toast = null; S.dos = { on: true, tab: 'inbox', doc: el.dataset.id }; render(); document.getElementById('dossier-h')?.focus(); },
    tclose: () => { S.inbox.toast = null; render(); },
    dmsg: (el) => { S.dos.doc = el.dataset.id; render(); },
    rclose: () => { S.recap = false; render(); },
    rdossier: () => { S.recap = false; S.dos = { on: true, tab: favIds().length ? 'fav' : 'all', doc: null }; render(); document.getElementById('dossier-h')?.focus(); },
    share: async () => {
      const text = passportText(); const url = location.href.split(/[?#]/)[0];
      try { if (navigator.share) { await navigator.share({ text, url }); return; } }
      catch (e) { if (e && e.name === 'AbortError') return; console.warn('share failed:', e && e.message); }
      try { await navigator.clipboard.writeText(`${text}\n${url}`); S.notice = 'Паспорт скопирован. Вставьте его в чат.'; }
      catch (e) { console.warn('copy failed:', e && e.message); S.notice = 'Не вышло скопировать. Сделайте скриншот паспорта.'; }
      render();
    },
    shareimg: async () => {
      const blob = await passportImage();
      if (!blob) { S.notice = 'Не вышло создать картинку. Сделайте скриншот паспорта.'; render(); return; }
      const file = new File([blob], 'passport.png', { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } }
      catch (e) { if (e && e.name === 'AbortError') return; console.warn('share image failed:', e && e.message); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'passport.png'; document.body.appendChild(a); a.click(); a.remove();
      S.notice = 'Картинка сохранена на устройство.'; render();
    },
    dclose: () => { S.dos.on = false; render(); document.querySelector('[data-act="dossier"]')?.focus(); },
    dtab: (el) => { S.dos.tab = el.dataset.id; S.dos.doc = null; render(); },
    dopen: (el) => { const id = el.dataset.id; S.dos.doc = id; if (!(C().timed && S.closed)) S.seen.add(id); render(); },
    room: (el) => { S.room = el.dataset.id; S.drawer = null; S.open = null; render(); window.scrollTo(0, 0); },
    drawer: (el) => { S.drawer = el.dataset.id; S.open = null; render(); window.scrollTo(0, 0); },
    cab: () => { S.drawer = null; S.open = null; render(); window.scrollTo(0, 0); },
    fav: (el) => {
      const id = el.dataset.id;
      if (S.fav.has(id)) S.fav.delete(id); else S.fav.add(id);
      if (S.drawer === 'fav' && !favIds().length) { S.drawer = null; S.open = null; }
      render();
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
      S.say = `Проба проведена, потрачено ${t.cost} ${unitEnd()}`;
      render();
    },
    labbasis: () => { S.lab.phase = 'basis'; S.lab.pick = []; render(); },
    gpick: (el) => { if (!S.guess.done) { S.guess.pick = +el.dataset.i; render(); } },
    ganswer: () => { if (S.guess.pick === null || S.guess.done) return; S.guess.done = true; S.say = 'Версия записана.'; render(); },
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
      if (!ev || T.slots[i].locked || S.placed[i]) return;
      S.placed[i] = ev.id; S.tlMsg = ''; S.picks = [];
      render();
      toView('.tray');
    },
    unplace: (el) => { const i = +el.dataset.i; if (S.ver[i]) return; delete S.placed[i]; S.tlMsg = ''; render(); },
    // Проверка всей расстановки сразу: считаем верные, закрепляем их, неверные возвращаем в лоток. Ошибка в проверке стоит часов.
    check: () => {
      const T = C().timeline;
      let wrong = 0;
      T.slots.forEach((sl, i) => {
        if (sl.locked || S.ver[i] || !S.placed[i]) return;
        const ev = T.events.find((e) => e.id === S.placed[i]);
        if (ev && ev.slot === i) S.ver[i] = 1; else { delete S.placed[i]; wrong += 1; }
      });
      const nAll = T.slots.filter((sl) => !sl.locked).length;
      const nVer = T.slots.filter((sl, i) => !sl.locked && S.ver[i]).length;
      const free = wrong > 0 && !S.tlFails;
      if (wrong) { if (!free) S.hours = Math.max(0, S.hours - T.missCost); S.tlFails += 1; }
      S.tlMsg = wrong ? `Верно ${nVer} из ${nAll}. Неверных: ${wrong}, они вернулись в лоток. ${free ? 'Первая проверка бесплатная.' : `Проверка стоила ${T.missCost} ${unitEnd()}`}` : T.done;
      S.picks = [];
      render();
      toView('.tl__msg');
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
        reply('', trap ? `Бумага сработала против вас. Потеряно ${cost} ${unitEnd()}` : `Мимо. Потеряно ${cost} ${unitEnd()}`, 'loss');
        S.say = `${trap ? 'Бумага сработала против вас.' : 'Мимо.'} Потеряно ${cost} ${unitEnd()}`;
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
  const COMMIT = new Set(['ganswer', 'check', 'forward', 'nextch', 'oanswer', 'ckanswer', 'labsubmit', 'submit', 'present', 'skip', 'accept', 'qask']);
  let lastCommit = 0;
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (Date.now() - lastCommit < 350) return;
    const sel = `[data-act="${el.dataset.act}"]${el.dataset.id ? `[data-id="${el.dataset.id}"]` : ''}${el.dataset.i ? `[data-i="${el.dataset.i}"]` : ''}`;
    const was = `${S.ch}:${S.step}`;
    acts[el.dataset.act](el);
    if (COMMIT.has(el.dataset.act)) lastCommit = Date.now();
    if (['dossier', 'dclose', 'toast', 'rdossier'].includes(el.dataset.act)) return; // фокус уже поставлен в самом действии
    // render() пересобирает страницу целиком: возвращаем фокус, иначе клавиатура и скринридер теряют место
    const same = document.querySelector(sel);
    if (was === `${S.ch}:${S.step}` && same && !same.disabled) same.focus({ preventScroll: true });
    else { const h = document.querySelector('h1, h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.dos.on) acts.dclose(); else if (e.key === 'Escape' && S.recap) acts.rclose(); });
  app.addEventListener('click', (e) => { if (e.target.classList && e.target.classList.contains('dossier')) acts.dclose(); });
  render();
})();
