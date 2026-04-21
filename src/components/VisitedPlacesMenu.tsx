import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { visitedSnapshotToCoffeeShop } from '../hooks/useVisitedShops';
import { formatRelativeTime, formatAbsoluteDate } from '../utils/relativeTime';
import { renderPassportCard, sharePassportCard } from '../utils/passportCard';
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
      const blob = await renderPassportCard({
        title: t('visited.shareCardTitle'),
        countLabel: t('visited.shareCardCountLabel', { count }),
        visitsLabel: t('visited.shareCardVisitsLabel', { count: totalVisits }),
        sinceLabel:
          firstVisitDate != null
            ? t('visited.shareCardSinceLabel', { date: formatAbsoluteDate(firstVisitDate, locale) })
            : '',
        topLabel: t('visited.shareCardTopLabel'),
        brand: 'acoffee.com',
        topShops,
      });
      const result = await sharePassportCard(blob, {
        title: t('visited.shareCardTitle'),
        text: t('visited.shareCardText', { count, visits: totalVisits }),
        fileName: 'my-coffee-passport.png',
      });
      if (result === 'shared') {
        setShareStatus({ kind: 'info', message: t('visited.shareShared') });
      } else if (result === 'downloaded') {
        setShareStatus({ kind: 'info', message: t('visited.shareDownloaded') });
      }
      // 'cancelled' → no status, user already knows they dismissed it.
    } catch (e) {
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
          <h2 className={styles.dropdownTitle}>{t('visited.title')}</h2>
          {count === 0 ? (
            <p className={styles.empty}>{t('visited.empty')}</p>
          ) : (
            <>
              <div className={styles.statsBar}>
                <div className={styles.stats}>
                  <div className={styles.statLine}>
                    {t('visited.statPrimary', { count, visits: totalVisits })}
                  </div>
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
