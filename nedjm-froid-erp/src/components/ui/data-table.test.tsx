// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataTable, dataColumns } from "@/components/ui/data-table";

type Person = { id: string; name: string; city: string; salary: number };

const people: Person[] = [
  { id: "1", name: "Amine", city: "Oran", salary: 85000 },
  { id: "2", name: "Sara", city: "Alger", salary: 72500 },
  { id: "3", name: "Yacine", city: "Béjaïa", salary: 64000 },
  { id: "4", name: "Nour", city: "Oran", salary: 58900 },
  { id: "5", name: "Lina", city: "Sétif", salary: 91000 },
];

const col = dataColumns<Person>();
const columns = [
  col.accessor("name", { header: "Nom" }),
  col.accessor("city", { header: "Ville" }),
  col.accessor("salary", { header: "Salaire", meta: { align: "right" } }),
];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function bodyNames(): string[] {
  return [...host.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent ?? "");
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("DataTable", () => {
  it("renders every row and filters with the search box (accents ignored)", () => {
    act(() => root.render(<DataTable data={people} columns={columns} getRowId={(p) => p.id} />));
    expect(bodyNames()).toEqual(["Amine", "Sara", "Yacine", "Nour", "Lina"]);

    const search = host.querySelector<HTMLInputElement>("input[placeholder='Rechercher…']")!;
    act(() => type(search, "bejaia"));
    expect(bodyNames()).toEqual(["Yacine"]);

    act(() => type(search, "zzz"));
    expect(host.textContent).toContain("Aucun résultat pour cette recherche");
  });

  it("sorts when a header is clicked", () => {
    act(() => root.render(<DataTable data={people} columns={columns} />));
    const salaryHeader = [...host.querySelectorAll("th button")].find((b) => b.textContent?.includes("Salaire"))!;
    act(() => (salaryHeader as HTMLButtonElement).click());
    const first = bodyNames();
    act(() => (salaryHeader as HTMLButtonElement).click());
    const second = bodyNames();
    expect(new Set([first[0], second[0]])).toEqual(new Set(["Nour", "Lina"]));
    expect(first).toEqual([...second].reverse());
  });

  it("paginates and uses the initial sorting", () => {
    act(() =>
      root.render(<DataTable data={people} columns={columns} pageSize={2} initialSorting={[{ id: "name", desc: false }]} />),
    );
    expect(bodyNames()).toEqual(["Amine", "Lina"]);
    expect(host.textContent).toContain("page 1 / 3");
    const next = host.querySelector<HTMLButtonElement>("button[aria-label='Page suivante']")!;
    act(() => next.click());
    expect(bodyNames()).toEqual(["Nour", "Sara"]);
  });

  it("keeps the current page when the parent re-renders with a new array, and clamps when rows disappear", () => {
    const render = (data: Person[]) =>
      act(() => root.render(<DataTable data={data} columns={columns} pageSize={2} initialSorting={[{ id: "name", desc: false }]} />));
    render([...people]);
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label='Page suivante']")!.click());
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label='Page suivante']")!.click());
    expect(bodyNames()).toEqual(["Yacine"]);
    render([...people]);
    expect(bodyNames()).toEqual(["Yacine"]);
    render(people.slice(0, 2));
    expect(bodyNames()).toEqual(["Amine", "Sara"]);
  });

  it("shows the empty state", () => {
    act(() => root.render(<DataTable data={[] as Person[]} columns={columns} emptyTitle="Aucun employé" />));
    expect(host.textContent).toContain("Aucun employé");
  });
});
