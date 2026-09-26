import { z } from "zod";
import {
  digitsOnly,
  todayIsoDate,
  FICHE_ACCOUNT_PREFIX,
} from "@/lib/hr/employee-fiche-constraints";

const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optLatinUpper = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v.toLocaleUpperCase("fr-DZ") : null));

const optExactDigits = (len: number, label: string) =>
  z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      const d = digitsOnly(String(v), len);
      return d === "" ? null : d;
    },
    z
      .union([
        z.null(),
        z
          .string()
          .length(len, { message: `${label} : exactement ${len} chiffres.` }),
      ])
      .optional(),
  );

const optDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const catalogKindSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/i)
    .transform((v) => v.toLowerCase()),
  label_ar: z.string().trim().min(1).max(120),
  label_fr: z.string().trim().min(1).max(120),
  extra_hint: optText(240),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

export const catalogItemSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.string().trim().min(1).max(40),
  code: z.string().trim().min(1).max(40),
  label_ar: z.string().trim().min(1).max(160),
  label_fr: z.string().trim().min(1).max(160),
  extra: z.record(z.string(), z.unknown()).optional(),
  color_bg: optText(16),
  color_fg: optText(16),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

export const legendUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(16).transform((v) => v.toUpperCase()),
  label_fr: z.string().trim().min(1).max(120),
  label_ar: optText(120),
  coefficient: z.coerce.number().min(0).max(1),
  counts_as_presence: z.boolean().default(false),
  triggers_an_passthrough: z.boolean().default(false),
  color_bg: optText(16),
  color_fg: optText(16),
  source_mode: z.string().trim().min(1).max(16).default("BOTH"),
  is_active: z.boolean().default(true),
});

export const hrEmployeeFullSchema = z.object({
  id: z.string().uuid().optional(),
  matricule: z.string().trim().min(2).max(32).transform((v) => v.toUpperCase()),
  last_name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((v) => v.toLocaleUpperCase("fr-DZ")),
  first_name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((v) => v.toLocaleUpperCase("fr-DZ")),
  last_name_ar: optText(100),
  first_name_ar: optText(100),
  nss: optExactDigits(12, "N° NSS"),
  nin: optExactDigits(18, "NIN"),
  birth_date: optDate,
  hired_at: optDate,
  photo_url: optText(800),
  irg_category: z.preprocess(
    (v) => (v === "" || v == null ? "STANDARD" : v),
    z.enum(["STANDARD", "DISABLED_OR_RETIREE"]),
  ),
  status: z
    .enum(["INVITED", "ACTIVE", "SUSPENDED", "DISABLED", "INACTIVE"])
    .default("ACTIVE"),
  sex_code: optText(20),
  marital_code: optText(20),
  children_count: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.number().int().min(0).max(30).nullable().optional(),
  ),
  blood_code: optText(20),
  birth_place_ar: optText(120),
  birth_place_fr: optLatinUpper(120),
  birth_act_no: optExactDigits(5, "N° acte de naissance"),
  father_name: optLatinUpper(120),
  mother_name: optLatinUpper(120),
  nationality: optLatinUpper(80),
  commune_birth: optLatinUpper(80),
  wilaya_birth: optLatinUpper(80),
  address_ar: optText(240),
  address_fr: optLatinUpper(240),
  wilaya_code: optLatinUpper(40),
  commune: optLatinUpper(80),
  postal_code: optText(16),
  phone: optText(32),
  whatsapp: optText(32),
  email: optText(120),
  payment_mode_code: optText(20),
  account_no: z.preprocess(
    (v) => {
      if (v == null || v === "") return null;
      const d = digitsOnly(String(v), 20);
      return d === "" ? null : d;
    },
    z
      .union([
        z.null(),
        z
          .string()
          .length(20, { message: "N° compte : exactement 20 chiffres." })
          .refine((v) => v.startsWith(FICHE_ACCOUNT_PREFIX), {
            message: `N° compte : doit commencer par ${FICHE_ACCOUNT_PREFIX}.`,
          }),
      ])
      .optional(),
  ),
  account_key: optText(8),
  declaration_date: optDate,
  social_profile_code: optText(40),
  level_code: optText(40),
  diploma_ar: optText(160),
  diploma_fr: optLatinUpper(160),
  experience_years: z.coerce.number().min(0).max(60).optional().nullable(),
  languages: optLatinUpper(120),
  attrs: z.record(z.string(), z.unknown()).optional(),
}).superRefine((data, ctx) => {
  const attrs = data.attrs ?? {};
  const idNumber = attrs.id_number;
  if (idNumber != null && String(idNumber).trim() !== "") {
    const d = digitsOnly(String(idNumber), 9);
    if (d.length !== 9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "N° pièce : exactement 9 chiffres.",
        path: ["attrs", "id_number"],
      });
    }
  }
  for (const [key, label] of [
    ["id_issued_on", "Date de délivrance"],
    ["id_expires_on", "Date d'expiration"],
  ] as const) {
    const raw = attrs[key];
    if (raw == null || String(raw).trim() === "") continue;
    const v = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} : date invalide.`,
        path: ["attrs", key],
      });
      continue;
    }
    if (key === "id_issued_on" && v > todayIsoDate()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} : une date future n'est pas autorisée.`,
        path: ["attrs", key],
      });
    }
    if (key === "id_expires_on" && v <= todayIsoDate()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} : la date doit être postérieure à aujourd'hui (aujourd'hui et le passé sont refusés).`,
        path: ["attrs", key],
      });
    }
  }
});

export const hrEmployeeFieldSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/i)
    .transform((v) => v.toLowerCase()),
  label_ar: z.string().trim().min(1).max(120),
  label_fr: z.string().trim().min(1).max(120),
  value_type: z.enum(["text", "date", "number", "catalog"]).default("text"),
  catalog_kind: optText(40),
  section_ar: optText(80),
  section_fr: optText(80),
  sort_order: z.coerce.number().int().min(0).max(9999).default(800),
  is_active: z.boolean().default(true),
  is_required: z.boolean().default(false),
});

export const hrEmployeeFieldMetaSchema = z.object({
  id: z.string().uuid(),
  label_ar: z.string().trim().min(1).max(120),
  label_fr: z.string().trim().min(1).max(120),
  value_type: z.enum(["text", "date", "number", "catalog"]).optional(),
  catalog_kind: optText(40),
  section_ar: optText(80),
  section_fr: optText(80),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_active: z.boolean(),
  is_required: z.boolean().optional(),
});

export const hrFicheSettingsSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  matricule_label: z.string().trim().min(1).max(80),
  letterhead_url: optText(800),
  phone_prefix: z.string().trim().max(20).default("+213"),
  phone_codes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  uppercase_codes: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  suffixes: z.record(z.string(), z.string().max(40)).default({}),
  identity_left: z.array(z.string().trim().min(1).max(40)).max(20),
  identity_right: z.array(z.string().trim().min(1).max(40)).max(20),
  photo_field: z.string().trim().min(1).max(40).default("photo_url"),
  sections: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        title: z.string().trim().min(1).max(160),
        rows: z.array(z.array(z.string().trim().min(1).max(40)).min(1).max(4)).max(30),
      }),
    )
    .max(20),
  sig_left_title: z.string().trim().max(80).default(""),
  sig_left_sub: z.string().trim().max(80).default(""),
  sig_right_title: z.string().trim().max(80).default(""),
  sig_right_line1: z.string().trim().max(80).default(""),
  sig_right_line2: z.string().trim().max(80).default(""),
});

export const hrContractSalaryLineSchema = z.object({
  rubrique_id: z.string().uuid(),
  amount: z.coerce.number().min(0).max(99_999_999),
  unit: z.enum(["day", "month", "percent", "presence_day"]).optional(),
});

export const hrContractSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  site_id: z.string().uuid(),
  activity_code_id: z.string().uuid(),
  contract_type_code: optText(40),
  work_regime_code: optText(40),
  poste_ar: optText(120),
  poste_fr: optText(120),
  qualification_code: optText(40),
  affectation_principale: z.boolean().default(true),
  salaire_base_monthly: z.coerce.number().min(0),
  salaire_net_ref_monthly: z.coerce.number().min(0),
  salaire_net_recup_monthly: z.coerce.number().min(0).optional().nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: optDate,
  status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "ENDED"]).default("DRAFT"),
  salary_lines: z.array(hrContractSalaryLineSchema).max(80).optional(),
});

export const hrFileSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  doc_type_code: z.string().trim().min(1).max(40),
  file_url: optText(800),
  file_name: optText(240),
  storage_path: optText(400),
  issued_on: optDate,
  expires_on: optDate,
  notes: optText(400),
});

export const hrCorrespondenceSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  site_id: z.string().uuid().optional().nullable(),
  type_code: z.string().trim().min(1).max(40),
  status_code: z.string().trim().min(1).max(40).default("DRAFT"),
  start_date: optDate,
  end_date: optDate,
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const attendanceCellSchema = z.object({
  employee_id: z.string().uuid(),
  site_id: z.string().uuid(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  legend_code: z.string().trim().min(1).max(16),
  source_code: z.string().trim().min(1).max(20).default("MANUAL"),
  correspondence_id: z.string().uuid().optional().nullable(),
});

export const attendanceSaveSchema = z.object({
  site_id: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employee_id: z.string().uuid().optional(),
  loaded_at: z.string().datetime().optional(),
  cells: z.array(attendanceCellSchema).max(4000),
});

export const attendanceSheetRowsSaveSchema = z.object({
  site_id: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  rows: z
    .array(
      z.object({
        employee_id: z.string().uuid(),
        values: z.record(z.string().max(32), z.string().max(500)),
      }),
    )
    .max(1000),
});

const attendanceColumnCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{0,31}$/, "Code : lettres majuscules, chiffres ou _ (32 max).");

export const attendanceColumnsConfigSchema = z.object({
  columns: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        code: attendanceColumnCode,
        label_fr: z.string().trim().min(1, "Libellé FR requis.").max(80),
        label_ar: z.string().trim().max(80).optional().nullable(),
        value_type: z.enum(["text", "number", "date", "catalog"]).default("text"),
        sort_order: z.coerce.number().int().min(0).max(100000),
        is_active: z.boolean(),
      }),
    )
    .max(200),
  grants: z
    .array(
      z.object({
        column_code: attendanceColumnCode,
        role_id: z.string().uuid(),
        can_view: z.boolean(),
        can_edit: z.boolean(),
      }),
    )
    .max(5000),
});

export const payrollGenerateSchema = z.object({
  period_year: z.coerce.number().int().min(2020).max(2100),
  period_month: z.coerce.number().int().min(1).max(12),
  site_id: z.string().uuid().optional().nullable(),
});

export const payrollLockSchema = z.object({
  slip_id: z.string().uuid(),
});

export const salaryRubriqueSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((v) => v.toUpperCase()),
  label_ar: z.string().trim().min(1).max(160),
  label_fr: z.string().trim().min(1).max(160),
  nature: z.enum(["indemnite", "prime", "rappel", "remboursement", "retenue"]),
  unit: z.enum(["day", "month", "percent", "presence_day"]),
  category: z.enum(["1", "2", "3", "4"]),
  cotisable: z.boolean(),
  taxable: z.boolean(),
  apply_scope: z.enum(["employee", "site", "contract"]),
  default_amount: z.coerce.number().min(0).max(99_999_999),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

export const salaryAssignmentSchema = z.object({
  id: z.string().uuid().optional(),
  rubrique_id: z.string().uuid(),
  target_id: z.string().uuid(),
  amount: z.coerce.number().min(0).max(99_999_999),
  unit: z.enum(["day", "month", "percent", "presence_day"]).optional().nullable(),
  is_active: z.boolean().default(true),
});

export const salaryRubriqueImportApplySchema = z.object({
  replace_scope: z.boolean().default(false),
  drafts: z.array(salaryRubriqueSchema.omit({ id: true })).min(1).max(400),
});

export const salaryExceptionSchema = z
  .object({
    id: z.string().uuid().optional(),
    employee_id: z.string().uuid(),
    rubrique_id: z.string().uuid(),
    amount: z.coerce.number().min(0).max(99_999_999),
    unit: z.enum(["day", "month", "percent", "presence_day"]).optional().nullable(),
    period_year: z.coerce.number().int().min(2020).max(2100),
    period_month: z.coerce.number().int().min(1).max(12),
    duration_mode: z.enum(["once", "until"]).default("once"),
    until_year: z.preprocess(
      (v) => (v === "" || v == null ? null : v),
      z.number().int().min(2020).max(2100).optional().nullable(),
    ),
    until_month: z.preprocess(
      (v) => (v === "" || v == null ? null : v),
      z.number().int().min(1).max(12).optional().nullable(),
    ),
    reason: z
      .string()
      .trim()
      .min(8, "Motif obligatoire (8 caractères). · السبب إلزامي (8 أحرف).")
      .max(400),
    status_code: z.enum(["DRAFT", "APPROVED", "CANCELLED"]).default("DRAFT"),
  })
  .superRefine((value, ctx) => {
    if (value.duration_mode === "until") {
      if (value.until_year == null || value.until_month == null) {
        ctx.addIssue({
          code: "custom",
          message: "Indiquez le mois de fin. · أدخل شهر النهاية.",
        });
        return;
      }
      if (value.until_year * 12 + value.until_month < value.period_year * 12 + value.period_month) {
        ctx.addIssue({
          code: "custom",
          message: "La fin doit être après le début. · النهاية بعد البداية.",
        });
      }
    }
  });

export const irgVersionSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .transform((v) => v.toUpperCase().replace(/\s+/g, "_")),
  label_fr: z.string().trim().min(3).max(160),
  source_ref: optText(200),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: optDate,
  copy_from_version_id: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().uuid().optional().nullable(),
  ),
});

export const irgBracketInputSchema = z.object({
  id: z.string().uuid().optional(),
  min_annual: z.coerce.number().min(0).max(99_999_999_999),
  max_annual: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.number().min(0).max(99_999_999_999).nullable(),
  ),
  rate_pct: z.coerce.number().min(0).max(100),
});

export const irgBracketsReplaceSchema = z.object({
  version_id: z.string().uuid(),
  brackets: z.array(irgBracketInputSchema).min(1).max(20),
});

export const irgRuleSetSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .transform((v) => v.toUpperCase().replace(/\s+/g, "_")),
  taxpayer_category: z.enum(["STANDARD", "DISABLED_OR_RETIREE"]),
  label_fr: z.string().trim().min(3).max(160),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: optDate,
});

export const irgRuleKindSchema = z.enum([
  "EXEMPTION_THRESHOLD",
  "ABATEMENT_ON_TAX",
  "LISSAGE",
  "BASE_PREPROCESS",
  "NON_MONTHLY_WITHHOLDING",
]);

export const irgRuleSchema = z.object({
  id: z.string().uuid().optional(),
  rule_set_id: z.string().uuid(),
  kind: irgRuleKindSchema,
  applies_to: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.enum(["TAX", "BASE", "GROSS"]).nullable(),
  ),
  sequence: z.coerce.number().int().min(1).max(999),
  formula: optText(400),
  monthly_min: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0).max(99_999_999).optional(),
  ),
  monthly_max: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0).max(99_999_999).optional(),
  ),
  rate_pct: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0).max(100).optional(),
  ),
  min_monthly: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0).max(99_999_999).optional(),
  ),
  max_monthly: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0).max(99_999_999).optional(),
  ),
  deduct_tokens: optText(400),
});

const bulletinIdentityLineSchema = z.object({
  label: z.string().trim().min(1).max(80),
  field: z.string().trim().min(1).max(40),
});

export const hrBulletinSettingsSchema = z.object({
  title: z.string().trim().min(1).max(80),
  matricule_label: z.string().trim().min(1).max(40),
  period_label: z.string().trim().min(1).max(40),
  letterhead_url: z.string().trim().max(800).optional().default(""),
  pad_top_mm: z.coerce.number().min(0).max(80).default(32.5),
  pad_right_mm: z.coerce.number().min(0).max(80).default(16),
  pad_bottom_mm: z.coerce.number().min(0).max(80).default(28),
  pad_left_mm: z.coerce.number().min(0).max(80).default(16),
  hide_zero_lines: z.boolean().default(true),
  unit_da: z.string().trim().min(1).max(12).default(" DA"),
  unit_percent: z.string().trim().min(1).max(12).default(" %"),
  unit_day: z.string().trim().min(1).max(12).default(" DA/j"),
  identity_left: z.array(bulletinIdentityLineSchema).max(12),
  identity_right: z.array(bulletinIdentityLineSchema).max(12),
  col_code: z.string().trim().min(1).max(40),
  col_intitule: z.string().trim().min(1).max(40),
  col_nombre: z.string().trim().min(1).max(40),
  col_taux: z.string().trim().min(1).max(40),
  col_gain: z.string().trim().min(1).max(40),
  col_retenue: z.string().trim().min(1).max(40),
  totaux_label: z.string().trim().min(1).max(40),
  net_label: z.string().trim().min(1).max(40),
  movements_title: z.string().trim().min(1).max(80),
  charges_title: z.string().trim().min(1).max(40),
  label_worked: z.string().trim().min(1).max(60),
  label_rappel: z.string().trim().min(1).max(60),
  label_weekend: z.string().trim().min(1).max(80),
  label_abandon: z.string().trim().min(1).max(60),
  label_leave: z.string().trim().min(1).max(40),
  label_absence: z.string().trim().min(1).max(40),
  label_salariales: z.string().trim().min(1).max(40),
  label_patronales: z.string().trim().min(1).max(40),
  label_totales: z.string().trim().min(1).max(40),
  label_cout: z.string().trim().min(1).max(40),
  footer_base: z.string().trim().min(1).max(60),
  footer_css_sal: z.string().trim().min(1).max(80),
  footer_css_pat: z.string().trim().min(1).max(80),
  footer_caco: z.string().trim().min(1).max(80),
  footer_intemp_sal: z.string().trim().min(1).max(80),
  footer_intemp_pat: z.string().trim().min(1).max(80),
  footer_irg_base: z.string().trim().min(1).max(40),
  footer_irg: z.string().trim().min(1).max(40),
  payment_label: z.string().trim().min(1).max(40),
  payment_date_label: z.string().trim().min(1).max(20),
  account_label: z.string().trim().min(1).max(40),
  default_payment: z.string().trim().min(1).max(40),
  base_code: z.string().trim().min(1).max(16),
  base_label: z.string().trim().min(1).max(80),
  ss_code: z.string().trim().min(1).max(16),
  ss_label: z.string().trim().min(1).max(80),
  irg_code: z.string().trim().min(1).max(16),
  irg_label: z.string().trim().min(1).max(80),
  intemp_code: z.string().trim().min(1).max(16),
  intemp_label: z.string().trim().min(1).max(80),
  ss_var_key: z.string().trim().min(1).max(40),
  pat_var_key: z.string().trim().min(1).max(40),
  fos_var_key: z.string().trim().min(1).max(40),
  caco_var_key: z.string().trim().min(1).max(40),
  intemp_sal_var_key: z.string().trim().min(1).max(40),
  intemp_emp_var_key: z.string().trim().min(1).max(40),
  months: z.array(z.string().trim().min(1).max(20)).length(12),
});
