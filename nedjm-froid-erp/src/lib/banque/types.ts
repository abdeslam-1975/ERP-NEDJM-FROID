export type BanqueAccount = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  opening_balance: number;
  opening_date: string;
  bank_name: string | null;
  account_number: string | null;
  rib: string | null;
  balance: number;
};

export type BanqueLine = {
  id: string;
  account_id: string;
  display_no: number;
  op_date: string;
  value_date: string;
  affectation: string;
  bc_label: string;
  bc_url: string | null;
  mode_label: string;
  mode_url: string | null;
  fac_label: string;
  fac_url: string | null;
  libelle: string;
  debit: number;
  credit: number;
  frais: number;
  solde: number;
  reconciled: boolean;
  line_kind: "MANUAL" | "CAUTION" | "VIREMENT" | "IMPORT";
  transfer_group_id: string | null;
};

export type BanqueLists = {
  affectations: string[];
  fournisseurs: string[];
  modes: string[];
};

export type BanqueDashboard = {
  accounts: BanqueAccount[];
  lines: BanqueLine[];
  lists: BanqueLists;
  totalSolde: number;
  totalSoum: number;
  totalFin: number;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  today: string;
  selectedAccountId: string | null;
};

export type BanqueStatementRow = {
  dateOp: string;
  dateVal?: string;
  libelle: string;
  debit: number;
  credit: number;
};
