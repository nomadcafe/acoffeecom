CREATE TABLE `starred_shops` (
	`user_id` text NOT NULL,
	`place_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`google_maps_uri` text,
	`note` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `place_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `starred_shops_user_idx` ON `starred_shops` (`user_id`);