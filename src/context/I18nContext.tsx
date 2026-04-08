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

function upsertMetaByName(name: string, content: string) {
  let el = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertMetaByProperty(property: string, content: string) {
  let el = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.content = content;
}

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
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja' : 'en';
    document.title = t('meta.title');
    upsertMetaByName('description', t('seo.description'));
    upsertMetaByName('keywords', t('seo.keywords'));
    upsertMetaByProperty('og:title', t('seo.ogTitle'));
    upsertMetaByProperty('og:description', t('seo.ogDescription'));
    upsertMetaByProperty('og:locale', t('seo.ogLocale'));
    upsertMetaByName('twitter:title', t('seo.twitterTitle'));
    upsertMetaByName('twitter:description', t('seo.twitterDescription'));

    const schemaScript = document.head.querySelector(
      'script[type="application/ld+json"]'
    ) as HTMLScriptElement | null;
    if (schemaScript) {
      try {
        const parsed = JSON.parse(schemaScript.textContent || '{}') as Record<string, unknown>;
        parsed.name = t('seo.schemaName');
        parsed.description = t('seo.schemaDescription');
        schemaScript.textContent = JSON.stringify(parsed);
      } catch {
        // Ignore malformed existing schema markup.
      }
    }
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
