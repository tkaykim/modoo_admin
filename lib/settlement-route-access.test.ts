import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as auth from './auth-helpers';
const cases = [
 {path:'admin/orders',body:{orderId:'example',factoryAmount:1}},
 {path:'admin/orders',body:{orderId:'example',factoryUnitPrice:1}},
 {path:'admin/orders',body:{orderId:'example',lockFactoryPrice:false}},
 {path:'admin/orders/factory-allocation',body:{orderId:'example',items:[{orderItemId:'test',factory_amount:null}]}},
 {path:'public/orders/[shareToken]',body:{itemId:'test',factoryStatus:'in_progress',factoryAmount:1}},
 {path:'admin/shipping/standalone',body:{deliveryFee:1},method:'POST'},
];
for(const c of cases)test(`${c.path} rejects unauthorized financial write before privileged access: ${JSON.stringify(c.body)}`,async()=>{
 const source=fs.readFileSync(new URL(`../app/api/${c.path}/route.ts`,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 let calls=0;
 const exports:Record<string,(r:Request,c:unknown)=>Promise<Response>>={};
 vm.runInNewContext(compiled,{exports,console,URL,Map,Set,require:(name:string)=>{
  if(name==='next/server')return{NextResponse:{json:Response.json}};
  if(name==='@/lib/auth-helpers')return auth;
  if(name==='@/lib/supabase')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'test'}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'admin'}})})})})})};
  if(name==='@/lib/supabase-admin')return{createAdminClient:()=>{calls++;throw new Error('privileged_access');}};
  return {};
 }});
 const method=c.method||'PATCH';const result=await exports[method](new Request('https://test/api',{method,body:JSON.stringify(c.body)}),{params:Promise.resolve({shareToken:'a'.repeat(32)})});
 assert.equal(result.status,403);assert.equal(calls,0);
});

test('public link can start work without reading or confirming settlement prices', async () => {
 const source = fs.readFileSync(new URL('../app/api/public/orders/[shareToken]/route.ts', import.meta.url), 'utf8');
 const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
 const selections: string[] = [];
 const updates: Record<string, unknown>[] = [];
 const db = { from: (table: string) => {
  const result = () => ({ data: table === 'order_items' ? [{ id: 'item', factory_status: 'in_progress' }] : null, error: null });
  const chain = {
   select: (columns: string) => { selections.push(columns); return chain; },
   eq: () => chain,
   update: (value: Record<string, unknown>) => { updates.push(value); return chain; },
   single: async () => ({ data: table === 'orders' ? { id: 'order', order_status: 'in_production' } : { factory_price_locked: false }, error: null }),
   then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return chain;
 }};
 const exports: Record<string, (r: Request, c: unknown) => Promise<Response>> = {};
 vm.runInNewContext(compiled, { exports, console, require: (name: string) => {
  if (name === 'next/server') return { NextResponse: { json: Response.json } };
  if (name === '@/lib/supabase-admin') return { createAdminClient: () => db };
  return {};
 }});
 const response = await exports.PATCH(new Request('https://test/api', { method: 'PATCH', body: JSON.stringify({ itemId: 'item', factoryStatus: 'in_progress' }) }), { params: Promise.resolve({ shareToken: 'a'.repeat(32) }) });
 assert.equal(response.status, 200);
 assert.ok(updates.some(value => value.factory_status === 'in_progress'));
 assert.ok(updates.every(value => Object.keys(value).every(key => !/factory_(amount|unit_price|price_confirmed)/.test(key))));
 assert.ok(selections.every(value => !/factory_(amount|unit_price)/.test(value)));
});
