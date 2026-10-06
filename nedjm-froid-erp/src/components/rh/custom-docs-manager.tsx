"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, FileCheck, FileStack, Mail, PenTool, Plus, Settings2, type LucideIcon } from "lucide-react";
import type { CatalogKind } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { listCustomDocDefs, setCustomDocDefActive, type CustomDocRow } from "@/lib/actions/hr-custom-docs";
import {
  CUSTOM_DOC_LANGS,
  CUSTOM_DOC_LISTS,
  CUSTOM_DOC_SOURCES,
  customDocFields,
  customDocSample,
  customLetterhead,
  type CustomDocDef,
} from "@/lib/doc/custom-docs";
import { docFontOptions, fontFaceCss, type UploadedFont } from "@/lib/doc/fonts";
import { pageWidthPx } from "@/lib/doc/page-setup";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import { DocEditor } from "@/components/doc/doc-editor";
import { CustomDocWizard } from "@/components/rh/custom-doc-wizard";
import { DocCard } from "@/components/rh/doc-card";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip } from "@/components/rh/rh-ui";

const label = <T extends { id: string; fr: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)?.fr ?? id;

const FAMILY_LOOK: Record<CustomDocDef["family"], { icon: LucideIcon; color: string }> = {
  lettres: { icon: Mail, color: "#3b82f6" },
  fiches: { icon: ClipboardList, color: "#8b5cf6" },
  contrats: { icon: FileCheck, color: "#14b8a6" },
  autres: { icon: FileStack, color: "#f59e0b" },
};

function status(def: CustomDocRow) {
  if (!def.is_active) return <RhChip tone="neutral">Archivé</RhChip>;
  if (def.approved_version == null) return <RhChip tone="warning">À approuver</RhChip>;
  if (def.has_draft) return <RhChip tone="brand">Brouillon en cours</RhChip>;
  return <RhChip tone="success">Version {def.approved_version}</RhChip>;
}

export function CustomDocsManager({
  defs: initial,
  canEdit,
  fonts,
  kinds,
  employeeFields,
  company,
  ficheLetterhead,
}: {
  defs: CustomDocRow[];
  canEdit: boolean;
  fonts: UploadedFont[];
  kinds: CatalogKind[];
  employeeFields: HrEmployeeField[];
  company: HrCompanyProfile;
  /** Letterhead image of the employee fiche settings (the company letterhead). */
  ficheLetterhead: string | null;
}) {
  const companyLetterhead = () => companyLetterheadUrl(ficheLetterhead, window.location.origin);
  const router = useRouter();
  const [defs, setDefs] = useState(initial);
  const [wizard, setWizard] = useState<{ def: CustomDocRow | null } | null>(null);
  const [designing, setDesigning] = useState<CustomDocDef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();
  const fontOptions = useMemo(() => docFontOptions(fonts).map((o) => o.stack), [fonts]);
  const fontCss = useMemo(() => fontFaceCss(fonts), [fonts]);
  const shown = defs.filter((d) => showArchived || d.is_active);

  function reload() {
    start(async () => {
      const r = await listCustomDocDefs();
      if (r.ok) setDefs(r.data.defs);
      router.refresh();
    });
  }

  function toggle(def: CustomDocRow) {
    setError(null);
    start(async () => {
      const r = await setCustomDocDefActive(def.id, !def.is_active);
      if (!r.ok) return setError(r.error);
      setDefs((list) => list.map((d) => (d.id === def.id ? { ...d, is_active: !d.is_active } : d)));
      setInfo(def.is_active ? `« ${def.name_fr} » archivé : il ne se propose plus à l'impression.` : `« ${def.name_fr} » réactivé.`);
    });
  }

  if (designing) {
    const letterhead = customLetterhead(designing.page, companyLetterhead());
    return (
      <section className="flex min-h-[calc(100dvh-12rem)] flex-col gap-2">
        <DocEditor
          docType={designing.doc_type}
          meta={{
            label: designing.name_fr,
            labelAr: designing.name_ar,
            fields: customDocFields(designing, employeeFields),
            lists: CUSTOM_DOC_LISTS,
          }}
          data={customDocSample(designing, employeeFields, { company, letterheadUrl: letterhead })}
          pageWidth={pageWidthPx(designing.page)}
          fonts={fontOptions}
          fontCss={fontCss}
          onClose={() => {
            setDesigning(null);
            reload();
          }}
          onApproved={reload}
        />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-4xl text-sm text-foreground/60">
        Créez votre document (attestation, lettre, formulaire…) en quelques étapes, concevez son modèle puis approuvez-le : il
        apparaît alors dans « Documents RH › Autres documents ».
      </p>
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info ? <RhAlert tone="success">{info}</RhAlert> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {canEdit ? (
          <li>
            <button
              type="button"
              onClick={() => setWizard({ def: null })}
              className="group flex h-full min-h-[15rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/50 p-5 text-center transition hover:-translate-y-0.5 hover:border-violet-500 hover:bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/5"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-md transition group-hover:scale-110">
                <Plus className="size-7" aria-hidden />
              </span>
              <span className="font-display text-[15px] font-semibold text-foreground">Créer un document</span>
              <span className="text-xs text-foreground/55">Nom, données, champs, page, en-tête, police, numérotation</span>
            </button>
          </li>
        ) : null}
        {shown.map((def) => {
          const look = FAMILY_LOOK[def.family];
          return (
            <DocCard
              key={def.id}
              title={def.name_fr}
              subtitle={def.name_ar || undefined}
              icon={look.icon}
              color={look.color}
              badge={status(def)}
              rtl={def.lang === "ar"}
              landscape={def.page.orientation === "landscape"}
              dimmed={!def.is_active}
              meta={`${label(CUSTOM_DOC_SOURCES, def.source)} · ${label(CUSTOM_DOC_LANGS, def.lang).split(" (")[0]} · ${def.page.size} · ${def.page.font_family || "police par défaut"}`}
              onOpen={() => setDesigning(def)}
              openLabel={canEdit ? "Concevoir le modèle" : "Voir le modèle"}
              actions={
                <>
                  <Button size="sm" className="flex-1" onClick={() => setDesigning(def)}>
                    <PenTool aria-hidden />
                    {canEdit ? "Concevoir" : "Voir"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setWizard({ def })} title="Paramètres" aria-label="Paramètres">
                    <Settings2 aria-hidden />
                  </Button>
                  {canEdit ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(def)}>
                      {def.is_active ? "Archiver" : "Réactiver"}
                    </Button>
                  ) : null}
                </>
              }
            />
          );
        })}
      </ul>
      {!shown.length && !canEdit ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-foreground/55">
          Aucun document créé pour l’instant.
        </p>
      ) : null}
      {defs.some((d) => !d.is_active) ? (
        <label className="flex items-center gap-2 text-xs text-foreground/60">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Afficher les documents archivés
        </label>
      ) : null}

      {wizard ? (
        <CustomDocWizard
          initial={wizard.def}
          others={defs.filter((d) => d.id !== wizard.def?.id)}
          kinds={kinds}
          fonts={fonts}
          employeeFields={employeeFields}
          company={company}
          companyLetterhead={companyLetterhead()}
          canEdit={canEdit}
          onClose={() => setWizard(null)}
          onSaved={(def, created) => {
            setWizard(null);
            setInfo(created ? `« ${def.name_fr} » créé : concevez son modèle puis approuvez-le.` : `« ${def.name_fr} » enregistré.`);
            reload();
            if (created) setDesigning(def);
          }}
        />
      ) : null}
    </div>
  );
}
