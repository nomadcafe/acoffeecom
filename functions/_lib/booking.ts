/**
 * Booking-flow helpers shared between the POST /api/booking write path
 * and the GET /api/profile/[username]/availability read path. Time
 * arithmetic in UTC; the frontend renders to viewer-local TZ for display.
 *
 * Known v1 limitation: organizer's weekly availability is interpreted in
 * UTC for now, not their local TZ. Same-TZ pairs (the common case for
 * coffee meetups) work fine; a global organizer with overseas visitors
 * will see their slots shifted. Adding a per-user TZ column is the next
 * step once a real cross-TZ booking is attempted.
 */

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const WEEKDAY_BY_INDEX: readonly Weekday[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

export interface DaySlot {
  enabled: boolean;
  /** "HH:MM" 24-hour wall-clock. */
  start: string;
  /** "HH:MM" 24-hour wall-clock. */
  end: string;
}

export type WeeklyAvailability = Partial<Record<Weekday, DaySlot>>;

/** Lenient parse: malformed JSON / missing keys → empty schedule. */
export function parseAvailability(raw: string | null | undefined): WeeklyAvailability {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const out: WeeklyAvailability = {};
  for (const day of WEEKDAY_BY_INDEX) {
    const slot = (parsed as Record<string, unknown>)[day];
    if (
      slot &&
      typeof slot === 'object' &&
      typeof (slot as DaySlot).enabled === 'boolean' &&
      typeof (slot as DaySlot).start === 'string' &&
      typeof (slot as DaySlot).end === 'string'
    ) {
      out[day] = slot as DaySlot;
    }
  }
  return out;
}

function parseHHMM(s: string): { h: number; m: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

/**
 * Is `slotMs` within the organizer's weekly availability? Treats the
 * configured HH:MM as UTC wall-clock for v1 (see file header).
 */
export function isSlotInAvailability(
  slotMs: number,
  duration: number,
  availability: WeeklyAvailability,
): boolean {
  const d = new Date(slotMs);
  const day = WEEKDAY_BY_INDEX[d.getUTCDay()];
  const slot = availability[day];
  if (!slot || !slot.enabled) return false;
  const start = parseHHMM(slot.start);
  const end = parseHHMM(slot.end);
  if (!start || !end) return false;
  const startMs = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    start.h,
    start.m,
    0,
    0,
  );
  const endMs = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    end.h,
    end.m,
    0,
    0,
  );
  return slotMs >= startMs && slotMs + duration * 60_000 <= endMs;
}

/**
 * Enumerate open slot start times for the next `daysAhead` days, in
 * `granularityMin` increments inside each available window. Excludes any
 * slot that already overlaps an existing booking.
 *
 * Returns array of UTC ms timestamps.
 */
export function enumerateOpenSlots(opts: {
  availability: WeeklyAvailability;
  existing: { scheduledAt: number; durationMinutes: number }[];
  durationMin: number;
  granularityMin: number;
  now: Date;
  daysAhead: number;
}): number[] {
  const { availability, existing, durationMin, granularityMin, now, daysAhead } = opts;
  const out: number[] = [];
  const nowMs = now.getTime();

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const dayDate = new Date(now);
    dayDate.setUTCDate(dayDate.getUTCDate() + dayOffset);
    const day = WEEKDAY_BY_INDEX[dayDate.getUTCDay()];
    const slot = availability[day];
    if (!slot || !slot.enabled) continue;
    const start = parseHHMM(slot.start);
    const end = parseHHMM(slot.end);
    if (!start || !end) continue;

    const dayStartMs = Date.UTC(
      dayDate.getUTCFullYear(),
      dayDate.getUTCMonth(),
      dayDate.getUTCDate(),
      start.h,
      start.m,
      0,
      0,
    );
    const dayEndMs = Date.UTC(
      dayDate.getUTCFullYear(),
      dayDate.getUTCMonth(),
      dayDate.getUTCDate(),
      end.h,
      end.m,
      0,
      0,
    );

    for (
      let t = dayStartMs;
      t + durationMin * 60_000 <= dayEndMs;
      t += granularityMin * 60_000
    ) {
      // Skip past slots — at least 60 min lead time.
      if (t <= nowMs + 60 * 60_000) continue;
      // Skip slots colliding with existing bookings.
      const collides = existing.some((b) => {
        const bStart = b.scheduledAt;
        const bEnd = bStart + b.durationMinutes * 60_000;
        const tEnd = t + durationMin * 60_000;
        return t < bEnd && tEnd > bStart;
      });
      if (collides) continue;
      out.push(t);
    }
  }

  return out;
}

/** Two bookings collide if their time ranges overlap, even partially. */
export function hasCollision(
  scheduledAt: number,
  durationMin: number,
  existing: { scheduledAt: number; durationMinutes: number }[],
): boolean {
  const aStart = scheduledAt;
  const aEnd = aStart + durationMin * 60_000;
  return existing.some((b) => {
    const bStart = b.scheduledAt;
    const bEnd = bStart + b.durationMinutes * 60_000;
    return aStart < bEnd && aEnd > bStart;
  });
}

/** Format a ms timestamp as ICS UTC: YYYYMMDDTHHMMSSZ. */
function icsDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export interface IcsParams {
  uid: string;
  startMs: number;
  durationMin: number;
  summary: string;
  description: string;
  location: string;
  organizerEmail: string;
  attendeeEmail: string;
}

export function buildIcs(p: IcsParams): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ACoffee//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${p.uid}`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(p.startMs)}`,
    `DTEND:${icsDate(p.startMs + p.durationMin * 60_000)}`,
    `SUMMARY:${escapeIcs(p.summary)}`,
    `DESCRIPTION:${escapeIcs(p.description)}`,
    `LOCATION:${escapeIcs(p.location)}`,
    `ORGANIZER;CN=ACoffee:mailto:${p.organizerEmail}`,
    `ATTENDEE;CN=Guest;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${p.attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
