CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_user_id` text,
	`cafe_place_id` text NOT NULL,
	`cafe_name` text NOT NULL,
	`cafe_address` text NOT NULL,
	`cafe_lat` real NOT NULL,
	`cafe_lng` real NOT NULL,
	`scheduled_at` integer NOT NULL,
	`addresses_json` text DEFAULT '[]' NOT NULL,
	`mode` text DEFAULT 'fair' NOT NULL,
	`alt_cafes_json` text DEFAULT '[]' NOT NULL,
	`cafe_index` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `proposals_expires_idx` ON `proposals` (`expires_at`);