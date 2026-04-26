import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CoffeeShop } from '../types';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { StarButton } from './StarButton';
import { VisitedButton } from './VisitedButton';
import { VisitNoteInput } from './VisitNoteInput';
import { ShareButton } from './ShareButton';
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
  | { kind: 'error' }
  | { kind: 'rateLimited'; retryAfterSec: number };

export const CoffeeShopCard = memo(function CoffeeShopCard({ shop }: CoffeeShopCardProps) {
  const { t, locale } = useI18n();
  const {
    isStarred,
    isVisited,
    visitCount,
    lastVisit,
    visitedShops,
    setVisitNote,
    searchSortMode,
    searchMode,
  } = useApp();
  const [summary, setSummary] = useState<SummaryState>(() => {
    const cached = getCachedSummary(shop.id, locale);
    return cached ? { kind: 'ok', text: cached } : { kind: 'idle' };
  });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight summarize request on unmount. Without this, a user
  // who re-runs the search while summaries are still loading would leave
  // orphan fetches running — wasted Places Details calls, wasted model
  // tokens, and wasted rate-limit budget.
  useEffect(() => () => abortRef.current?.abort(), []);

  const loadSummary = useCallback(async () => {
    if (summary.kind === 'loading') return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSummary({ kind: 'loading' });
    try {
      const text = await fetchAiSummary(shop.id, shop.name, locale, controller.signal);
      if (controller.signal.aborted) return;
      setSummary({ kind: 'ok', text });
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'NO_REVIEWS') {
        setSummary({ kind: 'empty' });
      } else if (msg.startsWith('RATE_LIMITED:')) {
        const retryAfterSec = Number(msg.slice('RATE_LIMITED:'.length)) || 60;
        setSummary({ kind: 'rateLimited', retryAfterSec });
      } else {
        setSummary({ kind: 'error' });
      }
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
      // Fallback for environments without IntersectionObserver (old browsers /
      // jsdom): load eagerly. Safe because this branch is rare and one-shot.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Detect "the user just tapped 'I visited' on this card right now" by
  // watching count tick upward. The prompt then stays visible until the
  // user either writes a note (auto-saves on blur, then closes) or
  // explicitly dismisses. seenCount uses the compare-to-prev pattern so
  // we don't need a useEffect/setState dance.
  const [seenCount, setSeenCount] = useState(count);
  const [promptForVisit, setPromptForVisit] = useState<number | null>(null);
  if (count !== seenCount) {
    setSeenCount(count);
    if (count > seenCount && last != null) {
      setPromptForVisit(last);
    }
  }
  const existingNoteForPrompt =
    promptForVisit != null
      ? (visitedShops.find((s) => s.id === shop.id)?.visitNotes?.[String(promptForVisit)] ?? '')
      : '';

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
          <ShareButton shop={shop} />
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

      {promptForVisit != null ? (
        <div className={styles.notePrompt}>
          <div className={styles.notePromptHeader}>
            <span aria-hidden>📝</span>
            <span className={styles.notePromptTitle}>{t('card.notePromptTitle')}</span>
            <button
              type="button"
              className={styles.notePromptDismiss}
              onClick={() => setPromptForVisit(null)}
              aria-label={t('card.notePromptDismiss')}
            >
              ×
            </button>
          </div>
          <VisitNoteInput
            initial={existingNoteForPrompt}
            placeholder={t('card.notePromptPlaceholder')}
            autoFocus={false}
            onCommit={(value) => {
              setVisitNote(shop.id, promptForVisit, value);
              if (value.trim()) setPromptForVisit(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
});

function AiSummary({
  t,
  state,
  onLoad,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
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
  if (state.kind === 'rateLimited') {
    // No Retry button — an immediate retry would just hit the limiter again.
    return (
      <p className={styles.aiSummaryEmpty}>
        {t('card.aiSummaryRateLimited', { seconds: state.retryAfterSec })}
      </p>
    );
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
