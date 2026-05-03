PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`organizer_user_id` text NOT NULL,
	`visitor_email` text NOT NULL,
	`visitor_name` text NOT NULL,
	`visitor_address` text,
	`visitor_lat` real,
	`visitor_lng` real,
	`scheduled_at` integer NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`place_id` text,
	`place_name` text,
	`place_address` text,
	`place_lat` real,
	`place_lng` real,
	`status` text DEFAULT 'requested' NOT NULL,
	`approved_at` integer,
	`visitor_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organizer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- approved_at is new in this migration so the source table doesn't have
-- it; project NULL for existing rows. drizzle-kit's auto-generated
-- INSERT … SELECT didn't account for the new column being absent in the
-- old schema (it listed it on both sides), which would error.
INSERT INTO `__new_bookings`("id", "organizer_user_id", "visitor_email", "visitor_name", "visitor_address", "visitor_lat", "visitor_lng", "scheduled_at", "duration_minutes", "place_id", "place_name", "place_address", "place_lat", "place_lng", "status", "approved_at", "visitor_message", "created_at") SELECT "id", "organizer_user_id", "visitor_email", "visitor_name", "visitor_address", "visitor_lat", "visitor_lng", "scheduled_at", "duration_minutes", "place_id", "place_name", "place_address", "place_lat", "place_lng", "status", NULL, "visitor_message", "created_at" FROM `bookings`;--> statement-breakpoint
DROP TABLE `bookings`;--> statement-breakpoint
ALTER TABLE `__new_bookings` RENAME TO `bookings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `bookings_org_slot_idx` ON `bookings` (`organizer_user_id`,`scheduled_at`);