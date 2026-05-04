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
  /* Map of `{ visitTs: noteText }` — only for visits that have a note. Each
   * note capped to 500 chars; the whole map at 200 keys to bound payload. */
  visitNotes: z.record(z.string(), z.string().max(500)).optional(),
  /* Per-visit star rating, 1–5. Same sparse keying as visitNotes. */
  visitRatings: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
  updatedAt: z.number().int().nonnegative(),
  deleted: z.boolean().optional(),
});
export type VisitedShopWire = z.infer<typeof VisitedShopWireSchema>;

export type VisitedShopRow = typeof visitedShops.$inferSelect;

export function rowToWire(row: VisitedShopRow): VisitedShopWire {
  const notes = parseNotes(row.visitNotes);
  const ratings = parseRatings(row.visitRatings);
  return {
    id: row.placeId,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    googleMapsUri: row.googleMapsUri ?? undefined,
    city: row.city ?? undefined,
    visits: parseVisits(row.visits),
    visitNotes: Object.keys(notes).length > 0 ? notes : undefined,
    visitRatings: Object.keys(ratings).length > 0 ? ratings : undefined,
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

function parseNotes(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function parseRatings(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 5) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
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
  const incomingNotes = incoming.visitNotes ?? {};
  const incomingRatings = incoming.visitRatings ?? {};
  if (!prev) {
    return {
      name: incoming.name,
      address: incoming.address,
      lat: incoming.lat,
      lng: incoming.lng,
      googleMapsUri: incoming.googleMapsUri ?? null,
      city: incoming.city ?? null,
      visits: incoming.visits,
      visitNotes: incomingNotes,
      visitRatings: incomingRatings,
      updatedAt: new Date(incoming.updatedAt),
      deleted: incomingDeleted,
    };
  }
  const prevTs = asMs(prev.updatedAt);
  const prevVisits = parseVisits(prev.visits);
  const visits = mergeVisits(incoming.visits, prevVisits);
  const visitNotes = mergeNotes(parseNotes(prev.visitNotes), incomingNotes);
  const visitRatings = mergeRatings(parseRatings(prev.visitRatings), incomingRatings);
  if (incoming.updatedAt > prevTs) {
    return {
      name: incoming.name || prev.name,
      address: incoming.address || prev.address,
      lat: incoming.lat,
      lng: incoming.lng,
      googleMapsUri: incoming.googleMapsUri ?? prev.googleMapsUri,
      city: incoming.city ?? prev.city,
      visits,
      visitNotes,
      visitRatings,
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
    visitNotes,
    visitRatings,
    updatedAt: new Date(prevTs),
    deleted: prev.deleted,
  };
}

/**
 * Per-ts note merge. When both sides have a note for the same visit
 * timestamp, prefer the longer text — gives the user-as-editor benefit of
 * the doubt that the longer version is the more recent / more deliberate
 * edit. Empty / missing notes never overwrite a non-empty one.
 */
function mergeNotes(
  a: Record<string, string>,
  b: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...a };
  for (const [ts, note] of Object.entries(b)) {
    if (!note) continue;
    const cur = out[ts];
    if (!cur || note.length > cur.length) out[ts] = note;
  }
  return out;
}

/**
 * Per-ts rating merge mirroring the client. Higher rating wins on conflict —
 * "I rated this 4 stars" is a more committed action than "I changed my mind
 * down to 3", so on a desync we lean toward the more enthusiastic record.
 */
function mergeRatings(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [ts, r] of Object.entries(b)) {
    const v = Number(r);
    if (!Number.isFinite(v) || v < 1 || v > 5) continue;
    const cur = out[ts];
    if (cur === undefined || v > cur) out[ts] = Math.round(v);
  }
  return out;
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

/* jsonError + jsonErrorCoded live in ./jsonError now so endpoints that
 * only need an error helper don't transitively pull in Better Auth +
 * the Resend SDK via this module. Re-exported here so existing call
 * sites that import { jsonError } from passport keep working. */
export { jsonError, jsonErrorCoded } from './jsonError';
