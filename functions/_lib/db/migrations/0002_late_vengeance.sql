ALTER TABLE `starred_shops` ADD `deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `visited_shops` ADD `deleted` integer DEFAULT false NOT NULL;