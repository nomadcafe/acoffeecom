import { z } from 'zod';
import { createAuth, type AuthEnv } from './auth';
import { visitedShops } from './db/schema';

// Wire format mirrors `VisitedShopSnapshot` in src/types/index.ts.
// DB stores visits as JSON; the client always sees number[].
export const VisitedShopWireSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  address: z.string().max(1024),
  lat: z.number().finite(),
  lng: z.number().finite(),
  googleMapsUri: z.string().url().max(1024).optional(),
  city: z.string().max(128).optional(),
  visits: z.array(z.number().int().nonnegative()).max(2000),
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

export async function getSessionUser(env: AuthEnv, request: Request) {
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
