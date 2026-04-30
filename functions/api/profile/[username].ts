import { and, asc, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { featuredCafes, user, visitedShops } from '../../_lib/db/schema';
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

type FeaturedCafeRelation = 'owned' | 'favorite';

interface FeaturedCafeLinks {
  instagram: string | null;
  website: string | null;
  menu: string | null;
  bookingExternal: string | null;
}

/** Passport tie-in shown on `favorite` cards: visitor sees "owner has been
 *  here N times, last visit X days ago." `null` if the cafe isn't in the
 *  owner's passport (still featured, just no visit data to display). */
interface FeaturedCafePassport {
  visits: number;
  lastVisitMs: number;
}

interface PublicFeaturedCafe {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  relation: FeaturedCafeRelation;
  position: number;
  note: string | null;
  links: FeaturedCafeLinks;
  /** Only meaningful on `owned` cards; null on `favorite`. */
  ownerPinnedNote: string | null;
  /** True only when relation='owned' and the auto-domain check passed.
   *  Drives the ✓ badge + the search-result reverse-link wording. */
  ownerVerified: boolean;
  /** Visit data joined from passport — only populated for `favorite`
   *  cards (owners visiting their own cafe is implicit, not a credibility
   *  signal). Null when the cafe isn't in the owner's passport. */
  passport: FeaturedCafePassport | null;
}

export interface PublicProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  socialLinks: SocialLink[];
  featuredCafes: PublicFeaturedCafe[];
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

  /* Featured cafés — up to 5, ordered by `position`. We compute the
   *  passport tie-in (visits / last visit) for `favorite` cards by
   *  scanning the rows we already fetched above, so no extra query. */
  const featuredRows = await db
    .select()
    .from(featuredCafes)
    .where(eq(featuredCafes.userId, owner.id))
    .orderBy(asc(featuredCafes.position));

  // Build a placeId → {visits, lastVisitMs} map from the passport data
  // we already loaded for the cup/shop counts. Owned cards skip this
  // entirely (visits there are weird flex-y info, not credibility).
  const passportByPlace = new Map<string, FeaturedCafePassport>();
  for (const r of rows) {
    let visits: number[] = [];
    try {
      const parsed = JSON.parse(r.visits);
      if (Array.isArray(parsed)) {
        visits = parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      }
    } catch {
      /* ignore */
    }
    if (visits.length === 0) continue;
    let last = visits[0];
    for (const v of visits) if (v > last) last = v;
    passportByPlace.set(r.placeId, { visits: visits.length, lastVisitMs: last });
  }

  const featuredCafesPublic: PublicFeaturedCafe[] = featuredRows.map((r) => {
    const relation: FeaturedCafeRelation = r.relation === 'owned' ? 'owned' : 'favorite';
    return {
      placeId: r.placeId,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      relation,
      position: r.position,
      note: r.note ?? null,
      links: {
        instagram: r.linkInstagram ?? null,
        website: r.linkWebsite ?? null,
        menu: r.linkMenu ?? null,
        bookingExternal: r.linkBookingExternal ?? null,
      },
      // Owner pin only on owned cards — keeps the favorite layout clean
      // even if a row has stale text from a relation flip.
      ownerPinnedNote: relation === 'owned' ? r.ownerPinnedNote ?? null : null,
      ownerVerified: relation === 'owned' && r.ownerVerified === true,
      passport: relation === 'favorite' ? passportByPlace.get(r.placeId) ?? null : null,
    };
  });

  const payload: PublicProfile = {
    username,
    displayName: owner.displayName ?? null,
    bio: owner.bio ?? null,
    /* Privacy toggle: when the owner has hidden their social links, the
     * public response simply ships an empty array — same shape, no
     * special-casing needed in the renderer. */
    socialLinks: owner.showSocialLinks === false ? [] : parseSocialLinks(owner.socialLinks),
    featuredCafes: featuredCafesPublic,
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
