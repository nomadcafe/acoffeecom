import { useMemo } from 'react';
import { useI18n } from '../context/I18nContext';
import { buildHeatmap, colorForCount } from '../utils/heatmap';
import type { Locale } from '../i18n/messages';
import styles from './HeatmapGrid.module.css';

interface HeatmapGridProps {
  timestamps: number[];
  /** Number of recent days to show (default 90). */
  days?: number;
}

const LOCALE_BCP47: Record<Locale, string> = {
  en: 'en',
  ja: 'ja',
  zh: 'zh-CN',
};

const CELL = 10;
const GAP = 2;
const PITCH = CELL + GAP;
const TOP_LABEL_H = 14;
const LEFT_LABEL_W = 22;

export function HeatmapGrid({ timestamps, days = 90 }: HeatmapGridProps) {
  const { locale, t } = useI18n();
  const grid = useMemo(() => buildHeatmap(timestamps, days), [timestamps, days]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    [locale],
  );

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(LOCALE_BCP47[locale], { month: 'short' }),
    [locale],
  );

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(LOCALE_BCP47[locale], { weekday: 'narrow' }),
    [locale],
  );

  const width = LEFT_LABEL_W + grid.weeks.length * PITCH;
  const height = TOP_LABEL_H + 7 * PITCH;

  // Pick one label per new month, placed on the first column of that month.
  const monthLabels: { x: number; label: string }[] = [];
  let lastMonth = -1;
  grid.weeks.forEach((week, wIdx) => {
    const firstRealCell = week.find((c) => !c.empty);
    if (!firstRealCell) return;
    const m = new Date(firstRealCell.date).getMonth();
    if (m !== lastMonth) {
      monthLabels.push({
        x: LEFT_LABEL_W + wIdx * PITCH,
        label: monthFormatter.format(new Date(firstRealCell.date)),
      });
      lastMonth = m;
    }
  });

  // Narrow weekday labels for rows Mon/Wed/Fri — pick a known Monday, Wed, Fri.
  // Jan 2, 2023 (Mon), Jan 4 (Wed), Jan 6 (Fri).
  const dayRowLabels = [
    { row: 1, label: dayFormatter.format(new Date(2023, 0, 2)) },
    { row: 3, label: dayFormatter.format(new Date(2023, 0, 4)) },
    { row: 5, label: dayFormatter.format(new Date(2023, 0, 6)) },
  ];

  return (
    <div className={styles.wrap} aria-label={t('passport.heatmapAria')}>
      <svg
        className={styles.svg}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
      >
        {monthLabels.map((m, i) => (
          <text
            key={`m-${i}`}
            x={m.x}
            y={TOP_LABEL_H - 3}
            className={styles.label}
          >
            {m.label}
          </text>
        ))}

        {dayRowLabels.map((d) => (
          <text
            key={`d-${d.row}`}
            x={LEFT_LABEL_W - 4}
            y={TOP_LABEL_H + d.row * PITCH + CELL - 1}
            textAnchor="end"
            className={styles.label}
          >
            {d.label}
          </text>
        ))}

        {grid.weeks.map((week, wIdx) =>
          week.map((cell, dIdx) => {
            if (cell.empty) return null;
            const x = LEFT_LABEL_W + wIdx * PITCH;
            const y = TOP_LABEL_H + dIdx * PITCH;
            return (
              <rect
                key={`${wIdx}-${dIdx}`}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                fill={colorForCount(cell.count)}
                className={styles.cell}
              >
                <title>
                  {cell.count === 0
                    ? t('passport.heatmapEmpty', {
                        date: dateFormatter.format(new Date(cell.date)),
                      })
                    : t('passport.heatmapTip', {
                        count: cell.count,
                        date: dateFormatter.format(new Date(cell.date)),
                      })}
                </title>
              </rect>
            );
          }),
        )}
      </svg>

      {/* Legend: less → more */}
      <div className={styles.legend}>
        <span className={styles.legendLabel}>{t('passport.heatmapLess')}</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={styles.legendSwatch}
            style={{ background: colorForCount(i) }}
          />
        ))}
        <span className={styles.legendLabel}>{t('passport.heatmapMore')}</span>
      </div>
    </div>
  );
}

