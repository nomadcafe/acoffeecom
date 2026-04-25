import { z } from 'zod';
import { starredShops } from './db/schema';

// Wire format mirrors `StarredShopSnapshot` in src/types/index.ts.
export const StarredShopWireSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  address: z.string().max(1024),
  lat: z.number().finite(),
  lng: z.number().finite(),
  googleMapsUri: z.string().url().max(1024).optional(),
  note: z.string().max(2000).optional(),
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
  };
}

// Note merge on claim: prefer client's value if non-empty (current device wins for in-flight edits),
// otherwise fall back to whatever the server has. This is asymmetric on purpose — the active
// device is the most likely source of fresh edits.
export function pickNote(clientNote: string | undefined, serverNote: string | null): string | null {
  if (clientNote && clientNote.trim()) return clientNote;
  return serverNote;
}
