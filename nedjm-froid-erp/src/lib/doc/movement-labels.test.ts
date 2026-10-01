// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/lib/doc/engine";
import { movementCounts, movementFieldForLabel } from "@/lib/doc/movement-labels";

/** Movements block as saved after the labels were moved in the editor (fields left in their old cells). */
const MOVED = `<table class="g mv">
  <thead><tr><th colspan="6">Mouvements du Mois&nbsp;&nbsp; "Nombre Jours"</th><th colspan="3">Charges</th></tr></thead>
  <tbody>
    <tr>
      <td colspan="2">Travaillés</td><td class="c" data-field="days_worked - jours.CRP" data-format="days"></td>
      <td colspan="2">Congés de Récupération "CRP"</td><td class="c" data-field="jours.CRP" data-format="days"></td>
      <td>Salariales</td><td colspan="2" data-field="charges_salariales" data-format="dec"></td>
    </tr>
    <tr>
      <td colspan="2">WeekEnd et Fériées du Mois</td><td class="c" data-field="days_weekend" data-format="days"></td>
      <td colspan="2">Congés Annuel</td><td class="c" data-field="jours.AOP" data-format="days"></td>
      <td>Patronales</td><td colspan="2" data-field="charges_patronales" data-format="dec"></td>
    </tr>
    <tr>
      <td colspan="2">Absense autorisée payée</td><td class="c"></td>
      <td colspan="2">Congés Maladie</td><td class="c" data-field="jours.CM" data-format="days"></td>
    </tr>
    <tr>
      <td colspan="2">Absense justifiée</td><td class="c" data-field="jours.CA" data-format="days"></td>
      <td colspan="2">Congé Sans Solde</td><td class="c" data-field="jours.CSS" data-format="days"></td>
    </tr>
    <tr>
      <td colspan="2">Absence non Justifiées</td><td class="c"></td>
      <td colspan="2">Absences&nbsp; pour Décé</td><td class="c" data-field="jours.AN" data-format="days"></td>
    </tr>
    <tr>
      <td colspan="2">Congés Récupération "P"</td><td class="c" data-field="jours.P" data-format="days"></td>
    </tr>
  </tbody>
</table>`;

const slip = {
  days_worked: 22,
  days_weekend: 4,
  days_by_code: { P: 15, MS: 2, "MS/2-AN/2": 2, AN: 1, "P/2-AJ/2": 1, AOP: 1, CA: 3, CM: 1, DC: 1, W: 4 },
  charges_salariales: 1000,
  charges_patronales: 2000,
};

const cellAfter = (html: string, label: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cell = [...doc.querySelectorAll("td")].find((td) => td.textContent?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() === label);
  return (cell?.nextElementSibling as HTMLElement | null)?.textContent?.trim();
};

describe("movements block follows its labels", () => {
  const html = renderTemplate(MOVED, { ...slip, jours: slip.days_by_code, comptes: movementCounts(slip) });

  it("prints every count beside the label it belongs to", () => {
    expect(cellAfter(html, "Congés Annuel")).toBe("3");
    expect(cellAfter(html, "Absense autorisée payée")).toBe("1");
    expect(cellAfter(html, "Absense justifiée")).toBe("0,5");
    expect(cellAfter(html, "Absence non Justifiées")).toBe("2");
    expect(cellAfter(html, "Absences pour Décé")).toBe("1");
    expect(cellAfter(html, "Congés Maladie")).toBe("1");
    expect(cellAfter(html, "Congé Sans Solde")).toBe("");
    expect(cellAfter(html, "WeekEnd et Fériées du Mois")).toBe("4");
  });

  it("counts half days of combined codes exactly", () => {
    expect(cellAfter(html, "Travaillés")).toBe("18,5");
    expect(movementCounts(slip)).toMatchObject({ P: 15.5, MS: 3, AN: 2, AJ: 0.5, TRAVAILLES: 18.5, REPOS: 4 });
  });

  it("keeps the charges and empties a day label it cannot count", () => {
    expect(cellAfter(html, "Salariales")).toBe("1000,00");
    expect(cellAfter(html, 'Congés Récupération "P"')).toBe("");
  });

  it("falls back to the movement totals when the month has no day codes", () => {
    expect(movementCounts({ days_worked: 20, days_weekend: 8, days_abandon: 1 })).toMatchObject({
      TRAVAILLES: 20,
      REPOS: 8,
      ABANDON: 1,
    });
  });

  it("reads labels regardless of accents, plurals and typos", () => {
    expect(movementFieldForLabel("ABSENCES NON JUSTIFIEES")).toBe("comptes.AN");
    expect(movementFieldForLabel("Absence injustifiée")).toBe("comptes.AN");
    expect(movementFieldForLabel("Absence Autorisé")).toBe("comptes.AOP");
    expect(movementFieldForLabel("Absence pour Décès")).toBe("comptes.DC");
    expect(movementFieldForLabel("Week-End et Fériés du Mois")).toBe("comptes.REPOS");
    expect(movementFieldForLabel("Abandonnement de Poste")).toBe("comptes.ABANDON");
    expect(movementFieldForLabel("Grève illégale")).toBe("comptes.GIL");
    expect(movementFieldForLabel("Présent (P)")).toBe("comptes.P");
    expect(movementFieldForLabel("Coût Globale")).toBeUndefined();
  });
});
