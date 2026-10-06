import { AppShell } from "@/components/layout/app-shell";
import { HrDocumentsSettings } from "@/components/rh/hr-documents-settings";
import { RhAlert, RhPage, RhPageHeader } from "@/components/rh/rh-ui";
import { listDocTemplateSummaries } from "@/lib/actions/doc-templates";
import { getHrCompanyProfile } from "@/lib/actions/hr-company";
import { listCustomDocDefs, listDocFonts } from "@/lib/actions/hr-custom-docs";
import { listHrEmployeeFields } from "@/lib/actions/hr-employees";
import { getHrFicheSettings } from "@/lib/actions/hr-fiche";
import { loadHrLookups } from "@/lib/actions/hr-lookups";
import { DEFAULT_FICHE_SETTINGS } from "@/lib/hr/fiche-settings";

export const dynamic = "force-dynamic";

export default async function DocumentsSettingsPage() {
  const [company, fiche, fields, lookups, customDefs, docFonts, summaries] = await Promise.all([
    getHrCompanyProfile(),
    getHrFicheSettings(),
    listHrEmployeeFields(),
    loadHrLookups(),
    listCustomDocDefs(),
    listDocFonts(),
    listDocTemplateSummaries(),
  ]);
  return (
    <AppShell title="Modèles de documents">
      <RhPage>
        <RhPageHeader
          eyebrow="Paramètres · Ressources humaines"
          title="Modèles de documents"
          description="L'identité de l'entreprise, les modèles fournis par l'application, vos propres documents et leurs polices."
        />
        {company.ok ? (
          <HrDocumentsSettings
            company={company.data.profile}
            canEdit={company.data.canEdit}
            fiche={fiche.ok ? fiche.data : DEFAULT_FICHE_SETTINGS}
            fields={fields.ok ? fields.data : []}
            catalogs={lookups.catalogs}
            kinds={lookups.kinds}
            custom={{
              defs: customDefs.ok ? customDefs.data.defs : [],
              canEdit: customDefs.ok ? customDefs.data.canEdit : false,
              fonts: docFonts.ok ? docFonts.data : [],
              error: (!customDefs.ok ? customDefs.error : undefined) || (!docFonts.ok ? docFonts.error : undefined),
            }}
            summaries={summaries.ok ? summaries.data : {}}
          />
        ) : (
          <RhAlert tone="danger">{company.error}</RhAlert>
        )}
      </RhPage>
    </AppShell>
  );
}
