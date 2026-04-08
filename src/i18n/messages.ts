export type Locale = 'en' | 'ja';

export const LOCALE_STORAGE_KEY = 'ACoffee-meetup-locale';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ja'];

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

export const messagesByLocale: Record<Locale, MessageDict> = {
  en,
  ja,
};

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : ''
  );
}
