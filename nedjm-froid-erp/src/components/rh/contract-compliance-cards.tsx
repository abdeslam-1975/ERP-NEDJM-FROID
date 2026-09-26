"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  endComplianceOverride,
  getContractCompliance,
  saveComplianceOverride,
  type ContractCompliance,
} from "@/lib/actions/hr-compliance";
import {
  complianceLabels,
  DISABLED_IRG_CATEGORY,
  FIXED_IRG_RATES,
  type ComplianceDomain,
  type ComplianceOverride,
} from "@/lib/hr/compliance";
import { Button } from "@/components/ui/button";
import { RhAlert, RhChip, RhField, bi, rhInput } from "@/components/rh/rh-ui";

type Draft = {
  option_code: string;
  zone_code: string;
  rate: string;
  regime_code: string;
  conges: boolean;
  intemperies: boolean;
  reason: string;
  effective_from: string;
};

function firstOfMonth() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function pct(fraction: number) {
  return `${Math.round(fraction * 10000) / 100} %`;
}

const IRG_OPTIONS: { code: string; label: string }[] = [
  { code: "BAREME", label: bi("Barème général", "السلم العام") },
  { code: "ZONE", label: bi("Zone Sud / Extrême Sud", "منطقة الجنوب / أقصى الجنوب") },
  { code: "HANDICAP", label: bi("Handicapé / retraité (lissage étendu)", "ذوو الاحتياجات / المتقاعدون") },
  { code: "EXEMPT", label: bi("Exonération totale", "إعفاء تام") },
  { code: "FIXED_RATE", label: bi("Taux libératoire fixe", "نسبة محررة ثابتة") },
];

function overrideText(o: ComplianceOverride, info: ContractCompliance) {
  if (o.domain === "IRG") {
    const opt = IRG_OPTIONS.find((x) => x.code === o.option_code)?.label ?? o.option_code;
    if (o.option_code === "ZONE") {
      const z = info.zones.find((x) => x.code === o.params.zone_code);
      return `${opt} : ${z?.label_fr ?? String(o.params.zone_code)}`;
    }
    if (o.option_code === "FIXED_RATE") return `${opt} ${pct(Number(o.params.rate))}`;
    return opt;
  }
  if (o.domain === "CNAS") {
    const r = info.regimes.find((x) => x.code === o.params.regime_code);
    return r?.label_fr ?? String(o.params.regime_code);
  }
  const parts = [o.params.conges ? "congés" : null, o.params.intemperies ? "intempéries" : null].filter(Boolean);
  return parts.length ? parts.join(" + ") : bi("Non assujetti", "غير خاضع");
}

function activeOverride(info: ContractCompliance, domain: ComplianceDomain) {
  return (
    info.overrides.find(
      (o) =>
        o.domain === domain &&
        o.effective_from <= info.as_of &&
        (!o.effective_to || o.effective_to >= info.as_of),
    ) ??
    info.overrides.find((o) => o.domain === domain && o.effective_from > info.as_of) ??
    null
  );
}

export function ContractComplianceCards({
  contractId,
  canEdit,
}: {
  contractId: string;
  canEdit: boolean;
}) {
  const [info, setInfo] = useState<ContractCompliance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ComplianceDomain | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [autoFrom, setAutoFrom] = useState(firstOfMonth());
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const r = await getContractCompliance(contractId);
    if (r.ok) setInfo(r.data);
    else setError(r.error);
  }, [contractId]);

  useEffect(() => {
    let cancelled = false;
    getContractCompliance(contractId).then((r) => {
      if (cancelled) return;
      if (r.ok) setInfo(r.data);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  if (error && !info) return <RhAlert tone="danger">{error}</RhAlert>;
  if (!info) {
    return <p className="text-sm text-foreground/55">{bi("Chargement…", "جارٍ التحميل…")}</p>;
  }

  const autoLabels = complianceLabels(info.auto, info.zones, info.regimes);
  const currentLabels = complianceLabels(info.current, info.zones, info.regimes);
  const zoneName = info.zones.find((z) => z.code === info.site_zone.code)?.label_fr ?? info.site_zone.code;
  const zoneSource =
    info.site_zone.source === "site"
      ? bi("fixée sur la fiche chantier", "محددة في بطاقة الورشة")
      : info.site_zone.source === "wilaya"
        ? `${bi("déduite de la wilaya", "مستنتجة من الولاية")} ${info.site_wilaya ?? ""}`
        : bi("par défaut (wilaya non rattachée)", "افتراضية (الولاية غير مربوطة)");

  function openEditor(domain: ComplianceDomain) {
    setError(null);
    setNotice(null);
    setEditing(domain);
    setDraft({
      option_code: domain === "IRG" ? "BAREME" : domain === "CNAS" ? "REGIME" : "CUSTOM",
      zone_code: info?.zones.find((z) => z.code !== "NORMAL")?.code ?? info?.site_zone.code ?? "",
      rate: String(FIXED_IRG_RATES[0]),
      regime_code: info?.current.cnas.regime_code ?? "STANDARD",
      conges: info?.current.cacobatph.conges ?? false,
      intemperies: info?.current.cacobatph.intemperies ?? false,
      reason: "",
      effective_from: firstOfMonth(),
    });
  }

  function save() {
    if (!editing || !draft) return;
    const params: Record<string, unknown> =
      editing === "IRG"
        ? draft.option_code === "ZONE"
          ? { zone_code: draft.zone_code }
          : draft.option_code === "FIXED_RATE"
            ? { rate: Number(draft.rate) }
            : {}
        : editing === "CNAS"
          ? { regime_code: draft.regime_code }
          : { conges: draft.conges, intemperies: draft.intemperies };
    setError(null);
    start(async () => {
      const r = await saveComplianceOverride({
        contract_id: contractId,
        domain: editing,
        option_code: draft.option_code,
        params,
        reason: draft.reason,
        effective_from: draft.effective_from,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(null);
      setDraft(null);
      setNotice(
        r.data.refreshed_slips
          ? bi(
              `Dérogation enregistrée. ${r.data.refreshed_slips} bulletin(s) brouillon recalculé(s).`,
              "تم حفظ الاستثناء وأُعيد حساب كشوف المسودة.",
            )
          : bi("Dérogation enregistrée.", "تم حفظ الاستثناء."),
      );
      await load();
    });
  }

  function backToAuto(o: ComplianceOverride) {
    setError(null);
    start(async () => {
      const r = await endComplianceOverride({ id: o.id, auto_from: autoFrom });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNotice(
        r.data.deleted
          ? bi("Dérogation supprimée : mode automatique rétabli.", "حُذف الاستثناء وعاد الوضع الآلي.")
          : bi(`Mode automatique à partir du ${autoFrom}.`, "الوضع الآلي ابتداءً من التاريخ المحدد."),
      );
      await load();
    });
  }

  const cards: {
    domain: ComplianceDomain;
    title: string;
    current: string;
    autoText: string;
    autoDetail: string[];
    mode: "AUTO" | "MANUAL";
  }[] = [
    {
      domain: "IRG",
      title: bi("IRG — impôt sur le revenu", "الضريبة على الدخل IRG"),
      current: currentLabels.irg,
      autoText: autoLabels.irg,
      autoDetail: [
        `${bi("Zone", "المنطقة")} : ${zoneName} (${zoneSource})${
          info.zone_rates[info.site_zone.code] ? ` −${pct(info.zone_rates[info.site_zone.code])}` : ""
        }`,
        `${bi("Catégorie (fiche employé)", "الفئة (ملف العامل)")} : ${
          info.irg_category === DISABLED_IRG_CATEGORY
            ? bi("handicapé / retraité", "ذوو الاحتياجات / متقاعد")
            : bi("standard", "عادي")
        }`,
      ],
      mode: info.current.irg.mode,
    },
    {
      domain: "CNAS",
      title: bi("CNAS — sécurité sociale", "الضمان الاجتماعي CNAS"),
      current: currentLabels.cnas,
      autoText: autoLabels.cnas,
      autoDetail: [
        `${bi("Profil social (fiche employé)", "ملف الاشتراك (ملف العامل)")} : ${
          info.social_profile_code ?? bi("non renseigné → Standard", "غير محدد ← عادي")
        }`,
      ],
      mode: info.current.cnas.mode,
    },
    {
      domain: "CACOBATPH",
      title: bi("CACOBATPH — congés & intempéries", "كاكوباتف — العطل والطقس"),
      current: currentLabels.cacobatph,
      autoText: autoLabels.cacobatph,
      autoDetail: [bi("Selon l'activité du contrat / chantier", "حسب نشاط العقد / الورشة")],
      mode: info.current.cacobatph.mode,
    },
  ];

  return (
    <div className="space-y-3">
      {error ? <RhAlert tone="danger">{error}</RhAlert> : null}
      {notice && !error ? <RhAlert tone="success">{notice}</RhAlert> : null}
      <div className="grid gap-3 lg:grid-cols-3">
        {cards.map((card) => {
          const active = activeOverride(info, card.domain);
          const history = info.overrides.filter((o) => o.domain === card.domain && o.id !== active?.id);
          return (
            <div key={card.domain} className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold">{card.title}</h4>
                <RhChip tone={card.mode === "MANUAL" ? "warning" : "success"}>
                  {card.mode === "MANUAL" ? bi("Manuel", "يدوي") : bi("Auto", "آلي")}
                </RhChip>
              </div>
              <p className="text-sm font-medium">{card.current}</p>
              <div className="rounded-xl bg-surface-muted/60 p-2.5 text-xs text-foreground/65">
                <div className="font-semibold">
                  {bi("Automatique", "آلي")} : {card.autoText}
                </div>
                {card.autoDetail.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>

              {active ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
                  <div className="font-semibold">{overrideText(active, info)}</div>
                  <div>
                    {bi("Du", "من")} {active.effective_from}
                    {active.effective_to ? ` ${bi("au", "إلى")} ${active.effective_to}` : ""}
                  </div>
                  <div className="text-foreground/65">
                    {bi("Motif", "السبب")} : {active.reason}
                  </div>
                  {canEdit ? (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="text-[11px]">
                        {bi("Auto à partir du", "آلي ابتداءً من")}
                        <input
                          type="date"
                          className={`${rhInput} h-8`}
                          value={autoFrom}
                          onChange={(e) => setAutoFrom(e.target.value)}
                        />
                      </label>
                      <Button variant="secondary" className="h-8" disabled={pending} onClick={() => backToAuto(active)}>
                        {bi("Revenir en auto", "العودة للآلي")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {history.length ? (
                <details className="text-xs text-foreground/60">
                  <summary className="cursor-pointer">
                    {bi("Historique", "السجل")} ({history.length})
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {history.map((o) => (
                      <li key={o.id}>
                        {o.effective_from} → {o.effective_to ?? "…"} · {overrideText(o, info)} · {o.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {canEdit && editing !== card.domain ? (
                <Button variant="secondary" className="mt-auto" disabled={pending} onClick={() => openEditor(card.domain)}>
                  {bi("Dérogation manuelle", "استثناء يدوي")}
                </Button>
              ) : null}

              {editing === card.domain && draft ? (
                <div className="space-y-2 rounded-xl border border-border/70 p-2.5">
                  {card.domain === "IRG" ? (
                    <>
                      <RhField label={bi("Option", "الخيار")}>
                        <select
                          className={rhInput}
                          value={draft.option_code}
                          onChange={(e) => setDraft({ ...draft, option_code: e.target.value })}
                        >
                          {IRG_OPTIONS.filter((o) => o.code !== "FIXED_RATE" || info.allows_fixed_irg).map((o) => (
                            <option key={o.code} value={o.code}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </RhField>
                      {!info.allows_fixed_irg ? (
                        <p className="text-[11px] text-foreground/55">
                          {bi(
                            "Taux libératoire : à autoriser sur le type de contrat (allows_fixed_irg).",
                            "النسبة المحررة: تُفعَّل على نوع العقد.",
                          )}
                        </p>
                      ) : null}
                      {draft.option_code === "ZONE" ? (
                        <RhField label={bi("Zone", "المنطقة")}>
                          <select
                            className={rhInput}
                            value={draft.zone_code}
                            onChange={(e) => setDraft({ ...draft, zone_code: e.target.value })}
                          >
                            {info.zones.map((z) => (
                              <option key={z.code} value={z.code}>
                                {z.label_fr} ({pct(info.zone_rates[z.code] ?? 0)})
                              </option>
                            ))}
                          </select>
                        </RhField>
                      ) : null}
                      {draft.option_code === "FIXED_RATE" ? (
                        <RhField label={bi("Taux", "النسبة")}>
                          <select
                            className={rhInput}
                            value={draft.rate}
                            onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
                          >
                            {FIXED_IRG_RATES.map((r) => (
                              <option key={r} value={String(r)}>
                                {pct(r)}
                              </option>
                            ))}
                          </select>
                        </RhField>
                      ) : null}
                    </>
                  ) : null}
                  {card.domain === "CNAS" ? (
                    <RhField label={bi("Régime CNAS", "نظام الاشتراك")}>
                      <select
                        className={rhInput}
                        value={draft.regime_code}
                        onChange={(e) => setDraft({ ...draft, regime_code: e.target.value })}
                      >
                        {info.regimes.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.code} · {r.label_fr}
                          </option>
                        ))}
                      </select>
                    </RhField>
                  ) : null}
                  {card.domain === "CACOBATPH" ? (
                    <div className="space-y-1 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.conges}
                          onChange={(e) => setDraft({ ...draft, conges: e.target.checked })}
                        />
                        {bi("Congés payés", "العطل المدفوعة")}
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.intemperies}
                          onChange={(e) => setDraft({ ...draft, intemperies: e.target.checked })}
                        />
                        {bi("Intempéries", "انقطاعات الطقس")}
                      </label>
                    </div>
                  ) : null}
                  <RhField label={bi("Effectif à partir du", "يسري من")}>
                    <input
                      type="date"
                      className={rhInput}
                      value={draft.effective_from}
                      onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })}
                    />
                  </RhField>
                  <RhField label={bi("Motif (obligatoire)", "السبب (إلزامي)")}>
                    <textarea
                      className={`${rhInput} h-16 py-2`}
                      value={draft.reason}
                      onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                    />
                  </RhField>
                  <p className="text-[11px] text-foreground/55">
                    {bi(
                      "S'applique à tout mois touché par la période. Les bulletins brouillon sont recalculés.",
                      "يُطبَّق على كل شهر تشمله الفترة، وتُعاد حسابات كشوف المسودة.",
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button disabled={pending} onClick={save}>
                      {bi("Enregistrer", "حفظ")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setEditing(null);
                        setDraft(null);
                      }}
                    >
                      {bi("Annuler", "إلغاء")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
