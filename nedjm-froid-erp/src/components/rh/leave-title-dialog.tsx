"use client";

import type { ReactNode } from "react";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
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
};

type SiteOpt = { id: string; name_fr: string };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="h-4 w-1 rounded-full bg-brand" />
        {title}
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-foreground/50">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value || "—"}</p>
    </div>
  );
}

export function LeaveTitleDialog({
  pending,
  error,
  sites,
  catalogs,
  value,
  onChange,
  onClose,
  onSubmit,
  onPrint,
}: {
  pending: boolean;
  error: string | null;
  sites: readonly SiteOpt[];
  catalogs: CatalogItem[];
  value: LeaveTitleDraft;
  onChange: (next: LeaveTitleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onPrint: () => void;
}) {
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
  const jobs = catalogOptions(catalogs, "job_title").map((item) => item.label_fr);
  const affectations = sites.map((site) => site.name_fr);
  const nature = leaveNature(value.leave.kind);
  const { dateDebut, dateFin } = value.leave;
  const reprise = formatOmDate(leaveReprise(dateFin));
  const cancelled = value.status_code === "CANCELLED";

  return (
    <RhModal
      size="lg"
      title="Titre de congé — إجازة"
      subtitle={leaveTitleReference(value.numero) || value.numero}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onPrint} disabled={cancelled}>
            IMPRIMER
          </Button>
          <Button disabled={pending || cancelled} onClick={onSubmit}>
            ENREGISTRER
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
        {cancelled ? (
          <RhAlert tone="danger">Ce congé a été annulé : le titre ne peut plus être imprimé. · هذه الإجازة ملغاة.</RhAlert>
        ) : null}

        <div className="rounded-2xl border border-brand/20 bg-brand-muted/40 p-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Fact label="Nature — طبيعة الإجازة" value={nature.fr} />
            <Fact label="Du — من" value={formatOmDate(dateDebut)} />
            <Fact label="Au — إلى" value={formatOmDate(dateFin)} />
            <Fact label="Jours — عدد الأيام" value={leaveDaysLabel(value.leave.jours)} />
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-brand/15 pt-2 text-[11px] text-foreground/60">
            <p>
              Reprise le <b className="font-semibold text-foreground/80">{reprise || "—"}</b> · Les dates se
              modifient depuis la demande de congé.
            </p>
            <p dir="rtl">
              الاستئناف يوم <b className="font-semibold text-foreground/80">{reprise || "—"}</b> · تعدَّل التواريخ من
              طلب الإجازة.
            </p>
          </div>
        </div>

        <Section title="Identification — تعريف المعني(ة)">
          <RhField label="Matricule">
            <input className={rhInput} value={value.matricule} readOnly />
          </RhField>
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
        </Section>

        <Section title="Transport — وسيلة النقل">
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
        </Section>

        <Section title="Pièce d'identité de l'intéressé(e) — وثيقة التعريف">
          <RhField label="Type de pièce">{input("pieceType", { placeholder: "Carte d'identité..." })}</RhField>
          <RhField label="N° pièce">{input("pieceNum")}</RhField>
        </Section>

        <Section title="Validation & émission — المصادقة والإصدار">
          <RhField label="Établi par">{input("donneur")}</RhField>
          <RhField label="Fonction">{input("pieceFonction")}</RhField>
          <RhField label="Fait à">{input("faitA")}</RhField>
          <RhField label="Date du document">{input("dateDoc", { type: "date" })}</RhField>
        </Section>
      </div>
    </RhModal>
  );
}
