import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import {
  createImageAdCreative,
  createPausedAd,
  createVideoAdCreative,
  fetchAdSets,
  uploadAdImageBytes,
  uploadAdVideoBytes,
} from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const META_ID = /^\d{8,32}$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const CTA_TYPES = new Set(['SEE_DETAILS', 'LEARN_MORE', 'CONTACT_US', 'SHOP_NOW']);

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function text(form: FormData, key: string, max = 500) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function safeUploadName(file: File, label: string) {
  const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 8);
  const suffix = extension ? `.${extension}` : '';
  return `marketing_${label.replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'creative'}_${Date.now()}${suffix}`;
}

function adName(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  return compact.startsWith('[신규]') ? compact : `[신규]${compact || '마케팅 소재'}`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const form = await req.formData();
    if (text(form, 'confirm') !== 'true') return bad('실행 확인이 필요합니다.');

    const adSetId = text(form, 'adSetId', 40);
    if (!adSetId || !META_ID.test(adSetId)) return bad('유효한 광고세트 ID가 필요합니다.');

    const file = form.get('file');
    if (!(file instanceof File)) return bad('업로드할 이미지 또는 영상 파일이 필요합니다.');
    if (!file.size) return bad('비어 있는 파일은 업로드할 수 없습니다.');

    const mime = file.type || 'application/octet-stream';
    const isImage = IMAGE_TYPES.has(mime);
    const isVideo = VIDEO_TYPES.has(mime);
    if (!isImage && !isVideo) return bad('지원하지 않는 파일 형식입니다.');
    if (isImage && file.size > MAX_IMAGE_BYTES) return bad('이미지는 8MB 이하만 업로드할 수 있습니다.');
    if (isVideo && file.size > MAX_VIDEO_BYTES) return bad('영상은 80MB 이하만 업로드할 수 있습니다.');

    const name = adName(text(form, 'name', 120));
    const message = text(form, 'message', 1000);
    const headline = text(form, 'headline', 100);
    const linkUrl = text(form, 'linkUrl', 300) || 'https://www.modoouniform.com/';
    const ctaRaw = text(form, 'ctaType', 40);
    const ctaType = CTA_TYPES.has(ctaRaw) ? ctaRaw : 'SEE_DETAILS';

    if (!message) return bad('광고 카피가 필요합니다.');
    if (!validUrl(linkUrl)) return bad('유효한 랜딩 URL이 필요합니다.');

    const adSets = await fetchAdSets();
    const targetAdSet = adSets.find((adSet) => adSet.id === adSetId);
    if (!targetAdSet) return bad('현재 광고계정에서 찾을 수 없는 광고세트입니다.', 404);
    if (targetAdSet.status === 'DELETED' || targetAdSet.effective_status === 'DELETED') {
      return bad('삭제된 광고세트에는 소재를 추가할 수 없습니다.');
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploadName = safeUploadName(file, isImage ? 'image' : 'video');

    if (isImage) {
      const uploaded = await uploadAdImageBytes(uploadName, bytes);
      const creative = await createImageAdCreative({
        name,
        imageHash: uploaded.hash,
        message,
        headline,
        linkUrl,
        ctaType,
      });
      const ad = await createPausedAd({ name, adSetId, creativeId: creative.id });
      console.info('[marketing-console/upload]', {
        mediaType: 'image',
        adSetId,
        adId: ad.id,
        creativeId: creative.id,
        role: auth.role,
      });
      return NextResponse.json({
        data: {
          ok: true,
          mediaType: 'image',
          status: 'PAUSED',
          adId: ad.id,
          creativeId: creative.id,
          adSetId,
          imageHash: uploaded.hash,
        },
      });
    }

    const uploaded = await uploadAdVideoBytes(uploadName, bytes, mime);
    const creative = await createVideoAdCreative({
      name,
      videoId: uploaded.id,
      message,
      title: headline || name,
      linkUrl,
      ctaType,
    });
    const ad = await createPausedAd({ name, adSetId, creativeId: creative.id });
    console.info('[marketing-console/upload]', {
      mediaType: 'video',
      adSetId,
      adId: ad.id,
      creativeId: creative.id,
      videoId: uploaded.id,
      role: auth.role,
    });
    return NextResponse.json({
      data: {
        ok: true,
        mediaType: 'video',
        status: 'PAUSED',
        adId: ad.id,
        creativeId: creative.id,
        adSetId,
        videoId: uploaded.id,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[marketing-console/upload] error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
