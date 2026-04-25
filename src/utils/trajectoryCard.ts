/**
 * Renders a 1080x1080 "My Coffee Trajectory" PNG off-screen. Pure canvas so
 * it ships without any network calls (no Static Maps API) and stays free at
 * any scale.
 */
export interface TrajectoryStop {
  lat: number;
  lng: number;
}

export interface TrajectoryCardData {
  title: string;
  countLabel: string;
  citiesLabel: string;
  rangeLabel: string;
  brand: string;
  stops: TrajectoryStop[];
}

const SIZE = 1080;

export async function renderTrajectoryCard(data: TrajectoryCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background — same coffee gradient as the passport card so the two share
  // visual language when posted side by side.
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, '#3e2416');
  bg.addColorStop(1, '#6b4423');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const panelInset = 60;
  ctx.fillStyle = 'rgba(255, 248, 240, 0.06)';
  roundRect(ctx, panelInset, panelInset, SIZE - panelInset * 2, SIZE - panelInset * 2, 32);
  ctx.fill();

  // Header
  ctx.font = '90px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('☕', SIZE / 2, 180);

  ctx.fillStyle = '#fff';
  ctx.font = '600 52px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(data.title, SIZE / 2, 250);

  ctx.fillStyle = '#ffe5b8';
  ctx.font = '600 32px "Helvetica Neue", Arial, sans-serif';
  const subtitleParts = [data.countLabel, data.citiesLabel].filter(Boolean);
  if (subtitleParts.length > 0) {
    ctx.fillText(subtitleParts.join(' · '), SIZE / 2, 300);
  }

  if (data.rangeLabel) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = '400 26px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(data.rangeLabel, SIZE / 2, 342);
  }

  // Map area: a centered rounded panel that holds the projected trajectory.
  const mapX = 90;
  const mapY = 380;
  const mapW = SIZE - mapX * 2;
  const mapH = 560;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  roundRect(ctx, mapX, mapY, mapW, mapH, 24);
  ctx.fill();

  if (data.stops.length >= 1) {
    drawTrajectory(ctx, data.stops, mapX, mapY, mapW, mapH);
  }

  // Brand footer.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '500 24px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.brand, SIZE / 2, SIZE - 50);

  return new Promise<Blob>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Canvas encode timed out')), 10_000);
    canvas.toBlob((blob) => {
      window.clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });
}

function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  stops: TrajectoryStop[],
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): void {
  const padding = 56;
  const innerX = boxX + padding;
  const innerY = boxY + padding;
  const innerW = boxW - padding * 2;
  const innerH = boxH - padding * 2;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const s of stops) {
    if (s.lat < minLat) minLat = s.lat;
    if (s.lat > maxLat) maxLat = s.lat;
    if (s.lng < minLng) minLng = s.lng;
    if (s.lng > maxLng) maxLng = s.lng;
  }

  let latSpan = Math.max(maxLat - minLat, 1e-4);
  let lngSpan = Math.max(maxLng - minLng, 1e-4);
  // Inflate a touch so markers near the bounds don't kiss the edge.
  const latPad = latSpan * 0.08;
  const lngPad = lngSpan * 0.08;
  minLat -= latPad;
  maxLat += latPad;
  minLng -= lngPad;
  maxLng += lngPad;
  latSpan = maxLat - minLat;
  lngSpan = maxLng - minLng;

  // Fit by the dominant axis to keep the trajectory aspect-correct, centered
  // within the inner box.
  const scale = Math.min(innerW / lngSpan, innerH / latSpan);
  const drawW = lngSpan * scale;
  const drawH = latSpan * scale;
  const offsetX = innerX + (innerW - drawW) / 2;
  const offsetY = innerY + (innerH - drawH) / 2;

  const project = (lat: number, lng: number): [number, number] => {
    const x = offsetX + (lng - minLng) * scale;
    // Lat is inverted — higher latitude → lower canvas y.
    const y = offsetY + (maxLat - lat) * scale;
    return [x, y];
  };

  const points = stops.map((s) => project(s.lat, s.lng));

  // Polyline
  if (points.length >= 2) {
    ctx.strokeStyle = 'rgba(255, 229, 184, 0.85)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
  }

  // Numbered dots (start = green, end = red, mid = cream).
  const dotR = points.length > 30 ? 12 : points.length > 15 ? 14 : 17;
  points.forEach(([x, y], i) => {
    const isStart = i === 0;
    const isEnd = i === points.length - 1 && points.length > 1;
    let fill = '#ffe5b8';
    if (isStart) fill = '#7fc88a';
    if (isEnd) fill = '#e08a7a';

    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(62, 36, 22, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number labels become illegible past ~25 stops; show the digits only on
    // the start, end, and a sparse subset in between.
    const showLabel =
      points.length <= 25 || isStart || isEnd || (i + 1) % 5 === 0;
    if (showLabel) {
      ctx.fillStyle = '#3e2416';
      ctx.font = `700 ${Math.round(dotR * 0.95)}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y);
      ctx.textBaseline = 'alphabetic';
    }
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
