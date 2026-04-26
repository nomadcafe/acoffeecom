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
        city: undefined,
        updatedAt: r.updatedAt,
      });
      continue;
    }
    const visits = mergeVisits(cur.visits, r.visits);
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
        city: cur.city,
        updatedAt: r.updatedAt,
      });
    } else {
      // Local is newer (or tied) — keep local fields, but adopt any unioned visits.
      if (visits.length !== cur.visits.length) {
        byId.set(r.id, { ...cur, visits });
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
