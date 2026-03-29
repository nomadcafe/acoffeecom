import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { useApp } from '../context/AppContext';
import { getOpenInGoogleMapsUrl } from '../utils/googleMapsLinks';
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

export function Map() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const {
    locationA,
    locationB,
    midpoint,
    coffeeShops,
    setMapRef,
    isStarred,
    selectedCoffeeShopId,
    setSelectedCoffeeShopId,
  } = useApp();

  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  const selectedShop = useMemo(() => {
    if (!selectedCoffeeShopId) return null;
    return coffeeShops.find((s) => s.id === selectedCoffeeShopId) ?? null;
  }, [selectedCoffeeShopId, coffeeShops]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedShop) return;
    map.panTo({ lat: selectedShop.lat, lng: selectedShop.lng });
    const z = map.getZoom();
    if (z != null && z < 15) map.setZoom(15);
  }, [selectedShop]);

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

  if (loadError) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          Failed to load Google Maps. Please check your API key.
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading map...</div>
      </div>
    );
  }

  // Calculate bounds to fit all markers
  const center = midpoint || locationA || locationB || defaultCenter;

  return (
    <div className={styles.container}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={midpoint ? 15 : 12}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
      >
        {/* Location A marker */}
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

        {/* Location B marker */}
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

        {/* Midpoint marker */}
        {midpoint && (
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
            title="Midpoint"
          />
        )}

        {/* Coffee shop markers */}
        {coffeeShops.map((shop) => {
          const starred = isStarred(shop.id);
          return (
            <Marker
              key={shop.id}
              position={{ lat: shop.lat, lng: shop.lng }}
              icon={{
                url: starred
                  ? 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png'
                  : 'https://maps.google.com/mapfiles/ms/icons/coffee.png',
                scaledSize: new google.maps.Size(32, 32),
              }}
              zIndex={selectedCoffeeShopId === shop.id ? google.maps.Marker.MAX_ZINDEX + 1 : undefined}
              onClick={() => setSelectedCoffeeShopId(shop.id)}
            />
          );
        })}

        {/* Info window for selected shop */}
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
                {selectedShop.rating.toFixed(1)} stars ({selectedShop.userRatingsTotal} reviews)
              </p>
              <p className={styles.infoWindowMaps}>
                <a
                  href={getOpenInGoogleMapsUrl(selectedShop)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Google Maps
                </a>
              </p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}
