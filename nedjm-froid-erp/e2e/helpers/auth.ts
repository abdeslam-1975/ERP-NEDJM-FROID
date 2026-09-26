import { expect, type Page } from "@playwright/test";
import {
  e2eCredentials,
  personaCredentials,
  type E2eCreds,
} from "./load-env";

export function requireE2eAuth() {
  return e2eCredentials();
}

export function requirePersona(
  prefix: "E2E_READ_ONLY" | "E2E_ADMIN_RH" | "E2E_ADMIN_FINANCE",
) {
  return personaCredentials(prefix);
}

export async function loginWith(page: Page, creds: E2eCreds) {
  await page.goto("/login");
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /se connecter/i }).click();

  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 30_000,
  });
}

/** Login as primary E2E user; fails if forced password reset is pending. */
export async function loginAsE2eUser(page: Page) {
  const creds = requireE2eAuth();
  if (!creds) {
    throw new Error("E2E_EMAIL / E2E_PASSWORD manquants");
  }

  await loginWith(page, creds);

  if (page.url().includes("changer-mot-de-passe")) {
    throw new Error(
      "Compte E2E en must_reset_password — définissez un MDP stable avant les tests.",
    );
  }

  await expect(page.locator("body")).toContainText(
    /NEDJM|Référentiels|Tableau|Contrats|Paramètres/i,
    { timeout: 20_000 },
  );
}

export async function loginAsPersona(
  page: Page,
  prefix: "E2E_READ_ONLY" | "E2E_ADMIN_RH" | "E2E_ADMIN_FINANCE",
) {
  const creds = requirePersona(prefix);
  if (!creds) {
    throw new Error(`${prefix}_EMAIL / ${prefix}_PASSWORD manquants`);
  }
  await loginWith(page, creds);
  if (page.url().includes("changer-mot-de-passe")) {
    throw new Error(
      `Persona ${prefix} en must_reset_password — stabilisez le mot de passe.`,
    );
  }
}

export async function logout(page: Page) {
  const logoutBtn = page.getByRole("button", { name: /^déconnexion$/i });
  if (await logoutBtn.count()) {
    await logoutBtn.first().click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    return;
  }
  // Fallback: clear cookies via navigation to login after storage clear
  await page.context().clearCookies();
  await page.goto("/login");
}

export async function gotoContracts(page: Page) {
  await page.goto("/referentiels/contrats");
  await expect(
    page.getByRole("heading", { level: 2, name: /contrats clients/i }),
  ).toBeVisible();
}

export async function gotoUsersAdmin(page: Page) {
  await page.goto("/parametres/utilisateurs");
  await expect(
    page.getByRole("heading", { name: /administration des utilisateurs/i }),
  ).toBeVisible();
}

/** Complete forced password change with a new stable password. */
export async function completeForcedPasswordChange(
  page: Page,
  currentPassword: string,
  newPassword: string,
) {
  await expect(page).toHaveURL(/changer-mot-de-passe/);
  await page.locator("#current_password").fill(currentPassword);
  await page.locator("#new_password").fill(newPassword);
  await page.locator("#confirm_password").fill(newPassword);
  await page.getByRole("button", { name: /enregistrer et continuer/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("changer-mot-de-passe"), {
    timeout: 30_000,
  });
}
