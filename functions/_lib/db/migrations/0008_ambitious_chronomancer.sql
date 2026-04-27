CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`organizer_user_id` text NOT NULL,
	`visitor_email` text NOT NULL,
	`visitor_name` text NOT NULL,
	`visitor_address` text NOT NULL,
	`visitor_lat` real NOT NULL,
	`visitor_lng` real NOT NULL,
	`scheduled_at` integer NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`place_id` text NOT NULL,
	`place_name` text NOT NULL,
	`place_address` text NOT NULL,
	`place_lat` real NOT NULL,
	`place_lng` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organizer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookings_org_slot_idx` ON `bookings` (`organizer_user_id`,`scheduled_at`);