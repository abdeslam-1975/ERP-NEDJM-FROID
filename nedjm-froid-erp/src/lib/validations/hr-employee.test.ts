import { describe, expect, it } from "vitest";
import { hrEmployeeUpsertSchema } from "@/lib/validations/hr-employee";

describe("hrEmployeeUpsertSchema", () => {
  it("uppercases matricule and accepts minimal create payload", () => {
    const parsed = hrEmployeeUpsertSchema.parse({
      matricule: "nf-0100",
      last_name: "Test",
      first_name: "Agent",
    });
    expect(parsed.matricule).toBe("NF-0100");
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed.irg_category).toBe("STANDARD");
    expect(parsed.nss == null).toBe(true);
  });

  it("rejects empty names", () => {
    const result = hrEmployeeUpsertSchema.safeParse({
      matricule: "NF-1",
      last_name: " ",
      first_name: "A",
    });
    expect(result.success).toBe(false);
  });
});
