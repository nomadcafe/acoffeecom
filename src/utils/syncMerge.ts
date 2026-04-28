import type { StarredShopSnapshot, VisitedShopSnapshot } from '../types';
import type { VisitedShopWire } from './passportSync';
import type { StarredShopWire } from './starredSync';

const VISIT_DEDUPE_MS = 60_000;

/** Mirror of the server-side mergeVisits — union, sort newest-first, collapse near-duplicates. */
function mergeVisits(a: number[], b: number[]): number[] {
  const all = [...a, ...b]
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
    .sort((x, y) => y - x);
  const out: number[] = [];
  for (const ts of all) {
    if (out.length === 0 || out[out.length - 1] - ts >= VISIT_DEDUPE_MS) {
      out.push(ts);
    }
  }
  return out;
}

function shallowEqualNotes(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === b) return true;
  const aKeys = a ? Object.keys(a) : [];
  const bKeys = b ? Object.keys(b) : [];
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if ((a as Record<string, string>)[k] !== (b as Record<string, string> | undefined)?.[k]) {
      return false;
    }
  }
  return true;
}

/** Per-ts note merge mirroring the server: longer string wins. */
function mergeVisitNotes(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!a && !b) return undefined;
  const out: Record<string, string> = { ...(a ?? {}) };
  for (const [ts, note] of Object.entries(b ?? {})) {
    if (!note) continue;
    const cur = out[ts];
    if (!cur || note.length > cur.length) out[ts] = note;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Per-ts rating merge: any remote rating fills a missing local one; if both
 *  exist, prefer the higher value (rating-up wins, since "loved this" is a
 *  more committed action than "tapped a star and changed my mind"). */
function mergeVisitRatings(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!a && !b) return undefined;
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [ts, r] of Object.entries(b ?? {})) {
    const v = Number(r);
    if (!Number.isFinite(v) || v <= 0) continue;
    const cur = out[ts];
    if (cur === undefined || v > cur) out[ts] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function shallowEqualRatings(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): boolean {
  if (a === b) return true;
  const aKeys = a ? Object.keys(a) : [];
  const bKeys = b ? Object.keys(b) : [];
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if ((a as Record<string, number>)[k] !== (b as Record<string, number> | undefined)?.[k]) {
      return false;
    }
  }
  return true;
}

/**
 * Merge a delta of remote visited rows into the local list. LWW per-row by
 * `updatedAt`; tombstones (deleted=true) on the winning side remove the row;
 * `visits` are append-only union regardless of LWW so visit history never
 * vanishes when one side happens to be older.
 */
export function mergeRemoteVisited(
  local: VisitedShopSnapshot[],
  remote: VisitedShopWire[],
): VisitedShopSnapshot[] {
  const byId = new Map(local.map((s) => [s.id, s] as const));
  for (const r of remote) {
    const cur = byId.get(r.id);
    if (!cur) {
      if (r.deleted) continue;
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        googleMapsUri: r.googleMapsUri,
        visits: r.visits,
        visitNotes: r.visitNotes,
        visitRatings: r.visitRatings,
        city: undefined,
        updatedAt: r.updatedAt,
      });
      continue;
    }
    const visits = mergeVisits(cur.visits, r.visits);
    const visitNotes = mergeVisitNotes(cur.visitNotes, r.visitNotes);
    const visitRatings = mergeVisitRatings(cur.visitRatings, r.visitRatings);
    if (r.updatedAt > cur.updatedAt) {
      if (r.deleted) {
        byId.delete(r.id);
        continue;
      }
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        googleMapsUri: r.googleMapsUri,
        visits,
        visitNotes,
        visitRatings,
        city: cur.city,
        updatedAt: r.updatedAt,
      });
    } else {
      // Local is newer (or tied) — keep local fields, but adopt any unioned visits / notes / ratings.
      const visitsChanged = visits.length !== cur.visits.length;
      const notesChanged = !shallowEqualNotes(cur.visitNotes, visitNotes);
      const ratingsChanged = !shallowEqualRatings(cur.visitRatings, visitRatings);
      if (visitsChanged || notesChanged || ratingsChanged) {
        byId.set(r.id, { ...cur, visits, visitNotes, visitRatings });
      }
    }
  }
  return Array.from(byId.values());
}

/** LWW merge for starred — no append-only fields, just newer-wins. */
export function mergeRemoteStarred(
  local: StarredShopSnapshot[],
  remote: StarredShopWire[],
): StarredShopSnapshot[] {
  const byId = new Map(local.map((s) => [s.id, s] as const));
  for (const r of remote) {
    const cur = byId.get(r.id);
    if (!cur) {
      if (r.deleted) continue;
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        googleMapsUri: r.googleMapsUri,
        note: r.note,
        updatedAt: r.updatedAt,
      });
      continue;
    }
    if (r.updatedAt > cur.updatedAt) {
      if (r.deleted) {
        byId.delete(r.id);
        continue;
      }
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        googleMapsUri: r.googleMapsUri,
        note: r.note,
        updatedAt: r.updatedAt,
      });
    }
  }
  return Array.from(byId.values());
}
