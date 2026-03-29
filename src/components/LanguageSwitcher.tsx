import { useI18n } from '../context/I18nContext';
import type { Locale } from '../i18n/messages';
import { SUPPORTED_LOCALES } from '../i18n/messages';
import styles from './LanguageSwitcher.module.css';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className={styles.wrap}>
      <span className={styles.visuallyHidden}>{t('lang.selectAria')}</span>
      <select
        className={styles.select}
        value={locale}
        aria-label={t('lang.selectAria')}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`lang.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
