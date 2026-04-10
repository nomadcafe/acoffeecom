import { useEffect, useId, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { SavedPlacesPanel } from './SavedPlacesPanel';
import styles from './SavedPlacesMenu.module.css';

export function SavedPlacesMenu() {
  const { t } = useI18n();
  const { starredShops } = useApp();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const count = starredShops.length;

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
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{t('saved.menuLabel')}</span>
        {count > 0 ? <span className={styles.badge}>{count}</span> : null}
        <span className={styles.chevron} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div id={menuId} className={styles.dropdown} role="region" aria-label={t('saved.title')}>
          <h2 className={styles.dropdownTitle}>{t('saved.title')}</h2>
          <SavedPlacesPanel />
        </div>
      ) : null}
    </div>
  );
}
