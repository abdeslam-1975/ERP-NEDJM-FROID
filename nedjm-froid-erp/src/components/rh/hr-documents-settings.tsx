"use client";

import { useState, useTransition } from "react";
import {
  ClipboardList,
  FileClock,
  FilePlus2,
  LayoutTemplate,
  Pencil,
  Plane,
  TreePalm,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { CatalogItem, CatalogKind } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { saveHrCompanyProfile } from "@/lib/actions/hr-company";
import type { CustomDocRow } from "@/lib/actions/hr-custom-docs";
import type { DocTemplateSummary } from "@/lib/actions/doc-templates";
import { BUNDLED_FONTS } from "@/lib/doc/bundled-fonts";
import type { UploadedFont } from "@/lib/doc/fonts";
import { DOC_TYPES, HR_DOC_TYPE_IDS, type DocTypeId } from "@/lib/doc/registry";
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
import { DocCard, SectionTile } from "@/components/rh/doc-card";
import { DocFontsManager } from "@/components/rh/doc-fonts-manager";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, RhModal, RhPanel, bi, rhInput } from "@/components/rh/rh-ui";

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
const PROFILE_KEYS = PROFILE_GROUPS.flatMap((g) => g.keys);

type Look = { icon: LucideIcon; color: string };

const SHEET_LOOK: Partial<Record<DocTypeId, Look>> = {
  ordre_mission: { icon: Plane, color: "#0ea5e9" },
  titre_conge: { icon: TreePalm, color: "#22a06b" },
  fiche_renseignements: { icon: ClipboardList, color: "#6366f1" },
  contrat_cdd: { icon: FileClock, color: "#14b8a6" },
};

const SHEET_FAMILIES: { id: "fiches" | "contrats"; title: string; hint: string }[] = [
  { id: "fiches", title: "Fiches et ordres", hint: "Ordre de mission, titre de congé, fiche de renseignements" },
  { id: "contrats", title: "Contrats de travail", hint: "Contrat à durée déterminée (CDD)" },
];

export type CustomDocsSettings = { defs: CustomDocRow[]; canEdit: boolean; fonts: UploadedFont[]; error?: string };

type DocumentsSubTab = "models" | "custom" | "fonts";

const frDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

function StatusBadge({ summary }: { summary?: DocTemplateSummary }) {
  if (!summary?.version) return <RhChip tone="warning">À approuver</RhChip>;
  if (summary.has_draft) return <RhChip tone="brand">Brouillon en cours</RhChip>;
  return <RhChip tone="success">Version {summary.version}</RhChip>;
}

function FamilyHeader({ icon: Icon, color, title, hint, count }: { icon: LucideIcon; color: string; title: string; hint: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-xl" style={{ background: `${color}1a`, color }}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-foreground">
          {title}
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/60">{count}</span>
        </p>
        <p className="text-xs text-foreground/55">{hint}</p>
      </div>
    </div>
  );
}

export function HrDocumentsSettings({
  company: initialCompany,
  canEdit,
  fiche,
  fields,
  catalogs,
  kinds,
  custom,
  summaries,
}: {
  company: HrCompanyProfile;
  canEdit: boolean;
  fiche: HrFicheSettings;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  kinds: CatalogKind[];
  custom: CustomDocsSettings;
  summaries: Record<string, DocTemplateSummary>;
}) {
  const [sub, setSub] = useState<DocumentsSubTab>("models");
  const activeCustom = custom.defs.filter((d) => d.is_active).length;
  const uploadedFamilies = new Set(custom.fonts.filter((f) => f.is_active).map((f) => f.family)).size;
  const tiles = (
    <div className="grid gap-3 md:grid-cols-3">
      <SectionTile
        title="Modèles de l'application"
        description="Identité de l'entreprise et modèles des lettres, ordres, fiches et contrats."
        icon={LayoutTemplate}
        color="#2563eb"
        count={`${HR_DOC_TYPE_IDS.length} modèles`}
        selected={sub === "models"}
        onSelect={() => setSub("models")}
      />
      <SectionTile
        title="Créer un document"
        description="Vos propres documents : forme, en-tête, champs, police et numérotation."
        icon={FilePlus2}
        color="#8b5cf6"
        count={activeCustom ? `${activeCustom} créé${activeCustom > 1 ? "s" : ""}` : "Nouveau"}
        selected={sub === "custom"}
        onSelect={() => setSub("custom")}
      />
      <SectionTile
        title="Polices"
        description="Polices arabes et latines fournies, et import de vos polices."
        icon={Type}
        color="#f59e0b"
        count={`${BUNDLED_FONTS.length + uploadedFamilies} polices`}
        selected={sub === "fonts"}
        onSelect={() => setSub("fonts")}
      />
    </div>
  );
  return (
    <div className="space-y-5">
      {tiles}
      {sub !== "models" && custom.error ? <RhAlert tone="danger">{custom.error}</RhAlert> : null}
      {sub === "models" ? (
        <BuiltInDocumentsSettings
          company={initialCompany}
          canEdit={canEdit}
          fiche={fiche}
          fields={fields}
          catalogs={catalogs}
          summaries={summaries}
        />
      ) : sub === "custom" ? (
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

function CompanyIdentityCard({
  company,
  letterhead,
  canEdit,
  onEdit,
  info,
}: {
  company: HrCompanyProfile;
  letterhead: string | null;
  canEdit: boolean;
  onEdit: () => void;
  info: string | null;
}) {
  const filled = PROFILE_KEYS.filter((k) => String(company[k] ?? "").trim()).length;
  const pct = Math.round((filled / PROFILE_KEYS.length) * 100);
  const initials =
    (company.short_name || company.name_fr || "NF")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "NF";
  return (
    <RhPanel padded={false}>
      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-sky-500 font-display text-lg font-bold text-white shadow-md">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/45">Identité de l’entreprise</p>
              <p className="truncate font-display text-lg font-semibold text-foreground">{company.name_fr || "Raison sociale à compléter"}</p>
              {company.name_ar ? (
                <p className="truncate text-sm text-foreground/60" dir="rtl">
                  {company.name_ar}
                </p>
              ) : null}
            </div>
            <Button variant={canEdit ? "primary" : "secondary"} size="sm" onClick={onEdit}>
              <Pencil aria-hidden />
              {canEdit ? "Modifier" : "Voir"}
            </Button>
          </div>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {(
              [
                ["Adresse", company.address_fr],
                ["Signé à", company.city_fr],
                ["Signataire", [company.manager_name_fr, company.manager_title_fr].filter(Boolean).join(" — ")],
                ["Préfixe des références", company.doc_prefix],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-foreground/45">{k}</dt>
                <dd className="truncate text-foreground/85">{v || <span className="text-foreground/40">—</span>}</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="mb-1 flex justify-between text-xs text-foreground/55">
              <span>Informations renseignées</span>
              <span className="font-semibold text-foreground/75">{pct} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {info ? <RhAlert tone="success">{info}</RhAlert> : null}
        </div>
        <div className="relative hidden border-l border-border/60 bg-surface-muted/60 p-4 md:block">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/45">Papier à en-tête</p>
          {letterhead ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={letterhead}
              alt="Papier à en-tête de l'entreprise"
              className="mx-auto aspect-[210/297] w-40 rounded-md bg-white object-cover shadow-md ring-1 ring-black/5"
            />
          ) : null}
          <p className="mt-2 text-center text-[11px] text-foreground/45">Se change dans « Modèle de fiche ».</p>
        </div>
      </div>
    </RhPanel>
  );
}

function BuiltInDocumentsSettings({
  company: initialCompany,
  canEdit,
  fiche,
  fields,
  catalogs,
  summaries,
}: {
  company: HrCompanyProfile;
  canEdit: boolean;
  fiche: HrFicheSettings;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  summaries: Record<string, DocTemplateSummary>;
}) {
  const [company, setCompany] = useState(initialCompany);
  const [form, setForm] = useState(initialCompany);
  const [identityOpen, setIdentityOpen] = useState(false);
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
      setIdentityOpen(false);
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

  const openLabel = canEdit ? "Modifier le modèle" : "Voir le modèle";

  return (
    <div className="space-y-6">
      <CompanyIdentityCard
        company={company}
        letterhead={fiche.letterhead_url ? companyLetterheadUrl(fiche.letterhead_url) : companyLetterheadUrl(null)}
        canEdit={canEdit}
        onEdit={() => {
          setForm(company);
          setError(null);
          setIdentityOpen(true);
        }}
        info={info}
      />

      {SHEET_FAMILIES.map((family) => {
        const types = HR_DOC_TYPE_IDS.filter((id) => DOC_TYPES[id].family === family.id);
        if (!types.length) return null;
        const first = SHEET_LOOK[types[0]] ?? { icon: ClipboardList, color: "#6366f1" };
        return (
          <section key={family.id}>
            <FamilyHeader icon={first.icon} color={first.color} title={family.title} hint={family.hint} count={types.length} />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {types.map((id) => {
                const look = SHEET_LOOK[id] ?? first;
                const s = summaries[id];
                return (
                  <DocCard
                    key={id}
                    title={DOC_TYPES[id].label}
                    subtitle={DOC_TYPES[id].labelAr}
                    icon={look.icon}
                    color={look.color}
                    badge={<StatusBadge summary={s} />}
                    meta={s?.approved_at ? `Approuvé le ${frDate(s.approved_at)}` : undefined}
                    onOpen={() => openEditor(id)}
                    openLabel={openLabel}
                    actions={
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => openEditor(id)}>
                        <Pencil aria-hidden />
                        {canEdit ? "Modifier" : "Voir"}
                      </Button>
                    }
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {identityOpen ? (
        <RhModal
          title="Identité de l'entreprise"
          subtitle="Reprise par tous les documents RH et par les références imprimées."
          size="lg"
          onClose={() => setIdentityOpen(false)}
          footer={
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setIdentityOpen(false)}>
                Fermer
              </Button>
              {canEdit ? (
                <Button disabled={pending || !dirty} onClick={save}>
                  {pending ? "Enregistrement…" : "Enregistrer l'identité"}
                </Button>
              ) : null}
            </div>
          }
        >
          <div className="space-y-5">
            {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
            {!canEdit ? (
              <RhAlert tone="info">Lecture seule : la modification demande le droit « Paramètres RH ».</RhAlert>
            ) : null}
            {PROFILE_GROUPS.map((group) => (
              <div key={group.title} className="rounded-2xl border border-border/60 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground/50">{group.title}</p>
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
        </RhModal>
      ) : null}
    </div>
  );
}
