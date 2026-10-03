// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolbarSlot, UiToolbar } from "@/components/layout/arrange";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("UiToolbar", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps keys unique when slots sit in a fragment next to other children", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(
      <UiToolbar tabset="btn_rh_payroll_period">
        <label>Chantier</label>
        <label>Mois</label>
        <ToolbarSlot id="view_month">
          <button>Voir ce mois</button>
        </ToolbarSlot>
        <>
          <ToolbarSlot id="show_bulletin">
            <button>Afficher</button>
          </ToolbarSlot>
          <ToolbarSlot id="print">
            <button>Imprimer</button>
          </ToolbarSlot>
        </>
      </UiToolbar>,
    ));
    expect(container.textContent).toContain("Afficher");
    expect(container.textContent).toContain("Imprimer");
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    act(() => root.unmount());
  });
});
