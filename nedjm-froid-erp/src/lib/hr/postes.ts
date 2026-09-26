/** Unique poste code (A-Z, 0-9, _ ; 2–20 chars) derived from a job title. */
export function posteCodeFromLabel(label: string, taken: Set<string>) {
  const base =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 16) || "POSTE";
  const root = base.length >= 2 ? base : `P_${base}`;
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i += 1) {
    const code = `${root.slice(0, 16)}_${i}`;
    if (!taken.has(code)) return code;
  }
  return `P_${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
}
