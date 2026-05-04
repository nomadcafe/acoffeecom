import { z } from 'zod';
import type { AuthEnv } from '../../_lib/auth';
import { jsonError } from '../../_lib/jsonError';
import { rateLimit, rateLimitResponse } from '../../_lib/rateLimit';
import {
  GoogleMapsError,
  computeRouteMatrix,
  type TravelMode,
} from '../../_lib/googleMaps';

/**
 * Travel-time matrix for the meetup search. Client passes origins
 * (the parties' addresses, geocoded) + destinations (top café
 * candidates) and gets back duration-in-seconds per pair, with `null`
 * for unreachable.
 *
 * The browser can't hit Routes API directly (CORS + key handling), so
 * this thin Pages Function proxies it with our server key. No auth
 * required — same threat model as the Geocoding / Places calls the
 * SPA already makes via the client SDK; rate-limit lives upstream on
 * Google's side and on the booking endpoint's IP throttling for the
 * one path that triggers a write.
 */

const PointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

// Hard caps both sides to keep cost bounded — 5 origins × 8 destinations
// = 40 elements per request, ~$0.20. Beyond that we'd be subsidising
// abuse rather than serving real meetups.
const InputSchema = z.object({
  origins: z.array(PointSchema).min(1).max(5),
  destinations: z.array(PointSchema).min(1).max(8),
  mode: z.enum(['TRANSIT', 'WALK', 'DRIVE']).optional(),
});

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  /* Per-IP rate limit. Each request fans out to Routes API at up to 40
   * elements / ~$0.20 (the schema caps origins×destinations to 5×8). A
   * scripted attacker without a cap could burn real money fast. 30
   * requests per 10 minutes is plenty for genuine search use. */
  const result = await rateLimit(
    request,
    { waitUntil },
    { bucket: 'places-eta', limit: 30, windowSec: 600 },
  );
  if (!result.ok) return rateLimitResponse(result);

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const mode: TravelMode = input.mode ?? 'TRANSIT';
  try {
    const matrix = await computeRouteMatrix(env, input.origins, input.destinations, mode);
    return Response.json({ matrix, mode });
  } catch (e) {
    if (e instanceof GoogleMapsError) {
      // Soft fail: client falls back to distance-based fairness rather
      // than blocking the search. So we 200 + an empty matrix flag.
      console.warn('[places/eta] Routes failed', e.source, e.message);
      return Response.json({ matrix: [], mode, error: e.message });
    }
    throw e;
  }
};
