import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isSuperAdmin } from './auth-helpers';

const source = fs.readFileSync(new URL('../app/api/admin/purchase-orders/confirm/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function route(role: unknown, loggedIn = true) {
  const exports: Record<string, (request: Request) => Promise<Response>> = {};
  let adminCalls = 0;
  vm.runInNewContext(compiled, {
    exports, URL, Map, console,
    require: (name: string) => {
      if (name === 'next/server') return { NextResponse: { json: Response.json } };
      if (name === '@/lib/auth-helpers') return { isSuperAdmin };
      if (name === '@/lib/supabase') return { createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: loggedIn ? { id: 'test' } : null } }) },
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }),
      }) };
      if (name === '@/lib/supabase-admin') return { createAdminClient: () => {
        adminCalls++;
        throw new Error('service client must not be reached');
      } };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return { exports, adminCalls: () => adminCalls };
}

for (const method of ['GET', 'POST']) {
  for (const role of ['admin', 'factory', 'marketing_manager', 'marketing_analyst', 'customer', null]) {
    test(`${method}: ${role} cannot access procurement costs`, async () => {
      const r = route(role);
      const response = await r.exports[method](new Request('https://test/api/admin/purchase-orders/confirm', { method }));
      assert.equal(response.status, 403);
      assert.equal(r.adminCalls(), 0);
    });
  }
  test(`${method}: unauthenticated request is rejected`, async () => {
    const r = route('super_admin', false);
    const response = await r.exports[method](new Request('https://test/api/admin/purchase-orders/confirm', { method }));
    assert.equal(response.status, 401);
    assert.equal(r.adminCalls(), 0);
  });
  for (const role of ['super_admin', 'super-admin', 'superadmin']) {
    test(`${method}: ${role} passes role gate`, async () => {
      const r = route(role);
      const response = await r.exports[method](new Request('https://test/api/admin/purchase-orders/confirm', { method }));
      // Missing ids/items is checked only after successful authorization.
      assert.equal(response.status, 400);
      assert.equal(r.adminCalls(), 0);
    });
  }
}
