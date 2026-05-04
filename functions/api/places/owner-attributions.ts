import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { featuredCafes, user } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';
import { rateLimit, rateLimitResponse } from '../../_lib/rateLimit';

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
  /* Mirrors featured_cafes.relation: 'owned' tags the cafe owner so the
   * chip reads "@user 经营 / Owned by @user"; 'favorite' is the looser
   * default for anyone just highlighting a cafe they like. Older cached
   * entries may lack the field — readers default to 'favorite'. */
  relation: 'owned' | 'favorite';
  /* True only for 'owned' rows where the email-domain auto-verify check
   * passed. Drives whether the chip can say "Owned by" (verified) vs
   * fall back to "Shared by" wording. Older cache entries default to
   * false. */
  verified: boolean;
}

const CACHE_TTL_S = 300;
const CACHE_PREFIX = 'owner:';
const NEGATIVE_MARKER = '__none__';

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  /* Per-IP rate limit. Each request fans out to up to 20 D1 SELECTs (the
   * KV negative cache absorbs popular cafes but a fresh-id flood would
   * still hammer D1). 60 requests per 10 minutes covers genuine search
   * use; beyond that is scraping / abuse. */
  const result = await rateLimit(
    request,
    { waitUntil },
    { bucket: 'places-owner-attr', limit: 60, windowSec: 600 },
  );
  if (!result.ok) return rateLimitResponse(result);

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
              // / verified fields — fall back to safe defaults rather
              // than re-querying.
              result[placeId] = {
                username: parsed.username,
                displayName: parsed.displayName ?? null,
                relation: parsed.relation === 'owned' ? 'owned' : 'favorite',
                verified: parsed.verified === true,
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
      placeId: featuredCafes.placeId,
      username: user.username,
      displayName: user.displayName,
      relation: featuredCafes.relation,
      verified: featuredCafes.ownerVerified,
    })
    .from(featuredCafes)
    .innerJoin(user, eq(user.id, featuredCafes.userId))
    .where(
      and(eq(user.profilePublic, true), inArray(featuredCafes.placeId, missing)),
    );

  /* Multiple users can feature the same Place (a manager + a regular).
   * Tie-break tier order:
   *   1. owned + verified  (real, claimed owner)
   *   2. owned + unverified (claimed but no domain match)
   *   3. favorite           (someone who likes it)
   * Within a tier, DB-iteration order wins; stricter tie-breaks (newest
   * verification, followers) can come later if we see real conflicts. */
  const tierRank = (a: Pick<Attribution, 'relation' | 'verified'>) =>
    a.relation === 'owned' ? (a.verified ? 2 : 1) : 0;

  const dbHits = new Map<string, Attribution>();
  for (const r of rows) {
    if (!r.placeId || !r.username) continue;
    const relation: 'owned' | 'favorite' = r.relation === 'owned' ? 'owned' : 'favorite';
    // ownerVerified only makes sense for 'owned' rows; force false on
    // favorites so the chip wording layer can rely on (relation, verified)
    // alone without re-checking.
    const verified = relation === 'owned' && r.verified === true;
    const candidate: Attribution = {
      username: r.username,
      displayName: r.displayName ?? null,
      relation,
      verified,
    };
    const existing = dbHits.get(r.placeId);
    if (!existing || tierRank(candidate) > tierRank(existing)) {
      dbHits.set(r.placeId, candidate);
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
