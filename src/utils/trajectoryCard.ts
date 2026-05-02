/**
 * Renders a 1080×1080 "My Coffee Trajectory" PNG off-screen. Pure canvas so
 * it ships without any network calls (no Static Maps API) and stays free at
 * any scale.
 *
 * Visual brief:
 * - Brown gradient bg + faint cream inset panel — same family as the
 *   passport card so a user's social posts share visual signature.
 * - Title in Fraunces (the brand display font) — instantly reads as
 *   "ACoffee" instead of generic Helvetica.
 * - Map panel has a subtle cream dot-grid behind the trajectory so it
 *   doesn't feel like a void; polyline gets a soft outer glow so the
 *   path "lifts" off the panel.
 * - Start dot uses brand sage (--ac-accent-2), end dot a warm coral, mid
 *   dots cream. Numbers stay legible by switching baseline + a 1.5px
 *   dark hairline border.
 * - Footer is a Fraunces wordmark plus the user's acoffee.com URL —
 *   if a handle is provided, the URL becomes "acoffee.com/{handle}"
 *   with the slug emphasized in cream.
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
  /** Domain wordmark for the footer ("acoffee.com"). */
  brand: string;
  /** Optional username — when present the footer shows
   *  "{brand}/{handle}" with the slug highlighted. */
  handle?: string;
  stops: TrajectoryStop[];
}

const SIZE = 1080;
const DISPLAY_FONT = '"Fraunces", "Iowan Old Style", "Georgia", serif';
const SANS_FONT = '"Helvetica Neue", Arial, sans-serif';

const COLORS = {
  bgFrom: '#3e2416',
  bgTo: '#6b4423',
  panelTint: 'rgba(255, 248, 240, 0.06)',
  divider: 'rgba(255, 229, 184, 0.55)',
  title: '#ffffff',
  subtitle: '#ffe5b8',
  range: 'rgba(255, 255, 255, 0.6)',
  brandText: '#ffe5b8',
  handleText: '#fff8d2',
  brandUrlMuted: 'rgba(255, 255, 255, 0.55)',
  mapPanel: 'rgba(0, 0, 0, 0.22)',
  mapGrid: 'rgba(255, 229, 184, 0.045)',
  pathGlow: 'rgba(255, 229, 184, 0.18)',
  path: 'rgba(255, 229, 184, 0.85)',
  dotStart: '#7ea36b',
  dotEnd: '#e08a7a',
  dotMid: '#ffe5b8',
  dotBorder: 'rgba(62, 36, 22, 0.45)',
  dotLabel: '#3e2416',
} as const;

export async function renderTrajectoryCard(data: TrajectoryCardData): Promise<Blob> {
  // Fraunces is loaded via the html <head> Google Fonts link; canvas
  // needs the actual face to be ready before drawing or it falls back
  // to Georgia. Cheap to wait, ~2-300ms after first page load (cached
  // afterwards). Guarded so it doesn't throw in older browsers.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.load(`700 64px ${DISPLAY_FONT}`);
      await document.fonts.ready;
    } catch {
      /* fall back to Georgia if Fraunces fails — not blocking */
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // ── Background gradient + faint cream inset panel ──
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, COLORS.bgFrom);
  bg.addColorStop(1, COLORS.bgTo);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const panelInset = 60;
  ctx.fillStyle = COLORS.panelTint;
  roundRect(ctx, panelInset, panelInset, SIZE - panelInset * 2, SIZE - panelInset * 2, 32);
  ctx.fill();

  // ── Header lockup (y 150-380) ──
  ctx.textAlign = 'center';

  // Cup glyph — kept in system emoji font so it always rasterizes.
  ctx.font = `80px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
  ctx.fillStyle = COLORS.title;
  ctx.fillText('☕', SIZE / 2, 195);

  // Small accent rule between the cup and the title — pulls the eye
  // from "logo" → "title" the way a print poster would.
  ctx.strokeStyle = COLORS.divider;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SIZE / 2 - 32, 230);
  ctx.lineTo(SIZE / 2 + 32, 230);
  ctx.stroke();

  // Title — display serif, biggest type on the card.
  ctx.fillStyle = COLORS.title;
  ctx.font = `700 64px ${DISPLAY_FONT}`;
  ctx.fillText(data.title, SIZE / 2, 295);

  // Subtitle (count · cities)
  ctx.fillStyle = COLORS.subtitle;
  ctx.font = `600 30px ${SANS_FONT}`;
  const subtitleParts = [data.countLabel, data.citiesLabel].filter(Boolean);
  if (subtitleParts.length > 0) {
    ctx.fillText(subtitleParts.join(' · '), SIZE / 2, 345);
  }

  // Date range
  if (data.rangeLabel) {
    ctx.fillStyle = COLORS.range;
    ctx.font = `400 24px ${SANS_FONT}`;
    ctx.fillText(data.rangeLabel, SIZE / 2, 382);
  }

  // ── Map panel (y 410-960) ──
  const mapX = 90;
  const mapY = 410;
  const mapW = SIZE - mapX * 2;
  const mapH = 550;
  ctx.fillStyle = COLORS.mapPanel;
  roundRect(ctx, mapX, mapY, mapW, mapH, 24);
  ctx.fill();

  drawMapGrid(ctx, mapX, mapY, mapW, mapH);

  if (data.stops.length >= 1) {
    drawTrajectory(ctx, data.stops, mapX, mapY, mapW, mapH);
  }

  // ── Footer (y 985-1040): wordmark + url ──
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.brandText;
  ctx.font = `700 36px ${DISPLAY_FONT}`;
  ctx.fillText('ACoffee', SIZE / 2, 1000);

  if (data.handle) {
    // Compose "{brand}/{slug}" so we can color the slug differently.
    const brandPart = `${data.brand}/`;
    const slugPart = data.handle;
    ctx.font = `500 22px ${SANS_FONT}`;
    const brandWidth = ctx.measureText(brandPart).width;
    const slugWidth = ctx.measureText(slugPart).width;
    const totalWidth = brandWidth + slugWidth;
    const startX = SIZE / 2 - totalWidth / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.brandUrlMuted;
    ctx.fillText(brandPart, startX, 1035);
    ctx.fillStyle = COLORS.handleText;
    ctx.font = `600 22px ${SANS_FONT}`;
    ctx.fillText(slugPart, startX + brandWidth, 1035);
    ctx.textAlign = 'center';
  } else {
    ctx.fillStyle = COLORS.brandUrlMuted;
    ctx.font = `500 22px ${SANS_FONT}`;
    ctx.fillText(data.brand, SIZE / 2, 1035);
  }

  return new Promise<Blob>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Canvas encode timed out')), 10_000);
    canvas.toBlob((blob) => {
      window.clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });
}

/**
 * Subtle cream dot grid inside the map panel — gives the panel "paper"
 * texture so a single trajectory line doesn't sit on a void. Stays
 * inside the panel via clip(); transparent enough to read as background.
 */
function drawMapGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const SPACING = 40;
  ctx.save();
  // Clip to the rounded panel so dots don't poke past the corners.
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, 24);
  ctx.clip();
  ctx.fillStyle = COLORS.mapGrid;
  for (let gx = x + SPACING / 2; gx < x + w; gx += SPACING) {
    for (let gy = y + SPACING / 2; gy < y + h; gy += SPACING) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
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

  // Polyline — outer glow + main stroke for depth.
  if (points.length >= 2) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    // Soft outer glow first
    ctx.strokeStyle = COLORS.pathGlow;
    ctx.lineWidth = 14;
    ctx.stroke();
    // Crisp inner stroke on top
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Numbered dots — start sage, end coral, middle cream.
  const dotR = points.length > 30 ? 12 : points.length > 15 ? 14 : 17;
  points.forEach(([x, y], i) => {
    const isStart = i === 0;
    const isEnd = i === points.length - 1 && points.length > 1;
    let fill: string = COLORS.dotMid;
    if (isStart) fill = COLORS.dotStart;
    if (isEnd) fill = COLORS.dotEnd;

    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = COLORS.dotBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number labels become illegible past ~25 stops; show the digits only on
    // the start, end, and a sparse subset in between.
    const showLabel =
      points.length <= 25 || isStart || isEnd || (i + 1) % 5 === 0;
    if (showLabel) {
      ctx.fillStyle = COLORS.dotLabel;
      ctx.font = `700 ${Math.round(dotR * 0.95)}px ${SANS_FONT}`;
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
  roundRectPath(ctx, x, y, w, h, r);
}

function roundRectPath(
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
