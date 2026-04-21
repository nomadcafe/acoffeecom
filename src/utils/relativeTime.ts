import type { Locale } from '../i18n/messages';

const LOCALE_BCP47: Record<Locale, string> = {
  en: 'en',
  ja: 'ja',
  zh: 'zh-CN',
};

/**
 * Human-friendly "3 days ago" / "just now" using Intl.RelativeTimeFormat.
 * Picks the largest useful unit so the string stays compact.
 */
export function formatRelativeTime(timestamp: number, locale: Locale, now: number = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE_BCP47[locale], { numeric: 'auto' });
  const diffMs = timestamp - now;
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month');
  const diffYear = Math.round(diffMonth / 12);
  return rtf.format(diffYear, 'year');
}

export function formatAbsoluteDate(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}
