import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { visitedShops } from '../../_lib/db/schema';
import {
  VisitedShopWireSchema,
  getSessionUser,
  jsonError,
  mergeVisits,
  rowToWire,
} from '../../_lib/passport';

const InputSchema = z.object({
  shops: z.array(VisitedShopWireSchema).max(1000),
});

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);
  const now = new Date();

  // Pull existing rows for the placeIds being claimed, so we can union visits
  // rather than overwrite. Empty `shops` → still return the user's full state.
  const incomingIds = input.shops.map((s) => s.id);
  const existing = incomingIds.length
    ? await db
        .select()
        .from(visitedShops)
        .where(
          and(eq(visitedShops.userId, user.id), inArray(visitedShops.placeId, incomingIds)),
        )
    : [];
  const existingByPlaceId = new Map(existing.map((r) => [r.placeId, r] as const));

  for (const shop of input.shops) {
    const prev = existingByPlaceId.get(shop.id);
    const mergedVisits = mergeVisits(shop.visits, prev ? rowToWire(prev).visits : []);
    if (mergedVisits.length === 0) continue; // never insert a stamp-less row

    if (prev) {
      // Keep server's name/address if client sent something blanker; otherwise prefer client.
      await db
        .update(visitedShops)
        .set({
          name: shop.name || prev.name,
          address: shop.address || prev.address,
          lat: shop.lat,
          lng: shop.lng,
          googleMapsUri: shop.googleMapsUri ?? prev.googleMapsUri,
          city: shop.city ?? prev.city,
          visits: JSON.stringify(mergedVisits),
          updatedAt: now,
        })
        .where(
          and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, shop.id)),
        );
    } else {
      await db.insert(visitedShops).values({
        userId: user.id,
        placeId: shop.id,
        name: shop.name,
        address: shop.address,
        lat: shop.lat,
        lng: shop.lng,
        googleMapsUri: shop.googleMapsUri,
        city: shop.city,
        visits: JSON.stringify(mergedVisits),
        updatedAt: now,
      });
    }
  }

  const all = await db
    .select()
    .from(visitedShops)
    .where(eq(visitedShops.userId, user.id));

  return Response.json({ shops: all.map(rowToWire) });
};
