export const PERM_FIELDS = ["can_read", "can_create", "can_update", "can_delete", "can_print", "can_export"] as const;
export type PermField = (typeof PERM_FIELDS)[number];

export const PERM_LABELS: Record<PermField, string> = {
  can_read: "Lire",
  can_create: "Créer",
  can_update: "Modifier",
  can_delete: "Supprimer",
  can_print: "Imprimer",
  can_export: "Exporter",
};

/** Any right implies read; removing read removes every right. */
export function permissionPatch(field: PermField, value: boolean): Partial<Record<PermField, boolean>> {
  const patch: Partial<Record<PermField, boolean>> = { [field]: value };
  if (value && field !== "can_read") patch.can_read = true;
  if (!value && field === "can_read") for (const f of PERM_FIELDS) patch[f] = false;
  return patch;
}
