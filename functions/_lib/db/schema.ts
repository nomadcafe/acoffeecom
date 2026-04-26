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
