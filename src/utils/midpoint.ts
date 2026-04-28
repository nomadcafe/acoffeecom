/**
 * Geographic centroid of N points (>=1). Averages 3D unit vectors so results
 * stay sensible across the antimeridian and near the poles, which is more
 * robust than a flat lat/lng mean — and reduces to the great-circle midpoint
 * when N=2. Used by the multi-party meetup flow (2–3 people in v1).
 */
export function centroid(
  points: { lat: number; lng: number }[],
): { lat: number; lng: number } {
  if (points.length === 0) return { lat: 0, lng: 0 };
  if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const latR = toRad(p.lat);
    const lngR = toRad(p.lng);
    x += Math.cos(latR) * Math.cos(lngR);
    y += Math.cos(latR) * Math.sin(lngR);
    z += Math.sin(latR);
  }
  const n = points.length;
  x /= n;
  y /= n;
  z /= n;
  const lng = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);
  return { lat: toDeg(lat), lng: toDeg(lng) };
}

export function calculateMidpoint(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { lat: number; lng: number } {
  // Convert to radians
  const dLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const lng1Rad = toRad(lng1);

  const bX = Math.cos(lat2Rad) * Math.cos(dLng);
  const bY = Math.cos(lat2Rad) * Math.sin(dLng);

  const midLat = Math.atan2(
    Math.sin(lat1Rad) + Math.sin(lat2Rad),
    Math.sqrt((Math.cos(lat1Rad) + bX) ** 2 + bY ** 2)
  );

  const midLng = lng1Rad + Math.atan2(bY, Math.cos(lat1Rad) + bX);

  return {
    lat: toDeg(midLat),
    lng: toDeg(midLng),
  };
}

export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  // Haversine formula - returns distance in meters
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
