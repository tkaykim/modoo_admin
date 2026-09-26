import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {isSuperAdmin} from './auth-helpers';

const source=fs.readFileSync(new URL('../app/finance/reconciliation/page.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
for(const role of [null,'admin','factory','customer','marketing_manager','marketing_analyst']){
  test(`reconciliation denies ${role} before any evidence query`,async()=>{
    let evidenceQueries=0;const exports:{default?:()=>Promise<unknown>}={};
    vm.runInNewContext(compiled,{exports,require:(name:string)=>{
      if(name==='next/navigation')return{redirect:(url:string)=>{throw Error(`redirect:${url}`);}};
      if(name==='next/link'||name==='react/jsx-runtime'||name==='@/lib/cost-reconciliation')return{};
      if(name==='@/lib/auth-helpers')return{isSuperAdmin};
      if(name==='@/lib/supabase')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:role?{id:'test'}:null}})},from:(table:string)=>{
        if(table!=='profiles'){evidenceQueries++;throw Error('unauthorized query');}
        return{select:()=>({eq:()=>({single:async()=>({data:{role}})})})};
      }})};
      throw Error(`Unexpected import: ${name}`);
    }});
    await assert.rejects(exports.default!,new RegExp(role?'redirect:/dashboard':'redirect:/login'));
    assert.equal(evidenceQueries,0);
  });
}
