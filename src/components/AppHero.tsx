import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './AppHero.module.css';

/**
 * Pre-search onboarding strip between the header and the map. Once the user
 * has searched (midpoint exists) we get out of the way so the map + results
 * can breathe.
 */
export function AppHero() {
  const { t } = useI18n();
  const { midpoint } = useApp();

  if (midpoint) return null;

  return (
    <section className={styles.hero} aria-labelledby="appHeroTitle">
      <div className={styles.inner}>
        <h1 id="appHeroTitle" className={styles.title}>
          {t('app.title')}
        </h1>
        <p className={styles.tagline}>{t('app.tagline')}</p>

        <ol className={styles.steps} aria-label={t('hero.stepsLabel')}>
          <li className={styles.step}>
            <span className={styles.stepNum} aria-hidden>
              1
            </span>
            <span className={styles.stepLabel}>{t('hero.step1')}</span>
          </li>
          <li className={styles.stepArrow} aria-hidden>
            →
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum} aria-hidden>
              2
            </span>
            <span className={styles.stepLabel}>{t('hero.step2')}</span>
          </li>
          <li className={styles.stepArrow} aria-hidden>
            →
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum} aria-hidden>
              3
            </span>
            <span className={styles.stepLabel}>{t('hero.step3')}</span>
          </li>
        </ol>
      </div>
    </section>
  );
}
