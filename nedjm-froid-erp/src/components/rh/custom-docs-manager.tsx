"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, PenTool, Settings2 } from "lucide-react";
import type { CatalogKind } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { listCustomDocDefs, setCustomDocDefActive, type CustomDocRow } from "@/lib/actions/hr-custom-docs";
import {
  CUSTOM_DOC_FAMILIES,
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
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhPanel, RhSectionTitle } from "@/components/rh/rh-ui";

const label = <T extends { id: string; fr: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)?.fr ?? id;

function status(def: CustomDocRow) {
  if (!def.is_active) return <RhChip tone="neutral">Archivé</RhChip>;
  if (def.approved_version == null) return <RhChip tone="warning">À approuver</RhChip>;
  return (
    <span className="flex flex-wrap gap-1">
      <RhChip tone="success">Version {def.approved_version}</RhChip>
      {def.has_draft ? <RhChip tone="brand">Modifications en attente</RhChip> : null}
    </span>
  );
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
    <RhPanel>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <RhSectionTitle>Documents créés depuis l’interface</RhSectionTitle>
          <p className="text-sm text-foreground/60">
            Créez un nouveau document (attestation, lettre, formulaire…) : nom, données reprises, champs à saisir, format de page,
            papier à en-tête, police et numérotation. Concevez ensuite son modèle, puis approuvez-le : il apparaît alors dans
            « Documents RH › Nouveau document ».
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setWizard({ def: null })}>
            <FilePlus2 aria-hidden />
            Créer un document
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="mb-3">
          <RhAlert tone="danger">{error}</RhAlert>
        </div>
      ) : null}
      {info ? (
        <div className="mb-3">
          <RhAlert tone="success">{info}</RhAlert>
        </div>
      ) : null}
      {shown.length ? (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((def) => (
            <li key={def.id} className={`flex flex-col gap-2 rounded-xl border border-border/70 bg-surface px-3.5 py-3 ${def.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{def.name_fr}</span>
                  {def.name_ar ? (
                    <span className="block truncate text-xs text-foreground/55" dir="rtl">
                      {def.name_ar}
                    </span>
                  ) : null}
                </span>
                {status(def)}
              </div>
              <p className="text-xs text-foreground/55">
                {label(CUSTOM_DOC_FAMILIES, def.family)} · {label(CUSTOM_DOC_SOURCES, def.source)} · {label(CUSTOM_DOC_LANGS, def.lang)} ·{" "}
                {def.page.size} {def.page.orientation === "landscape" ? "paysage" : ""} · {def.page.font_family || "police par défaut"}
              </p>
              <div className="mt-auto flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => setDesigning(def)}>
                  <PenTool aria-hidden />
                  {canEdit ? "Concevoir" : "Voir"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setWizard({ def })}>
                  <Settings2 aria-hidden />
                  Paramètres
                </Button>
                {canEdit ? (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(def)}>
                    {def.is_active ? "Archiver" : "Réactiver"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-foreground/55">
          Aucun document créé pour l’instant. Cliquez sur « Créer un document » pour commencer.
        </p>
      )}
      {defs.some((d) => !d.is_active) ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-foreground/60">
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
    </RhPanel>
  );
}
