import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  type Locale,
  interpolate,
  messagesByLocale,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from '../i18n/messages';
import {
  buildLocalizedPathname,
  getInitialLocale,
  getLocaleFromPathname,
  stripLocalePrefix,
} from '../i18n/detectLocale';
import { isUpdatesPath } from '../i18n/changelog';
import { notifyLocationSync } from '../i18n/locationSync';

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

function upsertLinkRel(rel: string, href: string, hreflang?: string) {
  const selector =
    hreflang != null ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
  let el = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (hreflang != null) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale(window.location.pathname));

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }

    const nextPath = buildLocalizedPathname(window.location.pathname, next);
    const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.pushState({}, '', nextUrl);
      notifyLocationSync();
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
    const onPopState = () => {
      const byPath = getLocaleFromPathname(window.location.pathname);
      if (byPath) setLocaleState(byPath);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const targetPath = buildLocalizedPathname(window.location.pathname, locale);
    if (window.location.pathname !== targetPath) {
      window.history.replaceState({}, '', `${targetPath}${window.location.search}${window.location.hash}`);
      notifyLocationSync();
    }

    const logicalPath = stripLocalePrefix(window.location.pathname);
    const onChangelog = isUpdatesPath(logicalPath);

    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja' : 'en';
    document.title = onChangelog ? t('changelog.metaTitle') : t('meta.title');
    upsertMetaByName('description', onChangelog ? t('changelog.metaDescription') : t('seo.description'));
    upsertMetaByName('keywords', onChangelog ? t('changelog.metaKeywords') : t('seo.keywords'));
    upsertMetaByProperty('og:url', window.location.href);
    upsertMetaByProperty('og:title', onChangelog ? t('changelog.ogTitle') : t('seo.ogTitle'));
    upsertMetaByProperty('og:description', onChangelog ? t('changelog.ogDescription') : t('seo.ogDescription'));
    upsertMetaByProperty('og:locale', t('seo.ogLocale'));
    upsertMetaByName(
      'twitter:title',
      onChangelog ? t('changelog.twitterTitle') : t('seo.twitterTitle')
    );
    upsertMetaByName(
      'twitter:description',
      onChangelog ? t('changelog.twitterDescription') : t('seo.twitterDescription')
    );
    upsertLinkRel('canonical', window.location.href);

    const origin = window.location.origin;
    const currentBasePath = window.location.pathname.replace(/^\/(en|ja|zh)(?=\/|$)/, '') || '/';
    for (const code of SUPPORTED_LOCALES) {
      const href = `${origin}${buildLocalizedPathname(currentBasePath, code)}`;
      const hreflang = code === 'zh' ? 'zh-CN' : code;
      upsertLinkRel('alternate', href, hreflang);
    }
    upsertLinkRel('alternate', `${origin}/en`, 'x-default');

    const schemaScript = document.head.querySelector(
      'script[type="application/ld+json"]'
    ) as HTMLScriptElement | null;
    if (schemaScript) {
      try {
        const parsed = JSON.parse(schemaScript.textContent || '{}') as Record<string, unknown>;
        parsed.url = window.location.href;
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
