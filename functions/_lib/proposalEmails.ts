/**
 * HTML rendering for proposal-side notifications. The sender of a
 * `/p/<id>` proposal gets one of these whenever the receiver taps a
 * button — that closes the loop the original lightweight-flow design
 * left dangling (DB updated, sender oblivious).
 *
 * Receiver email is unknown (proposals are anonymous on the receiver
 * side), so these emails carry no Reply-To. They're one-way pings;
 * the sender goes back to whichever chat they used to share the
 * original link if they want to coordinate further.
 */

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SHELL_OPEN = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#faf6f1;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 26px;">`;

const SHELL_CLOSE = `    <p style="margin:24px 0 0;color:#a09080;font-size:12px;">
      Sent by <a href="https://acoffee.com/" style="color:#a36b3e;text-decoration:none;">ACoffee</a>.
    </p>
  </div>
</body></html>`;

function whereCard(name: string, address: string): string {
  return `<div style="margin:24px 0;padding:16px 18px;background:#faf6f1;border-radius:10px;">
      <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Where</div>
      <div style="font-size:18px;font-weight:600;color:#2c1810;">${escape(name)}</div>
      <div style="font-size:14px;color:#5c4030;margin-top:4px;">${escape(address)}</div>
    </div>`;
}

function ctaButton(label: string, url: string): string {
  return `<p style="text-align:center;margin:0 0 18px;">
      <a href="${escape(url)}" style="display:inline-block;padding:0.7rem 1.4rem;background:#5e7a52;color:#fff;font-weight:600;border-radius:999px;text-decoration:none;">${escape(label)}</a>
    </p>`;
}

export interface ProposalUpdateParams {
  /** ms-since-epoch — caller renders the localized string before passing it. */
  startStr: string;
  cafeName: string;
  cafeAddress: string;
  url: string;
}

export function renderProposalAcceptedHtml(p: ProposalUpdateParams): string {
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">They're in ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    ${whereCard(p.cafeName, p.cafeAddress)}
    <p style="margin:0 0 14px;color:#5c4030;font-size:14px;line-height:1.5;">
      Your coffee proposal was accepted. Just show up — no further
      confirmation needed on your side.
    </p>
    ${ctaButton('See the proposal', p.url)}
${SHELL_CLOSE}`;
}

export function renderProposalTimeShiftedHtml(p: ProposalUpdateParams): string {
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">They suggested a new time ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">Now: ${escape(p.startStr)}</p>
    ${whereCard(p.cafeName, p.cafeAddress)}
    <p style="margin:0 0 14px;color:#5c4030;font-size:14px;line-height:1.5;">
      The receiver tweaked the time. Open the link to confirm the new
      slot, or shift it again if it doesn't work for you either.
    </p>
    ${ctaButton('See the new time', p.url)}
${SHELL_CLOSE}`;
}

export function renderProposalCafeChangedHtml(p: ProposalUpdateParams): string {
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">They picked a different café ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    ${whereCard(p.cafeName, p.cafeAddress)}
    <p style="margin:0 0 14px;color:#5c4030;font-size:14px;line-height:1.5;">
      The receiver cycled to one of the other candidates the agent
      surfaced. Open the link to see the new spot or pick again
      yourself.
    </p>
    ${ctaButton('See the new café', p.url)}
${SHELL_CLOSE}`;
}
