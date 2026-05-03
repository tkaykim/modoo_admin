'use client';

// 영업사원 정산 수동 입력/관리 — 매월 정산 row 생성 + 지급완료 처리
// 자동 cron 도입 전까지 운영팀이 수동으로 입력하는 화면

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { Loader2, Plus, Check, RefreshCw, Search, X } from 'lucide-react';

interface SalesmanLite {
  id: string;
  salesman_code: string;
  display_name: string | null;
  grade: string | null;
  status: string | null;
}

interface SettlementRow {
  id: string;
  salesman_id: string;
  settlement_period: string;
  gross_revenue: number;
  commission_rate_applied: number;
  commission_amount: number;
  status: 'pending' | 'calculated' | 'paid';
  paid_at: string | null;
  paid_amount: number | null;
  note: string | null;
  created_at: string;
  salesman?: SalesmanLite | null;
}

interface GradeLevel {
  level: string;
  commission_rate: number;
}

const fmt = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

function getDefaultPeriod(now: Date = new Date()): string {
  // 직전 달 기본
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

export default function SalespersonsSettlements() {
  const supabase = createClient();
  const [salesmen, setSalesmen] = useState<SalesmanLite[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(getDefaultPeriod());
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [smRes, glRes, stRes] = await Promise.all([
        supabase
          .from('salesman_profiles')
          .select('id, salesman_code, display_name, grade, status')
          .eq('status', 'active')
          .order('display_name'),
        supabase.from('salesman_grade_levels').select('level, commission_rate').order('display_order'),
        supabase
          .from('salesman_monthly_settlements')
          .select('*, salesman:salesman_profiles(id, salesman_code, display_name, grade, status)')
          .order('settlement_period', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);
      if (smRes.error) throw smRes.error;
      if (glRes.error) throw glRes.error;
      if (stRes.error) throw stRes.error;
      setSalesmen((smRes.data ?? []) as SalesmanLite[]);
      setGrades((glRes.data ?? []) as GradeLevel[]);
      setSettlements((stRes.data ?? []) as unknown as SettlementRow[]);
    } catch (err) {
      console.error(err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filteredSettlements = useMemo(() => {
    return settlements.filter((s) => {
      if (period !== 'all' && s.settlement_period !== period) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const sm = s.salesman;
        if (!sm) return false;
        return (
          (sm.display_name ?? '').toLowerCase().includes(q) ||
          sm.salesman_code.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [settlements, period, search]);

  const periodOptions = useMemo(() => {
    const set = new Set<string>(settlements.map((s) => s.settlement_period));
    set.add(getDefaultPeriod());
    set.add(getDefaultPeriod(new Date(new Date().getFullYear(), new Date().getMonth())));
    return Array.from(set).sort().reverse();
  }, [settlements]);

  const totals = useMemo(() => {
    const t = filteredSettlements.reduce(
      (acc, s) => {
        acc.gross += Number(s.gross_revenue);
        acc.commission += Number(s.commission_amount);
        if (s.status === 'paid') acc.paid += Number(s.paid_amount ?? s.commission_amount);
        if (s.status === 'pending') acc.pending += 1;
        return acc;
      },
      { gross: 0, commission: 0, paid: 0, pending: 0 }
    );
    return t;
  }, [filteredSettlements]);

  const togglePaid = async (s: SettlementRow) => {
    try {
      if (s.status === 'paid') {
        await supabase
          .from('salesman_monthly_settlements')
          .update({ status: 'calculated', paid_at: null, paid_amount: null })
          .eq('id', s.id);
      } else {
        const net = Math.floor(Number(s.commission_amount) * (1 - 0.033));
        await supabase
          .from('salesman_monthly_settlements')
          .update({ status: 'paid', paid_at: new Date().toISOString(), paid_amount: net })
          .eq('id', s.id);
      }
      await refresh();
    } catch (err) {
      alert('상태 변경 실패: ' + (err as Error).message);
    }
  };

  const removeRow = async (s: SettlementRow) => {
    if (!confirm(`${s.settlement_period} 정산을 삭제할까요?`)) return;
    try {
      await supabase.from('salesman_monthly_settlements').delete().eq('id', s.id);
      await refresh();
    } catch (err) {
      alert('삭제 실패: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-900">월별 정산 관리</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              매월 1일~말일 매출 → 다음 달 15일 지급. 자동 cron 도입 전 수동 입력.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> 새로고침
            </button>
            <button
              onClick={() => setComposeOpen(true)}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> 정산 생성
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="all">전체 기간</option>
          {periodOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="flex-1 min-w-[200px] flex items-center gap-1.5 border border-gray-300 rounded-md px-2 py-1.5 bg-white">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="영업사원 이름 / 코드 검색"
            className="flex-1 text-xs outline-none bg-transparent"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="조회 정산" value={`${filteredSettlements.length}건`} />
        <Stat label="총 매출" value={fmt(totals.gross)} />
        <Stat label="총 수수료" value={fmt(totals.commission)} accent="text-blue-700" />
        <Stat label="지급 완료" value={fmt(totals.paid)} accent="text-emerald-700" />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">기간</th>
              <th className="px-3 py-2 text-left font-semibold">영업사원</th>
              <th className="px-3 py-2 text-right font-semibold">매출</th>
              <th className="px-3 py-2 text-right font-semibold">요율</th>
              <th className="px-3 py-2 text-right font-semibold">수수료</th>
              <th className="px-3 py-2 text-center font-semibold">상태</th>
              <th className="px-3 py-2 text-right font-semibold">실수령</th>
              <th className="px-3 py-2 text-right font-semibold">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> 불러오는 중...
                </td>
              </tr>
            ) : filteredSettlements.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  표시할 정산이 없습니다.
                </td>
              </tr>
            ) : (
              filteredSettlements.map((s) => {
                const sm = s.salesman;
                const statusBadge = (() => {
                  switch (s.status) {
                    case 'paid':       return { label: '지급 완료', cls: 'bg-emerald-100 text-emerald-700' };
                    case 'calculated': return { label: '계산 완료', cls: 'bg-amber-100 text-amber-700' };
                    case 'pending':
                    default:           return { label: '집계 중',   cls: 'bg-gray-100 text-gray-600' };
                  }
                })();
                return (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-mono">{s.settlement_period}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-900">{sm?.display_name ?? '—'}</div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {sm?.salesman_code} · {sm?.grade}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(Number(s.gross_revenue))}</td>
                    <td className="px-3 py-2 text-right">
                      {Math.round(Number(s.commission_rate_applied) * 100)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {fmt(Number(s.commission_amount))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">
                      {s.paid_amount ? fmt(Number(s.paid_amount)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => togglePaid(s)}
                          className={`text-[10px] px-2 py-1 rounded ${
                            s.status === 'paid'
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          {s.status === 'paid' ? (
                            <>지급 취소</>
                          ) : (
                            <>
                              <Check className="w-3 h-3 inline" /> 지급 완료
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => removeRow(s)}
                          className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {composeOpen && (
        <ComposeModal
          salesmen={salesmen}
          grades={grades}
          onClose={() => setComposeOpen(false)}
          onSaved={async () => {
            setComposeOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-3 py-2.5">
      <div className="text-[10px] text-gray-500 font-semibold">{label}</div>
      <div className={`text-sm font-bold mt-0.5 font-mono ${accent ?? 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

// =====================================================================
// 정산 생성 모달 (수동 입력 + 자동 집계)
// =====================================================================
function ComposeModal({
  salesmen,
  grades,
  onClose,
  onSaved,
}: {
  salesmen: SalesmanLite[];
  grades: GradeLevel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [salesmanId, setSalesmanId] = useState<string>('');
  const [period, setPeriod] = useState(getDefaultPeriod());
  const [grossRevenue, setGrossRevenue] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState(false);

  // salesman 선택 시 등급 → rate 기본값 채움
  useEffect(() => {
    if (!salesmanId) return;
    const sm = salesmen.find((s) => s.id === salesmanId);
    if (!sm?.grade) return;
    const g = grades.find((g) => g.level === sm.grade);
    if (g && !commissionRate) setCommissionRate(String(Number(g.commission_rate)));
  }, [salesmanId, salesmen, grades, commissionRate]);

  const grossNum = Math.max(0, Number(grossRevenue) || 0);
  const rateNum = Math.max(0, Math.min(1, Number(commissionRate) || 0));
  const commission = Math.floor(grossNum * rateNum);
  const withholding = Math.floor(commission * 0.033);
  const net = commission - withholding;

  const autoFillFromOrders = async () => {
    if (!salesmanId || !period) return;
    setAutoFilling(true);
    setError(null);
    try {
      const [year, month] = period.split('-').map(Number);
      const start = `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`;
      const end = new Date(year, month, 1).toISOString();
      const { data, error } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('attributed_salesman_id', salesmanId)
        .gte('created_at', start)
        .lt('created_at', end);
      if (error) throw error;
      const sum = (data ?? []).reduce((s, o) => s + (Number((o as { total_amount: number | null }).total_amount) || 0), 0);
      setGrossRevenue(String(sum));
    } catch (err) {
      setError('자동 집계 실패: ' + (err as Error).message);
    } finally {
      setAutoFilling(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!salesmanId) {
      setError('영업사원을 선택해주세요.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setError('기간 형식이 올바르지 않습니다 (YYYY-MM).');
      return;
    }
    if (grossNum < 0 || rateNum < 0) {
      setError('매출과 요율은 0 이상이어야 합니다.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('salesman_monthly_settlements')
        .upsert(
          {
            salesman_id: salesmanId,
            settlement_period: period,
            gross_revenue: grossNum,
            commission_rate_applied: rateNum,
            commission_amount: commission,
            status: 'calculated',
            note: note.trim() || null,
          },
          { onConflict: 'salesman_id,settlement_period' }
        );
      if (error) throw error;
      onSaved();
    } catch (err) {
      setError('저장 실패: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="font-bold text-gray-900">정산 생성</h3>
          <button onClick={onClose} className="p-1 text-gray-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">영업사원 *</label>
            <select
              value={salesmanId}
              onChange={(e) => setSalesmanId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm bg-white"
            >
              <option value="">선택하세요</option>
              {salesmen.map((sm) => (
                <option key={sm.id} value={sm.id}>
                  {sm.display_name} ({sm.salesman_code} · {sm.grade})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">기간 (YYYY-MM)</label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="2026-04"
                className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">수수료율</label>
              <input
                type="number"
                step="0.001"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                placeholder="0.16"
                className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-gray-700">총 매출 (₩) *</label>
              <button
                onClick={autoFillFromOrders}
                disabled={!salesmanId || autoFilling}
                className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold hover:bg-blue-100 disabled:opacity-50"
              >
                {autoFilling ? '집계 중...' : 'orders 자동 집계'}
              </button>
            </div>
            <input
              type="number"
              value={grossRevenue}
              onChange={(e) => setGrossRevenue(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm font-mono"
            />
          </div>

          {/* Preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-gray-600">수수료</span><span className="font-mono font-semibold">{fmt(commission)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">원천징수 3.3%</span><span className="font-mono text-red-600">-{fmt(withholding)}</span></div>
            <div className="flex justify-between border-t border-gray-200 pt-1 mt-1"><span className="text-gray-700 font-bold">실수령</span><span className="font-mono font-bold text-emerald-700">{fmt(net)}</span></div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">메모 (선택)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm resize-none"
              placeholder="특이사항"
            />
          </div>

          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{error}</div>}
        </div>
        <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 border border-gray-300 rounded-md">취소</button>
          <button
            onClick={handleSave}
            disabled={saving || !salesmanId}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md disabled:opacity-50 hover:bg-blue-700"
          >
            {saving ? '저장 중...' : '저장 (upsert)'}
          </button>
        </div>
      </div>
    </div>
  );
}
