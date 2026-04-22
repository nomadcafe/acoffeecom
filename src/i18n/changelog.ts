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
      title: 'A cleaner look',
      bullets: [
        'Smaller header and a paper-coloured background — the whole app feels lighter.',
        'A and B inputs are grouped into one card with a swap button.',
        'First-time visitors see a short "how it works" strip and one-tap example places to try.',
        'The filter panel shows current settings without needing to expand.',
        'New serif title font; result cards are a bit less noisy.',
      ],
    },
    {
      isoDate: '2026-04-22',
      title: 'Nearby mode, Passport page, install as an app',
      bullets: [
        'New "Show coffee near me" — no need to enter two addresses.',
        'Coffee Passport has its own page at /passport with stats, a heatmap, and the share card.',
        'Installable as an app; your Passport works offline.',
        'Filter settings now travel with the URL, so shared links restore the full search.',
        'On phones the map goes full-screen and search sits in a swipe-up sheet.',
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
      title: 'スッキリした見た目に',
      bullets: [
        'ヘッダーを小さく、背景を紙の色に。全体が軽やかな印象になりました。',
        'A と B の入力を 1 つのカードにまとめ、入れ替えボタンを追加。',
        '初回訪問時に簡単な使い方ガイドと、ワンタップで試せる地点例を表示します。',
        'フィルターを折りたたんだままでも現在の設定が見えるようになりました。',
        'タイトルにセリフ書体を採用し、結果カードもすっきり整理しました。',
      ],
    },
    {
      isoDate: '2026-04-22',
      title: '近くのカフェ、パスポート独立ページ、アプリ化',
      bullets: [
        '「近くのカフェを表示」を追加。A/B を入力しなくても検索できます。',
        'コーヒーパスポートを独立ページ（/passport）に。統計・ヒートマップ・共有カードをまとめて確認できます。',
        'アプリとしてインストール可能に。パスポートはオフラインでも見られます。',
        'フィルター設定が URL に含まれるようになり、共有したリンクで検索状態をそのまま再現できます。',
        'スマホでは地図が全画面になり、検索と結果は下から引き上げるシートに収まります。',
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
      title: '更清爽的外观',
      bullets: [
        '顶栏变小，背景换成米色，整体更轻盈。',
        'A、B 输入合并为一张卡片，中间加了交换按钮。',
        '新用户会看到简短的使用说明和一键试用的示例地点。',
        '筛选器折叠时也能直接看到当前设置。',
        '标题改用衬线字体，结果卡片更简洁。',
      ],
    },
    {
      isoDate: '2026-04-22',
      title: '附近咖啡、护照页、可安装',
      bullets: [
        '新增"显示附近咖啡店"，无需输入 A/B 即可搜索。',
        '咖啡护照独立成页（/passport），含统计、热力图与分享卡。',
        '可作为应用安装，护照支持离线查看。',
        '筛选条件会同步到 URL，分享链接可完整还原搜索状态。',
        '手机上地图铺满全屏，搜索和结果改为可上滑的抽屉。',
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
