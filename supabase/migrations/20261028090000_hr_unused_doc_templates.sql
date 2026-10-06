-- Retired HR print templates: the twelve letters (attestation, certificat, STC, mises en demeure, congé),
-- the bilingual mission-order sheet (v1) and the CDI contract. Copies already printed stay in their registers.

begin;

delete from public.doc_templates
where doc_type in (
  'lettre_attest_fr', 'lettre_attest_ar',
  'lettre_certif_fr', 'lettre_certif_ar',
  'lettre_stc_fr', 'lettre_stc_ar',
  'lettre_med1_fr', 'lettre_med1_ar',
  'lettre_med2_fr', 'lettre_med2_ar',
  'lettre_leave_fr', 'lettre_leave_ar',
  'ordre_mission_v1',
  'contrat_cdi'
);

commit;
