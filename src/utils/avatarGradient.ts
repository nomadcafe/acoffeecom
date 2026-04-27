/**
 * Deterministic two-color gradient from a string seed (username, email).
 * Replaces the flat brown avatar fallback so accounts get a small,
 * personal visual signature without needing image upload UX.
 *
 * Saturation/lightness are tuned tight: 55% / 60→42% keeps colors muted
 * on cream paper (no neon) and ensures the darker stop has enough
 * contrast for white text. The 35° hue offset makes the two stops feel
 * related instead of clashing.
 */

function hash(s: string): number {
  // djb2 — tiny, deterministic, plenty of entropy for 360 hue values.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function avatarGradient(seed: string | null | undefined): string {
  const safe = seed?.trim().toLowerCase() || 'guest';
  const h1 = hash(safe) % 360;
  const h2 = (h1 + 35) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 55%, 60%), hsl(${h2}, 50%, 42%))`;
}
