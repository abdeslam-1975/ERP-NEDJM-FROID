import { AppShell } from "@/components/layout/app-shell";
import { OpeningsManager } from "@/components/caisse/openings-manager";
import { Alert } from "@/components/ui/alert";
import { getCaisseOpenings } from "@/lib/actions/caisse";
import { CAISSE_DEFAULT_OPENING_DATE } from "@/lib/validations/caisse";

export const dynamic = "force-dynamic";

export default async function CaissePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const result = await getCaisseOpenings(date);
  return (
    <AppShell title="صندوق">
      {result.ok ? (
        <OpeningsManager key={`${result.data.openingDate}-${result.data.buyers.map((buyer) => buyer.id).join()}`} initial={result.data} />
      ) : (
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">Soldes d’ouverture</h1>
          <Alert tone="danger">{result.error}</Alert>
          <p className="text-sm text-foreground/60">Date par défaut : {CAISSE_DEFAULT_OPENING_DATE}.</p>
        </div>
      )}
    </AppShell>
  );
}
