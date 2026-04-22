import { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { RichText } from './RichText';
import { examplePairsByLocale } from '../i18n/examples';
import styles from './LocationInput.module.css';

export function LocationInput() {
  const { t, locale } = useI18n();
  const {
    addressA,
    addressB,
    setAddressA,
    setAddressB,
    findMeetupSpot,
    searchWithAddresses,
    recentSearches,
    addressTemplates,
    addAddressTemplate,
    removeAddressTemplate,
    isLoading,
    error,
    clearError,
  } = useApp();
  // Only show demo pairs to first-time users — once they've run a real
  // search (recentSearches populated), hide to reduce clutter.
  const examplePairs = recentSearches.length === 0 ? examplePairsByLocale[locale] : [];
  const inputARef = useRef<HTMLInputElement | null>(null);
  const inputBRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];

    const setupAutocomplete = () => {
      if (cancelled) return true;
      if (!inputARef.current || !inputBRef.current) return false;
      if (!window.google?.maps?.places?.Autocomplete) return false;

      const options: google.maps.places.AutocompleteOptions = {
        fields: ['formatted_address'],
      };
      const acA = new google.maps.places.Autocomplete(inputARef.current, options);
      const acB = new google.maps.places.Autocomplete(inputBRef.current, options);

      listeners.push(
        acA.addListener('place_changed', () => {
          const place = acA.getPlace();
          if (place.formatted_address) setAddressA(place.formatted_address);
        })
      );
      listeners.push(
        acB.addListener('place_changed', () => {
          const place = acB.getPlace();
          if (place.formatted_address) setAddressB(place.formatted_address);
        })
      );

      return true;
    };

    if (!setupAutocomplete()) {
      const timer = window.setInterval(() => {
        if (setupAutocomplete()) window.clearInterval(timer);
      }, 400);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
        listeners.forEach((l) => l.remove());
      };
    }

    return () => {
      cancelled = true;
      listeners.forEach((l) => l.remove());
    };
  }, [setAddressA, setAddressB]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    findMeetupSpot();
  };

  const handleUseRecent = (a: string, b: string) => {
    void searchWithAddresses(a, b);
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
          <div className={styles.tripField}>
            <label htmlFor="locationA" className={styles.tripLabel}>
              {t('location.yourLocation')}
            </label>
            <input
              ref={inputARef}
              id="locationA"
              type="text"
              className={styles.tripInput}
              placeholder={t('location.placeholderA')}
              value={addressA}
              onChange={(e) => setAddressA(e.target.value)}
              disabled={isLoading}
            />
          </div>
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
          <div className={styles.tripField}>
            <label htmlFor="locationB" className={styles.tripLabel}>
              {t('location.friendLocation')}
            </label>
            <input
              ref={inputBRef}
              id="locationB"
              type="text"
              className={styles.tripInput}
              placeholder={t('location.placeholderB')}
              value={addressB}
              onChange={(e) => setAddressB(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>
      </div>

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
          <p className={styles.quickTitle}>{t('location.recentTitle')}</p>
          <div className={styles.recentList}>
            {recentSearches.slice(0, 5).map((r) => (
              <button
                key={r.id}
                type="button"
                className={styles.recentItem}
                onClick={() => handleUseRecent(r.addressA, r.addressB)}
                disabled={isLoading}
              >
                <span className={styles.recentUse}>{t('location.useRecent')}</span>
                <span className={styles.recentLine}>A: {r.addressA}</span>
                <span className={styles.recentLine}>B: {r.addressB}</span>
              </button>
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

      {examplePairs.length > 0 ? (
        <div className={styles.examples}>
          <p className={styles.examplesTitle}>{t('location.examplesTitle')}</p>
          <div className={styles.examplesList}>
            {examplePairs.map((pair) => (
              <button
                key={`${pair.a}|${pair.b}`}
                type="button"
                className={styles.exampleButton}
                onClick={() => void searchWithAddresses(pair.a, pair.b)}
                disabled={isLoading}
              >
                <span className={styles.exampleA}>{pair.a}</span>
                <span className={styles.exampleArrow} aria-hidden>
                  →
                </span>
                <span className={styles.exampleB}>{pair.b}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
