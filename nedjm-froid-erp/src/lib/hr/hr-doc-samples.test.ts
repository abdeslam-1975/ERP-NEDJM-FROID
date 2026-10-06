import { describe, expect, it } from "vitest";
import { renderDocument } from "@/lib/doc/engine";
import { FICHE_CATALOGS, FICHE_FIELDS, SEED_COMPANY } from "@/lib/doc/hr-docs.fixtures";
import { seededTemplate } from "@/lib/doc/migration-templates";
import { HR_DOC_TYPE_IDS } from "@/lib/doc/registry";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";
import { hrDocSample } from "@/lib/hr/hr-doc-samples";

const ctx = {
  company: SEED_COMPANY,
  letterheadUrl: "/hr-letterhead.png",
  fiche: { settings: DEFAULT_FICHE_SETTINGS, fields: FICHE_FIELDS, catalogs: FICHE_CATALOGS },
};

describe("HR document samples", () => {
  it.each(HR_DOC_TYPE_IDS)("%s prints with its sample data", (docType) => {
    const data = hrDocSample(docType, ctx);
    expect(data).not.toBeNull();
    const html = renderDocument(seededTemplate(docType), data!);
    expect(html.length).toBeGreaterThan(1000);
    expect(html).not.toContain("data-field");
  });
});
