/* 足立区Webハザードマップ 地図アプリ本体（吉田町Webハザードマップ住民向け画面をもとに作成） */
(function () {
  "use strict";
  const CFG = window.WHM_CONFIG;
  const I = window.WHM_I18N;
  const t = I.t;
  const { AREA, CATEGORIES, LEGENDS, legendOf, colorOf, legendByRgb } = window.WHM_LAYERS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const HAS_GKEY = !!(CFG.GOOGLE_MAPS_API_KEY && CFG.GOOGLE_MAPS_API_KEY.trim());

  /* ================================================================ 状態 */
  const state = {
    cat: "eq",
    active: {},            // カテゴリID → Set(レイヤーID)
    opacity: 0.3,          // 透過率
    mask: true,
    shelters: true,
    sheltersAll: false,
    hinanjo: true,
    boundary: true,
    basemap: "pale",
    elev: false,
  };
  CATEGORIES.forEach((c) => { state.active[c.id] = new Set(c.defaults); });
  const hashCat = location.hash.replace("#", "");
  if (CATEGORIES.some((c) => c.id === hashCat)) state.cat = hashCat;

  /* ================================================================ 地図 */
  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
    minZoom: 11,
    maxZoom: 18,
    maxBounds: CFG.maxBounds,
    attributionControl: true,
  }).setView(CFG.center, CFG.zoom);
  map.attributionControl.setPrefix(false);
  L.control.zoom({ position: "topleft" }).addTo(map);
  L.control.scale({ imperial: false, position: "bottomright", maxWidth: 140 }).addTo(map);
  // 縮尺が小さいときは指定避難所のアイコンを点にして、地図を見やすくする
  const syncZoomClass = () => document.body.classList.toggle("zoom-low", map.getZoom() < 15);
  map.on("zoomend", syncZoomClass);
  syncZoomClass();

  map.createPane("maskPane").style.zIndex = 420;
  map.getPane("maskPane").style.pointerEvents = "none";
  map.createPane("linePane").style.zIndex = 430;
  map.getPane("linePane").style.pointerEvents = "none";
  const canvasHazard = L.canvas({ padding: 0.3 });
  const canvasLine = L.canvas({ pane: "linePane", padding: 0.3 });
  const canvasMask = L.canvas({ pane: "maskPane", padding: 0.3 });

  /* ---- 背景地図 ---- */
  const gsiAttr = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
  const BASEMAPS = {
    pale: { label: "bm_pale", thumb: "pale", make: () => L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", { maxNativeZoom: 18, maxZoom: 18, attribution: gsiAttr }) },
    std: { label: "bm_std", thumb: "std", make: () => L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", { maxNativeZoom: 18, maxZoom: 18, attribution: gsiAttr }) },
    photo: { label: "bm_photo", thumb: "photo", make: () => L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", { maxNativeZoom: 18, maxZoom: 18, attribution: gsiAttr }) },
    gmap: { label: "bm_gmap", thumb: "gmap", google: "roadmap" },
    gsat: { label: "bm_gsat", thumb: "gsat", google: "hybrid" },
  };
  let baseLayer = null;
  let gmapsPromise = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  /* Google Maps JavaScript API と GoogleMutant（Leaflet 上に Google 地図を表示する公式API利用のプラグイン）を読み込む */
  function loadGoogle() {
    if (!HAS_GKEY) return Promise.reject(new Error("no key"));
    if (gmapsPromise) return gmapsPromise;
    gmapsPromise = new Promise((resolve, reject) => {
      window.__whmGmapsReady = resolve;
      const p = new URLSearchParams({
        key: CFG.GOOGLE_MAPS_API_KEY.trim(), language: I18N[I.lang].gmapLang, region: "JP",
        loading: "async", callback: "__whmGmapsReady",
      });
      loadScript("https://maps.googleapis.com/maps/api/js?" + p.toString()).catch(reject);
    }).then(() => loadScript("https://unpkg.com/leaflet.gridlayer.googlemutant@0.14.1/dist/Leaflet.GoogleMutant.js"));
    return gmapsPromise;
  }

  async function setBasemap(id) {
    const def = BASEMAPS[id];
    if (!def) return;
    if (def.google && !HAS_GKEY) return;
    let layer;
    if (def.google) {
      try {
        await loadGoogle();
        layer = L.gridLayer.googleMutant({ type: def.google, maxZoom: 18 });
      } catch (e) {
        toast(t("searchError"));
        return;
      }
    } else {
      layer = def.make();
    }
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = layer.addTo(map);
    baseLayer.bringToBack();
    state.basemap = id;
    renderBasemapUI();
  }

  function renderBasemapUI() {
    $("bmBtn").className = "map-btn bm-btn thumb-" + BASEMAPS[state.basemap].thumb;
    $("bmLabel").textContent = t(BASEMAPS[state.basemap].label);
    $("bmMenu").innerHTML = `<div class="bm-title">${esc(t("basemap"))}</div>` + Object.entries(BASEMAPS).map(([id, d]) => {
      const disabled = d.google && !HAS_GKEY;
      return `<button type="button" class="bm-item${id === state.basemap ? " on" : ""}" data-bm="${id}" ${disabled ? "disabled" : ""}>
        <span class="bm-thumb thumb-${d.thumb}"></span><span>${esc(t(d.label))}${disabled ? `<small>${esc(t("bm_needKey"))}</small>` : ""}</span></button>`;
    }).join("");
  }
  $("bmBtn").addEventListener("click", (e) => { e.stopPropagation(); $("bmMenu").hidden = !$("bmMenu").hidden; });
  $("bmMenu").addEventListener("click", (e) => {
    const b = e.target.closest("[data-bm]");
    if (b && !b.disabled) { setBasemap(b.dataset.bm); $("bmMenu").hidden = true; }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".map-btns")) $("bmMenu").hidden = true; });

  /* ================================================================ データ */
  const cache = {};
  function loadData(file) {
    if (!cache[file]) {
      cache[file] = fetch(`data/${file}.geojson`).then((r) => {
        if (!r.ok) throw new Error(file);
        return r.json();
      }).then((gj) => { gj.features.forEach((f) => { f.bbox = bboxOf(f.geometry); }); return gj; });
    }
    return cache[file];
  }
  function bboxOf(g) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const walk = (c) => {
      if (typeof c[0] === "number") { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; }
      else c.forEach(walk);
    };
    walk(g.coordinates);
    return [x0, y0, x1, y1];
  }
  function ringContains(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function polyContains(poly, x, y) {
    if (!ringContains(poly[0], x, y)) return false;
    for (let k = 1; k < poly.length; k++) if (ringContains(poly[k], x, y)) return false;
    return true;
  }
  function featureContains(f, x, y) {
    const b = f.bbox;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
    const g = f.geometry;
    if (g.type === "Polygon") return polyContains(g.coordinates, x, y);
    if (g.type === "MultiPolygon") return g.coordinates.some((p) => polyContains(p, x, y));
    return false;
  }

  /* ================================================================ 想定区域レイヤー */
  const areaLayers = {}; // レイヤーID → L.GeoJSON
  function fillOpacity() { return 1 - state.opacity; }

  function styleFor(id) {
    const def = AREA[id];
    return (f) => {
      const v = def.fixed ? def.fixed : f.properties[def.prop];
      const lg = colorOf(id, v);
      if (!lg || lg.color === "transparent") return { stroke: false, fill: false };
      if (def.legend === "rank5") {
        return { color: "#ffffff", weight: 0.4, opacity: 0.6, fillColor: lg.color, fillOpacity: fillOpacity() };
      }
      return { stroke: false, fillColor: lg.color, fillOpacity: fillOpacity() };
    };
  }

  const portalAttr = '<a href="https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html" target="_blank" rel="noopener">ハザードマップポータルサイト</a>';
  function setAreaStyle(id) {
    const lyr = areaLayers[id];
    if (!lyr) return;
    if (AREA[id].tile) lyr.setOpacity(fillOpacity());
    else lyr.setStyle(styleFor(id));
  }
  async function ensureArea(id) {
    if (areaLayers[id]) return areaLayers[id];
    const def = AREA[id];
    if (def.tile) {
      // ハザードマップポータルサイトの配信タイル（z2〜17。それより拡大したときは z17 を引き伸ばす）
      areaLayers[id] = L.tileLayer(def.tile, { maxNativeZoom: 17, maxZoom: 18, minZoom: 2, opacity: fillOpacity(),
        crossOrigin: "anonymous", attribution: portalAttr, className: "hz-tile", zIndex: 5 });
      return areaLayers[id];
    }
    const gj = await loadData(def.file);
    areaLayers[id] = L.geoJSON(gj, { style: styleFor(id), interactive: false, renderer: canvasHazard });
    return areaLayers[id];
  }

  function activeAreaIds() {
    return [...state.active[state.cat]].filter((id) => !AREA[id].preparing);
  }

  let syncToken = 0;
  async function syncAreas() {
    const token = ++syncToken;
    const want = activeAreaIds();
    for (const [id, lyr] of Object.entries(areaLayers)) {
      if (!want.includes(id) && map.hasLayer(lyr)) map.removeLayer(lyr);
    }
    if (want.length) document.body.classList.add("loading");
    try {
      // 土砂はイエロー→レッドの順に重ねる
      for (const id of want) {
        const lyr = await ensureArea(id);
        if (token !== syncToken) return;
        setAreaStyle(id);
        if (!map.hasLayer(lyr)) lyr.addTo(map);
      }
    } catch (e) {
      console.error(e);
      toast("data load error");
    } finally {
      if (token === syncToken) document.body.classList.remove("loading");
    }
    renderLegend();
  }

  /* ================================================================ 行政界・町外マスク */
  let boundaryLayer = null, maskLayer = null;
  async function initBoundary() {
    const [bd, mk] = await Promise.all([loadData("boundary"), loadData("mask")]);
    maskLayer = L.geoJSON(mk, { renderer: canvasMask, interactive: false,
      style: { stroke: false, fillColor: "#ffffff", fillOpacity: CFG.maskOpacity } });
    boundaryLayer = L.geoJSON(bd, { renderer: canvasLine, interactive: false,
      style: (f) => f.properties.name === CFG.townName
        ? { color: "#333", weight: 3.2, opacity: 0.85, fill: false, dashArray: "10 4 2 4" }
        : { color: "#666", weight: 1.6, opacity: 0.7, fill: false, dashArray: "6 4" } });
    syncCommon();
  }

  /* ================================================================ 避難場所 */
  let shelterLayer = null, shelterData = null;
  const HZ_KEYS = ["eq", "fire", "flood", "takashio", "naisui"];
  let shelterUsable = 0; // 選択中の災害に使える避難場所の数（0件のときツリーに注記）

  function currentShelterHz() {
    const cat = CATEGORIES.find((c) => c.id === state.cat);
    const ids = [...state.active[state.cat]];
    for (const id of ids) if (AREA[id].shelterHz) return AREA[id].shelterHz;
    return cat.shelterHz;
  }
  const ICON_SHELTER = '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M6 10v9h12v-9" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12.5" r="1.7" fill="#fff"/><path d="M12 14.5v4M10 16.5h4" stroke="#fff" stroke-width="1.6"/></svg>';
  const ICON_HINANJO = '<svg viewBox="0 0 24 24"><path d="M4 20V9l8-5 8 5v11z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M9 20v-6h6v6" fill="none" stroke="#fff" stroke-width="2"/><path d="M8 10.5h8" stroke="#fff" stroke-width="1.8"/></svg>';
  const ICON_TOWER ='<svg viewBox="0 0 24 24"><path d="M7 21L10 6h4l3 15" fill="none" stroke="#fff" stroke-width="2"/><path d="M6 6h12M8.5 13h7M7.6 17h8.8" stroke="#fff" stroke-width="1.8"/><path d="M12 2v4" stroke="#fff" stroke-width="2"/></svg>';
  const isTower = (p) => /津波避難タワー|避難タワー/.test(p.name);

  function shelterIcon(p, usable) {
    const cls = ["sh-ico", isTower(p) ? "tower" : "", usable ? "" : "ng", p.town ? "" : "out"].join(" ");
    return L.divIcon({ className: "", html: `<div class="${cls}">${isTower(p) ? ICON_TOWER : ICON_SHELTER}</div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });
  }

  function shelterPopup(f) {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const hz = currentShelterHz();
    const grid = HZ_KEYS.map((k) => `<li class="${p.ok[k] ? "ok" : "ng"}${k === hz ? " cur" : ""}"><span class="mk">${p.ok[k] ? "○" : "×"}</span>${esc(t("hz_" + k))}</li>`).join("");
    const route = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    return `<div class="pp pp-shelter">
      <div class="pp-title">${esc(p.name)}</div>
      <div class="pp-sub">${esc(isTower(p) ? t("towerIcon") : t("shelterIcon"))}${p.town ? "" : `<span class="tag-out">${esc(t("outsideTown"))}</span>`}</div>
      <dl>
        <dt>${esc(t("pp_address"))}</dt><dd>${esc(p.addr)}</dd>
        ${p.cap ? `<dt>${esc(t("pp_cap"))}</dt><dd>${esc(t("pp_persons", { n: p.cap.toLocaleString() }))}</dd>` : ""}
      </dl>
      <div class="pp-h">${esc(t("pp_suit"))}</div>
      <ul class="suit">${grid}</ul>
      <a class="route-btn" href="${route}" target="_blank" rel="noopener">${esc(t("pp_routeBtn"))}</a>
      <p class="pp-note">${esc(t("pp_routeNote"))}</p>
    </div>`;
  }

  async function syncShelters() {
    if (!shelterData) shelterData = await loadData("shelters");
    if (shelterLayer) map.removeLayer(shelterLayer);
    if (!state.shelters) { shelterLayer = null; return; }
    // shelterUsable はツリーの注記に使う
    const hz = currentShelterHz();
    shelterUsable = shelterData.features.filter((f) => f.properties.town && f.properties.ok[hz]).length;
    shelterLayer = L.layerGroup();
    shelterData.features.forEach((f) => {
      if (!f.properties.town) return; // 区外の避難場所は表示しない
      const usable = !!f.properties.ok[hz];
      if (!usable && !state.sheltersAll) return;
      const [lng, lat] = f.geometry.coordinates;
      const mk = L.marker([lat, lng], { icon: shelterIcon(f.properties, usable), title: f.properties.name, zIndexOffset: usable ? 100 : 0 });
      mk.bindPopup(() => shelterPopup(f), { maxWidth: 300, autoPanPaddingTopLeft: [10, 120] });
      shelterLayer.addLayer(mk);
    });
    shelterLayer.addTo(map);
    renderTree();
  }

  /* ================================================================ 指定避難所（区立小中学校等） */
  // data/hinanjo.geojson（東京都防災マップ 避難所一覧データ）。災害種別ごとの開設可否はデータに無いため、全カテゴリ共通で表示する
  const BF_KEYS = ["ev", "slope", "braille", "toilet"];
  let hinanjoLayer = null, hinanjoCount = 0;
  async function initHinanjo() {
    try {
      const gj = await loadData("hinanjo");
      hinanjoCount = gj.features.length;
      const icon = L.divIcon({ className: "", html: `<div class="sh-ico hinanjo">${ICON_HINANJO}</div>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] });
      hinanjoLayer = L.layerGroup(gj.features.map((f) => {
        const p = f.properties || {};
        const [lng, lat] = f.geometry.coordinates;
        const route = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
        return L.marker([lat, lng], { icon, title: p.name || "", zIndexOffset: -100 }).bindPopup(() => `<div class="pp pp-shelter">
          <div class="pp-title">${esc(p.name)}</div>
          <div class="pp-sub">${esc(t("hinanjo"))}</div>
          <dl><dt>${esc(t("pp_address"))}</dt><dd>${esc(p.addr)}</dd>
          ${p.bf && p.bf.length ? `<dt>${esc(t("pp_bf"))}</dt><dd>${p.bf.filter((k) => BF_KEYS.includes(k)).map((k) => esc(t("bf_" + k))).join("、")}</dd>` : ""}</dl>
          <p class="pp-note">${esc(t("hinanjoNote"))}</p>
          <a class="route-btn" href="${route}" target="_blank" rel="noopener">${esc(t("pp_routeBtn"))}</a>
          <p class="pp-note">${esc(t("pp_routeNote"))}</p></div>`, { maxWidth: 300, autoPanPaddingTopLeft: [10, 120] });
      }));
    } catch (e) { hinanjoCount = 0; hinanjoLayer = null; }
    syncCommon();
    renderTree();
    renderLegend();
  }

  function syncCommon() {
    if (maskLayer) state.mask ? maskLayer.addTo(map) : map.removeLayer(maskLayer);
    if (boundaryLayer) state.boundary ? boundaryLayer.addTo(map) : map.removeLayer(boundaryLayer);
    if (hinanjoLayer) state.hinanjo ? hinanjoLayer.addTo(map) : map.removeLayer(hinanjoLayer);
  }

  /* ================================================================ UI：カテゴリ */
  function renderCats() {
    $("cats").innerHTML = CATEGORIES.map((c) => `
      <label class="cat cat-${c.id}${c.id === state.cat ? " on" : ""}">
        <input type="radio" name="cat" value="${c.id}" ${c.id === state.cat ? "checked" : ""}>
        <span>${esc(t(c.label))}</span>
      </label>`).join("");
  }
  $("cats").addEventListener("change", (e) => {
    if (e.target.name !== "cat") return;
    setCategory(e.target.value);
  });
  function setCategory(id) {
    state.cat = id;
    history.replaceState(null, "", location.pathname + location.search + "#" + id);
    document.body.dataset.cat = id;
    renderCats();
    renderTree();
    map.closePopup();
    syncAreas();
    syncShelters();
  }

  /* ================================================================ UI：レイヤーツリー */
  function treeItem(id, mode) {
    const def = AREA[id];
    const checked = state.active[state.cat].has(id);
    const type = mode === "radio" ? "radio" : "checkbox";
    const sw = def.preparing ? "" : swatch(id);
    return `<li class="${def.preparing ? "disabled" : ""}">
      <label><input type="${type}" name="area" value="${id}" ${checked ? "checked" : ""} ${def.preparing ? "disabled" : ""}>
      ${sw}<span class="nm">${esc(t("L_" + id))}${def.preparing ? `<em class="prep">${esc(t("preparing"))}</em>` : ""}</span></label></li>`;
  }
  function swatch(id) {
    const lg = legendOf(id).filter((x) => x.color !== "transparent");
    if (!lg.length) return "";
    const stops = lg.map((x, i) => `${x.color} ${(i / lg.length) * 100}% ${((i + 1) / lg.length) * 100}%`).join(",");
    return `<span class="sw" style="background:linear-gradient(90deg,${stops})"></span>`;
  }

  function renderTree() {
    const cat = CATEGORIES.find((c) => c.id === state.cat);
    const hz = currentShelterHz();
    const noneItem = cat.mode === "radio" && cat.items.some((id) => !AREA[id].preparing)
      ? `<li><label><input type="radio" name="area" value="" ${state.active[state.cat].size ? "" : "checked"}><span class="sw sw-none"></span><span class="nm">${esc(t("none"))}</span></label></li>` : "";
    $("tree").innerHTML = `
      <details open class="grp"><summary>${esc(t("grp_area"))}</summary>
        <ul>${cat.items.map((id) => treeItem(id, cat.mode)).join("")}${noneItem}</ul>
        ${cat.note ? `<p class="tree-note">${esc(t(cat.note))}</p>` : ""}
      </details>
      <details open class="grp"><summary>${esc(t("grp_common"))}</summary>
        <ul>
          <li><label><input type="checkbox" data-common="shelters" ${state.shelters ? "checked" : ""}>
            <span class="ico-mini">${ICON_SHELTER}</span><span class="nm">${esc(t("shelters", { hz: t("hzWhen_" + hz) }))}</span></label>
            <ul class="sub"><li><label><input type="checkbox" data-common="sheltersAll" ${state.sheltersAll ? "checked" : ""} ${state.shelters ? "" : "disabled"}>
              <span class="ico-mini ng">${ICON_SHELTER}</span><span class="nm">${esc(t("sheltersAll"))}</span></label></li></ul>
            ${state.shelters && shelterData && !shelterUsable ? `<p class="tree-note">${esc(t("sheltersNone", { hz: t("hzWhen_" + hz) }))}</p>` : ""}</li>
          <li><label><input type="checkbox" data-common="hinanjo" ${state.hinanjo ? "checked" : ""}>
            <span class="ico-mini hinanjo">${ICON_HINANJO}</span><span class="nm">${esc(t("hinanjo"))}</span></label>
            ${hinanjoCount ? "" : `<p class="tree-note">${esc(t("hinanjoNone"))}</p>`}</li>
          <li><label><input type="checkbox" data-common="boundary" ${state.boundary ? "checked" : ""}>
            <span class="sw sw-boundary"></span><span class="nm">${esc(t("boundary"))}</span></label></li>
          <li><label><input type="checkbox" data-common="mask" ${state.mask ? "checked" : ""}>
            <span class="sw sw-mask"></span><span class="nm">${esc(t("mask"))}</span></label></li>
        </ul>
      </details>
      <p class="tree-hint">${esc(t("clickHint"))}</p>`;
  }

  $("tree").addEventListener("change", (e) => {
    const el = e.target;
    if (el.name === "area") {
      const cat = CATEGORIES.find((c) => c.id === state.cat);
      const set = state.active[state.cat];
      if (cat.mode === "radio") { set.clear(); if (el.value) set.add(el.value); }
      else el.checked ? set.add(el.value) : set.delete(el.value);
      map.closePopup();
      syncAreas();
      syncShelters();
      renderTree();
    } else if (el.dataset.common) {
      state[el.dataset.common] = el.checked;
      if (el.dataset.common === "shelters" || el.dataset.common === "sheltersAll") { syncShelters(); renderTree(); }
      else { syncCommon(); renderLegend(); }
    }
  });

  /* ---- 透過率 ---- */
  $("opacity").addEventListener("input", (e) => {
    state.opacity = +e.target.value / 100;
    $("opacityVal").textContent = e.target.value + "%";
    for (const id of Object.keys(areaLayers)) setAreaStyle(id);
  });

  /* ================================================================ UI：凡例 */
  function legendRows(id) {
    return legendOf(id).map((x) => {
      const box = x.color === "transparent"
        ? `<span class="lg-box empty"></span>`
        : `<span class="lg-box${x.hatch ? " hatch" : ""}" style="--c:${x.color};${x.line ? `border-color:${x.line}` : ""}"></span>`;
      return `<li>${box}${esc(x.label)}</li>`;
    }).join("");
  }
  function renderLegend() {
    const ids = activeAreaIds();
    const srcs = new Set();
    let html = "";
    if (!ids.length) html += `<p class="lg-empty">${esc(t("legendEmpty"))}</p>`;
    ids.forEach((id) => {
      srcs.add(AREA[id].src);
      html += `<div class="lg-sec"><div class="lg-h">${esc(t("L_" + id))}</div><ul>${legendRows(id)}</ul></div>`;
    });
    html += `<div class="lg-sec"><ul>
      <li><span class="sh-ico sm">${ICON_SHELTER}</span>${esc(t("shelterIcon"))}</li>
      ${state.sheltersAll ? `<li><span class="sh-ico sm ng">${ICON_SHELTER}</span>${esc(t("shelterNg"))}</li>` : ""}
      ${state.hinanjo && hinanjoCount ? `<li><span class="sh-ico sm hinanjo">${ICON_HINANJO}</span>${esc(t("hinanjo"))}</li>` : ""}
      <li><span class="lg-line town"></span>${esc(t("town"))}</li>
      <li><span class="lg-box" style="--c:#fff;border-color:#bbb"></span>${esc(t("outsideTown"))}</li>
    </ul></div>`;
    srcs.add("SRC_od");
    html += `<div class="lg-src">${esc(t("source"))}：${[...srcs].map((s) => esc(t(s))).join(" ／ ")}</div>`;
    $("legendBody").innerHTML = html;
  }
  $("legendBtn").addEventListener("click", () => { $("legend").hidden = !$("legend").hidden; $("legendBtn").classList.toggle("on", !$("legend").hidden); });
  $("legendClose").addEventListener("click", () => { $("legend").hidden = true; $("legendBtn").classList.remove("on"); });

  /* ================================================================ 標高（国土地理院 標高API） */
  const elevCache = new Map();
  async function getElevation(lat, lng) {
    const key = lat.toFixed(5) + "," + lng.toFixed(5);
    if (elevCache.has(key)) return elevCache.get(key);
    const url = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`;
    const p = fetch(url).then((r) => r.json()).then((j) => (typeof j.elevation === "number" ? j.elevation : null)).catch(() => null);
    elevCache.set(key, p);
    return p;
  }
  const fmtElev = (v) => (v == null ? t("pp_elevNA") : `${v.toFixed(1)} m`);

  /* 標高表示
   *  マウスのある端末（PC）… 地図上でマウスが指している位置の標高を、カーソル横と上部の枠に表示
   *  タッチ端末（スマホ等）… 地図中心に十字線を出し、中心の標高を表示（地図を動かして合わせる）
   */
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let elevTimer = null, elevSeq = 0, elevPoint = null, elevValue;
  function elevBoxHtml(label, val) {
    return `<span>${esc(t(label))}</span><b>${esc(val)}</b>`;
  }
  async function updateCenterElev() {
    if (!state.elev || canHover) return;
    const c = map.getCenter();
    const seq = ++elevSeq;
    $("elevBox").innerHTML = elevBoxHtml("elevCenter", "…");
    const v = await getElevation(c.lat, c.lng);
    if (state.elev && seq === elevSeq) $("elevBox").innerHTML = elevBoxHtml("elevCenter", fmtElev(v));
  }
  function renderPointerElev() {
    if (!state.elev || !canHover) return;
    if (!elevPoint) {
      $("elevBox").innerHTML = `<span>${esc(t("elevHover"))}</span>`;
      $("elevTip").hidden = true;
      return;
    }
    const txt = elevValue === undefined ? "…" : fmtElev(elevValue);
    $("elevBox").innerHTML = elevBoxHtml("elevPointer", txt);
    $("elevTip").textContent = `${t("pp_elev")} ${txt}`;
  }
  function updateElevDisplay() { canHover ? renderPointerElev() : updateCenterElev(); }
  // PC では標高の枠を地図の左上（拡大縮小ボタンの右）に置く。上部バーが2段に折り返しても地図の上端に合わせる
  function placeElevBox() {
    $("elevBox").style.top = canHover ? ($("map").offsetTop + 10) + "px" : "";
  }
  window.addEventListener("resize", () => { if (state.elev) placeElevBox(); });

  $("elevBtn").addEventListener("click", () => {
    state.elev = !state.elev;
    $("elevBtn").classList.toggle("on", state.elev);
    $("elevBox").hidden = !state.elev;
    $("crosshair").hidden = !state.elev || canHover;
    document.body.classList.toggle("elev-on", state.elev && canHover);
    placeElevBox();
    if (!state.elev) { $("elevTip").hidden = true; elevPoint = null; }
    updateElevDisplay();
  });
  map.on("moveend", () => { if (!canHover) { clearTimeout(elevTimer); elevTimer = setTimeout(updateCenterElev, 250); } });

  if (canHover) {
    map.on("mousemove", (e) => {
      if (!state.elev) return;
      // カーソル横の吹き出しはすぐ動かし、標高の取得はマウスが止まってから（API への問い合わせを減らす）
      const p = e.containerPoint, r = $("map").getBoundingClientRect(), main = document.querySelector(".main").getBoundingClientRect();
      const tip = $("elevTip");
      tip.style.left = (p.x + r.left - main.left + 14) + "px";
      tip.style.top = (p.y + r.top - main.top + 16) + "px";
      tip.hidden = false;
      elevPoint = e.latlng;
      elevValue = undefined;
      renderPointerElev();
      clearTimeout(elevTimer);
      const seq = ++elevSeq;
      elevTimer = setTimeout(async () => {
        const v = await getElevation(e.latlng.lat, e.latlng.lng);
        if (state.elev && seq === elevSeq) { elevValue = v; renderPointerElev(); }
      }, 200);
    });
    map.on("mouseout", () => { if (state.elev) { elevPoint = null; ++elevSeq; renderPointerElev(); } });
  }

  /* ================================================================ 地点情報（クリック） */
  const fmtNum = (v, d = 2) => (v == null || v === "" ? "-" : Number(v).toFixed(d));
  function describe(id, f) {
    const def = AREA[id];
    const p = f.properties;
    const lg = colorOf(id, def.fixed || p[def.prop]);
    switch (def.info) {
      case "risk": return [
        [t("pp_chome"), p.name], [t("pp_jiban"), p.jiban || "-"],
        [t("pp_rank_t"), t("rankRow", { n: p.t, o: p.to })],
        [t("pp_rank_b"), t("rankRow", { n: p.b, o: p.bo })],
        [t("pp_rank_f"), t("rankRow", { n: p.f, o: p.fo })],
        [t("pp_konnan"), fmtNum(p.k)],
      ];
    }
    return [];
  }

  /* ---- タイル画素の読み取り（ハザードマップポータルサイトのタイルから区分を求める） ---- */
  const tilePx = new Map();
  function tilePixels(url) {
    if (!tilePx.has(url)) {
      tilePx.set(url, new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const c = document.createElement("canvas"); c.width = c.height = 256;
            const g = c.getContext("2d", { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            resolve(g.getImageData(0, 0, 256, 256).data);
          } catch (e) { resolve(null); }
        };
        img.onerror = () => resolve(null); // タイルが無い＝想定区域外
        img.src = url;
      }));
    }
    return tilePx.get(url);
  }
  async function sampleTile(template, lat, lng, z) {
    const n = 2 ** z * 256, sn = Math.sin((lat * Math.PI) / 180);
    const px = Math.floor(((lng + 180) / 360) * n), py = Math.floor((0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * n);
    const url = template.replace("{z}", z).replace("{x}", px >> 8).replace("{y}", py >> 8);
    const d = await tilePixels(url);
    if (!d) return null;
    const o = ((py & 255) * 256 + (px & 255)) * 4;
    return d[o + 3] > 100 ? [d[o], d[o + 1], d[o + 2]] : null;
  }
  const INFO_LABEL = { depth: "pp_depth", dur: "pp_dur", col: "pp_col" };

  map.on("click", async (e) => {
    if (state.elev && e.originalEvent && e.originalEvent.target.closest && e.originalEvent.target.closest(".leaflet-marker-icon")) return;
    const { lat, lng } = e.latlng;
    const rows = [];
    const ids = activeAreaIds();
    for (const id of ids) {
      const titleRow0 = `<div class="pp-h">${esc(t("L_" + id))}</div>`;
      if (AREA[id].tile) {
        const lg = legendByRgb(id, await sampleTile(AREA[id].tile, lat, lng, Math.min(17, Math.max(12, Math.round(map.getZoom())))));
        rows.push(titleRow0 + (lg ? `<dl><dt>${esc(t(INFO_LABEL[AREA[id].info]))}</dt><dd>${esc(lg.label)}</dd></dl>` : `<p class="pp-out">${esc(t("pp_outside"))}</p>`));
        continue;
      }
      const gj = await loadData(AREA[id].file);
      const hits = gj.features.filter((f) => featureContains(f, lng, lat));
      // 区分コードが最大（＝最も危険側）のものを採用
      hits.sort((a, b) => (+b.properties[AREA[id].prop] || 0) - (+a.properties[AREA[id].prop] || 0));
      const titleRow = `<div class="pp-h">${esc(t("L_" + id))}</div>`;
      if (hits.length) rows.push(titleRow + "<dl>" + describe(id, hits[0]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") + "</dl>");
      else rows.push(titleRow + `<p class="pp-out">${esc(t("pp_outside"))}</p>`);
    }
    const popup = L.popup({ maxWidth: 300 }).setLatLng(e.latlng)
      .setContent(`<div class="pp"><div class="pp-title">${esc(t("pp_point"))}</div><dl><dt>${esc(t("pp_elev"))}</dt><dd class="elev">…</dd></dl>${rows.join("")}</div>`)
      .openOn(map);
    const v = await getElevation(lat, lng);
    const el = popup.getElement() && popup.getElement().querySelector(".elev");
    if (el) el.textContent = fmtElev(v);
  });

  /* ================================================================ 住所検索 */
  let searchMarker = null;
  async function geocodeGSI(q) {
    const r = await fetch("https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(q));
    const j = await r.json();
    const hit = j.find((x) => x.properties.title.includes(CFG.townName)) || j[0];
    return hit ? { lat: hit.geometry.coordinates[1], lng: hit.geometry.coordinates[0], label: hit.properties.title } : null;
  }
  async function geocodeGoogle(q) {
    await loadGoogle();
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const res = await new Geocoder().geocode({ address: q, region: "jp",
      bounds: CFG.searchBounds });
    const r = res.results && res.results[0];
    return r ? { lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), label: r.formatted_address } : null;
  }
  $("searchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    let q = $("searchInput").value.trim();
    if (!q) return;
    if (!q.includes(CFG.townName)) q = CFG.searchPrefix + q;
    try {
      let r = null;
      if (HAS_GKEY) { try { r = await geocodeGoogle(q); } catch (err) { r = null; } }
      if (!r) r = await geocodeGSI(q);
      if (!r) { toast(t("searchNoResult")); return; }
      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker([r.lat, r.lng], { zIndexOffset: 1000 })
        .bindTooltip(esc(r.label), { permanent: true, direction: "right", className: "search-label", offset: [10, -18] })
        .addTo(map);
      map.setView([r.lat, r.lng], 16);
      if (window.matchMedia("(max-width: 767px)").matches) $("searchBox").classList.remove("open");
    } catch (err) {
      console.error(err);
      toast(t("searchError"));
    }
  });
  $("searchToggle").addEventListener("click", () => {
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    $("searchBox").classList.toggle(mobile ? "open" : "closed");
  });

  /* ================================================================ その他ツール */
  $("fullBtn").addEventListener("click", () => map.fitBounds(CFG.homeBounds));
  $("printBtn").addEventListener("click", () => {
    $("printHead").textContent = `${t("title")}　${t(CATEGORIES.find((c) => c.id === state.cat).label)}　${activeAreaIds().map((id) => t("L_" + id)).join("／")}`;
    $("legend").hidden = false;
    setTimeout(() => window.print(), 300);
  });
  const LocateCtl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const b = L.DomUtil.create("a", "leaflet-bar-part locate-btn");
      const wrap = L.DomUtil.create("div", "leaflet-bar");
      wrap.appendChild(b);
      b.href = "#"; b.setAttribute("role", "button");
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2l7 19-7-4-7 4z" fill="currentColor"/></svg>';
      L.DomEvent.on(b, "click", (ev) => { L.DomEvent.preventDefault(ev); L.DomEvent.stopPropagation(ev); map.locate({ setView: true, maxZoom: 17 }); });
      this._btn = b;
      return wrap;
    },
  });
  const locateCtl = new LocateCtl().addTo(map);
  let locMarker = null;
  map.on("locationfound", (e) => {
    if (locMarker) map.removeLayer(locMarker);
    locMarker = L.layerGroup([
      L.circle(e.latlng, { radius: e.accuracy, color: "#1a73e8", weight: 1, fillOpacity: 0.1 }),
      L.circleMarker(e.latlng, { radius: 7, color: "#fff", weight: 2, fillColor: "#1a73e8", fillOpacity: 1 }),
    ]).addTo(map);
  });
  map.on("locationerror", (e) => toast(e.message));

  /* ---- 左パネル開閉・スマホ用シート ---- */
  $("sideToggle").addEventListener("click", () => {
    const open = document.body.classList.toggle("tree-closed");
    $("sideToggle").setAttribute("aria-expanded", String(!open));
  });
  $("sheetBtn").addEventListener("click", () => document.body.classList.toggle("sheet-open"));
  const CollapseCtl = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd() {
      const wrap = L.DomUtil.create("div", "leaflet-bar collapse-ctl");
      const b = L.DomUtil.create("a", "", wrap);
      b.href = "#"; b.setAttribute("role", "button"); b.innerHTML = "«";
      L.DomEvent.on(b, "click", (ev) => {
        L.DomEvent.preventDefault(ev); L.DomEvent.stopPropagation(ev);
        const c = document.body.classList.toggle("side-hidden");
        b.innerHTML = c ? "»" : "«";
        setTimeout(() => map.invalidateSize(), 220);
      });
      return wrap;
    },
  });
  new CollapseCtl().addTo(map);

  /* ---- トースト ---- */
  let toastTimer = null;
  function toast(msg) {
    $("toast").textContent = msg;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3500);
  }

  /* ================================================================ 言語切替 */
  function applyLanguage() {
    I.applyStatic();
    document.title = t("title");
    locateCtl._btn.title = t("locateBtn");
    renderCats();
    renderTree();
    renderLegend();
    renderBasemapUI();
    updateElevDisplay();
    map.closePopup();
    if (shelterLayer) syncShelters();
    if (window.WHM_APP) window.WHM_APP.onLanguage.forEach((fn) => fn(I.lang));
    const u = new URL(location.href);
    u.searchParams.set("lang", I.lang);
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }
  I.buildSelect($("langSel"), (l) => { I.setLang(l); applyLanguage(); });

  window.WHM_MAP = map; // デバッグ・印刷用
  /* 管理者画面（admin.js）から使う共通部品 */
  window.WHM_APP = { map, t, esc, toast, onLanguage: [] };
  /* ================================================================ 起動 */
  document.body.dataset.cat = state.cat;
  if (!window.matchMedia("(max-width: 767px)").matches) { $("legend").hidden = false; $("legendBtn").classList.add("on"); }
  applyLanguage();
  setBasemap("pale");
  initBoundary();
  initHinanjo();
  syncAreas();
  syncShelters();
  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    if (h !== state.cat && CATEGORIES.some((c) => c.id === h)) setCategory(h);
  });
})();
