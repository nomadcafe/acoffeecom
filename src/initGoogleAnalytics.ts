/**
 * GA4 (gtag.js). Loads only when VITE_GA_MEASUREMENT_ID is set at **build time**
 * (Vite inlines `import.meta.env`). For Cloudflare Pages, add the variable under
 * Project → Settings → Environment variables and trigger a new deployment.
 */
export function initGoogleAnalytics(measurementId: string): void {
  const id = measurementId.trim();
  if (!id) return;

  const w = window as Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };

  w.dataLayer = w.dataLayer ?? [];
  w.gtag = function gtag(...args: unknown[]) {
    w.dataLayer!.push(args);
  };

  // Match Google’s snippet order: load gtag.js first, then queue commands.
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  w.gtag('js', new Date());
  w.gtag('config', id, { send_page_view: true });
}
