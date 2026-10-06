import { describe, expect, it } from "vitest";
import { renderDocument } from "@/lib/doc/engine";
import { SEED_COMPANY, SEED_LISTS } from "@/lib/doc/hr-docs.fixtures";
import { seededTemplate } from "@/lib/doc/migration-templates";
import {
  addDaysIso,
  missionDateBounds,
  missionDateIssue,
  missionDocData,
  missionOrderFieldsSchema,
  missionPayload,
  missionPointageHref,
  missionReference,
  omJoin,
  pickMissionContract,
  type MissionContractHint,
  type MissionOrderFields,
} from "@/lib/hr/mission-order";

const sample = {
  matricule: "05/26",
  nom: "TAHRI",
  prenom: "CHAHINAZ",
  affectation: "ADMINISTRATION",
  poste: "Ingenieur",
  dest1: "",
  dest2: "",
  lieuDepart: "Hassi Messaoud",
  dateDepart: "",
  heureDepart: "",
  lieuRetour: "",
  dateRetour: "",
  heureRetour: "",
  motif: "",
  moyen: "Taxi",
  modele: "",
  immat: "",
  kmDepart: "",
  kmRetour: "",
  pieceType: "",
  pieceNum: "",
  pieceDelivre: "2023-08-22",
  pieceFonction: "Ingenieur",
  pieceLieu: "",
  donneur: "Service RH",
  faitA: "HMD",
  dateDoc: "2026-09-11",
};

describe("mission order fields", () => {
  it("accepts the legacy paper fields", () => {
    const parsed = missionOrderFieldsSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(missionPayload(parsed.data, SEED_COMPANY).lieuDepart).toBe("Hassi Messaoud");
    expect(omJoin("Hassi Messaoud", "", "08:00")).toBe("Hassi Messaoud — 08:00");
  });

  it("requires the name and rejects an inverted return", () => {
    expect(missionOrderFieldsSchema.safeParse({ ...sample, nom: " " }).success).toBe(false);
    expect(
      missionOrderFieldsSchema.safeParse({
        ...sample,
        dateDepart: "2026-09-12",
        dateRetour: "2026-09-11",
      }).success,
    ).toBe(false);
  });
});

describe("mission order print", () => {
  const print = (
    fields: MissionOrderFields & { numero?: string | null },
    origin = "",
    company = SEED_COMPANY,
    lists = SEED_LISTS,
  ) =>
    renderDocument(
      seededTemplate("ordre_mission"),
      missionDocData(fields, company, "/hr-letterhead.png", lists),
      origin,
    );

  it("prints the sectioned sheet by default", () => {
    const parsed = missionOrderFieldsSchema.safeParse({ ...sample, codeAffectation: "ADM-01" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const html = print({ ...parsed.data, numero: "000004/26" });
    expect(html).toContain("NF/OM/0004/26");
    expect(html).toContain("I. IDENTIFICATION DU MISSIONNAIRE");
    expect(html).toContain("V. SIGNATURE DU MISSIONNAIRE");
    expect(html).toContain("TAHRI CHAHINAZ");
    expect(html).toContain("ADM-01");
    expect(html).toContain('om-check">✓</span><span>Tous moyens de transport');
    expect(html).toContain('om-check"></span><span>Véhicule de service');
    expect(html).not.toContain("Autres");
    expect(html).toContain("11/09/2026");
    expect(html).toContain("IBM Plex Sans");
    expect(html).toContain('class="om-letterhead"');
    expect(html).not.toContain("Times New Roman");
    expect(html).not.toContain("Fin de mission");
  });

  it("prints « Fin de mission » for an open order", () => {
    const parsed = missionOrderFieldsSchema.safeParse({ ...sample, dateDepart: "2026-09-12", dateRetour: "" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.dateRetour).toBeNull();
    expect(print(parsed.data)).toContain("Fin de mission");
  });

  it("prints the open return set in the company identity", () => {
    const parsed = missionOrderFieldsSchema.parse({ ...sample, dateDepart: "2026-09-12", dateRetour: "" });
    const html = print(parsed, "", { ...SEED_COMPANY, mission_open_return: "Jusqu'à nouvel ordre" });
    expect(html).toContain("Jusqu'à nouvel ordre");
    expect(html).not.toContain("Fin de mission");
  });

  it("ticks the service vehicle box", () => {
    const parsed = missionOrderFieldsSchema.safeParse({ ...sample, moyen: "Véhicule de service" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const html = print(parsed.data);
    expect(html).toContain('om-check">✓</span><span>Véhicule de service');
    expect(html).toContain('om-check"></span><span>Tous moyens de transport');
  });

  it("ticks the service box for any transport mode flagged « vehicle »", () => {
    const lists = {
      ...SEED_LISTS,
      transportModes: [
        ...SEED_LISTS.transportModes,
        { code: "PICKUP", fr: "Pick-up chantier", ar: "شاحنة", vehicle: true, active: true },
      ],
    };
    const html = print(missionOrderFieldsSchema.parse({ ...sample, moyen: "Pick-up chantier" }), "", SEED_COMPANY, lists);
    expect(html).toContain('om-check">✓</span><span>Véhicule de service');
  });

  it("loads its fonts from the app, not Google Fonts", () => {
    const parsed = missionOrderFieldsSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const html = print(parsed.data, "https://erp.test");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).toContain('<base href="https://erp.test/">');
    expect(html).toContain('url("/fonts/om/');
  });

  it("keeps the reference readable for unusual numbers", () => {
    expect(missionReference("000123/26", SEED_COMPANY)).toBe("NF/OM/0123/26");
    expect(missionReference("012345/26", SEED_COMPANY)).toBe("NF/OM/12345/26");
    expect(missionReference("", SEED_COMPANY)).toBe("");
    expect(missionReference("BROUILLON", SEED_COMPANY)).toBe("NF/OM/BROUILLON");
    expect(missionReference("000123/26", { doc_prefix: "" })).toBe("OM/0123/26");
  });

  it("defaults the issuer and place to the company identity", () => {
    const parsed = missionOrderFieldsSchema.safeParse({ ...sample, donneur: "", faitA: "" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const payload = missionPayload(parsed.data, { hr_service: "DRH", city_short: "ORN" });
    expect([payload.donneur, payload.faitA]).toEqual(["DRH", "ORN"]);
  });
});

describe("pickMissionContract", () => {
  const contracts: MissionContractHint[] = [
    {
      employee_id: "e1",
      site_id: "old",
      poste_fr: "Ancien",
      poste_ar: null,
      affectation_principale: true,
      status: "ENDED",
      start_date: "2020-01-01",
    },
    {
      employee_id: "e1",
      site_id: "site-a",
      poste_fr: "Frigoriste",
      poste_ar: null,
      affectation_principale: true,
      status: "ACTIVE",
      start_date: "2024-01-01",
    },
  ];

  it("prefers the open principal contract", () => {
    expect(pickMissionContract(contracts, "e1")?.site_id).toBe("site-a");
  });
});

describe("mission dates", () => {
  const today = "2026-09-24";

  it("accepts a departure today and a later return", () => {
    expect(missionDateIssue({ dateDepart: today, dateRetour: "2026-09-25" }, today)).toBeNull();
  });

  it("requires the departure, the return stays open", () => {
    expect(missionDateIssue({ dateDepart: "", dateRetour: "2026-09-25" }, today)?.field).toBe("dateDepart");
    expect(missionDateIssue({ dateDepart: today, dateRetour: "" }, today)).toBeNull();
  });

  it("closes a saved open order with any return after the departure", () => {
    const open = { dateDepart: "2026-09-01", dateRetour: "" };
    expect(missionDateIssue({ ...open, dateRetour: "2026-09-10" }, today, open)).toBeNull();
    expect(missionDateIssue({ ...open, dateRetour: "2026-09-01" }, today, open)?.field).toBe("dateRetour");
    expect(missionDateBounds({ ...open }, today, open).minRetour).toBe("2026-09-02");
  });

  it("rejects a past departure", () => {
    expect(missionDateIssue({ dateDepart: "2026-09-23", dateRetour: "2026-09-28" }, today)?.field).toBe(
      "dateDepart",
    );
  });

  it("rejects a return that is not after the departure or not in the future", () => {
    expect(missionDateIssue({ dateDepart: "2026-09-26", dateRetour: "2026-09-26" }, today)?.field).toBe(
      "dateRetour",
    );
    expect(missionDateIssue({ dateDepart: "2026-09-26", dateRetour: "2026-09-25" }, today)?.field).toBe(
      "dateRetour",
    );
    expect(missionDateIssue({ dateDepart: today, dateRetour: today }, today)?.field).toBe("dateRetour");
  });

  it("does not re-check unchanged dates of a saved order", () => {
    const saved = { dateDepart: "2026-09-01", dateRetour: "2026-09-05" };
    expect(missionDateIssue(saved, today, saved)).toBeNull();
    expect(missionDateIssue({ ...saved, dateRetour: "2026-09-10" }, today, saved)?.field).toBe("dateRetour");
    expect(missionDateIssue({ ...saved, dateRetour: "2026-09-30" }, today, saved)).toBeNull();
  });

  it("bounds the pickers", () => {
    expect(missionDateBounds({ dateDepart: "", dateRetour: "" }, today)).toEqual({
      minDepart: today,
      minRetour: "2026-09-25",
    });
    expect(missionDateBounds({ dateDepart: "2026-09-30", dateRetour: "" }, today).minRetour).toBe("2026-10-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("links the ordre to the employee's pointage month", () => {
    expect(missionPointageHref({ employeeId: "e1", siteId: "s1", dateDepart: "2026-10-03" })).toBe(
      "/rh/presence?employee=e1&site=s1&mois=2026-10",
    );
  });
});
