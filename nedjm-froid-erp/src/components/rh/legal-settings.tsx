"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addLegalVarVersion,
  type LegalVarRow,
} from "@/lib/actions/hr-legal-vars";
import { IrgBaremeManager } from "@/components/rh/irg-bareme-manager";
import type { IrgCatalog } from "@/lib/actions/hr-irg";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhPageHeader,
  RhPanel,
  RhTableWrap,
  RhTabs,
  bi,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";

function pctDisplay(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n * 10000) / 100);
}

function numDisplay(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 4 }).format(n);
}

function VarEditor({
  rows,
  canEdit,
  titleFr,
  titleAr,
  asPercent,
}: {
  rows: LegalVarRow[];
  canEdit: boolean;
  titleFr: string;
  titleAr: string;
  asPercent: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { value: string; from: string }>>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const init: Record<string, { value: string; from: string }> = {};
    for (const row of rows) {
      init[row.id] = {
        value:
          row.current_numeric == null
            ? ""
            : asPercent
              ? String(Math.round(row.current_numeric * 10000) / 100)
              : String(row.current_numeric),
        from: today,
      };
    }
    return init;
  });

  function save(row: LegalVarRow) {
    const d = drafts[row.id];
    if (!d) return;
    setError(null);
    start(async () => {
      const result = await addLegalVarVersion(
        asPercent
          ? {
              var_id: row.id,
              effective_from: d.from,
              value_pct: Number(d.value.replace(",", ".")),
              as_percent: true,
            }
          : {
              var_id: row.id,
              effective_from: d.from,
              value_numeric: Number(d.value.replace(",", ".")),
              as_percent: false,
            },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(bi("Version enregistrée.", "تم حفظ النسخة."));
      window.location.reload();
    });
  }

  if (!rows.length) return null;

  return (
    <RhPanel>
      <h3 className="font-semibold">
        {titleFr} · {titleAr}
      </h3>
      {error ? <div className="mt-3"><RhAlert tone="danger">{error}</RhAlert></div> : null}
      {info ? <div className="mt-3"><RhAlert tone="success">{info}</RhAlert></div> : null}
      <div className="mt-3">
        <RhTableWrap>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/80">
              <tr>
                <th className={rhTh()}>{bi("Clé", "المفتاح")}</th>
                <th className={rhTh()}>{bi("Libellé", "التسمية")}</th>
                <th className={rhTh()}>{bi("Valeur actuelle", "القيمة الحالية")}</th>
                <th className={rhTh()}>{bi("Depuis", "سارية منذ")}</th>
                <th className={rhTh()}>{bi("Nouvelle valeur", "قيمة جديدة")}</th>
                <th className={rhTh()}>{bi("Effective au", "تسري من")}</th>
                <th className={rhTh()} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const d = drafts[row.id] ?? { value: "", from: "" };
                return (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className={`${rhTd()} font-mono text-xs`}>{row.key}</td>
                    <td className={rhTd()}>
                      {row.label_fr}
                      {row.label_ar ? (
                        <span className="mt-0.5 block text-xs text-foreground/55" dir="rtl">
                          {row.label_ar}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${rhTd()} whitespace-nowrap`}>
                      {asPercent
                        ? `${pctDisplay(row.current_numeric)} %`
                        : `${numDisplay(row.current_numeric)}${row.unit ? ` ${row.unit}` : ""}`}
                    </td>
                    <td className={rhTd()}>{row.effective_from ?? "—"}</td>
                    <td className={rhTd()}>
                      <input
                        className={rhInput}
                        disabled={!canEdit || pending}
                        value={d.value}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...d, value: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className={rhTd()}>
                      <input
                        className={rhInput}
                        type="date"
                        disabled={!canEdit || pending}
                        value={d.from}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...d, from: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className={rhTd()}>
                      {canEdit ? (
                        <Button disabled={pending} onClick={() => save(row)}>
                          {bi("Enregistrer", "حفظ")}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </RhTableWrap>
      </div>
      {!canEdit ? (
        <p className="mt-3 text-xs text-foreground/55">
          {bi(
            "Lecture seule : modification réservée à SUPER_ADMIN, ADMIN_RH et ADMIN_FINANCE (unité 05).",
            "للاطلاع فقط: التعديل محصور في SUPER_ADMIN و ADMIN_RH و ADMIN_FINANCE (الوحدة 05).",
          )}
        </p>
      ) : null}
    </RhPanel>
  );
}

export function LegalSettings({
  vars,
  irgCatalog,
  canEdit,
  loadError,
  initialSection = "cnas",
}: {
  vars: LegalVarRow[];
  irgCatalog: IrgCatalog;
  canEdit: boolean;
  loadError?: string;
  initialSection?: "cnas" | "cacobatph" | "irg" | "other";
}) {
  const [section, setSection] = useState(initialSection);
  const cnas = useMemo(() => vars.filter((v) => v.group === "cnas"), [vars]);
  const caco = useMemo(() => vars.filter((v) => v.group === "cacobatph"), [vars]);
  const irgZones = useMemo(() => vars.filter((v) => v.group === "irg"), [vars]);
  const other = useMemo(() => vars.filter((v) => v.group === "other"), [vars]);

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Cotisations & impôts", "الاشتراكات والضرائب")}
        description={bi(
          "Une seule fenêtre : CNAS, CACOBATPH et barème IRG. Les bulletins lisent ces valeurs.",
          "نافذة واحدة: الضمان، كاكوباتف، وسلم الضريبة. الكشوف تقرأ هذه القيم.",
        )}
      />

      {loadError ? <RhAlert tone="danger">{loadError}</RhAlert> : null}

      <RhTabs
        items={[
          { id: "cnas", label: "CNAS" },
          { id: "cacobatph", label: "CACOBATPH" },
          { id: "irg", label: "IRG" },
          { id: "other", label: bi("Autres (SNMG…)", "أخرى (الأجر الأدنى…)") },
        ]}
        value={section}
        onChange={(id) => setSection(id as typeof section)}
      />

      {section === "cnas" ? (
        <VarEditor
          rows={cnas}
          canEdit={canEdit}
          titleFr="CNAS — cotisations de sécurité sociale"
          titleAr="الضمان الاجتماعي — نسب الاشتراك"
          asPercent
        />
      ) : null}
      {section === "cacobatph" ? (
        <VarEditor
          rows={caco}
          canEdit={canEdit}
          titleFr="CACOBATPH — congés et intempéries"
          titleAr="كاكوباتف — العطل وانقطاعات الطقس"
          asPercent
        />
      ) : null}
      {section === "other" ? (
        <VarEditor
          rows={other}
          canEdit={canEdit}
          titleFr="Paramètres liés à la paie"
          titleAr="معاملات مرتبطة بالأجور"
          asPercent={false}
        />
      ) : null}
      {section === "irg" ? (
        <>
          <VarEditor
            rows={irgZones}
            canEdit={canEdit}
            titleFr="Abattement IRG par zone (Sud / Extrême Sud)"
            titleAr="تخفيض IRG حسب المنطقة (الجنوب / أقصى الجنوب)"
            asPercent
          />
          {irgZones.length ? (
            <p className="text-xs text-foreground/55">
              {bi(
                "0 % tant que le taux n'est pas confirmé. La zone d'un chantier se règle sur sa fiche, ou via la liste « Wilaya → zone IRG » des paramètres RH.",
                "0% إلى أن تُؤكَّد النسبة. منطقة الورشة تُضبط في بطاقتها أو عبر قائمة ربط الولاية بالمنطقة في إعدادات الموارد البشرية.",
              )}
            </p>
          ) : null}
          <RhPanel>
            <IrgBaremeManager catalog={irgCatalog} canEdit={canEdit} />
          </RhPanel>
        </>
      ) : null}

      {section !== "irg" ? (
        <p className="text-xs text-foreground/55">
          {bi(
            "Sur le bulletin : CSS salariale et CSS patronale (employeur + FOS). Détail des branches dans les déclarations.",
            "على الكشف: ضمان العامل وضمان المؤسسة (مع FOS). تفصيل الفروع في التصاريح.",
          )}
        </p>
      ) : null}
    </div>
  );
}
