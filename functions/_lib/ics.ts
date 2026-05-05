/**
 * RFC 5545 ICS (iCalendar) builder for booking confirmations. Attached to
 * the visitor's "host said yes" email so a single click adds the meetup
 * to Google / Apple / Outlook calendars — no app to install, no manual
 * copy-paste of cafe address into a separate event.
 *
 * Times are emitted in UTC ("Z" suffix); calendar clients display in
 * the viewer's local timezone, so we don't have to ship a VTIMEZONE
 * block. UID is stable per booking ID, so a re-send (host changes cafe
 * or time later) updates the existing event instead of creating a
 * duplicate (METHOD:REQUEST + same UID + bumped SEQUENCE).
 */

export interface BookingIcsInput {
  bookingId: string;
  /** Slot start, ms epoch. */
  startMs: number;
  /** Duration as stored on the booking row. */
  durationMinutes: number;
  /** Display name shown to the visitor; same string the email subject
   *  uses ("@username" or the host's display name). */
  hostHandle: string;
  hostEmail: string;
  visitorName: string;
  visitorEmail: string;
  cafeName: string;
  cafeAddress: string;
  /** Optional free-text note from visitor's request, included in the
   *  event description. Empty / null skips the section. */
  visitorMessage: string | null;
  /** Optional Google Maps URL surfaced as the event URL. Same value
   *  validated by approve.ts to be an https Google Maps host. */
  googleMapsUri: string | null;
  /** SEQUENCE counter — increments each time we re-send an updated
   *  invite for the same UID. First approve = 0; future "change time"
   *  flows increment. Calendars use this to decide which version
   *  wins on collision. */
  sequence?: number;
}

/* RFC 5545 §3.3.11: backslash, comma, semicolon, and newline must be
 * escaped inside TEXT-typed property values. CR alone is rare on user
 * input but spelled out for completeness. */
function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/* RFC 5545 §3.1: lines must not exceed 75 octets. Long lines wrap with
 * a CRLF + single SPACE prefix, which calendar parsers unfold by
 * stripping. We measure UTF-8 octet length, not character count, so a
 * Japanese cafe name doesn't blow past the limit silently. */
function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let buf = '';
  let bufBytes = 0;
  for (const char of line) {
    const charBytes = enc.encode(char).length;
    // Reserve 1 octet for the leading SPACE on continuation lines.
    const limit = out.length === 0 ? 75 : 74;
    if (bufBytes + charBytes > limit) {
      out.push(buf);
      buf = char;
      bufBytes = charBytes;
    } else {
      buf += char;
      bufBytes += charBytes;
    }
  }
  if (buf) out.push(buf);
  return out.join('\r\n ');
}

function utcStamp(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

export function buildBookingIcs(input: BookingIcsInput): string {
  const endMs = input.startMs + input.durationMinutes * 60_000;
  const dtstamp = utcStamp(Date.now());
  const dtstart = utcStamp(input.startMs);
  const dtend = utcStamp(endMs);
  const uid = `booking-${input.bookingId}@acoffee.com`;
  const sequence = input.sequence ?? 0;

  const summary = `Coffee with ${input.hostHandle}`;
  const locationParts = [input.cafeName, input.cafeAddress].filter(Boolean);
  const location = locationParts.join(', ');

  const descriptionParts = [
    `Coffee meetup booked via ACoffee.`,
    ``,
    `Cafe: ${input.cafeName}`,
    `Address: ${input.cafeAddress}`,
  ];
  if (input.visitorMessage) {
    descriptionParts.push('', `Note: ${input.visitorMessage}`);
  }
  descriptionParts.push('', `Manage: https://acoffee.com/bookings`);
  const description = descriptionParts.join('\n');

  /* RFC 5545 line ordering isn't strict but most parsers prefer
   * required props first. Each line is fold-aware so a long cafe
   * address doesn't break the SUMMARY parse. */
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ACoffee//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SEQUENCE:${sequence}`,
    `STATUS:CONFIRMED`,
    foldLine(`SUMMARY:${escapeIcsText(summary)}`),
    foldLine(`LOCATION:${escapeIcsText(location)}`),
    foldLine(`DESCRIPTION:${escapeIcsText(description)}`),
    foldLine(`ORGANIZER;CN=${escapeIcsText(input.hostHandle)}:mailto:${input.hostEmail}`),
    foldLine(
      `ATTENDEE;CN=${escapeIcsText(input.visitorName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.visitorEmail}`,
    ),
  ];
  if (input.googleMapsUri) {
    lines.push(foldLine(`URL:${input.googleMapsUri}`));
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  // RFC 5545 §3.1: lines separated by CRLF.
  return lines.join('\r\n') + '\r\n';
}

/* Resend's attachments field accepts `content: string` as base64. CF
 * Workers don't have Node's Buffer, so we encode UTF-8 → bytes →
 * base64 manually. btoa alone is Latin-1 and would mangle non-ASCII
 * cafe names / addresses. */
export function icsToBase64(ics: string): string {
  const bytes = new TextEncoder().encode(ics);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
