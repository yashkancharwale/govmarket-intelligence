import { eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  documents,
  eventOfficials,
  eventOrganizations,
  eventSources,
  events,
  ministers,
  organizationAliases,
  organizations,
  relationships,
  sources,
} from "../drizzle/schema";
import { normalizeName, sha256 } from "../shared/intelligence";

const namespace = "govintel.synthetic.phase1";
const fictionalOfficials = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];
const fictionalCompanies = [
  { name: "Asterion Gridworks Pvt. Ltd.", sector: "Infrastructure", industry: "Grid software", aliases: ["Asterion Gridworks"] },
  { name: "Blue Kestrel Mobility Systems", sector: "Mobility", industry: "Fleet systems", aliases: ["Blue Kestrel"] },
  { name: "Northstar Civic Data Labs", sector: "Technology", industry: "Public digital infrastructure", aliases: ["Northstar Data"] },
  { name: "Sunfield Modular Energy", sector: "Energy", industry: "Renewable generation", aliases: ["Sunfield Energy"] },
];
const fictionalEvents = [
  { key: "001", title: "Synthetic grid modernization consultation announced", eventType: "fictional-policy-announcement", occurredAt: "2026-01-15T10:00:00Z", category: "policy", sector: "Infrastructure", location: "Synthetic jurisdiction", summary: "Fictional policy consultation used to demonstrate evidence and search workflows.", companyNames: ["Asterion Gridworks Pvt. Ltd.", "Northstar Civic Data Labs"], official: "Alpha", officialRole: "fictional announcer", companyRole: "fictional participant" },
  { key: "002", title: "Synthetic fleet demonstration partnership memorandum", eventType: "fictional-memorandum", occurredAt: "2026-02-03T09:00:00Z", category: "partnership", sector: "Mobility", location: "Synthetic jurisdiction", summary: "Fictional memorandum fixture; it does not assert a real partnership or public contract.", companyNames: ["Blue Kestrel Mobility Systems"], official: "Bravo", officialRole: "fictional observer", companyRole: "fictional mention" },
  { key: "003", title: "Synthetic rooftop energy grant consultation", eventType: "fictional-scheme-consultation", occurredAt: "2026-02-19T12:00:00Z", category: "policy", sector: "Energy", location: "Synthetic jurisdiction", summary: "Fictional scheme consultation fixture; no real subsidy or grant is asserted.", companyNames: ["Sunfield Modular Energy"], official: "Charlie", officialRole: "fictional reviewer", companyRole: "fictional mention" },
  { key: "004", title: "Synthetic public-data procurement notice", eventType: "fictional-procurement-notice", occurredAt: "2026-03-04T08:00:00Z", category: "procurement", sector: "Technology", location: "Synthetic jurisdiction", summary: "Fictional procurement fixture; no real tender, award, vendor, or value is asserted.", companyNames: ["Northstar Civic Data Labs"], official: "Delta", officialRole: "fictional observer", companyRole: "fictional mention" },
  { key: "005", title: "Synthetic mobility project inauguration record", eventType: "fictional-project-opening", occurredAt: "2026-03-20T06:30:00Z", category: "investment", sector: "Mobility", location: "Synthetic jurisdiction", summary: "Fictional project-opening fixture; no real investment, inauguration, or market impact is asserted.", companyNames: ["Blue Kestrel Mobility Systems", "Asterion Gridworks Pvt. Ltd."], official: "Echo", officialRole: "fictional attendee", companyRole: "fictional mention" },
  { key: "006", title: "Synthetic clean-energy working group formed", eventType: "fictional-working-group", occurredAt: "2026-04-08T11:15:00Z", category: "other", sector: "Energy", location: "Synthetic jurisdiction", summary: "Fictional working-group fixture; no real government-company relationship is asserted.", companyNames: ["Sunfield Modular Energy", "Northstar Civic Data Labs"], official: "Foxtrot", officialRole: "fictional participant", companyRole: "fictional mention" },
];

/** Explicitly invoked by a maintenance command. It is never imported by server startup. */
export async function seedSyntheticFixtures() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to seed synthetic fixtures");
  let created = 0;

  const existingSource = (await db.select().from(sources).where(eq(sources.sourceKey, namespace)).limit(1))[0];
  let sourceId = existingSource?.id;
  if (!sourceId) {
    sourceId = Number((await db.insert(sources).values({
      sourceKey: namespace,
      name: "GovMarket Synthetic Fixture (not a real source)",
      sourceType: "fixture",
      adapterKey: "synthetic-fixture",
      isSynthetic: true,
      isEnabled: false,
      notes: "Fictional Phase 1 fixture; not an external provider or verified source.",
    }).$returningId())[0]?.id);
    created++;
  }

  const companyByName = new Map<string, any>();
  for (const spec of fictionalCompanies) {
    const normalizedName = normalizeName(spec.name);
    let company = (await db.select().from(organizations).where(eq(organizations.normalizedName, normalizedName)).limit(1))[0];
    if (!company) {
      const id = Number((await db.insert(organizations).values({
        canonicalName: spec.name,
        normalizedName,
        sector: spec.sector,
        industry: spec.industry,
        listed: false,
        isSynthetic: true,
        description: "Fictional fixture organization; not a real company or issuer.",
      }).$returningId())[0]?.id);
      company = (await db.select().from(organizations).where(eq(organizations.id, id)).limit(1))[0];
      created++;
    }
    if (company) companyByName.set(spec.name, company);
    for (const alias of spec.aliases) {
      const normalizedAlias = normalizeName(alias);
      const existingAlias = (await db.select().from(organizationAliases).where(eq(organizationAliases.normalizedAlias, normalizedAlias)).limit(1))[0];
      if (!existingAlias && company) {
        await db.insert(organizationAliases).values({ organizationId: company.id, alias, normalizedAlias });
        created++;
      }
    }
  }

  const officialByCallsign = new Map<string, any>();
  for (const callsign of fictionalOfficials) {
    const name = `Fictional Minister ${callsign}`;
    const normalizedName = normalizeName(name);
    let official = (await db.select().from(ministers).where(eq(ministers.normalizedName, normalizedName)).limit(1))[0];
    if (!official) {
      const id = Number((await db.insert(ministers).values({
        displayName: name,
        normalizedName,
        position: "Fictional portfolio holder",
        ministry: "Fictional Ministry of Public Systems",
        isSynthetic: true,
        profileSummary: "Fictional fixture profile; not a real person, office, portfolio, or ministry.",
      }).$returningId())[0]?.id);
      official = (await db.select().from(ministers).where(eq(ministers.id, id)).limit(1))[0];
      created++;
    }
    if (official) officialByCallsign.set(callsign, official);
  }

  for (const fixture of fictionalEvents) {
    const eventKey = `${namespace}.event.${fixture.key}`;
    let event = (await db.select().from(events).where(eq(events.eventKey, eventKey)).limit(1))[0];
    if (!event) {
      const eventId = Number((await db.insert(events).values({
        eventKey,
        eventType: fixture.eventType,
        title: fixture.title,
        summary: fixture.summary,
        occurredAt: new Date(fixture.occurredAt),
        location: fixture.location,
        category: fixture.category,
        sector: fixture.sector,
        verificationStatus: "machine_matched",
        confidence: "0.7500",
        isSynthetic: true,
      }).$returningId())[0]?.id);
      event = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
      created++;
    }
    if (!event) continue;

    const documentHash = await sha256(`${namespace}.document.${fixture.key}`);
    let document = (await db.select().from(documents).where(eq(documents.contentHash, documentHash)).limit(1))[0];
    if (!document) {
      const documentId = Number((await db.insert(documents).values({
        sourceId,
        contentHash: documentHash,
        title: `Synthetic fixture evidence: ${fixture.title}`,
        isSynthetic: true,
      }).$returningId())[0]?.id);
      document = (await db.select().from(documents).where(eq(documents.id, documentId)).limit(1))[0];
      created++;
    }

    for (const companyName of fixture.companyNames) {
      const company = companyByName.get(companyName);
      if (!company) continue;
      const existingLink = await db.select().from(eventOrganizations).where(eq(eventOrganizations.eventId, event.id));
      if (!existingLink.some((link: any) => link.organizationId === company.id && link.role === fixture.companyRole)) {
        await db.insert(eventOrganizations).values({
          eventId: event.id,
          organizationId: company.id,
          role: fixture.companyRole,
          verificationStatus: "machine_matched",
          evidence: "Synthetic fixture edge only; no real company participation, contract, or financial benefit is asserted.",
          sourceId,
          documentId: document?.id ?? null,
          isSynthetic: true,
        });
        created++;
      }
    }

    const official = officialByCallsign.get(fixture.official);
    if (official) {
      const existingLink = await db.select().from(eventOfficials).where(eq(eventOfficials.eventId, event.id));
      if (!existingLink.some((link: any) => link.ministerId === official.id && link.role === fixture.officialRole)) {
        await db.insert(eventOfficials).values({
          eventId: event.id,
          ministerId: official.id,
          role: fixture.officialRole,
          verificationStatus: "machine_matched",
          evidence: "Synthetic fixture edge only; this fictional role does not describe any real official or relationship.",
          sourceId,
          documentId: document?.id ?? null,
          isSynthetic: true,
        });
        created++;
      }
    }

    if (document) {
      const eventEvidence = await db.select().from(eventSources).where(eq(eventSources.eventId, event.id));
      if (!eventEvidence.some((link: any) => link.sourceId === sourceId && link.documentId === document?.id)) {
        await db.insert(eventSources).values({
          eventId: event.id,
          sourceId,
          documentId: document.id,
          provenanceNote: "Synthetic fixture record only; no real external source or real-world event is asserted.",
        });
        created++;
      }
    }
  }

  const firstCompany = companyByName.get(fictionalCompanies[0].name);
  const secondCompany = companyByName.get(fictionalCompanies[1].name);
  if (firstCompany && secondCompany) {
    const existingEdges = await db.select().from(relationships).where(eq(relationships.fromOrganizationId, firstCompany.id));
    if (!existingEdges.some((edge: any) => edge.toOrganizationId === secondCompany.id && edge.relationshipType === "fictional-collaboration")) {
      await db.insert(relationships).values({
        fromOrganizationId: firstCompany.id,
        toOrganizationId: secondCompany.id,
        relationshipType: "fictional-collaboration",
        strength: "0.5000",
        verificationStatus: "machine_matched",
        evidence: "Synthetic fixture relationship only; no real collaboration or commercial tie is asserted.",
        sourceId,
        isSynthetic: true,
      });
      created++;
    }
  }

  return {
    namespace,
    created,
    synthetic: true,
    officials: fictionalOfficials.length,
    companies: fictionalCompanies.length,
    events: fictionalEvents.length,
    message: "Only missing namespaced synthetic fixture rows were inserted; no rows were overwritten or deleted.",
  };
}
