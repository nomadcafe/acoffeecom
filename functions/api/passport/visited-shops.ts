import { and, eq } from 'drizzle-orm';
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

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  let shop: ReturnType<typeof VisitedShopWireSchema.parse>;
  try {
    shop = VisitedShopWireSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  if (shop.visits.length === 0) {
    return jsonError('Cannot upsert a shop with no visits — use DELETE to remove', 400);
  }

  const db = getDb(env);
  const now = new Date();

  const [prev] = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, shop.id)));

  const mergedVisits = mergeVisits(shop.visits, prev ? rowToWire(prev).visits : []);

  if (prev) {
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
      .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, shop.id)));
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

  const [updated] = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, shop.id)));

  return Response.json({ shop: rowToWire(updated) });
};
