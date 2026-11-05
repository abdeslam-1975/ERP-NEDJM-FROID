import { matriculeKey } from "@/lib/hr/contract-import";
import type { ExistingEmployee, ImportLinkChoice, ImportRow } from "@/lib/hr/employee-import";

const NIN_LEN = 18;
const NSS_LEN = 12;

type MatParts = { n: number; yy: string; width: number };

type Known = {
  id: string | null;
  matricule: string;
  key: string;
  nin: string;
  nss: string;
  name: string;
  birth: string;
  display: string;
};

type Group = {
  employeeId: string | null;
  lines: number[];
  nin: string;
  nss: string;
  name: string;
  birth: string;
  display: string;
  storedMatricule: string;
  kind: "linked" | "new";
};

type Slot = {
  row: ImportRow;
  nin: string;
  nss: string;
  name: string;
  birth: string;
  hired: string;
  fileMat: string;
  group: Group | null;
  status: ImportRow["status"];
  message: string;
  candidate: ImportRow["candidate"];
};

function digits(value: string | null | undefined, length: number): string {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length === length ? d : "";
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function personKey(last: string, first: string, lastAr = "", firstAr = ""): string {
  const latin = fold(`${last} ${first}`);
  return latin || fold(`${lastAr} ${firstAr}`);
}

function displayName(last: string, first: string, lastAr = "", firstAr = ""): string {
  return (
    [last, first].filter(Boolean).join(" ") ||
    [lastAr, firstAr].filter(Boolean).join(" ")
  );
}

/** One insertion, deletion or substitution. Longer gaps are not a match. */
function distance(a: string, b: string): number {
  if (!a || !b) return 99;
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > 1) return 99;
    prev = cur;
  }
  return prev[b.length];
}

function readMatricule(value: string): MatParts | null {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  const m = /^(0*\d+)\/(\d{2})$/.exec(compact);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return { n, yy: m[2], width: m[1].length };
}

function formatMatricule(n: number, yy: string, width: number): string {
  return `${String(n).padStart(Math.max(width, 2), "0")}/${yy}`;
}

function year2(iso: string): string {
  return iso.slice(2, 4);
}

function currentYear2(today: string): string {
  const y = /^(\d{4})/.exec(today)?.[1];
  return y ? y.slice(2) : "00";
}

type Counter = { max: number; width: number };

function note(counters: Map<string, Counter>, parts: MatParts) {
  const c = counters.get(parts.yy) ?? { max: 0, width: 2 };
  c.max = Math.max(c.max, parts.n);
  c.width = Math.max(c.width, parts.width, 2);
  counters.set(parts.yy, c);
}

function take(counters: Map<string, Counter>, yy: string): string {
  const c = counters.get(yy) ?? { max: 0, width: 2 };
  c.max += 1;
  c.width = Math.max(c.width, 2);
  counters.set(yy, c);
  return formatMatricule(c.max, yy, c.width);
}

function peek(counters: Map<string, Counter>, yy: string): string {
  const c = counters.get(yy) ?? { max: 0, width: 2 };
  return formatMatricule(c.max + 1, yy, Math.max(c.width, 2));
}

/**
 * One matricule per person. NIN, then NSS, decides it is the same employee.
 * A close name plus the same birth date is only a suggestion. An exact name is the same person.
 * A matricule written in the file is kept, including when hire dates are not sorted by serial.
 * 10/07 is the tenth hiring of 2007, and it stays 10/07. Empty cells still follow the hire
 * year: max + 1, no gap filling, sheet order when the dates are equal.
 */
export function applyEmployeeMatricules(
  rows: ImportRow[],
  existing: ExistingEmployee[],
  options: { links?: Record<number, ImportLinkChoice>; today?: string; fromFile?: boolean } = {},
): ImportRow[] {
  const links = options.links ?? {};
  const fromFile = options.fromFile === true;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const known: Known[] = existing.map((e) => ({
    id: e.id ?? null,
    matricule: (e.matricule ?? "").trim(),
    key: matriculeKey(e.matricule),
    nin: digits(e.nin, NIN_LEN),
    nss: digits(e.nss, NSS_LEN),
    name: personKey(e.last_name ?? "", e.first_name ?? ""),
    birth: (e.birth_date ?? "").slice(0, 10),
    display: displayName(e.last_name ?? "", e.first_name ?? "") || (e.matricule ?? "").trim(),
  }));
  const byNin = new Map<string, Known>();
  const byNss = new Map<string, Known>();
  const byMat = new Map<string, Known>();
  for (const person of known) {
    if (person.nin && !byNin.has(person.nin)) byNin.set(person.nin, person);
    if (person.nss && !byNss.has(person.nss)) byNss.set(person.nss, person);
    if (person.key && !byMat.has(person.key)) byMat.set(person.key, person);
  }

  const groups: Group[] = [];
  const slots: Slot[] = [];

  function groupForKnown(person: Known): Group {
    const found = groups.find(
      (g) =>
        (person.id && g.employeeId === person.id) ||
        (!person.id && g.kind === "linked" && g.storedMatricule === person.matricule),
    );
    if (found) return found;
    const created: Group = {
      employeeId: person.id,
      lines: [],
      nin: person.nin,
      nss: person.nss,
      name: person.name,
      birth: person.birth,
      display: person.display,
      storedMatricule: person.matricule,
      kind: "linked",
    };
    groups.push(created);
    return created;
  }

  function addToGroup(slot: Slot, group: Group) {
    slot.group = group;
    slot.status = "exists";
    group.lines.push(slot.row.line);
    if (slot.nin) group.nin = slot.nin;
    if (slot.nss) group.nss = slot.nss;
    if (!group.name && slot.name) group.name = slot.name;
    if (!group.birth && slot.birth) group.birth = slot.birth;
    if (group.display === group.storedMatricule && slot.row.name) group.display = slot.row.name;
  }

  for (const row of rows) {
    const slot: Slot = {
      row,
      nin: digits(row.values.nin, NIN_LEN),
      nss: digits(row.values.nss, NSS_LEN),
      name: personKey(
        row.values.last_name ?? "",
        row.values.first_name ?? "",
        row.values.last_name_ar ?? "",
        row.values.first_name_ar ?? "",
      ),
      birth: (row.values.birth_date ?? "").slice(0, 10),
      hired: (row.values.hired_at ?? "").slice(0, 10),
      fileMat: (row.values.matricule ?? "").trim(),
      group: null,
      status: row.issues.length ? "invalid" : "new",
      message: "",
      candidate: null,
    };
    slots.push(slot);
    if (slot.status === "invalid") continue;

    const groupNin = slot.nin ? groups.find((g) => g.nin === slot.nin) ?? null : null;
    const knownNin = slot.nin ? byNin.get(slot.nin) ?? null : null;
    const groupNss = slot.nss ? groups.find((g) => g.nss === slot.nss) ?? null : null;
    const knownNss = slot.nss ? byNss.get(slot.nss) ?? null : null;
    const left = groupNin || knownNin;
    const right = groupNss || knownNss;
    const token = (group: Group | null, person: Known | null) =>
      group ? `g${groups.indexOf(group)}` : person ? `k${person.id || person.matricule}` : "";
    const leftId = token(groupNin, knownNin);
    const rightId = token(groupNss, knownNss);
    if (left && right && leftId !== rightId) {
      slot.status = "conflict";
      slot.message = `NIN déjà porté par ${knownNin?.display || groupNin?.display || "un employé"}, NSS déjà porté par ${knownNss?.display || groupNss?.display || "un autre"}. Aucun rattachement.`;
      continue;
    }
    if (left || right) {
      const group = groupNin || groupNss || groupForKnown((knownNin || knownNss)!);
      addToGroup(slot, group);
      continue;
    }

    const owner = slot.fileMat ? byMat.get(matriculeKey(slot.fileMat)) ?? null : null;
    let blockedOwner: Known | null = null;
    if (owner) {
      const nameGap = slot.name && owner.name ? distance(slot.name, owner.name) : 0;
      const farByName = nameGap > 1;
      const farByBirth = nameGap !== 0 && Boolean(slot.birth && owner.birth) && slot.birth !== owner.birth;
      const ninClash = Boolean(slot.nin && owner.nin && slot.nin !== owner.nin);
      const nssClash = Boolean(slot.nss && owner.nss && slot.nss !== owner.nss);
      if (!farByName && !farByBirth && !ninClash && !nssClash) {
        addToGroup(slot, groupForKnown(owner));
        continue;
      }
      blockedOwner = owner;
    }

    if (!slot.nin && !slot.nss && slot.name && links[row.line] !== "other") {
      const candidates: { distance: number; name: string; matricule: string; birthDate: string; known: Known | null; group: Group | null }[] = [];
      for (const person of known) {
        if (!person.name) continue;
        const gap = distance(slot.name, person.name);
        if (gap > 1) continue;
        if (gap > 0 && (!slot.birth || person.birth !== slot.birth)) continue;
        if (gap <= 1) {
          candidates.push({
            distance: gap,
            name: person.display,
            matricule: person.matricule,
            birthDate: person.birth,
            known: person,
            group: null,
          });
        }
      }
      for (const group of groups) {
        if (group.kind !== "new" || !group.name) continue;
        const gap = distance(slot.name, group.name);
        if (gap > 1) continue;
        if (gap > 0 && (!slot.birth || group.birth !== slot.birth)) continue;
        if (gap <= 1) {
          candidates.push({
            distance: gap,
            name: group.display,
            matricule: "",
            birthDate: group.birth,
            known: null,
            group,
          });
        }
      }
      candidates.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
      const exact = candidates.filter((item) => item.distance === 0);
      const chosen =
        exact.length === 1 ? exact[0] : fromFile && candidates.length === 1 ? candidates[0] : links[row.line] === "same" ? candidates[0] : null;
      if (chosen) {
        const knownGroup = chosen.group || (chosen.known ? groupForKnown(chosen.known) : null);
        if (knownGroup) {
          addToGroup(slot, knownGroup);
          continue;
        }
      }
      if (candidates.length && links[row.line] !== "same") {
        const best = candidates[0];
        slot.status = "confirm";
        slot.candidate = { name: best.name, matricule: best.matricule, birthDate: best.birthDate };
        const extra = candidates.length > 1 ? ` ${candidates.length} personnes proches.` : "";
        const stored = best.matricule ? `, enregistré sous ${best.matricule}` : "";
        const file =
          slot.fileMat && (!best.matricule || matriculeKey(slot.fileMat) !== matriculeKey(best.matricule))
            ? ` Le fichier indique ${slot.fileMat}.`
            : "";
        slot.message = `Ressemble à ${best.name}${stored}, né(e) le ${best.birthDate}.${file}${extra} Confirmez ou refusez.`;
        continue;
      }
      if (links[row.line] === "same" && candidates[0]) {
        const best = candidates[0];
        const group = best.group || (best.known ? groupForKnown(best.known) : null);
        if (group) {
          addToGroup(slot, group);
          continue;
        }
      }
    }

    if (blockedOwner && !fromFile) {
      slot.status = "conflict";
      const same = matriculeKey(slot.fileMat) === matriculeKey(blockedOwner.matricule);
      slot.message = same
        ? `Le matricule ${blockedOwner.matricule} est enregistré sur ${blockedOwner.display}.`
        : `Le matricule ${slot.fileMat} est enregistré sur ${blockedOwner.display} (${blockedOwner.matricule}).`;
      continue;
    }

    const created: Group = {
      employeeId: null,
      lines: [row.line],
      nin: slot.nin,
      nss: slot.nss,
      name: slot.name,
      birth: slot.birth,
      display: row.name,
      storedMatricule: "",
      kind: "new",
    };
    groups.push(created);
    slot.group = created;
    slot.status = "new";
  }

  const counters = new Map<string, Counter>();
  const used = new Set<string>();
  for (const person of known) {
    const parts = readMatricule(person.matricule);
    if (parts) note(counters, parts);
    if (person.key) used.add(person.key);
  }

  const expected = new Map<Group, string>();
  for (const group of groups) {
    if (group.kind === "linked" && group.storedMatricule) expected.set(group, group.storedMatricule);
  }

  function members(group: Group): Slot[] {
    return slots.filter((s) => s.group === group);
  }

  function earliest(group: Group): Slot | null {
    const list = members(group);
    if (!list.length) return null;
    return list.slice().sort((a, b) => (a.hired || "9999-99-99").localeCompare(b.hired || "9999-99-99") || a.row.line - b.row.line)[0];
  }

  function fileMatFor(group: Group): string {
    const list = members(group)
      .slice()
      .sort((a, b) => (a.hired || "9999-99-99").localeCompare(b.hired || "9999-99-99") || a.row.line - b.row.line);
    const firstHired = list.find((slot) => slot.hired)?.hired.slice(0, 4) ?? "";
    const withMat = list.filter((slot) => readMatricule(slot.fileMat));
    const matching = withMat.find((slot) => {
      const year = matriculeFullYear(slot.fileMat);
      return firstHired && year === Number(firstHired);
    });
    return (matching ?? withMat[0])?.fileMat ?? "";
  }

  const claimed = new Map<string, Group>();
  for (const group of groups) {
    const stored = group.storedMatricule;
    const lead = earliest(group);
    const fileMat = fileMatFor(group);
    const firstHired = lead?.hired ?? "";
    const fileYear = fileMat ? matriculeFullYear(fileMat) : null;
    const hireYear = Number(firstHired.slice(0, 4)) || null;
    const keepStored = Boolean(
      stored &&
        (keepsFirstEmploymentNumber({ matricule: stored, hired_at: firstHired }) ||
          (hireYear !== null && matriculeFullYear(stored) === hireYear && fileYear !== hireYear)),
    );
    const chosen = keepStored ? stored : fileMat || stored;
    if (!chosen) continue;
    const key = matriculeKey(chosen);
    if (!key) continue;
    const prior = claimed.get(key);
    if (prior && prior !== group) {
      for (const slot of members(group)) {
        slot.status = "duplicate";
        slot.message = `Matricule ${chosen} déjà utilisé par une autre personne.`;
        slot.candidate = null;
      }
      continue;
    }
    claimed.set(key, group);
    expected.set(group, chosen);
    const parts = readMatricule(chosen);
    if (parts && !keepStored) note(counters, parts);
    if (key) used.add(key);
    if (fileMat && !firstHired) {
      for (const slot of members(group)) {
        if (!slot.message) slot.message = "Date d'embauche absente : matricule du fichier conservé, ordre non vérifié.";
      }
    }
  }

  const open = (group: Group) => members(group).every((slot) => slot.status !== "duplicate");
  const fresh = groups.filter((g) => g.kind === "new" && !expected.has(g) && open(g));
  const dated = fresh
    .filter((g) => members(g).some((s) => s.hired))
    .sort((a, b) => {
      const ea = earliest(a);
      const eb = earliest(b);
      return (
        (ea?.hired || "").localeCompare(eb?.hired || "") ||
        (ea?.row.line || 0) - (eb?.row.line || 0)
      );
    });
  for (const group of dated) {
    const lead = earliest(group);
    const yy = lead?.hired ? year2(lead.hired) : currentYear2(today);
    expected.set(group, take(counters, yy));
    const key = matriculeKey(expected.get(group) || "");
    if (key) used.add(key);
  }

  const undated = fresh.filter((g) => !expected.has(g));
  undated.sort((a, b) => (earliest(a)?.row.line || 0) - (earliest(b)?.row.line || 0));
  for (const group of undated) {
    const fileMat = members(group).map((s) => s.fileMat).find(Boolean) || "";
    const parts = readMatricule(fileMat);
    const key = matriculeKey(fileMat);
    if (fileMat && key && used.has(key)) {
      for (const slot of members(group)) {
        slot.status = "duplicate";
        slot.message = `Matricule ${fileMat} déjà utilisé par une autre personne.`;
        slot.candidate = null;
      }
      expected.set(group, peek(counters, parts?.yy || currentYear2(today)));
      continue;
    }
    if (fileMat) {
      expected.set(group, fileMat);
      if (parts) note(counters, parts);
      if (key) used.add(key);
      for (const slot of members(group)) {
        slot.message = "Date d'embauche absente : matricule du fichier conservé, ordre non vérifié.";
      }
      continue;
    }
    const yy = [...counters.keys()].sort((a, b) => a.localeCompare(b)).at(-1) || currentYear2(today);
    const assigned = take(counters, yy);
    expected.set(group, assigned);
    const assignedKey = matriculeKey(assigned);
    if (assignedKey) used.add(assignedKey);
  }

  for (const slot of slots) {
    if (slot.status !== "confirm" || !slot.candidate || slot.candidate.matricule) continue;
    const group = groups.find(
      (g) => g.kind === "new" && g.birth === slot.candidate?.birthDate && g.display === slot.candidate.name,
    );
    const matricule = group ? expected.get(group) || "" : "";
    if (matricule) slot.candidate = { ...slot.candidate, matricule };
  }

  for (const group of groups) {
    const mat = expected.get(group) || "";
    const key = matriculeKey(mat);
    if (!key) continue;
    const holder = byMat.get(key) ?? null;
    if (!holder || holder.id === group.employeeId) continue;
    const holderGroup = groups.find((item) => item.employeeId && item.employeeId === holder.id);
    const holderTarget = holderGroup ? matriculeKey(expected.get(holderGroup) || holderGroup.storedMatricule) : "";
    if (holderGroup && holderTarget && holderTarget !== key) continue;
    const pending = slots.some(
      (slot) => slot.status === "confirm" && matriculeKey(slot.candidate?.matricule || "") === key,
    );
    for (const slot of members(group)) {
      if (slot.status !== "new" && slot.status !== "exists") continue;
      slot.status = "conflict";
      slot.message = pending
        ? `Le matricule ${mat} est enregistré sur ${holder.display} (${holder.matricule}). Confirmez cette personne dans le fichier avant de changer son numéro.`
        : `Le matricule ${mat} est enregistré sur ${holder.display} (${holder.matricule}).`;
    }
  }

  return slots.map((slot) => {
    const group = slot.group;
    const wanted = group ? expected.get(group) || "" : "";
    const lead = group ? earliest(group) : null;
    let status = slot.status;
    let message = slot.message;
    let leadLine = group && group.kind === "new" && lead && lead.row.line !== slot.row.line ? lead.row.line : null;
    if (group?.kind === "new" && (status === "new" || status === "exists")) {
      if (lead && lead.row.line !== slot.row.line) {
        status = "exists";
        leadLine = lead.row.line;
      } else {
        status = "new";
        leadLine = null;
      }
    }
    const fileKey = matriculeKey(slot.fileMat);
    const wantedKey = matriculeKey(wanted);
    if ((status === "new" || status === "exists") && slot.fileMat && wanted && fileKey !== wantedKey) {
      status = "mismatch";
      message = `Matricule du fichier ${slot.fileMat}, matricule attendu ${wanted}. Le numéro suit l'année d'embauche, sans combler les trous.`;
    }
    const warnings = slot.row.warnings.filter((w) => !w.startsWith("Matricule absent") || status === "new");
    if (message && !warnings.includes(message) && status !== "mismatch" && status !== "conflict" && status !== "duplicate") {
      warnings.push(message);
    }
    if (status === "exists" && wanted) {
      const stored = group?.storedMatricule ?? "";
      const replaced = Boolean(stored && matriculeKey(stored) !== matriculeKey(wanted));
      warnings.push(
        replaced
          ? `Employé déjà connu. Le matricule ${wanted} du fichier remplace ${stored}.`
          : group?.employeeId || leadLine
            ? `Employé déjà connu, matricule ${wanted} conservé. La fiche sera mise à jour.`
            : `Employé déjà connu, matricule ${wanted}. Actualisez la liste pour le mettre à jour.`,
      );
    }
    const issues = [...slot.row.issues];
    if (message && (status === "mismatch" || status === "conflict" || status === "duplicate")) issues.push(message);
    const matricule = status === "mismatch" || status === "duplicate" || status === "conflict" ? slot.fileMat : wanted || slot.fileMat;
    const values = { ...slot.row.values };
    if (matricule && (status === "new" || status === "exists")) values.matricule = matricule;
    return {
      ...slot.row,
      status,
      matricule,
      values,
      employeeId: group?.employeeId ?? null,
      leadLine,
      expectedMatricule: wanted,
      candidate: slot.candidate,
      warnings,
      issues,
    };
  });
}

function blankImportRow(values: Record<string, string>, line = 2): ImportRow {
  return {
    line,
    status: "new",
    name: [values.last_name, values.first_name].filter(Boolean).join(" "),
    matricule: (values.matricule ?? "").trim(),
    expectedMatricule: "",
    employeeId: null,
    leadLine: null,
    candidate: null,
    values,
    excelNo: null,
    issues: [],
    warnings: [],
  };
}

/** Next matricule for a hire date. Empty when the hire date is missing. */
export function nextMatriculeForHire(
  hiredAt: string,
  matricules: readonly string[],
  today?: string,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hiredAt)) return "";
  const [planned] = applyEmployeeMatricules(
    [blankImportRow({ matricule: "", last_name: "X", first_name: "Y", hired_at: hiredAt })],
    matricules.filter(Boolean).map((matricule) => ({ matricule })),
    { today },
  );
  return planned?.expectedMatricule || planned?.matricule || "";
}

/** One fiche against the people already stored. Used on every save, not only on import. */
export function reviewLiveFiche(
  values: Record<string, string>,
  existing: ExistingEmployee[],
  choice?: ImportLinkChoice,
  today?: string,
): ImportRow {
  const others = existing.filter((person) => !values.id || person.id !== values.id);
  const [planned] = applyEmployeeMatricules(
    [blankImportRow(values)],
    others,
    { links: choice ? { 2: choice } : {}, today },
  );
  return planned;
}

export type PersonHit = { id: string; matricule: string; name: string; birthDate: string };

function personHit(person: ExistingEmployee): PersonHit | null {
  if (!person.id) return null;
  return {
    id: person.id,
    matricule: person.matricule,
    name: displayName(person.last_name ?? "", person.first_name ?? "") || person.matricule,
    birthDate: (person.birth_date ?? "").slice(0, 10),
  };
}

/** NSS or NIN already stored on another employee. A cross-match is a conflict. */
export function matchStrongIdentity(
  values: Record<string, string>,
  existing: ExistingEmployee[],
): { conflict: string | null; person: PersonHit | null } {
  const others = existing.filter((person) => person.id && person.id !== values.id);
  const nin = digits(values.nin, NIN_LEN);
  const nss = digits(values.nss, NSS_LEN);
  const byNin = nin ? others.find((person) => digits(person.nin, NIN_LEN) === nin) ?? null : null;
  const byNss = nss ? others.find((person) => digits(person.nss, NSS_LEN) === nss) ?? null : null;
  if (byNin && byNss && byNin.id !== byNss.id) {
    const ninHit = personHit(byNin);
    const nssHit = personHit(byNss);
    return {
      conflict: `NIN déjà porté par ${ninHit?.name ?? "un employé"} (${byNin.matricule}), NSS déjà porté par ${nssHit?.name ?? "un autre"} (${byNss.matricule}). Aucun rattachement.`,
      person: null,
    };
  }
  const person = byNin || byNss;
  return { conflict: null, person: person ? personHit(person) : null };
}

/** Close name and the same birth date. Never an automatic merge. */
export function matchCloseName(values: Record<string, string>, existing: ExistingEmployee[]): PersonHit | null {
  const blinded = { ...values, id: "", nss: "", nin: "", matricule: "" };
  const planned = reviewLiveFiche(blinded, existing.filter((person) => person.id !== values.id));
  if (planned.status !== "confirm" || !planned.candidate?.matricule) return null;
  const person = existing.find(
    (item) => item.id && item.id !== values.id && matriculeKey(item.matricule) === matriculeKey(planned.candidate?.matricule),
  );
  return person ? personHit(person) : null;
}

export type TableReportLine = {
  id: string;
  name: string;
  matricule: string;
  expectedMatricule: string;
  status: ImportRow["status"];
  message: string;
};

function matriculeFullYear(matricule: string): number | null {
  const parts = readMatricule(matricule);
  if (!parts) return null;
  const yy = Number(parts.yy);
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

/** The matricule year is older than the date on the fiche: this is a return, not a first hire. */
export function keepsFirstEmploymentNumber(person: ExistingEmployee): boolean {
  const matYear = matriculeFullYear(person.matricule ?? "");
  const hiredYear = Number((person.hired_at ?? "").slice(0, 4));
  return Boolean(matYear && hiredYear && matYear < hiredYear);
}

/** The live staff table checked with the same matricule rules as the import. */
export function reportEmployeeTable(
  people: ExistingEmployee[],
  today?: string,
): { total: number; lines: TableReportLine[]; returns: number } {
  const ordered = people
    .filter((person) => person.id)
    .slice()
    .sort(
      (a, b) =>
        (a.hired_at || "9999-99-99").localeCompare(b.hired_at || "9999-99-99") ||
        a.matricule.localeCompare(b.matricule),
    );
  const returns = ordered.filter(keepsFirstEmploymentNumber);
  const firstHires = ordered.filter((person) => !keepsFirstEmploymentNumber(person));
  const ids = new Map<number, string>();
  const rows = firstHires.map((person, index) => {
    const line = index + 2;
    ids.set(line, person.id || "");
    return blankImportRow(
      {
        matricule: person.matricule ?? "",
        last_name: person.last_name ?? "",
        first_name: person.first_name ?? "",
        nss: person.nss ?? "",
        nin: person.nin ?? "",
        birth_date: (person.birth_date ?? "").slice(0, 10),
        hired_at: (person.hired_at ?? "").slice(0, 10),
      },
      line,
    );
  });
  const planned = applyEmployeeMatricules(rows, returns, { today });
  const lines = planned
    .filter((row) => row.status !== "new" || row.warnings.some((warning) => warning.includes("ordre non vérifié")))
    .map((row) => ({
      id: ids.get(row.line) || "",
      name: row.name,
      matricule: row.matricule,
      expectedMatricule: row.expectedMatricule,
      status: row.status,
      message: [...row.issues, ...row.warnings].join(" · "),
    }));
  return { total: ordered.length, lines, returns: returns.length };
}
