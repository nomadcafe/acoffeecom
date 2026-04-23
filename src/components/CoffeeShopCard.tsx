import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CoffeeShop } from '../types';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { StarButton } from './StarButton';
import { VisitedButton } from './VisitedButton';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { formatRelativeTime } from '../utils/relativeTime';
import { isToday } from '../utils/streak';
import { fetchAiSummary, getCachedSummary } from '../utils/aiSummary';
import styles from './CoffeeShopCard.module.css';

interface CoffeeShopCardProps {
  shop: CoffeeShop;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

function renderStars(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;
  let stars = '★'.repeat(fullStars);
  if (hasHalf) stars += '½';
  return stars;
}

type SummaryState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; text: string }
  | { kind: 'empty' }
  | { kind: 'error' };

export const CoffeeShopCard = memo(function CoffeeShopCard({ shop }: CoffeeShopCardProps) {
  const { t, locale } = useI18n();
  const { isStarred, isVisited, visitCount, lastVisit, searchSortMode, searchMode } = useApp();
  const [summary, setSummary] = useState<SummaryState>(() => {
    const cached = getCachedSummary(shop.id, locale);
    return cached ? { kind: 'ok', text: cached } : { kind: 'idle' };
  });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const loadSummary = useCallback(async () => {
    if (summary.kind === 'loading') return;
    setSummary({ kind: 'loading' });
    try {
      const text = await fetchAiSummary(shop.id, shop.name, locale);
      setSummary({ kind: 'ok', text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setSummary({ kind: msg === 'NO_REVIEWS' ? 'empty' : 'error' });
    }
  }, [summary.kind, shop.id, shop.name, locale]);

  // Auto-fetch the summary when the card first scrolls into view. Cards the
  // user never looks at never trigger a Places Details call. IntersectionObserver
  // is a one-shot: we disconnect after the first hit so errors don't re-fire,
  // and so subsequent scroll passes are free.
  useEffect(() => {
    if (summary.kind !== 'idle') return;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      loadSummary();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          loadSummary();
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [summary.kind, loadSummary]);
  const starred = isStarred(shop.id);
  const visited = isVisited(shop.id);
  const count = visitCount(shop.id);
  const last = lastVisit(shop.id);
  const isNearby = searchMode === 'nearby';
  const fairnessGap =
    shop.distanceFromA != null && shop.distanceFromB != null
      ? Math.abs(shop.distanceFromA - shop.distanceFromB)
      : null;

  const visitedToday = last != null && isToday(last);
  const visitedLabel = last != null
    ? visitedToday
      ? count >= 2
        ? t('card.visitStatsToday', { count })
        : t('card.visitedToday')
      : count >= 2
        ? t('card.visitStats', { count, last: formatRelativeTime(last, locale) })
        : t('card.visitedOnce', { last: formatRelativeTime(last, locale) })
    : null;

  return (
    <div
      ref={cardRef}
      className={`${styles.card} ${starred ? styles.starred : ''} ${visited ? styles.visited : ''}`}
    >
      {starred && <div className={styles.favoriteBadge}>{t('card.favorite')}</div>}
      {visited && !starred && visitedLabel && (
        <div className={styles.visitedBadge}>{visitedLabel}</div>
      )}

      <div className={styles.header}>
        <div className={styles.info}>
          <h3 className={styles.name}>{shop.name}</h3>
          <p className={styles.address}>{shop.address}</p>
          <a
            className={styles.mapsLink}
            href={getOpenInGoogleMapsUrl(shop)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {t('card.openMaps')}
          </a>
        </div>
        <div className={styles.actions}>
          <VisitedButton shop={shop} />
          <StarButton shop={shop} />
        </div>
      </div>

      <div className={styles.details}>
        <div className={styles.rating}>
          <span className={styles.stars}>{renderStars(shop.rating)}</span>
          <span className={styles.ratingValue}>{shop.rating.toFixed(1)}</span>
          <span className={styles.reviews}>({t('card.reviews', { count: shop.userRatingsTotal })})</span>
        </div>

        <div className={styles.distanceGroup}>
          <div className={styles.distances}>
            {isNearby ? (
              <span
                className={styles.distance}
                title={t('card.distanceYou')}
              >
                <span className={styles.distanceMarker} style={{ color: '#1a73e8' }}>
                  {t('card.distanceYouShort')}
                </span>
                {shop.distanceFromMidpoint != null ? formatDistance(shop.distanceFromMidpoint) : '—'}
              </span>
            ) : (
              <>
                <span
                  className={styles.distance}
                  title={t('card.distanceA')}
                >
                  <span className={styles.distanceMarker} style={{ color: '#4285f4' }}>A</span>
                  {shop.distanceFromA != null ? formatDistance(shop.distanceFromA) : '—'}
                </span>
                <span className={styles.distanceSep} aria-hidden>
                  ·
                </span>
                <span
                  className={styles.distance}
                  title={t('card.distanceB')}
                >
                  <span className={styles.distanceMarker} style={{ color: '#34a853' }}>B</span>
                  {shop.distanceFromB != null ? formatDistance(shop.distanceFromB) : '—'}
                </span>
                <span className={styles.distanceSep} aria-hidden>
                  ·
                </span>
                <span
                  className={styles.distance}
                  title={t('card.distanceM')}
                >
                  <span className={styles.distanceMarker} style={{ color: '#ff9800' }}>M</span>
                  {shop.distanceFromMidpoint != null ? formatDistance(shop.distanceFromMidpoint) : '—'}
                </span>
              </>
            )}
          </div>
          {!isNearby ? (
            <p className={styles.distanceHint}>{t('card.distanceHint')}</p>
          ) : null}
          {!isNearby && searchSortMode === 'fairness' && fairnessGap != null ? (
            <p className={styles.distanceHint}>{t('card.fairnessGap', { gap: formatDistance(fairnessGap) })}</p>
          ) : null}
        </div>

        {shop.isOpen !== undefined && (
          <span className={`${styles.openStatus} ${shop.isOpen ? styles.open : styles.closed}`}>
            {shop.isOpen ? t('card.openNow') : t('card.closed')}
          </span>
        )}
      </div>

      <AiSummary t={t} state={summary} onLoad={loadSummary} />
    </div>
  );
});

function AiSummary({
  t,
  state,
  onLoad,
}: {
  t: (key: string) => string;
  state: SummaryState;
  onLoad: () => void;
}) {
  if (state.kind === 'idle') {
    // IntersectionObserver will trigger the fetch once the card scrolls in.
    return null;
  }
  if (state.kind === 'loading') {
    return (
      <p className={styles.aiSummaryLoading}>
        <span className={styles.aiSpinner} aria-hidden />
        {t('card.aiSummaryLoading')}
      </p>
    );
  }
  if (state.kind === 'ok') {
    return <p className={styles.aiSummaryText}>{state.text}</p>;
  }
  if (state.kind === 'empty') {
    return <p className={styles.aiSummaryEmpty}>{t('card.aiSummaryNoReviews')}</p>;
  }
  return (
    <p className={styles.aiSummaryError}>
      {t('card.aiSummaryError')}
      <button type="button" className={styles.aiRetry} onClick={onLoad}>
        {t('card.aiSummaryRetry')}
      </button>
    </p>
  );
}
