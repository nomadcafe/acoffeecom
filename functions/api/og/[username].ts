import { ImageResponse } from 'workers-og';
import { and, eq } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user, visitedShops } from '../../_lib/db/schema';
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

  return {
    username: owner.username ?? username,
    displayName: owner.displayName ?? null,
    bio: owner.bio ?? null,
    cups,
    shops,
    streak,
  };
}

function renderTemplate(profile: ProfileForCard): string {
  const heroName = escapeSvg(profile.displayName?.trim() || `@${profile.username}`);
  const handle = profile.displayName ? `@${profile.username}` : null;
  const bio = profile.bio ? truncate(profile.bio, 110) : null;
  const initial = (profile.displayName ?? profile.username)[0]?.toUpperCase() ?? '?';

  // Layout: brown banner top, big initial-circle, name + handle + bio,
  // stat tiles row, ACoffee mark bottom-right. Inline styles only since
  // satori (which workers-og uses) supports a flexbox subset.
  return `
<div style="display:flex;flex-direction:column;width:100%;height:100%;background:#fff7ec;font-family:system-ui,sans-serif;color:#2c1810;">
  <div style="display:flex;align-items:center;height:88px;background:#2c1810;color:#fff;padding:0 56px;">
    <div style="display:flex;align-items:center;font-size:32px;font-weight:600;letter-spacing:-0.5px;">
      <span style="font-size:38px;margin-right:14px;">☕</span>
      ACoffee
    </div>
  </div>
  <div style="display:flex;flex-direction:column;flex:1;padding:64px 64px 56px;">
    <div style="display:flex;align-items:center;">
      <div style="display:flex;align-items:center;justify-content:center;width:140px;height:140px;border-radius:9999px;background:#a36b3e;color:#fff;font-size:74px;font-weight:600;font-family:Georgia,serif;letter-spacing:-1px;">
        ${escapeSvg(initial)}
      </div>
      <div style="display:flex;flex-direction:column;margin-left:36px;">
        <div style="font-size:64px;font-weight:700;letter-spacing:-1.5px;line-height:1;">${truncate(heroName, 24)}</div>
        ${handle ? `<div style="font-size:30px;color:#7a6a60;margin-top:10px;">${escapeSvg(handle)}</div>` : ''}
      </div>
    </div>
    ${
      bio
        ? `<div style="font-size:32px;color:#3a2a20;margin-top:36px;line-height:1.4;max-width:1050px;">${escapeSvg(bio)}</div>`
        : '<div style="height:36px;"></div>'
    }
    <div style="display:flex;margin-top:auto;gap:18px;">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;background:#fff;border:1px solid #e8d8c4;border-radius:18px;padding:24px;">
        <div style="font-size:64px;font-weight:700;color:#2c1810;line-height:1;">${profile.cups}</div>
        <div style="font-size:22px;color:#7a6a60;margin-top:10px;letter-spacing:0.5px;">CUPS ☕</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;background:#fff;border:1px solid #e8d8c4;border-radius:18px;padding:24px;">
        <div style="font-size:64px;font-weight:700;color:#2c1810;line-height:1;">${profile.shops}</div>
        <div style="font-size:22px;color:#7a6a60;margin-top:10px;letter-spacing:0.5px;">CAFÉS</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;background:#fff;border:1px solid #e8d8c4;border-radius:18px;padding:24px;">
        <div style="font-size:64px;font-weight:700;color:#2c1810;line-height:1;">${profile.streak}</div>
        <div style="font-size:22px;color:#7a6a60;margin-top:10px;letter-spacing:0.5px;">${profile.streak >= 2 ? 'STREAK 🔥' : 'STREAK'}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;font-size:22px;color:#7a6a60;margin-top:24px;">
      acoffee.com/${escapeSvg(profile.username)}
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
