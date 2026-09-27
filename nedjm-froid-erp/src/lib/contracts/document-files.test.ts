import { describe, expect, it } from "vitest";
import {
  CONTRACT_DOC_MAX_BYTES,
  contractDocIssue,
  contractDocPath,
  isContractDocPath,
  resolveContractDocType,
} from "@/lib/contracts/document-files";

const contractId = "dd0374c0-ebe0-44a9-91d6-0b1024de3664";
const fileId = "6f1c2b8e-3a4d-4e5f-9a0b-1c2d3e4f5a6b";

describe("contract document files", () => {
  it("accepte PDF, Word, Excel et photos d'après l'extension", () => {
    expect(resolveContractDocType("Contrat El Gassi.PDF")?.format).toBe("PDF");
    expect(resolveContractDocType("avenant.docx")?.format).toBe("WORD");
    expect(resolveContractDocType("bpu.xlsx")?.format).toBe("EXCEL");
    expect(resolveContractDocType("page1.jpeg")?.mime).toBe("image/jpeg");
    expect(resolveContractDocType("IMG_0001.HEIC")?.format).toBe("IMAGE");
    expect(resolveContractDocType("script.exe")).toBeNull();
  });

  it("refuse les fichiers vides, trop lourds ou d'un format inconnu", () => {
    expect(contractDocIssue("contrat.pdf", 1024)).toBeNull();
    expect(contractDocIssue("contrat.pdf", 0)).toBe("Fichier vide.");
    expect(contractDocIssue("contrat.pdf", CONTRACT_DOC_MAX_BYTES + 1)).toContain("25 Mo");
    expect(contractDocIssue("archive.zip", 1024)).toContain("Formats acceptés");
  });

  it("n'accepte qu'un chemin rangé sous le bon contrat", () => {
    const path = contractDocPath(contractId, fileId, "pdf");
    expect(isContractDocPath(path, contractId)).toBe(true);
    expect(isContractDocPath(path, "00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isContractDocPath(`${contractId}/../x.pdf`, contractId)).toBe(false);
    expect(isContractDocPath(`${contractId}/${fileId}.pdf/extra`, contractId)).toBe(false);
  });
});
