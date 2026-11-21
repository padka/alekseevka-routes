/* The map is an enhancement. Addresses, route links and the stop diagram work locally. */
(() => {
  'use strict';

  const routes = window.EXCURSION_ROUTES;
  const leafletAssets = 'assets/vendor/leaflet/';
  const assetRequests = new Map();
  let home, detail, selectedRoute = 'all';

  function html(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  }

  function pointUrl([lat, lon]) {
    return `https://yandex.ru/maps/?pt=${lon},${lat}&z=17&l=map`;
  }

  function walkingUrl(route) {
    if (route.mode.includes('автобус')) return null;
    const points = [route.startPoint, ...route.stops].map(point => point.coords.join(','));
    const waypoints = points.filter((point, i) => i === 0 || point !== points[i - 1]);
    return `https://yandex.ru/maps/?rtext=${encodeURIComponent(waypoints.join('~'))}&rtt=pd`;
  }

  function resource(file) {
    if (assetRequests.has(file)) return assetRequests.get(file);
    const request = new Promise((resolve, reject) => {
      const style = file.endsWith('.css');
      const tag = document.createElement(style ? 'link' : 'script');
      const timer = setTimeout(fail, 8000);
      function fail() {
        clearTimeout(timer);
        tag.onload = tag.onerror = null;
        tag.remove();
        assetRequests.delete(file);
        reject(new Error(file));
      }
      tag.onerror = fail;
      tag.onload = () => {
        clearTimeout(timer);
        tag.onload = tag.onerror = null;
        resolve();
      };
      if (style) {
        tag.rel = 'stylesheet';
        tag.href = leafletAssets + file;
      } else {
        tag.src = leafletAssets + file;
      }
      if (style) document.head.prepend(tag);
      else document.head.append(tag);
    });
    assetRequests.set(file, request);
    return request;
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
    const status = view.failed || 'Схема остановок';
    const manual = view !== detail && !('IntersectionObserver' in window) && location.protocol !== 'file:';
    const retry = view.failed || manual ? `<button type="button" class="map-retry text-btn" data-map-retry>${view.failed ? 'Загрузить карту ещё раз' : 'Показать карту улиц'}</button>` : '';
    view.element.innerHTML = `<div class="offline-map-wrap"><div class="offline-map-banner"><span role="status">${status}</span>${retry}</div>
      <svg class="offline-map-svg" viewBox="0 0 600 300" role="group" aria-label="Схема с переходами к остановкам">${lines.join('')}${pins.join('')}</svg></div>`;
    if (retry) view.element.querySelector('[data-map-retry]').addEventListener('click', () => {
      view.failed = false;
      view.visible = true;
      activate(view);
    });
  }

  function popup({route, point, description}) {
    const picture = point.photos?.[0];
    const photo = picture ? `<img ${window.GuideImages.attrs(picture.src, '250px')} alt="${html(titleOf(point))}" />` : '';
    const link = point.id ? `<a class="map-popup-btn" href="${stopUrl(route, point)}">Читать об остановке</a>` : '';
    return `<div class="map-popup">${photo}<div class="map-popup-body"><div class="map-popup-route">${html(route.number)} · ${description}</div>
      <div class="map-popup-title">${html(titleOf(point))}</div><p class="map-popup-addr">${html(point.address)}</p>
      <div class="map-popup-actions">${link}<a class="map-popup-ext" href="${pointUrl(point.coords)}" target="_blank" rel="noopener">Открыть в Яндекс Картах</a></div></div></div>`;
  }

  function focusPopup(view, marker) {
    const box = marker.getPopup().getElement();
    box.querySelector('.leaflet-popup-close-button').setAttribute('aria-label', 'Закрыть окно остановки');
    const origin = view.popupReturn;
    const activeAtOpen = document.activeElement;
    // Let Leaflet finish laying out the popup and the original activation event finish.
    requestAnimationFrame(() => {
      if (!marker.isPopupOpen() || view.popupReturn !== origin) return;
      if (document.activeElement !== activeAtOpen && document.activeElement !== origin.element) return;
      const link = box.querySelector('.map-popup-actions a');
      if (link) {
        view.element.scrollIntoView({block:'nearest', behavior:'instant'});
        link.focus({preventScroll:true});
      }
    });
  }

  function closePopupFromControl(view, event) {
    const escape = event.type === 'keydown' && event.key === 'Escape';
    const closeButton = event.type === 'click' && event.target.closest('.leaflet-popup-close-button');
    if ((!escape && !closeButton) || !event.target.closest('.leaflet-popup')) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = view.popupReturn;
    view.map.closePopup();
    if (origin?.element.isConnected) {
      origin.element.focus({preventScroll:true});
      window.scrollTo({top:origin.y, behavior:'instant'});
    }
  }

  function draw(view) {
    const L = window.L;
    view.layer.clearLayers();
    view.markers.clear();
    const bounds = view.routes.flatMap(route => [route.startPoint, ...route.stops].map(point => point.coords));
    if (!bounds.length) return;
    view.map.fitBounds(bounds, {padding:[28,28], maxZoom:15, animate:false});
    for (const route of view.routes) {
      const line = [route.startPoint, ...route.stops].map(point => point.coords);
      L.polyline(line, {color:route.color, weight:3, dashArray:'5 5', interactive:false}).addTo(view.layer);
      for (const entry of stopsFor(route, view.routes.length === 1)) {
        const {point, label, description} = entry;
        const name = `${route.number} · ${description} · ${titleOf(point)}`;
        const icon = L.divIcon({className:'custom-route-pin',
          html:`<div style="width:26px;height:26px;display:grid;place-items:center;background:${point.id ? html(route.color) : '#141413'};color:white;border:1.5px solid white;border-radius:3px;font:600 12px sans-serif">${label}</div>`,
          iconSize:[26,26], iconAnchor:[13,13], popupAnchor:[0,-13]});
        const marker = L.marker(point.coords, {icon, title:name, alt:name});
        marker.on('add', () => {
          const element = marker.getElement();
          element.setAttribute('aria-label', name);
          element.id = pinId(view, route, point);
          element.addEventListener('keydown', event => {
            if (event.key === ' ') {
              event.preventDefault();
              marker.togglePopup();
            }
          });
        });
        marker.addTo(view.layer);
        marker.bindPopup(() => popup(entry), {
          maxWidth:256, maxHeight:view.element.clientHeight - 68,
          autoPanPaddingTopLeft:[52,8], autoPanPaddingBottomRight:[8,30]
        });
        marker.on('popupopen', () => {
          view.popupReturn = view.listOrigin || {element:marker.getElement(), y:window.scrollY};
          focusPopup(view, marker);
        });
        if (point.id) view.markers.set(point.id, marker);
      }
    }
  }

  function release(view) {
    clearTimeout(view.tileTimer);
    if (view.map) view.map.remove();
    view.map = view.layer = null;
    view.markers.clear();
  }

  async function activate(view) {
    if (view.busy || view.failed || view.map || view.disposed || location.protocol === 'file:') return;
    view.busy = true;
    let assetsReady = false;
    try {
      await Promise.all([resource('leaflet.css'), resource('leaflet.js')]);
      assetsReady = true;
      if (view.disposed || !view.visible || !view.element.isConnected || !view.element.getClientRects().length) return;
      const canvas = document.createElement('div');
      canvas.className = 'map-canvas';
      canvas.setAttribute('role', 'group');
      canvas.setAttribute('aria-label', view.element.getAttribute('aria-label') || 'Карта остановок');
      const focused = view.element.contains(document.activeElement) ? document.activeElement : null;
      view.element.replaceChildren(canvas);
      const L = window.L;
      const map = view.map = L.map(canvas, {scrollWheelZoom:false, zoomControl:false});
      map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
      canvas.addEventListener('keydown', event => closePopupFromControl(view, event), true);
      canvas.addEventListener('click', event => closePopupFromControl(view, event), true);
      L.control.zoom({zoomInTitle:'Приблизить', zoomOutTitle:'Отдалить'}).addTo(map);
      view.layer = L.layerGroup().addTo(map);
      draw(view);
      if (focused) (document.getElementById(focused.id) || canvas).focus({preventScroll:true});
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom:19});
      let failed = false;
      function fallback() {
        if (view.map !== map) return;
        const active = document.activeElement;
        const wasFocused = view.element.contains(active);
        const origin = active.closest('.leaflet-popup') ? view.popupReturn?.element : active;
        release(view);
        view.failed = 'Не загрузилась карта улиц. Показана схема остановок.';
        diagram(view);
        if (wasFocused) {
          const target = document.getElementById(origin?.id) || view.element.querySelector('[data-map-retry]');
          target?.focus({preventScroll:true});
        }
      }
      tiles.on('loading', () => {
        clearTimeout(view.tileTimer);
        failed = false;
        view.tileTimer = setTimeout(fallback, 12000);
      });
      tiles.on('tileerror', () => { failed = true; });
      tiles.on('load', () => {
        clearTimeout(view.tileTimer);
        if (failed) queueMicrotask(fallback);
      });
      tiles.addTo(map);
    } catch (error) {
      if (!view.disposed) {
        release(view);
        view.failed = assetsReady ? 'Не удалось отобразить карту улиц. Показана схема остановок.' : 'Не загрузилась карта улиц. Показана схема остановок.';
        if (assetsReady) console.error('Не удалось отобразить карту улиц', error);
        diagram(view);
      }
    } finally {
      view.busy = false;
    }
  }

  function makeView(element, visibleRoutes) {
    const view = {element, routes:visibleRoutes, markers:new Map()};
    diagram(view);
    if (location.protocol === 'file:') return view;
    if ('IntersectionObserver' in window) {
      view.observer = new IntersectionObserver(([entry]) => {
        view.visible = entry.isIntersecting;
        if (view.visible) activate(view);
      });
      view.observer.observe(element);
    }
    return view;
  }

  function renderHome() {
    home.routes = selectedRoute === 'all' ? routes : routes.filter(r => r.id === Number(selectedRoute));
    const entries = home.routes.flatMap(r => stopsFor(r, false));
    const route = home.routes[0];
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
    if (home.map) draw(home); else diagram(home);
  }

  function initHome() {
    const map = document.getElementById('cityMap');
    if (home || !map) return;
    const toolbar = document.getElementById('mapRouteFilters');
    toolbar.innerHTML = `<button type="button" class="map-filter-btn active" data-map-route="all" aria-pressed="true">Все маршруты</button>` +
      routes.map(r => `<button type="button" class="map-filter-btn" data-map-route="${r.id}" aria-pressed="false"><span class="route-dot" style="background:${html(r.color)}"></span>${html(r.number)} · ${html(r.shortTitle)}</button>`).join('');
    home = makeView(map, routes);
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
    document.getElementById('mapStopsList').addEventListener('click', e => {
      const link = e.target.closest('[data-focus-stop]');
      const marker = home.markers.get(link?.dataset.focusStop);
      if (!marker || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      link.parentElement.querySelectorAll('.active').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
      home.listOrigin = {element:link, y:window.scrollY};
      if (marker.isPopupOpen()) marker.closePopup();
      home.map.setView(marker.getLatLng(), 15, {animate:false});
      marker.openPopup();
      home.listOrigin = null;
    });
  }

  function leaveRoute() {
    if (!detail) return;
    detail.disposed = true;
    detail.observer?.disconnect();
    release(detail);
    detail = null;
  }

  function mountRoute(route) {
    leaveRoute();
    const element = document.getElementById('routeMiniMap');
    if (element) {
      detail = {element, routes:[route], markers:new Map()};
      diagram(detail);
    }
  }

  function showHome() {
    if (home?.map) {
      home.map.closePopup();
      home.map.invalidateSize();
    }
  }

  function navigationOrigin(link) {
    if (!link?.matches('.map-popup-btn')) return null;
    return (home?.element.contains(link) ? home : detail)?.popupReturn;
  }

  function restoreDetailOrigin(saved) {
    if (!detail) return;
    detail.map?.closePopup();
    const target = document.getElementById(saved.linkId) ||
      detail.element.querySelector(`a[href="${CSS.escape(saved.href)}"]`) ||
      document.getElementById('anchor-route-map');
    target.focus({preventScroll:true});
    window.scrollTo({top:saved.y, behavior:'instant'});
  }

  window.GuideMaps = {initHome, mountRoute, leaveRoute, showHome, pointUrl, walkingUrl, navigationOrigin, restoreDetailOrigin};
})();
