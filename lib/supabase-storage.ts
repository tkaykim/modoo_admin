import { SupabaseClient } from '@supabase/supabase-js';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  path?: string;
}

/**
 * Upload a file to Supabase Storage
 * @param supabase - Supabase client instance
 * @param file - The file to upload
 * @param bucket - The storage bucket name
 * @param folder - Optional folder path within the bucket
 * @returns Upload result with URL if successful
 */
export async function uploadFileToStorage(
  supabase: SupabaseClient,
  file: File,
  bucket: string,
  folder?: string
): Promise<UploadResult> {
  try {

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    // Upload the file
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path,
    };
  } catch (error) {
    console.error('Upload exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Upload a blob or data URL to Supabase Storage
 * @param supabase - Supabase client instance
 * @param dataUrl - Base64 data URL or blob
 * @param bucket - The storage bucket name
 * @param folder - Optional folder path within the bucket
 * @param filename - Optional filename (will be auto-generated if not provided)
 * @returns Upload result with URL if successful
 */
export async function uploadDataUrlToStorage(
  supabase: SupabaseClient,
  dataUrl: string,
  bucket: string,
  folder?: string,
  filename?: string
): Promise<UploadResult> {
  try {

    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Determine file extension from MIME type
    const mimeType = blob.type;
    const fileExt = mimeType.split('/')[1] || 'png';

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = filename || `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    // Upload the blob
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path,
    };
  } catch (error) {
    console.error('Upload exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a file from Supabase Storage
 * @param supabase - Supabase client instance
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 * @returns Success status
 */
export async function deleteFileFromStorage(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<{ success: boolean; error?: string }> {
  try {

    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Delete exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Upload SVG content as a file to Supabase Storage
 * @param supabase - Supabase client instance
 * @param svgContent - SVG string content
 * @param bucket - The storage bucket name
 * @param folder - Optional folder path within the bucket
 * @param filename - Optional filename (will be auto-generated if not provided)
 * @returns Upload result with URL if successful
 */
export async function uploadSVGToStorage(
  supabase: SupabaseClient,
  svgContent: string,
  bucket: string,
  folder?: string,
  filename?: string
): Promise<UploadResult> {
  try {

    // Create a blob from SVG content
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = filename || `text-${timestamp}-${Math.random().toString(36).substring(7)}.svg`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    // Upload the SVG blob
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, {
        contentType: 'image/svg+xml',
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('SVG upload error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path,
    };
  } catch (error) {
    console.error('SVG upload exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
