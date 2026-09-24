import type { CatalogItem } from "@/lib/actions/hr-catalogs";

/** Slot de téléversement fiche (hors auto-générés). */
export function isEmployeeUploadDocument(item: CatalogItem): boolean {
  const extra = item.extra ?? {};
  if (extra.auto_generated === true) return false;
  return extra.upload_slot === true;
}

/** SUPER_ADMIN marque required_for_save dans extra. */
export function isDocumentRequiredForSave(item: CatalogItem): boolean {
  return item.extra?.required_for_save === true;
}

export function listRequiredDocumentTypes(catalogs: CatalogItem[]): CatalogItem[] {
  return catalogs
    .filter(
      (c) =>
        c.kind === "document_type" &&
        c.is_active &&
        isEmployeeUploadDocument(c) &&
        isDocumentRequiredForSave(c),
    )
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function missingRequiredDocuments(
  catalogs: CatalogItem[],
  uploadedDocTypeCodes: Iterable<string>,
): CatalogItem[] {
  const have = new Set(
    [...uploadedDocTypeCodes].map((c) => String(c).trim()).filter(Boolean),
  );
  return listRequiredDocumentTypes(catalogs).filter((d) => !have.has(d.code));
}
