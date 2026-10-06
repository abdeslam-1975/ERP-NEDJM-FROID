import { redirect } from "next/navigation";

export default function ReferentielsIrgPage() {
  redirect("/parametres/rh/cotisations?tab=irg");
}
