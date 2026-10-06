import { redirect } from "next/navigation";

const TAB_ROUTES: Record<string, string> = {
  salary: "/parametres/rh/rubriques",
  legal: "/parametres/rh/cotisations",
  fiche: "/parametres/rh/fiche",
  catalogs: "/parametres/rh/listes",
  bulletin: "/parametres/rh/bulletin",
  documents: "/parametres/rh/documents",
  attendance: "/parametres/rh/presence",
};

/** Former « RH → Paramètres » with its tabs: each tab is now a section of the settings center. */
export default async function LegacyRhSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; section?: string }>;
}) {
  const { tab, section } = await searchParams;
  const route = (tab && TAB_ROUTES[tab]) || "/parametres/rh";
  redirect(tab === "legal" && section ? `${route}?tab=${encodeURIComponent(section)}` : route);
}
