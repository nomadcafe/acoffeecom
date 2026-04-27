import { eq } from 'drizzle-orm';
import type { AuthEnv } from './_lib/auth';
import { getDb } from './_lib/db';
import { user } from './_lib/db/schema';

/**
 * Dynamic sitemap. Pages Functions override the static `public/sitemap.xml`
 * for this path, so we can fold in the public-profile pages without
 * regenerating at build time.
 *
 * Static entries (home, updatelog, passport) are inlined as the canonical
 * list — keep them in sync with the routes the SPA actually exposes. Profile
 * entries pull from the user table where `profile_public = true` and use the
 * row's `updated_at` for `<lastmod>` so crawlers can prioritise.
 *
 * Edge-cached for an hour: profile changes show up within the hour, but a
 * popular profile getting hammered by crawlers won't repeatedly hit D1.
 */

const ORIGIN = 'https://acoffee.com';
const LOCALES = ['en', 'ja', 'zh'] as const;

interface StaticEntry {
  loc: string;
  changefreq: 'weekly' | 'monthly';
  priority: string;
}

const STATIC_PATHS: Array<{
  path: string;
  changefreq: StaticEntry['changefreq'];
  priority: string;
}> = [
  { path: '/', changefreq: 'weekly', priority: '0.8' },
  { path: '/updatelog', changefreq: 'monthly', priority: '0.6' },
  { path: '/passport', changefreq: 'monthly', priority: '0.5' },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ env }) => {
  const db = getDb(env);

  // Pull only what the sitemap needs. Drizzle returns updatedAt as Date —
  // normalise to ms for the iso formatter.
  const rows = await db
    .select({ username: user.username, updatedAt: user.updatedAt })
    .from(user)
    .where(eq(user.profilePublic, true));

  const profiles = rows.flatMap((r) =>
    r.username
      ? [
          {
            username: r.username,
            updatedAtMs:
              r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt),
          },
        ]
      : [],
  );

  const urls: string[] = [];

  // Static pages, one entry per locale prefix (matches the SPA's URL shape).
  for (const entry of STATIC_PATHS) {
    for (const locale of LOCALES) {
      const path = entry.path === '/' ? `/${locale}/` : `/${locale}${entry.path}`;
      urls.push(
        `  <url>\n` +
          `    <loc>${escapeXml(`${ORIGIN}${path}`)}</loc>\n` +
          `    <changefreq>${entry.changefreq}</changefreq>\n` +
          `    <priority>${entry.priority}</priority>\n` +
          `  </url>`,
      );
    }
  }

  // Public profiles live at /<username> (no locale prefix — they're the same
  // page in any locale, and the SPA picks UI language from the URL query or
  // navigator.language anyway).
  for (const p of profiles) {
    urls.push(
      `  <url>\n` +
        `    <loc>${escapeXml(`${ORIGIN}/${p.username}`)}</loc>\n` +
        `    <lastmod>${isoDate(p.updatedAtMs)}</lastmod>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>0.7</priority>\n` +
        `  </url>`,
    );
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
