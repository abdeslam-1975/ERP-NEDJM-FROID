import { redirect } from "next/navigation";

/** The presence legends live in Paramètres → Listes et codes. */
export default function LegacyLegendsPage() {
  redirect("/parametres/rh/listes");
}
