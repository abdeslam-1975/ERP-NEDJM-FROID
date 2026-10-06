import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import type { DocData } from "@/lib/doc/engine";
import type { DocTypeId } from "@/lib/doc/registry";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import { ficheDocData } from "@/lib/hr/employee-fiche-doc";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import type { PrintLists } from "@/lib/hr/hr-lists";
import { emptyLetterValues, letterDocData, type LetterKind, type LetterLang, type LetterValues } from "@/lib/hr/hr-letters";
import { leaveTitleDocData, type LeaveTitleFields } from "@/lib/hr/leave-title";
import { missionDocData, todayIsoAlgiers, type MissionOrderFields } from "@/lib/hr/mission-order";
import { contractDocData, type ContractPrintValues } from "@/lib/hr/work-contract";

/** Context of the sample documents shown in the template editor. */
export type HrDocSampleContext = {
  company: HrCompanyProfile;
  letterheadUrl: string;
  fiche: { settings: HrFicheSettings; fields: HrEmployeeField[]; catalogs: CatalogItem[] };
};

const SAMPLE_LETTER: Partial<LetterValues> = {
  numero: "000123/26",
  nom_fr: "BENALI Karim",
  nom_ar: "بن علي كريم",
  matricule: "042/24",
  birth_date: "1990-05-12",
  birth_place_fr: "Oran",
  birth_place_ar: "وهران",
  address_fr: "Cité 20 août, Oran",
  address_ar: "حي 20 أوت، وهران",
  poste_fr: "Frigoriste",
  poste_ar: "تقني تبريد",
  start_date: "2024-03-01",
  end_date: "2026-08-31",
  amount: "123456.78",
  lines: [
    { label_fr: "Indemnité compensatrice de congé", label_ar: "تعويض العطلة", amount: 45000 },
    { label_fr: "Salaire du mois", label_ar: "أجر الشهر", amount: 78456.78 },
  ],
  absence_since: "2026-09-20",
  delai: "08",
  ref_numero: "000098/26",
  ref_date: "2026-09-25",
  leave_kind_fr: "Congé annuel",
  leave_kind_ar: "عطلة سنوية",
  leave_from: "2026-10-10",
  leave_to: "2026-10-30",
  leave_days: "21",
  leave_return: "2026-10-31",
  leave_balance: "9",
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

function missionSample(
  company: HrCompanyProfile,
  gabarit: MissionOrderFields["gabarit"],
): MissionOrderFields & { numero: string } {
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
    gabarit,
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
  const letter = /^lettre_([a-z0-9]+)_(fr|ar)$/.exec(docType);
  if (letter) {
    const kind = letter[1].toUpperCase() as LetterKind;
    const lang = letter[2] as LetterLang;
    const values = { ...emptyLetterValues(kind, lang), ...SAMPLE_LETTER, date_doc: todayIsoAlgiers() };
    return letterDocData(values, company, letterheadUrl);
  }
  switch (docType) {
    case "ordre_mission":
      return missionDocData(missionSample(company, null), company, letterheadUrl, SAMPLE_LISTS);
    case "ordre_mission_v1":
      return missionDocData(missionSample(company, "v1"), company, letterheadUrl, SAMPLE_LISTS);
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
    case "contrat_cdi":
      return contractDocData({ ...SAMPLE_CONTRACT, is_cdi: true, end_date: "", numero: "2026/015" }, company);
    default:
      return null;
  }
}
