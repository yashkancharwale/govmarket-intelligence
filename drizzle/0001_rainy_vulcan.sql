CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(96) NOT NULL,
	`entityType` varchar(96),
	`entityId` int,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`normalizedUrl` varchar(2048),
	`urlHash` varchar(64),
	`externalId` varchar(255),
	`contentHash` varchar(64) NOT NULL,
	`title` varchar(512),
	`publishedAt` timestamp,
	`retrievedAt` timestamp NOT NULL DEFAULT (now()),
	`isSynthetic` boolean NOT NULL DEFAULT true,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `documents_source_content_uq` UNIQUE(`sourceId`,`contentHash`),
	CONSTRAINT `documents_url_hash_uq` UNIQUE(`urlHash`)
);
--> statement-breakpoint
CREATE TABLE `event_officials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`ministerId` int NOT NULL,
	`role` varchar(96) NOT NULL DEFAULT 'mentioned',
	`confidence` decimal(5,4),
	CONSTRAINT `event_officials_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_official_role_uq` UNIQUE(`eventId`,`ministerId`,`role`)
);
--> statement-breakpoint
CREATE TABLE `event_organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`organizationId` int NOT NULL,
	`role` varchar(96) NOT NULL DEFAULT 'mentioned',
	`confidence` decimal(5,4),
	CONSTRAINT `event_organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_org_role_uq` UNIQUE(`eventId`,`organizationId`,`role`)
);
--> statement-breakpoint
CREATE TABLE `event_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`sourceId` int NOT NULL,
	`documentId` int,
	`provenanceNote` text,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_source_document_uq` UNIQUE(`eventId`,`sourceId`,`documentId`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(128) NOT NULL,
	`eventType` varchar(96) NOT NULL,
	`title` varchar(512) NOT NULL,
	`summary` text,
	`occurredAt` timestamp NOT NULL,
	`location` varchar(255),
	`category` varchar(96),
	`sector` varchar(128),
	`verificationStatus` enum('unverified','reviewed','verified') NOT NULL DEFAULT 'unverified',
	`confidence` decimal(5,4),
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`),
	CONSTRAINT `events_key_uq` UNIQUE(`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `market_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`securityId` int NOT NULL,
	`observedAt` timestamp NOT NULL,
	`open` decimal(20,8),
	`close` decimal(20,8),
	`volume` decimal(24,4),
	`sourceId` int,
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `market_observations_id` PRIMARY KEY(`id`),
	CONSTRAINT `market_security_time_uq` UNIQUE(`securityId`,`observedAt`)
);
--> statement-breakpoint
CREATE TABLE `minister_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ministerId` int NOT NULL,
	`alias` varchar(255) NOT NULL,
	`normalizedAlias` varchar(255) NOT NULL,
	CONSTRAINT `minister_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `minister_alias_norm_uq` UNIQUE(`normalizedAlias`)
);
--> statement-breakpoint
CREATE TABLE `minister_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`displayName` varchar(255) NOT NULL,
	`normalizedName` varchar(255) NOT NULL,
	`position` varchar(255),
	`ministry` varchar(255),
	`portfolio` varchar(255),
	`jurisdiction` varchar(128) DEFAULT 'synthetic',
	`profileSummary` text,
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minister_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `minister_name_uq` UNIQUE(`normalizedName`)
);
--> statement-breakpoint
CREATE TABLE `organization_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`alias` varchar(255) NOT NULL,
	`normalizedAlias` varchar(255) NOT NULL,
	`aliasType` varchar(64) NOT NULL DEFAULT 'name',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organization_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_alias_norm_uq` UNIQUE(`normalizedAlias`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`canonicalName` varchar(255) NOT NULL,
	`normalizedName` varchar(255) NOT NULL,
	`organizationType` varchar(64) NOT NULL DEFAULT 'company',
	`sector` varchar(128),
	`industry` varchar(128),
	`listed` boolean NOT NULL DEFAULT false,
	`nseSymbol` varchar(64),
	`bseCode` varchar(64),
	`isin` varchar(32),
	`description` text,
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_normalized_name_uq` UNIQUE(`normalizedName`)
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromOrganizationId` int NOT NULL,
	`toOrganizationId` int NOT NULL,
	`relationshipType` varchar(96) NOT NULL,
	`strength` decimal(5,4),
	`relationshipVerification` enum('unverified','reviewed','verified') NOT NULL DEFAULT 'unverified',
	`evidence` text NOT NULL,
	`sourceId` int,
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `relationships_id` PRIMARY KEY(`id`),
	CONSTRAINT `relationship_edge_uq` UNIQUE(`fromOrganizationId`,`toOrganizationId`,`relationshipType`)
);
--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`queryJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_searches_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_search_user_name_uq` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `securities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`securityName` varchar(255) NOT NULL,
	`ticker` varchar(64),
	`exchange` varchar(96),
	`currency` varchar(16),
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `securities_id` PRIMARY KEY(`id`),
	CONSTRAINT `security_org_name_uq` UNIQUE(`organizationId`,`securityName`)
);
--> statement-breakpoint
CREATE TABLE `source_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`jobType` varchar(64) NOT NULL,
	`jobStatus` enum('queued','running','succeeded','failed','disabled') NOT NULL DEFAULT 'disabled',
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`rowCount` int NOT NULL DEFAULT 0,
	`errorCount` int NOT NULL DEFAULT 0,
	`errorSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `source_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceKey` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`sourceType` varchar(64) NOT NULL DEFAULT 'fixture',
	`baseUrl` varchar(2048),
	`adapterKey` varchar(128),
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `sources_key_uq` UNIQUE(`sourceKey`)
);
--> statement-breakpoint
CREATE TABLE `watchlist_organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`watchlistId` int NOT NULL,
	`organizationId` int NOT NULL,
	CONSTRAINT `watchlist_organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchlist_org_uq` UNIQUE(`watchlistId`,`organizationId`)
);
--> statement-breakpoint
CREATE TABLE `watchlists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlists_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchlist_user_name_uq` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `documents_source_idx` ON `documents` (`sourceId`);--> statement-breakpoint
CREATE INDEX `event_official_event_idx` ON `event_officials` (`eventId`);--> statement-breakpoint
CREATE INDEX `event_official_minister_idx` ON `event_officials` (`ministerId`);--> statement-breakpoint
CREATE INDEX `event_org_event_idx` ON `event_organizations` (`eventId`);--> statement-breakpoint
CREATE INDEX `event_org_org_idx` ON `event_organizations` (`organizationId`);--> statement-breakpoint
CREATE INDEX `event_source_event_idx` ON `event_sources` (`eventId`);--> statement-breakpoint
CREATE INDEX `event_source_source_idx` ON `event_sources` (`sourceId`);--> statement-breakpoint
CREATE INDEX `events_occurred_idx` ON `events` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`eventType`);--> statement-breakpoint
CREATE INDEX `events_status_idx` ON `events` (`verificationStatus`);--> statement-breakpoint
CREATE INDEX `market_time_idx` ON `market_observations` (`observedAt`);--> statement-breakpoint
CREATE INDEX `minister_alias_minister_idx` ON `minister_aliases` (`ministerId`);--> statement-breakpoint
CREATE INDEX `organization_alias_org_idx` ON `organization_aliases` (`organizationId`);--> statement-breakpoint
CREATE INDEX `organizations_sector_idx` ON `organizations` (`sector`);--> statement-breakpoint
CREATE INDEX `relationship_from_idx` ON `relationships` (`fromOrganizationId`);--> statement-breakpoint
CREATE INDEX `relationship_to_idx` ON `relationships` (`toOrganizationId`);--> statement-breakpoint
CREATE INDEX `security_ticker_idx` ON `securities` (`ticker`);--> statement-breakpoint
CREATE INDEX `source_jobs_source_idx` ON `source_jobs` (`sourceId`);--> statement-breakpoint
CREATE INDEX `source_jobs_status_idx` ON `source_jobs` (`jobStatus`);