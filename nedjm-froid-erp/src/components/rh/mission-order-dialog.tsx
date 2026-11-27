"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrCorrespondenceRow } from "@/lib/actions/hr-documents";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import { hasOpenWorkContract } from "@/lib/hr/work-cycle";
import {
  missionDateIssue,
  missionDocData,
  pickMissionContract,
  showsMissionAffectation,
  showsMissionPoste,
  todayIsoAlgiers,
  type MissionContractHint,
  type PointageCode,
  type MissionDefaults,
} from "@/lib/hr/mission-order";
import { activeOptions, transportModeOptions } from "@/lib/hr/hr-lists";
import { catalogOptions } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";
import { ManualNumberInput } from "@/components/rh/manual-number-input";
import { usePrintKit } from "@/components/doc/use-print-kit";
import { printFromKit } from "@/lib/doc/print-kit";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import { RhAlert, RhField, RhModal, rhInput } from "@/components/rh/rh-ui";
import { DayMonthYearField } from "@/components/rh/day-month-year-field";

export type MissionDraft = {
  id?: string;
  numero: string;
  employee_id: string;
  site_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  affectation: string;
  codeAffectation: string;
  poste: string;
  pointageCode: PointageCode;
  missionAffectation: string;
  missionSiteId: string;
  missionPoste: string;
  dest1: string;
  dest2: string;
  lieuDepart: string;
  dateDepart: string;
  heureDepart: string;
  lieuRetour: string;
  dateRetour: string;
  heureRetour: string;
  motif: string;
  moyen: string;
  modele: string;
  immat: string;
  kmDepart: string;
  kmRetour: string;
  pieceType: string;
  pieceNum: string;
  pieceDelivre: string;
  pieceFonction: string;
  pieceLieu: string;
  donneur: string;
  faitA: string;
  dateDoc: string;
  savedDateDepart?: string;
  savedDateRetour?: string;
};

export function missionDraftDateIssue(draft: MissionDraft, today = todayIsoAlgiers(), allowPast = false) {
  return missionDateIssue(
    draft,
    today,
    draft.id ? { dateDepart: draft.savedDateDepart, dateRetour: draft.savedDateRetour } : null,
    { allowPast },
  );
}

export const emptyMissionDraft = (defaults: MissionDefaults): MissionDraft => ({
  numero: "",
  employee_id: "",
  site_id: "",
  matricule: "",
  nom: "",
  prenom: "",
  affectation: "",
  codeAffectation: "",
  poste: "",
  pointageCode: "MS",
  missionAffectation: "",
  missionSiteId: "",
  missionPoste: "",
  dest1: "",
  dest2: "",
  lieuDepart: defaults.default_departure,
  dateDepart: "",
  heureDepart: "",
  lieuRetour: "",
  dateRetour: "",
  heureRetour: "",
  motif: "",
  moyen: "",
  modele: "",
  immat: "",
  kmDepart: "",
  kmRetour: "",
  pieceType: "",
  pieceNum: "",
  pieceDelivre: "",
  pieceFonction: "",
  pieceLieu: "",
  donneur: defaults.hr_service,
  faitA: defaults.city_short,
  dateDoc: todayIsoAlgiers(),
});

type SiteOpt = { id: string; name_fr: string };

/** Extra destination choice: several workshops, still typed as free text. */
export const MULTI_DESTINATIONS = "multidestinations";

/** Active workshops, then the multi-destination phrase. Free text stays allowed. */
export function destinationChoices(sites: readonly SiteOpt[]) {
  const names = sites.map((site) => site.name_fr).filter(Boolean);
  if (!names.some((name) => name.toLowerCase() === MULTI_DESTINATIONS)) names.push(MULTI_DESTINATIONS);
  return names;
}

export function withCurrent(options: string[], current: string) {
  const values = options.filter(Boolean);
  if (current && !values.includes(current)) values.unshift(current);
  return values;
}

/** Suggestions sit under the field. The browser datalist draws them far from a dialog. */
function DestinationField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  return (
    <RhField label={label}>
      <div className="relative" ref={box}>
        <input
          className={rhInput}
          value={value}
          autoComplete="off"
          name={label}
          onPointerDown={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(false);
          }}
        />
        {open && options.length ? (
          <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-40 overflow-auto rounded-xl border border-border/70 bg-surface shadow-lg">
            {options.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-brand/10"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </RhField>
  );
}

/** Employees matching a matricule, last name or first name (exact, prefix, or contains from 3 letters). */
export function findEmployees(employees: HrEmployeeRow[], needle: string) {
  return employees.filter((emp) => {
    const mat = emp.matricule.toUpperCase();
    const nom = emp.last_name.toUpperCase();
    const prenom = emp.first_name.toUpperCase();
    return (
      mat === needle ||
      mat.startsWith(needle) ||
      nom === needle ||
      nom.startsWith(needle) ||
      (needle.length >= 3 && nom.includes(needle)) ||
      prenom === needle ||
      (needle.length >= 3 && prenom.includes(needle))
    );
  });
}

/** Identity block of an HR document filled from the employee file and the main contract. */
export function employeeIdentity(
  emp: HrEmployeeRow,
  contracts: MissionContractHint[],
  sites: readonly SiteOpt[],
  catalogs: CatalogItem[],
) {
  const contract = pickMissionContract(contracts, emp.id);
  const site = sites.find((row) => row.id === contract?.site_id);
  const type = catalogOptions(catalogs, "id_type").find((item) => item.code === emp.id_type_code);
  return {
    site_id: contract?.site_id ?? "",
    matricule: emp.matricule,
    nom: emp.last_name,
    prenom: emp.first_name,
    affectation: site?.name_fr || emp.fiche_affectation || "",
    poste: contract?.poste_fr || emp.fiche_poste || "",
    pieceType: type?.label_fr || emp.id_type_code || "",
    pieceNum: emp.id_number || "",
    pieceDelivre: (emp.id_issued_on || "").slice(0, 10),
    pieceLieu: emp.id_issued_by || "",
  };
}

export function MissionOrderDialog({
  pending,
  error,
  employees,
  sites,
  catalogs,
  contracts,
  orders,
  value,
  onChange,
  onClose,
  onSubmit,
  onPrint,
  onReset,
  onOpenOrder,
  allowPastDates = false,
  letterheadUrl = null,
}: {
  pending: boolean;
  error: string | null;
  employees: HrEmployeeRow[];
  sites: readonly SiteOpt[];
  catalogs: CatalogItem[];
  contracts: MissionContractHint[];
  orders: HrCorrespondenceRow[];
  value: MissionDraft;
  onChange: (next: MissionDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onPrint: () => void;
  onReset: () => void;
  onOpenOrder: (row: HrCorrespondenceRow) => void;
  /** Super admin may record a mission that already started. */
  allowPastDates?: boolean;
  letterheadUrl?: string | null;
}) {
  const [manualNumero, setManualNumero] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [matches, setMatches] = useState<HrEmployeeRow[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const set = (patch: Partial<MissionDraft>) => onChange({ ...value, ...patch });
  const jobs = catalogOptions(catalogs, "job_title").map((item) => item.label_fr);
  const affectations = sites.map((site) => site.name_fr);
  const destinations = destinationChoices(sites);
  const transportChoices = activeOptions(transportModeOptions(catalogs)).map((m) => m.fr);
  const today = todayIsoAlgiers();
  const dateIssue =
    value.dateDepart || value.dateRetour ? missionDraftDateIssue(value, today, allowPastDates) : null;
  const dateError = (field: "dateDepart" | "dateRetour") =>
    dateIssue?.field === field ? (
      <p className="mt-1 text-[11px] font-medium text-red-600">{dateIssue.message}</p>
    ) : null;
  const dateClass = (field: "dateDepart" | "dateRetour") =>
    dateIssue?.field === field ? "border-red-500 ring-1 ring-red-300" : undefined;
  const { kit, error: kitError } = usePrintKit(["ordre_mission"]);
  const preview = useMemo(() => {
    if (!kit) return null;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return printFromKit(
      kit,
      "ordre_mission",
      missionDocData(value, kit.company, companyLetterheadUrl(letterheadUrl, origin), kit.lists),
      origin,
    );
  }, [kit, letterheadUrl, value]);

  function applyEmployee(emp: HrEmployeeRow) {
    onChange({ ...value, employee_id: emp.id, ...employeeIdentity(emp, contracts, sites, catalogs) });
    setMatches([]);
    setEmployeeQuery("");
    setLocalError(null);
  }

  function searchEmployee() {
    const needle = (employeeQuery || value.matricule || value.nom || value.prenom).trim().toUpperCase();
    if (!needle) {
      setLocalError("Saisissez un matricule, un nom ou un prénom.");
      return;
    }
    const named = findEmployees(employees, needle);
    const found = named.filter((emp) => hasOpenWorkContract(contracts, emp.id));
    if (found.length === 0) {
      setMatches([]);
      setLocalError(
        named.length
          ? "Aucun contrat de travail pour cet employé. · هذا العامل ليس لديه عقد عمل."
          : `Aucun employé trouvé pour « ${needle} ».`,
      );
      return;
    }
    if (found.length === 1) {
      applyEmployee(found[0]);
      return;
    }
    setLocalError(null);
    setMatches(found.slice(0, 40));
  }

  function searchOrder() {
    const needle = orderQuery.trim().toUpperCase();
    if (!needle) {
      setLocalError("Veuillez entrer un critère.");
      return;
    }
    const hit = orders.find((row) => {
      const name = row.employee_name.toUpperCase();
      return (
        row.number.toUpperCase() === needle ||
        row.matricule.toUpperCase() === needle ||
        name === needle ||
        name.includes(needle)
      );
    });
    if (!hit) {
      setLocalError("Aucun ordre trouvé.");
      return;
    }
    setLocalError(null);
    onOpenOrder(hit);
  }

  function stepOrder(dir: -1 | 1) {
    const numbered = orders.filter((row) => row.number);
    const index = numbered.findIndex((row) => row.number === value.numero);
    const next = numbered[index + dir];
    if (next) onOpenOrder(next);
  }

  return (
    <RhModal
      size="xl"
      title="Ordre de Mission"
      subtitle={value.numero || "Nouveau"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => { setManualNumero(false); onReset(); }}>
            NOUVEAU
          </Button>
          <Button variant="secondary" onClick={onPrint}>
            IMPRIMER
          </Button>
          <Button disabled={pending} onClick={onSubmit}>
            {value.id ? "MODIFIER" : "ENREGISTRER"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </>
      }
    >
      {error || localError ? (
        <div className="mb-3">
          <RhAlert tone="danger">{error || localError}</RhAlert>
        </div>
      ) : null}
      <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(17rem,0.9fr)]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <input
            className={`${rhInput} mt-0 min-w-[16rem] flex-1`}
            placeholder="Rechercher par N° OM, matricule ou nom..."
            value={orderQuery}
            onChange={(e) => setOrderQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchOrder();
              }
            }}
          />
          <Button type="button" onClick={searchOrder}>
            RECHERCHER
          </Button>
          {value.numero ? (
            <>
              <Button type="button" variant="secondary" onClick={() => stepOrder(-1)}>
                ❮ Précédent
              </Button>
              <Button type="button" variant="secondary" onClick={() => stepOrder(1)}>
                Suivant ❯
              </Button>
            </>
          ) : null}
        </div>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Identification</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="N° Ordre de Mission">
              <ManualNumberInput
                className={rhInput}
                value={value.numero}
                onChange={(numero) => onChange({ ...value, numero })}
                manual={manualNumero}
                onManual={() => setManualNumero(true)}
                taken={orders.map((order) => order.number)}
                own={value.id ? value.numero : ""}
                readOnly={!!value.id}
              />
            </RhField>
            <RhField label="Rechercher un employé">
              <div className="mt-1.5 flex gap-2">
                <input
                  className={`${rhInput} mt-0`}
                  placeholder="Matricule, nom ou prénom..."
                  value={employeeQuery}
                  onChange={(e) => setEmployeeQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      searchEmployee();
                    }
                  }}
                />
                <Button type="button" onClick={searchEmployee}>
                  Chercher
                </Button>
              </div>
            </RhField>
            <RhField label="Nom">
              <input className={rhInput} value={value.nom} onChange={(e) => set({ nom: e.target.value })} />
            </RhField>
            <RhField label="Prénom">
              <input
                className={rhInput}
                value={value.prenom}
                onChange={(e) => set({ prenom: e.target.value })}
              />
            </RhField>
            <RhField label="Affectation — من العقد">
              <input className={rhInput} value={value.affectation} readOnly />
            </RhField>
            <RhField label="Code affectation — رمز التعيين">
              <input
                className={rhInput}
                value={value.codeAffectation}
                onChange={(e) => set({ codeAffectation: e.target.value })}
              />
            </RhField>
            <RhField label="Fonction / Poste — من العقد">
              <input className={rhInput} value={value.poste} readOnly />
            </RhField>
            <RhField label="Code — الرمز">
              <select
                className={rhInput}
                value={value.pointageCode}
                onChange={(e) => {
                  const pointageCode = e.target.value as PointageCode;
                  set({
                    pointageCode,
                    missionAffectation: showsMissionAffectation(pointageCode) ? value.missionAffectation : "",
                    missionSiteId: showsMissionAffectation(pointageCode) ? value.missionSiteId : "",
                    missionPoste: showsMissionPoste(pointageCode) ? value.missionPoste : "",
                  });
                }}
              >
                <option value="MS">MS — تعيين ومنصب من العقد</option>
                <option value="CH">CH — تغيير التعيين</option>
                <option value="HP">HP — تغيير المنصب</option>
                <option value="CH-HP">CH-HP — التعيين والمنصب</option>
              </select>
            </RhField>
            {showsMissionAffectation(value.pointageCode) ? (
              <RhField label="تعيين المهمة — Chantier">
                <select
                  className={rhInput}
                  value={value.missionAffectation}
                  onChange={(e) => {
                    const name = e.target.value;
                    const site = sites.find((row) => row.name_fr === name);
                    set({ missionAffectation: name, missionSiteId: site?.id ?? "" });
                  }}
                >
                  <option value="" />
                  {affectations.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </RhField>
            ) : null}
            {showsMissionPoste(value.pointageCode) ? (
              <RhField label="منصب المهمة — Poste">
                <select
                  className={rhInput}
                  value={value.missionPoste}
                  onChange={(e) => set({ missionPoste: e.target.value })}
                >
                  <option value="" />
                  {jobs.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </RhField>
            ) : null}
          </div>
          {matches.length > 1 ? (
            <ul className="max-h-40 overflow-auto rounded-xl border border-border/70">
              {matches.map((emp) => (
                <li key={emp.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-brand/10"
                    onClick={() => applyEmployee(emp)}
                  >
                    {emp.last_name} {emp.first_name}
                    <span className="text-foreground/55">
                      {" "}
                      · {emp.matricule}
                      {emp.fiche_poste ? ` — ${emp.fiche_poste}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Déplacement</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DestinationField label="1ère destination" value={value.dest1} options={destinations} onChange={(dest1) => set({ dest1 })} />
            <DestinationField label="2ème destination" value={value.dest2} options={destinations} onChange={(dest2) => set({ dest2 })} />
            <RhField label="Lieu de départ">
              <input className={rhInput} value={value.lieuDepart} onChange={(e) => set({ lieuDepart: e.target.value })} />
            </RhField>
            <RhField label="Date de départ — تاريخ الذهاب">
              <DayMonthYearField
                value={value.dateDepart}
                className={dateClass("dateDepart")}
                onChange={(dateDepart) => set({ dateDepart })}
              />
              {dateError("dateDepart")}
            </RhField>
            <RhField label="Lieu de retour">
              <input className={rhInput} value={value.lieuRetour} onChange={(e) => set({ lieuRetour: e.target.value })} />
            </RhField>
            <RhField label="Date de retour — تاريخ العودة">
              <DayMonthYearField
                value={value.dateRetour}
                className={dateClass("dateRetour")}
                onChange={(dateRetour) => set({ dateRetour })}
              />
              {dateError("dateRetour") ??
                (value.dateRetour ? null : (
                  <p className="mt-1 text-[11px] text-foreground/55">
                    Vide = mission ouverte, imprimée « Fin de mission » · فارغ = مهمة مفتوحة
                  </p>
                ))}
            </RhField>
            <div className="sm:col-span-2 lg:col-span-3">
              <RhField label="Motif du déplacement">
                <textarea
                  className={`${rhInput} h-20 py-2`}
                  rows={2}
                  placeholder="Objet de la mission..."
                  value={value.motif}
                  onChange={(e) => set({ motif: e.target.value })}
                />
              </RhField>
            </div>
          </div>
          <p className="text-[11px] text-foreground/60">
            À l&apos;enregistrement, les jours du départ au retour sont proposés en « MS » dans le
            pointage de l&apos;employé (non validés). · عند الحفظ تُقترح أيام المهمة بالرمز MS في جدول
            الحضور (غير معتمدة).
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Transport</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Moyen de transport">
              <select className={rhInput} value={value.moyen} onChange={(e) => set({ moyen: e.target.value })}>
                <option value="" />
                {withCurrent(transportChoices, value.moyen).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </RhField>
            <RhField label="Véhicule — Modèle">
              <input className={rhInput} value={value.modele} onChange={(e) => set({ modele: e.target.value })} />
            </RhField>
            <RhField label="Immatriculation">
              <input className={rhInput} value={value.immat} onChange={(e) => set({ immat: e.target.value })} />
            </RhField>
            <RhField label="Kilométrage au départ">
              <input type="number" min={0} className={rhInput} value={value.kmDepart} onChange={(e) => set({ kmDepart: e.target.value })} />
            </RhField>
            <RhField label="Kilométrage au retour">
              <input type="number" min={0} className={rhInput} value={value.kmRetour} onChange={(e) => set({ kmRetour: e.target.value })} />
            </RhField>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Pièce d&apos;identité du missionnaire — وثيقة تعريف العامل</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Type de pièce">
              <input className={rhInput} placeholder="Carte d'identité..." value={value.pieceType} onChange={(e) => set({ pieceType: e.target.value })} />
            </RhField>
            <RhField label="N° pièce">
              <input className={rhInput} value={value.pieceNum} onChange={(e) => set({ pieceNum: e.target.value })} />
            </RhField>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Donneur de l&apos;OM & émission — مسلّم الأمر والإصدار</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Donneur de l'OM">
              <input className={rhInput} value={value.donneur} onChange={(e) => set({ donneur: e.target.value })} />
            </RhField>
            <RhField label="Fonction du donneur de l'OM">
              <input className={rhInput} value={value.pieceFonction} onChange={(e) => set({ pieceFonction: e.target.value })} />
            </RhField>
            <RhField label="Fait à">
              <input className={rhInput} value={value.faitA} onChange={(e) => set({ faitA: e.target.value })} />
            </RhField>
            <RhField label="Date du document">
              <DayMonthYearField value={value.dateDoc} onChange={(dateDoc) => set({ dateDoc })} />
            </RhField>
          </div>
        </section>
      </div>
      <aside className="min-[900px]:sticky min-[900px]:top-0">
        <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface-muted/70 shadow-[0_1px_3px_rgba(15,23,42,0.05)] min-[900px]:h-[calc(100dvh-11rem)]">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-surface px-4 py-3">
            <span className="font-display text-base font-semibold text-foreground">Aperçu · معاينة الأمر</span>
            <span className="text-xs text-foreground/60">أثناء الكتابة</span>
          </div>
          <div className="min-h-0 flex-1 p-3">
            {preview?.ok ? (
              <iframe
                title="Aperçu de l'ordre de mission"
                srcDoc={preview.data}
                className="h-full w-full rounded-lg bg-white shadow-md ring-1 ring-black/5"
              />
            ) : (
              <p className="p-6 text-center text-sm text-foreground/60">
                {kitError ?? (preview && !preview.ok ? preview.error : "Chargement de l'aperçu…")}
              </p>
            )}
          </div>
        </div>
      </aside>
      </div>
    </RhModal>
  );
}
