import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { starredShops } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { StarredShopWireSchema, mergeStarredRow, rowToWire } from '../../_lib/starred';

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
        .where(
          and(eq(starredShops.userId, user.id), eq(starredShops.placeId, shop.id)),
        );
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
  }

  const all = await db
    .select()
    .from(starredShops)
    .where(and(eq(starredShops.userId, user.id), eq(starredShops.deleted, false)));

  return Response.json({ shops: all.map(rowToWire) });
};
