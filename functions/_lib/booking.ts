/**
 * Booking-flow helpers shared between the POST /api/booking write path
 * and the GET /api/profile/[username]/availability read path.
 *
 * The organizer's weekly availability is wall-clock in their local
 * timezone (`user.timezone`). "Mon 14:00-17:00" in `Asia/Tokyo` means
 * 2-5pm Tokyo time — that's mapped to UTC ms via
 * `wallClockInZoneToUtcMs()` so visitors anywhere in the world get a
 * consistent absolute time.
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
 * Convert a wall-clock moment "in this timezone" to UTC ms. Uses Intl to
 * find the offset that applies on that wall-clock date (which handles DST
 * automatically: e.g. NYC's "Mar 10 2024 02:30" doesn't exist, and we
 * silently roll forward to 03:30 EDT — acceptable for booking slots
 * since users wouldn't pick a non-existent time anyway).
 */
function wallClockInZoneToUtcMs(
  year: number,
  month1: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): number {
  // Take the wall-clock as if it were UTC, then ask Intl what the
  // formatted time looks like in `timezone` — the difference is the
  // offset we need to subtract to get back to actual UTC.
  const asUtcMs = Date.UTC(year, month1 - 1, day, hour, minute, 0, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(asUtcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const zoned = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  const offsetMs = zoned - asUtcMs;
  return asUtcMs - offsetMs;
}

/** What weekday is `utcMs` from the perspective of `timezone`? */
function weekdayInZone(utcMs: number, timezone: string): Weekday {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const wd = fmt.format(new Date(utcMs)).toLowerCase().slice(0, 3) as Weekday;
  return wd;
}

/** What's the calendar date (year/month/day) of `utcMs` in `timezone`? */
function dateInZone(utcMs: number, timezone: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Is `slotMs` within the organizer's weekly availability for their
 * configured timezone? "Mon 14:00-17:00" in `Asia/Tokyo` matches a slot
 * that lands on Tokyo's Monday between 14:00 and 17:00 Tokyo wall time.
 */
export function isSlotInAvailability(
  slotMs: number,
  duration: number,
  availability: WeeklyAvailability,
  timezone: string,
): boolean {
  const day = weekdayInZone(slotMs, timezone);
  const slot = availability[day];
  if (!slot || !slot.enabled) return false;
  const start = parseHHMM(slot.start);
  const end = parseHHMM(slot.end);
  if (!start || !end) return false;
  const date = dateInZone(slotMs, timezone);
  const startMs = wallClockInZoneToUtcMs(date.year, date.month, date.day, start.h, start.m, timezone);
  const endMs = wallClockInZoneToUtcMs(date.year, date.month, date.day, end.h, end.m, timezone);
  return slotMs >= startMs && slotMs + duration * 60_000 <= endMs;
}

/**
 * Enumerate open slot start times for the next `daysAhead` days, in
 * `granularityMin` increments inside each available window. Excludes any
 * slot that already overlaps an existing booking. Walks days in the
 * organizer's timezone so "next 14 days" stays local-correct across DST
 * boundaries.
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
  timezone: string;
}): number[] {
  const { availability, existing, durationMin, granularityMin, now, daysAhead, timezone } = opts;
  const out: number[] = [];
  const nowMs = now.getTime();

  // Anchor on "today in organizer's TZ" so the day-walk doesn't skip a
  // day when the UTC date and the local date disagree.
  const todayLocal = dateInZone(nowMs, timezone);

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    // Synthesize a UTC midpoint of the local day to find what weekday it is
    // in the organizer's TZ — using midnight UTC could cross a date line.
    const probeMs = wallClockInZoneToUtcMs(
      todayLocal.year,
      todayLocal.month,
      todayLocal.day + dayOffset,
      12,
      0,
      timezone,
    );
    const day = weekdayInZone(probeMs, timezone);
    const slot = availability[day];
    if (!slot || !slot.enabled) continue;
    const start = parseHHMM(slot.start);
    const end = parseHHMM(slot.end);
    if (!start || !end) continue;
    const localDate = dateInZone(probeMs, timezone);

    const dayStartMs = wallClockInZoneToUtcMs(
      localDate.year,
      localDate.month,
      localDate.day,
      start.h,
      start.m,
      timezone,
    );
    const dayEndMs = wallClockInZoneToUtcMs(
      localDate.year,
      localDate.month,
      localDate.day,
      end.h,
      end.m,
      timezone,
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
