import { describe, expect, it } from "vitest";
import {
  buildBanqueStoragePath,
  extractDriveFileId,
  parseBanqueStorageRef,
  resolveBanqueDocumentHref,
  toBanqueStorageRef,
} from "./documents";

describe("banque documents helpers", () => {
  it("extracts Drive file id from archive hyperlinks", () => {
    expect(
      extractDriveFileId(
        "https://drive.google.com/file/d/1j8WCY1hcMgUyCq0V1cm1h9x66TwzDzuk/view?usp=drivesdk",
      ),
    ).toBe("1j8WCY1hcMgUyCq0V1cm1h9x66TwzDzuk");
    expect(extractDriveFileId("https://drive.google.com/open?id=abcXYZ12345")).toBe("abcXYZ12345");
    expect(extractDriveFileId("https://example.com/x")).toBeNull();
  });

  it("round-trips storage refs", () => {
    const path = buildBanqueStoragePath({
      accountId: "acc",
      lineId: "line",
      kind: "mode",
      driveFileId: "drv1",
      ext: "pdf",
    });
    expect(path).toBe("acc/line/mode__drv1.pdf");
    const ref = toBanqueStorageRef(path);
    expect(ref).toBe("storage://banque-docs/acc/line/mode__drv1.pdf");
    expect(parseBanqueStorageRef(ref)).toBe(path);
  });

  it("resolves href to API for imported files", () => {
    const href = resolveBanqueDocumentHref(
      "11111111-1111-1111-1111-111111111111",
      "fac",
      "storage://banque-docs/a/b/fac__x.pdf",
    );
    expect(href).toBe("/api/banque/documents/11111111-1111-1111-1111-111111111111/fac");
  });
});
