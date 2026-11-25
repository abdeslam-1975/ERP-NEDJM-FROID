import { describe, expect, it } from "vitest";
import {
  CONTRACT_DOCUMENT,
  FICHE_DOCUMENT,
  SS_DOCUMENT,
  affiliationReady,
  canPromote,
  contractTermsChanged,
  cycleStep,
  identityChanged,
  identityRequirements,
  type CycleDocument,
} from "@/lib/hr/candidate-cycle";

const required = [{ code: "CNI" }, { code: "BIRTH" }];

function doc(partial: Partial<CycleDocument> & Pick<CycleDocument, "doc_code" | "status">): CycleDocument {
  return {
    family: partial.doc_code === FICHE_DOCUMENT || partial.doc_code === CONTRACT_DOCUMENT ? "PRODUCED" : "INCOMING",
    is_current: true,
    ...partial,
  };
}

describe("identityRequirements", () => {
  it("keeps the social security attestation out of the candidate step", () => {
    const slots = identityRequirements([
      { kind: "document_type", code: "CNI", label_fr: "CNI", extra: { upload_slot: true, required_for_save: true }, sort_order: 2 },
      { kind: "document_type", code: SS_DOCUMENT, label_fr: "CNAS", extra: { upload_slot: true, required_for_save: true }, sort_order: 1 },
      { kind: "document_type", code: "PHOTO_ID", label_fr: "Photo", extra: { upload_slot: true }, sort_order: 3 },
    ]);
    expect(slots.map((slot) => slot.code)).toEqual(["CNI"]);
  });

  it("falls back to the identity card and the birth certificate", () => {
    const slots = identityRequirements([
      { kind: "document_type", code: "CNI", label_fr: "CNI", extra: { upload_slot: true }, sort_order: 20 },
      { kind: "document_type", code: "BIRTH", label_fr: "Naissance", extra: { upload_slot: true }, sort_order: 10 },
      { kind: "document_type", code: "DIPLOMAS", label_fr: "Diplômes", extra: { upload_slot: true }, sort_order: 5 },
    ]);
    expect(slots.map((slot) => slot.code)).toEqual(["BIRTH", "CNI"]);
  });
});

describe("cycleStep", () => {
  it("stays on identity until every required piece is validated", () => {
    expect(
      cycleStep({
        promoted: false,
        requiredIdentity: required,
        docs: [doc({ doc_code: "CNI", status: "VALIDATED" }), doc({ doc_code: "BIRTH", status: "UPLOADED" })],
      }),
    ).toBe("IDENTITY");
  });

  it("opens the fiche once the pieces are validated", () => {
    expect(
      cycleStep({
        promoted: false,
        requiredIdentity: required,
        docs: [doc({ doc_code: "CNI", status: "VALIDATED" }), doc({ doc_code: "BIRTH", status: "VALIDATED" })],
      }),
    ).toBe("FICHE");
  });

  it("opens the contract once the signed fiche is archived", () => {
    expect(
      cycleStep({
        promoted: false,
        requiredIdentity: required,
        docs: [
          doc({ doc_code: "CNI", status: "VALIDATED" }),
          doc({ doc_code: "BIRTH", status: "VALIDATED" }),
          doc({ doc_code: FICHE_DOCUMENT, status: "ARCHIVED" }),
          doc({ doc_code: CONTRACT_DOCUMENT, status: "GENERATED" }),
        ],
      }),
    ).toBe("CONTRACT");
  });

  it("does not treat a generated PDF as the archive", () => {
    expect(
      cycleStep({
        promoted: false,
        requiredIdentity: required,
        docs: [
          doc({ doc_code: "CNI", status: "VALIDATED" }),
          doc({ doc_code: "BIRTH", status: "VALIDATED" }),
          doc({ doc_code: FICHE_DOCUMENT, status: "PENDING_REVIEW" }),
        ],
      }),
    ).toBe("FICHE");
  });

  it("stays promoted after the person enters the employee base", () => {
    expect(cycleStep({ promoted: true, requiredIdentity: required, docs: [] })).toBe("PROMOTED");
  });

  it("allows promotion only when the signed contract of the current version is archived", () => {
    const docs = [
      doc({ doc_code: "CNI", status: "VALIDATED" }),
      doc({ doc_code: "BIRTH", status: "VALIDATED" }),
      doc({ doc_code: FICHE_DOCUMENT, status: "ARCHIVED" }),
      doc({ doc_code: CONTRACT_DOCUMENT, status: "ARCHIVED", is_current: false }),
      doc({ doc_code: CONTRACT_DOCUMENT, status: "GENERATED" }),
    ];
    expect(canPromote({ promoted: false, requiredIdentity: required, docs })).toBe(false);
    docs[4] = doc({ doc_code: CONTRACT_DOCUMENT, status: "ARCHIVED" });
    expect(canPromote({ promoted: false, requiredIdentity: required, docs })).toBe(true);
  });
});

describe("voiding a signed copy", () => {
  it("detects an identity change printed on the fiche", () => {
    const before = { last_name: "BENALI", first_name: "KARIM", nin: "1", birth_date: "1990-01-02" };
    expect(identityChanged(before, { ...before })).toBe(false);
    expect(identityChanged(before, { ...before, birth_date: "1990-01-03" })).toBe(true);
  });

  it("detects a contract term change", () => {
    const before = { site_id: "s", poste_fr: "Frigoriste", salaire_base_monthly: 50000, contract_start: "2026-12-01" };
    expect(contractTermsChanged(before, { ...before, salaire_base_monthly: 50000 })).toBe(false);
    expect(contractTermsChanged(before, { ...before, salaire_base_monthly: 52000 })).toBe(true);
    expect(contractTermsChanged(before, { ...before, client_terms_key: "poste" })).toBe(true);
    expect(contractTermsChanged({ ...before, client_terms_key: "poste" }, { ...before, client_terms_key: "poste" })).toBe(false);
  });
});

describe("affiliationReady", () => {
  it("asks for a 12-digit number and a start date", () => {
    expect(affiliationReady("123", "2026-12-01")).toMatch(/12/);
    expect(affiliationReady("123456789012", "")).toMatch(/Date/);
    expect(affiliationReady("12 345 678 9012", "2026-12-15")).toBeNull();
  });
});
