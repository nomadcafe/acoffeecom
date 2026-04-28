import { z } from 'zod';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { proposals } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';

/**
 * Create a lightweight coffee meetup proposal. Sender posts the cafe
 * + alternates + suggested time + addresses; we mint a UUID and return
 * the share URL `/p/<id>`. The id is the only secret — UUID v4 has 122
 * bits of entropy so direct enumeration isn't realistic. No email
 * verification, no host account required.
 *
 * Distinct from /api/booking which is the full Calendly-for-coffee
 * flow (double-opt-in, .ics, host calendar). Proposals are for casual
 * "want to grab coffee?" pings between friends.
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

  // Optional sender-id — anonymous proposals still work, but logged-in
  // senders get the row tied to their account so a future "my proposals"
  // dashboard can list them.
  const sessionUser = await getSessionUser(env, request).catch(() => null);

  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS);

  const db = getDb(env);
  await db.insert(proposals).values({
    id,
    senderUserId: sessionUser?.id ?? null,
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
