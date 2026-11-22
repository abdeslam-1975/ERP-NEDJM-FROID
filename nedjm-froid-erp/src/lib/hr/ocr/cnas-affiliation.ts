import type { OcrFieldSuggestion } from "@/lib/hr/ocr/types";

/**
 * Déclaration CNAS « demande d'affiliation d'un assuré social ».
 * L'assuré n'est lu qu'après contrôle du champ employeur (NEDJM FROID).
 * Champs retenus, dans l'ordre de la déclaration :
 * NSS, nom FR, nom AR, prénom FR, prénom AR, naissance, commune,
 * n° acte, sexe, situation familiale, groupe sanguin, NIN,
 * père, mère (nom + prénom), nationalité, recrutement, déclaration, poste.
 */
const EMPLOYER_NOTICE =
  "Le champ employeur ne contient pas NEDJM FROID. Aucune donnée de l'assuré n'est extraite. · حقل صاحب العمل لا يحتوي اسم المؤسسة، لم يُستخرج شيء.";

const FR_MONTHS: Record<string, string> = {
  janvier: "01",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
};

const AR_LABELS = new Set(["اللقب", "الاسم", "الإسم", "اسم", "لقب"]);

export type CnasAffiliationExtract = {
  matched: boolean;
  suggestions: OcrFieldSuggestion[];
  notice?: string;
};

function push(
  out: OcrFieldSuggestion[],
  code: string,
  label: string,
  value: string | null | undefined,
  confidence: OcrFieldSuggestion["confidence"] = "high",
) {
  const v = String(value ?? "").trim();
  if (!v) return;
  if (out.some((s) => s.code === code)) return;
  out.push({ code, label, value: v, confidence });
}

function foldLatin(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function fixDigits(raw: string): string {
  return raw.replace(/[OoО]/g, "0").replace(/[Il|]/g, "1");
}

function sectionAfter(text: string, start: RegExp, end: RegExp): string {
  const m = start.exec(text);
  if (!m || m.index == null) return "";
  const rest = text.slice(m.index + m[0].length);
  const stop = end.exec(rest);
  return stop && stop.index != null ? rest.slice(0, stop.index) : rest;
}

function isAffiliationForm(text: string): boolean {
  const n = foldLatin(text);
  return /demande\s+d['’]?\s*affiliation/.test(n) || /renseignements\s+concernant\s+l['’]?\s*assure/.test(n);
}

function employerIsNedjm(section: string): boolean {
  const n = foldLatin(section).replace(/[^a-z0-9]+/g, " ");
  return /\bnedje?m\b/.test(n) && /\bfroid\b/.test(n);
}

function fieldLine(section: string, label: RegExp): string | null {
  const m = label.exec(section);
  if (!m || m.index == null) return null;
  const line = section.slice(m.index + m[0].length).split(/\n/)[0] ?? "";
  const latin = line.split(/[\u0600-\u06FF]/)[0] ?? line;
  const cleaned = latin.replace(/^[\s:.\-–—|/]+/, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || null;
}

function arabicBeside(section: string, label: string): string | null {
  const idx = section.indexOf(label);
  if (idx < 0) return null;
  const after = section.slice(idx + label.length);
  const line = after.split(/\n/)[0] ?? "";
  const next = (after.split(/\n/)[1] ?? "").trim();
  const cut = `${line}\n${next}`.split(/\n|(?=[A-Za-zÀ-ÿ]{3,})/)[0] ?? "";
  const words = (cut.match(/[\u0600-\u06FF]+/g) ?? []).filter((w) => !AR_LABELS.has(w));
  const cleaned = words.slice(0, 3).join(" ").trim();
  return cleaned || null;
}

function writtenDate(text: string): string | null {
  const fixed = fixDigits(text);
  const iso = fixed.match(
    /\b((?:19|20)\d{2})[.\-/](0[1-9]|1[0-2])[.\-/](0[1-9]|[12]\d|3[01])\b/,
  );
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = fixed.match(
    /\b(0[1-9]|[12]\d|3[01])[.\-/](0[1-9]|1[0-2])[.\-/]((?:19|20)\d{2})\b/,
  );
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  const named = foldLatin(fixed).match(
    /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+((?:19|20)\d{2})\b/,
  );
  if (!named) return null;
  const day = named[1].padStart(2, "0");
  const month = FR_MONTHS[named[2]];
  if (!month || Number(day) < 1 || Number(day) > 31) return null;
  return `${named[3]}-${month}-${day}`;
}

function dateAfter(section: string, label: RegExp): string | null {
  const m = label.exec(section);
  if (!m || m.index == null) return null;
  return writtenDate(section.slice(m.index, m.index + m[0].length + 40));
}

function digitsAfter(section: string, label: RegExp, length: number): string | null {
  const m = label.exec(section);
  if (!m?.[1]) return null;
  const d = fixDigits(m[1]).replace(/\D/g, "");
  if (d.length < length) return null;
  return d.slice(0, length);
}

function sexCode(section: string): string | null {
  const raw = fieldLine(section, /Sexe\s*:/i);
  if (!raw) return null;
  if (/femin|femme|^f\b|أنثى|انثى/i.test(foldLatin(raw))) return "F";
  if (/mascul|homme|^m\b|ذكر/i.test(foldLatin(raw))) return "M";
  return null;
}

function maritalCode(section: string): string | null {
  const raw = fieldLine(section, /Situation familiale\s*:/i);
  if (!raw) return null;
  const n = foldLatin(raw);
  if (n.includes("marie")) return "M";
  if (n.includes("celib")) return "C";
  if (n.includes("divorc")) return "D";
  if (n.includes("veuf") || n.includes("veuve")) return "V";
  return null;
}

function bloodCode(section: string): string | null {
  const raw = fieldLine(section, /Groupe sanguin\s*:/i);
  if (!raw) return null;
  const m = raw.toUpperCase().match(/(AB|A|B|O)\s*([+-])/);
  return m ? `${m[1]}${m[2]}` : null;
}

export function extractCnasAffiliation(text: string): CnasAffiliationExtract {
  if (!isAffiliationForm(text)) return { matched: false, suggestions: [] };

  const employer = sectionAfter(
    text,
    /RENSEIGNEMENTS\s+CONCERNANT\s+L['’]?\s*EMPLOYEUR/i,
    /RENSEIGNEMENTS\s+CONCERNANT\s+L['’]?\s*ASSUR/i,
  );
  const assure = sectionAfter(
    text,
    /RENSEIGNEMENTS\s+CONCERNANT\s+L['’]?\s*ASSUR[EÉÊË]?\s+SOCIAL/i,
    /RENSEIGNEMENTS\s+CONCERNANT\s+L['’]?\s*AFFILIATION|AYANTS?\s+DROIT/i,
  );
  const affiliation = sectionAfter(
    text,
    /RENSEIGNEMENTS\s+CONCERNANT\s+L['’]?\s*AFFILIATION/i,
    /AYANTS?\s+DROIT|EDIT[EÉ]\s+LE|PAGE\s+\d/i,
  );

  if (!employerIsNedjm(employer)) {
    return { matched: true, suggestions: [], notice: EMPLOYER_NOTICE };
  }

  const out: OcrFieldSuggestion[] = [];
  const nss = digitsAfter(
    assure,
    /Num[ée]ro\s+d['’]immatriculation\s*:?\s*([\d\s.\-]{10,22})/i,
    12,
  );
  push(out, "nss", "N° NSS", nss);

  const last = fieldLine(assure, /(?:^|\n)\s*Nom\s*:/i);
  if (last) push(out, "last_name", "Nom", last.toLocaleUpperCase("fr-DZ"));
  const lastAr = arabicBeside(assure, "اللقب");
  push(out, "last_name_ar", "Nom AR", lastAr);

  const first = fieldLine(assure, /Pr[ée]nom\s*:/i);
  if (first) push(out, "first_name", "Prénom", first.toLocaleUpperCase("fr-DZ"));
  const firstAr = arabicBeside(assure, "الاسم") ?? arabicBeside(assure, "الإسم");
  push(out, "first_name_ar", "Prénom AR", firstAr);

  push(out, "birth_date", "Date de naissance", dateAfter(assure, /Date de naissance\s*:/i));
  const commune = fieldLine(assure, /Commune de naissance\s*:/i);
  if (commune) push(out, "commune_birth", "بلدية الميلاد", commune.toLocaleUpperCase("fr-DZ"));

  const act = digitsAfter(
    assure,
    /Num[ée]ro\s+d['’]acte\s+de\s+naissance\s*:?\s*([\d\s]{1,8})/i,
    5,
  );
  push(out, "birth_act_no", "N° acte de naissance", act);
  push(out, "sex_code", "Sexe", sexCode(assure));
  push(out, "marital_code", "Situation familiale", maritalCode(assure));
  push(out, "blood_code", "Groupe sanguin", bloodCode(assure));

  const nin = digitsAfter(
    assure,
    /Num[ée]ro\s+d['’]identification\s+national\s*:?\s*([\d\s]{16,24})/i,
    18,
  );
  push(out, "nin", "NIN", nin);

  const father = fieldLine(assure, /Pr[ée]nom\s+du\s+p[èe]re\s*:/i);
  if (father) push(out, "father_name", "Père", father.toLocaleUpperCase("fr-DZ"));

  const motherLast = fieldLine(assure, /Nom\s+de\s+la\s+m[èe]re\s*:/i);
  const motherFirst = fieldLine(assure, /Pr[ée]nom\s+de\s+la\s+m[èe]re\s*:/i);
  const mother = [motherLast, motherFirst].filter(Boolean).join(" ");
  if (mother) push(out, "mother_name", "Mère", mother.toLocaleUpperCase("fr-DZ"));

  const nationality = fieldLine(assure, /Nationalit[ée]\s*:/i);
  if (nationality) push(out, "nationality", "Nationalité", nationality.toLocaleUpperCase("fr-DZ"));

  push(out, "hired_at", "Date de recrutement", dateAfter(affiliation, /Date de recrutement\s*:/i));
  push(
    out,
    "declaration_date",
    "Date de déclaration",
    dateAfter(affiliation, /Date de d[ée]claration\s*:/i),
  );
  const poste = fieldLine(affiliation, /Poste occup[ée]\s*:/i);
  if (poste) push(out, "poste", "Poste", poste.toLocaleUpperCase("fr-DZ"));

  return { matched: true, suggestions: out };
}
