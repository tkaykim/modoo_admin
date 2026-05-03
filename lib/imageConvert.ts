/**
 * Client-side AI/PSD → PNG conversion (no external API).
 *
 *   PSD → ag-psd (pure JS Photoshop parser)
 *   AI  → pdfjs-dist (AI files since CS2 are PDF containers)
 *
 * Replaces the previous CloudConvert flow. Runs entirely in the browser:
 * no server round-trip, no quota, no API key.
 */

export interface ConversionResult {
  success: boolean;
  pngBlob?: Blob;
  error?: string;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function isAiOrPsdFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'ai' || ext === 'psd';
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png'
    );
  });
}

async function convertPsd(
  file: File,
  onProgress?: (msg: string) => void
): Promise<HTMLCanvasElement> {
  onProgress?.('PSD 파싱 중…');
  const { readPsd } = await import('ag-psd');
  const buf = await file.arrayBuffer();
  const psd = readPsd(buf, { skipLayerImageData: true, skipThumbnail: true });
  if (!psd.canvas) throw new Error('PSD에 합성된 이미지가 없습니다');
  return psd.canvas as HTMLCanvasElement;
}

async function convertAi(
  file: File,
  onProgress?: (msg: string) => void
): Promise<HTMLCanvasElement> {
  onProgress?.('PDF 엔진 로딩 중…');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  onProgress?.('AI 파일 렌더링 중…');
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

export async function convertToPNG(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ConversionResult> {
  try {
    if (file.size > MAX_UPLOAD_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      return { success: false, error: `파일이 너무 큽니다 (현재 ${mb}MB / 최대 50MB)` };
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    let canvas: HTMLCanvasElement;
    if (ext === 'psd') {
      canvas = await convertPsd(file, onProgress);
    } else if (ext === 'ai') {
      canvas = await convertAi(file, onProgress);
    } else {
      return { success: false, error: 'AI 또는 PSD 파일만 지원합니다.' };
    }

    onProgress?.('PNG 인코딩 중…');
    const pngBlob = await canvasToBlob(canvas);
    return { success: true, pngBlob };
  } catch (error) {
    console.error('Client conversion error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown conversion error',
    };
  }
}

export function getConversionErrorMessage(error?: string): string {
  if (!error) return '알 수 없는 오류가 발생했습니다.';
  if (error.includes('너무 큽니다') || error.includes('exceeded the maximum')) {
    return error.includes('exceeded the maximum')
      ? '파일이 너무 큽니다 (최대 50MB). 더 작은 파일로 다시 시도해주세요.'
      : error;
  }
  if (error.includes('PSD에 합성된 이미지가 없습니다')) {
    return 'PSD 파일에서 미리보기 이미지를 추출할 수 없습니다. 다른 PSD로 시도해주세요.';
  }
  if (error.toLowerCase().includes('invalid') || error.toLowerCase().includes('parse')) {
    return '파일이 손상되었거나 지원되지 않는 형식입니다.';
  }
  return `파일 변환 중 오류가 발생했습니다: ${error}`;
}
