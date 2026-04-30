ALTER TABLE `user` ADD `owner_cafe_relation` text;--> statement-breakpoint
-- Backfill: any user who already picked a featured cafe under the v1
-- ownership-agnostic schema gets 'favorite' as a safe default. 'owned'
-- requires explicit user intent; backfilling everyone to 'owned' would
-- mis-claim ownership.
UPDATE `user` SET `owner_cafe_relation` = 'favorite' WHERE `owner_cafe_place_id` IS NOT NULL;
