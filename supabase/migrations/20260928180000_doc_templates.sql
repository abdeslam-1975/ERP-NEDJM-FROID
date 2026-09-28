-- Editable document templates (HTML + CSS with data-* directives), versioned: one draft per document,
-- approved versions are immutable and the latest approved version is the one printed.

begin;

create table if not exists public.doc_templates (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null,
  version integer,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  html text not null,
  note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  constraint doc_templates_version_ck check ((status = 'approved') = (version is not null))
);

create unique index if not exists doc_templates_draft_uq on public.doc_templates (doc_type) where status = 'draft';
create unique index if not exists doc_templates_version_uq on public.doc_templates (doc_type, version) where status = 'approved';

drop trigger if exists trg_doc_templates_u on public.doc_templates;
create trigger trg_doc_templates_u before update on public.doc_templates
  for each row execute function public.erp_set_updated_at();

alter table public.doc_templates enable row level security;

drop policy if exists doc_templates_read on public.doc_templates;
create policy doc_templates_read on public.doc_templates
  for select to authenticated using (true);

drop policy if exists doc_templates_insert on public.doc_templates;
create policy doc_templates_insert on public.doc_templates
  for insert to authenticated
  with check (status = 'draft' and public.erp_has_perm('hr_settings', 'update', null));

drop policy if exists doc_templates_update on public.doc_templates;
create policy doc_templates_update on public.doc_templates
  for update to authenticated
  using (status = 'draft' and public.erp_has_perm('hr_settings', 'update', null))
  with check (public.erp_has_perm('hr_settings', 'update', null));

drop policy if exists doc_templates_delete on public.doc_templates;
create policy doc_templates_delete on public.doc_templates
  for delete to authenticated
  using (status = 'draft' and public.erp_has_perm('hr_settings', 'update', null));

grant select, insert, update, delete on public.doc_templates to authenticated;

create or replace function public.doc_template_approve(p_doc_type text, p_note text default null)
returns public.doc_templates
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.doc_templates;
  v integer;
begin
  if not public.erp_has_perm('hr_settings', 'update', null) then
    raise exception 'Droits insuffisants pour approuver un modèle.';
  end if;
  perform pg_advisory_xact_lock(hashtext('doc_templates:' || p_doc_type));
  select coalesce(max(version), 0) + 1 into v
  from public.doc_templates
  where doc_type = p_doc_type and status = 'approved';
  update public.doc_templates
  set status = 'approved',
      version = v,
      approved_by = auth.uid(),
      approved_at = now(),
      note = coalesce(nullif(trim(p_note), ''), note)
  where doc_type = p_doc_type and status = 'draft'
  returning * into r;
  if r.id is null then
    raise exception 'Aucun brouillon à approuver.';
  end if;
  return r;
end;
$$;

grant execute on function public.doc_template_approve(text, text) to authenticated;

comment on table public.doc_templates is
  'Modèles de documents imprimés (HTML/CSS + directives data-*). Brouillon unique par document, versions approuvées immuables.';

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'bulletin_paie', 1, 'approved', $bulletin_paie$<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>BULLETIN DE PAIE</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
    .page {
      width: 210mm;
      min-height: 297mm;
      position: relative;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    .letterhead-img {
      position: absolute;
      inset: 0;
      width: 210mm;
      height: 297mm;
      z-index: 0;
      object-fit: fill;
    }
    .sheet { position: relative; z-index: 1; }
    @media print {
      html, body, .letterhead-img {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    h1 {
      display: inline-block;
      font-family: "Times New Roman", Times, serif;
      font-size: 22px;
      font-style: italic;
      font-weight: 800;
      margin: 2mm 16mm 5mm 0;
    }
    .mat { display: inline-block; font-size: 12px; vertical-align: 7px; }
    .mat b { font-size: 13px; }
    .boxes { display: grid; grid-template-columns: 1.08fr 0.92fr; gap: 5mm; }
    .box { border: 1px solid #000; border-radius: 11px; padding: 2mm 3.2mm 2.4mm; min-height: 28mm; }
    .box .row { margin: 0.55mm 0; line-height: 1.35; }
    .box .k { display: inline-block; min-width: 36mm; }
    .box .v { font-weight: 700; }
    .period { margin: 3.2mm 0 2mm; font-size: 12px; }
    .frame { border-radius: 8px; overflow: hidden; margin-bottom: 3mm; }
    table.lines { width: 100%; border-collapse: collapse; }
    table.lines th, table.lines td { border: 1px solid #000; padding: 1.1mm 1.4mm; text-align: center; vertical-align: middle; }
    table.lines th { font-weight: 700; }
    table.lines td.num, table.lines th.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
    table.lines td.code { width: 11mm; }
    table.lines .gain, table.lines .ret { width: 24mm; }
    .totaux {
      display: grid;
      grid-template-columns: 1fr 24mm 24mm;
      margin: 0 0 2.4mm;
      font-weight: 700;
      text-align: center;
      align-items: center;
    }
    .net-row { margin: 1mm 0 4mm; text-align: right; font-weight: 700; }
    .net-amt {
      display: inline-block;
      border: 1px solid #000;
      border-radius: 14px;
      padding: 1.1mm 6mm;
      min-width: 34mm;
      text-align: center;
      font-size: 13px;
      margin-left: 4mm;
    }
    table.mv, table.foot, table.pay { width: 100%; border-collapse: collapse; }
    table.mv th, table.mv td, table.foot th, table.foot td, table.pay th, table.pay td {
      border: 1px solid #000; padding: 1.15mm 1.6mm; text-align: center; vertical-align: middle;
    }
    table.mv th, table.foot th, table.pay th { font-weight: 700; }
    table.pay { width: 78%; }
    table.pay th { width: 28mm; }
    .num { font-variant-numeric: tabular-nums; }
    .regime { margin: -1.5mm 0 3mm; font-size: 9px; text-align: center; }
  </style>
</head>
<body><div class="page" data-each="pages">
    <img class="letterhead-img" src="" data-attr-src="letterhead" alt="">
    <div class="sheet" style="padding:32.5mm 16mm 28mm 16mm">
    <h1>BULLETIN DE PAIE</h1>
    <span class="mat">Matricule : <b data-field="matricule"></b></span>
    <div class="boxes">
      <div class="box"><div class="row"><span class="k">Employé :</span> <span class="v" data-field="values.employee_name"></span></div><div class="row"><span class="k">Fonction :</span> <span class="v" data-field="values.fonction"></span></div><div class="row"><span class="k">Affectation :</span> <span class="v" data-field="values.affectation"></span></div><div class="row"><span class="k">Date d'entrée :</span> <span class="v" data-field="values.hired_at"></span></div><div class="row"><span class="k">N°SS :</span> <span class="v" data-field="values.nss"></span></div></div>
      <div class="box"><div class="row"><span class="k">Date de Naissance :</span> <span class="v" data-field="values.birth_date"></span></div><div class="row"><span class="k">Situation Familiale :</span> <span class="v" data-field="values.marital_code"></span></div><div class="row"><span class="k">Résidence :</span> <span class="v" data-field="values.residence"></span></div><div class="row"><span class="k">Catégorie :</span> <span class="v" data-field="values.category"></span></div></div>
    </div>
    <div class="period">Période : <b data-field="period_text"></b></div>
    <div class="frame">
    <table class="lines">
      <thead>
        <tr>
          <th>Code</th>
          <th>Intitulé</th>
          <th class="num">Nombre / Base</th>
          <th class="num">Taux</th>
          <th class="num">Gain</th>
          <th class="num">Retenue</th>
        </tr>
      </thead>
      <tbody><tr data-each="lines">
        <td class="code" data-field="code"></td>
        <td data-field="label"></td>
        <td class="num" data-field="nombre" data-format="da"></td>
        <td class="num"><span data-bare data-if="!hide_taux"><span data-bare data-field="taux" data-format="da"></span><span data-bare data-field="taux_suffix"></span></span></td>
        <td class="num gain"><span data-bare data-if="gain != null"><span data-bare data-field="gain" data-format="da"></span><span data-bare data-field="units.da"></span></span></td>
        <td class="num ret"><span data-bare data-if="retenue != null"><span data-bare data-field="retenue" data-format="da"></span><span data-bare data-field="units.da"></span></span></td>
      </tr></tbody>
    </table>
    </div>
    <div class="totaux">
      <span>Totaux</span>
      <span><span data-bare data-field="total_gain" data-format="da"></span><span data-bare data-field="units.da"></span></span>
      <span><span data-bare data-field="total_retenue" data-format="da"></span><span data-bare data-field="units.da"></span></span>
    </div>
    <div class="net-row">Net à Payer <span class="net-amt"><span data-bare data-field="net_payable" data-format="da"></span><span data-bare data-field="units.da"></span></span></div>
    <div class="frame">
    <table class="mv">
      <thead>
        <tr>
          <th colspan="4">Mouvements du Mois &quot;Nombre Jours&quot;</th>
          <th colspan="2">Charges</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Travaillés</td><td class="num" data-field="days_worked" data-format="da0"></td>
          <td>Abandonnement de Poste</td><td class="num" data-field="days_abandon" data-format="da0"></td>
          <td>Salariales</td><td class="num" data-field="charges_salariales" data-format="da"></td>
        </tr>
        <tr>
          <td>Rappel Salaire</td><td class="num" data-field="days_rappel" data-format="da0"></td>
          <td>Congés</td><td class="num" data-field="days_leave" data-format="da0"></td>
          <td>Patronales</td><td class="num" data-field="charges_patronales" data-format="da"></td>
        </tr>
        <tr>
          <td>Week-End et Fériés du Mois</td><td class="num" data-field="days_weekend" data-format="da0"></td>
          <td>Absences</td><td class="num" data-field="days_absence" data-format="da0"></td>
          <td>Totales</td><td class="num" data-field="charges_totales" data-format="da"></td>
        </tr>
        <tr>
          <td colspan="4"></td>
          <td>Coût Global</td><td class="num" data-field="cout_global" data-format="da"></td>
        </tr>
      </tbody>
    </table>
    </div>
    <div class="frame">
    <table class="foot">
      <thead><tr><th>Base Cotisable</th><th data-if="rates.ss_pct > 0 || employee_ss > 0">C.S.S. Salariale <span data-bare data-field="rates.ss_pct" data-format="num"></span>%</th><th data-if="rates.pat_pct > 0 || employer_ss > 0">C.S.S. Patronale <span data-bare data-field="rates.pat_pct" data-format="num"></span>%</th><th data-if="rates.fos_pct > 0 || fos_amount > 0">FOS <span data-bare data-field="rates.fos_pct" data-format="num"></span>%</th><th data-if="rates.caco_pct > 0 || cacobatph > 0">Congés Annuels <span data-bare data-field="rates.caco_pct" data-format="num"></span>%</th><th data-if="rates.intemp_sal_pct > 0 || intemperies_employee > 0">Intempéries sal. <span data-bare data-field="rates.intemp_sal_pct" data-format="num"></span>%</th><th data-if="rates.intemp_pat_pct > 0 || intemperies_employer > 0">Intempéries pat. <span data-bare data-field="rates.intemp_pat_pct" data-format="num"></span>%</th><th>Base IRG</th><th>IRG</th></tr></thead>
      <tbody><tr><td data-field="base_cotisable" data-format="da"></td><td data-if="rates.ss_pct > 0 || employee_ss > 0" data-field="employee_ss" data-format="da"></td><td data-if="rates.pat_pct > 0 || employer_ss > 0" data-field="employer_ss" data-format="da"></td><td data-if="rates.fos_pct > 0 || fos_amount > 0" data-field="fos_amount" data-format="da"></td><td data-if="rates.caco_pct > 0 || cacobatph > 0" data-field="cacobatph" data-format="da"></td><td data-if="rates.intemp_sal_pct > 0 || intemperies_employee > 0" data-field="intemperies_employee" data-format="da"></td><td data-if="rates.intemp_pat_pct > 0 || intemperies_employer > 0" data-field="intemperies_employer" data-format="da"></td><td data-field="irg_base" data-format="da"></td><td data-field="irg_amount" data-format="da"></td></tr></tbody>
    </table>
    </div>
    <div class="regime" data-if="compliance">IRG : <span data-bare data-field="compliance.irg"></span> · CNAS : <span data-bare data-field="compliance.cnas"></span> · CACOBATPH : <span data-bare data-field="compliance.cacobatph"></span></div>
    <div class="frame">
    <table class="pay">
      <tr>
        <th>Paiement</th><td data-field="payment_mode"></td>
        <th>Le</th><td data-field="payment_date"></td>
      </tr>
      <tr><th>C.C.P N°</th><td colspan="3" data-field="account_no"></td></tr>
    </table>
    </div>
  </div></div></body>
</html>$bulletin_paie$, 'Version initiale — identique à l''impression actuelle', now()
where not exists (
  select 1 from public.doc_templates where doc_type = 'bulletin_paie' and status = 'approved'
);

commit;
