'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalibrationState,
  TestProduct,
  TestSide,
  MockupCalibration,
  CalibrationLine,
  AnchorPlacement,
  AnchorId,
  ComparisonScenario,
  EMPTY_MOCKUP,
  DEFAULT_APPLICABLE_ANCHORS,
} from '../lib/types';
import { loadState, saveState } from '../lib/storage';
import {
  OperationalProduct,
  suggestAnchorsForSide,
  CalibPayloadRow,
} from '../lib/operationalDb';

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

function makeSeedSide(name: string): TestSide {
  return {
    id: `${name}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    mockup: { ...EMPTY_MOCKUP, lines: [] },
    applicableAnchors: DEFAULT_APPLICABLE_ANCHORS[name] ?? [],
    registeredAnchors: [],
  };
}

const initialState: CalibrationState = {
  products: [],
  selectedProductId: null,
  selectedSideId: null,
  customAnchors: [],
  schemaVersion: 1,
};

export function useCalibrationState() {
  const [state, setState] = useState<CalibrationState>(initialState);
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = loadState();
    if (stored) {
      setState({ ...stored, customAnchors: stored.customAnchors ?? [] });
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveState(state);
  }, [state]);

  const selectedProduct = useMemo(
    () => state.products.find((p) => p.id === state.selectedProductId) ?? null,
    [state.products, state.selectedProductId],
  );

  const selectedSide = useMemo(
    () => selectedProduct?.sides.find((s) => s.id === state.selectedSideId) ?? null,
    [selectedProduct, state.selectedSideId],
  );

  const selectProduct = useCallback((productId: string) => {
    setState((prev) => {
      const p = prev.products.find((x) => x.id === productId);
      return {
        ...prev,
        selectedProductId: productId,
        selectedSideId: p?.sides[0]?.id ?? null,
      };
    });
  }, []);

  const selectSide = useCallback((sideId: string) => {
    setState((prev) => ({ ...prev, selectedSideId: sideId }));
  }, []);

  const addProduct = useCallback((name: string) => {
    setState((prev) => {
      const id = `prod-${Date.now().toString(36)}`;
      const newProduct: TestProduct = {
        id,
        name,
        sides: [makeSeedSide('front')],
      };
      return {
        ...prev,
        products: [...prev.products, newProduct],
        selectedProductId: id,
        selectedSideId: newProduct.sides[0].id,
      };
    });
  }, []);

  const addSide = useCallback((productId: string, name: string) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (p.id !== productId) return p;
        const side = makeSeedSide(name);
        return { ...p, sides: [...p.sides, side] };
      }),
    }));
  }, []);

  const updateMockup = useCallback(
    (productId: string, sideId: string, mutator: (m: MockupCalibration) => MockupCalibration) => {
      setState((prev) => ({
        ...prev,
        products: prev.products.map((p) =>
          p.id !== productId
            ? p
            : {
                ...p,
                sides: p.sides.map((s) =>
                  s.id !== sideId ? s : { ...s, mockup: mutator(s.mockup) },
                ),
              },
        ),
      }));
    },
    [],
  );

  const setMockupImage = useCallback(
    (
      productId: string,
      sideId: string,
      payload: { dataUrl: string; nativeWidth: number; nativeHeight: number },
    ) => {
      updateMockup(productId, sideId, (m) => ({
        ...m,
        mockupDataUrl: payload.dataUrl,
        imageNativeWidthPx: payload.nativeWidth,
        imageNativeHeightPx: payload.nativeHeight,
        lines: m.lines,
      }));
    },
    [updateMockup],
  );

  const upsertLine = useCallback(
    (productId: string, sideId: string, line: CalibrationLine) => {
      updateMockup(productId, sideId, (m) => {
        const existingIdx = m.lines.findIndex((l) => l.id === line.id);
        const lines =
          existingIdx >= 0
            ? m.lines.map((l, i) => (i === existingIdx ? line : l))
            : [...m.lines, line];
        const ensureSingleActive = lines.map((l) => ({
          ...l,
          active: l.id === line.id ? line.active : line.active ? false : l.active,
        }));
        return { ...m, lines: ensureSingleActive };
      });
    },
    [updateMockup],
  );

  const removeLine = useCallback(
    (productId: string, sideId: string, lineId: string) => {
      updateMockup(productId, sideId, (m) => ({
        ...m,
        lines: m.lines.filter((l) => l.id !== lineId),
      }));
    },
    [updateMockup],
  );

  const setActiveLine = useCallback(
    (productId: string, sideId: string, lineId: string) => {
      updateMockup(productId, sideId, (m) => ({
        ...m,
        lines: m.lines.map((l) => ({ ...l, active: l.id === lineId })),
      }));
    },
    [updateMockup],
  );

  const updateSide = useCallback(
    (productId: string, sideId: string, mutator: (s: TestSide) => TestSide) => {
      setState((prev) => ({
        ...prev,
        products: prev.products.map((p) =>
          p.id !== productId
            ? p
            : { ...p, sides: p.sides.map((s) => (s.id !== sideId ? s : mutator(s))) },
        ),
      }));
    },
    [],
  );

  const upsertAnchor = useCallback(
    (productId: string, sideId: string, anchor: AnchorPlacement) => {
      updateSide(productId, sideId, (s) => {
        const idx = s.registeredAnchors.findIndex((a) => a.id === anchor.id);
        const registeredAnchors =
          idx >= 0
            ? s.registeredAnchors.map((a, i) => (i === idx ? anchor : a))
            : [...s.registeredAnchors, anchor];
        return { ...s, registeredAnchors };
      });
    },
    [updateSide],
  );

  const removeAnchor = useCallback(
    (productId: string, sideId: string, anchorId: AnchorId) => {
      updateSide(productId, sideId, (s) => ({
        ...s,
        registeredAnchors: s.registeredAnchors.filter((a) => a.id !== anchorId),
      }));
    },
    [updateSide],
  );

  const setApplicableAnchors = useCallback(
    (productId: string, sideId: string, anchors: AnchorId[]) => {
      updateSide(productId, sideId, (s) => ({ ...s, applicableAnchors: anchors }));
    },
    [updateSide],
  );

  const setLegacyProductWidthMm = useCallback(
    (productId: string, sideId: string, widthMm: number | undefined) => {
      updateMockup(productId, sideId, (m) => ({ ...m, legacyProductWidthMm: widthMm }));
    },
    [updateMockup],
  );

  const upsertScenario = useCallback(
    (productId: string, sideId: string, scenario: ComparisonScenario) => {
      updateSide(productId, sideId, (s) => {
        const list = s.scenarios ?? [];
        const idx = list.findIndex((x) => x.id === scenario.id);
        const next = idx >= 0 ? list.map((x, i) => (i === idx ? scenario : x)) : [...list, scenario];
        return { ...s, scenarios: next };
      });
    },
    [updateSide],
  );

  const importOperationalProducts = useCallback(async (products: OperationalProduct[]) => {
    const builtProducts: TestProduct[] = await Promise.all(
      products.map(async (p) => {
        const sides: TestSide[] = await Promise.all(
          p.sides.map(async (s) => {
            const dims = s.imageUrl
              ? await loadImageSize(s.imageUrl)
              : { width: 0, height: 0 };
            const mockup: MockupCalibration = {
              mockupDataUrl: s.imageUrl ?? null,
              imageNativeWidthPx: dims.width,
              imageNativeHeightPx: dims.height,
              lines: [],
              legacyProductWidthMm: s.realLifeDimensions?.productWidthMm,
            };
            return {
              id: `op-${p.id}-${s.id}`,
              name: s.name || s.id,
              mockup,
              applicableAnchors: suggestAnchorsForSide(s.id, s.name),
              registeredAnchors: [],
            };
          }),
        );
        return {
          id: `op-${p.id}`,
          name: p.title,
          productCode: p.productCode ?? null,
          manufacturerName: p.manufacturerName ?? null,
          sides,
        };
      }),
    );

    setState((prev) => {
      const stillSelectedProduct = builtProducts.find((p) => p.id === prev.selectedProductId);
      const firstProduct = stillSelectedProduct ?? builtProducts[0];
      const stillSelectedSide = firstProduct?.sides.find((s) => s.id === prev.selectedSideId);
      const firstSide = stillSelectedSide ?? firstProduct?.sides[0];
      return {
        ...prev,
        products: builtProducts,
        selectedProductId: firstProduct?.id ?? null,
        selectedSideId: firstSide?.id ?? null,
      };
    });
  }, []);

  const addCustomAnchor = useCallback((id: string, label: string) => {
    setState((prev) => {
      if (prev.customAnchors.some((c) => c.id === id)) return prev;
      return { ...prev, customAnchors: [...prev.customAnchors, { id, label }] };
    });
  }, []);

  const removeCustomAnchor = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      customAnchors: prev.customAnchors.filter((c) => c.id !== id),
    }));
  }, []);

  const applyCalibPayloads = useCallback((rows: CalibPayloadRow[]) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (!p.id.startsWith('op-')) return p;
        const realProductId = p.id.slice(3);
        return {
          ...p,
          sides: p.sides.map((s) => {
            const realSideId = s.id.replace(`op-${realProductId}-`, '');
            const row = rows.find(
              (r) =>
                r.product_id === realProductId &&
                r.side_id === realSideId,
            );
            if (!row || !row.payload) return s;
            const pl = row.payload as Partial<TestSide>;
            return {
              ...s,
              mockup: {
                ...s.mockup,
                legacyProductWidthMm:
                  pl.mockup?.legacyProductWidthMm ?? s.mockup.legacyProductWidthMm,
                lines: pl.mockup?.lines ?? s.mockup.lines,
              },
              applicableAnchors: pl.applicableAnchors ?? s.applicableAnchors,
              registeredAnchors: pl.registeredAnchors ?? s.registeredAnchors,
              scenarios: pl.scenarios ?? s.scenarios,
            };
          }),
        };
      }),
    }));
  }, []);

  const removeScenario = useCallback(
    (productId: string, sideId: string, scenarioId: string) => {
      updateSide(productId, sideId, (s) => ({
        ...s,
        scenarios: (s.scenarios ?? []).filter((x) => x.id !== scenarioId),
      }));
    },
    [updateSide],
  );

  return {
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
  };
}

export function parseOperationalIds(
  productInternalId: string,
  sideInternalId: string,
): { productId: string; sideId: string } | null {
  if (!productInternalId.startsWith('op-')) return null;
  const productId = productInternalId.slice(3);
  const sideId = sideInternalId.replace(`op-${productId}-`, '');
  return { productId, sideId };
}
