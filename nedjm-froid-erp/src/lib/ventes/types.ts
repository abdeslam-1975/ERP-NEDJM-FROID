/** Types + jeu de données mock pour le Desk Ventes (UI only). */

export type VentesDocKind = "P" | "F" | "FP" | "RG" | "SIT";

export type VentesPayStatus = "PAYE" | "PARTIEL" | "IMPAYE";

export type VentesInvoiceLine = {
  id: string;
  lineNo: number;
  itemCode: string;
  designation: string;
  unit: string;
  qty: number;
  unitPriceHt: number;
  posePriceHt: number;
  /** Pour RG : montant de la facture source */
  sourceInvoiceRef: string;
  sourceAmount: number;
};

export type VentesInvoice = {
  id: string;
  number: string;
  issueDate: string; // YYYY-MM-DD
  docKind: VentesDocKind;
  clientId: string;
  contractId: string;
  clientName: string;
  clientAddress: string;
  nif: string;
  article: string;
  rc: string;
  phone: string;
  contractRef: string;
  periodLabel: string;
  establishedBy: string;
  exoAttestationNo: string;
  exoAttestationDate: string;
  expectedBank: string;
  taxRate: number; // 0.19 or 0
  retentionRate: number;
  stampAmount: number;
  lines: VentesInvoiceLine[];
  paidAmount: number;
  paidDate: string;
  paidVia: string;
  status: "BROUILLON" | "EMISE" | "ANNULEE";
  persisted: boolean;
};

export type VentesKindFilter = "TOUS" | VentesDocKind;

export const DOC_KIND_LABELS: Record<VentesDocKind, string> = {
  P: "Prestation / MO",
  F: "Fourniture",
  FP: "Fourniture + Pose",
  RG: "Retenue de garantie",
  SIT: "Situation libre",
};

export function lineHt(line: VentesInvoiceLine, kind: VentesDocKind): number {
  if (kind === "RG") return round2(line.sourceAmount * (line.qty || 0)); // qty reused as rate if needed — see compute
  if (kind === "SIT") return round2(line.unitPriceHt);
  if (kind === "FP") return round2(line.qty * (line.unitPriceHt + line.posePriceHt));
  return round2(line.qty * line.unitPriceHt);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function invoiceTotals(inv: VentesInvoice) {
  let totalHt = 0;
  if (inv.docKind === "RG") {
    totalHt = round2(
      inv.lines.reduce((s, l) => s + l.sourceAmount * (inv.retentionRate || 0), 0),
    );
  } else {
    totalHt = round2(inv.lines.reduce((s, l) => s + lineHt(l, inv.docKind), 0));
  }
  const totalTva = round2(totalHt * (inv.taxRate || 0));
  const base = round2(totalHt + totalTva);
  const retentionAmount =
    inv.docKind === "RG" ? 0 : round2(base * (inv.retentionRate || 0));
  const stamp = round2(inv.stampAmount || 0);
  const netPayable =
    inv.docKind === "RG"
      ? round2(totalHt + stamp)
      : round2(base - retentionAmount + stamp);
  const due = round2(Math.max(0, netPayable - (inv.paidAmount || 0)));
  const payStatus: VentesPayStatus =
    inv.paidAmount <= 0
      ? "IMPAYE"
      : inv.paidAmount + 0.005 >= netPayable
        ? "PAYE"
        : "PARTIEL";
  return { totalHt, totalTva, retentionAmount, stamp, netPayable, due, payStatus };
}

function L(
  partial: Partial<VentesInvoiceLine> & { lineNo: number },
): VentesInvoiceLine {
  return {
    id: partial.id ?? `L-${partial.lineNo}`,
    lineNo: partial.lineNo,
    itemCode: partial.itemCode ?? "",
    designation: partial.designation ?? "",
    unit: partial.unit ?? "",
    qty: partial.qty ?? 0,
    unitPriceHt: partial.unitPriceHt ?? 0,
    posePriceHt: partial.posePriceHt ?? 0,
    sourceInvoiceRef: partial.sourceInvoiceRef ?? "",
    sourceAmount: partial.sourceAmount ?? 0,
  };
}

function mockBase(
  inv: Omit<VentesInvoice, "clientId" | "contractId" | "persisted">,
): VentesInvoice {
  return { clientId: "", contractId: "", persisted: false, ...inv };
}

/** Jeu mock inspiré du Recap Excel (Sonatrach / Nedjm Froid). */
export function buildMockInvoices(): VentesInvoice[] {
  const rows: Array<Omit<VentesInvoice, "clientId" | "contractId" | "persisted">> = [
    {
      id: "v-1",
      number: "1",
      issueDate: "2015-02-01",
      docKind: "P",
      clientName: "Sonatrach DP Haoud Berkaoui",
      clientAddress: "BP N° 26 Haoud Berkaoui - Ouargla",
      nif: "1600137674491000",
      article: "300050215876",
      rc: "0013767B00",
      phone: "029 72 71 71",
      contractRef: "I/2013/HBK/REAL/58",
      periodLabel: "01-01-2015 au 25-01-2015",
      establishedBy: "Touzari Said",
      exoAttestationNo: "",
      exoAttestationDate: "",
      expectedBank: "BEA SETIF",
      taxRate: 0,
      retentionRate: 0.1,
      stampAmount: 0,
      paidAmount: 2_450_000,
      paidDate: "2015-03-15",
      paidVia: "BEA SETIF",
      status: "EMISE",
      lines: [
        L({
          lineNo: 1,
          itemCode: "453",
          designation: "Techniciens supérieurs conditionnement",
          unit: "Jr",
          qty: 186,
          unitPriceHt: 8500,
        }),
        L({
          lineNo: 2,
          itemCode: "454",
          designation: "Manœuvres",
          unit: "Jr",
          qty: 61.5,
          unitPriceHt: 6000,
        }),
      ],
    },
    {
      id: "v-2",
      number: "2",
      issueDate: "2015-02-01",
      docKind: "P",
      clientName: "Sonatrach DP Haoud Berkaoui",
      clientAddress: "BP N° 26 Haoud Berkaoui - Ouargla",
      nif: "1600137674491000",
      article: "300050215876",
      rc: "0013767B00",
      phone: "029 72 71 71",
      contractRef: "I/2012/HBK/REAL/98",
      periodLabel: "01-01-2015 au 25-01-2015",
      establishedBy: "Touzari Said",
      exoAttestationNo: "",
      exoAttestationDate: "",
      expectedBank: "EL BARAKA",
      taxRate: 0,
      retentionRate: 0.1,
      stampAmount: 0,
      paidAmount: 1_120_000,
      paidDate: "2015-03-16",
      paidVia: "EL BARAKA",
      status: "EMISE",
      lines: [
        L({
          lineNo: 1,
          itemCode: "10",
          designation: "Maintenance équipements frigorifiques — situation",
          unit: "Ens",
          qty: 1,
          unitPriceHt: 1_244_444.44,
        }),
      ],
    },
    {
      id: "v-3",
      number: "3",
      issueDate: "2015-02-11",
      docKind: "F",
      clientName: "Sonatrach DP Rhourde Nouss",
      clientAddress: "BP N° 27 Hassi Messaoud - Ouargla",
      nif: "",
      article: "",
      rc: "",
      phone: "029 74 01 10",
      contractRef: "I/29/SH-DP/RNS/REAL/2013",
      periodLabel: "Mois de Février 2015",
      establishedBy: "Touzari Said",
      exoAttestationNo: "",
      exoAttestationDate: "",
      expectedBank: "BEA SETIF",
      taxRate: 0.19,
      retentionRate: 0.1,
      stampAmount: 0,
      paidAmount: 0,
      paidDate: "",
      paidVia: "",
      status: "EMISE",
      lines: [
        L({
          lineNo: 1,
          itemCode: "220",
          designation: "Trousse de jonction BT 92 A2",
          unit: "P",
          qty: 5,
          unitPriceHt: 5500,
        }),
        L({
          lineNo: 2,
          itemCode: "5",
          designation: "Ballast 125 W vapeur de mercure",
          unit: "P",
          qty: 200,
          unitPriceHt: 800,
        }),
        L({
          lineNo: 3,
          itemCode: "36,2",
          designation: "Fréon 134 (kg)",
          unit: "Kg",
          qty: 136,
          unitPriceHt: 1300,
        }),
      ],
    },
    {
      id: "v-4",
      number: "5",
      issueDate: "2015-02-18",
      docKind: "FP",
      clientName: "Sonatrach Division forage — Opérations HMD",
      clientAddress: "Opérations Forage HMD",
      nif: "96716280007044000",
      article: "",
      rc: "00B0013767",
      phone: "029 74 24 24",
      contractRef: "09/SH-AMT-FOR-DDO/12",
      periodLabel: "",
      establishedBy: "Ait Ahcene Hamza",
      exoAttestationNo: "",
      exoAttestationDate: "",
      expectedBank: "",
      taxRate: 0.19,
      retentionRate: 0.05,
      stampAmount: 0,
      paidAmount: 500_000,
      paidDate: "",
      paidVia: "",
      status: "EMISE",
      lines: [
        L({
          lineNo: 1,
          itemCode: "15",
          designation: 'Pompe in line Double DIL 405-22/2.2 "Salmson"',
          unit: "U",
          qty: 2,
          unitPriceHt: 400_000,
          posePriceHt: 50_581.18,
        }),
        L({
          lineNo: 2,
          itemCode: "17",
          designation: 'Pompe in line Double DIL 408-17/2.2 "Salmson"',
          unit: "U",
          qty: 2,
          unitPriceHt: 450_000,
          posePriceHt: 48_363.47,
        }),
      ],
    },
    {
      id: "v-5",
      number: "17",
      issueDate: "2015-04-24",
      docKind: "RG",
      clientName: "Sonatrach DP Rhourde Nouss",
      clientAddress: "BP N° 27 Hassi Messaoud - Ouargla",
      nif: "",
      article: "",
      rc: "",
      phone: "029 74 01 10",
      contractRef: "I/29/SH-DP/RNS/REAL/2013",
      periodLabel: "Réception provisoire",
      establishedBy: "Touzari Said",
      exoAttestationNo: "",
      exoAttestationDate: "",
      expectedBank: "",
      taxRate: 0,
      retentionRate: 0.05,
      stampAmount: 0,
      paidAmount: 0,
      paidDate: "",
      paidVia: "",
      status: "EMISE",
      lines: [
        L({
          lineNo: 1,
          designation: "Restitution RG — Facture F011/13 du 26/03/2014",
          sourceInvoiceRef: "F011/13",
          sourceAmount: 50_000,
        }),
        L({
          lineNo: 2,
          designation: "Restitution RG — Facture F012/13 du 26/03/2014",
          sourceInvoiceRef: "F012/13",
          sourceAmount: 1_125_000,
        }),
        L({
          lineNo: 3,
          designation: "Restitution RG — Facture F013/13 du 26/03/2014",
          sourceInvoiceRef: "F013/13",
          sourceAmount: 134_500,
        }),
      ],
    },
    {
      id: "v-6",
      number: "15",
      issueDate: "2014-03-26",
      docKind: "SIT",
      clientName: "Sonatrach DR Hassi R'Mel",
      clientAddress: "BP 64, Hassi R'mel W LAGHOUAT",
      nif: "1600137674491000",
      article: "3060000048",
      rc: "0013767B00",
      phone: "029 88 36 01",
      contractRef: "I/2010/SH/DP/HR/DL/74",
      periodLabel: "",
      establishedBy: "Touzari Said",
      exoAttestationNo: "",
      exoAttestationDate: "",
      expectedBank: "BEA HMD",
      taxRate: 0,
      retentionRate: 0.1,
      stampAmount: 0,
      paidAmount: 2_645_300,
      paidDate: "2014-05-21",
      paidVia: "BEA HMD",
      status: "EMISE",
      lines: [
        L({
          lineNo: 1,
          designation:
            "Montant HT 1ère situation — attachement N° 002/14 Hassi R'mel",
          unitPriceHt: 2_645_300,
        }),
      ],
    },
    {
      id: "v-7",
      number: "38",
      issueDate: "2014-07-03",
      docKind: "P",
      clientName: "Sonatrach DP Rhourde Nouss",
      clientAddress: "BP N°27 Hassi Messaoud - Ouargla",
      nif: "",
      article: "",
      rc: "",
      phone: "029 74 01 10",
      contractRef: "I/29/SH-DP/RNS/REAL/2013",
      periodLabel: "01/05/2014 au 31/05/2014",
      establishedBy: "Touzari Said",
      exoAttestationNo: "l14195",
      exoAttestationDate: "2014-08-12",
      expectedBank: "BEA SETIF",
      taxRate: 0,
      retentionRate: 0.1,
      stampAmount: 0,
      paidAmount: 0,
      paidDate: "",
      paidVia: "",
      status: "EMISE",
      lines: [
        L({
          lineNo: 1,
          itemCode: "453",
          designation: "Six (06) Techniciens supérieurs en conditionnement",
          unit: "Jr",
          qty: 186,
          unitPriceHt: 8500,
        }),
        L({
          lineNo: 2,
          itemCode: "454",
          designation: "(02) Manœuvres",
          unit: "Jr",
          qty: 61.5,
          unitPriceHt: 6000,
        }),
        L({
          lineNo: 3,
          itemCode: "455",
          designation: "Véhicule utilitaire double cabine",
          unit: "Jr",
          qty: 31,
          unitPriceHt: 4500,
        }),
      ],
    },
  ];
  return rows.map(mockBase);
}

export function emptyLine(lineNo: number): VentesInvoiceLine {
  return L({
    id: `new-${Date.now()}-${lineNo}`,
    lineNo,
    itemCode: "",
    designation: "",
    unit: "",
    qty: 1,
    unitPriceHt: 0,
    posePriceHt: 0,
    sourceInvoiceRef: "",
    sourceAmount: 0,
  });
}

export function emptyInvoice(kind: VentesDocKind, today: string, nextNumber: string): VentesInvoice {
  return {
    id: `draft-${Date.now()}`,
    number: nextNumber,
    issueDate: today,
    docKind: kind,
    clientId: "",
    contractId: "",
    clientName: "",
    clientAddress: "",
    nif: "",
    article: "",
    rc: "",
    phone: "",
    contractRef: "",
    periodLabel: "",
    establishedBy: "",
    exoAttestationNo: "",
    exoAttestationDate: "",
    expectedBank: "",
    taxRate: kind === "P" || kind === "SIT" || kind === "RG" ? 0 : 0.19,
    retentionRate: kind === "RG" ? 0.05 : 0.1,
    stampAmount: 0,
    lines: [emptyLine(1)],
    paidAmount: 0,
    paidDate: "",
    paidVia: "",
    status: "BROUILLON",
    persisted: false,
  };
}
