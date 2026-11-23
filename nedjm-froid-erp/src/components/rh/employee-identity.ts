import { matriculeKey } from "@/lib/hr/contract-import";
import type { ExistingEmployee } from "@/lib/hr/employee-import";
import {
  matchCloseName,
  matchStrongIdentity,
  reviewLiveFiche,
  type PersonHit,
} from "@/lib/hr/employee-matricule";

export type IdentityDecision =
  | { ok: true; values: Record<string, string>; note?: string }
  | { ok: false; error: string };

function ask(message: string) {
  return typeof window === "undefined" || window.confirm(message);
}

function knownMessage(person: PersonHit) {
  return (
    `Employé déjà connu : ${person.name}, matricule ${person.matricule}.\n` +
    `La fiche sera mise à jour et l'ancienne fiche PDF conservée.`
  );
}

function closeMessage(person: PersonHit) {
  const born = person.birthDate ? `, né(e) le ${person.birthDate}` : "";
  return (
    `Ressemble à ${person.name} (${person.matricule})${born}.\n` +
    `Même personne ?`
  );
}

/**
 * Applies the matricule rules on every fiche save.
 * A manual number that is not the expected one is refused.
 * `newEntry` keeps the previous card and opens a second one on the new hire date.
 */
export function confirmFicheIdentity(
  values: Record<string, string>,
  existing: ExistingEmployee[],
  manualMatricule: boolean,
  options?: { newEntry?: boolean; previousHiredAt?: string },
): IdentityDecision {
  if (options?.newEntry) {
    const hired = (values.hired_at ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hired)) {
      return { ok: false, error: "Indiquez la date de la nouvelle entrée : jour, mois et année." };
    }
    const previous = (options.previousHiredAt ?? "").slice(0, 10);
    if (previous && hired === previous) {
      return {
        ok: false,
        error: "La nouvelle entrée doit avoir une date différente du premier recrutement.",
      };
    }
    const fresh = { ...values, id: "", matricule: "" };
    const planned = reviewLiveFiche(fresh, existing, "other", undefined, { separateEntry: true });
    if (planned.status === "conflict" || planned.status === "duplicate" || planned.status === "confirm") {
      return { ok: false, error: planned.issues[0] || planned.warnings[0] || "Nouvelle entrée refusée." };
    }
    const expected = planned.expectedMatricule || planned.matricule;
    if (!expected || planned.employeeId) {
      return { ok: false, error: "Matricule impossible pour cette date de nouvelle entrée." };
    }
    return {
      ok: true,
      values: { ...fresh, matricule: expected },
      note: `Nouvelle entrée ${expected}. L'ancienne carte reste inchangée.`,
    };
  }

  const strong = matchStrongIdentity(values, existing);
  if (strong.conflict) return { ok: false, error: strong.conflict };
  if (strong.person) {
    if (!ask(knownMessage(strong.person))) return { ok: false, error: "Enregistrement annulé." };
    return {
      ok: true,
      values: { ...values, id: strong.person.id, matricule: strong.person.matricule },
      note: `Matricule conservé : ${strong.person.matricule}.`,
    };
  }

  const close = matchCloseName(values, existing);
  if (close && ask(closeMessage(close))) {
    return {
      ok: true,
      values: { ...values, id: close.id, matricule: close.matricule },
      note: `Même personne, matricule ${close.matricule} conservé.`,
    };
  }

  if (values.id) return { ok: true, values };

  const planned = close
    ? reviewLiveFiche(values, existing, "other")
    : reviewLiveFiche(values, existing);
  if (planned.status === "conflict" || planned.status === "duplicate" || planned.status === "confirm") {
    return { ok: false, error: planned.issues[0] || planned.warnings[0] || "Matricule refusé." };
  }
  const expected = planned.expectedMatricule || planned.matricule;
  if (planned.employeeId) {
    if (!ask(knownMessage({ id: planned.employeeId, matricule: expected, name: planned.name, birthDate: "" }))) {
      return { ok: false, error: "Enregistrement annulé." };
    }
    return { ok: true, values: { ...values, id: planned.employeeId, matricule: expected } };
  }
  if (!manualMatricule || !values.matricule.trim()) {
    return {
      ok: true,
      values: { ...values, matricule: expected },
      note: planned.warnings.find((warning) => warning.includes("ordre non vérifié")),
    };
  }
  if (matriculeKey(values.matricule) !== matriculeKey(expected)) {
    return {
      ok: false,
      error: `Matricule ${values.matricule}, matricule attendu ${expected}. Le numéro suit l'année d'embauche, sans combler les trous.`,
    };
  }
  return { ok: true, values: { ...values, matricule: expected } };
}
