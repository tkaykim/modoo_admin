'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import { Edit2, Plus, Star, Trash2, X, Award, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import type { ReviewRecord, ProductSummary, ReviewFormState } from './types';
import {
  REVIEW_IMAGE_BUCKET,
  REVIEW_IMAGE_FOLDER,
  emptyReviewForm,
  formatDate,
} from './utils';

interface PaginatedResponse {
  data: ReviewRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Custom fetcher that returns full paginated response
const paginatedFetcher = async (url: string): Promise<PaginatedResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || 'Failed to fetch');
  }
  return res.json();
};

export default function ReviewsSection() {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const limit = 10;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch best reviews
  const { data: bestResponse, error: bestSwrError, mutate: mutateBest } = useSWR<PaginatedResponse>(
    '/api/admin/reviews?page=1&limit=50&is_best=true',
    paginatedFetcher
  );
  const bestReviews = bestResponse?.data || [];

  const searchParams = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '';
  const { data: response, error: swrError, isLoading: loading, mutate } = useSWR<PaginatedResponse>(
    `/api/admin/reviews?page=${currentPage}&limit=${limit}${searchParams}`,
    paginatedFetcher
  );

  const reviews = response?.data || [];
  const totalPages = response?.totalPages || 0;
  const total = response?.total || 0;
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(emptyReviewForm);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const [reviewFormError, setReviewFormError] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('products')
        .select('id, title')
        .order('title', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setProducts([]);
    }
  };

  const handleFormToggle = () => {
    setReviewFormOpen((prev) => !prev);
    setReviewFormError(null);
    if (reviewFormOpen) {
      setReviewForm(emptyReviewForm);
    }
  };

  const handleEdit = (review: ReviewRecord) => {
    setReviewForm({
      id: review.id,
      product_id: review.product_id,
      rating: review.rating,
      title: review.title,
      content: review.content,
      author_name: review.author_name,
      is_verified_purchase: Boolean(review.is_verified_purchase),
      is_best: Boolean(review.is_best),
      review_image_urls: review.review_image_urls || [],
    });
    setReviewFormOpen(true);
    setReviewFormError(null);
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setReviewFormError('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setUploadingImage(true);
    setReviewFormError(null);

    try {
      const supabase = createClient();
      const uploadResult = await uploadFileToStorage(
        supabase,
        file,
        REVIEW_IMAGE_BUCKET,
        REVIEW_IMAGE_FOLDER
      );

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || '이미지 업로드에 실패했습니다.');
      }

      setReviewForm((prev) => ({
        ...prev,
        review_image_urls: [...prev.review_image_urls, uploadResult.url!],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.';
      setReviewFormError(message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      handleImageUpload(file);
    });
    event.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setReviewForm((prev) => ({
      ...prev,
      review_image_urls: prev.review_image_urls.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    setReviewFormError(null);

    if (uploadingImage) {
      setReviewFormError('이미지 업로드가 완료될 때까지 기다려주세요.');
      return;
    }

    if (!reviewForm.product_id) {
      setReviewFormError('제품을 선택해주세요.');
      return;
    }

    if (!reviewForm.title.trim()) {
      setReviewFormError('제목을 입력해주세요.');
      return;
    }

    if (!reviewForm.content.trim()) {
      setReviewFormError('내용을 입력해주세요.');
      return;
    }

    if (!reviewForm.author_name.trim()) {
      setReviewFormError('작성자명을 입력해주세요.');
      return;
    }

    setSavingReview(true);
    setError(null);

    const payload = {
      id: reviewForm.id ?? undefined,
      product_id: reviewForm.product_id,
      rating: reviewForm.rating,
      title: reviewForm.title.trim(),
      content: reviewForm.content.trim(),
      author_name: reviewForm.author_name.trim(),
      is_verified_purchase: reviewForm.is_verified_purchase,
      is_best: reviewForm.is_best,
      review_image_urls: reviewForm.review_image_urls,
    };

    try {
      const res = await fetch('/api/admin/reviews', {
        method: reviewForm.id ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '리뷰 저장에 실패했습니다.');
      }

      mutate();
      mutateBest();

      setReviewForm(emptyReviewForm);
      setReviewFormOpen(false);
    } catch (err) {
      console.error('Error saving review:', err);
      setError(err instanceof Error ? err.message : '리뷰 저장에 실패했습니다.');
    } finally {
      setSavingReview(false);
    }
  };

  const handleDelete = async (reviewId: string) => {
    const confirmed = window.confirm('이 리뷰를 삭제할까요?');
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/reviews?id=${reviewId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '리뷰 삭제에 실패했습니다.');
      }

      mutate();
      mutateBest();
    } catch (err) {
      console.error('Error deleting review:', err);
      setError(err instanceof Error ? err.message : '리뷰 삭제에 실패했습니다.');
    }
  };

  const handleToggleBest = async (review: ReviewRecord) => {
    setError(null);
    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: review.id,
          is_best: !review.is_best,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'BEST 상태 변경에 실패했습니다.');
      }

      const payload = await res.json();
      const updatedReview = payload?.data as ReviewRecord | undefined;

      if (updatedReview && response?.data) {
        const updatedData = response.data.map((item) =>
          item.id === updatedReview.id ? updatedReview : item
        );
        mutate({ ...response, data: updatedData }, { revalidate: false });
      }
      mutateBest();
    } catch (err) {
      console.error('Error toggling best review:', err);
      setError(err instanceof Error ? err.message : 'BEST 상태 변경에 실패했습니다.');
    }
  };

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= bestReviews.length) return;

    const reordered = [...bestReviews];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Optimistic update
    if (bestResponse) {
      mutateBest({ ...bestResponse, data: reordered }, { revalidate: false });
    }

    try {
      const res = await fetch('/api/admin/reviews/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map((r) => r.id) }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || '순서 변경에 실패했습니다.');
      }
    } catch (err) {
      mutateBest(); // Revert on error
      setError(err instanceof Error ? err.message : '순서 변경에 실패했습니다.');
    }
  };

  const renderStars = (rating: number, interactive = false) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && setReviewForm((prev) => ({ ...prev, rating: star }))}
            className={interactive ? 'cursor-pointer' : 'cursor-default'}
          >
            <Star
              className={`w-5 h-5 ${
                star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {(swrError || bestSwrError || error) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
          {swrError?.message || bestSwrError?.message || error}
        </div>
      )}

      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">리뷰 관리</h3>
            <p className="text-sm text-gray-500">리뷰를 직접 등록하고 관리하세요. BEST 리뷰는 홈페이지에 노출됩니다.</p>
          </div>
          <button
            onClick={handleFormToggle}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {reviewFormOpen ? '입력 닫기' : '새 리뷰 추가'}
          </button>
        </div>

        {/* Search Input */}
        <div>
          <input
            type="text"
            placeholder="리뷰 제목 또는 작성자로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <p className="text-xs text-gray-500 mt-1">
              총 {total}개의 검색 결과
            </p>
          )}
        </div>

        {reviewFormOpen && (
          <div className="bg-gray-50 rounded-md p-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-gray-700">
                제품 선택 *
                <select
                  value={reviewForm.product_id}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, product_id: event.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                  <option value="">제품 선택</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-gray-700">
                작성자명 *
                <input
                  type="text"
                  value={reviewForm.author_name}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, author_name: event.target.value }))
                  }
                  placeholder="홍길동"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm text-gray-700">
                <span>평점 *</span>
                {renderStars(reviewForm.rating, true)}
              </div>
              <label className="space-y-2 text-sm text-gray-700">
                제목 *
                <input
                  type="text"
                  value={reviewForm.title}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="리뷰 제목"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            </div>
            <label className="space-y-2 text-sm text-gray-700">
              내용 *
              <textarea
                value={reviewForm.content}
                onChange={(event) =>
                  setReviewForm((prev) => ({ ...prev, content: event.target.value }))
                }
                placeholder="리뷰 내용을 입력하세요"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={4}
              />
            </label>

            {/* Image Upload */}
            <div className="space-y-3 text-sm text-gray-700">
              <label className="space-y-2">
                이미지 업로드
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageInputChange}
                  disabled={uploadingImage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                />
                {uploadingImage && (
                  <span className="text-xs text-gray-500">업로드 중...</span>
                )}
              </label>
              {reviewForm.review_image_urls.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {reviewForm.review_image_urls.map((url, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={url}
                        alt={`리뷰 이미지 ${index + 1}`}
                        className="w-20 h-20 object-cover rounded-md border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Checkboxes */}
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={reviewForm.is_verified_purchase}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, is_verified_purchase: event.target.checked }))
                  }
                  className="rounded border-gray-300"
                />
                구매 인증
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={reviewForm.is_best}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, is_best: event.target.checked }))
                  }
                  className="rounded border-gray-300"
                />
                <span className="flex items-center gap-1">
                  <Award className="w-4 h-4 text-yellow-500" />
                  BEST 리뷰
                </span>
              </label>
            </div>

            {reviewFormError && (
              <p className="text-sm text-red-600">{reviewFormError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setReviewForm(emptyReviewForm);
                  setReviewFormOpen(false);
                  setReviewFormError(null);
                }}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={savingReview || uploadingImage}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingReview
                  ? '저장 중...'
                  : uploadingImage
                    ? '이미지 업로드 중...'
                    : '저장'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Best Reviews Section */}
      {bestReviews.length > 0 && (
        <div className="bg-white border border-yellow-200 rounded-md shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-yellow-50 border-b border-yellow-200 flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-500" />
            <h3 className="text-sm font-semibold text-gray-900">BEST 리뷰 ({bestReviews.length})</h3>
            <span className="text-xs text-gray-500 ml-auto">이 순서대로 홈페이지에 노출됩니다</span>
          </div>
          <div className="divide-y divide-gray-100">
            {bestReviews.map((review, index) => (
              <div key={review.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors">
                {/* Order controls */}
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={() => handleReorder(index, index - 1)}
                    disabled={index === 0}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleReorder(index, index + 1)}
                    disabled={index === bestReviews.length - 1}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <span className="text-xs text-gray-400 w-5 text-center shrink-0">{index + 1}</span>

                {/* Thumbnail */}
                {review.review_image_urls && review.review_image_urls.length > 0 ? (
                  <img src={review.review_image_urls[0]} alt="" className="w-9 h-9 object-cover rounded border border-gray-200 shrink-0" />
                ) : (
                  <div className="w-9 h-9 bg-gray-100 rounded border border-gray-200 shrink-0" />
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{review.title}</span>
                    <span className="text-xs text-gray-400 shrink-0">{review.author_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 truncate">{review.product?.title}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`w-3 h-3 ${s <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleEdit(review)} className="p-1 text-gray-400 hover:text-gray-600" title="편집">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleToggleBest(review)} className="p-1 text-yellow-500 hover:text-red-500" title="BEST 해제">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center text-gray-500">
          등록된 리뷰가 없습니다.
        </div>
      ) : (
        <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    이미지
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    제품
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    제목 / 내용
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    평점
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작성자
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reviews.map((review) => (
                  <tr key={review.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {review.review_image_urls && review.review_image_urls.length > 0 ? (
                        <div className="flex -space-x-2">
                          {review.review_image_urls.slice(0, 3).map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt={`리뷰 이미지 ${idx + 1}`}
                              className="w-12 h-12 object-cover rounded-md border-2 border-white"
                            />
                          ))}
                          {review.review_image_urls.length > 3 && (
                            <div className="w-12 h-12 rounded-md bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-white">
                              +{review.review_image_urls.length - 3}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center text-gray-400 text-xs">
                          없음
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {review.product?.title || review.product_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{review.title}</div>
                      <div className="text-xs text-gray-500 max-w-xs truncate">
                        {review.content}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {renderStars(review.rating)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{review.author_name}</div>
                      <div className="text-xs text-gray-500">{formatDate(review.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {review.is_verified_purchase && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
                            구매 인증
                          </span>
                        )}
                        <button
                          onClick={() => handleToggleBest(review)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            review.is_best
                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Award className="w-3 h-3" />
                          {review.is_best ? 'BEST' : 'BEST 지정'}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(review)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          편집
                        </button>
                        <button
                          onClick={() => handleDelete(review.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {total}개 중 {(currentPage - 1) * limit + 1}-{Math.min(currentPage * limit, total)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  이전
                </button>
                <span className="text-sm text-gray-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  다음
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
