import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { RichText } from './RichText';
import {
  useAddressAutocomplete,
  type UseAddressAutocomplete,
} from '../hooks/useAddressAutocomplete';
import styles from './LocationInput.module.css';

export function LocationInput() {
  const { t, locale } = useI18n();
  const {
    addressA,
    addressB,
    addressC,
    setAddressA,
    setAddressB,
    setAddressC,
    findMeetupSpot,
    searchWithAddresses,
    recentSearches,
    removeRecentSearch,
    clearRecentSearches,
    addressTemplates,
    addAddressTemplate,
    removeAddressTemplate,
    isLoading,
    error,
    clearError,
  } = useApp();
  const inputARef = useRef<HTMLInputElement | null>(null);
  const inputBRef = useRef<HTMLInputElement | null>(null);
  const inputCRef = useRef<HTMLInputElement | null>(null);

  const acLanguage = locale === 'zh' ? 'zh-CN' : locale;
  const autoA = useAddressAutocomplete(acLanguage);
  const autoB = useAddressAutocomplete(acLanguage);
  const autoC = useAddressAutocomplete(acLanguage);

  // Three-party mode is opt-in: hidden by default, revealed when the user
  // taps "+ Add another" or arrives via a URL containing ?c=. Once shown,
  // it stays — clearing addressC by typing nothing is fine, but the user
  // can also remove the row entirely with the × button.
  const [showC, setShowC] = useState(() => addressC.trim().length > 0);
  // If addressC becomes non-empty externally (URL load, recent search), reveal C.
  if (addressC.trim().length > 0 && !showC) setShowC(true);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    findMeetupSpot();
  };

  const handleUseRecent = (a: string, b: string, c?: string) => {
    void searchWithAddresses(a, b, c);
  };

  const handleAddThird = () => {
    setShowC(true);
    // Focus the input once it renders.
    requestAnimationFrame(() => inputCRef.current?.focus());
  };

  const handleRemoveThird = () => {
    setAddressC('');
    setShowC(false);
  };

  const handleSwap = () => {
    const prevA = addressA;
    setAddressA(addressB);
    setAddressB(prevA);
  };

  const swapDisabled = isLoading || (!addressA.trim() && !addressB.trim());

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <h2 className={styles.title}>{t('location.title')}</h2>
      <RichText as="p" className={styles.subtitle} text={t('location.subtitle')} />

      <div className={styles.tripCard}>
        <div className={styles.tripRow}>
          <span className={styles.tripMarker} style={{ backgroundColor: '#4285f4' }} aria-hidden>
            A
          </span>
          <AddressField
            id="locationA"
            inputRef={inputARef}
            label={t('location.yourLocation')}
            placeholder={t('location.placeholderA')}
            value={addressA}
            onChange={setAddressA}
            disabled={isLoading}
            autocomplete={autoA}
          />
        </div>

        <div className={styles.tripDivider}>
          <button
            type="button"
            className={styles.swapButton}
            onClick={handleSwap}
            disabled={swapDisabled}
            aria-label={t('location.swap')}
            title={t('location.swap')}
          >
            <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
              <path
                d="M8 4v12m0 0l-3-3m3 3l3-3M16 20V8m0 0l-3 3m3-3l3 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.tripRow}>
          <span className={styles.tripMarker} style={{ backgroundColor: '#34a853' }} aria-hidden>
            B
          </span>
          <AddressField
            id="locationB"
            inputRef={inputBRef}
            label={t('location.friendLocation')}
            placeholder={t('location.placeholderB')}
            value={addressB}
            onChange={setAddressB}
            disabled={isLoading}
            autocomplete={autoB}
          />
        </div>

        {showC ? (
          <div className={styles.tripRow}>
            <span className={styles.tripMarker} style={{ backgroundColor: '#a142f4' }} aria-hidden>
              C
            </span>
            <AddressField
              id="locationC"
              inputRef={inputCRef}
              label={t('location.thirdLocation')}
              placeholder={t('location.placeholderC')}
              value={addressC}
              onChange={setAddressC}
              disabled={isLoading}
              autocomplete={autoC}
            />
            <button
              type="button"
              className={styles.thirdRemove}
              onClick={handleRemoveThird}
              aria-label={t('location.removeThird')}
              title={t('location.removeThird')}
              disabled={isLoading}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      {!showC ? (
        <button
          type="button"
          className={styles.addThirdButton}
          onClick={handleAddThird}
          disabled={isLoading}
        >
          + {t('location.addThird')}
        </button>
      ) : null}

      <div className={styles.templateActions}>
        <button
          type="button"
          className={styles.miniButton}
          onClick={() => addAddressTemplate(addressA)}
          disabled={!addressA.trim() || isLoading}
        >
          {t('location.saveA')}
        </button>
        <button
          type="button"
          className={styles.miniButton}
          onClick={() => addAddressTemplate(addressB)}
          disabled={!addressB.trim() || isLoading}
        >
          {t('location.saveB')}
        </button>
      </div>

      {addressTemplates.length > 0 ? (
        <div className={styles.quickBlock}>
          <p className={styles.quickTitle}>{t('location.templatesTitle')}</p>
          <div className={styles.templateList}>
            {addressTemplates.map((item) => (
              <div key={item} className={styles.templateItem}>
                <span className={styles.templateText}>{item}</span>
                <div className={styles.templateButtons}>
                  <button type="button" className={styles.templateButton} onClick={() => setAddressA(item)}>
                    {t('location.templateToA')}
                  </button>
                  <button type="button" className={styles.templateButton} onClick={() => setAddressB(item)}>
                    {t('location.templateToB')}
                  </button>
                  <button
                    type="button"
                    className={styles.templateButtonDanger}
                    onClick={() => removeAddressTemplate(item)}
                  >
                    {t('location.removeTemplate')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {recentSearches.length > 0 ? (
        <div className={styles.quickBlock}>
          <div className={styles.recentHeader}>
            <p className={styles.quickTitle}>{t('location.recentTitle')}</p>
            <button
              type="button"
              className={styles.recentClearAll}
              onClick={clearRecentSearches}
              disabled={isLoading}
            >
              {t('location.recentClearAll')}
            </button>
          </div>
          <div className={styles.recentList}>
            {recentSearches.slice(0, 5).map((r) => (
              <div key={r.id} className={styles.recentRow}>
                <button
                  type="button"
                  className={styles.recentItem}
                  onClick={() => handleUseRecent(r.addressA, r.addressB, r.addressC)}
                  disabled={isLoading}
                >
                  <span className={styles.recentUse}>{t('location.useRecent')}</span>
                  <span className={styles.recentLine}>A: {r.addressA}</span>
                  <span className={styles.recentLine}>B: {r.addressB}</span>
                  {r.addressC ? (
                    <span className={styles.recentLine}>C: {r.addressC}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={styles.recentRemove}
                  onClick={() => removeRecentSearch(r.id)}
                  aria-label={t('location.recentRemoveAria', {
                    a: r.addressA,
                    b: r.addressB,
                  })}
                  title={t('location.recentRemove')}
                  disabled={isLoading}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className={styles.errorBanner} role="alert">
          <p className={styles.errorText}>{error}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.errorRetry}
              onClick={() => {
                void findMeetupSpot();
              }}
            >
              {t('errors.retry')}
            </button>
            <button type="button" className={styles.errorDismiss} onClick={clearError}>
              {t('errors.dismiss')}
            </button>
          </div>
        </div>
      ) : null}

      <button type="submit" className={styles.button} disabled={isLoading}>
        {isLoading ? t('location.searching') : t('location.findButton')}
      </button>
    </form>
  );
}

interface AddressFieldProps {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  autocomplete: UseAddressAutocomplete;
}

function AddressField({
  id,
  inputRef,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  autocomplete,
}: AddressFieldProps) {
  const { suggestions, query, pick, clear } = autocomplete;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown when the user clicks anywhere outside this field.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // If the suggestion list shrinks while a stale highlight index points past
  // the end, treat it as 0 at render time — no effect, no cascading render.
  const effectiveHighlight = highlight >= suggestions.length ? 0 : highlight;

  const scheduleQuery = useCallback(
    (next: string) => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => query(next), 200);
    },
    [query]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next);
    setOpen(true);
    setHighlight(0);
    scheduleQuery(next);
  };

  const handlePick = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    const addr = await pick(suggestion);
    if (addr) onChange(addr);
    setOpen(false);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      const picked = suggestions[effectiveHighlight];
      if (picked) {
        e.preventDefault();
        void handlePick(picked);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      clear();
    }
  };

  return (
    <div ref={wrapperRef} className={styles.tripField}>
      <label htmlFor={id} className={styles.tripLabel}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={styles.tripInput}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
        aria-controls={`${id}-suggestions`}
      />
      {open && suggestions.length > 0 ? (
        <ul id={`${id}-suggestions`} role="listbox" className={styles.suggestionList}>
          {suggestions.map((s, i) => {
            const p = s.placePrediction;
            if (!p) return null;
            return (
              <li
                key={p.placeId}
                role="option"
                aria-selected={i === effectiveHighlight}
                className={
                  i === effectiveHighlight
                    ? `${styles.suggestionItem} ${styles.suggestionItemActive}`
                    : styles.suggestionItem
                }
                onMouseDown={(e) => {
                  // Prevent input blur from firing before our click handler.
                  e.preventDefault();
                  void handlePick(s);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className={styles.suggestionMain}>
                  {p.mainText?.text ?? p.text.text}
                </span>
                {p.secondaryText?.text ? (
                  <span className={styles.suggestionSecondary}>{p.secondaryText.text}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
