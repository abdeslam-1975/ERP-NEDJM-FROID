// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/ui-arrange", () => ({
  saveArrangement: vi.fn(async () => ({ ok: true, data: { count: 0 } })),
  resetArrangement: vi.fn(async () => ({ ok: true, data: { count: 0 } })),
}));

const { ToolbarSlot, UiToolbar, ArrangeBar, RhArrange } = await import("@/components/layout/arrange");
const { UiLayoutProvider, useArrange } = await import("@/components/layout/ui-layout-context");
const { DEFAULT_LAYOUT } = await import("@/lib/ui/resolve");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Toolbar({ withColumns = true }: { withColumns?: boolean }) {
  return (
    <UiToolbar tabset="btn_rh_employees" className="bar">
      <>
        <ToolbarSlot id="new">
          <button type="button">Nouvel employé</button>
        </ToolbarSlot>
        <span>texte</span>
        {withColumns ? (
          <ToolbarSlot id="columns">
            <button type="button">Colonnes</button>
          </ToolbarSlot>
        ) : null}
      </>
    </UiToolbar>
  );
}

const texts = () => [...container.querySelectorAll(".bar > *")].map((el) => el.textContent);

describe("UiToolbar", () => {
  it("renders the buttons in the catalogue order, other elements staying in place", () => {
    act(() => root.render(<Toolbar />));
    expect(texts()).toEqual(["Colonnes", "texte", "Nouvel employé"]);
  });

  it("follows the user's own order and skips buttons not rendered", () => {
    const value = { ...DEFAULT_LAYOUT, personal: { "btn_rh_employees.new": { sort_order: 1, group_key: null } } };
    act(() =>
      root.render(
        <UiLayoutProvider value={value}>
          <Toolbar />
        </UiLayoutProvider>,
      ),
    );
    expect(texts()).toEqual(["Nouvel employé", "texte", "Colonnes"]);
    act(() =>
      root.render(
        <UiLayoutProvider value={value}>
          <Toolbar withColumns={false} />
        </UiLayoutProvider>,
      ),
    );
    expect(texts()).toEqual(["Nouvel employé", "texte"]);
  });

  it("makes the buttons draggable and inert while rearranging", () => {
    function Start() {
      const { start } = useArrange();
      return (
        <button type="button" id="start" onClick={start}>
          start
        </button>
      );
    }
    act(() =>
      root.render(
        <UiLayoutProvider value={DEFAULT_LAYOUT}>
          <Start />
          <Toolbar />
          <ArrangeBar />
        </UiLayoutProvider>,
      ),
    );
    expect(container.querySelector('[role="region"]')).toBeNull();
    act(() => (container.querySelector("#start") as HTMLButtonElement).click());
    expect(container.querySelector('[role="region"]')?.textContent).toContain("Réorganiser");
    const slots = container.querySelectorAll(".bar [aria-roledescription]");
    expect(slots.length).toBe(2);
    for (const slot of slots) expect(slot.firstElementChild?.className).toContain("pointer-events-none");
  });
});

describe("RhArrange", () => {
  it("sends a whole HR section to « Autres » and saves each tab with its new section", async () => {
    const { saveArrangement } = await import("@/lib/actions/ui-arrange");
    function Start() {
      const { start, active } = useArrange();
      return active ? <RhArrange /> : (
        <button type="button" id="start" onClick={start}>
          start
        </button>
      );
    }
    act(() =>
      root.render(
        <UiLayoutProvider value={DEFAULT_LAYOUT}>
          <Start />
          <ArrangeBar />
        </UiLayoutProvider>,
      ),
    );
    act(() => (container.querySelector("#start") as HTMLButtonElement).click());
    const column = (title: string) =>
      [...container.querySelectorAll("li")].find((li) => li.querySelector("span.truncate")?.textContent === title)!;
    act(() => column("Documents").querySelector<HTMLButtonElement>('button[type="button"]')!.click());
    expect(column("Autres").textContent).toContain("Attestations");
    expect(column("Documents").textContent).not.toContain("Attestations");

    const save = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Enregistrer"))!;
    await act(async () => save.click());
    const lists = vi.mocked(saveArrangement).mock.calls.at(-1)![0].lists;
    const rh = lists.find((l) => l.tabset === "rh")!;
    expect(rh.items.find((i) => i.key === "rh.attestations")?.group_key).toBe("group.rh_others");
    expect(rh.items.find((i) => i.key === "rh.paie")?.group_key).toBe("group.rh_payroll");
    expect(lists.some((l) => l.tabset === "rh_sections")).toBe(true);
  });
});
