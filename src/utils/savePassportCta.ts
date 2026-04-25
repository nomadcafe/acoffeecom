const STORAGE_KEY = 'ACoffee-meetup-save-cta-dismissed';
const SUPPRESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const VISIT_THRESHOLD = 3;

export function isCtaDismissed(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SUPPRESS_MS;
  } catch {
    return false;
  }
}

export function markCtaDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore quota / privacy mode */
  }
}
