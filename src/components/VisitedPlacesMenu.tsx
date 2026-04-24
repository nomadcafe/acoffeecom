import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { visitedSnapshotToCoffeeShop } from '../hooks/useVisitedShops';
import { formatRelativeTime, formatAbsoluteDate } from '../utils/relativeTime';
import { computeStreak, streakFireEmoji } from '../utils/streak';
import { buildHeatmap } from '../utils/heatmap';
import { renderPassportCard, sharePassportCard } from '../utils/passportCard';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { PASSPORT_PATH } from '../routes';
import { track } from '../utils/analytics';
import { HeatmapGrid } from './HeatmapGrid';
import styles from './VisitedPlacesMenu.module.css';

export function VisitedPlacesMenu() {
  const { t, locale } = useI18n();
  const { visitedShops, removeVisited } = useApp();
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<
    { kind: 'error' | 'info'; message: string } | null
  >(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const count = visitedShops.length;

  const sortedVisited = useMemo(
    () => [...visitedShops].sort((a, b) => (b.visits[0] ?? 0) - (a.visits[0] ?? 0)),
    [visitedShops],
  );

  const totalVisits = useMemo(
    () => visitedShops.reduce((sum, s) => sum + s.visits.length, 0),
    [visitedShops],
  );

  const firstVisitDate = useMemo(() => {
    if (visitedShops.length === 0) return null;
    let earliest = Infinity;
    for (const s of visitedShops) {
      const last = s.visits[s.visits.length - 1];
      if (last != null && last < earliest) earliest = last;
    }
    return earliest === Infinity ? null : earliest;
  }, [visitedShops]);

  const streak = useMemo(() => computeStreak(visitedShops), [visitedShops]);
  const streakFires = streakFireEmoji(streak);

  const allTimestamps = useMemo(
    () => visitedShops.flatMap((s) => s.visits),
    [visitedShops],
  );

  // Same aggregation as PassportPage so the header-menu share card matches
  // the full page's nomad variant exactly.
  const citiesByCount = useMemo(() => {
    const unknownLabel = t('passport.citiesUnknown');
    const counts = new Map<string, number>();
    for (const s of visitedShops) {
      const key = s.city && s.city.trim() ? s.city : unknownLabel;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [visitedShops, t]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const focusable = dropdownRef.current.querySelector<HTMLElement>(
      'a, button, input, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? dropdownRef.current).focus();
  }, [open]);

  const onShare = async () => {
    if (sharing) return;
    setShareStatus(null);
    setSharing(true);
    try {
      const topShops = [...visitedShops]
        .sort((a, b) => b.visits.length - a.visits.length)
        .slice(0, 3)
        .map((s) => ({ name: s.name, visits: s.visits.length }));
      const topCities = citiesByCount.length >= 2 ? citiesByCount.slice(0, 3) : [];
      const heatmap = buildHeatmap(allTimestamps, 90);
      const blob = await renderPassportCard({
        title: t('visited.shareCardTitle'),
        countLabel: t('visited.shareCardCountLabel', { count }),
        visitsLabel: t('visited.shareCardVisitsLabel', { count: totalVisits }),
        sinceLabel:
          firstVisitDate != null
            ? t('visited.shareCardSinceLabel', { date: formatAbsoluteDate(firstVisitDate, locale) })
            : '',
        streakLabel:
          streak > 0
            ? t('visited.shareCardStreakLabel', { count: streak, fires: streakFires })
            : '',
        topLabel: t('visited.shareCardTopLabel'),
        citiesLabel: t('visited.shareCardCitiesLabel'),
        heatmapLabel: t('visited.shareCardHeatmapLabel'),
        brand: 'acoffee.com',
        topShops,
        topCities,
        heatmap,
      });
      const result = await sharePassportCard(blob, {
        title: t('visited.shareCardTitle'),
        text: t('visited.shareCardText', { count, visits: totalVisits }),
        fileName: 'my-coffee-passport.png',
      });
      track('passport_shared', {
        result,
        shopCount: count,
        cityCount: citiesByCount.length,
        variant: topCities.length > 0 ? 'cities' : 'shops',
        surface: 'menu',
      });
      setShareStatus({
        kind: 'info',
        message:
          result === 'shared' ? t('visited.shareShared') : t('visited.shareDownloaded'),
      });
    } catch (e) {
      console.error('Passport share failed:', e);
      track('passport_shared', {
        result: 'error',
        shopCount: count,
        cityCount: citiesByCount.length,
        surface: 'menu',
      });
      setShareStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : t('visited.shareError'),
      });
    } finally {
      setSharing(false);
    }
  };

  useEffect(() => {
    if (!shareStatus) return;
    const id = window.setTimeout(() => setShareStatus(null), 5000);
    return () => window.clearTimeout(id);
  }, [shareStatus]);

  // First-run clean surface: hide the trigger entirely until the user has
  // marked at least one café as visited. Reappears as soon as they do.
  // Placed after all hooks so render order stays stable.
  if (count === 0) return null;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className={styles.triggerIcon}>
          ☕
        </span>
        <span>{t('visited.menuLabel')}</span>
        {count > 0 ? <span className={styles.badge}>{count}</span> : null}
        <span className={styles.chevron} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          ref={dropdownRef}
          tabIndex={-1}
          className={styles.dropdown}
          role="region"
          aria-label={t('visited.title')}
        >
          <div className={styles.dropdownTitleRow}>
            <h2 className={styles.dropdownTitle}>{t('visited.title')}</h2>
            <a
              className={styles.viewFullLink}
              href={buildLocalizedPathname(PASSPORT_PATH, locale)}
            >
              {t('passport.viewFull')}
            </a>
          </div>
          {count === 0 ? (
            <p className={styles.empty}>{t('visited.empty')}</p>
          ) : (
            <>
              <div className={styles.statsBar}>
                <div className={styles.stats}>
                  <div className={styles.statLine}>
                    {t('visited.statPrimary', { count, visits: totalVisits })}
                  </div>
                  {streak > 0 ? (
                    <div className={styles.statStreak}>
                      {t('visited.statStreak', { count: streak, fires: streakFires })}
                    </div>
                  ) : null}
                  {firstVisitDate != null ? (
                    <div className={styles.statSince}>
                      {t('visited.statSince', { date: formatAbsoluteDate(firstVisitDate, locale) })}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={onShare}
                  disabled={sharing}
                >
                  {sharing ? t('visited.sharing') : t('visited.share')}
                </button>
              </div>
              {shareStatus ? (
                <p
                  className={
                    shareStatus.kind === 'error' ? styles.shareError : styles.shareInfo
                  }
                  role="status"
                >
                  {shareStatus.message}
                </p>
              ) : null}
              <div className={styles.heatmapBlock}>
                <div className={styles.heatmapTitle}>{t('passport.heatmapTitle')}</div>
                <HeatmapGrid timestamps={allTimestamps} days={90} />
              </div>
              <ul className={styles.list}>
                {sortedVisited.map((snap) => {
                  const last = snap.visits[0];
                  const vc = snap.visits.length;
                  return (
                    <li key={snap.id} className={styles.row}>
                      <div className={styles.rowMain}>
                        <div className={styles.rowName}>{snap.name}</div>
                        {snap.address ? (
                          <div className={styles.rowAddress}>{snap.address}</div>
                        ) : null}
                        {last != null ? (
                          <div className={styles.rowMeta}>
                            {vc >= 2
                              ? t('visited.rowMetaMany', {
                                  count: vc,
                                  last: formatRelativeTime(last, locale),
                                })
                              : t('visited.rowMetaOnce', {
                                  last: formatRelativeTime(last, locale),
                                })}
                          </div>
                        ) : null}
                      </div>
                      <div className={styles.rowActions}>
                        <a
                          className={styles.mapsLink}
                          href={getOpenInGoogleMapsUrl(visitedSnapshotToCoffeeShop(snap))}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('card.openMaps')}
                        </a>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => removeVisited(snap.id)}
                          aria-label={t('visited.removeAria', { name: snap.name })}
                          title={t('visited.remove')}
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
