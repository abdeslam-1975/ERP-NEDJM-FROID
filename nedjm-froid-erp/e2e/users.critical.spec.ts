import { test, expect } from "@playwright/test";
import {
  completeForcedPasswordChange,
  gotoUsersAdmin,
  loginAsE2eUser,
  loginWith,
  logout,
  requireE2eAuth,
} from "./helpers/auth";

test.describe("@critical utilisateurs", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !requireE2eAuth(),
      "Définir E2E_EMAIL et E2E_PASSWORD dans .env.e2e",
    );
    await loginAsE2eUser(page);
  });

  test("page utilisateurs accessible (SUPER_ADMIN / ADMIN_RH)", async ({
    page,
  }) => {
    await gotoUsersAdmin(page);
    await expect(
      page.getByRole("button", { name: /nouvel utilisateur/i }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /e-mail/i })).toBeVisible();
  });

  test("provision + reset forcé + INACTIVE refuse login", async ({ page }) => {
    const stamp = Date.now();
    const email = `e2e.p5.${stamp}@nedjm-froid.com`;
    const initialPassword = `Nf!E2eP5${stamp}Aa`;
    const stablePassword = `Nf!E2eP5${stamp}Bb`;

    await gotoUsersAdmin(page);
    await page.getByRole("button", { name: /nouvel utilisateur/i }).click();
    await expect(
      page.getByRole("heading", { name: /nouvel utilisateur/i }),
    ).toBeVisible();

    await page.getByLabel(/nom complet/i).fill(`E2E User ${stamp}`);
    await page.getByLabel(/^e-mail/i).fill(email);
    await page.getByLabel(/mot de passe initial/i).fill(initialPassword);

    // Prefer READ_ONLY for least privilege test subject
    const roleSelect = page.locator("select").first();
    const roleOptions = await roleSelect.locator("option").allTextContents();
    const readOnly = roleOptions.findIndex((t) => /READ_ONLY|lecture/i.test(t));
    if (readOnly >= 0) {
      await roleSelect.selectOption({ index: readOnly });
    }

    await page.getByRole("button", { name: /^créer$/i }).click();
    await expect(page.getByText(/utilisateur créé/i)).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(/réinit\. mot de passe requise/i).first()).toBeVisible();

    // Forced reset on first login
    await logout(page);
    await loginWith(page, { email, password: initialPassword });
    await expect(page).toHaveURL(/changer-mot-de-passe/);
    await completeForcedPasswordChange(page, initialPassword, stablePassword);
    await expect(page).not.toHaveURL(/login/);

    // Admin deactivates
    await logout(page);
    await loginAsE2eUser(page);
    await gotoUsersAdmin(page);

    const row = page.locator("tr", { hasText: email });
    await row.getByRole("button", { name: /^menu$/i }).click();
    await page.getByRole("button", { name: /désactiver \(inactive\)/i }).click();
    await expect(row.getByText("INACTIVE")).toBeVisible({ timeout: 20_000 });

    // Inactive login refused
    await logout(page);
    await loginWith(page, { email, password: stablePassword });
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText(/désactivé|suspendu|incorrect/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
