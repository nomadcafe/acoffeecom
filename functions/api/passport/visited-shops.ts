import { and, eq } from 'drizzle-orm';
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

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  let shop: ReturnType<typeof VisitedShopWireSchema.parse>;
  try {
    shop = VisitedShopWireSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);

  const [prev] = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, shop.id)));

  const merged = mergeVisitedRow(prev, shop);

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
      .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, shop.id)));
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

  const [updated] = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.placeId, shop.id)));

  return Response.json({ shop: rowToWire(updated) });
};
