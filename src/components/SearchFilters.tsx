import { useId, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { SearchSortMode } from '../types';
import {
  SEARCH_RADIUS_MAX_M,
  SEARCH_RADIUS_MIN_M,
  SEARCH_RATING_MAX,
  SEARCH_RATING_MIN,
} from '../utils/places';
import styles from './SearchFilters.module.css';

function formatRadius(m: number): string {
  if (m < 1000) return `${m} m`;
  const km = m / 1000;
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

export function SearchFilters() {
  const { t } = useI18n();
  const filtersHeadingId = useId();
  const filtersPanelId = useId();
  const widenHintId = useId();
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const {
    searchMinRating,
    setSearchMinRating,
    searchRadiusMeters,
    setSearchRadiusMeters,
    searchKeyword,
    setSearchKeyword,
    searchSortMode,
    setSearchSortMode,
    widenSearchParams,
    isLoading,
  } = useApp();

  const widenDisabled =
    isLoading || (searchRadiusMeters >= SEARCH_RADIUS_MAX_M && searchMinRating <= SEARCH_RATING_MIN);

  return (
    <section className={styles.container} aria-labelledby={filtersHeadingId}>
      <h2 id={filtersHeadingId} className={styles.titleWrap}>
        <button
          type="button"
          className={styles.disclosureTrigger}
          aria-expanded={filtersExpanded}
          aria-controls={filtersPanelId}
          onClick={() => setFiltersExpanded((v) => !v)}
        >
          <span className={styles.disclosureSpacer} aria-hidden />
          <span className={styles.titleText}>{t('filters.title')}</span>
          <span className={styles.disclosureChevron} aria-hidden>
            {filtersExpanded ? '▾' : '▸'}
          </span>
        </button>
      </h2>

      <div
        id={filtersPanelId}
        role="region"
        aria-labelledby={filtersHeadingId}
        hidden={!filtersExpanded}
        className={styles.filtersPanel}
      >
        <p className={styles.lead} dangerouslySetInnerHTML={{ __html: t('filters.lead') }} />

        <div className={styles.field}>
          <div className={styles.fieldHeader}>
            <label htmlFor="searchMinRating">{t('filters.minRating')}</label>
            <span className={styles.value}>
              {t('filters.ratingDisplay', { value: searchMinRating.toFixed(1) })}
            </span>
          </div>
          <input
            id="searchMinRating"
            type="range"
            className={styles.range}
            min={SEARCH_RATING_MIN}
            max={SEARCH_RATING_MAX}
            step={0.1}
            value={searchMinRating}
            onChange={(e) => setSearchMinRating(Number(e.target.value))}
            disabled={isLoading}
          />
          <div className={styles.ticks}>
            <span>{SEARCH_RATING_MIN}</span>
            <span>{SEARCH_RATING_MAX}</span>
          </div>
        </div>

        <div className={styles.field}>
          <div className={styles.fieldHeader}>
            <label htmlFor="searchRadius">{t('filters.radius')}</label>
            <span className={styles.value}>{formatRadius(searchRadiusMeters)}</span>
          </div>
          <input
            id="searchRadius"
            type="range"
            className={styles.range}
            min={SEARCH_RADIUS_MIN_M}
            max={SEARCH_RADIUS_MAX_M}
            step={200}
            value={searchRadiusMeters}
            onChange={(e) => setSearchRadiusMeters(Number(e.target.value))}
            disabled={isLoading}
          />
          <div className={styles.ticks}>
            <span>{formatRadius(SEARCH_RADIUS_MIN_M)}</span>
            <span>{formatRadius(SEARCH_RADIUS_MAX_M)}</span>
          </div>
          <p className={styles.fieldHelp} dangerouslySetInnerHTML={{ __html: t('filters.radiusHelp') }} />
        </div>

        <div className={styles.field}>
          <label htmlFor="searchSortMode" className={styles.keywordLabel}>
            {t('filters.sortMode')}
          </label>
          <select
            id="searchSortMode"
            className={styles.keywordInput}
            value={searchSortMode}
            onChange={(e) => setSearchSortMode(e.target.value as SearchSortMode)}
            disabled={isLoading}
          >
            <option value="rating">{t('filters.sortRating')}</option>
            <option value="fairness">{t('filters.sortFairness')}</option>
          </select>
          <p className={styles.hint}>{t('filters.sortHint')}</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="searchKeyword" className={styles.keywordLabel}>
            {t('filters.keyword')}
          </label>
          <input
            id="searchKeyword"
            type="text"
            className={styles.keywordInput}
            placeholder={t('filters.keywordPlaceholder')}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            disabled={isLoading}
          />
          <p className={styles.hint}>{t('filters.keywordHint')}</p>
        </div>

        <div className={styles.widenBlock}>
          <p className={styles.widenIntro}>{t('filters.widenIntro')}</p>
          <button
            type="button"
            className={styles.widenButton}
            onClick={widenSearchParams}
            disabled={widenDisabled}
            aria-describedby={widenHintId}
          >
            {t('filters.loosen')}
          </button>
          <p
            id={widenHintId}
            className={styles.widenHint}
            dangerouslySetInnerHTML={{
              __html: t('filters.widenHint', { min: SEARCH_RATING_MIN }),
            }}
          />
        </div>
      </div>
    </section>
  );
}
