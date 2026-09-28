import { redirect } from "next/navigation";

export default async function PayrollSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; employee?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ cible: "paie" });
  if (sp.year) qs.set("annee", sp.year);
  if (sp.month) qs.set("mois", sp.month);
  if (sp.employee) qs.set("employe", sp.employee);
  redirect(`/simulateur?${qs.toString()}`);
}
