import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GoogleMap, InfoWindow, PolylineF } from '@react-google-maps/api';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { snapshotToCoffeeShop } from '../hooks/useStarredShops';
import { visitedSnapshotToCoffeeShop } from '../hooks/useVisitedShops';
import { formatRelativeTime } from '../utils/relativeTime';
import { AdvancedMarker } from './AdvancedMarker';
import styles from './Map.module.css';

// AdvancedMarkerElement requires a Map ID (Google Cloud Console → Maps → Map
// IDs). Without it, markers render blank. Log once at startup if missing so
// the symptom is easy to diagnose.
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
if (!MAP_ID) {
  console.warn('[map] VITE_GOOGLE_MAPS_MAP_ID not set — advanced markers will not render.');
}

// AdvancedMarkerElement zIndex is a plain number (no MAX_ZINDEX constant).
// Use a value safely above any stacking we assign elsewhere.
const SELECTED_Z = 1_000_000;

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  lat: 40.7128,
  lng: -74.006,
};

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  mapId: MAP_ID,
};

function hasCoordinates(lat: number, lng: number): boolean {
  return Math.abs(lat) > 1e-5 || Math.abs(lng) > 1e-5;
}

export function Map() {
  const { t, locale } = useI18n();

  const {
    isSdkLoaded: isLoaded,
    sdkLoadError: loadError,
    locationA,
    locationB,
    locationC,
    midpoint,
    coffeeShops,
    starredShops,
    visitedShops,
    setMapRef,
    isStarred,
    isVisited,
    visitCount,
    lastVisit,
    selectedCoffeeShopId,
    setSelectedCoffeeShopId,
    isLoading,
    searchPlaceCategory,
    searchMode,
  } = useApp();

  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [browserLocation, setBrowserLocation] = useState<{ lat: number; lng: number } | null>(() => {
    try {
      const raw = sessionStorage.getItem('ipLocation');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.lat === 'number' &&
        typeof parsed.lng === 'number'
      ) {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
    return null;
  });
  const [locating, setLocating] = useState(false);
  const [locateDenied, setLocateDenied] = useState(false);
  const [selectedSavedOnlyId, setSelectedSavedOnlyId] = useState<string | null>(null);
  const [selectedVisitedOnlyId, setSelectedVisitedOnlyId] = useState<string | null>(null);

  const hasMeetupContext = !!(midpoint || locationA || locationB || locationC);

  const coffeeIds = useMemo(() => new Set(coffeeShops.map((s) => s.id)), [coffeeShops]);

  const visitedNotInResults = useMemo(
    () =>
      visitedShops.filter(
        (s) => !coffeeIds.has(s.id) && hasCoordinates(s.lat, s.lng),
      ),
    [visitedShops, coffeeIds],
  );

  const visitedNotInResultsIds = useMemo(
    () => new Set(visitedNotInResults.map((s) => s.id)),
    [visitedNotInResults],
  );

  const savedNotInResults = useMemo(
    () =>
      starredShops.filter(
        (s) =>
          !coffeeIds.has(s.id) &&
          !visitedNotInResultsIds.has(s.id) &&
          hasCoordinates(s.lat, s.lng),
      ),
    [starredShops, coffeeIds, visitedNotInResultsIds],
  );

  const selectedShop = useMemo(() => {
    if (!selectedCoffeeShopId) return null;
    return coffeeShops.find((s) => s.id === selectedCoffeeShopId) ?? null;
  }, [selectedCoffeeShopId, coffeeShops]);

  const selectedSavedOnly = useMemo(() => {
    if (!selectedSavedOnlyId) return null;
    return savedNotInResults.find((s) => s.id === selectedSavedOnlyId) ?? null;
  }, [selectedSavedOnlyId, savedNotInResults]);

  const selectedVisitedOnly = useMemo(() => {
    if (!selectedVisitedOnlyId) return null;
    return visitedNotInResults.find((s) => s.id === selectedVisitedOnlyId) ?? null;
  }, [selectedVisitedOnlyId, visitedNotInResults]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedShop) return;
    map.panTo({ lat: selectedShop.lat, lng: selectedShop.lng });
    const z = map.getZoom();
    if (z != null && z < 15) map.setZoom(15);
  }, [selectedShop]);

  useEffect(() => {
    if (!isLoaded || hasMeetupContext || browserLocation) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    fetch('https://ipapi.co/json/', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (
          data &&
          !data.error &&
          typeof data.latitude === 'number' &&
          typeof data.longitude === 'number'
        ) {
          const loc = { lat: data.latitude, lng: data.longitude };
          setBrowserLocation(loc);
          try {
            sessionStorage.setItem('ipLocation', JSON.stringify(loc));
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // silent — user can still click "My location" for precise
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isLoaded, hasMeetupContext, browserLocation]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setLocateDenied(true);
      return;
    }
    setLocating(true);
    setLocateDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setBrowserLocation(loc);
        const map = mapInstanceRef.current;
        if (map) {
          map.panTo(loc);
          const z = map.getZoom();
          if (z != null && z < 11) map.setZoom(11);
        }
      },
      () => {
        setLocating(false);
        setLocateDenied(true);
      },
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 15_000 }
    );
  }, []);

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapInstanceRef.current = map;
      setMapRef(map);
    },
    [setMapRef]
  );

  const onUnmount = useCallback(() => {
    mapInstanceRef.current = null;
    setMapRef(null);
  }, [setMapRef]);

  const onMapClick = useCallback(() => {
    setSelectedSavedOnlyId(null);
    setSelectedVisitedOnlyId(null);
    setSelectedCoffeeShopId(null);
  }, [setSelectedCoffeeShopId]);

  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{t('map.loadError')}</div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('map.loading')}</div>
      </div>
    );
  }

  const center = midpoint || locationA || locationB || locationC || browserLocation || defaultCenter;
  const zoom = midpoint ? 15 : locationA || locationB || locationC ? 12 : browserLocation ? 11 : 12;

  const isNearby = searchMode === 'nearby';
  // In nearby mode, the midpoint IS the user's location — render the blue dot there
  // and hide the orange midpoint marker so they don't overlap.
  const youDotPosition = isNearby ? midpoint : !hasMeetupContext ? browserLocation : null;
  const showLocateUi = !hasMeetupContext;

  return (
    <div className={styles.container}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={onMapClick}
      >
        {youDotPosition ? (
          <AdvancedMarker position={youDotPosition} title={t('map.youHere')} zIndex={1} anchor="center">
            <CircleDot size={26} color="#1a73e8" opacity={0.9} />
          </AdvancedMarker>
        ) : null}

        {locationA && (
          <AdvancedMarker position={{ lat: locationA.lat, lng: locationA.lng }} anchor="center">
            <CircleDot size={28} color="#4285f4" label="A" />
          </AdvancedMarker>
        )}

        {locationB && (
          <AdvancedMarker position={{ lat: locationB.lat, lng: locationB.lng }} anchor="center">
            <CircleDot size={28} color="#34a853" label="B" />
          </AdvancedMarker>
        )}

        {locationC && (
          <AdvancedMarker position={{ lat: locationC.lat, lng: locationC.lng }} anchor="center">
            <CircleDot size={28} color="#a142f4" label="C" />
          </AdvancedMarker>
        )}

        {midpoint && !isNearby && (
          <AdvancedMarker position={midpoint} title={t('map.midpoint')} anchor="center">
            <CircleDot size={24} color="#ff9800" />
          </AdvancedMarker>
        )}

        {/* Origin → highlighted-cafe polylines. Visual proof of fairness:
            when "fair" mode picks a non-obvious cafe (one party has
            faster transit, another walks closer), the converging lines
            show the user that the geometric midpoint isn't the optimum.
            Hidden in nearby (single-party) mode where there's nothing
            to converge on. Highlighted cafe = selected if any, else
            top-ranked result. Sage stroke matches our agent identity
            color (same as fair-mode chip + reasoning sparkle). */}
        {!isNearby && coffeeShops.length > 0 ? (
          <FairnessPolylines
            origins={[locationA, locationB, locationC]
              .filter((o) => o != null)
              .map((o) => ({ lat: o.lat, lng: o.lng }))}
            target={
              selectedShop
                ? { lat: selectedShop.lat, lng: selectedShop.lng }
                : { lat: coffeeShops[0].lat, lng: coffeeShops[0].lng }
            }
            highlighted={!!selectedShop}
          />
        ) : null}

        {savedNotInResults.map((snap) => (
          <AdvancedMarker
            key={`saved-${snap.id}`}
            position={{ lat: snap.lat, lng: snap.lng }}
            title={t('map.savedNotInResults')}
            zIndex={selectedSavedOnlyId === snap.id ? SELECTED_Z : 2}
            onClick={() => {
              setSelectedCoffeeShopId(null);
              setSelectedVisitedOnlyId(null);
              setSelectedSavedOnlyId(snap.id);
            }}
          >
            <PinImage src="https://maps.google.com/mapfiles/ms/icons/purple-dot.png" size={28} />
          </AdvancedMarker>
        ))}

        {visitedNotInResults.map((snap) => (
          <AdvancedMarker
            key={`visited-${snap.id}`}
            position={{ lat: snap.lat, lng: snap.lng }}
            title={t('map.visitedNotInResults')}
            zIndex={selectedVisitedOnlyId === snap.id ? SELECTED_Z : 2}
            onClick={() => {
              setSelectedCoffeeShopId(null);
              setSelectedSavedOnlyId(null);
              setSelectedVisitedOnlyId(snap.id);
            }}
          >
            <PinImage src="https://maps.google.com/mapfiles/ms/icons/orange-dot.png" size={28} />
          </AdvancedMarker>
        ))}

        {coffeeShops.map((shop) => {
          const starred = isStarred(shop.id);
          const visited = isVisited(shop.id);
          const selected = selectedCoffeeShopId === shop.id;
          const isTeardrop = visited || starred;
          return (
            <AdvancedMarker
              key={shop.id}
              position={{ lat: shop.lat, lng: shop.lng }}
              title={shop.name}
              zIndex={selected ? SELECTED_Z + 1 : undefined}
              anchor={isTeardrop ? 'bottom' : 'center'}
              onClick={() => {
                setSelectedSavedOnlyId(null);
                setSelectedVisitedOnlyId(null);
                setSelectedCoffeeShopId(shop.id);
              }}
            >
              <SelectionHalo selected={selected} anchor={isTeardrop ? 'bottom' : 'center'}>
                {visited ? (
                  <PinImage src="https://maps.google.com/mapfiles/ms/icons/orange-dot.png" size={32} />
                ) : starred ? (
                  <PinImage src="https://maps.google.com/mapfiles/ms/icons/yellow-dot.png" size={32} />
                ) : (
                  <CircleDot size={32} color="#6f4e37" label="☕" />
                )}
              </SelectionHalo>
            </AdvancedMarker>
          );
        })}

        {selectedShop && (
          <InfoWindow
            position={{ lat: selectedShop.lat, lng: selectedShop.lng }}
            onCloseClick={() => setSelectedCoffeeShopId(null)}
          >
            <InfoWindowBody key={selectedShop.id} titleText={selectedShop.name}>
              <p>{selectedShop.address}</p>
              <p>
                {isStarred(selectedShop.id) ? '★ ' : ''}
                {t('map.infoRating', {
                  rating: selectedShop.rating.toFixed(1),
                  reviews: selectedShop.userRatingsTotal,
                })}
              </p>
              <p className={styles.infoWindowMaps}>
                <a
                  href={getOpenInGoogleMapsUrl(selectedShop)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('map.openMaps')}
                </a>
              </p>
            </InfoWindowBody>
          </InfoWindow>
        )}

        {selectedSavedOnly && !selectedShop ? (
          <InfoWindow
            position={{ lat: selectedSavedOnly.lat, lng: selectedSavedOnly.lng }}
            onCloseClick={() => setSelectedSavedOnlyId(null)}
          >
            <InfoWindowBody key={selectedSavedOnly.id} titleText={selectedSavedOnly.name}>
              {selectedSavedOnly.address ? <p>{selectedSavedOnly.address}</p> : null}
              <p className={styles.savedHint}>{t('map.savedInfoHint')}</p>
              <p className={styles.infoWindowMaps}>
                <a
                  href={getOpenInGoogleMapsUrl(snapshotToCoffeeShop(selectedSavedOnly))}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('map.openMaps')}
                </a>
              </p>
            </InfoWindowBody>
          </InfoWindow>
        ) : null}

        {selectedVisitedOnly && !selectedShop && !selectedSavedOnly ? (
          (() => {
            const vc = visitCount(selectedVisitedOnly.id);
            const lv = lastVisit(selectedVisitedOnly.id);
            const stats =
              lv != null
                ? vc >= 2
                  ? t('map.visitedInfoStatsMany', {
                      count: vc,
                      last: formatRelativeTime(lv, locale),
                    })
                  : t('map.visitedInfoStatsOnce', {
                      last: formatRelativeTime(lv, locale),
                    })
                : null;
            return (
              <InfoWindow
                position={{ lat: selectedVisitedOnly.lat, lng: selectedVisitedOnly.lng }}
                onCloseClick={() => setSelectedVisitedOnlyId(null)}
              >
                <InfoWindowBody
                  key={selectedVisitedOnly.id}
                  titleText={selectedVisitedOnly.name}
                >
                  {selectedVisitedOnly.address ? <p>{selectedVisitedOnly.address}</p> : null}
                  {stats ? <p className={styles.savedHint}>{stats}</p> : null}
                  <p className={styles.infoWindowMaps}>
                    <a
                      href={getOpenInGoogleMapsUrl(
                        visitedSnapshotToCoffeeShop(selectedVisitedOnly),
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('map.openMaps')}
                    </a>
                  </p>
                </InfoWindowBody>
              </InfoWindow>
            );
          })()
        ) : null}
      </GoogleMap>

      {showLocateUi ? (
        <div className={styles.mapControls}>
          <button
            type="button"
            className={styles.locateButton}
            onClick={handleLocateMe}
            disabled={locating}
            aria-label={t('map.locateMeAria')}
          >
            {locating ? t('map.locateLoading') : t('map.locateMe')}
          </button>
          {locateDenied ? <p className={styles.locateHint}>{t('map.locateDenied')}</p> : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className={styles.mapOverlay} aria-busy="true" aria-live="polite">
          <div className={styles.overlayInner}>
            <div className={styles.overlaySpinner} />
            <p>
              {t(
                searchPlaceCategory === 'cafe'
                  ? 'map.searchingOnMapCoffee'
                  : 'map.searchingOnMapMeetup'
              )}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Dashed origin → cafe lines drawn on the map for the active result.
 *
 * Visual proof of fairness: when the agent picks a non-obvious cafe
 * (because one party has fast transit, another can walk closer), the
 * converging lines make the geometry visible — the user sees that
 * the geographic midpoint isn't the optimum, and that the picked
 * café is closer to whoever needs the shorter trip.
 *
 * Pattern: `strokeOpacity: 0` + an icon array with a tiny dot symbol
 * repeated every 14px is the standard Maps recipe for a dashed
 * polyline. The fixed-pixel repeat keeps the dash density consistent
 * across zoom levels, unlike strokeWeight-based dashes which look
 * sparse when zoomed out.
 */
function FairnessPolylines({
  origins,
  target,
  highlighted,
}: {
  origins: { lat: number; lng: number }[];
  target: { lat: number; lng: number };
  highlighted: boolean;
}) {
  // Dashed-line "icon" needs the Google Maps SDK. The component never
  // renders before the map is loaded (parent gates on coffeeShops length
  // which only populates after a successful search), so SDK access here
  // is safe at runtime.
  const dashIcon = useMemo(
    () => ({
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        scale: 3,
      },
      offset: '0',
      repeat: '14px',
    }),
    [],
  );
  const options = useMemo(
    () => ({
      strokeColor: '#5e7a52',
      // Solid stroke off — the icon row IS the visible line.
      strokeOpacity: 0,
      strokeWeight: 2,
      icons: [dashIcon],
      // Slightly stronger when a cafe is explicitly selected; falls back
      // to a more subtle treatment when the lines are anchored on the
      // top result by default.
      zIndex: highlighted ? 4 : 3,
      clickable: false,
    }),
    [dashIcon, highlighted],
  );
  return (
    <>
      {origins.map((origin, i) => (
        <PolylineF
          key={`fairness-${i}-${origin.lat}-${origin.lng}`}
          path={[origin, target]}
          options={options}
        />
      ))}
    </>
  );
}

function CircleDot({
  size,
  color,
  label,
  opacity = 1,
}: {
  size: number;
  color: string;
  label?: string;
  opacity?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        opacity,
        border: '2px solid white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 700,
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  );
}

function PinImage({ src, size }: { src: string; size: number }) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ display: 'block', userSelect: 'none' }}
    />
  );
}

/**
 * Accessible InfoWindow content: adds role="dialog" + aria-labelledby and
 * moves keyboard focus to the heading on open. Callers should key this
 * component by the selected item's id so it remounts (and re-focuses) when
 * the user switches between markers. `preventScroll` keeps the map from
 * jumping when focus lands on the heading.
 */
function InfoWindowBody({
  titleText,
  children,
}: {
  titleText: string;
  children?: ReactNode;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={styles.infoWindow} role="dialog" aria-labelledby={titleId}>
      {/* h2 not h4 — page-level h1 → infowindow header is one step
          down. Using h4 here jumps two levels and breaks heading
          navigation for SR users. */}
      <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.infoWindowTitle}>{titleText}</h2>
      {children}
    </div>
  );
}

/**
 * Wraps a marker's visual with a scale-up + accent-colored glow when
 * `selected`. `drop-shadow` follows the child's alpha channel so the glow
 * traces the teardrop pin outline or the dot's circle automatically.
 * `transform-origin` matches the AdvancedMarker anchor so the marker's
 * geographical point stays put while the visual grows.
 */
function SelectionHalo({
  selected,
  anchor,
  children,
}: {
  selected: boolean;
  anchor: 'bottom' | 'center';
  children: ReactNode;
}) {
  return (
    <div
      style={{
        transform: selected ? 'scale(1.25)' : 'scale(1)',
        transformOrigin: anchor === 'bottom' ? 'center bottom' : 'center center',
        filter: selected
          ? 'drop-shadow(0 0 3px #6f4e37) drop-shadow(0 0 6px rgba(111, 78, 55, 0.55))'
          : undefined,
        transition: 'transform 140ms ease-out, filter 140ms ease-out',
      }}
    >
      {children}
    </div>
  );
}
