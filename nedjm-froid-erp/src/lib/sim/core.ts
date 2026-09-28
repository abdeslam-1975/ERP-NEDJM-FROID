/** Generic simulation engine: typed variables, overrides and influence tracking. */

import type { DocRender } from "@/lib/doc/registry";

export type SimValue = number | string | boolean;

export type SimVarKind =
  | "money"
  | "number"
  | "percent"
  | "days"
  | "hours"
  | "text"
  | "longtext"
  | "date"
  | "select"
  | "toggle";

export type SimOption = { value: string; label: string };

export type SimVarDef = {
  /** Stable id shared by every element reading the same value (e.g. `legal.SNMG`). */
  id: string;
  label: string;
  group: string;
  kind: SimVarKind;
  /** Value found in the ERP (for derived variables: the value computed from unchanged inputs). */
  base: SimValue;
  options?: SimOption[];
  hint?: string;
  keywords?: string;
  /** Legal or reference value: a change makes the simulation non-official. */
  official?: boolean;
  /** Computed from other variables unless the user forces a value. */
  derived?: boolean;
};

export type SimOverrides = Record<string, SimValue>;

export type SimInfluence = { direct: boolean; via: Set<string> };

export type SimFigure = {
  key: string;
  label: string;
  value: number;
  format: "money" | "days" | "number";
  emphasis?: boolean;
  goodWhenUp?: boolean;
};

export type SimOutput = {
  /** Printable document shown in the centre (null = figures only). */
  html: string | null;
  /** CSS width of the document page in pixels. */
  pageWidth: number;
  figures: SimFigure[];
  warnings: string[];
  /** Set when the document comes from an editable template: its type and the data it is rendered with. */
  doc?: DocRender;
};

export type SimEnv = { origin: string };

function coerceNumber(v: SimValue | undefined, fallback: number) {
  if (v === undefined || v === "" || typeof v === "boolean") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Values read by a computation. Every read is recorded, so the UI can tell which variables
 * affect the element directly, which only through a derived variable, and which not at all.
 */
export class SimContext {
  readonly reads = new Map<string, SimInfluence>();
  readonly derivedValues = new Map<string, SimValue>();
  private readonly stack: string[] = [];

  constructor(
    private readonly defs: ReadonlyMap<string, SimVarDef>,
    private readonly overrides: SimOverrides,
  ) {}

  private record(id: string) {
    const current = this.reads.get(id) ?? { direct: false, via: new Set<string>() };
    const via = this.stack[this.stack.length - 1];
    if (via) current.via.add(via);
    else current.direct = true;
    this.reads.set(id, current);
  }

  isOverridden(id: string) {
    return Object.hasOwn(this.overrides, id);
  }

  value(id: string): SimValue | undefined {
    this.record(id);
    return this.isOverridden(id) ? this.overrides[id] : this.defs.get(id)?.base;
  }

  num(id: string, fallback = 0) {
    return coerceNumber(this.value(id), fallback);
  }

  str(id: string, fallback = "") {
    const v = this.value(id);
    return v === undefined ? fallback : String(v);
  }

  bool(id: string, fallback = false) {
    const v = this.value(id);
    if (typeof v === "boolean") return v;
    if (v === undefined || v === "") return fallback;
    return v === "true" || v === 1;
  }

  private derive<T extends SimValue>(id: string, compute: () => T, coerce: (v: SimValue) => T): T {
    this.record(id);
    if (this.isOverridden(id)) {
      const forced = coerce(this.overrides[id]);
      this.derivedValues.set(id, forced);
      return forced;
    }
    this.stack.push(id);
    try {
      const value = compute();
      this.derivedValues.set(id, value);
      return value;
    } finally {
      this.stack.pop();
    }
  }

  /** Number computed from other variables; reads made by `compute` are attributed to `id`. */
  deriveNum(id: string, compute: () => number) {
    return this.derive(id, compute, (v) => coerceNumber(v, 0));
  }

  deriveStr(id: string, compute: () => string) {
    return this.derive(id, compute, (v) => String(v));
  }
}

/**
 * Read-only record whose keys are variables `${prefix}${key}`: only the keys actually read
 * by the calculation are recorded as influences (never spread it).
 */
export function trackedRecord(
  ctx: SimContext,
  prefix: string,
  keys: readonly string[],
): Readonly<Record<string, number>> {
  const known = new Set(keys);
  return new Proxy({} as Record<string, number>, {
    get: (_t, prop) => (typeof prop === "string" && known.has(prop) ? ctx.num(`${prefix}${prop}`) : undefined),
    has: (_t, prop) => typeof prop === "string" && known.has(prop),
    ownKeys: () => [...known],
    getOwnPropertyDescriptor: (_t, prop) =>
      typeof prop === "string" && known.has(prop)
        ? { enumerable: true, configurable: true, writable: false, value: ctx.num(`${prefix}${prop}`) }
        : undefined,
  });
}

/** `base` with some keys replaced, without copying (keeps influence tracking of `base`). */
export function overlayRecord(
  base: Readonly<Record<string, number>>,
  extra: Readonly<Record<string, number>>,
): Record<string, number> {
  return new Proxy({} as Record<string, number>, {
    get: (_t, prop) => (typeof prop === "string" ? (Object.hasOwn(extra, prop) ? extra[prop] : base[prop]) : undefined),
    has: (_t, prop) => typeof prop === "string" && (Object.hasOwn(extra, prop) || prop in base),
    ownKeys: () => [...new Set([...Object.keys(base), ...Object.keys(extra)])],
    getOwnPropertyDescriptor: (_t, prop) =>
      typeof prop === "string" && (Object.hasOwn(extra, prop) || prop in base)
        ? {
            enumerable: true,
            configurable: true,
            writable: false,
            value: Object.hasOwn(extra, prop) ? extra[prop] : base[prop],
          }
        : undefined,
  });
}

export type SimInfluenceKind = "direct" | "via" | "none";

export function influenceOf(reads: ReadonlyMap<string, SimInfluence>, id: string): {
  kind: SimInfluenceKind;
  via: string[];
} {
  const r = reads.get(id);
  if (!r) return { kind: "none", via: [] };
  if (r.direct) return { kind: "direct", via: [] };
  return { kind: "via", via: [...r.via] };
}

/** Accent-insensitive lowercase text for searching. */
export function foldSearch(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function mergeVarDefs(...lists: SimVarDef[][]): SimVarDef[] {
  const seen = new Set<string>();
  const out: SimVarDef[] = [];
  for (const list of lists) {
    for (const def of list) {
      if (seen.has(def.id)) continue;
      seen.add(def.id);
      out.push(def);
    }
  }
  return out;
}
