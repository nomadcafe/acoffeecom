import { z } from 'zod';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { proposals } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';

/**
 * Create a lightweight coffee meetup proposal. Sender must be signed in
 * (for the "Alice accepted your coffee" notification path); receiver
 * stays fully anonymous — `/p/<uuid>` resolves for anyone with the
 * link. The id is the only secret — UUID v4 has 122 bits of entropy so
 * direct enumeration isn't realistic.
 *
 * Distinct from /api/booking which is the full Calendly-for-coffee
 * flow (double-opt-in, .ics, host calendar). Proposals are for casual
 * "want to grab coffee?" pings between friends. The sender-must-sign-in
 * rule is what makes the receiver's tweak buttons functional — without
 * a sender email there'd be no notification path back, and the buttons
 * would be decoration.
 */

const CafeSchema = z.object({
  placeId: z.string().min(1).max(256),
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(400),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

const InputSchema = z.object({
  cafe: CafeSchema,
  altCafes: z.array(CafeSchema).max(4),
  // Up to a year out — way more than the 24h TTL but generous for
  // someone planning an "in two weeks" coffee.
  scheduledAt: z.number().int().positive(),
  addresses: z.array(z.string().trim().max(400)).max(3),
  mode: z.enum(['fair', 'fast', 'vibe', 'quiet', 'cheap', 'now']).default('fair'),
});

const PROPOSAL_TTL_MS = 72 * 60 * 60_000; // 3 days; matches "let me think on it"

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  // Sender must be signed in. Their email is what powers the
  // "receiver accepted" notification — without it, the tweak buttons
  // on the proposal page would just silently mutate the DB and the
  // sender would never know. UI gates the button on auth state, so a
  // 401 here means the user bypassed that gate.
  /* Don't silently swallow getSessionUser errors — a thrown promise
   * here can mean DB down, AUTH_SECRET rotated, Better Auth broken, or
   * just an unauthenticated request. Logging surfaces the diagnostic
   * cases without changing the user-facing 401 (we still want clients
   * to retry sign-in rather than see a noisy 500). */
  const sessionUser = await getSessionUser(env, request).catch((err) => {
    console.error('[proposals] getSessionUser failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  if (!sessionUser) {
    return jsonError('Sign in to create a proposal', 401);
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS);

  const db = getDb(env);
  await db.insert(proposals).values({
    id,
    senderUserId: sessionUser.id,
    cafePlaceId: input.cafe.placeId,
    cafeName: input.cafe.name,
    cafeAddress: input.cafe.address,
    cafeLat: input.cafe.lat,
    cafeLng: input.cafe.lng,
    scheduledAt: new Date(input.scheduledAt),
    addressesJson: JSON.stringify(input.addresses),
    mode: input.mode,
    altCafesJson: JSON.stringify(input.altCafes),
    cafeIndex: 0,
    status: 'pending',
    createdAt: now,
    expiresAt,
  });

  return Response.json({
    id,
    url: `https://acoffee.com/p/${id}`,
    expiresAt: expiresAt.getTime(),
  });
};
