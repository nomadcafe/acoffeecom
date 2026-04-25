import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { visitedShops } from '../../_lib/db/schema';
import {
  VisitedShopWireSchema,
  getSessionUser,
  jsonError,
  mergeVisitedRow,
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
    const merged = mergeVisitedRow(prev, shop);
    if (!prev && merged.visits.length === 0 && !merged.deleted) continue;

    if (prev) {
      await db
        .update(visitedShops)
        .set({
          name: merged.name,
          address: merged.address,
          lat: merged.lat,
          lng: merged.lng,
          googleMapsUri: merged.googleMapsUri,
          city: merged.city,
          visits: JSON.stringify(merged.visits),
          updatedAt: merged.updatedAt,
          deleted: merged.deleted,
        })
        .where(
          and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, shop.id)),
        );
    } else {
      await db.insert(visitedShops).values({
        userId: user.id,
        placeId: shop.id,
        name: merged.name,
        address: merged.address,
        lat: merged.lat,
        lng: merged.lng,
        googleMapsUri: merged.googleMapsUri,
        city: merged.city,
        visits: JSON.stringify(merged.visits),
        updatedAt: merged.updatedAt,
        deleted: merged.deleted,
      });
    }
  }

  const all = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.deleted, false)));

  return Response.json({ shops: all.map(rowToWire) });
};
