"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import {
  RhAlert,
  RhChip,
  RhPageHeader,
  RhPanel,
  RhTableWrap,
  bi,
  rhInput,
  rhTd,
  rhTh,
} from "@/components/rh/rh-ui";
import {
  activateContractStartRule,
  requestAllContractStartDecisions,
  requestContractStartDecision,
  type DataQualityReport,
  type OffMonthContract,
  type UnconfirmedSite,
} from "@/lib/actions/data-quality";
import { confirmSiteWilaya } from "@/lib/actions/site-wilaya";
import { decisionStatusLabel, decisionStatusTone } from "@/lib/decisions/catalog";
import { WILAYAS } from "@/lib/referentiels/wilayas";

const contractCol = dataColumns<OffMonthContract>();

function frDate(iso: string | null) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

function SiteRow({ site, onDone }: { site: UnconfirmedSite; onDone: (msg: string | null, err: string | null) => void }) {
  const [code, setCode] = useState(site.suggested_code ?? "");
  const [pending, start] = useTransition();
  return (
    <tr className="border-b border-border/60">
      <td className={rhTd()}>
        <span className="font-mono text-xs font-semibold text-brand">{site.code}</span> {site.name_fr}
        {site.is_active ? null : <span className="ml-1 text-xs text-foreground/50">(inactif)</span>}
      </td>
      <td className={rhTd()}>{site.wilaya_text ?? "—"}</td>
      <td className={rhTd()}>
        <select className={rhInput} value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">—</option>
          {WILAYAS.map((w) => (
            <option key={w.code} value={w.code}>
              {w.code} · {w.name}
            </option>
          ))}
        </select>
        {site.suggested_code ? (
          <span className="mt-1 block text-[11px] text-foreground/55">
            {bi("Proposée d'après la saisie libre : à vérifier.", "مقترحة من الإدخال الحر.")}
          </span>
        ) : null}
      </td>
      <td className={`${rhTd()} text-right`}>
        <Button
          disabled={pending || !code}
          onClick={() =>
            start(async () => {
              const r = await confirmSiteWilaya({
                site_id: site.id,
                wilaya_code: code,
                reason: "Confirmation depuis le rapport de qualité des données",
              });
              if (!r.ok) onDone(null, r.error);
              else onDone([`${site.code} : wilaya confirmée.`, r.data.warning].filter(Boolean).join("\n"), null);
            })
          }
        >
          {bi("Confirmer", "تأكيد")}
        </Button>
      </td>
    </tr>
  );
}

export function DataQualityReportView({ report }: { report: DataQualityReport }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const withoutRequest = report.contracts.filter((c) => !c.decision_id).length;

  function done(msg: string | null, err: string | null) {
    setError(err);
    setInfo(msg);
    if (!err) router.refresh();
  }

  function requestOne(contractId: string) {
    start(async () => {
      const r = await requestContractStartDecision(contractId);
      if (!r.ok) done(null, r.error);
      else done("Demande D13 envoyée au Centre de décisions : rien n'est modifié avant la décision.", null);
    });
  }

  const contractColumns = [
    contractCol.accessor("employee", { header: bi("Salarié", "العامل") }),
    contractCol.accessor((c) => c.site_name ?? "", {
      id: "site",
      header: bi("Chantier", "الورشة"),
      cell: (info) => info.getValue() || "—",
    }),
    contractCol.accessor("start_date", { header: bi("Début", "البداية"), cell: (info) => frDate(info.getValue()) }),
    contractCol.accessor((c) => c.end_date ?? "", {
      id: "end_date",
      header: bi("Fin", "النهاية"),
      cell: ({ row }) => frDate(row.original.end_date),
    }),
    contractCol.accessor((c) => (c.fix_allowed ? 1 : 0), {
      id: "fix_allowed",
      header: bi("Correction possible", "التصحيح ممكن"),
      cell: ({ row }) =>
        row.original.fix_allowed ? (
          <RhChip tone="success">{bi("Oui", "نعم")}</RhChip>
        ) : (
          <RhChip tone="neutral">{bi("Mois traité : exception seulement", "شهر معالج")}</RhChip>
        ),
    }),
    contractCol.accessor((c) => (c.decision_id ? decisionStatusLabel(c.decision_status ?? "") : ""), {
      id: "decision",
      header: bi("Décision", "القرار"),
      cell: ({ row }) => {
        const c = row.original;
        return c.decision_id ? (
          <Link href={`/decisions/${c.decision_id}`} className="font-semibold text-brand hover:underline">
            <RhChip tone={decisionStatusTone(c.decision_status ?? "")}>
              {decisionStatusLabel(c.decision_status ?? "")}
            </RhChip>
          </Link>
        ) : (
          <Button variant="secondary" disabled={pending} onClick={() => requestOne(c.contract_id)}>
            {bi("Demander D13", "طلب D13")}
          </Button>
        );
      },
    }),
  ];

  function requestAll() {
    start(async () => {
      const r = await requestAllContractStartDecisions();
      if (!r.ok) done(null, r.error);
      else done(`${r.data.count} demande(s) D13 envoyée(s) au Centre de décisions.`, null);
    });
  }

  function activate() {
    if (
      !window.confirm(
        "Ajouter la contrainte « début au 1er du mois » à la base ? Elle refusera ensuite tout contrat hors du 1er, sauf les exceptions historiques documentées.",
      )
    ) {
      return;
    }
    start(async () => {
      const r = await activateContractStartRule();
      if (!r.ok) done(null, r.error);
      else done(r.data.already ? "Contrainte déjà active." : "Contrainte ajoutée à la base.", null);
    });
  }

  return (
    <div className="space-y-5">
      <RhPageHeader
        title={bi("Qualité des données", "جودة البيانات")}
        description={bi(
          "Référentiel et affectations datées : wilaya codée de chaque chantier et contrats commençant le 1er du mois. Rien n'est corrigé d'office : chaque point est confirmé ou soumis à décision.",
          "لا يُصحَّح شيء تلقائياً: كل نقطة تُؤكَّد أو تُعرض على القرار.",
        )}
      />
      {error ? (
        <RhAlert tone="danger">
          <span className="whitespace-pre-wrap">{error}</span>
        </RhAlert>
      ) : null}
      {info && !error ? (
        <RhAlert tone="success">
          <span className="whitespace-pre-wrap">{info}</span>
        </RhAlert>
      ) : null}

      <RhPanel>
        <h3 className="font-display text-base font-semibold">
          {bi("Chantiers sans wilaya codée", "ورشات بدون ولاية مرمزة")} · {report.sites.length}
        </h3>
        <p className="mt-1 text-sm text-foreground/65">
          {bi(
            "La wilaya confirmée s'applique depuis l'origine du chantier et détermine la zone IRG des mois non traités. Tant qu'elle n'est pas confirmée, la saisie libre reste utilisée.",
            "الولاية المؤكدة تسري منذ البداية وتحدد المنطقة الضريبية.",
          )}
        </p>
        {report.sites.length ? (
          <RhTableWrap>
            <table className="min-w-full">
              <thead className="border-b border-border/70 bg-surface-muted/60">
                <tr>
                  <th className={rhTh()}>{bi("Chantier", "الورشة")}</th>
                  <th className={rhTh()}>{bi("Saisie libre actuelle", "الإدخال الحالي")}</th>
                  <th className={rhTh()}>{bi("Wilaya codée", "الولاية المرمزة")}</th>
                  <th className={rhTh()} />
                </tr>
              </thead>
              <tbody>
                {report.sites.map((s) => (
                  <SiteRow key={s.id} site={s} onDone={done} />
                ))}
              </tbody>
            </table>
          </RhTableWrap>
        ) : (
          <p className="mt-3 text-sm text-emerald-700">{bi("Tous les chantiers ont une wilaya codée.", "كل الورشات لها ولاية مرمزة.")}</p>
        )}
      </RhPanel>

      <RhPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold">
              {bi("Contrats ne commençant pas le 1er du mois", "عقود لا تبدأ في أول الشهر")} · {report.contracts.length}
            </h3>
            <p className="mt-1 text-sm text-foreground/65">
              {bi(
                "Décision D13 par contrat : corriger la date de début au 1er du même mois (si ce mois n'est pas déjà traité) ou documenter une exception historique.",
                "قرار D13 لكل عقد.",
              )}
            </p>
          </div>
          {withoutRequest > 0 ? (
            <Button disabled={pending} onClick={requestAll}>
              {bi(`Demander les ${withoutRequest} décision(s) D13`, "طلب قرارات D13")}
            </Button>
          ) : null}
        </div>
        <DataTable
          className="mt-3"
          data={report.contracts}
          columns={contractColumns}
          getRowId={(c) => c.contract_id}
          searchPlaceholder="Rechercher un salarié ou un chantier…"
          searchText={(c) => [c.employee, c.site_name].filter(Boolean).join(" ")}
          emptyTitle={bi("Aucun contrat hors du 1er du mois", "لا توجد عقود خارج أول الشهر")}
          emptyBody={bi("Parmi les contrats visibles avec vos droits.", "ضمن العقود المرئية حسب صلاحياتك.")}
        />
      </RhPanel>

      <RhPanel>
        <h3 className="font-display text-base font-semibold">
          {bi("Contrainte « début au 1er du mois »", "قيد البداية في أول الشهر")}
        </h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase text-foreground/45">{bi("État", "الحالة")}</dt>
            <dd>
              {report.rule.active ? (
                <RhChip tone="success">
                  {bi("Active", "مفعلة")} · {frDate(report.rule.activated_at)}
                  {report.rule.activated_by ? ` · ${report.rule.activated_by}` : ""}
                </RhChip>
              ) : (
                <RhChip tone="warning">{bi("Pas encore ajoutée", "غير مضافة")}</RhChip>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-foreground/45">{bi("Contrats sans décision", "عقود بدون قرار")}</dt>
            <dd>{report.rule.pending}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-foreground/45">{bi("Exceptions documentées", "استثناءات موثقة")}</dt>
            <dd>{report.rule.exceptions}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-foreground/65">
          {bi(
            "Toute nouvelle date de début hors du 1er est déjà refusée. La contrainte de la base s'ajoute une fois toutes les décisions D13 prises (tous chantiers confondus), par le SUPER_ADMIN.",
            "يُضاف القيد بعد اتخاذ كل قرارات D13.",
          )}
        </p>
        {!report.rule.active && report.is_super_admin ? (
          <div className="mt-3">
            <Button disabled={pending || report.rule.pending > 0} onClick={activate}>
              {bi("Ajouter la contrainte à la base", "إضافة القيد")}
            </Button>
          </div>
        ) : null}
      </RhPanel>
    </div>
  );
}
