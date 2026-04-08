export type Locale = 'en' | 'ja' | 'zh';

export const LOCALE_STORAGE_KEY = 'ACoffee-meetup-locale';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ja', 'zh'];

/** Flat message keys → string. Use {{name}} for interpolation. */
export type MessageDict = Record<string, string>;

export const en: MessageDict = {
  'meta.title': 'A Coffee Meetup Finder',

  'app.logoAlt': 'A Coffee',
  'app.title': 'A Coffee Meetup Finder',
  'app.tagline': 'Find the perfect coffee spot between you and a friend',

  'lang.selectAria': 'Language',
  'lang.en': 'English',
  'lang.ja': '日本語',
  'lang.zh': '中文',

  'location.title': 'Find Your Coffee Meetup Spot',
  'location.subtitle':
    'Enter both addresses, then tap <strong>Find Meetup Spot</strong> — that runs the search.',
  'location.yourLocation': 'Your Location',
  'location.friendLocation': "Friend's Location",
  'location.placeholderA': 'e.g., Times Square, NYC',
  'location.placeholderB': 'e.g., Brooklyn Bridge, NYC',
  'location.findButton': 'Find Meetup Spot',
  'location.searching': 'Searching...',

  'list.loading': 'Finding the best coffee spots...',
  'list.placeholder': 'Enter two locations above to find coffee shops at your meetup point.',
  'list.empty': 'No highly-rated coffee shops found nearby.',
  'list.emptyHint': 'Try locations that are closer together.',
  'list.foundOne': '{{count}} coffee shop found',
  'list.foundMany': '{{count}} coffee shops found',
  'list.resultNote': 'Places API (New) returns up to 20 cafes per search.',

  'card.favorite': 'Your Favorite!',
  'card.openMaps': 'Open in Google Maps',
  'card.reviews': '{{count}} reviews',
  'card.distanceA': 'Straight-line distance from location A',
  'card.distanceB': 'Straight-line distance from location B',
  'card.distanceM': 'Distance from the meetup midpoint (search radius is measured from here)',
  'card.distanceHint':
    'M = meetup midpoint (search center). A/B can be farther than your radius when the two addresses are far apart.',
  'card.openNow': 'Open Now',
  'card.closed': 'Closed',

  'filters.title': 'Optional filters',
  'filters.lead':
    'These settings apply the <strong>next</strong> time you tap <strong>Find Meetup Spot</strong> above. Nothing here runs a search by itself.',
  'filters.minRating': 'Minimum rating',
  'filters.ratingDisplay': '{{value}} stars',
  'filters.radius': 'Search radius from midpoint',
  'filters.radiusHelp':
    'Google searches in a circle around the <strong>midpoint between A and B</strong>, not around each address. The A and B distances on each card are from each person, so they are often larger than this radius when A and B are far apart.',
  'filters.keyword': 'Keyword',
  'filters.sortMode': 'Sort results by',
  'filters.sortRating': 'Rating (default)',
  'filters.sortFairness': 'Fairness between A and B',
  'filters.sortHint': 'Fairness prioritizes places with a smaller distance gap between both people.',
  'filters.keywordPlaceholder': 'e.g. coffee, espresso, brunch',
  'filters.keywordHint': 'Passed to Google Places. Leave empty to use "coffee".',
  'filters.widenIntro': 'Too few results after searching?',
  'filters.loosen': 'Loosen filters only',
  'filters.widenHint':
    'Moves radius +1 km and minimum rating -0.5 (not below {{min}} stars). Then tap <strong>Find Meetup Spot</strong> again — this button does not search.',

  'map.loadError': 'Failed to load Google Maps. Please check your API key.',
  'map.loading': 'Loading map...',
  'map.midpoint': 'Midpoint',
  'map.infoRating': '{{rating}} stars ({{reviews}} reviews)',
  'map.openMaps': 'Open in Google Maps',

  'star.add': 'Add to favorites',
  'star.remove': 'Remove from favorites',

  'saved.title': 'Saved cafés',
  'saved.count': '{{count}} saved',
  'saved.empty':
    'Star a café in the search results below — it will show up here for quick access and maps links.',
  'saved.focusMap': 'Show on map',
  'saved.focusHint':
    'If a saved café is in your current search results, tap its row to focus it on the map and list.',

  'share.title': 'Coffee meetup suggestions',
  'share.button': 'Share',
  'share.from': 'From',
  'share.to': 'To',

  'errors.bothAddresses': 'Please enter both addresses',
  'errors.mapNotLoaded': 'Map not loaded yet',
  'errors.generic': 'An error occurred',
};

export const ja: MessageDict = {
  'meta.title': 'A Coffee Meetup Finder（カフェ合流）',

  'app.logoAlt': 'A Coffee',
  'app.title': 'A Coffee Meetup Finder',
  'app.tagline': '二人のちょうどいい場所で、カフェを見つけよう',

  'lang.selectAria': '言語',
  'lang.en': 'English',
  'lang.ja': '日本語',
  'lang.zh': '中文',

  'location.title': 'カフェの待ち合わせ場所を探す',
  'location.subtitle':
    '両方の住所を入力し、<strong>待ち合わせ地点を検索</strong>を押すと検索が実行されます。',
  'location.yourLocation': 'あなたの場所',
  'location.friendLocation': '相手の場所',
  'location.placeholderA': '例：東京都渋谷区…',
  'location.placeholderB': '例：東京都新宿区…',
  'location.findButton': '待ち合わせ地点を検索',
  'location.searching': '検索中…',

  'list.loading': 'カフェを探しています…',
  'list.placeholder': '上で2か所を入力すると、中間地点周辺のカフェを表示します。',
  'list.empty': '条件に合う高評価のカフェが見つかりませんでした。',
  'list.emptyHint': 'お互い近い場所を指定してみてください。',
  'list.foundOne': '{{count}}件のカフェが見つかりました',
  'list.foundMany': '{{count}}件のカフェが見つかりました',
  'list.resultNote': 'Places API（新）では1回の検索で最大20件まで返ります。',

  'card.favorite': 'お気に入り！',
  'card.openMaps': 'Google マップで開く',
  'card.reviews': '口コミ {{count}} 件',
  'card.distanceA': '場所Aからの直線距離',
  'card.distanceB': '場所Bからの直線距離',
  'card.distanceM': '待ち合わせ中間地点からの距離（検索の基準はここです）',
  'card.distanceHint':
    'M＝待ち合わせの中間地点（検索の中心）。A/Bは人それぞれの距離のため、二人が離れていると検索半径より大きく表示されることがあります。',
  'card.openNow': '営業中',
  'card.closed': '閉店',

  'filters.title': '詳細フィルター（任意）',
  'filters.lead':
    'ここでの設定は、次に<strong>待ち合わせ地点を検索</strong>を押したときに使われます。入力だけでは検索は走りません。',
  'filters.minRating': '最低評価',
  'filters.ratingDisplay': '{{value}} つ星',
  'filters.radius': '中間地点からの検索半径',
  'filters.radiusHelp':
    'Googleの検索は<strong>AとBの中間地点</strong>を中心とした円の内側です。カード上のA/Bの距離はそれぞれの住所からの距離なので、二人が離れていると半径より大きく見えることがあります。',
  'filters.keyword': 'キーワード',
  'filters.sortMode': '並び順',
  'filters.sortRating': '評価（デフォルト）',
  'filters.sortFairness': 'A/B の公平さ',
  'filters.sortHint': '公平さは、二人の距離差が小さい店を優先します。',
  'filters.keywordPlaceholder': '例：コーヒー、エスプレッソ、ブランチ',
  'filters.keywordHint': 'Google Places に渡します。空欄のときは「coffee」として扱います。',
  'filters.widenIntro': '結果が少なすぎる場合',
  'filters.loosen': '条件だけ緩める',
  'filters.widenHint':
    '半径を +1 km、最低評価を -0.5（{{min}} 未満にはしません）。その後、もう一度<strong>待ち合わせ地点を検索</strong>を押してください。このボタン自体は検索しません。',

  'map.loadError': 'Google マップを読み込めませんでした。APIキーを確認してください。',
  'map.loading': '地図を読み込み中…',
  'map.midpoint': '中間地点',
  'map.infoRating': '評価 {{rating}}（口コミ {{reviews}} 件）',
  'map.openMaps': 'Google マップで開く',

  'star.add': 'お気に入りに追加',
  'star.remove': 'お気に入りから外す',

  'saved.title': '保存したカフェ',
  'saved.count': '{{count}} 件',
  'saved.empty': '下の検索結果で星をタップすると、ここに保存され、すぐに地図へ飛べます。',
  'saved.focusMap': '地図で表示',
  'saved.focusHint': '保存した店が今の検索結果に含まれるとき、行をタップすると地図と一覧で強調表示されます。',

  'share.title': 'カフェ候補を共有',
  'share.button': '共有',
  'share.from': '出発地A',
  'share.to': '出発地B',

  'errors.bothAddresses': '両方の住所を入力してください',
  'errors.mapNotLoaded': '地図の読み込みがまだ終わっていません',
  'errors.generic': 'エラーが発生しました',
};

export const zh: MessageDict = {
  'meta.title': 'A Coffee Meetup Finder（咖啡见面）',

  'app.logoAlt': 'A Coffee',
  'app.title': 'A Coffee Meetup Finder',
  'app.tagline': '在你和朋友之间找到最合适的咖啡地点',

  'lang.selectAria': '语言',
  'lang.en': 'English',
  'lang.ja': '日本語',
  'lang.zh': '中文',

  'location.title': '查找你们的咖啡会面点',
  'location.subtitle':
    '输入双方地址，然后点击<strong>查找会面点</strong>即可开始搜索。',
  'location.yourLocation': '你的位置',
  'location.friendLocation': '朋友的位置',
  'location.placeholderA': '例如：东京站',
  'location.placeholderB': '例如：新宿站',
  'location.findButton': '查找会面点',
  'location.searching': '搜索中…',

  'list.loading': '正在查找优质咖啡店…',
  'list.placeholder': '请先输入两个地点，以显示会面中点附近的咖啡店。',
  'list.empty': '附近没有找到高评分咖啡店。',
  'list.emptyHint': '可以尝试把两个地点设得更接近一些。',
  'list.foundOne': '找到 {{count}} 家咖啡店',
  'list.foundMany': '找到 {{count}} 家咖啡店',
  'list.resultNote': 'Places API（新版）每次搜索最多返回 20 家咖啡店。',

  'card.favorite': '已收藏！',
  'card.openMaps': '在 Google 地图中打开',
  'card.reviews': '{{count}} 条评价',
  'card.distanceA': '距 A 点的直线距离',
  'card.distanceB': '距 B 点的直线距离',
  'card.distanceM': '距会面中点的距离（搜索半径以此为准）',
  'card.distanceHint': 'M = 会面中点（搜索中心）。当两人距离较远时，A/B 距离可能大于搜索半径。',
  'card.openNow': '营业中',
  'card.closed': '已打烊',

  'filters.title': '可选筛选',
  'filters.lead':
    '这些设置会在你<strong>下一次</strong>点击<strong>查找会面点</strong>时生效；仅修改设置不会自动搜索。',
  'filters.minRating': '最低评分',
  'filters.ratingDisplay': '{{value}} 星',
  'filters.radius': '以中点为中心的搜索半径',
  'filters.radiusHelp':
    'Google 会以<strong>A 与 B 的中点</strong>为中心进行圆形搜索，而不是分别以两地为中心。卡片中的 A/B 距离是从各自地址计算，因此两人相距较远时，可能会大于该半径。',
  'filters.keyword': '关键词',
  'filters.sortMode': '结果排序方式',
  'filters.sortRating': '评分（默认）',
  'filters.sortFairness': 'A/B 公平度',
  'filters.sortHint': '公平度会优先显示两人距离差更小的店。',
  'filters.keywordPlaceholder': '例如：coffee、espresso、brunch',
  'filters.keywordHint': '会传给 Google Places；留空则默认使用 “coffee”。',
  'filters.widenIntro': '搜索结果太少？',
  'filters.loosen': '仅放宽筛选条件',
  'filters.widenHint':
    '搜索半径 +1 km，最低评分 -0.5（不低于 {{min}} 星）。之后请再次点击<strong>查找会面点</strong>；此按钮本身不会触发搜索。',

  'map.loadError': 'Google 地图加载失败，请检查 API Key。',
  'map.loading': '地图加载中…',
  'map.midpoint': '中点',
  'map.infoRating': '{{rating}} 星（{{reviews}} 条评价）',
  'map.openMaps': '在 Google 地图中打开',

  'star.add': '加入收藏',
  'star.remove': '取消收藏',

  'saved.title': '已保存咖啡店',
  'saved.count': '{{count}} 家',
  'saved.empty': '在下方搜索结果中点星标后，这里会保存该店，方便快速打开地图。',
  'saved.focusMap': '在地图中定位',
  'saved.focusHint': '若已保存店铺在当前搜索结果中，点击该行可在地图和列表中高亮。',

  'share.title': '咖啡会面推荐',
  'share.button': '分享',
  'share.from': '出发地 A',
  'share.to': '出发地 B',

  'errors.bothAddresses': '请同时输入两个地址',
  'errors.mapNotLoaded': '地图尚未加载完成',
  'errors.generic': '发生错误',
};

export const messagesByLocale: Record<Locale, MessageDict> = {
  en,
  ja,
  zh,
};

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : ''
  );
}
