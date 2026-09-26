import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as runtime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ReactNode} from 'react';
import {summarizeLegacyCash} from './cost-reconciliation';

test('supplier invoice and recovery render without treating recovery as customer revenue',async()=>{
  const source=fs.readFileSync(new URL('../app/finance/reconciliation/page.tsx',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:{default?:()=>Promise<ReactNode>}={};
  const cases=[{case_key:'synthetic',title:'Synthetic case',period_start:'2020-01-01',period_end:'2020-01-02',quantity:2,notes:'Synthetic evidence only',evidence:{bongjeya_invoice_rows:[{sha256:'synthetic-sha',invoice_date:'2020-01-01',row:1,label:'Synthetic item',quantity:2,unit_amount:100,quoted_amount:200,filename:'synthetic-invoice.png',cost_class:'rework'}],supplier_cost_recoveries:[{transaction_key:'recovery',date:'2020-01-02',amount:70,status:'confirmed',reason:'Synthetic recovery'}]}}];
  const allocations=[{case_key:'synthetic',transaction_key:'in',direction:'receipt',amount_gross:500,is_estimate:false},{case_key:'synthetic',transaction_key:'out',direction:'cost',amount_gross:200,is_estimate:false}];
  const legacyAdjustments=[{case_key:'synthetic',amount_gross:50,cost_class:'customer_compensation',is_estimate:true,reason:'Synthetic customer compensation'}];
  vm.runInNewContext(compiled,{exports,require:(name:string)=>{
    if(name==='react/jsx-runtime')return runtime;
    if(name==='next/link')return{default:({children}: {children:ReactNode})=>children};
    if(name==='next/navigation')return{redirect:()=>{throw Error('unexpected redirect');}};
    if(name==='@/lib/auth-helpers')return{isSuperAdmin:(role:string)=>role==='super_admin'};
    if(name==='@/lib/cost-reconciliation')return{summarizeLegacyCash};
    if(name==='@/lib/supabase')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'synthetic'}}})},from:(table:string)=>{
      let columns='';
      const q={select:(s:string)=>{columns=s;return q;},eq:()=>q,order:()=>q,limit:()=>q,single:async()=>({data:{role:'super_admin'}}),then:(resolve:(r:unknown)=>unknown)=>resolve({data:table==='legacy_order_cases'?cases:table==='legacy_order_cash_allocations'&&!columns.includes('cost_bank_transactions')?allocations:table==='legacy_order_cost_adjustments'?legacyAdjustments:[],error:null,count:0})};
      return q;
    }})};
    throw Error(`Unexpected import: ${name}`);
  }});
  const html=renderToStaticMarkup(await exports.default!());
  assert.match(html,/Synthetic item/);
  assert.match(html,/2 × 100원 = 200원/);
  assert.match(html,/수선·재제작/);
  assert.match(html,/공급처 환급 70원/);
  assert.match(html,/미합산한 별도 회수액/);
  assert.match(html,/고객 보상 비용 50원/);
  assert.match(html,/Synthetic customer compensation/);
  assert.match(html,/>500원<\/td>/);
  assert.match(html,/>250원<\/td>/);
  assert.doesNotMatch(html,/>570원<\/td>|>370원<\/td>|>300원<\/td>/);
});
