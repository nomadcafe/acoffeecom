import type { Locale } from './messages';
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from './messages';

function isLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as string[]).includes(value);
}

export function getLocaleFromPathname(pathname: string): Locale | null {
  const segment = pathname.split('/').filter(Boolean)[0] ?? null;
  return isLocale(segment) ? segment : null;
}

/** Path without leading `/{en|ja|zh}` segment, e.g. `/ja/updatelog` → `/updatelog`. */
export function stripLocalePrefix(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  if (isLocale(parts[0])) parts.shift();
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

export function buildLocalizedPathname(pathname: string, locale: Locale): string {
  const base = stripLocalePrefix(pathname);
  return base === '/' ? `/${locale}` : `/${locale}${base}`;
}

/** Reads saved preference, otherwise maps navigator.language to en | ja | zh. */
export function getInitialLocale(pathname?: string): Locale {
  if (pathname) {
    const byPath = getLocaleFromPathname(pathname);
    if (byPath) return byPath;
  }

  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* private mode etc. */
  }

  if (typeof navigator !== 'undefined') {
    const lang = navigator.language?.toLowerCase() ?? 'en';
    if (lang === 'zh' || lang.startsWith('zh-')) return 'zh';
    if (lang === 'ja' || lang.startsWith('ja-')) return 'ja';
  }

  return 'en';
}
