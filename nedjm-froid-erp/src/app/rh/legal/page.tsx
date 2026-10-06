import { redirect } from "next/navigation";

export default async function LegacyRhLegalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(tab ? `/parametres/rh/cotisations?tab=${encodeURIComponent(tab)}` : "/parametres/rh/cotisations");
}
