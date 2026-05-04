import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user, featuredCafes } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { GoogleMapsError, geocodeAddress, lookupTimezone } from '../../_lib/googleMaps';
import { fetchBusyWindows } from '../../_lib/icsBusy';
import { verifyOwnerByEmailDomain } from '../../_lib/ownerVerify';

/**
 * GET — return account-scope data that doesn't fit on the Better Auth
 * session object. Currently just the user's featured-cafes list (lives
 * in its own table, can't piggyback on the session). AccountPage calls
 * this on mount so the form can render with the existing rows.
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  const rows = await db
    .select()
    .from(featuredCafes)
    .where(eq(featuredCafes.userId, sessionUser.id))
    .orderBy(asc(featuredCafes.position));

  return Response.json({
    featuredCafes: rows.map((r) => ({
      placeId: r.placeId,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      relation: r.relation === 'owned' ? 'owned' : 'favorite',
      position: r.position,
      note: r.note ?? null,
      linkInstagram: r.linkInstagram ?? null,
      linkWebsite: r.linkWebsite ?? null,
      linkMenu: r.linkMenu ?? null,
      linkBookingExternal: r.linkBookingExternal ?? null,
      ownerPinnedNote: r.ownerPinnedNote ?? null,
      ownerVerified: r.ownerVerified === true,
    })),
  });
};

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

/* Featured-cafe payload from the AccountPage picker. The client picks via
 * Places autocomplete (or one-tap from the passport list) and sends the
 * resolved Place ID + display fields + relation in one body — saves a
 * server-side Places API hit on every save and keeps the canonical
 * name/address aligned with what the user actually picked. We still bound
 * each field to defend against odd payloads.
 *
 * `websiteUri` is consumed (not stored) — used at upsert time to decide
 * `ownerVerified` for 'owned' rows. Sent only when the picker has it
 * from Places Place Details; if absent or empty, the row stays
 * unverified, which is the safe default. */
const FeaturedCafeSchema = z
  .object({
    placeId: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(300),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    /* 'owned' = the user runs / works at the cafe; 'favorite' = it's just
     * a shop they want to highlight. Drives copy on the public profile
     * and the reverse-link chip on search results. */
    relation: z.enum(['owned', 'favorite']),
    /* "Why this café" — short static blurb. ~140 chars to match what the
     * card layout can render without truncation. Empty / null → field
     * stored as NULL, card just doesn't render the line. */
    note: z.string().trim().max(140).nullable().optional(),
    /* Up to 4 typed external links. Each is optional and validated to be
     * http(s) URL or empty; the public profile picks an icon per slot. */
    linkInstagram: z.string().trim().max(200).nullable().optional(),
    linkWebsite: z.string().trim().max(200).nullable().optional(),
    linkMenu: z.string().trim().max(200).nullable().optional(),
    linkBookingExternal: z.string().trim().max(200).nullable().optional(),
    /* Owned-only "what's brewing this week" pinned note. Server doesn't
     * enforce — if the user puts it on a 'favorite' row it just won't
     * render. ~80 chars to match the smaller pill layout. */
    ownerPinnedNote: z.string().trim().max(80).nullable().optional(),
    /* Cafe website host, used only for owner-domain verification at save
     * time. Never persisted on its own. Populated by the picker when
     * Places returns websiteUri; absent for cafes Google doesn't list a
     * site for. */
    websiteUri: z.string().trim().max(300).nullable().optional(),
  })
  .strict()
  .refine(
    (c) =>
      [c.linkInstagram, c.linkWebsite, c.linkMenu, c.linkBookingExternal].every(
        (l) => l == null || l === '' || /^https?:\/\//i.test(l),
      ),
    'Links must start with http(s)',
  );

const PatchSchema = z.object({
  profilePublic: z.boolean().optional(),
  monthlyRecapEmail: z.boolean().optional(),
  displayName: z.string().trim().max(50).nullable().optional(),
  bio: z.string().trim().max(160).nullable().optional(),
  socialLinks: z.array(SocialLinkSchema).max(5).optional(),
  showSocialLinks: z.boolean().optional(),
  /* Public-profile theme preset. Closed enum so we can guarantee the
   * matching CSS rule exists; unknown values would render as default
   * silently which is worse than rejecting at the API. */
  themePreset: z.enum(['default', 'sage', 'sunset', 'midnight', 'rose', 'mono']).optional(),
  /* Full replacement of the user's featured-cafes list. Up to 5 entries.
   * Empty array clears all. Omitting the key leaves the existing rows
   * untouched. The server wipes + re-inserts on every save (atomic enough
   * at v1 scale; one user, ≤5 rows). */
  featuredCafes: z.array(FeaturedCafeSchema).max(5).optional(),
  homeBaseAddress: z.string().trim().max(200).nullable().optional(),
  availabilitySlots: AvailabilitySchema.optional(),
  /* IANA tz captured from the organizer's browser when they save
   * availability. Length cap is generous; longest realistic IANA name is
   * about 30 chars (`America/Argentina/Buenos_Aires`). */
  timezone: z.string().trim().min(1).max(64).optional(),
  /* iCal subscription URL. Empty / null clears it. We probe-fetch on save
   * so the user gets immediate feedback if they pasted a wrong URL or
   * their calendar's "secret iCal" is mis-shared. */
  busyCalendarIcsUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .refine(
      (v) => v == null || v === '' || /^(https?|webcal):\/\//i.test(v),
      'Calendar URL must start with http(s) or webcal://',
    ),
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
  if (input.showSocialLinks !== undefined) patch.showSocialLinks = input.showSocialLinks;
  if (input.themePreset !== undefined) patch.themePreset = input.themePreset;
  // featuredCafes: handled separately from the user-table patch because
  // it lives in its own table. We skip the user-table touch unless the
  // top-level patch object also has user-row fields to set.
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
  if (input.busyCalendarIcsUrl !== undefined) {
    const next = input.busyCalendarIcsUrl ? input.busyCalendarIcsUrl.trim() : null;
    if (next) {
      // Probe-fetch a small window so the user knows immediately if their
      // pasted URL is unreachable / not actually iCal. Failure → 400 with
      // the parser's error so the form can show a useful message.
      try {
        const now = Date.now();
        await fetchBusyWindows(next, now, now + 7 * 86_400_000);
      } catch (e) {
        return jsonError(
          `Couldn't read that calendar — ${e instanceof Error ? e.message : 'unknown error'}`,
          400,
        );
      }
      patch.busyCalendarIcsUrl = next;
      patch.busyCalendarSyncedAt = new Date();
    } else {
      patch.busyCalendarIcsUrl = null;
      patch.busyCalendarSyncedAt = null;
    }
  }

  if (Object.keys(patch).length > 1) {
    await db
      .update(user)
      .set(patch)
      .where(eq(user.id, sessionUser.id));
  }

  // featured_cafes lives in its own table — wipe + re-insert when the
  // client sends the array. (Omitting the key leaves rows alone.) The
  // ≤5-row cap keeps this O(small) and the user-only WHERE keeps blast
  // radius tight; we don't bother with diff-and-merge logic.
  if (input.featuredCafes !== undefined) {
    await db.delete(featuredCafes).where(eq(featuredCafes.userId, sessionUser.id));
    if (input.featuredCafes.length > 0) {
      const now = new Date();
      const rows = input.featuredCafes.map((c, idx) => {
        const verified =
          c.relation === 'owned' && verifyOwnerByEmailDomain(sessionUser.email, c.websiteUri);
        // Empty-string nullable fields collapse to NULL so the public
        // renderer's "if not null, render" checks stay clean.
        const norm = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
        return {
          userId: sessionUser.id,
          placeId: c.placeId,
          name: c.name,
          address: c.address,
          lat: c.lat,
          lng: c.lng,
          relation: c.relation,
          position: idx,
          note: norm(c.note),
          linkInstagram: norm(c.linkInstagram),
          linkWebsite: norm(c.linkWebsite),
          linkMenu: norm(c.linkMenu),
          linkBookingExternal: norm(c.linkBookingExternal),
          // Owner-only field — stored on favorite rows too so a relation
          // flip later doesn't lose the text, but the renderer only shows
          // it on owned cards.
          ownerPinnedNote: norm(c.ownerPinnedNote),
          ownerVerified: verified,
          ownerVerifiedAt: verified ? now : null,
          createdAt: now,
          updatedAt: now,
        };
      });
      await db.insert(featuredCafes).values(rows);
    }
  }

  return Response.json({ ok: true });
};
