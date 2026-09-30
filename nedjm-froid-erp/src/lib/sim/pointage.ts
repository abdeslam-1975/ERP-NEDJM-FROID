import { legendMovementBucket, type MovementBucket } from "@/lib/hr/attendance-movements";
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

const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function pointageOutput(data: SimulatorData, ctx: SimContext): SimOutput {
  const subject = data.subject;
  const counts = paieDaysFromCtx(data, ctx);
  const mov = counts.movements;
  const { start, days } = periodBounds(data.year, data.month);
  const prefix = start.slice(0, 8);
  const legendByCode = new Map(data.legends.map((l) => [l.code.toUpperCase(), l]));

  const cells: string[] = [];
  const firstDow = new Date(`${start}T00:00:00Z`).getUTCDay();
  for (let i = 0; i < firstDow; i += 1) cells.push(`<td class="pad"></td>`);
  for (let d = 1; d <= days; d += 1) {
    const date = `${prefix}${String(d).padStart(2, "0")}`;
    const id = `pointage.${date}`;
    const codes = [ctx.str(id), ctx.str(`${id}~2`)].filter((c) => c.trim());
    const legend = codes[0] ? legendByCode.get(codes[0].toUpperCase()) : undefined;
    const bg = legend ? BUCKET_STYLE[legendMovementBucket(legend)] : "#ffffff";
    cells.push(
      `<td data-sim-var="${id}"${ctx.isOverridden(id) ? ' class="chg"' : ""} style="background:${bg}"><div class="d">${d}</div><div class="c">${esc(codes.join(" / ") || "·")}</div>${
        legend ? `<div class="l">×${legend.coefficient}</div>` : ""
      }</td>`,
    );
    if ((firstDow + d) % 7 === 0) cells.push("</tr><tr>");
  }
  const rows = `<tr>${cells.join("")}</tr>`;

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
  const legendRows = data.legends
    .map((l) => `<span class="lg" style="background:${BUCKET_STYLE[legendMovementBucket(l)]}">${esc(l.code)} · ${esc(l.label_fr)} ×${l.coefficient}</span>`)
    .join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    body{margin:0;font-family:Arial,Tahoma,sans-serif;color:#111;background:#fff}
    .page{padding:28px 32px}
    h1{font-size:18px;margin:0 0 2px}
    .sub{color:#555;font-size:12px;margin-bottom:14px}
    table.cal{width:100%;border-collapse:collapse;table-layout:fixed}
    table.cal th{font-size:11px;color:#666;padding:4px;border-bottom:1px solid #ddd}
    table.cal td{border:1px solid #e2e8f0;height:62px;vertical-align:top;padding:4px}
    td.pad{border:none;background:transparent}
    td.chg{box-shadow:inset 0 0 0 2px #f59e0b}
    .d{font-size:10px;color:#64748b}.c{font-size:15px;font-weight:700;text-align:center;margin-top:6px}.l{font-size:9px;color:#64748b;text-align:right}
    table.sum{margin-top:16px;border-collapse:collapse;width:60%}
    table.sum td{border-bottom:1px solid #eee;padding:5px 8px;font-size:13px}
    table.sum td:last-child{text-align:right;font-weight:700}
    .legend{margin-top:14px;display:flex;flex-wrap:wrap;gap:4px}.lg{font-size:10px;border:1px solid #e2e8f0;border-radius:4px;padding:2px 5px}
  </style></head><body><div class="page">
    <h1>Pointage · ${esc(month)}</h1>
    <div class="sub">${esc(subject ? `${subject.employee.matricule} · ${subject.employee.name} · ${subject.contract.site_name}` : "Simulation")}</div>
    <table class="cal"><thead><tr>${WEEKDAYS.map((w) => `<th>${w}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
    <table class="sum"><tbody>${summary.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join("")}</tbody></table>
    <div class="legend">${legendRows}</div>
  </div></body></html>`;

  const warnings: string[] = [];
  if (!subject) warnings.push("Choisissez un salarié pour simuler son pointage.");
  if (mov && mov.days_paid > counts.covered) {
    warnings.push(`${mov.days_paid} jours payés > ${counts.covered} jours de contrat : la paie plafonnera.`);
  }
  return {
    html,
    pageWidth: 800,
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
