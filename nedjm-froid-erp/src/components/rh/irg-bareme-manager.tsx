"use client";

import { useMemo, useState, useTransition } from "react";
import {
  deleteIrgRule,
  listIrgCatalog,
  replaceIrgBrackets,
  upsertIrgRule,
  upsertIrgRuleSet,
  upsertIrgVersion,
  type IrgBracketRow,
  type IrgCatalog,
  type IrgRuleRow,
  type IrgRuleSet,
  type IrgVersion,
} from "@/lib/actions/hr-irg";
import { computeMonthlyIrg } from "@/lib/hr/irg-calc";
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

const RULE_KINDS = [
  { id: "EXEMPTION_THRESHOLD", fr: "Exonération", ar: "إعفاء" },
  { id: "ABATEMENT_ON_TAX", fr: "Abattement 40 %", ar: "تخفيض على الضريبة" },
  { id: "LISSAGE", fr: "Lissage", ar: "تسوية الشريحة" },
  { id: "BASE_PREPROCESS", fr: "Base (déductions)", ar: "الوعاء قبل الضريبة" },
  { id: "NON_MONTHLY_WITHHOLDING", fr: "Retenue non mensuelle", ar: "اقتطاع غير شهري" },
] as const;

function money(n: number) {
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(n);
}

function numParam(params: Record<string, unknown>, key: string) {
  const v = params[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(rate: number) {
  return String(Math.round(rate * 10000) / 100);
}

type DraftBracket = {
  id?: string;
  min_annual: string;
  max_annual: string;
  rate_pct: string;
};

function toDraft(rows: IrgBracketRow[]): DraftBracket[] {
  return rows.map((b) => ({
    id: b.id,
    min_annual: String(b.min_annual),
    max_annual: b.max_annual == null ? "" : String(b.max_annual),
    rate_pct: pct(b.rate),
  }));
}

function emptyVersion(): Omit<IrgVersion, "id"> & { id: string; copy_from_version_id: string } {
  return {
    id: "",
    code: "",
    label_fr: "",
    source_ref: "",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: null,
    copy_from_version_id: "",
  };
}

function emptySet(): Omit<IrgRuleSet, "id"> & { id: string } {
  return {
    id: "",
    code: "",
    taxpayer_category: "STANDARD",
    label_fr: "",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: null,
  };
}

function ruleForm(rule: IrgRuleRow | null, ruleSetId: string) {
  const params = rule?.params ?? {};
  const tokens = Array.isArray(params.deduct_tokens)
    ? (params.deduct_tokens as unknown[]).map(String).join(", ")
    : "";
  return {
    id: rule?.id ?? "",
    rule_set_id: rule?.rule_set_id ?? ruleSetId,
    kind: rule?.kind ?? "EXEMPTION_THRESHOLD",
    applies_to: rule?.applies_to ?? "GROSS",
    sequence: String(rule?.sequence ?? 10),
    formula: rule?.formula ?? "",
    monthly_min: params.monthly_min != null ? String(params.monthly_min) : "",
    monthly_max: params.monthly_max != null ? String(params.monthly_max) : "",
    rate_pct: params.rate != null ? pct(numParam(params, "rate")) : "",
    min_monthly: params.min_monthly != null ? String(params.min_monthly) : "",
    max_monthly: params.max_monthly != null ? String(params.max_monthly) : "",
    deduct_tokens: tokens,
  };
}

export function IrgBaremeManager({
  catalog,
  isSuperAdmin,
  loadError,
}: {
  catalog: IrgCatalog;
  isSuperAdmin: boolean;
  loadError?: string;
}) {
  const [versions, setVersions] = useState(catalog.versions);
  const [brackets, setBrackets] = useState(catalog.brackets);
  const [ruleSets, setRuleSets] = useState(catalog.ruleSets);
  const [rules, setRules] = useState(catalog.rules);
  const [versionId, setVersionId] = useState(catalog.versions[0]?.id ?? "");
  const [setId, setSetId] = useState(catalog.ruleSets[0]?.id ?? "");
  const [vf, setVf] = useState(() => {
    const v = catalog.versions[0];
    if (!v) return emptyVersion();
    return {
      id: v.id,
      code: v.code,
      label_fr: v.label_fr,
      source_ref: v.source_ref ?? "",
      effective_from: v.effective_from,
      effective_to: v.effective_to,
      copy_from_version_id: "",
    };
  });
  const [sf, setSf] = useState(() => {
    const s = catalog.ruleSets[0];
    return s ? { ...s } : emptySet();
  });
  const [draft, setDraft] = useState<DraftBracket[]>(
    toDraft(catalog.brackets.filter((b) => b.version_id === catalog.versions[0]?.id)),
  );
  const [rf, setRf] = useState(ruleForm(null, catalog.ruleSets[0]?.id ?? ""));
  const [previewBase, setPreviewBase] = useState("40000");
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectedVersion = versions.find((v) => v.id === versionId);
  const selectedSet = ruleSets.find((s) => s.id === setId);
  const activeRules = rules.filter((r) => r.rule_set_id === setId).sort((a, b) => a.sequence - b.sequence);

  function applyCatalog(next: IrgCatalog, keepVersion?: string, keepSet?: string) {
    setVersions(next.versions);
    setBrackets(next.brackets);
    setRuleSets(next.ruleSets);
    setRules(next.rules);
    const vid = keepVersion && next.versions.some((v) => v.id === keepVersion)
      ? keepVersion
      : next.versions[0]?.id ?? "";
    const sid = keepSet && next.ruleSets.some((s) => s.id === keepSet)
      ? keepSet
      : next.ruleSets[0]?.id ?? "";
    setVersionId(vid);
    setSetId(sid);
    setDraft(toDraft(next.brackets.filter((b) => b.version_id === vid)));
    const v = next.versions.find((x) => x.id === vid);
    if (v) {
      setVf({
        id: v.id,
        code: v.code,
        label_fr: v.label_fr,
        source_ref: v.source_ref ?? "",
        effective_from: v.effective_from,
        effective_to: v.effective_to,
        copy_from_version_id: "",
      });
    }
    const s = next.ruleSets.find((x) => x.id === sid);
    if (s) setSf({ ...s });
    setRf(ruleForm(null, sid));
  }

  async function reload(keepVersion?: string, keepSet?: string) {
    const result = await listIrgCatalog();
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    applyCatalog(result.data, keepVersion, keepSet);
    return true;
  }

  function pickVersion(id: string) {
    setVersionId(id);
    const v = versions.find((x) => x.id === id);
    setDraft(toDraft(brackets.filter((b) => b.version_id === id)));
    if (v) {
      setVf({
        id: v.id,
        code: v.code,
        label_fr: v.label_fr,
        source_ref: v.source_ref ?? "",
        effective_from: v.effective_from,
        effective_to: v.effective_to,
        copy_from_version_id: "",
      });
    }
  }

  function pickSet(id: string) {
    setSetId(id);
    const s = ruleSets.find((x) => x.id === id);
    setRf(ruleForm(null, id));
    if (s) setSf({ ...s });
  }

  const preview = useMemo(() => {
    const base = Number(previewBase);
    if (!Number.isFinite(base)) return 0;
    const rows = draft
      .map((b, i) => ({
        min_annual: Number(b.min_annual || 0),
        max_annual: b.max_annual === "" ? null : Number(b.max_annual),
        rate: Number(b.rate_pct || 0) / 100,
        i,
      }))
      .filter((b) => Number.isFinite(b.min_annual) && Number.isFinite(b.rate));
    return computeMonthlyIrg({
      irgBaseMonthly: base,
      brackets: rows,
      rules: activeRules.map((r) => ({
        kind: r.kind,
        params: r.params,
        formula: r.formula,
      })),
    });
  }, [draft, previewBase, activeRules]);

  function saveVersion() {
    if (!isSuperAdmin) return;
    start(async () => {
      setError(null);
      const result = await upsertIrgVersion({
        id: vf.id || undefined,
        code: vf.code,
        label_fr: vf.label_fr,
        source_ref: vf.source_ref,
        effective_from: vf.effective_from,
        effective_to: vf.effective_to,
        copy_from_version_id: vf.id ? null : vf.copy_from_version_id || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(bi("Version enregistrée.", "تم حفظ النسخة."));
      await reload(result.data.id, setId);
    });
  }

  function saveBrackets() {
    if (!isSuperAdmin || !versionId) return;
    start(async () => {
      setError(null);
      const payload = draft.map((b) => ({
        id: b.id,
        min_annual: Number(b.min_annual || 0),
        max_annual: b.max_annual === "" ? null : Number(b.max_annual),
        rate_pct: Number(b.rate_pct || 0),
      }));
      const result = await replaceIrgBrackets({ version_id: versionId, brackets: payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(bi("Tranches enregistrées.", "تم حفظ الشرائح."));
      setBrackets((prev) => [...prev.filter((b) => b.version_id !== versionId), ...result.data]);
      setDraft(toDraft(result.data));
    });
  }

  function saveSet() {
    if (!isSuperAdmin) return;
    start(async () => {
      setError(null);
      const result = await upsertIrgRuleSet({
        id: sf.id || undefined,
        code: sf.code,
        taxpayer_category: sf.taxpayer_category,
        label_fr: sf.label_fr,
        effective_from: sf.effective_from,
        effective_to: sf.effective_to,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(bi("Jeu de règles enregistré.", "تم حفظ مجموعة القواعد."));
      await reload(versionId, result.data.id);
    });
  }

  function saveRule() {
    if (!isSuperAdmin || !setId) return;
    start(async () => {
      setError(null);
      const result = await upsertIrgRule({
        id: rf.id || undefined,
        rule_set_id: setId,
        kind: rf.kind,
        applies_to: rf.applies_to,
        sequence: Number(rf.sequence || 10),
        formula: rf.formula,
        monthly_min: rf.monthly_min,
        monthly_max: rf.monthly_max,
        rate_pct: rf.rate_pct,
        min_monthly: rf.min_monthly,
        max_monthly: rf.max_monthly,
        deduct_tokens: rf.deduct_tokens,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(bi("Règle enregistrée.", "تم حفظ القاعدة."));
      const next: IrgRuleRow = {
        id: result.data.id,
        rule_set_id: setId,
        kind: rf.kind,
        applies_to: rf.applies_to || null,
        sequence: Number(rf.sequence || 10),
        params: {},
        formula: rf.formula || null,
      };
      if (rf.kind === "EXEMPTION_THRESHOLD") next.params = { monthly_max: Number(rf.monthly_max || 0) };
      if (rf.kind === "ABATEMENT_ON_TAX") {
        next.params = {
          rate: Number(rf.rate_pct || 0) / 100,
          min_monthly: Number(rf.min_monthly || 0),
          max_monthly: Number(rf.max_monthly || 0),
        };
      }
      if (rf.kind === "LISSAGE") {
        next.params = {
          monthly_min: Number(rf.monthly_min || 0),
          monthly_max: Number(rf.monthly_max || 0),
        };
      }
      if (rf.kind === "NON_MONTHLY_WITHHOLDING") next.params = { rate: Number(rf.rate_pct || 0) / 100 };
      if (rf.kind === "BASE_PREPROCESS") {
        next.params = {
          deduct_tokens: rf.deduct_tokens.split(",").map((t) => t.trim()).filter(Boolean),
        };
      }
      setRules((prev) => [...prev.filter((r) => r.id !== next.id), next]);
      setRf(ruleForm(null, setId));
    });
  }

  function removeRule(id: string) {
    if (!isSuperAdmin) return;
    start(async () => {
      const result = await deleteIrgRule(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
      setInfo(bi("Règle supprimée.", "تم حذف القاعدة."));
    });
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Barème IRG", "سلم الضريبة على الدخل")}
        description={
          <>
            Tranches annuelles et règles Art. 104 (exonération, abattement, lissage). Le bulletin
            lit cette table, pas des taux figés dans le code.
            <span className="mt-1 block" dir="rtl">
              الشرائح السنوية وقواعد المادة 104 (إعفاء، تخفيض، تسوية). الكشف يقرأ هذا السلم من
              الشاشة، لا نسباً مكتوبة في البرنامج.
            </span>
          </>
        }
      />
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {info && !error ? <RhAlert tone="success">{info}</RhAlert> : null}

      <RhPanel className="grid gap-4 lg:grid-cols-3">
        <RhField label={bi("Version du barème", "نسخة السلم")}>
          <select className={rhInput} value={versionId} onChange={(e) => pickVersion(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} · {v.label_fr}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label={bi("Jeu de règles (catégorie)", "مجموعة القواعد")}>
          <select className={rhInput} value={setId} onChange={(e) => pickSet(e.target.value)}>
            {ruleSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.taxpayer_category === "STANDARD" ? "Salarié" : "Handicapé / retraité"}
              </option>
            ))}
          </select>
        </RhField>
        <RhField label={bi("Simulation — base IRG mensuelle (DA)", "تجربة — الوعاء الشهري")}>
          <input
            className={rhInput}
            value={previewBase}
            onChange={(e) => setPreviewBase(e.target.value)}
            inputMode="decimal"
          />
        </RhField>
        <p className="lg:col-span-3 text-sm">
          IRG mensuel estimé :{" "}
          <strong>{money(preview)} DA</strong>
          {selectedVersion ? ` · ${selectedVersion.label_fr}` : ""}
          {selectedSet ? ` · ${selectedSet.label_fr}` : ""}
        </p>
      </RhPanel>

      <RhPanel className="space-y-3">
        <RhSectionTitle>{bi("Tranches annuelles", "الشرائح السنوية")}</RhSectionTitle>
        {isSuperAdmin ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label={bi("Code", "الرمز")}>
              <input className={rhInput} value={vf.code} onChange={(e) => setVf({ ...vf, code: e.target.value })} />
            </RhField>
            <RhField label={bi("Libellé", "التسمية")}>
              <input
                className={rhInput}
                value={vf.label_fr}
                onChange={(e) => setVf({ ...vf, label_fr: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Référence légale", "المرجع القانوني")}>
              <input
                className={rhInput}
                value={vf.source_ref ?? ""}
                onChange={(e) => setVf({ ...vf, source_ref: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Du", "من")}>
              <input
                type="date"
                className={rhInput}
                value={vf.effective_from}
                onChange={(e) => setVf({ ...vf, effective_from: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Au (vide = en cours)", "إلى (فارغ = ساري)")}>
              <input
                type="date"
                className={rhInput}
                value={vf.effective_to ?? ""}
                onChange={(e) => setVf({ ...vf, effective_to: e.target.value || null })}
              />
            </RhField>
            {!vf.id ? (
              <RhField label={bi("Copier les tranches de", "نسخ الشرائح من")}>
                <select
                  className={rhInput}
                  value={vf.copy_from_version_id}
                  onChange={(e) => setVf({ ...vf, copy_from_version_id: e.target.value })}
                >
                  <option value="">—</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code}
                    </option>
                  ))}
                </select>
              </RhField>
            ) : null}
            <div className="flex items-end gap-2">
              <Button disabled={pending} onClick={saveVersion}>
                {bi("Enregistrer la version", "حفظ النسخة")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setVf({ ...emptyVersion(), copy_from_version_id: versionId })}
              >
                {bi("Nouvelle version", "نسخة جديدة")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground/60">
            {selectedVersion
              ? `${selectedVersion.label_fr} · ${selectedVersion.source_ref ?? ""} · ${selectedVersion.effective_from}`
              : bi("Aucune version.", "لا توجد نسخة.")}
          </p>
        )}
        <RhTableWrap>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/80">
              <tr>
                <th className={rhTh()}>{bi("Min annuel", "الحد الأدنى السنوي")}</th>
                <th className={rhTh()}>{bi("Max annuel", "الحد الأعلى السنوي")}</th>
                <th className={rhTh()}>{bi("Taux %", "النسبة %")}</th>
                {isSuperAdmin ? <th className={rhTh()} /> : null}
              </tr>
            </thead>
            <tbody>
              {draft.map((row, i) => (
                <tr key={row.id ?? `n-${i}`} className="border-t border-border/60">
                  <td className={rhTd()}>
                    {isSuperAdmin ? (
                      <input
                        className={rhInput}
                        value={row.min_annual}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, min_annual: e.target.value } : x)),
                          )
                        }
                      />
                    ) : (
                      money(Number(row.min_annual))
                    )}
                  </td>
                  <td className={rhTd()}>
                    {isSuperAdmin ? (
                      <input
                        className={rhInput}
                        value={row.max_annual}
                        placeholder="∞"
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, max_annual: e.target.value } : x)),
                          )
                        }
                      />
                    ) : row.max_annual === "" ? (
                      "∞"
                    ) : (
                      money(Number(row.max_annual))
                    )}
                  </td>
                  <td className={rhTd()}>
                    {isSuperAdmin ? (
                      <input
                        className={rhInput}
                        value={row.rate_pct}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, rate_pct: e.target.value } : x)),
                          )
                        }
                      />
                    ) : (
                      `${row.rate_pct} %`
                    )}
                  </td>
                  {isSuperAdmin ? (
                    <td className={rhTd()}>
                      <Button
                        variant="ghost"
                        onClick={() => setDraft((prev) => prev.filter((_, j) => j !== i))}
                      >
                        {bi("Retirer", "حذف")}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </RhTableWrap>
        {isSuperAdmin ? (
          <RhToolbar>
            <Button
              variant="secondary"
              onClick={() =>
                setDraft((prev) => [...prev, { min_annual: "", max_annual: "", rate_pct: "0" }])
              }
            >
              {bi("Ajouter une tranche", "إضافة شريحة")}
            </Button>
            <Button disabled={pending || !versionId} onClick={saveBrackets}>
              {bi("Enregistrer les tranches", "حفظ الشرائح")}
            </Button>
          </RhToolbar>
        ) : null}
      </RhPanel>

      <RhPanel className="space-y-3">
        <RhSectionTitle>{bi("Règles Art. 104", "قواعد المادة 104")}</RhSectionTitle>
        {isSuperAdmin ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label={bi("Code", "الرمز")}>
              <input className={rhInput} value={sf.code} onChange={(e) => setSf({ ...sf, code: e.target.value })} />
            </RhField>
            <RhField label={bi("Libellé", "التسمية")}>
              <input
                className={rhInput}
                value={sf.label_fr}
                onChange={(e) => setSf({ ...sf, label_fr: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Catégorie contribuable", "فئة المكلف")}>
              <select
                className={rhInput}
                value={sf.taxpayer_category}
                onChange={(e) =>
                  setSf({
                    ...sf,
                    taxpayer_category: e.target.value as IrgRuleSet["taxpayer_category"],
                  })
                }
              >
                <option value="STANDARD">{bi("Salarié", "عامل")}</option>
                <option value="DISABLED_OR_RETIREE">{bi("Handicapé / retraité", "معاق / متقاعد")}</option>
              </select>
            </RhField>
            <RhField label={bi("Du", "من")}>
              <input
                type="date"
                className={rhInput}
                value={sf.effective_from}
                onChange={(e) => setSf({ ...sf, effective_from: e.target.value })}
              />
            </RhField>
            <RhField label={bi("Au", "إلى")}>
              <input
                type="date"
                className={rhInput}
                value={sf.effective_to ?? ""}
                onChange={(e) => setSf({ ...sf, effective_to: e.target.value || null })}
              />
            </RhField>
            <div className="flex items-end gap-2">
              <Button disabled={pending} onClick={saveSet}>
                {bi("Enregistrer le jeu", "حفظ المجموعة")}
              </Button>
              <Button variant="secondary" onClick={() => setSf(emptySet())}>
                {bi("Nouveau jeu", "مجموعة جديدة")}
              </Button>
            </div>
          </div>
        ) : null}

        <RhTableWrap>
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 bg-surface-muted/80">
              <tr>
                <th className={rhTh()}>#</th>
                <th className={rhTh()}>{bi("Règle", "القاعدة")}</th>
                <th className={rhTh()}>{bi("Paramètres", "المعاملات")}</th>
                {isSuperAdmin ? <th className={rhTh()} /> : null}
              </tr>
            </thead>
            <tbody>
              {activeRules.map((rule) => (
                <tr key={rule.id} className="border-t border-border/60">
                  <td className={rhTd()}>{rule.sequence}</td>
                  <td className={rhTd()}>
                    {RULE_KINDS.find((k) => k.id === rule.kind)?.fr ?? rule.kind}
                    <span className="mt-0.5 block text-xs text-foreground/60">
                      {RULE_KINDS.find((k) => k.id === rule.kind)?.ar}
                    </span>
                  </td>
                  <td className={`${rhTd()} font-mono text-xs`}>
                    {JSON.stringify(rule.params)}
                    {rule.formula ? ` · ${rule.formula}` : ""}
                  </td>
                  {isSuperAdmin ? (
                    <td className={rhTd()}>
                      <Button variant="ghost" onClick={() => setRf(ruleForm(rule, setId))}>
                        {bi("Modifier", "تعديل")}
                      </Button>
                      <Button variant="ghost" onClick={() => removeRule(rule.id)}>
                        {bi("Supprimer", "حذف")}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </RhTableWrap>

        {isSuperAdmin ? (
          <div className="grid gap-3 rounded-xl border border-dashed border-border/70 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <RhField label={bi("Type", "النوع")}>
              <select className={rhInput} value={rf.kind} onChange={(e) => setRf({ ...rf, kind: e.target.value })}>
                {RULE_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.fr} · {k.ar}
                  </option>
                ))}
              </select>
            </RhField>
            <RhField label={bi("Séquence", "الترتيب")}>
              <input
                className={rhInput}
                value={rf.sequence}
                onChange={(e) => setRf({ ...rf, sequence: e.target.value })}
              />
            </RhField>
            <RhField label={bi("S’applique à", "يطبق على")}>
              <select
                className={rhInput}
                value={rf.applies_to}
                onChange={(e) => setRf({ ...rf, applies_to: e.target.value })}
              >
                <option value="GROSS">GROSS</option>
                <option value="BASE">BASE</option>
                <option value="TAX">TAX</option>
              </select>
            </RhField>
            {rf.kind === "EXEMPTION_THRESHOLD" || rf.kind === "LISSAGE" ? (
              <>
                {rf.kind === "LISSAGE" ? (
                  <RhField label={bi("Min mensuel", "الحد الأدنى الشهري")}>
                    <input
                      className={rhInput}
                      value={rf.monthly_min}
                      onChange={(e) => setRf({ ...rf, monthly_min: e.target.value })}
                    />
                  </RhField>
                ) : null}
                <RhField label={bi("Max mensuel", "الحد الأعلى الشهري")}>
                  <input
                    className={rhInput}
                    value={rf.monthly_max}
                    onChange={(e) => setRf({ ...rf, monthly_max: e.target.value })}
                  />
                </RhField>
              </>
            ) : null}
            {rf.kind === "ABATEMENT_ON_TAX" || rf.kind === "NON_MONTHLY_WITHHOLDING" ? (
              <RhField label={bi("Taux %", "النسبة %")}>
                <input
                  className={rhInput}
                  value={rf.rate_pct}
                  onChange={(e) => setRf({ ...rf, rate_pct: e.target.value })}
                />
              </RhField>
            ) : null}
            {rf.kind === "ABATEMENT_ON_TAX" ? (
              <>
                <RhField label={bi("Min mensuel (DA)", "أدنى شهري")}>
                  <input
                    className={rhInput}
                    value={rf.min_monthly}
                    onChange={(e) => setRf({ ...rf, min_monthly: e.target.value })}
                  />
                </RhField>
                <RhField label={bi("Max mensuel (DA)", "أقصى شهري")}>
                  <input
                    className={rhInput}
                    value={rf.max_monthly}
                    onChange={(e) => setRf({ ...rf, max_monthly: e.target.value })}
                  />
                </RhField>
              </>
            ) : null}
            {rf.kind === "LISSAGE" ? (
              <RhField label={bi("Formule [IRG_AFTER_ABATEMENT]", "صيغة التسوية")}>
                <input
                  className={rhInput}
                  value={rf.formula}
                  onChange={(e) => setRf({ ...rf, formula: e.target.value })}
                />
              </RhField>
            ) : null}
            {rf.kind === "BASE_PREPROCESS" ? (
              <RhField label={bi("Jetons à déduire", "الرموز المخصومة")}>
                <input
                  className={rhInput}
                  value={rf.deduct_tokens}
                  onChange={(e) => setRf({ ...rf, deduct_tokens: e.target.value })}
                />
              </RhField>
            ) : null}
            <div className="flex items-end gap-2">
              <Button disabled={pending || !setId} onClick={saveRule}>
                {rf.id ? bi("Mettre à jour", "تحديث") : bi("Ajouter la règle", "إضافة القاعدة")}
              </Button>
              {rf.id ? (
                <Button variant="secondary" onClick={() => setRf(ruleForm(null, setId))}>
                  {bi("Annuler", "إلغاء")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </RhPanel>
    </div>
  );
}

