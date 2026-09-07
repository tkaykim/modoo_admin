'use client';
import {useState, useRef, useEffect} from 'react';
import useSWR from 'swr';
import {fetcher} from '@/lib/fetcher';
import type {AnalyticsPayload, DateBasis, SeriesPoint} from '@/lib/analytics/aggregations';
import {trendRange, dayKey, addDays, kstIso, validateYmd, type Grain} from '@/lib/analytics/time';
const krw=(n:number|null)=>n===null?'—':`${Math.round(n).toLocaleString('ko-KR')}원`;
const grains:{id:Grain;label:string;count:number;options:number[]}[]=[{id:'day',label:'일별',count:30,options:[14,30,90]},{id:'week',label:'주별',count:12,options:[8,12,26]},{id:'month',label:'월별',count:12,options:[6,12,24]},{id:'hour',label:'시간대별',count:1,options:[1]}];
export default function SalesDashboard({active=true}:{active?:boolean}){
  const [grain,setGrain]=useState<Grain>('day');
  const [count,setCount]=useState(30);
  const [offset,setOffset]=useState(0);
  const [completed,setCompleted]=useState(false);
  const [basis,setBasis]=useState<DateBasis>('created_at');
  const [custom,setCustom]=useState(false);
  const [from,setFrom]=useState(addDays(dayKey(),-29));
  const [to,setTo]=useState(dayKey());
  const [average,setAverage]=useState(false);
  const [metric,setMetric]=useState<'confirmed_revenue'|'paid_revenue'|'refunded_amount'>('confirmed_revenue');
  const valid=validateYmd(from)&&validateYmd(to)&&from<=to&&to<=dayKey()&&(!custom||grain!=='hour'||from===to);
  const range=custom&&valid?{fromYmd:from,toYmd:addDays(to,1)}:trendRange(grain,count,offset,completed);
  const query=(!custom||valid)?new URLSearchParams({preset:'custom',from:kstIso(range.fromYmd),to:kstIso(range.toYmd),bucket:grain,basis}).toString():null;
  const {data,error,isLoading,isValidating,mutate}=useSWR<AnalyticsPayload>(query?`/api/admin/analytics?${query}`:null,fetcher,{revalidateOnFocus:false,refreshInterval:active?60000:0,isPaused:()=>!active});
  const rows=data?.daily_series??[];
  const paid=data?.orders.paid_count??0;
  const names={confirmed_revenue:'확정매출',paid_revenue:'총결제',refunded_amount:'환불'};
  function changeGrain(next:Grain){setGrain(next);setCount(grains.find(g=>g.id===next)!.count);setOffset(0);if(next==='hour'){setFrom(dayKey());setTo(dayKey());}}
  function exportCsv(){
    const lines=[['시작(KST)','종료 미포함(KST)','상태','확정매출','총결제','환불','유효주문'],...rows.map(r=>[localDate(r.from),localDate(r.to),!r.available?'자료 없음':r.partial?'일부 기간':'완료',r.available?r.confirmed_revenue:'',r.available?r.paid_revenue:'',r.available?r.refunded_amount:'',r.available?r.paid_count:''])];
    const blob=new Blob(['\uFEFF'+lines.map(row=>row.join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`매출_${basis}_${range.fromYmd}_${grain}.csv`;a.click();URL.revokeObjectURL(url);
  }
  return <div className="space-y-4">
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex flex-wrap gap-1" role="group" aria-label="집계 단위">{grains.map(g=><button key={g.id} aria-pressed={grain===g.id} onClick={()=>changeGrain(g.id)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${grain===g.id?'bg-blue-600 text-white':'bg-gray-100 text-gray-600'}`}>{g.label}</button>)}</div>
        <label className="text-sm text-gray-600 flex items-center gap-2">매출 기준<select aria-label="매출 날짜 기준" value={basis} onChange={e=>setBasis(e.target.value as DateBasis)} className="rounded border border-gray-300 p-2 bg-white"><option value="created_at">주문일 기준</option><option value="paid_at">결제일 기준</option></select></label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex gap-2 items-center"><input type="checkbox" checked={custom} onChange={e=>setCustom(e.target.checked)}/>기간 직접 선택</label>
        {!custom?<><select aria-label="조회 범위" value={count} onChange={e=>{setCount(Number(e.target.value));setOffset(0);}} className="border rounded p-2 bg-white">{grains.find(g=>g.id===grain)!.options.map(n=><option key={n} value={n}>{grain==='hour'?'하루':`최근 ${n}${grain==='month'?'개월':grain==='week'?'주':'일'}`}</option>)}</select>
          <button aria-label="이전 구간" className="rounded border px-3 py-2" onClick={()=>setOffset(n=>n-count)}>←</button>
          <button aria-label="다음 구간" disabled={offset===0} className="rounded border px-3 py-2 disabled:opacity-30" onClick={()=>setOffset(n=>Math.min(0,n+count))}>→</button>
          {offset!==0&&<button className="text-blue-600 px-2" onClick={()=>setOffset(0)}>현재로</button>}
          <label className="flex gap-2 items-center ml-2"><input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)}/>완료 기간만</label>
        </>:<><input aria-label="시작일" type="date" value={from} max={dayKey()} onChange={e=>setFrom(e.target.value)} className="border rounded p-2"/><span>~</span><input aria-label="종료일" type="date" value={to} max={dayKey()} onChange={e=>setTo(e.target.value)} className="border rounded p-2"/></>}
      </div>
      <p className="text-xs leading-relaxed text-gray-500">{range.fromYmd} ~ {addDays(range.toYmd,-1)} · 한국시간 · {grain==='week'?'월요일~일요일 합계':grain==='month'?'달력 월 합계':grain==='day'?'하루 합계':'하루 안의 시간별 합계'}<br/>미래 구간은 제외하며 진행 중인 구간은 잠정값입니다.</p>
    </div>
    {custom&&!valid&&<p role="alert" className="text-red-700">유효한 시작일·종료일을 입력해 주세요. 시간대별은 하루만 선택합니다.</p>}
    {error&&<p role="alert" className="bg-red-50 text-red-700 p-3 rounded">조회 실패: {error.message}</p>}
    {isLoading&&<p role="status" className="p-6 text-gray-500">매출을 집계하고 있습니다…</p>}
    {data&&!error&&(!custom||valid)&&<>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card title="기간 확정매출" value={data.quality.ordersAvailable?krw(data.orders.confirmed_revenue):'자료 없음'} hint="총결제 − 환불"/>
        <Card title="유효 결제 주문" value={data.quality.ordersAvailable?`${paid.toLocaleString()}건`:'자료 없음'} hint={data.quality.ordersAvailable?`전체 주문 ${data.orders.total_count}건`:'주문 기록 시작 전'}/>
        <Card title="객단가" value={paid?krw(data.orders.confirmed_revenue/paid):'—'} hint="확정매출 ÷ 유효 주문"/>
        <Card title="환불" value={data.quality.ordersAvailable?krw(data.orders.refunded_amount):'자료 없음'} hint={`${data.orders.refunded_count}건 · 현재 주문 상태 기준`}/>
      </div>
      {data.quality.partialCoverage&&<p className="text-sm text-amber-800">선택 기간에 자료 수집 전 구간이 포함돼 있습니다. 합계는 확인 가능한 기록만 반영합니다.</p>}
      {data.comparison&&<div className="grid md:grid-cols-2 gap-3">
        <Comparison label="최근 구간 · 이전 기간 대비" pair={data.comparison}/>
        {data.weekdayComparison&&<Comparison label="최근 하루 · 전주 같은 요일 대비" pair={data.weekdayComparison}/>}
      </div>}
      <p className="text-xs leading-relaxed text-gray-600">{basis==='created_at'?'선택 기간에 생성된 주문의 현재 유효금액입니다. 나중에 결제·환불되면 과거 수치가 바뀝니다.':'선택 기간에 결제된 주문의 현재 유효금액입니다. 실제 환불일 기준 현금흐름·PG 정산액과 다릅니다.'}</p>
      {(data.quality.historicalPaidAtApproximate||(data.quality.missingPaidAt??0)>0||data.quality.errors.length>0)&&<div role="status" className="rounded bg-amber-50 text-amber-900 text-sm p-3 space-y-1">
        {data.quality.historicalPaidAtApproximate&&<p>2026년 7월 10일 이전 결제일에는 주문일로 보완한 근사값이 포함됩니다.</p>}
        {!!data.quality.missingPaidAt&&<p>조회 기간에 생성된 주문 중 결제일 미확인 {data.quality.missingPaidAt}건({krw(data.quality.missingPaidAtAmount)})은 결제일 집계에서 제외했습니다.</p>}
        {data.quality.errors.map(e=><p key={e}>{e} · 해당 값은 계산하지 않았습니다.</p>)}
      </div>}
      <section className="bg-white rounded-xl border border-gray-200 p-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="font-semibold text-gray-900">{grains.find(g=>g.id===grain)?.label} 매출 추이</h2>
          <div className="flex items-center flex-wrap gap-3 text-sm"><select aria-label="차트 지표" className="border rounded p-2 bg-white" value={metric} onChange={e=>setMetric(e.target.value as typeof metric)}>{Object.entries(names).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>{grain==='day'&&<label className="flex gap-1 items-center"><input type="checkbox" checked={average} onChange={e=>setAverage(e.target.checked)}/>7일 이동평균</label>}</div>
        </div>
        <SalesChart rows={rows} metric={metric} average={average&&grain==='day'}/>
        <p className="mt-3 text-xs text-gray-500">옅은 막대는 집계 중 또는 일부 기간입니다. 막대를 선택하면 정확한 금액을 확인할 수 있습니다.</p>
      </section>
      <section className="bg-white rounded-xl border border-gray-200 p-4 min-w-0">
        <div className="flex justify-between items-center mb-3"><h2 className="font-semibold">기간별 상세</h2><button onClick={exportCsv} className="text-blue-600 text-sm">CSV 내려받기</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm text-right"><thead><tr className="border-b text-gray-500">{['기간','상태','확정매출','총결제','환불','유효주문','객단가'].map(h=><th key={h} className="py-3 px-2 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.date} className="border-b border-gray-100"><td className="p-2 whitespace-nowrap" title={`${localDate(r.from)} ~ ${localDate(r.to)} 미포함`}>{r.date}</td><td className="p-2 whitespace-nowrap text-gray-500">{!r.available?'자료 없음':r.partial?'일부 기간':'완료'}</td><td className="p-2 font-medium">{krw(r.available?r.confirmed_revenue:null)}</td><td className="p-2">{krw(r.available?r.paid_revenue:null)}</td><td className="p-2">{krw(r.available?r.refunded_amount:null)}</td><td className="p-2">{r.available?r.paid_count:'—'}</td><td className="p-2">{r.available&&r.paid_count?krw(r.confirmed_revenue/r.paid_count):'—'}</td></tr>)}</tbody></table></div>
      </section>
      <div className="grid sm:grid-cols-3 gap-3 text-sm text-gray-600"><Card title="고유 방문 세션" value={data.visitors.unique_sessions?.toLocaleString()??'미수집'} hint={`페이지뷰 ${data.visitors.pageviews?.toLocaleString()??'미수집'}`}/><Card title="접수 문의" value={data.inquiries_by_source.dashboard===null?'조회 실패':`${data.inquiries_by_source.dashboard}건`} hint="관리자 작성 제외"/><Card title="취소액" value={data.quality.ordersAvailable?krw(data.orders.cancelled_amount):'자료 없음'} hint="환불과 중복 집계하지 않음"/></div>
      <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2"><span>집계 시각 {localDate(data.generatedAt)} · 최대 1분 캐시</span><button disabled={isValidating} onClick={()=>mutate()} className="text-blue-600">{isValidating?'확인 중…':'새로 확인'}</button></div>
    </>}
  </div>;
}
function localDate(iso:string){return new Date(iso).toLocaleString('sv-SE',{timeZone:'Asia/Seoul'});}
function Card({title,value,hint}:{title:string;value:string;hint:string}){return <div className="rounded-xl border border-gray-200 bg-white p-4 min-w-0"><p className="text-xs text-gray-500">{title}</p><p className="mt-2 text-lg lg:text-xl font-bold break-words text-gray-900">{value}</p><p className="mt-1 text-xs text-gray-500 leading-relaxed">{hint}</p></div>;}
function Comparison({label,pair}:{label:string;pair:NonNullable<AnalyticsPayload['comparison']>}){
  const delta=pair.previousRevenue===null?'비교 자료 없음':pair.changePct!==null?`${pair.changePct>0?'+':''}${pair.changePct.toFixed(1)}%`:pair.currentRevenue>0?'신규 발생':'변동 없음';
  return <div className="border border-gray-200 rounded-lg p-3 bg-white text-sm"><p className="text-gray-500 text-xs">{label}</p><p className="mt-1 font-semibold">{krw(pair.currentRevenue)} <span className="ml-2">{delta}</span></p><p className="text-xs text-gray-500 leading-relaxed mt-1">현재 {localDate(pair.current.fromIso)} ~ {localDate(pair.current.toIso)} 미포함<br/>비교 {localDate(pair.previous.fromIso)} ~ {localDate(pair.previous.toIso)} 미포함 · {krw(pair.previousRevenue)}</p></div>;
}
function SalesChart({rows,metric,average}:{rows:SeriesPoint[];metric:'confirmed_revenue'|'paid_revenue'|'refunded_amount';average:boolean}){
  const [selected,setSelected]=useState<string|null>(null);
  const scrollRef=useRef<HTMLDivElement>(null);
  const first=rows[0]?.date,last=rows.at(-1)?.date;
  useEffect(()=>{
    const node=scrollRef.current;if(!node)return;
    const align=()=>{node.scrollLeft=node.scrollWidth;};align();
    const observer=new ResizeObserver(align);observer.observe(node);
    return ()=>observer.disconnect();
  },[first,last]);
  if(!rows.length)return <p className="py-12 text-center text-gray-500">집계할 완료·진행 구간이 없습니다.</p>;
  const max=Math.max(1,...rows.filter(r=>r.available).map(r=>r[metric]));
  const active=rows.find(r=>r.date===selected)??rows.at(-1)!;
  const avgs=rows.map((_,i)=>{const window=rows.slice(i-6,i+1);return i>=6&&window.every(r=>r.available&&!r.partial)?window.reduce((s,r)=>s+r[metric],0)/7:null;});
  return <>
    <div aria-live="polite" className="mb-4 min-h-14 rounded-lg bg-blue-50 p-3 text-sm text-blue-950"><b>{active.date}</b> · {active.available?krw(active[metric]):'자료 없음'}{active.partial?' · 일부 기간':''}<div className="text-xs mt-1">{localDate(active.from)} ~ {localDate(active.to)} 미포함</div></div>
    <div ref={scrollRef} className="overflow-x-auto pb-2" role="group" aria-label="매출 막대그래프">
      <div className="flex items-end gap-1 h-64 pt-7" style={{minWidth:Math.max(300,rows.length*Math.max(...rows.map(r=>r.label.length*6+14)))}}>
        {rows.map((r,i)=><button key={r.date} aria-label={`${r.date} ${r.available?krw(r[metric]):'자료 없음'}${r.partial?' 일부 기간':''}`} onClick={()=>setSelected(r.date)} onFocus={()=>setSelected(r.date)} className="flex-1 min-w-8 h-full relative flex flex-col justify-end items-center rounded focus:outline-2 focus:outline-blue-600 hover:bg-blue-50 group" title={krw(r[metric])}>
          {average&&avgs[i]!==null&&<span aria-hidden className="absolute w-full border-t-2 border-amber-500" style={{bottom:28+(avgs[i]!/max)*196}}/>}
          <span aria-hidden className={`w-4/5 max-w-10 rounded-t ${!r.available?'bg-gray-200':r.partial?'bg-blue-300':'bg-blue-600'}`} style={{height:r.available?Math.max(2,r[metric]/max*196):2}}/>
          <span className="text-[11px] leading-4 text-gray-500 whitespace-nowrap h-7 flex items-center">{rows.length>35&&i%3!==0?'·':r.label}</span>
        </button>)}
      </div>
    </div>
    <div className="flex gap-4 mt-1 text-xs text-gray-500"><span>최대 {krw(max===1&&rows.every(r=>r[metric]===0)?0:max)}</span>{average&&<span className="text-amber-700">노랑: 완료된 7일 평균</span>}</div>
  </>;
}
