import { test, expect } from "@playwright/test";
import { loginAsE2eUser, loginAsPersona, requireE2eAuth, requirePersona } from "./helpers/auth";

// Read-only smoke: local runs use the linked (production) Supabase project, so nothing here saves data.

const RH_PAGES: Array<{ path: string; heading: RegExp }> = [
  { path: "/rh/interim", heading: /intérim — agences et relevés/i },
  { path: "/rh/couts", heading: /coûts de la paie par chantier/i },
  { path: "/rh/paie/virements", heading: /virements des salaires/i },
];

const ADMIN_PAGES: Array<{ path: string; title: RegExp }> = [
  { path: "/administration/roles", title: /rôles/i },
  { path: "/administration/permissions", title: /matrice des droits/i },
  { path: "/administration/audit", title: /journal d'audit/i },
  { path: "/administration/periodes", title: /clôture des périodes/i },
];

test.describe("@smoke rh & administration", () => {
  test("non authentifié → /login", async ({ page }) => {
    for (const p of [...RH_PAGES.map((x) => x.path), ...ADMIN_PAGES.map((x) => x.path)]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("SUPER_ADMIN : écrans RH phase 4-5 accessibles", async ({ page }) => {
    test.skip(!requireE2eAuth(), "Définir E2E_EMAIL / E2E_PASSWORD");
    await loginAsE2eUser(page);
    for (const p of RH_PAGES) {
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 2, name: p.heading })).toBeVisible();
    }
  });

  test("SUPER_ADMIN : écrans d'administration accessibles", async ({ page }) => {
    test.skip(!requireE2eAuth(), "Définir E2E_EMAIL / E2E_PASSWORD");
    await loginAsE2eUser(page);
    for (const p of ADMIN_PAGES) {
      await page.goto(p.path);
      await expect(page).toHaveURL(new RegExp(p.path));
      await expect(page.getByText(p.title).first()).toBeVisible();
    }
  });

  test("Intérim : formulaire agence s'ouvre et se ferme sans enregistrer", async ({ page }) => {
    test.skip(!requireE2eAuth(), "Définir E2E_EMAIL / E2E_PASSWORD");
    await loginAsE2eUser(page);
    await page.goto("/rh/interim");
    await page.getByRole("button", { name: /nouvelle agence/i }).click();
    await expect(page.getByText(/nouvelle agence d'intérim/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^enregistrer$/i })).toBeDisabled();
    await page.getByRole("button", { name: /^fermer$/i }).click();
    await expect(page.getByText(/nouvelle agence d'intérim/i)).toHaveCount(0);
  });

  test("Contrat de travail : type INTERIM affiche agence + taux", async ({ page }) => {
    test.skip(!requireE2eAuth(), "Définir E2E_EMAIL / E2E_PASSWORD");
    await loginAsE2eUser(page);
    await page.goto("/rh/contrats");
    await page.getByRole("button", { name: /nouveau contrat/i }).first().click();
    const typeSelect = page.locator("select").filter({ has: page.locator('option[value="INTERIM"]') }).first();
    await typeSelect.selectOption("INTERIM");
    await expect(page.getByText(/agence d'intérim/i)).toBeVisible();
    await expect(page.getByText(/taux journalier facturé/i)).toBeVisible();
  });

  for (const persona of ["E2E_ADMIN_RH", "E2E_ADMIN_FINANCE"] as const) {
    test(`${persona} : unité 05 (cotisations & impôts) modifiable`, async ({ page }) => {
      test.skip(!requirePersona(persona), `Définir ${persona}_EMAIL / ${persona}_PASSWORD`);
      await loginAsPersona(page, persona);
      await page.goto("/rh/legal");
      await expect(page.getByRole("heading", { level: 2, name: /cotisations & impôts/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^enregistrer$/i }).first()).toBeVisible();
      await expect(page.getByText(/lecture seule : modification réservée/i)).toHaveCount(0);
      await page.getByRole("tab", { name: /^IRG$/ }).click();
      await expect(page.getByText(/abattement IRG par zone/i)).toBeVisible();
    });
  }

  test("READ_ONLY : intérim, coûts, rôles et unité 05 interdits", async ({ page }) => {
    test.skip(!requirePersona("E2E_READ_ONLY"), "Définir E2E_READ_ONLY_EMAIL / E2E_READ_ONLY_PASSWORD");
    await loginAsPersona(page, "E2E_READ_ONLY");
    for (const p of ["/rh/interim", "/rh/couts", "/administration/roles", "/rh/legal"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/error=forbidden/);
    }
  });

  test("ADMIN_RH : matrice des droits interdite, audit accessible", async ({ page }) => {
    test.skip(!requirePersona("E2E_ADMIN_RH"), "Définir E2E_ADMIN_RH_EMAIL / E2E_ADMIN_RH_PASSWORD");
    await loginAsPersona(page, "E2E_ADMIN_RH");
    await page.goto("/administration/permissions");
    await expect(page).toHaveURL(/error=forbidden/);
    await page.goto("/administration/audit");
    await expect(page).toHaveURL(/administration\/audit/);
  });
});
