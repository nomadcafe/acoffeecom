export type Locale = 'en' | 'ja' | 'zh';

export const LOCALE_STORAGE_KEY = 'ACoffee-meetup-locale';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ja', 'zh'];

/** Flat message keys → string. Use {{name}} for interpolation. */
export type MessageDict = Record<string, string>;

export const en: MessageDict = {
  'meta.title': 'A Coffee Meetup Finder',
  'seo.description':
    'Enter two addresses, see the midpoint on a map, and discover highly rated coffee shops nearby. Plan an easy meetup at a café that works for both of you.',
  'seo.keywords':
    'acoffee, acoffee.com, coffee meetup, cafe finder, halfway point, midpoint map, meet in the middle, coffee shop near me, two addresses, Google Maps, meetup planner, brunch spot',
  'seo.ogTitle': 'A Coffee Meetup Finder | Cafés halfway between two places',
  'seo.ogDescription':
    'Geocode two locations, find the midpoint, and browse top-rated coffee shops nearby on an interactive map.',
  'seo.ogLocale': 'en_US',
  'seo.twitterTitle': 'A Coffee Meetup Finder | Cafés halfway between two places',
  'seo.twitterDescription':
    'Geocode two locations, find the midpoint, and browse top-rated coffee shops nearby on an interactive map.',
  'seo.schemaName': 'A Coffee Meetup Finder',
  'seo.schemaDescription':
    'Find highly rated coffee shops near the geographic midpoint between two addresses using an interactive map.',

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
  'location.recentTitle': 'Recent searches',
  'location.useRecent': 'Use',
  'location.templatesTitle': 'Address templates',
  'location.saveA': 'Save A',
  'location.saveB': 'Save B',
  'location.templateToA': 'Use as A',
  'location.templateToB': 'Use as B',
  'location.removeTemplate': 'Remove',

  'list.loadingCoffee': 'Finding great coffee spots…',
  'list.loadingMeetup': 'Finding meetup spots…',
  'list.placeholderCoffee': 'Enter two locations above to find coffee spots at your meetup point.',
  'list.placeholderMeetup': 'Enter two locations above to find spots near your meetup midpoint.',
  'list.emptyCoffee': 'No highly-rated coffee spots found nearby.',
  'list.emptyMeetup': 'No highly-rated places found nearby.',
  'list.emptyHint': 'Try locations that are closer together, widen the radius, or lower the minimum rating.',
  'list.foundOneCoffee': '{{count}} coffee spot found',
  'list.foundManyCoffee': '{{count}} coffee spots found',
  'list.foundOneMeetup': '{{count}} place found',
  'list.foundManyMeetup': '{{count}} places found',
  'list.resultNoteCoffee': 'ACoffee returns up to 20 coffee spots per search.',
  'list.resultNoteMeetup': 'ACoffee returns up to 20 places per search for your meetup.',
  'list.fairnessExplain':
    'Fairness mode prioritizes places where A and B travel distances are closer to each other.',

  'card.favorite': 'Your Favorite!',
  'card.openMaps': 'Open in Google Maps',
  'card.reviews': '{{count}} reviews',
  'card.distanceA': 'Straight-line distance from location A',
  'card.distanceB': 'Straight-line distance from location B',
  'card.distanceM': 'Distance from the meetup midpoint (search radius is measured from here)',
  'card.distanceHint':
    'M = meetup midpoint (search center). A/B can be farther than your radius when the two addresses are far apart.',
  'card.fairnessGap': 'Fairness gap (|A-B|): {{gap}}',
  'card.openNow': 'Open Now',
  'card.closed': 'Closed',

  'filters.title': 'Optional filters',
  'filters.lead':
    'Built for <strong>coffee meetups</strong> by default. These settings apply the <strong>next</strong> time you tap <strong>Find Meetup Spot</strong> above — nothing here runs a search by itself.',
  'filters.minRating': 'Minimum rating',
  'filters.ratingDisplay': '{{value}} stars',
  'filters.radius': 'Search radius from midpoint',
  'filters.radiusHelp':
    'Google searches in a circle around the <strong>midpoint between A and B</strong>, not around each address. The A and B distances on each card are from each person, so they are often larger than this radius when A and B are far apart.',
  'filters.placeType': 'Meetup spot type',
  'filters.placeTypeHint':
    'Cafés are the default for coffee meetups. Switch when you plan a meal, drinks, or a stay — still centered on your midpoint.',
  'filters.placeCafe': 'Cafés & coffee shops',
  'filters.placeRestaurant': 'Restaurants',
  'filters.placeLodging': 'Hotels & lodging',
  'filters.placeBar': 'Bars & pubs',
  'filters.keywordCafe': 'Narrow cafés by name',
  'filters.sortMode': 'Sort results by',
  'filters.sortRating': 'Rating (default)',
  'filters.sortFairness': 'Fairness between A and B',
  'filters.sortHint': 'Fairness prioritizes places with a smaller distance gap between both people.',
  'filters.keywordPlaceholderCafe': 'e.g. espresso, brunch, roaster',
  'filters.keywordHintCafe':
    'Optional. Each word must appear in the café name (the map API has no free-text search). Leave empty or use “coffee” for all nearby cafés.',
  'filters.widenIntro': 'Too few results after searching?',
  'filters.loosen': 'Loosen filters only',
  'filters.widenHint':
    'Moves radius +1 km and minimum rating -0.5 (not below {{min}} stars). Then tap <strong>Find Meetup Spot</strong> again — this button does not search.',

  'map.loadError': 'Failed to load Google Maps. Please check your API key.',
  'map.loading': 'Loading map...',
  'map.midpoint': 'Midpoint',
  'map.infoRating': '{{rating}} stars ({{reviews}} reviews)',
  'map.openMaps': 'Open in Google Maps',
  'map.youHere': 'Your approximate location (browser)',
  'map.locateMe': 'My location',
  'map.locateMeAria': 'Center map on your approximate location',
  'map.locateDenied': 'Location unavailable. Allow access in the browser or try again.',
  'map.locateLoading': 'Getting location…',
  'map.searchingOnMapCoffee': 'Searching coffee spots…',
  'map.searchingOnMapMeetup': 'Searching meetup spots…',
  'map.savedNotInResults': 'Saved — not in current results',
  'map.savedInfoHint': 'Saved café (open the list star to remove)',

  'star.add': 'Add to favorites',
  'star.remove': 'Remove from favorites',

  'saved.title': 'Saved cafés',
  'saved.menuLabel': 'Saved',
  'saved.count': '{{count}} saved',
  'saved.empty':
    'Star a café in the search results below — it will show up here for quick access and maps links.',
  'saved.focusMap': 'Show on map',
  'saved.focusHint':
    'If a saved café is in your current search results, tap its row to focus it on the map and list.',
  'saved.notePlaceholder': 'Add a private note (quiet, outlets, etc.)',

  'changelog.metaTitle': 'Update log | A Coffee Meetup Finder',
  'changelog.metaDescription':
    'Product updates and UX changes for the coffee meetup finder — saved places, languages, and more.',
  'changelog.metaKeywords': 'acoffee, updates, changelog, coffee meetup',
  'changelog.ogTitle': 'Update log | A Coffee Meetup Finder',
  'changelog.ogDescription':
    'What changed recently: new features and improvements for finding cafés halfway between two places.',
  'changelog.twitterTitle': 'Update log | A Coffee Meetup Finder',
  'changelog.twitterDescription':
    'What changed recently in the coffee meetup finder — features and UX updates.',

  'changelog.pageTitle': 'Update log',
  'changelog.pageLead': 'Recent changes to this site, in your selected language.',
  'changelog.backHome': 'Back to finder',
  'changelog.navLink': 'What’s new',

  'bottomNav.aria': 'Site',
  'bottomNav.home': 'Finder',
  'bottomNav.bmacDisclaimer': 'ACoffee.com is not affiliated with buymeacoffee.com.',

  'share.title': 'Coffee meetup suggestions',
  'share.button': 'Share',
  'share.copied': 'Copied',
  'share.shared': 'Shared',
  'share.from': 'From',
  'share.to': 'To',

  'errors.bothAddresses': 'Please enter both addresses',
  'errors.mapNotLoaded': 'Map not loaded yet',
  'errors.generic': 'An error occurred',
  'errors.retry': 'Try again',
  'errors.dismiss': 'Dismiss',
};

export const ja: MessageDict = {
  'meta.title': 'A Coffee Meetup Finder（カフェ合流）',
  'seo.description':
    '2つの住所を入力すると中間地点を地図で表示し、その周辺の高評価カフェを見つけられます。待ち合わせ場所を簡単に決められます。',
  'seo.keywords':
    'カフェ 待ち合わせ, 中間地点, コーヒーショップ, 地図, 2地点, meet in the middle, Google Maps',
  'seo.ogTitle': 'A Coffee Meetup Finder | 2地点の中間カフェ検索',
  'seo.ogDescription':
    '2地点をジオコーディングし、中間地点周辺の高評価カフェを地図で探せます。',
  'seo.ogLocale': 'ja_JP',
  'seo.twitterTitle': 'A Coffee Meetup Finder | 2地点の中間カフェ検索',
  'seo.twitterDescription':
    '2地点をジオコーディングし、中間地点周辺の高評価カフェを地図で探せます。',
  'seo.schemaName': 'A Coffee Meetup Finder',
  'seo.schemaDescription':
    '2つの住所の中間地点近くで、高評価のカフェを地図から探せるWebアプリです。',

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
  'location.recentTitle': '最近の検索',
  'location.useRecent': '使う',
  'location.templatesTitle': '住所テンプレート',
  'location.saveA': 'Aを保存',
  'location.saveB': 'Bを保存',
  'location.templateToA': 'Aに使う',
  'location.templateToB': 'Bに使う',
  'location.removeTemplate': '削除',

  'list.loadingCoffee': 'カフェを探しています…',
  'list.loadingMeetup': '待ち合わせ候補を探しています…',
  'list.placeholderCoffee': '上で2か所を入力すると、中間地点周辺のカフェ候補を表示します。',
  'list.placeholderMeetup': '上で2か所を入力すると、中間地点周辺の候補を表示します。',
  'list.emptyCoffee': '条件に合う高評価のカフェが見つかりませんでした。',
  'list.emptyMeetup': '条件に合う高評価の場所が見つかりませんでした。',
  'list.emptyHint': '近い場所にする、検索半径を広げる、最低評価を下げる、などを試してください。',
  'list.foundOneCoffee': '{{count}}件のカフェが見つかりました',
  'list.foundManyCoffee': '{{count}}件のカフェが見つかりました',
  'list.foundOneMeetup': '{{count}}件の場所が見つかりました',
  'list.foundManyMeetup': '{{count}}件の場所が見つかりました',
  'list.resultNoteCoffee': 'ACoffee は1回の検索で最大20件のカフェを表示します。',
  'list.resultNoteMeetup': 'ACoffee は1回の検索で最大20件の場所を表示します（待ち合わせ用）。',
  'list.fairnessExplain': '公平モードは、A と B の移動距離差が小さい店を優先します。',

  'card.favorite': 'お気に入り！',
  'card.openMaps': 'Google マップで開く',
  'card.reviews': '口コミ {{count}} 件',
  'card.distanceA': '場所Aからの直線距離',
  'card.distanceB': '場所Bからの直線距離',
  'card.distanceM': '待ち合わせ中間地点からの距離（検索の基準はここです）',
  'card.distanceHint':
    'M＝待ち合わせの中間地点（検索の中心）。A/Bは人それぞれの距離のため、二人が離れていると検索半径より大きく表示されることがあります。',
  'card.fairnessGap': '公平差（|A-B|）: {{gap}}',
  'card.openNow': '営業中',
  'card.closed': '閉店',

  'filters.title': '詳細フィルター（任意）',
  'filters.lead':
    'デフォルトは<strong>カフェ待ち合わせ</strong>向けです。ここでの設定は、次に<strong>待ち合わせ地点を検索</strong>を押したときに使われます。入力だけでは検索は走りません。',
  'filters.minRating': '最低評価',
  'filters.ratingDisplay': '{{value}} つ星',
  'filters.radius': '中間地点からの検索半径',
  'filters.radiusHelp':
    'Googleの検索は<strong>AとBの中間地点</strong>を中心とした円の内側です。カード上のA/Bの距離はそれぞれの住所からの距離なので、二人が離れていると半径より大きく見えることがあります。',
  'filters.placeType': '待ち合わせの種類',
  'filters.placeTypeHint':
    '基本はカフェです。食事・飲み・宿泊に切り替えられます（検索の中心は中間地点のまま）。',
  'filters.placeCafe': 'カフェ・コーヒーショップ',
  'filters.placeRestaurant': 'レストラン',
  'filters.placeLodging': 'ホテル・宿泊',
  'filters.placeBar': 'バー・パブ',
  'filters.keywordCafe': 'カフェ名で絞り込み',
  'filters.sortMode': '並び順',
  'filters.sortRating': '評価（デフォルト）',
  'filters.sortFairness': 'A/B の公平さ',
  'filters.sortHint': '公平さは、二人の距離差が小さい店を優先します。',
  'filters.keywordPlaceholderCafe': '例：エスプレッソ、ブランチ、ロースター',
  'filters.keywordHintCafe':
    '任意。各語が店名に含まれるものだけ残します（地図 API は自由テキスト検索に非対応）。空欄または「coffee」で近くのカフェすべて。',
  'filters.widenIntro': '結果が少なすぎる場合',
  'filters.loosen': '条件だけ緩める',
  'filters.widenHint':
    '半径を +1 km、最低評価を -0.5（{{min}} 未満にはしません）。その後、もう一度<strong>待ち合わせ地点を検索</strong>を押してください。このボタン自体は検索しません。',

  'map.loadError': 'Google マップを読み込めませんでした。APIキーを確認してください。',
  'map.loading': '地図を読み込み中…',
  'map.midpoint': '中間地点',
  'map.infoRating': '評価 {{rating}}（口コミ {{reviews}} 件）',
  'map.openMaps': 'Google マップで開く',
  'map.youHere': 'おおよその現在地（ブラウザの位置情報）',
  'map.locateMe': '現在地',
  'map.locateMeAria': '地図の中心を現在地付近に移動',
  'map.locateDenied': '位置情報を取得できませんでした。ブラウザの許可を確認するか、もう一度お試しください。',
  'map.locateLoading': '位置を取得中…',
  'map.searchingOnMapCoffee': 'カフェを検索中…',
  'map.searchingOnMapMeetup': '候補を検索中…',
  'map.savedNotInResults': '保存済み（今の結果には含まれません）',
  'map.savedInfoHint': '保存したカフェ（一覧の星で解除）',

  'star.add': 'お気に入りに追加',
  'star.remove': 'お気に入りから外す',

  'saved.title': '保存したカフェ',
  'saved.count': '{{count}} 件',
  'saved.empty': '下の検索結果で星をタップすると、ここに保存され、すぐに地図へ飛べます。',
  'saved.focusMap': '地図で表示',
  'saved.focusHint': '保存した店が今の検索結果に含まれるとき、行をタップすると地図と一覧で強調表示されます。',
  'saved.notePlaceholder': 'メモを追加（静か、電源あり など）',

  'changelog.metaTitle': '更新ログ | カフェ面談ファインダー',
  'changelog.metaDescription':
    'カフェ面談ファインダーの機能・UI の更新履歴です（保存、言語、その他）。',
  'changelog.metaKeywords': 'acoffee, 更新, 変更履歴, カフェ',
  'changelog.ogTitle': '更新ログ | カフェ面談ファインダー',
  'changelog.ogDescription': '最近の変更内容：二人の中間付近のカフェを探すアプリの改善点。',
  'changelog.twitterTitle': '更新ログ | カフェ面談ファインダー',
  'changelog.twitterDescription': 'カフェ面談ファインダーの最近の機能・UI 更新。',

  'changelog.pageTitle': '更新ログ',
  'changelog.pageLead': '選択中の言語で表示しています。今後の変更もここに追記します。',
  'changelog.backHome': '検索に戻る',
  'changelog.navLink': '更新情報',

  'bottomNav.aria': 'サイト内メニュー',
  'bottomNav.home': '検索',
  'bottomNav.bmacDisclaimer':
    'ACoffee.com は buymeacoffee.com とは無関係です。',

  'share.title': 'カフェ候補を共有',
  'share.button': '共有',
  'share.copied': 'コピー済み',
  'share.shared': '共有しました',
  'share.from': '出発地A',
  'share.to': '出発地B',

  'errors.bothAddresses': '両方の住所を入力してください',
  'errors.mapNotLoaded': '地図の読み込みがまだ終わっていません',
  'errors.generic': 'エラーが発生しました',
  'errors.retry': '再試行',
  'errors.dismiss': '閉じる',
};

export const zh: MessageDict = {
  'meta.title': 'A Coffee Meetup Finder（咖啡见面）',
  'seo.description':
    '输入两个地址，在地图上查看中点并找到附近高评分咖啡店，快速决定双方都方便的会面地点。',
  'seo.keywords':
    '咖啡 见面, 中间点, 咖啡店, 地图, 两个地址, meet in the middle, Google Maps',
  'seo.ogTitle': 'A Coffee Meetup Finder | 两地中点咖啡店',
  'seo.ogDescription': '输入两地后自动计算中点，并在地图上展示附近高评分咖啡店。',
  'seo.ogLocale': 'zh_CN',
  'seo.twitterTitle': 'A Coffee Meetup Finder | 两地中点咖啡店',
  'seo.twitterDescription': '输入两地后自动计算中点，并在地图上展示附近高评分咖啡店。',
  'seo.schemaName': 'A Coffee Meetup Finder',
  'seo.schemaDescription': '帮助两个人根据中间地点快速找到合适咖啡店的 Web 应用。',

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
  'location.recentTitle': '最近搜索',
  'location.useRecent': '使用',
  'location.templatesTitle': '常用地址模板',
  'location.saveA': '保存 A',
  'location.saveB': '保存 B',
  'location.templateToA': '填入 A',
  'location.templateToB': '填入 B',
  'location.removeTemplate': '删除',

  'list.loadingCoffee': '正在查找咖啡好店…',
  'list.loadingMeetup': '正在查找会面地点…',
  'list.placeholderCoffee': '请先输入两个地点，以显示会面中点附近的咖啡候选。',
  'list.placeholderMeetup': '请先输入两个地点，以显示会面中点附近的候选地点。',
  'list.emptyCoffee': '附近没有找到符合条件的高评分咖啡地点。',
  'list.emptyMeetup': '附近没有找到符合条件的高评分地点。',
  'list.emptyHint': '可尝试让两地更近、扩大搜索半径或降低最低评分。',
  'list.foundOneCoffee': '找到 {{count}} 个咖啡地点',
  'list.foundManyCoffee': '找到 {{count}} 个咖啡地点',
  'list.foundOneMeetup': '找到 {{count}} 个地点',
  'list.foundManyMeetup': '找到 {{count}} 个地点',
  'list.resultNoteCoffee': 'ACoffee 每次搜索最多展示 20 个咖啡相关地点。',
  'list.resultNoteMeetup': 'ACoffee 每次搜索最多展示 20 个会面候选地点。',
  'list.fairnessExplain': '公平模式会优先展示 A 与 B 距离差更小的店。',

  'card.favorite': '已收藏！',
  'card.openMaps': '在 Google 地图中打开',
  'card.reviews': '{{count}} 条评价',
  'card.distanceA': '距 A 点的直线距离',
  'card.distanceB': '距 B 点的直线距离',
  'card.distanceM': '距会面中点的距离（搜索半径以此为准）',
  'card.distanceHint': 'M = 会面中点（搜索中心）。当两人距离较远时，A/B 距离可能大于搜索半径。',
  'card.fairnessGap': '公平差（|A-B|）：{{gap}}',
  'card.openNow': '营业中',
  'card.closed': '已打烊',

  'filters.title': '可选筛选',
  'filters.lead':
    '默认面向<strong>咖啡会面</strong>。这些设置会在你<strong>下一次</strong>点击<strong>查找会面点</strong>时生效；仅修改设置不会自动搜索。',
  'filters.minRating': '最低评分',
  'filters.ratingDisplay': '{{value}} 星',
  'filters.radius': '以中点为中心的搜索半径',
  'filters.radiusHelp':
    'Google 会以<strong>A 与 B 的中点</strong>为中心进行圆形搜索，而不是分别以两地为中心。卡片中的 A/B 距离是从各自地址计算，因此两人相距较远时，可能会大于该半径。',
  'filters.placeType': '会面地点类型',
  'filters.placeTypeHint':
    '默认是咖啡馆；可切换为聚餐、小酌或住宿，搜索仍以两地中点为中心。',
  'filters.placeCafe': '咖啡馆 / 咖啡店',
  'filters.placeRestaurant': '餐厅',
  'filters.placeLodging': '酒店 / 住宿',
  'filters.placeBar': '酒吧 / 餐吧',
  'filters.keywordCafe': '按店名筛选咖啡馆',
  'filters.sortMode': '结果排序方式',
  'filters.sortRating': '评分（默认）',
  'filters.sortFairness': 'A/B 公平度',
  'filters.sortHint': '公平度会优先显示两人距离差更小的店。',
  'filters.keywordPlaceholderCafe': '例如：espresso、brunch、手冲',
  'filters.keywordHintCafe':
    '可选。每个词都需在店名中出现（地图接口不支持自由文本搜索）。留空或填 coffee 表示不按名字筛选。',
  'filters.widenIntro': '搜索结果太少？',
  'filters.loosen': '仅放宽筛选条件',
  'filters.widenHint':
    '搜索半径 +1 km，最低评分 -0.5（不低于 {{min}} 星）。之后请再次点击<strong>查找会面点</strong>；此按钮本身不会触发搜索。',

  'map.loadError': 'Google 地图加载失败，请检查 API Key。',
  'map.loading': '地图加载中…',
  'map.midpoint': '中点',
  'map.infoRating': '{{rating}} 星（{{reviews}} 条评价）',
  'map.openMaps': '在 Google 地图中打开',
  'map.youHere': '大致位置（由浏览器定位）',
  'map.locateMe': '我的位置',
  'map.locateMeAria': '将地图中心移到你的大致位置',
  'map.locateDenied': '无法获取位置。请在浏览器中允许定位权限后重试。',
  'map.locateLoading': '正在获取位置…',
  'map.searchingOnMapCoffee': '正在搜索咖啡地点…',
  'map.searchingOnMapMeetup': '正在搜索会面地点…',
  'map.savedNotInResults': '已收藏（不在当前结果中）',
  'map.savedInfoHint': '已收藏的店（可在列表中取消星标）',

  'star.add': '加入收藏',
  'star.remove': '取消收藏',

  'saved.title': '已保存咖啡店',
  'saved.menuLabel': '已保存',
  'saved.count': '{{count}} 家',
  'saved.empty': '在下方搜索结果中点星标后，这里会保存该店，方便快速打开地图。',
  'saved.focusMap': '在地图中定位',
  'saved.focusHint': '若已保存店铺在当前搜索结果中，点击该行可在地图和列表中高亮。',
  'saved.notePlaceholder': '添加私人备注（安静、有插座等）',

  'changelog.metaTitle': '更新日志 | 咖啡会面查找',
  'changelog.metaDescription': '本站功能与界面更新说明（收藏、多语言等）。',
  'changelog.metaKeywords': 'acoffee, 更新, 日志, 咖啡',
  'changelog.ogTitle': '更新日志 | 咖啡会面查找',
  'changelog.ogDescription': '近期改动：帮助两人在中间位置找咖啡馆的小工具更新与优化。',
  'changelog.twitterTitle': '更新日志 | 咖啡会面查找',
  'changelog.twitterDescription': '咖啡会面查找的近期功能与界面更新。',

  'changelog.pageTitle': '更新日志',
  'changelog.pageLead': '以下内容随当前所选语言展示，后续更新会陆续记在这里。',
  'changelog.backHome': '返回查找',
  'changelog.navLink': '更新说明',

  'bottomNav.aria': '站内导航',
  'bottomNav.home': '查找',
  'bottomNav.bmacDisclaimer': 'ACoffee.com 与 buymeacoffee.com 无任何关联。',

  'share.title': '咖啡会面推荐',
  'share.button': '分享',
  'share.copied': '已复制',
  'share.shared': '已分享',
  'share.from': '出发地 A',
  'share.to': '出发地 B',

  'errors.bothAddresses': '请同时输入两个地址',
  'errors.mapNotLoaded': '地图尚未加载完成',
  'errors.generic': '发生错误',
  'errors.retry': '重试',
  'errors.dismiss': '关闭',
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
