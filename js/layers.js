/* 足立区Webハザードマップ レイヤー・ツリー定義
 * 想定区域は「1つずつ選択（radio）」。
 * - ベクトル（data/*.geojson）… 地震に関する地域危険度（町丁目別）
 * - タイル（tile）……………… ハザードマップポータルサイトの洪水・高潮・家屋倒壊等氾濫想定区域の配信タイル
 *   タイルは地図クリック時に画素の色を凡例と照合して区分を求める（alias は境界のにじみ等で出る近い色）。
 * 配色はハザードマップポータルサイト（国の手引き）の配色にそろえる。
 */
(function () {
  const t = (k, v) => WHM_I18N.t(k, v);
  const m = (v) => v + "m";
  const lt = (v) => t("lt", { v });
  const ge = (v) => t("ge", { v });
  const rg = (a, b) => t("range", { a, b });
  const PORTAL = "https://disaportaldata.gsi.go.jp/raster/";

  /* ---- 凡例（区分コード → 色・ラベル） ---- */
  const LEGENDS = {
    // 洪水（6区分）
    depth6: () => [
      { c: 1, color: "#F7F5A9", label: lt(m(0.5)) },
      { c: 2, color: "#FFD8C0", label: rg(m(0.5), m(3.0)), alias: ["#F8E1A6"] },
      { c: 3, color: "#FFB7B7", label: rg(m(3.0), m(5.0)) },
      { c: 4, color: "#FF9191", label: rg(m(5.0), m(10)) },
      { c: 5, color: "#F285C9", label: rg(m(10), m(20)) },
      { c: 6, color: "#DC7ADC", label: ge(m(20)) },
    ],
    // 高潮（8区分）
    depth8: () => [
      { c: 1, color: "#FFFFB3", label: lt(m(0.3)) },
      { c: 2, color: "#F7F5A9", label: rg(m(0.3), m(0.5)) },
      { c: 3, color: "#F8E1A6", label: rg(m(0.5), m(1.0)) },
      { c: 4, color: "#FFD8C0", label: rg(m(1.0), m(3.0)) },
      { c: 5, color: "#FFB7B7", label: rg(m(3.0), m(5.0)) },
      { c: 6, color: "#FF9191", label: rg(m(5.0), m(10)) },
      { c: 7, color: "#F285C9", label: rg(m(10), m(20)) },
      { c: 8, color: "#DC7ADC", label: ge(m(20)) },
    ],
    // 浸水継続時間（7区分）
    duration: () => [
      { c: 1, color: "#A0D2FF", label: lt(t("h12")) },
      { c: 2, color: "#0041FF", label: rg(t("h12"), t("d1")) },
      { c: 3, color: "#FAF500", label: rg(t("d1"), t("d3")) },
      { c: 4, color: "#FF9900", label: rg(t("d3"), t("w1")) },
      { c: 5, color: "#FF2800", label: rg(t("w1"), t("w2")) },
      { c: 6, color: "#B40068", label: rg(t("w2"), t("w4")) },
      { c: 7, color: "#460064", label: ge(t("w4")) },
    ],
    col_hanran: () => [{ c: 1, color: "#FF0000", label: t("col_hanran") }],
    col_kagan: () => [{ c: 1, color: "#FF0000", label: t("col_shinshoku") }],
    // 地震に関する地域危険度（5段階）
    rank5: () => [
      { c: 1, color: "#FFF6CC", label: t("rank", { n: 1 }) },
      { c: 2, color: "#FFD966", label: t("rank", { n: 2 }) },
      { c: 3, color: "#FF9F40", label: t("rank", { n: 3 }) },
      { c: 4, color: "#EE4B2B", label: t("rank", { n: 4 }) },
      { c: 5, color: "#A50F2D", label: t("rank", { n: 5 }) },
    ],
  };

  /* ---- 想定区域レイヤー ---- */
  // file: data/{file}.geojson / prop: 区分を持つ属性 / tile: タイルURL / legend: LEGENDS のキー / src: 出典キー
  const tile = (path) => PORTAL + path + "/{z}/{x}/{y}.png";
  const AREA = {
    eq_total: { file: "eq_risk", prop: "t", legend: "rank5", src: "SRC_kikendo", info: "risk" },
    eq_bldg: { file: "eq_risk", prop: "b", legend: "rank5", src: "SRC_kikendo", info: "risk" },
    eq_fire: { file: "eq_risk", prop: "f", legend: "rank5", src: "SRC_kikendo", info: "risk" },
    flood_l2: { tile: tile("01_flood_l2_shinsuishin_data"), legend: "depth6", src: "SRC_portal_flood", info: "depth" },
    flood_kuni: { tile: tile("01_flood_l2_shinsuishin_kuni_data"), legend: "depth6", src: "SRC_portal_flood", info: "depth" },
    flood_l1: { tile: tile("01_flood_l1_shinsuishin_newlegend_data"), legend: "depth6", src: "SRC_portal_flood", info: "depth" },
    flood_dur: { tile: tile("01_flood_l2_keizoku_data"), legend: "duration", src: "SRC_portal_flood", info: "dur" },
    flood_hanran: { tile: tile("01_flood_l2_kaokutoukai_hanran_data"), legend: "col_hanran", src: "SRC_portal_flood", info: "col" },
    flood_kagan: { tile: tile("01_flood_l2_kaokutoukai_kagan_data"), legend: "col_kagan", src: "SRC_portal_flood", info: "col" },
    tk_depth: { tile: tile("03_hightide_l2_shinsuishin_data"), legend: "depth8", src: "SRC_portal_takashio", info: "depth" },
    naisui: { preparing: true },
  };

  /* ---- カテゴリ（上部タブ）とツリー ---- */
  // shelterHz: 避難場所の適否に使う災害種別
  const CATEGORIES = [
    { id: "eq", label: "cat_eq", mode: "radio", shelterHz: "eq",
      items: ["eq_total", "eq_bldg", "eq_fire"], defaults: ["eq_total"], note: "eqNote" },
    { id: "flood", label: "cat_flood", mode: "radio", shelterHz: "flood",
      items: ["flood_l2", "flood_kuni", "flood_l1", "flood_dur", "flood_hanran", "flood_kagan"],
      defaults: ["flood_l2"], note: "floodNote" },
    { id: "takashio", label: "cat_takashio", mode: "radio", shelterHz: "takashio",
      items: ["tk_depth"], defaults: ["tk_depth"] },
    { id: "naisui", label: "cat_naisui", mode: "radio", shelterHz: "naisui",
      items: ["naisui"], defaults: [], note: "naisuiNote" },
  ];

  function legendOf(id) {
    const def = AREA[id];
    return def && def.legend ? LEGENDS[def.legend]() : [];
  }
  function colorOf(id, value) {
    const def = AREA[id];
    if (def.fixed) return LEGENDS[def.legend]()[0];
    return LEGENDS[def.legend]().find((x) => x.c === value) || null;
  }
  /* タイル画素の色 [r,g,b] → 凡例の項目（最も近い色。離れすぎていれば null） */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function legendByRgb(id, rgb) {
    if (!rgb) return null;
    let best = null, bd = 1600;
    for (const x of legendOf(id)) {
      for (const c of [x.color, ...(x.alias || [])]) {
        const [r, g, b] = hex(c);
        const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
        if (d < bd) { bd = d; best = x; }
      }
    }
    return best;
  }

  window.WHM_LAYERS = { LEGENDS, AREA, CATEGORIES, legendOf, colorOf, legendByRgb };
})();
