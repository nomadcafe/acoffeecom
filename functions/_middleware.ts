import { and, eq } from 'drizzle-orm';
import type { AuthEnv } from './_lib/auth';
import { getDb } from './_lib/db';
import { user, visitedShops } from './_lib/db/schema';
import { RESERVED_USERNAMES } from './_lib/username';

/**
 * Root middleware that rewrites the SPA's static index.html for two
 * surfaces that need SEO / link-preview metadata before the React app
 * has a chance to update it client-side:
 *
 *   1. Public profile pages — `acoffee.com/<username>` and
 *      `acoffee.com/<locale>/<username>`. Without injection every
 *      shared profile would show the generic English site preview on
 *      iMessage / Twitter / Slack / WhatsApp.
 *
 *   2. Localized homepages — `/`, `/en/`, `/ja/`, `/zh/`. The static
 *      <title> / og:title / og:description / og:locale / canonical /
 *      <html lang> are all English. When a Chinese or Japanese user
 *      shares `acoffee.com/zh/`, the link-preview bot fetches the raw
 *      HTML (no JS execution), so they see English copy. The
 *      I18nContext fixes this in-browser but the bots never get there.
 *
 * Skip rules:
 *   - non-GET methods
 *   - non-HTML accept headers (assets, JSON fetches)
 *   - /api/ /_* /assets/ /sw.js /manifest.webmanifest
 *   - paths with extensions (.png, .ico, …)
 *   - reserved words (account, passport, updates, …) — they're SPA
 *     routes that don't need bespoke OG yet, and bookings are auth-
 *     gated so SEO doesn't apply
 */

const USERNAME_RE = /^(?:\/(en|ja|zh))?\/([a-z][a-z0-9_-]{2,29})\/?$/;
/** `/`, `/en`, `/en/`, `/ja`, `/ja/`, `/zh`, `/zh/`. */
const HOME_PATH_RE = /^\/(?:(en|ja|zh)\/?)?$/;

type Locale = 'en' | 'ja' | 'zh';

/**
 * Per-locale SEO copy. Mirrors the seo.* keys in src/i18n/locales/*.ts
 * but lives here because Pages Functions can't import from the SPA
 * source tree at build time. Keep in sync when those keys change —
 * grep for `seo.ogTitle` in this file before editing the i18n locales.
 */
const SEO_COPY: Record<Locale, {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogLocale: string;
  twitterTitle: string;
  twitterDescription: string;
  htmlLang: string;
}> = {
  en: {
    title: 'ACoffee — Best Meetup Place Finder',
    description:
      'AI finds the fairest coffee shop between two or three addresses — using real transit time, not just the geographic midpoint. Share acoffee.com/yourname so friends or clients can book a coffee with you in one tap.',
    ogTitle: 'ACoffee — Best Meetup Place Finder',
    ogDescription:
      "No more 'where should we meet?' — AI picks the fairest café for everyone, using real transit time. Plus acoffee.com/yourname for one-tap coffee bookings.",
    ogLocale: 'en_US',
    twitterTitle: 'ACoffee — Best Meetup Place Finder',
    twitterDescription:
      "No more 'where should we meet?' — AI picks the fairest café for everyone, using real transit time. Plus acoffee.com/yourname for one-tap coffee bookings.",
    htmlLang: 'en',
  },
  ja: {
    title: 'ACoffee — 待ち合わせに最適なカフェを探す',
    description:
      '2〜3 人の住所から AI が一番公平なカフェを選びます — 実際の交通時間ベースで、単なる地理的中点ではありません。acoffee.com/yourname で、友人も顧客もワンタップでコーヒーの予約ができます。',
    ogTitle: 'ACoffee — 待ち合わせに最適なカフェを探す',
    ogDescription:
      '「どこで会う？」とはもう聞かない — AI が全員にいちばん公平なカフェを実際の交通時間で選びます。acoffee.com/yourname のワンタップ予約も。',
    ogLocale: 'ja_JP',
    twitterTitle: 'ACoffee — 待ち合わせに最適なカフェを探す',
    twitterDescription:
      '「どこで会う？」とはもう聞かない — AI が全員にいちばん公平なカフェを実際の交通時間で選びます。acoffee.com/yourname のワンタップ予約も。',
    htmlLang: 'ja',
  },
  zh: {
    title: 'ACoffee — 找到最合适的会面咖啡店',
    description:
      'AI 在两到三个地址之间挑最公平的咖啡店——按实际公共交通时间算，不是只看地理中点。分享 acoffee.com/yourname，朋友或客户都能一键约你喝咖啡。',
    ogTitle: 'ACoffee — 找到最合适的会面咖啡店',
    ogDescription: '不用再纠结"去哪见面" — AI 按实际通勤时间为大家挑最公平的咖啡店。还能用 acoffee.com/yourname 让朋友或客户一键约你喝咖啡。',
    ogLocale: 'zh_CN',
    twitterTitle: 'ACoffee — 找到最合适的会面咖啡店',
    twitterDescription: '不用再纠结"去哪见面" — AI 按实际通勤时间为大家挑最公平的咖啡店。还能用 acoffee.com/yourname 让朋友或客户一键约你喝咖啡。',
    htmlLang: 'zh-CN',
  },
};

const SKIP_PREFIXES = ['/api/', '/assets/', '/_'];
const SKIP_PATHS = new Set([
  '/sw.js',
  '/registerSW.js',
  '/manifest.webmanifest',
  '/robots.txt',
  '/favicon.ico',
  '/logo.png',
]);

interface ProfileForOg {
  username: string;
  displayName: string | null;
  bio: string | null;
  cups: number;
  shops: number;
}

async function fetchProfileForOg(env: AuthEnv, username: string): Promise<ProfileForOg | null> {
  const db = getDb(env);
  const [owner] = await db
    .select({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      profilePublic: user.profilePublic,
    })
    .from(user)
    .where(and(eq(user.username, username), eq(user.profilePublic, true)));
  if (!owner) return null;

  // Aggregate cup + shop counts. Quick query, no full visits parsing —
  // OG just needs round numbers, not the rich payload the JSON API ships.
  const rows = await db
    .select({ visits: visitedShops.visits })
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, owner.id), eq(visitedShops.deleted, false)));
  let cups = 0;
  let shops = 0;
  for (const r of rows) {
    let visitsArr: unknown;
    try {
      visitsArr = JSON.parse(r.visits);
    } catch {
      continue;
    }
    if (!Array.isArray(visitsArr) || visitsArr.length === 0) continue;
    shops++;
    cups += visitsArr.length;
  }

  return {
    username: owner.username ?? username,
    displayName: owner.displayName ?? null,
    bio: owner.bio ?? null,
    cups,
    shops,
  };
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface OgValues {
  title: string;
  description: string;
  url: string;
  image: string;
}

function buildOgValues(profile: ProfileForOg, requestUrl: URL): OgValues {
  const display = profile.displayName?.trim() || `@${profile.username}`;
  const title = `${display} on ACoffee ☕`;
  const description = profile.bio?.trim()
    ? profile.bio
    : `${profile.cups} cups across ${profile.shops} cafés.`;
  return {
    title,
    description,
    url: `${requestUrl.origin}/${profile.username}`,
    image: `${requestUrl.origin}/api/og/${profile.username}`,
  };
}

class MetaTagSetter {
  constructor(
    private readonly key: 'name' | 'property',
    private readonly value: string,
    private readonly content: string,
  ) {}
  element(el: Element) {
    if (el.getAttribute(this.key) === this.value) {
      el.setAttribute('content', this.content);
    }
  }
}

class TitleSetter {
  constructor(private readonly title: string) {}
  element(el: Element) {
    el.setInnerContent(escapeAttr(this.title));
  }
}

class HtmlLangSetter {
  constructor(private readonly lang: string) {}
  element(el: Element) {
    el.setAttribute('lang', this.lang);
  }
}

class CanonicalSetter {
  constructor(private readonly href: string) {}
  element(el: Element) {
    if (el.getAttribute('rel') === 'canonical') {
      el.setAttribute('href', this.href);
    }
  }
}

export const onRequest: PagesFunction<AuthEnv> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET') return next();
  for (const p of SKIP_PREFIXES) {
    if (url.pathname.startsWith(p)) return next();
  }
  if (SKIP_PATHS.has(url.pathname)) return next();

  console.log('[mw]', url.pathname, 'home=', !!url.pathname.match(HOME_PATH_RE), 'user=', !!url.pathname.match(USERNAME_RE));
  // Path with a file extension (.png, .js, etc.) is definitely an asset.
  if (/\.[a-z0-9]{1,5}$/i.test(url.pathname)) return next();

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) return next();

  // Localized homepages: `/`, `/en/`, `/ja/`, `/zh/`. Match before the
  // username pattern because they would also match the more permissive
  // username regex (e.g. `/en` could be parsed as username `en`, except
  // we already reserved 'en' is too short — but be explicit).
  const homeMatch = url.pathname.match(HOME_PATH_RE);
  if (homeMatch) {
    const locale = (homeMatch[1] as Locale | undefined) ?? 'en';
    const copy = SEO_COPY[locale];
    const canonicalHref = `${url.origin}${url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'}`;
    const response = await next();
    const ctype = response.headers.get('content-type') ?? '';
    if (!ctype.includes('text/html')) return response;
    const rewriter = new HTMLRewriter()
      .on('html', new HtmlLangSetter(copy.htmlLang))
      .on('title', new TitleSetter(copy.title))
      .on('meta[name="description"]', new MetaTagSetter('name', 'description', copy.description))
      .on('meta[property="og:title"]', new MetaTagSetter('property', 'og:title', copy.ogTitle))
      .on('meta[property="og:description"]', new MetaTagSetter('property', 'og:description', copy.ogDescription))
      .on('meta[property="og:locale"]', new MetaTagSetter('property', 'og:locale', copy.ogLocale))
      .on('meta[property="og:url"]', new MetaTagSetter('property', 'og:url', canonicalHref))
      .on('meta[name="twitter:title"]', new MetaTagSetter('name', 'twitter:title', copy.twitterTitle))
      .on('meta[name="twitter:description"]', new MetaTagSetter('name', 'twitter:description', copy.twitterDescription))
      .on('link[rel="canonical"]', new CanonicalSetter(canonicalHref));
    return rewriter.transform(response);
  }

  const match = url.pathname.match(USERNAME_RE);
  if (!match) return next();
  const username = match[2];
  if (RESERVED_USERNAMES.has(username)) return next();

  let profile: ProfileForOg | null = null;
  try {
    profile = await fetchProfileForOg(env, username);
  } catch (e) {
    console.error('[og] profile fetch failed', e);
    return next();
  }
  if (!profile) return next();

  const og = buildOgValues(profile, url);
  const response = await next();
  // Only transform HTML responses — if the static handler 404'd we shouldn't
  // touch the body shape.
  const ctype = response.headers.get('content-type') ?? '';
  if (!ctype.includes('text/html')) return response;

  const rewriter = new HTMLRewriter()
    .on('title', new TitleSetter(og.title))
    .on('meta[name="description"]', new MetaTagSetter('name', 'description', og.description))
    .on('meta[property="og:title"]', new MetaTagSetter('property', 'og:title', og.title))
    .on('meta[property="og:description"]', new MetaTagSetter('property', 'og:description', og.description))
    .on('meta[property="og:url"]', new MetaTagSetter('property', 'og:url', og.url))
    .on('meta[property="og:image"]', new MetaTagSetter('property', 'og:image', og.image))
    .on('meta[name="twitter:card"]', new MetaTagSetter('name', 'twitter:card', 'summary_large_image'))
    .on('meta[name="twitter:title"]', new MetaTagSetter('name', 'twitter:title', og.title))
    .on('meta[name="twitter:description"]', new MetaTagSetter('name', 'twitter:description', og.description))
    .on('meta[name="twitter:image"]', new MetaTagSetter('name', 'twitter:image', og.image));

  return rewriter.transform(response);
};
