import { legendMovementBucket, type AttendanceLegend, type MovementBucket } from "@/lib/hr/attendance-movements";
import { formatLegendCoefficient } from "@/lib/hr/legend-coefficient";
import { periodBounds } from "@/lib/hr/payroll-simulator";
import type { SimulatorData } from "@/lib/hr/payroll-simulator-load";
import type { SimContext, SimOutput, SimVarDef } from "@/lib/sim/core";
import { paieDaysFromCtx, paieVariables } from "@/lib/sim/paie";

/** The payroll catalogue: variables that do not reach the pointage show as « sans effet ». */
export function pointageVariables(data: SimulatorData): SimVarDef[] {
  return paieVariables(data);
}

const BUCKET_STYLE: Record<MovementBucket, string> = {
  worked: "#dcfce7",
  leave: "#dbeafe",
  absence: "#fee2e2",
  weekend: "#f1f5f9",
  abandon: "#fde68a",
  rappel: "#ede9fe",
  other: "#ffffff",
};

const BUCKET_LABEL: Record<MovementBucket, string> = {
  worked: "Travail",
  leave: "Congé",
  absence: "Absence",
  weekend: "Repos / férié",
  abandon: "Abandon",
  rappel: "Rappel",
  other: "Autre",
};

const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function chip(code: string, legend: AttendanceLegend | undefined) {
  if (!legend) return `<span class="chip${code ? "" : " empty"}">${esc(code || "—")}</span>`;
  const bg = legend.color_bg || BUCKET_STYLE[legendMovementBucket(legend)];
  return `<span class="chip" style="background:${esc(bg)};color:${esc(legend.color_fg || "#0f172a")}">${esc(code)}</span>`;
}

export function pointageOutput(data: SimulatorData, ctx: SimContext): SimOutput {
  const subject = data.subject;
  const counts = paieDaysFromCtx(data, ctx);
  const mov = counts.movements;
  const { start, days } = periodBounds(data.year, data.month);
  const prefix = start.slice(0, 8);
  const legendByCode = new Map(data.legends.map((l) => [l.code.toUpperCase(), l]));

  const used = new Map<string, number>();
  let coefTotal = 0;
  const rows: string[] = [];
  for (let d = 1; d <= days; d += 1) {
    const date = `${prefix}${String(d).padStart(2, "0")}`;
    const id = `pointage.${date}`;
    const codes = [ctx.str(id), ctx.str(`${id}~2`)].map((c) => c.trim()).filter(Boolean);
    const legends = codes.map((c) => legendByCode.get(c.toUpperCase()));
    codes.forEach((c) => used.set(c.toUpperCase(), (used.get(c.toUpperCase()) ?? 0) + 1));
    const coef = legends.reduce((n, l) => n + (l?.coefficient ?? 0), 0);
    coefTotal += coef;
    const bucket = legends[0] ? legendMovementBucket(legends[0]) : null;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    rows.push(
      `<tr${bucket === "weekend" ? ' class="rest"' : ""}><td class="n">${String(d).padStart(2, "0")}</td><td class="dow">${WEEKDAYS[dow]}</td><td data-sim-var="${id}"${
        ctx.isOverridden(id) ? ' class="chg"' : ""
      }>${codes.length ? codes.map((c, i) => chip(c, legends[i])).join(" ") : chip("", undefined)}</td><td class="lbl">${esc(
        legends.map((l) => l?.label_fr ?? "Code inconnu").join(" / "),
      )}</td><td class="typ">${bucket ? BUCKET_LABEL[bucket] : ""}</td><td class="num">${codes.length ? formatLegendCoefficient(coef) : ""}</td></tr>`,
    );
  }

  const summary: [string, number][] = mov
    ? [
        ["Jours payés", mov.days_paid],
        ["Présence (quantité)", mov.days_presence_qty],
        ["Jours travaillés", mov.days_worked],
        ["Congés", mov.days_leave],
        ["Absences", mov.days_absence],
        ["Week-ends / fériés", mov.days_weekend],
        ["Abandon", mov.days_abandon],
        ["Rappels", mov.days_rappel],
        ["Congé annuel (CA)", counts.annualLeave],
        ["Jours de contrat", counts.covered],
      ]
    : [];
  const month = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${start}T00:00:00Z`),
  );
  const usedRows = [...used.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => {
      const l = legendByCode.get(code);
      return `<tr><td>${chip(l?.code ?? code, l)}</td><td class="lbl">${esc(l?.label_fr ?? "Code inconnu")}</td><td class="num">${n}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;font-family:"Segoe UI",Inter,system-ui,Arial,sans-serif;color:#0f172a;background:#fff;font-size:12px}
    .page{padding:28px 30px 32px}
    .hd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding-bottom:14px;border-bottom:2px solid #1e4db7;margin-bottom:16px}
    .eyebrow{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1e4db7}
    h1{font-size:22px;margin:2px 0 0;font-weight:700;text-transform:capitalize}
    .who{text-align:right;font-size:12px;color:#475569;line-height:1.5}.who b{display:block;font-size:14px;color:#0f172a}
    .body{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:18px;align-items:start}
    table{width:100%;border-collapse:separate;border-spacing:0}
    .pt{table-layout:fixed;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
    .pt th{background:#f1f5f9;color:#475569;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;text-align:left;padding:7px 8px;border-bottom:1px solid #e2e8f0}
    .pt td{padding:3px 8px;border-bottom:1px solid #f1f5f9;height:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pt tbody tr:nth-child(even){background:#fafbfc}
    .pt tbody tr.rest{background:#f1f5f9;color:#64748b}
    .pt tbody tr:hover{background:#eef4ff}
    .pt tbody tr:has(td.chg){background:#fffbeb}
    .pt tfoot td{background:#f8fafc;font-weight:700;border-top:1px solid #e2e8f0;border-bottom:0;padding:7px 8px}
    .n{color:#94a3b8;font-variant-numeric:tabular-nums}.dow{color:#64748b}
    .lbl{color:#334155}.typ{color:#64748b;font-size:11px}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .chip{display:inline-block;min-width:34px;padding:2px 7px;border-radius:6px;font-weight:700;font-size:11px;text-align:center;background:#e2e8f0;border:1px solid rgba(15,23,42,.08)}
    .chip.empty{background:transparent;border:1px dashed #cbd5e1;color:#94a3b8;font-weight:400}
    td.chg .chip{box-shadow:0 0 0 2px #f59e0b}
    .card{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:14px}
    .card h2{margin:0;padding:8px 10px;background:#f1f5f9;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#475569;border-bottom:1px solid #e2e8f0}
    .card td{padding:5px 10px;border-bottom:1px solid #f1f5f9;font-size:12px}
    .card tr:last-child td{border-bottom:0}
    .card .lbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}
    .hint{margin-top:10px;font-size:10.5px;color:#94a3b8}
  </style></head><body><div class="page">
    <div class="hd">
      <div><div class="eyebrow">Fiche de pointage · بطاقة الحضور</div><h1>${esc(month)}</h1></div>
      <div class="who">${
        subject
          ? `<b>${esc(subject.employee.name)}</b>Matricule ${esc(subject.employee.matricule)} · ${esc(subject.contract.site_name)}`
          : "<b>Simulation</b>Aucun salarié choisi"
      }</div>
    </div>
    <div class="body">
      <div>
        <table class="pt">
          <colgroup><col style="width:38px"><col style="width:46px"><col style="width:120px"><col><col style="width:92px"><col style="width:52px"></colgroup>
          <thead><tr><th>Jour</th><th></th><th>Code</th><th>Désignation</th><th>Type</th><th class="num">Coef.</th></tr></thead>
          <tbody>${rows.join("")}</tbody>
          <tfoot><tr><td colspan="5">Total · ${days} jours</td><td class="num">${formatLegendCoefficient(coefTotal)}</td></tr></tfoot>
        </table>
        <p class="hint">Cliquez un code pour le changer : la fiche de paie liée se recalcule aussitôt.</p>
      </div>
      <div>
        <div class="card"><h2>Récapitulatif</h2><table><tbody>${summary
          .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num"><b>${v}</b></td></tr>`)
          .join("")}</tbody></table></div>
        ${usedRows ? `<div class="card"><h2>Codes du mois</h2><table><tbody>${usedRows}</tbody></table></div>` : ""}
      </div>
    </div>
  </div></body></html>`;

  const warnings: string[] = [];
  if (!subject) warnings.push("Choisissez un salarié pour simuler son pointage.");
  if (mov && mov.days_paid > counts.covered) {
    warnings.push(`${mov.days_paid} jours payés > ${counts.covered} jours de contrat : la paie plafonnera.`);
  }
  return {
    html,
    pageWidth: 820,
    figures: mov
      ? [
          { key: "paid", label: "Jours payés", value: mov.days_paid, format: "days", emphasis: true, goodWhenUp: true },
          { key: "presence", label: "Présence", value: mov.days_presence_qty, format: "days" },
          { key: "worked", label: "Travaillés", value: mov.days_worked, format: "days" },
          { key: "leave", label: "Congés", value: mov.days_leave, format: "days" },
          { key: "absence", label: "Absences", value: mov.days_absence, format: "days" },
          { key: "weekend", label: "Week-ends", value: mov.days_weekend, format: "days" },
        ]
      : [],
    warnings,
  };
}
