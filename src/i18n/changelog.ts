import type { Locale } from './messages';

/** URL path segment (without locale prefix). */
export const UPDATES_PATH = '/updatelog';

export type ChangelogEntry = {
  /** ISO date YYYY-MM-DD for sorting and display */
  isoDate: string;
  /** Short heading for this release (already localized) */
  title: string;
  bullets: string[];
};

/**
 * Changelog copy is maintained per locale so wording stays natural in each language.
 * Add new entries at the top of each array.
 */
export const changelogByLocale: Record<Locale, ChangelogEntry[]> = {
  en: [
    {
      isoDate: '2026-04-23',
      title: 'Interface refresh and onboarding',
      bullets: [
        'Thin sticky header (logo + menus only) replaces the tall gradient banner; the title and tagline move into a first-run hero so they only take space when new visitors actually need them.',
        'Paper / cream palette with warm card shadows — coffee brown is now an accent colour rather than a background.',
        'Two-input area redesigned as a single "trip card" with a swap button so you can exchange A and B in one click if you typed them in the wrong order.',
        'First-run onboarding: compact "Enter → Midpoint → Browse" 3-step strip, plus locale-aware one-tap example pairs that run a full demo search.',
        'Filters collapse to a one-line summary (e.g. "Cafés · 4.0★ · 1.2km") so you see the active settings without having to expand the panel.',
        'Fraunces serif display type on titles and a simplified A/B/M distance labelling on result cards for cleaner hierarchy.',
      ],
    },
    {
      isoDate: '2026-04-22',
      title: 'Nearby mode, standalone Passport page, and installable PWA',
      bullets: [
        '"Show coffee near me" search lets you skip A and B entirely and search directly around your location — IP-based approximate location on first load, precise browser geolocation on tap.',
        'Coffee Passport is now a full page at /passport with stat cards (cafés, visits, day streak, first stamp), a 90-day heatmap, and the existing shareable card. The header dropdown still works and links to the full page.',
        'The app is installable as a PWA (manifest + service worker); the shell and Passport are available offline.',
        'Filter state (radius, minimum rating, keyword, category, sort) now rides along in the URL, so a shared or bookmarked link reproduces the full search rather than just the two addresses.',
        'Mobile layout rework: the map fills the viewport and a draggable bottom sheet (peek / half / full) carries the search and results — the shape native map apps use.',
      ],
    },
    {
      isoDate: '2026-04-17',
      title: 'URL sharing, code quality, and bug fixes',
      bullets: [
        'Search state is now reflected in the URL (?a=…&b=…). Share or bookmark a link and recipients land on the same search automatically.',
        'Sort mode and starred shops now update the results list instantly — no re-search needed after changing sort order or starring a café.',
        'Removed a redundant Places API field request (photos) that was billed but never displayed, reducing API costs.',
        'List cards are now fully keyboard-navigable (Enter / Space to select).',
        'Translation strings with bold text are now rendered safely without dangerouslySetInnerHTML.',
      ],
    },
    {
      isoDate: '2026-04-10',
      title: 'Chinese, sharing, fairness, SEO, and navigation',
      bullets: [
        'Added Simplified Chinese (zh) alongside English and Japanese; each locale uses its own URL prefix (/en, /ja, /zh).',
        'Share your meetup suggestions via copy-link or the Web Share API where the browser supports it.',
        'Sort results by fairness to favour places where travel distance from A and from B are closer to each other; cards explain fairness and the A–B gap.',
        'SEO: canonical URLs and hreflang alternates so crawlers index the correct language for each page.',
        'Saved cafés moved into a header menu next to the language switcher; this update log and a fixed bottom bar make changes easier to find.',
      ],
    },
    {
      isoDate: '2026-03-22',
      title: 'Languages, favourites, and smarter address entry',
      bullets: [
        'English and Japanese UI with automatic locale detection and a header language switcher.',
        'Star cafés to save them with snapshots, private notes, and one-tap “Open in Google Maps”.',
        'Address autocomplete (Places), recent searches, and templates to reuse A/B addresses.',
      ],
    },
    {
      isoDate: '2026-03-08',
      title: 'Meetup finder core',
      bullets: [
        'Enter two addresses, geocode both, show the geographic midpoint on an interactive map, and search highly rated coffee shops nearby (Google Places).',
        'Optional filters: minimum rating, search radius around the midpoint, and keyword; results sorted by rating.',
        'Each result shows distances from A, from B, and from the meetup midpoint, with links to open the place in Google Maps.',
      ],
    },
  ],
  ja: [
    {
      isoDate: '2026-04-23',
      title: 'デザイン刷新とオンボーディング',
      bullets: [
        'ヘッダーを細いスティッキーバー（ロゴ + メニュー）に整理。タイトルとタグラインは初回訪問のヒーロー領域に移動し、必要なときだけスペースを使うようにしました。',
        '全体の配色を紙のクリーム系に変更。暖かみのあるカードシャドウを採用し、ブラウンはアクセント色としてのみ使用します。',
        '2 地点の入力欄を 1 つの「トリップカード」に統合し、A と B を 1 タップで入れ替えられるスワップボタンを追加しました。',
        '初回訪問者向けに「2か所入力 → 中間地点 → カフェ選択」の 3 ステップ表示と、言語ごとのワンタップの地点ペア例を追加し、デモ検索をすぐ体験できます。',
        'フィルターは折りたたみ時に要約行（例：「カフェ · 4.0★ · 1.2km」）を表示し、展開せずに現在の設定が確認できます。',
        'タイトル類に Fraunces（セリフ）を採用。結果カードの距離表示を簡素化し、視覚的な階層を整理しました。',
      ],
    },
    {
      isoDate: '2026-04-22',
      title: '「近くのカフェ」モード、パスポート独立ページ、PWA 対応',
      bullets: [
        '「近くのカフェを表示」ボタンで、A/B を入力せず現在地周辺だけを検索できます。初回表示は IP ベースの大まかな位置、タップで正確なブラウザ位置に切り替わります。',
        'コーヒーパスポートを独立ページ（/passport）化し、統計カード（店舗数・来店回数・連続日数・初回来店）、90 日ヒートマップ、共有カードをまとめて表示します。ヘッダーのドロップダウンもそのまま使え、全体ページへのリンクが付きます。',
        'PWA としてインストール可能に。マニフェスト + サービスワーカーを追加し、アプリシェルとパスポートはオフラインでも利用できます。',
        'フィルター状態（半径・最低評価・キーワード・カテゴリ・並び順）を URL に反映。リンクを共有すると、受け取った側も完全な検索状態で開けます。',
        'モバイルのレイアウトを刷新：地図を全画面化し、検索と結果をドラッグ可能なボトムシート（プレビュー / 半分 / 全画面）で表示します。ネイティブの地図アプリに近い操作感です。',
      ],
    },
    {
      isoDate: '2026-04-17',
      title: 'URL 共有・コード品質改善・バグ修正',
      bullets: [
        '検索状態が URL に反映されるようになりました（?a=…&b=…）。リンクを共有またはブックマークすると、開いた側も同じ検索結果が自動で表示されます。',
        '並び順の変更やカフェの星付け後、再検索なしで即座にリストが更新されるようになりました。',
        '表示されていなかった Places API の写真フィールドのリクエストを削除し、不要な API コストを削減しました。',
        'リスト上の各カードがキーボード（Enter・スペース）で操作できるようになりました。',
        '翻訳文中の太字テキストを dangerouslySetInnerHTML を使わずに安全にレンダリングするよう改善しました。',
      ],
    },
    {
      isoDate: '2026-04-10',
      title: '中国語・共有・公平性・SEO・ナビ',
      bullets: [
        '簡体字中国語（zh）を追加。英語・日本語と並び、URL は /en・/ja・/zh で言語ごとに分かれます。',
        'カフェ候補を共有：リンクのコピーや、対応ブラウザでは Web Share API で共有できます。',
        '結果を「公平性」で並べ替え可能。A・B それぞれからの距離の差が小さめの店を優先し、カード側に公平性の説明とギャップ表示があります。',
        'SEO：canonical と hreflang を整備し、クローラーが各ページの言語版を正しく関連付けできるようにしました。',
        '保存したカフェは言語切り替え横のヘッダーメニューへ。更新ログページと下部ナビで変更履歴へアクセスできます。',
      ],
    },
    {
      isoDate: '2026-03-22',
      title: '言語・お気に入り・住所入力の強化',
      bullets: [
        '英語・日本語 UI、ブラウザ言語の自動判定、ヘッダーからの言語切り替え。',
        '星でカフェを保存（スナップショット）、プライベートメモ、「Google マップで開く」へのワンタップ。',
        '住所のオートコンプリート（Places）、最近の検索、A/B 用テンプレートの保存・呼び出し。',
      ],
    },
    {
      isoDate: '2026-03-08',
      title: '面談ファインダーのコア機能',
      bullets: [
        '2 地点の住所をジオコーディングし、地図上に中間点を表示、その周辺の高評価カフェを Google Places で検索。',
        '最低評価・中間点からの検索半径・キーワードなどのフィルター。結果は評価順で並べ替え。',
        '各候補に A・B・中間点からの距離を表示し、Google マップで開けます。',
      ],
    },
  ],
  zh: [
    {
      isoDate: '2026-04-23',
      title: '界面刷新与引导优化',
      bullets: [
        '顶栏改为细高度粘性栏（Logo + 菜单），标题和 tagline 移至首次访问时的 hero 区域，只在需要时占用空间。',
        '整体配色换为纸感米色，搭配暖色卡片阴影；咖啡棕只作为强调色使用，不再充斥页面底色。',
        '两个地点的输入区域重新设计为一张"行程卡"，A 和 B 合并在同一个带边框的组内，中间增加一键交换按钮。',
        '首次访问新增三步说明（输入 → 中点 → 咖啡店）和按语言定制的示例地点，一键即可触发完整的演示搜索。',
        '筛选器折叠状态下直接显示当前参数摘要（例："咖啡店 · 4.0★ · 1.2km"），无需展开即可了解设置。',
        '标题类字体改为 Fraunces 衬线字体，结果卡片上的 A/B/M 距离标签精简，视觉层次更清晰。',
      ],
    },
    {
      isoDate: '2026-04-22',
      title: '"附近咖啡店"模式、护照独立页与 PWA',
      bullets: [
        '新增"显示附近咖啡店"一键搜索：无需输入 A/B 即可基于你的位置搜索。首次访问使用 IP 粗略定位，点击按钮后切换到浏览器精确定位。',
        '咖啡护照升级为独立页面（/passport），包含统计卡片（咖啡店数、到访次数、连续天数、首次打卡）、90 天热力图与可分享的护照卡。顶栏下拉菜单仍可使用，并带到完整页面的入口。',
        '支持 PWA 安装：添加 manifest 与 Service Worker，可从浏览器添加至主屏幕；应用外壳和护照数据支持离线访问。',
        '筛选参数（半径、最低评分、关键词、分类、排序）现在会同步到 URL，分享或收藏的链接可完整还原搜索状态。',
        '移动端布局调整：地图铺满视口，搜索和结果改由可拖拽的底部抽屉承载（收起 / 半屏 / 全屏），更接近原生地图应用的操作感。',
      ],
    },
    {
      isoDate: '2026-04-17',
      title: 'URL 分享、代码质量改善与问题修复',
      bullets: [
        '搜索状态现在会同步到 URL（?a=…&b=…），分享或收藏链接后，对方打开即可自动还原相同的搜索结果。',
        '更改排序方式或收藏咖啡店后，列表会即时更新，无需重新搜索。',
        '移除了从未展示但一直被计费的 Places API 照片字段请求，降低 API 成本。',
        '列表中的每张卡片现在支持键盘操作（Enter / 空格键选中）。',
        '翻译文本中的加粗内容改为安全渲染方式，不再使用 dangerouslySetInnerHTML。',
      ],
    },
    {
      isoDate: '2026-04-10',
      title: '简体中文、分享、公平性、SEO 与导航',
      bullets: [
        '新增简体中文界面，与英文、日文并列；各语言使用独立路径前缀（/en、/ja、/zh）。',
        '支持分享会面推荐：可复制链接，或在支持的浏览器中使用系统分享。',
        '结果可按「公平性」排序，优先两人路程更接近的店铺；卡片上附有公平性说明与 A/B 路程差提示。',
        'SEO：完善 canonical 与 hreflang，便于搜索引擎正确关联并收录各语言页面。',
        '「已保存」咖啡店移至顶栏菜单；本站提供更新日志页与底部导航，方便查看改动说明。',
      ],
    },
    {
      isoDate: '2026-03-22',
      title: '英文与日文界面、收藏与地址输入优化',
      bullets: [
        '英文与日文界面，支持浏览器语言检测，顶栏可切换语言。',
        '星标收藏咖啡店（快照）、私人备注，以及一键「在 Google 地图中打开」。',
        '地址自动补全（Places）、最近搜索记录，以及 A/B 地址模板保存与复用。',
      ],
    },
    {
      isoDate: '2026-03-08',
      title: '会面查找核心上线',
      bullets: [
        '输入两个地址并地理编码，在地图上展示两地中点，并基于 Google Places 搜索附近高评分咖啡馆。',
        '可选筛选：最低评分、以中点为圆心的搜索半径、关键词；结果默认按评分排序。',
        '每个结果展示距 A、距 B、距会面中点的直线距离，并可跳转 Google 地图查看店铺。',
      ],
    },
  ],
};

export function isUpdatesPath(logicalPath: string): boolean {
  return logicalPath === UPDATES_PATH || logicalPath.startsWith(`${UPDATES_PATH}/`);
}
