export type Locale = 'en' | 'ja' | 'zh';

export const LOCALE_STORAGE_KEY = 'ACoffee-meetup-locale';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ja', 'zh'];

/** Flat message keys → string. Use {{name}} for interpolation. */
export type MessageDict = Record<string, string>;

/**
 * Per-locale message catalogues live in their own modules under ./locales so
 * each one ships as its own Vite chunk. Static imports here let the bundler
 * code-split per file even though the loader signature is async — only the
 * locales actually requested at runtime are fetched and parsed.
 */
const LOADERS: Record<Locale, () => Promise<{ default: MessageDict }>> = {
  en: () => import('./locales/en'),
  ja: () => import('./locales/ja'),
  zh: () => import('./locales/zh'),
};

const cache = new Map<Locale, MessageDict>();
const inflight = new Map<Locale, Promise<MessageDict>>();

/** Resolve the catalogue for `locale`, hitting the chunk only on first call. */
export function loadLocaleMessages(locale: Locale): Promise<MessageDict> {
  const cached = cache.get(locale);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(locale);
  if (pending) return pending;
  const p = LOADERS[locale]().then((mod) => {
    cache.set(locale, mod.default);
    inflight.delete(locale);
    return mod.default;
  });
  inflight.set(locale, p);
  return p;
}

/** Synchronous accessor — returns the dict if already loaded, otherwise undefined. */
export function getLoadedMessages(locale: Locale): MessageDict | undefined {
  return cache.get(locale);
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : ''
  );
}
