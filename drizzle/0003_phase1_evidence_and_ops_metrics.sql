ALTER TABLE `event_officials` ADD `eventOfficialVerification` enum('unverified','machine_matched','source_verified','independently_corroborated','rejected') DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `event_officials` ADD `evidence` text NOT NULL;--> statement-breakpoint
ALTER TABLE `event_officials` ADD `sourceId` int;--> statement-breakpoint
ALTER TABLE `event_officials` ADD `documentId` int;--> statement-breakpoint
ALTER TABLE `event_officials` ADD `isSynthetic` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD `eventOrganizationVerification` enum('unverified','machine_matched','source_verified','independently_corroborated','rejected') DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD `evidence` text NOT NULL;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD `sourceId` int;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD `documentId` int;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD `isSynthetic` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `source_jobs` ADD `duplicateCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `source_jobs` ADD `retryCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `source_jobs` ADD `quotaLimited` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_officials` ADD CONSTRAINT `event_officials_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_officials` ADD CONSTRAINT `event_officials_documentId_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD CONSTRAINT `event_organizations_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD CONSTRAINT `event_organizations_documentId_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `market_observations` ADD CONSTRAINT `market_observations_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_searches` ADD CONSTRAINT `saved_searches_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `watchlist_organizations` ADD CONSTRAINT `watchlist_organizations_watchlistId_watchlists_id_fk` FOREIGN KEY (`watchlistId`) REFERENCES `watchlists`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `watchlists` ADD CONSTRAINT `watchlists_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;