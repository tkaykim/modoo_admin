'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, TrendingUp, TrendingDown, ShoppingBag, Printer, Truck, Wand2, X, Lock, Pencil, Check, PlusCircle, MinusCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/store/useAuthStore';
import type { Order, OrderItem } from '@/types/types';

type PrintCostRow = {
  id: string;
  order_item_id: string;
  print_method_id: string | null;
  placement: string;
  color_count: number | null;
  size_class: string | null;
  unit_cost: number;
  quantity: number;
  setup_cost: number;
  total_cost: number;
  cost_source: 'lookup' | 'manual_override' | 'negotiated';
  override_reason: string | null;
};

type ItemCostRow = {
  id: string;
  order_item_id: string;
  unit_cost: number;
  quantity: number;
  total_cost: number;
  cost_source: 'lookup' | 'manual_override' | 'retail_purchase';
  override_reason: string | null;
};

type CostAdjustmentRow = {
  id: string;
  order_item_id: string;
  amount: number;
  reason: string;
  recorded_at: string;
};

type ShippingLegRow = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  leg_type: 'raw_material_in' | 'to_factory' | 'to_print_shop' | 'inter_factory' | 'return' | 'other';
  amount: number;
  carrier: string | null;
  note: string | null;
};

type PrintMethod = { id: string; name: string };

const LEG_LABEL: Record<ShippingLegRow['leg_type'], string> = {
  raw_material_in: '원자재 입고',
  to_factory: '공장으로 보냄',
  to_print_shop: '인쇄소로 보냄',
  inter_factory: '공장간 이동',
  return: '반송',
  other: '기타',
};

const PLACEMENT_LABEL: Record<string, string> = {
  front: '앞면',
  back: '뒷면',
  sleeve_l: '왼쪽 소매',
  sleeve_r: '오른쪽 소매',
  pocket: '주머니',
  other: '기타 위치',
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  lookup: { label: '단가표 적용', color: 'bg-blue-100 text-blue-700' },
  manual_override: { label: '수동 수정', color: 'bg-amber-100 text-amber-700' },
  negotiated: { label: '공장 협상가', color: 'bg-purple-100 text-purple-700' },
  retail_purchase: { label: '소비자가 매입', color: 'bg-rose-100 text-rose-700' },
};

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

interface Props {
  order: Order;
  orderItems: OrderItem[];
}

export default function OrderProfitSection({ order, orderItems }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuthStore();
  const role = user?.role;
  const isSuperAdmin = role === 'super_admin';
  const isFactory = role === 'factory';

  const factoryItemIds = useMemo(() => {
    if (!isFactory || !user?.manufacturer_id) return new Set<string>();
    return new Set(orderItems.filter((i) => i.assigned_manufacturer_id === user.manufacturer_id).map((i) => i.id));
  }, [isFactory, user?.manufacturer_id, orderItems]);

  const visibleItems = useMemo(() => {
    if (isSuperAdmin) return orderItems;
    if (isFactory) return orderItems.filter((i) => factoryItemIds.has(i.id));
    return [];
  }, [isSuperAdmin, isFactory, orderItems, factoryItemIds]);

  const [itemCosts, setItemCosts] = useState<ItemCostRow[]>([]);
  const [adjustments, setAdjustments] = useState<CostAdjustmentRow[]>([]);
  const [printCosts, setPrintCosts] = useState<PrintCostRow[]>([]);
  const [shippingLegs, setShippingLegs] = useState<ShippingLegRow[]>([]);
  const [printMethods, setPrintMethods] = useState<PrintMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSuperAdmin && !isFactory) return;
    setLoading(true);
    setError(null);
    try {
      const itemIds = orderItems.map((i) => i.id);
      const [itemCostsRes, adjRes, printCostsRes, legsRes, methodsRes] = await Promise.all([
        isSuperAdmin
          ? supabase.from('order_item_costs').select('*').in('order_item_id', itemIds)
          : Promise.resolve({ data: [], error: null } as any),
        isSuperAdmin
          ? supabase.from('order_item_cost_adjustments').select('*').in('order_item_id', itemIds).order('recorded_at')
          : Promise.resolve({ data: [], error: null } as any),
        supabase.from('order_item_print_costs').select('*').in('order_item_id', itemIds),
        supabase.from('order_shipping_legs').select('*').eq('order_id', order.id),
        supabase.from('print_methods').select('id, name').eq('is_active', true).order('sort_order'),
      ]);
      if (itemCostsRes.error) throw itemCostsRes.error;
      if (adjRes.error) throw adjRes.error;
      if (printCostsRes.error) throw printCostsRes.error;
      if (legsRes.error) throw legsRes.error;
      if (methodsRes.error) throw methodsRes.error;
      setItemCosts((itemCostsRes.data || []) as ItemCostRow[]);
      setAdjustments((adjRes.data || []) as CostAdjustmentRow[]);
      setPrintCosts((printCostsRes.data || []) as PrintCostRow[]);
      setShippingLegs((legsRes.data || []) as ShippingLegRow[]);
      setPrintMethods((methodsRes.data || []) as PrintMethod[]);
    } catch (e: any) {
      setError(e?.message || '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, order.id, orderItems, isSuperAdmin, isFactory]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!isSuperAdmin && !isFactory) return null;

  const totals = useMemo(() => {
    const itemCost = itemCosts.reduce((s, r) => s + Number(r.total_cost || 0), 0);
    const adjustmentSum = adjustments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const printCost = printCosts.reduce((s, r) => s + Number(r.total_cost || 0), 0);
    const factory = orderItems.reduce((s, oi) => s + Number(oi.factory_amount || 0), 0);
    const internalShipping = shippingLegs.reduce((s, r) => s + Number(r.amount || 0), 0);
    const revenue = Number(order.total_amount || 0)
      - Number(order.coupon_discount || 0)
      - Number(order.admin_discount || 0)
      + Number(order.admin_surcharge || 0);
    const customerDelivery = Number(order.delivery_fee || 0);
    const totalCost = itemCost + adjustmentSum + printCost + factory + internalShipping;
    const gp = revenue - totalCost;
    const margin = revenue > 0 ? (gp / revenue) * 100 : 0;
    return { itemCost, adjustmentSum, printCost, factory, internalShipping, revenue, customerDelivery, totalCost, gp, margin };
  }, [itemCosts, adjustments, printCosts, orderItems, shippingLegs, order]);

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-6 bg-amber-500 rounded" />
        <h2 className="text-lg font-bold text-gray-900">원가 / 순이익</h2>
        <span className={`px-2 py-0.5 text-xs rounded-full ${isSuperAdmin ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-700'}`}>
          {isSuperAdmin ? '슈퍼 관리자' : '공장 (본인 배정 항목만)'}
        </span>
      </div>

      {loading && (
        <div className="bg-white border rounded-lg p-6 flex items-center justify-center text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 불러오는 중...
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm mb-3">{error}</div>}

      {!loading && (
        <div className="space-y-4">
          {/* 손익 요약 (super_admin only) */}
          {isSuperAdmin && (
            <ProfitSummary totals={totals} />
          )}

          {/* 항목별 카드 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <ShoppingBag className="w-4 h-4" /> 주문 항목별 원가
            </h3>
            {visibleItems.length === 0 && (
              <div className="bg-gray-50 border rounded p-4 text-sm text-gray-500 text-center">표시할 항목이 없습니다</div>
            )}
            {visibleItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                isSuperAdmin={isSuperAdmin}
                itemCost={itemCosts.find((c) => c.order_item_id === item.id) || null}
                itemAdjustments={adjustments.filter((a) => a.order_item_id === item.id)}
                printCostRows={printCosts.filter((c) => c.order_item_id === item.id)}
                printMethods={printMethods}
                onChanged={refresh}
                setError={setError}
                recordedBy={user?.id || null}
              />
            ))}
          </div>

          {/* 내부 배송 */}
          <ShippingSection
            orderId={order.id}
            legs={shippingLegs}
            visibleItemIds={visibleItems.map((i) => i.id)}
            isSuperAdmin={isSuperAdmin}
            onChanged={refresh}
            setError={setError}
            recordedBy={user?.id || null}
          />

          {!isSuperAdmin && (
            <div className="bg-gray-50 border border-gray-200 rounded p-3 flex items-center gap-2 text-xs text-gray-600">
              <Lock className="w-4 h-4" />
              제품 원가·전체 손익은 슈퍼 관리자만 볼 수 있습니다. 공장에서는 인쇄 단가와 내부 배송비만 입력해 주세요.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProfitSummary({ totals }: { totals: { revenue: number; itemCost: number; adjustmentSum: number; printCost: number; factory: number; internalShipping: number; customerDelivery: number; totalCost: number; gp: number; margin: number } }) {
  const profitable = totals.gp >= 0;
  return (
    <div className={`rounded-lg border-2 p-4 ${profitable ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-xs text-gray-600 font-medium mb-0.5">순이익 (GP)</div>
          <div className={`text-3xl font-bold ${profitable ? 'text-emerald-700' : 'text-rose-700'}`}>
            {profitable ? '' : '−'}{won(Math.abs(totals.gp))}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            마진율 {totals.margin.toFixed(1)}%
            {profitable ? <TrendingUp className="w-3 h-3 inline ml-1 text-emerald-600" /> : <TrendingDown className="w-3 h-3 inline ml-1 text-rose-600" />}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-600 mb-0.5">순매출 − 총비용</div>
          <div className="text-sm">
            <span className="font-semibold text-gray-900">{won(totals.revenue)}</span>
            <span className="text-gray-400 mx-1">−</span>
            <span className="font-semibold text-gray-900">{won(totals.totalCost)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-3 border-t border-gray-200">
        <CostBreakdown label="제품 원가" value={totals.itemCost} share={totals.totalCost > 0 ? (totals.itemCost / totals.totalCost) * 100 : 0} />
        <div>
          <div className="text-[11px] text-gray-500">±조정</div>
          <div className={`font-semibold ${totals.adjustmentSum >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totals.adjustmentSum >= 0 ? '+' : ''}{won(totals.adjustmentSum)}</div>
          <div className="text-[10px] text-gray-500">{totals.totalCost > 0 ? Math.abs((totals.adjustmentSum / totals.totalCost) * 100).toFixed(0) : 0}%</div>
        </div>
        <CostBreakdown label="인쇄비" value={totals.printCost} share={totals.totalCost > 0 ? (totals.printCost / totals.totalCost) * 100 : 0} />
        <CostBreakdown label="공장 가공비" value={totals.factory} share={totals.totalCost > 0 ? (totals.factory / totals.totalCost) * 100 : 0} />
        <CostBreakdown label="내부 배송" value={totals.internalShipping} share={totals.totalCost > 0 ? (totals.internalShipping / totals.totalCost) * 100 : 0} />
        <div className="opacity-60">
          <div className="text-[11px] text-gray-500">소비자 배송비 (참고)</div>
          <div className="font-medium text-gray-700">{won(totals.customerDelivery)}</div>
        </div>
      </div>
    </div>
  );
}

function CostBreakdown({ label, value, share }: { label: string; value: number; share: number }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900">−{won(value)}</div>
      <div className="text-[10px] text-gray-500">{share.toFixed(0)}%</div>
    </div>
  );
}

function ItemCard({
  item,
  isSuperAdmin,
  itemCost,
  itemAdjustments,
  printCostRows,
  printMethods,
  onChanged,
  setError,
  recordedBy,
}: {
  item: OrderItem;
  isSuperAdmin: boolean;
  itemCost: ItemCostRow | null;
  itemAdjustments: CostAdjustmentRow[];
  printCostRows: PrintCostRow[];
  printMethods: PrintMethod[];
  onChanged: () => void;
  setError: (e: string | null) => void;
  recordedBy: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editingPrintCost, setEditingPrintCost] = useState<PrintCostRow | null>(null);
  const [showItemCostEditor, setShowItemCostEditor] = useState(false);
  const [editingFactoryAmount, setEditingFactoryAmount] = useState(false);
  const [factoryAmountDraft, setFactoryAmountDraft] = useState(String(item.factory_amount || 0));
  const [savingFactoryAmount, setSavingFactoryAmount] = useState(false);
  const [autoLookup, setAutoLookup] = useState<{ unit_cost: number | null; loading: boolean }>({ unit_cost: null, loading: false });

  const saveFactoryAmount = async () => {
    setSavingFactoryAmount(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('order_items')
        .update({ factory_amount: factoryAmountDraft ? Number(factoryAmountDraft) : null })
        .eq('id', item.id);
      if (error) throw error;
      setEditingFactoryAmount(false);
      onChanged();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setSavingFactoryAmount(false);
    }
  };

  const variants = useMemo(() => {
    const opts = (item as any).item_options;
    if (opts?.variants && Array.isArray(opts.variants)) return opts.variants;
    return [];
  }, [item]);

  const colorHex = useMemo(() => {
    const cs = (item as any).color_selections;
    return cs?.productColor || null;
  }, [item]);

  const placementsInCanvas = useMemo(() => {
    const cs = (item as any).canvas_state;
    if (cs && typeof cs === 'object') {
      return Object.keys(cs).filter((k) => k !== 'design_id');
    }
    return ['front'];
  }, [item]);

  const printSubtotal = printCostRows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const itemRevenue = Number(item.price_per_item || 0) * Number(item.quantity || 0);

  const lookupCostFromMaster = useCallback(async () => {
    setAutoLookup({ unit_cost: null, loading: true });
    try {
      // Try first variant's size, no specific color (color_id null = NULL)
      const firstSize = variants[0]?.size_id || null;
      const orderTime = item.purchase_ordered_at || (item as any).created_at || new Date().toISOString();
      const { data, error } = await supabase.rpc('get_product_unit_cost', {
        p_product_id: item.product_id,
        p_color_id: null,
        p_size: firstSize,
        p_at: orderTime,
      });
      if (error) throw error;
      setAutoLookup({ unit_cost: data ? Number(data) : null, loading: false });
    } catch (e: any) {
      setAutoLookup({ unit_cost: null, loading: false });
      setError(e?.message || '단가표 조회 실패');
    }
  }, [supabase, item.product_id, item.purchase_ordered_at, variants, item, setError]);

  const applyLookupCost = async () => {
    if (autoLookup.unit_cost == null) return;
    setError(null);
    try {
      // upsert order_item_costs
      const payload = {
        order_item_id: item.id,
        unit_cost: autoLookup.unit_cost,
        quantity: item.quantity,
        cost_source: 'lookup',
        override_reason: null,
        recorded_by: recordedBy,
      };
      const existing = itemCost;
      if (existing) {
        const { error } = await supabase.from('order_item_costs').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('order_item_costs').insert(payload);
        if (error) throw error;
      }
      onChanged();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    }
  };

  const removeItemCost = async () => {
    if (!itemCost) return;
    if (!confirm('제품 원가 기록을 삭제할까요?')) return;
    const { error } = await supabase.from('order_item_costs').delete().eq('id', itemCost.id);
    if (error) setError(error.message);
    else onChanged();
  };

  const removePrintCost = async (id: string) => {
    if (!confirm('이 인쇄비 행을 삭제할까요?')) return;
    const { error } = await supabase.from('order_item_print_costs').delete().eq('id', id);
    if (error) setError(error.message);
    else onChanged();
  };

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 pb-3 border-b">
        <div className="flex gap-3 items-start">
          {colorHex && <span className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0 mt-0.5" style={{ backgroundColor: colorHex }} />}
          <div>
            <div className="font-semibold text-gray-900">{item.product_title}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              총 {item.quantity}개 · 매당 {won(Number(item.price_per_item))} · 매출 <b>{won(itemRevenue)}</b>
            </div>
            {variants.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {variants.map((v: any, idx: number) => (
                  <span key={idx} className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                    {v.size_name || v.size_id} × {v.quantity}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4-column cost summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {/* 제품 원가 (기본 + 조정 합산) */}
        {isSuperAdmin && (
          <div className="bg-gray-50 rounded p-2">
            <div className="text-[11px] text-gray-500 mb-0.5">제품 원가 + 조정</div>
            {itemCost ? (
              <>
                <div className="font-semibold text-gray-900">{won(Number(itemCost.total_cost) + itemAdjustments.reduce((s, a) => s + Number(a.amount || 0), 0))}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  기본 {won(Number(itemCost.total_cost))}
                  {itemAdjustments.length > 0 && (
                    <span className={itemAdjustments.reduce((s, a) => s + Number(a.amount), 0) >= 0 ? ' text-emerald-700' : ' text-rose-700'}>
                      {' '}{itemAdjustments.reduce((s, a) => s + Number(a.amount), 0) >= 0 ? '+' : ''}
                      {won(itemAdjustments.reduce((s, a) => s + Number(a.amount), 0))}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => { lookupCostFromMaster(); setShowItemCostEditor(true); }}
                className="text-xs text-blue-600 hover:underline mt-0.5"
              >
                + 입력하기
              </button>
            )}
          </div>
        )}

        {/* 인쇄비 */}
        <div className="bg-gray-50 rounded p-2">
          <div className="text-[11px] text-gray-500 mb-0.5">인쇄비 ({printCostRows.length}건)</div>
          <div className="font-semibold text-gray-900">{won(printSubtotal)}</div>
        </div>

        {/* 공장 가공비 */}
        <div className="bg-gray-50 rounded p-2">
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-[11px] text-gray-500">공장 가공비</div>
            {!editingFactoryAmount && (
              <button onClick={() => { setFactoryAmountDraft(String(item.factory_amount || 0)); setEditingFactoryAmount(true); }} className="text-gray-400 hover:text-gray-700" title="수정">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
          {editingFactoryAmount ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={factoryAmountDraft}
                onChange={(e) => setFactoryAmountDraft(e.target.value)}
                className="w-full border rounded px-1.5 py-0.5 text-sm"
                autoFocus
              />
              <button onClick={saveFactoryAmount} disabled={savingFactoryAmount} className="text-emerald-600 hover:text-emerald-800" title="저장">
                {savingFactoryAmount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => setEditingFactoryAmount(false)} className="text-gray-400 hover:text-gray-700" title="취소">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="font-semibold text-gray-900">{won(Number(item.factory_amount || 0))}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">공장 배정 또는 여기서 수정</div>
            </>
          )}
        </div>

        {/* 항목 마진 */}
        {isSuperAdmin && (() => {
          const adjSum = itemAdjustments.reduce((s, a) => s + Number(a.amount || 0), 0);
          const margin = itemRevenue - Number(itemCost?.total_cost || 0) - adjSum - printSubtotal - Number(item.factory_amount || 0);
          return (
            <div className={`rounded p-2 ${margin >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <div className="text-[11px] text-gray-600 mb-0.5">항목 마진</div>
              <div className={`font-semibold ${margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{won(margin)}</div>
            </div>
          );
        })()}
      </div>

      {/* 발주/원가 조정 행 (super_admin only) */}
      {isSuperAdmin && (
        <CostAdjustmentsSection
          item={item}
          adjustments={itemAdjustments}
          onChanged={onChanged}
          setError={setError}
          recordedBy={recordedBy}
        />
      )}

      {/* 인쇄비 상세 + 추가 */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-gray-700 flex items-center gap-1">
            <Printer className="w-4 h-4" /> 인쇄 단가 입력
          </div>
          <button
            onClick={() => setShowPrintModal(true)}
            className="text-xs bg-amber-600 text-white rounded px-3 py-1 hover:bg-amber-700 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> 인쇄비 추가
          </button>
        </div>

        {printCostRows.length === 0 ? (
          <div className="text-xs text-gray-400 italic py-3 text-center bg-gray-50 rounded">아직 입력된 인쇄비가 없습니다</div>
        ) : (
          <div className="space-y-1.5">
            {printCostRows.map((r) => {
              const method = printMethods.find((m) => m.id === r.print_method_id);
              const placementLabel = PLACEMENT_LABEL[r.placement] || r.placement;
              return (
                <div key={r.id} className="bg-amber-50/50 border border-amber-200 rounded p-2 flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">📍 {placementLabel}</span>
                      {method && <span className="text-xs text-gray-600">{method.name}{r.color_count ? ` ${r.color_count}도` : ''}</span>}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${SOURCE_BADGE[r.cost_source]?.color || ''}`}>
                        {SOURCE_BADGE[r.cost_source]?.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      매당 <b>{won(Number(r.unit_cost))}</b> × {r.quantity}매
                      {Number(r.setup_cost) > 0 && <span> + 판비 {won(Number(r.setup_cost))}</span>}
                      <span className="text-gray-400 mx-1">=</span>
                      <b className="text-gray-900">{won(Number(r.total_cost))}</b>
                      {r.override_reason && <span className="text-gray-500"> · {r.override_reason}</span>}
                    </div>
                  </div>
                  <button onClick={() => setEditingPrintCost(r)} className="text-gray-400 hover:text-blue-600 p-1" title="수정">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => removePrintCost(r.id)} className="text-gray-400 hover:text-red-500 p-1" title="삭제">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 모달들 */}
      {(showPrintModal || editingPrintCost) && (
        <PrintCostModal
          onClose={() => { setShowPrintModal(false); setEditingPrintCost(null); }}
          orderItem={item}
          placements={placementsInCanvas}
          printMethods={printMethods}
          existing={editingPrintCost}
          onSaved={() => { setShowPrintModal(false); setEditingPrintCost(null); onChanged(); }}
          setError={setError}
          recordedBy={recordedBy}
        />
      )}

      {showItemCostEditor && isSuperAdmin && (
        <ItemCostModal
          onClose={() => setShowItemCostEditor(false)}
          orderItem={item}
          existing={itemCost}
          autoLookup={autoLookup}
          onApplyLookup={applyLookupCost}
          onSaved={() => { setShowItemCostEditor(false); onChanged(); }}
          onRemove={() => { setShowItemCostEditor(false); removeItemCost(); }}
          setError={setError}
          recordedBy={recordedBy}
        />
      )}
    </div>
  );
}

function PrintCostModal({
  onClose,
  orderItem,
  placements,
  printMethods,
  existing,
  onSaved,
  setError,
  recordedBy,
}: {
  onClose: () => void;
  orderItem: OrderItem;
  placements: string[];
  printMethods: PrintMethod[];
  existing?: PrintCostRow | null;
  onSaved: () => void;
  setError: (e: string | null) => void;
  recordedBy: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isEdit = !!existing;
  const [placement, setPlacement] = useState(existing?.placement || placements[0] || 'front');
  const [printMethodId, setPrintMethodId] = useState(existing?.print_method_id || '');
  const [colorCount, setColorCount] = useState(existing?.color_count != null ? String(existing.color_count) : '');
  const [unitCost, setUnitCost] = useState(existing?.unit_cost != null ? String(existing.unit_cost) : '');
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? orderItem.quantity ?? 0));
  const [setupCost, setSetupCost] = useState(existing?.setup_cost != null ? String(existing.setup_cost) : '');
  const [costSource, setCostSource] = useState<'manual_override' | 'negotiated'>(
    existing?.cost_source === 'manual_override' ? 'manual_override' : 'negotiated'
  );
  const [reason, setReason] = useState(existing?.override_reason || '');
  const [saving, setSaving] = useState(false);

  const placementOptions = useMemo(() => {
    const fromCanvas = placements.length > 0 ? placements : ['front'];
    const all = new Set([...fromCanvas, 'front', 'back', 'sleeve_l', 'sleeve_r', 'pocket', 'other']);
    return Array.from(all);
  }, [placements]);

  const total = (Number(unitCost || 0) * Number(quantity || 0)) + Number(setupCost || 0);

  const save = async () => {
    if (!unitCost || Number(unitCost) <= 0) {
      setError('단가를 입력하세요');
      return;
    }
    if (!reason.trim()) {
      setError('사유를 입력하세요 (예: "Slooby 발주 협상가")');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        order_item_id: orderItem.id,
        print_method_id: printMethodId || null,
        placement,
        color_count: colorCount ? Number(colorCount) : null,
        unit_cost: Number(unitCost),
        quantity: Number(quantity),
        setup_cost: Number(setupCost || 0),
        cost_source: costSource,
        override_reason: reason,
        recorded_by: recordedBy,
      };
      if (isEdit && existing) {
        const { error } = await supabase.from('order_item_print_costs').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('order_item_print_costs').insert(payload);
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-600" /> {isEdit ? '인쇄비 수정' : '인쇄비 추가'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* 위치 선택 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">📍 인쇄 위치</label>
            <div className="grid grid-cols-3 gap-1.5">
              {placementOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlacement(p)}
                  className={`px-2 py-1.5 text-sm rounded border ${placement === p ? 'bg-amber-100 border-amber-500 text-amber-900 font-medium' : 'bg-white border-gray-300 hover:border-amber-300 text-gray-700'}`}
                >
                  {PLACEMENT_LABEL[p] || p}
                </button>
              ))}
            </div>
          </div>

          {/* 인쇄방식 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">인쇄 방식 (선택)</label>
            <select value={printMethodId} onChange={(e) => setPrintMethodId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">미정 / 협상가</option>
              {printMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* 단가/매수/판비 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">매당 단가 *</label>
              <div className="relative">
                <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="3000" className="w-full border rounded px-3 py-2 text-sm pr-8" />
                <span className="absolute right-3 top-2.5 text-sm text-gray-400">원</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">매수</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">색상수 (실크인쇄 시)</label>
              <input type="number" value={colorCount} onChange={(e) => setColorCount(e.target.value)} placeholder="1" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">판비/세팅비</label>
              <div className="relative">
                <input type="number" value={setupCost} onChange={(e) => setSetupCost(e.target.value)} placeholder="0" className="w-full border rounded px-3 py-2 text-sm pr-8" />
                <span className="absolute right-3 top-2.5 text-sm text-gray-400">원</span>
              </div>
            </div>
          </div>

          {/* 가격 종류 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">가격 종류</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setCostSource('negotiated')} className={`px-2 py-2 text-sm rounded border ${costSource === 'negotiated' ? 'bg-purple-100 border-purple-500 text-purple-900 font-medium' : 'bg-white border-gray-300 text-gray-700'}`}>
                공장 협상가
              </button>
              <button onClick={() => setCostSource('manual_override')} className={`px-2 py-2 text-sm rounded border ${costSource === 'manual_override' ? 'bg-amber-100 border-amber-500 text-amber-900 font-medium' : 'bg-white border-gray-300 text-gray-700'}`}>
                수동 수정
              </button>
            </div>
          </div>

          {/* 사유 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">사유 *</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='예: "Slooby 발주 협상가" / "표준 시세 적용"'
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          {/* 합계 미리보기 */}
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
            <div className="flex items-center justify-between text-gray-700">
              <span>합계 <span className="text-xs text-gray-500">({won(Number(unitCost || 0))} × {quantity}매 + 판비 {won(Number(setupCost || 0))})</span></span>
              <span className="font-bold text-amber-900 text-lg">{won(total)}</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded">취소</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} 저장
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCostModal({
  onClose,
  orderItem,
  existing,
  autoLookup,
  onApplyLookup,
  onSaved,
  onRemove,
  setError,
  recordedBy,
}: {
  onClose: () => void;
  orderItem: OrderItem;
  existing: ItemCostRow | null;
  autoLookup: { unit_cost: number | null; loading: boolean };
  onApplyLookup: () => void;
  onSaved: () => void;
  onRemove: () => void;
  setError: (e: string | null) => void;
  recordedBy: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [unitCost, setUnitCost] = useState(String(existing?.unit_cost || ''));
  const [costSource, setCostSource] = useState<'manual_override' | 'retail_purchase'>(
    (existing?.cost_source === 'retail_purchase' ? 'retail_purchase' : 'manual_override')
  );
  const [reason, setReason] = useState(existing?.override_reason || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!unitCost || Number(unitCost) <= 0) {
      setError('단가를 입력하세요');
      return;
    }
    if (!reason.trim()) {
      setError('사유를 입력하세요');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        order_item_id: orderItem.id,
        unit_cost: Number(unitCost),
        quantity: orderItem.quantity,
        cost_source: costSource,
        override_reason: reason,
        recorded_by: recordedBy,
      };
      if (existing) {
        const { error } = await supabase.from('order_item_costs').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('order_item_costs').insert(payload);
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">제품 원가 입력</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* 자동 조회 */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wand2 className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">단가표 자동 조회</span>
            </div>
            {autoLookup.loading ? (
              <div className="text-sm text-blue-700 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 조회 중...</div>
            ) : autoLookup.unit_cost != null ? (
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-blue-900">
                  발주일 기준 단가표: <b>{won(autoLookup.unit_cost)}/매</b> = <b>{won(autoLookup.unit_cost * orderItem.quantity)}</b>
                </div>
                <button onClick={onApplyLookup} className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700">이 가격으로 등록</button>
              </div>
            ) : (
              <div className="text-sm text-blue-700">단가표에 등록된 가격이 없습니다. 아래에 직접 입력하세요.</div>
            )}
          </div>

          <div className="text-xs text-gray-500 -my-2 text-center">또는</div>

          {/* 수동 입력 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">매당 원가</label>
            <div className="relative">
              <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="3000" className="w-full border rounded px-3 py-2 text-sm pr-8" />
              <span className="absolute right-3 top-2.5 text-sm text-gray-400">원</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">가격 종류</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setCostSource('manual_override')} className={`px-2 py-2 text-sm rounded border ${costSource === 'manual_override' ? 'bg-amber-100 border-amber-500 text-amber-900 font-medium' : 'bg-white border-gray-300 text-gray-700'}`}>
                수동 수정
              </button>
              <button onClick={() => setCostSource('retail_purchase')} className={`px-2 py-2 text-sm rounded border ${costSource === 'retail_purchase' ? 'bg-rose-100 border-rose-500 text-rose-900 font-medium' : 'bg-white border-gray-300 text-gray-700'}`}>
                소비자가 매입
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {costSource === 'retail_purchase' ? '급매로 도매가 아닌 소비자가에 매입한 경우' : '단가표 가격을 임의로 수정'}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">사유 *</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='예: "급매로 동대문 소비자가 매입"'
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex items-center justify-between sticky bottom-0">
          <div>
            {existing && (
              <button onClick={onRemove} className="text-sm text-red-600 hover:underline">삭제</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded">취소</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShippingSection({
  orderId,
  legs,
  visibleItemIds,
  isSuperAdmin,
  onChanged,
  setError,
  recordedBy,
}: {
  orderId: string;
  legs: ShippingLegRow[];
  visibleItemIds: string[];
  isSuperAdmin: boolean;
  onChanged: () => void;
  setError: (e: string | null) => void;
  recordedBy: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const visibleLegs = isSuperAdmin
    ? legs
    : legs.filter((l) => l.order_item_id && visibleItemIds.includes(l.order_item_id));
  const total = visibleLegs.reduce((s, r) => s + Number(r.amount || 0), 0);

  const [showModal, setShowModal] = useState(false);
  const [editingLeg, setEditingLeg] = useState<ShippingLegRow | null>(null);

  const remove = async (id: string) => {
    if (!confirm('이 배송 기록을 삭제할까요?')) return;
    const { error } = await supabase.from('order_shipping_legs').delete().eq('id', id);
    if (error) setError(error.message);
    else onChanged();
  };

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">내부 배송비</h3>
          <span className="text-xs text-gray-500">(소비자 배송과 별개)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{won(total)}</span>
          <button onClick={() => setShowModal(true)} className="text-xs bg-gray-700 text-white rounded px-3 py-1 hover:bg-gray-800 flex items-center gap-1">
            <Plus className="w-3 h-3" /> 추가
          </button>
        </div>
      </div>

      {visibleLegs.length === 0 ? (
        <div className="text-xs text-gray-400 italic py-3 text-center bg-gray-50 rounded">
          내부 배송 기록이 없습니다 (원자재 입고, 공장 배송 등)
        </div>
      ) : (
        <div className="space-y-1">
          {visibleLegs.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1.5 px-2 bg-gray-50 rounded text-sm">
              <span className="font-medium text-gray-800 min-w-[80px]">{LEG_LABEL[r.leg_type]}</span>
              <span className="text-gray-900">{won(Number(r.amount))}</span>
              {r.carrier && <span className="text-xs text-gray-500">· {r.carrier}</span>}
              {r.note && <span className="text-xs text-gray-500 truncate">· {r.note}</span>}
              <button onClick={() => setEditingLeg(r)} className="ml-auto text-gray-400 hover:text-blue-600" title="수정"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => remove(r.id)} className="text-gray-400 hover:text-red-500" title="삭제"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {(showModal || editingLeg) && (
        <ShippingModal
          orderId={orderId}
          visibleItemIds={visibleItemIds}
          existing={editingLeg}
          onClose={() => { setShowModal(false); setEditingLeg(null); }}
          onSaved={() => { setShowModal(false); setEditingLeg(null); onChanged(); }}
          setError={setError}
          recordedBy={recordedBy}
        />
      )}
    </div>
  );
}

function ShippingModal({
  orderId,
  visibleItemIds,
  existing,
  onClose,
  onSaved,
  setError,
  recordedBy,
}: {
  orderId: string;
  visibleItemIds: string[];
  existing?: ShippingLegRow | null;
  onClose: () => void;
  onSaved: () => void;
  setError: (e: string | null) => void;
  recordedBy: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isEdit = !!existing;
  const [legType, setLegType] = useState<ShippingLegRow['leg_type']>(existing?.leg_type || 'to_factory');
  const [amount, setAmount] = useState(existing?.amount != null ? String(existing.amount) : '');
  const [carrier, setCarrier] = useState(existing?.carrier || '');
  const [note, setNote] = useState(existing?.note || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('금액을 입력하세요');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && existing) {
        const { error } = await supabase.from('order_shipping_legs').update({
          leg_type: legType,
          amount: Number(amount),
          carrier: carrier || null,
          note: note || null,
        }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('order_shipping_legs').insert({
          order_id: orderId,
          order_item_id: visibleItemIds[0] || null,
          leg_type: legType,
          amount: Number(amount),
          carrier: carrier || null,
          note: note || null,
          created_by: recordedBy,
        });
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Truck className="w-5 h-5 text-gray-600" /> {isEdit ? '내부 배송 수정' : '내부 배송 추가'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">배송 유형</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(LEG_LABEL) as ShippingLegRow['leg_type'][]).map((t) => (
                <button key={t} onClick={() => setLegType(t)} className={`px-2 py-1.5 text-sm rounded border ${legType === t ? 'bg-gray-800 border-gray-800 text-white font-medium' : 'bg-white border-gray-300 text-gray-700'}`}>
                  {LEG_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">금액 *</label>
            <div className="relative">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" className="w-full border rounded px-3 py-2 text-sm pr-8" />
              <span className="absolute right-3 top-2.5 text-sm text-gray-400">원</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">택배사 (선택)</label>
            <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="로젠택배" className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">메모 (선택)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="원단 입고분" className="w-full border rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded">취소</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-50 flex items-center gap-1">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} 저장
          </button>
        </div>
      </div>
    </div>
  );
}

function CostAdjustmentsSection({
  item,
  adjustments,
  onChanged,
  setError,
  recordedBy,
}: {
  item: OrderItem;
  adjustments: CostAdjustmentRow[];
  onChanged: () => void;
  setError: (e: string | null) => void;
  recordedBy: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ amount: '', reason: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ amount: '', reason: '' });

  const addOne = async () => {
    if (!draft.amount || !draft.reason.trim()) {
      setError('금액과 사유를 입력하세요');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const { error } = await supabase.from('order_item_cost_adjustments').insert({
        order_item_id: item.id,
        amount: Number(draft.amount),
        reason: draft.reason.trim(),
        recorded_by: recordedBy,
      });
      if (error) throw error;
      setDraft({ amount: '', reason: '' });
      onChanged();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setAdding(false);
    }
  };

  const saveEdit = async (id: string) => {
    if (!editDraft.amount || !editDraft.reason.trim()) {
      setError('금액과 사유를 입력하세요');
      return;
    }
    try {
      const { error } = await supabase.from('order_item_cost_adjustments').update({
        amount: Number(editDraft.amount),
        reason: editDraft.reason.trim(),
      }).eq('id', id);
      if (error) throw error;
      setEditingId(null);
      onChanged();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 조정 행을 삭제할까요?')) return;
    const { error } = await supabase.from('order_item_cost_adjustments').delete().eq('id', id);
    if (error) setError(error.message);
    else onChanged();
  };

  const sum = adjustments.reduce((s, a) => s + Number(a.amount || 0), 0);

  return (
    <div className="border-t pt-3 mb-3">
      <div className="flex items-center gap-1 mb-2 text-xs font-medium text-gray-700">
        <span>± 발주/원가 조정 ({adjustments.length}건, 합계 {sum >= 0 ? '+' : ''}{won(sum)})</span>
      </div>

      {adjustments.length === 0 && (
        <div className="text-xs text-gray-400 italic mb-2">조정 없음</div>
      )}

      {adjustments.map((a) => {
        const isEdit = editingId === a.id;
        const amtNum = Number(a.amount);
        if (isEdit) {
          return (
            <div key={a.id} className="flex items-center gap-2 bg-blue-50 rounded px-2 py-1.5 mb-1">
              <input
                type="number"
                value={editDraft.amount}
                onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                className="w-32 border rounded px-2 py-1 text-sm"
              />
              <span className="text-xs text-gray-400">원</span>
              <input
                type="text"
                value={editDraft.reason}
                onChange={(e) => setEditDraft({ ...editDraft, reason: e.target.value })}
                className="flex-1 border rounded px-2 py-1 text-sm"
              />
              <button onClick={() => saveEdit(a.id)} className="text-emerald-600 hover:text-emerald-800" title="저장"><Check className="w-4 h-4" /></button>
              <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-700" title="취소"><X className="w-4 h-4" /></button>
            </div>
          );
        }
        return (
          <div key={a.id} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5 mb-1 text-sm">
            <span className={`flex items-center gap-1 font-semibold min-w-[110px] ${amtNum >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {amtNum >= 0 ? <PlusCircle className="w-4 h-4" /> : <MinusCircle className="w-4 h-4" />}
              {amtNum >= 0 ? '+' : ''}{won(amtNum)}
            </span>
            <span className="flex-1 text-gray-700 truncate">{a.reason}</span>
            <button onClick={() => { setEditingId(a.id); setEditDraft({ amount: String(a.amount), reason: a.reason }); }} className="text-gray-400 hover:text-blue-600" title="수정"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => remove(a.id)} className="text-gray-400 hover:text-red-500" title="삭제"><Trash2 className="w-4 h-4" /></button>
          </div>
        );
      })}

      <div className="flex items-center gap-2 mt-2 bg-gray-50 rounded px-2 py-1.5">
        <input
          type="number"
          value={draft.amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          placeholder="금액 (음수 가능)"
          className="w-32 border rounded px-2 py-1 text-sm"
        />
        <span className="text-xs text-gray-400">원</span>
        <input
          type="text"
          value={draft.reason}
          onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          placeholder="사유 (예: 시즌 인상분, 불량 보전 차감 등)"
          className="flex-1 border rounded px-2 py-1 text-sm"
        />
        <button
          onClick={addOne}
          disabled={adding}
          className="text-xs bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
        >
          {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} 추가
        </button>
      </div>
    </div>
  );
}
