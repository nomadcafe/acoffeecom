import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';

/**
 * Reverse-link lookup for the agent results: given a list of Google Place
 * IDs, return any that match a public ACoffee profile's "featured cafe."
 * Powers the small `↗ shared by @username` chip on CoffeeShopCard.
 *
 * Cache strategy — per Place ID in KV with a 5-minute TTL:
 *  - positive hit: stored as `{username, displayName}` JSON
 *  - negative hit: stored as the literal string `__none__`
 *
 * Caching the negative case matters: most cafes have no owner profile, so
 * a popular cafe's placeId would otherwise hit D1 on every search. 5 min
 * is short enough that a brand-new owner profile becomes discoverable
 * within minutes — long enough to absorb the typical search burst.
 *
 * No auth: same threat model as `/api/places/eta`. The data is already
 * public (anyone can fetch the profile directly), this just batches the
 * lookup.
 */

const InputSchema = z.object({
  placeIds: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
});

interface Attribution {
  username: string;
  displayName: string | null;
  /* Mirrors user.ownerCafeRelation: 'owned' tags the cafe owner so the chip
   * reads "@user 经营 / Owned by @user"; 'favorite' is the looser default
   * for anyone just highlighting a cafe they like. Older cached entries
   * may lack the field — readers default it to 'favorite'. */
  relation: 'owned' | 'favorite';
}

const CACHE_TTL_S = 300;
const CACHE_PREFIX = 'owner:';
const NEGATIVE_MARKER = '__none__';

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const uniqueIds = Array.from(new Set(input.placeIds));
  const result: Record<string, Attribution> = {};
  const missing: string[] = [];

  const kv = env.ROUTES_CACHE;
  if (kv) {
    await Promise.all(
      uniqueIds.map(async (placeId) => {
        const cached = await kv.get(`${CACHE_PREFIX}${placeId}`);
        if (cached === null) {
          missing.push(placeId);
        } else if (cached === NEGATIVE_MARKER) {
          /* cached "no owner" — skip, don't refetch */
        } else {
          try {
            const parsed = JSON.parse(cached) as Partial<Attribution>;
            if (parsed && typeof parsed.username === 'string') {
              // Tolerate legacy cache entries that pre-date the relation
              // field — fall back to 'favorite' rather than re-querying.
              result[placeId] = {
                username: parsed.username,
                displayName: parsed.displayName ?? null,
                relation: parsed.relation === 'owned' ? 'owned' : 'favorite',
              };
            } else {
              missing.push(placeId);
            }
          } catch {
            missing.push(placeId);
          }
        }
      }),
    );
  } else {
    missing.push(...uniqueIds);
  }

  if (missing.length === 0) {
    return Response.json({ attributions: result });
  }

  const db = getDb(env);
  const rows = await db
    .select({
      placeId: user.ownerCafePlaceId,
      username: user.username,
      displayName: user.displayName,
      relation: user.ownerCafeRelation,
    })
    .from(user)
    .where(
      and(eq(user.profilePublic, true), inArray(user.ownerCafePlaceId, missing)),
    );

  /* Multiple users can mark the same Place as featured (e.g. a manager and
   * a barista at the same shop). Tie-break: prefer 'owned' over 'favorite'
   * — if a real cafe owner has claimed the place, their chip is the more
   * useful one to surface; favorites are a fallback. Within the same
   * relation tier the DB-iteration order wins; we'll add a stricter
   * tie-break (created_at, follower count) only if we see real conflicts. */
  const dbHits = new Map<string, Attribution>();
  for (const r of rows) {
    if (!r.placeId || !r.username) continue;
    const relation: 'owned' | 'favorite' =
      r.relation === 'owned' ? 'owned' : 'favorite';
    const existing = dbHits.get(r.placeId);
    if (!existing || (existing.relation !== 'owned' && relation === 'owned')) {
      dbHits.set(r.placeId, {
        username: r.username,
        displayName: r.displayName ?? null,
        relation,
      });
    }
  }

  await Promise.all(
    missing.map(async (placeId) => {
      const hit = dbHits.get(placeId);
      if (hit) {
        result[placeId] = hit;
        if (kv) {
          await kv.put(`${CACHE_PREFIX}${placeId}`, JSON.stringify(hit), {
            expirationTtl: CACHE_TTL_S,
          });
        }
      } else if (kv) {
        await kv.put(`${CACHE_PREFIX}${placeId}`, NEGATIVE_MARKER, {
          expirationTtl: CACHE_TTL_S,
        });
      }
    }),
  );

  return Response.json({ attributions: result });
};
