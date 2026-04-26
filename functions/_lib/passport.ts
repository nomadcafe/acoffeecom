import { z } from 'zod';
import { createAuth, type AuthEnv } from './auth';
import { visitedShops } from './db/schema';

// Wire format mirrors `VisitedShopSnapshot` in src/types/index.ts.
// DB stores visits as JSON; the client always sees number[].
// `updatedAt` is the LWW key for non-visit fields; `visits` itself is always
// merged (append-only union) regardless of which side is newer.
export const VisitedShopWireSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  address: z.string().max(1024),
  lat: z.number().finite(),
  lng: z.number().finite(),
  googleMapsUri: z.string().url().max(1024).optional(),
  city: z.string().max(128).optional(),
  visits: z.array(z.number().int().nonnegative()).max(2000),
  updatedAt: z.number().int().nonnegative(),
  deleted: z.boolean().optional(),
});
export type VisitedShopWire = z.infer<typeof VisitedShopWireSchema>;

export type VisitedShopRow = typeof visitedShops.$inferSelect;

export function rowToWire(row: VisitedShopRow): VisitedShopWire {
  return {
    id: row.placeId,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    googleMapsUri: row.googleMapsUri ?? undefined,
    city: row.city ?? undefined,
    visits: parseVisits(row.visits),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : (row.updatedAt as unknown as number),
    deleted: row.deleted || undefined,
  };
}

function parseVisits(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === 'number' && Number.isFinite(n));
  } catch {
    return [];
  }
}

// Union two visit arrays, sort newest-first, collapse consecutive timestamps
// within 60s of an earlier-kept one (treat as accidental double-tap).
const DEDUPE_WINDOW_MS = 60_000;
export function mergeVisits(a: number[], b: number[]): number[] {
  const all = [...a, ...b]
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
    .sort((x, y) => y - x);
  const out: number[] = [];
  for (const ts of all) {
    if (out.length === 0 || out[out.length - 1] - ts >= DEDUPE_WINDOW_MS) {
      out.push(ts);
    }
  }
  return out;
}

function asMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return 0;
}

/**
 * LWW row merge for visited_shops. `visits` always unions (append-only history);
 * other fields take the side with the newer `updatedAt`. If incoming is older,
 * we still merge in its visits so an offline-queued upsert never silently loses
 * the visit timestamp the user recorded — the row's display state stays prev's.
 */
export function mergeVisitedRow(prev: VisitedShopRow | undefined, incoming: VisitedShopWire) {
  const incomingDeleted = incoming.deleted ?? false;
  if (!prev) {
    return {
      name: incoming.name,
      address: incoming.address,
      lat: incoming.lat,
      lng: incoming.lng,
      googleMapsUri: incoming.googleMapsUri ?? null,
      city: incoming.city ?? null,
      visits: incoming.visits,
      updatedAt: new Date(incoming.updatedAt),
      deleted: incomingDeleted,
    };
  }
  const prevTs = asMs(prev.updatedAt);
  const prevVisits = parseVisits(prev.visits);
  const visits = mergeVisits(incoming.visits, prevVisits);
  if (incoming.updatedAt > prevTs) {
    return {
      name: incoming.name || prev.name,
      address: incoming.address || prev.address,
      lat: incoming.lat,
      lng: incoming.lng,
      googleMapsUri: incoming.googleMapsUri ?? prev.googleMapsUri,
      city: incoming.city ?? prev.city,
      visits,
      updatedAt: new Date(incoming.updatedAt),
      deleted: incomingDeleted,
    };
  }
  return {
    name: prev.name,
    address: prev.address,
    lat: prev.lat,
    lng: prev.lng,
    googleMapsUri: prev.googleMapsUri,
    city: prev.city,
    visits,
    updatedAt: new Date(prevTs),
    deleted: prev.deleted,
  };
}

export async function getSessionUser(env: AuthEnv, request: Request) {
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

/** Like getSessionUser but also returns the active session id so callers can
 *  highlight or protect the current session in management UIs. */
export async function getSessionContext(env: AuthEnv, request: Request) {
  const auth = createAuth(env);
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user) return null;
  return { user: result.user, sessionId: (result.session as { id?: string } | undefined)?.id ?? null };
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
