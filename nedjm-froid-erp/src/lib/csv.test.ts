import { describe, expect, it } from "vitest";
import { spreadsheetCell } from "@/lib/csv";

describe("spreadsheetCell", () => {
  it("neutralizes text that a spreadsheet would evaluate", () => {
    expect(spreadsheetCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(spreadsheetCell("+33 cmd")).toBe("'+33 cmd");
    expect(spreadsheetCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(spreadsheetCell("-x")).toBe("'-x");
  });

  it("leaves numbers and ordinary text unchanged", () => {
    expect(spreadsheetCell("-1250.50")).toBe("-1250.50");
    expect(spreadsheetCell("421000")).toBe("421000");
    expect(spreadsheetCell("Paie 09/2026 - Net")).toBe("Paie 09/2026 - Net");
    expect(spreadsheetCell("a;b")).toBe('"a;b"');
  });
});
