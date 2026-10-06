import { describe, expect, it } from "vitest";
import { renderDocument } from "@/lib/doc/engine";
import { SEED_COMPANY, SEED_LISTS } from "@/lib/doc/hr-docs.fixtures";
import { seededTemplate } from "@/lib/doc/migration-templates";
import {
  leaveDaysLabel,
  leaveOfCorrespondence,
  leaveTitleDocData,
  leaveTitleFieldsSchema,
  leaveTitlePayload,
  leaveTitleReference,
  type LeaveTitleFields,
  type LeaveTitleLeave,
} from "@/lib/hr/leave-title";
import { missionDocData, missionOrderFieldsSchema } from "@/lib/hr/mission-order";

const buildLeaveTitleHtml = (f: LeaveTitleFields, l: LeaveTitleLeave, numero: string, letterhead: string, origin: string) =>
  renderDocument(seededTemplate("titre_conge"), leaveTitleDocData(f, l, numero, SEED_COMPANY, letterhead, SEED_LISTS), origin);

const fields = {
  matricule: "05/26",
  nom: "TAHRI",
  prenom: "Chahinaz",
  affectation: "ADMINISTRATION",
  codeAffectation: "ADM-01",
  poste: "Ingénieur",
  moyen: "Tous moyens de transport",
  modele: "",
  immat: "",
  kmDepart: "",
  kmRetour: "",
  pieceType: "Carte d'identité nationale",
  pieceNum: "109876543",
  donneur: "",
  pieceFonction: "Responsable RH",
  faitA: "",
  dateDoc: "2026-10-02",
};

const leave = leaveOfCorrespondence({
  start_date: "2026-10-05",
  end_date: "2026-10-19",
  payload: { kind: "ANNUAL", days: 15, legend: "CA" },
});

describe("titre de congé", () => {
  it("formats the NF/CNG reference", () => {
    expect(leaveTitleReference("000012/26", SEED_COMPANY)).toBe("NF/CNG/0012/26");
    expect(leaveTitleReference("", SEED_COMPANY)).toBe("");
  });

  it("reads the leave stored on the correspondence", () => {
    expect(leave).toEqual({ kind: "ANNUAL", dateDebut: "2026-10-05", dateFin: "2026-10-19", jours: 15 });
    expect(leaveDaysLabel(1)).toBe("1 jour");
    expect(leaveDaysLabel(2.5)).toBe("2,5 jours");
  });

  it("defaults the issuer and place like the ordre de mission", () => {
    const parsed = leaveTitleFieldsSchema.parse(fields);
    expect(leaveTitlePayload(parsed, SEED_COMPANY)).toMatchObject({ donneur: "Service RH", faitA: "HMD" });
  });

  it("changes only sections II and V of the sectioned sheet", () => {
    const parsed = leaveTitleFieldsSchema.parse(fields);
    const html = buildLeaveTitleHtml(parsed, leave, "000012/26", "/hr-letterhead.png", "https://erp.test");
    expect(html).toContain("TITRE DE CONGÉ");
    expect(html).toContain('<div class="om-title-ar">إجازة</div>');
    expect(html).not.toContain("سند");
    expect(html).toContain("طبيعة الإجازة");
    expect(html).not.toContain("عطلة");
    expect(html).not.toContain("Code affectation");
    expect(html).toContain("NF/CNG/0012/26");
    expect(html).toContain("II. DÉTAIL DU CONGÉ");
    expect(html).toContain("Congé annuel");
    expect(html).toContain("Du 05/10/2026 au 19/10/2026");
    expect(html).toContain("15 jours");
    expect(html).toContain("V. SIGNATURE DE L'INTÉRESSÉ(E)");
    expect(html).toContain("reprendre mon poste le 20/10/2026");
    expect(html).toContain("III. MODE DE TRANSPORT");
    expect(html).toContain("IV. VALIDATION");
    expect(html).toContain('om-check">✓</span><span>Tous moyens de transport');
    expect(html).not.toContain("ADM-01");
    expect(html).not.toContain("ITINÉRAIRE");
    expect(html).not.toContain("MISSIONNAIRE");

    const om = renderDocument(
      seededTemplate("ordre_mission"),
      missionDocData({ ...missionOrderFieldsSchema.parse(fields), numero: null }, SEED_COMPANY, "/hr-letterhead.png", SEED_LISTS),
      "https://erp.test",
    );
    const styles = (doc: string) => doc.slice(doc.indexOf("<style>"), doc.indexOf("</style>"));
    expect(styles(html)).toBe(styles(om));
  });

  it("sets the Arabic title in Noto Naskh and spreads the French title letter by letter", () => {
    const html = buildLeaveTitleHtml(leaveTitleFieldsSchema.parse(fields), leave, "000012/26", "/hr-letterhead.png", "https://erp.test");
    expect(html).toContain('url("/fonts/om/noto-naskh-arabic-700.woff2")');
    expect(html).toContain(
      '<div class="om-title-fr" aria-label="TITRE DE CONGÉ"><span>T</span><span>I</span><span>T</span><span>R</span><span>E</span><span>&nbsp;</span>',
    );
  });
});
