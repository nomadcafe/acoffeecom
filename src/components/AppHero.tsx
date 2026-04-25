import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { examplePairsByLocale } from '../i18n/examples';
import { AppHeroNearMe } from './AppHeroNearMe';
import styles from './AppHero.module.css';

/**
 * Pre-search onboarding strip between the header and the map. Once the user
 * has searched (midpoint exists) we get out of the way so the map + results
 * can breathe.
 */
export function AppHero() {
  const { t, locale } = useI18n();
  const { midpoint, searchWithAddresses, isLoading, recentSearches } = useApp();

  // Hide the hero as soon as any search is in flight, not just on
  // midpoint — otherwise on mobile the hero briefly remains stacked above
  // the map+sheet layout while geocoding runs.
  if (midpoint || isLoading) return null;

  // First-run only: returning users see their own recents inside the
  // BottomSheet; the hero stays focused on Near me to avoid clutter.
  const showSamples = recentSearches.length === 0;
  const samples = showSamples ? examplePairsByLocale[locale] : [];

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

        {samples.length > 0 ? (
          <div className={styles.samples} aria-label={t('hero.samplesLabel')}>
            <p className={styles.samplesTitle}>{t('hero.samplesTitle')}</p>
            <div className={styles.samplesList}>
              {samples.map((pair) => (
                <button
                  key={`${pair.a}|${pair.b}`}
                  type="button"
                  className={styles.sampleChip}
                  onClick={() => void searchWithAddresses(pair.a, pair.b)}
                  disabled={isLoading}
                >
                  <span className={styles.sampleA}>{pair.a}</span>
                  <span className={styles.sampleArrow} aria-hidden>
                    ↔
                  </span>
                  <span className={styles.sampleB}>{pair.b}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <AppHeroNearMe />
      </div>
    </section>
  );
}
