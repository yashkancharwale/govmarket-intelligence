import { and, desc, eq, gte, inArray, like, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  auditLogs,
  documents,
  entityResolutionCandidates,
  eventOfficials,
  eventOrganizations,
  eventSources,
  events,
  marketObservations,
  ministerAliases,
  ministers,
  organizationAliases,
  organizationPeople,
  organizations,
  people,
  relationships,
  savedSearches,
  securities,
  sourceJobs,
  sources,
  watchlistOrganizations,
  watchlists,
} from "../drizzle/schema";
import { calculateEventStudy, classifyEvent, eventSearchInputSchema, normalizeName, normalizeUrl, parseCsv, sha256 } from "../shared/intelligence";
import { configurePibSource, exportPibRssCsv, PIB_ADAPTER_KEY, PIB_RSS_FEED_URL, PIB_SOURCE_KEY, runPibRssIngestion, PibSourceConfigurationError } from "./pibRss";

const verifiedStatuses = new Set(["source_verified", "independently_corroborated"]);
const pendingStatuses = ["unverified", "machine_matched"] as const;
const emptyDatabaseResult = () => ({ error: "Database is not configured", synthetic: true });
const pibWritesEnabled = () => process.env.GOVMARKET_PIB_WRITE_TARGET === "development";

function assertPibDevelopmentDatabase() {
  if (!pibWritesEnabled()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PIB writes are disabled. Set GOVMARKET_PIB_WRITE_TARGET=development only after confirming DATABASE_URL points to the intended development/test database; the managed preview/published database may be shared." });
  }
}

export function parsePibJobAuditMetrics(details: string | null | undefined) {
  if (!details) return null;
  try {
    const value = JSON.parse(details) as Record<string, unknown>;
    if (value.sourceKey !== PIB_SOURCE_KEY || !Number.isSafeInteger(value.jobId)) return null;
    return {
      jobId: value.jobId as number,
      importedCount: Number.isSafeInteger(value.imported) ? value.imported as number : 0,
      revisionCount: Number.isSafeInteger(value.revisions) ? value.revisions as number : 0,
    };
  } catch {
    return null;
  }
}

async function requireDatabase() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database is not configured." });
  return db;
}

function companySummary(row: any) {
  return {
    id: row.id,
    name: row.canonicalName,
    sector: row.sector ?? null,
    industry: row.industry ?? null,
    cin: row.cin ?? null,
    description: row.description ?? null,
    listed: Boolean(row.listed),
    isSynthetic: Boolean(row.isSynthetic),
    nseSymbol: row.nseSymbol ?? null,
    bseCode: row.bseCode ?? null,
    isin: row.isin ?? null,
  };
}

function ministerSummary(row: any) {
  return {
    id: row.id,
    name: row.displayName,
    position: row.position ?? row.portfolio ?? null,
    ministry: row.ministry ?? null,
    isSynthetic: Boolean(row.isSynthetic),
  };
}

async function eventSummary(db: any, event: any) {
  const [companyLinks, officialLinks, sourceLinks] = await Promise.all([
    db.select({ organization: organizations, link: eventOrganizations })
      .from(eventOrganizations)
      .innerJoin(organizations, eq(eventOrganizations.organizationId, organizations.id))
      .where(eq(eventOrganizations.eventId, event.id)),
    db.select({ minister: ministers, link: eventOfficials })
      .from(eventOfficials)
      .innerJoin(ministers, eq(eventOfficials.ministerId, ministers.id))
      .where(eq(eventOfficials.eventId, event.id)),
    db.select({ source: sources })
      .from(eventSources)
      .innerJoin(sources, eq(eventSources.sourceId, sources.id))
      .where(eq(eventSources.eventId, event.id)),
  ]);
  const companies = companyLinks.map(({ organization, link }: any) => ({
    ...companySummary(organization),
    role: link.role,
    evidence: link.evidence,
    verificationStatus: link.verificationStatus,
    isSynthetic: Boolean(link.isSynthetic || organization.isSynthetic),
  }));
  const officials = officialLinks.map(({ minister, link }: any) => ({
    ...ministerSummary(minister),
    role: link.role,
    evidence: link.evidence,
    verificationStatus: link.verificationStatus,
    isSynthetic: Boolean(link.isSynthetic || minister.isSynthetic),
  }));
  const sourceTypes = [...new Set(sourceLinks.map(({ source }: any) => source.sourceType))];
  return {
    id: event.id,
    title: event.title,
    eventType: event.eventType,
    eventDate: event.occurredAt,
    category: event.category,
    summary: event.summary,
    location: event.location ?? null,
    sourceType: sourceTypes[0] ?? null,
    sourceTypes,
    verificationStatus: event.verificationStatus,
    isSynthetic: Boolean(event.isSynthetic),
    companies,
    officials,
    minister: officials[0] ?? null,
    sourceCount: sourceLinks.length,
  };
}

function containsEverySearchToken(query: string | undefined, values: Array<string | null | undefined>) {
  if (!query) return true;
  const stopWords = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to", "with"]);
  const tokens = normalizeName(query).split(" ").filter(token => token && !stopWords.has(token));
  if (!tokens.length) return true;
  const text = normalizeName(values.filter(Boolean).join(" "));
  return tokens.every(token => text.includes(token) || (token.length > 5 && text.includes(token.slice(0, -1))));
}

export async function listEventSummaries(input: z.infer<typeof eventSearchInputSchema>) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: input.page, pageSize: input.pageSize, ...emptyDatabaseResult() };
  const conditions = [
    input.from ? gte(events.occurredAt, input.from) : undefined,
    input.to ? lte(events.occurredAt, input.to) : undefined,
    input.category ? eq(events.category, input.category) : undefined,
    input.verificationStatus ? eq(events.verificationStatus, input.verificationStatus) : undefined,
    input.location ? like(events.location, `%${input.location}%`) : undefined,
  ];
  const [rows, allOrganizationAliases, allMinisterAliases] = await Promise.all([
    db.select().from(events).where(and(...conditions)),
    db.select().from(organizationAliases),
    db.select().from(ministerAliases),
  ]);
  const summaries = await Promise.all(rows.map((row: any) => eventSummary(db, row)));
  const filtered = summaries.filter((item: any) => {
    const companyAliasNames = allOrganizationAliases
      .filter((alias: any) => item.companies.some((company: any) => company.id === alias.organizationId))
      .map((alias: any) => alias.alias);
    const ministerAliasNames = allMinisterAliases
      .filter((alias: any) => item.officials.some((official: any) => official.id === alias.ministerId))
      .map((alias: any) => alias.alias);
    const searchValues = [
      item.title, item.summary, item.location, item.category,
      ...item.companies.flatMap((company: any) => [company.name, company.sector, company.industry]),
      ...item.officials.flatMap((official: any) => [official.name, official.ministry]),
      ...companyAliasNames, ...ministerAliasNames,
    ];
    const linkedCompanies = item.companies as any[];
    return containsEverySearchToken(input.query, searchValues)
      && (!input.companyId || linkedCompanies.some(company => company.id === input.companyId))
      && (!input.ministerId || item.officials.some((official: any) => official.id === input.ministerId))
      && (!input.sector || linkedCompanies.some(company => `${company.sector ?? ""} ${company.industry ?? ""}`.toLowerCase().includes(input.sector!.toLowerCase())))
      && (!input.sourceType || item.sourceTypes.includes(input.sourceType))
      && (input.listed === undefined || linkedCompanies.some(company => company.listed === input.listed))
      && (!input.query || searchValues.some(value => value && containsEverySearchToken(input.query, [value])) || containsEverySearchToken(input.query, searchValues));
  }).sort((a: any, b: any) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  const start = (input.page - 1) * input.pageSize;
  return { items: filtered.slice(start, start + input.pageSize), total: filtered.length, page: input.page, pageSize: input.pageSize };
}

export async function overview() {
  const db = await getDb();
  if (!db) {
    return {
      stats: { events: 0, verifiedEvents: 0, companies: 0, listedCompanies: 0 },
      recentEvents: [], sectors: [], categories: [], recentlyMentionedCompanies: [], timeline: [],
      sourceHealth: { configuredSources: 0, lastSuccessfulAt: null, awaitingVerification: 0, failures: 0 },
      ...emptyDatabaseResult(),
    };
  }
  const [eventRows, companyRows, sourceRows, jobs] = await Promise.all([
    db.select().from(events).orderBy(desc(events.occurredAt)),
    db.select().from(organizations),
    db.select().from(sources),
    db.select().from(sourceJobs),
  ]);
  const summaries = await Promise.all(eventRows.map((row: any) => eventSummary(db, row)));
  const categoryCounts = new Map<string, number>();
  const sectorCounts = new Map<string, number>();
  const mentionedCompanies = new Map<number, any>();
  for (const item of summaries as any[]) {
    if (item.category) categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    for (const company of item.companies) {
      if (company.sector) sectorCounts.set(company.sector, (sectorCounts.get(company.sector) ?? 0) + 1);
      if (!mentionedCompanies.has(company.id)) mentionedCompanies.set(company.id, company);
    }
  }
  const latestSuccessful = jobs
    .filter((job: any) => job.status === "succeeded")
    .sort((a: any, b: any) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0))[0];
  const linkedCompanyIds = new Set((summaries as any[]).flatMap(item => item.companies.map((company: any) => company.id)));
  const toCounts = (map: Map<string, number>) => [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return {
    stats: {
      events: eventRows.length,
      verifiedEvents: eventRows.filter((event: any) => verifiedStatuses.has(event.verificationStatus)).length,
      companies: companyRows.length,
      listedCompanies: companyRows.filter((company: any) => company.listed && linkedCompanyIds.has(company.id)).length,
    },
    recentEvents: summaries.slice(0, 10),
    sectors: toCounts(sectorCounts),
    categories: toCounts(categoryCounts),
    recentlyMentionedCompanies: [...mentionedCompanies.values()].slice(0, 10),
    timeline: summaries.slice(0, 30),
    sourceHealth: {
      configuredSources: sourceRows.filter((source: any) => source.isEnabled && !source.isSynthetic).length,
      lastSuccessfulAt: latestSuccessful?.finishedAt ?? null,
      awaitingVerification: eventRows.filter((event: any) => pendingStatuses.includes(event.verificationStatus)).length,
      failures: jobs.filter((job: any) => job.status === "failed").length,
    },
  };
}

async function findOrganizationByMention(db: any, mention: string) {
  const normalized = normalizeName(mention);
  const exact = await db.select().from(organizations).where(eq(organizations.normalizedName, normalized)).limit(1);
  if (exact[0]) return exact[0];
  const alias = await db.select({ organization: organizations })
    .from(organizationAliases)
    .innerJoin(organizations, eq(organizationAliases.organizationId, organizations.id))
    .where(eq(organizationAliases.normalizedAlias, normalized))
    .limit(1);
  return alias[0]?.organization;
}

async function findMinisterByMention(db: any, mention: string) {
  const normalized = normalizeName(mention);
  const exact = await db.select().from(ministers).where(eq(ministers.normalizedName, normalized)).limit(1);
  if (exact[0]) return exact[0];
  const alias = await db.select({ minister: ministers })
    .from(ministerAliases)
    .innerJoin(ministers, eq(ministerAliases.ministerId, ministers.id))
    .where(eq(ministerAliases.normalizedAlias, normalized))
    .limit(1);
  return alias[0]?.minister;
}

const accountRouter = router({
  watchlists: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const rows = await db.select().from(watchlists).where(eq(watchlists.userId, ctx.user.id));
      return Promise.all(rows.map(async (list: any) => {
        const memberships = await db.select({ organization: organizations })
          .from(watchlistOrganizations)
          .innerJoin(organizations, eq(watchlistOrganizations.organizationId, organizations.id))
          .where(eq(watchlistOrganizations.watchlistId, list.id));
        return { ...list, companies: memberships.map(({ organization }: any) => companySummary(organization)) };
      }));
    }),
    addCompany: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const company = (await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1))[0];
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      let list = (await db.select().from(watchlists).where(and(eq(watchlists.userId, ctx.user.id), eq(watchlists.name, "My watchlist"))).limit(1))[0];
      if (!list) {
        try {
          const id = (await db.insert(watchlists).values({ userId: ctx.user.id, name: "My watchlist" }).$returningId())[0]?.id;
          list = (await db.select().from(watchlists).where(eq(watchlists.id, Number(id))).limit(1))[0];
        } catch {
          list = (await db.select().from(watchlists).where(and(eq(watchlists.userId, ctx.user.id), eq(watchlists.name, "My watchlist"))).limit(1))[0];
        }
      }
      if (!list) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not open the user's watchlist." });
      const exists = await db.select().from(watchlistOrganizations).where(and(eq(watchlistOrganizations.watchlistId, list.id), eq(watchlistOrganizations.organizationId, company.id))).limit(1);
      if (!exists.length) await db.insert(watchlistOrganizations).values({ watchlistId: list.id, organizationId: company.id });
      return { success: true, alreadySaved: exists.length > 0 };
    }),
    removeCompany: protectedProcedure.input(z.object({ watchlistId: z.number().int().positive(), organizationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const owned = await db.select().from(watchlists).where(and(eq(watchlists.id, input.watchlistId), eq(watchlists.userId, ctx.user.id))).limit(1);
      if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "Watchlist not found." });
      await db.delete(watchlistOrganizations).where(and(eq(watchlistOrganizations.watchlistId, input.watchlistId), eq(watchlistOrganizations.organizationId, input.organizationId)));
      return { success: true };
    }),
  }),
  savedSearches: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      return db.select().from(savedSearches).where(eq(savedSearches.userId, ctx.user.id)).orderBy(desc(savedSearches.createdAt));
    }),
    save: protectedProcedure.input(z.object({
      name: z.string().trim().min(1).max(128),
      filters: z.record(z.string(), z.unknown()).refine(filters => JSON.stringify(filters).length <= 4000, "Saved filters exceed 4 KB"),
    })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const exists = await db.select().from(savedSearches).where(and(eq(savedSearches.userId, ctx.user.id), eq(savedSearches.name, input.name))).limit(1);
      if (exists.length) throw new TRPCError({ code: "CONFLICT", message: "A saved search with that name already exists." });
      await db.insert(savedSearches).values({ userId: ctx.user.id, name: input.name, queryJson: JSON.stringify(input.filters) });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const owned = await db.select().from(savedSearches).where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id))).limit(1);
      if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "Saved search not found." });
      await db.delete(savedSearches).where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id)));
      return { success: true };
    }),
  }),
});

export const intelligenceRouter = router({
  overview: publicProcedure.query(() => overview()),
  events: router({
    search: publicProcedure.input(eventSearchInputSchema).query(({ input }) => listEventSummaries(input)),
    byId: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const event = (await db.select().from(events).where(eq(events.id, input.id)).limit(1))[0];
      if (!event) return null;
      const summary = await eventSummary(db, event);
      const sourceRows = await db.select({ source: sources, document: documents, link: eventSources })
        .from(eventSources)
        .innerJoin(sources, eq(eventSources.sourceId, sources.id))
        .leftJoin(documents, eq(eventSources.documentId, documents.id))
        .where(eq(eventSources.eventId, event.id));
      return {
        event: summary,
        companies: summary.companies,
        officials: summary.officials,
        sources: sourceRows.map(({ source, document, link }: any) => ({
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.sourceType,
          documentId: document?.id ?? null,
          url: document?.normalizedUrl ?? null,
          provenance: link.provenanceNote ?? null,
          isSynthetic: Boolean(source.isSynthetic || document?.isSynthetic),
        })),
      };
    }),
  }),
  ministers: router({
    list: publicProcedure.input(z.object({ query: z.string().trim().max(200).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(20) }).optional()).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const [rows, aliases] = await Promise.all([db.select().from(ministers), db.select().from(ministerAliases)]);
      const filtered = rows.filter((row: any) => {
        const searchTerms = [row.displayName, row.ministry, row.position, ...aliases.filter((alias: any) => alias.ministerId === row.id).map((alias: any) => alias.alias)];
        return containsEverySearchToken(input?.query, searchTerms);
      }).sort((a: any, b: any) => a.displayName.localeCompare(b.displayName));
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      return { items: filtered.slice((page - 1) * pageSize, page * pageSize).map(ministerSummary), total: filtered.length };
    }),
    byId: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const minister = (await db.select().from(ministers).where(eq(ministers.id, input.id)).limit(1))[0];
      if (!minister) return null;
      const links = await db.select({ event: events }).from(eventOfficials).innerJoin(events, eq(eventOfficials.eventId, events.id)).where(eq(eventOfficials.ministerId, input.id));
      const eventItems = await Promise.all(links.map(({ event }: any) => eventSummary(db, event)));
      const companies = [...new Map(eventItems.flatMap((item: any) => item.companies).map((company: any) => [company.id, company])).values()];
      const aliases = await db.select().from(ministerAliases).where(eq(ministerAliases.ministerId, input.id));
      return { minister: ministerSummary(minister), events: eventItems, companies, aliases: aliases.map((alias: any) => alias.alias) };
    }),
  }),
  companies: router({
    list: publicProcedure.input(z.object({ query: z.string().trim().max(200).optional(), sector: z.string().trim().max(128).optional(), listed: z.boolean().optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(20) }).optional()).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const [rows, aliases] = await Promise.all([db.select().from(organizations), db.select().from(organizationAliases)]);
      const filtered = rows.filter((row: any) => {
        const searchTerms = [row.canonicalName, row.sector, row.industry, ...aliases.filter((alias: any) => alias.organizationId === row.id).map((alias: any) => alias.alias)];
        return containsEverySearchToken(input?.query, searchTerms)
          && (!input?.sector || `${row.sector ?? ""} ${row.industry ?? ""}`.toLowerCase().includes(input.sector.toLowerCase()))
          && (input?.listed === undefined || Boolean(row.listed) === input.listed);
      }).sort((a: any, b: any) => a.canonicalName.localeCompare(b.canonicalName));
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      return { items: filtered.slice((page - 1) * pageSize, page * pageSize).map(companySummary), total: filtered.length };
    }),
    byId: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const company = (await db.select().from(organizations).where(eq(organizations.id, input.id)).limit(1))[0];
      if (!company) return null;
      const [eventLinks, companyEdges, securitiesRows, peopleLinks, aliases] = await Promise.all([
        db.select({ event: events }).from(eventOrganizations).innerJoin(events, eq(eventOrganizations.eventId, events.id)).where(eq(eventOrganizations.organizationId, input.id)),
        db.select().from(relationships).where(or(eq(relationships.fromOrganizationId, input.id), eq(relationships.toOrganizationId, input.id))),
        db.select().from(securities).where(eq(securities.organizationId, input.id)),
        db.select({ person: people, relation: organizationPeople }).from(organizationPeople).innerJoin(people, eq(organizationPeople.personId, people.id)).where(eq(organizationPeople.organizationId, input.id)),
        db.select().from(organizationAliases).where(eq(organizationAliases.organizationId, input.id)),
      ]);
      const eventItems = await Promise.all(eventLinks.map(({ event }: any) => eventSummary(db, event)));
      const linkedOrganizationIds = [...new Set(companyEdges.flatMap((edge: any) => [edge.fromOrganizationId, edge.toOrganizationId]).filter((id: number) => id !== input.id))];
      const linkedOrganizations = linkedOrganizationIds.length ? await db.select().from(organizations).where(inArray(organizations.id, linkedOrganizationIds)) : [];
      const nameById = new Map(linkedOrganizations.map((row: any) => [row.id, row.canonicalName]));
      return {
        company: companySummary(company),
        events: eventItems,
        relationships: companyEdges.map((edge: any) => ({
          ...edge,
          fromName: edge.fromOrganizationId === input.id ? company.canonicalName : nameById.get(edge.fromOrganizationId),
          toName: edge.toOrganizationId === input.id ? company.canonicalName : nameById.get(edge.toOrganizationId),
        })),
        people: peopleLinks.map(({ person, relation }: any) => ({ ...relation, personName: person.displayName, isSynthetic: Boolean(relation.isSynthetic || person.isSynthetic) })),
        securities: securitiesRows,
        aliases: aliases.map((alias: any) => alias.alias),
      };
    }),
  }),
  relationships: router({
    graph: publicProcedure.input(z.object({ companyId: z.number().int().positive().optional() }).optional()).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { nodes: [], edges: [] };
      const companyFilter = input?.companyId;
      const eventOrganizationRows = companyFilter
        ? await db.select().from(eventOrganizations).where(eq(eventOrganizations.organizationId, companyFilter))
        : await db.select().from(eventOrganizations);
      const eventIds = [...new Set(eventOrganizationRows.map((link: any) => link.eventId))];
      const [eventRows, eventOfficialRows, organizationRows, companyEdges] = await Promise.all([
        eventIds.length ? db.select().from(events).where(inArray(events.id, eventIds)) : Promise.resolve([]),
        eventIds.length ? db.select().from(eventOfficials).where(inArray(eventOfficials.eventId, eventIds)) : Promise.resolve([]),
        companyFilter ? db.select().from(organizations).where(eq(organizations.id, companyFilter)) : db.select().from(organizations),
        companyFilter
          ? db.select().from(relationships).where(or(eq(relationships.fromOrganizationId, companyFilter), eq(relationships.toOrganizationId, companyFilter)))
          : db.select().from(relationships),
      ]);
      const organizationIds = new Set<number>([
        ...eventOrganizationRows.map((link: any) => link.organizationId),
        ...companyEdges.flatMap((edge: any) => [edge.fromOrganizationId, edge.toOrganizationId]),
      ]);
      const allNeededOrganizations = companyFilter
        ? await db.select().from(organizations).where(inArray(organizations.id, [...organizationIds]))
        : organizationRows;
      const officialIds = [...new Set(eventOfficialRows.map((link: any) => link.ministerId))];
      const officialRows = officialIds.length ? await db.select().from(ministers).where(inArray(ministers.id, officialIds)) : [];
      const eventById = new Map(eventRows.map((row: any) => [row.id, row]));
      const orgById = new Map(allNeededOrganizations.map((row: any) => [row.id, row]));
      const officialById = new Map(officialRows.map((row: any) => [row.id, row]));
      const nodes: Array<{ id: string; label: string; type: string; isSynthetic: boolean; href?: string }> = [];
      const nodeIds = new Set<string>();
      const addNode = (node: { id: string; label: string; type: string; isSynthetic: boolean; href?: string }) => {
        if (!nodeIds.has(node.id)) { nodeIds.add(node.id); nodes.push(node); }
      };
      for (const event of eventRows as any[]) addNode({ id: `event:${event.id}`, label: event.title, type: "event", isSynthetic: Boolean(event.isSynthetic) });
      for (const organization of allNeededOrganizations as any[]) addNode({ id: `organization:${organization.id}`, label: organization.canonicalName, type: "organization", isSynthetic: Boolean(organization.isSynthetic), href: `/companies/${organization.id}` });
      for (const official of officialRows as any[]) addNode({ id: `minister:${official.id}`, label: official.displayName, type: "official", isSynthetic: Boolean(official.isSynthetic), href: `/ministers/${official.id}` });
      const edges: any[] = [];
      for (const link of eventOrganizationRows as any[]) {
        edges.push({ id: `event-organization:${link.id}`, from: `event:${link.eventId}`, to: `organization:${link.organizationId}`, type: link.role, evidence: link.evidence, verificationStatus: link.verificationStatus, isSynthetic: Boolean(link.isSynthetic) });
      }
      for (const link of eventOfficialRows as any[]) {
        edges.push({ id: `official-event:${link.id}`, from: `minister:${link.ministerId}`, to: `event:${link.eventId}`, type: link.role, evidence: link.evidence, verificationStatus: link.verificationStatus, isSynthetic: Boolean(link.isSynthetic) });
      }
      for (const edge of companyEdges as any[]) {
        edges.push({ id: `organization:${edge.id}`, from: `organization:${edge.fromOrganizationId}`, to: `organization:${edge.toOrganizationId}`, type: edge.relationshipType, evidence: edge.evidence, verificationStatus: edge.verificationStatus, isSynthetic: Boolean(edge.isSynthetic) });
      }
      return { nodes, edges };
    }),
  }),
  market: router({
    coverage: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { connected: false, realDataAvailable: false, provider: null, observations: 0, message: "Database is not configured; no prices are shown." };
      const [marketSources, observations] = await Promise.all([
        db.select().from(sources).where(and(eq(sources.isEnabled, true), eq(sources.isSynthetic, false), eq(sources.sourceType, "market"))),
        db.select().from(marketObservations).where(eq(marketObservations.isSynthetic, false)),
      ]);
      const connected = marketSources.length > 0;
      return {
        connected,
        realDataAvailable: connected && observations.length > 0,
        provider: marketSources[0]?.name ?? null,
        observations: observations.length,
        message: connected && observations.length ? "Real market observations are configured; check series and licensing coverage before interpretation." : "No permitted/licensed market provider is configured; synthetic observations are not presented as real.",
      };
    }),
    eventStudy: publicProcedure.input(z.object({ eventId: z.number().int().positive(), securityId: z.number().int().positive() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { available: false, synthetic: true, eventSession: null, windows: [], message: "Database is not configured; no calculation performed." };
      const event = (await db.select().from(events).where(eq(events.id, input.eventId)).limit(1))[0];
      const security = (await db.select().from(securities).where(eq(securities.id, input.securityId)).limit(1))[0];
      if (!event || !security) throw new TRPCError({ code: "NOT_FOUND", message: "Event or security not found." });
      const linked = await db.select().from(eventOrganizations).where(and(eq(eventOrganizations.eventId, event.id), eq(eventOrganizations.organizationId, security.organizationId))).limit(1);
      if (!linked.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Selected security is not linked to this event through a documented company edge." });
      const observations = await db.select().from(marketObservations).where(and(eq(marketObservations.securityId, security.id), eq(marketObservations.isSynthetic, false)));
      const result = calculateEventStudy(event.occurredAt, observations.filter((row: any) => row.close !== null).map((row: any) => ({ observedAt: row.observedAt, close: Number(row.close), isSynthetic: false })));
      return { ...result, message: result.available ? "Descriptive event-relative returns only; benchmark, timestamp, corporate actions, sample size and source licensing must also be assessed." : "Missing valid observed trading sessions prevent the requested calculation." };
    }),
  }),
  system: router({
    health: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { sources: [], jobs: [], awaitingVerification: 0, latestRecordAt: null, pibWritesEnabled: pibWritesEnabled() };
      const [sourceRows, jobRows, pendingEvents, latestDocument, runAuditRows] = await Promise.all([
        db.select().from(sources),
        db.select().from(sourceJobs).orderBy(desc(sourceJobs.createdAt)).limit(50),
        db.select().from(events).where(inArray(events.verificationStatus, [...pendingStatuses])),
        db.select().from(documents).orderBy(desc(documents.retrievedAt)).limit(1),
        db.select({ details: auditLogs.details }).from(auditLogs).where(eq(auditLogs.action, "intelligence.runPibRss")).orderBy(desc(auditLogs.createdAt)).limit(200),
      ]);
      const pibMetricsByJobId = new Map<number, { importedCount: number; revisionCount: number }>();
      for (const audit of runAuditRows) {
        const metrics = parsePibJobAuditMetrics(audit.details);
        if (metrics && !pibMetricsByJobId.has(metrics.jobId)) {
          pibMetricsByJobId.set(metrics.jobId, { importedCount: metrics.importedCount, revisionCount: metrics.revisionCount });
        }
      }
      return {
        sources: sourceRows.map((source: any) => ({ ...source, configured: Boolean(source.isEnabled && !source.isSynthetic) })),
        jobs: jobRows.map((job: any) => ({ ...job, ...(pibMetricsByJobId.get(job.id) ?? {}) })),
        awaitingVerification: pendingEvents.length,
        latestRecordAt: latestDocument[0]?.retrievedAt ?? null,
        pibWritesEnabled: pibWritesEnabled(),
      };
    }),
    configurePibRss: adminProcedure.input(z.object({ enabled: z.boolean(), confirmDatabaseTarget: z.literal(true) })).mutation(async ({ input, ctx }) => {
      assertPibDevelopmentDatabase();
      const db = await requireDatabase();
      try {
        const source = await configurePibSource(db, input.enabled);
        await db.insert(auditLogs).values({
          userId: ctx.user.id,
          action: "intelligence.configurePibRss",
          entityType: "source",
          entityId: source?.id ?? null,
          details: JSON.stringify({ sourceKey: PIB_SOURCE_KEY, feedUrl: PIB_RSS_FEED_URL, enabled: input.enabled }),
        });
        return { configured: Boolean(source && !source.isSynthetic), enabled: Boolean(source?.isEnabled), sourceName: source?.name ?? null, feedUrl: PIB_RSS_FEED_URL };
      } catch (error) {
        if (error instanceof PibSourceConfigurationError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
        console.error("[PIB] Source configuration failed.");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PIB source configuration could not be saved." });
      }
    }),
    runPibRss: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(500).default(500), confirmDatabaseTarget: z.literal(true), confirmFeedAccess: z.literal(true) })).mutation(async ({ input, ctx }) => {
      assertPibDevelopmentDatabase();
      const db = await requireDatabase();
      const source = (await db.select().from(sources).where(eq(sources.sourceKey, PIB_SOURCE_KEY)).limit(1))[0];
      if (!source || source.isSynthetic || !source.isEnabled || source.adapterKey !== PIB_ADAPTER_KEY || source.baseUrl !== PIB_RSS_FEED_URL) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure and enable the official PIB RSS source as an administrator before running it." });
      }
      return { ...(await runPibRssIngestion(db, source, ctx.user.id, input.limit)), feedUrl: PIB_RSS_FEED_URL };
    }),
    exportPibRssCsv: adminProcedure.input(z.object({ confirmDatabaseTarget: z.literal(true) })).mutation(async ({ ctx }) => {
      assertPibDevelopmentDatabase();
      const db = await requireDatabase();
      const source = (await db.select().from(sources).where(eq(sources.sourceKey, PIB_SOURCE_KEY)).limit(1))[0];
      if (!source || source.isSynthetic || source.adapterKey !== PIB_ADAPTER_KEY || source.baseUrl !== PIB_RSS_FEED_URL) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No verified PIB source configuration is available for export." });
      }
      try {
        const output = await exportPibRssCsv(db, source.id);
        await db.insert(auditLogs).values({
          userId: ctx.user.id,
          action: "intelligence.exportPibRssCsv",
          entityType: "source",
          entityId: source.id,
          details: JSON.stringify({ filename: output.filename, recordCount: output.recordCount }),
        });
        return output;
      } catch (error) {
        console.error("[PIB] CSV export failed.");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error && error.message.includes("limited to") ? error.message : "PIB CSV export failed; no private data was returned." });
      }
    }),
    importCsv: adminProcedure.input(z.object({
      csv: z.string().max(1_000_000).optional(),
      csvText: z.string().max(1_000_000).optional(),
      filename: z.string().trim().max(255).optional(),
    }).refine(value => Boolean(value.csv ?? value.csvText), "csv is required")).mutation(async ({ input, ctx }) => {
      const parsed = parseCsv(input.csv ?? input.csvText ?? "");
      if (parsed.errors.length) return { imported: 0, revisions: 0, skipped: 0, errors: parsed.errors, synthetic: true, verificationStatus: "unverified" as const };
      const db = await requireDatabase();
      const startedAt = new Date();
      const sourceCache = new Map<string, any>();
      const sourceStats = new Map<number, { source: any; processed: number; imported: number; revisions: number; skipped: number; errors: Array<{ row: number; message: string }> }>();
      const rowErrors: Array<{ row: number; message: string }> = [];
      let imported = 0;
      let revisions = 0;
      let skipped = 0;

      async function csvSource(row: Record<string, string>, normalizedUrl: string | null) {
        const hostname = normalizedUrl ? new URL(normalizedUrl).hostname : "";
        const declaredName = row.sourceName?.trim() || hostname || "CSV import (no external source)";
        const declaredType = row.sourceType || "fixture";
        const origin = normalizedUrl ? new URL(normalizedUrl).origin : "";
        const keyMaterial = `${declaredType}|${normalizeName(declaredName)}|${origin}`;
        const key = `csv:${(await sha256(keyMaterial)).slice(0, 40)}`;
        const cached = sourceCache.get(key);
        if (cached) return cached;
        let source = (await db.select().from(sources).where(eq(sources.sourceKey, key)).limit(1))[0];
        if (!source) {
          const sourceId = (await db.insert(sources).values({
            sourceKey: key,
            name: declaredName.slice(0, 255),
            sourceType: declaredType,
            baseUrl: origin || null,
            adapterKey: "manual-csv-unverified",
            isSynthetic: true,
            isEnabled: false,
            notes: "Source metadata and URL are user-declared CSV values; content was not fetched or independently verified.",
          }).$returningId())[0]?.id;
          source = (await db.select().from(sources).where(eq(sources.id, Number(sourceId))).limit(1))[0];
        }
        if (!source) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create the import provenance record." });
        sourceCache.set(key, source);
        return source;
      }

      for (const [index, row] of parsed.rows.entries()) {
        const rowNumber = index + 2;
        const normalizedSourceUrl = row.sourceUrl ? normalizeUrl(row.sourceUrl) : null;
        const source = await csvSource(row, normalizedSourceUrl);
        let stats = sourceStats.get(source.id);
        if (!stats) {
          stats = { source, processed: 0, imported: 0, revisions: 0, skipped: 0, errors: [] };
          sourceStats.set(source.id, stats);
        }
        stats.processed++;

        try {
          const occurredAt = new Date(row.occurredAt);
          const externalId = row.externalId?.trim() || null;
          const contentHash = await sha256(JSON.stringify({
            externalId,
            eventType: row.eventType || "imported",
            title: row.title.trim(),
            occurredAt: occurredAt.toISOString(),
            category: row.category || null,
            summary: row.summary || null,
            location: row.location || null,
            company: row.company ? normalizeName(row.company) : null,
            minister: row.minister ? normalizeName(row.minister) : null,
            sourceUrl: normalizedSourceUrl,
          }));
          const identity = externalId
            ? `external:${externalId}`
            : normalizedSourceUrl
              ? `url:${normalizedSourceUrl}`
              : `content:${contentHash}`;
          const eventKey = `csv-${await sha256(`${source.id}|${identity}`)}`;

          const result = await db.transaction(async (tx: any) => {
            const existingEvents = await tx.select({ id: events.id }).from(events).where(eq(events.eventKey, eventKey)).limit(1);
            const existingDocuments = await tx.select({ id: documents.id }).from(documents)
              .where(and(eq(documents.sourceId, source.id), eq(documents.contentHash, contentHash))).limit(1);
            if (existingEvents.length && existingDocuments.length) return "duplicate" as const;

            const classification = classifyEvent({ title: row.title, summary: row.summary, category: row.category });
            const eventId = existingEvents[0]?.id ?? Number((await tx.insert(events).values({
              eventKey,
              eventType: row.eventType || "imported",
              title: row.title.trim(),
              occurredAt,
              category: classification.category,
              summary: row.summary || null,
              location: row.location || null,
              verificationStatus: "unverified",
              isSynthetic: true,
            }).$returningId())[0]?.id);
            const documentId = existingDocuments[0]?.id ?? Number((await tx.insert(documents).values({
              sourceId: source.id,
              normalizedUrl: normalizedSourceUrl,
              urlHash: normalizedSourceUrl ? await sha256(normalizedSourceUrl) : null,
              externalId,
              contentHash,
              title: row.sourceName ? `${row.sourceName.trim()}: ${row.title.trim()}`.slice(0, 512) : row.title.trim(),
              publishedAt: occurredAt,
              isSynthetic: true,
            }).$returningId())[0]?.id);
            const existingEventSource = await tx.select({ id: eventSources.id }).from(eventSources).where(and(
              eq(eventSources.eventId, eventId), eq(eventSources.sourceId, source.id), eq(eventSources.documentId, documentId),
            )).limit(1);
            if (!existingEventSource.length) await tx.insert(eventSources).values({
              eventId,
              sourceId: source.id,
              documentId,
              provenanceNote: `${input.filename ?? "CSV upload"}; declared source type: ${source.sourceType}; supplied content and URLs are synthetic/unverified and were not fetched.${existingEvents.length ? " A changed content hash was preserved as an additional document revision; event fields were not auto-overwritten." : ""}`,
            });

            if (row.company) {
              const organization = await findOrganizationByMention(tx, row.company);
              if (organization) {
                const existingEdge = await tx.select({ id: eventOrganizations.id }).from(eventOrganizations).where(and(
                  eq(eventOrganizations.eventId, eventId), eq(eventOrganizations.organizationId, organization.id), eq(eventOrganizations.role, "mentioned in CSV row"),
                )).limit(1);
                if (!existingEdge.length) await tx.insert(eventOrganizations).values({
                  eventId, organizationId: organization.id, role: "mentioned in CSV row", verificationStatus: "unverified",
                  evidence: `Unverified user-provided CSV mention: ${row.company}. This is not evidence of a contract, benefit, or financial relationship.`,
                  sourceId: source.id, documentId, isSynthetic: true,
                });
              } else {
                const normalizedMention = normalizeName(row.company);
                const priorCandidate = await tx.select({ id: entityResolutionCandidates.id }).from(entityResolutionCandidates).where(and(
                  eq(entityResolutionCandidates.normalizedMention, normalizedMention), eq(entityResolutionCandidates.documentId, documentId),
                )).limit(1);
                if (!priorCandidate.length) await tx.insert(entityResolutionCandidates).values({
                  entityType: "organization", rawMention: row.company, normalizedMention, matchMethod: "csv_exact_name_not_found", candidateReviewStatus: "unverified", documentId,
                });
              }
            }
            if (row.minister) {
              const minister = await findMinisterByMention(tx, row.minister);
              if (minister) {
                const existingEdge = await tx.select({ id: eventOfficials.id }).from(eventOfficials).where(and(
                  eq(eventOfficials.eventId, eventId), eq(eventOfficials.ministerId, minister.id), eq(eventOfficials.role, "mentioned in CSV row"),
                )).limit(1);
                if (!existingEdge.length) await tx.insert(eventOfficials).values({
                  eventId, ministerId: minister.id, role: "mentioned in CSV row", verificationStatus: "unverified",
                  evidence: `Unverified user-provided CSV mention: ${row.minister}. No personal, political, or financial relationship is inferred.`,
                  sourceId: source.id, documentId, isSynthetic: true,
                });
              } else {
                const normalizedMention = normalizeName(row.minister);
                const priorCandidate = await tx.select({ id: entityResolutionCandidates.id }).from(entityResolutionCandidates).where(and(
                  eq(entityResolutionCandidates.normalizedMention, normalizedMention), eq(entityResolutionCandidates.documentId, documentId),
                )).limit(1);
                if (!priorCandidate.length) await tx.insert(entityResolutionCandidates).values({
                  entityType: "minister", rawMention: row.minister, normalizedMention, matchMethod: "csv_exact_name_not_found", candidateReviewStatus: "unverified", documentId,
                });
              }
            }
            return existingEvents.length ? "revision" as const : "inserted" as const;
          });

          if (result === "duplicate") { skipped++; stats.skipped++; }
          else if (result === "revision") { revisions++; stats.revisions++; }
          else { imported++; stats.imported++; }
        } catch {
          const message = "Row was not stored; verify its fields, source metadata, and linked records.";
          rowErrors.push({ row: rowNumber, message });
          stats.errors.push({ row: rowNumber, message });
        }
      }

      const finishedAt = new Date();
      for (const stats of sourceStats.values()) await db.insert(sourceJobs).values({
        sourceId: stats.source.id,
        jobType: "csv_import",
        status: stats.errors.length ? "failed" : "succeeded",
        startedAt,
        finishedAt,
        rowCount: stats.processed,
        duplicateCount: stats.skipped,
        errorCount: stats.errors.length,
        retryCount: 0,
        quotaLimited: false,
        errorSummary: stats.errors.length ? JSON.stringify(stats.errors.slice(0, 50)) : null,
      });
      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        action: "intelligence.importCsv",
        entityType: "events",
        details: JSON.stringify({ filename: input.filename ?? null, imported, revisions, skipped, errors: rowErrors.length, synthetic: true }),
      });
      return { imported, revisions, skipped, errors: rowErrors.slice(0, 100), synthetic: true, verificationStatus: "unverified" as const };
    }),
  }),
  account: accountRouter,
});
