import { redirect } from "next/navigation";

export default function ContratsPage() {
  redirect("/rh/documents?onglet=contrats");
}
