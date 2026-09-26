import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinanceData } from "./finance-overview-data";

function client(incomplete = false) {
  return {
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => {
            const count = table === "orders" ? 1001 : 0;
            return {
              data: Array.from(
                {
                  length: Math.max(
                    0,
                    Math.min(incomplete ? 1 : to - from + 1, count - from),
                  ),
                },
                (_, i) => ({ id: from + i }),
              ),
              count,
              error: null,
            };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}
test("report loader includes rows after the PostgREST first-page boundary", async () => {
  const result = await loadFinanceData(client());
  assert.equal(result.orders.length, 1001);
  assert.equal(result.orders.at(-1)?.id, 1000);
});
test("report loader rejects silently truncated pages instead of publishing partial financial totals", async () => {
  await assert.rejects(loadFinanceData(client(true)), /page limit mismatch/);
});
