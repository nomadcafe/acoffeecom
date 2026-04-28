import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { proposals } from '../../_lib/db/schema';
import { jsonError } from '../../_lib/passport';

/**
 * View + tweak a proposal. GET returns the rendered shape (cafe at
 * current index, time, addresses, mode, status). POST applies one of
 * three tweak actions and returns the new state — same shape. The
 * receiver doesn't need an account or token; the UUID is the secret.
 *
 * The tweak action set is intentionally small in v1:
 *   - accept: marks status='accepted'. Idempotent.
 *   - next-cafe: rotates `cafe_index` through [main, ...alts]. Wraps.
 *   - shift-time: nudges `scheduled_at` ± 30 min in the body's
 *     direction.
 *
 * "Closer to me / quieter / cheaper" deferred until v2 — those need
 * a server-side re-search which is a bigger code change. The current
 * shape lets the receiver express "this isn't the right cafe / time"
 * with the alternates we pre-stored at creation time.
 */

interface CafeAlt {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface ProposalView {
  id: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  scheduledAt: number;
  expiresAt: number;
  mode: 'fair' | 'fast' | 'vibe' | 'quiet' | 'cheap' | 'now';
  addresses: string[];
  cafe: CafeAlt;
  altCount: number;
  cafeIndex: number;
}

function rowToView(row: typeof proposals.$inferSelect): ProposalView {
  const alts = parseJsonArray<CafeAlt>(row.altCafesJson);
  // The "current" cafe = the main one (index 0) or one of the alts.
  // Index 0 maps to the main cafe stored on the row; 1..N map to alts.
  const all: CafeAlt[] = [
    {
      placeId: row.cafePlaceId,
      name: row.cafeName,
      address: row.cafeAddress,
      lat: row.cafeLat,
      lng: row.cafeLng,
    },
    ...alts,
  ];
  const idx = Math.min(Math.max(row.cafeIndex, 0), all.length - 1);
  const expiresMs =
    row.expiresAt instanceof Date ? row.expiresAt.getTime() : Number(row.expiresAt);
  const isExpired = expiresMs < Date.now();
  return {
    id: row.id,
    status: isExpired ? 'expired' : (row.status as ProposalView['status']),
    scheduledAt:
      row.scheduledAt instanceof Date ? row.scheduledAt.getTime() : Number(row.scheduledAt),
    expiresAt: expiresMs,
    mode: row.mode as ProposalView['mode'],
    addresses: parseJsonArray<string>(row.addressesJson),
    cafe: all[idx],
    altCount: all.length,
    cafeIndex: idx,
  };
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, params }) => {
  const id = typeof params.id === 'string' ? params.id : '';
  if (!id) return jsonError('Missing id', 400);

  const db = getDb(env);
  const [row] = await db.select().from(proposals).where(eq(proposals.id, id));
  if (!row) return jsonError('Proposal not found', 404);

  return Response.json(rowToView(row));
};

const ActionSchema = z.union([
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('next-cafe') }),
  z.object({
    action: z.literal('shift-time'),
    minutes: z.number().int().min(-720).max(720),
  }),
]);

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, params }) => {
  const id = typeof params.id === 'string' ? params.id : '';
  if (!id) return jsonError('Missing id', 400);

  let input: z.infer<typeof ActionSchema>;
  try {
    input = ActionSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);
  const [row] = await db.select().from(proposals).where(eq(proposals.id, id));
  if (!row) return jsonError('Proposal not found', 404);

  const expiresMs =
    row.expiresAt instanceof Date ? row.expiresAt.getTime() : Number(row.expiresAt);
  if (expiresMs < Date.now()) {
    return jsonError('Proposal has expired', 410);
  }
  if (row.status === 'cancelled') {
    return jsonError('Proposal was cancelled', 410);
  }

  if (input.action === 'accept') {
    if (row.status !== 'accepted') {
      await db.update(proposals).set({ status: 'accepted' }).where(eq(proposals.id, id));
    }
  } else if (input.action === 'next-cafe') {
    const altCount = parseJsonArray<CafeAlt>(row.altCafesJson).length + 1; // +main
    const nextIdx = (row.cafeIndex + 1) % Math.max(altCount, 1);
    await db.update(proposals).set({ cafeIndex: nextIdx }).where(eq(proposals.id, id));
  } else if (input.action === 'shift-time') {
    const cur =
      row.scheduledAt instanceof Date
        ? row.scheduledAt.getTime()
        : Number(row.scheduledAt);
    const next = cur + input.minutes * 60_000;
    // Don't let the time go into the past (a shift-back from 5pm to 4pm
    // when it's already 4:30pm is meaningless).
    const floor = Date.now() + 5 * 60_000;
    const safeNext = Math.max(next, floor);
    await db
      .update(proposals)
      .set({ scheduledAt: new Date(safeNext) })
      .where(eq(proposals.id, id));
  }

  const [updated] = await db.select().from(proposals).where(eq(proposals.id, id));
  return Response.json(rowToView(updated));
};
