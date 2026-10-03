"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrCorrespondenceRow } from "@/lib/actions/hr-documents";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import { LEAVE_KINDS, calendarDays } from "@/lib/hr/leave";
import {
  LEAVE_TITLE_FIELD_KEYS,
  leaveDaysLabel,
  leaveNature,
  leaveReprise,
  type LeaveTitleFieldKey,
  type LeaveTitleLeave,
} from "@/lib/hr/leave-title";
import { OM_DONNEUR, OM_FAIT_A, OM_MOYENS, formatOmDate, todayIsoAlgiers, type MissionContractHint } from "@/lib/hr/mission-order";
import { leaveTitleReference } from "@/components/rh/leave-title-print";
import { employeeIdentity, findEmployees, withCurrent } from "@/components/rh/mission-order-dialog";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhModal, catalogOptions, rhInput } from "@/components/rh/rh-ui";

export type LeaveTitleDraft = Record<LeaveTitleFieldKey, string> & {
  /** Empty for a new title: saving records and approves the leave request, which numbers the title. */
  id: string;
  numero: string;
  employee_id: string;
  status_code: string;
  leave: LeaveTitleLeave;
  /** Days typed for a new title (empty = calendar days). */
  daysText: string;
  /** The print fields were already saved once (« MODIFIER » instead of « ENREGISTRER »). */
  saved: boolean;
};

export function emptyLeaveTitleDraft(): LeaveTitleDraft {
  const fields = Object.fromEntries(LEAVE_TITLE_FIELD_KEYS.map((key) => [key, ""])) as Record<LeaveTitleFieldKey, string>;
  return {
    ...fields,
    donneur: OM_DONNEUR,
    faitA: OM_FAIT_A,
    dateDoc: todayIsoAlgiers(),
    id: "",
    numero: "",
    employee_id: "",
    status_code: "",
    leave: { kind: "ANNUAL", dateDebut: "", dateFin: "", jours: 0 },
    daysText: "",
    saved: false,
  };
}

type SiteOpt = { id: string; name_fr: string };

export function LeaveTitleDialog({
  pending,
  error,
  employees,
  sites,
  catalogs,
  contracts,
  titles,
  value,
  onChange,
  onClose,
  onSubmit,
  onPrint,
  onReset,
  onOpenTitle,
}: {
  pending: boolean;
  error: string | null;
  employees: HrEmployeeRow[];
  sites: readonly SiteOpt[];
  catalogs: CatalogItem[];
  contracts: MissionContractHint[];
  titles: HrCorrespondenceRow[];
  value: LeaveTitleDraft;
  onChange: (next: LeaveTitleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onPrint: () => void;
  onReset: () => void;
  onOpenTitle: (row: HrCorrespondenceRow) => void;
}) {
  const [titleQuery, setTitleQuery] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [matches, setMatches] = useState<HrEmployeeRow[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const set = (patch: Partial<LeaveTitleDraft>) => onChange({ ...value, ...patch });
  const input = (key: LeaveTitleFieldKey, props: { type?: string; placeholder?: string } = {}) => (
    <input
      className={rhInput}
      type={props.type}
      min={props.type === "number" ? 0 : undefined}
      placeholder={props.placeholder}
      value={value[key]}
      onChange={(e) => set({ [key]: e.target.value } as Partial<LeaveTitleDraft>)}
    />
  );
  const readOnly = (text: string) => <input className={rhInput} value={text || "—"} readOnly />;
  const isNew = !value.id;
  const jobs = catalogOptions(catalogs, "job_title").map((item) => item.label_fr);
  const affectations = sites.map((site) => site.name_fr);
  const nature = leaveNature(value.leave.kind);
  const { dateDebut, dateFin } = value.leave;
  const reprise = formatOmDate(leaveReprise(dateFin));
  const cancelled = value.status_code === "CANCELLED";
  const reference = leaveTitleReference(value.numero) || value.numero;
  const calendar = dateDebut && dateFin && dateFin >= dateDebut ? calendarDays(dateDebut, dateFin) : 0;

  function setLeave(patch: Partial<LeaveTitleLeave>) {
    const leave = { ...value.leave, ...patch };
    const days = leave.dateDebut && leave.dateFin && leave.dateFin >= leave.dateDebut ? calendarDays(leave.dateDebut, leave.dateFin) : 0;
    onChange({ ...value, leave: { ...leave, jours: Number(value.daysText.replace(",", ".")) || days } });
  }

  function applyEmployee(emp: HrEmployeeRow) {
    const identity = employeeIdentity(emp, contracts, sites, catalogs);
    onChange({
      ...value,
      employee_id: emp.id,
      matricule: identity.matricule,
      nom: identity.nom,
      prenom: identity.prenom,
      affectation: identity.affectation,
      poste: identity.poste,
      pieceType: identity.pieceType,
      pieceNum: identity.pieceNum,
    });
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
    const found = findEmployees(employees, needle);
    if (found.length === 0) {
      setMatches([]);
      setLocalError(`Aucun employé trouvé pour « ${needle} ».`);
      return;
    }
    if (found.length === 1) {
      applyEmployee(found[0]);
      return;
    }
    setLocalError(null);
    setMatches(found.slice(0, 40));
  }

  function searchTitle() {
    const needle = titleQuery.trim().toUpperCase();
    if (!needle) {
      setLocalError("Veuillez entrer un critère.");
      return;
    }
    const hit = titles.find((row) => {
      const name = `${row.last_name} ${row.first_name}`.trim().toUpperCase() || row.employee_name.toUpperCase();
      return (
        row.number.toUpperCase() === needle ||
        leaveTitleReference(row.number).toUpperCase() === needle ||
        row.matricule.toUpperCase() === needle ||
        name === needle ||
        name.includes(needle)
      );
    });
    if (!hit) {
      setLocalError("Aucun titre trouvé.");
      return;
    }
    setLocalError(null);
    onOpenTitle(hit);
  }

  function stepTitle(dir: -1 | 1) {
    const numbered = titles.filter((row) => row.number);
    const index = numbered.findIndex((row) => row.id === value.id);
    const next = numbered[index + dir];
    if (next) onOpenTitle(next);
  }

  return (
    <RhModal
      size="lg"
      title="Titre de Congé"
      subtitle={reference || "Nouveau"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onReset}>
            NOUVEAU
          </Button>
          <Button variant="secondary" onClick={onPrint} disabled={cancelled}>
            IMPRIMER
          </Button>
          <Button disabled={pending || cancelled} onClick={onSubmit}>
            {value.saved ? "MODIFIER" : "ENREGISTRER"}
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
      {cancelled ? (
        <div className="mb-3">
          <RhAlert tone="danger">Ce congé a été annulé : le titre ne peut plus être imprimé. · هذه الإجازة ملغاة.</RhAlert>
        </div>
      ) : null}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <input
            className={`${rhInput} mt-0 min-w-[16rem] flex-1`}
            placeholder="Rechercher par N° titre, matricule ou nom..."
            value={titleQuery}
            onChange={(e) => setTitleQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchTitle();
              }
            }}
          />
          <Button type="button" onClick={searchTitle}>
            RECHERCHER
          </Button>
          {value.numero ? (
            <>
              <Button type="button" variant="secondary" onClick={() => stepTitle(-1)}>
                ❮ Précédent
              </Button>
              <Button type="button" variant="secondary" onClick={() => stepTitle(1)}>
                Suivant ❯
              </Button>
            </>
          ) : null}
        </div>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Identification</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="N° Titre de congé">{readOnly(reference)}</RhField>
            {isNew ? (
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
            ) : null}
            <RhField label="Matricule">{readOnly(value.matricule)}</RhField>
            <RhField label="Nom">{input("nom")}</RhField>
            <RhField label="Prénom">{input("prenom")}</RhField>
            <RhField label="Affectation">
              <select className={rhInput} value={value.affectation} onChange={(e) => set({ affectation: e.target.value })}>
                <option value="" />
                {withCurrent(affectations, value.affectation).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </RhField>
            <RhField label="Fonction / Poste">
              <select className={rhInput} value={value.poste} onChange={(e) => set({ poste: e.target.value })}>
                <option value="" />
                {withCurrent(jobs, value.poste).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </RhField>
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
          <h4 className="text-sm font-semibold">Congé — الإجازة</h4>
          {isNew ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RhField label="Nature du congé — طبيعة الإجازة">
                <select className={rhInput} value={value.leave.kind} onChange={(e) => setLeave({ kind: e.target.value })}>
                  {LEAVE_KINDS.map((k) => (
                    <option key={k.code} value={k.code}>
                      {k.fr} ({k.legend})
                    </option>
                  ))}
                </select>
              </RhField>
              <RhField label="Du — من">
                <input
                  type="date"
                  className={rhInput}
                  value={dateDebut}
                  onChange={(e) => setLeave({ dateDebut: e.target.value })}
                />
              </RhField>
              <RhField label="Au (inclus) — إلى">
                <input
                  type="date"
                  className={rhInput}
                  min={dateDebut || undefined}
                  value={dateFin}
                  onChange={(e) => setLeave({ dateFin: e.target.value })}
                />
              </RhField>
              <RhField label="Nombre de jours — عدد الأيام" hint={calendar ? `${calendar} j calendaires` : undefined}>
                <input
                  inputMode="decimal"
                  className={rhInput}
                  placeholder={calendar ? String(calendar) : ""}
                  value={value.daysText}
                  onChange={(e) => {
                    const daysText = e.target.value;
                    onChange({
                      ...value,
                      daysText,
                      leave: { ...value.leave, jours: Number(daysText.replace(",", ".")) || calendar },
                    });
                  }}
                />
              </RhField>
              <RhField label="Date de reprise — تاريخ الاستئناف">{readOnly(reprise)}</RhField>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RhField label="Nature du congé — طبيعة الإجازة">{readOnly(nature.fr)}</RhField>
              <RhField label="Du — من">{readOnly(formatOmDate(dateDebut))}</RhField>
              <RhField label="Au — إلى">{readOnly(formatOmDate(dateFin))}</RhField>
              <RhField label="Nombre de jours — عدد الأيام">{readOnly(leaveDaysLabel(value.leave.jours))}</RhField>
              <RhField label="Date de reprise — تاريخ الاستئناف">{readOnly(reprise)}</RhField>
            </div>
          )}
          <p className="text-[11px] text-foreground/60">
            {isNew
              ? "À l'enregistrement, la demande de congé est enregistrée et approuvée, le titre est numéroté et les jours sont proposés dans le pointage (non validés). · عند الحفظ يُسجَّل طلب الإجازة ويُعتمد ويُرقَّم السند وتُقترح الأيام في جدول الحضور."
              : "Nature et dates viennent de la demande de congé approuvée et se modifient depuis celle-ci. · طبيعة الإجازة وتواريخها من طلب الإجازة المعتمد وتعدَّل منه."}
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Transport</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Moyen de transport">
              <select className={rhInput} value={value.moyen} onChange={(e) => set({ moyen: e.target.value })}>
                <option value="" />
                {withCurrent([...OM_MOYENS], value.moyen).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </RhField>
            <RhField label="Véhicule — Modèle">{input("modele")}</RhField>
            <RhField label="Immatriculation">{input("immat")}</RhField>
            <RhField label="Kilométrage au départ">{input("kmDepart", { type: "number" })}</RhField>
            <RhField label="Kilométrage au retour">{input("kmRetour", { type: "number" })}</RhField>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Pièce d&apos;identité de l&apos;intéressé(e) — وثيقة التعريف</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Type de pièce">{input("pieceType", { placeholder: "Carte d'identité..." })}</RhField>
            <RhField label="N° pièce">{input("pieceNum")}</RhField>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Validation & émission — المصادقة والإصدار</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Établi par">{input("donneur")}</RhField>
            <RhField label="Fonction">{input("pieceFonction")}</RhField>
            <RhField label="Fait à">{input("faitA")}</RhField>
            <RhField label="Date du document">{input("dateDoc", { type: "date" })}</RhField>
          </div>
        </section>
      </div>
    </RhModal>
  );
}
