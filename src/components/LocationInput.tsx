import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './LocationInput.module.css';

export function LocationInput() {
  const { t } = useI18n();
  const { addressA, addressB, setAddressA, setAddressB, findMeetupSpot, isLoading } = useApp();

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
