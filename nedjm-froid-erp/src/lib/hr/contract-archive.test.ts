import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { contractArchiveType } from "@/lib/hr/contract-archive";
import { hrFileSchema } from "@/lib/validations/hr";

describe("contractArchiveType", () => {
  it("fits the file document type column for any contract id", () => {
    const type = contractArchiveType("3F2504E0-4F89-11D3-9A0C-0305E82C3301");
    expect(type).toBe("CONTRAT_3f2504e04f8911d39a0c0305e82c3301");
    expect(type).toHaveLength(40);
    expect(
      hrFileSchema.safeParse({ employee_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", doc_type_code: type }).success,
    ).toBe(true);
  });
});
