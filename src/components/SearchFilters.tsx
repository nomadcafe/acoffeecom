import { useId, useState } from 'react';
import { useApp } from '../context/AppContext';
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
          <span className={styles.titleText}>Optional filters</span>
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
        <p className={styles.lead}>
          These settings apply the <strong>next</strong> time you tap <strong>Find Meetup Spot</strong> above.
          Nothing here runs a search by itself.
        </p>

        <div className={styles.field}>
          <div className={styles.fieldHeader}>
            <label htmlFor="searchMinRating">Minimum rating</label>
            <span className={styles.value}>{searchMinRating.toFixed(1)} stars</span>
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
            <label htmlFor="searchRadius">Search radius from midpoint</label>
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
          <p className={styles.fieldHelp}>
            Google searches in a circle around the <strong>midpoint between A and B</strong>, not around each
            address. The A and B distances on each card are from each person, so they are often larger than this
            radius when A and B are far apart.
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor="searchKeyword" className={styles.keywordLabel}>
            Keyword
          </label>
          <input
            id="searchKeyword"
            type="text"
            className={styles.keywordInput}
            placeholder="e.g. coffee, espresso, brunch"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            disabled={isLoading}
          />
          <p className={styles.hint}>Passed to Google Places. Leave empty to use &quot;coffee&quot;.</p>
        </div>

        <div className={styles.widenBlock}>
          <p className={styles.widenIntro}>Too few results after searching?</p>
          <button
            type="button"
            className={styles.widenButton}
            onClick={widenSearchParams}
            disabled={widenDisabled}
            aria-describedby={widenHintId}
          >
            Loosen filters only
          </button>
          <p id={widenHintId} className={styles.widenHint}>
            Moves radius +1 km and minimum rating -0.5 (not below {SEARCH_RATING_MIN} stars). Then tap{' '}
            <strong>Find Meetup Spot</strong> again - this button does not search.
          </p>
        </div>
      </div>
    </section>
  );
}
