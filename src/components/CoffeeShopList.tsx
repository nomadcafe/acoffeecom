import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { CoffeeShopCard } from './CoffeeShopCard';
import styles from './CoffeeShopList.module.css';

export function CoffeeShopList() {
  const { t } = useI18n();
  const {
    coffeeShops,
    isLoading,
    error,
    midpoint,
    selectedCoffeeShopId,
    setSelectedCoffeeShopId,
    addressA,
    addressB,
    searchSortMode,
    searchPlaceCategory,
    searchMode,
    findMeetupSpot,
    searchAround,
    clearError,
  } = useApp();
  const [shareFeedback, setShareFeedback] = useState<'idle' | 'copied' | 'shared'>('idle');
  const feedbackTimerRef = useRef<number | null>(null);
  const [nearLoading, setNearLoading] = useState(false);
  const [nearError, setNearError] = useState<string | null>(null);

  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!selectedCoffeeShopId) return;
    const el = itemRefs.current.get(selectedCoffeeShopId);
    const id = requestAnimationFrame(() => {
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedCoffeeShopId]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  if (error) {
    const handleRetry = () => {
      if (searchMode === 'nearby' && midpoint) {
        void searchAround(midpoint);
      } else {
        void findMeetupSpot();
      }
    };
    return (
      <div className={styles.container}>
        <div className={styles.error} role="alert">
          <p className={styles.errorMessage}>{error}</p>
          <div className={styles.errorActions}>
            <button type="button" className={styles.errorRetry} onClick={handleRetry}>
              {t('errors.retry')}
            </button>
            <button type="button" className={styles.errorDismiss} onClick={clearError}>
              {t('errors.dismiss')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>
            {t(
              searchPlaceCategory === 'cafe' ? 'list.loadingCoffee' : 'list.loadingMeetup'
            )}
          </p>
        </div>
      </div>
    );
  }

  if (!midpoint) {
    const handleNearMe = async () => {
      setNearError(null);
      setNearLoading(true);

      const precise = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
        );
      });

      let loc = precise;
      if (!loc) {
        try {
          const raw = sessionStorage.getItem('ipLocation');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (
              parsed &&
              typeof parsed.lat === 'number' &&
              typeof parsed.lng === 'number'
            ) {
              loc = { lat: parsed.lat, lng: parsed.lng };
            }
          }
        } catch {
          // ignore
        }
      }

      setNearLoading(false);
      if (!loc) {
        setNearError(t('list.nearMeUnavailable'));
        return;
      }
      await searchAround(loc);
    };

    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <h1 className={styles.heroTitle}>{t('app.title')}</h1>
          <p className={styles.heroTagline}>{t('app.tagline')}</p>

          <ol className={styles.steps} aria-label={t('hero.stepsLabel')}>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden>1</span>
              <span className={styles.stepLabel}>{t('hero.step1')}</span>
            </li>
            <li className={styles.stepArrow} aria-hidden>
              →
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden>2</span>
              <span className={styles.stepLabel}>{t('hero.step2')}</span>
            </li>
            <li className={styles.stepArrow} aria-hidden>
              →
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden>3</span>
              <span className={styles.stepLabel}>{t('hero.step3')}</span>
            </li>
          </ol>

          <p className={styles.placeholderLead}>
            {t(
              searchPlaceCategory === 'cafe' ? 'list.placeholderCoffee' : 'list.placeholderMeetup'
            )}
          </p>
          <p className={styles.placeholderDivider}>{t('list.or')}</p>
          <button
            type="button"
            className={styles.nearMeButton}
            onClick={() => void handleNearMe()}
            disabled={nearLoading}
          >
            {nearLoading ? t('list.nearMeLoading') : t('list.nearMe')}
          </button>
          {nearError ? <p className={styles.nearMeError}>{nearError}</p> : null}
        </div>
      </div>
    );
  }

  if (coffeeShops.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>
            {t(searchPlaceCategory === 'cafe' ? 'list.emptyCoffee' : 'list.emptyMeetup')}
          </p>
          <p className={styles.hint}>{t('list.emptyHint')}</p>
        </div>
      </div>
    );
  }

  const n = coffeeShops.length;
  const isCafe = searchPlaceCategory === 'cafe';
  const listTitle =
    n === 1
      ? t(isCafe ? 'list.foundOneCoffee' : 'list.foundOneMeetup', { count: n })
      : t(isCafe ? 'list.foundManyCoffee' : 'list.foundManyMeetup', { count: n });

  const buildShareText = () => {
    const top = coffeeShops.slice(0, 3);
    const lines = top.map((shop, idx) => `${idx + 1}. ${shop.name} (${getOpenInGoogleMapsUrl(shop)})`);
    const header =
      searchMode === 'nearby'
        ? [t('share.nearbyTitle')]
        : [
            t('share.title'),
            `${t('share.from')}: ${addressA || '-'}`,
            `${t('share.to')}: ${addressB || '-'}`,
          ];
    return [...header, '', ...lines, '', window.location.href].join('\n');
  };

  const handleShare = async () => {
    const text = buildShareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: t('share.title'), text, url: window.location.href });
        setShareFeedback('shared');
      } else {
        await navigator.clipboard.writeText(text);
        setShareFeedback('copied');
      }
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => setShareFeedback('idle'), 1600);
    } catch {
      // Ignore cancellation and clipboard errors.
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>{listTitle}</h3>
        <button type="button" className={styles.shareButton} onClick={handleShare}>
          {shareFeedback === 'copied'
            ? t('share.copied')
            : shareFeedback === 'shared'
              ? t('share.shared')
              : t('share.button')}
        </button>
      </div>
      {searchSortMode === 'fairness' ? (
        <p className={styles.sortExplain}>{t('list.fairnessExplain')}</p>
      ) : null}
      <div className={styles.list}>
        {coffeeShops.map((shop) => (
          <div
            key={shop.id}
            ref={(el) => {
              if (el) itemRefs.current.set(shop.id, el);
              else itemRefs.current.delete(shop.id);
            }}
            role="button"
            tabIndex={0}
            className={`${styles.cardWrap} ${selectedCoffeeShopId === shop.id ? styles.cardWrapSelected : ''}`}
            onClick={() => setSelectedCoffeeShopId(shop.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedCoffeeShopId(shop.id);
              }
            }}
          >
            <CoffeeShopCard shop={shop} />
          </div>
        ))}
      </div>
      <p className={styles.resultNote}>
        {t(isCafe ? 'list.resultNoteCoffee' : 'list.resultNoteMeetup')}
      </p>
    </div>
  );
}
