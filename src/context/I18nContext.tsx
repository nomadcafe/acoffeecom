import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  type Locale,
  interpolate,
  messagesByLocale,
  LOCALE_STORAGE_KEY,
} from '../i18n/messages';
import { getInitialLocale } from '../i18n/detectLocale';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const dict = messagesByLocale[locale];

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = dict[key] ?? messagesByLocale.en[key] ?? key;
      return interpolate(raw, vars);
    },
    [dict]
  );

  useEffect(() => {
    document.documentElement.lang = locale === 'ja' ? 'ja' : 'en';
    document.title = t('meta.title');
  }, [locale, t]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
