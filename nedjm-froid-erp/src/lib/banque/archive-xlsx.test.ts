import { describe, expect, it } from "vitest";
import {
  extractHyperlinkCell,
  normalizeBankSheetName,
  parseArchiveBankSheet,
  parseArchiveDate,
  parseArchiveMoney,
  parseArchiveSettingsSheet,
} from "@/lib/banque/archive-xlsx";

describe("archive xlsx helpers", () => {
  it("normalizes Workspace sheet names to ERP account names", () => {
    expect(normalizeBankSheetName("BEA  HMD 03501")).toBe("BEA HMD 035/01");
    expect(normalizeBankSheetName("BEA HMD  03502")).toBe("BEA HMD 035/02");
    expect(normalizeBankSheetName("BEA  SETIF 053")).toBe("BEA SETIF 053");
    expect(normalizeBankSheetName("Historique")).toBeNull();
    expect(normalizeBankSheetName("ARCHIVE_BEA 033_04_03_1035")).toBeNull();
  });

  it("parses French money and quoted ISO dates", () => {
    expect(parseArchiveMoney("86 399,13")).toBe(86399.13);
    expect(parseArchiveMoney(5017043.74)).toBe(5017043.74);
    expect(parseArchiveDate('"2026-02-10T00:00:00.000Z"')).toBe("2026-02-10");
    expect(parseArchiveDate(new Date(Date.UTC(2026, 0, 4)))).toBe("2026-01-04");
  });

  it("extracts HYPERLINK formulas used by Drive attachments", () => {
    expect(
      extractHyperlinkCell({
        formula:
          'HYPERLINK("https://drive.google.com/file/d/abc/view?usp=drivesdk", "VIRMENT N° 120/25 🔗")',
        result: "VIRMENT N° 120/25 🔗",
      }),
    ).toEqual({
      label: "VIRMENT N° 120/25",
      url: "https://drive.google.com/file/d/abc/view?usp=drivesdk",
    });
  });

  it("parses a SETIF-like sheet and prefers implied opening when label disagrees", () => {
    const rows: unknown[][] = [
      [],
      [],
      [],
      [],
      [
        "N°",
        "DATE D'OPERATİON",
        "DATE DE VALEUR",
        "AFFECTATION",
        "BON DE COMMANDE",
        "MODE ET PIECE COMPTABLE",
        null,
        "LIBELLE",
        "DE+",
        "CR-",
        "FR,BAN",
        "SOLDE",
      ],
      [
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "SOLDE AU 31/12/2025",
        "86 399,13",
      ],
      [
        1,
        '"2026-02-10T00:00:00.000Z"',
        '"2026-02-10T00:00:00.000Z"',
        "CN°I/2022",
        null,
        "VIRMENT",
        {
          formula:
            'HYPERLINK("https://drive.google.com/file/d/x/view", "FAC N° 070/2025 du 25/11/2025 🔗")',
          result: "FAC N° 070/2025 du 25/11/2025 🔗",
        },
        "VENTE FACTURE",
        1798000,
        0,
        0,
        1798086,
      ],
      [
        7,
        '"2026-08-18T00:00:00.000Z"',
        '"2026-08-18T00:00:00.000Z"',
        "VIREMENT INTERNE",
        null,
        "VIREMENT",
        null,
        "Transfert vers BEA  HMD 035/01",
        0,
        5200000,
        0,
        -33628.25,
      ],
    ];

    const parsed = parseArchiveBankSheet("BEA  SETIF 053", rows);
    expect(parsed).not.toBeNull();
    expect(parsed!.accountName).toBe("BEA SETIF 053");
    expect(parsed!.labeledOpening).toBe(86399.13);
    expect(parsed!.impliedOpening).toBe(86);
    expect(parsed!.openingMismatch).toBe(true);
    expect(parsed!.openingBalance).toBe(86);
    expect(parsed!.lines).toHaveLength(2);
    expect(parsed!.lines[0].fac.url).toContain("drive.google.com");
    expect(parsed!.lines[0].fac.label).toContain("FAC N° 070/2025");
    expect(parsed!.expectedFinal).toBe(Math.round((86 + 1798000 - 5200000) * 100) / 100);
  });

  it("parses Settings lists without Users passwords", () => {
    const settings = parseArchiveSettingsSheet([
      ["BANQUES", null, null, "AFFECTATION", "FOURNISSEUR", "MODE DE PAYEMENT"],
      ["AL BARAKA", "Active", null, "CONTRAT 01", "SARL GACO", "CHEQUE"],
      ["BEA  SETIF 053", "Active", null, "CONTRAT 02", "SOLDE DE DÉPART AU 31/12/2025", "VIRMENT"],
    ]);
    expect(settings.banks.map((b) => b.name)).toEqual(["AL BARAKA", "BEA SETIF 053"]);
    expect(settings.affectations).toEqual(["CONTRAT 01", "CONTRAT 02"]);
    expect(settings.fournisseurs).toEqual(["SARL GACO"]);
    expect(settings.modes).toEqual(["CHEQUE", "VIRMENT"]);
  });
});
