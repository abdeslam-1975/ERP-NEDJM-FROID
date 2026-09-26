import { describe, expect, it } from "vitest";
import { hrFileDisplayUrl, hrFileHref, isSafeHrFilePath } from "./hr-file-url";

describe("hr-file-url", () => {
  it("accepts employee/object paths only", () => {
    expect(isSafeHrFilePath("0b1c-22/CNI-9f.pdf")).toBe(true);
    expect(isSafeHrFilePath("0b1c/OM_ARCHIVE-OM-2026-001-ab.html")).toBe(true);
    expect(isSafeHrFilePath("../secret.pdf")).toBe(false);
    expect(isSafeHrFilePath("a/../b.pdf")).toBe(false);
    expect(isSafeHrFilePath("a/b/c.pdf")).toBe(false);
    expect(isSafeHrFilePath("https://x.supabase.co/a.pdf")).toBe(false);
    expect(isSafeHrFilePath(null)).toBe(false);
  });

  it("builds the app route link", () => {
    expect(hrFileHref("emp-1/CNI-x.pdf")).toBe("/api/rh/fichier?p=emp-1/CNI-x.pdf");
  });

  it("prefers the private route over a legacy public URL", () => {
    expect(
      hrFileDisplayUrl("emp-1/CNI-x.pdf", "https://p.supabase.co/storage/v1/object/public/hr-docs/emp-1/CNI-x.pdf"),
    ).toBe("/api/rh/fichier?p=emp-1/CNI-x.pdf");
    expect(hrFileDisplayUrl(null, "https://example.com/doc.pdf")).toBe("https://example.com/doc.pdf");
    expect(hrFileDisplayUrl(null, null)).toBeNull();
  });
});
