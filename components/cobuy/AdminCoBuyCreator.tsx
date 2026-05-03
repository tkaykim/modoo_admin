'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Package, Search, Share2, X, Paintbrush, ImageIcon, Upload } from 'lucide-react';
import { Product, CoBuySession } from '@/types/types';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import AdminCoBuyForm from './AdminCoBuyForm';

type Step = 'creation-method' | 'product-select' | 'image-upload' | 'form' | 'success';

interface AdminCoBuyCreatorProps {
  onClose: () => void;
  onSuccess?: (session: CoBuySession) => void;
  /** When resuming from editor, pass the product ID to auto-load */
  initialProductId?: string;
  /** When resuming from editor, pass the saved design ID to skip to form */
  initialDesignId?: string;
}

export default function AdminCoBuyCreator({ onClose, onSuccess, initialProductId, initialDesignId }: AdminCoBuyCreatorProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(
    initialProductId && initialDesignId ? 'form' : 'creation-method'
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [savedDesignId, setSavedDesignId] = useState<string | null>(initialDesignId ?? null);
  const [createdSession, setCreatedSession] = useState<CoBuySession | null>(null);

  // Image-only mode state
  const [cobuyImageUrls, setCobuyImageUrls] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch products when entering product-select step
  useEffect(() => {
    if (currentStep !== 'product-select' && !initialProductId) return;

    const fetchProducts = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/products');
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        const fetched: Product[] = data.data || [];
        setProducts(fetched);

        // When resuming from editor, find the product from the fetched list
        if (initialProductId && initialDesignId) {
          const product = fetched.find((p) => p.id === initialProductId);
          if (product) setSelectedProduct(product);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [currentStep, initialProductId, initialDesignId]);

  const filteredProducts = products.filter(product =>
    product.is_active && (
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const isImageMode = cobuyImageUrls.length > 0 && !savedDesignId;

  const handleDesignChoice = () => {
    setCurrentStep('product-select');
  };

  const handleImageChoice = () => {
    setCurrentStep('image-upload');
  };

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    if (isImageMode) {
      setCurrentStep('form');
    } else {
      const returnUrl = encodeURIComponent(`/cobuy?resumeProductId=${product.id}`);
      router.push(`/editor/${product.id}?mode=design&returnUrl=${returnUrl}`);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setUploadError('이미지 파일만 업로드할 수 있습니다.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('파일 크기는 10MB 이하여야 합니다.');
        return;
      }
      validFiles.push(file);
    }

    setUploadError(null);

    // Generate previews
    const newPreviews: string[] = [];
    for (const file of validFiles) {
      const preview = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.readAsDataURL(file);
      });
      newPreviews.push(preview);
    }
    setImagePreviews((prev) => [...prev, ...newPreviews]);

    // Upload all files
    setIsUploading(true);
    try {
      const supabase = createClient();
      const uploadedUrls: string[] = [];
      for (const file of validFiles) {
        const result = await uploadFileToStorage(supabase, file, 'products', 'cobuy-images');
        if (!result.success || !result.url) {
          setUploadError(result.error || '이미지 업로드에 실패했습니다.');
          return;
        }
        uploadedUrls.push(result.url);
      }
      setCobuyImageUrls((prev) => [...prev, ...uploadedUrls]);
    } catch {
      setUploadError('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    setCobuyImageUrls((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImageUploadNext = () => {
    if (cobuyImageUrls.length === 0) return;
    setCurrentStep('product-select');
  };

  const handleCoBuyCreated = (session: CoBuySession) => {
    setCreatedSession(session);
    setCurrentStep('success');
    onSuccess?.(session);
  };

  const handleShare = async () => {
    if (!createdSession) return;
    const shareUrl = `${window.location.origin.replace('admin.', '')}/cobuy/${createdSession.share_token}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('링크가 복사되었습니다: ' + shareUrl);
    } catch (error) {
      console.error('Share failed:', error);
      alert('공유 링크: ' + shareUrl);
    }
  };

  const handleBack = () => {
    if (currentStep === 'product-select') {
      if (isImageMode) {
        setCurrentStep('image-upload');
      } else {
        setCurrentStep('creation-method');
      }
      setSelectedProduct(null);
    } else if (currentStep === 'image-upload') {
      setCurrentStep('creation-method');
      setCobuyImageUrls([]);
      setImagePreviews([]);
      setUploadError(null);
    } else if (currentStep === 'form') {
      if (isImageMode) {
        setCurrentStep('product-select');
        setSelectedProduct(null);
      } else {
        setCurrentStep('product-select');
        setSelectedProduct(null);
        setSavedDesignId(null);
      }
    }
  };

  // Progress steps
  const getProgressSteps = () => {
    if (isImageMode || currentStep === 'image-upload') {
      return [
        { id: 'image-upload', label: '이미지 업로드' },
        { id: 'product-select', label: '제품 선택' },
        { id: 'form', label: '정보 입력' },
      ];
    }
    if (currentStep === 'product-select' || savedDesignId) {
      return [
        { id: 'product-select', label: '제품 선택' },
        { id: 'design', label: '디자인' },
        { id: 'form', label: '정보 입력' },
      ];
    }
    return [];
  };

  const progressSteps = getProgressSteps();
  const getCurrentProgressIndex = () => {
    if (currentStep === 'image-upload') return 0;
    if (currentStep === 'product-select') return isImageMode ? 1 : 0;
    if (currentStep === 'form') return 2;
    return 0;
  };
  const currentProgressIndex = getCurrentProgressIndex();

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          {currentStep !== 'creation-method' && currentStep !== 'success' && (
            <button
              onClick={handleBack}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold">공동구매 생성하기</h2>
            <p className="text-sm text-gray-500">
              {currentStep === 'creation-method' && '생성 방식을 선택하세요'}
              {currentStep === 'product-select' && '제품을 선택하세요'}
              {currentStep === 'image-upload' && '이미지를 업로드하세요'}
              {currentStep === 'form' && '공동구매 정보를 입력하세요'}
              {currentStep === 'success' && '공동구매가 생성되었습니다'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Progress indicator */}
      {progressSteps.length > 0 && currentStep !== 'success' && currentStep !== 'creation-method' && (
        <div className="px-6 py-3 bg-gray-50 border-b">
          <div className="flex items-center gap-4 max-w-2xl mx-auto">
            {progressSteps.map((step, index) => {
              const isCompleted = currentProgressIndex > index;
              const isCurrent = currentProgressIndex === index;
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    isCurrent ? 'bg-blue-600 text-white'
                      : isCompleted ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {index + 1}
                  </div>
                  <span className={`ml-2 text-sm ${isCurrent ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                    {step.label}
                  </span>
                  {index < progressSteps.length - 1 && (
                    <div className="flex-1 h-0.5 bg-gray-200 mx-4" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Step: Creation Method Choice */}
        {currentStep === 'creation-method' && (
          <div className="p-6">
            <div className="max-w-lg mx-auto pt-8">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleDesignChoice}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Paintbrush className="w-7 h-7 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 text-sm">디자인 편집</p>
                    <p className="text-xs text-gray-500 mt-1">제품을 선택하고 에디터에서 디자인합니다</p>
                  </div>
                </button>

                <button
                  onClick={handleImageChoice}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center">
                    <ImageIcon className="w-7 h-7 text-green-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 text-sm">이미지 업로드</p>
                    <p className="text-xs text-gray-500 mt-1">이미지로 간편하게 공동구매를 생성합니다</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Product Selection */}
        {currentStep === 'product-select' && (
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="제품명 또는 카테고리로 검색..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">검색 결과가 없습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductSelect(product)}
                      className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-blue-500 hover:shadow-md transition-all text-left"
                    >
                      <div className="aspect-square bg-gray-100 flex items-center justify-center">
                        {product.thumbnail_image_link?.[0] ? (
                          <img
                            src={product.thumbnail_image_link[0]}
                            alt={product.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-12 h-12 text-gray-300" />
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-gray-500">{product.category || '카테고리 없음'}</p>
                        <p className="font-medium text-gray-900 truncate">{product.title}</p>
                        <p className="text-sm text-blue-600">{product.base_price.toLocaleString()}원</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step: Image Upload */}
        {currentStep === 'image-upload' && (
          <div className="p-6">
            <div className="max-w-lg mx-auto space-y-4">
              {/* Uploaded images grid */}
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative rounded-xl overflow-hidden border border-gray-200 group">
                      <img
                        src={preview}
                        alt={`이미지 ${index + 1}`}
                        className="w-full aspect-square object-cover bg-gray-50"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {isUploading && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-600">업로드 중...</span>
                </div>
              )}

              {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

              {/* Add more images button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer ${
                  imagePreviews.length > 0 ? 'py-6' : 'aspect-4/3'
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">
                    {imagePreviews.length > 0 ? '이미지 추가' : '클릭하여 이미지 업로드'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP (최대 10MB)</p>
                </div>
              </button>

              {/* Next button */}
              {imagePreviews.length > 0 && (
                <button
                  onClick={handleImageUploadNext}
                  disabled={cobuyImageUrls.length === 0 || isUploading}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  다음
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Step: CoBuy Form */}
        {currentStep === 'form' && (savedDesignId || cobuyImageUrls.length > 0) && (
          <AdminCoBuyForm
            product={selectedProduct}
            savedDesignId={savedDesignId}
            cobuyImageUrls={cobuyImageUrls}
            onSuccess={handleCoBuyCreated}
            onBack={handleBack}
          />
        )}

        {/* Loading state when resuming from editor */}
        {currentStep === 'form' && !selectedProduct && savedDesignId && (
          <div className="flex items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Step: Success */}
        {currentStep === 'success' && createdSession && (
          <div className="flex items-center justify-center min-h-full py-12">
            <div className="text-center max-w-md mx-auto px-6">
              <CheckCircle2 className="w-20 h-20 mx-auto mb-6 text-green-600" />
              <h3 className="text-2xl font-bold mb-2">공동구매가 생성되었습니다!</h3>
              <p className="text-gray-600 mb-8">링크를 공유하여 참여자를 모집하세요.</p>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-500 mb-2">공동구매 제목</p>
                <p className="font-medium text-gray-900">{createdSession.title}</p>
                {createdSession.profiles?.email && (
                  <>
                    <p className="text-sm text-gray-500 mt-3 mb-1">연결된 사용자</p>
                    <p className="text-sm text-gray-700">{createdSession.profiles.email}</p>
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleShare}
                  className="flex-1 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Share2 className="w-5 h-5" />
                  <span>링크 복사</span>
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  완료
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
