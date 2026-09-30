import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { RhAlert } from "@/components/rh/rh-ui";
import { DecisionDetailView } from "@/components/decisions/decision-detail";
import { getDecision } from "@/lib/actions/decisions";

export const dynamic = "force-dynamic";

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getDecision(id);
  return (
    <AppShell title="Centre de décisions">
      <div className="space-y-4">
        <Link href="/decisions" className="text-sm font-semibold text-brand hover:underline">
          ← Toutes les décisions
        </Link>
        {res.ok ? <DecisionDetailView decision={res.data} /> : <RhAlert tone="danger">{res.error}</RhAlert>}
      </div>
    </AppShell>
  );
}
