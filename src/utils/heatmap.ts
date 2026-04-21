/** One cell of the heatmap — a single local calendar day. */
export interface HeatmapCell {
  /** UTC midnight of the local day, as epoch ms. */
  date: number;
  count: number;
  /** null for padding cells at the start (before the earliest column's Sunday). */
  empty?: boolean;
}

export interface HeatmapGrid {
  /** Weeks, oldest-first. Each week is 7 cells (Sunday→Saturday). Edge weeks may have empty cells. */
  weeks: HeatmapCell[][];
  /** Total days actually in range (excludes padding). */
  dayCount: number;
  /** Max count across any cell — useful for color-scale buckets. */
  maxCount: number;
  /** Earliest and latest real days for axis labels (epoch ms of local midnight). */
  startDate: number;
  endDate: number;
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Build a Sunday-aligned calendar heatmap of the most recent `days` days
 * ending on today. Each visit timestamp contributes 1 to its day's count.
 */
export function buildHeatmap(
  timestamps: number[],
  days: number,
  now: number = Date.now(),
): HeatmapGrid {
  const today = startOfLocalDay(now);
  const startDay = today - (days - 1) * 86_400_000;

  // Tally visits per local day.
  const counts = new Map<number, number>();
  for (const ts of timestamps) {
    const key = startOfLocalDay(ts);
    if (key < startDay || key > today) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Pad so the first column starts on Sunday.
  const startDow = new Date(startDay).getDay(); // 0 = Sunday
  const firstColumnStart = startDay - startDow * 86_400_000;

  const weeks: HeatmapCell[][] = [];
  let maxCount = 0;
  let cursor = firstColumnStart;
  while (cursor <= today) {
    const week: HeatmapCell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const dayMs = cursor + dow * 86_400_000;
      if (dayMs < startDay || dayMs > today) {
        week.push({ date: dayMs, count: 0, empty: true });
      } else {
        const c = counts.get(dayMs) ?? 0;
        if (c > maxCount) maxCount = c;
        week.push({ date: dayMs, count: c });
      }
    }
    weeks.push(week);
    cursor += 7 * 86_400_000;
  }

  return {
    weeks,
    dayCount: days,
    maxCount,
    startDate: startDay,
    endDate: today,
  };
}

/** Coffee-themed color scale. 5 buckets: 0 → 4+ visits. */
export const HEATMAP_COLORS = [
  '#f2e9dd', // 0 visits (cream bg)
  '#e6c8a0', // 1
  '#c99a68', // 2
  '#8e5a2e', // 3
  '#5a3520', // 4+
];

export function colorForCount(count: number): string {
  if (count <= 0) return HEATMAP_COLORS[0];
  if (count === 1) return HEATMAP_COLORS[1];
  if (count === 2) return HEATMAP_COLORS[2];
  if (count === 3) return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
}

/** Warm palette tuned for the dark passport share card background. */
export function colorForCountDark(count: number): string {
  if (count <= 0) return 'rgba(255, 229, 184, 0.14)';
  if (count === 1) return '#b57f4d';
  if (count === 2) return '#d4a574';
  if (count === 3) return '#ffc97a';
  return '#ffe5b8';
}
