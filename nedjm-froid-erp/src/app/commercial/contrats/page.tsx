import { redirect } from "next/navigation";

/** Legacy stub — commercial contracts live under ref_contracts UI. */
export default function LegacyCommercialContratsPage() {
  redirect("/referentiels/contrats");
}
