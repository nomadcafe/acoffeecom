ALTER TABLE `user` ADD `show_social_links` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `owner_cafe_place_id` text;--> statement-breakpoint
ALTER TABLE `user` ADD `owner_cafe_name` text;--> statement-breakpoint
ALTER TABLE `user` ADD `owner_cafe_address` text;--> statement-breakpoint
ALTER TABLE `user` ADD `owner_cafe_lat` real;--> statement-breakpoint
ALTER TABLE `user` ADD `owner_cafe_lng` real;