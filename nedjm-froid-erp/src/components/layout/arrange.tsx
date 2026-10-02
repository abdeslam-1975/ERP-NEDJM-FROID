"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListOrdered, Move, RotateCcw, X } from "lucide-react";
import { useArrange, useArrangeableList, useUiLayout } from "@/components/layout/ui-layout-context";
import { Button } from "@/components/ui/button";
import { RH_SECTIONS_TABSET, findItem, findTabset, itemKey, keysOfTabset } from "@/lib/ui/registry";
import { applyTabs, resolveNav } from "@/lib/ui/resolve";
import { cn } from "@/lib/utils";

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function moved(ids: string[], event: DragEndEvent): string[] | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const from = ids.indexOf(String(active.id));
  const to = ids.indexOf(String(over.id));
  return from < 0 || to < 0 ? null : arrayMove(ids, from, to);
}

/* —— a row of tabs or buttons —— */

function StripSlot({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative cursor-grab touch-none rounded-xl outline-2 outline-offset-2 outline-brand/60 outline-dashed select-none active:cursor-grabbing",
        isDragging && "z-30 opacity-80 shadow-lg",
      )}
      {...attributes}
      {...listeners}
    >
      <div className="pointer-events-none">{children}</div>
    </div>
  );
}

function StripDnd({
  tabset,
  ids,
  nodes,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tabset: string; ids: string[]; nodes: ReactNode[] }) {
  const { reorder } = useArrange();
  const sensors = useDndSensors();
  const dndId = useId();
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        const next = moved(ids, event);
        if (next) reorder(tabset, next);
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className} {...rest}>
          {nodes.map((node, index) => (
            <StripSlot key={ids[index]} id={ids[index]}>
              {node}
            </StripSlot>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Container of a tab bar: renders exactly `<div className>` with its children, and lets the tabs be dragged while
 * « Réorganiser » is on. `ids` are the tab ids, in the order of the children.
 */
export function SortableStrip({
  tabset,
  ids,
  children,
  ...rest
}: ComponentProps<"div"> & { tabset?: string; ids: string[] }) {
  const { active } = useArrange();
  const nodes = Children.toArray(children);
  if (!active || !tabset || !keysOfTabset(tabset) || nodes.length !== ids.length || ids.length < 2) {
    return <div {...rest}>{children}</div>;
  }
  return <StripDnd tabset={tabset} ids={ids} nodes={nodes} {...rest} />;
}

/* —— page action buttons —— */

/** One button (or link) of a UiToolbar; `id` is its key in the interface catalogue (level E). */
export function ToolbarSlot({ children }: { id: string; children: ReactNode }) {
  return <>{children}</>;
}

type Slot = { id: string; label: string; node: ReactElement; index: number };

function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((node) =>
    isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment ? flatten(node.props.children) : [node],
  );
}

/**
 * Header buttons of a page, in the order chosen for the user. Elements that are not a ToolbarSlot (search box,
 * text…) stay where they are; the slots are reordered among themselves.
 */
export function UiToolbar({ tabset, children, ...rest }: ComponentProps<"div"> & { tabset: string }) {
  const layout = useUiLayout();
  const { active } = useArrange();
  const nodes = flatten(children);
  const slots: Slot[] = [];
  nodes.forEach((node, index) => {
    if (isValidElement<{ id: string }>(node) && node.type === ToolbarSlot) {
      slots.push({ id: node.props.id, label: findItem(itemKey(tabset, node.props.id))?.item.labelFr ?? node.props.id, node, index });
    }
  });
  const ordered = applyTabs(layout, tabset, slots);
  useArrangeableList(tabset, ordered);

  if (active && ordered.length > 1) {
    const others = nodes.filter((_, index) => !slots.some((s) => s.index === index));
    return (
      <div {...rest}>
        {others}
        <StripDnd tabset={tabset} ids={ordered.map((s) => s.id)} nodes={ordered.map((s) => s.node)} className="contents" />
      </div>
    );
  }
  const out: ReactNode[] = [...nodes];
  slots.forEach((slot, i) => {
    out[slot.index] = ordered[i]?.node ?? null;
  });
  return <div {...rest}>{out}</div>;
}

/* —— vertical lists (panel, settings) —— */

export type HandleProps = HTMLAttributes<HTMLElement>;

function SortableRow({ id, children }: { id: string; children: (handle: HandleProps, dragging: boolean) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-30")}
    >
      {children({ ...attributes, ...listeners }, isDragging)}
    </li>
  );
}

/** Vertical list reordered by dragging the handle each row receives (keyboard: space, arrows, space). */
export function SortableRows({
  ids,
  onReorder,
  className,
  children,
}: {
  ids: string[];
  onReorder: (ids: string[]) => void;
  className?: string;
  children: (id: string, handle: HandleProps, dragging: boolean) => ReactNode;
}) {
  const sensors = useDndSensors();
  const dndId = useId();
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        const next = moved(ids, event);
        if (next) onReorder(next);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {ids.map((id) => (
            <SortableRow key={id} id={id}>
              {(handle, dragging) => children(id, handle, dragging)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export function DragHandle({ label, ...handle }: HandleProps & { label: string }) {
  return (
    <button
      type="button"
      aria-label={`Déplacer ${label}`}
      className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-foreground/45 hover:bg-surface-muted hover:text-foreground active:cursor-grabbing"
      {...handle}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

/* —— side menu: groups and their modules —— */

export type NavColumn = { key: string; title: string; items: { key: string; label: string }[] };

const groupId = (key: string) => `group:${key}`;

function NavGroupBox({
  column,
  tone,
  children,
}: {
  column: NavColumn;
  tone: "sidebar" | "panel";
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: groupId(column.key),
    data: { type: "group" },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "rounded-xl border border-dashed p-1.5",
        tone === "sidebar" ? "border-white/30" : "border-border",
        isDragging && "z-30 opacity-80",
      )}
    >
      <div
        className={cn(
          "flex cursor-grab touch-none items-center gap-1.5 px-1.5 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase select-none active:cursor-grabbing",
          tone === "sidebar" ? "text-white/60" : "text-foreground/50",
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" aria-hidden />
        {column.title}
      </div>
      {children}
    </li>
  );
}

function NavItemRow({ id, label, tone }: { id: string; label: string; tone: "sidebar" | "panel" }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data: { type: "item" } });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex cursor-grab touch-none items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold select-none active:cursor-grabbing",
        tone === "sidebar" ? "bg-white/10 text-white hover:bg-white/15" : "border border-border/70 bg-surface hover:bg-surface-muted",
        isDragging && "z-30 opacity-80 shadow-lg",
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-3.5 shrink-0 opacity-60" aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </li>
  );
}

/** Groups and modules of the side menu, both draggable; a module can be dropped into another group. */
export function NavArrange({ tone = "panel" }: { tone?: "sidebar" | "panel" }) {
  const layout = useUiLayout();
  const { reorderNav } = useArrange();
  const sensors = useDndSensors();
  const dndId = useId();
  const source = useMemo<NavColumn[]>(
    () =>
      resolveNav(layout, { includeEmpty: true }).map((g) => ({
        key: g.key,
        title: g.titleFr,
        items: g.items.map((i) => ({ key: i.key, label: i.label })),
      })),
    [layout],
  );
  const [columns, setColumns] = useState(source);
  const [shownSource, setShownSource] = useState(source);
  if (shownSource !== source) {
    setShownSource(source);
    setColumns(source);
  }

  const labels = useMemo(() => new Map(source.flatMap((c) => c.items.map((i) => [i.key, i.label] as const))), [source]);

  function containerOf(id: string, cols: NavColumn[]): string | null {
    if (id.startsWith("group:")) return id.slice(6);
    return cols.find((c) => c.items.some((i) => i.key === id))?.key ?? null;
  }

  const collision: CollisionDetection = (args) => {
    if (args.active.data.current?.type === "group") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "group"),
      });
    }
    return closestCorners(args);
  };

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.data.current?.type === "group") return;
    setColumns((cols) => {
      const from = containerOf(String(active.id), cols);
      const to = containerOf(String(over.id), cols);
      if (!from || !to || from === to) return cols;
      const item = cols.find((c) => c.key === from)!.items.find((i) => i.key === active.id)!;
      return cols.map((c) => {
        if (c.key === from) return { ...c, items: c.items.filter((i) => i.key !== active.id) };
        if (c.key !== to) return c;
        const at = c.items.findIndex((i) => i.key === over.id);
        const items = [...c.items];
        items.splice(at < 0 ? items.length : at, 0, item);
        return { ...c, items };
      });
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    let next = columns;
    if (over && active.id !== over.id) {
      if (active.data.current?.type === "group") {
        const ids = columns.map((c) => groupId(c.key));
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from >= 0 && to >= 0) next = arrayMove(columns, from, to);
      } else {
        const container = containerOf(String(active.id), columns);
        next = columns.map((c) => {
          if (c.key !== container) return c;
          const from = c.items.findIndex((i) => i.key === active.id);
          const to = c.items.findIndex((i) => i.key === over.id);
          return from >= 0 && to >= 0 ? { ...c, items: arrayMove(c.items, from, to) } : c;
        });
      }
    }
    setColumns(next);
    reorderNav(next.map((c) => ({ key: c.key, items: c.items.map((i) => i.key) })));
  }

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={collision} onDragOver={onDragOver} onDragEnd={onDragEnd}>
      <SortableContext items={columns.map((c) => groupId(c.key))} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {columns.map((column) => (
            <NavGroupBox key={column.key} column={column} tone={tone}>
              <SortableContext items={column.items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
                <ul className="min-h-8 space-y-1">
                  {column.items.map((item) => (
                    <NavItemRow key={item.key} id={item.key} label={labels.get(item.key) ?? item.label} tone={tone} />
                  ))}
                </ul>
              </SortableContext>
            </NavGroupBox>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/* —— « Réorganiser » mode —— */

/** Top bar button that turns the mode on (nothing can be dragged until it is). */
export function ArrangeButton() {
  const { active, start } = useArrange();
  return (
    <button
      type="button"
      onClick={start}
      disabled={active}
      aria-pressed={active}
      title="Réorganiser la page : déplacer les onglets, le menu et les boutons · إعادة الترتيب"
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold shadow-[var(--card-shadow)] transition",
        active
          ? "border-brand bg-brand text-white"
          : "border-border bg-surface text-foreground/75 hover:bg-brand-muted hover:text-foreground",
      )}
    >
      <Move className="size-4" aria-hidden />
      <span className="hidden md:inline">Réorganiser</span>
    </button>
  );
}

export function ArrangeBar() {
  const arrange = useArrange();
  const [panel, setPanel] = useState(false);
  if (!arrange.active) return null;

  return (
    <>
      {panel ? (
        <aside
          aria-label="Listes de la page"
          className="fixed inset-y-3 right-3 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <p className="font-semibold text-foreground">Listes de la page · قوائم الصفحة</p>
              <p className="text-xs text-foreground/55">Faites glisser les lignes pour changer l&apos;ordre.</p>
            </div>
            <button
              type="button"
              onClick={() => setPanel(false)}
              className="inline-flex size-9 items-center justify-center rounded-xl text-foreground/60 hover:bg-surface-muted"
              aria-label="Fermer"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <section className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Menu latéral · القائمة الجانبية</p>
              <NavArrange />
            </section>
            {arrange.lists.map((list) => (
              <PanelList key={list.tabset} tabset={list.tabset} items={list.items} />
            ))}
          </div>
        </aside>
      ) : null}

      <div
        role="region"
        aria-label="Réorganiser"
        className="fixed bottom-4 left-1/2 z-[60] flex w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-brand/40 bg-surface p-3 shadow-2xl"
      >
        <Move className="size-5 shrink-0 text-brand" aria-hidden />
        <p className="min-w-48 flex-1 text-sm text-foreground/75">
          <span className="font-semibold text-foreground">Réorganiser · إعادة الترتيب</span> — faites glisser les onglets, les
          menus et les boutons encadrés.
        </p>
        {arrange.canShare ? (
          <div role="radiogroup" aria-label="Appliquer à" className="flex rounded-xl border border-border/80 p-0.5 text-xs font-semibold">
            {(
              [
                ["me", "Pour moi"],
                ["all", "Pour tout le monde"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={arrange.target === value}
                onClick={() => arrange.setTarget(value)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5",
                  arrange.target === value ? "bg-brand text-white" : "text-foreground/65 hover:bg-surface-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => setPanel((v) => !v)} aria-pressed={panel}>
          <ListOrdered aria-hidden /> Listes
        </Button>
        <Button variant="ghost" size="sm" disabled={arrange.pending} onClick={arrange.reset}>
          <RotateCcw aria-hidden /> {arrange.target === "all" ? "Ordre d'origine" : "Ordre de l'administrateur"}
        </Button>
        <Button variant="ghost" size="sm" disabled={arrange.pending} onClick={arrange.cancel}>
          Annuler
        </Button>
        <Button size="sm" disabled={arrange.pending} onClick={arrange.save}>
          {arrange.dirty ? "Enregistrer · حفظ" : "Terminer"}
        </Button>
        {arrange.error ? <p className="w-full text-sm text-alert-critical">{arrange.error}</p> : null}
      </div>
    </>
  );
}

function PanelList({ tabset, items }: { tabset: string; items: { id: string; label: string }[] }) {
  const { reorder } = useArrange();
  const def = findTabset(tabset);
  const title = def?.titleFr ?? (tabset === RH_SECTIONS_TABSET ? "Barre RH — sections" : null);
  if (!title || items.length < 2) return null;
  const labels = new Map(items.map((i) => [i.id, i.label]));
  return (
    <section className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-foreground/55">
          {def?.kind === "toolbar" ? "Boutons · " : "Onglets · "}
          {def?.whereFr ?? "Ressources humaines"}
        </p>
      </div>
      <SortableRows ids={items.map((i) => i.id)} onReorder={(ids) => reorder(tabset, ids)} className="space-y-1">
        {(id, handle, dragging) => (
          <div
            className={cn(
              "flex items-center gap-1 rounded-lg border border-border/70 bg-surface pr-2 text-sm",
              dragging && "shadow-lg",
            )}
          >
            <DragHandle label={labels.get(id) ?? id} {...handle} />
            <span className="min-w-0 truncate">{labels.get(id) ?? id}</span>
          </div>
        )}
      </SortableRows>
    </section>
  );
}
