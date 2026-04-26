import { useEffect } from 'react';
import { LOCATION_SYNC_EVENT } from '../i18n/locationSync';

/**
 * Intercept clicks on same-origin `<a>` links and resolve them via
 * `history.pushState` instead of a full page reload. Two reasons:
 *
 *  1. Faster: no chunk re-fetch, no AppProvider re-mount, no auth handshake
 *     blink. The route switch is just a re-render driven by usePathname().
 *  2. Avoids a class of in-app-browser bugs: some iOS WebView wrappers (the
 *     `stable.app/error_page_loaded.html?...&dontLoad=true` page some users
 *     reported) intercept "navigation to a different URL" and refuse it,
 *     even when it's same-origin SPA traffic. pushState looks like nothing
 *     to those wrappers — just a URL bar update.
 *
 * Opt-out: add `data-no-spa` on the anchor or set `target` to anything other
 * than `_self`. External hosts, mailto/tel/sms, downloads, and modifier-key
 * clicks (cmd-click for new tab, etc.) are skipped automatically.
 */
export function useInterceptInternalLinks(): void {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target instanceof Element ? e.target : null;
      const anchor = target?.closest('a');
      if (!anchor) return;

      if (anchor.dataset.noSpa != null) return;
      if (anchor.target && anchor.target !== '' && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href) return;
      // Pure scheme-only links (mailto/tel/sms) and pure-hash anchors are not ours.
      if (/^(mailto:|tel:|sms:|javascript:|#)/i.test(href)) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      // Same-page hash navigation — let the browser handle smooth scrolling.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return;
      }

      e.preventDefault();
      const prevPath = window.location.pathname;
      const next = url.pathname + url.search + url.hash;
      // Skip pushState if we're already there (defensive — avoids polluting history).
      if (next !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.pushState({}, '', next);
        window.dispatchEvent(new Event(LOCATION_SYNC_EVENT));
      }
      // Cross-page jumps should land at the top, mirroring native nav. Hash
      // jumps within the same page get scroll handled by the browser already.
      if (url.pathname !== prevPath && !url.hash) {
        window.scrollTo({ top: 0, left: 0 });
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}
