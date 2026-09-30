"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  deleteIrgDraft,
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
import { submitIrgDraft } from "@/lib/actions/rule-proposals";
import { frMonth, irgRowStatusLabel, ruleStatusLabel, type IrgRowStatus } from "@/lib/rules/proposals";
import { LegalOverrideDialog } from "@/components/rh/legal-override-dialog";
import {
  PROPOSALS_PATH,
  ProposalNotice,
  QuickDialog,
  RuleSourceFields,
  VerifyRuleDialog,
  emptyRuleSource,
  type RuleSourceForm,
} from "@/components/rules/rule-ui";
import {
  isLegalOverrideError,
  legalOverrideLines,
  STATUTORY_IRG_BRACKETS,
  statutoryIrgRule,
} from "@/lib/hr/statutory";
import { Button } from "@/components/ui/button";
import {
  RhAlert,
  RhChip,
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

function statusTone(status: IrgRowStatus): "neutral" | "brand" | "success" | "warning" | "danger" {
  if (status === "APPLIED") return "success";
  if (status === "DRAFT") return "brand";
  if (status === "PROPOSED" || status === "LEGACY") return "warning";
  return "neutral";
}

function currentMonth() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

type VersionForm = {
  id: string;
  code: string;
  label_fr: string;
  source_ref: string;
  effective_from: string;
  copy_from_version_id: string;
};

type SetForm = {
  id: string;
  code: string;
  taxpayer_category: IrgRuleSet["taxpayer_category"];
  label_fr: string;
  effective_from: string;
  copy_from_rule_set_id: string;
};

function versionForm(v: IrgVersion): VersionForm {
  return {
    id: v.id,
    code: v.code,
    label_fr: v.label_fr,
    source_ref: v.source_ref ?? "",
    effective_from: v.effective_from,
    copy_from_version_id: "",
  };
}

function setForm(s: IrgRuleSet): SetForm {
  return {
    id: s.id,
    code: s.code,
    taxpayer_category: s.taxpayer_category,
    label_fr: s.label_fr,
    effective_from: s.effective_from,
    copy_from_rule_set_id: "",
  };
}

function RowStatus({ row }: { row: IrgVersion | IrgRuleSet }) {
  const open = row.proposals[0];
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <RhChip tone={statusTone(row.status)}>{irgRowStatusLabel(row.status)}</RhChip>
      {row.status === "APPLIED" || row.status === "REPLACED" ? (
        <span className="text-foreground/55">
          du {row.effective_from}
          {row.effective_to ? ` au ${row.effective_to}` : ""}
        </span>
      ) : null}
      {open ? (
        <Link href={`${PROPOSALS_PATH}?id=${open.id}`} className="text-brand hover:underline">
          {open.action === "VERIFY" ? "Vérification" : "Proposition"} : {ruleStatusLabel(open.status).toLowerCase()}
        </Link>
      ) : row.proposal_id ? (
        <Link href={`${PROPOSALS_PATH}?id=${row.proposal_id}`} className="text-brand hover:underline">
          Proposition approuvée
        </Link>
      ) : null}
    </span>
  );
}

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

function emptyVersion(copyFrom = ""): VersionForm {
  return {
    id: "",
    code: "",
    label_fr: "",
    source_ref: "",
    effective_from: currentMonth(),
    copy_from_version_id: copyFrom,
  };
}

function emptySet(from?: IrgRuleSet): SetForm {
  return {
    id: "",
    code: "",
    taxpayer_category: from?.taxpayer_category ?? "STANDARD",
    label_fr: "",
    effective_from: currentMonth(),
    copy_from_rule_set_id: from?.id ?? "",
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
  canEdit,
  loadError,
}: {
  catalog: IrgCatalog;
  canEdit: boolean;
  loadError?: string;
}) {
  const [versions, setVersions] = useState(catalog.versions);
  const [brackets, setBrackets] = useState(catalog.brackets);
  const [ruleSets, setRuleSets] = useState(catalog.ruleSets);
  const [rules, setRules] = useState(catalog.rules);
  const [versionId, setVersionId] = useState(catalog.versions[0]?.id ?? "");
  const [setId, setSetId] = useState(catalog.ruleSets[0]?.id ?? "");
  const [vf, setVf] = useState<VersionForm>(() => {
    const v = catalog.versions[0];
    return v ? versionForm(v) : emptyVersion();
  });
  const [sf, setSf] = useState<SetForm>(() => {
    const s = catalog.ruleSets[0];
    return s ? setForm(s) : emptySet();
  });
  const [dialog, setDialog] = useState<
    | { kind: "submit"; family: "IRG_BAREME" | "IRG_RULES"; row: IrgVersion | IrgRuleSet }
    | { kind: "verify"; family: "IRG_BAREME" | "IRG_RULES"; row: IrgVersion | IrgRuleSet }
    | null
  >(null);
  const [draft, setDraft] = useState<DraftBracket[]>(
    toDraft(catalog.brackets.filter((b) => b.version_id === catalog.versions[0]?.id)),
  );
  const [rf, setRf] = useState(ruleForm(null, catalog.ruleSets[0]?.id ?? ""));
  const [previewBase, setPreviewBase] = useState("40000");
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [override, setOverride] = useState<null | { lines: string[]; kind: "brackets" | "rule" | "delete"; ruleId?: string }>(
    null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectedVersion = versions.find((v) => v.id === versionId);
  const selectedSet = ruleSets.find((s) => s.id === setId);
  const activeRules = rules.filter((r) => r.rule_set_id === setId).sort((a, b) => a.sequence - b.sequence);
  const editBrackets = canEdit && selectedVersion?.status === "DRAFT";
  const editRules = canEdit && selectedSet?.status === "DRAFT";
  const versionFormOpen = canEdit && (!vf.id || selectedVersion?.status === "DRAFT");
  const setFormOpen = canEdit && (!sf.id || selectedSet?.status === "DRAFT");

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
    if (v) setVf(versionForm(v));
    const s = next.ruleSets.find((x) => x.id === sid);
    if (s) setSf(setForm(s));
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
    if (v) setVf(versionForm(v));
  }

  function pickSet(id: string) {
    setSetId(id);
    const s = ruleSets.find((x) => x.id === id);
    setRf(ruleForm(null, id));
    if (s) setSf(setForm(s));
  }

  function removeDraft(family: "IRG_BAREME" | "IRG_RULES", row: IrgVersion | IrgRuleSet) {
    if (!canEdit || !window.confirm(`Supprimer le brouillon ${row.code} ?`)) return;
    start(async () => {
      setError(null);
      const result = await deleteIrgDraft({ family, id: row.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(`Brouillon ${row.code} supprimé.`);
      await reload(family === "IRG_BAREME" ? undefined : versionId, family === "IRG_RULES" ? undefined : setId);
    });
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
    if (!canEdit) return;
    start(async () => {
      setError(null);
      const result = await upsertIrgVersion({
        id: vf.id || undefined,
        code: vf.code,
        label_fr: vf.label_fr,
        source_ref: vf.source_ref,
        effective_from: vf.effective_from,
        effective_to: null,
        copy_from_version_id: vf.id ? null : vf.copy_from_version_id || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(bi("Brouillon de barème enregistré : sans effet avant sa soumission, son approbation et la décision D2.", "تم حفظ المسودة."));
      await reload(result.data.id, setId);
    });
  }

  function saveBrackets(choice: "check" | "legal" | "authorize" = "check") {
    if (!editBrackets || !versionId) return;
    start(async () => {
      setError(null);
      const payload =
        choice === "legal"
          ? STATUTORY_IRG_BRACKETS.map((b) => ({
              min_annual: b.min_annual,
              max_annual: b.max_annual,
              rate_pct: Math.round(b.rate * 10000) / 100,
            }))
          : draft.map((b) => ({
              id: b.id,
              min_annual: Number(b.min_annual || 0),
              max_annual: b.max_annual === "" ? null : Number(b.max_annual),
              rate_pct: Number(b.rate_pct || 0),
            }));
      const result = await replaceIrgBrackets({
        version_id: versionId,
        brackets: payload,
        authorize_override: choice === "authorize",
      });
      if (!result.ok) {
        if (isLegalOverrideError(result.error)) {
          setOverride({ lines: legalOverrideLines(result.error), kind: "brackets" });
          return;
        }
        setError(result.error);
        return;
      }
      setOverride(null);
      setInfo(bi("Tranches enregistrées.", "تم حفظ الشرائح."));
      setBrackets((prev) => [...prev.filter((b) => b.version_id !== versionId), ...result.data]);
      setDraft(toDraft(result.data));
    });
  }

  function saveSet() {
    if (!canEdit) return;
    start(async () => {
      setError(null);
      const result = await upsertIrgRuleSet({
        id: sf.id || undefined,
        code: sf.code,
        taxpayer_category: sf.taxpayer_category,
        label_fr: sf.label_fr,
        effective_from: sf.effective_from,
        effective_to: null,
        copy_from_rule_set_id: sf.id ? null : sf.copy_from_rule_set_id || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(bi("Brouillon de règles enregistré : sans effet avant sa soumission, son approbation et la décision D2.", "تم حفظ المسودة."));
      await reload(versionId, result.data.id);
    });
  }

  function saveRule(choice: "check" | "legal" | "authorize" = "check") {
    if (!editRules || !setId) return;
    start(async () => {
      setError(null);
      const category = ruleSets.find((s) => s.id === setId)?.taxpayer_category ?? "STANDARD";
      const legal = choice === "legal" ? statutoryIrgRule(category, rf.kind) : null;
      const result = await upsertIrgRule({
        id: rf.id || undefined,
        rule_set_id: setId,
        kind: rf.kind,
        applies_to: rf.applies_to,
        sequence: Number(rf.sequence || 10),
        formula: legal ? legal.formula : rf.formula,
        monthly_min: legal ? legal.params.monthly_min : rf.monthly_min,
        monthly_max: legal ? legal.params.monthly_max : rf.monthly_max,
        rate_pct: legal && typeof legal.params.rate === "number" ? legal.params.rate * 100 : rf.rate_pct,
        min_monthly: legal ? legal.params.min_monthly : rf.min_monthly,
        max_monthly: legal ? legal.params.max_monthly : rf.max_monthly,
        deduct_tokens: legal && Array.isArray(legal.params.deduct_tokens) ? legal.params.deduct_tokens.join(",") : rf.deduct_tokens,
        authorize_override: choice === "authorize",
      });
      if (!result.ok) {
        if (isLegalOverrideError(result.error)) {
          setOverride({ lines: legalOverrideLines(result.error), kind: "rule" });
          return;
        }
        setError(result.error);
        return;
      }
      setOverride(null);
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

  function removeRule(id: string, authorize = false) {
    if (!editRules) return;
    start(async () => {
      const result = await deleteIrgRule(id, authorize);
      if (!result.ok) {
        if (isLegalOverrideError(result.error)) {
          setOverride({ lines: legalOverrideLines(result.error), kind: "delete", ruleId: id });
          return;
        }
        setError(result.error);
        return;
      }
      setOverride(null);
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
            lit cette table, pas des taux figés dans le code. Seuls les brouillons se modifient : un brouillon
            soumis est figé, puis approuvé et daté par décision D2 ; il remplace alors la version de ce mois.
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
                {v.code} · {v.label_fr} · {irgRowStatusLabel(v.status)}
              </option>
            ))}
          </select>
          {selectedVersion ? <RowStatus row={selectedVersion} /> : null}
        </RhField>
        <RhField label={bi("Jeu de règles (catégorie)", "مجموعة القواعد")}>
          <select className={rhInput} value={setId} onChange={(e) => pickSet(e.target.value)}>
            {ruleSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.taxpayer_category === "STANDARD" ? "Salarié" : "Handicapé / retraité"} ·{" "}
                {irgRowStatusLabel(s.status)}
              </option>
            ))}
          </select>
          {selectedSet ? <RowStatus row={selectedSet} /> : null}
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
        {canEdit && selectedVersion && vf.id ? (
          <RowActions
            family="IRG_BAREME"
            row={selectedVersion}
            pending={pending}
            onNewDraft={() => setVf(emptyVersion(versionId))}
            onSubmit={() => setDialog({ kind: "submit", family: "IRG_BAREME", row: selectedVersion })}
            onVerify={() => setDialog({ kind: "verify", family: "IRG_BAREME", row: selectedVersion })}
            onDelete={() => removeDraft("IRG_BAREME", selectedVersion)}
          />
        ) : null}
        {versionFormOpen ? (
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
            <RhField label="Mois envisagé" hint="Indicatif : le mois d'application est décidé après approbation (D2).">
              <input
                type="month"
                className={rhInput}
                value={vf.effective_from.slice(0, 7)}
                onChange={(e) => setVf({ ...vf, effective_from: e.target.value ? `${e.target.value}-01` : "" })}
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
                {vf.id ? bi("Enregistrer le brouillon", "حفظ المسودة") : bi("Créer le brouillon", "إنشاء مسودة")}
              </Button>
              {!vf.id && selectedVersion ? (
                <Button variant="secondary" onClick={() => setVf(versionForm(selectedVersion))}>
                  {bi("Annuler", "إلغاء")}
                </Button>
              ) : null}
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
                {editBrackets ? <th className={rhTh()} /> : null}
              </tr>
            </thead>
            <tbody>
              {draft.map((row, i) => (
                <tr key={row.id ?? `n-${i}`} className="border-t border-border/60">
                  <td className={rhTd()}>
                    {editBrackets ? (
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
                    {editBrackets ? (
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
                    {editBrackets ? (
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
                  {editBrackets ? (
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
        {editBrackets ? (
          <RhToolbar>
            <Button
              variant="secondary"
              onClick={() =>
                setDraft((prev) => [...prev, { min_annual: "", max_annual: "", rate_pct: "0" }])
              }
            >
              {bi("Ajouter une tranche", "إضافة شريحة")}
            </Button>
            <Button disabled={pending || !versionId} onClick={() => saveBrackets()}>
              {bi("Enregistrer les tranches du brouillon", "حفظ شرائح المسودة")}
            </Button>
          </RhToolbar>
        ) : null}
      </RhPanel>

      <RhPanel className="space-y-3">
        <RhSectionTitle>{bi("Règles Art. 104", "قواعد المادة 104")}</RhSectionTitle>
        {canEdit && selectedSet && sf.id ? (
          <RowActions
            family="IRG_RULES"
            row={selectedSet}
            pending={pending}
            onNewDraft={() => setSf(emptySet(selectedSet))}
            onSubmit={() => setDialog({ kind: "submit", family: "IRG_RULES", row: selectedSet })}
            onVerify={() => setDialog({ kind: "verify", family: "IRG_RULES", row: selectedSet })}
            onDelete={() => removeDraft("IRG_RULES", selectedSet)}
          />
        ) : null}
        {setFormOpen ? (
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
            <RhField label="Mois envisagé" hint="Indicatif : le mois d'application est décidé après approbation (D2).">
              <input
                type="month"
                className={rhInput}
                value={sf.effective_from.slice(0, 7)}
                onChange={(e) => setSf({ ...sf, effective_from: e.target.value ? `${e.target.value}-01` : "" })}
              />
            </RhField>
            {!sf.id ? (
              <RhField label="Copier les règles de">
                <select
                  className={rhInput}
                  value={sf.copy_from_rule_set_id}
                  onChange={(e) => setSf({ ...sf, copy_from_rule_set_id: e.target.value })}
                >
                  <option value="">—</option>
                  {ruleSets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
              </RhField>
            ) : null}
            <div className="flex items-end gap-2">
              <Button disabled={pending} onClick={saveSet}>
                {sf.id ? bi("Enregistrer le brouillon", "حفظ المسودة") : bi("Créer le brouillon", "إنشاء مسودة")}
              </Button>
              {!sf.id && selectedSet ? (
                <Button variant="secondary" onClick={() => setSf(setForm(selectedSet))}>
                  {bi("Annuler", "إلغاء")}
                </Button>
              ) : null}
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
                {editRules ? <th className={rhTh()} /> : null}
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
                  {editRules ? (
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

        {editRules ? (
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
              <Button disabled={pending || !setId} onClick={() => saveRule()}>
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
      {override ? (
        <LegalOverrideDialog
          lines={override.lines}
          pending={pending}
          onClose={() => setOverride(null)}
          onRespect={() => {
            if (override.kind === "brackets") saveBrackets("legal");
            else if (override.kind === "rule") saveRule("legal");
            else setOverride(null);
          }}
          onAuthorize={() => {
            if (override.kind === "brackets") saveBrackets("authorize");
            else if (override.kind === "rule") saveRule("authorize");
            else if (override.ruleId) removeRule(override.ruleId, true);
          }}
        />
      ) : null}
      {dialog?.kind === "submit" ? (
        <SubmitIrgDialog
          family={dialog.family}
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={async (message) => {
            setDialog(null);
            setError(null);
            setInfo(message);
            await reload(versionId, setId);
          }}
        />
      ) : null}
      {dialog?.kind === "verify" ? (
        <VerifyRuleDialog
          family={dialog.family}
          rowId={dialog.row.id}
          label={`${dialog.family === "IRG_BAREME" ? "Barème IRG" : "Règles IRG"} ${dialog.row.code}`}
          valueText={`${dialog.row.label_fr} (reprise, depuis le ${dialog.row.effective_from})`}
          onClose={() => setDialog(null)}
          onDone={() => void reload(versionId, setId)}
        />
      ) : null}
    </div>
  );
}

function RowActions({
  family,
  row,
  pending,
  onNewDraft,
  onSubmit,
  onVerify,
  onDelete,
}: {
  family: "IRG_BAREME" | "IRG_RULES";
  row: IrgVersion | IrgRuleSet;
  pending: boolean;
  onNewDraft: () => void;
  onSubmit: () => void;
  onVerify: () => void;
  onDelete: () => void;
}) {
  const verifyPending = row.proposals.some((p) => p.action === "VERIFY");
  return (
    <RhToolbar>
      <Button variant="secondary" disabled={pending} onClick={onNewDraft}>
        {family === "IRG_BAREME" ? "Nouveau brouillon (copie de ce barème)" : "Nouveau brouillon (copie de ce jeu)"}
      </Button>
      {row.status === "DRAFT" ? (
        <>
          <Button disabled={pending} onClick={onSubmit}>
            Soumettre à approbation
          </Button>
          <Button variant="ghost" className="text-red-700" disabled={pending} onClick={onDelete}>
            Supprimer le brouillon
          </Button>
        </>
      ) : null}
      {row.status === "LEGACY" && !verifyPending ? (
        <Button variant="secondary" disabled={pending} onClick={onVerify}>
          Faire vérifier
        </Button>
      ) : null}
    </RhToolbar>
  );
}

function SubmitIrgDialog({
  family,
  row,
  onClose,
  onDone,
}: {
  family: "IRG_BAREME" | "IRG_RULES";
  row: IrgVersion | IrgRuleSet;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [month, setMonth] = useState(row.effective_from.slice(0, 7) + "-01");
  const [source, setSource] = useState<RuleSourceForm>(() => ({
    ...emptyRuleSource(),
    source_ref: "source_ref" in row && row.source_ref ? row.source_ref : "",
  }));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const r = await submitIrgDraft({
        family,
        draft_id: row.id,
        label: row.code,
        requested_month: month,
        ...source,
      });
      if (!r.ok) return setError(r.error);
      await onDone(r.data.message);
    });
  }

  return (
    <QuickDialog
      title={`Soumettre ${family === "IRG_BAREME" ? "le barème" : "le jeu de règles"} ${row.code}`}
      subtitle={row.label_fr}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Fermer
          </Button>
          <Button disabled={pending || !month} onClick={submit}>
            Soumettre
          </Button>
        </>
      }
    >
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      <ProposalNotice />
      <p className="text-sm text-foreground/70">
        Le brouillon est figé dès la soumission. S&apos;il est retiré ou rejeté, il redevient un brouillon modifiable.
      </p>
      <RhField label="Demandé à partir de la paie de" required hint={`Mois demandé : ${frMonth(month)}`}>
        <input
          type="month"
          className={rhInput}
          value={month.slice(0, 7)}
          onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : "")}
        />
      </RhField>
      <RuleSourceFields value={source} onChange={setSource} month={month} />
    </QuickDialog>
  );
}

