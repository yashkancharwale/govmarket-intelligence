ALTER TABLE `documents` DROP INDEX `documents_url_hash_uq`;--> statement-breakpoint
CREATE INDEX `documents_url_hash_idx` ON `documents` (`urlHash`);