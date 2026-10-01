"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type Row,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Inbox, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

export type DataTableFeatures = typeof features;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- column value types differ per column
export type DataColumn<T extends RowData> = ColumnDef<DataTableFeatures, T, any>;

export type DataColumnMeta = {
  /** Name shown in the "Colonnes" menu when the header is not plain text. */
  label?: string;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
};

/** Typed column builder: `const col = dataColumns<Row>(); col.accessor("name", { header: "Nom" })`. */
export function dataColumns<T extends RowData>() {
  return createColumnHelper<DataTableFeatures, T>();
}

function metaOf(meta: unknown): DataColumnMeta {
  return (meta ?? {}) as DataColumnMeta;
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr");
}

export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  searchable = true,
  searchPlaceholder = "Rechercher…",
  searchText,
  initialSearch = "",
  pageSize = 25,
  initialSorting,
  toolbar,
  emptyTitle = "Aucune donnée",
  emptyBody,
  onRowClick,
  rowClassName,
  columnToggle = true,
  stickyHeader = true,
  maxHeight,
  footer,
  className,
}: {
  data: T[];
  columns: DataColumn<T>[];
  getRowId?: (row: T, index: number) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Text searched by the search box; by default the values of every column. */
  searchText?: (row: T) => string;
  /** Search box content on first render (for example `?q=` from the global search). */
  initialSearch?: string;
  /** 0 shows every row on one page. */
  pageSize?: number;
  initialSorting?: SortingState;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  columnToggle?: boolean;
  stickyHeader?: boolean;
  /** CSS height limit of the scrolling area (the header stays visible). */
  maxHeight?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const [globalFilter, setGlobalFilter] = useState(initialSearch);
  const paged = pageSize > 0;

  const table = useTable({
    features,
    columns,
    data,
    getRowId,
    initialState: {
      sorting: initialSorting ?? [],
      pagination: { pageIndex: 0, pageSize: paged ? pageSize : Number.MAX_SAFE_INTEGER },
    },
    state: { globalFilter },
    onGlobalFilterChange: (updater) => setGlobalFilter((prev) => (typeof updater === "function" ? updater(prev) : updater) ?? ""),
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row: Row<DataTableFeatures, T>, columnId: string, filterValue: unknown) => {
      const needle = normalize(filterValue).trim();
      if (!needle) return true;
      const haystack = searchText ? searchText(row.original) : row.getValue(columnId);
      return normalize(haystack).includes(needle);
    },
    // Parents often rebuild `data` on every render: the page must not jump back to 1 each time.
    autoResetPageIndex: false,
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;
  const lastPage = Math.max(0, pageCount - 1);

  useEffect(() => {
    if (pageIndex > lastPage) table.setPageIndex(lastPage);
  }, [pageIndex, lastPage, table]);

  const rows = table.getRowModel().rows;

  function search(value: string) {
    table.setGlobalFilter(value);
    table.setPageIndex(0);
  }

  const hideable = useMemo(
    () =>
      table
        .getAllLeafColumns()
        .filter((c) => c.getCanHide())
        .map((c) => ({
          column: c,
          label: metaOf(c.columnDef.meta).label ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the column list only changes with `columns`
    [columns, table],
  );

  const showToolbar = searchable || toolbar || (columnToggle && hideable.length > 1);

  return (
    <div className={cn("space-y-3", className)}>
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? (
            <label className="relative min-w-56 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/40" aria-hidden />
              <input
                value={globalFilter}
                onChange={(e) => search(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-xl border border-border/80 bg-surface pr-3 pl-9 text-sm outline-none transition placeholder:text-foreground/40 focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </label>
          ) : null}
          {toolbar}
          {columnToggle && hideable.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="md" className="ml-auto gap-2">
                  <Columns3 aria-hidden />
                  Colonnes
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideable.map(({ column, label }) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(Boolean(v))}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      <div className="ui-table-wrap data-table overflow-hidden rounded-2xl border">
        <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
          <table className="w-full text-sm">
            <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className={cn(stickyHeader && "bg-[var(--surface-muted)] shadow-[0_1px_0_var(--border)]")}>
                  {group.headers.map((header) => {
                    const meta = metaOf(header.column.columnDef.meta);
                    const sorted = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                        className={cn(
                          "h-10 px-3.5 align-middle text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-foreground/50 uppercase",
                          ALIGN[meta.align ?? "left"],
                          meta.headerClassName,
                        )}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn(
                              "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 uppercase transition hover:bg-surface hover:text-foreground",
                              sorted && "text-foreground",
                            )}
                          >
                            <table.FlexRender header={header} />
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3.5" aria-hidden />
                            ) : (
                              <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />
                            )}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody key={`${pageIndex}-${globalFilter}`} className="animate-in fade-in-0 duration-200">
              {rows.length ? (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = metaOf(cell.column.columnDef.meta);
                      return (
                        <td
                          key={cell.id}
                          className={cn("px-3.5 py-3 align-middle text-sm text-foreground/85", ALIGN[meta.align ?? "left"], meta.className)}
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length || 1}>
                    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-muted text-brand">
                        <Inbox className="size-5" aria-hidden />
                      </div>
                      <p className="font-display text-base font-semibold text-foreground">
                        {globalFilter ? "Aucun résultat pour cette recherche" : emptyTitle}
                      </p>
                      {!globalFilter && emptyBody ? <p className="max-w-sm text-sm text-foreground/55">{emptyBody}</p> : null}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {footer ? <tfoot>{footer}</tfoot> : null}
          </table>
        </div>
        {paged && pageCount > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3.5 py-2.5 text-xs text-foreground/60">
            <span>
              {filteredCount} ligne{filteredCount > 1 ? "s" : ""} · page {pageIndex + 1} / {pageCount}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Page précédente">
                <ChevronLeft aria-hidden />
                Précédent
              </Button>
              <Button variant="ghost" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Page suivante">
                Suivant
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
        ) : filteredCount > 0 && (globalFilter || !paged) ? (
          <div className="border-t border-border/60 px-3.5 py-2 text-xs text-foreground/50">
            {filteredCount} ligne{filteredCount > 1 ? "s" : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}
