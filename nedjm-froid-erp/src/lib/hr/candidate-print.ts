import type { ContractTerms, IdentityFields } from "@/lib/hr/candidate-cycle";

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function row(label: string, value: string | number | null | undefined): string {
  return `<tr><th>${esc(label)}</th><td>${esc(value) || "—"}</td></tr>`;
}

function page(title: string, version: number, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 28px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 14px; color: #444; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 7px 8px; text-align: left; vertical-align: top; font-size: 13px; }
  th { width: 34%; background: #f4f7fb; font-weight: 600; }
  .sign { margin-top: 28px; display: flex; justify-content: space-between; gap: 24px; }
  .sign div { width: 45%; min-height: 90px; border-top: 1px solid #111; padding-top: 8px; font-size: 12px; }
</style></head><body>
<h1>${esc(title)}</h1>
<p>Version ${version} · spécimen à imprimer et à signer. L'archive est le scan signé, pas ce fichier.</p>
<table>${body}</table>
<div class="sign"><div>Signature du candidat</div><div>Signature de l'employeur</div></div>
</body></html>`;
}

export function candidateFicheHtml(
  person: IdentityFields & { phone?: string | null },
  version: number,
): string {
  return page(
    "Fiche de renseignements — بطاقة معلومات",
    version,
    [
      row("Nom", person.last_name),
      row("Prénom", person.first_name),
      row("اللقب", person.last_name_ar),
      row("الاسم", person.first_name_ar),
      row("NIN", person.nin),
      row("Date de naissance", person.birth_date),
      row("Téléphone", person.phone),
    ].join(""),
  );
}

export function candidateContractHtml(
  person: IdentityFields,
  terms: ContractTerms & { site_name?: string | null; activity_label?: string | null },
  version: number,
): string {
  return page(
    "Contrat de travail — عقد عمل",
    version,
    [
      row("Salarié", `${person.last_name} ${person.first_name}`),
      row("NIN", person.nin),
      row("Date de naissance", person.birth_date),
      row("Site", terms.site_name),
      row("Activité", terms.activity_label),
      row("Type", terms.contract_type_code),
      row("Poste", terms.poste_fr),
      row("Salaire de base mensuel (DZD)", terms.salaire_base_monthly),
      row("Début", terms.contract_start),
      row("Fin", terms.contract_end),
    ].join(""),
  );
}
