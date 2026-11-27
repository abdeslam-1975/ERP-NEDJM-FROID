const OPEN_CONTRACT = new Set(["ACTIVE", "DRAFT", "SUSPENDED"]);

/** A mission or a leave can name only a worker who still has an open work contract. */
export function hasOpenWorkContract(
  contracts: { employee_id: string; status: string }[],
  employeeId: string,
): boolean {
  return contracts.some((contract) => contract.employee_id === employeeId && OPEN_CONTRACT.has(contract.status));
}

export type DatedWorkContract = {
  status: string;
  start_date: string;
  end_date: string | null;
};

/** An open work contract covers the period when its dates contain every requested day. */
export function coversWorkPeriod(contract: DatedWorkContract, start: string, end: string): boolean {
  if (!OPEN_CONTRACT.has(contract.status)) return false;
  const from = contract.start_date.slice(0, 10);
  const to = contract.end_date ? contract.end_date.slice(0, 10) : null;
  if (from > end) return false;
  if (to && to < start) return false;
  return true;
}

export const NO_COVERING_CONTRACT =
  "Aucun contrat de travail ne couvre cette période. · لا يوجد عقد عمل يغطي هذه الفترة.";
