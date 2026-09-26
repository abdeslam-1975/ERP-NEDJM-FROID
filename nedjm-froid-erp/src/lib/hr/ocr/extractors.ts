import type { OcrDocProfile, OcrExtractResult, OcrFieldSuggestion } from "@/lib/hr/ocr/types";
import {
  digitMaxLength,
  digitsOnly,
  isExpiryDateField,
  isIssueDateField,
  sanitizeFicheInput,
} from "@/lib/hr/employee-fiche-constraints";

function push(
  out: OcrFieldSuggestion[],
  code: string,
  label: string,
  value: string | null | undefined,
  confidence: OcrFieldSuggestion["confidence"] = "medium",
) {
  const v = String(value ?? "").trim();
  if (!v) return;
  if (out.some((s) => s.code === code)) return;
  out.push({ code, label, value: v, confidence });
}

/** Corrige confusions OCR fréquentes sur chiffres. */
function fixOcrDigits(raw: string): string {
  return raw
    .replace(/[OoО]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
}

function digits(text: string, len: number): string | null {
  const spaced = fixOcrDigits(text).replace(/[\s.\-_/]/g, " ");
  const re = new RegExp(`(?:^|[^\\d])(\\d{${len}})(?:[^\\d]|$)`);
  const m = spaced.match(re);
  if (m?.[1]) return m[1];
  const runs = spaced.replace(/\D/g, " ").split(/\s+/).filter((x) => x.length === len);
  return runs[0] ?? null;
}

/** Toutes les dates YYYY.MM.DD / YYYY-MM-DD / DD/MM/YYYY */
function findAllIsoDates(text: string): string[] {
  const out: string[] = [];
  const fixed = fixOcrDigits(text);
  const iso = fixed.matchAll(
    /\b((?:19|20)\d{2})[.\-/](0[1-9]|1[0-2])[.\-/](0[1-9]|[12]\d|3[01])\b/g,
  );
  for (const m of iso) {
    out.push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  const fr = fixed.matchAll(
    /\b(0[1-9]|[12]\d|3[01])[.\-/](0[1-9]|1[0-2])[.\-/]((?:19|20)\d{2})\b/g,
  );
  for (const m of fr) {
    out.push(`${m[3]}-${m[2]}-${m[1]}`);
  }
  return [...new Set(out)];
}

function findDate(text: string): string | null {
  return findAllIsoDates(text)[0] ?? null;
}

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u200f|\u200e/g, "")
    .toLocaleLowerCase("ar");
}

/** Cherche une valeur après un libellé (même ligne ou suivante). */
function afterLabel(text: string, labels: string[], maxLen = 120): string | null {
  const normText = normalizeForSearch(text);
  for (const label of labels) {
    const normLabel = normalizeForSearch(label);
    let from = 0;
    while (from < normText.length) {
      const idx = normText.indexOf(normLabel, from);
      if (idx < 0) break;
      const slice = text.slice(idx + label.length, idx + label.length + 160);
      const lines = slice.split(/\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines.slice(0, 3)) {
        const cleaned = line
          .replace(/^[\s:.\-–—|/\\]+/, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (cleaned.length >= 1) return cleaned.slice(0, maxLen);
      }
      from = idx + normLabel.length;
    }
  }
  return null;
}

function dateAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const idx = normalizeForSearch(text).indexOf(normalizeForSearch(label));
    if (idx < 0) continue;
    const slice = text.slice(idx, idx + label.length + 50);
    const d = findDate(slice);
    if (d) return d;
  }
  return null;
}

function hasArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

function isLatinName(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  if (hasArabic(t)) return false;
  return /^[A-Za-zÀ-ÿ'’\-.\s]+$/.test(t);
}

function cleanArabicName(s: string): string {
  return s
    .replace(/[^\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLatinName(s: string): string {
  return s
    .replace(/[^A-Za-zÀ-ÿ'’\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("fr-DZ");
}

function normalizeBlood(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.toUpperCase().match(/(?:AB|A|B|O)\s*[+-]/);
  if (!m) return null;
  const group = m[0].replace(/\s+/g, "").match(/^(AB|A|B|O)([+-])$/);
  return group ? `${group[1]}${group[2]}` : null;
}

function extractSex(text: string): string | null {
  if (/(?:الجنس|SEXE|SEX)\s*[:.\-–—]?\s*(أنثى|انثى|FEMININ|FÉMININ|FEMME|\bF\b)/i.test(text)) {
    return "F";
  }
  if (/(?:الجنس|SEXE|SEX)\s*[:.\-–—]?\s*(ذكر|MASCULIN|HOMME|MALE|\bM\b)/i.test(text)) {
    return "M";
  }
  const sexAfter = afterLabel(text, ["الجنس", "SEXE", "SEX"]);
  if (sexAfter) {
    if (/أنثى|انثى|FEM|\bF\b/i.test(sexAfter)) return "F";
    if (/ذكر|MASC|HOMME|\bM\b/i.test(sexAfter)) return "M";
  }
  return null;
}

/**
 * CNI biométrique DZ :
 * noms AR+FR, sexe, naissance, lieu, groupe sanguin, N° pièce, dates, autorité, NIN.
 */
function extractCni(text: string): OcrFieldSuggestion[] {
  const out: OcrFieldSuggestion[] = [];
  push(out, "id_type_code", "Type de pièce", "CNI", "high");

  const ninLabeled =
    text.match(
      /(?:رقم\s*التعريف\s*الوطني|NIN|N\.?\s*I\.?\s*N\.?)[^\d]{0,30}(\d[\d\s.\-]{15,28}\d)/i,
    ) ?? null;
  let nin: string | null = null;
  if (ninLabeled?.[1]) {
    const d = fixOcrDigits(ninLabeled[1]).replace(/\D/g, "");
    if (d.length >= 18) nin = d.slice(0, 18);
  }
  if (!nin) nin = digits(text, 18);
  push(out, "nin", "NIN", nin, nin ? "high" : "low");

  let idNo: string | null = null;
  const headerSlice = text.slice(0, Math.max(160, Math.floor(text.length * 0.55)));
  const nineInHeader = fixOcrDigits(headerSlice)
    .replace(/[\s.\-_]/g, " ")
    .match(/\b\d{9}\b/g);
  if (nineInHeader?.length) {
    idNo =
      nineInHeader.find((n) => !nin || (!nin.startsWith(n) && !nin.includes(n))) ??
      nineInHeader[0] ??
      null;
  }
  if (!idNo) {
    const allNine = fixOcrDigits(text)
      .replace(/[\s.\-_]/g, " ")
      .match(/\b\d{9}\b/g);
    if (allNine?.length) {
      idNo =
        allNine.find((n) => !nin || (!nin.startsWith(n) && !nin.includes(n))) ??
        allNine[0] ??
        null;
    }
  }
  if (!idNo) idNo = digits(text, 9);
  push(out, "id_number", "N° pièce (CNI)", idNo, idNo ? "high" : "low");

  const nomAr = afterLabel(text, ["اللقب", "لقب"]);
  const prenomAr = afterLabel(text, ["الإسم", "الاسم", "إسم", "اسم"]);
  if (nomAr && hasArabic(nomAr)) {
    const cleaned = cleanArabicName(nomAr);
    if (cleaned) push(out, "last_name_ar", "Nom AR", cleaned, "high");
  }
  if (prenomAr && hasArabic(prenomAr)) {
    const cleaned = cleanArabicName(prenomAr);
    if (cleaned) push(out, "first_name_ar", "Prénom AR", cleaned, "high");
  }

  const nomFr = afterLabel(text, ["NOM", "FAMILY NAME", "SURNAME"]);
  const prenomFr = afterLabel(text, ["PRENOM", "PRÉNOM", "GIVEN NAME", "FIRST NAME"]);
  if (nomFr && isLatinName(nomFr)) {
    push(out, "last_name", "Nom", cleanLatinName(nomFr), "medium");
  }
  if (prenomFr && isLatinName(prenomFr)) {
    push(out, "first_name", "Prénom", cleanLatinName(prenomFr), "medium");
  }
  if (!out.some((s) => s.code === "last_name") || !out.some((s) => s.code === "first_name")) {
    const latinLines = text
      .split(/\n/)
      .map((l) => l.trim())
      .filter(isLatinName)
      .filter(
        (l) =>
          !/REPUBLIQUE|ALGER|CARTE|NATIONAL|IDENTITE|IDENTITY|DEMOCRATIQUE|POPULAIRE/i.test(l),
      );
    if (latinLines[0] && !out.some((s) => s.code === "last_name")) {
      push(out, "last_name", "Nom", cleanLatinName(latinLines[0]), "low");
    }
    if (latinLines[1] && !out.some((s) => s.code === "first_name")) {
      push(out, "first_name", "Prénom", cleanLatinName(latinLines[1]), "low");
    }
  }

  const sexCode = extractSex(text);
  push(out, "sex_code", "Sexe", sexCode, sexCode ? "high" : "low");

  const birth =
    dateAfterLabel(text, [
      "تاريخ الميلاد",
      "DATE DE NAISSANCE",
      "DATE NAISSANCE",
      "NÉ LE",
      "NEE LE",
      "DOB",
    ]) ?? null;
  push(out, "birth_date", "Date de naissance", birth, birth ? "high" : "low");

  const birthPlace =
    afterLabel(text, [
      "مكان الميلاد",
      "LIEU DE NAISSANCE",
      "LIEU NAISSANCE",
      "PLACE OF BIRTH",
      "NÉ À",
      "NEE A",
    ]) ?? null;
  if (birthPlace) {
    const ar = cleanArabicName(birthPlace);
    const fr = cleanLatinName(birthPlace);
    if (ar) push(out, "birth_place_ar", "Lieu naissance AR", ar, "medium");
    if (fr && isLatinName(fr)) push(out, "birth_place_fr", "Lieu naissance FR", fr, "medium");
    if (ar) push(out, "commune_birth", "بلدية الميلاد", ar, "low");
  }

  const bloodMatch = text.match(/Rh\s*:?\s*((?:AB|A|B|O)\s*[+-])/i);
  const bloodRaw =
    bloodMatch?.[1] ??
    afterLabel(text, ["فصيلة الدم", "GROUPE SANGUIN", "BLOOD GROUP", "BLOOD"]);
  const blood = normalizeBlood(bloodRaw);
  push(out, "blood_code", "Groupe sanguin", blood, blood ? "high" : "low");

  const issued =
    dateAfterLabel(text, [
      "تاريخ الإصدار",
      "تاريخ الاصدار",
      "DATE DE DELIVRANCE",
      "DATE DE DÉLIVRANCE",
      "DATE DELIVRANCE",
      "ISSUED",
    ]) ?? null;
  const expires =
    dateAfterLabel(text, [
      "تاريخ الإنتهاء",
      "تاريخ الانتهاء",
      "تاريخ الإنتها",
      "DATE D'EXPIRATION",
      "DATE D EXPIRATION",
      "DATE EXPIRATION",
      "EXPIRES",
      "VALID UNTIL",
    ]) ?? null;

  const allDates = findAllIsoDates(text);
  let issuedFinal = issued;
  let expiresFinal = expires;
  if (!issuedFinal || !expiresFinal) {
    const sorted = [...allDates].sort();
    const withoutBirth = birth ? sorted.filter((d) => d !== birth) : sorted;
    if (withoutBirth.length >= 2) {
      if (!issuedFinal) issuedFinal = withoutBirth[0] ?? null;
      if (!expiresFinal) expiresFinal = withoutBirth[1] ?? null;
    } else if (sorted.length >= 3) {
      if (!issuedFinal) issuedFinal = sorted[1] ?? null;
      if (!expiresFinal) expiresFinal = sorted[2] ?? null;
    } else if (sorted.length === 2) {
      if (!issuedFinal) issuedFinal = sorted[0] ?? null;
      if (!expiresFinal) expiresFinal = sorted[1] ?? null;
    }
  }
  push(out, "id_issued_on", "Date de délivrance", issuedFinal, issuedFinal ? "high" : "low");
  push(out, "id_expires_on", "Date d'expiration", expiresFinal, expiresFinal ? "high" : "low");

  const authority = afterLabel(text, [
    "سلطة الإصدار",
    "سلطة الاصدار",
    "صادرة عن",
    "DELIVRE PAR",
    "DÉLIVRÉ PAR",
    "ISSUING AUTHORITY",
    "PAR LA DAIRA",
    "PAR LA DAÏRA",
  ]);
  if (authority) {
    const cleaned = authority.replace(/^(عن|من)\s+/u, "").trim();
    push(
      out,
      "id_issued_by",
      "صادرة عن",
      hasArabic(cleaned) ? cleanArabicName(cleaned) || cleaned : cleanLatinName(cleaned),
      "medium",
    );
  }

  return out;
}

/**
 * شهادة الميلاد :
 * noms, date, N° acte, sexe, père, mère, commune.
 */
function extractBirth(text: string): OcrFieldSuggestion[] {
  const out: OcrFieldSuggestion[] = [];

  const nomAr = afterLabel(text, ["اللقب", "لقب"]);
  const prenomAr = afterLabel(text, ["الإسم", "الاسم", "إسم", "اسم"]);
  if (nomAr && hasArabic(nomAr)) {
    const cleaned = cleanArabicName(nomAr.split(/(?:ابن|ابنة|و\s*من|الجنس)/u)[0] ?? nomAr);
    if (cleaned) push(out, "last_name_ar", "Nom AR", cleaned, "high");
  }
  if (prenomAr && hasArabic(prenomAr)) {
    const cleaned = cleanArabicName(prenomAr.split(/(?:ابن|ابنة|و\s*من|الجنس)/u)[0] ?? prenomAr);
    if (cleaned) push(out, "first_name_ar", "Prénom AR", cleaned, "high");
  }

  const actLabeled =
    text.match(
      /(?:رقم\s*الحالة\s*المدنية|رقم\s*عقد\s*الميلاد|N[°º.]?\s*D['’]?ACTE|ACTE\s*N[°º.]?)[^\d]{0,24}(\d[\d\s]{2,12}\d)/i,
    ) ?? null;
  let act: string | null = null;
  if (actLabeled?.[1]) {
    const d = fixOcrDigits(actLabeled[1]).replace(/\D/g, "");
    act = d.length >= 5 ? d.slice(0, 5) : d;
  }
  if (!act) act = digits(text, 5);
  push(out, "birth_act_no", "N° acte de naissance", act, act ? "high" : "low");

  const birth =
    dateAfterLabel(text, [
      "المولود في",
      "المولودة في",
      "المولود(ة) في",
      "تاريخ الميلاد",
      "DATE DE NAISSANCE",
      "NÉ LE",
      "NEE LE",
      "NÉ(E) LE",
    ]) ?? findDate(text);
  push(out, "birth_date", "Date de naissance", birth, birth ? "high" : "low");

  const sexCode = extractSex(text);
  push(out, "sex_code", "Sexe", sexCode, sexCode ? "high" : "low");

  let father =
    afterLabel(text, ["ابن(ة)", "ابنة", "ابن", "FILS DE", "FILLE DE", "PÈRE", "PERE", "الأب"]) ??
    null;
  if (father) {
    father =
      father
        .split(/(?:و\s*من|ومن|والمولود|الجنس|المولود)/u)[0]
        ?.replace(/[^\u0600-\u06FFA-Za-zÀ-ÿ\s'’-]/gu, "")
        .trim() ?? null;
  }
  if (father) {
    push(
      out,
      "father_name",
      "Père",
      hasArabic(father) ? cleanArabicName(father) : cleanLatinName(father),
      "high",
    );
  }

  let mother = afterLabel(text, ["و من", "ومن", "الأم", "MÈRE", "MERE", "ET DE"]) ?? null;
  if (mother) {
    mother =
      mother
        .split(/(?:المولود|الجنس|ببلدية|تاريخ|رقم)/u)[0]
        ?.replace(/[^\u0600-\u06FFA-Za-zÀ-ÿ\s'’-]/gu, "")
        .trim() ?? null;
  }
  if (mother) {
    push(
      out,
      "mother_name",
      "Mère",
      hasArabic(mother) ? cleanArabicName(mother) : cleanLatinName(mother),
      "high",
    );
  }

  let commune =
    afterLabel(text, [
      "ببلدية",
      "المولود بـ",
      "المولود ب",
      "المولودة بـ",
      "المولودة ب",
      "بلدية الميلاد",
      "COMMUNE DE NAISSANCE",
      "NÉ À",
      "NEE A",
    ]) ?? null;
  if (!commune) commune = afterLabel(text, ["بلدية"]);
  if (commune) {
    const cleaned = commune
      .split(/\n/)[0]
      ?.replace(/[^\u0600-\u06FFA-Za-zÀ-ÿ\s'’-]/gu, "")
      .trim();
    if (cleaned) {
      push(
        out,
        "commune_birth",
        "بلدية الميلاد",
        hasArabic(cleaned) ? cleanArabicName(cleaned) : cleanLatinName(cleaned),
        "medium",
      );
    }
  }

  return out;
}

/**
 * Attestation CNAS — NSS (Immatriculé) + champs utiles de la fiche si lisibles.
 */
function extractSs(text: string): OcrFieldSuggestion[] {
  const out: OcrFieldSuggestion[] = [];

  // Priorité : Immatriculé(e) sous le numéro / المسجل تحت رقم (pas "Sous le numéro" seul)
  const labeled =
    text.match(
      /(?:Immatricul[éeêe]{1,3}\s*sous\s*le\s*num[éee]ro|المسجل\s*تحت\s*رقم)[^\d]{0,40}(\d[\d\s.\-]{8,24}\d)/i,
    ) ?? null;
  let nss: string | null = null;
  if (labeled?.[1]) {
    const d = fixOcrDigits(labeled[1]).replace(/\D/g, "");
    if (d.length >= 12) nss = d.slice(0, 12);
  }
  if (!nss) {
    const alt =
      text.match(
        /(?:N[°º.]?\s*SS|NSS|NUM[ÉE]RO\s*SS|رقم\s*الضمان(?:\s*الاجتماعي)?)[^\d]{0,30}(\d[\d\s.\-]{8,24}\d)/i,
      ) ?? null;
    if (alt?.[1]) {
      const d = fixOcrDigits(alt[1]).replace(/\D/g, "");
      if (d.length >= 12) nss = d.slice(0, 12);
    }
  }
  if (!nss) {
    // 12 chiffres groupés (souvent 3×4)
    const grouped = fixOcrDigits(text).match(/\b(\d{3})\s*[.\-]?\s*(\d{3})\s*[.\-]?\s*(\d{3})\s*[.\-]?\s*(\d{3})\b/);
    if (grouped) nss = `${grouped[1]}${grouped[2]}${grouped[3]}${grouped[4]}`;
  }
  if (!nss) nss = digits(text, 12);
  push(out, "nss", "N° NSS", nss, nss ? "high" : "low");

  const nom = afterLabel(text, ["Nom", "NOM", "اللقب"]);
  if (nom) {
    if (hasArabic(nom)) {
      const a = cleanArabicName(nom);
      if (a) push(out, "last_name_ar", "Nom AR", a, "medium");
    } else if (isLatinName(nom)) {
      push(out, "last_name", "Nom", cleanLatinName(nom), "medium");
    }
  }
  const prenom = afterLabel(text, ["Prénom", "Prenom", "PRÉNOM", "PRENOM", "الاسم", "الإسم"]);
  if (prenom) {
    if (hasArabic(prenom)) {
      const a = cleanArabicName(prenom);
      if (a) push(out, "first_name_ar", "Prénom AR", a, "medium");
    } else if (isLatinName(prenom)) {
      push(out, "first_name", "Prénom", cleanLatinName(prenom), "medium");
    }
  }

  const birthBlock =
    afterLabel(
      text,
      ["Date et lieu de Naissance", "Date et lieu de naissance", "تاريخ و مكان الميلاد", "تاريخ ومكان الميلاد"],
      80,
    ) ?? null;
  if (birthBlock) {
    const d = findDate(birthBlock);
    if (d) push(out, "birth_date", "Date de naissance", d, "medium");
    const place = birthBlock
      .replace(/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}/, "")
      .replace(/\bà\b/gi, " ")
      .trim();
    if (place && isLatinName(place)) {
      push(out, "birth_place_fr", "Lieu naissance FR", cleanLatinName(place), "low");
      push(out, "commune_birth", "بلدية الميلاد", cleanLatinName(place), "low");
    }
  } else {
    const d = dateAfterLabel(text, ["Date de Naissance", "تاريخ الميلاد"]);
    if (d) push(out, "birth_date", "Date de naissance", d, "medium");
  }

  const act =
    text.match(
      /(?:N[°º.]?\s*Acte|رقم\s*عقد\s*الميلاد)[^\d]{0,20}(\d[\d\s]{2,12}\d)/i,
    ) ?? null;
  if (act?.[1]) {
    const digitsAct = fixOcrDigits(act[1]).replace(/\D/g, "");
    if (digitsAct.length >= 1) {
      push(
        out,
        "birth_act_no",
        "N° acte de naissance",
        digitsAct.length >= 5 ? digitsAct.slice(0, 5) : digitsAct,
        "medium",
      );
    }
  }

  const address = afterLabel(text, ["Adresse", "ADRESSE", "العنوان"]);
  if (address) {
    const cleaned = address.replace(/\s{2,}/g, " ").trim().slice(0, 160);
    if (cleaned) {
      if (hasArabic(cleaned)) push(out, "address_ar", "Adresse AR", cleaned, "low");
      else push(out, "address_fr", "Adresse FR", cleaned.toLocaleUpperCase("fr-DZ"), "low");
    }
  }

  return out;
}

export function extractFieldsFromOcrText(
  profile: OcrDocProfile,
  rawText: string,
): OcrExtractResult {
  const text = rawText.replace(/\u200f|\u200e/g, " ").replace(/[ \t]+/g, " ");
  let suggestions: OcrFieldSuggestion[] = [];
  if (profile === "CNI") suggestions = extractCni(text);
  else if (profile === "BIRTH") suggestions = extractBirth(text);
  else suggestions = extractSs(text);

  return { profile, rawText: text, suggestions };
}

/** Langues Tesseract selon le type de document. */
export function ocrLanguagesForProfile(profile: OcrDocProfile): string {
  if (profile === "CNI") return "ara+fra";
  if (profile === "BIRTH") return "ara+fra";
  return "ara+fra";
}

/**
 * Sanitize OCR → formulaire : conserve les dates d'expiration même passées
 * (sinon le champ disparaît à l'application). La validation à l'enregistrement reste stricte.
 */
export function sanitizeOcrSuggestion(code: string, raw: string): string {
  const max = digitMaxLength(code);
  if (max != null) return digitsOnly(raw, max);
  const v = String(raw ?? "").trim();
  if ((isIssueDateField(code) || isExpiryDateField(code)) && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return v;
  }
  return sanitizeFicheInput(code, raw);
}
