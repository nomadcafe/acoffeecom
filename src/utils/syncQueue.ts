import type { VisitedShopWire } from './passportSync';
import type { StarredShopWire } from './starredSync';

/**
 * Durable mutation queue for cloud sync. We enqueue every passport/starred
 * write and drain it on app start, when the network comes back, and when the
 * tab becomes visible. Server-side LWW (per-record updatedAt) keeps replay
 * idempotent — sending the same upsert twice is a no-op.
 *
 * Dedupe rule: only the latest entry per (kind, placeId) survives. If the
 * user stars-then-unstars-then-stars while offline, the final state is the
 * only thing the server needs to hear about.
 *
 * IndexedDB (not localStorage) because the queue must survive a force-quit
 * mid-write — IDB is transactional, localStorage is not.
 */

const DB_NAME = 'acoffee-sync';
const DB_VERSION = 1;
const STORE = 'mutations';

export type SyncKind = 'visited' | 'starred';
export type SyncOp = 'upsert' | 'delete';

export interface UpsertEntry<P> {
  id?: number;
  kind: SyncKind;
  op: 'upsert';
  placeId: string;
  payload: P;
  createdAt: number;
  attempts: number;
}

export interface DeleteEntry {
  id?: number;
  kind: SyncKind;
  op: 'delete';
  placeId: string;
  ts: number;
  createdAt: number;
  attempts: number;
}

export type QueueEntry = UpsertEntry<VisitedShopWire | StarredShopWire> | DeleteEntry;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('placeKey', ['kind', 'placeId'], { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Drop any pending entries with the same (kind, placeId). */
async function deleteForPlace(store: IDBObjectStore, kind: SyncKind, placeId: string): Promise<void> {
  const idx = store.index('placeKey');
  const cursor = idx.openCursor(IDBKeyRange.only([kind, placeId]));
  await new Promise<void>((resolve, reject) => {
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return resolve();
      c.delete();
      c.continue();
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

type EnqueueInput =
  | {
      kind: SyncKind;
      op: 'upsert';
      placeId: string;
      payload: VisitedShopWire | StarredShopWire;
    }
  | { kind: SyncKind; op: 'delete'; placeId: string; ts: number };

export async function enqueue(entry: EnqueueInput): Promise<void> {
  const db = await openDb();
  const store = txStore(db, 'readwrite');
  await deleteForPlace(store, entry.kind, entry.placeId);
  const full = { ...entry, createdAt: Date.now(), attempts: 0 } as QueueEntry;
  await reqPromise(store.add(full));
}

export async function peekAll(): Promise<QueueEntry[]> {
  const db = await openDb();
  const store = txStore(db, 'readonly');
  const req = store.index('createdAt').getAll();
  return reqPromise(req as IDBRequest<QueueEntry[]>);
}

export async function size(): Promise<number> {
  const db = await openDb();
  const store = txStore(db, 'readonly');
  return reqPromise(store.count());
}

export async function remove(id: number): Promise<void> {
  const db = await openDb();
  const store = txStore(db, 'readwrite');
  await reqPromise(store.delete(id));
}

export async function bumpAttempts(id: number): Promise<void> {
  const db = await openDb();
  const store = txStore(db, 'readwrite');
  const got = await reqPromise(store.get(id));
  if (!got) return;
  const next = { ...(got as QueueEntry), attempts: ((got as QueueEntry).attempts ?? 0) + 1 };
  await reqPromise(store.put(next));
}

/**
 * Drain the queue sequentially. The handler returns true on success (entry
 * removed) or false on failure (entry stays in queue, attempts++ for backoff).
 * Stop on first failure so we don't hammer a down server with the whole queue.
 */
export async function drain(handler: (entry: QueueEntry) => Promise<boolean>): Promise<{ ok: number; failed: number }> {
  const entries = await peekAll();
  let ok = 0;
  let failed = 0;
  for (const e of entries) {
    if (e.id == null) continue;
    let success = false;
    try {
      success = await handler(e);
    } catch {
      success = false;
    }
    if (success) {
      await remove(e.id);
      ok++;
    } else {
      await bumpAttempts(e.id);
      failed++;
      break;
    }
  }
  return { ok, failed };
}
