'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import SalesDashboard from '@/components/analytics/SalesDashboard';
const ChannelPerformance = dynamic(() => import('@/components/analytics/ChannelPerformance'));
const AdEfficiencyTab = dynamic(() => import('@/components/analytics/AdEfficiencyTab'));
const NaverPanel = dynamic(() => import('@/components/marketing-console/NaverPanel'));
const MarketingTab = dynamic(() => import('@/components/analytics/MarketingTab'));
const RealtimeTab = dynamic(() => import('@/components/analytics/RealtimeTab'));
const tabs = [{id:'sales',label:'매출 분석'},{id:'channels',label:'채널 성과'},{id:'ad_efficiency',label:'Meta 상세'},{id:'naver',label:'네이버 상세'},{id:'marketing',label:'마케팅 (GA4)'},{id:'realtime',label:'실시간'}] as const;
type Tab = typeof tabs[number]['id'];
export default function AnalyticsDashboard() {
  const [tab,setTab]=useState<Tab>('sales');
  const [visited,setVisited]=useState<Tab[]>(['sales']);
  function select(next:Tab){setTab(next);setVisited(old=>old.includes(next)?old:[...old,next]);}
  return <div className="space-y-5 min-w-0" style={{wordBreak:'keep-all'}}>
    <h1 className="text-xl font-bold text-gray-900">매출·광고 분석</h1>
    <div role="tablist" aria-label="분석 화면" className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-2">
      {tabs.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`} onClick={()=>select(t.id)} className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab===t.id?'bg-blue-600 text-white':'bg-white text-gray-600 hover:bg-gray-100'}`}>{t.label}</button>)}
    </div>
    {visited.map(id=><div key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={tab!==id}>
      {id==='sales'?<SalesDashboard active={tab==='sales'}/>:id==='channels'?<ChannelPerformance onDrill={next=>select(next as Tab)}/>:id==='ad_efficiency'?<AdEfficiencyTab/>:id==='naver'?<NaverPanel/>:id==='marketing'?<MarketingTab/>:<RealtimeTab active={tab==='realtime'}/>}
    </div>)}
  </div>;
}
