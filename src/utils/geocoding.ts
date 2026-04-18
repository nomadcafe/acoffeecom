export async function geocodeAddress(
  address: string,
  geocoder: google.maps.Geocoder
): Promise<{ lat: number; lng: number }> {
  const { results } = await geocoder.geocode({ address });
  if (!results[0]) throw new Error(`Geocoding failed for "${address}"`);
  const loc = results[0].geometry.location;
  return { lat: loc.lat(), lng: loc.lng() };
}
