import { ImageResponse } from 'workers-og';
import { and, asc, eq } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { featuredCafes, user, visitedShops } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';

/**
 * Per-profile share-card PNG for og:image. Renders a 1200×630 image with
 * display name + @username + bio + cup/café/streak stats. Edge-cached so
 * a viral profile doesn't regenerate the same image for every crawler hit.
 *
 * Returns the same 404 for "user doesn't exist" and "profile is private",
 * matching the JSON profile endpoint's privacy posture.
 */

interface ProfileForCard {
  username: string;
  displayName: string | null;
  bio: string | null;
  cups: number;
  shops: number;
  streak: number;
  /** First featured cafe (position 0) — surfaced on the share card to
   *  give the OG preview an extra hook beyond bare stats. Null when the
   *  profile has no featured cafe. */
  featured: {
    name: string;
    relation: 'owned' | 'favorite';
    /** Only meaningful on owned rows. */
    verified: boolean;
    /** Short blurb to show below the cafe name. Prefers the owner-only
     *  pinned "this week" note (since it's the freshest signal), falls
     *  back to the static note. Null when neither is set. */
    snippet: string | null;
  } | null;
}

function escapeSvg(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

async function loadProfile(env: AuthEnv, username: string): Promise<ProfileForCard | null> {
  const db = getDb(env);
  const [owner] = await db
    .select()
    .from(user)
    .where(and(eq(user.username, username), eq(user.profilePublic, true)));
  if (!owner) return null;

  const rows = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, owner.id), eq(visitedShops.deleted, false)));

  let cups = 0;
  let shops = 0;
  const allTimestamps: number[] = [];
  for (const r of rows) {
    let visits: number[] = [];
    try {
      const parsed = JSON.parse(r.visits);
      if (Array.isArray(parsed)) {
        visits = parsed.filter((n) => typeof n === 'number' && Number.isFinite(n));
      }
    } catch {
      /* ignore */
    }
    if (visits.length === 0) continue;
    cups += visits.length;
    shops++;
    allTimestamps.push(...visits);
  }

  // Streak = consecutive days ending today/yesterday — same shape as
  // computeStreak on the client, simplified for UTC since the share card
  // doesn't need user-local granularity.
  const days = new Set<number>();
  for (const ts of allTimestamps) days.add(Math.floor(ts / 86_400_000));
  let streak = 0;
  if (days.size > 0) {
    const today = Math.floor(Date.now() / 86_400_000);
    let cursor: number | null = null;
    if (days.has(today)) cursor = today;
    else if (days.has(today - 1)) cursor = today - 1;
    if (cursor != null) {
      while (days.has(cursor)) {
        streak++;
        cursor--;
      }
    }
  }

  // First featured cafe (position 0) — one extra row, no extra cost
  // beyond a single indexed query.
  const [topFeatured] = await db
    .select({
      name: featuredCafes.name,
      relation: featuredCafes.relation,
      ownerVerified: featuredCafes.ownerVerified,
      note: featuredCafes.note,
      ownerPinnedNote: featuredCafes.ownerPinnedNote,
    })
    .from(featuredCafes)
    .where(eq(featuredCafes.userId, owner.id))
    .orderBy(asc(featuredCafes.position))
    .limit(1);

  let featured: ProfileForCard['featured'] = null;
  if (topFeatured) {
    const relation: 'owned' | 'favorite' =
      topFeatured.relation === 'owned' ? 'owned' : 'favorite';
    // Pinned note wins over static note for the snippet — if the owner
    // bothered to refresh "what's brewing this week", that's what they
    // want shared. Truncate aggressively because the OG strip is short.
    const rawSnippet =
      relation === 'owned' && topFeatured.ownerPinnedNote
        ? topFeatured.ownerPinnedNote
        : topFeatured.note ?? null;
    featured = {
      name: topFeatured.name,
      relation,
      verified: relation === 'owned' && topFeatured.ownerVerified === true,
      snippet: rawSnippet ? truncate(rawSnippet.trim(), 80) : null,
    };
  }

  return {
    username: owner.username ?? username,
    displayName: owner.displayName ?? null,
    bio: owner.bio ?? null,
    cups,
    shops,
    streak,
    featured,
  };
}

/** Pinned-cafe banner for the OG card. Renders as nothing when there's
 *  no featured cafe so older profiles still produce the original layout.
 *  Uses word labels ("VERIFIED OWNER" / "OWNS" / "FAVORITE") instead of
 *  emoji icons because satori's default bundled font has no glyphs for
 *  ✓ / 🏠 / ❤ — they'd render as "NO GLYPH" boxes in the share image. */
function renderFeatured(f: ProfileForCard['featured']): string {
  if (!f) return '';
  let label: string;
  let labelColor: string;
  if (f.relation === 'owned') {
    label = f.verified ? 'VERIFIED OWNER' : 'OWNS';
    labelColor = f.verified ? '#2e8b57' : '#a36b3e';
  } else {
    label = 'FAVORITE';
    labelColor = '#a36b3e';
  }
  // 2-line layout when we have a snippet, single line otherwise. Inline
  // styles only — satori doesn't read external CSS.
  const snippet = f.snippet
    ? `<span style="font-size:24px;color:#5a4a3e;margin-top:8px;line-height:1.3;">${escapeSvg(f.snippet)}</span>`
    : '';
  return `
    <div style="display:flex;flex-direction:column;background:#fff4d8;border-radius:14px;padding:18px 24px;margin-top:24px;max-width:1050px;">
      <div style="display:flex;align-items:baseline;">
        <span style="font-size:18px;font-weight:700;color:${labelColor};letter-spacing:0.08em;margin-right:14px;">${label}</span>
        <span style="font-size:30px;font-weight:700;color:#2c1810;letter-spacing:-0.3px;">${escapeSvg(truncate(f.name, 38))}</span>
      </div>
      ${snippet}
    </div>`;
}

function renderTemplate(profile: ProfileForCard): string {
  const heroName = escapeSvg(profile.displayName?.trim() || `@${profile.username}`);
  const handle = profile.displayName ? `@${profile.username}` : null;
  const bio = profile.bio ? truncate(profile.bio, 110) : null;
  const initial = (profile.displayName ?? profile.username)[0]?.toUpperCase() ?? '?';

  // satori (workers-og's renderer) is strict: any <div> with more than
  // one child node must have an explicit `display: flex` or
  // `display: none`. Bare text mixed with siblings counts as multiple
  // children, so we wrap every text run in <span> — that way the
  // template stays valid no matter how the runtime parses whitespace
  // around the JSX-ish HTML.
  return `
<div style="display:flex;flex-direction:column;width:100%;height:100%;background:#fff7ec;font-family:system-ui,sans-serif;color:#2c1810;">
  <div style="display:flex;align-items:center;height:88px;background:#2c1810;color:#fff;padding:0 56px;">
    <div style="display:flex;align-items:center;font-size:32px;font-weight:600;letter-spacing:-0.5px;">
      <span style="font-size:38px;margin-right:14px;">☕</span>
      <span>ACoffee</span>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;flex:1;padding:64px 64px 56px;">
    <div style="display:flex;align-items:center;">
      <div style="display:flex;align-items:center;justify-content:center;width:140px;height:140px;border-radius:9999px;background:#a36b3e;color:#fff;font-size:74px;font-weight:600;font-family:Georgia,serif;letter-spacing:-1px;">
        <span>${escapeSvg(initial)}</span>
      </div>
      <div style="display:flex;flex-direction:column;margin-left:36px;">
        <span style="font-size:64px;font-weight:700;letter-spacing:-1.5px;line-height:1;">${truncate(heroName, 24)}</span>
        ${handle ? `<span style="font-size:30px;color:#7a6a60;margin-top:10px;">${escapeSvg(handle)}</span>` : ''}
      </div>
    </div>
    ${
      bio
        ? `<div style="display:flex;font-size:32px;color:#3a2a20;margin-top:36px;line-height:1.4;max-width:1050px;"><span>${escapeSvg(bio)}</span></div>`
        : '<div style="height:36px;"></div>'
    }
    ${renderFeatured(profile.featured)}
    <div style="display:flex;margin-top:auto;gap:18px;">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;background:#fff;border:1px solid #e8d8c4;border-radius:18px;padding:24px;">
        <span style="font-size:64px;font-weight:700;color:#2c1810;line-height:1;">${profile.cups}</span>
        <span style="font-size:22px;color:#7a6a60;margin-top:10px;letter-spacing:0.5px;">CUPS ☕</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;background:#fff;border:1px solid #e8d8c4;border-radius:18px;padding:24px;">
        <span style="font-size:64px;font-weight:700;color:#2c1810;line-height:1;">${profile.shops}</span>
        <span style="font-size:22px;color:#7a6a60;margin-top:10px;letter-spacing:0.5px;">CAFÉS</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;background:#fff;border:1px solid #e8d8c4;border-radius:18px;padding:24px;">
        <span style="font-size:64px;font-weight:700;color:#2c1810;line-height:1;">${profile.streak}</span>
        <span style="font-size:22px;color:#7a6a60;margin-top:10px;letter-spacing:0.5px;">${profile.streak >= 2 ? 'STREAK 🔥' : 'STREAK'}</span>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;font-size:22px;color:#7a6a60;margin-top:24px;">
      <span>acoffee.com/${escapeSvg(profile.username)}</span>
    </div>
  </div>
</div>`;
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, params }) => {
  const raw = typeof params.username === 'string' ? params.username : null;
  if (!raw) return jsonError('Not found', 404);
  const username = raw.toLowerCase();

  const profile = await loadProfile(env, username);
  if (!profile) return jsonError('Not found', 404);

  return new ImageResponse(renderTemplate(profile), {
    width: 1200,
    height: 630,
    headers: {
      // 10-minute cache: balances fresh share-cards (when a user updates
      // bio / display name they want the social preview to catch up
      // within minutes, not an hour) against re-generating workers-og
      // PNGs on every link-preview bot hit. Bots typically cache the
      // image themselves (Slack ~30d, Twitter ~7d) so actual workers-og
      // load isn't proportional to share volume anyway.
      'cache-control': 'public, max-age=600, s-maxage=600',
    },
  });
};
