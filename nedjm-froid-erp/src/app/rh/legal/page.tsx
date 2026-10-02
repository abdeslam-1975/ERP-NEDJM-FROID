import { redirect } from "next/navigation";

export default async function RhLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const section = tab === "cacobatph" || tab === "irg" || tab === "other" || tab === "cnas" ? tab : "cnas";
  redirect(`/rh/parametres?tab=legal&section=${section}`);
}
