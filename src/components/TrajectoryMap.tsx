import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, Polyline, useJsApiLoader } from '@react-google-maps/api';
import type { VisitedShopSnapshot } from '../types';
import { useI18n } from '../context/I18nContext';
import { sharePassportCard } from '../utils/passportCard';
import { renderTrajectoryCard } from '../utils/trajectoryCard';
import { formatAbsoluteDate } from '../utils/relativeTime';
import { track } from '../utils/analytics';
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
  city: string | null;
  firstVisit: number;
}

export function TrajectoryMap({ visitedShops, onMarkerClick }: TrajectoryMapProps) {
  const { t, locale } = useI18n();
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
      out.push({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        city: s.city && s.city.trim() ? s.city : null,
        firstVisit,
      });
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

  useEffect(() => {
    fitBoundsToStops();
  }, [fitBoundsToStops]);

  const path = useMemo(
    () => stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    [stops],
  );

  const cityCount = useMemo(() => {
    const set = new Set<string>();
    for (const s of stops) if (s.city) set.add(s.city);
    return set.size;
  }, [stops]);

  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<
    { kind: 'error' | 'info'; message: string } | null
  >(null);

  useEffect(() => {
    if (!shareStatus) return;
    const id = window.setTimeout(() => setShareStatus(null), 5000);
    return () => window.clearTimeout(id);
  }, [shareStatus]);

  const onShare = async () => {
    if (sharing || stops.length < 2) return;
    setShareStatus(null);
    setSharing(true);
    try {
      const first = stops[0].firstVisit;
      const last = stops[stops.length - 1].firstVisit;
      const rangeLabel =
        first && last && last > first
          ? `${formatAbsoluteDate(first, locale)} → ${formatAbsoluteDate(last, locale)}`
          : first
            ? formatAbsoluteDate(first, locale)
            : '';
      const blob = await renderTrajectoryCard({
        title: t('passport.trajectoryShareTitle'),
        countLabel: t('passport.trajectoryShareCount', { count: stops.length }),
        citiesLabel:
          cityCount >= 2 ? t('passport.trajectoryShareCities', { count: cityCount }) : '',
        rangeLabel,
        brand: 'acoffee.com',
        stops: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      });
      const result = await sharePassportCard(blob, {
        title: t('passport.trajectoryShareTitle'),
        text: t('passport.trajectoryShareText', {
          count: stops.length,
          cities: cityCount,
        }),
        fileName: 'my-coffee-trajectory.png',
      });
      track('trajectory_shared', {
        result,
        stopCount: stops.length,
        cityCount,
      });
      setShareStatus({
        kind: 'info',
        message:
          result === 'shared'
            ? t('visited.shareShared')
            : t('passport.trajectoryShareDownloaded'),
      });
    } catch (e) {
      console.error('Trajectory share failed:', e);
      track('trajectory_shared', {
        result: 'error',
        stopCount: stops.length,
        cityCount,
      });
      setShareStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : t('visited.shareError'),
      });
    } finally {
      setSharing(false);
    }
  };

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
      <div className={styles.header}>
        <h2 className={styles.sectionTitle}>{t('passport.trajectoryTitle')}</h2>
        {stops.length >= 2 ? (
          <button
            type="button"
            className={styles.shareButton}
            onClick={() => void onShare()}
            disabled={sharing}
          >
            {sharing ? t('visited.sharing') : t('passport.trajectoryShareCta')}
          </button>
        ) : null}
      </div>
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
      {shareStatus ? (
        <p
          className={shareStatus.kind === 'error' ? styles.shareError : styles.shareInfo}
          role="status"
        >
          {shareStatus.message}
        </p>
      ) : null}
    </section>
  );
}
