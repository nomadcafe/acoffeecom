/**
 * Tiny iCal parser specialised for "extract busy windows in a date range."
 * We don't need full RFC 5545 — only the subset that matters when an
 * organizer subscribes their personal calendar so booking slots avoid
 * conflicts:
 *
 *   - VEVENT with DTSTART + DTEND (or DTSTART + DURATION)
 *   - All-day events (VALUE=DATE) treated as 24-hour busy windows
 *   - FREQ=WEEKLY recurrence with optional INTERVAL, BYDAY, COUNT, UNTIL
 *   - FREQ=DAILY with COUNT/UNTIL (much rarer)
 *   - EXDATE for cancelled instances
 *
 * Skipped (intentional v1 trade-off):
 *   - MONTHLY / YEARLY recurrence (very rare for "I'm busy" blocks)
 *   - BYMONTH, BYMONTHDAY, BYSETPOS
 *   - VTIMEZONE — we treat naive datetimes as UTC, which is fine for
 *     Google's exports (always uses TZID or UTC) and matches how most
 *     calendars publish their public ICS.
 *
 * Bundle size matters on Workers, so we don't pull in `ical.js` /
 * `node-ical`. ~120 lines of focused parsing covers the 95% case.
 */

interface RawEvent {
  uid: string;
  startMs: number;
  endMs: number;
  /** All-day events are stored as midnight UTC → next-midnight UTC. */
  isAllDay: boolean;
  rrule: ParsedRrule | null;
  /** EXDATEs as ms timestamps — match an instance startMs to skip it. */
  exdates: number[];
}

interface ParsedRrule {
  freq: 'WEEKLY' | 'DAILY';
  interval: number;
  /** Mon=1 .. Sun=7, ISO. Empty = derived from DTSTART weekday. */
  byday: number[];
  count: number | null;
  /** ms-since-epoch upper bound (inclusive). null = no end. */
  until: number | null;
}

export interface BusyWindow {
  startMs: number;
  endMs: number;
}

const MS_DAY = 86_400_000;

/** "20251127T140000Z" or "20251127T140000" or "20251127" → ms. */
function parseIcsDate(value: string, allDay: boolean): number {
  if (allDay || /^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6)) - 1;
    const d = Number(value.slice(6, 8));
    return Date.UTC(y, m, d);
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return NaN;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
}

/** RFC 5545 says lines can be folded with CRLF + space/tab. Unfold first. */
function unfold(text: string): string[] {
  // Normalise line endings; some servers ship LF only.
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** "DTSTART;TZID=America/New_York:20251127T140000" → param map + value. */
function parseLine(line: string): { key: string; params: Record<string, string>; value: string } {
  const colon = line.indexOf(':');
  if (colon < 0) return { key: line, params: {}, value: '' };
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [key, ...paramParts] = head.split(';');
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { key: key.toUpperCase(), params, value };
}

const ISO_WEEKDAY: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

function parseRrule(value: string): ParsedRrule | null {
  const parts: Record<string, string> = {};
  for (const seg of value.split(';')) {
    const eq = seg.indexOf('=');
    if (eq > 0) parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
  }
  const freq = parts.FREQ;
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return null;
  return {
    freq,
    interval: parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10)) : 1,
    byday: parts.BYDAY
      ? parts.BYDAY.split(',')
          .map((d) => ISO_WEEKDAY[d.toUpperCase().slice(-2)])
          .filter((n): n is number => Number.isFinite(n))
      : [],
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
    until: parts.UNTIL ? parseIcsDate(parts.UNTIL, parts.UNTIL.length === 8) : null,
  };
}

/** Walk parsed lines, gather VEVENTs. */
function parseEvents(text: string): RawEvent[] {
  const lines = unfold(text);
  const events: RawEvent[] = [];
  let current: Partial<RawEvent> | null = null;
  let dtStartAllDay = false;

  for (const raw of lines) {
    if (!raw) continue;
    const { key, params, value } = parseLine(raw);
    if (key === 'BEGIN' && value === 'VEVENT') {
      current = { uid: '', exdates: [], rrule: null, isAllDay: false };
      dtStartAllDay = false;
    } else if (key === 'END' && value === 'VEVENT' && current) {
      if (
        typeof current.startMs === 'number' &&
        typeof current.endMs === 'number' &&
        current.endMs > current.startMs
      ) {
        events.push({
          uid: current.uid || `${current.startMs}`,
          startMs: current.startMs,
          endMs: current.endMs,
          isAllDay: !!current.isAllDay,
          rrule: current.rrule ?? null,
          exdates: current.exdates ?? [],
        });
      }
      current = null;
    } else if (current) {
      switch (key) {
        case 'UID':
          current.uid = value;
          break;
        case 'DTSTART':
          dtStartAllDay = params.VALUE === 'DATE';
          current.isAllDay = dtStartAllDay;
          current.startMs = parseIcsDate(value, dtStartAllDay);
          break;
        case 'DTEND': {
          const allDay = params.VALUE === 'DATE';
          let end = parseIcsDate(value, allDay);
          // RFC 5545: DTEND for all-day events is exclusive (next day).
          // Subtract 1ms so we don't accidentally mark the next day as busy.
          if (allDay) end -= 1;
          current.endMs = end;
          break;
        }
        case 'DURATION': {
          if (typeof current.startMs === 'number') {
            const dur = parseDurationToMs(value);
            if (Number.isFinite(dur)) current.endMs = current.startMs + dur;
          }
          break;
        }
        case 'RRULE':
          current.rrule = parseRrule(value);
          break;
        case 'EXDATE':
          for (const v of value.split(',')) {
            const ms = parseIcsDate(v, params.VALUE === 'DATE');
            if (Number.isFinite(ms)) current.exdates!.push(ms);
          }
          break;
      }
    }
  }
  return events;
}

/** "PT1H30M" / "P1D" → ms. Subset enough for VEVENT DURATION. */
function parseDurationToMs(s: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s);
  if (!m) return NaN;
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const mins = Number(m[3] ?? 0);
  const secs = Number(m[4] ?? 0);
  return ((days * 24 + hours) * 60 + mins) * 60_000 + secs * 1000;
}

/** ISO weekday 1..7 (Mon..Sun) for a UTC ms. */
function isoWeekdayUtc(ms: number): number {
  const d = new Date(ms).getUTCDay(); // 0..6, Sun..Sat
  return d === 0 ? 7 : d;
}

/**
 * Expand events into BusyWindows that overlap [windowStartMs, windowEndMs].
 * For a one-off VEVENT we just include it if it overlaps. For a WEEKLY
 * RRULE we step day-by-day from DTSTART until UNTIL/COUNT/window-end and
 * emit each day that lands on a BYDAY (or DTSTART's own weekday if BYDAY
 * is empty). DAILY does the same with no day filter.
 *
 * Cap on emitted instances per event prevents a malicious or
 * misconfigured feed (e.g. UNTIL=20991231) from blowing up memory.
 */
const MAX_INSTANCES_PER_EVENT = 200;

export function expandBusyWindows(
  events: RawEvent[],
  windowStartMs: number,
  windowEndMs: number,
): BusyWindow[] {
  const out: BusyWindow[] = [];
  for (const ev of events) {
    const duration = ev.endMs - ev.startMs;
    if (!ev.rrule) {
      if (ev.endMs > windowStartMs && ev.startMs < windowEndMs) {
        out.push({ startMs: ev.startMs, endMs: ev.endMs });
      }
      continue;
    }
    const rule = ev.rrule;
    const byday = rule.byday.length > 0 ? new Set(rule.byday) : new Set([isoWeekdayUtc(ev.startMs)]);
    const upper = rule.until !== null ? Math.min(rule.until, windowEndMs) : windowEndMs;
    let count = 0;
    const exSet = new Set(ev.exdates);
    // Day stride: WEEKLY iterates day-by-day and filters by BYDAY; DAILY
    // jumps in interval days. WEEKLY's interval scales weeks (7 days).
    const stepMs = rule.freq === 'DAILY' ? rule.interval * MS_DAY : MS_DAY;
    let cursor = ev.startMs;
    let weeksAdvanced = 0;
    while (cursor < upper && count < MAX_INSTANCES_PER_EVENT) {
      const ok =
        rule.freq === 'DAILY' ? true : byday.has(isoWeekdayUtc(cursor));
      if (ok && !exSet.has(cursor)) {
        if (rule.count !== null && count >= rule.count) break;
        const endMs = cursor + duration;
        if (endMs > windowStartMs && cursor < windowEndMs) {
          out.push({ startMs: cursor, endMs });
        }
        count++;
      }
      cursor += stepMs;
      // For WEEKLY: after 7 days we've covered one week — if INTERVAL>1
      // skip the gap weeks.
      if (rule.freq === 'WEEKLY') {
        const dayOfWeek = isoWeekdayUtc(cursor);
        const dtStartDayOfWeek = isoWeekdayUtc(ev.startMs);
        if (dayOfWeek === dtStartDayOfWeek) {
          weeksAdvanced++;
          if (rule.interval > 1) {
            const skip = (rule.interval - 1) * 7 * MS_DAY;
            cursor += skip;
          }
        }
      }
      // Fallback safety
      if (weeksAdvanced > 520) break; // 10 years
    }
  }
  return out;
}

// Hard limits for the user-supplied iCal fetch. The URL is attacker-
// controlled (anyone can paste anything into their account), so we cap
// the blast radius: only http(s), short timeout, bounded body size.
const ICS_FETCH_TIMEOUT_MS = 5_000;
const ICS_MAX_BYTES = 512 * 1024;

/**
 * Top-level: fetch the iCal URL, parse, and return busy windows that
 * overlap [windowStartMs, windowEndMs]. Throws on fetch / parse failure
 * so the caller can decide whether to fall back to the existing booking
 * conflict check (likely yes — better to show possibly-conflicting slots
 * than to lock the visitor out when the calendar is unreachable).
 */
export async function fetchBusyWindows(
  url: string,
  windowStartMs: number,
  windowEndMs: number,
): Promise<BusyWindow[]> {
  // Some calendar providers serve `webcal://` URLs (Apple iCloud) that
  // are really HTTPS — normalise so fetch() doesn't choke.
  const httpUrl = url.replace(/^webcal:\/\//i, 'https://');

  let parsed: URL;
  try {
    parsed = new URL(httpUrl);
  } catch {
    throw new Error('Invalid calendar URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Calendar URL must use https');
  }

  const r = await fetch(httpUrl, {
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(ICS_FETCH_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`ICS fetch failed: ${r.status}`);

  const declared = Number(r.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > ICS_MAX_BYTES) {
    throw new Error('Calendar feed is too large');
  }

  const text = await readCappedText(r, ICS_MAX_BYTES);
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error('Not a valid iCalendar feed');
  }
  const events = parseEvents(text);
  return expandBusyWindows(events, windowStartMs, windowEndMs);
}

/** Read the response body as text, aborting if it exceeds maxBytes. */
async function readCappedText(r: Response, maxBytes: number): Promise<string> {
  if (!r.body) return '';
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Calendar feed is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}
