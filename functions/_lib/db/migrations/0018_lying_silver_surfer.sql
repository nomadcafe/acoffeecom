CREATE TABLE `featured_cafes` (
	`user_id` text NOT NULL,
	`place_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`relation` text NOT NULL,
	`position` integer NOT NULL,
	`note` text,
	`link_instagram` text,
	`link_website` text,
	`link_menu` text,
	`link_booking_external` text,
	`owner_pinned_note` text,
	`owner_verified` integer DEFAULT false NOT NULL,
	`owner_verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `place_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `featured_cafes_user_idx` ON `featured_cafes` (`user_id`,`position`);--> statement-breakpoint
CREATE INDEX `featured_cafes_place_idx` ON `featured_cafes` (`place_id`);--> statement-breakpoint
-- Backfill: lift each user's single legacy `owner_cafe_*` cafe into the new
-- table at position 0. `owner_verified` stays false — re-verification needs
-- the Place's websiteUri (not in the user row) and runs lazily on next save.
-- Old user.owner_cafe_* columns are kept for one release as a rollback safety
-- net; Phase 5 cleanup migration drops them.
INSERT INTO `featured_cafes` (
  `user_id`, `place_id`, `name`, `address`, `lat`, `lng`,
  `relation`, `position`, `created_at`, `updated_at`
)
SELECT
  `id`, `owner_cafe_place_id`, `owner_cafe_name`, `owner_cafe_address`,
  `owner_cafe_lat`, `owner_cafe_lng`,
  COALESCE(`owner_cafe_relation`, 'favorite'),
  0,
  `created_at`, `updated_at`
FROM `user`
WHERE `owner_cafe_place_id` IS NOT NULL
  AND `owner_cafe_name` IS NOT NULL
  AND `owner_cafe_address` IS NOT NULL
  AND `owner_cafe_lat` IS NOT NULL
  AND `owner_cafe_lng` IS NOT NULL;