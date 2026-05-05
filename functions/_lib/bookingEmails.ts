/**
 * HTML rendering for booking confirmation + cancellation emails. Kept in
 * one file so visual style stays consistent across the four variants
 * (organizer-confirm, visitor-confirm, organizer-cancel, visitor-cancel).
 *
 * Each renderer takes a structured params object and produces a complete
 * `<!DOCTYPE html>` document — Resend just sends the string.
 */

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format the start time twice — once in each side's local zone — so the
 * recipient never has to mentally convert. Both labels are inlined; if the
 * two timezones happen to be the same we collapse to one line.
 */
export function formatTimePair(
  startMs: number,
  zoneA: { tz: string; label: string },
  zoneB: { tz: string; label: string } | null,
): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(startMs));
  const a = fmt(zoneA.tz);
  if (!zoneB || zoneB.tz === zoneA.tz) return a;
  const b = fmt(zoneB.tz);
  return `${a} (${zoneA.label}) · ${b} (${zoneB.label})`;
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

function whereCard(
  name: string,
  address: string,
  mapsUri: string | null,
  directionsUri: string | null,
): string {
  /* Two affordances on the venue card:
   *  - "Open in Maps" → place page (existing googleMapsUri)
   *  - "Get directions" → routing UI with destination pre-filled
   * Different intents — the first lets you check the cafe out, the
   * second helps you actually go. Render side-by-side when both are
   * available; either one alone falls through if the other is null. */
  const links: string[] = [];
  if (mapsUri) {
    links.push(
      `<a href="${escape(mapsUri)}" style="color:#a36b3e;text-decoration:none;">Open in Maps →</a>`,
    );
  }
  if (directionsUri) {
    links.push(
      `<a href="${escape(directionsUri)}" style="color:#5e7a52;text-decoration:none;">Get directions →</a>`,
    );
  }
  const linksRow = links.length
    ? `<div style="margin-top:10px;display:flex;gap:14px;flex-wrap:wrap;">${links.join('')}</div>`
    : '';
  return `<div style="margin:24px 0;padding:16px 18px;background:#faf6f1;border-radius:10px;">
      <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Where</div>
      <div style="font-size:18px;font-weight:600;color:#2c1810;">${escape(name)}</div>
      <div style="font-size:14px;color:#5c4030;margin-top:4px;">${escape(address)}</div>
      ${linksRow}
    </div>`;
}

// ---------- email verification (gate before host notification) ----------

export interface ConfirmRequestParams {
  hostHandle: string;
  visitorName: string;
  startStr: string;
  /** Single-use HMAC link the visitor clicks to confirm. */
  confirmUrl: string;
}

/**
 * First-touch email after a visitor submits the booking form. The host
 * is NOT notified until the visitor clicks this link — that protects
 * hosts from spam-by-impersonation (someone using another person's
 * email) and validates the email is reachable before we put a real
 * person in the loop.
 *
 * No café in this email — café picking happens after host approval, not
 * at submit time. The email's job is only "prove you're at this address."
 */
export function renderVisitorConfirmRequestHtml(p: ConfirmRequestParams): string {
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">Confirm your coffee request ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    <p style="margin:24px 0 14px;color:#5c4030;font-size:14px;line-height:1.5;">
      Hi ${escape(p.visitorName)} — click below to send this request to
      ${escape(p.hostHandle)}. They won't see it until you confirm. Once you
      do, ${escape(p.hostHandle)} will reply with a yes (and pick the café)
      or suggest a different time.
    </p>
    <p style="text-align:center;margin:0 0 18px;">
      <a href="${escape(p.confirmUrl)}" style="display:inline-block;padding:0.7rem 1.4rem;background:#5e7a52;color:#fff;font-weight:600;border-radius:999px;text-decoration:none;">Confirm and send request →</a>
    </p>
    <p style="margin:0;color:#7a6a60;font-size:13px;line-height:1.5;">
      If you didn't request this, just ignore — without a click the request
      expires and ${escape(p.hostHandle)} never sees it.
    </p>
${SHELL_CLOSE}`;
}

// ---------- new booking ----------

export interface ConfirmationParams {
  startStr: string;
  cafeName: string;
  cafeAddress: string;
  cafeMaps: string | null;
  /** Direct-to-routing Google Maps URL (`/maps/dir/?api=1&...`).
   *  Distinct from cafeMaps (which opens the place page). When the
   *  visitor opens this from their inbox, they get a navigation UI
   *  with the cafe pre-filled — closes the "I picked the cafe but
   *  how do I get there" gap. Null skips the row in whereCard. */
  cafeDirections: string | null;
  visitorName: string;
  visitorEmail: string;
  visitorAddress: string;
  hostHandle: string;
  hostHomeBase: string;
  /** Visitor-only: link to cancel this booking. */
  cancelUrl?: string;
  /** Optional message the visitor wrote in the booking form. */
  visitorMessage?: string | null;
}

export function renderOrganizerConfirmationHtml(p: ConfirmationParams): string {
  const messageBlock = p.visitorMessage?.trim()
    ? `<div style="margin:0 0 18px;padding:14px 16px;background:#fdf8f1;border-left:3px solid #a36b3e;border-radius:6px;">
        <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Their note</div>
        <div style="font-size:14px;color:#2c1810;line-height:1.5;white-space:pre-wrap;">${escape(p.visitorMessage)}</div>
      </div>`
    : '';
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">${escape(p.visitorName)} booked a coffee with you ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    ${whereCard(p.cafeName, p.cafeAddress, p.cafeMaps, p.cafeDirections)}
    <div style="margin:0 0 8px;font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Visitor</div>
    <div style="font-size:14px;color:#2c1810;line-height:1.6;margin-bottom:18px;">
      <strong>${escape(p.visitorName)}</strong><br>
      <a href="mailto:${escape(p.visitorEmail)}" style="color:#a36b3e;text-decoration:none;">${escape(p.visitorEmail)}</a><br>
      <span style="color:#5c4030;">Coming from ${escape(p.visitorAddress)}</span>
    </div>
    ${messageBlock}
    <p style="margin:0 0 8px;color:#5c4030;font-size:14px;line-height:1.5;">
      We auto-picked the café halfway between ${escape(p.hostHomeBase)} and ${escape(p.visitorAddress)}.
    </p>
    <p style="margin:0;color:#7a6a60;font-size:13px;">
      The .ics attachment will add this to your calendar. Reply-To this email goes
      directly to ${escape(p.visitorName)} — write back if you need to coordinate.
      To cancel, manage your bookings at
      <a href="https://acoffee.com/bookings" style="color:#a36b3e;text-decoration:none;">acoffee.com/bookings</a>.
    </p>
${SHELL_CLOSE}`;
}

export function renderVisitorConfirmationHtml(p: ConfirmationParams): string {
  const cancelLine = p.cancelUrl
    ? `<p style="margin:8px 0 0;color:#7a6a60;font-size:13px;">
        Need to cancel? <a href="${escape(p.cancelUrl)}" style="color:#a36b3e;text-decoration:none;">Cancel this coffee →</a>
      </p>`
    : '';
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">Coffee with ${escape(p.hostHandle)} ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    ${whereCard(p.cafeName, p.cafeAddress, p.cafeMaps, p.cafeDirections)}
    <p style="margin:0 0 8px;color:#5c4030;font-size:14px;line-height:1.5;">
      We picked this café automatically based on the midpoint between
      ${escape(p.visitorName)} and ${escape(p.hostHandle)}'s home base.
    </p>
    <p style="margin:0;color:#7a6a60;font-size:13px;">
      The .ics attachment will add this to your calendar.
    </p>
    ${cancelLine}
${SHELL_CLOSE}`;
}

// ---------- cancellation ----------

export interface CancellationParams {
  hostHandle: string;
  visitorName: string;
  startStr: string;
  cafeName: string;
  cafeAddress: string;
}

export function renderVisitorCancellationHtml(p: CancellationParams): string {
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">Coffee with ${escape(p.hostHandle)} — cancelled</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    <div style="margin:24px 0;padding:16px 18px;background:#faf6f1;border-radius:10px;">
      <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Was at</div>
      <div style="font-size:18px;font-weight:600;color:#2c1810;">${escape(p.cafeName)}</div>
      <div style="font-size:14px;color:#5c4030;margin-top:4px;">${escape(p.cafeAddress)}</div>
    </div>
    <p style="margin:0 0 8px;color:#5c4030;font-size:14px;line-height:1.5;">
      Hi ${escape(p.visitorName)} — ${escape(p.hostHandle)} cancelled this coffee.
      Sorry about that. You can pick a new time on their profile when you're ready.
    </p>
${SHELL_CLOSE}`;
}

export interface RescheduleRequestParams extends CancellationParams {
  /** acoffee.com/<host-username> — visitor clicks here to pick a new slot. */
  rebookUrl: string;
}

/**
 * Variant of the visitor-side cancellation email used when the host
 * actively wants to keep the meeting on the books — just at a different
 * time. Same shell, but the body asks the visitor to rebook with a
 * prominent CTA. Sent when the organizer hits the "Reschedule" button
 * on /bookings (which under the hood is "cancel + this email").
 */
export function renderVisitorRescheduleRequestHtml(p: RescheduleRequestParams): string {
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">${escape(p.hostHandle)} would like to reschedule ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    <div style="margin:24px 0;padding:16px 18px;background:#faf6f1;border-radius:10px;">
      <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Was at</div>
      <div style="font-size:18px;font-weight:600;color:#2c1810;">${escape(p.cafeName)}</div>
      <div style="font-size:14px;color:#5c4030;margin-top:4px;">${escape(p.cafeAddress)}</div>
    </div>
    <p style="margin:0 0 14px;color:#5c4030;font-size:14px;line-height:1.5;">
      Hi ${escape(p.visitorName)} — ${escape(p.hostHandle)} can't make this slot
      anymore. Pick a new time below and we'll auto-pick a café between you again.
    </p>
    <p style="text-align:center;margin:0 0 18px;">
      <a href="${escape(p.rebookUrl)}" style="display:inline-block;padding:0.7rem 1.4rem;background:#5e7a52;color:#fff;font-weight:600;border-radius:999px;text-decoration:none;">Pick a new time →</a>
    </p>
    <p style="margin:0;color:#7a6a60;font-size:13px;line-height:1.5;">
      Reply directly to this email to talk it over with ${escape(p.hostHandle)}.
    </p>
${SHELL_CLOSE}`;
}

// ---------- request → approve flow ----------

export interface HostRequestReceivedParams {
  hostHandle: string;
  visitorName: string;
  visitorEmail: string;
  startStr: string;
  message: string | null;
  /** Where the host clicks to review/approve/reject. Currently /bookings. */
  reviewUrl: string;
}

/**
 * Sent to the organizer when a visitor submits a booking request. Until
 * the host opens /bookings and approves, the row sits in `requested`
 * status with no café picked. The host's session-authed action there
 * is the gate — no magic link.
 */
export function renderHostRequestReceivedHtml(p: HostRequestReceivedParams): string {
  const messageBlock = p.message?.trim()
    ? `<div style="margin:0 0 18px;padding:14px 16px;background:#fdf8f1;border-left:3px solid #a36b3e;border-radius:6px;">
        <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Their note</div>
        <div style="font-size:14px;color:#2c1810;line-height:1.5;white-space:pre-wrap;">${escape(p.message)}</div>
      </div>`
    : '';
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">${escape(p.visitorName)} wants to grab coffee ☕</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    <div style="margin:24px 0 18px;padding:14px 16px;background:#faf6f1;border-radius:10px;">
      <div style="font-size:14px;color:#2c1810;line-height:1.5;">
        <strong>${escape(p.visitorName)}</strong> ·
        <a href="mailto:${escape(p.visitorEmail)}" style="color:#6f4e37;text-decoration:none;">${escape(p.visitorEmail)}</a>
      </div>
    </div>
    ${messageBlock}
    <p style="margin:0 0 14px;color:#5c4030;font-size:14px;line-height:1.5;">
      Open /bookings to approve and pick the café — they'll get an email
      with the meeting place once you do. You can also decline politely
      if the time doesn't work.
    </p>
    <p style="text-align:center;margin:0 0 18px;">
      <a href="${escape(p.reviewUrl)}" style="display:inline-block;padding:0.7rem 1.4rem;background:#5e7a52;color:#fff;font-weight:600;border-radius:999px;text-decoration:none;">Review this request →</a>
    </p>
    <p style="margin:0;color:#7a6a60;font-size:13px;line-height:1.5;">
      Reply directly to this email to chat with ${escape(p.visitorName)} first.
    </p>
${SHELL_CLOSE}`;
}


export function renderOrganizerCancellationHtml(p: CancellationParams): string {
  return `${SHELL_OPEN}
    <h1 style="margin:0 0 4px;font-size:22px;color:#2c1810;">${escape(p.visitorName)} cancelled their coffee</h1>
    <p style="margin:0;color:#7a6a60;font-size:14px;">${escape(p.startStr)}</p>
    <div style="margin:24px 0;padding:16px 18px;background:#faf6f1;border-radius:10px;">
      <div style="font-size:11px;color:#8a7b70;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:6px;">Was at</div>
      <div style="font-size:18px;font-weight:600;color:#2c1810;">${escape(p.cafeName)}</div>
      <div style="font-size:14px;color:#5c4030;margin-top:4px;">${escape(p.cafeAddress)}</div>
    </div>
    <p style="margin:0 0 8px;color:#5c4030;font-size:14px;line-height:1.5;">
      The slot is free again — anyone visiting acoffee.com/${escape(p.hostHandle.replace(/^@/, ''))} can take it.
    </p>
${SHELL_CLOSE}`;
}
