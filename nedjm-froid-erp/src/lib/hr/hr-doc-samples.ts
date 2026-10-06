import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import type { DocData } from "@/lib/doc/engine";
import type { DocTypeId } from "@/lib/doc/registry";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import { ficheDocData } from "@/lib/hr/employee-fiche-doc";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import type { PrintLists } from "@/lib/hr/hr-lists";
import { leaveTitleDocData, type LeaveTitleFields } from "@/lib/hr/leave-title";
import { missionDocData, todayIsoAlgiers, type MissionOrderFields } from "@/lib/hr/mission-order";
import { contractDocData, type ContractPrintValues } from "@/lib/hr/work-contract";

/** Context of the sample documents shown in the template editor. */
export type HrDocSampleContext = {
  company: HrCompanyProfile;
  letterheadUrl: string;
  fiche: { settings: HrFicheSettings; fields: HrEmployeeField[]; catalogs: CatalogItem[] };
};

const SAMPLE_SHEET = {
  matricule: "05/26",
  nom: "TAHRI",
  prenom: "Chahinaz",
  affectation: "ADMINISTRATION",
  codeAffectation: "ADM-01",
  poste: "Ingénieur",
  moyen: "Véhicule de service",
  modele: "Toyota Hilux",
  immat: "12345-120-30",
  kmDepart: "10500",
  kmRetour: "10980",
  pieceType: "Carte d'identité nationale",
  pieceNum: "123456789",
  pieceFonction: "Ingénieur",
};

const SAMPLE_LISTS: PrintLists = {
  leaveKinds: [{ code: "ANNUAL", fr: "Congé annuel", ar: "عطلة سنوية", legend: "CA", annual: true, active: true }],
  transportModes: [
    { code: "TOUS", fr: "Tous moyens de transport", ar: "جميع وسائل النقل", vehicle: false, active: true },
    { code: "SERVICE", fr: "Véhicule de service", ar: "مركبة المصلحة", vehicle: true, active: true },
  ],
};

const SAMPLE_CONTRACT: ContractPrintValues = {
  numero: "2026/014",
  is_cdi: false,
  nom: "بن علي كريم",
  matricule: "042/24",
  birth_date: "1990-05-12",
  birth_place: "وهران",
  father: "محمد",
  mother: "فاطمة",
  marital: "متزوج",
  id_piece: "ب.ت.و",
  id_number: "123456789",
  id_issued_on: "2020-01-15",
  id_issued_by: "دائرة وهران",
  address: "حي 20 أوت، وهران",
  poste: "تقني تبريد",
  start_date: "2026-09-01",
  end_date: "2027-08-31",
  cdd_reason: 5,
  essai: "شهرا واحدا",
  preavis: "ثلاثة أشهر",
  net: "65000",
  recup: "45000",
  retenue: "2166.67",
};

function missionSample(company: HrCompanyProfile): MissionOrderFields & { numero: string } {
  return {
    ...SAMPLE_SHEET,
    numero: "000004/26",
    dest1: "Ouargla",
    dest2: "Touggourt",
    lieuDepart: company.default_departure || null,
    dateDepart: "2026-09-12",
    heureDepart: "08:00",
    lieuRetour: company.default_departure || null,
    dateRetour: "2026-09-15",
    heureRetour: "17:30",
    motif: "Installation d'une chambre froide",
    pieceDelivre: "2023-08-22",
    pieceLieu: "Ouargla",
    donneur: company.hr_service || null,
    faitA: company.city_short || null,
    dateDoc: todayIsoAlgiers(),
  };
}

function ficheSampleValues(fields: HrEmployeeField[]) {
  const values: Record<string, string> = { matricule: "05/26", last_name: "TAHRI", first_name: "Chahinaz" };
  for (const field of fields) values[field.code] ??= field.value_type === "date" ? "1995-04-03" : field.label_fr;
  return values;
}

/** Example data of each HR document, so a template can be edited and previewed without a real employee. */
export function hrDocSample(docType: DocTypeId, ctx: HrDocSampleContext): DocData | null {
  const { company, letterheadUrl } = ctx;
  switch (docType) {
    case "ordre_mission":
      return missionDocData(missionSample(company), company, letterheadUrl, SAMPLE_LISTS);
    case "titre_conge": {
      const fields: LeaveTitleFields = {
        ...SAMPLE_SHEET,
        moyen: "Tous moyens de transport",
        donneur: company.hr_service || null,
        faitA: company.city_short || null,
        dateDoc: todayIsoAlgiers(),
      };
      const leave = { kind: "ANNUAL", dateDebut: "2026-10-10", dateFin: "2026-10-30", jours: 21 };
      return leaveTitleDocData(fields, leave, "000012/26", company, letterheadUrl, SAMPLE_LISTS);
    }
    case "fiche_renseignements": {
      const { settings, fields, catalogs } = ctx.fiche;
      return ficheDocData(ficheSampleValues(fields), catalogs, fields, settings, company, letterheadUrl);
    }
    case "contrat_cdd":
      return contractDocData(SAMPLE_CONTRACT, company);
    default:
      return null;
  }
}
