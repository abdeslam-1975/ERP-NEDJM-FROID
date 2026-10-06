/** Dates and amounts as printed on HR documents. */

export function slashDateIso(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "");
}

export function formatAmount(n: number) {
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  const [int, dec] = fixed.split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${dec}`;
}

const FR_UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize",
];
const FR_TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

function frBelow100(n: number, final: boolean): string {
  if (n < 17) return FR_UNITS[n];
  if (n < 20) return `dix-${FR_UNITS[n - 10]}`;
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7) return n === 71 ? "soixante et onze" : `soixante-${frBelow100(n - 60, final)}`;
  if (t === 9) return `quatre-vingt-${frBelow100(n - 80, final)}`;
  if (t === 8) return u === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${FR_UNITS[u]}`;
  if (u === 0) return FR_TENS[t];
  if (u === 1) return `${FR_TENS[t]} et un`;
  return `${FR_TENS[t]}-${FR_UNITS[u]}`;
}

function frBelow1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? "cent" : `${FR_UNITS[h]} ${r === 0 && final ? "cents" : "cent"}`);
  if (r) parts.push(frBelow100(r, final));
  return parts.join(" ");
}

/** French cardinal (orthographe traditionnelle), up to 999 999 999 999. */
export function frenchNumberWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "zéro";
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor(n / 1e6) % 1000;
  const milliers = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  const parts: string[] = [];
  if (milliards) parts.push(`${frBelow1000(milliards, true)} ${milliards > 1 ? "milliards" : "milliard"}`);
  if (millions) parts.push(`${frBelow1000(millions, true)} ${millions > 1 ? "millions" : "million"}`);
  if (milliers) parts.push(milliers === 1 ? "mille" : `${frBelow1000(milliers, false)} mille`);
  if (rest) parts.push(frBelow1000(rest, true));
  return parts.join(" ");
}

export function frenchAmountWords(value: number): string {
  const abs = Math.abs(Math.round(value * 100) / 100);
  const dinars = Math.floor(abs);
  const cents = Math.round((abs - dinars) * 100);
  let out = `${frenchNumberWords(dinars)} ${dinars > 1 ? "dinars algériens" : "dinar algérien"}`;
  if (cents) out += ` et ${frenchNumberWords(cents)} ${cents > 1 ? "centimes" : "centime"}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
