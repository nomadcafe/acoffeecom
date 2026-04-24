import { useEffect, useRef } from 'react';

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void };

export function track(event: string, params?: Record<string, unknown>): void {
  const w = window as GtagWindow;
  w.gtag?.('event', event, params ?? {});
}

/**
 * Fire a GA page_view for SPA route changes. The initial load is already
 * covered by gtag('config', ..., { send_page_view: true }) in
 * initGoogleAnalytics — we skip the first render to avoid double-counting.
 */
export function useTrackPageViews(pathname: string): void {
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    track('page_view', {
      page_path: pathname,
      page_location: window.location.href,
    });
  }, [pathname]);
}
