import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, Polyline, useJsApiLoader } from '@react-google-maps/api';
import type { VisitedShopSnapshot } from '../types';
import { useI18n } from '../context/I18nContext';
import { AdvancedMarker } from './AdvancedMarker';
import styles from './TrajectoryMap.module.css';

const libraries: ('marker')[] = ['marker'];
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;

const mapContainerStyle = { width: '100%', height: '100%' };

const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: 'cooperative',
  mapId: MAP_ID,
};

const polylineOptions: google.maps.PolylineOptions = {
  strokeColor: '#6f4e37',
  strokeOpacity: 0.7,
  strokeWeight: 2,
  geodesic: true,
  clickable: false,
};

function hasCoordinates(lat: number, lng: number): boolean {
  return Math.abs(lat) > 1e-5 || Math.abs(lng) > 1e-5;
}

interface TrajectoryMapProps {
  visitedShops: VisitedShopSnapshot[];
  onMarkerClick?: (shopId: string) => void;
}

interface TrajectoryStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  firstVisit: number;
}

export function TrajectoryMap({ visitedShops, onMarkerClick }: TrajectoryMapProps) {
  const { t } = useI18n();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const stops = useMemo<TrajectoryStop[]>(() => {
    const out: TrajectoryStop[] = [];
    for (const s of visitedShops) {
      if (!hasCoordinates(s.lat, s.lng) || s.visits.length === 0) continue;
      // visits[] is newest-first, so the chronologically first stamp sits at the end.
      const firstVisit = s.visits[s.visits.length - 1] ?? 0;
      out.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, firstVisit });
    }
    out.sort((a, b) => a.firstVisit - b.firstVisit);
    return out;
  }, [visitedShops]);

  const mapRef = useRef<google.maps.Map | null>(null);

  const fitBoundsToStops = useCallback(() => {
    const map = mapRef.current;
    if (!map || stops.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const s of stops) bounds.extend({ lat: s.lat, lng: s.lng });
    map.fitBounds(bounds, 48);
    // Single-point bounds collapse to max zoom; clamp so it doesn't over-zoom.
    if (stops.length === 1) {
      const z = map.getZoom();
      if (z != null && z > 14) map.setZoom(14);
    }
  }, [stops]);

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      fitBoundsToStops();
    },
    [fitBoundsToStops],
  );

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Re-fit when the set of stops changes (new visit, deletion, sync).
  useEffect(() => {
    fitBoundsToStops();
  }, [fitBoundsToStops]);

  const path = useMemo(
    () => stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    [stops],
  );

  if (loadError) {
    return (
      <section className={styles.section} aria-label={t('passport.trajectoryTitle')}>
        <h2 className={styles.sectionTitle}>{t('passport.trajectoryTitle')}</h2>
        <div className={styles.mapWrap}>
          <div className={styles.fallback}>{t('map.loadError')}</div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label={t('passport.trajectoryTitle')}>
      <h2 className={styles.sectionTitle}>{t('passport.trajectoryTitle')}</h2>
      <p className={styles.lead}>{t('passport.trajectoryLead')}</p>
      <div className={styles.mapWrap}>
        {!isLoaded ? (
          <div className={styles.fallback}>{t('map.loading')}</div>
        ) : (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            options={mapOptions}
            onLoad={onLoad}
            onUnmount={onUnmount}
          >
            <Polyline path={path} options={polylineOptions} />
            {stops.map((s, i) => {
              const isStart = i === 0;
              const isEnd = i === stops.length - 1 && stops.length > 1;
              const cls = [
                styles.numberPin,
                isStart ? styles.numberPinStart : '',
                isEnd ? styles.numberPinEnd : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <AdvancedMarker
                  key={s.id}
                  position={{ lat: s.lat, lng: s.lng }}
                  title={s.name}
                  anchor="center"
                  onClick={onMarkerClick ? () => onMarkerClick(s.id) : undefined}
                >
                  <div className={cls}>{i + 1}</div>
                </AdvancedMarker>
              );
            })}
          </GoogleMap>
        )}
      </div>
    </section>
  );
}
