import { fractionPct, frDay, plainPct, type RuleAction, type RuleFamily } from "@/lib/rules/proposals";

type Content = Record<string, unknown> | null;

const PART = { EMPLOYEE: "part salariale", EMPLOYER: "part patronale" } as Record<string, string>;
const BASE = { COTISABLE: "brut cotisable", TAXABLE: "brut imposable" } as Record<string, string>;
const RULE_KIND: Record<string, string> = {
  EXEMPTION_THRESHOLD: "Exonération",
  ABATEMENT_ON_TAX: "Abattement",
  LISSAGE: "Lissage",
  BASE_PREPROCESS: "Base (déductions)",
  NON_MONTHLY_WITHHOLDING: "Retenue non mensuelle",
};

const money = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return v == null || !Number.isFinite(n) ? "∞" : new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(n);
};

function list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function period(c: Record<string, unknown>) {
  if (!c.effective_from) return null;
  return `du ${frDay(String(c.effective_from))}${c.effective_to ? ` au ${frDay(String(c.effective_to))}` : ""}`;
}

function paramsText(p: unknown) {
  if (!p || typeof p !== "object") return null;
  const x = p as Record<string, unknown>;
  return [
    x.part ? PART[String(x.part)] : null,
    x.base ? BASE[String(x.base)] : null,
    x.reduces_irg === true ? "déductible IRG" : null,
    x.scope && x.scope !== "ALL" ? String(x.scope).toLowerCase().replace(/_/g, " ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Lines({ lines }: { lines: (string | null | false | undefined)[] }) {
  const shown = lines.filter(Boolean) as string[];
  return (
    <ul className="space-y-0.5">
      {shown.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

/** Readable rendering of a rule content (ref_rule_row_content or a proposal payload). */
export function RuleContent({
  family,
  action,
  content,
}: {
  family: RuleFamily;
  action?: RuleAction;
  content: Content;
}) {
  if (action === "STOP") return <p>Arrêt de la cotisation à partir du mois appliqué.</p>;
  if (!content) return <p className="text-foreground/50">Aucune valeur (taux légal ou rien en vigueur).</p>;
  const c = content;
  const deviations = strings(c.deviations);
  const devLine = deviations.length ? `Écart au texte légal autorisé : ${deviations.join(" ; ")}` : null;

  if (family === "LEGAL_VAR") {
    const value = typeof c.value === "number" ? c.value : Number(c.value);
    return (
      <Lines
        lines={[
          `Valeur : ${Number.isFinite(value) && value <= 1 ? fractionPct(value) : money(c.value)}`,
          paramsText(c.params),
          period(c),
          devLine,
        ]}
      />
    );
  }
  if (family === "CNAS_RATES") {
    return (
      <Lines
        lines={[
          `Salarié ${plainPct(c.employee_pct)} · employeur ${plainPct(c.employer_pct)} · FOS ${plainPct(c.fos_pct)}`,
          period(c),
          devLine,
        ]}
      />
    );
  }
  if (family === "IRG_BAREME") {
    const rows = list(c.brackets);
    return (
      <div className="space-y-1">
        <p>
          {String(c.code ?? "")} {c.label ? `— ${String(c.label)}` : ""}
          {c.source_ref ? <span className="text-foreground/55"> · {String(c.source_ref)}</span> : null}
        </p>
        {period(c) && c.status !== "DRAFT" && c.status !== "PROPOSED" ? <p>{period(c)}</p> : null}
        <table className="text-xs tabular-nums">
          <tbody>
            {rows.map((b, i) => (
              <tr key={i}>
                <td className="pr-3">{money(b.min_annual)}</td>
                <td className="pr-3">→ {money(b.max_annual)}</td>
                <td>{fractionPct(b.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (family === "IRG_RULES") {
    const rows = list(c.rules);
    return (
      <div className="space-y-1">
        <p>
          {String(c.code ?? "")} {c.label ? `— ${String(c.label)}` : ""} ·{" "}
          {c.taxpayer_category === "DISABLED_OR_RETIREE" ? "handicapé / retraité" : "salarié"}
        </p>
        <ul className="space-y-0.5 text-xs">
          {rows.map((r, i) => (
            <li key={i}>
              <b>{RULE_KIND[String(r.kind)] ?? String(r.kind)}</b> ({String(r.sequence ?? "")}) ·{" "}
              <span className="font-mono">{JSON.stringify(r.params ?? {})}</span>
              {r.formula ? <span className="font-mono"> · {String(r.formula)}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const wilayas = strings(c.wilaya_labels).length ? strings(c.wilaya_labels) : strings(c.wilayas);
  return (
    <Lines
      lines={[
        c.source === "catalog" ? "Liste du catalogue (non datée)" : null,
        c.mode === "GROUP" || c.scope_mode === "GROUP"
          ? `Reprise du groupement ${String(c.group_from ?? "")}`
          : null,
        `${wilayas.length} wilaya(s) : ${wilayas.join(", ") || "—"}`,
        period(c),
      ]}
    />
  );
}

export function RuleDiff({
  family,
  action,
  current,
  proposed,
}: {
  family: RuleFamily;
  action: RuleAction;
  current: Content;
  proposed: Content;
}) {
  if (action === "VERIFY") {
    return (
      <div className="rounded-xl border border-border/60 p-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase text-foreground/55">Valeur à confirmer (inchangée)</p>
        <RuleContent family={family} content={proposed ?? current} />
      </div>
    );
  }
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-xl border border-border/60 p-3">
        <p className="mb-1 text-xs font-semibold uppercase text-foreground/55">En vigueur au mois demandé</p>
        <RuleContent family={family} content={current} />
      </div>
      <div className="rounded-xl border border-brand/30 bg-brand-muted/10 p-3">
        <p className="mb-1 text-xs font-semibold uppercase text-brand">Proposé</p>
        <RuleContent family={family} action={action} content={proposed} />
      </div>
    </div>
  );
}
