CREATE TABLE `booking_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`attempted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booking_attempts_ip_idx` ON `booking_attempts` (`ip`,`attempted_at`);