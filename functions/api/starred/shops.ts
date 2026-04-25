import { and, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { starredShops } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { StarredShopWireSchema, rowToWire } from '../../_lib/starred';

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
  const now = new Date();

  const [prev] = await db
    .select()
    .from(starredShops)
    .where(and(eq(starredShops.userId, user.id), eq(starredShops.placeId, shop.id)));

  if (prev) {
    await db
      .update(starredShops)
      .set({
        name: shop.name || prev.name,
        address: shop.address || prev.address,
        lat: shop.lat,
        lng: shop.lng,
        googleMapsUri: shop.googleMapsUri ?? prev.googleMapsUri,
        note: shop.note ?? prev.note,
        updatedAt: now,
      })
      .where(and(eq(starredShops.userId, user.id), eq(starredShops.placeId, shop.id)));
  } else {
    await db.insert(starredShops).values({
      userId: user.id,
      placeId: shop.id,
      name: shop.name,
      address: shop.address,
      lat: shop.lat,
      lng: shop.lng,
      googleMapsUri: shop.googleMapsUri,
      note: shop.note,
      updatedAt: now,
    });
  }

  const [updated] = await db
    .select()
    .from(starredShops)
    .where(and(eq(starredShops.userId, user.id), eq(starredShops.placeId, shop.id)));

  return Response.json({ shop: rowToWire(updated) });
};
