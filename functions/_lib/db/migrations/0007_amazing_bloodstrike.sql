ALTER TABLE `user` ADD `home_base_address` text;--> statement-breakpoint
ALTER TABLE `user` ADD `availability_slots` text DEFAULT '{}' NOT NULL;