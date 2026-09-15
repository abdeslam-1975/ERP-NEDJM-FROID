import fs from "node:fs";

/** Minimal .env loader (no dependency). Does not override existing process.env. */
export function loadEnvFiles(paths: string[]) {
  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export type E2eCreds = { email: string; password: string };

export function e2eCredentials(): E2eCreds | null {
  const email = process.env.E2E_EMAIL?.trim();
  const password = process.env.E2E_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

/** Optional persona credentials (skip related tests if missing). */
export function personaCredentials(
  prefix: "E2E_READ_ONLY" | "E2E_ADMIN_RH" | "E2E_ADMIN_FINANCE",
): E2eCreds | null {
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();
  if (!email || !password) return null;
  return { email, password };
}
