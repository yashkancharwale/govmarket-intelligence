CREATE TABLE `entity_resolution_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`rawMention` varchar(512) NOT NULL,
	`normalizedMention` varchar(512) NOT NULL,
	`candidateOrganizationId` int,
	`candidateMinisterId` int,
	`matchMethod` varchar(64) NOT NULL,
	`confidence` decimal(5,4),
	`candidateReviewStatus` enum('unverified','accepted','rejected') NOT NULL DEFAULT 'unverified',
	`documentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entity_resolution_candidates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `government_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actionType` varchar(96) NOT NULL,
	`title` varchar(512) NOT NULL,
	`department` varchar(255),
	`eventId` int,
	`sourceId` int,
	`evidence` text,
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `government_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organization_people` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`personId` int NOT NULL,
	`roleType` enum('founder','promoter','director','executive','shareholder','other') NOT NULL,
	`peopleRelationshipVerification` enum('unverified','machine_matched','source_verified','independently_corroborated','rejected') NOT NULL DEFAULT 'unverified',
	`evidence` text NOT NULL,
	`sourceId` int,
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organization_people_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_person_role_uq` UNIQUE(`organizationId`,`personId`,`roleType`)
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` int AUTO_INCREMENT NOT NULL,
	`displayName` varchar(255) NOT NULL,
	`normalizedName` varchar(255) NOT NULL,
	`isSynthetic` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `people_id` PRIMARY KEY(`id`),
	CONSTRAINT `people_normalized_name_uq` UNIQUE(`normalizedName`)
);
--> statement-breakpoint
CREATE TABLE `source_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`accountKey` varchar(255) NOT NULL,
	`displayName` varchar(255),
	`profileUrl` varchar(2048),
	`isOfficial` boolean NOT NULL DEFAULT false,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `source_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_account_key_uq` UNIQUE(`sourceId`,`accountKey`)
);
--> statement-breakpoint
ALTER TABLE `events` MODIFY COLUMN `verificationStatus` enum('unverified','machine_matched','source_verified','independently_corroborated','rejected') NOT NULL DEFAULT 'unverified';--> statement-breakpoint
ALTER TABLE `relationships` MODIFY COLUMN `relationshipVerification` enum('unverified','machine_matched','source_verified','independently_corroborated','rejected') NOT NULL DEFAULT 'unverified';--> statement-breakpoint
ALTER TABLE `organizations` ADD `cin` varchar(32);--> statement-breakpoint
ALTER TABLE `securities` ADD `nseSymbol` varchar(64);--> statement-breakpoint
ALTER TABLE `securities` ADD `bseCode` varchar(32);--> statement-breakpoint
ALTER TABLE `securities` ADD `isin` varchar(32);--> statement-breakpoint
ALTER TABLE `entity_resolution_candidates` ADD CONSTRAINT `erc_org_fk` FOREIGN KEY (`candidateOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entity_resolution_candidates` ADD CONSTRAINT `erc_min_fk` FOREIGN KEY (`candidateMinisterId`) REFERENCES `minister_profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entity_resolution_candidates` ADD CONSTRAINT `entity_resolution_candidates_documentId_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `government_actions` ADD CONSTRAINT `government_actions_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `government_actions` ADD CONSTRAINT `government_actions_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_people` ADD CONSTRAINT `organization_people_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_people` ADD CONSTRAINT `organization_people_personId_people_id_fk` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_people` ADD CONSTRAINT `organization_people_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `source_accounts` ADD CONSTRAINT `source_accounts_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `entity_candidate_normalized_idx` ON `entity_resolution_candidates` (`normalizedMention`);--> statement-breakpoint
CREATE INDEX `entity_candidate_status_idx` ON `entity_resolution_candidates` (`candidateReviewStatus`);--> statement-breakpoint
CREATE INDEX `government_action_type_idx` ON `government_actions` (`actionType`);--> statement-breakpoint
CREATE INDEX `organization_person_person_idx` ON `organization_people` (`personId`);--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_officials` ADD CONSTRAINT `event_officials_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_officials` ADD CONSTRAINT `event_officials_ministerId_minister_profiles_id_fk` FOREIGN KEY (`ministerId`) REFERENCES `minister_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD CONSTRAINT `event_organizations_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_organizations` ADD CONSTRAINT `event_organizations_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_sources` ADD CONSTRAINT `event_sources_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_sources` ADD CONSTRAINT `event_sources_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_sources` ADD CONSTRAINT `event_sources_documentId_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `documents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `market_observations` ADD CONSTRAINT `market_observations_securityId_securities_id_fk` FOREIGN KEY (`securityId`) REFERENCES `securities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `minister_aliases` ADD CONSTRAINT `minister_aliases_ministerId_minister_profiles_id_fk` FOREIGN KEY (`ministerId`) REFERENCES `minister_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_aliases` ADD CONSTRAINT `organization_aliases_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_fromOrganizationId_organizations_id_fk` FOREIGN KEY (`fromOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `relationships` ADD CONSTRAINT `relationships_toOrganizationId_organizations_id_fk` FOREIGN KEY (`toOrganizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `securities` ADD CONSTRAINT `securities_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `source_jobs` ADD CONSTRAINT `source_jobs_sourceId_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `watchlist_organizations` ADD CONSTRAINT `watchlist_organizations_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;
