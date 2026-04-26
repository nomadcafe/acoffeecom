ALTER TABLE `user` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `user` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `user` ADD `social_links` text DEFAULT '[]' NOT NULL;