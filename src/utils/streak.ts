import type { VisitedShopSnapshot } from '../types';

/** Epoch day (days since 1970-01-01) for the local calendar day containing `ts`. */
function toEpochDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 86_400_000);
}

/**
 * Current streak in days ending today or yesterday — matches Duolingo-style grace:
 * the streak stays alive until midnight even if you haven't stamped today yet.
 */
export function computeStreak(visitedShops: VisitedShopSnapshot[], now: number = Date.now()): number {
  const days = new Set<number>();
  for (const shop of visitedShops) {
    for (const ts of shop.visits) {
      days.add(toEpochDay(ts));
    }
  }
  if (days.size === 0) return 0;

  const today = toEpochDay(now);
  let cursor: number;
  if (days.has(today)) cursor = today;
  else if (days.has(today - 1)) cursor = today - 1;
  else return 0;

  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor--;
  }
  return streak;
}

export function isToday(ts: number, now: number = Date.now()): boolean {
  return toEpochDay(ts) === toEpochDay(now);
}
