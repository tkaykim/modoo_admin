'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, PackagePlus, RefreshCw, Search, Send, Truck } from 'lucide-react';

type Tab = 'overview' | 'products' | 'orders' | 'settlements' | 'qnas';
type Row = Record<string, unknown>;
type DashboardData = {
  configured: boolean;
  products: Row[];
  orders: Row[];
  shipments: Row[];
  settlements: Row[];
  settlementSummary: { sale: number; settlement: number; commission: number };
  qnas: Row[];
  syncRuns: Row[];
  localProducts: Row[];
  reviewApiAvailable: boolean;
};

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: '운영 현황' },
  { key: 'products', label: '상품' },
  { key: 'orders', label: '주문·배송' },
  { key: 'settlements', label: '매출·정산' },
  { key: 'qnas', label: '문의' },
];

const money = (value: unknown) => `${Number(value || 0).toLocaleString('ko-KR')}원`;
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString('ko-KR') : '-';

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '요청 처리에 실패했습니다.');
  return payload;
}

export default function NaverCommercePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [localProductId, setLocalProductId] = useState('');
  const [templateNo, setTemplateNo] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('999');

  const load = async () => {
    setLoading(true);
    try {
      const payload = await requestJson('/api/admin/naver-commerce');
      setData(payload.data);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.' });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get('orderId');
    if (!orderId) return;
    setTab('orders');
    setSearch(orderId);
  }, []);

  const run = async (key: string, operation: () => Promise<unknown>, success: string) => {
    setWorking(key);
    setMessage(null);
    try {
      await operation();
      setMessage({ type: 'ok', text: success });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '작업에 실패했습니다.' });
    } finally { setWorking(''); }
  };

  const sync = (section: string) => run(`sync-${section}`, () => requestJson('/api/admin/naver-commerce/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section }),
  }), '네이버 데이터를 동기화했습니다.');

  const filteredOrders = useMemo(() => (data?.orders || []).filter((row) => {
    const haystack = `${row.naver_order_id} ${row.product_name} ${row.receiver_name} ${row.product_order_status}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [data, search]);

  const selectedOrders = filteredOrders.filter((row) => selected.has(String(row.product_order_id)));
  const selectedOrderIds = [...new Set(selectedOrders.map((row) => String(row.naver_order_id)))];

  const postOrderAction = (action: string) => run(action, () => requestJson('/api/admin/naver-commerce/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, productOrderIds: [...selected] }),
  }), '선택한 주문을 처리했습니다.');

  const postShippingAction = (action: string, naverOrderId?: string) => {
    const boxQty = action === 'register' ? Number(window.prompt('실제 발송 박스 수를 입력하세요.', '1')) : undefined;
    if (action === 'register' && (!Number.isInteger(boxQty) || Number(boxQty) < 1 || Number(boxQty) > 99)) return;
    return run(`shipping-${action}-${naverOrderId || ''}`, () => requestJson('/api/admin/naver-commerce/shipping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, naverOrderId, productOrderIds: [...selected], boxQty }),
    }), action === 'register' ? '로젠에 접수했습니다.' : action === 'slip' ? '송장번호를 가져왔습니다.' : '네이버 발송처리를 완료했습니다.');
  };

  const createProduct = () => {
    if (!localProductId || !templateNo) return setMessage({ type: 'error', text: '자체몰 상품과 네이버 템플릿 상품을 선택해 주세요.' });
    if (!window.confirm('실제 스마트스토어에 새 상품을 등록합니다. 계속할까요?')) return;
    return run('create-product', () => requestJson('/api/admin/naver-commerce/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localProductId, templateOriginProductNo: Number(templateNo), name: newName || undefined, salePrice: newPrice || undefined, stockQuantity: newStock || undefined }),
    }), '스마트스토어에 상품을 등록했습니다.');
  };

  const editProduct = (row: Row) => {
    const name = window.prompt('상품명', String(row.naver_product_name || ''));
    if (name === null) return;
    const salePrice = window.prompt('판매가', String(row.sale_price || 0));
    if (salePrice === null) return;
    const stockQuantity = window.prompt('재고', String(row.stock_quantity ?? 0));
    if (stockQuantity === null || !window.confirm('스마트스토어 상품 정보를 수정할까요?')) return;
    return run(`edit-${row.origin_product_no}`, () => requestJson('/api/admin/naver-commerce/products', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originProductNo: Number(row.origin_product_no), name, salePrice: Number(salePrice), stockQuantity: Number(stockQuantity) }),
    }), '스마트스토어 상품을 수정했습니다.');
  };

  const answerQna = (row: Row) => {
    const answer = window.prompt('등록할 답변을 입력하세요.', String(row.answer || ''));
    if (!answer?.trim() || !window.confirm('이 답변을 네이버에 등록할까요?')) return;
    return run(`qna-${row.question_id}`, () => requestJson('/api/admin/naver-commerce/qnas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: Number(row.question_id), answer }),
    }), '문의 답변을 등록했습니다.');
  };

  if (loading && !data) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">네이버 스마트스토어</h1>
          <p className="mt-1 text-sm text-gray-500">피스코프 채널의 상품, 주문, 로젠 배송, 정산, 문의를 한 곳에서 관리합니다.</p>
        </div>
        <button onClick={() => void sync('all')} disabled={Boolean(working)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {working === 'sync-all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 전체 동기화
        </button>
      </div>

      {!data?.configured && <Notice type="error">Vercel 환경변수에 네이버 커머스 애플리케이션 ID와 시크릿을 설정해야 실제 동기화가 시작됩니다.</Notice>}
      {message && <Notice type={message.type}>{message.text}</Notice>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
        <div className="flex min-w-max gap-1">{tabs.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === item.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{item.label}</button>)}</div>
      </div>

      {tab === 'overview' && data && <Overview data={data} onSync={sync} working={working} />}
      {tab === 'products' && data && <section className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><PackagePlus className="h-5 w-5 text-green-600" /><h2 className="font-semibold">자체몰 상품을 네이버에 등록</h2></div>
          <p className="mb-4 text-sm text-gray-500">기존 네이버 상품 하나를 배송·고시정보 템플릿으로 사용하고 상품명, 가격, 재고, 자체몰 이미지를 교체합니다.</p>
          <div className="grid gap-3 md:grid-cols-5">
            <select value={localProductId} onChange={(event) => setLocalProductId(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"><option value="">자체몰 상품 선택</option>{data.localProducts.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.title)} · {money(row.base_price)}</option>)}</select>
            <select value={templateNo} onChange={(event) => setTemplateNo(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">네이버 템플릿 선택</option>{data.products.map((row) => <option key={String(row.origin_product_no)} value={String(row.origin_product_no)}>{String(row.naver_product_name)}</option>)}</select>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="상품명 덮어쓰기(선택)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div className="flex gap-2"><input value={newPrice} onChange={(event) => setNewPrice(event.target.value)} placeholder="가격" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" /><input value={newStock} onChange={(event) => setNewStock(event.target.value)} placeholder="재고" className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
          </div>
          <button onClick={() => void createProduct()} disabled={Boolean(working)} className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">실제 상품 등록</button>
        </div>
        <Table headers={['원상품 번호', '상품명', '판매가', '재고', '상태', '자체몰 연결', '관리']} rows={data.products.map((row) => [String(row.origin_product_no || '-'), String(row.naver_product_name || '-'), money(row.sale_price), String(row.stock_quantity ?? '-'), String(row.status_type || '-'), row.local_product_id ? '연결됨' : '-', <button key="edit" onClick={() => void editProduct(row)} className="text-sm font-medium text-blue-600">수정</button>])} />
      </section>}

      {tab === 'orders' && data && <section className="space-y-3">
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="주문번호, 상품명, 수령인 검색" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" /></div>
          <button disabled={!selected.size || Boolean(working)} onClick={() => void postOrderAction('confirm')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-40">발주 확인</button>
          <button disabled={!selected.size || selectedOrderIds.length !== 1 || Boolean(working)} onClick={() => void postShippingAction('register')} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">선택 주문 로젠 접수</button>
        </div>
        {selected.size > 0 && selectedOrderIds.length !== 1 && <Notice type="error">로젠 접수는 같은 네이버 주문번호의 상품주문끼리 선택해야 합니다.</Notice>}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-gray-500"><tr><th className="p-3">선택</th><th className="p-3">주문</th><th className="p-3">상품</th><th className="p-3">상태</th><th className="p-3">수령인</th><th className="p-3">결제액</th><th className="p-3">송장</th></tr></thead><tbody className="divide-y divide-gray-100">{filteredOrders.map((row) => { const id = String(row.product_order_id); return <tr key={id}><td className="p-3"><input type="checkbox" checked={selected.has(id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(id); else next.delete(id); return next; })} /></td><td className="p-3"><div className="font-medium">{String(row.naver_order_id)}</div><div className="text-xs text-gray-400">{dateTime(row.payment_date || row.order_date)}</div></td><td className="p-3"><div>{String(row.product_name || '-')}</div><div className="text-xs text-gray-400">{String(row.option_name || '')} · {String(row.quantity || 0)}개</div><div className={`mt-1 text-xs ${row.local_product_id ? 'text-green-700' : 'text-amber-700'}`}>{row.local_product_id ? '자체몰 상품 연결됨' : '자체몰 상품 연결 확인 필요'}</div></td><td className="p-3">{String(row.product_order_status || '-')}</td><td className="p-3"><div>{String(row.receiver_name || '-')}</div><div className="text-xs text-gray-400">{String(row.receiver_tel1 || row.receiver_tel2 || '')}</div></td><td className="p-3">{money(row.total_payment_amount)}</td><td className="p-3">{String(row.tracking_number || '-')}</td></tr>; })}</tbody></table></div>
        <h2 className="pt-2 font-semibold">로젠 접수·네이버 발송처리</h2>
        <Table headers={['네이버 주문', '박스', '로젠 상태', '송장', '네이버 발송', '관리']} rows={data.shipments.map((row) => [String(row.naver_order_id || '-'), String(row.box_qty || '-'), String(row.status || '-'), String(row.tracking_number || '발번 대기'), dateTime(row.naver_dispatched_at), <div key="actions" className="flex gap-2"><button onClick={() => void postShippingAction('slip', String(row.naver_order_id))} className="text-blue-600">송장 가져오기</button><button disabled={!row.tracking_number || Boolean(row.naver_dispatched_at)} onClick={() => void postShippingAction('dispatch', String(row.naver_order_id))} className="text-green-700 disabled:text-gray-300">네이버 발송</button></div>])} />
      </section>}

      {tab === 'settlements' && data && <section className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><Stat label="조회 매출" value={money(data.settlementSummary.sale)} /><Stat label="정산 예정·완료액" value={money(data.settlementSummary.settlement)} /><Stat label="수수료" value={money(data.settlementSummary.commission)} /></div><Table headers={['정산일', '구분', '결제수단', '매출', '정산액', '수수료']} rows={data.settlements.map((row) => [String(row.settlement_date || '-'), String(row.settlement_type || '-'), String(row.payment_method || '-'), money(row.sale_amount), money(row.settlement_amount), money(row.commission_amount)])} /></section>}

      {tab === 'qnas' && data && <section className="space-y-3"><Notice type="ok">공식 커머스 API로 상품 문의는 조회·답변할 수 있습니다.<br />구매 리뷰 본문 조회 API는 제공되지 않아 자체몰 리뷰와 자동 통합할 수 없습니다.</Notice><Table headers={['등록일', '상품', '작성자', '문의', '답변', '관리']} rows={data.qnas.map((row) => [dateTime(row.question_created_at), String(row.product_name || row.product_id || '-'), String(row.writer_id_masked || '-'), String(row.question || '-'), String(row.answer || '미답변'), <button key="answer" onClick={() => void answerQna(row)} className="font-medium text-green-700">{row.answered ? '답변 수정' : '답변 등록'}</button>])} /></section>}
    </div>
  );
}

function Overview({ data, onSync, working }: { data: DashboardData; onSync: (section: string) => Promise<void>; working: string }) {
  const pending = data.orders.filter((row) => !row.naver_dispatched_at).length;
  const unanswered = data.qnas.filter((row) => !row.answered).length;
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="네이버 상품" value={`${data.products.length}개`} /><Stat label="수집 주문" value={`${data.orders.length}건`} hint={`발송 전 ${pending}건`} /><Stat label="조회 정산액" value={money(data.settlementSummary.settlement)} /><Stat label="미답변 문의" value={`${unanswered}건`} /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{['products', 'orders', 'settlements', 'qnas'].map((section) => <button key={section} onClick={() => void onSync(section)} disabled={Boolean(working)} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-green-300 disabled:opacity-50"><span><span className="block font-semibold">{({ products: '상품', orders: '주문', settlements: '정산', qnas: '문의' } as Record<string, string>)[section]} 동기화</span><span className="mt-1 block text-xs text-gray-500">네이버 최신 상태를 가져옵니다.</span></span>{working === `sync-${section}` ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5 text-gray-400" />}</button>)}</div><div className="rounded-xl border border-gray-200 bg-white p-4"><h2 className="font-semibold">운영 순서</h2><div className="mt-3 grid gap-3 md:grid-cols-4"><Step icon={<RefreshCw />} title="1. 주문 동기화" text="새 결제와 상태 변경을 수집합니다." /><Step icon={<CheckCircle2 />} title="2. 발주 확인" text="상품 준비를 시작합니다." /><Step icon={<Truck />} title="3. 로젠 접수·발번" text="실제 박스 수로 접수하고 송장을 가져옵니다." /><Step icon={<Send />} title="4. 네이버 발송" text="로젠 송장으로 발송처리합니다." /></div></div><a href="https://sell.smartstore.naver.com/home" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-green-700">스마트스토어센터 열기 <ExternalLink className="h-4 w-4" /></a></div>;
}

function Notice({ type, children }: { type: 'ok' | 'error'; children: React.ReactNode }) { return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${type === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{type === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<div>{children}</div></div>; }
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) { return <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-sm text-gray-500">{label}</div><div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>{hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}</div>; }
function Step({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-lg bg-gray-50 p-3"><div className="mb-2 h-5 w-5 text-green-600">{icon}</div><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-5 text-gray-500">{text}</div></div>; }
function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) { return <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-gray-500"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap p-3 font-medium">{header}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-sm p-3 align-top">{cell as React.ReactNode}</td>)}</tr>) : <tr><td className="p-8 text-center text-gray-400" colSpan={headers.length}>동기화된 데이터가 없습니다.</td></tr>}</tbody></table></div>; }
