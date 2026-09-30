import { describe, expect, it } from "vitest";
import {
  appliesOn,
  applicationPeriodLabel,
  citationSchema,
  citationsSchema,
  emptyLegalDocMeta,
  entryPathOf,
  fileSizeLabel,
  groupLegalDocuments,
  legalDocMetaSchema,
  legalDocShortLabel,
  metaOf,
  monthlyCoverage,
  parseLegalDocuments,
  type LegalDocument,
} from "@/lib/rules/legal-documents";

const DOC = "0b7c6f2e-3a1d-4c5e-9f80-1a2b3c4d5e6f";

function doc(over: Partial<LegalDocument> & { id: string }): LegalDocument {
  return {
    root_id: over.id,
    version_no: 1,
    supersedes_id: null,
    doc_type: "LOI_FINANCES",
    title: "Loi de finances 2026",
    reference: "Loi n° 25-01",
    jo_number: null,
    jo_date: null,
    publication_date: null,
    applies_from: "2026-01-01",
    applies_to: null,
    entry_path: "AI_ALLOWED",
    language: "FR",
    origin: "JORADP",
    source_url: null,
    notes: null,
    file_name: "lf2026.pdf",
    mime_type: "application/pdf",
    size_bytes: 1000,
    sha256: "a".repeat(64),
    correction_reason: null,
    status: "ACTIVE",
    withdrawn_reason: null,
    withdrawn_at: null,
    withdrawn_by: null,
    created_by: null,
    created_at: "2026-09-01T10:00:00Z",
    citations: [],
    ...over,
  };
}

describe("entry path by application period", () => {
  it("is manual for texts applying entirely before 2026", () => {
    expect(entryPathOf("2024-01-01", "2025-12-31")).toBe("MANUAL");
  });

  it("allows AI extraction (lot 7) from 2026", () => {
    expect(entryPathOf("2026-01-01", null)).toBe("AI_ALLOWED");
  });

  it("needs D15 when the period straddles 2025 and 2026, or has no end before 2026", () => {
    expect(entryPathOf("2025-06-01", "2026-06-30")).toBe("D15");
    expect(entryPathOf("2020-01-01", null)).toBe("D15");
  });
});

describe("application period", () => {
  it("labels open and closed periods", () => {
    expect(applicationPeriodLabel("2026-01-01", null)).toBe("à partir du 01/01/2026 (fin non fixée)");
    expect(applicationPeriodLabel("2025-01-01", "2025-12-31")).toBe("du 01/01/2025 au 31/12/2025");
  });

  it("checks whether a day falls within the period", () => {
    const d = { applies_from: "2026-01-01", applies_to: "2026-06-30" };
    expect(appliesOn(d, "2026-03-01")).toBe(true);
    expect(appliesOn(d, "2026-07-01")).toBe(false);
    expect(appliesOn(d, "2025-12-01")).toBe(false);
    expect(appliesOn({ applies_from: "2026-01-01", applies_to: null }, "2030-01-01")).toBe(true);
  });

  it("counts documents in force at the register for each month, ignoring superseded and withdrawn versions", () => {
    const docs = [
      doc({ id: "a", applies_from: "2026-03-15", applies_to: "2026-05-31" }),
      doc({ id: "b", applies_from: "2026-01-01", status: "WITHDRAWN" }),
      doc({ id: "c", applies_from: "2025-01-01", applies_to: "2026-01-31", status: "SUPERSEDED" }),
      doc({ id: "d", applies_from: "2026-05-01" }),
    ];
    expect(monthlyCoverage(docs, 2026)).toEqual([0, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("register parsing", () => {
  it("parses rows defensively and derives the entry path when missing", () => {
    const rows = parseLegalDocuments([
      { id: "x", applies_from: "2024-01-01T00:00:00", applies_to: "2025-12-31", size_bytes: "2048", status: "NOPE", citations: [{ proposal_id: "p", page: "3" }, 7] },
      { id: "no-date" },
      null,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "x",
      root_id: "x",
      applies_from: "2024-01-01",
      entry_path: "MANUAL",
      size_bytes: 2048,
      status: "ACTIVE",
      citations: [{ proposal_id: "p", page: 3 }],
    });
    expect(parseLegalDocuments("bad")).toEqual([]);
  });

  it("groups versions under their entry, newest first", () => {
    const groups = groupLegalDocuments([
      doc({ id: "v1", root_id: "r", version_no: 1, status: "SUPERSEDED" }),
      doc({ id: "v2", root_id: "r", version_no: 2 }),
      doc({ id: "o", applies_from: "2027-01-01" }),
    ]);
    expect(groups.map((g) => g.current.id)).toEqual(["o", "v2"]);
    expect(groups[1].history.map((d) => d.id)).toEqual(["v1"]);
  });

  it("formats sizes and short labels", () => {
    expect(fileSizeLabel(500)).toBe("1 Ko");
    expect(fileSizeLabel(3 * 1024 * 1024)).toBe("3,0 Mo");
    expect(legalDocShortLabel({ doc_type: "DECRET_EXECUTIF", reference: "n° 26-10", title: "SNMG", version_no: 2 })).toBe(
      "Décret exécutif · n° 26-10 (v2) — SNMG",
    );
  });
});

describe("citations", () => {
  const ok = { document_id: DOC, article: "art. 104", page: "12", excerpt: "Le taux est fixé à 26 %." };

  it("requires a register document, an article, a page and an excerpt", () => {
    expect(citationSchema.parse(ok)).toMatchObject({ page: 12 });
    expect(citationSchema.safeParse({ ...ok, document_id: "" }).success).toBe(false);
    expect(citationSchema.safeParse({ ...ok, article: " " }).success).toBe(false);
    expect(citationSchema.safeParse({ ...ok, page: 0 }).success).toBe(false);
    expect(citationSchema.safeParse({ ...ok, excerpt: "court" }).success).toBe(false);
  });

  it("requires at least one and at most 20 citations", () => {
    expect(citationsSchema.safeParse([]).success).toBe(false);
    expect(citationsSchema.safeParse([ok]).success).toBe(true);
    expect(citationsSchema.safeParse(Array.from({ length: 21 }, () => ok)).success).toBe(false);
  });
});

describe("document metadata", () => {
  const valid = {
    ...emptyLegalDocMeta(),
    title: "Loi de finances 2026",
    reference: "Loi n° 25-01 du 24/12/2025",
    applies_from: "2026-01-01",
    origin: "JORADP",
  };

  it("accepts a complete entry with an open end", () => {
    expect(legalDocMetaSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses an end before the start and a non-https link", () => {
    expect(legalDocMetaSchema.safeParse({ ...valid, applies_to: "2025-12-31" }).success).toBe(false);
    expect(legalDocMetaSchema.safeParse({ ...valid, source_url: "http://joradp.dz" }).success).toBe(false);
    expect(legalDocMetaSchema.safeParse({ ...valid, source_url: "https://www.joradp.dz/x.pdf" }).success).toBe(true);
  });

  it("requires the start of the application period and the provenance", () => {
    expect(legalDocMetaSchema.safeParse({ ...valid, applies_from: "" }).success).toBe(false);
    expect(legalDocMetaSchema.safeParse({ ...valid, origin: "" }).success).toBe(false);
  });

  it("round-trips a stored entry into the correction form", () => {
    const m = metaOf(doc({ id: "z", doc_type: "UNKNOWN", language: "XX", applies_to: "2026-12-31" }));
    expect(m).toMatchObject({ doc_type: "OTHER", language: "OTHER", applies_to: "2026-12-31", jo_date: "" });
    expect(legalDocMetaSchema.safeParse(m).success).toBe(true);
  });
});
