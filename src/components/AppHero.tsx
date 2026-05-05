import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { examplePairsByLocale } from '../i18n/examples';
import { useSession } from '../utils/authClient';
import { AppHeroNearMe } from './AppHeroNearMe';
import { HeroSignedIn } from './HeroSignedIn';
import { HomeFeatureShowcase } from './HomeFeatureShowcase';
import styles from './AppHero.module.css';

/**
 * Pre-search onboarding strip between the header and the map. Once the user
 * has searched (midpoint exists) we get out of the way so the map + results
 * can breathe.
 */
export function AppHero() {
  const { t, locale } = useI18n();
  const { midpoint, searchWithAddresses, setAgentMode, isLoading, recentSearches } = useApp();
  const { data: session, isPending: sessionPending } = useSession();

  // Hide the hero as soon as any search is in flight, not just on
  // midpoint — otherwise on mobile the hero briefly remains stacked above
  // the map+sheet layout while geocoding runs.
  if (midpoint || isLoading) return null;

  // First-run only: returning users see their own recents inside the
  // BottomSheet; the hero stays focused on Near me to avoid clutter.
  const showSamples = recentSearches.length === 0;
  const samples = showSamples ? examplePairsByLocale[locale] : [];

  // Wait for session resolution so anonymous visitors don't briefly
  // see the showcase, then watch it disappear when the session lands.
  if (sessionPending) return null;
  const isSignedIn = !!session?.user;

  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        {/* Anonymous = marketing showcase (carousel + mode chips).
            Signed-in = personal-state strip (streak, last visit,
            stats) for users who already know the product and want
            "where you left off" instead of feature breadth. The H1
            of the page lives inside HomeFeatureShowcase for crawlers;
            HeroSignedIn isn't an H1, just a welcome card. */}
        {isSignedIn ? <HeroSignedIn /> : <HomeFeatureShowcase />}

        {samples.length > 0 ? (
          <div className={styles.samples} aria-label={t('hero.samplesLabel')}>
            <p className={styles.samplesTitle}>{t('hero.samplesTitle')}</p>
            <div className={styles.samplesList}>
              {samples.map((pair) => (
                <button
                  key={`${pair.a}|${pair.b}`}
                  type="button"
                  className={styles.sampleChip}
                  onClick={() => {
                    /* Apply the suggested agent mode BEFORE firing the
                     * search so the first results the user sees are
                     * already mode-flavored. Without this, the prompt
                     * would teach addresses but leave the user
                     * thinking modes are unrelated machinery. */
                    if (pair.mode) setAgentMode(pair.mode);
                    void searchWithAddresses(pair.a, pair.b);
                  }}
                  disabled={isLoading}
                >
                  {pair.emoji ? (
                    <span className={styles.sampleEmoji} aria-hidden>
                      {pair.emoji}
                    </span>
                  ) : null}
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
