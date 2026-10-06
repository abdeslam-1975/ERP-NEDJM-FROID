"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ImageUp, Plus, Trash2 } from "lucide-react";
import type { CatalogKind } from "@/lib/actions/hr-catalogs";
import type { HrEmployeeField } from "@/lib/actions/hr-employees";
import { saveCustomDocDef, type CustomDocRow, type CustomDocStart } from "@/lib/actions/hr-custom-docs";
import {
  CUSTOM_DOC_FAMILIES,
  CUSTOM_DOC_LANGS,
  CUSTOM_DOC_SOURCES,
  CUSTOM_INPUT_TYPES,
  CUSTOM_STARTERS,
  customDocDefInputSchema,
  customDocSample,
  customLetterhead,
  emptyCustomDocDef,
  formatReference,
  starterTemplate,
  suggestCode,
  suggestInputKey,
  type CustomDocDef,
  type CustomDocDefInput,
  type CustomInput,
  type CustomStarter,
} from "@/lib/doc/custom-docs";
import { renderTemplate } from "@/lib/doc/engine";
import { FONT_GROUP_LABELS, docFontOptions, fontFaceCss, fontStack, withFontFaces, type FontGroup, type UploadedFont } from "@/lib/doc/fonts";
import { PAGE_SIZES, pageWidthPx, type PageSetup } from "@/lib/doc/page-setup";
import type { HrCompanyProfile } from "@/lib/hr/company-profile";
import { DocFrame } from "@/components/sim/doc-frame";
import { uploadDocAsset } from "@/components/rh/doc-asset-upload";
import { Button } from "@/components/ui/button";
import { RhAlert, RhField, RhModal, rhInput } from "@/components/rh/rh-ui";

const STEPS = [
  { id: "identity", label: "Nom et langue" },
  { id: "source", label: "Données" },
  { id: "inputs", label: "Champs à saisir" },
  { id: "page", label: "Page et en-tête" },
  { id: "font", label: "Police" },
  { id: "numbering", label: "Numérotation" },
] as const;

type StepId = (typeof STEPS)[number]["id"];
type InputRow = { uid: string; autoKey: boolean; input: CustomInput };

const TOKENS = [
  { token: "{prefix}", label: "Préfixe de l'entreprise" },
  { token: "{code}", label: "Code du document" },
  { token: "{seq}", label: "Numéro" },
  { token: "{yyyy}", label: "Année (2026)" },
  { token: "{yy}", label: "Année (26)" },
  { token: "{mm}", label: "Mois" },
];

const choiceClass = (active: boolean) =>
  `rounded-xl border px-3.5 py-3 text-left transition ${
    active ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-border/70 bg-surface hover:border-brand/50"
  }`;

let uidSeq = 0;
const nextUid = () => `in${++uidSeq}`;

function uniqueKey(base: string, taken: string[]) {
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <RhField label={label} hint={hint}>
      <input
        type="number"
        className={rhInput}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </RhField>
  );
}

export function CustomDocWizard({
  initial,
  others,
  kinds,
  fonts,
  employeeFields,
  company,
  companyLetterhead,
  canEdit,
  onClose,
  onSaved,
}: {
  /** null: new document. */
  initial: CustomDocRow | null;
  others: CustomDocRow[];
  kinds: CatalogKind[];
  fonts: UploadedFont[];
  employeeFields: HrEmployeeField[];
  company: HrCompanyProfile;
  companyLetterhead: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (def: CustomDocDef, created: boolean) => void;
}) {
  const creating = !initial;
  const [def, setDef] = useState<CustomDocDefInput>(() =>
    initial
      ? {
          id: initial.id,
          code: initial.code,
          name_fr: initial.name_fr,
          name_ar: initial.name_ar,
          family: initial.family,
          lang: initial.lang,
          source: initial.source,
          inputs: initial.inputs,
          page: initial.page,
          numbering: initial.numbering,
        }
      : emptyCustomDocDef("fr"),
  );
  const [rows, setRows] = useState<InputRow[]>(() =>
    (initial?.inputs ?? []).map((input) => ({ uid: nextUid(), autoKey: false, input })),
  );
  const [codeTouched, setCodeTouched] = useState(!creating);
  const [step, setStep] = useState<StepId>("identity");
  const [starter, setStarter] = useState<CustomStarter>("attestation");
  const [copyOf, setCopyOf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const letterheadRef = useRef<HTMLInputElement>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const options = useMemo(() => docFontOptions(fonts), [fonts]);
  const fontCss = useMemo(() => fontFaceCss(fonts), [fonts]);
  const listKinds = useMemo(() => kinds.filter((k) => k.is_active), [kinds]);
  const inputs = rows.map((r) => r.input);
  const current: CustomDocDefInput = { ...def, inputs };
  const readOnly = !canEdit;

  const setPage = (patch: Partial<PageSetup>) => setDef((d) => ({ ...d, page: { ...d.page, ...patch } }));

  const preview = useMemo(() => {
    if (step !== "page" && step !== "font" && step !== "numbering") return "";
    const letterhead = customLetterhead(def.page, companyLetterhead);
    const sample = customDocSample({ ...def, inputs }, employeeFields, { company, letterheadUrl: letterhead });
    const html = starterTemplate({ ...def, name_fr: def.name_fr || "Titre du document" }, creating ? starter : "letter", fontStack(def.page.font_family, options));
    return withFontFaces(renderTemplate(html, sample), fontCss);
  }, [step, def, inputs, employeeFields, company, companyLetterhead, creating, starter, options, fontCss]);

  const sampleReference = formatReference(def.numbering, {
    seq: 1,
    isoDate: new Date().toISOString().slice(0, 10),
    prefix: company.doc_prefix,
    code: def.code || "CODE",
  });

  function setName(name_fr: string) {
    setDef((d) => ({ ...d, name_fr, code: codeTouched ? d.code : suggestCode(name_fr) }));
  }

  function setLang(lang: CustomDocDefInput["lang"]) {
    setDef((d) => {
      const font = d.page.font_family;
      const swap = creating && (font === "Roboto" || font === "Amiri");
      return { ...d, lang, page: swap ? { ...d.page, font_family: lang === "ar" || lang === "bi" ? "Amiri" : "Roboto" } : d.page };
    });
  }

  function updateRow(uid: string, patch: Partial<CustomInput>) {
    setRows((list) =>
      list.map((r) => {
        if (r.uid !== uid) return r;
        const input = { ...r.input, ...patch };
        if (patch.label_fr !== undefined && r.autoKey) {
          const taken = list.filter((o) => o.uid !== uid).map((o) => o.input.key);
          input.key = uniqueKey(suggestInputKey(patch.label_fr), taken);
        }
        return { ...r, input, autoKey: patch.key !== undefined ? false : r.autoKey };
      }),
    );
  }

  function addRow() {
    setRows((list) => [
      ...list,
      {
        uid: nextUid(),
        autoKey: true,
        input: {
          key: uniqueKey("champ", list.map((r) => r.input.key)),
          label_fr: "",
          label_ar: "",
          type: "text",
          list_kind: "",
          required: false,
          default_value: "",
        },
      },
    ]);
  }

  function moveRow(uid: string, delta: number) {
    setRows((list) => {
      const i = list.findIndex((r) => r.uid === uid);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function uploadLetterhead() {
    const file = letterheadRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    const r = await uploadDocAsset("letterhead", file);
    setUploading(false);
    if (letterheadRef.current) letterheadRef.current.value = "";
    if (!r.ok) return setError(r.error);
    setPage({ letterhead: "custom", letterhead_url: r.url });
  }

  function stepError(id: StepId): string | null {
    if (id === "identity") {
      if (!def.name_fr.trim()) return "Donnez un nom au document.";
      if (!/^[a-z0-9_]{2,40}$/.test(def.code)) return "Code : 2 à 40 caractères, lettres minuscules, chiffres et _.";
      if (creating && others.some((o) => o.code === def.code)) return `Le code « ${def.code} » est déjà utilisé.`;
    }
    if (id === "inputs") {
      const missing = inputs.find((i) => !i.label_fr.trim());
      if (missing) return "Chaque champ à saisir a besoin d'un libellé.";
      const badKey = inputs.find((i) => !/^[a-z][a-z0-9_]{0,39}$/.test(i.key));
      if (badKey) return `Clé « ${badKey.key} » : commence par une lettre, puis lettres minuscules, chiffres et _.`;
      const keys = inputs.map((i) => i.key);
      const dup = keys.find((k, i) => keys.indexOf(k) !== i);
      if (dup) return `La clé « ${dup} » est utilisée deux fois.`;
      const noList = inputs.find((i) => i.type === "list" && !i.list_kind);
      if (noList) return `Choisissez la liste du champ « ${noList.label_fr} ».`;
    }
    if (id === "page" && def.page.letterhead === "custom" && !def.page.letterhead_url) {
      return "Importez l'image du papier à en-tête, ou choisissez une autre option.";
    }
    if (id === "numbering" && def.numbering.enabled && !def.numbering.pattern.includes("{seq}")) {
      return "Le modèle de référence doit contenir {seq} (le numéro).";
    }
    return null;
  }

  function go(target: number) {
    if (target > stepIndex) {
      for (let i = stepIndex; i < target; i += 1) {
        const problem = stepError(STEPS[i].id);
        if (problem) {
          setStep(STEPS[i].id);
          return setError(problem);
        }
      }
    }
    setError(null);
    setStep(STEPS[target].id);
  }

  function save() {
    for (const s of STEPS) {
      const problem = stepError(s.id);
      if (problem) {
        setStep(s.id);
        return setError(problem);
      }
    }
    const parsed = customDocDefInputSchema.safeParse(current);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Données invalides.");
    const startWith: CustomDocStart | undefined = creating ? (copyOf ? { copyOf } : { starter }) : undefined;
    setError(null);
    start(async () => {
      const r = await saveCustomDocDef(parsed.data, startWith);
      if (!r.ok) return setError(r.error);
      onSaved(r.data, creating);
    });
  }

  const sourceLocked = !creating;
  const groups = (["arabic", "latin", "upload", "system"] as FontGroup[]).map((g) => ({
    group: g,
    items: options.filter((o) => o.group === g),
  }));

  const body = (
    <div className="space-y-4">
      {step === "identity" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <RhField label="Nom du document (français)" required>
            <input className={rhInput} value={def.name_fr} maxLength={160} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
          </RhField>
          <RhField label="Nom du document (arabe)">
            <input
              className={rhInput}
              dir="rtl"
              value={def.name_ar}
              maxLength={160}
              disabled={readOnly}
              onChange={(e) => setDef((d) => ({ ...d, name_ar: e.target.value }))}
            />
          </RhField>
          <RhField
            label="Code"
            hint={creating ? "Identifiant court du document, repris dans la référence. Il ne pourra plus changer." : "Le code ne change plus après la création."}
          >
            <input
              className={rhInput}
              value={def.code}
              maxLength={40}
              disabled={readOnly || !creating}
              onChange={(e) => {
                setCodeTouched(true);
                setDef((d) => ({ ...d, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }));
              }}
            />
          </RhField>
          <RhField label="Rubrique">
            <select
              className={rhInput}
              value={def.family}
              disabled={readOnly}
              onChange={(e) => setDef((d) => ({ ...d, family: e.target.value as CustomDocDefInput["family"] }))}
            >
              {CUSTOM_DOC_FAMILIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fr}
                </option>
              ))}
            </select>
          </RhField>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[13px] font-semibold text-foreground/85">Langue du document</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {CUSTOM_DOC_LANGS.map((l) => (
                <button key={l.id} type="button" disabled={readOnly} className={choiceClass(def.lang === l.id)} onClick={() => setLang(l.id)}>
                  <span className="block text-sm font-semibold">{l.fr}</span>
                  <span className="block text-xs text-foreground/55" dir="rtl">
                    {l.ar}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === "source" ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground/60">
            D’où viennent les valeurs imprimées automatiquement ? À l’impression, on choisira l’employé puis, selon le cas, son
            contrat, son congé, sa mission ou sa sortie.
            {sourceLocked ? " La source ne change plus après la création." : ""}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CUSTOM_DOC_SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={readOnly || sourceLocked}
                className={`${choiceClass(def.source === s.id)} disabled:cursor-not-allowed ${sourceLocked && def.source !== s.id ? "opacity-50" : ""}`}
                onClick={() => setDef((d) => ({ ...d, source: s.id }))}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{s.fr}</span>
                  <span className="text-xs text-foreground/50" dir="rtl">
                    {s.ar}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-foreground/60">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "inputs" ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground/60">
            Ce que la personne qui imprime devra remplir (motif, destinataire, montant…). Chaque champ devient un élément à placer
            dans le modèle, rubrique « Saisie à l’impression ».
          </p>
          {rows.length ? (
            <ul className="space-y-2">
              {rows.map((row, i) => (
                <li key={row.uid} className="rounded-xl border border-border/70 bg-surface p-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_12rem]">
                    <RhField label="Libellé (FR)" required>
                      <input
                        className={rhInput}
                        value={row.input.label_fr}
                        maxLength={120}
                        disabled={readOnly}
                        onChange={(e) => updateRow(row.uid, { label_fr: e.target.value })}
                      />
                    </RhField>
                    <RhField label="Libellé (AR)">
                      <input
                        className={rhInput}
                        dir="rtl"
                        value={row.input.label_ar}
                        maxLength={120}
                        disabled={readOnly}
                        onChange={(e) => updateRow(row.uid, { label_ar: e.target.value })}
                      />
                    </RhField>
                    <RhField label="Type">
                      <select
                        className={rhInput}
                        value={row.input.type}
                        disabled={readOnly}
                        onChange={(e) => updateRow(row.uid, { type: e.target.value as CustomInput["type"] })}
                      >
                        {CUSTOM_INPUT_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.fr}
                          </option>
                        ))}
                      </select>
                    </RhField>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_12rem]">
                    {row.input.type === "list" ? (
                      <RhField label="Liste" required>
                        <select
                          className={rhInput}
                          value={row.input.list_kind}
                          disabled={readOnly}
                          onChange={(e) => updateRow(row.uid, { list_kind: e.target.value })}
                        >
                          <option value="">Choisir une liste…</option>
                          {listKinds.map((k) => (
                            <option key={k.code} value={k.code}>
                              {k.label_fr}
                            </option>
                          ))}
                        </select>
                      </RhField>
                    ) : (
                      <RhField label="Valeur proposée" hint="Optionnel : pré-remplie à l'impression.">
                        <input
                          className={rhInput}
                          type={row.input.type === "date" ? "date" : row.input.type === "number" || row.input.type === "amount" ? "number" : "text"}
                          value={row.input.default_value}
                          maxLength={2000}
                          disabled={readOnly || row.input.type === "bool"}
                          onChange={(e) => updateRow(row.uid, { default_value: e.target.value })}
                        />
                      </RhField>
                    )}
                    <RhField
                      label="Clé technique"
                      hint={creating ? "Proposée depuis le libellé." : "La changer retire ce champ des modèles qui l'utilisent."}
                    >
                      <input
                        className={rhInput}
                        value={row.input.key}
                        maxLength={40}
                        disabled={readOnly}
                        onChange={(e) => updateRow(row.uid, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                      />
                    </RhField>
                    <div className="flex items-end justify-between gap-2 pb-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.input.required}
                          disabled={readOnly}
                          onChange={(e) => updateRow(row.uid, { required: e.target.checked })}
                        />
                        Obligatoire
                      </label>
                      <span className="flex gap-1">
                        <Button variant="ghost" size="icon" disabled={readOnly || i === 0} onClick={() => moveRow(row.uid, -1)} aria-label="Monter">
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={readOnly || i === rows.length - 1}
                          onClick={() => moveRow(row.uid, 1)}
                          aria-label="Descendre"
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={readOnly}
                          onClick={() => setRows((list) => list.filter((r) => r.uid !== row.uid))}
                          aria-label="Supprimer"
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-foreground/55">
              Aucun champ à saisir : le document s’imprimera uniquement avec les données automatiques.
            </p>
          )}
          {rows.length < 40 ? (
            <Button variant="secondary" disabled={readOnly} onClick={addRow}>
              <Plus aria-hidden />
              Ajouter un champ
            </Button>
          ) : null}
        </div>
      ) : null}

      {step === "page" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Format">
              <select className={rhInput} value={def.page.size} disabled={readOnly} onChange={(e) => setPage({ size: e.target.value as PageSetup["size"] })}>
                {Object.entries(PAGE_SIZES).map(([id, [w, h]]) => (
                  <option key={id} value={id}>
                    {id} ({w} × {h} mm)
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label="Orientation">
              <select
                className={rhInput}
                value={def.page.orientation}
                disabled={readOnly}
                onChange={(e) => setPage({ orientation: e.target.value === "landscape" ? "landscape" : "portrait" })}
              >
                <option value="portrait">Portrait (verticale)</option>
                <option value="landscape">Paysage (horizontale)</option>
              </select>
            </RhField>
          </div>
          <div>
            <p className="mb-1 text-[13px] font-semibold text-foreground/85">Marges (mm)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberField label="Haut" value={def.page.margin_top} min={0} max={80} disabled={readOnly} onChange={(v) => setPage({ margin_top: v })} />
              <NumberField label="Bas" value={def.page.margin_bottom} min={0} max={80} disabled={readOnly} onChange={(v) => setPage({ margin_bottom: v })} />
              <NumberField label="Gauche" value={def.page.margin_left} min={0} max={60} disabled={readOnly} onChange={(v) => setPage({ margin_left: v })} />
              <NumberField label="Droite" value={def.page.margin_right} min={0} max={60} disabled={readOnly} onChange={(v) => setPage({ margin_right: v })} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-semibold text-foreground/85">Papier à en-tête</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  { id: "company", label: "Celui de l'entreprise", hint: "Image définie dans « Modèle de fiche »." },
                  { id: "custom", label: "Une image propre", hint: "Importée pour ce document seulement." },
                  { id: "none", label: "Sans en-tête", hint: "Page blanche." },
                ] as const
              ).map((o) => (
                <button key={o.id} type="button" disabled={readOnly} className={choiceClass(def.page.letterhead === o.id)} onClick={() => setPage({ letterhead: o.id })}>
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className="block text-xs text-foreground/55">{o.hint}</span>
                </button>
              ))}
            </div>
            {def.page.letterhead === "custom" ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input ref={letterheadRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadLetterhead} />
                <Button variant="secondary" disabled={readOnly || uploading} onClick={() => letterheadRef.current?.click()}>
                  <ImageUp aria-hidden />
                  {uploading ? "Envoi…" : def.page.letterhead_url ? "Remplacer l'image" : "Importer l'image (PNG, JPG)"}
                </Button>
                {def.page.letterhead_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={def.page.letterhead_url} alt="Papier à en-tête" className="h-16 rounded border border-border/70 bg-white object-contain" />
                ) : null}
                <span className="text-xs text-foreground/55">L’image couvre toute la page : préparez-la au format de la feuille.</span>
              </div>
            ) : null}
            {def.page.letterhead !== "none" ? (
              <div className="mt-3 max-w-xs">
                <RhField label="Pages où l'en-tête s'imprime">
                  <select
                    className={rhInput}
                    value={def.page.letterhead_pages}
                    disabled={readOnly}
                    onChange={(e) => setPage({ letterhead_pages: e.target.value === "first" ? "first" : "all" })}
                  >
                    <option value="all">Toutes les pages</option>
                    <option value="first">Première page seulement</option>
                  </select>
                </RhField>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="En-tête répété (mm)"
              hint="Bande en haut de chaque page pour un texte répété (nom de l'entreprise…). 0 = aucun."
              value={def.page.header_height}
              min={0}
              max={80}
              disabled={readOnly}
              onChange={(v) => setPage({ header_height: v })}
            />
            <NumberField
              label="Pied de page répété (mm)"
              hint="Bande en bas de chaque page (adresse, téléphone…). 0 = aucun."
              value={def.page.footer_height}
              min={0}
              max={80}
              disabled={readOnly}
              onChange={(v) => setPage({ footer_height: v })}
            />
            <RhField label="Numéros de page">
              <select
                className={rhInput}
                value={def.page.page_numbers}
                disabled={readOnly}
                onChange={(e) => setPage({ page_numbers: e.target.value as PageSetup["page_numbers"] })}
              >
                <option value="none">Aucun</option>
                <option value="left">En bas à gauche</option>
                <option value="center">En bas au centre</option>
                <option value="right">En bas à droite</option>
              </select>
            </RhField>
            {def.page.page_numbers !== "none" ? (
              <RhField label="Texte du numéro">
                <select
                  className={rhInput}
                  value={def.page.page_number_label}
                  disabled={readOnly}
                  onChange={(e) => setPage({ page_number_label: e.target.value as PageSetup["page_number_label"] })}
                >
                  <option value="fr">Page 1 / 2</option>
                  <option value="ar">صفحة 1 من 2</option>
                  <option value="plain">1 / 2</option>
                </select>
              </RhField>
            ) : null}
            <RhField label="Filigrane" hint="Texte en diagonale derrière le document (ex. COPIE). Vide = aucun.">
              <input
                className={rhInput}
                value={def.page.watermark}
                maxLength={60}
                disabled={readOnly}
                onChange={(e) => setPage({ watermark: e.target.value })}
              />
            </RhField>
          </div>
        </div>
      ) : null}

      {step === "font" ? (
        <div className="space-y-4">
          <RhField label="Police du document" hint="Les polices importées se gèrent dans l'onglet « Polices ».">
            <select className={rhInput} value={def.page.font_family} disabled={readOnly} onChange={(e) => setPage({ font_family: e.target.value })}>
              {groups.map(({ group, items }) =>
                items.length ? (
                  <optgroup key={group} label={FONT_GROUP_LABELS[group]}>
                    {items.map((o) => (
                      <option key={o.family} value={o.family}>
                        {o.family}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )}
            </select>
          </RhField>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Taille du texte (pt)" value={def.page.font_size} min={7} max={24} step={0.5} disabled={readOnly} onChange={(v) => setPage({ font_size: v })} />
            <NumberField label="Interligne" value={def.page.line_height} min={1} max={2.5} step={0.05} disabled={readOnly} onChange={(v) => setPage({ line_height: v })} />
          </div>
          <div className="rounded-xl border border-border/70 bg-white px-4 py-3 text-black">
            <style>{fontCss}</style>
            <p style={{ fontFamily: fontStack(def.page.font_family, options), fontSize: `${def.page.font_size}pt`, lineHeight: def.page.line_height }}>
              Nous soussignés attestons que Monsieur BENALI Karim est employé au sein de notre société.
            </p>
            <p dir="rtl" style={{ fontFamily: fontStack(def.page.font_family, options), fontSize: `${def.page.font_size}pt`, lineHeight: def.page.line_height }}>
              نحن الممضين أسفله نشهد أن السيد بن علي كريم يعمل لدى مؤسستنا.
            </p>
          </div>
        </div>
      ) : null}

      {step === "numbering" ? (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={def.numbering.enabled}
              disabled={readOnly}
              onChange={(e) => setDef((d) => ({ ...d, numbering: { ...d.numbering, enabled: e.target.checked } }))}
            />
            Donner une référence numérotée à chaque impression
          </label>
          {def.numbering.enabled ? (
            <>
              <RhField label="Modèle de référence">
                <input
                  className={rhInput}
                  value={def.numbering.pattern}
                  maxLength={80}
                  disabled={readOnly}
                  onChange={(e) => setDef((d) => ({ ...d, numbering: { ...d.numbering, pattern: e.target.value } }))}
                />
              </RhField>
              <div className="flex flex-wrap gap-1.5">
                {TOKENS.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    disabled={readOnly}
                    className="rounded-lg border border-border/70 bg-surface px-2 py-1 text-xs hover:border-brand"
                    onClick={() => setDef((d) => ({ ...d, numbering: { ...d.numbering, pattern: `${d.numbering.pattern}${t.token}` } }))}
                    title={t.label}
                  >
                    <code>{t.token}</code> {t.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <RhField label="Remise à zéro">
                  <select
                    className={rhInput}
                    value={def.numbering.reset}
                    disabled={readOnly}
                    onChange={(e) =>
                      setDef((d) => ({ ...d, numbering: { ...d.numbering, reset: e.target.value === "never" ? "never" : "yearly" } }))
                    }
                  >
                    <option value="yearly">Chaque année (repart à 1 en janvier)</option>
                    <option value="never">Jamais (numéro continu)</option>
                  </select>
                </RhField>
                <NumberField
                  label="Chiffres du numéro"
                  value={def.numbering.pad}
                  min={1}
                  max={8}
                  disabled={readOnly}
                  onChange={(v) => setDef((d) => ({ ...d, numbering: { ...d.numbering, pad: v } }))}
                />
              </div>
              <RhAlert tone="info">
                Exemple de première référence : <b>{sampleReference || "—"}</b>
              </RhAlert>
            </>
          ) : null}

          {creating ? (
            <div className="space-y-2 border-t border-border/60 pt-4">
              <p className="text-[13px] font-semibold text-foreground/85">Point de départ du modèle</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CUSTOM_STARTERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={choiceClass(!copyOf && starter === s.id)}
                    onClick={() => {
                      setCopyOf("");
                      setStarter(s.id);
                    }}
                  >
                    <span className="block text-sm font-semibold">{s.fr}</span>
                    <span className="block text-xs text-foreground/55">{s.hint}</span>
                  </button>
                ))}
              </div>
              {others.length ? (
                <RhField label="Ou copier un document déjà créé">
                  <select className={rhInput} value={copyOf} onChange={(e) => setCopyOf(e.target.value)}>
                    <option value="">— Ne pas copier —</option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name_fr}
                      </option>
                    ))}
                  </select>
                </RhField>
              ) : null}
            </div>
          ) : (
            <RhAlert tone="warning">
              Une mise en page modifiée crée une nouvelle version du modèle : approuvez-la ensuite dans le concepteur pour qu’elle
              s’applique aux impressions.
            </RhAlert>
          )}
        </div>
      ) : null}
    </div>
  );

  const showPreview = step === "page" || step === "font" || step === "numbering";

  return (
    <RhModal
      title={creating ? "Créer un document" : `Paramètres — ${initial?.name_fr}`}
      subtitle={`Étape ${stepIndex + 1} sur ${STEPS.length} · ${STEPS[stepIndex].label}`}
      size="xl"
      onClose={onClose}
      tabs={
        <div className="flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                s.id === step ? "bg-brand text-white" : i < stepIndex ? "bg-brand/10 text-brand" : "text-foreground/60 hover:bg-surface-muted"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={stepIndex === 0} onClick={() => go(stepIndex - 1)}>
              Précédent
            </Button>
            {stepIndex < STEPS.length - 1 ? (
              <Button variant={creating ? "primary" : "secondary"} onClick={() => go(stepIndex + 1)}>
                Suivant
              </Button>
            ) : null}
            {canEdit && (!creating || stepIndex === STEPS.length - 1) ? (
              <Button disabled={pending || uploading} onClick={save}>
                {creating ? "Créer et ouvrir le concepteur" : "Enregistrer"}
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className={showPreview ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}>
        <div className="space-y-4">
          {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
          {body}
        </div>
        {showPreview ? (
          <div className="flex min-h-[36rem] flex-col">
            <p className="mb-1.5 text-xs text-foreground/55">
              Aperçu de la mise en page avec des valeurs d’exemple{creating ? "" : " (texte de démonstration)"}.
            </p>
            <DocFrame html={preview} pageWidth={pageWidthPx(def.page)} title="Aperçu de la mise en page" />
          </div>
        ) : null}
      </div>
    </RhModal>
  );
}
