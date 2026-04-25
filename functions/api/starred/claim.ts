import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { starredShops } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { StarredShopWireSchema, pickNote, rowToWire } from '../../_lib/starred';

const InputSchema = z.object({
  shops: z.array(StarredShopWireSchema).max(1000),
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

  const incomingIds = input.shops.map((s) => s.id);
  const existing = incomingIds.length
    ? await db
        .select()
        .from(starredShops)
        .where(
          and(eq(starredShops.userId, user.id), inArray(starredShops.placeId, incomingIds)),
        )
    : [];
  const existingByPlaceId = new Map(existing.map((r) => [r.placeId, r] as const));

  for (const shop of input.shops) {
    const prev = existingByPlaceId.get(shop.id);
    if (prev) {
      await db
        .update(starredShops)
        .set({
          name: shop.name || prev.name,
          address: shop.address || prev.address,
          lat: shop.lat,
          lng: shop.lng,
          googleMapsUri: shop.googleMapsUri ?? prev.googleMapsUri,
          note: pickNote(shop.note, prev.note),
          updatedAt: now,
        })
        .where(
          and(eq(starredShops.userId, user.id), eq(starredShops.placeId, shop.id)),
        );
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
  }

  const all = await db
    .select()
    .from(starredShops)
    .where(eq(starredShops.userId, user.id));

  return Response.json({ shops: all.map(rowToWire) });
};
