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
      isoDate: '2026-05-03',
      title: 'Booking is now an invite, not an instant lock',
      bullets: [
        'Visitors send a *request* on acoffee.com/yourname — pick a time, leave a quick message, no address required. The host gets notified, picks the café, and replies with a yes (or a polite no).',
        'The host\'s approve dialog now has a café search + your featured cafés as quick-picks, plus a "suggest a different time" toggle in case the original slot doesn\'t work — server validates the new time against your availability and existing bookings.',
        'Visitors must click an email confirmation before the host hears about it — keeps host inboxes clean from typo\'d or impersonated email addresses.',
        '/yourname got a visual refresh: bigger avatar and name, stats card moved right under the hero so the "real coffee person" signal lands first, featured cafés go two-column on desktop.',
        'Signed-in home now greets you by handle with your streak, last café and total cups stamped — replaces the marketing carousel for returning users.',
        'Long list of small fixes across /account, /passport, /bookings — destructive actions ask for confirmation, slow uploads cancel cleanly, week grid handles DST without skipping Saturday.',
      ],
    },
    {
      isoDate: '2026-04-29',
      title: 'No more "where should we meet?"',
      bullets: [
        'New 6-mode chip row — Fair / Fast / Vibe / Quiet / Cheap / Now. One tap and the agent re-picks the right café.',
        'Fair mode now uses real transit time across all parties (Google Routes), not just kilometres on a map. Each card shows minutes per person and a Fairness Score 0–100.',
        'Three-person meetups: support added end-to-end — the trip card lets you tap "+ Add another person" up to 3 addresses, and fairness math generalises so the worst-off traveller still gets a balanced pick.',
        'Sign in with Google for a one-click magic-link alternative.',
      ],
    },
    {
      isoDate: '2026-04-28',
      title: 'Bookings shipped end-to-end',
      bullets: [
        'Public profiles now have a real booking flow at acoffee.com/yourname — pick a date and time, see the café we auto-picked between you, confirm by email.',
        'New Calendar sync: paste your Google / Apple / Outlook iCal URL in Account and your real busy times disappear from the offered slots automatically.',
        'New "My bookings" page — hosts see who\'s coming, switch between home and current timezones while travelling, and cancel with one tap.',
        'Visitors get a cancel link in their confirmation email, so cancellation isn\'t host-only.',
        'Small polish: bigger brand wordmark, hash-based gradient avatars, a soft sage accent on "create" buttons.',
      ],
    },
    {
      isoDate: '2026-04-27',
      title: 'Public profiles and share previews',
      bullets: [
        'Public profile pages at acoffee.com/yourname — display name, bio, and social links with brand icons.',
        'Sharing your profile link now shows a rich preview image with your café stats.',
        'New Account section to set your home base and weekly availability — public booking is coming soon.',
      ],
    },
    {
      isoDate: '2026-04-25',
      title: 'Mobile polish',
      bullets: [
        'The map now stays visible above the bottom sheet, even before your first search.',
        'After a search the sheet expands and scrolls to the results — no manual drag needed.',
        'Bigger A and B inputs and a larger swap button make typing easier on phones.',
        'Long café names now wrap to two lines instead of being cut off.',
        'First-time visitors can try a sample search straight from the hero with one tap.',
      ],
    },
    {
      isoDate: '2026-04-24',
      title: 'Sign in and cloud sync',
      bullets: [
        'Sign in with an email magic link — no password to remember.',
        'Your Coffee Passport now syncs across devices: visited and saved cafés follow you wherever you sign in.',
        'A small indicator in the header shows the latest sync status.',
        'Passport page now overlays your visit trajectory on the map, with a separate trail-style share card.',
        'Friendlier fallback screen when something unexpected goes wrong.',
      ],
    },
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
      isoDate: '2026-05-03',
      title: '予約は「招待 → 承認」方式に',
      bullets: [
        '訪問者は acoffee.com/yourname で *リクエスト* を送る形式に — 時間を選んで一言添えるだけ、住所は任意。ホストに通知が届き、カフェを選んで「はい」または丁寧な「いいえ」で返信します。',
        'ホストの承認ダイアログにカフェ検索 + お気に入りカフェのクイックピックを追加。予定が合わない時は「別の時間を提案」も可能 — サーバーが空き時間と既存の予約と照合して検証します。',
        '訪問者はメール内の確認リンクをクリックしないとホストに通知されません — 入力ミスのメールアドレスや他人になりすました予約からホストの受信箱を守ります。',
        '/yourname の見た目を刷新：アバターと名前を大きく、統計カードをヒーロー直下に移動、お気に入りカフェはデスクトップで 2 列表示。',
        'サインイン後のホームがハンドル名で迎えるように — 連続日数、最近行ったカフェ、累計杯数を表示。常連向けのマーケティングカルーセルを置き換えます。',
        '/account・/passport・/bookings の細かな修正多数 — 破壊的操作は確認を求める、低速アップロードはクリーンにキャンセル、週グリッドが DST で土曜を飛ばさなくなりました。',
      ],
    },
    {
      isoDate: '2026-04-29',
      title: '「どこで会う？」とはもう聞かない',
      bullets: [
        '6 つのモードチップを追加 — 公平 / 速い / 雰囲気 / 静か / 安い / 今すぐ。タップひとつでエージェントがカフェを選び直します。',
        '「公平」モードは Google Routes API で実際の交通時間を使うように — 直線距離だけでなく分単位で公平に計算。各カードに各人の所要時間と 0〜100 の Fairness Score を表示。',
        '3 人での待ち合わせに対応 — 入力カードに「+ もう一人追加」を追加（最大 3 人）。最も移動が大変な人もバランスよく考慮されます。',
        'Google でサインイン — マジックリンクの代わりにワンクリック。',
      ],
    },
    {
      isoDate: '2026-04-28',
      title: '予約機能が一通り揃いました',
      bullets: [
        'acoffee.com/yourname に本物の予約フローが実装されました — 日時を選び、双方の中間に自動選定されたカフェを見て、メールで確定。',
        'カレンダー連携が新登場：Google / Apple / Outlook の iCal URL をアカウントに貼り付けるだけで、実際の予定の時間帯は予約候補から自動的に除外されます。',
        '「予約一覧」ページを追加 — ホストは誰が来るかを確認でき、出張中は常駐地と現在地の時間表示を切り替えられ、ワンタップでキャンセル可能。',
        '訪問者の確認メールにキャンセルリンクが含まれるようになり、ホスト以外もキャンセルできるように。',
        '細かな改善：ブランド表記を大きく、ハッシュ生成のグラデーションアバター、「作成」ボタンに柔らかなセージ系アクセントを追加。',
      ],
    },
    {
      isoDate: '2026-04-27',
      title: '公開プロフィールと共有プレビュー',
      bullets: [
        'acoffee.com/yourname に公開プロフィールページを追加 — 表示名・自己紹介・SNS リンク（ブランドアイコン付き）。',
        'プロフィールリンクを共有すると、カフェの統計入りの綺麗なプレビュー画像が表示されます。',
        'アカウント設定にホーム拠点と週間予定を追加 — 公開予約機能は近日公開予定。',
      ],
    },
    {
      isoDate: '2026-04-25',
      title: 'スマホ周りの調整',
      bullets: [
        '検索前でも地図がボトムシートの上にきちんと表示されるようになりました。',
        '検索完了後、シートが自動で展開し結果までスクロールします。手動で引き上げる必要がありません。',
        'A・B 入力欄と入れ替えボタンを大きくし、スマホでも押しやすくなりました。',
        '長いカフェ名が省略されず、2 行まで折り返して表示されます。',
        '初回訪問時、ヒーロー部分からワンタップで試せるサンプル検索を追加しました。',
      ],
    },
    {
      isoDate: '2026-04-24',
      title: 'サインインとクラウド同期',
      bullets: [
        'メールのマジックリンクでサインイン — パスワード不要。',
        'コーヒーパスポートが端末間で同期されるようになりました（訪問・お気に入り）。サインインすればどこでも同じ内容が見られます。',
        'ヘッダーに同期状態を示す小さなインジケーターを追加。',
        'パスポートページに訪問の軌跡を地図上に重ねるオーバーレイと、その軌跡を共有できる新しい共有カードを追加。',
        '予期しないエラー時に表示されるフォールバック画面を整えました。',
      ],
    },
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
      isoDate: '2026-05-03',
      title: '约咖啡：从直接锁定改成邀请确认',
      bullets: [
        '访客在 acoffee.com/yourname 发的是"请求"而不是直接定单 —— 选时间、留个口信，地址变成可选项。host 收到通知后挑咖啡店再回复同意（或礼貌拒绝）。',
        'host 的同意弹窗里加了咖啡店搜索 + 你的精选咖啡店快捷按钮，再加一个"想换个时间？"开关 —— 改了时间会自动用你的 availability 和其它预约校验冲突。',
        '访客必须先点邮件里的验证链接，host 才会收到通知 —— 防止有人填别人的邮箱给 host 发垃圾请求，也确保后续 host 的回复邮件能真的到访客手上。',
        '/yourname 视觉升级：头像和名字加大，统计卡片上移到 hero 紧下方让"老咖啡人"信号第一时间被看到，精选咖啡店在桌面端两列展示。',
        '登录后的首页会用你的 handle 打招呼，显示连签天数、最近去过的店、累计杯数 —— 给老用户看的是"我的状态"而不是 marketing 轮播。',
        '/account、/passport、/bookings 一堆小修补 —— 销毁性操作都加了确认、慢速上传中途切页面不再泄漏、周视图跨 DST 边界不再"跳过周六"。',
      ],
    },
    {
      isoDate: '2026-04-29',
      title: '不用再纠结"去哪见面"',
      bullets: [
        '主页新增 6 个模式 chip — 公平 / 最快 / 氛围 / 安静 / 便宜 / 即时。点一下，agent 立刻重新挑咖啡店。',
        '"公平"模式接上了 Google Routes API，按真实公共交通时间算各方差异，不再只是地图上的直线公里数。卡片显示每人通勤分钟数 + 0–100 的公平度评分。',
        '三人见面端到端支持 — 输入卡支持"+ 加一个人"最多 3 人，公平算法泛化，最累的那个人也不会被忽略。',
        '新增 Google 登录入口，邮件 magic link 之外多一个选择。',
      ],
    },
    {
      isoDate: '2026-04-28',
      title: '预约功能完整上线',
      bullets: [
        'acoffee.com/yourname 上的"约咖啡"现在是真表单了 — 选日期、选时间，看我们自动挑给你们俩的咖啡店，邮件确认即生效。',
        '新增日历同步：把 Google / Apple / Outlook 的 iCal URL 贴到账号设置里，已有会议的时间段会自动从可约时段里排除。',
        '新增"我的预约"页 — 主理人能看到谁约了自己，出差时可在常驻地与当前时区之间切换，一键取消。',
        '访客的确认邮件里附带取消链接，不再需要主理人亲自取消。',
        '细节打磨：品牌字号变大、根据用户名/邮箱哈希生成的渐变头像、"创建"按钮换上一抹柔和的鼠尾草绿。',
      ],
    },
    {
      isoDate: '2026-04-27',
      title: '公开主页与分享预览',
      bullets: [
        '新增公开主页 acoffee.com/yourname — 展示昵称、简介与社交链接（自动识别品牌图标）。',
        '分享主页链接时会生成带有咖啡数据的精美预览图。',
        '账号设置新增"常驻地"与"每周可约时段" — 公开预约功能即将上线。',
      ],
    },
    {
      isoDate: '2026-04-25',
      title: '手机端打磨',
      bullets: [
        '搜索前地图也能正常显示在底部抽屉上方，不再是空白一片。',
        '搜索完成后抽屉自动展开并滚动到结果位置，不用再手动上滑。',
        'A、B 输入框和交换按钮加大，手机上更易点按。',
        '较长的咖啡店名现在会换行显示两行，不再被截断。',
        '首次访问时可以直接从顶部一键试用示例搜索。',
      ],
    },
    {
      isoDate: '2026-04-24',
      title: '账号与云同步',
      bullets: [
        '使用邮箱魔法链接登录 — 无需记住密码。',
        '咖啡护照支持跨设备同步：访问与收藏数据登录后随你流转。',
        '顶栏新增同步状态小图标，可看到最近一次同步情况。',
        '护照页新增"足迹"地图叠加层，记录你拜访咖啡店的轨迹，并提供独立风格的分享卡。',
        '出现意外错误时显示更友好的提示页面。',
      ],
    },
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
