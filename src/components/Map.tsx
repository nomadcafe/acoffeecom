import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
import { snapshotToCoffeeShop } from '../hooks/useStarredShops';
import { visitedSnapshotToCoffeeShop } from '../hooks/useVisitedShops';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './Map.module.css';

const libraries: ('places')[] = ['places'];

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
};

function hasCoordinates(lat: number, lng: number): boolean {
  return Math.abs(lat) > 1e-5 || Math.abs(lng) > 1e-5;
}

export function Map() {
  const { t, locale } = useI18n();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const {
    locationA,
    locationB,
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

  const hasMeetupContext = !!(midpoint || locationA || locationB);

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

  const center = midpoint || locationA || locationB || browserLocation || defaultCenter;
  const zoom = midpoint ? 15 : locationA || locationB ? 12 : browserLocation ? 11 : 12;

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
          <Marker
            position={youDotPosition}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 11,
              fillColor: '#1a73e8',
              fillOpacity: 0.9,
              strokeColor: 'white',
              strokeWeight: 2,
            }}
            title={t('map.youHere')}
            zIndex={1}
          />
        ) : null}

        {locationA && (
          <Marker
            position={{ lat: locationA.lat, lng: locationA.lng }}
            label={{
              text: 'A',
              color: 'white',
              fontWeight: 'bold',
            }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: '#4285f4',
              fillOpacity: 1,
              strokeColor: 'white',
              strokeWeight: 2,
            }}
          />
        )}

        {locationB && (
          <Marker
            position={{ lat: locationB.lat, lng: locationB.lng }}
            label={{
              text: 'B',
              color: 'white',
              fontWeight: 'bold',
            }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: '#34a853',
              fillOpacity: 1,
              strokeColor: 'white',
              strokeWeight: 2,
            }}
          />
        )}

        {midpoint && !isNearby && (
          <Marker
            position={midpoint}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#ff9800',
              fillOpacity: 1,
              strokeColor: 'white',
              strokeWeight: 2,
            }}
            title={t('map.midpoint')}
          />
        )}

        {savedNotInResults.map((snap) => (
          <Marker
            key={`saved-${snap.id}`}
            position={{ lat: snap.lat, lng: snap.lng }}
            icon={{
              url: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
              scaledSize: new google.maps.Size(28, 28),
            }}
            title={t('map.savedNotInResults')}
            zIndex={selectedSavedOnlyId === snap.id ? google.maps.Marker.MAX_ZINDEX : 2}
            onClick={() => {
              setSelectedCoffeeShopId(null);
              setSelectedVisitedOnlyId(null);
              setSelectedSavedOnlyId(snap.id);
            }}
          />
        ))}

        {visitedNotInResults.map((snap) => (
          <Marker
            key={`visited-${snap.id}`}
            position={{ lat: snap.lat, lng: snap.lng }}
            icon={{
              url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
              scaledSize: new google.maps.Size(28, 28),
            }}
            title={t('map.visitedNotInResults')}
            zIndex={selectedVisitedOnlyId === snap.id ? google.maps.Marker.MAX_ZINDEX : 2}
            onClick={() => {
              setSelectedCoffeeShopId(null);
              setSelectedSavedOnlyId(null);
              setSelectedVisitedOnlyId(snap.id);
            }}
          />
        ))}

        {coffeeShops.map((shop) => {
          const starred = isStarred(shop.id);
          const visited = isVisited(shop.id);
          const iconUrl = visited
            ? 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png'
            : starred
              ? 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png'
              : 'https://maps.google.com/mapfiles/ms/icons/coffee.png';
          return (
            <Marker
              key={shop.id}
              position={{ lat: shop.lat, lng: shop.lng }}
              icon={{
                url: iconUrl,
                scaledSize: new google.maps.Size(32, 32),
              }}
              zIndex={selectedCoffeeShopId === shop.id ? google.maps.Marker.MAX_ZINDEX + 1 : undefined}
              onClick={() => {
                setSelectedSavedOnlyId(null);
                setSelectedVisitedOnlyId(null);
                setSelectedCoffeeShopId(shop.id);
              }}
            />
          );
        })}

        {selectedShop && (
          <InfoWindow
            position={{ lat: selectedShop.lat, lng: selectedShop.lng }}
            onCloseClick={() => setSelectedCoffeeShopId(null)}
          >
            <div className={styles.infoWindow}>
              <h4>{selectedShop.name}</h4>
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
            </div>
          </InfoWindow>
        )}

        {selectedSavedOnly && !selectedShop ? (
          <InfoWindow
            position={{ lat: selectedSavedOnly.lat, lng: selectedSavedOnly.lng }}
            onCloseClick={() => setSelectedSavedOnlyId(null)}
          >
            <div className={styles.infoWindow}>
              <h4>{selectedSavedOnly.name}</h4>
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
            </div>
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
                <div className={styles.infoWindow}>
                  <h4>{selectedVisitedOnly.name}</h4>
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
                </div>
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
