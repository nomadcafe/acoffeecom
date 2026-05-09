import { useId, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { RichText } from './RichText';
import type { PlaceSearchCategory } from '../types';
import { PLACE_SEARCH_CATEGORIES } from '../types';
import {
  SEARCH_RADIUS_MAX_M,
  SEARCH_RADIUS_MIN_M,
  SEARCH_RATING_MAX,
  SEARCH_RATING_MIN,
} from '../utils/places';
import styles from './SearchFilters.module.css';

const CATEGORY_LABEL_KEY: Record<PlaceSearchCategory, string> = {
  cafe: 'filters.placeCafe',
  restaurant: 'filters.placeRestaurant',
  lodging: 'filters.placeLodging',
  bar: 'filters.placeBar',
};

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
    searchPlaceCategory,
    setSearchPlaceCategory,
    searchSortMode,
    searchOpenNow,
    setSearchOpenNow,
    widenSearchParams,
    isLoading,
    searchMode,
    midpoint,
  } = useApp();

  const widenDisabled =
    isLoading || (searchRadiusMeters >= SEARCH_RADIUS_MAX_M && searchMinRating <= SEARCH_RATING_MIN);

  const isCafeMode = searchPlaceCategory === 'cafe';
  // Several copy strings and one option (Fairness sort) only make sense in
  // meetup mode (two endpoints + midpoint). In nearby mode there's a single
  // user-centred point, so we swap the labels and hide A/B-only options.
  const isMeetupMode = searchMode === 'meetup';

  const summaryParts = [
    t(CATEGORY_LABEL_KEY[searchPlaceCategory]),
    `${searchMinRating.toFixed(1)}★`,
    formatRadius(searchRadiusMeters),
  ];
  // Empty keyword skips the post-hoc name filter, so it's not part of the
  // collapsed summary. Any explicit value the user typed shows up.
  const trimmedKeyword = searchKeyword.trim();
  if (trimmedKeyword) {
    summaryParts.push(`“${trimmedKeyword}”`);
  }
  if (searchSortMode === 'fairness') {
    summaryParts.push(t('filters.sortFairness'));
  }
  if (searchOpenNow) {
    summaryParts.push(t('filters.openNowShort'));
  }
  const summary = summaryParts.join(' · ');

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
          <span className={styles.titleText}>{t('filters.title')}</span>
          {!filtersExpanded ? (
            <span className={styles.summaryText} aria-hidden>
              {summary}
            </span>
          ) : (
            <span className={styles.summarySpacer} aria-hidden />
          )}
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
        <RichText
          as="p"
          className={styles.lead}
          text={t(isMeetupMode ? 'filters.lead' : 'filters.leadNearby')}
        />

        <div className={styles.field}>
          <label htmlFor="searchPlaceCategory" className={styles.keywordLabel}>
            {t('filters.placeType')}
          </label>
          <select
            id="searchPlaceCategory"
            className={styles.keywordInput}
            value={searchPlaceCategory}
            onChange={(e) => setSearchPlaceCategory(e.target.value as PlaceSearchCategory)}
            disabled={isLoading}
          >
            {PLACE_SEARCH_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(CATEGORY_LABEL_KEY[value])}
              </option>
            ))}
          </select>
          <p className={styles.hint}>{t('filters.placeTypeHint')}</p>
        </div>

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
            <label htmlFor="searchRadius">
              {t(isMeetupMode ? 'filters.radius' : 'filters.radiusNearby')}
            </label>
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
          <RichText
            as="p"
            className={styles.fieldHelp}
            text={t(isMeetupMode ? 'filters.radiusHelp' : 'filters.radiusHelpNearby')}
          />
        </div>

        {/* Sort dropdown removed — the AgentModeChips above the panel
            covers the same control with a more visual UX (Fair / Fast /
            Vibe / Quiet / Now). */}

        <div className={styles.field}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={searchOpenNow}
              onChange={(e) => setSearchOpenNow(e.target.checked)}
              disabled={isLoading}
            />
            <span className={styles.toggleLabel}>{t('filters.openNow')}</span>
          </label>
          <p className={styles.hint}>{t('filters.openNowHint')}</p>
        </div>

        <div className={styles.field}>
          <label htmlFor="searchKeyword" className={styles.keywordLabel}>
            {t(isCafeMode ? 'filters.keywordCafe' : 'filters.keywordOther')}
          </label>
          <input
            id="searchKeyword"
            type="text"
            className={styles.keywordInput}
            placeholder={t(
              isCafeMode ? 'filters.keywordPlaceholderCafe' : 'filters.keywordPlaceholderOther',
            )}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            disabled={isLoading}
          />
          <p className={styles.hint}>
            {t(isCafeMode ? 'filters.keywordHintCafe' : 'filters.keywordHintOther')}
          </p>
        </div>

        {/* Pre-search "too few results?" prompts the user with a question
            they have no context for. Only render the widen block once a
            search has actually happened (midpoint set). */}
        {midpoint ? (
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
            <RichText
              as="p"
              id={widenHintId}
              className={styles.widenHint}
              text={t(isMeetupMode ? 'filters.widenHint' : 'filters.widenHintNearby', {
                min: SEARCH_RATING_MIN,
              })}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
