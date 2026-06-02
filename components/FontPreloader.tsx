'use client';

import { useEffect } from 'react';
import { preloadSystemFonts } from '@/lib/ensureFonts';

/**
 * Kicks off loading of bundled system fonts (notably 'Freshman') as early as
 * possible so the TTF is cached before any design canvas renders text.
 * Renders nothing.
 */
export default function FontPreloader() {
  useEffect(() => {
    void preloadSystemFonts();
  }, []);
  return null;
}
