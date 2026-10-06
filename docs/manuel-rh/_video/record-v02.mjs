// Enregistre la vidéo V0.2 (navigation seule : aucune donnée modifiée) avec sous-titres, encadrés et curseur.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../../nedjm-froid-erp/package.json"));
const { chromium } = require("playwright");
const BASE = process.env.APP_URL ?? "https://nedjm-froid-erp.vercel.app";
const spec = JSON.parse(readFileSync(join(here, "v02.scenes.json"), "utf8"));
const out = join(here, "out", spec.id.replace(".", "_"));
const durations = JSON.parse(readFileSync(join(out, "durations.json"), "utf8"));
const statePath = join(here, ".auth", "state.json");
if (!existsSync(statePath)) throw new Error("Session absente : lancez d'abord login.mjs");

const W = 1600;
const H = 900;

/** Calque d'incrustation : titre, sous-titre arabe, encadré, curseur. Ne capte aucun clic. */
const OVERLAY = () => {
  const css = `
  #__ov{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:"Segoe UI",Tahoma,sans-serif}
  #__ov .sub{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);max-width:78%;direction:rtl;text-align:center;
    background:rgba(15,23,42,.86);color:#fff;font-size:26px;line-height:1.5;padding:12px 26px;border-radius:14px;box-shadow:0 10px 30px #0006;transition:opacity .3s}
  #__ov .box{position:absolute;border:4px solid #f59e0b;border-radius:12px;box-shadow:0 0 0 9999px rgba(15,23,42,.28);transition:all .45s ease}
  #__ov .tag{position:absolute;background:#f59e0b;color:#111;font-weight:700;font-size:18px;padding:4px 12px;border-radius:8px;white-space:nowrap;transition:all .45s ease}
  #__ov .cur{position:absolute;width:26px;height:26px;margin:-4px 0 0 -4px;transition:left .6s ease,top .6s ease}
  #__ov .cur svg{filter:drop-shadow(0 2px 3px #0008)}
  #__ov .ring{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #f59e0b;animation:__r .5s ease-out forwards}
  @keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  #__ov .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
    background:linear-gradient(160deg,#0b4f8a,#0e7490);color:#fff;transition:opacity .6s}
  #__ov .card .k{letter-spacing:.3em;font-size:20px;opacity:.85}
  #__ov .card .t{font-size:54px;font-weight:700}
  #__ov .card .a{font-size:40px;direction:rtl}
  #__ov .chip{position:absolute;top:18px;right:22px;background:#0b4f8a;color:#fff;font-size:16px;font-weight:600;padding:6px 14px;border-radius:999px;opacity:.92}
  #__ov .note{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);background:#fff;color:#0b4f8a;font-size:34px;font-weight:700;
    padding:22px 40px;border-radius:18px;border:4px solid #0b4f8a;box-shadow:0 20px 60px #0007;transition:opacity .4s}`;
  const ensure = () => {
    let root = document.getElementById("__ov");
    if (root) return root;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    root = document.createElement("div");
    root.id = "__ov";
    root.innerHTML = `<div class="chip"></div><div class="box" style="opacity:0"></div><div class="tag" style="opacity:0"></div>
      <div class="sub" style="opacity:0"></div><div class="cur" style="left:800px;top:450px"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#fff" stroke="#111" stroke-width="1.6"/></svg></div>`;
    document.body.appendChild(root);
    return root;
  };
  const q = (s) => ensure().querySelector(s);
  window.__ui = {
    chip: (t) => (q(".chip").textContent = t),
    sub: (t) => {
      const el = q(".sub");
      el.textContent = t;
      el.style.opacity = t ? "1" : "0";
    },
    box: (r, label) => {
      const b = q(".box");
      const g = q(".tag");
      if (!r) {
        b.style.opacity = "0";
        g.style.opacity = "0";
        return;
      }
      const p = 8;
      Object.assign(b.style, { left: `${r.x - p}px`, top: `${r.y - p}px`, width: `${r.width + 2 * p}px`, height: `${r.height + 2 * p}px`, opacity: "1" });
      g.textContent = label ?? "";
      const below = r.y + r.height + 16 + 34 < innerHeight - 120;
      Object.assign(g.style, { left: `${Math.max(8, r.x - p)}px`, top: `${below ? r.y + r.height + 16 : Math.max(8, r.y - 48)}px`, opacity: label ? "1" : "0" });
    },
    cursor: (x, y) => Object.assign(q(".cur").style, { left: `${x}px`, top: `${y}px` }),
    ring: (x, y) => {
      const r = document.createElement("div");
      r.className = "ring";
      Object.assign(r.style, { left: `${x}px`, top: `${y}px` });
      ensure().appendChild(r);
      setTimeout(() => r.remove(), 600);
    },
    card: (k, t, a) => {
      const c = document.createElement("div");
      c.className = "card";
      c.innerHTML = `<div class="k">${k}</div><div class="t">${t}</div><div class="a">${a}</div>`;
      ensure().appendChild(c);
    },
    uncard: () => document.querySelectorAll("#__ov .card").forEach((c) => {
      c.style.opacity = "0";
      setTimeout(() => c.remove(), 700);
    }),
    note: (t) => {
      document.querySelectorAll("#__ov .note").forEach((n) => n.remove());
      if (!t) return;
      const n = document.createElement("div");
      n.className = "note";
      n.textContent = t;
      ensure().appendChild(n);
    },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensure);
  else ensure();
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  storageState: statePath,
  recordVideo: { dir: out, size: { width: W, height: H } },
  locale: "fr-FR",
});
await context.addInitScript(OVERLAY);
const page = await context.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const sleep = (ms) => page.waitForTimeout(ms);
const ui = (fn, ...args) => page.evaluate(([f, a]) => window.__ui?.[f]?.(...a), [fn, args]).catch(() => {});

let cursor = { x: W / 2, y: H / 2 };
async function find(selectorOrLocator) {
  const loc = typeof selectorOrLocator === "string" ? page.locator(selectorOrLocator) : selectorOrLocator;
  const first = loc.first();
  try {
    await first.waitFor({ state: "visible", timeout: 4000 });
    return first;
  } catch {
    console.warn("introuvable :", String(selectorOrLocator));
    return null;
  }
}
async function rect(target) {
  const el = await find(target);
  return el ? el.boundingBox() : null;
}
async function point(target, label) {
  const r = await rect(target);
  if (!r) return null;
  await ui("box", r, label);
  cursor = { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 };
  await ui("cursor", cursor.x, cursor.y);
  return r;
}
async function click(target, label) {
  const r = await point(target, label);
  if (!r) return;
  await sleep(700);
  await ui("ring", cursor.x, cursor.y);
  await page.mouse.click(cursor.x, cursor.y);
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(600);
  await ui("box", null);
}
const section = (name) => page.locator('nav[aria-label="Ressources humaines"] a, nav[aria-label="Ressources humaines"] button', { hasText: name });
const subTabs = 'ul.border-t:has(a[href^="/rh"])';

const ACTIONS = {
  async intro(d) {
    await ui("card", "NEDJM FROID ERP · " + spec.id, spec.title, spec.titleAr);
    await sleep(d * 1000 - 600);
    await ui("uncard");
  },
  async layout(d) {
    const step = (d * 1000) / 3;
    await point("aside", "Menu latéral");
    await sleep(step);
    await point("header", "Barre supérieure");
    await sleep(step);
    await point("main", "Contenu de la page");
  },
  async topbar(d) {
    const step = (d * 1000) / 3;
    await point('input[placeholder="Rechercher"]', "Rechercher");
    await sleep(step);
    await point('button[aria-label="Réorganiser"], [aria-label="Réorganiser"]', "Réorganiser");
    await sleep(step);
    await point('button[aria-label^="Notifications"]', "Notifications");
  },
  async sections(d) {
    await point('nav[aria-label="Ressources humaines"]', "Barre de sections");
    const names = ["Vue d'ensemble", "Personnel", "Temps & présence", "Paie", "Documents", "Juridique"];
    await sleep(1200);
    for (const n of names) {
      const r = await rect(section(n));
      if (r) {
        cursor = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        await ui("cursor", cursor.x, cursor.y);
        await page.mouse.move(cursor.x, cursor.y);
      }
      await sleep(Math.max(500, (d * 1000 - 1500) / names.length));
    }
  },
  async personnel(d) {
    await click(section("Personnel"), "Personnel");
    await point(subTabs, "Onglets de la section");
    await sleep(d * 1000 - 2500);
  },
  async time_pay(d) {
    await click(section("Temps & présence"), "Temps & présence");
    await sleep(1500);
    await click(section("Paie"), "Paie");
    await point(page.locator(subTabs).locator("a", { hasText: "Simulateur" }), "Simulateur ↗");
    await sleep(d * 1000 - 5500);
  },
  async documents(d) {
    await click(section("Documents"), "Documents");
    await point(page.getByText("Contrat de travail", { exact: true }), "Contrat de travail");
    await sleep(d * 500);
    await point(page.getByText("Bulletins de paie", { exact: true }), "Bulletins de paie");
  },
  async others(d) {
    await point(section("Juridique"), "Juridique");
    await sleep(d * 500);
    await point(section("Paramètres"), "Paramètres");
  },
  async outro(d) {
    await ui("box", null);
    await ui("note", "Un onglet manque ? Voir l'administrateur");
    await sleep(d * 500);
    await ui("note", "Vidéo suivante : V0.3 — Réorganiser la barre RH");
  },
};

await page.goto(`${BASE}${spec.start}`, { waitUntil: "networkidle" });
if (page.url().includes("/login")) throw new Error("Session expirée : relancez login.mjs");
await ui("chip", `${spec.id} · ${spec.title}`);
await sleep(800);

const timeline = { scenes: [] };
for (const scene of spec.scenes) {
  const d = durations[scene.key];
  const start = now();
  timeline.scenes.push({ key: scene.key, start });
  await ui("sub", scene.text);
  await ACTIONS[scene.key](d);
  const left = d + 0.5 - (now() - start);
  if (left > 0) await sleep(left * 1000);
}
await ui("sub", "");
await sleep(1500);
timeline.end = now();
const video = page.video();
await context.close();
await browser.close();
timeline.video = await video.path();
writeFileSync(join(out, "timeline.json"), JSON.stringify(timeline, null, 2));
console.log("RECORDED", timeline.video);
