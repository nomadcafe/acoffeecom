import { and, eq } from 'drizzle-orm';
import type { AuthEnv } from './_lib/auth';
import { getDb } from './_lib/db';
import { user, visitedShops } from './_lib/db/schema';
import { RESERVED_USERNAMES } from './_lib/username';

/**
 * Root middleware that injects per-profile Open Graph / Twitter Card meta
 * tags into the SPA's index.html when the request matches a public profile
 * URL. Without this, every shared `acoffee.com/<username>` would show the
 * generic site preview on iMessage / Twitter / Slack / WhatsApp — losing
 * the acquisition lever that bio-link pages depend on.
 *
 * The middleware bails fast on anything that isn't a navigation to a
 * /<username> or /<locale>/<username> path:
 *   - non-GET methods
 *   - non-HTML accept headers (assets, JSON fetches)
 *   - /api/ /_* /assets/ /sw.js /manifest.webmanifest
 *   - paths with extensions (.png, .ico, …)
 *   - reserved words (account, passport, updates, …)
 *
 * For matching paths we let the static handler serve index.html via
 * context.next(), then HTMLRewriter substitutes our OG tags into the
 * already-shipped <meta> elements. The page still hydrates the same SPA;
 * crawlers just see the right preview.
 */

const USERNAME_RE = /^(?:\/(en|ja|zh))?\/([a-z][a-z0-9_-]{2,29})\/?$/;

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

export const onRequest: PagesFunction<AuthEnv> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET') return next();
  for (const p of SKIP_PREFIXES) {
    if (url.pathname.startsWith(p)) return next();
  }
  if (SKIP_PATHS.has(url.pathname)) return next();
  // Path with a file extension (.png, .js, etc.) is definitely an asset.
  if (/\.[a-z0-9]{1,5}$/i.test(url.pathname)) return next();

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) return next();

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
