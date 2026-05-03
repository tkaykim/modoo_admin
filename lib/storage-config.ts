/**
 * Storage bucket configuration for Supabase
 *
 * Buckets needed:
 * - user-designs: For storing user-uploaded images and design assets
 * - text-exports: For storing exported SVG files from text objects
 */

export const STORAGE_BUCKETS = {
  USER_DESIGNS: 'user-designs',
  TEXT_EXPORTS: 'text-exports',
  FONTS: 'fonts',
} as const;

export const STORAGE_FOLDERS = {
  IMAGES: 'images',
  TEXTS: 'texts',
  SVG: 'svg',
  FONTS: 'fonts',
  PARTNER_MALL_LOGOS: 'partner-mall-logos',
} as const;

/**
 * Get the full path for an upload
 * @param bucket - Bucket name
 * @param folder - Folder name
 * @returns Full bucket/folder path
 */
export function getStoragePath(bucket: string, folder?: string): { bucket: string; folder?: string } {
  return { bucket, folder };
}

/**
 * Instructions for setting up storage buckets in Supabase:
 *
 * 1. Go to your Supabase dashboard: https://app.supabase.com
 * 2. Navigate to Storage section
 * 3. Create the following buckets with public access:
 *    - user-designs (Public bucket)
 *    - text-exports (Public bucket)
 *
 * 4. Set up RLS policies for authenticated uploads (optional):
 *    - Allow INSERT for authenticated users
 *    - Allow SELECT for everyone (public read)
 *    - Allow DELETE only for file owners
 *
 * Example SQL for bucket creation (run in SQL editor):
 *
 * -- Create user-designs bucket
 * INSERT INTO storage.buckets (id, name, public)
 * VALUES ('user-designs', 'user-designs', true);
 *
 * -- Create text-exports bucket
 * INSERT INTO storage.buckets (id, name, public)
 * VALUES ('text-exports', 'text-exports', true);
 *
 * -- Optional: Add RLS policies
 * CREATE POLICY "Public read access"
 * ON storage.objects FOR SELECT
 * USING ( bucket_id = 'user-designs' );
 *
 * CREATE POLICY "Authenticated users can upload"
 * ON storage.objects FOR INSERT
 * WITH CHECK ( bucket_id = 'user-designs' );
 */
