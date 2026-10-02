import { Award, FileBadge, FilePenLine, Mail, Plane, Receipt } from "lucide-react";
import { RhShell } from "@/components/rh/rh-shell";
import { DocumentsManager } from "@/components/rh/documents-manager";
import { DocumentTypeCards, type DocumentTypeCard } from "@/components/rh/document-type-cards";
import { RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import {
  listHrCorrespondences,
  listHrFiles,
} from "@/lib/actions/hr-documents";
import { listHrContracts } from "@/lib/actions/hr-contracts";
import { listHrEmployeeRows } from "@/lib/actions/hr-employees";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import type { MissionContractHint } from "@/lib/hr/mission-order";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ nouveau?: string }>;
}) {
  const sp = await searchParams;
  const [files, corr, employees, lookups, contracts, fiche] = await Promise.all([
    listHrFiles(),
    listHrCorrespondences(),
    listHrEmployeeRows(),
    loadHrLookups(),
    listHrContracts(),
    getHrFicheSettings(),
  ]);
  const missionContracts: MissionContractHint[] = contracts.ok
    ? contracts.data.map((row) => ({
        employee_id: row.employee_id,
        site_id: row.site_id,
        poste_fr: row.poste_fr,
        poste_ar: row.poste_ar,
        affectation_principale: row.affectation_principale,
        status: row.status,
        start_date: row.start_date,
      }))
    : [];

  const corrRows = corr.ok ? corr.data : [];
  const countOf = (...types: string[]) => corrRows.filter((r) => types.includes(r.type_code)).length;
  const cards: DocumentTypeCard[] = [
    {
      key: "attest",
      title: "Attestation de travail",
      icon: FileBadge,
      color: "#3b6ef5",
      count: countOf("ATTEST"),
      generate: "/rh/attestations",
    },
    {
      key: "certif",
      title: "Certificat de travail",
      icon: Award,
      color: "#8b5cf6",
      count: countOf("CERTIF"),
      generate: "/rh/attestations",
    },
    {
      key: "om",
      title: "Ordre de mission",
      icon: Plane,
      color: "#0ea5e9",
      count: countOf("OM"),
      open: { href: "#registre", label: "Registre", down: true },
      generate: "/rh/documents?nouveau=om",
    },
    {
      key: "contract",
      title: "Contrat de travail",
      icon: FilePenLine,
      color: "#14b8a6",
      count: contracts.ok ? contracts.data.length : null,
      open: { href: "/rh/contrats", label: "Ouvrir" },
    },
    {
      key: "slip",
      title: "Bulletin de paie",
      icon: Receipt,
      color: "#f59e0b",
      count: null,
      open: { href: "/rh/paie/bulletins", label: "Ouvrir" },
    },
    {
      key: "letter",
      title: "Lettre administrative",
      icon: Mail,
      color: "#ec4899",
      count: countOf("STC", "MED1", "MED2"),
      generate: "/rh/attestations",
    },
  ];

  return (
    <RhShell title="Documents RH">
      <RhPage>
        <RhPageHeader eyebrow="Modèles et documents RH" title="Documents" />
        <DocumentTypeCards cards={cards} />
      </RhPage>
      <div id="registre" className="mt-8 scroll-mt-32">
      <DocumentsManager
        files={files.ok ? files.data : []}
        correspondences={corr.ok ? corr.data : []}
        employees={employees.ok ? employees.data : []}
        sites={lookups.sites}
        catalogs={lookups.catalogs}
        contracts={missionContracts}
        letterheadUrl={fiche.ok ? fiche.data.letterhead_url : null}
        openMission={sp.nouveau === "om"}
        loadError={
          (!files.ok && files.error) ||
          (!corr.ok && corr.error) ||
          lookups.error ||
          undefined
        }
      />
      </div>
    </RhShell>
  );
}
