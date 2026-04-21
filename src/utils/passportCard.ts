/**
 * Renders a 1080x1080 "My Coffee Passport" PNG off-screen.
 * Pure canvas — no external assets — so it ships without network calls and keeps bundle small.
 */
export interface PassportCardData {
  title: string;
  countLabel: string;
  visitsLabel: string;
  sinceLabel: string;
  topLabel: string;
  brand: string;
  topShops: { name: string; visits: number }[];
}

const SIZE = 1080;

export async function renderPassportCard(data: PassportCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background: warm coffee gradient.
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, '#3e2416');
  bg.addColorStop(1, '#6b4423');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle inner panel for contrast.
  const panelInset = 60;
  ctx.fillStyle = 'rgba(255, 248, 240, 0.06)';
  roundRect(ctx, panelInset, panelInset, SIZE - panelInset * 2, SIZE - panelInset * 2, 32);
  ctx.fill();

  // Top: coffee cup emoji.
  ctx.font = '120px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText('☕', SIZE / 2, 220);

  // Title.
  ctx.fillStyle = '#fff';
  ctx.font = '600 58px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(data.title, SIZE / 2, 310);

  // Big count.
  ctx.fillStyle = '#ffe5b8';
  ctx.font = '700 46px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(data.countLabel, SIZE / 2, 400);

  // Visits + since line.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '400 32px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(data.visitsLabel, SIZE / 2, 460);
  if (data.sinceLabel) {
    ctx.font = '400 26px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillText(data.sinceLabel, SIZE / 2, 502);
  }

  // Top shops section.
  if (data.topShops.length > 0) {
    ctx.fillStyle = 'rgba(255, 229, 184, 0.9)';
    ctx.font = '600 24px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.topLabel.toUpperCase(), SIZE / 2, 600);

    ctx.font = '500 34px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'left';
    const listStartY = 660;
    const rowH = 64;
    const maxNameWidth = SIZE - 300;
    data.topShops.forEach((shop, i) => {
      const y = listStartY + i * rowH;
      // Rank circle.
      ctx.beginPath();
      ctx.arc(160, y - 10, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe5b8';
      ctx.fill();
      ctx.fillStyle = '#3e2416';
      ctx.font = '700 26px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), 160, y - 10);
      ctx.textBaseline = 'alphabetic';

      // Name (truncated if too long).
      ctx.fillStyle = '#fff';
      ctx.font = '500 32px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(truncate(ctx, shop.name, maxNameWidth), 205, y);

      // Visit count on right.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '400 28px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`×${shop.visits}`, SIZE - 160, y);
    });
  }

  // Brand footer.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = '500 28px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.brand, SIZE / 2, SIZE - 90);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
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

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + ellipsis;
}

interface ShareOptions {
  title: string;
  text: string;
  fileName: string;
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded';

/**
 * Uses the Web Share API with files when supported (iOS Safari, Chrome Android);
 * otherwise triggers a download of the PNG blob. Reports which path ran so
 * the caller can show an accurate status message.
 */
export async function sharePassportCard(
  blob: Blob,
  options: ShareOptions,
): Promise<ShareResult> {
  const file = new File([blob], options.fileName, { type: 'image/png' });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: options.title, text: options.text });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Fall through to download on other errors.
    }
  }
  downloadBlob(blob, options.fileName);
  return 'downloaded';
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
