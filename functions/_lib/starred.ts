import { z } from 'zod';
import { starredShops } from './db/schema';

// Wire format mirrors `StarredShopSnapshot` in src/types/index.ts.
// `updatedAt` is the LWW key — newer side wins on every field.
export const StarredShopWireSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  address: z.string().max(1024),
  lat: z.number().finite(),
  lng: z.number().finite(),
  googleMapsUri: z.string().url().max(1024).optional(),
  note: z.string().max(2000).optional(),
  updatedAt: z.number().int().nonnegative(),
  deleted: z.boolean().optional(),
});
export type StarredShopWire = z.infer<typeof StarredShopWireSchema>;

export type StarredShopRow = typeof starredShops.$inferSelect;

export function rowToWire(row: StarredShopRow): StarredShopWire {
  return {
    id: row.placeId,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    googleMapsUri: row.googleMapsUri ?? undefined,
    note: row.note ?? undefined,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : (row.updatedAt as unknown as number),
    deleted: row.deleted || undefined,
  };
}

function asMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return 0;
}

/** LWW row merge for starred_shops — newer updatedAt wins all fields. */
export function mergeStarredRow(prev: StarredShopRow | undefined, incoming: StarredShopWire) {
  const incomingDeleted = incoming.deleted ?? false;
  if (!prev) {
    return {
      name: incoming.name,
      address: incoming.address,
      lat: incoming.lat,
      lng: incoming.lng,
      googleMapsUri: incoming.googleMapsUri ?? null,
      note: incoming.note ?? null,
      updatedAt: new Date(incoming.updatedAt),
      deleted: incomingDeleted,
    };
  }
  const prevTs = asMs(prev.updatedAt);
  if (incoming.updatedAt > prevTs) {
    return {
      name: incoming.name || prev.name,
      address: incoming.address || prev.address,
      lat: incoming.lat,
      lng: incoming.lng,
      googleMapsUri: incoming.googleMapsUri ?? prev.googleMapsUri,
      note: incoming.note ?? prev.note,
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
    note: prev.note,
    updatedAt: new Date(prevTs),
    deleted: prev.deleted,
  };
}
