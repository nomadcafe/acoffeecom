import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useApp } from '../context/AppContext';
import { visitedSnapshotToCoffeeShop } from '../hooks/useVisitedShops';
import { usePassportStats } from '../hooks/usePassportStats';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { buildHeatmap } from '../utils/heatmap';
import { renderPassportCard, sharePassportCard } from '../utils/passportCard';
import { streakFireEmoji } from '../utils/streak';
import { formatAbsoluteDate, formatRelativeTime } from '../utils/relativeTime';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { track } from '../utils/analytics';
import { AccountMenu } from './AccountMenu';
import { CoffeeNudge } from './CoffeeNudge';
import { StreakReminder } from './StreakReminder';
import { SyncIndicator } from './SyncIndicator';
import { HeaderNavLinks } from './HeaderNavLinks';
import { SkipToContent } from './SkipToContent';
import { HeatmapGrid } from './HeatmapGrid';
import { LanguageSwitcher } from './LanguageSwitcher';
import { GithubLink } from './GithubLink';
import { TrajectoryMap } from './TrajectoryMap';
import { VisitNoteInput } from './VisitNoteInput';
import { VisitRating } from './VisitRating';
import styles from './PassportPage.module.css';

export function PassportPage() {
  const { t, locale } = useI18n();
  const { visitedShops, starredShops, removeVisited, removeVisitAt, setVisitNote, setVisitRating } = useApp();
  const homeHref = buildLocalizedPathname('/', locale);

  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<
    { kind: 'error' | 'info'; message: string } | null
  >(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week'>('all');
  const [nameQuery, setNameQuery] = useState<string>('');
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null);

  const handleTrajectoryMarkerClick = (shopId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-shop-id="${CSS.escape(shopId)}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(shopId);
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setFlashId(null);
      flashTimerRef.current = null;
    }, 1600);
  };

  useEffect(
    () => () => {
      if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const stats = usePassportStats(visitedShops);
  const { today, thisWeek, total: totalVisits, shops: count, streak, firstVisit: firstVisitDate } = stats;

  const sortedVisited = useMemo(
    () => [...visitedShops].sort((a, b) => (b.visits[0] ?? 0) - (a.visits[0] ?? 0)),
    [visitedShops],
  );

  // List filters: city + time range + name query. Stats/heatmap/trajectory
  // keep showing the full lifetime picture so the filter UI doesn't change
  // the headline numbers underneath the user.
  const filteredVisited = useMemo(() => {
    let cutoff = -Infinity;
    if (timeFilter === 'today' || timeFilter === 'week') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      if (timeFilter === 'week') {
        // Monday-start week, matching usePassportStats.
        const daysSinceMon = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - daysSinceMon);
      }
      cutoff = d.getTime();
    }
    const q = nameQuery.trim().toLocaleLowerCase();
    return sortedVisited.filter((s) => {
      if (cityFilter && (s.city && s.city.trim() ? s.city : null) !== cityFilter) return false;
      if (cutoff !== -Infinity) {
        const hasMatchingVisit = s.visits.some((ts) => ts >= cutoff);
        if (!hasMatchingVisit) return false;
      }
      if (q) {
        // Match against name + city + address — broad enough that the user
        // doesn't have to remember exactly how the place was labelled.
        const hay = `${s.name}${s.city ?? ''}${s.address}`.toLocaleLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedVisited, cityFilter, timeFilter, nameQuery]);

  const streakFires = streakFireEmoji(streak);

  const allTimestamps = useMemo(
    () => visitedShops.flatMap((s) => s.visits),
    [visitedShops],
  );

  const trajectoryStopCount = useMemo(
    () =>
      visitedShops.filter(
        (s) =>
          s.visits.length > 0 && (Math.abs(s.lat) > 1e-5 || Math.abs(s.lng) > 1e-5),
      ).length,
    [visitedShops],
  );

  // Aggregate visited cafés by city → sorted desc by café count. Empty/unknown
  // cities are bucketed under a single "Unknown" label so the nomad picture
  // stays meaningful when a few addresses don't parse cleanly.
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
    if (!shareStatus) return;
    const id = window.setTimeout(() => setShareStatus(null), 5000);
    return () => window.clearTimeout(id);
  }, [shareStatus]);

  const onExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      visited: visitedShops,
      starred: starredShops,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `acoffee-passport-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    track('passport_exported', { shopCount: visitedShops.length, starredCount: starredShops.length });
  };

  const onShare = async () => {
    if (sharing) return;
    setShareStatus(null);
    setSharing(true);
    try {
      const topShops = [...visitedShops]
        .sort((a, b) => b.visits.length - a.visits.length)
        .slice(0, 3)
        .map((s) => ({ name: s.name, visits: s.visits.length }));
      // ≥2 cities → show cities section on the card instead of top shops.
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
        surface: 'page',
      });
      setShareStatus({
        kind: 'info',
        message: result === 'shared' ? t('visited.shareShared') : t('visited.shareDownloaded'),
      });
    } catch (e) {
      console.error('Passport share failed:', e);
      track('passport_shared', {
        result: 'error',
        shopCount: count,
        cityCount: citiesByCount.length,
        surface: 'page',
      });
      setShareStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : t('visited.shareError'),
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className={styles.app}>
      <SkipToContent />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
            <span className={styles.logoWordmark}>ACoffee</span>
          </a>
          <HeaderNavLinks />
          <div className={styles.headerAside}>
            <LanguageSwitcher />
            <GithubLink />
            {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
              <>
                <SyncIndicator />
                <AccountMenu />
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main id="content" tabIndex={-1} className={styles.main}>
        <CoffeeNudge />
        <StreakReminder />

        <div className={styles.hero}>
          <h1 className={styles.pageTitle}>
            <span aria-hidden className={styles.pageTitleGlyph}>☕</span>
            {t('passport.pageTitle')}
          </h1>
          <p className={styles.lead}>{t('passport.pageLead')}</p>
        </div>

        {count === 0 ? (
          <div className={styles.emptyCard}>
            <p className={styles.empty}>{t('visited.empty')}</p>
            <a className={styles.emptyCta} href={homeHref}>
              {t('passport.emptyCta')}
            </a>
          </div>
        ) : (
          <>
            <section className={styles.statsGrid} aria-label={t('passport.statsLabel')}>
              {today > 0 ? (
                <div className={styles.statCard}>
                  <div className={styles.statValue}>
                    {today}
                    <span className={styles.statSuffix} aria-hidden>☕</span>
                  </div>
                  <div className={styles.statLabel}>{t('passport.statToday')}</div>
                </div>
              ) : null}
              {thisWeek > 0 ? (
                <div className={styles.statCard}>
                  <div className={styles.statValue}>
                    {thisWeek}
                    <span className={styles.statSuffix} aria-hidden>☕</span>
                  </div>
                  <div className={styles.statLabel}>{t('passport.statThisWeek')}</div>
                </div>
              ) : null}
              <div className={styles.statCard}>
                <div className={styles.statValue}>{count}</div>
                <div className={styles.statLabel}>{t('passport.statShops')}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>
                  {totalVisits}
                  <span className={styles.statSuffix} aria-hidden>☕</span>
                </div>
                <div className={styles.statLabel}>{t('passport.statVisits')}</div>
              </div>
              {streak > 0 ? (
                <div className={styles.statCard}>
                  <div className={styles.statValue}>
                    {streak}
                    <span className={styles.statSuffix}>{streakFires}</span>
                  </div>
                  <div className={styles.statLabel}>{t('passport.statStreak')}</div>
                </div>
              ) : null}
              {firstVisitDate != null ? (
                <div className={styles.statCard}>
                  <div className={styles.statValueSmall}>
                    {formatAbsoluteDate(firstVisitDate, locale)}
                  </div>
                  <div className={styles.statLabel}>{t('passport.statSince')}</div>
                </div>
              ) : null}
            </section>

            {citiesByCount.length >= 2 ? (
              <section className={styles.citiesSection} aria-label={t('passport.citiesTitle')}>
                <h2 className={styles.sectionTitle}>{t('passport.citiesTitle')}</h2>
                <ul className={styles.citiesList}>
                  {citiesByCount.map((c) => {
                    const active = cityFilter === c.name;
                    return (
                      <li key={c.name} className={styles.cityListItem}>
                        <button
                          type="button"
                          className={`${styles.cityPill}${active ? ' ' + styles.cityPillActive : ''}`}
                          onClick={() => setCityFilter(active ? null : c.name)}
                          aria-pressed={active}
                          aria-label={t('passport.cityFilterAria', { city: c.name })}
                          title={c.name}
                        >
                          <span className={styles.cityPillName}>{c.name}</span>
                          <span className={styles.cityPillCount}>
                            {t('passport.cityCount', { count: c.count })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {cityFilter ? (
                    <button
                      type="button"
                      className={styles.filterClear}
                      onClick={() => setCityFilter(null)}
                    >
                      {t('passport.cityFilterClear')}
                    </button>
                  ) : null}
                </ul>
              </section>
            ) : null}

            <section className={styles.heatmapSection} aria-label={t('passport.heatmapTitle')}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{t('passport.heatmapTitle')}</h2>
                <div>
                  <button
                    type="button"
                    className={styles.shareButton}
                    onClick={() => void onShare()}
                    disabled={sharing}
                  >
                    {sharing ? t('visited.sharing') : t('visited.share')}
                  </button>
                  <button
                    type="button"
                    className={styles.exportButton}
                    onClick={() => onExport()}
                  >
                    {t('passport.export')}
                  </button>
                </div>
              </div>
              <p className={styles.sectionSubtitle}>{t('passport.heatmapSubtitle')}</p>
              <div className={styles.heatmapWrap}>
                <HeatmapGrid timestamps={allTimestamps} days={90} />
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
            </section>

            {trajectoryStopCount >= 2 ? (
              <TrajectoryMap
                visitedShops={visitedShops}
                onMarkerClick={handleTrajectoryMarkerClick}
              />
            ) : null}

            <section className={styles.listSection} aria-label={t('passport.listTitle')}>
              <h2 className={styles.sectionTitle}>
                {t('passport.listTitle', { count: filteredVisited.length })}
              </h2>
              <div className={styles.listControls}>
                <div className={styles.searchWrap}>
                  <span aria-hidden className={styles.searchIcon}>🔍</span>
                  <input
                    type="search"
                    className={styles.searchInput}
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    placeholder={t('passport.searchPlaceholder')}
                    aria-label={t('passport.searchAria')}
                  />
                  {nameQuery ? (
                    <button
                      type="button"
                      className={styles.searchClear}
                      onClick={() => setNameQuery('')}
                      aria-label={t('passport.searchClear')}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
              <div
                className={styles.timeFilterRow}
                role="tablist"
                aria-label={t('passport.timeFilterAria')}
              >
                {(['all', 'today', 'week'] as const).map((kind) => {
                  const active = timeFilter === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`${styles.timeFilterTab}${active ? ' ' + styles.timeFilterTabActive : ''}`}
                      onClick={() => setTimeFilter(kind)}
                    >
                      {t(
                        kind === 'all'
                          ? 'passport.timeAll'
                          : kind === 'today'
                            ? 'passport.timeToday'
                            : 'passport.timeWeek',
                      )}
                    </button>
                  );
                })}
              </div>
              {filteredVisited.length === 0 ? (
                <p className={styles.listEmpty}>{t('passport.listFilteredEmpty')}</p>
              ) : null}
              <ul className={styles.list}>
                {filteredVisited.map((snap) => {
                  const last = snap.visits[0];
                  const vc = snap.visits.length;
                  const expanded = expandedShopId === snap.id;
                  return (
                    <li
                      key={snap.id}
                      className={`${styles.row}${flashId === snap.id ? ' ' + styles.rowFlash : ''}`}
                      data-shop-id={snap.id}
                    >
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
                        {/* Single-visit shops: show the note input inline so users
                            can write something on the very first stamp. Multi-visit
                            shops keep the expander pattern (one note per visit). */}
                        {vc === 1 && snap.visits[0] != null ? (
                          <div className={styles.inlineNoteWrap}>
                            <VisitRating
                              value={snap.visitRatings?.[String(snap.visits[0])] ?? 0}
                              onChange={(next) => setVisitRating(snap.id, snap.visits[0]!, next)}
                              ariaLabel={t('passport.visitRatingAria', { name: snap.name })}
                            />
                            <VisitNoteInput
                              initial={snap.visitNotes?.[String(snap.visits[0])] ?? ''}
                              placeholder={t('passport.visitNotePlaceholder')}
                              onCommit={(value) =>
                                setVisitNote(snap.id, snap.visits[0]!, value)
                              }
                            />
                          </div>
                        ) : null}
                        {vc >= 2 ? (
                          <button
                            type="button"
                            className={styles.visitsToggle}
                            onClick={() => setExpandedShopId(expanded ? null : snap.id)}
                            aria-expanded={expanded}
                          >
                            {expanded
                              ? t('passport.visitsHide')
                              : t('passport.visitsShow', { count: vc })}
                          </button>
                        ) : null}
                        {expanded ? (
                          <ul className={styles.visitsList}>
                            {snap.visits.map((ts) => {
                              const noteKey = String(ts);
                              const existing = snap.visitNotes?.[noteKey] ?? '';
                              return (
                                <li key={ts} className={styles.visitRow}>
                                  <div className={styles.visitRowHeader}>
                                    <span>{formatAbsoluteDate(ts, locale)}</span>
                                    <button
                                      type="button"
                                      className={styles.visitRemove}
                                      onClick={() => {
                                        // Per-visit × is reversible only by
                                        // re-stamping with the exact same
                                        // timestamp (effectively impossible).
                                        // Gate before destroying the row.
                                        const dateLabel = formatAbsoluteDate(ts, locale);
                                        if (
                                          window.confirm(
                                            t('passport.visitRemoveConfirm', {
                                              date: dateLabel,
                                              name: snap.name,
                                            }),
                                          )
                                        ) {
                                          removeVisitAt(snap.id, ts);
                                        }
                                      }}
                                      aria-label={t('passport.visitRemoveAria', {
                                        date: formatAbsoluteDate(ts, locale),
                                        name: snap.name,
                                      })}
                                      title={t('passport.visitRemove')}
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <VisitRating
                                    value={snap.visitRatings?.[noteKey] ?? 0}
                                    onChange={(next) => setVisitRating(snap.id, ts, next)}
                                    ariaLabel={t('passport.visitRatingDateAria', {
                                      date: formatAbsoluteDate(ts, locale),
                                    })}
                                  />
                                  <VisitNoteInput
                                    initial={existing}
                                    placeholder={t('passport.visitNotePlaceholder')}
                                    onCommit={(value) => setVisitNote(snap.id, ts, value)}
                                  />
                                </li>
                              );
                            })}
                          </ul>
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
                          onClick={() => {
                            // Whole-shop removal nukes every visit ever
                            // stamped at this place — multi-year history
                            // for active users. A bare × tap is too cheap
                            // for a payload that big; gate behind confirm.
                            if (
                              window.confirm(
                                t('visited.removeConfirm', { name: snap.name }),
                              )
                            ) {
                              removeVisited(snap.id);
                            }
                          }}
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
            </section>
          </>
        )}

        <footer className={styles.pageFooter}>
          <p className={styles.disclaimer} role="note">
            {t('bottomNav.bmacDisclaimer')}
          </p>
        </footer>
      </main>
    </div>
  );
}

/* VisitNoteInput is now a shared component — see ./VisitNoteInput. */
