import type { BuyerBalance, CaisseKind, MoneyRow, MonthlySolde, PeriodSummary } from "@/lib/caisse/soldes";

export type CaisseFlags = {
  isAdmin: boolean;
  isMaster: boolean;
  isUnlimited: boolean;
  canSeeAllJournal: boolean;
  canSeeCaisse: boolean;
  canManage: boolean;
  /** Caisse admin (SUPER_ADMIN / ADMIN_FINANCE), or a user with delegated « Ouverture ». */
  canManageOpenings: boolean;
  /** Caisse admin, or a user with delegated « Listes » (affectation / matricule / unité). */
  canManageLists: boolean;
  userName: string;
};

export type JournalLine = {
  operationId: string;
  lineNo: number;
  sheetName: string;
  type: CaisseKind;
  isFirst: boolean;
  op: number;
  date: string;
  affectation: string;
  itemVal: string;
  matricule: string;
  desc: string;
  qty: number;
  unit: string;
  price: number | null;
  lineTotal: number | null;
  prixBon: number | null;
  depenses: number | null;
  recettes: number | null;
  buyer: string;
  bon: string;
  hasPhoto: boolean;
};

export type CloseStatus = {
  date: string;
  closed: boolean;
  systemSolde: number;
  physicalSolde: number | null;
  ecart: number | null;
  note: string;
  closedBy: string;
  closedAt: string;
  unlockedBy: string;
  unlockedAt: string;
  unlockReason: string;
  canClose: boolean;
  canUnlock: boolean;
};

export type CaisseDashboard = {
  flags: CaisseFlags;
  today: string;
  solde: number;
  totalDepenses: number;
  totalAvances: number;
  totalAlim: number;
  months: string[];
  buyers: string[];
  userList: string[];
  affectations: string[];
  units: string[];
  matricules: string[];
  periodSummary: PeriodSummary;
  monthlySoldes: MonthlySolde[];
  buyerBalances: BuyerBalance[];
  moneyRows: MoneyRow[];
  openings: Record<string, number>;
  openingDate: string;
  rows: JournalLine[];
  closeStatus: CloseStatus | null;
  month: string;
  buyer: string;
  type: string;
};

export type CaisseAdminUser = {
  userId: string | null;
  buyerId: string | null;
  name: string;
  email: string;
  isAdmin: boolean;
  datesLibres: boolean;
  buyForOthers: boolean;
  seeAll: boolean;
  caisseOps: boolean;
  canEdit: boolean;
  manageOpenings: boolean;
  manageLists: boolean;
};

export type CaisseAuditRow = {
  when: string;
  user: string;
  action: string;
  type: string;
  op: string;
  sheet: string;
  detail: string;
  amount: number | null;
};

export type PurchaseItemInput = {
  desc: string;
  itemVal: string;
  unit: string;
  qte: number;
  price: number;
  photoDataUrl?: string | null;
  keepPhoto?: boolean;
};

export type PurchaseInput = {
  operationId?: string;
  date: string;
  affectation: string;
  immatriculation: string;
  buyer: string | null;
  items: PurchaseItemInput[];
};

export type FinanceInput = {
  operationId?: string;
  type: "IN" | "OUT";
  date: string;
  amount: number;
  method?: string;
  ref?: string;
  beneficiary?: string;
};
