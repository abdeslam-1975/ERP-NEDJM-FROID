import { test, expect } from "@playwright/test";
import {
  gotoContracts,
  loginAsE2eUser,
  loginAsPersona,
  logout,
  requireE2eAuth,
  requirePersona,
} from "./helpers/auth";

test.describe("@critical rls négatif", () => {
  test("non authentifié → redirect /login", async ({ page }) => {
    await page.goto("/referentiels/contrats");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/parametres/utilisateurs");
    await expect(page).toHaveURL(/\/login/);
  });

  test("READ_ONLY : accès contrats en lecture, écriture refusée", async ({
    page,
  }) => {
    test.skip(
      !requirePersona("E2E_READ_ONLY"),
      "Définir E2E_READ_ONLY_EMAIL / E2E_READ_ONLY_PASSWORD",
    );
    await loginAsPersona(page, "E2E_READ_ONLY");

    await gotoContracts(page);
    await expect(page.getByRole("button", { name: /nouveau contrat/i })).toBeVisible();

    // Attempt create — server action should refuse write
    await page.getByRole("button", { name: /nouveau contrat/i }).click();
    await page.getByLabel(/n° contrat/i).fill(`E2E/RO/${Date.now()}`);
    await page.getByLabel(/^client/i).fill("SHOULD FAIL");
    await page.locator("select").first().selectOption({ index: 0 });
    await page.getByLabel(/date début/i).fill("2026-01-01");
    await page.getByLabel(/date fin/i).fill("2026-12-31");
    await page.getByRole("button", { name: /^enregistrer$/i }).click();

    await expect(
      page.getByText(/accès refusé|réservée à SUPER_ADMIN|ADMIN_FINANCE|GERANT/i),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("READ_ONLY : page utilisateurs interdite", async ({ page }) => {
    test.skip(
      !requirePersona("E2E_READ_ONLY"),
      "Définir E2E_READ_ONLY_EMAIL / E2E_READ_ONLY_PASSWORD",
    );
    await loginAsPersona(page, "E2E_READ_ONLY");
    await page.goto("/parametres/utilisateurs");
    await expect(page).toHaveURL(/\?error=forbidden|\/\?error=forbidden|^\/$/);
    await expect(page).not.toHaveURL(/parametres\/utilisateurs/);
  });

  test("ADMIN_FINANCE : contrats accessibles, utilisateurs interdits", async ({
    page,
  }) => {
    test.skip(
      !requirePersona("E2E_ADMIN_FINANCE"),
      "Définir E2E_ADMIN_FINANCE_EMAIL / E2E_ADMIN_FINANCE_PASSWORD",
    );
    await loginAsPersona(page, "E2E_ADMIN_FINANCE");

    await gotoContracts(page);
    await expect(page.getByText(/contrats clients/i)).toBeVisible();

    await page.goto("/parametres/utilisateurs");
    await expect(page).not.toHaveURL(/parametres\/utilisateurs/);
  });

  test("ADMIN_RH : utilisateurs accessibles", async ({ page }) => {
    test.skip(
      !requirePersona("E2E_ADMIN_RH"),
      "Définir E2E_ADMIN_RH_EMAIL / E2E_ADMIN_RH_PASSWORD",
    );
    await loginAsPersona(page, "E2E_ADMIN_RH");
    await page.goto("/parametres/utilisateurs");
    await expect(
      page.getByRole("heading", { name: /administration des utilisateurs/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /nouvel utilisateur/i }),
    ).toBeVisible();
  });

  test("SUPER_ADMIN E2E : contrats + utilisateurs OK", async ({ page }) => {
    test.skip(!requireE2eAuth(), "Définir E2E_EMAIL / E2E_PASSWORD");
    await loginAsE2eUser(page);
    await gotoContracts(page);
    await page.goto("/parametres/utilisateurs");
    await expect(
      page.getByRole("heading", { name: /administration des utilisateurs/i }),
    ).toBeVisible();
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });
});
