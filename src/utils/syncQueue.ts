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
 * Backoff rule: each failed attempt sets nextAttemptAt = now + backoff(attempts),
 * capped at 1h. Drain skips entries still in their backoff window so a single
 * persistently-failing entry doesn't gate the rest of the queue. Past
 * MAX_ATTEMPTS we mark `poisoned` and stop auto-retrying — surfaces in the
 * sync indicator's error state for the user to notice.
 *
 * IndexedDB (not localStorage) because the queue must survive a force-quit
 * mid-write — IDB is transactional, localStorage is not.
 */

const DB_NAME = 'acoffee-sync';
const DB_VERSION = 1;
const STORE = 'mutations';

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_CAP_MS = 60 * 60_000;

export type SyncKind = 'visited' | 'starred';
export type SyncOp = 'upsert' | 'delete';

interface CommonFields {
  id?: number;
  createdAt: number;
  attempts: number;
  /** ms timestamp; drain skips this entry until now >= nextAttemptAt. */
  nextAttemptAt?: number;
  /** Set when attempts exceeds MAX_ATTEMPTS — auto-retry stops. */
  poisoned?: boolean;
}

export interface UpsertEntry<P> extends CommonFields {
  kind: SyncKind;
  op: 'upsert';
  placeId: string;
  payload: P;
}

export interface DeleteEntry extends CommonFields {
  kind: SyncKind;
  op: 'delete';
  placeId: string;
  ts: number;
}

export type QueueEntry = UpsertEntry<VisitedShopWire | StarredShopWire> | DeleteEntry;

let dbPromise: Promise<IDBDatabase> | null = null;

// Tiny pub-sub so consumers (AppContext / SyncIndicator) can react to size
// changes without polling. Fired after every enqueue / remove / drain step.
type SizeListener = (size: number) => void;
const listeners = new Set<SizeListener>();
let lastNotifiedSize = -1;

function notifySize(next: number): void {
  if (next === lastNotifiedSize) return;
  lastNotifiedSize = next;
  for (const cb of listeners) {
    try {
      cb(next);
    } catch {
      /* listener error shouldn't break the queue */
    }
  }
}

export function subscribeSize(cb: SizeListener): () => void {
  listeners.add(cb);
  // Fire current size immediately so subscribers don't sit at "unknown".
  void size().then((n) => cb(n));
  return () => {
    listeners.delete(cb);
  };
}

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
  notifySize(await size());
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
  notifySize(await size());
}

function backoffMs(attempts: number): number {
  // 60s, 2m, 4m, 8m, ..., capped at 1h.
  const ms = BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(ms, BACKOFF_CAP_MS);
}

async function recordFailure(id: number): Promise<void> {
  const db = await openDb();
  const store = txStore(db, 'readwrite');
  const got = await reqPromise(store.get(id));
  if (!got) return;
  const entry = got as QueueEntry;
  const attempts = (entry.attempts ?? 0) + 1;
  const next: QueueEntry = {
    ...entry,
    attempts,
    nextAttemptAt: Date.now() + backoffMs(attempts),
    poisoned: attempts >= MAX_ATTEMPTS ? true : entry.poisoned,
  };
  await reqPromise(store.put(next));
}

/** Force a retry of poisoned entries — bound to a "Retry sync" button later. */
export async function unpoisonAll(): Promise<void> {
  const db = await openDb();
  const store = txStore(db, 'readwrite');
  const all = await reqPromise(store.getAll() as IDBRequest<QueueEntry[]>);
  for (const e of all) {
    if (e.id == null) continue;
    if (!e.poisoned && e.nextAttemptAt == null) continue;
    const next: QueueEntry = { ...e, attempts: 0, nextAttemptAt: undefined, poisoned: false };
    await reqPromise(store.put(next));
  }
  notifySize(await size());
}

/**
 * Drain the queue sequentially. Skips entries still in backoff or poisoned.
 * Returns counts so the caller can decide whether to mark sync as healthy.
 *
 * Stop on first hard failure (attempted-and-failed) so a temporarily-down
 * server doesn't burn through every entry's attempt count at once.
 */
export async function drain(
  handler: (entry: QueueEntry) => Promise<boolean>,
): Promise<{ ok: number; failed: number; skipped: number }> {
  const now = Date.now();
  const entries = await peekAll();
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const e of entries) {
    if (e.id == null) continue;
    if (e.poisoned) {
      skipped++;
      continue;
    }
    if (e.nextAttemptAt != null && e.nextAttemptAt > now) {
      skipped++;
      continue;
    }
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
      await recordFailure(e.id);
      failed++;
      break;
    }
  }
  if (ok > 0) notifySize(await size());
  return { ok, failed, skipped };
}
