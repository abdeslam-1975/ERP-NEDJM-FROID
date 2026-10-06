import { redirect } from "next/navigation";

export default function IrgBaremePage() {
  redirect("/parametres/rh/cotisations?tab=irg");
}
