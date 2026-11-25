import { extractCnasAffiliation } from "@/lib/hr/ocr/cnas-affiliation";
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

function validYmd(year: string, month: string, day: string): string | null {
  const mi = Number(month);
  const di = Number(day);
  if (!Number.isInteger(mi) || !Number.isInteger(di)) return null;
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  return `${year}-${String(mi).padStart(2, "0")}-${String(di).padStart(2, "0")}`;
}

/** Toutes les dates YYYY.MM.DD / YYYY-MM-DD / DD/MM/YYYY (jour et mois sur 1 ou 2 chiffres). */
function findAllIsoDates(text: string): string[] {
  const out: string[] = [];
  const fixed = fixOcrDigits(text);
  const iso = fixed.matchAll(
    /(?:^|[^\d])((?:19|20)\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)/g,
  );
  for (const m of iso) {
    const v = validYmd(m[1] ?? "", m[2] ?? "", m[3] ?? "");
    if (v) out.push(v);
  }
  const fr = fixed.matchAll(
    /(?:^|[^\d])(\d{1,2})[.\-/](\d{1,2})[.\-/]((?:19|20)\d{2})(?!\d)/g,
  );
  for (const m of fr) {
    const v = validYmd(m[3] ?? "", m[2] ?? "", m[1] ?? "");
    if (v) out.push(v);
  }
  return [...new Set(out)];
}

const FR_MONTH_INDEX: Record<string, string> = {
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

const AR_MONTH_INDEX: Record<string, string> = {
  يناير: "01",
  فبراير: "02",
  مارس: "03",
  أبريل: "04",
  افريل: "04",
  أفريل: "04",
  ماي: "05",
  مايو: "05",
  جوان: "06",
  يونيو: "06",
  جويلية: "07",
  يوليو: "07",
  أوت: "08",
  اغسطس: "08",
  أغسطس: "08",
  سبتمبر: "09",
  أكتوبر: "10",
  نوفمبر: "11",
  ديسمبر: "12",
};

function monthIndex(token: string): string | null {
  const ar = token.replace(/[\u064B-\u065F\u0670]/g, "");
  if (AR_MONTH_INDEX[ar]) return AR_MONTH_INDEX[ar];
  const lat = token.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
  return FR_MONTH_INDEX[lat] ?? null;
}

/** 22 septembre 1985 / 16 ديسمبر 2024 */
function findWrittenDates(text: string): string[] {
  const out: string[] = [];
  const re = /(\d{1,2})\s*([A-Za-zÀ-ÿ\u0600-\u06FF]{3,12})\s*((?:19|20)\d{2})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const month = monthIndex(m[2] ?? "");
    const v = month ? validYmd(m[3] ?? "", month, m[1] ?? "") : null;
    if (v) out.push(v);
  }
  return out;
}

/** « décembre 2024 » بلا يوم → أول الشهر، للمراجعة. */
function findMonthStart(text: string): string | null {
  const re = /([A-Za-zÀ-ÿ\u0600-\u06FF]{3,12})\s+((?:19|20)\d{2})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const month = monthIndex(m[1] ?? "");
    if (!month) continue;
    const before = text.slice(Math.max(0, (m.index ?? 0) - 4), m.index ?? 0);
    if (/\d\s*$/.test(before)) continue;
    return `${m[2]}-${month}-01`;
  }
  return null;
}

function findDate(text: string): string | null {
  return findAllIsoDates(text)[0] ?? findWrittenDates(text)[0] ?? null;
}

function findAllDates(text: string): string[] {
  return [...new Set([...findAllIsoDates(text), ...findWrittenDates(text)])];
}

/**
 * Normalise pour la recherche en gardant l'index d'origine.
 * NFKD / suppression des diacritiques change la longueur : couper le texte
 * brut avec l'index normalisé faisait rater un champ différent à chaque scan.
 */
function foldForSearch(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const step = cp > 0xffff ? 2 : 1;
    const origin = i;
    i += step;
    if (/[\u064B-\u065F\u0670\u0640\u200e\u200f]/.test(ch)) continue;
    const base = ch.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("ar");
    for (const c of base) {
      folded += c;
      map.push(origin);
    }
  }
  return { folded, map };
}

function indexAfter(text: string, charIndex: number): number {
  const cp = text.codePointAt(charIndex) ?? 0;
  return charIndex + (cp > 0xffff ? 2 : 1);
}

/** Fin du libellé dans le texte d'origine, ou null. */
function findLabelEnd(text: string, label: string, from = 0): number | null {
  const { folded, map } = foldForSearch(text);
  const needle = foldForSearch(label).folded;
  if (!needle) return null;
  const latinShort = /^[a-z0-9]{1,4}$/.test(needle);
  let startAt = 0;
  if (from > 0) {
    startAt = folded.length;
    for (let i = 0; i < map.length; i++) {
      if ((map[i] ?? 0) >= from) {
        startAt = i;
        break;
      }
    }
  }
  let fromFold = startAt;
  while (fromFold <= folded.length - needle.length) {
    const idx = folded.indexOf(needle, fromFold);
    if (idx < 0) return null;
    const prev = idx > 0 ? (folded[idx - 1] ?? "") : "";
    const next = folded[idx + needle.length] ?? "";
    const startOk = !prev || !/[\p{L}\p{N}]/u.test(prev);
    const endOk = !latinShort || !next || !/[a-z0-9]/i.test(next);
    if (startOk && endOk) {
      const origin = map[idx + needle.length - 1];
      if (origin == null) return null;
      return indexAfter(text, origin);
    }
    fromFold = idx + 1;
  }
  return null;
}

/** Cherche une valeur après un libellé (même ligne ou suivante). */
function afterLabel(text: string, labels: string[], maxLen = 120): string | null {
  for (const label of labels) {
    let from = 0;
    while (from < text.length) {
      const end = findLabelEnd(text, label, from);
      if (end == null) break;
      const slice = text.slice(end, end + 160);
      const lines = slice.split(/\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines.slice(0, 3)) {
        const cleaned = line
          .replace(/^[\s:.\-–—|/\\]+/, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (cleaned.length >= 1) return cleaned.slice(0, maxLen);
      }
      from = Math.max(end, from + 1);
    }
  }
  return null;
}

function dateAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const end = findLabelEnd(text, label);
    if (end == null) continue;
    const slice = text.slice(Math.max(0, end - 8), end + 80);
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
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
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

type SsSlot =
  | "last"
  | "first"
  | "fullName"
  | "birth"
  | "bcom"
  | "bwil"
  | "act"
  | "address"
  | "nss"
  | "nin"
  | "rip"
  | "since"
  | "hired"
  | "father"
  | "mother"
  | "nation"
  | "sex"
  | "marital"
  | "blood"
  | "poste";

type SsLabelHit = { slot: SsSlot; start: number; end: number };

const SS_SLOT_RES: { slot: SsSlot; re: RegExp }[] = [
  {
    slot: "fullName",
    re: /اللقب\s*و\s*ال[اأ]سم|nom\s*et\s*pr[eéèê]n[o0]m/iu,
  },
  {
    slot: "father",
    re: /nom\s*(?:et\s*pr[eéèê]n[o0]m\s*)?du\s*p[eéèê]re|اسم\s*الأب|(?<![\u0600-\u06FF])الأب(?![\u0600-\u06FF])|(?<![\p{L}])p[eéèê]re(?![\p{L}])/iu,
  },
  {
    slot: "mother",
    re: /nom\s*(?:et\s*pr[eéèê]n[o0]m\s*)?de\s*la\s*m[eéèê]re|اسم\s*الأم|(?<![\u0600-\u06FF])الأم(?![\u0600-\u06FF])|(?<![\p{L}])m[eéèê]re(?![\p{L}])/iu,
  },
  {
    slot: "birth",
    re: /date\s*(?:et|&)\s*lieu(?:\s*de)?\s*na[i1l][a-z]{0,10}|date\s*de\s*na[i1l][a-z]{0,10}|تاريخ\s*و\s*مكان\s*(?:الميلاد|الازدياد)|تاريخ\s*ومكان\s*(?:الميلاد|الازدياد)|تاريخ\s*(?:الميلاد|الازدياد)/iu,
  },
  {
    slot: "bcom",
    re: /commune\s*de\s*naissance|بلدية(?:\s*الميلاد)?|(?<![\p{L}])commune(?![\p{L}])/iu,
  },
  {
    slot: "bwil",
    re: /wilaya\s*(?:de\s*)?(?:naissance)?|ولاية(?:\s*الميلاد)?/iu,
  },
  {
    slot: "since",
    re: /depuis\s*le|à\s*compter\s*du|a\s*compter\s*du|date\s*d['’]?\s*affiliation|date\s*de\s*d[eé]claration|(?<![\p{L}])d[eé]claration(?![\p{L}])|ابتداء\s*ا?\s*من|تاريخ\s*(?:الانتساب|التصريح)|(?<![\u0600-\u06FF])التصريح(?![\u0600-\u06FF])/iu,
  },
  {
    slot: "hired",
    re: /date\s*d['’]?\s*entr[eé]e|date\s*de\s*recrutement|date\s*d['’]?\s*embauche|تاريخ\s*(?:التوظيف|الدخول|الالتحاق)/iu,
  },
  {
    slot: "act",
    re: /n\s*[°ºo.\-]*\s*acte(?:\s*de\s*na[i1l][a-z]{0,10})?|رقم\s*عقد\s*(?:الميلاد|الازدياد)|رقم\s*الحالة(?:\s*المدنية)?|شهادة\s*الميلاد/iu,
  },
  {
    slot: "nin",
    re: /رقم\s*التعريف\s*الوطني|(?<![\p{L}\p{N}])n\.?\s*i\.?\s*n\.?(?![\p{L}\p{N}])/iu,
  },
  {
    slot: "nss",
    re: /immatricul[éeèêa-z]*\s*(?:\(\s*e\s*\))?\s*sous\s*le\s*num[éeèêa-z]*|المسجل\s*(?:\(\s*ة\s*\))?\s*تحت\s*رقم|رقم\s*الضمان(?:\s*الاجتماعي)?|(?<![\p{L}\p{N}])n\s*[°ºo.]?\s*s\.?\s*s\.?(?![\p{L}\p{N}])/iu,
  },
  {
    slot: "rip",
    re: /(?<![\p{L}\p{N}])(?:rip|rib)(?![\p{L}\p{N}])|(?<![\p{L}])ccp(?![\p{L}])|رقم\s*الحساب|الحساب\s*البريدي/iu,
  },
  {
    slot: "address",
    re: /(?<![\p{L}\p{N}])adres[s5]e(?![\p{L}\p{N}])|العنوان/iu,
  },
  {
    slot: "nation",
    re: /nationalit[eé]|الجنسية/iu,
  },
  {
    slot: "sex",
    re: /(?<![\p{L}])sexe(?![\p{L}])|(?<![\u0600-\u06FF])الجنس(?![\u0600-\u06FF])/iu,
  },
  {
    slot: "marital",
    re: /situation\s*familiale|[eé]tat\s*civil|الوضعية\s*العائلية|الحالة\s*العائلية/iu,
  },
  {
    slot: "blood",
    re: /groupe\s*sanguin|فصيلة\s*الدم|(?<![\p{L}])rh(?![\p{L}])/iu,
  },
  {
    slot: "poste",
    re: /(?<![\p{L}])(?:poste|emploi|profession|fonction)(?![\p{L}])|المنصب|المهنة|الوظيفة/iu,
  },
  {
    slot: "first",
    re: /(?<![\p{L}\p{N}])pr[eéèê]n[o0]m(?![\p{L}\p{N}])|الاسم|الإسم|(?<![\u0600-\u06FF])اسم(?![\u0600-\u06FF])/iu,
  },
  {
    slot: "last",
    re: /(?<![\p{L}\p{N}])(?:nom|norn|n0m)(?![\p{L}\p{N}])|اللقب|(?<![\u0600-\u06FF])لقب(?![\u0600-\u06FF])/iu,
  },
];

const SS_NAME_STOP = new Set([
  "NOM",
  "PRENOM",
  "ADRESSE",
  "ACTE",
  "NAISSANCE",
  "DATE",
  "LIEU",
  "ATTESTATION",
  "AFFILIATION",
  "IMMATRICULE",
  "IMMATRICULEE",
  "CNAS",
  "CAISSE",
  "NATIONALE",
  "ASSURE",
  "ASSUREE",
  "CERTIFIE",
  "REPUBLIQUE",
  "ALGERIENNE",
  "DEMOCRATIQUE",
  "POPULAIRE",
  "DEPUIS",
  "SOUS",
  "NUMERO",
  "MONSIEUR",
  "MADAME",
  "EMPLOYEUR",
]);

function ssLabelHits(line: string): SsLabelHit[] {
  const found: SsLabelHit[] = [];
  for (const def of SS_SLOT_RES) {
    const flags = def.re.flags.includes("g") ? def.re.flags : `${def.re.flags}g`;
    const re = new RegExp(def.re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      found.push({ slot: def.slot, start: m.index, end: m.index + m[0].length });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: SsLabelHit[] = [];
  for (const hit of found) {
    const overlap = kept.findIndex((k) => hit.start < k.end && hit.end > k.start);
    if (overlap < 0) kept.push(hit);
    else if (hit.end - hit.start > kept[overlap]!.end - kept[overlap]!.start) {
      kept[overlap] = hit;
    }
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

function cleanSep(raw: string): string {
  return raw
    .replace(/^[\s:.\-–—|/\\]+/, "")
    .replace(/[\s:.–—|/\\]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulValue(raw: string): string {
  const cleaned = cleanSep(raw);
  if (!cleaned) return "";
  const hits = ssLabelHits(cleaned);
  if (
    hits.length === 1 &&
    hits[0]!.start <= 1 &&
    hits[0]!.end >= cleaned.length - 1
  ) {
    return "";
  }
  return cleaned;
}

function slotParts(line: string, hits: SsLabelHit[]): { slot: SsSlot; parts: string[] }[] {
  const out: { slot: SsSlot; parts: string[] }[] = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const next = hits[i + 1];
    const after = meaningfulValue(line.slice(hit.end, next ? next.start : line.length));
    const before = i === 0 ? meaningfulValue(line.slice(0, hit.start)) : "";
    const parts: string[] = [];
    if (after && before && hasArabic(after) !== hasArabic(before)) parts.push(after, before);
    else if (after) parts.push(after);
    else if (before) parts.push(before);
    if (parts.length) out.push({ slot: hit.slot, parts });
  }
  return out;
}

function isSsNoise(line: string): boolean {
  if (ssLabelHits(line).length) return false;
  if (findDate(line)) return false;
  if (nssCandidates(line).length) return false;
  return /republique|attestation|affiliation|caisse nationale|assurances sociales|travailleurs salaries|certifie que|الجمهورية|الصندوق الوطني|شهادة الانتساب|www\.|https?:/i.test(
    line,
  );
}

function prepareSsLines(text: string): string[] {
  const raw = text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const stitched: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let cur = raw[i] ?? "";
    const next = raw[i + 1];
    if (
      next &&
      /date\s*(?:et|&)\s*lieu/i.test(cur) &&
      !/na[i1l]|ميلاد|ازدياد/i.test(cur)
    ) {
      cur = `${cur} ${next}`;
      i++;
    } else if (next && /immatricul/i.test(cur) && nssCandidates(cur).length === 0) {
      cur = `${cur} ${next}`;
      i++;
    } else if (
      next &&
      /depuis\s*le|ابتداء|d[eé]claration|التصريح|entr[eé]e|recrutement|التوظيف/i.test(cur) &&
      !findDate(cur) &&
      !findMonthStart(cur)
    ) {
      cur = `${cur} ${next}`;
      i++;
    }
    stitched.push(cur);
  }
  return stitched;
}

type NssHit = { value: string; index: number; grouped: boolean };

function nssCandidates(text: string): NssHit[] {
  const fixed = text.replace(
    /[0-9OoIlSsBb|][0-9OoIlSsBb|\s.\-]{6,}[0-9OoIlSsBb|]/g,
    (chunk) => fixOcrDigits(chunk),
  );
  const out: NssHit[] = [];
  const solid = /(?:^|[^\d])(\d{12})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = solid.exec(fixed))) {
    out.push({ value: m[1] ?? "", index: m.index, grouped: false });
  }
  const grouped = /(?:^|[^\d])(\d{3}(?:[\s.\-]\d{3}){3})(?!\d)/g;
  while ((m = grouped.exec(fixed))) {
    const value = (m[1] ?? "").replace(/\D/g, "");
    if (value.length !== 12) continue;
    if (out.some((hit) => hit.value === value && Math.abs(hit.index - (m?.index ?? 0)) < 3)) continue;
    out.push({ value, index: m.index, grouped: true });
  }
  return out;
}

function scoreNss(text: string, hit: NssHit): number {
  const ctx = text.slice(Math.max(0, hit.index - 90), hit.index).toLocaleLowerCase("fr");
  let score = 0;
  if (/immatricul|مسجل|رقم الضمان/.test(ctx)) score += 12;
  if (hit.grouped) score += 2;
  if (/employeur|utilisateur|المستخدم/.test(ctx) && score < 12) score -= 6;
  if (/sous le num/.test(ctx) && !/immatricul/.test(ctx)) score -= 6;
  return score;
}

function pickNss(text: string): string | null {
  const list = nssCandidates(text);
  let best: { value: string; score: number } | null = null;
  for (const hit of list) {
    const score = scoreNss(text, hit);
    if (!best || score > best.score) best = { value: hit.value, score };
  }
  return best?.value ?? null;
}

function badPersonName(lat: string): boolean {
  const words = lat.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.every((w) => SS_NAME_STOP.has(w))) return true;
  return words.some((w) =>
    ["NAISSANCE", "ADRESSE", "ACTE", "IMMATRICULE", "IMMATRICULEE", "ATTESTATION", "EMPLOYEUR"].includes(
      w,
    ),
  );
}

function personScripts(parts: string[]): { ar: string; lat: string } {
  let ar = "";
  let lat = "";
  for (const part of parts) {
    if (part.length > 48 || findDate(part) || /^\d+$/.test(part)) continue;
    if (!ar) {
      const a = cleanArabicName(part);
      if (a.length >= 2) ar = a;
    }
    if (!lat) {
      const l = cleanLatinName(part);
      if (l.length >= 2 && isLatinName(l) && !badPersonName(l)) lat = l;
    }
  }
  return { ar, lat };
}

function parseBirthParts(parts: string[]): {
  date: string | null;
  ar: string;
  lat: string;
  commune: string;
  wilaya: string;
} {
  const joined = parts.join(" ");
  const date = findDate(joined);
  let place = joined
    .replace(/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}/g, " ")
    .replace(/(?:19|20)\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}/g, " ")
    .replace(/\d{1,2}\s*[A-Za-zÀ-ÿ\u0600-\u06FF]{3,12}\s*(?:19|20)\d{2}/g, " ")
    .replace(/(?:^|\s)(?:à|a|au|en)(?=\s|$)/gi, " ")
    .replace(/(?:^|\s)(?:في|بـ|ب)(?=\s|$)/g, " ")
    .split(/depuis\s*le|immatricul|adresse|ابتداء|العنوان|المسجل|d[eé]claration/i)[0] ?? "";
  const wilayaMatch = place.match(
    /(?:ولاية|wilaya)(?:\s*(?:de|الميلاد))?\s*[:\-]?\s*([A-Za-zÀ-ÿ\u0600-\u06FF'’\-\s]+)/i,
  );
  const communeMatch = place.match(
    /(?:بلدية|commune)(?:\s*(?:de|الميلاد))?\s*[:\-]?\s*([A-Za-zÀ-ÿ\u0600-\u06FF'’\-\s]+)/i,
  );
  const wilaya = placeToken(wilayaMatch?.[1] ?? "");
  const commune = placeToken(communeMatch?.[1] ?? "");
  place = place
    .replace(/(?:ولاية|wilaya|بلدية|commune)(?:\s*(?:de|الميلاد))?\s*[:\-]?\s*[A-Za-zÀ-ÿ\u0600-\u06FF'’\-\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const ar = cleanArabicName(place);
  let lat = cleanLatinName(place);
  if (lat.length < 2 || badPersonName(lat) || !isLatinName(lat)) lat = "";
  return { date, ar, lat, commune, wilaya };
}

function placeToken(raw: string): string {
  const lat = cleanLatinName(raw);
  const ar = cleanArabicName(raw);
  if (lat && isLatinName(lat) && !badPersonName(lat)) return lat;
  return ar;
}

function parseActParts(parts: string[]): string | null {
  const joined = fixOcrDigits(parts.join(" "));
  const runs = joined.match(/\d{1,6}/g) ?? [];
  const candidates = runs.filter((d) => d.length <= 5 && !/^(?:19|20)\d{2}$/.test(d));
  const exact = candidates.find((d) => d.length === 5);
  const picked = exact ?? [...candidates].sort((a, b) => b.length - a.length)[0];
  if (!picked) return null;
  return picked.length >= 5 ? picked.slice(0, 5) : picked;
}

function parseAddressParts(parts: string[]): { ar: string; lat: string } {
  let lat = "";
  let ar = "";
  for (const part of parts) {
    const cut = (part.split(/immatricul|depuis\s*le|المسجل|ابتداء/i)[0] ?? part)
      .replace(/\s+/g, " ")
      .trim();
    if (!cut) continue;
    if (hasArabic(cut)) {
      const arabic = cut
        .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
        .replace(/[^\u0600-\u06FF\d\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const latinOnly = cut
        .replace(/[\u0600-\u06FF]/g, " ")
        .replace(/[^\dA-Za-zÀ-ÿ'’\-\s,./°º]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const letters = latinOnly.replace(/[^A-Za-zÀ-ÿ]/g, "");
      if (!ar && arabic.length >= 3) ar = arabic.slice(0, 220);
      if (!lat && letters.length >= 3) lat = latinOnly.toLocaleUpperCase("fr-DZ").slice(0, 220);
      continue;
    }
    const latin = cut
      .replace(/[^\dA-Za-zÀ-ÿ'’\-\s,./°º]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleUpperCase("fr-DZ");
    if (!lat && latin.length >= 3) lat = latin.slice(0, 220);
  }
  return { ar, lat };
}

function slotNeeds(slot: SsSlot, bag: Map<SsSlot, string[]>): boolean {
  const parts = bag.get(slot) ?? [];
  if (!parts.length) return true;
  if (slot === "last" || slot === "first") {
    const { ar, lat } = personScripts(parts);
    return !ar || !lat;
  }
  if (slot === "birth") {
    const birth = parseBirthParts(parts);
    return !birth.date || (!birth.ar && !birth.lat && !birth.commune);
  }
  if (slot === "father" || slot === "mother") {
    const { ar, lat } = personScripts(parts);
    return !ar || !lat;
  }
  if (slot === "address") {
    return !parseAddressParts(parts).lat;
  }
  return false;
}

function joinScripts(parts: string[]): string {
  const { ar, lat } = personScripts(parts);
  if (lat && ar) return `${lat} ${ar}`;
  return lat || ar;
}

function readDigits(text: string, len: number): string | null {
  const source = fixOcrDigits(text);
  const re = /\d[\d\s.\-]{0,48}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const digits = (m[0] ?? "").replace(/\D/g, "");
    if (digits.length === len) return digits;
  }
  const squashed = source.replace(/\D/g, "");
  return squashed.length === len ? squashed : null;
}

function parseMarital(text: string): string | null {
  if (/متزوج|mari[ée]/i.test(text)) return "M";
  if (/أعزب|اعزب|c[ée]libat/i.test(text)) return "C";
  if (/مطلق|divor/i.test(text)) return "D";
  if (/أرمل|ارمل|veuf|veuve/i.test(text)) return "V";
  return null;
}

function parseSexValue(text: string): string | null {
  if (/أنثى|انثى|f[ée]minin|\bfemme\b/i.test(text)) return "F";
  if (/ذكر|masculin|\bhomme\b/i.test(text)) return "M";
  return null;
}

function parseNationality(parts: string[]): string {
  const joined = parts.join(" ");
  if (/alg[ée]r|جزائر/i.test(joined)) return "ALGERIE";
  const { lat, ar } = personScripts(parts);
  return lat || ar;
}

function addSlot(bag: Map<SsSlot, string[]>, slot: SsSlot, parts: string[]) {
  const list = bag.get(slot) ?? [];
  for (const part of parts) {
    const v = part.trim();
    if (!v || list.includes(v)) continue;
    list.push(v);
  }
  if (list.length) bag.set(slot, list);
}

/**
 * Attestation CNAS — tous les champs lisibles, quel que soit l'ordre OCR
 * (ligne « libellé : valeur », valeur avant le libellé, ou colonnes séparées).
 */
function extractSs(text: string): OcrFieldSuggestion[] {
  const out: OcrFieldSuggestion[] = [];
  const lines = prepareSsLines(text).map((textLine) => {
    const hits = ssLabelHits(textLine);
    const valued = slotParts(textLine, hits);
    return {
      text: textLine,
      hits,
      valued,
      labelOnly: hits.length > 0 && valued.length === 0,
      noise: isSsNoise(textLine),
    };
  });

  const bag = new Map<SsSlot, string[]>();
  for (const line of lines) {
    for (const item of line.valued) addSlot(bag, item.slot, item.parts);
  }

  const consumed = new Set<number>();
  let i = 0;
  while (i < lines.length) {
    if (!lines[i]?.labelOnly) {
      i++;
      continue;
    }
    const run: number[] = [];
    let k = i;
    while (k < lines.length && (lines[k]?.labelOnly || lines[k]?.noise)) {
      if (lines[k]?.labelOnly) run.push(k);
      k++;
    }
    if (run.length >= 2) {
      const vals: number[] = [];
      let j = k;
      while (j < lines.length && vals.length < run.length) {
        const ln = lines[j];
        if (!ln || ln.labelOnly || ln.noise || ln.hits.length) break;
        vals.push(j);
        j++;
      }
      if (vals.length === run.length) {
        run.forEach((ri, n) => {
          const slot = lines[ri]?.hits[0]?.slot;
          const value = lines[vals[n] ?? -1]?.text ?? "";
          if (slot && value && slotNeeds(slot, bag)) addSlot(bag, slot, [value]);
          consumed.add(vals[n] ?? -1);
        });
      }
    }
    i = Math.max(k, i + 1);
  }

  for (let n = 0; n < lines.length; n++) {
    const ln = lines[n];
    if (!ln?.labelOnly || ln.hits.length !== 1) continue;
    if (lines[n - 1]?.labelOnly) continue;
    const next = lines[n + 1];
    if (!next || next.hits.length || next.noise || consumed.has(n + 1)) continue;
    const slot = ln.hits[0]?.slot;
    if (!slot || !slotNeeds(slot, bag)) continue;
    addSlot(bag, slot, [next.text]);
    consumed.add(n + 1);
  }

  const full = bag.get("fullName") ?? [];
  const fullParts = full.join(" ").split(/\s*[/|]\s*/);
  const fullLast = fullParts.length >= 2 ? personScripts([fullParts[0] ?? ""]) : { ar: "", lat: "" };
  const fullFirst = fullParts.length >= 2 ? personScripts([fullParts[1] ?? ""]) : { ar: "", lat: "" };
  const last = personScripts(bag.get("last") ?? []);
  const first = personScripts(bag.get("first") ?? []);
  push(out, "last_name", "Nom", last.lat || fullLast.lat, (last.lat || fullLast.lat) ? "high" : "low");
  push(out, "last_name_ar", "Nom AR", last.ar || fullLast.ar, (last.ar || fullLast.ar) ? "high" : "low");
  push(out, "first_name", "Prénom", first.lat || fullFirst.lat, (first.lat || fullFirst.lat) ? "high" : "low");
  push(out, "first_name_ar", "Prénom AR", first.ar || fullFirst.ar, (first.ar || fullFirst.ar) ? "high" : "low");

  const birth = parseBirthParts(bag.get("birth") ?? []);
  push(out, "birth_date", "Date de naissance", birth.date, birth.date ? "high" : "low");
  const commune = birth.commune || placeToken((bag.get("bcom") ?? []).join(" "));
  const wilaya = birth.wilaya || placeToken((bag.get("bwil") ?? []).join(" "));
  const placeBits = [commune || birth.lat || birth.ar, wilaya].filter(Boolean);
  const place = [...new Set(placeBits)].join(", ");
  push(out, "birth_place_fr", "Lieu naissance", place, place ? "high" : "low");
  if (birth.ar && (birth.lat || commune)) {
    push(out, "birth_place_ar", "Lieu naissance AR", birth.ar, "medium");
  }

  const act = parseActParts(bag.get("act") ?? []);
  push(out, "birth_act_no", "N° acte de naissance", act, act ? "high" : "low");

  const civil = [
    ...(bag.get("sex") ?? []),
    ...(bag.get("marital") ?? []),
    ...(bag.get("blood") ?? []),
  ].join(" ");
  const sexCode = parseSexValue(civil) ?? extractSex(text);
  push(out, "sex_code", "Sexe", sexCode, sexCode ? "high" : "low");
  const marital = parseMarital(civil) ?? parseMarital((bag.get("marital") ?? []).join(" "));
  push(out, "marital_code", "Situation", marital, marital ? "high" : "low");
  const blood = normalizeBlood(civil) ?? normalizeBlood((bag.get("blood") ?? []).join(" "));
  push(out, "blood_code", "Groupe sanguin", blood, blood ? "high" : "low");

  push(out, "father_name", "Père", joinScripts(bag.get("father") ?? []), "high");
  push(out, "mother_name", "Mère", joinScripts(bag.get("mother") ?? []), "high");
  const nationality = parseNationality(bag.get("nation") ?? []);
  push(out, "nationality", "Nationalité", nationality, nationality ? "high" : "low");

  const nin = readDigits((bag.get("nin") ?? []).join(" "), 18);
  push(out, "nin", "NIN", nin, nin ? "high" : "low");

  const address = parseAddressParts(bag.get("address") ?? []);
  push(out, "address_fr", "Adresse", address.lat, address.lat ? "high" : "low");

  const labeledNss = pickNss((bag.get("nss") ?? []).join(" "));
  const nss = labeledNss ?? pickNss(text);
  push(out, "nss", "N° NSS", nss, labeledNss ? "high" : nss ? "medium" : "low");

  const account = readDigits((bag.get("rip") ?? []).join(" "), 20);
  push(out, "account_no", "RIP", account, account ? "high" : "low");
  if (account) push(out, "payment_mode_code", "Paiement", "CCP", "high");

  let since = findDate((bag.get("since") ?? []).join(" "));
  let hired =
    findDate((bag.get("hired") ?? []).join(" ")) ??
    findMonthStart((bag.get("hired") ?? []).join(" "));
  if (!hired && since && /depuis\s*le|à\s*compter|a\s*compter|ابتداء/i.test(text)) {
    hired = since;
    if (!/d[eé]claration|التصريح/i.test(text)) since = null;
  }
  let birthDate = birth.date;
  const seenDates = findAllDates(text);
  if (!birthDate && since) {
    const rest = seenDates.filter((d) => d !== since && d !== hired);
    if (rest.length === 1) birthDate = rest[0] ?? null;
  }
  if (!since && birthDate) {
    const rest = seenDates.filter((d) => d !== birthDate && d !== hired);
    if (rest.length === 1) since = rest[0] ?? null;
  }
  if (birthDate && birthDate !== birth.date) {
    push(out, "birth_date", "Date de naissance", birthDate, "medium");
  }
  push(out, "declaration_date", "Déclaration", since, since ? "high" : "low");
  push(out, "hired_at", "Recrutement", hired, hired ? "high" : "low");

  const poste = (bag.get("poste") ?? [])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  push(out, "poste", "Poste", poste, poste ? "high" : "low");

  return out;
}

const SUGGESTION_ORDER = [
  "nss",
  "last_name",
  "first_name",
  "last_name_ar",
  "first_name_ar",
  "birth_date",
  "birth_place_fr",
  "birth_place_ar",
  "birth_act_no",
  "sex_code",
  "marital_code",
  "blood_code",
  "father_name",
  "mother_name",
  "nationality",
  "nin",
  "account_no",
  "payment_mode_code",
  "address_fr",
  "declaration_date",
  "hired_at",
  "poste",
  "commune_birth",
  "id_number",
  "id_issued_on",
  "id_expires_on",
  "id_issued_by",
];

function suggestionKey(code: string, value: string): string {
  if (
    code === "nss" ||
    code === "nin" ||
    code === "birth_act_no" ||
    code === "id_number" ||
    code === "account_no"
  ) {
    return value.replace(/\D/g, "");
  }
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("fr");
}

/** Fusionne plusieurs lectures : un champ lu sur une passe reste, même s'il manque aux autres. */
export function mergeOcrSuggestions(groups: OcrFieldSuggestion[][]): OcrFieldSuggestion[] {
  const rank = { high: 3, medium: 2, low: 1 } as const;
  const buckets = new Map<string, Map<string, { s: OcrFieldSuggestion; score: number }>>();
  for (const group of groups) {
    for (const s of group) {
      const key = suggestionKey(s.code, s.value);
      if (!key) continue;
      let values = buckets.get(s.code);
      if (!values) {
        values = new Map();
        buckets.set(s.code, values);
      }
      const prev = values.get(key);
      if (!prev) values.set(key, { s, score: rank[s.confidence] });
      else {
        prev.score += rank[s.confidence];
        if (rank[s.confidence] > rank[prev.s.confidence]) prev.s = s;
      }
    }
  }
  const out: OcrFieldSuggestion[] = [];
  for (const values of buckets.values()) {
    let best: { s: OcrFieldSuggestion; score: number } | null = null;
    for (const item of values.values()) {
      if (!best || item.score > best.score) best = item;
    }
    if (best) out.push(best.s);
  }
  out.sort((a, b) => {
    const ia = SUGGESTION_ORDER.indexOf(a.code);
    const ib = SUGGESTION_ORDER.indexOf(b.code);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return out;
}

export type OcrWordBox = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

/**
 * Reconstruit les lignes du formulaire selon la position (même rangée = même ligne).
 * Le texte brut de Tesseract sépare souvent les colonnes et fait tomber un champ.
 */
export function linesFromOcrWords(words: OcrWordBox[]): string {
  const items = words.filter((w) => w.text.trim() && w.bbox.y1 > w.bbox.y0);
  if (!items.length) return "";
  const heights = items.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 20;
  const threshold = Math.max(8, median * 0.55);
  const rows: OcrWordBox[][] = [];
  for (const word of [...items].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)) {
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const row = rows.find((group) => {
      const ry =
        group.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / group.length;
      return Math.abs(cy - ry) <= threshold;
    });
    if (row) row.push(word);
    else rows.push([word]);
  }
  return rows
    .map((group) => {
      const arabic = group.filter((w) => hasArabic(w.text)).length;
      const ltr = arabic * 2 < group.length;
      const ordered = [...group].sort((a, b) => (ltr ? a.bbox.x0 - b.bbox.x0 : b.bbox.x0 - a.bbox.x0));
      return ordered.map((w) => w.text.trim()).filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("\n");
}

export function extractFieldsFromOcrText(
  profile: OcrDocProfile,
  rawText: string,
): OcrExtractResult {
  const text = rawText.replace(/\u200f|\u200e/g, " ").replace(/[ \t]+/g, " ");
  if (profile === "SS_REGISTRATION") {
    const affiliation = extractCnasAffiliation(text);
    if (affiliation.matched) {
      return {
        profile,
        rawText: text,
        suggestions: affiliation.suggestions,
        notice: affiliation.notice,
      };
    }
  }
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
