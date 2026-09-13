import { test, expect } from "@playwright/test";
import path from "node:path";
import { gotoContracts, loginAsE2eUser, requireE2eAuth } from "./helpers/auth";
import { writeCanvaFixture } from "./helpers/canva-fixture";

const SEED_CONTRACT = "I/111/HMD-DEG/2024";

const WORKSPACE_TABS = [
  /en-tête & financier/i,
  /contre-facturation/i,
  /main-d'œuvre/i,
  /pièces/i,
  /pénalités/i,
  /gardes de marge/i,
  /rh \/ an/i,
  /canva excel/i,
];

test.describe("@critical contrats clients", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !requireE2eAuth(),
      "Définir E2E_EMAIL et E2E_PASSWORD dans .env.e2e (voir .env.e2e.example)",
    );
    await loginAsE2eUser(page);
  });

  test("liste des contrats + seed El Gassi visible", async ({ page }) => {
    await gotoContracts(page);
    await expect(page.getByRole("button", { name: /nouveau contrat/i })).toBeVisible();
    await page
      .getByPlaceholder(/rechercher/i)
      .fill(SEED_CONTRACT);
    await expect(page.getByText(SEED_CONTRACT).first()).toBeVisible();
    await expect(page.getByText(/SONATRACH/i).first()).toBeVisible();
  });

  test("workspace seed : 8 onglets + mode AUTO / caution", async ({ page }) => {
    await gotoContracts(page);
    await page.getByPlaceholder(/rechercher/i).fill(SEED_CONTRACT);
    await page.getByRole("link", { name: /workspace/i }).first().click();
    await expect(page.getByText(SEED_CONTRACT)).toBeVisible();

    for (const tab of WORKSPACE_TABS) {
      await expect(page.getByRole("button", { name: tab })).toBeVisible();
    }

    await page.getByRole("button", { name: /en-tête & financier/i }).click();
    await expect(
      page.getByText(/mode total ht|AUTO — somme labor/i).first(),
    ).toBeVisible();
    await expect(page.locator("select").filter({ hasText: /AUTO/i }).first()).toBeVisible();

    // Summary line shows mode + caution sync
    await expect(page.getByText(/Mode\s+AUTO/i)).toBeVisible();
    await expect(page.getByText(/caution\s+FROM_RATE/i)).toBeVisible();
  });

  test("CRUD en-tête : créer un contrat E2E puis ouvrir workspace", async ({
    page,
  }) => {
    const stamp = Date.now();
    const number = `E2E/${stamp}`;
    await gotoContracts(page);
    await page.getByRole("button", { name: /nouveau contrat/i }).click();

    await page.getByLabel(/n° contrat/i).fill(number);
    await page.getByLabel(/^client/i).fill("CLIENT E2E PLAYWRIGHT");
    // Site select — first available option after empty
    const siteSelect = page.locator("select").first();
    await siteSelect.selectOption({ index: 0 });

    await page.getByLabel(/date début/i).fill("2026-01-01");
    await page.getByLabel(/date fin/i).fill("2026-12-31");
    await page.getByLabel(/caution \(%\)/i).fill("2");

    await page.getByRole("button", { name: /^enregistrer$/i }).click();

    await expect(page).toHaveURL(/\/referentiels\/contrats\/[0-9a-f-]+/i, {
      timeout: 30_000,
    });
    await expect(page.getByText(number)).toBeVisible();

    // Walk all tabs (smoke)
    for (const tab of WORKSPACE_TABS) {
      await page.getByRole("button", { name: tab }).click();
    }
  });

  test("Canva : télécharger template + REPLACE import sur contrat E2E", async ({
    page,
  }) => {
    const stamp = Date.now();
    const number = `E2E/CANVA/${stamp}`;
    await gotoContracts(page);
    await page.getByRole("button", { name: /nouveau contrat/i }).click();
    await page.getByLabel(/n° contrat/i).fill(number);
    await page.getByLabel(/^client/i).fill("CLIENT E2E CANVA");
    await page.locator("select").first().selectOption({ index: 0 });
    await page.getByLabel(/date début/i).fill("2026-01-01");
    await page.getByLabel(/date fin/i).fill("2026-06-30");
    await page.getByRole("button", { name: /^enregistrer$/i }).click();
    await expect(page).toHaveURL(/\/referentiels\/contrats\//);

    await page.getByRole("button", { name: /canva excel/i }).click();
    await expect(
      page.getByRole("link", { name: /télécharger canva vide/i }),
    ).toBeVisible();

    const fixturePath = path.join(
      process.cwd(),
      "e2e",
      ".fixtures",
      `canva-${stamp}.xlsx`,
    );
    await writeCanvaFixture(fixturePath);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(fixturePath);

    await expect(
      page.getByText(/canva importé \(replace\)/i),
    ).toBeVisible({ timeout: 45_000 });

    await page.getByRole("button", { name: /main-d'œuvre/i }).click();
    await expect(page.getByText("E2E-LAB-1")).toBeVisible();
    await expect(page.getByText("E2E-LAB-2")).toBeVisible();

    await page.getByRole("button", { name: /pièces/i }).click();
    await expect(page.getByText("E2E-SP-1")).toBeVisible();

    // HT AUTO ≈ 15000+8000+5000 = 28000 — shown in header summary after refresh
    await page.getByRole("button", { name: /en-tête & financier/i }).click();
    await expect(page.getByText(/28[\s]?000|28000/)).toBeVisible({
      timeout: 20_000,
    });
  });
});
