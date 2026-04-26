/**
 * Recognise common social platforms from a URL so the profile page can show
 * a brand-appropriate icon next to the user's label. Returns null for
 * anything we don't have an icon for — caller falls back to a generic
 * globe.
 *
 * Patterns are anchored on hostname only (paths can vary), and `www.` is
 * stripped first. Mastodon is the special case: there's no single canonical
 * host, so we treat any URL whose path starts with `/@username` (or just
 * the @-handle pattern) as Mastodon-shaped.
 */
export type SocialBrand =
  | 'x'
  | 'github'
  | 'instagram'
  | 'threads'
  | 'mastodon'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'bluesky'
  | 'reddit'
  | 'weibo'
  | 'xiaohongshu'
  | 'bilibili'
  | 'discord'
  | 'telegram'
  | 'email';

interface BrandRule {
  brand: SocialBrand;
  hosts: readonly string[];
}

const RULES: readonly BrandRule[] = [
  { brand: 'x', hosts: ['twitter.com', 'x.com', 't.co'] },
  { brand: 'github', hosts: ['github.com', 'gist.github.com'] },
  { brand: 'instagram', hosts: ['instagram.com'] },
  { brand: 'threads', hosts: ['threads.net', 'threads.com'] },
  { brand: 'linkedin', hosts: ['linkedin.com', 'lnkd.in'] },
  { brand: 'youtube', hosts: ['youtube.com', 'youtu.be'] },
  { brand: 'tiktok', hosts: ['tiktok.com', 'vm.tiktok.com'] },
  { brand: 'bluesky', hosts: ['bsky.app', 'bsky.social'] },
  { brand: 'reddit', hosts: ['reddit.com', 'redd.it'] },
  { brand: 'weibo', hosts: ['weibo.com', 'weibo.cn'] },
  { brand: 'xiaohongshu', hosts: ['xiaohongshu.com', 'xhslink.com'] },
  { brand: 'bilibili', hosts: ['bilibili.com', 'b23.tv'] },
  { brand: 'discord', hosts: ['discord.gg', 'discord.com'] },
  { brand: 'telegram', hosts: ['t.me', 'telegram.me'] },
];

/** Anything ending in one of the rule's hosts (so `m.x.com`, `mobile.x.com` etc. still match). */
function hostMatches(actual: string, expected: string): boolean {
  return actual === expected || actual.endsWith(`.${expected}`);
}

export function identifyBrand(url: string): SocialBrand | null {
  if (!url) return null;
  if (url.toLowerCase().startsWith('mailto:')) return 'email';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  for (const rule of RULES) {
    if (rule.hosts.some((h) => hostMatches(host, h))) return rule.brand;
  }
  // Mastodon: hard to detect by host alone, but `/@handle` paths are very
  // characteristic of the Fediverse. Catch the shape rather than the host.
  if (/^\/@[A-Za-z0-9_]/.test(parsed.pathname)) return 'mastodon';
  return null;
}
