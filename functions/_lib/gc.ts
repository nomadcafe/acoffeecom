import { and, eq, lt } from 'drizzle-orm';
import type { AuthEnv } from './auth';
import { getDb } from './db';
import { bookingAttempts, bookings, proposals, verification } from './db/schema';

/**
 * Periodic cleanup. Two tables grow without bound otherwise:
 *
 *   1. `bookings` rows stuck in `unconfirmed` — visitors who submitted but
 *      never clicked the confirm link. They hold a slot in availability /
 *      collision queries, so leaving them hanging is worse than just
 *      bloat. The visitor was never told beyond their first email; the
 *      organizer was never notified at all. After 24h the slot is also
 *      well past the 1h booking lead time, so any "I'll click later" use
 *      case is moot. We DELETE these (rather than mark cancelled) since
 *      they have visitor PII that we'd otherwise carry forever for no
 *      audit value — they were never a real booking.
 *
 *   2. `booking_attempts` rows older than the rate-limit window. The
 *      window is 1 hour; anything past 7d is pure bloat. Index helps
 *      keep the count query cheap regardless of table size, but DELETE
 *      keeps storage tidy.
 *
 * Returns counts so the cron endpoint can log + the Actions tab shows
 * the run as productive.
 */

const UNCONFIRMED_TTL_MS = 24 * 60 * 60_000;
const ATTEMPT_LOG_TTL_MS = 7 * 24 * 60 * 60_000;

export async function runBookingGc(env: AuthEnv): Promise<{
  unconfirmedDeleted: number;
  attemptLogDeleted: number;
  expiredProposalsDeleted: number;
  verificationDeleted: number;
}> {
  const db = getDb(env);
  const now = Date.now();

  const unconfirmedBefore = new Date(now - UNCONFIRMED_TTL_MS);
  const unconfirmedRes = await db
    .delete(bookings)
    .where(
      and(eq(bookings.status, 'unconfirmed'), lt(bookings.createdAt, unconfirmedBefore)),
    )
    .returning({ id: bookings.id });

  const attemptsBefore = new Date(now - ATTEMPT_LOG_TTL_MS);
  const attemptsRes = await db
    .delete(bookingAttempts)
    .where(lt(bookingAttempts.attemptedAt, attemptsBefore))
    .returning({ id: bookingAttempts.id });

  // Proposals carry their own per-row expires_at (typically 72h post-
  // creation). Anything past that is dead — sender's link doesn't
  // resolve to a viewable state anyway.
  const proposalsRes = await db
    .delete(proposals)
    .where(lt(proposals.expiresAt, new Date(now)))
    .returning({ id: proposals.id });

  /* Better Auth's `verification` table backs magic-link sign-in: each
   * sendMagicLink writes a row with a 15-min expiry. Better Auth checks
   * `expiresAt` on use, but doesn't garbage-collect spent rows — so a
   * busy mailbox or an attacker pre-rate-limit (now closed, see
   * /api/auth/[[route]] limiter) leaves the table to grow without
   * bound. Anything past expiry is a no-op token; deleting keeps the
   * table small AND closes a defense-in-depth gap (a future bug that
   * fails to check expiresAt would otherwise resurrect them). */
  const verificationRes = await db
    .delete(verification)
    .where(lt(verification.expiresAt, new Date(now)))
    .returning({ id: verification.id });

  return {
    unconfirmedDeleted: unconfirmedRes.length,
    attemptLogDeleted: attemptsRes.length,
    expiredProposalsDeleted: proposalsRes.length,
    verificationDeleted: verificationRes.length,
  };
}
