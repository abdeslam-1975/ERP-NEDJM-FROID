"use client";

import { useMemo, useState, useTransition } from "react";
import {
  upsertCatalogItem,
  upsertCatalogKind,
  upsertLegend,
  type CatalogItem,
  type CatalogKind,
  type LegendRow,
} from "@/lib/actions/hr-catalogs";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhField,
  RhPageHeader,
  RhPanel,
  RhSectionTitle,
  RhTableWrap,
  bi,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";

export function CatalogsManager({
  kinds,
  items,
  legends,
  loadError,
}: {
  kinds: CatalogKind[];
  items: CatalogItem[];
  legends: LegendRow[];
  loadError?: string;
}) {
  const [kindList, setKindList] = useState(kinds);
  const [rows, setRows] = useState(items);
  const [legendRows, setLegendRows] = useState(legends);
  const [kind, setKind] = useState(kinds[0]?.code ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [newKind, setNewKind] = useState({
    code: "",
    label_ar: "",
    label_fr: "",
  });
  const [form, setForm] = useState({
    id: "",
    code: "",
    label_ar: "",
    label_fr: "",
    extra: "{}",
    sort_order: 10,
  });
  const [legForm, setLegForm] = useState({
    id: "",
    code: "",
    label_fr: "",
    label_ar: "",
    coefficient: 1,
    color_bg: "#10b981",
    color_fg: "#FFFFFF",
    source_mode: "BOTH",
    counts_as_presence: true,
  });

  const filtered = useMemo(
    () => rows.filter((r) => r.kind === kind),
    [rows, kind],
  );

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Paramètres RH", "إعدادات الموارد البشرية")}
        description={bi(
          "Les listes et codes s’ajoutent ici. Rien n’est figé dans le programme.",
          "القوائم والرموز تُضاف من هنا. لا تُثبَّت في البرنامج.",
        )}
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}

      <RhPanel>
        <RhSectionTitle>{bi("Types de listes", "أنواع القوائم")}</RhSectionTitle>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            className={rhInput}
            placeholder="code (job_title)"
            value={newKind.code}
            onChange={(e) => setNewKind({ ...newKind, code: e.target.value })}
          />
          <input
            className={rhInput}
            placeholder="Libellé FR"
            value={newKind.label_fr}
            onChange={(e) => setNewKind({ ...newKind, label_fr: e.target.value })}
          />
          <input
            className={rhInput}
            dir="rtl"
            placeholder="التسمية"
            value={newKind.label_ar}
            onChange={(e) => setNewKind({ ...newKind, label_ar: e.target.value })}
          />
          <Button
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await upsertCatalogKind(newKind);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setKindList((prev) => {
                  if (prev.some((k) => k.code === r.data.code)) return prev;
                  return [
                    ...prev,
                    {
                      code: r.data.code,
                      label_ar: newKind.label_ar,
                      label_fr: newKind.label_fr,
                      extra_hint: null,
                      sort_order: 0,
                      is_active: true,
                    },
                  ];
                });
                setKind(r.data.code);
                setInfo("Type de liste enregistré.");
              });
            }}
          >
            Ajouter le type
          </Button>
        </div>
      </RhPanel>

      <RhPanel>
        <div className="flex flex-wrap items-end gap-3">
          <RhField label={bi("Liste", "القائمة")}>
            <select
              className={rhInput}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {kindList.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.label_fr} — {k.label_ar}
                </option>
              ))}
            </select>
          </RhField>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <input
            className={rhInput}
            placeholder="Code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <input
            className={rhInput}
            placeholder="Libellé FR"
            value={form.label_fr}
            onChange={(e) => setForm({ ...form, label_fr: e.target.value })}
          />
          <input
            className={rhInput}
            dir="rtl"
            placeholder="التسمية"
            value={form.label_ar}
            onChange={(e) => setForm({ ...form, label_ar: e.target.value })}
          />
          <input
            className={rhInput}
            placeholder='Extra JSON {"work_days":28}'
            value={form.extra}
            onChange={(e) => setForm({ ...form, extra: e.target.value })}
          />
          <Button
            disabled={pending}
            onClick={() => {
              setError(null);
              let extra: Record<string, unknown> = {};
              try {
                extra = form.extra.trim() ? JSON.parse(form.extra) : {};
              } catch {
                setError("JSON extra invalide.");
                return;
              }
              start(async () => {
                const r = await upsertCatalogItem({
                  id: form.id || undefined,
                  kind,
                  code: form.code,
                  label_ar: form.label_ar,
                  label_fr: form.label_fr,
                  extra,
                  sort_order: form.sort_order,
                  is_active: true,
                });
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setRows((prev) => {
                  const next: CatalogItem = {
                    id: r.data.id,
                    kind,
                    code: form.code,
                    label_ar: form.label_ar,
                    label_fr: form.label_fr,
                    extra,
                    color_bg: null,
                    color_fg: null,
                    sort_order: form.sort_order,
                    is_active: true,
                  };
                  return [...prev.filter((x) => x.id !== r.data.id), next];
                });
                setForm({
                  id: "",
                  code: "",
                  label_ar: "",
                  label_fr: "",
                  extra: "{}",
                  sort_order: 10,
                });
                setInfo("Valeur enregistrée.");
              });
            }}
          >
            Enregistrer
          </Button>
        </div>
        <div className="mt-4">
          <RhTableWrap>
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/70 bg-surface-muted/80">
                <tr>
                  <th className={rhTh()}>Code</th>
                  <th className={rhTh()}>FR</th>
                  <th className={rhTh()}>AR</th>
                  <th className={rhTh()} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className={`${rhTd()} font-mono text-xs`}>{row.code}</td>
                    <td className={rhTd()}>{row.label_fr}</td>
                    <td className={rhTd()} dir="rtl">
                      {row.label_ar}
                    </td>
                    <td className={rhTd()}>
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand"
                        onClick={() =>
                          setForm({
                            id: row.id,
                            code: row.code,
                            label_ar: row.label_ar,
                            label_fr: row.label_fr,
                            extra: JSON.stringify(row.extra ?? {}),
                            sort_order: row.sort_order,
                          })
                        }
                      >
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RhTableWrap>
        </div>
      </RhPanel>

      <RhPanel>
        <RhSectionTitle>{bi("Légendes de présence", "رموز الحضور")}</RhSectionTitle>
        <p className="mb-3 text-xs text-foreground/55">
          الرموز وأثرها الزمني يُعدَّلان هنا. المحرك يقرأ المعامل من القاعدة.
        </p>
        <div className="grid gap-3 sm:grid-cols-6">
          <input
            className={rhInput}
            placeholder="P"
            value={legForm.code}
            onChange={(e) => setLegForm({ ...legForm, code: e.target.value })}
          />
          <input
            className={rhInput}
            placeholder="Présent"
            value={legForm.label_fr}
            onChange={(e) => setLegForm({ ...legForm, label_fr: e.target.value })}
          />
          <input
            className={rhInput}
            dir="rtl"
            placeholder="حاضر"
            value={legForm.label_ar}
            onChange={(e) => setLegForm({ ...legForm, label_ar: e.target.value })}
          />
          <input
            className={rhInput}
            type="number"
            step="0.001"
            value={legForm.coefficient}
            onChange={(e) =>
              setLegForm({ ...legForm, coefficient: Number(e.target.value) })
            }
          />
          <input
            className={rhInput}
            type="color"
            value={legForm.color_bg}
            onChange={(e) => setLegForm({ ...legForm, color_bg: e.target.value })}
          />
          <Button
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await upsertLegend({
                  id: legForm.id || undefined,
                  code: legForm.code,
                  label_fr: legForm.label_fr,
                  label_ar: legForm.label_ar,
                  coefficient: legForm.coefficient,
                  color_bg: legForm.color_bg,
                  color_fg: legForm.color_fg,
                  source_mode: legForm.source_mode,
                  counts_as_presence: legForm.counts_as_presence,
                  triggers_an_passthrough: false,
                  is_active: true,
                });
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setLegendRows((prev) => [
                  ...prev.filter((x) => x.id !== r.data.id),
                  {
                    id: r.data.id,
                    code: legForm.code.toUpperCase(),
                    label_fr: legForm.label_fr,
                    label_ar: legForm.label_ar,
                    coefficient: legForm.coefficient,
                    counts_as_presence: legForm.counts_as_presence,
                    triggers_an_passthrough: false,
                    color_bg: legForm.color_bg,
                    color_fg: legForm.color_fg,
                    source_mode: legForm.source_mode,
                    is_active: true,
                    is_system: false,
                  },
                ]);
                setInfo("Légende enregistrée.");
              });
            }}
          >
            Enregistrer le code
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {legendRows.map((l) => (
            <button
              key={l.id}
              type="button"
              className="rounded-xl px-2.5 py-1 text-xs font-bold"
              style={{
                background: l.color_bg ?? "#e2e8f0",
                color: l.color_fg ?? "#111",
              }}
              onClick={() =>
                setLegForm({
                  id: l.id,
                  code: l.code,
                  label_fr: l.label_fr,
                  label_ar: l.label_ar ?? "",
                  coefficient: Number(l.coefficient),
                  color_bg: l.color_bg ?? "#e2e8f0",
                  color_fg: l.color_fg ?? "#111111",
                  source_mode: l.source_mode,
                  counts_as_presence: l.counts_as_presence,
                })
              }
            >
              {l.code} · {l.coefficient}
            </button>
          ))}
        </div>
      </RhPanel>
    </div>
  );
}
