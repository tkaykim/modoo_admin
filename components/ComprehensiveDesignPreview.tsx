'use client';

import { useState, useEffect, useCallback } from 'react';
import { Canvas as FabricCanvas } from 'fabric';
import { OrderItem, Product, ProductSide, ExtractedColor, CanvasState } from '@/types/types';
import SingleSideCanvas from './canvas/SingleSideCanvas';

interface DesignElement {
  sideId: string;
  sideName: string;
  objectType: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  widthMm: number;
  heightMm: number;
  widthCm: number;
  heightCm: number;
  fill?: string;
  stroke?: string;
  position: {
    left: number;
    top: number;
  };
  printMethod?: '승화인쇄' | '전사' | '자수' | '일반인쇄';
}

interface SizeQuantity {
  size: string;
  quantity: number;
}

interface ComprehensiveDesignPreviewProps {
  orderItem: OrderItem;
  product: Product;
}

export default function ComprehensiveDesignPreview({
  orderItem,
  product,
}: ComprehensiveDesignPreviewProps) {
  const [designElements, setDesignElements] = useState<DesignElement[]>([]);
  const [extractedColors, setExtractedColors] = useState<ExtractedColor[]>([]);
  const [sizeQuantities, setSizeQuantities] = useState<SizeQuantity[]>([]);

  const getItemColorHex = () => {
    const variants = orderItem.item_options?.variants;
    if (Array.isArray(variants) && variants.length > 0 && variants[0]?.color_hex) {
      return variants[0].color_hex;
    }
    return orderItem.item_options?.color_hex || '#FFFFFF';
  };

  // Mock size data - in real implementation, this would come from the order
  useEffect(() => {
    // Example size data - replace with actual order size breakdown
    const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
    const mockSizes: SizeQuantity[] = sizes.map(size => ({
      size,
      quantity:
        size === (orderItem.item_options?.size_name || orderItem.item_options?.variants?.[0]?.size_name)
          ? orderItem.quantity
          : 0,
    }));
    setSizeQuantities(mockSizes);
  }, [orderItem]);

  const handleCanvasReady = useCallback((canvas: FabricCanvas, sideId: string, canvasScale: number) => {
    const currentSide = product.configuration.find(s => s.id === sideId);
    if (!currentSide) return;

    const objects = canvas.getObjects();
    const colors: ExtractedColor[] = [];
    const elements: DesignElement[] = [];

    const printArea = currentSide.printArea;

    let pixelToMmRatio = 1;
    const productWidthMm = currentSide.realLifeDimensions?.productWidthMm || 0;
    if (productWidthMm > 0 && printArea.width > 0) {
      pixelToMmRatio = productWidthMm / printArea.width;
    }

    objects.forEach((obj) => {
      const objData = obj as { data?: { id?: string } };
      if (
        objData.data?.id === 'background-product-image' ||
        objData.data?.id === 'center-line'
      ) {
        return;
      }

      // Extract colors
      const fill = obj.fill;
      if (fill && typeof fill === 'string' && fill !== 'transparent') {
        if (!colors.find(c => c.hex.toLowerCase() === fill.toLowerCase())) {
          colors.push({ hex: fill });
        }
      }

      const stroke = obj.stroke;
      if (stroke && typeof stroke === 'string') {
        if (!colors.find(c => c.hex.toLowerCase() === stroke.toLowerCase())) {
          colors.push({ hex: stroke });
        }
      }

      // Calculate dimensions
      const objWidthOnCanvas = (obj.width || 0) * (obj.scaleX || 1);
      const objHeightOnCanvas = (obj.height || 0) * (obj.scaleY || 1);

      const objWidthOriginal = objWidthOnCanvas / canvasScale;
      const objHeightOriginal = objHeightOnCanvas / canvasScale;

      const widthMm = objWidthOriginal * pixelToMmRatio;
      const heightMm = objHeightOriginal * pixelToMmRatio;

      let objectType = obj.type || 'Object';
      objectType = objectType.charAt(0).toUpperCase() + objectType.slice(1);

      // Determine print method based on object type and properties
      let printMethod: DesignElement['printMethod'] = '승화인쇄';
      if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') {
        printMethod = '승화인쇄';
      } else if (obj.type === 'image') {
        printMethod = '전사';
      }

      const element: DesignElement = {
        sideId,
        sideName: currentSide.name,
        objectType,
        widthMm,
        heightMm,
        widthCm: widthMm / 10,
        heightCm: heightMm / 10,
        fill: fill && typeof fill === 'string' && fill !== 'transparent' ? fill : undefined,
        stroke: stroke && typeof stroke === 'string' ? stroke : undefined,
        position: {
          left: obj.left || 0,
          top: obj.top || 0,
        },
        printMethod,
      };

      // Add text-specific properties
      if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') {
        const textObj = obj as any;
        element.text = textObj.text || '';
        element.fontFamily = textObj.fontFamily || '';
        element.fontSize = textObj.fontSize || 0;
      }

      elements.push(element);
    });

    setExtractedColors(prevColors => {
      const merged = [...prevColors];
      colors.forEach(color => {
        if (!merged.find(c => c.hex.toLowerCase() === color.hex.toLowerCase())) {
          merged.push(color);
        }
      });
      return merged;
    });

    setDesignElements(prevElements => [...prevElements, ...elements]);
  }, [product.configuration]);

  const totalQuantity = sizeQuantities.reduce((sum, sq) => sum + sq.quantity, 0);

  const getColorName = (hex: string): string => {
    const colorNames: Record<string, string> = {
      '#000000': '검정',
      '#000': '검정',
      '#ffffff': '흰색',
      '#fff': '흰색',
      '#ff0000': '빨강',
      '#f00': '빨강',
      '#00ff00': '초록',
      '#0f0': '초록',
      '#0000ff': '파랑',
      '#00f': '파랑',
      '#ffff00': '노랑',
      '#ff0': '노랑',
      '#ff00ff': '자주',
      '#f0f': '자주',
      '#00ffff': '청록',
      '#0ff': '청록',
    };

    return colorNames[hex.toLowerCase()] || hex;
  };

  return (
    <div className="space-y-6 bg-gray-50 p-6">
      {/* Size Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-purple-200">
              {sizeQuantities.map(sq => (
                <th key={sq.size} className="border border-gray-400 px-4 py-3 text-center font-semibold">
                  {sq.size}
                </th>
              ))}
              <th className="border border-gray-400 px-4 py-3 text-center font-semibold">
                합계
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {sizeQuantities.map(sq => (
                <td key={sq.size} className="border border-gray-400 px-4 py-3 text-center">
                  {sq.quantity > 0 ? sq.quantity : '-'}
                </td>
              ))}
              <td className="border border-gray-400 px-4 py-3 text-center font-semibold">
                {totalQuantity}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Product Mockups */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="text-center font-medium mb-2 text-gray-700">[전면]</h3>
            {product.configuration[0] && orderItem.canvas_state[product.configuration[0].id] && (
              <SingleSideCanvas
                side={product.configuration[0]}
                canvasState={orderItem.canvas_state[product.configuration[0].id] as CanvasState | string | null}
                productColor={getItemColorHex()}
                width={250}
                height={300}
                onCanvasReady={handleCanvasReady}
                renderFromCanvasStateOnly
              />
            )}
          </div>

          {product.configuration[1] && (
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="text-center font-medium mb-2 text-gray-700">[후면]</h3>
              {orderItem.canvas_state[product.configuration[1].id] && (
                <SingleSideCanvas
                  side={product.configuration[1]}
                  canvasState={orderItem.canvas_state[product.configuration[1].id] as CanvasState | string | null}
                  productColor={getItemColorHex()}
                  width={250}
                  height={300}
                  onCanvasReady={handleCanvasReady}
                  renderFromCanvasStateOnly
                />
              )}
            </div>
          )}

          {/* Color and Material Info */}
          <div className="bg-white rounded-lg p-4 shadow-sm space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-600">색상</div>
              <div className="text-gray-600">재질</div>
              <div className="font-medium">
                {orderItem.item_options?.color_name || orderItem.item_options?.variants?.[0]?.color_name || '기본'}
              </div>
              <div className="font-medium">X</div>
              <div className="text-gray-600">원단</div>
              <div className="text-gray-600">칼라</div>
              <div className="font-medium">모달</div>
              <div className="font-medium">2도색</div>
              <div className="text-gray-600">단가</div>
              <div className="text-gray-600">재질: 조직</div>
              <div className="font-medium">
                {orderItem.price_per_item.toLocaleString()}원
              </div>
              <div className="font-medium">4웨이 스트레치</div>
            </div>
            <div className="text-xs text-gray-500 pt-2 border-t">
              * 인쇄 상태 재현서비스 100% 동일하지 않습니다.
              <br />
              수정사항이 있는 경우 반드시에서 접수해주세요!
            </div>
          </div>
        </div>

        {/* Right Column - Design Elements Grid */}
        <div className="lg:col-span-9">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {designElements.map((element, index) => (
              <div key={index} className="bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Element Preview */}
                <div className="bg-gray-100 p-4 flex items-center justify-center min-h-[180px] border-b">
                  <div className="text-center">
                    {element.text && (
                      <div
                        className="font-bold break-words max-w-full"
                        style={{
                          color: element.fill || '#000',
                          fontFamily: element.fontFamily,
                          fontSize: Math.min(element.fontSize || 24, 48),
                        }}
                      >
                        {element.text}
                      </div>
                    )}
                    {!element.text && (
                      <div className="text-gray-400 text-sm">
                        {element.objectType}
                      </div>
                    )}
                  </div>
                </div>

                {/* Element Info */}
                <div className="p-3 space-y-2">
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">[위치]</span>
                      <span className="font-medium">{element.sideName}</span>
                    </div>

                    {element.text && (
                      <div className="border-t pt-1">
                        <div className="text-gray-500 mb-1">[텍스트 내용]</div>
                        <div className="font-medium break-words">{element.text}</div>
                      </div>
                    )}

                    <div className="border-t pt-1">
                      <div className="text-gray-500 mb-1">[인쇄방식]</div>
                      <div className="font-medium">{element.printMethod}</div>
                    </div>

                    <div className="border-t pt-1">
                      <div className="text-gray-500 mb-1">[크기]</div>
                      <div className="font-medium">
                        가로: {element.widthCm.toFixed(1)}cm ({element.widthMm.toFixed(0)}mm)
                      </div>
                      <div className="font-medium">
                        세로: {element.heightCm.toFixed(1)}cm ({element.heightMm.toFixed(0)}mm)
                      </div>
                    </div>

                    {element.fill && (
                      <div className="border-t pt-1">
                        <div className="text-gray-500 mb-1">[색상]</div>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: element.fill }}
                          />
                          <span className="font-medium text-xs">
                            {getColorName(element.fill)}
                          </span>
                        </div>
                      </div>
                    )}

                    {element.fontFamily && (
                      <div className="border-t pt-1">
                        <div className="text-gray-500 mb-1">[폰트]</div>
                        <div className="font-medium text-xs break-words">
                          {element.fontFamily}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Summary Card with Colors */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="bg-purple-100 p-4 border-b">
                <h3 className="font-bold text-center text-lg">디자인 요약</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-xs text-gray-500 mb-2">사용된 폰트</div>
                  <div className="text-xs space-y-1">
                    {Array.from(new Set(designElements
                      .filter(e => e.fontFamily)
                      .map(e => e.fontFamily)))
                      .map((font, idx) => (
                        <div key={idx} className="font-medium text-red-600">
                          {font}
                        </div>
                      ))
                    }
                    {designElements.filter(e => e.fontFamily).length === 0 && (
                      <div className="text-gray-400">폰트 없음</div>
                    )}
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="text-xs text-gray-500 mb-2">사용 색상</div>
                  <div className="space-y-2">
                    {extractedColors.map((color, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border border-gray-300 flex-shrink-0"
                          style={{ backgroundColor: color.hex }}
                        />
                        <div className="text-xs">
                          <div className="font-medium">{getColorName(color.hex)}</div>
                          <div className="text-gray-500 font-mono">{color.hex.toUpperCase()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="text-xs text-gray-500 mb-2">총 디자인 요소</div>
                  <div className="text-2xl font-bold text-center">
                    {designElements.length}개
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Notes Section */}
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">주문 정보</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">제품명</div>
            <div className="font-medium">{orderItem.product_title}</div>
          </div>
          <div>
            <div className="text-gray-500">사이즈</div>
            <div className="font-medium">
              {orderItem.item_options?.size_name || orderItem.item_options?.variants?.[0]?.size_name || '-'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">수량</div>
            <div className="font-medium">{orderItem.quantity}개</div>
          </div>
          <div>
            <div className="text-gray-500">총 금액</div>
            <div className="font-medium">
              {(orderItem.price_per_item * orderItem.quantity).toLocaleString()}원
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
