import type { Locale } from './messages';
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from './messages';

function isLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as string[]).includes(value);
}

/** Reads saved preference, otherwise maps navigator.language to en | ja. */
export function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* private mode etc. */
  }

  if (typeof navigator !== 'undefined') {
    const lang = navigator.language?.toLowerCase() ?? 'en';
    if (lang === 'ja' || lang.startsWith('ja-')) return 'ja';
  }

  return 'en';
}
