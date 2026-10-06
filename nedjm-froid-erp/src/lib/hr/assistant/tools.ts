import { createClient } from "@/lib/supabase/server";
import type { GeminiFunctionDeclaration } from "@/lib/ai/gemini";
import { listLeaveBalances } from "@/lib/actions/hr-leave";
import { todayIsoAlgiers } from "@/lib/hr/mission-order";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AssistantAccess = {
  canSee: (path: string) => boolean;
  canSeeSalary: boolean;
};

type ToolResult = Record<string, unknown>;

type AssistantTool = {
  /** Page whose access gives the tool; RLS still filters every row read. */
  path: string;
  declaration: GeminiFunctionDeclaration;
  run: (args: Record<string, unknown>, ctx: { supabase: Supabase; access: AssistantAccess }) => Promise<ToolResult>;
};

const PAGE_SIZE = 1000;
const MAX_ROWS = 20_000;

function str(value: unknown, max = 80): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** PostgREST `or` filter syntax: commas, parentheses and wildcards must not reach the filter string. */
function filterSafe(text: string): string {
  return text.replace(/[,()%*\\"]/g, " ").trim();
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

type Page<T> = { data: T[] | null; error: { message: string } | null };

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

type EmployeeLite = {
  id: string;
  matricule: string | null;
  last_name: string | null;
  first_name: string | null;
  last_name_ar: string | null;
  first_name_ar: string | null;
  status: string | null;
  hired_at: string | null;
};

const EMPLOYEE_COLUMNS = "id, matricule, last_name, first_name, last_name_ar, first_name_ar, status, hired_at";

function employeeName(e: Pick<EmployeeLite, "last_name" | "first_name">): string {
  return `${e.last_name ?? ""} ${e.first_name ?? ""}`.trim();
}

function employeeLink(e: Pick<EmployeeLite, "matricule" | "last_name" | "first_name">): string {
  return `/rh/employes?q=${encodeURIComponent(e.matricule || employeeName(e))}`;
}

/** Employees matching a name or matricule (an exact matricule wins). */
async function findEmployees(supabase: Supabase, query: string, limit: number): Promise<EmployeeLite[]> {
  const q = filterSafe(query).slice(0, 60);
  if (q.length < 2) return [];
  const exact = await supabase.from("hr_employees").select(EMPLOYEE_COLUMNS).eq("matricule", q).limit(1);
  if (exact.data?.length) return exact.data as EmployeeLite[];
  let request = supabase.from("hr_employees").select(EMPLOYEE_COLUMNS).order("last_name").limit(limit);
  for (const term of q.split(/\s+/).filter(Boolean).slice(0, 3)) {
    request = request.or(
      ["matricule", "last_name", "first_name", "last_name_ar", "first_name_ar"].map((c) => `${c}.ilike.%${term}%`).join(","),
    );
  }
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeLite[];
}

type ContractLite = {
  employee_id: string;
  contract_type_code: string | null;
  poste_fr: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  affectation_principale: boolean;
  salaire_base_monthly: number | null;
  site_name: string;
};

async function contractsOf(supabase: Supabase, employeeIds: string[] | null): Promise<ContractLite[]> {
  const rows = await fetchAll((from, to) => {
    let q = supabase
      .from("hr_contracts")
      .select(
        "employee_id, contract_type_code, poste_fr, start_date, end_date, status, affectation_principale, salaire_base_monthly, site:ref_sites ( name_fr )",
      )
      .order("start_date", { ascending: false })
      .range(from, to);
    if (employeeIds) q = q.in("employee_id", employeeIds);
    return q;
  });
  return rows.map((r) => ({
    employee_id: r.employee_id,
    contract_type_code: r.contract_type_code,
    poste_fr: r.poste_fr,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
    affectation_principale: r.affectation_principale,
    salaire_base_monthly: r.salaire_base_monthly == null ? null : Number(r.salaire_base_monthly),
    site_name: one(r.site)?.name_fr ?? "",
  }));
}

/** Latest principal contract that is not cancelled or a draft, else the latest one. */
function currentContracts(contracts: ContractLite[]): Map<string, ContractLite> {
  const byEmployee = new Map<string, ContractLite>();
  const rank = (c: ContractLite) => (c.affectation_principale ? 2 : 0) + (c.status === "ACTIVE" ? 1 : 0);
  for (const c of contracts) {
    const prev = byEmployee.get(c.employee_id);
    if (!prev || rank(c) > rank(prev)) byEmployee.set(c.employee_id, c);
  }
  return byEmployee;
}

function contractView(c: ContractLite, access: AssistantAccess) {
  return {
    type: c.contract_type_code,
    chantier: c.site_name,
    poste: c.poste_fr,
    debut: c.start_date,
    fin: c.end_date,
    statut: c.status,
    affectation_principale: c.affectation_principale,
    ...(access.canSeeSalary ? { salaire_base_mensuel: c.salaire_base_monthly } : {}),
  };
}

async function oneEmployee(supabase: Supabase, query: string): Promise<{ employee: EmployeeLite } | { result: ToolResult }> {
  const found = await findEmployees(supabase, query, 6);
  if (!found.length) return { result: { introuvable: true, message: `Aucun employé accessible ne correspond à « ${query} ».` } };
  if (found.length > 1) {
    return {
      result: {
        plusieurs_resultats: found.map((e) => ({ matricule: e.matricule, nom: employeeName(e), lien: employeeLink(e) })),
        message: "Plusieurs employés correspondent : demander lequel.",
      },
    };
  }
  return { employee: found[0] };
}

function monthBounds(month: string): { start: string; end: string; label: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month) ?? /^(\d{4})-(\d{2})$/.exec(todayIsoAlgiers().slice(0, 7))!;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const mm = String(mon).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}`, label: `${year}-${mm}` };
}

/** "3,4,5,9" → "3-5, 9" */
function dayRanges(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(", ");
}

const TOOLS: AssistantTool[] = [
  {
    path: "/rh/employes",
    declaration: {
      name: "rechercher_employes",
      description:
        "Recherche et compte les employés par nom, prénom ou matricule (français ou arabe) et/ou par chantier. Renvoie le total et une liste (matricule, nom, chantier, poste, contrat, lien vers la fiche).",
      parameters: {
        type: "object",
        properties: {
          texte: { type: "string", description: "Nom, prénom ou matricule (facultatif)." },
          chantier: { type: "string", description: "Nom ou partie du nom du chantier (facultatif)." },
          statut: { type: "string", enum: ["ACTIF", "INACTIF", "TOUS"], description: "Par défaut ACTIF." },
          limite: { type: "integer", description: "Nombre de lignes à renvoyer (20 par défaut, 50 max)." },
        },
      },
    },
    async run(args, { supabase, access }) {
      const texte = str(args.texte);
      const chantier = fold(str(args.chantier));
      const statut = str(args.statut) || "ACTIF";
      const limite = int(args.limite, 20, 1, 50);
      let employees = texte
        ? await findEmployees(supabase, texte, 200)
        : await fetchAll<EmployeeLite>((from, to) =>
            supabase.from("hr_employees").select(EMPLOYEE_COLUMNS).order("last_name").range(from, to),
          );
      if (statut === "ACTIF") employees = employees.filter((e) => (e.status ?? "ACTIVE") === "ACTIVE");
      if (statut === "INACTIF") employees = employees.filter((e) => (e.status ?? "ACTIVE") !== "ACTIVE");
      const current = currentContracts(await contractsOf(supabase, texte ? employees.map((e) => e.id) : null));
      if (chantier) employees = employees.filter((e) => fold(current.get(e.id)?.site_name ?? "").includes(chantier));
      return {
        total: employees.length,
        affiches: Math.min(limite, employees.length),
        employes: employees.slice(0, limite).map((e) => {
          const c = current.get(e.id);
          return {
            matricule: e.matricule,
            nom: employeeName(e),
            nom_ar: `${e.last_name_ar ?? ""} ${e.first_name_ar ?? ""}`.trim() || undefined,
            statut: e.status,
            date_entree: e.hired_at,
            contrat: c ? contractView(c, access) : null,
            lien: employeeLink(e),
          };
        }),
      };
    },
  },
  {
    path: "/rh/employes",
    declaration: {
      name: "effectif_par_chantier",
      description: "Nombre d'employés actifs par chantier (selon le contrat d'affectation principale) et par type de contrat. Sert aussi à connaître la liste des chantiers.",
      parameters: { type: "object", properties: {} },
    },
    async run(_args, { supabase }) {
      const employees = await fetchAll<EmployeeLite>((from, to) =>
        supabase.from("hr_employees").select(EMPLOYEE_COLUMNS).range(from, to),
      );
      const active = employees.filter((e) => (e.status ?? "ACTIVE") === "ACTIVE");
      const current = currentContracts(await contractsOf(supabase, null));
      const bySite = new Map<string, { employes: number; par_type: Record<string, number> }>();
      for (const e of active) {
        const c = current.get(e.id);
        const site = c?.site_name || "Sans contrat";
        const entry = bySite.get(site) ?? { employes: 0, par_type: {} };
        entry.employes += 1;
        const type = c?.contract_type_code ?? "—";
        entry.par_type[type] = (entry.par_type[type] ?? 0) + 1;
        bySite.set(site, entry);
      }
      return {
        total_actifs: active.length,
        chantiers: [...bySite]
          .sort((a, b) => b[1].employes - a[1].employes)
          .map(([chantier, v]) => ({ chantier, ...v })),
        lien: "/rh/employes",
      };
    },
  },
  {
    path: "/rh/employes",
    declaration: {
      name: "fiche_employe",
      description:
        "Détail d'un employé : identité, date d'entrée, statut, tous ses contrats (chantier, poste, dates), et selon les droits de l'utilisateur son solde de congé et ses derniers documents RH.",
      parameters: {
        type: "object",
        properties: { employe: { type: "string", description: "Matricule ou nom de l'employé." } },
        required: ["employe"],
      },
    },
    async run(args, { supabase, access }) {
      const found = await oneEmployee(supabase, str(args.employe));
      if ("result" in found) return found.result;
      const e = found.employee;
      const [core, contracts] = await Promise.all([
        supabase.from("hr_employees").select("birth_date, nss, irg_category").eq("id", e.id).maybeSingle(),
        contractsOf(supabase, [e.id]),
      ]);
      const result: ToolResult = {
        matricule: e.matricule,
        nom: employeeName(e),
        nom_ar: `${e.last_name_ar ?? ""} ${e.first_name_ar ?? ""}`.trim() || undefined,
        statut: e.status,
        date_entree: e.hired_at,
        date_naissance: core.data?.birth_date ?? null,
        nss: core.data?.nss ?? null,
        contrats: contracts.map((c) => contractView(c, access)),
        lien: employeeLink(e),
      };
      if (access.canSee("/rh/conges")) {
        const balance = await listLeaveBalances({ employeeId: e.id });
        const b = balance.ok ? balance.data[0] : null;
        if (b) result.solde_conge = { jours_restants: b.balance, acquis: b.accrued, pris: b.taken, ajustements: b.adjustments, en_attente: b.pending };
      }
      if (access.canSee("/rh/documents")) {
        const { data } = await supabase
          .from("hr_correspondences")
          .select("type_code, number, status_code, start_date, end_date")
          .eq("employee_id", e.id)
          .order("created_at", { ascending: false })
          .limit(8);
        result.derniers_documents = (data ?? []).map((d) => ({
          type: d.type_code,
          numero: d.number,
          statut: d.status_code,
          debut: d.start_date,
          fin: d.end_date,
        }));
      }
      return result;
    },
  },
  {
    path: "/rh/employes",
    declaration: {
      name: "contrats_a_echeance",
      description: "Contrats actifs qui se terminent dans les N prochains jours (ou déjà échus et non clôturés), avec employé, chantier et date de fin.",
      parameters: {
        type: "object",
        properties: {
          jours: { type: "integer", description: "Horizon en jours (30 par défaut, 365 max)." },
          chantier: { type: "string", description: "Filtre sur le nom du chantier (facultatif)." },
        },
      },
    },
    async run(args, { supabase, access }) {
      const jours = int(args.jours, 30, 0, 365);
      const chantier = fold(str(args.chantier));
      const today = todayIsoAlgiers();
      const limit = new Date(`${today}T00:00:00Z`);
      limit.setUTCDate(limit.getUTCDate() + jours);
      const horizon = limit.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("hr_contracts")
        .select(
          "contract_type_code, poste_fr, start_date, end_date, status, affectation_principale, salaire_base_monthly, employee_id, site:ref_sites ( name_fr ), employee:hr_employees ( matricule, last_name, first_name )",
        )
        .eq("status", "ACTIVE")
        .not("end_date", "is", null)
        .lte("end_date", horizon)
        .order("end_date")
        .limit(500);
      if (error) throw new Error(error.message);
      const rows = (data ?? [])
        .map((r) => ({ r, site: one(r.site)?.name_fr ?? "", emp: one(r.employee) }))
        .filter((x) => !chantier || fold(x.site).includes(chantier));
      return {
        aujourd_hui: today,
        horizon,
        total: rows.length,
        contrats: rows.slice(0, 60).map(({ r, site, emp }) => ({
          ...contractView(
            {
              ...r,
              site_name: site,
              salaire_base_monthly: r.salaire_base_monthly == null ? null : Number(r.salaire_base_monthly),
            },
            access,
          ),
          deja_echu: (r.end_date ?? "") < today,
          matricule: emp?.matricule ?? "",
          nom: emp ? employeeName(emp) : "",
          lien: emp ? employeeLink(emp) : "/rh/employes",
        })),
      };
    },
  },
  {
    path: "/rh/presence",
    declaration: {
      name: "resume_presence",
      description:
        "Résumé du pointage d'un mois : pour un employé (jours par légende et dates), pour un chantier (totaux par légende et par employé), ou global (totaux par chantier).",
      parameters: {
        type: "object",
        properties: {
          mois: { type: "string", description: "Mois au format AAAA-MM (mois en cours par défaut)." },
          employe: { type: "string", description: "Matricule ou nom (facultatif)." },
          chantier: { type: "string", description: "Nom du chantier (facultatif)." },
        },
      },
    },
    async run(args, { supabase }) {
      const { start, end, label } = monthBounds(str(args.mois, 7));
      const chantier = fold(str(args.chantier));
      let employeeId: string | null = null;
      let employee: EmployeeLite | null = null;
      if (str(args.employe)) {
        const found = await oneEmployee(supabase, str(args.employe));
        if ("result" in found) return found.result;
        employee = found.employee;
        employeeId = employee.id;
      }
      const [rows, legends] = await Promise.all([
        fetchAll((from, to) => {
          let q = supabase
            .from("hr_attendance")
            .select("employee_id, work_date, legend_code, site:ref_sites ( name_fr ), employee:hr_employees ( matricule, last_name, first_name )")
            .gte("work_date", start)
            .lte("work_date", end)
            .order("work_date")
            .range(from, to);
          if (employeeId) q = q.eq("employee_id", employeeId);
          return q;
        }),
        supabase.from("ref_legendes").select("code, label_fr, label_ar"),
      ]);
      const legendLabel = new Map((legends.data ?? []).map((l) => [l.code, `${l.label_fr} · ${l.label_ar}`]));
      const marks = rows
        .map((r) => ({ ...r, site_name: one(r.site)?.name_fr ?? "", emp: one(r.employee) }))
        .filter((r) => !chantier || fold(r.site_name).includes(chantier));
      const legendes = Object.fromEntries([...new Set(marks.map((m) => m.legend_code))].map((c) => [c, legendLabel.get(c) ?? c]));
      const count = (list: typeof marks) =>
        list.reduce<Record<string, number>>((acc, m) => ((acc[m.legend_code] = (acc[m.legend_code] ?? 0) + 1), acc), {});
      if (employee) {
        const byLegend = new Map<string, number[]>();
        for (const m of marks) byLegend.set(m.legend_code, [...(byLegend.get(m.legend_code) ?? []), Number(m.work_date.slice(8, 10))]);
        return {
          mois: label,
          employe: { matricule: employee.matricule, nom: employeeName(employee) },
          chantiers: [...new Set(marks.map((m) => m.site_name))],
          jours_pointes: marks.length,
          par_legende: Object.fromEntries([...byLegend].map(([code, days]) => [code, { jours: days.length, dates: dayRanges(days) }])),
          legendes,
          lien: "/rh/presence",
        };
      }
      if (chantier) {
        const byEmployee = new Map<string, typeof marks>();
        for (const m of marks) byEmployee.set(m.employee_id, [...(byEmployee.get(m.employee_id) ?? []), m]);
        return {
          mois: label,
          chantiers: [...new Set(marks.map((m) => m.site_name))],
          employes_pointes: byEmployee.size,
          totaux_par_legende: count(marks),
          par_employe: [...byEmployee.values()].slice(0, 60).map((list) => ({
            matricule: list[0].emp?.matricule ?? "",
            nom: list[0].emp ? employeeName(list[0].emp) : "",
            ...count(list),
          })),
          legendes,
          lien: "/rh/presence",
        };
      }
      const bySite = new Map<string, typeof marks>();
      for (const m of marks) bySite.set(m.site_name, [...(bySite.get(m.site_name) ?? []), m]);
      return {
        mois: label,
        totaux_par_legende: count(marks),
        par_chantier: [...bySite].map(([site, list]) => ({
          chantier: site,
          employes_pointes: new Set(list.map((m) => m.employee_id)).size,
          ...count(list),
        })),
        legendes,
        lien: "/rh/presence",
      };
    },
  },
  {
    path: "/rh/conges",
    declaration: {
      name: "conges",
      description: "Demandes de congé (type, période, jours, statut), filtrables par employé, statut ou période ; avec le solde de l'employé si un employé est donné.",
      parameters: {
        type: "object",
        properties: {
          employe: { type: "string", description: "Matricule ou nom (facultatif)." },
          statut: { type: "string", enum: ["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"], description: "Facultatif." },
          en_cours_le: { type: "string", description: "Date AAAA-MM-JJ : congés qui couvrent ce jour (facultatif)." },
        },
      },
    },
    async run(args, { supabase }) {
      let employee: EmployeeLite | null = null;
      if (str(args.employe)) {
        const found = await oneEmployee(supabase, str(args.employe));
        if ("result" in found) return found.result;
        employee = found.employee;
      }
      let q = supabase
        .from("hr_leave_requests")
        .select("kind, start_date, end_date, days, status, reason, employee:hr_employees ( matricule, last_name, first_name )")
        .order("start_date", { ascending: false })
        .limit(60);
      if (employee) q = q.eq("employee_id", employee.id);
      const statut = str(args.statut);
      if (statut) q = q.eq("status", statut);
      const day = str(args.en_cours_le, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) q = q.lte("start_date", day).gte("end_date", day);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const result: ToolResult = {
        demandes: (data ?? []).map((r) => {
          const emp = one(r.employee);
          return {
            matricule: emp?.matricule ?? "",
            nom: emp ? employeeName(emp) : "",
            type: r.kind,
            debut: r.start_date,
            fin: r.end_date,
            jours: Number(r.days),
            statut: r.status,
            motif: r.reason,
          };
        }),
        lien: "/rh/conges",
      };
      if (employee) {
        const balance = await listLeaveBalances({ employeeId: employee.id });
        const b = balance.ok ? balance.data[0] : null;
        if (b) result.solde = { jours_restants: b.balance, acquis: b.accrued, pris: b.taken, ajustements: b.adjustments, en_attente: b.pending };
      }
      return result;
    },
  },
  {
    path: "/rh/documents",
    declaration: {
      name: "documents_rh",
      description:
        "Registre des documents RH (OM ordre de mission, LEAVE titre de congé, CRP récupération, ATTEST attestation, CONTRACT contrat, CERTIF certificat de travail, STC solde de tout compte) : numéro, employé, dates, statut.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["OM", "LEAVE", "CRP", "ATTEST", "CONTRACT", "CERTIF", "STC"], description: "Facultatif." },
          employe: { type: "string", description: "Matricule ou nom (facultatif)." },
          numero: { type: "string", description: "Numéro ou partie du numéro (facultatif)." },
          en_cours_le: { type: "string", description: "Date AAAA-MM-JJ : documents dont la période couvre ce jour (facultatif)." },
        },
      },
    },
    async run(args, { supabase }) {
      let employee: EmployeeLite | null = null;
      if (str(args.employe)) {
        const found = await oneEmployee(supabase, str(args.employe));
        if ("result" in found) return found.result;
        employee = found.employee;
      }
      let q = supabase
        .from("hr_correspondences")
        .select("type_code, number, status_code, start_date, end_date, created_at, site:ref_sites ( name_fr ), employee:hr_employees ( matricule, last_name, first_name )")
        .order("created_at", { ascending: false })
        .limit(40);
      if (employee) q = q.eq("employee_id", employee.id);
      const type = str(args.type, 10);
      if (type) q = q.eq("type_code", type);
      const numero = filterSafe(str(args.numero, 40));
      if (numero) q = q.ilike("number", `%${numero}%`);
      const day = str(args.en_cours_le, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) q = q.lte("start_date", day).or(`end_date.is.null,end_date.gte.${day}`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return {
        documents: (data ?? []).map((d) => {
          const emp = one(d.employee);
          return {
            type: d.type_code,
            numero: d.number,
            statut: d.status_code,
            debut: d.start_date,
            fin: d.end_date,
            cree_le: d.created_at?.slice(0, 10),
            chantier: one(d.site)?.name_fr ?? null,
            matricule: emp?.matricule ?? "",
            nom: emp ? employeeName(emp) : "",
          };
        }),
        lien: "/rh/documents",
      };
    },
  },
];

/** Tools the user may call: only those whose page they can open. */
export function assistantTools(access: AssistantAccess): AssistantTool[] {
  return TOOLS.filter((t) => access.canSee(t.path));
}

export async function runAssistantTool(
  tool: AssistantTool,
  args: Record<string, unknown>,
  access: AssistantAccess,
): Promise<ToolResult> {
  try {
    const supabase = await createClient();
    return await tool.run(args ?? {}, { supabase, access });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur";
    return {
      erreur: /permission|42501|denied/i.test(message) ? "Accès refusé par les droits de l'utilisateur." : `Lecture impossible : ${message}`,
    };
  }
}
