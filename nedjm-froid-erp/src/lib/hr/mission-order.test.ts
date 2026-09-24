import { describe, expect, it } from "vitest";
import { buildMissionOrderHtml } from "@/components/rh/mission-order-print";
import {
  addDaysIso,
  missionDateBounds,
  missionDateIssue,
  missionOrderFieldsSchema,
  missionPayload,
  missionPointageHref,
  omJoin,
  pickMissionContract,
  type MissionContractHint,
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
    expect(missionPayload(parsed.data).lieuDepart).toBe("Hassi Messaoud");
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
  it("keeps the legacy bilingual sheet", () => {
    const parsed = missionOrderFieldsSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const html = buildMissionOrderHtml(
      { ...parsed.data, numero: "000004/26" },
      "/hr-letterhead.png",
    );
    expect(html).toContain("ORDRE DE MISSION");
    expect(html).toContain("أمر بمهمة");
    expect(html).toContain("Times New Roman");
    expect(html).toContain("TAHRI CHAHINAZ");
    expect(html).toContain("000004/26");
    expect(html).toContain("05/26");
    expect(html).toContain("Hassi Messaoud");
    expect(html).toContain("Taxi");
    expect(html).toContain("22/08/2023");
    expect(html).toContain("11/09/2026");
    expect(html).toContain("E.U.R.L. NEDJM FROID");
    expect(html).toContain('class="om-letterhead"');
    expect(html).toContain("z-index: 0");
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

  it("requires both dates", () => {
    expect(missionDateIssue({ dateDepart: "", dateRetour: "2026-09-25" }, today)?.field).toBe("dateDepart");
    expect(missionDateIssue({ dateDepart: today, dateRetour: "" }, today)?.field).toBe("dateRetour");
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
