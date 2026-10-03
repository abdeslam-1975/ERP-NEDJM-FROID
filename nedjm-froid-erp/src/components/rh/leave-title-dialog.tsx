"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { HrCorrespondenceRow } from "@/lib/actions/hr-documents";
import {
  leaveDaysLabel,
  leaveNature,
  leaveReprise,
  type LeaveTitleFieldKey,
  type LeaveTitleLeave,
} from "@/lib/hr/leave-title";
import { OM_MOYENS, formatOmDate } from "@/lib/hr/mission-order";
import { leaveTitleReference } from "@/components/rh/leave-title-print";
import { withCurrent } from "@/components/rh/mission-order-dialog";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhModal, catalogOptions, rhInput } from "@/components/rh/rh-ui";

export type LeaveTitleDraft = Record<LeaveTitleFieldKey, string> & {
  id: string;
  numero: string;
  employee_id: string;
  status_code: string;
  leave: LeaveTitleLeave;
  /** The print fields were already saved once (« MODIFIER » instead of « ENREGISTRER »). */
  saved: boolean;
};

type SiteOpt = { id: string; name_fr: string };

export function LeaveTitleDialog({
  pending,
  error,
  sites,
  catalogs,
  titles,
  value,
  onChange,
  onClose,
  onSubmit,
  onPrint,
  onNew,
  onOpenTitle,
}: {
  pending: boolean;
  error: string | null;
  sites: readonly SiteOpt[];
  catalogs: CatalogItem[];
  titles: HrCorrespondenceRow[];
  value: LeaveTitleDraft;
  onChange: (next: LeaveTitleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onPrint: () => void;
  onNew: () => void;
  onOpenTitle: (row: HrCorrespondenceRow) => void;
}) {
  const [titleQuery, setTitleQuery] = useState("");
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
  const jobs = catalogOptions(catalogs, "job_title").map((item) => item.label_fr);
  const affectations = sites.map((site) => site.name_fr);
  const nature = leaveNature(value.leave.kind);
  const { dateDebut, dateFin } = value.leave;
  const reprise = formatOmDate(leaveReprise(dateFin));
  const cancelled = value.status_code === "CANCELLED";
  const reference = leaveTitleReference(value.numero) || value.numero;

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
      subtitle={reference}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onNew} title="Un titre de congé est créé à l'approbation d'une demande de congé.">
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
          <Button type="button" variant="secondary" onClick={() => stepTitle(-1)}>
            ❮ Précédent
          </Button>
          <Button type="button" variant="secondary" onClick={() => stepTitle(1)}>
            Suivant ❯
          </Button>
        </div>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Identification</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="N° Titre de congé">{readOnly(reference)}</RhField>
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
        </section>

        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h4 className="text-sm font-semibold">Congé — الإجازة</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label="Nature du congé — طبيعة الإجازة">{readOnly(nature.fr)}</RhField>
            <RhField label="Du — من">{readOnly(formatOmDate(dateDebut))}</RhField>
            <RhField label="Au — إلى">{readOnly(formatOmDate(dateFin))}</RhField>
            <RhField label="Nombre de jours — عدد الأيام">{readOnly(leaveDaysLabel(value.leave.jours))}</RhField>
            <RhField label="Date de reprise — تاريخ الاستئناف">{readOnly(reprise)}</RhField>
          </div>
          <p className="text-[11px] text-foreground/60">
            Nature et dates viennent de la demande de congé approuvée et se modifient depuis celle-ci. · طبيعة
            الإجازة وتواريخها من طلب الإجازة المعتمد وتعدَّل منه.
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
