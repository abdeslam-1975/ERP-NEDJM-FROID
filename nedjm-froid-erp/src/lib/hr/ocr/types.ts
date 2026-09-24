/** Types OCR Fiche Employé — suggestions seulement, pas d'écriture DB. */

export const OCR_DOC_PROFILES = ["CNI", "BIRTH", "SS_REGISTRATION"] as const;
export type OcrDocProfile = (typeof OCR_DOC_PROFILES)[number];

export type OcrFieldSuggestion = {
  code: string;
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
};

export type OcrExtractResult = {
  profile: OcrDocProfile;
  rawText: string;
  suggestions: OcrFieldSuggestion[];
};

export function isOcrDocProfile(code: string): code is OcrDocProfile {
  return (OCR_DOC_PROFILES as readonly string[]).includes(code);
}
