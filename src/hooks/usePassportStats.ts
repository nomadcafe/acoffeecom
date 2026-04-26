import { useMemo } from 'react';
import type { VisitedShopSnapshot } from '../types';
import { computeStreak } from '../utils/streak';

export interface PassportStats {
  /** Cups stamped today (local day). */
  today: number;
  /** Cups stamped since 00:00 local time on the current week's Monday. */
  thisWeek: number;
  /** All cups across all shops, all time. */
  total: number;
  /** Distinct shops with at least one visit. */
  shops: number;
  /** Consecutive-day streak ending today/yesterday. */
  streak: number;
  /** Earliest visit timestamp (ms), or null if no visits. */
  firstVisit: number | null;
}

function localDayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 local for the week containing `ts`. ISO week — Sunday belongs to the previous week. */
function localWeekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // getDay(): Sun=0, Mon=1, ..., Sat=6 → days since Monday
  const daysSinceMon = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMon);
  return d.getTime();
}

/**
 * Stats derived purely from local visit timestamps. No schema, no extra sync —
 * computed from `visitedShops.visits[]`. Bucketing uses the user's local
 * timezone so "today" and "this week" track wall-clock day boundaries.
 */
export function usePassportStats(visitedShops: VisitedShopSnapshot[], now?: number): PassportStats {
  return useMemo(() => {
    // Sampling time inside useMemo is technically impure (won't re-bucket if
    // the user leaves the tab open past midnight), but the next interaction
    // re-renders. Acceptable for stats; reload would refresh either way.
    // eslint-disable-next-line react-hooks/purity
    const ref = now ?? Date.now();
    const todayStart = localDayStart(ref);
    const weekStart = localWeekStart(ref);

    let today = 0;
    let thisWeek = 0;
    let total = 0;
    let firstVisit: number | null = null;

    for (const shop of visitedShops) {
      for (const ts of shop.visits) {
        if (!Number.isFinite(ts)) continue;
        total++;
        if (ts >= todayStart) today++;
        if (ts >= weekStart) thisWeek++;
        if (firstVisit == null || ts < firstVisit) firstVisit = ts;
      }
    }

    return {
      today,
      thisWeek,
      total,
      shops: visitedShops.length,
      streak: computeStreak(visitedShops, ref),
      firstVisit,
    };
  }, [visitedShops, now]);
}
