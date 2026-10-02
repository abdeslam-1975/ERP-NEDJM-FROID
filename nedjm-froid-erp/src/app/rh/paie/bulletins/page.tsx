import { redirect } from "next/navigation";

export default async function BulletinsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ onglet: "bulletins" });
  if (sp.year) qs.set("year", sp.year);
  if (sp.month) qs.set("month", sp.month);
  redirect(`/rh/documents?${qs.toString()}`);
}
