import { SupabaseClient } from '@supabase/supabase-js';
import { uploadFileToStorage, deleteFileFromStorage, UploadResult } from './supabase-storage';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from './storage-config';

export interface FontMetadata {
  fontFamily: string;
  fileName: string;
  url: string;
  path: string;
  uploadedAt: string;
  format: 'ttf' | 'otf' | 'woff' | 'woff2';
}

const SUPPORTED_FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'] as const;

export function isValidFontFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return SUPPORTED_FONT_EXTENSIONS.includes(ext as typeof SUPPORTED_FONT_EXTENSIONS[number]);
}

export async function uploadFont(
  supabase: SupabaseClient,
  fontFile: File,
  designId?: string
): Promise<{ success: boolean; fontMetadata?: FontMetadata; error?: string }> {
  try {
    if (!isValidFontFile(fontFile)) {
      return {
        success: false,
        error: 'Invalid font file. Supported formats: .ttf, .otf, .woff, .woff2',
      };
    }

    const fontFamily = fontFile.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');
    const format = fontFile.name.split('.').pop()?.toLowerCase() as FontMetadata['format'];

    const uploadResult: UploadResult = await uploadFileToStorage(
      supabase,
      fontFile,
      STORAGE_BUCKETS.FONTS,
      STORAGE_FOLDERS.FONTS
    );

    if (!uploadResult.success || !uploadResult.url || !uploadResult.path) {
      return {
        success: false,
        error: uploadResult.error || 'Failed to upload font',
      };
    }

    const fontMetadata: FontMetadata = {
      fontFamily,
      fileName: fontFile.name,
      url: uploadResult.url,
      path: uploadResult.path,
      uploadedAt: new Date().toISOString(),
      format,
    };

    return {
      success: true,
      fontMetadata,
    };
  } catch (error) {
    console.error('Error uploading font:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function loadCustomFont(fontMetadata: FontMetadata): Promise<void> {
  try {
    const existingFonts = document.fonts;
    const alreadyLoaded = Array.from(existingFonts).some(
      (font) => font.family === fontMetadata.fontFamily
    );

    if (alreadyLoaded) {
      console.log(`Font "${fontMetadata.fontFamily}" is already loaded`);
      return;
    }

    const fontFace = new FontFace(fontMetadata.fontFamily, `url(${fontMetadata.url})`);
    const loadedFont = await fontFace.load();

    document.fonts.add(loadedFont);

    console.log(`Successfully loaded font: ${fontMetadata.fontFamily}`);
  } catch (error) {
    console.error(`Failed to load font "${fontMetadata.fontFamily}":`, error);
    throw error;
  }
}

export async function loadCustomFonts(fonts: FontMetadata[]): Promise<void> {
  const loadPromises = fonts.map((font) => loadCustomFont(font));
  await Promise.all(loadPromises);
}

export async function deleteFont(
  supabase: SupabaseClient,
  fontPath: string
): Promise<{ success: boolean; error?: string }> {
  return await deleteFileFromStorage(supabase, STORAGE_BUCKETS.FONTS, fontPath);
}

export async function deleteFonts(
  supabase: SupabaseClient,
  fontPaths: string[]
): Promise<{ success: boolean; errors: string[] }> {
  const results = await Promise.all(
    fontPaths.map((path) => deleteFont(supabase, path))
  );

  const errors = results
    .filter((result) => !result.success)
    .map((result) => result.error || 'Unknown error');

  return {
    success: errors.length === 0,
    errors,
  };
}

export function getFontFormat(fontMetadata: FontMetadata): string {
  const formatMap: Record<FontMetadata['format'], string> = {
    ttf: 'truetype',
    otf: 'opentype',
    woff: 'woff',
    woff2: 'woff2',
  };
  return formatMap[fontMetadata.format] || 'truetype';
}

export function createFontFaceCSS(fontMetadata: FontMetadata): string {
  const format = getFontFormat(fontMetadata);
  return `
@font-face {
  font-family: '${fontMetadata.fontFamily}';
  src: url('${fontMetadata.url}') format('${format}');
  font-display: swap;
}
  `.trim();
}
