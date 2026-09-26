type Result = { data: unknown; error: { message: string; code?: string } | null };

export type FakeQuery = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  filters: Array<[string, ...unknown[]]>;
  single: boolean;
};

export type FakeRpc = { fn: string; args: unknown };

/**
 * Minimal chainable stand-in for the Supabase client: every awaited query is recorded and answered
 * by `onQuery`, every RPC by `onRpc`.
 */
export function createSupabaseFake(opts: {
  onQuery?: (q: FakeQuery) => Result | undefined;
  onRpc?: (r: FakeRpc) => Result | undefined;
}) {
  const queries: FakeQuery[] = [];
  const rpcs: FakeRpc[] = [];

  function builder(table: string) {
    const q: FakeQuery = { table, op: "select", filters: [], single: false };
    const resolve = (): Result => {
      queries.push(q);
      return opts.onQuery?.(q) ?? { data: q.single ? null : [], error: null };
    };
    const chain: Record<string, unknown> = {};
    const passthrough = ["select", "eq", "neq", "in", "is", "lte", "gte", "lt", "gt", "or", "order", "limit", "range", "match", "not"];
    for (const name of passthrough) {
      chain[name] = (...args: unknown[]) => {
        if (name !== "select") q.filters.push([name, ...args]);
        return chain;
      };
    }
    for (const op of ["insert", "update", "upsert", "delete"] as const) {
      chain[op] = (payload?: unknown) => {
        q.op = op;
        q.payload = payload;
        return chain;
      };
    }
    chain.single = () => {
      q.single = true;
      return chain;
    };
    chain.maybeSingle = chain.single;
    chain.then = (ok: (r: Result) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, ko);
    return chain;
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: (fn: string, args?: unknown) => {
      const r: FakeRpc = { fn, args };
      rpcs.push(r);
      return Promise.resolve(opts.onRpc?.(r) ?? { data: null, error: null });
    },
  };
  return { client, queries, rpcs };
}
