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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Move focus into the dropdown when it opens so keyboard users land inside the panel.
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const focusable = dropdownRef.current.querySelector<HTMLElement>(
      'a, button, input, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? dropdownRef.current).focus();
  }, [open]);

  // First-run clean surface: hide the trigger entirely until the user has
  // starred at least one café. Reappears as soon as they do. Placed after
  // all hooks so render order stays stable.
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
        <span>{t('saved.menuLabel')}</span>
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
          aria-label={t('saved.title')}
        >
          <h2 className={styles.dropdownTitle}>{t('saved.title')}</h2>
          <SavedPlacesPanel />
        </div>
      ) : null}
    </div>
  );
}
