import { AppShell } from "@/components/layout/app-shell";
import { VentesDesk } from "@/components/ventes/ventes-desk";

export const dynamic = "force-dynamic";

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export default function VentesPage() {
  const desk = <VentesDesk />;

  // UI-first: the desk is self-contained. Wrap with AppShell when auth env is present.
  if (!hasSupabaseEnv()) {
    return (
      <main style={{ minHeight: "100vh", background: "#f0f2f5", padding: 8 }}>
        {desk}
      </main>
    );
  }

  return <AppShell title="GESTION VENTES">{desk}</AppShell>;
}
