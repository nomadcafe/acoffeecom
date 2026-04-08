import { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './LocationInput.module.css';

export function LocationInput() {
  const { t } = useI18n();
  const { addressA, addressB, setAddressA, setAddressB, findMeetupSpot, isLoading } = useApp();
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

      <button type="submit" className={styles.button} disabled={isLoading}>
        {isLoading ? t('location.searching') : t('location.findButton')}
      </button>
    </form>
  );
}
