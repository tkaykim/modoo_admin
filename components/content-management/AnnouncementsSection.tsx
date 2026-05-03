'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import { Check, Copy, Edit2, Eye, EyeOff, ImageIcon, Plus, Trash2, X } from 'lucide-react';
import type { AnnouncementRecord, AnnouncementFormState, AnnouncementCategory } from './types';
import {
  ANNOUNCEMENT_IMAGE_BUCKET,
  ANNOUNCEMENT_IMAGE_FOLDER,
  ANNOUNCEMENT_CATEGORIES,
  emptyAnnouncementForm,
  sortAnnouncements,
  formatDate,
} from './utils';
import RichTextEditor from '@/components/RichTextEditor';

const categoryKeys = Object.keys(ANNOUNCEMENT_CATEGORIES) as AnnouncementCategory[];

export default function AnnouncementsSection() {
  const { data: rawAnnouncements, error: swrError, isLoading: loading, mutate } = useSWR<AnnouncementRecord[]>('/api/admin/announcements');
  const allAnnouncements = rawAnnouncements ? sortAnnouncements(rawAnnouncements) : [];
  const [filterCategory, setFilterCategory] = useState<AnnouncementCategory | 'all'>('all');
  const announcements = filterCategory === 'all'
    ? allAnnouncements
    : allAnnouncements.filter((a) => a.category === filterCategory);

  const [error, setError] = useState<string | null>(null);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>(emptyAnnouncementForm);
  const [announcementFormOpen, setAnnouncementFormOpen] = useState(false);
  const [announcementFormError, setAnnouncementFormError] = useState<string | null>(null);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const handleAnnouncementFormToggle = () => {
    setAnnouncementFormOpen((prev) => !prev);
    setAnnouncementFormError(null);
    if (announcementFormOpen) {
      setAnnouncementForm(emptyAnnouncementForm);
    }
  };

  const handleAnnouncementEdit = (announcement: AnnouncementRecord) => {
    setAnnouncementForm({
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      category: announcement.category ?? 'notice',
      is_published: Boolean(announcement.is_published),
      image_links: announcement.image_links || [],
    });
    setAnnouncementFormOpen(true);
    setAnnouncementFormError(null);
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 업로드 가능합니다.');
    const supabase = createClient();
    const uploadResult = await uploadFileToStorage(supabase, file, ANNOUNCEMENT_IMAGE_BUCKET, ANNOUNCEMENT_IMAGE_FOLDER);
    if (!uploadResult.success || !uploadResult.url) throw new Error(uploadResult.error || '이미지 업로드 실패');
    return uploadResult.url;
  };

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }
    setUploadingThumbnail(true);
    try {
      const url = await handleImageUpload(file);
      setAnnouncementForm((prev) => ({ ...prev, image_links: [url, ...prev.image_links.slice(1)] }));
    } catch {
      alert('썸네일 업로드에 실패했습니다.');
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleThumbnailRemove = () => {
    setAnnouncementForm((prev) => ({ ...prev, image_links: prev.image_links.slice(1) }));
  };

  const handleAnnouncementSave = async () => {
    setAnnouncementFormError(null);

    if (!announcementForm.title.trim()) {
      setAnnouncementFormError('제목을 입력해주세요.');
      return;
    }

    const contentText = announcementForm.content.replace(/<[^>]*>/g, '').trim();
    if (!contentText) {
      setAnnouncementFormError('내용을 입력해주세요.');
      return;
    }

    setSavingAnnouncement(true);
    setError(null);

    const payload = {
      id: announcementForm.id ?? undefined,
      title: announcementForm.title.trim(),
      content: announcementForm.content,
      category: announcementForm.category,
      is_published: announcementForm.is_published,
      image_links: announcementForm.image_links,
    };

    try {
      const response = await fetch('/api/admin/announcements', {
        method: announcementForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '저장에 실패했습니다.');
      }

      const responsePayload = await response.json();
      const savedAnnouncement = responsePayload?.data as AnnouncementRecord;

      const updated = announcementForm.id
        ? (rawAnnouncements || []).map((item) => (item.id === savedAnnouncement.id ? savedAnnouncement : item))
        : [savedAnnouncement, ...(rawAnnouncements || [])];
      mutate(updated, { revalidate: false });

      setAnnouncementForm(emptyAnnouncementForm);
      setAnnouncementFormOpen(false);
    } catch (err) {
      console.error('Error saving announcement:', err);
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const handleAnnouncementDelete = async (announcementId: string) => {
    const confirmed = window.confirm('이 게시글을 삭제할까요?');
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/announcements?id=${announcementId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '삭제에 실패했습니다.');
      }
      mutate((rawAnnouncements || []).filter((item) => item.id !== announcementId), { revalidate: false });
    } catch (err) {
      console.error('Error deleting announcement:', err);
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  const handleCopyLink = async (announcementId: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://modoogoods.com';
    const url = `${baseUrl}/support/notices/${announcementId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('input');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedId(announcementId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAnnouncementToggle = async (announcement: AnnouncementRecord) => {
    setError(null);
    try {
      const response = await fetch('/api/admin/announcements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: announcement.id, is_published: !announcement.is_published }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '상태 변경에 실패했습니다.');
      }

      const payload = await response.json();
      const updatedAnnouncement = payload?.data as AnnouncementRecord;
      mutate(
        (rawAnnouncements || []).map((item) => (item.id === updatedAnnouncement.id ? updatedAnnouncement : item)),
        { revalidate: false }
      );
    } catch (err) {
      console.error('Error toggling announcement:', err);
      setError(err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-4">
      {(swrError || error) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
          {swrError?.message || error}
        </div>
      )}

      {/* 작성/편집 폼 */}
      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">게시글 관리</h3>
            <p className="text-sm text-gray-500">HTML 에디터로 이미지, 표, 영상 등을 자유롭게 작성하세요.</p>
          </div>
          <button
            onClick={handleAnnouncementFormToggle}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {announcementFormOpen ? '닫기' : '새 게시글 작성'}
          </button>
        </div>

        {announcementFormOpen && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            {/* 카테고리 + 제목 */}
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <label className="space-y-1 text-sm text-gray-700">
                <span className="font-medium">카테고리</span>
                <select
                  value={announcementForm.category}
                  onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, category: e.target.value as AnnouncementCategory }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                  {categoryKeys.map((key) => (
                    <option key={key} value={key}>{ANNOUNCEMENT_CATEGORIES[key]}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm text-gray-700">
                <span className="font-medium">제목</span>
                <input
                  type="text"
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="게시글 제목을 입력하세요"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            </div>

            {/* HTML 에디터 */}
            <div className="space-y-1">
              <span className="text-sm font-medium text-gray-700">내용</span>
              <RichTextEditor
                value={announcementForm.content}
                onChange={(html) => setAnnouncementForm((prev) => ({ ...prev, content: html }))}
                onImageUpload={handleImageUpload}
                placeholder="내용을 입력하세요. 이미지, 표, 유튜브 영상 등을 자유롭게 삽입할 수 있습니다."
                minHeight="360px"
              />
            </div>

            {/* 썸네일 이미지 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">대표 이미지 (썸네일)</span>
                <span className="text-xs text-gray-400">홈/목록 카드에 표시됩니다</span>
              </div>
              {announcementForm.image_links[0] ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={announcementForm.image_links[0]}
                    alt="썸네일 미리보기"
                    className="h-32 w-auto rounded-lg border border-gray-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleThumbnailRemove}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={uploadingThumbnail}
                  className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                >
                  <ImageIcon className="w-4 h-4" />
                  {uploadingThumbnail ? '업로드 중...' : '썸네일 이미지 업로드'}
                </button>
              )}
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleThumbnailUpload}
              />
            </div>

            {/* 공개 여부 */}
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={announcementForm.is_published}
                onChange={(e) => setAnnouncementForm((prev) => ({ ...prev, is_published: e.target.checked }))}
                className="rounded border-gray-300"
              />
              공개 상태로 노출
            </label>

            {announcementFormError && (
              <p className="text-sm text-red-600">{announcementFormError}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => { setAnnouncementForm(emptyAnnouncementForm); setAnnouncementFormOpen(false); setAnnouncementFormError(null); }}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAnnouncementSave}
                disabled={savingAnnouncement}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingAnnouncement ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 카테고리 필터 탭 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterCategory === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          전체 ({allAnnouncements.length})
        </button>
        {categoryKeys.map((key) => {
          const count = allAnnouncements.filter((a) => a.category === key).length;
          return (
            <button
              key={key}
              onClick={() => setFilterCategory(key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterCategory === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {ANNOUNCEMENT_CATEGORIES[key]} ({count})
            </button>
          );
        })}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center text-gray-500">
          등록된 게시글이 없습니다.
        </div>
      ) : (
        <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카테고리</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제목/미리보기</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작성일</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {announcements.map((announcement) => (
                  <tr key={announcement.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        announcement.category === 'notice' ? 'bg-blue-100 text-blue-800' :
                        announcement.category === 'fabric' ? 'bg-emerald-100 text-emerald-800' :
                        announcement.category === 'printing' ? 'bg-purple-100 text-purple-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {ANNOUNCEMENT_CATEGORIES[announcement.category] ?? '공지'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{announcement.title}</div>
                      <div
                        className="text-xs text-gray-500 max-w-xs truncate"
                        dangerouslySetInnerHTML={{
                          __html: announcement.content?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleAnnouncementToggle(announcement)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          announcement.is_published
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {announcement.is_published ? (
                          <><Eye className="w-3 h-3" />공개</>
                        ) : (
                          <><EyeOff className="w-3 h-3" />비공개</>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(announcement.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCopyLink(announcement.id)}
                          title="링크 복사"
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors text-sm ${
                            copiedId === announcement.id
                              ? 'text-green-700 bg-green-50'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {copiedId === announcement.id ? (
                            <><Check className="w-4 h-4" />복사됨</>
                          ) : (
                            <><Copy className="w-4 h-4" />링크</>
                          )}
                        </button>
                        <button
                          onClick={() => handleAnnouncementEdit(announcement)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors text-sm"
                        >
                          <Edit2 className="w-4 h-4" />편집
                        </button>
                        <button
                          onClick={() => handleAnnouncementDelete(announcement.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-md transition-colors text-sm"
                        >
                          <Trash2 className="w-4 h-4" />삭제
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
