import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { GoogleMapsError, geocodeAddress, lookupTimezone } from '../../_lib/googleMaps';

/**
 * Hard-delete the signed-in user's account. FK constraints in schema.ts
 * cascade-clean session, account, visited_shops, starred_shops — verifying:
 *
 *   user.id ← session.user_id              (onDelete: cascade)
 *   user.id ← account.user_id              (onDelete: cascade)
 *   user.id ← visited_shops.user_id        (onDelete: cascade)
 *   user.id ← starred_shops.user_id        (onDelete: cascade)
 *
 * Caller must sign out client-side; the session row is gone but Better Auth's
 * cookie is still in the browser until cleared.
 */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  await db.delete(user).where(eq(user.id, sessionUser.id));

  return new Response(null, { status: 204 });
};

/* http(s) only on social link URLs — the public profile page renders these
 * as user-clickable anchors, so blocking javascript: / data: / relative
 * URLs at the write boundary saves us a sanitisation pass on render. */
const SocialLinkSchema = z.object({
  label: z.string().trim().min(1).max(30),
  url: z
    .string()
    .trim()
    .url()
    .max(200)
    .refine((u) => /^https?:\/\//i.test(u), 'URL must start with http(s)'),
});

/* "HH:MM" 24-hour clock — narrow enough to validate at the schema level so
 * downstream code can assume well-formed times. */
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const DaySlotSchema = z
  .object({
    enabled: z.boolean(),
    start: z.string().regex(TIME_OF_DAY),
    end: z.string().regex(TIME_OF_DAY),
  })
  .refine((s) => !s.enabled || s.start < s.end, {
    message: 'end time must be after start',
  });
/* Availability is a sparse map of weekday → slot. Missing keys mean the day
 * is off; we don't enforce all 7 keys to be present so /account can PATCH
 * just the day that changed if we ever go granular. */
const AvailabilitySchema = z
  .object({
    mon: DaySlotSchema.optional(),
    tue: DaySlotSchema.optional(),
    wed: DaySlotSchema.optional(),
    thu: DaySlotSchema.optional(),
    fri: DaySlotSchema.optional(),
    sat: DaySlotSchema.optional(),
    sun: DaySlotSchema.optional(),
  })
  .strict();

const PatchSchema = z.object({
  profilePublic: z.boolean().optional(),
  monthlyRecapEmail: z.boolean().optional(),
  displayName: z.string().trim().max(50).nullable().optional(),
  bio: z.string().trim().max(160).nullable().optional(),
  socialLinks: z.array(SocialLinkSchema).max(5).optional(),
  homeBaseAddress: z.string().trim().max(200).nullable().optional(),
  availabilitySlots: AvailabilitySchema.optional(),
  /* IANA tz captured from the organizer's browser when they save
   * availability. Length cap is generous; longest realistic IANA name is
   * about 30 chars (`America/Argentina/Buenos_Aires`). */
  timezone: z.string().trim().min(1).max(64).optional(),
});

/** Patch toggles + bio fields for the user account. profilePublic /
 *  monthlyRecapEmail are booleans; displayName / bio are short strings
 *  (null clears them); socialLinks is a small array of {label, url}.
 *  Profile publish requires a username to exist already — there'd be no
 *  URL to host the page at otherwise. */
export const onRequestPatch: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  let input: z.infer<typeof PatchSchema>;
  try {
    input = PatchSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);
  if (input.profilePublic === true) {
    const [row] = await db
      .select({ username: user.username })
      .from(user)
      .where(eq(user.id, sessionUser.id));
    if (!row?.username) return jsonError('Set a username before publishing', 400);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.profilePublic !== undefined) patch.profilePublic = input.profilePublic;
  if (input.monthlyRecapEmail !== undefined) patch.monthlyRecapEmail = input.monthlyRecapEmail;
  if (input.displayName !== undefined) {
    patch.displayName = input.displayName ? input.displayName : null;
  }
  if (input.bio !== undefined) {
    patch.bio = input.bio ? input.bio : null;
  }
  if (input.socialLinks !== undefined) {
    patch.socialLinks = JSON.stringify(input.socialLinks);
  }
  if (input.homeBaseAddress !== undefined) {
    const next = input.homeBaseAddress ? input.homeBaseAddress : null;
    patch.homeBaseAddress = next;
    // Address is the source of truth for timezone — geocode it then ask
    // Google what TZ governs that point, so "Mon 14:00-17:00" always
    // means 2-5pm at the place the meetup happens. Browser-sent TZ is
    // ignored when we have an address (it stays as a fallback for users
    // who haven't set one yet).
    if (next) {
      try {
        const loc = await geocodeAddress(env, next);
        patch.timezone = await lookupTimezone(env, loc);
      } catch (e) {
        if (e instanceof GoogleMapsError) {
          return jsonError(`Couldn't validate that address — ${e.message}`, e.status);
        }
        throw e;
      }
    }
  }
  if (input.availabilitySlots !== undefined) {
    patch.availabilitySlots = JSON.stringify(input.availabilitySlots);
  }
  // Browser-sent timezone only sticks when there's no home base address
  // (or it didn't change) — home_base lookup wins above.
  if (input.timezone !== undefined && patch.timezone === undefined) {
    patch.timezone = input.timezone;
  }

  if (Object.keys(patch).length > 1) {
    await db
      .update(user)
      .set(patch)
      .where(eq(user.id, sessionUser.id));
  }

  return Response.json({ ok: true });
};
