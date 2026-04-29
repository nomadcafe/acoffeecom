import { and, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user, visitedShops } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';

interface PublicShop {
  id: string;
  name: string;
  city: string | null;
  visits: number;
}

interface SocialLink {
  label: string;
  url: string;
}

interface OwnerCafe {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface PublicProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  socialLinks: SocialLink[];
  ownerCafe: OwnerCafe | null;
  memberSince: number;
  cups: number;
  shops: number;
  streak: number;
  topShops: PublicShop[];
}

function parseSocialLinks(raw: string | null | undefined): SocialLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is SocialLink =>
          l &&
          typeof l === 'object' &&
          typeof (l as SocialLink).label === 'string' &&
          typeof (l as SocialLink).url === 'string' &&
          /^https?:\/\//i.test((l as SocialLink).url),
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Public read — no auth required, but the response is the same 404 whether
 * the user doesn't exist OR exists with profile_public=false. Don't leak
 * username existence to scrapers building a name list.
 *
 * Privacy choices in the response:
 *  - No raw timestamps (would expose pattern-of-life)
 *  - No exact addresses on the public top-shops list (just city)
 *  - Streak is rounded by day (it already is, by virtue of computeStreak)
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, params }) => {
  const raw = typeof params.username === 'string' ? params.username : null;
  if (!raw) return jsonError('Not found', 404);
  const username = raw.toLowerCase();

  const db = getDb(env);
  const [owner] = await db
    .select()
    .from(user)
    .where(and(eq(user.username, username), eq(user.profilePublic, true)));
  if (!owner) return jsonError('Not found', 404);

  // Pull alive visited rows; aggregate to wire shape.
  const rows = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, owner.id), eq(visitedShops.deleted, false)));

  const allTimestamps: number[] = [];
  const shopsAgg: PublicShop[] = [];
  for (const r of rows) {
    let visits: number[] = [];
    try {
      const parsed = JSON.parse(r.visits);
      if (Array.isArray(parsed)) {
        visits = parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      }
    } catch {
      /* ignore malformed */
    }
    if (visits.length === 0) continue;
    allTimestamps.push(...visits);
    shopsAgg.push({
      id: r.placeId,
      name: r.name,
      city: r.city ?? null,
      visits: visits.length,
    });
  }

  shopsAgg.sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
  const topShops = shopsAgg.slice(0, 5);

  // Streak: same logic as client-side computeStreak — day buckets in UTC for
  // a stable response across server timezones. Privacy-wise this only reveals
  // "consecutive days of activity", not specific times.
  const days = new Set<number>();
  for (const ts of allTimestamps) {
    days.add(Math.floor(ts / 86_400_000));
  }
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

  const memberSince =
    owner.createdAt instanceof Date ? owner.createdAt.getTime() : Number(owner.createdAt);

  /* Featured cafe — only render if all five fields are present. The
   * schema allows the four display columns to be NULL independently, so
   * the server-side guard avoids leaking a half-populated card. */
  const ownerCafe: OwnerCafe | null =
    owner.ownerCafePlaceId &&
    owner.ownerCafeName &&
    owner.ownerCafeAddress &&
    typeof owner.ownerCafeLat === 'number' &&
    typeof owner.ownerCafeLng === 'number'
      ? {
          placeId: owner.ownerCafePlaceId,
          name: owner.ownerCafeName,
          address: owner.ownerCafeAddress,
          lat: owner.ownerCafeLat,
          lng: owner.ownerCafeLng,
        }
      : null;

  const payload: PublicProfile = {
    username,
    displayName: owner.displayName ?? null,
    bio: owner.bio ?? null,
    /* Privacy toggle: when the owner has hidden their social links, the
     * public response simply ships an empty array — same shape, no
     * special-casing needed in the renderer. */
    socialLinks: owner.showSocialLinks === false ? [] : parseSocialLinks(owner.socialLinks),
    ownerCafe,
    memberSince,
    cups: allTimestamps.length,
    shops: shopsAgg.length,
    streak,
    topShops,
  };

  return Response.json(payload, {
    // Public, cacheable at the edge — but kept short so visibility-toggle
    // changes propagate within a minute.
    headers: { 'cache-control': 'public, max-age=60, s-maxage=60' },
  });
};
