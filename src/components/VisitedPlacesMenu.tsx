import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { visitedSnapshotToCoffeeShop } from '../hooks/useVisitedShops';
import styles from './VisitedPlacesMenu.module.css';

export function VisitedPlacesMenu() {
  const { t } = useI18n();
  const { visitedShops, toggleVisited } = useApp();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const count = visitedShops.length;

  const sortedVisited = useMemo(
    () => [...visitedShops].sort((a, b) => b.visitedAt - a.visitedAt),
    [visitedShops],
  );

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
              <p className={styles.stat}>{t('visited.stat', { count })}</p>
              <ul className={styles.list}>
                {sortedVisited.map((snap) => (
                  <li key={snap.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowName}>{snap.name}</div>
                      {snap.address ? (
                        <div className={styles.rowAddress}>{snap.address}</div>
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
                        onClick={() => toggleVisited(visitedSnapshotToCoffeeShop(snap))}
                        aria-label={t('visited.removeAria', { name: snap.name })}
                        title={t('visited.remove')}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
