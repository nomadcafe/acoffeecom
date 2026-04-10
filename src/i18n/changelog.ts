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
      isoDate: '2026-04-10',
      title: 'Saved cafés in the header',
      bullets: [
        'Saved cafés moved from the sidebar into a “Saved” menu next to the language switcher, with a dropdown panel for quick access.',
        'Each language has its own URL prefix (/en, /ja, /zh); this update log page documents changes over time.',
      ],
    },
  ],
  ja: [
    {
      isoDate: '2026-04-10',
      title: '保存カフェをヘッダーへ',
      bullets: [
        '保存したカフェをサイドバーから、言語切り替えの横の「保存」メニュー（ドロップダウン）に移しました。',
        '言語ごとに URL の先頭が /en・/ja・/zh と分かれています。更新内容はこのページに記録します。',
      ],
    },
  ],
  zh: [
    {
      isoDate: '2026-04-10',
      title: '已保存咖啡店移至顶栏',
      bullets: [
        '「已保存」从侧栏移到与语言切换并列的顶栏菜单，以下拉面板快速查看与管理。',
        '各语言使用独立路径前缀（/en、/ja、/zh）；本页用于记录后续更新说明。',
      ],
    },
  ],
};

export function isUpdatesPath(logicalPath: string): boolean {
  return logicalPath === UPDATES_PATH || logicalPath.startsWith(`${UPDATES_PATH}/`);
}
