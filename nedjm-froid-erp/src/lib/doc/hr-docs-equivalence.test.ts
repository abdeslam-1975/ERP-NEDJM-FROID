import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderDocument } from "@/lib/doc/engine";
import { seededTemplate } from "@/lib/doc/migration-templates";
import { ficheDocData } from "@/lib/hr/employee-fiche-doc";
import { DEFAULT_FICHE_SETTINGS, type HrFicheSettings } from "@/lib/hr/fiche-settings";
import { defaultLetterBody, letterDocData, letterDocType } from "@/lib/hr/hr-letters";
import { leaveTitleDocData } from "@/lib/hr/leave-title";
import { missionDocData, missionDocType } from "@/lib/hr/mission-order";
import { contractDocData, contractDocType } from "@/lib/hr/work-contract";
import {
  CONTRACT_FIXTURES,
  FICHE_CATALOGS,
  FICHE_FIELDS,
  FICHE_TODAY,
  FICHE_VALUES,
  FIXTURE_LETTERHEAD,
  FIXTURE_ORIGIN,
  LEAVE_TITLE_FIXTURES,
  LETTER_FIXTURES,
  MISSION_FIXTURES,
  SEED_COMPANY,
  SEED_LISTS,
  normalizeDocHtml,
} from "@/lib/doc/hr-docs.fixtures";

/** The snapshots were taken from the code-built documents these seeded templates replace. */
const snap = (name: string) => `__snapshots__/hr/${name}.html`;
const print = (docType: string, data: Record<string, unknown>) =>
  normalizeDocHtml(renderDocument(seededTemplate(docType), data, FIXTURE_ORIGIN));

describe("HR documents printed from their seeded templates", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FICHE_TODAY));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  for (const f of LETTER_FIXTURES) {
    it(f.name, async () => {
      const docType = letterDocType(f.values.kind, f.values.lang);
      await expect(print(docType, letterDocData(f.values, SEED_COMPANY, FIXTURE_LETTERHEAD))).toMatchFileSnapshot(snap(f.name));
    });
  }
  for (const f of MISSION_FIXTURES) {
    it(f.name, async () => {
      const data = missionDocData(f.fields, SEED_COMPANY, FIXTURE_LETTERHEAD, SEED_LISTS);
      await expect(print(missionDocType(f.fields), data)).toMatchFileSnapshot(snap(f.name));
    });
  }
  for (const f of LEAVE_TITLE_FIXTURES) {
    it(f.name, async () => {
      const data = leaveTitleDocData(f.fields, f.leave, f.numero, SEED_COMPANY, FIXTURE_LETTERHEAD, SEED_LISTS);
      await expect(print("titre_conge", data)).toMatchFileSnapshot(snap(f.name));
    });
  }
  const fiche = (values: Record<string, string>, settings: HrFicheSettings) =>
    print(
      "fiche_renseignements",
      ficheDocData(values, FICHE_CATALOGS, FICHE_FIELDS, settings, SEED_COMPANY, FIXTURE_LETTERHEAD),
    );
  it("fiche", async () => {
    await expect(fiche(FICHE_VALUES, DEFAULT_FICHE_SETTINGS)).toMatchFileSnapshot(snap("fiche"));
  });
  it("fiche-custom", async () => {
    const settings = {
      ...DEFAULT_FICHE_SETTINGS,
      title: "FICHE PERSONNELLE",
      matricule_label: "",
      sig_left_sub: "",
      sig_right_line1: "",
      sections: [
        ...DEFAULT_FICHE_SETTINGS.sections,
        { id: "extra", title: "Divers", title_ar: "", rows: [["email", "phone"], []] },
      ],
    };
    await expect(fiche({ ...FICHE_VALUES, photo_url: "" }, settings)).toMatchFileSnapshot(snap("fiche-custom"));
  });
  for (const f of CONTRACT_FIXTURES) {
    it(f.name, async () => {
      await expect(print(contractDocType(f.values), contractDocData(f.values, SEED_COMPANY))).toMatchFileSnapshot(snap(f.name));
    });
  }
});

describe("letter free text", () => {
  it("starts from the template's standard paragraphs", () => {
    const { values } = LETTER_FIXTURES.find((f) => f.name === "attest-fr-f")!;
    const body = defaultLetterBody(seededTemplate("lettre_attest_fr"), letterDocData(values, SEED_COMPANY, ""));
    expect(body).toEqual([
      'Nous soussignés, E.U.R.L. NEDJM FROID, attestons par la présente que Madame BEN ALI KARIM, née le 12/05/1990 à Oran, est employée au sein de notre entreprise en qualité de Soudeur <qualifié> & "chef", depuis le 01/03/2024 à ce jour.',
      "La présente attestation est délivrée à l'intéressée, sur sa demande, pour servir et valoir ce que de droit.",
    ]);
  });
});
