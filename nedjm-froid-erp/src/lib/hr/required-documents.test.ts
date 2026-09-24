import { describe, expect, it } from "vitest";
import {
  isDocumentRequiredForSave,
  missingRequiredDocuments,
} from "@/lib/hr/required-documents";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";

function doc(
  code: string,
  extra: Record<string, unknown>,
): CatalogItem {
  return {
    id: code,
    kind: "document_type",
    code,
    label_ar: code,
    label_fr: code,
    extra,
    color_bg: null,
    color_fg: null,
    sort_order: 10,
    is_active: true,
  };
}

describe("required documents", () => {
  it("détecte required_for_save", () => {
    expect(
      isDocumentRequiredForSave(doc("CNI", { upload_slot: true, required_for_save: true })),
    ).toBe(true);
    expect(isDocumentRequiredForSave(doc("CNI", { upload_slot: true }))).toBe(false);
  });

  it("liste les manquants", () => {
    const catalogs = [
      doc("CNI", { upload_slot: true, required_for_save: true }),
      doc("BIRTH", { upload_slot: true, required_for_save: true }),
      doc("PHOTO_ID", { upload_slot: true, required_for_save: false }),
    ];
    const missing = missingRequiredDocuments(catalogs, ["CNI"]);
    expect(missing.map((d) => d.code)).toEqual(["BIRTH"]);
  });
});
