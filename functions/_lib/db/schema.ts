import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';

// Better Auth tables. Field shapes follow Better Auth's expected schema as of v1.6.x.
// We add `username` to `user` for the /yourname Phase 2 surface.
// If `npx @better-auth/cli generate` later disagrees, reconcile manually before applying.

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  name: text('name'),
  image: text('image'),
  username: text('username').unique(),
  /* Opt-in: profile pages stay private until the owner publishes. Pairs with
   * username — a profile needs both a slug to live at and an explicit toggle. */
  profilePublic: integer('profile_public', { mode: 'boolean' }).notNull().default(false),
  /* Defaults true so signed-up users get the monthly recap immediately —
   * one email a month is the kind of low-frequency contact people actually
   * tolerate, and they can flip it off from /account anytime. */
  monthlyRecapEmail: integer('monthly_recap_email', { mode: 'boolean' }).notNull().default(true),
  /* Bio-link surface for the public profile (acoffee.com/<username>).
   * `display_name` is the human-friendly name shown above @username;
   * `bio` is one short line under it; `social_links` is a JSON array of
   * `{label, url}` (max 5) rendered as a chip row. All optional — empty
   * profiles still work, the page just falls back to stats only. */
  displayName: text('display_name'),
  bio: text('bio'),
  socialLinks: text('social_links').notNull().default('[]'),
  /* Privacy toggle for the social_links row on the public profile. Default
   * true so existing users who already filled the field keep them visible
   * after the migration — opt-in privacy would silently hide their links. */
  showSocialLinks: integer('show_social_links', { mode: 'boolean' }).notNull().default(true),
  /* Public-profile theme preset. Maps to a [data-theme="<value>"] CSS rule
   * that overrides --ac-accent / --ac-accent-dark / --ac-surface-tinted on
   * /yourname only. Curated set keeps contrast guarantees vs the rest of
   * the design system; see src/index.css for the palette definitions. */
  themePreset: text('theme_preset').notNull().default('default'),
  /* Booking config — anchor address used as one endpoint of the midpoint
   * search when a visitor books a coffee, plus a JSON map of weekday →
   * { enabled, start, end } describing weekly recurring availability.
   * Both empty by default; the booking widget on /yourname renders only
   * once both are filled in. Stored as text to keep the migration small;
   * geocoding happens server-side at booking time to avoid persisting
   * stale lat/lng if the user moves. */
  homeBaseAddress: text('home_base_address'),
  availabilitySlots: text('availability_slots').notNull().default('{}'),
  /* IANA tz like 'Asia/Tokyo' / 'America/New_York'. Captured from the
   * browser when the organizer saves availability. The booking flow
   * interprets availability HH:MM as wall-clock in *this* timezone — so
   * "Mon 14:00-17:00" means 2-5pm in the organizer's hometown, no matter
   * where the visitor is browsing from. */
  timezone: text('timezone').notNull().default('UTC'),
  /* iCal URL subscription. Google Calendar, Apple iCloud, and Outlook all
   * expose a "secret iCal URL" per calendar; pasted here, the availability
   * endpoint fetches + parses the feed to subtract any VEVENT that overlaps
   * an offered slot. Read-only — we don't write events back. The URL is
   * effectively a secret, so we never expose it via /api/profile, only via
   * /api/account when the owner reads their own settings. */
  busyCalendarIcsUrl: text('busy_calendar_ics_url'),
  /** ms-since-epoch of the last successful fetch+parse — diagnostics so the
   *  AccountPage card can show "last synced X ago" or surface a stale feed. */
  busyCalendarSyncedAt: integer('busy_calendar_synced_at', { mode: 'timestamp_ms' }),
  /** Last error message from the per-availability iCal fetch. Set when
   *  the URL stops resolving / parsing; cleared when a fetch succeeds.
   *  Surfaced on AccountPage so the user can re-paste the URL before
   *  their actual calendar conflicts go unnoticed. */
  busyCalendarLastError: text('busy_calendar_last_error'),
  /** ms-since-epoch when busyCalendarLastError was recorded. Used to
   *  display "couldn't read your calendar X ago" relatively. */
  busyCalendarLastErrorAt: integer('busy_calendar_last_error_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

// Domain table — mirrors VisitedShopSnapshot in src/types/index.ts.
// `visits` is JSON (array of ms timestamps, newest-first) instead of a separate table.
// Refactor to a real table only when date-range queries make JSON1 awkward — likely never at v1 scale.

export const visitedShops = sqliteTable(
  'visited_shops',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    placeId: text('place_id').notNull(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    googleMapsUri: text('google_maps_uri'),
    city: text('city'),
    visits: text('visits').notNull(),
    /* JSON map of `{ [visitTs]: noteText }`. One short note per visit; not
       every visit needs one. Stored separately from the visits[] array so a
       legacy reader without the column still gets a usable timestamp list. */
    visitNotes: text('visit_notes').notNull().default('{}'),
    /* JSON map of `{ [visitTs]: 1..5 }`. Per-visit star rating. Same sparse
       shape as visit_notes — not every visit has a rating, and a rating
       can exist without a note. Kept in its own column so legacy readers
       and old client builds keep working without surprises. */
    visitRatings: text('visit_ratings').notNull().default('{}'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    /* Tombstone for offline delete. We keep the row so a stale upsert from
       another device with an older updatedAt loses LWW and doesn't resurrect. */
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.placeId] }),
    userIdx: index('visited_shops_user_idx').on(t.userId),
  }),
);

// Booking attempt log — one row per POST /api/booking that passed input
// validation. Used to rate-limit per-IP and for abuse-pattern auditing.
// Failed attempts are logged so a determined bot can't burn through quota
// by sending invalid bodies for free. Index on (ip, attempted_at) lets the
// rate-limit count query be a single short range scan.
export const bookingAttempts = sqliteTable(
  'booking_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ip: text('ip').notNull(),
    attemptedAt: integer('attempted_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    ipIdx: index('booking_attempts_ip_idx').on(t.ip, t.attemptedAt),
  }),
);

// Coffee bookings made through `acoffee.com/<username>`. The visitor isn't
// necessarily an ACoffee user — only the organizer needs an account. We
// store the visitor's address + lat/lng for the record (both for showing
// the organizer who's coming and for the auto-pick audit trail), but never
// surface the address publicly.
export const bookings = sqliteTable(
  'bookings',
  {
    id: text('id').primaryKey(),
    organizerUserId: text('organizer_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    visitorEmail: text('visitor_email').notNull(),
    visitorName: text('visitor_name').notNull(),
    /** Optional in the request → approve flow — visitor only provides
     *  their address if they want the host's approval modal to show
     *  an AI midpoint suggestion. Host can also pick freely without it. */
    visitorAddress: text('visitor_address'),
    visitorLat: real('visitor_lat'),
    visitorLng: real('visitor_lng'),
    /** Scheduled start as ms-since-epoch (UTC). Frontend renders in viewer-local TZ. */
    scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    /** Café fields are nullable while a booking is in `requested` state —
     *  the host hasn't picked a venue yet. Filled when the host
     *  approves; required for any non-`requested`/`rejected` booking. */
    placeId: text('place_id'),
    placeName: text('place_name'),
    placeAddress: text('place_address'),
    placeLat: real('place_lat'),
    placeLng: real('place_lng'),
    /** Booking lifecycle:
     *   - 'requested'   — visitor submitted, waiting for host's approval
     *   - 'unconfirmed' — legacy auto-confirm flow (visitor email-link
     *                     pending). Pre-existing rows; not produced
     *                     by the new flow.
     *   - 'pending'     — host approved (or visitor email-confirmed in
     *                     legacy flow); on the calendar.
     *   - 'rejected'    — host declined the request.
     *   - 'cancelled'   — either side called it off after approval. */
    status: text('status').notNull().default('requested'),
    /** When the host clicked Approve. Null until that happens. Used by
     *  email templates + the visitor-side "approved at X" timestamp. */
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    /** Optional free-text message the visitor wrote in the booking form
     *  (e.g. "I'll bring a laptop, mind if we sit by the window?"). Goes
     *  to the organizer email and shows up on /bookings rows so the host
     *  has context before showing up. Capped client + server side. */
    visitorMessage: text('visitor_message'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    organizerSlotIdx: index('bookings_org_slot_idx').on(t.organizerUserId, t.scheduledAt),
  }),
);

// Lightweight coffee meetup proposals — `acoffee.com/p/<id>` short links
// the sender shares so the receiver can OK / pick a later time / cycle to
// a different cafe with one tap. Distinct from `bookings`: no host
// account required, no .ics, no email verification — just a stateful URL
// that lives ~24-72h. Whoever opens the link with the right id can
// interact (the id IS the secret — UUID v4 = 122 bits of entropy).
export const proposals = sqliteTable(
  'proposals',
  {
    id: text('id').primaryKey(),
    /** Optional — when the proposal was created by a logged-in user we
     *  link it back so they can later see "all proposals I've sent."
     *  Anonymous proposals just stay null. */
    senderUserId: text('sender_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    cafePlaceId: text('cafe_place_id').notNull(),
    cafeName: text('cafe_name').notNull(),
    cafeAddress: text('cafe_address').notNull(),
    cafeLat: real('cafe_lat').notNull(),
    cafeLng: real('cafe_lng').notNull(),
    /** ms-since-epoch; receiver can shift it ±30 min via /shift-time. */
    scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }).notNull(),
    /** JSON array of the addresses that produced this midpoint. Stored
     *  only for display on the proposal page; not used for re-ranking. */
    addressesJson: text('addresses_json').notNull().default('[]'),
    /** Agent mode at creation time — visible on the proposal page so
     *  the receiver knows "this is the Fair pick" vs "this is the
     *  Quiet pick" etc. */
    mode: text('mode').notNull().default('fair'),
    /** Up to 4 alternative cafes the original search surfaced — the
     *  "Next cafe" button cycles through them so the receiver never
     *  hits a hard dead-end. JSON array of {placeId,name,address,lat,lng}. */
    altCafesJson: text('alt_cafes_json').notNull().default('[]'),
    /** Current index into [main, ...alts]. Starts at 0 (main); each
     *  Next-cafe tap advances; wraps. */
    cafeIndex: integer('cafe_index').notNull().default(0),
    /** 'pending' | 'accepted' | 'cancelled' — receiver can accept once,
     *  sender can cancel (future). Past `expires_at` rows GC'd nightly. */
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    expiresIdx: index('proposals_expires_idx').on(t.expiresAt),
  }),
);

// Featured cafés on the public profile — replaces the v1 single-cafe
// `user.owner_cafe_*` columns. Up to 5 per user, each with its own
// relation (owned/favorite), a short "why" note, up to 4 typed external
// links, and (for owned entries) a "what's brewing" pinned note that the
// owner is expected to refresh. Owned rows get an auto-verified flag set
// when the user's account email host matches the Place's website host —
// the ✓ badge and the reverse-link chip wording both gate on this.
//
// Schema notes:
//  - PK (user_id, place_id) prevents the same shop from being featured
//    twice by one user. Re-saving the same place updates in-place.
//  - `position` is plain 0..4 ordering — we don't bother with fractional
//    indexes since v1 has no drag reorder; remove + re-add covers it.
//  - `relation` is plain text + an API-layer enum check; SQLite enums
//    aren't worth a custom CHECK constraint when the API is the only
//    writer.
//  - Hours / open_now / visits-count are NOT stored here — derived at
//    render time from Places cache + visited_shops, so they stay fresh
//    without a write path.
export const featuredCafes = sqliteTable(
  'featured_cafes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    placeId: text('place_id').notNull(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    /** 'owned' (user runs the cafe) | 'favorite' (user just likes it).
     *  Drives the public-profile card variant + reverse-link wording. */
    relation: text('relation').notNull(),
    /** 0..4 — ascending render order. v1 has no drag reorder; remove +
     *  re-add suffices for 5-card lists. */
    position: integer('position').notNull(),
    /** Static "why this café" line, ~140 chars, optional. Both relations. */
    note: text('note'),
    /** Optional external links — typed slots so the UI picks the right
     *  icon and the favorite-card variant can prioritise (e.g. Instagram
     *  over Menu). */
    linkInstagram: text('link_instagram'),
    linkWebsite: text('link_website'),
    linkMenu: text('link_menu'),
    linkBookingExternal: text('link_booking_external'),
    /** Owned-only "本周特别 / what's brewing" pinned note, ~80 chars.
     *  Owner is expected to refresh — we don't expire automatically in
     *  v1, but a stale-after-N-days hint surfaces on AccountPage. */
    ownerPinnedNote: text('owner_pinned_note'),
    /** Auto-set true at upsert when the user's account email host matches
     *  the Place's website host. False otherwise. The badge + the
     *  search-result reverse-link chip wording both gate on this. */
    ownerVerified: integer('owner_verified', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** ms-since-epoch of the last successful verification. Used both as
     *  a "is this still claimed?" signal and to support a future re-check
     *  cron without re-touching every row blindly. */
    ownerVerifiedAt: integer('owner_verified_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.placeId] }),
    /** Render-order lookup: list a user's cards sorted by position. */
    userIdx: index('featured_cafes_user_idx').on(t.userId, t.position),
    /** Reverse-link lookup: given a place_id, who features it? */
    placeIdx: index('featured_cafes_place_idx').on(t.placeId),
  }),
);

// Starred shops — user's saved favorites. Mirrors StarredShopSnapshot in src/types/index.ts.
// `note` is freeform user-editable text, optional.
export const starredShops = sqliteTable(
  'starred_shops',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    placeId: text('place_id').notNull(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    googleMapsUri: text('google_maps_uri'),
    note: text('note'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    /* Tombstone — see visited_shops.deleted comment. */
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.placeId] }),
    userIdx: index('starred_shops_user_idx').on(t.userId),
  }),
);
