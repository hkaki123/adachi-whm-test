/* 足立区Webハザードマップ 設定 */
window.WHM_CONFIG = {
  // Google Maps JavaScript API キー（Maps JavaScript API・Geocoding を有効化したもの）
  // 未設定でも地図は動作します（背景地図は地理院タイルのみ、住所検索は国土地理院APIを使用）。
  // 設定すると「Google 地図／Google 航空写真」の背景と Google の住所検索が使えます。
  GOOGLE_MAPS_API_KEY: "",

  // 区の名称（住所検索の補完・境界線の判定に使う）
  townName: "足立区",
  searchPrefix: "東京都足立区",

  // 初期表示（足立区役所付近）と全域表示の範囲
  center: [35.7752, 139.8046],
  zoom: 13,
  homeBounds: [[35.7386, 139.7357], [35.8177, 139.8588]],
  // 地図を動かせる範囲・Google 住所検索の優先範囲
  maxBounds: [[35.60, 139.55], [35.95, 140.05]],
  searchBounds: { south: 35.72, west: 139.71, north: 35.84, east: 139.88 },

  // 区外を淡く表示するマスクの不透明度
  maskOpacity: 0.45,

  // 対応言語（表示順）
  languages: ["ja", "en", "zh-Hans", "zh-Hant", "pt"],
};
