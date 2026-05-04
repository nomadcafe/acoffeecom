import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/jsonError';
import {
  GoogleMapsError,
  geocodeAddress,
  midpointOf,
  pickBestCafe,
  searchNearbyCafes,
} from '../../_lib/googleMaps';

/**
 * Public preview endpoint — given a published profile's username and a
 * visitor's address, returns the midpoint and the auto-picked café. No
 * persistence, no email; this is the moat shown to the visitor *before*
 * they confirm a booking. The booking itself (Phase 2.B follow-up) will
 * call the same internal logic and persist the chosen café.
 *
 * Validation pipeline:
 *  1. Username must reference a user with `profile_public=true` *and* a
 *     `home_base_address` set — otherwise no second endpoint for the
 *     midpoint, no preview is meaningful.
 *  2. Both addresses geocode; either failing returns 404/422 with a
 *     human-friendly message.
 *  3. Places search around the midpoint; we score by rating ×
 *     log(reviews+1) so a single-review 5★ doesn't beat a 200-review 4.5★.
 *
 * Public (no auth) by design — visitors aren't necessarily ACoffee users.
 */

const InputSchema = z.object({
  username: z.string().trim().min(1).max(40),
  visitorAddress: z.string().trim().min(2).max(200),
});

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }
  const username = input.username.toLowerCase();

  const db = getDb(env);
  const [organizer] = await db
    .select({
      homeBaseAddress: user.homeBaseAddress,
      profilePublic: user.profilePublic,
    })
    .from(user)
    .where(and(eq(user.username, username), eq(user.profilePublic, true)));

  if (!organizer) return jsonError('Profile not found', 404);
  if (!organizer.homeBaseAddress) {
    return jsonError("This user hasn't set up bookings yet", 404);
  }

  let organizerLoc, visitorLoc;
  try {
    [organizerLoc, visitorLoc] = await Promise.all([
      geocodeAddress(env, organizer.homeBaseAddress),
      geocodeAddress(env, input.visitorAddress),
    ]);
  } catch (e) {
    if (e instanceof GoogleMapsError) {
      return jsonError(`Couldn't find that address — ${e.message}`, e.status);
    }
    throw e;
  }

  const midpoint = midpointOf(organizerLoc, visitorLoc);

  let cafe;
  try {
    const candidates = await searchNearbyCafes(env, midpoint, 1500, 10);
    cafe = pickBestCafe(candidates);
  } catch (e) {
    if (e instanceof GoogleMapsError) {
      return jsonError(`Café search failed — ${e.message}`, e.status);
    }
    throw e;
  }

  if (!cafe) {
    // No café within a 1.5km radius — fall back to a wider search before
    // giving up so two suburban addresses still get a meeting point.
    try {
      const widened = await searchNearbyCafes(env, midpoint, 5000, 10);
      cafe = pickBestCafe(widened);
    } catch (e) {
      if (e instanceof GoogleMapsError) {
        return jsonError(`Café search failed — ${e.message}`, e.status);
      }
      throw e;
    }
  }

  if (!cafe) return jsonError('No nearby cafés found', 404);

  return Response.json(
    {
      midpoint,
      cafe,
    },
    {
      // Don't cache — addresses are user-supplied PII and the response is
      // derived from them. Edge caching one user's preview onto another
      // user would be a privacy bug.
      headers: { 'cache-control': 'private, no-store' },
    },
  );
};
