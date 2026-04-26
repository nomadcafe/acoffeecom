import { useEffect, useState } from 'react';

/**
 * Tiny pub-sub layer for "can we reach Google's APIs right now". Both the
 * Maps SDK (autocomplete RPCs) and our Place.searchNearby calls dispatch
 * here when they catch / clear network-class errors so any listener can
 * surface a unified "check your VPN" message without having to guess at
 * the cause string per call site.
 */

const GOOGLE_NETWORK_ERROR_EVENT = 'acoffee:google-network-error';
const GOOGLE_NETWORK_OK_EVENT = 'acoffee:google-network-ok';

const NETWORK_ERROR_PATTERNS = [
  /xhr error/i,
  /network error/i,
  /failed to fetch/i,
  /networkerror/i,
  /err_name_not_resolved/i,
  /err_internet_disconnected/i,
  /err_connection/i,
  /load failed/i,
];

/** Returns true if `e`'s message matches one of the DNS / connection
 *  failure shapes we care about — distinct from API quota / 4xx errors. */
export function isLikelyNetworkError(e: unknown): boolean {
  if (!e) return false;
  const msg = e instanceof Error ? e.message : String(e);
  return NETWORK_ERROR_PATTERNS.some((re) => re.test(msg));
}

export function reportGoogleNetworkError(): void {
  window.dispatchEvent(new Event(GOOGLE_NETWORK_ERROR_EVENT));
}

export function reportGoogleNetworkOk(): void {
  window.dispatchEvent(new Event(GOOGLE_NETWORK_OK_EVENT));
}

/** True while we've seen at least one Google network error since the last
 *  successful Google call (autocomplete, places search). Resets to false on
 *  the next OK signal. */
export function useGoogleNetworkStatus(): boolean {
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => {
    const onErr = () => setUnreachable(true);
    const onOk = () => setUnreachable(false);
    window.addEventListener(GOOGLE_NETWORK_ERROR_EVENT, onErr);
    window.addEventListener(GOOGLE_NETWORK_OK_EVENT, onOk);
    return () => {
      window.removeEventListener(GOOGLE_NETWORK_ERROR_EVENT, onErr);
      window.removeEventListener(GOOGLE_NETWORK_OK_EVENT, onOk);
    };
  }, []);
  return unreachable;
}
