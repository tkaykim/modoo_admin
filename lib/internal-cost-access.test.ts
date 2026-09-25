import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {isSuperAdmin} from './auth-helpers';

const endpoints:Record<string,string[]>={
 'factory-print-pricing/route.ts':['GET','POST','PATCH','DELETE'],
 'factory-print-pricing/bulk/route.ts':['PUT'],
 'factory-print-pricing/lookup/route.ts':['GET'],
 'order-items/[id]/artworks/route.ts':['GET','POST','PATCH','DELETE'],
};
for(const [path,methods] of Object.entries(endpoints)){
 const source=fs.readFileSync(new URL(`../app/api/admin/${path}`,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 for(const method of methods)for(const role of ['admin','factory','marketing_manager','marketing_analyst','customer',null]){
  test(`${path} ${method} denies ${role} before service access`,async()=>{
   const exports:Record<string,(request:Request,context:{params:Promise<{id:string}>})=>Promise<Response>>={};let serviceCalls=0;
   vm.runInNewContext(compiled,{exports,URL,Map,Set,console,require:(name:string)=>{
    if(name==='next/server')return{NextResponse:{json:Response.json}};
    if(name==='@/lib/auth-helpers')return{isSuperAdmin};
    if(name==='@/lib/factoryPricing')return{};
    if(name==='@/lib/supabase')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:role?{id:'test'}:null}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role}})})})})})};
    if(name==='@/lib/supabase-admin')return{createAdminClient:()=>{serviceCalls++;throw new Error('forbidden_service_access');}};
    throw new Error(`Unexpected import ${name}`);
   }});
   const result=await exports[method](new Request('https://test/api/admin/cost',{method}),{params:Promise.resolve({id:'test'})});
   assert.equal(result.status,role?403:401);assert.equal(serviceCalls,0);
  });
 }
}
test('profit analytics never queries privileged profit for a non-super role',()=>{
 const source=fs.readFileSync(new URL('../app/api/admin/analytics/ga4/overview/route.ts',import.meta.url),'utf8');
 assert.match(source,/isSuperAdmin\(auth.role\) \? fetchDbProfit\(days\) : Promise.resolve\(null\)/);
 assert.match(source,/\.\.\.\(dbProfit \?/);
});
