import {
  boolean,
  decimal,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Organizations are companies or other market participants; all fixture rows are explicitly synthetic. */
export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  canonicalName: varchar("canonicalName", { length: 255 }).notNull(),
  normalizedName: varchar("normalizedName", { length: 255 }).notNull(),
  cin: varchar("cin", { length: 32 }),
  organizationType: varchar("organizationType", { length: 64 }).notNull().default("company"),
  sector: varchar("sector", { length: 128 }),
  industry: varchar("industry", { length: 128 }),
  listed: boolean("listed").notNull().default(false),
  nseSymbol: varchar("nseSymbol", { length: 64 }),
  bseCode: varchar("bseCode", { length: 64 }),
  isin: varchar("isin", { length: 32 }),
  description: text("description"),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [uniqueIndex("organizations_normalized_name_uq").on(t.normalizedName), index("organizations_sector_idx").on(t.sector)]);

export const organizationAliases = mysqlTable("organization_aliases", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  alias: varchar("alias", { length: 255 }).notNull(),
  normalizedAlias: varchar("normalizedAlias", { length: 255 }).notNull(),
  aliasType: varchar("aliasType", { length: 64 }).notNull().default("name"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("organization_alias_norm_uq").on(t.normalizedAlias), index("organization_alias_org_idx").on(t.organizationId)]);

export const ministers = mysqlTable("minister_profiles", {
  id: int("id").autoincrement().primaryKey(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  normalizedName: varchar("normalizedName", { length: 255 }).notNull(),
  position: varchar("position", { length: 255 }),
  ministry: varchar("ministry", { length: 255 }),
  portfolio: varchar("portfolio", { length: 255 }),
  jurisdiction: varchar("jurisdiction", { length: 128 }).default("synthetic"),
  profileSummary: text("profileSummary"),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [uniqueIndex("minister_name_uq").on(t.normalizedName)]);

export const ministerAliases = mysqlTable("minister_aliases", {
  id: int("id").autoincrement().primaryKey(),
  ministerId: int("ministerId").notNull().references(() => ministers.id, { onDelete: "cascade" }),
  alias: varchar("alias", { length: 255 }).notNull(),
  normalizedAlias: varchar("normalizedAlias", { length: 255 }).notNull(),
}, t => [uniqueIndex("minister_alias_norm_uq").on(t.normalizedAlias), index("minister_alias_minister_idx").on(t.ministerId)]);

export const sources = mysqlTable("sources", {
  id: int("id").autoincrement().primaryKey(),
  sourceKey: varchar("sourceKey", { length: 128 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  sourceType: varchar("sourceType", { length: 64 }).notNull().default("fixture"),
  baseUrl: varchar("baseUrl", { length: 2048 }),
  adapterKey: varchar("adapterKey", { length: 128 }),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  isEnabled: boolean("isEnabled").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("sources_key_uq").on(t.sourceKey)]);

export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
  normalizedUrl: varchar("normalizedUrl", { length: 2048 }),
  urlHash: varchar("urlHash", { length: 64 }),
  externalId: varchar("externalId", { length: 255 }),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  title: varchar("title", { length: 512 }),
  publishedAt: timestamp("publishedAt"),
  retrievedAt: timestamp("retrievedAt").defaultNow().notNull(),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
}, t => [uniqueIndex("documents_source_content_uq").on(t.sourceId, t.contentHash), index("documents_url_hash_idx").on(t.urlHash), index("documents_source_idx").on(t.sourceId)]);

export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  eventKey: varchar("eventKey", { length: 128 }).notNull(),
  eventType: varchar("eventType", { length: 96 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  summary: text("summary"),
  occurredAt: timestamp("occurredAt").notNull(),
  location: varchar("location", { length: 255 }),
  category: varchar("category", { length: 96 }),
  sector: varchar("sector", { length: 128 }),
  verificationStatus: mysqlEnum("verificationStatus", ["unverified", "machine_matched", "source_verified", "independently_corroborated", "rejected"]).notNull().default("unverified"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [uniqueIndex("events_key_uq").on(t.eventKey), index("events_occurred_idx").on(t.occurredAt), index("events_type_idx").on(t.eventType), index("events_status_idx").on(t.verificationStatus)]);

export const eventOrganizations = mysqlTable("event_organizations", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull().references(() => events.id, { onDelete: "cascade" }),
  organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 96 }).notNull().default("mentioned"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  verificationStatus: mysqlEnum("eventOrganizationVerification", ["unverified", "machine_matched", "source_verified", "independently_corroborated", "rejected"]).notNull().default("unverified"),
  evidence: text("evidence").notNull(),
  sourceId: int("sourceId").references(() => sources.id, { onDelete: "set null" }),
  documentId: int("documentId").references(() => documents.id, { onDelete: "set null" }),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
}, t => [uniqueIndex("event_org_role_uq").on(t.eventId, t.organizationId, t.role), index("event_org_event_idx").on(t.eventId), index("event_org_org_idx").on(t.organizationId)]);

export const eventOfficials = mysqlTable("event_officials", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull().references(() => events.id, { onDelete: "cascade" }),
  ministerId: int("ministerId").notNull().references(() => ministers.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 96 }).notNull().default("mentioned"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  verificationStatus: mysqlEnum("eventOfficialVerification", ["unverified", "machine_matched", "source_verified", "independently_corroborated", "rejected"]).notNull().default("unverified"),
  evidence: text("evidence").notNull(),
  sourceId: int("sourceId").references(() => sources.id, { onDelete: "set null" }),
  documentId: int("documentId").references(() => documents.id, { onDelete: "set null" }),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
}, t => [uniqueIndex("event_official_role_uq").on(t.eventId, t.ministerId, t.role), index("event_official_event_idx").on(t.eventId), index("event_official_minister_idx").on(t.ministerId)]);

export const eventSources = mysqlTable("event_sources", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull().references(() => events.id, { onDelete: "cascade" }),
  sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
  documentId: int("documentId").references(() => documents.id, { onDelete: "set null" }),
  provenanceNote: text("provenanceNote"),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
}, t => [uniqueIndex("event_source_document_uq").on(t.eventId, t.sourceId, t.documentId), index("event_source_event_idx").on(t.eventId), index("event_source_source_idx").on(t.sourceId)]);

export const relationships = mysqlTable("relationships", {
  id: int("id").autoincrement().primaryKey(),
  fromOrganizationId: int("fromOrganizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  toOrganizationId: int("toOrganizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  relationshipType: varchar("relationshipType", { length: 96 }).notNull(),
  strength: decimal("strength", { precision: 5, scale: 4 }),
  verificationStatus: mysqlEnum("relationshipVerification", ["unverified", "machine_matched", "source_verified", "independently_corroborated", "rejected"]).notNull().default("unverified"),
  evidence: text("evidence").notNull(),
  sourceId: int("sourceId").references(() => sources.id, { onDelete: "set null" }),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("relationship_edge_uq").on(t.fromOrganizationId, t.toOrganizationId, t.relationshipType), index("relationship_from_idx").on(t.fromOrganizationId), index("relationship_to_idx").on(t.toOrganizationId)]);

export const securities = mysqlTable("securities", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  securityName: varchar("securityName", { length: 255 }).notNull(),
  ticker: varchar("ticker", { length: 64 }),
  nseSymbol: varchar("nseSymbol", { length: 64 }),
  bseCode: varchar("bseCode", { length: 32 }),
  isin: varchar("isin", { length: 32 }),
  exchange: varchar("exchange", { length: 96 }),
  currency: varchar("currency", { length: 16 }),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("security_org_name_uq").on(t.organizationId, t.securityName), index("security_ticker_idx").on(t.ticker)]);

export const marketObservations = mysqlTable("market_observations", {
  id: int("id").autoincrement().primaryKey(),
  securityId: int("securityId").notNull().references(() => securities.id, { onDelete: "cascade" }),
  observedAt: timestamp("observedAt").notNull(),
  open: decimal("open", { precision: 20, scale: 8 }),
  close: decimal("close", { precision: 20, scale: 8 }),
  volume: decimal("volume", { precision: 24, scale: 4 }),
  sourceId: int("sourceId").references(() => sources.id, { onDelete: "set null" }),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("market_security_time_uq").on(t.securityId, t.observedAt), index("market_time_idx").on(t.observedAt)]);

export const sourceJobs = mysqlTable("source_jobs", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
  jobType: varchar("jobType", { length: 64 }).notNull(),
  status: mysqlEnum("jobStatus", ["queued", "running", "succeeded", "failed", "disabled"]).notNull().default("disabled"),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  rowCount: int("rowCount").default(0).notNull(),
  duplicateCount: int("duplicateCount").default(0).notNull(),
  errorCount: int("errorCount").default(0).notNull(),
  retryCount: int("retryCount").default(0).notNull(),
  quotaLimited: boolean("quotaLimited").default(false).notNull(),
  errorSummary: text("errorSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [index("source_jobs_source_idx").on(t.sourceId), index("source_jobs_status_idx").on(t.status)]);

export const watchlists = mysqlTable("watchlists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("watchlist_user_name_uq").on(t.userId, t.name)]);

export const watchlistOrganizations = mysqlTable("watchlist_organizations", {
  id: int("id").autoincrement().primaryKey(),
  watchlistId: int("watchlistId").notNull().references(() => watchlists.id, { onDelete: "cascade" }),
  organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
}, t => [uniqueIndex("watchlist_org_uq").on(t.watchlistId, t.organizationId)]);

export const savedSearches = mysqlTable("saved_searches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  queryJson: text("queryJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("saved_search_user_name_uq").on(t.userId, t.name)]);

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 96 }).notNull(),
  entityType: varchar("entityType", { length: 96 }),
  entityId: int("entityId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [index("audit_user_idx").on(t.userId), index("audit_action_idx").on(t.action)]);

export const sourceAccounts = mysqlTable("source_accounts", {
  id: int("id").autoincrement().primaryKey(),
  sourceId: int("sourceId").notNull().references(() => sources.id, { onDelete: "cascade" }),
  accountKey: varchar("accountKey", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
  profileUrl: varchar("profileUrl", { length: 2048 }),
  isOfficial: boolean("isOfficial").notNull().default(false),
  isEnabled: boolean("isEnabled").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("source_account_key_uq").on(t.sourceId, t.accountKey)]);

export const people = mysqlTable("people", {
  id: int("id").autoincrement().primaryKey(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  normalizedName: varchar("normalizedName", { length: 255 }).notNull(),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("people_normalized_name_uq").on(t.normalizedName)]);

export const organizationPeople = mysqlTable("organization_people", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  personId: int("personId").notNull().references(() => people.id, { onDelete: "cascade" }),
  roleType: mysqlEnum("roleType", ["founder", "promoter", "director", "executive", "shareholder", "other"]).notNull(),
  verificationStatus: mysqlEnum("peopleRelationshipVerification", ["unverified", "machine_matched", "source_verified", "independently_corroborated", "rejected"]).notNull().default("unverified"),
  evidence: text("evidence").notNull(),
  sourceId: int("sourceId").references(() => sources.id, { onDelete: "set null" }),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [uniqueIndex("organization_person_role_uq").on(t.organizationId, t.personId, t.roleType), index("organization_person_person_idx").on(t.personId)]);

export const governmentActions = mysqlTable("government_actions", {
  id: int("id").autoincrement().primaryKey(),
  actionType: varchar("actionType", { length: 96 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  department: varchar("department", { length: 255 }),
  eventId: int("eventId").references(() => events.id, { onDelete: "set null" }),
  sourceId: int("sourceId").references(() => sources.id, { onDelete: "set null" }),
  evidence: text("evidence"),
  isSynthetic: boolean("isSynthetic").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [index("government_action_type_idx").on(t.actionType)]);

export const entityResolutionCandidates = mysqlTable("entity_resolution_candidates", {
  id: int("id").autoincrement().primaryKey(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  rawMention: varchar("rawMention", { length: 512 }).notNull(),
  normalizedMention: varchar("normalizedMention", { length: 512 }).notNull(),
  candidateOrganizationId: int("candidateOrganizationId"),
  candidateMinisterId: int("candidateMinisterId"),
  matchMethod: varchar("matchMethod", { length: 64 }).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  reviewStatus: mysqlEnum("candidateReviewStatus", ["unverified", "accepted", "rejected"]).notNull().default("unverified"),
  documentId: int("documentId").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [
  index("entity_candidate_normalized_idx").on(t.normalizedMention),
  index("entity_candidate_status_idx").on(t.reviewStatus),
  foreignKey({ name: "erc_org_fk", columns: [t.candidateOrganizationId], foreignColumns: [organizations.id] }).onDelete("set null"),
  foreignKey({ name: "erc_min_fk", columns: [t.candidateMinisterId], foreignColumns: [ministers.id] }).onDelete("set null"),
]);

export type Organization = typeof organizations.$inferSelect;
export type Minister = typeof ministers.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Security = typeof securities.$inferSelect;
export type MarketObservation = typeof marketObservations.$inferSelect;
