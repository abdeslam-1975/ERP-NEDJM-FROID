import { AccueilVitrine } from "@/components/dashboard/accueil-vitrine";
import { AppShell } from "@/components/layout/app-shell";
import { getWorkspaceProfile } from "@/lib/auth/get-workspace";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const REDIRECT_NOTICES: Record<string, string> = {
  hidden:
    "Cette page n'est pas affichée pour votre rôle (Paramètres → Interface). · هذه الصفحة غير معروضة لدورك.",
  forbidden: "Accès refusé pour votre rôle. · الوصول مرفوض لدورك.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const workspace = await getWorkspaceProfile();
  if (!workspace) redirect("/login");
  const { error } = await searchParams;
  const notice = error ? REDIRECT_NOTICES[error] : undefined;

  return (
    <AppShell title="Tableau de Bord" fit>
      <div className="flex h-full min-h-0 flex-col gap-3">
        {notice ? (
          <p className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {notice}
          </p>
        ) : null}
        <AccueilVitrine />
      </div>
    </AppShell>
  );
}
