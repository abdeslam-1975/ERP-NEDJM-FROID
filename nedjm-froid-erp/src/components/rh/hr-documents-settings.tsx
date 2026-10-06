"use client";

import { useState, useTransition } from "react";
import { FileText, Pencil } from "lucide-react";
import type { CatalogItem, CatalogKind } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { saveHrCompanyProfile } from "@/lib/actions/hr-company";
import type { CustomDocRow } from "@/lib/actions/hr-custom-docs";
import type { UploadedFont } from "@/lib/doc/fonts";
import { DOC_TYPES, HR_DOC_TYPE_IDS, type DocTypeId, type DocTypeMeta } from "@/lib/doc/registry";
import type { DocData } from "@/lib/doc/engine";
import { companyLetterheadUrl } from "@/lib/hr/company-letterhead";
import {
  COMPANY_PROFILE_LABELS,
  type CompanyProfileKey,
  type HrCompanyProfile,
} from "@/lib/hr/company-profile";
import type { HrFicheSettings } from "@/lib/hr/fiche-settings";
import { hrDocSample } from "@/lib/hr/hr-doc-samples";
import { A4_PAGE_WIDTH } from "@/lib/sim/documents";
import { DocEditor } from "@/components/doc/doc-editor";
import { clearPrintKitCache } from "@/components/doc/use-print-kit";
import { CustomDocsManager } from "@/components/rh/custom-docs-manager";
import { DocFontsManager } from "@/components/rh/doc-fonts-manager";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhPanel, RhSectionTitle, RhTabs, bi, rhInput } from "@/components/rh/rh-ui";

const PROFILE_GROUPS: { title: string; keys: CompanyProfileKey[] }[] = [
  { title: bi("Identité", "الهوية"), keys: ["name_fr", "name_ar", "short_name", "address_fr", "address_ar"] },
  {
    title: bi("Signature des documents", "توقيع الوثائق"),
    keys: ["city_fr", "city_ar", "city_short", "manager_name_fr", "manager_name_ar", "manager_title_fr", "manager_title_ar"],
  },
  { title: bi("Valeurs par défaut", "القيم الافتراضية"), keys: ["hr_service", "default_departure", "mission_open_return", "doc_prefix"] },
  { title: bi("Coordonnées et identifiants", "المعلومات القانونية"), keys: ["phone", "email", "nif", "nis", "rc", "ai", "bank"] },
];

const WIDE_KEYS = new Set<CompanyProfileKey>(["address_fr", "address_ar", "bank"]);

const FAMILIES: { id: DocTypeMeta["family"]; title: string }[] = [
  { id: "lettres", title: bi("Lettres et attestations", "الرسائل والشهادات") },
  { id: "fiches", title: bi("Fiches et ordres", "البطاقات والأوامر") },
  { id: "contrats", title: bi("Contrats de travail", "عقود العمل") },
];

export type CustomDocsSettings = { defs: CustomDocRow[]; canEdit: boolean; fonts: UploadedFont[]; error?: string };

type DocumentsSubTab = "models" | "custom" | "fonts";

export function HrDocumentsSettings({
  company: initialCompany,
  canEdit,
  fiche,
  fields,
  catalogs,
  kinds,
  custom,
}: {
  company: HrCompanyProfile;
  canEdit: boolean;
  fiche: HrFicheSettings;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  kinds: CatalogKind[];
  custom: CustomDocsSettings;
}) {
  const [sub, setSub] = useState<DocumentsSubTab>("models");
  const tabs = (
    <RhTabs
      items={[
        { id: "models", label: "Identité et modèles" },
        { id: "custom", label: "Créer un document", count: custom.defs.filter((d) => d.is_active).length },
        { id: "fonts", label: "Polices" },
      ]}
      value={sub}
      onChange={(id) => setSub(id as DocumentsSubTab)}
    />
  );
  if (sub === "models") {
    return (
      <div className="space-y-4">
        {tabs}
        <BuiltInDocumentsSettings company={initialCompany} canEdit={canEdit} fiche={fiche} fields={fields} catalogs={catalogs} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {tabs}
      {custom.error ? <RhAlert tone="danger">{custom.error}</RhAlert> : null}
      {sub === "custom" ? (
        <CustomDocsManager
          defs={custom.defs}
          canEdit={custom.canEdit}
          fonts={custom.fonts}
          kinds={kinds}
          employeeFields={fields}
          company={initialCompany}
          ficheLetterhead={fiche.letterhead_url}
        />
      ) : (
        <DocFontsManager fonts={custom.fonts} canEdit={custom.canEdit} />
      )}
    </div>
  );
}

function BuiltInDocumentsSettings({
  company: initialCompany,
  canEdit,
  fiche,
  fields,
  catalogs,
}: {
  company: HrCompanyProfile;
  canEdit: boolean;
  fiche: HrFicheSettings;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
}) {
  const [company, setCompany] = useState(initialCompany);
  const [form, setForm] = useState(initialCompany);
  const [editing, setEditing] = useState<{ type: DocTypeId; data: DocData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = (Object.keys(form) as CompanyProfileKey[]).some((k) => form[k] !== company[k]);

  function save() {
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await saveHrCompanyProfile(form);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCompany(r.data);
      setForm(r.data);
      clearPrintKitCache();
      setInfo(bi("Identité enregistrée : elle s'applique à toutes les impressions.", "تم حفظ الهوية."));
    });
  }

  function openEditor(type: DocTypeId) {
    const data = hrDocSample(type, {
      company,
      letterheadUrl: companyLetterheadUrl(fiche.letterhead_url, window.location.origin),
      fiche: { settings: fiche, fields, catalogs },
    });
    if (data) setEditing({ type, data });
  }

  if (editing) {
    return (
      <section className="flex min-h-[calc(100dvh-12rem)] flex-col gap-2">
        <DocEditor
          docType={editing.type}
          data={editing.data}
          pageWidth={A4_PAGE_WIDTH}
          onClose={() => setEditing(null)}
          onApproved={() => undefined}
        />
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <RhPanel>
        <RhSectionTitle>{bi("Identité de l'entreprise", "هوية المؤسسة")}</RhSectionTitle>
        <p className="mb-4 text-sm text-foreground/60">
          {bi(
            "Ces informations sont reprises par tous les documents RH (lettres, ordres de mission, titres de congé, fiches, contrats) et par les références imprimées.",
            "تُستعمل هذه المعلومات في جميع وثائق الموارد البشرية.",
          )}
        </p>
        <div className="space-y-5">
          {PROFILE_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">{group.title}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.keys.map((key) => {
                  const label = COMPANY_PROFILE_LABELS[key];
                  return (
                    <div key={key} className={WIDE_KEYS.has(key) ? "sm:col-span-2 xl:col-span-3" : undefined}>
                      <RhField label={bi(label.fr, label.ar)} hint={label.hint}>
                        <input
                          className={rhInput}
                          dir={key.endsWith("_ar") ? "rtl" : "auto"}
                          value={form[key]}
                          disabled={!canEdit}
                          maxLength={600}
                          onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </RhField>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {error ? (
          <div className="mt-4">
            <RhAlert tone="danger">{error}</RhAlert>
          </div>
        ) : null}
        {info ? (
          <div className="mt-4">
            <RhAlert tone="success">{info}</RhAlert>
          </div>
        ) : null}
        {canEdit ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pending || !dirty} onClick={save}>
              {bi("Enregistrer l'identité", "حفظ الهوية")}
            </Button>
            <Button variant="secondary" disabled={pending || !dirty} onClick={() => setForm(company)}>
              {bi("Annuler les modifications", "إلغاء التعديلات")}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-xs text-foreground/55">
            {bi("Lecture seule : la modification demande le droit « Paramètres RH ».", "للقراءة فقط.")}
          </p>
        )}
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>{bi("Modèles de documents", "نماذج الوثائق")}</RhSectionTitle>
        <p className="mb-4 text-sm text-foreground/60">
          {bi(
            "Chaque document s'imprime depuis la dernière version approuvée de son modèle. Ouvrez un modèle pour modifier le texte, la mise en page ou les champs, puis approuvez la nouvelle version.",
            "كل وثيقة تُطبع من آخر نسخة معتمدة من نموذجها.",
          )}
        </p>
        <div className="space-y-5">
          {FAMILIES.map((family) => {
            const types = HR_DOC_TYPE_IDS.filter((id) => DOC_TYPES[id].family === family.id);
            if (!types.length) return null;
            return (
              <div key={family.id}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">{family.title}</p>
                <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {types.map((id) => (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface px-3 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <FileText className="size-4 shrink-0 text-brand" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{DOC_TYPES[id].label}</span>
                          <span className="block truncate text-xs text-foreground/50" dir="rtl">
                            {DOC_TYPES[id].labelAr}
                          </span>
                        </span>
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => openEditor(id)}>
                        <Pencil aria-hidden />
                        {canEdit ? bi("Modifier", "تعديل") : bi("Voir", "عرض")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </RhPanel>
    </div>
  );
}
