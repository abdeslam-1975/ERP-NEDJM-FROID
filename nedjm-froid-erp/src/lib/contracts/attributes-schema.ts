import { z } from "zod";

/** Canonical contract attributes — UI-driven, zero business hardcoding in logic. */

export const totalModeSchema = z.enum(["AUTO", "MANUAL"]);
export const cautionSyncSchema = z.enum(["FROM_RATE", "FROM_AMOUNT", "MANUAL"]);

export const contreLineSchema = z.object({
  id: z.string().min(1),
  code: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(64),
  rate: z.coerce.number().min(0),
  enabled: z.boolean().default(true),
  system: z.boolean().default(false),
});

export const progressiveBracketSchema = z.object({
  from_day: z.coerce.number().int().min(0),
  rate: z.coerce.number().min(0).max(1),
});

export const penaltyModeSchema = z.enum([
  "FIXED",
  "PCT_DAILY",
  "PCT_ITEM",
  "PROGRESSIVE",
]);

export const penaltyRuleSchema = z.object({
  id: z.string().min(1),
  code: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
  system: z.boolean().default(false),
  mode: penaltyModeSchema,
  rate: z.coerce.number().min(0).max(1).optional(),
  fixed_amount: z.coerce.number().min(0).optional(),
  grace_hours: z.coerce.number().int().min(0).optional(),
  grace_days: z.coerce.number().int().min(0).optional(),
  item_code_ref: z.string().optional(),
  brackets: z.array(progressiveBracketSchema).optional(),
});

export const marginGuardsSchema = z.object({
  green_above_pct: z.coerce.number().min(0).max(1).default(0.15),
  yellow_min_pct: z.coerce.number().min(-1).max(1).default(0),
  yellow_max_pct: z.coerce.number().min(0).max(1).default(0.15),
  red_blocks_without_approval: z.boolean().default(true),
});

export const rhAnWorkflowSchema = z.object({
  enabled: z.boolean().default(false),
  block_threshold_days: z.coerce.number().int().min(1).max(30).default(1),
  auto_block_payroll: z.boolean().default(true),
  retention_formula_key: z
    .string()
    .default("BILLING_MINUS_INTERNAL_PLUS_CLIENT_PENALTY"),
  require_pv: z.boolean().default(true),
  unblock_roles: z.array(z.string()).default(["SUPER_ADMIN", "ADMIN_RH"]),
});

export const financialAttrsSchema = z.object({
  total_mode: totalModeSchema.default("AUTO"),
  tva_exempt: z.boolean().default(false),
  tva_articles: z.array(z.string()).default([]),
  tva_standard_rate: z.coerce.number().min(0).max(1).default(0.19),
  caution_sync: cautionSyncSchema.default("FROM_RATE"),
});

export const contractAttributesSchema = z.object({
  financial: financialAttrsSchema.default({
    total_mode: "AUTO",
    tva_exempt: false,
    tva_articles: [],
    tva_standard_rate: 0.19,
    caution_sync: "FROM_RATE",
  }),
  contre_facturation: z
    .object({ lines: z.array(contreLineSchema).default([]) })
    .default({ lines: [] }),
  penalties: z
    .object({
      presets: z.array(penaltyRuleSchema).default([]),
      custom: z.array(penaltyRuleSchema).default([]),
      max_cap_rate: z.coerce.number().min(0).max(1).default(0.1),
      max_cap_enabled: z.boolean().default(true),
    })
    .default({
      presets: [],
      custom: [],
      max_cap_rate: 0.1,
      max_cap_enabled: true,
    }),
  margin_guards: marginGuardsSchema.default({
    green_above_pct: 0.15,
    yellow_min_pct: 0,
    yellow_max_pct: 0.15,
    red_blocks_without_approval: true,
  }),
  rh_an_workflow: rhAnWorkflowSchema.default({
    enabled: false,
    block_threshold_days: 1,
    auto_block_payroll: true,
    retention_formula_key: "BILLING_MINUS_INTERNAL_PLUS_CLIENT_PENALTY",
    require_pv: true,
    unblock_roles: ["SUPER_ADMIN", "ADMIN_RH"],
  }),
});

export type ContractAttributes = z.infer<typeof contractAttributesSchema>;
export type ContreLine = z.infer<typeof contreLineSchema>;
export type PenaltyRule = z.infer<typeof penaltyRuleSchema>;

/** El Gassi defaults — data seed for new contracts / migration of legacy attrs. */
export function elGassiDefaultAttributes(): ContractAttributes {
  return contractAttributesSchema.parse({
    financial: {
      total_mode: "AUTO",
      tva_exempt: true,
      tva_articles: ["12", "16"],
      tva_standard_rate: 0.19,
      caution_sync: "FROM_RATE",
    },
    contre_facturation: {
      lines: [
        {
          id: "sys-hebergement",
          code: "HEBERGEMENT",
          label: "Hébergement & Restauration",
          unit: "DA/jour/agent",
          rate: 5750,
          enabled: true,
          system: true,
        },
        {
          id: "sys-carburant",
          code: "CARBURANT",
          label: "Carburant",
          unit: "DA/Litre",
          rate: 36.76,
          enabled: true,
          system: true,
        },
      ],
    },
    penalties: {
      max_cap_rate: 0.1,
      max_cap_enabled: true,
      presets: [
        {
          id: "sys-chef-absence",
          code: "CHEF_ABSENCE",
          label: "Absence Chef de maintenance",
          enabled: true,
          system: true,
          mode: "PCT_DAILY",
          rate: 0.1,
          grace_hours: 72,
        },
        {
          id: "sys-tech-absence",
          code: "TECH_ABSENCE",
          label: "Absence Techniciens",
          enabled: true,
          system: true,
          mode: "PCT_DAILY",
          rate: 0.05,
          grace_hours: 72,
        },
        {
          id: "sys-pieces-delay",
          code: "PIECES_DELAY",
          label: "Retard Pièces",
          enabled: true,
          system: true,
          mode: "PCT_DAILY",
          rate: 0.05,
          grace_days: 0,
        },
        {
          id: "sys-vehicle-failure",
          code: "VEHICLE_FAILURE",
          label: "Panne Véhicules / Matériel",
          enabled: true,
          system: true,
          mode: "PCT_DAILY",
          rate: 0.075,
          grace_hours: 48,
        },
        {
          id: "sys-salary-delay",
          code: "SALARY_DELAY",
          label: "Retard Salaires",
          enabled: true,
          system: true,
          mode: "PROGRESSIVE",
          brackets: [
            { from_day: 11, rate: 0.02 },
            { from_day: 20, rate: 0.1 },
          ],
        },
      ],
      custom: [],
    },
    margin_guards: {
      green_above_pct: 0.15,
      yellow_min_pct: 0,
      yellow_max_pct: 0.15,
      red_blocks_without_approval: true,
    },
    rh_an_workflow: {
      enabled: false,
      block_threshold_days: 1,
      auto_block_payroll: true,
      retention_formula_key: "BILLING_MINUS_INTERNAL_PLUS_CLIENT_PENALTY",
      require_pv: true,
      unblock_roles: ["SUPER_ADMIN", "ADMIN_RH"],
    },
  });
}

/** Normalize legacy Sonatrach seed / partial attrs into canonical shape. */
export function normalizeContractAttributes(
  raw: unknown,
): ContractAttributes {
  const base = elGassiDefaultAttributes();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  // Already canonical?
  if (r.financial && typeof r.financial === "object") {
    const merged = {
      ...base,
      ...r,
      financial: { ...base.financial, ...(r.financial as object) },
      contre_facturation: {
        lines:
          (r.contre_facturation as { lines?: ContreLine[] })?.lines ??
          base.contre_facturation.lines,
      },
      penalties: {
        ...base.penalties,
        ...(r.penalties as object),
        presets:
          (r.penalties as { presets?: PenaltyRule[] })?.presets ??
          base.penalties.presets,
        custom:
          (r.penalties as { custom?: PenaltyRule[] })?.custom ??
          base.penalties.custom,
      },
      margin_guards: {
        ...base.margin_guards,
        ...((r.margin_guards as object) ?? {}),
      },
      rh_an_workflow: {
        ...base.rh_an_workflow,
        ...((r.rh_an_workflow as object) ?? {}),
      },
    };
    const parsed = contractAttributesSchema.safeParse(merged);
    return parsed.success ? parsed.data : base;
  }

  // Legacy flat shape from Phase 1B seed
  const legacyContre = (r.contre_facturation ?? {}) as Record<string, number>;
  const legacyPen = (r.penalties ?? {}) as Record<string, Record<string, number>>;
  const articles = Array.isArray(r.tva_articles)
    ? (r.tva_articles as string[])
    : base.financial.tva_articles;

  const migrated = {
    ...base,
    financial: {
      ...base.financial,
      tva_exempt: Boolean(r.tva_exempt ?? base.financial.tva_exempt),
      tva_articles: articles,
    },
    contre_facturation: {
      lines: base.contre_facturation.lines.map((line) => {
        if (line.code === "HEBERGEMENT") {
          return {
            ...line,
            rate:
              legacyContre.hebergement_restauration_da_per_day_agent ??
              line.rate,
          };
        }
        if (line.code === "CARBURANT") {
          return {
            ...line,
            rate: legacyContre.carburant_da_per_liter ?? line.rate,
          };
        }
        return line;
      }),
    },
    penalties: {
      ...base.penalties,
      max_cap_rate: legacyPen.max_cap_rate ?? base.penalties.max_cap_rate,
      presets: base.penalties.presets.map((p) => {
        if (p.code === "CHEF_ABSENCE" && legacyPen.chef_absence) {
          return {
            ...p,
            rate: legacyPen.chef_absence.rate ?? p.rate,
            grace_hours: legacyPen.chef_absence.grace_hours ?? p.grace_hours,
          };
        }
        if (p.code === "TECH_ABSENCE" && legacyPen.technician_absence) {
          return {
            ...p,
            rate: legacyPen.technician_absence.rate ?? p.rate,
            grace_hours:
              legacyPen.technician_absence.grace_hours ?? p.grace_hours,
          };
        }
        if (p.code === "VEHICLE_FAILURE" && legacyPen.equipment_vehicle_failure) {
          return {
            ...p,
            rate: legacyPen.equipment_vehicle_failure.rate ?? p.rate,
            grace_hours:
              legacyPen.equipment_vehicle_failure.grace_hours ?? p.grace_hours,
          };
        }
        if (p.code === "SALARY_DELAY" && legacyPen.salary_delay) {
          return {
            ...p,
            brackets: [
              {
                from_day: 11,
                rate: legacyPen.salary_delay.from_day_11_rate ?? 0.02,
              },
              {
                from_day: 20,
                rate: legacyPen.salary_delay.from_day_20_rate ?? 0.1,
              },
            ],
          };
        }
        return p;
      }),
    },
  };

  const parsed = contractAttributesSchema.safeParse(migrated);
  return parsed.success ? parsed.data : base;
}
