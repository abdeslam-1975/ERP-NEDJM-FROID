-- Bulletin de paie layout (GAS / chine01) stored in DB, edited from RH UI.

begin;

create table if not exists public.hr_bulletin_settings (
  id uuid primary key,
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_hr_bulletin_settings_u on public.hr_bulletin_settings;
create trigger trg_hr_bulletin_settings_u before update on public.hr_bulletin_settings
  for each row execute function public.erp_set_updated_at();

alter table public.hr_bulletin_settings enable row level security;

drop policy if exists hr_bulletin_settings_read on public.hr_bulletin_settings;
create policy hr_bulletin_settings_read on public.hr_bulletin_settings
  for select to authenticated using (true);

drop policy if exists hr_bulletin_settings_write on public.hr_bulletin_settings;
create policy hr_bulletin_settings_write on public.hr_bulletin_settings
  for all to authenticated
  using (public.erp_has_perm('hr_settings','update', null))
  with check (public.erp_has_perm('hr_settings','update', null));

grant select, insert, update, delete on public.hr_bulletin_settings to authenticated;

insert into public.hr_bulletin_settings (id, layout)
values (
  '00000000-0000-0000-0000-000000000002',
  $layout$
  {
    "title": "BULLETIN DE PAIE",
    "matricule_label": "Matricule :",
    "period_label": "Période :",
    "identity_left": [
      {"label": "Employé :", "field": "employee_name"},
      {"label": "Fonction :", "field": "fonction"},
      {"label": "Affectation :", "field": "affectation"},
      {"label": "Date d'entrée :", "field": "hired_at"},
      {"label": "N°SS :", "field": "nss"}
    ],
    "identity_right": [
      {"label": "Date de Naissance :", "field": "birth_date"},
      {"label": "Situation Familiale :", "field": "marital_code"},
      {"label": "Résidence :", "field": "residence"},
      {"label": "Catégorie :", "field": "category"}
    ],
    "col_code": "Code",
    "col_intitule": "Intitulé",
    "col_nombre": "Nombre",
    "col_taux": "Taux",
    "col_gain": "Gain",
    "col_retenue": "Retenue",
    "totaux_label": "Totaux",
    "net_label": "Net à Payer",
    "movements_title": "Mouvements du Mois \"Nombre Jours\"",
    "charges_title": "Charges",
    "label_worked": "Travaillés",
    "label_rappel": "Rappel Salaire",
    "label_weekend": "Week-End et Fériés du Mois",
    "label_abandon": "Abandonnement de Poste",
    "label_leave": "Congés",
    "label_absence": "Absences",
    "label_salariales": "Salariales",
    "label_patronales": "Patronales",
    "label_totales": "Totales",
    "label_cout": "Coût Global",
    "footer_base": "Base Cotisable",
    "footer_css_sal": "C.S.S. Salariale {pct}%",
    "footer_css_pat": "C.S.S. Patronale {pct}%",
    "footer_caco": "Congés Annuels {pct}%",
    "footer_irg_base": "Base IRG",
    "footer_irg": "IRG",
    "payment_label": "Paiement",
    "payment_date_label": "Le",
    "account_label": "C.C.P N°",
    "default_payment": "Virement",
    "base_code": "100",
    "base_label": "SALAIRE DE BASE",
    "ss_code": "990",
    "ss_label": "RET.SECURITE SOCIALE",
    "irg_code": "995",
    "irg_label": "RET. I.R.G.",
    "ss_var_key": "CNAS_EMPLOYEE",
    "pat_var_key": "CNAS_EMPLOYER_BASE",
    "fos_var_key": "CNAS_FOS",
    "caco_var_key": "CACOBATPH_CONGES",
    "months": ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]
  }
  $layout$::jsonb
)
on conflict (id) do nothing;

comment on table public.hr_bulletin_settings is
  'Modèle d''impression du bulletin de paie (nomenclature GAS). Modifiable depuis Paramètres RH.';

commit;
