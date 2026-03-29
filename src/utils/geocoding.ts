export async function geocodeAddress(
  address: string,
  geocoder: google.maps.Geocoder
): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
        const location = results[0].geometry.location;
        resolve({
          lat: location.lat(),
          lng: location.lng(),
        });
      } else {
        reject(new Error(`Geocoding failed for "${address}": ${status}`));
      }
    });
  });
}
