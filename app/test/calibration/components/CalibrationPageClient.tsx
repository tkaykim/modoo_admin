'use client';

import { useEffect, useRef, useState } from 'react';
import { useCalibrationState, parseOperationalIds } from '../hooks/useCalibrationState';
import { getAnchorLabel } from '../lib/types';
import { CalibrationTab } from './CalibrationTab';
import { AnchorRegistrar } from './AnchorRegistrar';
import { UserSimulator } from './UserSimulator';
import { ComparisonReport } from './ComparisonReport';
import { CalibTestErrorBoundary } from './ErrorBoundary';
import { clearState } from '../lib/storage';
import {
  fetchOperationalProducts,
  loadAllCalibPayloads,
  upsertCalibPayload,
} from '../lib/operationalDb';

type Tab = 'calibration' | 'anchors' | 'simulator' | 'report';

const TABS: { id: Tab; label: string; status: 'ready' | 'placeholder' }[] = [
  { id: 'calibration', label: '① 캘리브', status: 'ready' },
  { id: 'anchors', label: '② 앵커 등록', status: 'ready' },
  { id: 'simulator', label: '③ 사용자 시뮬레이션', status: 'ready' },
  { id: 'report', label: '④ 비교 리포트', status: 'ready' },
];

export function CalibrationPageClient() {
  const {
    state,
    selectedProduct,
    selectedSide,
    selectProduct,
    selectSide,
    addProduct,
    addSide,
    setMockupImage,
    upsertLine,
    removeLine,
    setActiveLine,
    upsertAnchor,
    removeAnchor,
    setApplicableAnchors,
    setLegacyProductWidthMm,
    upsertScenario,
    removeScenario,
    importOperationalProducts,
    applyCalibPayloads,
    addCustomAnchor,
    removeCustomAnchor,
  } = useCalibrationState();
  const [tab, setTab] = useState<Tab>('calibration');
  const [loadingOp, setLoadingOp] = useState(false);
  const [opStatus, setOpStatus] = useState<string | null>(null);
  const autoLoadedRef = useRef(false);

  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    (async () => {
      setLoadingOp(true);
      setOpStatus('운영 DB에서 제품 목록 불러오는 중...');
      try {
        const products = await fetchOperationalProducts();
        await importOperationalProducts(products);
        setOpStatus(`제품 ${products.length}개 로드 완료. 캘리브 데이터 동기화 중...`);
        const rows = await loadAllCalibPayloads();
        applyCalibPayloads(rows);
        setOpStatus(`✅ 제품 ${products.length}개 · 저장된 캘리브 ${rows.length}건 로드`);
      } catch (e: any) {
        setOpStatus(`❌ 자동 로드 실패: ${e?.message ?? e}`);
      } finally {
        setLoadingOp(false);
      }
    })();
  }, [importOperationalProducts, applyCalibPayloads]);

  const handleAddProduct = () => {
    const name = window.prompt('새 제품 이름', '신규 제품');
    if (name) addProduct(name);
  };

  const handleAddSide = () => {
    if (!selectedProduct) return;
    const name = window.prompt('새 면 이름 (front/back/left-sleeve/right-sleeve/hood 등)', 'front');
    if (name) addSide(selectedProduct.id, name);
  };

  const handleRefresh = async () => {
    if (loadingOp) return;
    setLoadingOp(true);
    setOpStatus('운영 DB 조회 중...');
    try {
      const products = await fetchOperationalProducts();
      await importOperationalProducts(products);
      const rows = await loadAllCalibPayloads();
      applyCalibPayloads(rows);
      setOpStatus(`✅ 제품 ${products.length}개 · 캘리브 ${rows.length}건 동기화`);
    } catch (e: any) {
      setOpStatus(`❌ 실패: ${e?.message ?? e}`);
    } finally {
      setLoadingOp(false);
    }
  };

  const handleSaveSideToDb = async () => {
    if (!selectedProduct || !selectedSide) return;
    const ids = parseOperationalIds(selectedProduct.id, selectedSide.id);
    if (!ids) {
      alert('운영 DB에서 불러온 제품·면만 DB 저장이 가능합니다.');
      return;
    }
    setOpStatus('DB 저장 중...');
    try {
      // Embed human-readable label per anchor so user/admin canvases can
      // display custom anchor labels without access to the test page's
      // customAnchors localStorage.
      const registeredAnchorsWithLabels = selectedSide.registeredAnchors.map((a) => ({
        ...a,
        label: getAnchorLabel(a.id, state.customAnchors),
      }));
      await upsertCalibPayload(ids.productId, ids.sideId, {
        mockup: {
          legacyProductWidthMm: selectedSide.mockup.legacyProductWidthMm,
          lines: selectedSide.mockup.lines,
        },
        applicableAnchors: selectedSide.applicableAnchors,
        registeredAnchors: registeredAnchorsWithLabels,
        scenarios: selectedSide.scenarios ?? [],
      });
      setOpStatus(`✅ "${selectedProduct.name} / ${selectedSide.name}" 저장됨`);
    } catch (e: any) {
      setOpStatus(`❌ 저장 실패: ${e?.message ?? e}`);
    }
  };

  const handleResetAll = () => {
    if (!window.confirm('테스트 페이지의 모든 localStorage 데이터를 삭제할까요? (운영 데이터 영향 없음)')) return;
    clearState();
    window.location.reload();
  };

  return (
    <CalibTestErrorBoundary>
      <div className="min-h-screen bg-yellow-50/40 p-4">
        <header className="mb-4 border-2 border-yellow-400 bg-yellow-100 p-3 rounded">
          <h1 className="text-lg font-bold text-yellow-900">
            📐 제품 캘리브레이션 관리
          </h1>
          <p className="text-xs text-yellow-800 mt-1">
            운영 제품(<code>products</code>)을 자동 로드하고, 면별 환산비·앵커·자주
            쓰는 위치를 <code>product_calibrations</code> 테이블(jsonb)에 저장합니다.
            로컬 캐시는 작업 중 임시 보관용이며, "현재 면 DB 저장" 버튼이 진실원입니다.
          </p>
        </header>

        <div className="bg-white border rounded p-3 mb-4 flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm">
            제품:
            <select
              className="border rounded px-2 py-1"
              value={state.selectedProductId ?? ''}
              onChange={(e) => selectProduct(e.target.value)}
            >
              {state.products.map((p) => {
                const meta = [p.manufacturerName, p.productCode].filter(Boolean).join(' · ');
                return (
                  <option key={p.id} value={p.id}>
                    {meta ? `${p.name} — ${meta}` : p.name}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            onClick={handleAddProduct}
            className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            + 제품 추가
          </button>
          {selectedProduct && (selectedProduct.manufacturerName || selectedProduct.productCode) && (
            <span className="text-xs text-gray-700 bg-gray-100 border border-gray-200 rounded px-2 py-1 font-mono">
              {selectedProduct.manufacturerName && (
                <>제조사 <b className="text-gray-900">{selectedProduct.manufacturerName}</b></>
              )}
              {selectedProduct.manufacturerName && selectedProduct.productCode && ' · '}
              {selectedProduct.productCode && (
                <>코드 <b className="text-gray-900">{selectedProduct.productCode}</b></>
              )}
            </span>
          )}

          <span className="text-gray-300">|</span>

          <label className="flex items-center gap-2 text-sm">
            면:
            <select
              className="border rounded px-2 py-1"
              value={state.selectedSideId ?? ''}
              onChange={(e) => selectSide(e.target.value)}
            >
              {selectedProduct?.sides.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleAddSide}
            disabled={!selectedProduct}
            className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
          >
            + 면 추가
          </button>

          <span className="ml-auto" />
          {opStatus && <span className="text-xs text-gray-600">{opStatus}</span>}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loadingOp}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 rounded disabled:opacity-50"
            title="운영 제품 + DB 저장된 캘리브를 다시 불러옴"
          >
            {loadingOp ? '불러오는 중...' : '🔄 새로고침'}
          </button>
          <button
            type="button"
            onClick={handleSaveSideToDb}
            disabled={!selectedProduct?.id.startsWith('op-')}
            className="px-2 py-1 text-xs bg-emerald-600 text-white hover:bg-emerald-700 rounded disabled:opacity-40"
            title="현재 면의 캘리브/앵커/시나리오를 DB에 저장"
          >
            현재 면 DB 저장
          </button>
          <button
            type="button"
            onClick={handleResetAll}
            className="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded"
            title="브라우저 localStorage만 초기화 (DB 무영향)"
          >
            로컬 캐시 초기화
          </button>
        </div>

        <nav className="flex gap-1 mb-4 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm rounded-t transition ${
                tab === t.id
                  ? 'bg-white border border-b-white border-gray-300 -mb-px font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
              {t.status === 'placeholder' && (
                <span className="ml-1 text-[10px] text-gray-400">(예정)</span>
              )}
            </button>
          ))}
        </nav>

        <main>
          {tab === 'calibration' && selectedProduct && selectedSide && (
            <CalibrationTab
              productId={selectedProduct.id}
              side={selectedSide}
              setMockupImage={setMockupImage}
              upsertLine={upsertLine}
              removeLine={removeLine}
              setActiveLine={setActiveLine}
            />
          )}
          {tab === 'anchors' && selectedProduct && selectedSide && (
            <AnchorRegistrar
              productId={selectedProduct.id}
              side={selectedSide}
              customAnchors={state.customAnchors}
              upsertAnchor={upsertAnchor}
              removeAnchor={removeAnchor}
              setApplicableAnchors={setApplicableAnchors}
              addCustomAnchor={addCustomAnchor}
              removeCustomAnchor={removeCustomAnchor}
            />
          )}
          {tab === 'simulator' && selectedSide && (
            <UserSimulator side={selectedSide} customAnchors={state.customAnchors} />
          )}
          {tab === 'report' && selectedProduct && selectedSide && (
            <ComparisonReport
              productId={selectedProduct.id}
              side={selectedSide}
              setLegacyProductWidthMm={setLegacyProductWidthMm}
              upsertScenario={upsertScenario}
              removeScenario={removeScenario}
            />
          )}
        </main>
      </div>
    </CalibTestErrorBoundary>
  );
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="p-12 border border-dashed border-gray-300 rounded bg-white text-center text-gray-500">
      <div className="text-lg mb-2">{title}</div>
      <p className="text-xs">이 탭은 다음 단계에서 구현됩니다.</p>
    </div>
  );
}
