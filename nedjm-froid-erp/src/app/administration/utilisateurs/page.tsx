import { redirect } from "next/navigation";

/** Legacy stub — use Paramètres → Utilisateurs. */
export default function LegacyAdminUsersPage() {
  redirect("/parametres/utilisateurs");
}
