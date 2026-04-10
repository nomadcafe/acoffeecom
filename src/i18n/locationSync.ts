/** Fired after pushState/replaceState so React can re-read `location.pathname`. */
export const LOCATION_SYNC_EVENT = 'acoffee:navigate';

export function notifyLocationSync(): void {
  window.dispatchEvent(new Event(LOCATION_SYNC_EVENT));
}
