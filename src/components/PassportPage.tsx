import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useVisitedShops, visitedSnapshotToCoffeeShop } from '../hooks/useVisitedShops';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { buildHeatmap } from '../utils/heatmap';
import { renderPassportCard, sharePassportCard } from '../utils/passportCard';
import { computeStreak, streakFireEmoji } from '../utils/streak';
import { formatAbsoluteDate, formatRelativeTime } from '../utils/relativeTime';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { HeatmapGrid } from './HeatmapGrid';
import { LanguageSwitcher } from './LanguageSwitcher';
import styles from './PassportPage.module.css';

export function PassportPage() {
  const { t, locale } = useI18n();
  const { visitedShops, removeVisited } = useVisitedShops();
  const homeHref = buildLocalizedPathname('/', locale);

  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<
    { kind: 'error' | 'info'; message: string } | null
  >(null);

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

  useEffect(() => {
    if (!shareStatus) return;
    const id = window.setTimeout(() => setShareStatus(null), 5000);
    return () => window.clearTimeout(id);
  }, [shareStatus]);

  const onShare = async () => {
    if (sharing) return;
    setShareStatus(null);
    setSharing(true);
    try {
      const topShops = [...visitedShops]
        .sort((a, b) => b.visits.length - a.visits.length)
        .slice(0, 3)
        .map((s) => ({ name: s.name, visits: s.visits.length }));
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
        heatmapLabel: t('visited.shareCardHeatmapLabel'),
        brand: 'acoffee.com',
        topShops,
        heatmap,
      });
      const result = await sharePassportCard(blob, {
        title: t('visited.shareCardTitle'),
        text: t('visited.shareCardText', { count, visits: totalVisits }),
        fileName: 'my-coffee-passport.png',
      });
      setShareStatus({
        kind: 'info',
        message: result === 'shared' ? t('visited.shareShared') : t('visited.shareDownloaded'),
      });
    } catch (e) {
      console.error('Passport share failed:', e);
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
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
            <img src="/logo.png" alt="" className={styles.logoImage} width={40} height={40} />
            <span className={styles.logoWordmark}>ACoffee</span>
          </a>
          <div className={styles.headerAside}>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className={styles.main}>
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
              <div className={styles.statCard}>
                <div className={styles.statValue}>{count}</div>
                <div className={styles.statLabel}>{t('passport.statShops')}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statValue}>{totalVisits}</div>
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

            <section className={styles.heatmapSection} aria-label={t('passport.heatmapTitle')}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{t('passport.heatmapTitle')}</h2>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={() => void onShare()}
                  disabled={sharing}
                >
                  {sharing ? t('visited.sharing') : t('visited.share')}
                </button>
              </div>
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

            <section className={styles.listSection} aria-label={t('passport.listTitle')}>
              <h2 className={styles.sectionTitle}>
                {t('passport.listTitle', { count })}
              </h2>
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
            </section>
          </>
        )}
      </main>
    </div>
  );
}
