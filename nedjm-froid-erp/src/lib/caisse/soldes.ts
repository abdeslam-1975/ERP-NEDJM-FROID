export const MONTH_NAMES = [
  "JANVIER",
  "FÉVRIER",
  "MARS",
  "AVRIL",
  "MAI",
  "JUIN",
  "JUILLET",
  "AOÛT",
  "SEPTEMBRE",
  "OCTOBRE",
  "NOVEMBRE",
  "DÉCEMBRE",
] as const;

export const OPENING_BALANCE_DATE = "2025-12-31";

export type CaisseKind = "ACHAT" | "AVANCE" | "ALIMENTATION";

export type MoneyRow = {
  sheetName: string;
  type: CaisseKind;
  isFirst: boolean;
  op: number | string;
  date: string;
  buyer: string;
  depenses: number | null;
  recettes: number | null;
  total: number | null;
};

export type PeriodSummary = {
  label: string;
  month: string;
  ouverture: number;
  achats: number;
  avances: number;
  alim: number;
  mouvement: number;
  soldeFin: number;
};

export type MonthlySolde = {
  month: string;
  achats: number;
  avances: number;
  mouvement: number;
  soldeFin: number;
  ouverture: number;
};

export type BuyerBalance = {
  name: string;
  ouverture: number;
  achats: number;
  avances: number;
  cumulAchats: number;
  cumulAvances: number;
  mouvement: number;
  solde: number;
};

export type SoldesBundle = {
  periodSummary: PeriodSummary;
  monthlySoldes: MonthlySolde[];
  buyerBalances: BuyerBalance[];
};

export function algiersToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function sheetNameFromIso(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-");
  const index = Number(month) - 1;
  if (!year || index < 0 || index > 11) return "—";
  return `${MONTH_NAMES[index]} ${year}`;
}

/** Nom standard du bon : Bon_N102_JANVIER_2026 */
export function formatBonLabel(opNumber: number | string | null | undefined, isoDate: string): string {
  const sheet = sheetNameFromIso(isoDate);
  const monthToken = sheet
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
  const n = Number(opNumber);
  const opPart = Number.isFinite(n) && n > 0 ? `N${Math.trunc(n)}` : "N-";
  return `Bon_${opPart}_${monthToken || "MOIS"}`;
}

export function monthSortKey(name: string): number {
  const year = Number(String(name).match(/(20\d{2})/)?.[1] ?? 0);
  const clean = String(name).toUpperCase().replace(/É/g, "E").replace(/È/g, "E");
  let index = 0;
  for (let i = 0; i < MONTH_NAMES.length; i += 1) {
    const token = MONTH_NAMES[i].toUpperCase().replace(/É/g, "E").replace(/È/g, "E");
    if (clean.startsWith(token)) {
      index = i;
      break;
    }
  }
  return year * 12 + index;
}

/** Inclusive start / exclusive end ISO dates for a sheet name like "JUILLET 2026". */
export function monthBoundsFromSheet(sheet: string): { start: string; endExclusive: string } | null {
  const key = monthSortKey(sheet);
  const year = Math.floor(key / 12);
  const monthIndex = key % 12;
  if (!year || year < 2000) return null;
  const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const endYear = monthIndex === 11 ? year + 1 : year;
  const endMonth = monthIndex === 11 ? 1 : monthIndex + 2;
  const endExclusive = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

export function isCaissePrincipaleName(name: string): boolean {
  const value = String(name || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return value === "CAISSE PRINCIPALE" || value === "CAISSE CENTRALE" || value === "CAISSE";
}

function buyerVisible(buyer: string, viewer: string, seeAll: boolean): boolean {
  if (!buyer || isCaissePrincipaleName(buyer)) return false;
  if (seeAll) return true;
  return buyer === viewer;
}

function achatAmount(row: MoneyRow): number {
  if (row.type !== "ACHAT") return 0;
  if (row.depenses !== null && Number.isFinite(row.depenses)) return row.depenses;
  return Number(row.total) || 0;
}

function avanceAmount(row: MoneyRow): number {
  if (row.type !== "AVANCE") return 0;
  if (row.recettes !== null && Number.isFinite(row.recettes)) return row.recettes;
  return Number(row.total) || 0;
}

function opKey(row: MoneyRow): string {
  return `${row.sheetName}|${row.type}|${row.op}|${row.buyer}|${row.date}`;
}

export function computeSoldesBundle(input: {
  rows: MoneyRow[];
  openings: Record<string, number>;
  monthFilter?: string;
  buyerFilter?: string;
  viewer: string;
  seeAll: boolean;
}): SoldesBundle {
  const monthFilter = input.monthFilter || "TOUS";
  const buyerFilter = input.buyerFilter || "TOUS";
  const openings = input.openings || {};
  let ouverture = 0;
  const buyers: Record<string, BuyerBalance> = {};
  for (const name of Object.keys(openings)) {
    if (!buyerVisible(name, input.viewer, input.seeAll)) continue;
    if (buyerFilter !== "TOUS" && name !== buyerFilter) continue;
    const amount = Number(openings[name]) || 0;
    ouverture += amount;
    buyers[name] = {
      name,
      ouverture: amount,
      achats: 0,
      avances: 0,
      cumulAchats: 0,
      cumulAvances: 0,
      mouvement: 0,
      solde: 0,
    };
  }

  const byMonth: Record<string, { month: string; achats: number; avances: number }> = {};
  let periodAlim = 0;
  const seen: Record<string, boolean> = {};
  for (const row of input.rows || []) {
    if (!row?.isFirst) continue;
    if (row.type !== "ACHAT" && row.type !== "AVANCE" && row.type !== "ALIMENTATION") continue;
    const key = opKey(row);
    if (seen[key]) continue;
    seen[key] = true;
    const inMonth = monthFilter === "TOUS" || row.sheetName === monthFilter;
    const through = monthFilter === "TOUS" || monthSortKey(row.sheetName) <= monthSortKey(monthFilter);
    if (row.type === "ALIMENTATION") {
      if (inMonth) periodAlim += Number(row.recettes ?? row.total ?? 0) || 0;
      continue;
    }
    const buyer = row.buyer ? String(row.buyer).trim() : "";
    if (!buyerVisible(buyer, input.viewer, input.seeAll)) continue;
    if (buyerFilter !== "TOUS" && buyer !== buyerFilter) continue;
    if (!buyers[buyer]) {
      buyers[buyer] = {
        name: buyer,
        ouverture: Number(openings[buyer]) || 0,
        achats: 0,
        avances: 0,
        cumulAchats: 0,
        cumulAvances: 0,
        mouvement: 0,
        solde: 0,
      };
    }
    const achat = achatAmount(row);
    const avance = avanceAmount(row);
    const month = row.sheetName || "";
    if (month) {
      if (!byMonth[month]) byMonth[month] = { month, achats: 0, avances: 0 };
      byMonth[month].achats += achat;
      byMonth[month].avances += avance;
    }
    if (inMonth) {
      buyers[buyer].achats += achat;
      buyers[buyer].avances += avance;
    }
    if (through) {
      buyers[buyer].cumulAchats += achat;
      buyers[buyer].cumulAvances += avance;
    }
  }

  const monthNames = Object.keys(byMonth).sort((a, b) => monthSortKey(a) - monthSortKey(b));
  let running = ouverture;
  const monthlySoldes = monthNames.map((month) => {
    const row = byMonth[month];
    const mouvement = (row.avances || 0) - (row.achats || 0);
    running += mouvement;
    return {
      month,
      achats: row.achats || 0,
      avances: row.avances || 0,
      mouvement,
      soldeFin: running,
      ouverture,
    };
  });

  let periodSummary: PeriodSummary;
  if (monthFilter !== "TOUS") {
    const hit = monthlySoldes.find((row) => row.month === monthFilter);
    const achats = hit ? hit.achats : 0;
    const avances = hit ? hit.avances : 0;
    const cumulAchats = Object.values(buyers).reduce((sum, buyer) => sum + buyer.cumulAchats, 0);
    const cumulAvances = Object.values(buyers).reduce((sum, buyer) => sum + buyer.cumulAvances, 0);
    periodSummary = {
      label: monthFilter,
      month: monthFilter,
      ouverture,
      achats,
      avances,
      alim: periodAlim,
      mouvement: avances - achats,
      soldeFin: hit ? hit.soldeFin : ouverture + cumulAvances - cumulAchats,
    };
  } else {
    const achats = monthlySoldes.reduce((sum, row) => sum + row.achats, 0);
    const avances = monthlySoldes.reduce((sum, row) => sum + row.avances, 0);
    periodSummary = {
      label: "Tous les mois",
      month: "TOUS",
      ouverture,
      achats,
      avances,
      alim: periodAlim,
      mouvement: avances - achats,
      soldeFin: monthlySoldes.length ? monthlySoldes[monthlySoldes.length - 1].soldeFin : ouverture,
    };
  }

  let buyerBalances = Object.values(buyers).map((buyer) => ({
    ...buyer,
    mouvement: buyer.avances - buyer.achats,
    solde: (Number(buyer.ouverture) || 0) + buyer.cumulAvances - buyer.cumulAchats,
  }));
  buyerBalances.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  if (!input.seeAll) buyerBalances = buyerBalances.filter((buyer) => buyer.name === input.viewer);
  if (buyerFilter !== "TOUS") buyerBalances = buyerBalances.filter((buyer) => buyer.name === buyerFilter);

  return { periodSummary, monthlySoldes, buyerBalances };
}

export function recomputePeriodFromDates(input: {
  rows: MoneyRow[];
  openings: Record<string, number>;
  fallbackOuverture: number;
  from: string;
  to: string;
  buyer: string;
  viewer: string;
  seeAll: boolean;
}): PeriodSummary | null {
  if (!input.from || !input.to) return null;
  const buyer = input.buyer || "TOUS";
  let ouverture = 0;
  if (buyer !== "TOUS") ouverture = Number(input.openings[buyer]) || 0;
  else {
    for (const name of Object.keys(input.openings)) {
      if (!buyerVisible(name, input.viewer, input.seeAll)) continue;
      ouverture += Number(input.openings[name]) || 0;
    }
    if (!ouverture) ouverture = input.fallbackOuverture || 0;
  }
  let achats = 0;
  let avances = 0;
  let cumulAchats = 0;
  let cumulAvances = 0;
  const seen: Record<string, boolean> = {};
  for (const row of input.rows) {
    if (!row?.isFirst) continue;
    const key = opKey(row);
    if (seen[key]) continue;
    seen[key] = true;
    if (buyer !== "TOUS" && row.buyer !== buyer) continue;
    if (row.type === "ALIMENTATION") continue;
    if (!input.seeAll && row.buyer !== input.viewer) continue;
    if (!row.date || row.date < "0001" || row.date > "9999") continue;
    const achat = achatAmount(row);
    const avance = avanceAmount(row);
    if (row.date <= input.to) {
      cumulAchats += achat;
      cumulAvances += avance;
    }
    if (row.date >= input.from && row.date <= input.to) {
      achats += achat;
      avances += avance;
    }
  }
  return {
    label: `${formatDateFr(input.from)} → ${formatDateFr(input.to)}`,
    month: "DATES",
    ouverture,
    achats,
    avances,
    alim: 0,
    mouvement: avances - achats,
    soldeFin: ouverture + cumulAvances - cumulAchats,
  };
}

export function formatDa(value: number): string {
  const amount = Number.isFinite(value) && Math.abs(value) >= 1e-9 ? value : 0;
  return amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateFr(iso: string): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return day && month && year ? `${day}/${month}/${year}` : iso;
}
