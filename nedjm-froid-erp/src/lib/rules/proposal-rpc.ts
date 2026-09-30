import type { createClient } from "@/lib/supabase/server";
import type { RuleAction, RuleFamily } from "@/lib/rules/proposals";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SaveRuleProposalArgs = {
  id?: string | null;
  family: RuleFamily;
  action: RuleAction;
  target_id: string | null;
  target_key?: string | null;
  payload: Record<string, unknown>;
  title: string;
  source_ref: string;
  text_effective_date: string | null;
  requested_month: string | null;
  submit: boolean;
};

/** ref_rule_proposal_save: validation, contributors and submission all happen in the database. */
export async function saveRuleProposal(
  supabase: Supabase,
  a: SaveRuleProposalArgs,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("ref_rule_proposal_save", {
    p_id: a.id ?? null,
    p_family: a.family,
    p_action: a.action,
    p_target: a.target_id,
    p_target_key: a.target_key ?? null,
    p_payload: a.payload,
    p_title: a.title,
    p_source_ref: a.source_ref,
    p_text_effective: a.action === "VERIFY" ? null : a.text_effective_date,
    p_requested_month: a.action === "VERIFY" ? null : a.requested_month,
    p_submit: a.submit,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export const PROPOSAL_SENT =
  "Proposition envoyée pour approbation : aucun effet sur la paie avant l'approbation, puis la décision de sa date d'application (D2).";
