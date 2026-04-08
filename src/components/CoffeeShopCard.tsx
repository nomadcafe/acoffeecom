import type { CoffeeShop } from '../types';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { StarButton } from './StarButton';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
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

export function CoffeeShopCard({ shop }: CoffeeShopCardProps) {
  const { t } = useI18n();
  const { isStarred, searchSortMode } = useApp();
  const starred = isStarred(shop.id);
  const fairnessGap =
    shop.distanceFromA != null && shop.distanceFromB != null
      ? Math.abs(shop.distanceFromA - shop.distanceFromB)
      : null;

  return (
    <div className={`${styles.card} ${starred ? styles.starred : ''}`}>
      {starred && <div className={styles.favoriteBadge}>{t('card.favorite')}</div>}

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
        <StarButton shop={shop} />
      </div>

      <div className={styles.details}>
        <div className={styles.rating}>
          <span className={styles.stars}>{renderStars(shop.rating)}</span>
          <span className={styles.ratingValue}>{shop.rating.toFixed(1)}</span>
          <span className={styles.reviews}>({t('card.reviews', { count: shop.userRatingsTotal })})</span>
        </div>

        <div className={styles.distanceGroup}>
          <div className={styles.distances}>
            <span
              className={styles.distance}
              title={t('card.distanceA')}
            >
              <span className={styles.distanceMarker} style={{ backgroundColor: '#4285f4' }}>A</span>
              {shop.distanceFromA != null ? formatDistance(shop.distanceFromA) : '—'}
            </span>
            <span
              className={styles.distance}
              title={t('card.distanceB')}
            >
              <span className={styles.distanceMarker} style={{ backgroundColor: '#34a853' }}>B</span>
              {shop.distanceFromB != null ? formatDistance(shop.distanceFromB) : '—'}
            </span>
            <span
              className={styles.distance}
              title={t('card.distanceM')}
            >
              <span className={styles.distanceMarker} style={{ backgroundColor: '#ff9800' }}>M</span>
              {shop.distanceFromMidpoint != null ? formatDistance(shop.distanceFromMidpoint) : '—'}
            </span>
          </div>
          <p className={styles.distanceHint}>{t('card.distanceHint')}</p>
          {searchSortMode === 'fairness' && fairnessGap != null ? (
            <p className={styles.distanceHint}>{t('card.fairnessGap', { gap: formatDistance(fairnessGap) })}</p>
          ) : null}
        </div>

        {shop.isOpen !== undefined && (
          <span className={`${styles.openStatus} ${shop.isOpen ? styles.open : styles.closed}`}>
            {shop.isOpen ? t('card.openNow') : t('card.closed')}
          </span>
        )}
      </div>
    </div>
  );
}
