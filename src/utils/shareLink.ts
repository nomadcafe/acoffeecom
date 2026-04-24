/**
 * Build a shareable URL for the current meetup with a specific café pre-selected.
 * Preserves all existing query params (a/b/near, filters) so the recipient
 * lands on the same search and the same highlighted café.
 */
export function buildMeetupShareUrl(placeId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('c', placeId);
  return url.toString();
}

export interface ShareLinkOptions {
  title: string;
  text: string;
  url: string;
}

/**
 * `shared`      — Web Share sheet accepted (iOS/Android native share).
 * `copied`      — Web Share unavailable; URL copied to clipboard instead.
 * `cancelled`   — User dismissed the native share sheet.
 * `unsupported` — Neither Web Share nor Clipboard API works here.
 */
export type ShareLinkResult = 'shared' | 'copied' | 'cancelled' | 'unsupported';

export async function shareLink(opts: ShareLinkOptions): Promise<ShareLinkResult> {
  const nav = navigator as Navigator & {
    share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  };
  if (nav.share) {
    try {
      await nav.share({ title: opts.title, text: opts.text, url: opts.url });
      return 'shared';
    } catch (err) {
      // AbortError = user dismissed the sheet. Everything else falls through
      // to clipboard so the user still walks away with the link.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(opts.url);
      return 'copied';
    } catch {
      return 'unsupported';
    }
  }
  return 'unsupported';
}
