import { useId, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { snapshotToCoffeeShop } from '../hooks/useStarredShops';
import { StarButton } from './StarButton';
import styles from './SavedPlacesSection.module.css';

export function SavedPlacesSection() {
  const { t } = useI18n();
  const headingId = useId();
  const panelId = useId();
  const [expanded, setExpanded] = useState(true);

  const { starredShops, coffeeShops, setSelectedCoffeeShopId, updateStarredNote } = useApp();

  const idsInResults = useMemo(
    () => new Set(coffeeShops.map((s) => s.id)),
    [coffeeShops]
  );

  const count = starredShops.length;

  return (
    <section className={styles.container} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.titleWrap}>
        <button
          type="button"
          className={styles.disclosureTrigger}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className={styles.disclosureSpacer} aria-hidden />
          <span className={styles.titleText}>
            {t('saved.title')}
            {count > 0 ? (
              <>
                {' '}
                <span className={styles.countBadge}>{t('saved.count', { count })}</span>
              </>
            ) : null}
          </span>
          <span className={styles.disclosureChevron} aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
        </button>
      </h2>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        hidden={!expanded}
        className={styles.panel}
      >
        {count === 0 ? (
          <p className={styles.empty}>{t('saved.empty')}</p>
        ) : (
          <>
            <div className={styles.list}>
              {starredShops.map((snap) => {
                const inResults = idsInResults.has(snap.id);
                const shop = snapshotToCoffeeShop(snap);
                const mapsUrl = getOpenInGoogleMapsUrl(shop);

                const onActivateRow = () => {
                  if (inResults) setSelectedCoffeeShopId(snap.id);
                };

                return (
                  <div key={snap.id} className={styles.rowGroup}>
                    <div className={styles.row}>
                      <div
                        className={`${styles.rowMain} ${inResults ? styles.rowMainClickable : ''}`}
                        onClick={inResults ? onActivateRow : undefined}
                        onKeyDown={
                          inResults
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onActivateRow();
                                }
                              }
                            : undefined
                        }
                        role={inResults ? 'button' : undefined}
                        tabIndex={inResults ? 0 : undefined}
                        aria-label={inResults ? `${snap.name}. ${t('saved.focusMap')}` : undefined}
                      >
                        <div className={styles.rowName}>{snap.name}</div>
                        {snap.address ? <div className={styles.rowAddress}>{snap.address}</div> : null}
                      </div>
                      <div className={styles.rowActions}>
                        <a
                          className={styles.mapsLink}
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t('card.openMaps')}
                        </a>
                        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <StarButton shop={shop} />
                        </div>
                      </div>
                    </div>
                    <div className={styles.noteRow}>
                      <input
                        className={styles.noteInput}
                        type="text"
                        placeholder={t('saved.notePlaceholder')}
                        value={snap.note ?? ''}
                        onChange={(e) => updateStarredNote(snap.id, e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {coffeeShops.length > 0 ? (
              <p className={styles.focusHint}>{t('saved.focusHint')}</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
