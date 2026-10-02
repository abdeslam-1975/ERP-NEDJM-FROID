import {
  buildSectionedSheetHtml,
  documentReference,
  sheetRow,
  sheetText as text,
} from "@/components/rh/mission-order-print";
import {
  leaveDaysLabel,
  leaveNature,
  leaveReprise,
  type LeaveTitleFields,
  type LeaveTitleLeave,
} from "@/lib/hr/leave-title";
import { formatOmDate } from "@/lib/hr/mission-order";

/** "000005/26" → "NF/CNG/0005/26". */
export function leaveTitleReference(numero: string | null | undefined) {
  return documentReference("CNG", numero);
}

export function buildLeaveTitleHtml(
  fields: LeaveTitleFields,
  leave: LeaveTitleLeave,
  numero: string | null | undefined,
  letterheadUrl: string,
  assetOrigin = "",
) {
  const periode =
    leave.dateDebut && leave.dateFin
      ? `Du ${formatOmDate(leave.dateDebut)} au ${formatOmDate(leave.dateFin)}`
      : "";
  const reprise = formatOmDate(leaveReprise(leave.dateFin));
  return buildSectionedSheetHtml(
    {
      fields,
      titleFr: "TITRE DE CONGÉ",
      titleAr: "إجازة",
      reference: leaveTitleReference(numero),
      documentTitle: `TITRE DE CONGÉ ${numero ?? ""}`.trim(),
      identificationTitle: "I. IDENTIFICATION DE L'INTÉRESSÉ(E)",
      showCodeAffectation: false,
      details: {
        title: "II. DÉTAIL DU CONGÉ",
        rows: [
          sheetRow("Nature du congé :", text(leaveNature(leave.kind).fr), "طبيعة الإجازة :"),
          sheetRow(
            'Période :<span class="om-sub">(du … au …)</span>',
            text(periode),
            'الفترة :<span class="om-sub">(من … إلى …)</span>',
          ),
          sheetRow("Nombre de jours :", text(leaveDaysLabel(leave.jours)), "عدد الأيام :"),
        ],
      },
      signature: {
        title: "V. SIGNATURE DE L'INTÉRESSÉ(E)",
        declaration: reprise
          ? `Je m'engage à reprendre mon poste le ${reprise} à l'issue du présent congé.`
          : "Je m'engage à reprendre mon poste à l'issue du présent congé.",
      },
    },
    letterheadUrl,
    assetOrigin,
  );
}
