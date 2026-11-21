/* The map is an enhancement. Addresses, route links and the stop diagram work locally. */
(() => {
  'use strict';

  const routes = window.EXCURSION_ROUTES;
  const overviewMapId = '433ab3df5c36c6ff5f6fca1c71d02aa2d4fbd6de7d3872c7e3eccd15fde0a953';
  // The standard image omits some long polylines. Use the Constructor web exports for these maps.
  const mapExports = {
    [overviewMapId]: 'assets/maps/cemetery-overview.png',
    [routes.find(route => route.id === 5).constructorMapId]: 'assets/maps/route-5.png'
  };
  let home, detail, selectedRoute = 'all';

  function html(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  }

  function pointUrl([lat, lon]) {
    return `https://yandex.ru/maps/?pt=${lon},${lat}&z=17&l=map`;
  }

  function mapPreview(id, title) {
    const map = 'constructor%3A' + encodeURIComponent(id);
    const exportedImage = mapExports[id];
    const src = exportedImage || `https://api-maps.yandex.ru/services/constructor/1.0/static/?um=${map}&width=650&height=450&lang=ru_RU`;
    const [width, height] = exportedImage ? [1200, 850] : [650, 450];
    return `<a class="yandex-map-preview" href="https://yandex.ru/maps/?um=${map}&amp;source=constructorLink" target="_blank" rel="noopener">
      <img src="${html(src)}" width="${width}" height="${height}" loading="lazy" alt="${html(title)}">
      <span>Открыть в Яндекс Картах ↗</span>
    </a>`;
  }

  function walkingUrl(route) {
    if (route.mode.includes('автобус')) return null;
    const points = [route.startPoint, ...route.stops].map(point => (point.approachCoords || point.coords).join(','));
    const waypoints = points.filter((point, i) => i === 0 || point !== points[i - 1]);
    return `https://yandex.ru/maps/?rtext=${encodeURIComponent(waypoints.join('~'))}&rtt=pd`;
  }

  function stopsFor(route, includeStart) {
    const first = route.stops[0];
    const sameStart = first && first.coords.every((n, i) => n === route.startPoint.coords[i]);
    const stops = route.stops.map((stop, i) => {
      const atStart = i === 0 && sameStart;
      return {route, point: stop, label: atStart ? 'С/1' : String(i + 1),
        description: atStart ? 'Старт · остановка 1' : `Остановка ${i + 1}`};
    });
    if (includeStart && !sameStart) {
      stops.unshift({route, point: route.startPoint, label: 'С', description: 'Старт'});
    }
    return stops;
  }

  function titleOf(point) { return point.title || point.name; }

  function stopUrl(route, point) {
    return `#route-${route.id}/stop/${encodeURIComponent(point.id)}`;
  }

  function pinId(view, route, point) {
    return `${view.element.id}-pin-${point.id || 'start-' + route.id}`;
  }

  function countLabel(n) {
    if (n % 100 >= 11 && n % 100 <= 14) return `${n} точек`;
    return `${n} ${n % 10 === 1 ? 'точка' : n % 10 >= 2 && n % 10 <= 4 ? 'точки' : 'точек'}`;
  }

  function diagram(view) {
    const single = view.routes.length === 1;
    const coords = view.routes.flatMap(r => [r.startPoint, ...r.stops].map(point => point.coords));
    if (!coords.length) return;
    const lats = coords.map(p => p[0]), lons = coords.map(p => p[1]);
    const lat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const lon = (Math.max(...lons) + Math.min(...lons)) / 2;
    const lonScale = Math.cos(lat * Math.PI / 180);
    const scale = Math.min(520 / Math.max((Math.max(...lons) - Math.min(...lons)) * lonScale, 0.0001),
      242 / Math.max(Math.max(...lats) - Math.min(...lats), 0.0001));
    const position = ([y, x]) => [Math.round(300 + (x - lon) * lonScale * scale), Math.round(150 - (y - lat) * scale)];
    const lines = [], pins = [];
    for (const r of view.routes) {
      const path = [r.startPoint, ...r.stops].map(p => position(p.coords).join(',')).join(' ');
      lines.push(`<polyline points="${path}" fill="none" stroke="${html(r.color)}" stroke-width="2" stroke-dasharray="5 5"/>`);
      for (const {point, label, description} of stopsFor(r, single)) {
        const [x, y] = position(point.coords);
        const title = `${r.number} · ${description} · ${titleOf(point)}`;
        const link = point.id ? `href="${stopUrl(r, point)}"` : `href="${pointUrl(point.coords)}" target="_blank" rel="noopener"`;
        pins.push(`<a id="${html(pinId(view, r, point))}" ${link} aria-label="${html(title)}"><title>${html(title)}</title>
          <g transform="translate(${x},${y})"><rect x="-12" y="-12" width="24" height="24" rx="3" fill="${point.id ? html(r.color) : '#141413'}" stroke="white"/>
          <text text-anchor="middle" y="4" fill="white" font-family="sans-serif" font-size="13">${label}</text></g></a>`);
      }
    }
    view.element.innerHTML = `<div class="offline-map-wrap"><div class="offline-map-banner"><span role="status">Схема остановок</span></div>
      <svg class="offline-map-svg" viewBox="0 0 600 300" role="group" aria-label="Схема с переходами к остановкам">${lines.join('')}${pins.join('')}</svg></div>`;
  }

  function renderHome() {
    const visibleRoutes = selectedRoute === 'all' ? routes : routes.filter(r => r.id === Number(selectedRoute));
    const entries = visibleRoutes.flatMap(r => stopsFor(r, false));
    const route = visibleRoutes[0];
    document.getElementById('mapSidebarTitle').textContent = selectedRoute === 'all' ? 'Все объекты' : `Маршрут ${route.number}`;
    document.getElementById('mapSidebarCount').textContent = countLabel(entries.length);
    document.getElementById('mapStopsList').innerHTML = entries.map(({route, point, label, description}) =>
      `<a class="map-stop-item" id="map-stop-${html(point.id)}" data-focus-stop="${html(point.id)}" href="${stopUrl(route,point)}"><span class="map-stop-idx" style="background:${html(route.color)}">${label}</span>
       <span class="map-stop-info"><strong>${html(point.title)}</strong><span>${html(route.number)} · ${description} · ${html(point.address)}</span></span></a>`).join('');
    const footer = document.getElementById('mapSidebarFooter');
    footer.classList.toggle('hidden', selectedRoute === 'all');
    const walking = walkingUrl(route);
    footer.innerHTML = selectedRoute === 'all' ? '' : `${route.planningNote ? `<p class="map-planning-note">${html(route.planningNote)}</p>` : ''}
      <a class="btn btn-solid btn-sm" href="#route-${route.id}">Открыть маршрут ${html(route.number)}</a>
      ${walking ? `<a class="map-sidebar-ext" href="${walking}" target="_blank" rel="noopener">Пеший путь в Яндекс Картах</a>` : ''}`;
    const all = selectedRoute === 'all';
    home.innerHTML = all ? mapPreview(overviewMapId, 'Карта всех маршрутов Алексеевки') :
      mapPreview(route.constructorMapId, 'Карта маршрута ' + route.number);
    const approach = visibleRoutes.flatMap(item => item.stops).find(stop => stop.approachNote);
    document.getElementById('mapApproachNote').textContent = approach?.approachNote || '';
  }

  function initHome() {
    const map = document.getElementById('cityMap');
    if (home || !map) return;
    const toolbar = document.getElementById('mapRouteFilters');
    toolbar.innerHTML = `<button type="button" class="map-filter-btn active" data-map-route="all" aria-pressed="true">Все маршруты</button>` +
      routes.map(r => `<button type="button" class="map-filter-btn" data-map-route="${r.id}" aria-pressed="false"><span class="route-dot" style="background:${html(r.color)}"></span>${html(r.number)} · ${html(r.shortTitle)}</button>`).join('');
    home = map;
    renderHome();
    toolbar.addEventListener('click', e => {
      const btn = e.target.closest('[data-map-route]');
      if (!btn) return;
      selectedRoute = btn.dataset.mapRoute;
      toolbar.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      renderHome();
    });
  }

  function leaveRoute() { detail = null; }

  function mountRoute(route) {
    leaveRoute();
    const element = document.getElementById('routeMiniMap');
    if (element) {
      detail = {element, routes:[route]};
      diagram(detail);
    }
  }

  function restoreDetailOrigin(saved) {
    if (!detail) return;
    const target = document.getElementById(saved.linkId) ||
      detail.element.querySelector(`a[href="${CSS.escape(saved.href)}"]`) ||
      document.getElementById('anchor-route-map');
    target.focus({preventScroll:true});
    window.scrollTo({top:saved.y, behavior:'instant'});
  }

  window.GuideMaps = {initHome, mountRoute, leaveRoute, pointUrl, mapPreview, walkingUrl, restoreDetailOrigin};
})();
