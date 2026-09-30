import type { createClient } from "@/lib/supabase/server";
import {
  groupLegendCoefficientVersions,
  legendCoefficientAt,
  type LegendCoefficientVersion,
} from "@/lib/hr/legend-coefficient";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadLegendCoefficientVersions(
  supabase: Supabase,
): Promise<Result<Map<string, LegendCoefficientVersion[]>>> {
  const { data, error } = await supabase
    .from("ref_legende_coefficients")
    .select("legend_id, coefficient, effective_from")
    .eq("status", "ACTIVE");
  if (error) return { ok: false, error: `Coefficients datés : ${error.message}` };
  return {
    ok: true,
    data: groupLegendCoefficientVersions(
      (data ?? []) as { legend_id: string; coefficient: unknown; effective_from: unknown }[],
    ),
  };
}

/**
 * Attendance legends with the coefficient in force for the month of `day` (D14). `columns` must not
 * list `id` nor `coefficient`, both always read.
 */
export async function loadLegendsAt<T extends object = Record<string, unknown>>(
  supabase: Supabase,
  day: string,
  columns: string,
): Promise<Result<Array<T & { id: string; coefficient: number }>>> {
  const [legends, versions] = await Promise.all([
    supabase.from("ref_legendes").select(`id, coefficient, ${columns}`),
    loadLegendCoefficientVersions(supabase),
  ]);
  if (legends.error) return { ok: false, error: `Légendes : ${legends.error.message}` };
  if (!versions.ok) return versions;
  const rows = (legends.data ?? []) as unknown as Array<T & { id: string; coefficient: unknown }>;
  return {
    ok: true,
    data: rows.map((l) => ({
      ...l,
      coefficient: legendCoefficientAt(versions.data.get(l.id), day, Number(l.coefficient ?? 0)),
    })),
  };
}
