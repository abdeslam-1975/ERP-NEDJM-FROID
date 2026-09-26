-- Arabic labels of the unit 05 legal variables (labels only, values untouched).
update public.ref_global_vars v
set label_ar = x.label_ar
from (
  values
    ('CNAS_EMPLOYEE', 'اشتراك الضمان الاجتماعي - حصة العامل'),
    ('CNAS_EMPLOYER_BASE', 'اشتراك الضمان الاجتماعي - حصة صاحب العمل (دون الخدمات الاجتماعية)'),
    ('CNAS_FOS', 'صندوق الخدمات الاجتماعية'),
    ('CACOBATPH_CONGES', 'كاكوباتف - العطل المدفوعة الأجر'),
    ('CACOBATPH_INTEMPERIES', 'كاكوباتف - البطالة الناجمة عن سوء الأحوال الجوية'),
    ('CACOBATPH_INTEMPERIES_EMP', 'كاكوباتف - سوء الأحوال الجوية (حصة صاحب العمل)'),
    ('CACOBATPH_INTEMPERIES_SAL', 'كاكوباتف - سوء الأحوال الجوية (حصة العامل)'),
    ('SNMG', 'الأجر الوطني الأدنى المضمون'),
    ('HEURES_MENSUELLES', 'ساعات العمل الشهرية'),
    ('HS_TAUX_50', 'نسبة الساعات الإضافية 50%'),
    ('HS_TAUX_75', 'نسبة الساعات الإضافية 75%'),
    ('HS_TAUX_100', 'نسبة الساعات الإضافية 100%'),
    ('CONGE_JOURS_MOIS', 'أيام العطلة المكتسبة في الشهر'),
    ('NJM_DIVISEUR_FIXED', 'القاسم الثابت لحساب الأجر اليومي')
) as x(key, label_ar)
where v.key = x.key and coalesce(trim(v.label_ar), '') = '';
