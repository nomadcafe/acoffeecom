import { and, eq, gte, inArray } from 'drizzle-orm';
import type { AuthEnv } from '../../../_lib/auth';
import { getDb } from '../../../_lib/db';
import { bookings, user } from '../../../_lib/db/schema';
import { jsonError } from '../../../_lib/passport';
import { enumerateOpenSlots, parseAvailability } from '../../../_lib/booking';
import { fetchBusyWindows } from '../../../_lib/icsBusy';

/**
 * Public read — returns the next two weeks of bookable slots for the
 * profile, with anything already booked filtered out. Caller is the
 * visitor on /yourname's booking widget; no auth required.
 *
 * Granularity: 30-minute increments inside each available window. Default
 * meeting duration is 60 min, lead time is 1h. Both are hard-coded for v1
 * — if the host wants 90-min meetings or "must book a day in advance",
 * those become per-user settings later.
 */

const DAYS_AHEAD = 14;
const SLOT_GRANULARITY_MIN = 30;
const DEFAULT_DURATION_MIN = 60;

export const onRequestGet: PagesFunction<AuthEnv> = async ({ env, params }) => {
  const raw = typeof params.username === 'string' ? params.username : null;
  if (!raw) return jsonError('Not found', 404);
  const username = raw.toLowerCase();

  const db = getDb(env);
  const [organizer] = await db
    .select({
      id: user.id,
      homeBaseAddress: user.homeBaseAddress,
      availabilitySlots: user.availabilitySlots,
      timezone: user.timezone,
      busyCalendarIcsUrl: user.busyCalendarIcsUrl,
      busyCalendarLastError: user.busyCalendarLastError,
      busyCalendarSyncedAt: user.busyCalendarSyncedAt,
    })
    .from(user)
    .where(and(eq(user.username, username), eq(user.profilePublic, true)));

  if (!organizer || !organizer.homeBaseAddress) {
    return jsonError('Not found', 404);
  }

  const availability = parseAvailability(organizer.availabilitySlots);
  const tz = organizer.timezone || 'UTC';
  // No enabled days → return empty slots without hitting the bookings table.
  const anyEnabled = Object.values(availability).some((s) => s?.enabled);
  if (!anyEnabled) {
    return Response.json(
      { durationMinutes: DEFAULT_DURATION_MIN, timezone: tz, slots: [] },
      { headers: { 'cache-control': 'public, max-age=60' } },
    );
  }

  const now = new Date();
  // Pull only future bookings to compare against — past ones can't collide
  // with anything we'd offer.
  const future = await db
    .select({ scheduledAt: bookings.scheduledAt, durationMinutes: bookings.durationMinutes })
    .from(bookings)
    .where(
      and(
        eq(bookings.organizerUserId, organizer.id),
        // Both unconfirmed and pending hold the slot. An unconfirmed
        // booking older than the visitor confirmation window won't
        // exist in practice (visitor either clicks or it sits — at
        // current scale we don't sweep), but if it does the slot still
        // shouldn't be offered while it's an outstanding hold.
        inArray(bookings.status, ['unconfirmed', 'pending']),
        gte(bookings.scheduledAt, now),
      ),
    );
  const existing = future.map((b) => ({
    scheduledAt: b.scheduledAt instanceof Date ? b.scheduledAt.getTime() : Number(b.scheduledAt),
    durationMinutes: b.durationMinutes,
  }));

  // Calendar sync: if the organizer subscribed an iCal URL, fetch + parse
  // any busy events in the same window and treat them as ad-hoc bookings
  // so enumerateOpenSlots' overlap check excludes them.
  //
  // Failure is soft — we still return slots — but we record the error
  // state on the user row so AccountPage can surface "we couldn't read
  // your calendar Y minutes ago" instead of letting the host think
  // their calendar is still being respected. State writes are
  // idempotent: only update DB when transitioning between
  // success/failure or the error message changes, so popular profiles
  // don't get hammered on every visitor view.
  if (organizer.busyCalendarIcsUrl) {
    const windowStartMs = now.getTime();
    const windowEndMs = windowStartMs + DAYS_AHEAD * 86_400_000;
    const previousError = organizer.busyCalendarLastError;
    const previousSyncedMs = organizer.busyCalendarSyncedAt
      ? organizer.busyCalendarSyncedAt instanceof Date
        ? organizer.busyCalendarSyncedAt.getTime()
        : Number(organizer.busyCalendarSyncedAt)
      : 0;
    try {
      const busy = await fetchBusyWindows(
        organizer.busyCalendarIcsUrl,
        windowStartMs,
        windowEndMs,
      );
      for (const w of busy) {
        existing.push({
          scheduledAt: w.startMs,
          durationMinutes: Math.max(1, Math.round((w.endMs - w.startMs) / 60_000)),
        });
      }
      // Clear the error on first success after a failure; refresh the
      // syncedAt timestamp at most once per hour so we don't write to
      // D1 on every visitor view of a popular profile.
      const oneHourAgo = Date.now() - 60 * 60_000;
      const needsClearError = previousError != null;
      const needsSyncedRefresh = previousSyncedMs < oneHourAgo;
      if (needsClearError || needsSyncedRefresh) {
        await db
          .update(user)
          .set({
            busyCalendarLastError: null,
            busyCalendarLastErrorAt: null,
            busyCalendarSyncedAt: now,
          })
          .where(eq(user.id, organizer.id));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[availability] iCal fetch failed', organizer.id, message);
      // Only write if the error message changed, to avoid hammering
      // D1 when a feed has been broken for hours and getting hit by
      // every visitor.
      if (previousError !== message) {
        await db
          .update(user)
          .set({
            busyCalendarLastError: message.slice(0, 500),
            busyCalendarLastErrorAt: now,
          })
          .where(eq(user.id, organizer.id));
      }
    }
  }

  const slots = enumerateOpenSlots({
    availability,
    existing,
    durationMin: DEFAULT_DURATION_MIN,
    granularityMin: SLOT_GRANULARITY_MIN,
    now,
    daysAhead: DAYS_AHEAD,
    timezone: tz,
  });

  return Response.json(
    { durationMinutes: DEFAULT_DURATION_MIN, timezone: tz, slots },
    {
      // Short cache — bookings change as new ones come in. 60s is the
      // sweet spot between visitor staleness and DB load on a popular
      // profile.
      headers: { 'cache-control': 'public, max-age=60' },
    },
  );
};
