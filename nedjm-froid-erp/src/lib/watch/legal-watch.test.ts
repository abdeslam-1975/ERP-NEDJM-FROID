import { describe, expect, it } from "vitest";
import {
  fileNameFromUrl,
  nextCheckAt,
  parseWatchItems,
  parseWatchRuns,
  parseWatchSources,
  watchDomainSchema,
  watchSourceSchema,
} from "@/lib/watch/legal-watch";

const ID = "6c0f9b0e-2f4a-4f7e-9a3b-1d2c3b4a5e6f";

describe("nextCheckAt", () => {
  it("follows the frequency, and retries the next day after an error", () => {
    const at = "2026-10-01T06:00:00.000Z";
    expect(nextCheckAt({ frequency: "DAILY", last_checked_at: at, last_status: "OK" })?.toISOString()).toBe("2026-10-02T02:00:00.000Z");
    expect(nextCheckAt({ frequency: "WEEKLY", last_checked_at: at, last_status: "OK" })?.toISOString()).toBe("2026-10-08T02:00:00.000Z");
    expect(nextCheckAt({ frequency: "MONTHLY", last_checked_at: at, last_status: "UNCHANGED" })?.toISOString()).toBe("2026-10-28T06:00:00.000Z");
    expect(nextCheckAt({ frequency: "MONTHLY", last_checked_at: at, last_status: "ERROR" })?.toISOString()).toBe("2026-10-02T02:00:00.000Z");
    expect(nextCheckAt({ frequency: "WEEKLY", last_checked_at: null, last_status: null })).toBeNull();
  });
});

describe("schemas", () => {
  it("validates a watched page on https with a domain name", () => {
    const page = { id: null, label: "Journal officiel", frequency: "DAILY", is_active: true };
    expect(watchSourceSchema.safeParse({ ...page, url: "https://www.joradp.dz/" }).success).toBe(true);
    expect(watchSourceSchema.safeParse({ ...page, url: "http://10.0.0.1/" }).success).toBe(false);
    expect(watchSourceSchema.safeParse({ ...page, label: "JO", url: "https://www.joradp.dz/" }).success).toBe(false);
  });

  it("lower-cases a domain and refuses a URL in its place", () => {
    const ok = watchDomainSchema.safeParse({ id: ID, domain: "CNAS.dz", label: "CNAS", is_active: true });
    expect(ok.success && ok.data.domain).toBe("cnas.dz");
    expect(watchDomainSchema.safeParse({ id: null, domain: "https://cnas.dz", label: "CNAS", is_active: true }).success).toBe(false);
  });
});

describe("parsers", () => {
  it("reads stored rows with their joined names", () => {
    const [item] = parseWatchItems([
      {
        id: ID,
        source_id: ID,
        url: "https://www.joradp.dz/a.pdf",
        title: "JO 12",
        first_seen_at: "2026-10-01T06:00:00Z",
        keywords: ["SNMG"],
        relevant: true,
        baseline: false,
        status: "IGNORED",
        document_id: null,
        decided_at: "2026-10-01T08:00:00Z",
        ignore_reason: "Déjà au registre",
        source: { label: "Journal officiel" },
        decider: [{ full_name: "Admin" }],
      },
    ]);
    expect(item).toMatchObject({ source_label: "Journal officiel", decided_by_name: "Admin", status: "IGNORED", keywords: ["SNMG"] });

    const [source] = parseWatchSources([{ id: ID, label: "JO", url: "https://www.joradp.dz/", frequency: "ODD", is_active: true }]);
    expect(source.frequency).toBe("WEEKLY");
    expect(source.last_status).toBeNull();

    const [run] = parseWatchRuns([
      {
        id: ID,
        trigger: "CRON",
        started_at: "2026-10-01T06:00:00Z",
        status: "DONE",
        starter: null,
        checks: [
          { id: "b", source_id: ID, checked_at: "2026-10-01T06:00:09Z", status: "ERROR", error: "HTTP 503", source: { label: "B" } },
          { id: "a", source_id: ID, checked_at: "2026-10-01T06:00:02Z", status: "OK", links_found: 4, source: { label: "A" } },
        ],
      },
    ]);
    expect(run.trigger).toBe("CRON");
    expect(run.started_by_name).toBeNull();
    expect(run.checks.map((c) => c.source_label)).toEqual(["A", "B"]);
  });
});

describe("fileNameFromUrl", () => {
  it("uses the last path segment with the detected extension", () => {
    expect(fileNameFromUrl("https://www.joradp.dz/FTP/jo-francais/2026/F2026012.pdf", "pdf")).toBe("F2026012.pdf");
    expect(fileNameFromUrl("https://www.mfdgi.gov.dz/index.php?option=com&id=12", "pdf")).toBe("index.php.pdf");
    expect(fileNameFromUrl("https://www.joradp.dz/", "png")).toBe("document.png");
  });
});
