import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderDocument } from "@/lib/doc/engine";
import { seededTemplate } from "@/lib/doc/migration-templates";
import { ficheDocData } from "@/lib/hr/employee-fiche-doc";
import { DEFAULT_FICHE_SETTINGS, type HrFicheSettings } from "@/lib/hr/fiche-settings";
import { leaveTitleDocData } from "@/lib/hr/leave-title";
import { missionDocData } from "@/lib/hr/mission-order";
import { CONTRACT_DOC_TYPE, contractDocData } from "@/lib/hr/work-contract";
import {
  CONTRACT_FIXTURES,
  FICHE_CATALOGS,
  FICHE_FIELDS,
  FICHE_TODAY,
  FICHE_VALUES,
  FIXTURE_LETTERHEAD,
  FIXTURE_ORIGIN,
  LEAVE_TITLE_FIXTURES,
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

  for (const f of MISSION_FIXTURES) {
    it(f.name, async () => {
      const data = missionDocData(f.fields, SEED_COMPANY, FIXTURE_LETTERHEAD, SEED_LISTS);
      await expect(print("ordre_mission", data)).toMatchFileSnapshot(snap(f.name));
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
      await expect(print(CONTRACT_DOC_TYPE, contractDocData(f.values, SEED_COMPANY))).toMatchFileSnapshot(snap(f.name));
    });
  }
});
