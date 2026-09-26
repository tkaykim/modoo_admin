import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isSuperAdmin } from "./auth-helpers";
const source = fs.readFileSync(
  new URL("../app/api/admin/finance/overview/route.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
for (const role of [
  null,
  "admin",
  "factory",
  "customer",
  "marketing_manager",
  "marketing_analyst",
  "super_admin",
]) {
  test(`finance overview role ${role} reads data only after superadmin gate`, async () => {
    let reads = 0;
    const exports: { GET?: () => Promise<{ status: number }> } = {};
    vm.runInNewContext(compiled, {
      exports,
      console,
      require: (name: string) => {
        if (name === "next/server")
          return {
            NextResponse: {
              json: (_body: unknown, options?: { status?: number }) => ({
                status: options?.status || 200,
              }),
            },
          };
        if (name === "@/lib/auth-helpers") return { isSuperAdmin };
        if (name === "@/lib/finance-overview-data")
          return {
            loadFinanceData: async () => {
              reads++;
              return {};
            },
          };
        if (name === "@/lib/finance-overview")
          return { buildFinanceOverview: () => ({}) };
        if (name === "@/lib/supabase")
          return {
            createClient: async () => ({
              auth: {
                getUser: async () => ({
                  data: { user: role ? { id: "test" } : null },
                }),
              },
              from: (table: string) => {
                assert.equal(table, "profiles");
                return {
                  select: () => ({
                    eq: () => ({ single: async () => ({ data: { role } }) }),
                  }),
                };
              },
            }),
          };
        throw Error(`Unexpected import: ${name}`);
      },
    });
    const response = await exports.GET!();
    assert.equal(
      response.status,
      role === null ? 401 : isSuperAdmin(role) ? 200 : 403,
    );
    assert.equal(reads, isSuperAdmin(role) ? 1 : 0);
  });
}
