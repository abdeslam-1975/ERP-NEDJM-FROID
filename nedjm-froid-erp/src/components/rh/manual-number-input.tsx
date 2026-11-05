"use client";

import type { ClipboardEvent, KeyboardEvent } from "react";

export const MANUAL_NUMBER_CONFIRM =
  "Ce numéro est attribué automatiquement.\nConfirmez pour le saisir à la main.\n\nهذا الرقم يُمنح تلقائياً.\nأكد لإدخاله يدوياً.";

export function numbersMatch(a: string, b: string) {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** True when `value` is already stored on another record. */
export function numberTaken(value: string, taken: readonly string[], own = "") {
  const typed = value.trim();
  if (!typed) return false;
  return taken.some((item) => numbersMatch(item, typed) && !numbersMatch(item, own));
}

/**
 * Read-only automatic number. The first attempt to type or paste asks for confirmation,
 * then the field accepts a manual value.
 */
export function ManualNumberInput({
  value,
  onChange,
  manual,
  onManual,
  taken,
  own = "",
  className,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  manual: boolean;
  onManual: () => void;
  taken: readonly string[];
  own?: string;
  className: string;
  /** An existing document keeps its number. */
  readOnly?: boolean;
}) {
  const duplicate = manual && numberTaken(value, taken, own);

  function ask(event: KeyboardEvent<HTMLInputElement> | ClipboardEvent<HTMLInputElement>) {
    if (readOnly || manual) return;
    const key = "key" in event ? event.key : "";
    const typing = "clipboardData" in event || key.length === 1 || key === "Backspace" || key === "Delete";
    if (!typing) return;
    event.preventDefault();
    if (!window.confirm(MANUAL_NUMBER_CONFIRM)) return;
    onManual();
  }

  return (
    <div>
      <input
        className={className}
        value={readOnly ? value || "—" : value}
        readOnly={readOnly || !manual}
        placeholder={readOnly ? undefined : "Automatique"}
        title={manual ? "Numéro manuel · رقم يدوي" : "Attribué automatiquement · يُمنح تلقائياً"}
        onKeyDown={ask}
        onPaste={ask}
        onChange={(event) => onChange(event.target.value)}
      />
      {duplicate ? (
        <p className="mt-1 text-xs text-red-600">Ce numéro est déjà utilisé. · هذا الرقم مستعمل مسبقاً</p>
      ) : null}
    </div>
  );
}
