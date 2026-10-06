// Connexion unique : une fenêtre s'ouvre, l'utilisateur se connecte lui-même ; la session est gardée dans .auth/state.json.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../nedjm-froid-erp/package.json"));
const { chromium } = require("playwright");
const BASE = process.env.APP_URL ?? "https://nedjm-froid-erp.vercel.app";

const browser = await chromium.launch({ channel: "msedge", headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`);
console.log("Connectez-vous dans la fenêtre ouverte (15 minutes maximum)…");
await page.waitForURL((url) => !url.pathname.startsWith("/login") && !url.pathname.startsWith("/auth"), { timeout: 15 * 60_000 });
await page.waitForLoadState("networkidle").catch(() => {});
mkdirSync(join(here, ".auth"), { recursive: true });
await context.storageState({ path: join(here, ".auth", "state.json") });
console.log("SESSION_SAVED");
await browser.close();
