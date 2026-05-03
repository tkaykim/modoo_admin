'use client';

import { useState, type ChangeEvent } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import { Calendar, Edit2, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { PopupBannerRecord, PopupBannerFormState } from './types';
import {
  POPUP_BANNER_IMAGE_BUCKET,
  POPUP_BANNER_IMAGE_FOLDER,
  emptyPopupBannerForm,
  sortPopupBanners,
  formatDate,
} from './utils';
import { formatKstDateOnly, formatDatetimeLocalKst } from '@/lib/kst';

function formatDateInput(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return formatDatetimeLocalKst(new Date(dateStr));
  } catch {
    return '';
  }
}

function isCurrentlyActive(banner: PopupBannerRecord): boolean {
  if (!banner.is_active) return false;
  const now = new Date();
  if (banner.start_date && new Date(banner.start_date) > now) return false;
  if (banner.end_date && new Date(banner.end_date) < now) return false;
  return true;
}

export default function PopupBannersSection() {
  const { data: rawBanners, error: swrError, isLoading: loading, mutate } = useSWR<PopupBannerRecord[]>('/api/admin/popup-banners');
  const popupBanners = rawBanners ? sortPopupBanners(rawBanners) : [];
  const [error, setError] = useState<string | null>(null);
  const [bannerForm, setBannerForm] = useState<PopupBannerFormState>(emptyPopupBannerForm);
  const [bannerFormOpen, setBannerFormOpen] = useState(false);
  const [bannerFormError, setBannerFormError] = useState<string | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleFormToggle = () => {
    setBannerFormOpen((prev) => !prev);
    setBannerFormError(null);
    if (bannerFormOpen) {
      setBannerForm(emptyPopupBannerForm);
    }
  };

  const handleEdit = (banner: PopupBannerRecord) => {
    setBannerForm({
      id: banner.id,
      title: banner.title ?? '',
      image_url: banner.image_url ?? '',
      redirect_url: banner.redirect_url ?? '',
      sort_order: banner.sort_order ?? 0,
      is_active: Boolean(banner.is_active),
      start_date: formatDateInput(banner.start_date),
      end_date: formatDateInput(banner.end_date),
    });
    setBannerFormOpen(true);
    setBannerFormError(null);
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setBannerFormError('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setUploadingImage(true);
    setBannerFormError(null);

    try {
      const supabase = createClient();
      const uploadResult = await uploadFileToStorage(
        supabase,
        file,
        POPUP_BANNER_IMAGE_BUCKET,
        POPUP_BANNER_IMAGE_FOLDER
      );

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || '이미지 업로드에 실패했습니다.');
      }

      setBannerForm((prev) => ({ ...prev, image_url: uploadResult.url ?? '' }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.';
      setBannerFormError(message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleImageUpload(file);
    event.target.value = '';
  };

  const handleSave = async () => {
    setBannerFormError(null);

    if (uploadingImage) {
      setBannerFormError('이미지 업로드가 완료될 때까지 기다려주세요.');
      return;
    }

    if (!bannerForm.title.trim()) {
      setBannerFormError('제목을 입력해주세요.');
      return;
    }

    if (!bannerForm.image_url.trim()) {
      setBannerFormError('이미지 URL을 입력하거나 이미지를 업로드해주세요.');
      return;
    }

    setSavingBanner(true);
    setError(null);

    const payload = {
      id: bannerForm.id ?? undefined,
      title: bannerForm.title.trim(),
      image_url: bannerForm.image_url.trim(),
      redirect_url: bannerForm.redirect_url.trim() || null,
      sort_order: bannerForm.sort_order,
      is_active: bannerForm.is_active,
      start_date: bannerForm.start_date ? new Date(bannerForm.start_date).toISOString() : null,
      end_date: bannerForm.end_date ? new Date(bannerForm.end_date).toISOString() : null,
    };

    try {
      const response = await fetch('/api/admin/popup-banners', {
        method: bannerForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '팝업 배너 저장에 실패했습니다.');
      }

      const responsePayload = await response.json();
      const savedBanner = responsePayload?.data as PopupBannerRecord;

      const updated = bannerForm.id
        ? (rawBanners || []).map((b) => (b.id === savedBanner.id ? savedBanner : b))
        : [savedBanner, ...(rawBanners || [])];
      mutate(updated, { revalidate: false });

      setBannerForm(emptyPopupBannerForm);
      setBannerFormOpen(false);
    } catch (err) {
      console.error('Error saving popup banner:', err);
      setError(err instanceof Error ? err.message : '팝업 배너 저장에 실패했습니다.');
    } finally {
      setSavingBanner(false);
    }
  };

  const handleDelete = async (bannerId: string) => {
    const confirmed = window.confirm('이 팝업 배너를 삭제할까요?');
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/popup-banners?id=${bannerId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '팝업 배너 삭제에 실패했습니다.');
      }

      mutate((rawBanners || []).filter((b) => b.id !== bannerId), { revalidate: false });
    } catch (err) {
      console.error('Error deleting popup banner:', err);
      setError(err instanceof Error ? err.message : '팝업 배너 삭제에 실패했습니다.');
    }
  };

  const handleToggle = async (banner: PopupBannerRecord) => {
    setError(null);
    try {
      const response = await fetch('/api/admin/popup-banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: banner.id, is_active: !banner.is_active }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '활성 상태 변경에 실패했습니다.');
      }

      const payload = await response.json();
      const updatedBanner = payload?.data as PopupBannerRecord;
      mutate(
        (rawBanners || []).map((item) => (item.id === updatedBanner.id ? updatedBanner : item)),
        { revalidate: false }
      );
    } catch (err) {
      console.error('Error toggling popup banner:', err);
      setError(err instanceof Error ? err.message : '활성 상태 변경에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-4">
      {(swrError || error) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
          {swrError?.message || error}
        </div>
      )}

      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">팝업 배너 관리</h3>
            <p className="text-sm text-gray-500">사이트 접속 시 노출할 팝업 배너를 등록하세요.</p>
          </div>
          <button
            onClick={handleFormToggle}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {bannerFormOpen ? '입력 닫기' : '새 팝업 배너 추가'}
          </button>
        </div>

        {bannerFormOpen && (
          <div className="bg-gray-50 rounded-md p-4 space-y-4">
            <label className="space-y-2 text-sm text-gray-700">
              제목 (관리용)
              <input
                type="text"
                value={bannerForm.title}
                onChange={(e) => setBannerForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="예: 5월 프로모션 배너"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 text-sm text-gray-700">
                <label className="space-y-2 text-sm text-gray-700">
                  이미지 URL
                  <input
                    type="text"
                    value={bannerForm.image_url}
                    onChange={(e) => setBannerForm((prev) => ({ ...prev, image_url: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </label>
                <label className="space-y-2 text-sm text-gray-700">
                  이미지 업로드
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageInputChange}
                    disabled={uploadingImage}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                  />
                  {uploadingImage && (
                    <span className="text-xs text-gray-500">업로드 중...</span>
                  )}
                </label>
              </div>
              {bannerForm.image_url && (
                <div className="flex items-center justify-center">
                  <img
                    src={bannerForm.image_url}
                    alt="미리보기"
                    className="max-h-40 rounded-md border border-gray-200 object-contain"
                  />
                </div>
              )}
            </div>

            <label className="space-y-2 text-sm text-gray-700">
              클릭 시 이동 URL
              <input
                type="text"
                placeholder="/home/cobuy/request/create 또는 https://..."
                value={bannerForm.redirect_url}
                onChange={(e) => setBannerForm((prev) => ({ ...prev, redirect_url: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm text-gray-700">
                정렬 순서
                <input
                  type="number"
                  value={bannerForm.sort_order}
                  onChange={(e) =>
                    setBannerForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
              <label className="space-y-2 text-sm text-gray-700">
                시작일시
                <input
                  type="datetime-local"
                  value={bannerForm.start_date}
                  onChange={(e) => setBannerForm((prev) => ({ ...prev, start_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
              <label className="space-y-2 text-sm text-gray-700">
                종료일시
                <input
                  type="datetime-local"
                  value={bannerForm.end_date}
                  onChange={(e) => setBannerForm((prev) => ({ ...prev, end_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={bannerForm.is_active}
                onChange={(e) => setBannerForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                className="rounded border-gray-300"
              />
              활성 상태로 노출
            </label>

            {bannerFormError && <p className="text-sm text-red-600">{bannerFormError}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setBannerForm(emptyPopupBannerForm);
                  setBannerFormOpen(false);
                  setBannerFormError(null);
                }}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={savingBanner || uploadingImage}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingBanner
                  ? '저장 중...'
                  : uploadingImage
                    ? '이미지 업로드 중...'
                    : '저장'}
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : popupBanners.length === 0 ? (
        <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center text-gray-500">
          등록된 팝업 배너가 없습니다.
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
                    제목
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    링크
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    기간
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    정렬
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
                {popupBanners.map((banner) => (
                  <tr key={banner.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {banner.image_url ? (
                        <img
                          src={banner.image_url}
                          alt={banner.title}
                          className="w-16 h-20 object-cover rounded-md border border-gray-200"
                        />
                      ) : (
                        <div className="w-16 h-20 rounded-md border border-gray-200 flex items-center justify-center text-xs text-gray-400">
                          이미지 없음
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{banner.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{formatDate(banner.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {banner.redirect_url ? (
                        <span className="text-sm text-blue-600 truncate max-w-[150px] block">
                          {banner.redirect_url}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">링크 없음</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-600 space-y-0.5">
                        {banner.start_date || banner.end_date ? (
                          <>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {banner.start_date
                                ? formatKstDateOnly(banner.start_date)
                                : '시작일 없음'}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {banner.end_date
                                ? formatKstDateOnly(banner.end_date)
                                : '종료일 없음'}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-400">상시</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{banner.sort_order}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleToggle(banner)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          isCurrentlyActive(banner)
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {banner.is_active ? (
                          <>
                            <Eye className="w-3 h-3" />
                            {isCurrentlyActive(banner) ? '활성' : '기간외'}
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            비활성
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(banner)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          편집
                        </button>
                        <button
                          onClick={() => handleDelete(banner.id)}
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
        </div>
      )}
    </div>
  );
}
