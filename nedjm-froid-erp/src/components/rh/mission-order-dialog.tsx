"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrCorrespondenceRow } from "@/lib/actions/hr-documents";
import type { HrEmployeeRow } from "@/lib/actions/hr-employees";
import {
  OM_DONNEUR,
  OM_FAIT_A,
  OM_LIEU_DEPART,
  missionDateBounds,
  missionDateIssue,
  pickMissionContract,
  todayIsoAlgiers,
  type MissionContractHint,
} from "@/lib/hr/mission-order";
import { catalogOptions } from "@/components/rh/rh-ui";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhModal, rhInput } from "@/components/rh/rh-ui";

export type MissionDraft = {
  id?: string;
  numero: string;
  employee_id: string;
  site_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  affectation: string;
  poste: string;
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

export function missionDraftDateIssue(draft: MissionDraft, today = todayIsoAlgiers()) {
  return missionDateIssue(
    draft,
    today,
    draft.id ? { dateDepart: draft.savedDateDepart, dateRetour: draft.savedDateRetour } : null,
  );
}

export const emptyMissionDraft = (): MissionDraft => ({
  numero: "",
  employee_id: "",
  site_id: "",
  matricule: "",
  nom: "",
  prenom: "",
  affectation: "",
  poste: "",
  dest1: "",
  dest2: "",
  lieuDepart: OM_LIEU_DEPART,
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
  donneur: OM_DONNEUR,
  faitA: OM_FAIT_A,
  dateDoc: todayIsoAlgiers(),
});

type SiteOpt = { id: string; name_fr: string };

const MOYENS = ["", "Train", "Avion", "Taxi", "Véhicule de l'entreprise"];

function withCurrent(options: string[], current: string) {
  const values = options.filter(Boolean);
  if (current && !values.includes(current)) values.unshift(current);
  return values;
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
}) {
  const [orderQuery, setOrderQuery] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [matches, setMatches] = useState<HrEmployeeRow[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const set = (patch: Partial<MissionDraft>) => onChange({ ...value, ...patch });
  const jobs = catalogOptions(catalogs, "job_title").map((item) => item.label_fr);
  const affectations = sites.map((site) => site.name_fr);
  const idTypes = catalogOptions(catalogs, "id_type");
  const today = todayIsoAlgiers();
  const saved = value.id ? { dateDepart: value.savedDateDepart, dateRetour: value.savedDateRetour } : null;
  const bounds = missionDateBounds(value, today, saved);
  const dateIssue =
    value.dateDepart || value.dateRetour ? missionDraftDateIssue(value, today) : null;
  const dateError = (field: "dateDepart" | "dateRetour") =>
    dateIssue?.field === field ? (
      <p className="mt-1 text-[11px] font-medium text-red-600">{dateIssue.message}</p>
    ) : null;
  const dateClass = (field: "dateDepart" | "dateRetour") =>
    dateIssue?.field === field ? `${rhInput} border-red-500 ring-1 ring-red-300` : rhInput;

  function applyEmployee(emp: HrEmployeeRow) {
    const contract = pickMissionContract(contracts, emp.id);
    const site = sites.find((row) => row.id === contract?.site_id);
    const poste = contract?.poste_fr || emp.fiche_poste || "";
    const type = idTypes.find((item) => item.code === emp.id_type_code);
    onChange({
      ...value,
      employee_id: emp.id,
      site_id: contract?.site_id ?? "",
      matricule: emp.matricule,
      nom: emp.last_name,
      prenom: emp.first_name,
      affectation: site?.name_fr || emp.fiche_affectation || "",
      poste,
      pieceType: type?.label_fr || emp.id_type_code || "",
      pieceNum: emp.id_number || "",
      pieceDelivre: (emp.id_issued_on || "").slice(0, 10),
      pieceFonction: poste,
      pieceLieu: emp.id_issued_by || "",
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
    const found = employees.filter((emp) => {
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
          <Button variant="secondary" onClick={onReset}>
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
              <input className={rhInput} value={value.numero || "—"} readOnly />
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
            <RhField label="Affectation">
              <select
                className={rhInput}
                value={value.affectation}
                onChange={(e) => {
                  const name = e.target.value;
                  const site = sites.find((row) => row.name_fr === name);
                  set({ affectation: name, site_id: site?.id ?? value.site_id });
                }}
              >
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
          <h4 className="text-sm font-semibold">Déplacement</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="1ère destination">
              <input className={rhInput} list="om-dest-list" value={value.dest1} onChange={(e) => set({ dest1: e.target.value })} />
            </RhField>
            <RhField label="2ème destination">
              <input className={rhInput} list="om-dest-list" value={value.dest2} onChange={(e) => set({ dest2: e.target.value })} />
            </RhField>
            <RhField label="Lieu de départ">
              <input className={rhInput} value={value.lieuDepart} onChange={(e) => set({ lieuDepart: e.target.value })} />
            </RhField>
            <RhField label="Date de départ — تاريخ الذهاب">
              <input
                type="date"
                className={dateClass("dateDepart")}
                min={bounds.minDepart}
                value={value.dateDepart}
                onChange={(e) => set({ dateDepart: e.target.value })}
              />
              {dateError("dateDepart")}
            </RhField>
            <RhField label="Heure de départ">
              <input type="time" className={rhInput} value={value.heureDepart} onChange={(e) => set({ heureDepart: e.target.value })} />
            </RhField>
            <RhField label="Lieu de retour">
              <input className={rhInput} value={value.lieuRetour} onChange={(e) => set({ lieuRetour: e.target.value })} />
            </RhField>
            <RhField label="Date de retour — تاريخ العودة">
              <input
                type="date"
                className={dateClass("dateRetour")}
                min={bounds.minRetour}
                value={value.dateRetour}
                onChange={(e) => set({ dateRetour: e.target.value })}
              />
              {dateError("dateRetour")}
            </RhField>
            <RhField label="Heure de retour">
              <input type="time" className={rhInput} value={value.heureRetour} onChange={(e) => set({ heureRetour: e.target.value })} />
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
          <datalist id="om-dest-list">
            {affectations.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Transport</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Moyen de transport">
              <select className={rhInput} value={value.moyen} onChange={(e) => set({ moyen: e.target.value })}>
                <option value="" />
                {withCurrent(MOYENS.filter(Boolean), value.moyen).map((item) => (
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
          <h4 className="text-sm font-semibold">Pièce d&apos;identité & émission</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Type de pièce">
              <input className={rhInput} placeholder="Carte d'identité..." value={value.pieceType} onChange={(e) => set({ pieceType: e.target.value })} />
            </RhField>
            <RhField label="N° pièce">
              <input className={rhInput} value={value.pieceNum} onChange={(e) => set({ pieceNum: e.target.value })} />
            </RhField>
            <RhField label="Délivré le">
              <input type="date" className={rhInput} value={value.pieceDelivre} onChange={(e) => set({ pieceDelivre: e.target.value })} />
            </RhField>
            <RhField label="Fonction (émetteur pièce)">
              <input className={rhInput} value={value.pieceFonction} onChange={(e) => set({ pieceFonction: e.target.value })} />
            </RhField>
            <RhField label="À (lieu)">
              <input className={rhInput} value={value.pieceLieu} onChange={(e) => set({ pieceLieu: e.target.value })} />
            </RhField>
            <RhField label="Donneur de l'OM">
              <input className={rhInput} value={value.donneur} onChange={(e) => set({ donneur: e.target.value })} />
            </RhField>
            <RhField label="Fait à">
              <input className={rhInput} value={value.faitA} onChange={(e) => set({ faitA: e.target.value })} />
            </RhField>
            <RhField label="Date du document">
              <input type="date" className={rhInput} value={value.dateDoc} onChange={(e) => set({ dateDoc: e.target.value })} />
            </RhField>
          </div>
        </section>
      </div>
    </RhModal>
  );
}
