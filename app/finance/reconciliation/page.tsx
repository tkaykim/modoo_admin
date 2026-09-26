import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { isSuperAdmin } from '@/lib/auth-helpers';
import { summarizeLegacyCash, type CashAllocation, type LegacyCostAdjustment } from '@/lib/cost-reconciliation';

export const dynamic = 'force-dynamic';
type LegacyCase = {case_key:string;title:string;period_start:string;period_end:string;quantity:number|null;quantity_basis:string|null;notes:string;evidence:{erp_project?:{id:number;name:string};erp_entries?:{id:number;name:string;kind:string;amount:number;actual_amount:number|null;status:string}[];files?:{original_path:string;sha256:string}[];bongjeya_invoice_rows?:{sha256:string;invoice_date:string;row:number;label:string;quantity:number;unit_amount:number;quoted_amount:number;filename:string;cost_class:string}[];supplier_cost_recoveries?:{transaction_key:string;date:string;amount:number;status:string;reason:string}[]}};
type BankRow = {transaction_key:string;transacted_at:string;counterparty_text:string;memo:string|null};
const won=(value:number)=>`${value.toLocaleString('ko-KR')}원`;

export default async function CostReconciliationPage() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)redirect('/login');
  const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).single();
  if(!isSuperAdmin(profile?.role))redirect('/dashboard');
  const [cases,allocations,legacyCostAdjustments,adjustments,documents,bankCount,invoiceCount,erpCount,erpOrderCount,bank,invoiceLinks]=await Promise.all([
    db.from('legacy_order_cases').select('*').order('period_start'),
    db.from('legacy_order_cash_allocations').select('*').order('case_key').limit(1000),
    db.from('legacy_order_cost_adjustments').select('*').order('case_key').limit(1000),
    db.from('cost_evidence_adjustments').select('*').order('created_at',{ascending:false}),
    db.from('cost_bank_source_documents').select('source_filename,period_start,period_end,row_count'),
    db.from('cost_bank_transactions').select('*',{count:'exact',head:true}),
    db.from('print_cost_source_lines').select('id',{count:'exact',head:true}).eq('match_status','matched'),
    db.from('cost_erp_source_records').select('*',{count:'exact',head:true}),
    db.from('cost_evidence_links').select('*',{count:'exact',head:true}).eq('link_type','erp_order').eq('status','confirmed'),
    db.from('legacy_order_cash_allocations').select('transaction_key,cost_bank_transactions(transaction_key,transacted_at,counterparty_text,memo)').limit(1000),
    db.from('cost_evidence_links').select('source_line_id,order_id,allocated_quantity,amount_net,evidence',{count:'exact'}).eq('link_type','invoice_order').eq('status','confirmed').order('source_line_id').limit(1000),
  ]);
  if([cases,allocations,legacyCostAdjustments,adjustments,documents,bankCount,invoiceCount,erpCount,erpOrderCount,bank,invoiceLinks].some(r=>r.error) || (invoiceLinks.count||0)>(invoiceLinks.data?.length||0)) {
    return <main className="max-w-6xl mx-auto p-6"><h1 className="text-xl font-bold">원가 증빙·과거 주문</h1><p role="alert" className="mt-4 text-red-700">자료를 조회하지 못했습니다.</p><p>잠시 후 다시 조회해 주세요.</p></main>;
  }
  const txByKey=new Map<string,BankRow>();
  for(const entry of bank.data||[]){const value=entry.cost_bank_transactions as unknown as BankRow|null;if(value)txByKey.set(value.transaction_key,value);}
  const invoiceRows=new Map<number,{orderId:string;label:string;filename:string;page:number;line:number;quantity:number;net:number;oldPrint:number;oldFactory:number}>();
  for(const row of invoiceLinks.data||[]){
    const evidence=row.evidence as {item_name:string;invoice_filename:string;page_number:number;line_number:number;original_print_cost:number;original_factory_cost:number};
    const current=invoiceRows.get(row.source_line_id)||{orderId:row.order_id,label:evidence.item_name,filename:evidence.invoice_filename,page:evidence.page_number,line:evidence.line_number,quantity:0,net:0,oldPrint:evidence.original_print_cost,oldFactory:evidence.original_factory_cost};
    current.quantity+=Number(row.allocated_quantity);current.net+=Number(row.amount_net);invoiceRows.set(row.source_line_id,current);
  }
  return <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
    <header><Link href="/finance" className="text-sm text-blue-700">재무 대시보드</Link><h1 className="text-2xl font-bold mt-2">원가 증빙·과거 주문</h1><p className="mt-2 text-sm text-gray-600">슈퍼관리자 전용입니다.</p></header>
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm space-y-1">
      <p>과거 주문은 증빙에서 복원한 작업 묶음이며, 현재 발주·배송 주문을 새로 생성하지 않습니다.</p>
      <p>입출금 차이는 최종 손익이 아닙니다.</p>
      <p>수량·부가세·누락 비용과 ERP 합산 이체가 확인되기 전에는 기존 손익에 더하지 않습니다.</p>
      <p>공급처 환급은 고객 매출과 구분하며, 아래 입출금 차이에 합산하지 않고 작업 근거에 별도로 표시합니다.</p>
    </section>
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[['은행 거래',bankCount.count],['청구행 주문 연결',invoiceCount.count],['ERP 증빙',erpCount.count],['ERP·기존 주문 연결',erpOrderCount.count]].map(([label,value])=><div key={String(label)} className="rounded-lg border bg-white p-4"><div className="text-sm text-gray-600">{label}</div><div className="text-2xl font-semibold mt-1">{Number(value||0).toLocaleString('ko-KR')}건</div></div>)}
    </section>
    <section><h2 className="font-bold text-lg mb-3">작업별 차감</h2>{(adjustments.data||[]).map(a=><article key={a.adjustment_key} className="rounded-lg border bg-white p-4 space-y-2">
      <div className="flex gap-3 flex-wrap"><strong>{a.order_id}</strong><span className="text-amber-800">{a.is_estimate?'추정 배분':'확인된 차감'}</span></div>
      <p>{a.reason}</p><p>공급가 {won(Number(a.amount_net))} / 부가세 {won(Number(a.amount_vat))} / 합계 {won(Number(a.amount_gross))}</p>
      <p className="text-sm text-gray-600">원본 청구액과 기존 원가 원장은 보존했습니다.</p>
    </article>)}</section>
    <section><details className="border rounded-lg bg-white p-4"><summary className="font-bold text-lg cursor-pointer">이번에 연결한 인쇄 청구 {invoiceRows.size}건</summary>
      <p className="my-3 text-sm text-amber-900">청구 공급가와 기존 원장을 비교하는 표입니다.</p><p className="mb-3 text-sm text-gray-600">기존 인쇄비·공장비의 중복 및 단가·총액 입력 차이가 남아 있어, 두 원장을 합산하지 않습니다.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left bg-gray-100"><tr>{['주문·청구내역','수량','청구 공급가','추정 차감','차감 후 공급가','기존 인쇄비','기존 공장비'].map(h=><th className="p-2 whitespace-nowrap" key={h}>{h}</th>)}</tr></thead><tbody>
        {[...invoiceRows].map(([id,r])=>{const delta=(adjustments.data||[]).filter(a=>a.source_line_id===id).reduce((s,a)=>s+Number(a.amount_net),0);return <tr key={id} className="border-t align-top"><td className="p-2 min-w-64"><strong>{r.label}</strong><div>{r.orderId}</div><div className="text-xs text-gray-500 mt-1">{r.filename} p.{r.page} 행{r.line}</div></td><td className="p-2">{r.quantity}</td>{[r.net,delta,r.net+delta,r.oldPrint,r.oldFactory].map((v,index)=><td key={index} className="p-2 text-right whitespace-nowrap tabular-nums">{won(v)}</td>)}</tr>;})}
      </tbody></table></div>
    </details></section>
    <section><h2 className="font-bold text-lg mb-3">복원한 과거 작업 {(cases.data||[]).length}건</h2>
      <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm bg-white"><thead className="bg-gray-100 text-left"><tr>{['작업·관측 기간','확인 수량','입금','비용(출금+보상)','환불','관측 차이'].map(h=><th key={h} className="p-3 whitespace-nowrap">{h}</th>)}</tr></thead>
      <tbody>{((cases.data||[]) as LegacyCase[]).map(c=>{const rows=(allocations.data||[]).filter(a=>a.case_key===c.case_key) as CashAllocation[];const caseAdjustments=(legacyCostAdjustments.data||[]).filter(a=>a.case_key===c.case_key) as LegacyCostAdjustment[];const cash=summarizeLegacyCash(rows,caseAdjustments);return <tr key={c.case_key} className="border-t align-top">
        <td className="p-3 min-w-80"><strong>{c.title}</strong><div className="text-gray-600 text-xs mt-1">{c.period_start} ~ {c.period_end}</div><details className="mt-2"><summary className="cursor-pointer text-blue-700">근거·미확인 항목</summary><div className="space-y-2 mt-2 max-w-xl"><p>{c.notes}</p>{c.quantity_basis&&<p>{c.quantity_basis}</p>}
          {c.evidence.erp_project&&<p>ERP #{c.evidence.erp_project.id}: {c.evidence.erp_project.name}</p>}
          {cash.estimatedCost>0&&<p className="text-amber-800">추정 비용 반영: {won(cash.estimatedCost)}</p>}
          {caseAdjustments.map(a=><div key={`${a.case_key}:${a.cost_class}:${a.reason}`} className="rounded border border-rose-200 bg-rose-50 p-2"><strong>{a.cost_class==='customer_compensation'?'고객 보상 비용':'고객 환불 비용'} {won(Number(a.amount_gross))}</strong><p>{a.reason}</p><p className="text-xs">{a.is_estimate?'증빙의 약정 금액으로 추정 반영했습니다.':'확인 금액입니다.'}</p></div>)}
          {(c.evidence.bongjeya_invoice_rows||[]).length>0&&<details><summary className="cursor-pointer">공급처 제작 명세서 ({c.evidence.bongjeya_invoice_rows?.length}행)</summary>
            <p className="my-2 text-xs text-gray-600">청구 당시 단가입니다.</p><p className="mb-2 text-xs text-gray-600">완제품에 포함된 자수·전사와 수선비를 구분하며, 부가세가 별도 표기되지 않은 금액을 임의로 공급가로 환산하지 않습니다.</p>
            <ul className="space-y-2">{c.evidence.bongjeya_invoice_rows?.map(r=><li key={`${r.sha256}:${r.row}`} className="border-l-2 pl-2"><strong>{r.invoice_date} {r.label}</strong><div>{r.quantity} × {won(r.unit_amount)} = {won(r.quoted_amount)}{r.cost_class==='rework'?' (수선·재제작)':''}</div><div className="text-xs text-gray-500 break-all">{r.filename} · {r.row}행</div></li>)}</ul>
          </details>}
          {(c.evidence.supplier_cost_recoveries||[]).map(r=><div key={r.transaction_key} className="rounded border border-blue-200 bg-blue-50 p-2"><strong>공급처 환급 {won(r.amount)} ({r.status==='confirmed'?'확인':'검토 중'})</strong><p>{r.date} · {r.reason}</p><p className="text-xs">고객 매출 및 표의 입출금 차이에 미합산한 별도 회수액입니다.</p></div>)}
          <ul className="space-y-1">{rows.map(r=>{const tx=txByKey.get(r.transaction_key);return <li key={r.transaction_key}>{tx?.transacted_at?new Date(tx.transacted_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):''} {tx?.counterparty_text} {won(Number(r.amount_gross))}<span className="block text-xs text-gray-500">{r.reason}</span></li>;})}</ul>
          {(c.evidence.erp_entries||[]).length>0&&<details><summary className="cursor-pointer">ERP 기록 금액 (은행 금액에 중복 합산하지 않음)</summary><ul>{c.evidence.erp_entries?.map(e=><li key={e.id}>#{e.id} {e.name}: {won(Number(e.actual_amount??e.amount))} ({e.status})</li>)}</ul></details>}
          {(c.evidence.files||[]).map(f=><p key={f.sha256} className="text-xs break-all text-gray-500">시안·명단 원본: {f.original_path}</p>)}
        </div></details></td><td className="p-3 whitespace-nowrap">{c.quantity===null?'미확인':`${c.quantity}벌`}</td>
        {[cash.receipt,cash.cost,cash.refund,cash.cashDifference].map((v,index)=><td key={index} className="p-3 text-right whitespace-nowrap tabular-nums">{won(v)}</td>)}</tr>;})}</tbody></table></div>
    </section>
    <footer className="text-xs text-gray-600 space-y-1">{(documents.data||[]).map(d=><p key={d.source_filename}>{d.source_filename}: {d.row_count}행</p>)}</footer>
  </main>;
}
