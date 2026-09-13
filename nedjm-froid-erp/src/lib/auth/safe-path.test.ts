import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/auth/safe-path";

describe("safeInternalPath", () => {
  it("allows normal relative paths", () => {
    expect(safeInternalPath("/referentiels/contrats")).toBe(
      "/referentiels/contrats",
    );
    expect(safeInternalPath("/")).toBe("/");
  });

  it("blocks open redirects", () => {
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("https://evil.com")).toBe("/");
    expect(safeInternalPath("evil.com")).toBe("/");
    expect(safeInternalPath("/\\evil")).toBe("/");
  });
});
