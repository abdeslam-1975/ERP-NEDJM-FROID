#!/usr/bin/env node
/** Wrapper → tsx banque-drive-import. */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const res = spawnSync("npx", ["--yes", "tsx", resolve(here, "banque-drive-import.ts"), ...args], {
  cwd: resolve(here, ".."),
  stdio: "inherit",
  encoding: "utf8",
});
process.exit(res.status ?? 1);
