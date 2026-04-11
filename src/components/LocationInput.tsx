import { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './LocationInput.module.css';

export function LocationInput() {
  const { t } = useI18n();
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

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <h2 className={styles.title}>{t('location.title')}</h2>
      <p
        className={styles.subtitle}
        dangerouslySetInnerHTML={{ __html: t('location.subtitle') }}
      />

      <div className={styles.inputGroup}>
        <label htmlFor="locationA" className={styles.label}>
          <span className={styles.marker} style={{ backgroundColor: '#4285f4' }}>A</span>
          {t('location.yourLocation')}
        </label>
        <input
          ref={inputARef}
          id="locationA"
          type="text"
          className={styles.input}
          placeholder={t('location.placeholderA')}
          value={addressA}
          onChange={(e) => setAddressA(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className={styles.inputGroup}>
        <label htmlFor="locationB" className={styles.label}>
          <span className={styles.marker} style={{ backgroundColor: '#34a853' }}>B</span>
          {t('location.friendLocation')}
        </label>
        <input
          ref={inputBRef}
          id="locationB"
          type="text"
          className={styles.input}
          placeholder={t('location.placeholderB')}
          value={addressB}
          onChange={(e) => setAddressB(e.target.value)}
          disabled={isLoading}
        />
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
    </form>
  );
}
