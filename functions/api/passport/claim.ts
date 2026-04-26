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
          visitNotes: JSON.stringify(merged.visitNotes),
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
        visitNotes: JSON.stringify(merged.visitNotes),
        updatedAt: merged.updatedAt,
        deleted: merged.deleted,
      });
    }
  }

  // Compute cursor over EVERY row (incl. tombstones) so the client's pull
  // cursor starts past anything currently on the server.
  const allRows = await db
    .select()
    .from(visitedShops)
    .where(eq(visitedShops.userId, user.id));
  let cursor = 0;
  for (const r of allRows) {
    const ms = r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt);
    if (ms > cursor) cursor = ms;
  }

  const alive = allRows.filter((r) => !r.deleted);
  return Response.json({ shops: alive.map(rowToWire), cursor });
};
