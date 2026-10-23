import { describe, expect, it } from "vitest";
import {
  createPibRssAdapter,
  parsePibRssXml,
  PibRssFetchError,
  PIB_RSS_FEED_URL,
  serializePibCsv,
} from "./pibRss";

const publishedAt = "Tue, 21 Oct 2026 12:23:36 IST";
const validItem = (summary = "PIB RSS source summary") => `<item>
  <title>Press release: public consultation</title>
  <link>https://www.pib.gov.in/PressReleasePage.aspx?PRID=123</link>
  <guid isPermaLink="false">pib-guid-123</guid>
  <pubDate>${publishedAt}</pubDate>
  <description><![CDATA[${summary}]]></description>
</item>`;
const feed = (...items: string[]) => `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Press Information Bureau</title>${items.join("")}</channel></rss>`;
const fetchedAt = new Date("2026-10-23T12:00:00.000Z");
const xmlHeaders = { "content-type": "application/rss+xml; charset=utf-8" };

function csvRow(overrides: Partial<Record<string, string>> = {}) {
  return {
    externalId: "pib-guid-123",
    eventType: "pib_press_release",
    title: "Press release",
    occurredAt: "2026-10-21T06:53:36.000Z",
    category: "",
    summary: "PIB summary",
    location: "",
    company: "",
    minister: "",
    sourceType: "government",
    sourceName: "Press Information Bureau",
    sourceUrl: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=123",
    ...overrides,
  };
}

describe("PIB RSS adapter", () => {
  it("parses documented PIB RSS fields and normalizes India Standard Time explicitly", () => {
    const parsed = parsePibRssXml(feed(validItem()), fetchedAt);
    expect(parsed.itemErrors).toEqual([]);
    expect(parsed.fetchedCount).toBe(1);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      externalId: "pib-guid-123",
      title: "Press release: public consultation",
      url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=123",
      text: "PIB RSS source summary",
      originalPublishedAt: publishedAt,
      retrievedAt: fetchedAt,
      identityKey: "guid:pib-guid-123",
    });
    expect(parsed.items[0]?.publishedAt?.toISOString()).toBe(new Date("2026-10-21T12:23:36+05:30").toISOString());
    expect(parsed.items[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps source identity stable while preserving changed item content as a distinct revision hash", () => {
    const first = parsePibRssXml(feed(validItem("Original source text")), fetchedAt).items[0];
    const revised = parsePibRssXml(feed(validItem("Corrected source text")), fetchedAt).items[0];
    expect(first?.identityKey).toBe(revised?.identityKey);
    expect(first?.contentHash).not.toBe(revised?.contentHash);
  });

  it("produces identical deduplication keys for repeated copies of the same RSS item", () => {
    const parsed = parsePibRssXml(feed(validItem(), validItem()), fetchedAt);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.identityKey).toBe(parsed.items[1]?.identityKey);
    expect(parsed.items[0]?.contentHash).toBe(parsed.items[1]?.contentHash);
  });

  it("leaves a missing provider GUID blank rather than inventing an external ID", () => {
    const noGuid = `<item><title>Release without a provider ID</title><link>https://pib.gov.in/release/1</link><pubDate>${publishedAt}</pubDate></item>`;
    const parsed = parsePibRssXml(feed(noGuid), fetchedAt);
    expect(parsed.items[0]?.externalId).toBeNull();
    expect(parsed.items[0]?.identityKey).toBe("url:https://pib.gov.in/release/1");
  });

  it("records malformed items as item errors instead of making up missing fields", () => {
    const invalid = `<item><title>Missing publication date and non-PIB URL</title><link>https://example.com/article</link></item>`;
    const parsed = parsePibRssXml(feed(validItem(), invalid), fetchedAt);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.itemErrors).toHaveLength(1);
    expect(parsed.itemErrors[0]?.message).toContain("PIB-domain");
    expect(parsed.fetchedCount).toBe(2);
  });

  it("treats an empty channel as an error for job status, not a successful import", () => {
    const parsed = parsePibRssXml(feed(), fetchedAt);
    expect(parsed.items).toEqual([]);
    expect(parsed.fetchedCount).toBe(0);
    expect(parsed.itemErrors[0]?.message).toContain("no feed items");
  });

  it("rejects malformed XML, DTD/entity declarations, missing timezones, and off-domain links", () => {
    expect(() => parsePibRssXml("<rss><channel><item>", fetchedAt)).toThrow("malformed");
    expect(() => parsePibRssXml(`<!DOCTYPE rss [<!ENTITY x "unsafe">]>${feed(validItem())}`, fetchedAt)).toThrow("not accepted");
    const invalidTime = validItem().replace(publishedAt, "Tue, 21 Oct 2026 12:23:36");
    expect(parsePibRssXml(feed(invalidTime), fetchedAt).itemErrors[0]?.message).toContain("explicit timezone");
    const invalidUrl = validItem().replace("https://www.pib.gov.in/PressReleasePage.aspx?PRID=123", "http://www.pib.gov.in/article");
    expect(parsePibRssXml(feed(invalidUrl), fetchedAt).itemErrors[0]?.message).toContain("HTTPS PIB-domain");
  });

  it("uses only the fixed PIB endpoint and retries transient failures at most twice", async () => {
    const requests: string[] = [];
    const waits: number[] = [];
    let call = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push(String(input));
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      call++;
      if (call < 3) return new Response("retry", { status: 503 });
      return new Response(feed(validItem()), { status: 200, headers: xmlHeaders });
    };
    const adapter = createPibRssAdapter(true, { fetchImpl, sleep: async ms => { waits.push(ms); }, now: () => fetchedAt });
    const result = await adapter.fetch({ limit: 10 });
    expect(requests).toEqual([PIB_RSS_FEED_URL, PIB_RSS_FEED_URL, PIB_RSS_FEED_URL]);
    expect(waits).toHaveLength(2);
    expect(result.retryCount).toBe(2);
    expect(result.documents).toHaveLength(1);
  });

  it("bounds 429 retries and exposes rate limiting without returning body details", async () => {
    let calls = 0;
    const adapter = createPibRssAdapter(true, {
      fetchImpl: async () => { calls++; return new Response("private response body", { status: 429, headers: { "retry-after": "0" } }); },
      sleep: async () => undefined,
    });
    let failure: unknown;
    try {
      await adapter.fetch();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PibRssFetchError);
    expect(failure).toMatchObject({ retryCount: 2, quotaLimited: true });
    expect((failure as Error).message).not.toContain("private response body");
    expect(calls).toBe(3);
  });

  it("rejects off-domain redirects without following them", async () => {
    let calls = 0;
    const adapter = createPibRssAdapter(true, {
      fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://example.com/other" } }); },
      sleep: async () => undefined,
    });
    await expect(adapter.fetch()).rejects.toThrow("left the official HTTPS domain");
    expect(calls).toBe(1);
  });

  it("keeps adapter disabled until configured", async () => {
    let calls = 0;
    const adapter = createPibRssAdapter(false, { fetchImpl: async () => { calls++; return new Response(feed(validItem()), { headers: xmlHeaders }); } });
    await expect(adapter.fetch()).rejects.toThrow("not enabled");
    expect(calls).toBe(0);
  });

  it("exports the fixed columns and correctly quotes commas, quotes, and newlines", () => {
    const csv = serializePibCsv([csvRow({ title: 'Release, "quoted"\ncontinued', summary: 'First, line\nSecond "line"' })]);
    expect(csv.split("\r\n")[0]).toBe('"externalId","eventType","title","occurredAt","category","summary","location","company","minister","sourceType","sourceName","sourceUrl"');
    expect(csv).toContain('"Release, ""quoted""\ncontinued"');
    expect(csv).toContain('"First, line\nSecond ""line"""');
    expect(csv).toContain('"government","Press Information Bureau"');
  });
  it("neutralizes spreadsheet formula prefixes, including control-whitespace-prefixed values", () => {
    const csv = serializePibCsv([csvRow({ title: "=1+1", summary: "\t=HYPERLINK(\"https://example.test\")", company: "@SUM(1,2)", minister: "-1+2" })]);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'\t=HYPERLINK(""https://example.test"")"');
    expect(csv).toContain('"\'@SUM(1,2)"');
    expect(csv).toContain('"\'-1+2"');
  });
});
