"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  saveHrFicheSettings,
  uploadHrFicheLetterhead,
} from "@/lib/actions/hr-fiche";
import {
  updateHrEmployeeFieldMeta,
  type HrEmployeeField,
} from "@/lib/actions/hr-employees";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhField,
  RhPageHeader,
  RhPanel,
  RhSectionTitle,
  RhTableWrap,
  RhToolbar,
  bi,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";
import { buildOfficialFicheHtml } from "@/components/rh/employee-fiche-print";
import type { CatalogItem } from "@/lib/actions/hr-catalogs";
import type { FicheSection, HrFicheSettings } from "@/lib/hr/fiche-settings";
import { DocumentRequirementsManager } from "@/components/rh/document-requirements-manager";

function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.width = "794px";
  frame.style.height = "1123px";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 1500);
  };
  window.setTimeout(run, 250);
}

function FieldSelect({
  value,
  fields,
  onChange,
}: {
  value: string;
  fields: HrEmployeeField[];
  onChange: (value: string) => void;
}) {
  return (
    <select className={rhInput} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {fields.map((field) => (
        <option key={field.code} value={field.code}>
          {field.label_fr} ({field.code})
        </option>
      ))}
    </select>
  );
}

function CodeListEditor({
  codes,
  fields,
  onChange,
}: {
  codes: string[];
  fields: HrEmployeeField[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {codes.map((code, index) => (
        <div key={`${code}-${index}`} className="flex gap-2">
          <FieldSelect
            value={code}
            fields={fields}
            onChange={(next) => {
              const copy = [...codes];
              copy[index] = next;
              onChange(copy.filter(Boolean));
            }}
          />
          <Button
            variant="ghost"
            onClick={() => onChange(codes.filter((_, i) => i !== index))}
          >
            Supprimer
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() => onChange([...codes, fields[0]?.code ?? "last_name"])}
      >
        Ajouter un champ
      </Button>
    </div>
  );
}

export function FicheSettingsManager({
  initial,
  fields,
  catalogs,
  isSuperAdmin = false,
}: {
  initial: HrFicheSettings;
  fields: HrEmployeeField[];
  catalogs: CatalogItem[];
  isSuperAdmin?: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [fieldRows, setFieldRows] = useState(fields);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const letterhead = form.letterhead_url || "/hr-letterhead.png";

  const sampleValues = useMemo(() => {
    const values: Record<string, string> = { matricule: "00/00" };
    for (const field of fieldRows) {
      if (field.code === "last_name") values[field.code] = "NOM";
      else if (field.code === "first_name") values[field.code] = "Prenom";
      else values[field.code] = values[field.code] ?? "";
    }
    return values;
  }, [fieldRows]);

  function set<K extends keyof HrFicheSettings>(key: K, value: HrFicheSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setSection(index: number, patch: Partial<FicheSection>) {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section, i) =>
        i === index ? { ...section, ...patch } : section,
      ),
    }));
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Modèle de fiche employé", "نموذج بطاقة العامل")}
        description={bi(
          "En-tête, titre, champs, sections et signatures se règlent ici. L’impression lit cet écran.",
          "الترويسة، العنوان، الحقول، الأقسام والتواقيع تُغيَّر من هنا. الطباعة تقرأ هذه الشاشة.",
        )}
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}

      <RhPanel>
        <RhSectionTitle>{bi("En-tête et titre", "الترويسة والعنوان")}</RhSectionTitle>
        <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={letterhead}
              alt=""
              className="h-40 w-full rounded-xl border border-border/70 object-cover object-top"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const data = new FormData();
                data.set("file", file);
                start(async () => {
                  const result = await uploadHrFicheLetterhead(data);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  set("letterhead_url", result.data.url);
                  setInfo("En-tête entreprise chargé.");
                });
              }}
            />
            <Button
              className="mt-2 w-full"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              Charger l’en-tête
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <RhField label="Titre du document">
              <input
                className={rhInput}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </RhField>
            <RhField label="Libellé matricule">
              <input
                className={rhInput}
                value={form.matricule_label}
                onChange={(e) => set("matricule_label", e.target.value)}
              />
            </RhField>
            <RhField label="Préfixe téléphone">
              <input
                className={rhInput}
                value={form.phone_prefix}
                onChange={(e) => set("phone_prefix", e.target.value)}
              />
            </RhField>
            <RhField label="Champs téléphone (codes)">
              <input
                className={rhInput}
                value={form.phone_codes.join(",")}
                onChange={(e) =>
                  set(
                    "phone_codes",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
              />
            </RhField>
          </div>
        </div>
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>{bi("Signatures", "التواقيع")}</RhSectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RhField label="Gauche · titre">
            <input
              className={rhInput}
              value={form.sig_left_title}
              onChange={(e) => set("sig_left_title", e.target.value)}
            />
          </RhField>
          <RhField label="Gauche · 2ᵉ ligne">
            <input
              className={rhInput}
              value={form.sig_left_sub}
              onChange={(e) => set("sig_left_sub", e.target.value)}
            />
          </RhField>
          <RhField label="Droite · titre">
            <input
              className={rhInput}
              value={form.sig_right_title}
              onChange={(e) => set("sig_right_title", e.target.value)}
            />
          </RhField>
          <RhField label="Droite · ligne 1">
            <input
              className={rhInput}
              value={form.sig_right_line1}
              onChange={(e) => set("sig_right_line1", e.target.value)}
            />
          </RhField>
          <RhField label="Droite · ligne 2">
            <input
              className={rhInput}
              value={form.sig_right_line2}
              onChange={(e) => set("sig_right_line2", e.target.value)}
            />
          </RhField>
        </div>
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>{bi("Identité en haut de page", "الهوية أعلى الصفحة")}</RhSectionTitle>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-foreground/60">Colonne gauche</p>
            <CodeListEditor
              codes={form.identity_left}
              fields={fieldRows}
              onChange={(next) => set("identity_left", next)}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-foreground/60">Colonne droite</p>
            <CodeListEditor
              codes={form.identity_right}
              fields={fieldRows}
              onChange={(next) => set("identity_right", next)}
            />
          </div>
        </div>
      </RhPanel>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RhSectionTitle>{bi("Sections d’impression", "أقسام الطباعة")}</RhSectionTitle>
          <Button
            variant="secondary"
            onClick={() =>
              set("sections", [
                ...form.sections,
                {
                  id: `sec_${Date.now()}`,
                  title: "NOUVELLE SECTION",
                  rows: [[fieldRows.find((f) => f.is_active)?.code || "email"]],
                },
              ])
            }
          >
            Ajouter une section
          </Button>
        </div>
        {form.sections.map((section, sIndex) => (
          <RhPanel key={section.id}>
            <div className="flex flex-wrap items-end gap-3">
              <RhField label="Titre de section">
                <input
                  className={rhInput}
                  value={section.title}
                  onChange={(e) => setSection(sIndex, { title: e.target.value })}
                />
              </RhField>
              <Button
                variant="ghost"
                onClick={() =>
                  set(
                    "sections",
                    form.sections.filter((_, i) => i !== sIndex),
                  )
                }
              >
                Supprimer la section
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              {section.rows.map((row, rIndex) => (
                <div key={`${section.id}-${rIndex}`} className="flex flex-wrap items-center gap-2">
                  {row.map((code, cIndex) => (
                    <div key={`${code}-${cIndex}`} className="min-w-[180px] flex-1">
                      <FieldSelect
                        value={code}
                        fields={fieldRows}
                        onChange={(next) => {
                          const rows = section.rows.map((line, i) =>
                            i === rIndex
                              ? line.map((item, j) => (j === cIndex ? next : item)).filter(Boolean)
                              : line,
                          );
                          setSection(sIndex, { rows });
                        }}
                      />
                    </div>
                  ))}
                  {row.length < 4 ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const extra = fieldRows.find((f) => f.is_active)?.code || "email";
                        const rows = section.rows.map((line, i) =>
                          i === rIndex ? [...line, extra] : line,
                        );
                        setSection(sIndex, { rows });
                      }}
                    >
                      Champ sur la même ligne
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setSection(sIndex, {
                        rows: section.rows.filter((_, i) => i !== rIndex),
                      })
                    }
                  >
                    Supprimer la ligne
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() =>
                  setSection(sIndex, {
                    rows: [
                      ...section.rows,
                      [fieldRows.find((f) => f.is_active)?.code || "email"],
                    ],
                  })
                }
              >
                Nouvelle ligne
              </Button>
            </div>
          </RhPanel>
        ))}
      </div>

      <RhPanel>
        <RhSectionTitle>{bi("Libellés des champs", "تسميات الحقول (النموذج والطباعة)")}</RhSectionTitle>
        <p className="mb-3 text-xs text-foreground/55">
          Modifiez le libellé, la section ou l&apos;ordre ici. Masquer un champ le retire de la
          fiche sans effacer les données.
          {isSuperAdmin
            ? " Obligatoire / optionnel : réservé à SUPER_ADMIN."
            : " Le basculement obligatoire/optionnel est réservé à SUPER_ADMIN."}
        </p>
        <RhTableWrap>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/80">
              <tr>
                <th className={rhTh()}>FR</th>
                <th className={rhTh()}>AR</th>
                <th className={rhTh()}>Section FR</th>
                <th className={rhTh()}>Section AR</th>
                <th className={rhTh()}>Ordre</th>
                <th className={rhTh()}>Visible</th>
                <th className={rhTh()}>Obligatoire</th>
                <th className={rhTh()} />
              </tr>
            </thead>
            <tbody>
              {fieldRows
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((field) => (
                  <tr key={field.id} className="border-t border-border/60">
                    <td className={`${rhTd()} pr-2`}>
                      <input
                        className={rhInput}
                        value={field.label_fr}
                        onChange={(e) =>
                          setFieldRows((prev) =>
                            prev.map((f) =>
                              f.id === field.id ? { ...f, label_fr: e.target.value } : f,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className={`${rhTd()} pr-2`}>
                      <input
                        dir="rtl"
                        className={rhInput}
                        value={field.label_ar}
                        onChange={(e) =>
                          setFieldRows((prev) =>
                            prev.map((f) =>
                              f.id === field.id ? { ...f, label_ar: e.target.value } : f,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className={`${rhTd()} pr-2`}>
                      <input
                        className={rhInput}
                        value={field.section_fr ?? ""}
                        onChange={(e) =>
                          setFieldRows((prev) =>
                            prev.map((f) =>
                              f.id === field.id ? { ...f, section_fr: e.target.value } : f,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className={`${rhTd()} pr-2`}>
                      <input
                        dir="rtl"
                        className={rhInput}
                        value={field.section_ar ?? ""}
                        onChange={(e) =>
                          setFieldRows((prev) =>
                            prev.map((f) =>
                              f.id === field.id ? { ...f, section_ar: e.target.value } : f,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className={`${rhTd()} pr-2`}>
                      <input
                        type="number"
                        className={rhInput}
                        value={field.sort_order}
                        onChange={(e) =>
                          setFieldRows((prev) =>
                            prev.map((f) =>
                              f.id === field.id
                                ? { ...f, sort_order: Number(e.target.value) || 0 }
                                : f,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className={`${rhTd()} pr-2`}>
                      <input
                        type="checkbox"
                        checked={field.is_active}
                        onChange={(e) =>
                          setFieldRows((prev) =>
                            prev.map((f) =>
                              f.id === field.id ? { ...f, is_active: e.target.checked } : f,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className={`${rhTd()} pr-2`}>
                      <input
                        type="checkbox"
                        checked={field.is_required}
                        disabled={!isSuperAdmin}
                        onChange={(e) =>
                          setFieldRows((prev) =>
                            prev.map((f) =>
                              f.id === field.id ? { ...f, is_required: e.target.checked } : f,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className={rhTd()}>
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          start(async () => {
                            const result = await updateHrEmployeeFieldMeta({
                              id: field.id,
                              label_ar: field.label_ar,
                              label_fr: field.label_fr,
                              section_ar: field.section_ar,
                              section_fr: field.section_fr,
                              sort_order: field.sort_order,
                              is_active: field.is_active,
                              ...(isSuperAdmin ? { is_required: field.is_required } : {}),
                            });
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            setInfo(`${field.label_fr} enregistré.`);
                          });
                        }}
                      >
                        Enregistrer le champ
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </RhTableWrap>
      </RhPanel>

      <RhToolbar>
        <Button
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const payload = {
                ...form,
                identity_left: form.identity_left.filter(Boolean),
                identity_right: form.identity_right.filter(Boolean),
                sections: form.sections.map((section) => ({
                  ...section,
                  rows: section.rows
                    .map((row) => row.filter(Boolean))
                    .filter((row) => row.length > 0),
                })),
              };
              const result = await saveHrFicheSettings(payload);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setForm(result.data);
              setInfo("Modèle d’impression enregistré.");
            });
          }}
        >
          Enregistrer le modèle
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            printHtml(
              buildOfficialFicheHtml(
                sampleValues,
                catalogs,
                fieldRows,
                form,
                window.location.origin,
              ),
            )
          }
        >
          Aperçu impression
        </Button>
      </RhToolbar>

      <DocumentRequirementsManager catalogs={catalogs} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}

