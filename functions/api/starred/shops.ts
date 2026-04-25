import { and, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { starredShops } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { StarredShopWireSchema, mergeStarredRow, rowToWire } from '../../_lib/starred';

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  let shop: ReturnType<typeof StarredShopWireSchema.parse>;
  try {
    shop = StarredShopWireSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);

  const [prev] = await db
    .select()
    .from(starredShops)
    .where(and(eq(starredShops.userId, user.id), eq(starredShops.placeId, shop.id)));

  const merged = mergeStarredRow(prev, shop);

  if (prev) {
    await db
      .update(starredShops)
      .set({
        name: merged.name,
        address: merged.address,
        lat: merged.lat,
        lng: merged.lng,
        googleMapsUri: merged.googleMapsUri,
        note: merged.note,
        updatedAt: merged.updatedAt,
        deleted: merged.deleted,
      })
      .where(and(eq(starredShops.userId, user.id), eq(starredShops.placeId, shop.id)));
  } else {
    await db.insert(starredShops).values({
      userId: user.id,
      placeId: shop.id,
      name: merged.name,
      address: merged.address,
      lat: merged.lat,
      lng: merged.lng,
      googleMapsUri: merged.googleMapsUri,
      note: merged.note,
      updatedAt: merged.updatedAt,
      deleted: merged.deleted,
    });
  }

  const [updated] = await db
    .select()
    .from(starredShops)
    .where(and(eq(starredShops.userId, user.id), eq(starredShops.placeId, shop.id)));

  return Response.json({ shop: rowToWire(updated) });
};
