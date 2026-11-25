/** A month in which a signed-in user saved an employee card that contains an Arabic name. */
export type CardPeriod = {
  field: "card";
  /** `YYYY-MM` in Africa/Algiers. */
  value: string;
};

export type SentenceFacet = {
  field: string;
  hint: string;
};

export type InterpretedSentence = {
  status: "ready";
  period: { year: number; month: number | null } | null;
  anyCard: boolean;
  facets: SentenceFacet[];
  matricules: string[];
  words: string[];
  label: string;
};

const MONTHS: { month: number; names: string[] }[] = [
  { month: 1, names: ["يناير", "جانفي", "janvier"] },
  { month: 2, names: ["فبراير", "فيفري", "fevrier"] },
  { month: 3, names: ["مارس", "mars"] },
  { month: 4, names: ["ابريل", "افريل", "avril"] },
  { month: 5, names: ["ماي", "مايو", "mai"] },
  { month: 6, names: ["جوان", "يونيو", "juin"] },
  { month: 7, names: ["جويليه", "يوليو", "juillet"] },
  { month: 8, names: ["اوت", "اغسطس", "aout"] },
  { month: 9, names: ["سبتمبر", "septembre"] },
  { month: 10, names: ["اكتوبر", "octobre"] },
  { month: 11, names: ["نوفمبر", "novembre"] },
  { month: 12, names: ["ديسمبر", "decembre"] },
];

const MONTH_LABELS = [
  "",
  "يناير",
  "فيفري",
  "مارس",
  "أفريل",
  "ماي",
  "جوان",
  "جويلية",
  "أوت",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const CARD_VERBS = ["انجز", "منجز", "انجاز", "تعديل", "عدل", "معدل", "حفظ", "سجل", "achev", "realis", "termin", "modif"];
const STOPWORDS = new Set([
  "في", "من", "على", "الى", "عن", "مع", "هذا", "هذه", "ذلك", "تلك", "التي", "الذي", "الذين", "اللواتي",
  "كل", "جميع", "فقط", "قد", "تم", "لقد", "اريد", "اظهر", "اعرض", "ابحث", "جد", "هات", "اعطني", "ارجو",
  "ممكن", "رجاء", "بطاقه", "بطاقات", "عامل", "عمال", "موظف", "موظفين", "شخص", "اشخاص", "شهر", "سنه", "عام",
  "خلال", "لدي", "عندي", "لهم", "لها", "هو", "هي", "ثم", "بعد", "قبل", "خاصه", "خاصتي", "حسابي", "لي", "انا",
  "او", "كان", "كانت", "كنت", "قمت", "قم", "حول", "بخصوص", "فيما", "يخص", "عند", "عندما", "لما", "كي", "حتى",
  "بين", "ايضا", "كذلك", "فضلك", "سمحت", "هؤلاء", "اولئك", "هناك", "هنا", "منذ", "ضمن", "ضد", "اليوميه", "رقم",
  "afficher", "montrer", "chercher", "trouver", "employe", "employes", "salarie", "salaries", "carte", "cartes",
  "fiche", "fiches", "mois", "annee", "pour", "dans", "avec", "entre", "vers", "chez", "les", "des", "une", "un",
  "qui", "que", "dont", "donc", "est", "sont", "ete", "etre", "avoir", "pas", "plus", "merci", "veux", "veut",
  "voudrais", "svp", "je", "tu", "il", "elle", "nous", "vous", "mon", "ma", "mes", "son", "sa", "ses", "ce", "cet",
  "cette", "ces", "au", "aux", "du", "de", "la", "le", "et", "ou", "par", "sur", "sous",
]);

const EASTERN_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

export function normalizeSentence(value: string): string {
  const western = value.replace(/[٠-٩]/g, (digit) => EASTERN_DIGITS[digit] ?? digit);
  return western
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bare(token: string): string {
  if (token.startsWith("وال") || token.startsWith("بال")) return token.slice(3);
  if (token.startsWith("لل") || token.startsWith("ال")) return token.slice(2);
  return token;
}

function starts(token: string, stem: string): boolean {
  return bare(token).startsWith(stem);
}

function hasStem(tokens: string[], stems: string[]): boolean {
  return tokens.some((token) => stems.some((stem) => starts(token, stem)));
}

type When = { year: number; month: number | null };

function zoned(date: Date): { year: number; month: number } {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [year, month] = formatted.split("-").map(Number);
  return { year, month };
}

function shiftMonth(year: number, month: number, delta: number): When {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function consumePhrase(text: string, phrases: string[]): { text: string; found: boolean } {
  for (const phrase of phrases) {
    const needle = normalizeSentence(phrase);
    if (!needle || !text.includes(needle)) continue;
    return { text: text.replace(needle, " ").replace(/\s+/g, " ").trim(), found: true };
  }
  return { text, found: false };
}

function relativePeriod(text: string, now: Date): { text: string; period: When | null } {
  const today = zoned(now);
  const yesterday = zoned(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const lastWeek = zoned(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const groups: { phrases: string[]; period: When }[] = [
    { phrases: ["الاسبوع الماضي", "semaine derniere", "semaine passee"], period: lastWeek },
    { phrases: ["هذا الاسبوع", "الاسبوع الحالي", "cette semaine"], period: today },
    { phrases: ["الشهر الماضي", "mois dernier", "mois passe"], period: shiftMonth(today.year, today.month, -1) },
    { phrases: ["هذا الشهر", "الشهر الحالي", "ce mois"], period: today },
    { phrases: ["اليوم", "aujourdhui"], period: today },
    { phrases: ["امس", "hier"], period: yesterday },
    { phrases: ["هذه السنه", "السنه الحاليه", "cette annee"], period: { year: today.year, month: null } },
  ];
  const rest = text;
  for (const group of groups) {
    const consumed = consumePhrase(rest, group.phrases);
    if (!consumed.found) continue;
    return { text: consumed.text, period: group.period };
  }
  return { text, period: null };
}

function monthOf(token: string): number | null {
  const name = bare(token);
  return MONTHS.find((entry) => entry.names.includes(name))?.month ?? null;
}

function facetLabel(facet: SentenceFacet): string {
  const labels: Record<string, string> = {
    "statut:actif": "نشط",
    "statut:inactif": "غير نشط",
    "manque:nss": "بدون ضمان",
    "manque:nin": "بدون NIN",
    "manque:contrat": "بدون عقد",
    "documents:all": "كل الوثائق",
    "documents:required": "الوثائق الإجبارية",
    "documents:missing": "وثائق ناقصة",
    "champs:all": "كل الحقول",
    "champs:required": "الحقول الإجبارية",
    "champs:missing": "حقول ناقصة",
    "retour:retour": "عودة",
  };
  return labels[`${facet.field}:${facet.hint}`] ?? (facet.field === "annee" ? `توظيف ${facet.hint}` : facet.hint);
}

/**
 * Reads whatever constraints a sentence contains, in any order.
 * Returns null when the text is an ordinary search with no sentence words to ignore.
 */
export function interpretSentence(input: string, now = new Date()): InterpretedSentence | { status: "pending" } | null {
  const matricules: string[] = [];
  const withoutMatricule = input.replace(/\d+\s*\/\s*\d{2,4}/g, (found) => {
    const [left, right] = found.replace(/\s+/g, "").split("/");
    const monthNumber = Number(left);
    const otherMonth = Number(right);
    const date =
      (/^20\d{2}$/.test(right) && monthNumber >= 1 && monthNumber <= 12) ||
      (/^20\d{2}$/.test(left) && otherMonth >= 1 && otherMonth <= 12);
    if (date) return found;
    matricules.push(found.replace(/\s+/g, ""));
    return " ";
  });
  const relative = relativePeriod(normalizeSentence(withoutMatricule), now);
  const tokens = relative.text ? relative.text.split(" ") : [];
  if (!tokens.length && !matricules.length && !relative.period) return null;

  let namedMonth: number | null = null;
  let year: number | null = null;
  const used = new Set<number>();
  tokens.forEach((token, index) => {
    const month = monthOf(token);
    if (month && namedMonth == null) {
      namedMonth = month;
      used.add(index);
    }
    if (/^20\d{2}$/.test(token) && year == null) {
      year = Number(token);
      used.add(index);
    }
  });
  let month = namedMonth;
  if (!month && year != null) {
    const yearIndex = tokens.findIndex((token) => token === String(year));
    for (const neighbor of [tokens[yearIndex - 1], tokens[yearIndex + 1]]) {
      if (!neighbor || !/^\d{1,2}$/.test(neighbor)) continue;
      const value = Number(neighbor);
      if (value < 1 || value > 12) continue;
      month = value;
      used.add(tokens.indexOf(neighbor));
      break;
    }
  }

  if (namedMonth && year == null && !relative.period) return { status: "pending" };

  const hireYear = month == null && year != null && hasStem(tokens, ["توظيف", "وظف", "embauche", "recrut"]);
  let period: When | null = null;
  if (month != null && year != null) period = { year, month };
  else if (relative.period) period = relative.period;

  const facets: SentenceFacet[] = [];
  const pushFacet = (facet: SentenceFacet, indexes: number[]) => {
    if (!facets.some((item) => item.field === facet.field && item.hint === facet.hint)) facets.push(facet);
    indexes.forEach((index) => used.add(index));
  };

  const absence = new Set(["بدون", "بلا", "sans", "manque", "non", "غير"]);
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (used.has(index) || !absence.has(bare(tokens[index]))) continue;
    const next = bare(tokens[index + 1]);
    if (starts(tokens[index + 1], "نشط") || starts(tokens[index + 1], "actif")) pushFacet({ field: "statut", hint: "inactif" }, [index, index + 1]);
    else if (next.startsWith("ضمان") || next === "nss") pushFacet({ field: "manque", hint: "nss" }, [index, index + 1]);
    else if (next === "nin") pushFacet({ field: "manque", hint: "nin" }, [index, index + 1]);
    else if (next.startsWith("عقد") || next.startsWith("contrat")) pushFacet({ field: "manque", hint: "contrat" }, [index, index + 1]);
  }

  tokens.forEach((token, index) => {
    if (used.has(index)) return;
    if (starts(token, "متوقف") || starts(token, "موقوف") || starts(token, "inactif") || starts(token, "inactive")) {
      pushFacet({ field: "statut", hint: "inactif" }, [index]);
    } else if (starts(token, "نشط") || starts(token, "actif") || starts(token, "active")) {
      pushFacet({ field: "statut", hint: "actif" }, [index]);
    } else if (starts(token, "عود") || starts(token, "retour")) {
      pushFacet({ field: "retour", hint: "retour" }, [index]);
    }
  });

  const subject = (stems: string[], field: "documents" | "champs") => {
    if (!hasStem(tokens, stems)) return;
    const indexes = tokens.flatMap((token, index) => (stems.some((stem) => starts(token, stem)) ? [index] : []));
    if (hasStem(tokens, ["ناقص", "incomplet"])) {
      pushFacet({ field, hint: "missing" }, indexes.concat(tokens.flatMap((token, index) => (starts(token, "ناقص") || starts(token, "incomplet") ? [index] : []))));
    } else if (hasStem(tokens, ["اجباري", "obligatoire"])) {
      pushFacet({ field, hint: "required" }, indexes.concat(tokens.flatMap((token, index) => (starts(token, "اجباري") || starts(token, "obligatoire") ? [index] : []))));
    } else if (hasStem(tokens, ["مكتمل", "ممتل", "كامل", "tous"])) {
      pushFacet({ field, hint: "all" }, indexes.concat(tokens.flatMap((token, index) => (["مكتمل", "ممتل", "كامل", "tous"].some((stem) => starts(token, stem)) ? [index] : []))));
    }
  };
  subject(["وثا", "وثيق", "document"], "documents");
  subject(["حقل", "champ"], "champs");

  if (hireYear && year != null) pushFacet({ field: "annee", hint: String(year) }, tokens.flatMap((token, index) => (/^20\d{2}$/.test(token) || ["توظيف", "وظف", "embauche", "recrut"].some((stem) => starts(token, stem)) ? [index] : [])));

  let verb: "completed" | "modified" | null = null;
  tokens.forEach((token, index) => {
    if (used.has(index) || !CARD_VERBS.some((stem) => starts(token, stem))) return;
    used.add(index);
    if (!verb) verb = starts(token, "تعديل") || starts(token, "عدل") || starts(token, "معدل") || starts(token, "modif") ? "modified" : "completed";
  });

  const words = tokens.filter((token, index) => {
    if (used.has(index)) return false;
    const value = bare(token);
    if (STOPWORDS.has(value) || value.length <= 2) return false;
    return true;
  });
  const removedFiller = words.length + used.size < tokens.length;
  const anyCard = Boolean(verb) && !period;
  if (!period && !anyCard && !facets.length && !matricules.length) {
    if (!removedFiller || !words.length) return null;
  }

  const parts: string[] = [];
  if (period?.month) {
    const when = `${MONTH_LABELS[period.month]} ${period.year}`;
    parts.push(verb === "modified" ? `عُدّلت : ${when}` : verb === "completed" ? `أنجزتها : ${when}` : when);
  } else if (period) parts.push(String(period.year));
  else if (anyCard) parts.push("البطاقات المسجّلة");
  facets.forEach((facet) => parts.push(facetLabel(facet)));
  matricules.forEach((matricule) => parts.push(matricule));
  words.forEach((word) => parts.push(word));

  return {
    status: "ready",
    period,
    anyCard,
    facets,
    matricules,
    words,
    label: parts.join(" · "),
  };
}

export function cardPeriodMatches(periods: CardPeriod[] | undefined, period: { year: number; month: number | null }): boolean {
  return (periods ?? []).some((item) => {
    if (item.field !== "card") return false;
    if (!period.month) return item.value.startsWith(`${period.year}-`);
    return item.value === `${period.year}-${String(period.month).padStart(2, "0")}`;
  });
}
