/* Navigation, the route catalogue and reading view. Classic scripts also work from a local file. */
(() => {
  'use strict';

  const routes = window.EXCURSION_ROUTES;
  const maps = window.GuideMaps;
  const quiz = window.GuideQuiz;
  const images = window.GuideImages;
  const byId = id => document.getElementById(id);
  const byRoute = new Map(routes.map(route => [route.id, route]));
  const homeTitle = document.title;
  const plural = new Intl.PluralRules('ru');
  const progress = quiz.loadProgress();
  const catalog = { filter: 'all', search: '', view: 'grid' };
  const cardSizes = 'auto, (max-width: 760px) calc(100vw - 36px), (max-width: 1248px) calc((100vw - 96px) / 2), 576px';
  const photoSizes = 'auto, (max-width: 760px) calc(100vw - 36px), (max-width: 1060px) calc(100vw - 64px), 760px';
  const previewSizes = 'auto, 340px';
  const homeSections = ['home', 'routes', 'intro', 'map', 'quizzes', 'about'];
  let currentRoute = null;
  let gallery = [];
  let photoIndex = 0;
  let photoTrigger = null;
  let dialogBackground = [];
  let scrollFrame = 0;
  let catalogVisible = false;
  const coverObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (catalogVisible && entry.isIntersecting && entry.target.isConnected) loadCover(entry.target);
    }
  }, {rootMargin: '220px 0px'}) : null;

  function escapeText(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  function countText(n, one, few, many) {
    const forms = { one, few, many };
    return `${n} ${forms[plural.select(n)] || many}`;
  }

  const routeCount = n => countText(n, 'маршрут', 'маршрута', 'маршрутов');
  const stopCount = n => countText(n, 'остановка', 'остановки', 'остановок');
  const hasDuration = route => Number.isInteger(route.durationMinutes) && route.durationMinutes > 0;
  const isShortWalk = route => hasDuration(route) && route.durationMinutes <= 45;
  const number = route => `№ ${route.id}`;
  const routeHash = route => `#route-${route.id}`;
  const stopHash = (route, stop) => `${routeHash(route)}/stop/${encodeURIComponent(stop.id)}`;
  const formatSearch = value => String(value || '').toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
  const searchIndex = new Map(routes.map(route => {
    const text = [route.title, route.shortTitle, route.summary, route.area, route.mode, route.categoryLabel,
      route.authors, route.startPoint.name, route.startPoint.address, route.duration, route.distance];
    const stops = route.stops.map(stop => ({
      stop,
      title: formatSearch(stop.title),
      address: formatSearch(stop.address),
      story: formatSearch(stop.paragraphs.join(' '))
    }));
    return [route.id, { text: formatSearch(text.join(' ')), stops }];
  }));

  function searchRoutes() {
    const query = formatSearch(catalog.search);
    const exactNumber = query.match(/^(?:маршрут\s*)?(?:№\s*)?(\d+)$/u);
    const matches = [];
    for (const route of routes) {
      const short = catalog.filter === 'short';
      if (short && !isShortWalk(route)) continue;
      if (!short && catalog.filter !== 'all' && !route.categories.includes(catalog.filter)) continue;
      if (exactNumber) {
        if (route.id === Number(exactNumber[1])) matches.push({ route });
        continue;
      }
      const index = searchIndex.get(route.id);
      const matched = query && (
        index.stops.find(entry => entry.title === query || entry.address === query) ||
        index.stops.find(entry => entry.title.includes(query) || entry.address.includes(query)) ||
        index.stops.find(entry => entry.story.includes(query))
      );
      if (!query || matched || index.text.includes(query)) matches.push({ route, stop: matched?.stop });
    }
    return matches;
  }

  function facts(route) {
    return `${route.duration} · ${route.distance} · ${stopCount(route.stops.length)}`;
  }

  function quizStatus(route) {
    const result = progress[route.id];
    return result?.passed ? `<span class="route-card-status">Викторина ${result.score}/${result.total}</span>` : '';
  }

  function matchedStopLink(route, stop) {
    return `<a class="route-search-stop" data-jump-route="${route.id}" data-jump-stop="${stop.id}" href="${stopHash(route, stop)}">${escapeText(stop.title)}</a>`;
  }

  function routeCard({route, stop}) {
    const stops = stop
      ? `<span>Найдена остановка</span> ${matchedStopLink(route, stop)}`
      : `<span>Остановки</span> ${escapeText(route.stops.map(item => item.title).join(' · '))}`;
    return `<article class="route-card">
      <div class="route-card-content">
        <div class="route-card-meta"><span>Маршрут ${number(route)} · ${escapeText(route.area)}</span>${quizStatus(route)}</div>
        <h3 class="route-card-title"><a class="route-card-link" data-open-route="${route.id}" href="${routeHash(route)}">${escapeText(route.title)}</a></h3>
        <p class="route-card-facts">${escapeText(facts(route))}</p>
        <p class="route-card-start">Старт · ${escapeText(route.startPoint.address)}</p>
        ${route.planningNote ? `<p class="route-card-start">${escapeText(route.planningNote)}</p>` : ''}
        <p class="route-card-stops">${stops}</p>
      </div>
      <div class="route-card-media" data-cover-route="${route.id}" role="img" aria-label="${escapeText(coverCaption(route))}"></div>
    </article>`;
  }

  function coverCaption(route) {
    const stop = route.stops.find(item => item.photos.some(photo => photo.src === route.coverImage));
    return stop?.title || route.title;
  }

  function loadCover(frame) {
    const route = byRoute.get(Number(frame.dataset.coverRoute));
    if (!route) return;
    coverObserver?.unobserve(frame);
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.alt = frame.getAttribute('aria-label');
    image.style.objectPosition = route.coverPosition || 'center';
    images.set(image, route.coverImage, cardSizes);
    frame.append(image);
    frame.removeAttribute('role');
    frame.removeAttribute('aria-label');
    delete frame.dataset.coverRoute;
  }

  function observeCovers() {
    if (!catalogVisible) return;
    for (const frame of byId('catalogStage').querySelectorAll('[data-cover-route]')) {
      if (coverObserver) coverObserver.observe(frame);
      else loadCover(frame);
    }
  }

  function routeRow({route, stop}, selected) {
    const row = `<a class="route-row${selected ? ' is-active' : ''}" href="${routeHash(route)}" data-open-route="${route.id}" data-preview-route="${route.id}">
      <span class="route-row-num">${number(route)}</span>
      <span class="route-row-main"><strong>${escapeText(route.title)}</strong><span>Старт · ${escapeText(route.startPoint.address)}</span>
        ${route.planningNote ? `<span>${escapeText(route.planningNote)}</span>` : ''}
        ${quizStatus(route)}</span>
      <span class="route-row-specs">${escapeText(route.duration)} · ${escapeText(route.distance)}</span><span class="route-row-arrow" aria-hidden="true">→</span>
    </a>`;
    if (!stop) return row;
    return `<div class="route-row-result">${row}<p class="route-row-stop">Найдена остановка · ${matchedStopLink(route, stop)}</p></div>`;
  }

  function listPreview(route) {
    return `<aside class="list-preview-pane">
      <a class="list-preview-frame" id="listPreviewFrame" data-open-route="${route.id}" href="${routeHash(route)}">
        <img id="listPreviewImg" ${images.attrs(route.coverImage, previewSizes)} loading="lazy" alt="${escapeText(coverCaption(route))}" style="object-position:${escapeText(route.coverPosition || 'center')}"></a>
      <span class="list-preview-meta mono" id="listPreviewMeta">Маршрут ${number(route)} · ${escapeText(route.area)}</span>
      <h3 class="list-preview-title" id="listPreviewTitle">${escapeText(route.title)}</h3>
      <p class="list-preview-desc" id="listPreviewDesc">${escapeText(route.visitorNote || route.summary)}</p></aside>`;
  }

  function updatePreview(row) {
    const frame = byId('listPreviewFrame');
    if (!frame || row.dataset.previewRoute === frame.dataset.openRoute) return;
    const route = byRoute.get(Number(row.dataset.previewRoute));
    for (const item of byId('catalogStage').querySelectorAll('.route-row')) item.classList.toggle('is-active', item === row);
    frame.href = routeHash(route);
    frame.dataset.openRoute = route.id;
    const img = byId('listPreviewImg');
    images.set(img, route.coverImage, previewSizes);
    img.alt = coverCaption(route);
    img.style.objectPosition = route.coverPosition || 'center';
    byId('listPreviewMeta').textContent = `Маршрут ${number(route)} · ${route.area}`;
    byId('listPreviewTitle').textContent = route.title;
    byId('listPreviewDesc').textContent = route.visitorNote || route.summary;
  }

  function renderCatalog() {
    coverObserver?.disconnect();
    const matches = searchRoutes();
    const stage = byId('catalogStage');
    const filterButtons = document.querySelectorAll('[data-filter]');
    for (const button of filterButtons) {
      const selected = button.dataset.filter === catalog.filter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
      if (selected) {
        const label = button.firstChild.textContent.trim();
        byId('filterSummary').textContent = catalog.filter === 'all' ? 'Фильтры' : label;
      }
    }
    for (const button of document.querySelectorAll('[data-view]')) {
      const selected = button.dataset.view === catalog.view;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    byId('resultCount').textContent = routeCount(matches.length);
    byId('routesEmptyState').classList.toggle('hidden', matches.length !== 0);
    if (!matches.length) {
      stage.replaceChildren();
    } else if (catalog.view === 'list') {
      stage.innerHTML = `<div class="routes-list-shell"><div class="routes-list">${matches.map((match, i) => routeRow(match, i === 0)).join('')}</div>${listPreview(matches[0].route)}</div>`;
    } else {
      stage.innerHTML = `<div id="routesGrid" class="routes-grid">${matches.map(routeCard).join('')}</div>`;
      observeCovers();
    }
  }

  function renderHomeData() {
    const times = routes.filter(hasDuration).map(route => route.durationMinutes);
    const shortCount = routes.filter(isShortWalk).length;
    let stats = routeCount(routes.length);
    if (times.length > 0 && times.length === routes.length) {
      const min = Math.min(...times), max = Math.max(...times);
      const range = min === max ? '' : `${min}–`;
      stats += ` · ${range}${countText(max, 'минута', 'минуты', 'минут')}`;
    } else if (shortCount) {
      stats += ` · ${shortCount} до 45 минут`;
    }
    byId('heroRouteStats').textContent = stats;
    byId('filterCountAll').textContent = routes.length;
    byId('filterCountShort').textContent = shortCount;
    byId('authorsList').innerHTML = routes.map(route => `<li><span class="author-route mono">${number(route)}</span>
      <div class="author-names"><strong>${escapeText(route.authors)}</strong><span>${escapeText(route.title)}</span></div></li>`).join('');
    updateQuizHub();
    renderCatalog();
  }

  function updateQuizHub() {
    const passed = routes.filter(route => progress[route.id]?.passed).length;
    byId('headerQuizScore').textContent = `Пройдено викторин: ${passed} из ${routes.length}`;
    byId('quizHubGrid').innerHTML = routes.map(route => {
      const result = progress[route.id];
      const status = result ? `Лучший результат ${result.score}/${result.total}` : countText(route.quiz.length, 'вопрос', 'вопроса', 'вопросов');
      return `<div class="quiz-index-row"><span class="quiz-index-num mono">${number(route)}</span>
        <div class="quiz-index-title"><strong>${escapeText(route.title)}</strong><span>${escapeText(route.shortTitle !== route.title ? route.area : route.categoryLabel)}</span></div>
        <span class="quiz-index-status${result?.passed ? ' done' : ''}">${status}</span><div class="quiz-index-action">
        <a class="link-action" data-open-route-quiz="${route.id}" href="${routeHash(route)}/quiz" aria-label="Пройти викторину маршрута ${number(route)}">Пройти →</a></div></div>`;
    }).join('');
  }

  function recordResult(id, score, total) {
    quiz.record(progress, id, score, total);
    updateQuizHub();
    renderCatalog();
  }

  function startMegaQuiz(restart = false) {
    const panel = byId('megaQuizPanel');
    const button = byId('startMegaQuizBtn');
    panel.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    if (panel.firstElementChild && !restart) {
      focusAt(panel.querySelector('button[data-q]:enabled') || panel.querySelector('[data-quiz-reset]'));
      return;
    }
    const questions = routes.flatMap(route => route.quiz.map(question => ({ ...question, routeNumber: number(route) })));
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    button.textContent = 'Вернуться к тесту';
    quiz.mount(panel, { title: 'Большая викторина по Алексеевке', subtitle: `10 вопросов из ${routes.length} маршрутов`, questions: questions.slice(0, 10), onRestart: () => startMegaQuiz(true), onClose() {
      panel.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    }});
    focusAt(panel.querySelector('h3'));
  }

  function renderCompare(pair, stop, firstIndex) {
    return `<div class="compare-block" data-compare="${stop.id}"><div class="compare-stage">
      <img class="compare-img" ${images.attrs(pair.afterSrc, photoSizes)} loading="lazy" alt="${escapeText(pair.afterLabel)}">
      <div class="compare-before-wrap" data-compare-clip><img class="compare-img" ${images.attrs(pair.beforeSrc, photoSizes)} loading="lazy" alt="${escapeText(pair.beforeLabel)}"></div>
      <div class="compare-divider" data-compare-divider></div><div class="compare-handle" data-compare-handle aria-hidden="true">↔</div>
      <input class="compare-range" type="range" min="0" max="100" value="50" data-compare-input aria-label="Доля архивного снимка, ${escapeText(stop.title)}" aria-valuetext="50 %">
      </div><div class="compare-labels mono"><span>${escapeText(pair.beforeLabel)}</span><span>${escapeText(pair.afterLabel)}</span></div>
      <div class="compare-foot"><p class="compare-caption">${escapeText(pair.caption)}</p><button class="text-btn compare-zoom" type="button" data-lightbox-index="${firstIndex}">Увеличить снимки</button></div></div>`;
  }

  function renderStop(route, stop, index) {
    const stopPhotos = stop.photos.map(photo => {
      const galleryIndex = gallery.length;
      gallery.push({ src: photo.src, caption: `${stop.title}. ${photo.caption}` });
      return { photo, galleryIndex };
    });
    const pair = stop.comparePair;
    const before = pair && stopPhotos.find(({photo}) => photo.src === pair.beforeSrc);
    const comparison = pair ? renderCompare(pair, stop, before?.galleryIndex ?? stopPhotos[0].galleryIndex) : '';
    const visible = stopPhotos.filter(({photo}) => !pair || (photo.src !== pair.afterSrc && photo.src !== pair.beforeSrc));
    const photos = visible.length ? `<div class="stop-gallery cols-${Math.min(visible.length, 3)}">${visible.map(({photo, galleryIndex}) =>
      `<figure class="stop-photo${photo.isPortrait ? ' is-portrait' : ''}"><button class="stop-photo-frame" data-lightbox-index="${galleryIndex}" type="button" aria-label="Увеличить фото. ${escapeText(photo.caption)}">
      <img ${images.attrs(photo.src, photoSizes)} alt="${escapeText(photo.caption)}" loading="lazy" style="object-position:${escapeText(photo.position || 'center')}"></button>
      <figcaption><span>${escapeText(photo.caption)}</span>${photo.isArchive ? '<span class="photo-archive mono">Архив</span>' : ''}</figcaption></figure>`).join('')}</div>` : '';
    const q = stop.guideQuestion;
    const guideQuestion = q ? `<div class="guide-question"><p class="guide-q-label mono">Вопрос на остановке</p><p class="guide-q-text">${escapeText(q.prompt)}</p>
      <button type="button" class="guide-answer-toggle" data-toggle-answer="ans-${stop.id}" aria-controls="ans-${stop.id}" aria-expanded="false">Показать ответ</button>
      <div id="ans-${stop.id}" class="guide-answer-box hidden">${escapeText(q.answer)}</div></div>` : '';
    const next = route.stops[index + 1];
    const cue = next ? `<a class="stop-next-btn" href="${stopHash(route, next)}" data-scroll-stop="${next.id}">Дальше · ${escapeText(next.title)} →</a>
      <a class="stop-map-link" href="${maps.pointUrl(next.coords)}" target="_blank" rel="noopener" aria-label="Открыть на карте. ${escapeText(next.title)}">Открыть на карте ↗</a>` :
      `<a class="stop-next-btn" href="${routeHash(route)}/quiz" data-scroll-anchor="route-quiz">К викторине по маршруту →</a>`;
    return `<article class="stop-article" id="stop-${stop.id}" data-spy-anchor="stop-${stop.id}" tabindex="-1">
      <aside class="stop-marginalia"><span class="stop-idx">Остановка ${index + 1} из ${route.stops.length}</span><h2 class="stop-title">${escapeText(stop.title)}</h2>
        <p class="stop-addr">${escapeText(stop.address)}</p><a class="stop-map-link" href="${maps.pointUrl(stop.coords)}" target="_blank" rel="noopener">Открыть на карте ↗</a>${guideQuestion}</aside>
      <div class="stop-content">${comparison}${photos}<div class="stop-prose">${stop.paragraphs.map(p => `<p>${escapeText(p)}</p>`).join('')}</div><div class="stop-next-cue">${cue}</div></div></article>`;
  }

  function printPassport(route, note) {
    return `<section class="print-passport" aria-label="Печатный паспорт"><p>Алексеевка · Маршрут ${number(route)}</p><h1>${escapeText(route.title)}</h1>
      <p>${escapeText(facts(route))} · ${escapeText(route.mode)}</p>${note ? `<p>${escapeText(note)}</p>` : ''}
      <h2>Место старта</h2><p>${escapeText(route.startPoint.name)} · ${escapeText(route.startPoint.address)}</p><h2>Остановки по порядку</h2>
      <ol>${route.stops.map(stop => `<li><strong>${escapeText(stop.title)}</strong><br>${escapeText(stop.address)}</li>`).join('')}</ol>
      <p>${escapeText(route.decree)}<br>Авторы: ${escapeText(route.authors)}</p></section>`;
  }

  function itinerary(route) {
    const walking = maps.walkingUrl(route);
    const directions = walking
      ? `<a class="stop-map-link" href="${walking}" target="_blank" rel="noopener">Пеший путь по улицам в Яндекс Картах ↗</a>`
      : 'Открывайте остановки по отдельности. Места посадки и высадки пока неизвестны.';
    const items = route.stops.map((stop, i) => `<a class="itinerary-step" data-scroll-stop="${stop.id}" href="${stopHash(route, stop)}">
      <span class="itinerary-pin" aria-hidden="true" style="background:var(--ink)">${i + 1}</span><span class="itinerary-info"><strong>${escapeText(stop.title)}</strong><span>${escapeText(stop.address)}</span></span></a>`).join('');
    return `<section class="route-map-panel" id="anchor-route-map" data-spy-anchor="route-map" tabindex="-1" aria-label="План прогулки и схема остановок">
      <div class="route-itinerary"><div class="route-itinerary-head"><strong>План прогулки</strong><span>${stopCount(route.stops.length)}</span></div>
        <div class="route-itinerary-list"><div class="itinerary-step is-start"><span class="itinerary-info"><strong>Старт · ${escapeText(route.startPoint.name)}</strong><span>${escapeText(route.startPoint.address)}</span></span></div>${items}</div></div>
      <div class="route-map-body"><div id="routeMiniMap" class="route-mini-map" role="region" aria-label="Схема остановок маршрута ${number(route)}"></div>
        <p class="route-map-note">Метки поставлены по адресам, пунктир показывает порядок остановок. Входы и проходы по улицам ещё предстоит проверить на месте. ${directions}</p></div></section>`;
  }

  function renderRoute(route) {
    currentRoute = route;
    gallery = [];
    const note = route.sourceNote || '';
    const stops = route.stops.map((stop, index) => renderStop(route, stop, index)).join('');
    const navLink = (hash, key, label) => `<a class="route-anchor-btn" data-scroll-anchor="${key}" href="${hash}">${escapeText(label)}</a>`;
    const jumpLinks = [navLink(`${routeHash(route)}/map`, 'route-map', 'План'), ...route.stops.map((stop, i) => navLink(stopHash(route, stop), `stop-${stop.id}`, `${i + 1}. ${stop.title}`)), navLink(`${routeHash(route)}/quiz`, 'route-quiz', 'Викторина')];
    const detail = byId('routeDetailView');
    detail.innerHTML = `<div class="container">
      <nav class="detail-topbar breadcrumbs" aria-label="Навигационная цепочка"><a href="#routes" data-nav="routes">← Все маршруты</a><span aria-hidden="true">/</span><span class="crumb-current">Маршрут ${number(route)}</span></nav>
      <header class="detail-header"><div><h1 class="detail-title" tabindex="-1">${escapeText(route.title)}</h1><p class="detail-facts">${escapeText(facts(route))}</p>
        </div><div class="detail-start-info"><h2>Место старта</h2><p><strong>${escapeText(route.startPoint.name)}</strong><br>${escapeText(route.startPoint.address)}</p>
        <div class="detail-actions"><a class="btn btn-solid" href="${maps.pointUrl(route.startPoint.coords)}" target="_blank" rel="noopener">К месту старта ↗</a>
        <a class="btn btn-line" data-scroll-stop="${route.stops[0].id}" href="${stopHash(route, route.stops[0])}">Читать первую остановку</a></div></div></header>
      <p class="detail-summary">${escapeText(route.summary)}</p>
      ${note ? `<p class="detail-visitor-note">${escapeText(note)}</p>` : ''}${itinerary(route)}
      <nav class="route-sticky-nav" aria-label="Разделы прогулки">${jumpLinks.join('')}</nav><section aria-label="Остановки маршрута">${stops}</section>
      <section id="anchor-route-quiz" tabindex="-1" data-spy-anchor="route-quiz" aria-label="Викторина по маршруту"></section>
      <details class="route-sources"><summary>Паспорт маршрута и авторы</summary><dl class="passport-table">${[['Формат', route.mode], ['Сопровождение',route.guides], ['Авторы',route.authors], ['Утверждение',route.decree]].map(([label,value]) => `<div class="passport-row"><dt>${label}</dt><dd>${escapeText(value)}</dd></div>`).join('')}</dl></details>
      <nav class="route-nav-footer" aria-label="Действия с маршрутом"><button type="button" class="text-btn" id="printRouteBtn">Распечатать паспорт</button>
      ${location.protocol === 'file:' ? '' : '<div><button type="button" class="text-btn" id="shareRouteBtn">Скопировать ссылку на маршрут</button><span id="shareRouteStatus" role="status"></span><input id="shareRouteManual" aria-label="Ссылка на маршрут для копирования" type="url" readonly hidden></div>'}
      <div class="detail-route-switcher" aria-label="Другие маршруты">${routes.map(r => `<a href="${routeHash(r)}" data-open-route="${r.id}" class="switcher-num${r.id === route.id ? ' active' : ''}" ${r.id === route.id ? 'aria-current="page"' : ''} aria-label="Маршрут ${number(r)}. ${escapeText(r.title)}">${r.id}</a>`).join('')}</div><a class="text-btn" href="#routes" data-nav="routes">К каталогу</a></nav>
      </div>${printPassport(route, note)}`;
    detail.classList.remove('hidden');
    byId('homeView').classList.add('hidden');
    maps.mountRoute(route);
    quiz.mount(byId('anchor-route-quiz'), { title: `Викторина по маршруту ${number(route)}`, subtitle: route.title, questions: route.quiz, routeId: route.id, onComplete: recordResult });
    document.title = `${route.title} · Маршрут ${number(route)} · Алексеевка`;
  }

  function focusAt(target, scroll = true) {
    if (!target) return;
    if (!target.matches('a,button,input,summary,[tabindex]')) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    if (scroll) target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function copyRouteLink() {
    const pageDirectory = document.querySelector('meta[name="guide-route-pages"]')?.content;
    const address = pageDirectory
      ? new URL(`${pageDirectory}${currentRoute.id}/`, document.baseURI)
      : new URL(routeHash(currentRoute), location.href);
    const status = byId('shareRouteStatus');
    const manual = byId('shareRouteManual');
    try {
      await navigator.clipboard.writeText(address.href);
      manual.hidden = true;
      status.textContent = ' Ссылка скопирована.';
    } catch {
      status.textContent = ' Скопируйте выделенную ссылку.';
      manual.hidden = false;
      manual.value = address.href;
      manual.focus();
      manual.select();
    }
  }

  function setMenu(open) {
    const toggle = byId('menuToggle');
    toggle.setAttribute('aria-expanded', String(open));
    byId('mainNav').classList.toggle('open', open);
  }

  function showPhoto(index, trigger) {
    if (!gallery.length) return;
    const box = byId('lightbox');
    photoIndex = (index + gallery.length) % gallery.length;
    const photo = gallery[photoIndex];
    byId('lightboxImg').src = photo.src;
    byId('lightboxImg').alt = photo.caption;
    byId('lightboxCaption').textContent = `${photoIndex + 1} из ${gallery.length} · ${photo.caption}`;
    if (!trigger) return;
    photoTrigger = trigger;
    box.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    dialogBackground = Array.from(document.body.children).filter(element =>
      element !== box && !element.inert && !element.matches('script, style, link'));
    for (const region of dialogBackground) region.inert = true;
    byId('lightboxClose').focus();
  }

  function closePhoto(restoreFocus = true) {
    if (!photoTrigger) return;
    const trigger = photoTrigger;
    const hash = location.hash;
    photoTrigger = null;
    document.body.style.overflow = '';
    for (const region of dialogBackground) region.inert = false;
    dialogBackground = [];
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    byId('lightbox').classList.add('hidden');
    if (restoreFocus) requestAnimationFrame(() => {
      // WebKit can clear focus while applying the change to the inert background.
      if (!photoTrigger && location.hash === hash && trigger.isConnected && document.activeElement === document.body) {
        trigger.focus({ preventScroll: true });
      }
    });
  }

  function showMissingLink(route) {
    const notice = document.createElement('p');
    notice.id = 'routeLinkNotice';
    notice.className = 'detail-visitor-note';
    notice.tabIndex = -1;
    const link = document.createElement('a');
    if (route) {
      notice.append('Раздел прогулки по этой ссылке не найден. ');
      link.href = `${routeHash(route)}/map`;
      link.textContent = `Открыть план маршрута ${number(route)}`;
      byId('routeDetailView').querySelector('.detail-header').before(notice);
    } else {
      notice.append('Маршрут по этой ссылке не найден. ');
      link.href = '#routes';
      link.textContent = 'Выбрать прогулку в каталоге';
      byId('routes').querySelector('.section-head').before(notice);
    }
    link.className = 'stop-map-link';
    notice.append(link);
    focusAt(notice);
  }

  function display(hash, {initial = false, restore = false} = {}) {
    closePhoto(false);
    byId('routeLinkNotice')?.remove();
    setMenu(false);
    byId('catalogFilters').open = false;
    const routeLink = hash.match(/^#route-(\d+)(?:\/(.*))?$/);
    const route = routeLink && byRoute.get(Number(routeLink[1]));
    if (route) {
      catalogVisible = false;
      coverObserver?.disconnect();
      if (currentRoute !== route) {
        if (currentRoute) maps.leaveRoute();
        renderRoute(route);
      }
      const path = routeLink[2];
      const stop = route.stops.find(item => path === `stop/${item.id}`);
      const section = path === 'map' || path === 'quiz' ? path : null;
      if (restore && history.state?.routeMapReturn) maps.restoreDetailOrigin(history.state.routeMapReturn);
      else if (stop) focusAt(byId(`stop-${stop.id}`));
      else if (section) focusAt(byId(`anchor-route-${section}`));
      else if (path) showMissingLink(route);
      else {
        window.scrollTo({ top: 0, behavior: 'instant' });
        focusAt(byId('routeDetailView').querySelector('.detail-title'), false);
      }
    } else {
      const home = byId('homeView');
      catalogVisible = true;
      if (currentRoute) {
        maps.leaveRoute();
        currentRoute = null;
        gallery = [];
        byId('routeDetailView').classList.add('hidden');
        byId('routeDetailView').replaceChildren();
        home.classList.remove('hidden');
        document.title = homeTitle;
        maps.showHome();
      }
      const back = restore && history.state?.homeReturn;
      if (back && back.catalog) {
        Object.assign(catalog, back.catalog);
        byId('routeSearchInput').value = catalog.search;
        renderCatalog();
      }
      if (back?.mapFilter) {
        const filter = byId('mapRouteFilters').querySelector(`[data-map-route="${CSS.escape(back.mapFilter)}"]`);
        if (filter && filter.getAttribute('aria-pressed') !== 'true') filter.click();
        byId('mapStopsList').scrollTop = back.listScroll;
      }
      const id = hash.slice(1) || 'home';
      const section = byId(homeSections.includes(id) ? id : 'home');
      if (hash.startsWith('#route-')) {
        showMissingLink(null);
      } else if (back) {
        const area = byId(back.area);
        const returned = (back.linkId && byId(back.linkId)) ||
          area?.querySelector(`a[href="${CSS.escape(back.href)}"]`) || area;
        focusAt(returned, false);
        window.scrollTo({top: back.y, behavior: 'instant'});
      } else if (!initial || hash) {
        const heading = section.querySelector('h1,h2') || section;
        focusAt(heading, false);
        if (section.id === 'home') window.scrollTo({top: 0, behavior: 'instant'});
        else section.scrollIntoView({block: 'start', behavior: 'instant'});
      }
      observeCovers();
    }
    updateNavigation(true);
  }

  function navigate(hash, origin) {
    if (!hash) return;
    if (location.hash !== hash) {
      const mapReturn = maps.navigationOrigin(origin);
      if (mapReturn) origin = mapReturn.element;
      const area = origin?.closest('#catalogStage,#cityMap,#mapStopsList,#mapSidebarFooter');
      if (origin?.closest('#routeMiniMap')) {
        history.replaceState({routeMapReturn: {href: hash, linkId: origin.id, y: mapReturn?.y ?? window.scrollY}}, '');
      } else if (area) {
        const back = { area: area.id, href: hash, linkId: origin.id, y: mapReturn?.y ?? window.scrollY };
        if (area.id === 'catalogStage') {
          back.catalog = { ...catalog };
        } else {
          back.mapFilter = byId('mapRouteFilters').querySelector('[aria-pressed="true"]').dataset.mapRoute;
          back.listScroll = byId('mapStopsList').scrollTop;
        }
        history.replaceState({ homeReturn: back }, '');
      }
      history.pushState(null, '', hash);
    }
    display(hash);
  }

  function updateNavigation(revealSection = false) {
    scrollFrame = 0;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const bar = byId('readingProgress');
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0})`;
    let active = 'routes';
    if (currentRoute) {
      const detail = byId('routeDetailView');
      let target = 'route-map';
      for (const section of detail.querySelectorAll('[data-spy-anchor]')) {
        if (section.getBoundingClientRect().top <= window.innerHeight * 0.35) target = section.dataset.spyAnchor;
      }
      for (const link of detail.querySelectorAll('.route-anchor-btn')) {
        const current = link.dataset.scrollAnchor === target;
        const reveal = current && (revealSection === true || !link.classList.contains('is-current'));
        link.classList.toggle('is-current', current);
        if (current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
        if (reveal) {
          const strip = link.parentElement;
          const bounds = strip.getBoundingClientRect();
          const item = link.getBoundingClientRect();
          if (item.left < bounds.left || item.width > bounds.width) strip.scrollLeft += item.left - bounds.left;
          else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
        }
      }
    } else {
      active = 'home';
      for (const section of byId('homeView').querySelectorAll(':scope > section[id]')) {
        if (section.getBoundingClientRect().top <= window.innerHeight * 0.32) active = section.id;
      }
    }
    for (const link of byId('mainNav').querySelectorAll('[data-nav]')) {
      const current = link.dataset.nav === active;
      link.classList.toggle('active', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  function handleClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const origin = event.target;
    const filters = byId('catalogFilters');
    if (filters.open && !filters.contains(origin)) filters.open = false;
    if (origin.closest('.skip-link')) {
      event.preventDefault();
      focusAt((currentRoute ? byId('routeDetailView') : byId('homeView')).querySelector('h1'));
      return;
    }
    const target = origin.closest('[data-nav],[data-open-route],[data-open-route-quiz],[data-jump-route],[data-scroll-stop],[data-scroll-anchor],#map a[href^="#route-"],#routeMiniMap a[href^="#route-"]');
    if (target) {
      const data = target.dataset;
      let hash = target.getAttribute('href');
      if (!hash?.startsWith('#')) {
        if (data.nav) hash = `#${data.nav}`;
        else if (data.jumpRoute) hash = `#route-${data.jumpRoute}${data.jumpStop ? `/stop/${data.jumpStop}` : ''}`;
        else if (data.openRoute) hash = `#route-${data.openRoute}`;
        else if (data.openRouteQuiz) hash = `#route-${data.openRouteQuiz}/quiz`;
        else if (data.scrollStop && currentRoute) hash = `${routeHash(currentRoute)}/stop/${data.scrollStop}`;
      }
      if (hash?.startsWith('#')) {
        event.preventDefault();
        navigate(hash, target);
        return;
      }
    }
    const photo = origin.closest('[data-lightbox-index]');
    if (photo) {
      showPhoto(Number(photo.dataset.lightboxIndex), photo);
      return;
    }
    const answer = origin.closest('[data-toggle-answer]');
    if (answer) {
      const open = answer.getAttribute('aria-expanded') !== 'true';
      answer.setAttribute('aria-expanded', String(open));
      byId(answer.dataset.toggleAnswer).classList.toggle('hidden', !open);
      answer.textContent = open ? 'Скрыть ответ' : 'Показать ответ';
      return;
    }
    if (origin.closest('#printRouteBtn')) window.print();
    if (origin.closest('#shareRouteBtn')) copyRouteLink();
    if (!origin.closest('#siteHeader') && byId('mainNav').classList.contains('open')) setMenu(false);
  }

  function handleKeys(event) {
    if (photoTrigger) {
      switch (event.key) {
        case 'Escape': event.preventDefault(); closePhoto(); break;
        case 'ArrowLeft': event.preventDefault(); showPhoto(photoIndex - 1); break;
        case 'ArrowRight': event.preventDefault(); showPhoto(photoIndex + 1); break;
        case 'Tab': {
          const first = byId('lightboxClose');
          const last = byId('lightboxNext');
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          break;
        }
      }
    } else if (event.key === 'Escape' && byId('mainNav').classList.contains('open')) {
      setMenu(false);
      byId('menuToggle').focus();
    } else if (event.key === 'Escape' && byId('catalogFilters').open) {
      const filters = byId('catalogFilters');
      const focusInside = filters.contains(event.target);
      filters.open = false;
      if (focusInside) filters.querySelector('summary').focus();
    }
  }

  function bindEvents() {
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeys);
    byId('menuToggle').addEventListener('click', () => setMenu(!byId('mainNav').classList.contains('open')));
    for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
      catalog.filter = button.dataset.filter;
      renderCatalog();
      const details = byId('catalogFilters');
      if (details.open) {
        details.open = false;
        details.querySelector('summary').focus();
      }
    });
    for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
      catalog.view = button.dataset.view;
      renderCatalog();
    });
    byId('routeSearchInput').addEventListener('input', event => {
      catalog.search = event.currentTarget.value;
      renderCatalog();
    });
    byId('resetFiltersBtn').addEventListener('click', () => {
      catalog.filter = 'all';
      catalog.search = '';
      byId('routeSearchInput').value = '';
      renderCatalog();
      byId('routeSearchInput').focus();
    });
    const stage = byId('catalogStage');
    for (const name of ['pointerover', 'focusin']) stage.addEventListener(name, event => {
      const row = event.target.closest('[data-preview-route]') ||
        event.target.closest('.route-row-result')?.querySelector('.route-row');
      if (row) updatePreview(row);
    });
    byId('routeDetailView').addEventListener('input', event => {
      const slider = event.target.closest('[data-compare-input]');
      if (!slider) return;
      const stage = slider.closest('.compare-stage');
      const value = Number(slider.value);
      stage.querySelector('[data-compare-clip]').style.clipPath = `inset(0 ${100 - value}% 0 0)`;
      for (const element of stage.querySelectorAll('[data-compare-divider],[data-compare-handle]')) element.style.left = `${value}%`;
      slider.setAttribute('aria-valuetext', `${value} %`);
    });
    byId('lightboxClose').addEventListener('click', () => closePhoto());
    byId('lightboxPrev').addEventListener('click', () => showPhoto(photoIndex - 1));
    byId('lightboxNext').addEventListener('click', () => showPhoto(photoIndex + 1));
    byId('lightbox').addEventListener('click', event => { if (event.target === byId('lightbox')) closePhoto(); });
    const megaButton = byId('startMegaQuizBtn');
    megaButton.setAttribute('aria-controls', 'megaQuizPanel');
    megaButton.setAttribute('aria-expanded', 'false');
    megaButton.addEventListener('click', () => startMegaQuiz());
    window.addEventListener('resize', () => updateNavigation(true));
    window.addEventListener('scroll', () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateNavigation);
    }, {passive: true});
    window.addEventListener('hashchange', () => display(location.hash, {restore: true}));
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderHomeData();
    bindEvents();
    display(location.hash, {initial: true});
    maps.initHome();
  });
})();
