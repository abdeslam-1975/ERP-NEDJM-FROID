-- Official company payslip layout ("modèle fiche de paie"), Arial everywhere. Published as the next
-- approved version: version 1 stays in the history and can be restored from the editor.

begin;

insert into public.doc_templates (doc_type, version, status, html, note, approved_at)
select 'bulletin_paie', v.next_version, 'approved', $bulletin_paie_v2$<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>BULLETIN DE PAIE</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7.9pt; }
    .page { width: 210mm; min-height: 297mm; position: relative; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .letterhead-img { position: absolute; inset: 0; width: 210mm; height: 297mm; z-index: 0; object-fit: fill; }
    .sheet { position: relative; z-index: 1; padding: 37.4mm 0 0 10mm; }
    @media print {
      html, body, .letterhead-img, th, td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .head { position: relative; width: 190.2mm; height: 23.5mm; }
    .head h1 { position: absolute; left: 11.4mm; top: 7.5mm; margin: 0; font-size: 22.9pt; font-weight: 400; line-height: 9.2mm; white-space: nowrap; }
    .ident { position: absolute; left: 105.4mm; top: 0; width: 84.2mm; height: 23.5mm; border: 0.78pt solid #000; border-radius: 3.9mm; padding: 2.7mm 2mm 0 4mm; line-height: 3.75mm; white-space: nowrap; overflow: hidden; }
    table.g { width: 190.2mm; table-layout: fixed; border-collapse: collapse; }
    table.g th, table.g td { height: 3.76mm; padding: 0 0.7mm; border: 0.6pt solid #000; vertical-align: middle; line-height: 1.1; white-space: nowrap; overflow: hidden; }
    table.g th { height: 3.76mm; font-size: 8.7pt; font-weight: 700; text-align: center; background: #f2f2f2; }
    table.g .gris { background: #f2f2f2; }
    table.g .vide { border: none; background: none; }
    table.g .b { font-size: 8.7pt; font-weight: 700; }
    .c { text-align: center; }
    .r { text-align: right; }
    table.periode { margin: 5.6mm 0 3.5mm; }
    table.periode td { border: none; font-size: 8.7pt; }
    table.periode .lbl { font-weight: 700; text-align: center; text-decoration: underline; }
    table.lignes { height: 60.4mm; }
    table.lignes tbody td { border-top: none; border-bottom: none; }
    table.lignes tbody td.intitule { background: #f2f2f2; }
    table.lignes tbody tr.fin td { height: auto; border-bottom: 0.6pt solid #000; }
    table.lignes tr.net td { height: 11.23mm; }
    .net-amt { display: inline-block; width: 30.8mm; height: 6.6mm; line-height: 6.6mm; border: 0.93pt solid #000; border-radius: 3.6mm / 2.95mm; font-size: 10.3pt; font-weight: 700; text-align: center; vertical-align: middle; }
    table.mv th { height: 3.81mm; }
    table.cot { margin-top: 7.37mm; }
    table.cot th { height: 3.7mm; font-size: 6.3pt; padding: 0; }
    table.cot td { height: 3.7mm; }
    table.pay { width: 126.8mm; margin-top: 7.45mm; }
    table.pay td { height: 3.7mm; }
  </style>
</head>
<body><div class="page" data-each="pages">
  <img class="letterhead-img" src="" data-attr-src="letterhead" data-if="letterhead" alt="">
  <div class="sheet">
    <div class="head">
      <h1>BULLETIN DE PAIE</h1>
      <div class="ident">
        <div>Employé : <b data-field="values.employee_name"></b></div>
        <div>Matricule : <b data-field="matricule"></b></div>
        <div>Fonction : <b data-field="values.fonction"></b></div>
        <div>Affectation : <b data-field="values.affectation"></b></div>
        <div>N° S.S : <b data-field="values.nss"></b></div>
      </div>
    </div>
    <table class="g periode">
      <tbody><tr>
        <td class="lbl">Période du :</td>
        <td class="c" data-field="period_from" data-format="date_slash"></td>
        <td class="lbl">au :</td>
        <td class="c" data-field="period_to" data-format="date_slash"></td>
        <td colspan="5"></td>
      </tr></tbody>
    </table>
    <table class="g lignes">
      <thead><tr>
        <th>Code</th>
        <th colspan="3">Intitulé</th>
        <th>Nbr</th>
        <th>Base</th>
        <th>Taux</th>
        <th>Gains</th>
        <th>Retenue</th>
      </tr></thead>
      <tbody>
        <tr data-each="lines">
          <td class="c" data-field="code"></td>
          <td colspan="3" class="intitule" data-field="label"></td>
          <td class="c" data-field="nbr" data-format="da0"></td>
          <td class="r" data-field="base" data-format="dec"></td>
          <td class="r"><span data-bare data-if="rate != null"><span data-bare data-field="rate" data-format="rate"></span><span data-bare data-field="rate_suffix"></span></span></td>
          <td class="r" data-field="gain" data-format="dec"></td>
          <td class="r" data-field="retenue" data-format="dec"></td>
        </tr>
        <tr class="fin"><td></td><td colspan="3" class="intitule"></td><td></td><td></td><td></td><td></td><td></td></tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="vide"></td>
          <td colspan="2" class="gris c b">Totaux</td>
          <td class="r" data-field="total_gain" data-format="dec"></td>
          <td class="r" data-field="total_retenue" data-format="dec"></td>
        </tr>
        <tr class="net">
          <td colspan="6" class="vide"></td>
          <td class="vide c b">Net à Payer</td>
          <td colspan="2" class="vide c"><span class="net-amt"><span data-bare data-field="net_payable" data-format="dec"></span><span data-bare data-field="units.da"></span></span></td>
        </tr>
      </tfoot>
    </table>
    <table class="g mv">
      <thead><tr>
        <th colspan="6">Mouvements du Mois&nbsp;&nbsp; "Nombre Jours"</th>
        <th colspan="3">Charges</th>
      </tr></thead>
      <tbody>
        <tr>
          <td colspan="2" class="gris">Travaillés</td><td class="c" data-field="days_worked - jours.CRP" data-format="days"></td>
          <td colspan="2" class="gris">Congés de Récupération "CRP"</td><td class="c" data-field="jours.CRP" data-format="days"></td>
          <td class="gris">Salariales</td><td colspan="2" class="r" data-field="charges_salariales" data-format="dec"></td>
        </tr>
        <tr>
          <td colspan="2" class="gris">WeekEnd et Fériées du Mois</td><td class="c" data-field="days_weekend" data-format="days"></td>
          <td colspan="2" class="gris">Absence Autorisé</td><td class="c" data-field="jours.AOP" data-format="days"></td>
          <td class="gris">Patronales</td><td colspan="2" class="r" data-field="charges_patronales" data-format="dec"></td>
        </tr>
        <tr>
          <td colspan="2" class="gris">Congés Récupération "P"</td><td class="c"></td>
          <td colspan="2" class="gris">Congés Maladie</td><td class="c" data-field="jours.CM" data-format="days"></td>
          <td class="gris">Totales</td><td colspan="2" class="r" data-field="charges_totales" data-format="dec"></td>
        </tr>
        <tr>
          <td colspan="2" class="gris">Congés Annuel</td><td class="c" data-field="jours.CA" data-format="days"></td>
          <td colspan="2" class="gris">Congé Sans Solde</td><td class="c" data-field="jours.CSS" data-format="days"></td>
          <td class="gris">Coût Globale</td><td colspan="2" class="r" data-field="cout_global" data-format="dec"></td>
        </tr>
        <tr>
          <td colspan="2" class="gris">Absence pour Décé</td><td class="c"></td>
          <td colspan="2" class="gris">Absences non Justifiées</td><td class="c" data-field="jours.AN" data-format="days"></td>
          <td colspan="3" class="vide"></td>
        </tr>
      </tbody>
    </table>
    <table class="g cot">
      <thead><tr>
        <th>Base Cotis</th>
        <th>Cotis. <span data-bare data-field="rates.ss_pct" data-format="num"></span>%</th>
        <th>Pat. CNAS&nbsp; <span data-bare data-field="rates.pat_pct" data-format="num"></span>%</th>
        <th>Œuvres Soc <span data-bare data-field="rates.fos_pct" data-format="num"></span>%</th>
        <th>Congés P <span data-bare data-field="rates.caco_pct" data-format="num"></span>%</th>
        <th>Intemp. Sal <span data-bare data-field="rates.intemp_sal_pct" data-format="num"></span>%</th>
        <th>Intemp. Pat <span data-bare data-field="rates.intemp_pat_pct" data-format="num"></span>%</th>
        <th>Base IRG</th>
        <th>IRG</th>
      </tr></thead>
      <tbody><tr>
        <td class="r" data-field="base_cotisable" data-format="dec"></td>
        <td class="r" data-field="employee_ss" data-format="dec"></td>
        <td class="r" data-field="employer_ss" data-format="dec"></td>
        <td class="r" data-field="fos_amount" data-format="dec"></td>
        <td class="r" data-field="cacobatph" data-format="dec"></td>
        <td class="r" data-field="intemperies_employee" data-format="dec"></td>
        <td class="r" data-field="intemperies_employer" data-format="dec"></td>
        <td class="r" data-field="irg_base" data-format="dec"></td>
        <td class="r" data-field="irg_amount" data-format="dec"></td>
      </tr></tbody>
    </table>
    <table class="g pay">
      <tbody>
        <tr>
          <td class="gris c b">Paiement :</td><td colspan="2" class="c" data-field="payment_mode"></td>
          <td class="gris c b">Le :</td><td colspan="2" class="c" data-field="payment_date"></td>
        </tr>
        <tr>
          <td class="gris c b">C.C.P&nbsp; N° :</td><td colspan="2" class="c" data-field="account_no"></td>
          <td class="gris c b">Clé :</td><td colspan="2" class="c" data-field="account_key"></td>
        </tr>
      </tbody>
    </table>
  </div></div></body>
</html>$bulletin_paie_v2$, 'Modèle officiel de l''entreprise (Arial)', now()
from (
  select coalesce(max(version), 0) + 1 as next_version
  from public.doc_templates
  where doc_type = 'bulletin_paie' and status = 'approved'
) v
where not exists (
  select 1 from public.doc_templates
  where doc_type = 'bulletin_paie' and status = 'approved' and note = 'Modèle officiel de l''entreprise (Arial)'
);

commit;
